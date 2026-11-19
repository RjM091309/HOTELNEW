// Main Stay gets the 3D building on its Dashboard (public/js/dashboard/building3d.js, LAYOUTS.main), and its room list is brought in line
// with the real floor plan. Runs from runStartupMigrations, so git pull + pm2 restart is enough on the server.
//
//   - tenant rooms (301, 317, 401, 417, 501, 517, 601, 617, 623): rented out, never booked -> active, status 5 (Tenant: works like Out of order).
//     A room that was deactivated is switched back on; one that was deleted is put back from database_migrations/backups/ when it is there.
//   - numbers that do not exist in the building (521, 609, 631; 618 is part of 617's unit for now):
//       past bookings (or a room transfer / clearance) -> deactivated (ACTIVE = 0), so the history, its payments and its groups stay intact
//       no history at all                              -> deleted, with its amenity / season price / login / inventory rows, written to
//                                                         database_migrations/backups/ first
//   A room with a live booking (reserved or checked in) is left as it is and reported; it is tried again at the next start.
//
//   node database_migrations/main_stay_building.js   (runs it by hand; safe to run again)
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool, queryDatabasePromise: q } = require('../config/database');

const CODE = 'main';
const TENANT = '5';
const TENANT_ROOMS = [301, 317, 401, 417, 501, 517, 601, 617, 623];
const NOT_ROOMS = [521, 609, 618, 631];
const BACKUPS = path.join(__dirname, 'backups');
// rows that only describe the room itself (deleted / put back with it)
const ROOM_ROWS = [['room_amenities', 'ROOM_ID'], ['room_season_price', 'ROOM_ID'], ['room_login', 'ROOM_ID'], ['room_inventory', 'ROOM_ID'], ['cleanup_notifications', 'room_id']];
// rows that are history (a room with any of them is only deactivated)
const HISTORY = [['booking', 'ROOM_ID'], ['room_transfer_logs', 'OLD_ROOM_ID'], ['room_transfer_logs', 'NEW_ROOM_ID'], ['room_clearance', 'ROOM_ID']];

async function hasColumn(table, column) {
  const [r] = await q(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column]);
  return Number(r.n) > 0;
}
async function onlyExisting(list) {
  const out = [];
  for (const [t, c] of list) if (await hasColumn(t, c)) out.push([t, c]);
  return out;
}

// startup_once: one row per one-time job that has finished (so it never runs twice)
async function done(name) {
  await q(`CREATE TABLE IF NOT EXISTS startup_once (
    NAME VARCHAR(100) NOT NULL PRIMARY KEY,
    RAN_AT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    NOTE VARCHAR(1000) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
  return (await q('SELECT 1 FROM startup_once WHERE NAME = ?', [name])).length > 0;
}
async function markDone(name, note) {
  await q('INSERT IGNORE INTO startup_once (NAME, NOTE) VALUES (?, ?)', [name, String(note || '').slice(0, 1000)]);
}

async function hasLiveBooking(roomId) {
  const [r] = await q(`SELECT COUNT(*) AS n FROM booking WHERE ROOM_ID = ? AND ACTIVE = 1 AND COALESCE(IS_CANCELLED, 0) = 0 AND BOOKING_STATUS IN ('pending', 'check-In')`, [roomId]);
  return Number(r.n) > 0;
}

// a deleted room as the backups have it (the newest backup that has it): { room, rows: { 'table.column': [...] } }
function fromBackup(roomNumber) {
  if (!fs.existsSync(BACKUPS)) return null;
  const files = fs.readdirSync(BACKUPS).filter((f) => /^main_stay_rooms_backup_.*\.json$/.test(f)).sort().reverse();
  for (const f of files) {
    try {
      const b = JSON.parse(fs.readFileSync(path.join(BACKUPS, f), 'utf8'));
      const room = (b.rooms || []).find((r) => Number(r.ROOM_NUMBER) === Number(roomNumber));
      if (!room) continue;
      const rows = {};
      Object.keys(b.rows || {}).forEach((k) => { const col = k.split('.')[1]; rows[k] = (b.rows[k] || []).filter((x) => Number(x[col]) === Number(room.IDNo)); });
      return { room, rows, file: f };
    } catch (e) { /* a broken file: try the next one */ }
  }
  return null;
}

async function insertRow(conn, table, row) {
  const cols = Object.keys(row);
  const [res] = await conn.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]));
  return res.insertId;
}
// the JSON turns dates into ISO strings: MySQL wants them without the T / Z
function sqlValues(row) {
  const o = {};
  Object.keys(row).forEach((k) => { const v = row[k]; o[k] = typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(v) ? v.replace('T', ' ').replace(/\.\d+Z$|Z$/, '') : v; });
  return o;
}

async function putBack(conn, saved, propertyId) {
  const taken = (await q('SELECT 1 FROM room WHERE IDNo = ?', [saved.room.IDNo])).length > 0;
  const room = sqlValues({ ...saved.room, PROPERTY_ID: propertyId, ACTIVE: 1, ROOM_STATUS: TENANT });
  if (taken) delete room.IDNo;   // (its old id is used by another room now: it gets a new one, and its rows follow it)
  const newId = taken ? await insertRow(conn, 'room', room) : (await insertRow(conn, 'room', room), saved.room.IDNo);
  for (const key of Object.keys(saved.rows)) {
    const [table, col] = key.split('.');
    for (const r of saved.rows[key]) {
      const row = sqlValues({ ...r, [col]: newId });
      if ('IDNo' in row && (await q(`SELECT 1 FROM \`${table}\` WHERE IDNo = ?`, [row.IDNo])).length) delete row.IDNo;
      await insertRow(conn, table, row);
    }
  }
  return newId;
}

