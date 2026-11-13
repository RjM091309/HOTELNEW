// Clark Central Hotel was created by hand on the development database, so no migration makes it. This copies it (property row,
// room types, rooms, room rates, receipt settings, season months) onto another database - e.g. the server.
//
//   node database_migrations/seed_clark_central.js export   (dev PC: writes seed_clark_central.json from the local DB)
//   node database_migrations/seed_clark_central.js          (creates it from that file - the app also does this by itself at startup,
//                                                            see runStartupMigrations, so git pull + pm2 restart is enough)
//
// Safe to run twice: it does nothing when a property with CODE 'clark_central' already exists. No bookings, payments or logs are copied,
// and new ids are generated so nothing already on the target database is touched. All in one transaction.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool, queryDatabasePromise: q } = require('../config/database');

const FILE = path.join(__dirname, 'seed_clark_central.json');
const CODE = 'clark_central';
const strip = (row, ...drop) => { const o = { ...row }; drop.forEach((k) => delete o[k]); return o; };

async function exportSeed() {
  const [property] = await q('SELECT * FROM property WHERE CODE = ?', [CODE]);
  if (!property) throw new Error('No clark_central property in this database');
  const roomTypes = await q('SELECT * FROM room_type WHERE PROPERTY_ID = ? ORDER BY IDNo', [property.IDNo]);
  const rooms = await q('SELECT * FROM room WHERE PROPERTY_ID = ? ORDER BY IDNo', [property.IDNo]);
  const ids = roomTypes.map((r) => r.IDNo);
  const rates = ids.length ? await q('SELECT * FROM room_rates WHERE ROOM_TYPE_ID IN (?)', [ids]) : [];
  const receiptSettings = await q('SELECT * FROM receipt_settings WHERE PROPERTY_ID = ?', [property.IDNo]);
  const seasonMonths = await q('SELECT * FROM room_rate_season_months WHERE PROPERTY_ID = ?', [property.IDNo]);
  fs.writeFileSync(FILE, JSON.stringify({ property, roomTypes, rooms, rates, receiptSettings, seasonMonths }, null, 1));
  console.log(`Exported: ${roomTypes.length} room types, ${rooms.length} rooms, ${rates.length} rates -> ${FILE}`);
}

async function insert(conn, table, row) {
  const cols = Object.keys(row);
  const [res] = await conn.query(
    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c])
  );
  return res.insertId;
}

// the JSON turns dates into strings; MySQL accepts them back as they are
async function importSeed() {
  const existing = await q('SELECT IDNo FROM property WHERE CODE = ?', [CODE]);
  if (existing.length) { console.log(`Property '${CODE}' already exists (IDNo ${existing[0].IDNo}) - nothing to do.`); return; }
  if (!fs.existsSync(FILE)) { console.log(`No ${path.basename(FILE)} - Clark Central not created.`); return; }
  const seed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();
    const propertyId = await insert(conn, 'property', strip(seed.property, 'IDNo'));
    const typeMap = {};
    for (const t of seed.roomTypes) {
      typeMap[t.IDNo] = await insert(conn, 'room_type', { ...strip(t, 'IDNo', 'CHANNEX_ROOM_TYPE_ID'), PROPERTY_ID: propertyId });
    }
    for (const r of seed.rooms) {
      await insert(conn, 'room', { ...strip(r, 'IDNo'), ROOM_TYPE_ID: typeMap[r.ROOM_TYPE_ID], PROPERTY_ID: propertyId });
    }
    for (const r of seed.rates) {
      if (typeMap[r.ROOM_TYPE_ID]) await insert(conn, 'room_rates', { ...strip(r, 'IDNo'), ROOM_TYPE_ID: typeMap[r.ROOM_TYPE_ID] });
    }
    for (const s of seed.receiptSettings) await insert(conn, 'receipt_settings', { ...strip(s, 'IDNo'), PROPERTY_ID: propertyId });
    for (const m of seed.seasonMonths) {
      const row = { ...m, PROPERTY_ID: propertyId };
      const cols = Object.keys(row);
      await conn.query(
        `INSERT IGNORE INTO room_rate_season_months (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => row[c])
      );
    }
    await conn.commit();
    console.log(`Created '${CODE}' as property ${propertyId}: ${seed.roomTypes.length} room types, ${seed.rooms.length} rooms, ${seed.rates.length} rates.`);
    console.log('Admin accounts see it right away; give other accounts access under User Info.');
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { importSeed, exportSeed };

if (require.main === module) {
  (process.argv[2] === 'export' ? exportSeed() : importSeed())
    .then(() => process.exit(0))
    .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