async function cleanUpRooms(propertyId) {
  const roomRows = await onlyExisting(ROOM_ROWS);
  const history = await onlyExisting(HISTORY);
  const plan = { tenant: [], restored: [], missing: [], remove: [], deactivate: [], skipped: [] };

  // the tenant rooms: active, status Tenant
  const tenants = await q('SELECT * FROM room WHERE PROPERTY_ID = ? AND ROOM_NUMBER IN (?)', [propertyId, TENANT_ROOMS]);
  for (const no of TENANT_ROOMS) {
    const r = tenants.find((x) => Number(x.ROOM_NUMBER) === no);
    if (!r) { const saved = fromBackup(no); if (saved) plan.restored.push(saved); else plan.missing.push(no); continue; }
    if (Number(r.ACTIVE) === 1 && String(r.ROOM_STATUS) === TENANT) continue;
    if (await hasLiveBooking(r.IDNo)) { plan.skipped.push(r); continue; }
    plan.tenant.push(r);
  }

  // the numbers that do not exist in the building
  const gone = await q('SELECT * FROM room WHERE PROPERTY_ID = ? AND ROOM_NUMBER IN (?) ORDER BY ROOM_NUMBER', [propertyId, NOT_ROOMS]);
  for (const r of gone) {
    if (await hasLiveBooking(r.IDNo)) { plan.skipped.push(r); continue; }
    let past = 0;
    for (const [t, c] of history) past += Number((await q(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE \`${c}\` = ?`, [r.IDNo]))[0].n);
    if (past) { if (Number(r.ACTIVE) === 1) plan.deactivate.push(r); } else plan.remove.push(r);
  }

  if (plan.remove.length) {
    // what is about to be deleted, so it can be put back if needed (fromBackup reads these files)
    const ids = plan.remove.map((r) => r.IDNo);
    const backup = { property: CODE, at: new Date().toISOString(), rooms: plan.remove, rows: {} };
    for (const [t, c] of roomRows) backup.rows[`${t}.${c}`] = await q(`SELECT * FROM \`${t}\` WHERE \`${c}\` IN (?)`, [ids]);
    fs.mkdirSync(BACKUPS, { recursive: true });
    const file = path.join(BACKUPS, `main_stay_rooms_backup_${backup.at.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));
    console.log(`   backup of the deleted rooms -> ${path.relative(path.join(__dirname, '..'), file)}`);
  }

  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();
    if (plan.tenant.length) {
      await conn.query('UPDATE room SET ACTIVE = 1, ROOM_STATUS = ?, EDITED_DT = NOW() WHERE IDNo IN (?)', [TENANT, plan.tenant.map((r) => r.IDNo)]);
    }
    for (const saved of plan.restored) await putBack(conn, saved, propertyId);
    if (plan.remove.length) {
      const ids = plan.remove.map((r) => r.IDNo);
      for (const [t, c] of roomRows) await conn.query(`DELETE FROM \`${t}\` WHERE \`${c}\` IN (?)`, [ids]);
      await conn.query('DELETE FROM room WHERE IDNo IN (?)', [ids]);
    }
    if (plan.deactivate.length) {
      await conn.query('UPDATE room SET ACTIVE = 0, EDITED_DT = NOW() WHERE IDNo IN (?)', [plan.deactivate.map((r) => r.IDNo)]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return plan;
}

async function run() {
  const [prop] = await q('SELECT IDNo, BUILDING_VIEW FROM property WHERE CODE = ?', [CODE]);
  if (!prop) return;
  // the Tenant status must exist first (runRoomStatusTenantMigration): on an ENUM without '5' the rooms would get an empty status
  const [col] = await q(`SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room' AND COLUMN_NAME = 'ROOM_STATUS'`);
  if (col && /^enum\(/i.test(col.t) && !/'5'/.test(col.t)) throw new Error(`room.ROOM_STATUS has no Tenant (5) yet (${col.t}) - run the startup migrations first`);

  if (!(await done('main_stay_rooms_v2'))) {
    const plan = await cleanUpRooms(prop.IDNo);
    const list = (rows) => rows.map((r) => r.ROOM_NUMBER).join(', ') || '-';
    const note = `tenant: ${list(plan.tenant)} | put back as tenant: ${plan.restored.map((s) => s.room.ROOM_NUMBER).join(', ') || '-'} | deleted: ${list(plan.remove)} | deactivated: ${list(plan.deactivate)} | skipped (live booking): ${list(plan.skipped)} | missing: ${plan.missing.join(', ') || '-'}`;
    if (plan.tenant.length || plan.restored.length || plan.remove.length || plan.deactivate.length) console.log(`✅ Main Stay rooms brought in line with the floor plan - ${note}`);
    if (plan.missing.length) console.warn(`⚠️ Main Stay: tenant rooms ${plan.missing.join(', ')} do not exist - add them in Rooms (status Tenant)`);
    if (plan.skipped.length) console.warn(`⚠️ Main Stay: rooms ${list(plan.skipped)} still have a live booking - left as they are, tried again at the next start`);
    else await markDone('main_stay_rooms_v2', note);
  }

  // once: Main Stay's Dashboard shows its 3D building (it can be switched off afterwards in the property row and stays off)
  if (!(await done('main_stay_building_view'))) {
    await q('UPDATE property SET BUILDING_VIEW = 1 WHERE IDNo = ?', [prop.IDNo]);
    await markDone('main_stay_building_view', 'BUILDING_VIEW = 1');
    console.log('✅ Main Stay: 3D building turned on for the Dashboard');
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(() => setTimeout(() => process.exit(0), 100)).catch((e) => { console.error('❌ Main Stay building migration failed:', e.message); setTimeout(() => process.exit(1), 100); });
}
