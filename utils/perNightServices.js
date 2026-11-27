// Services charged per night (the extra bed):
//   TOTAL_COST = QTY (beds) x PER_NIGHT_PRICE x NIGHTS
// NIGHTS follows the nights the room itself is charged (billing.QTY + extended nights), so an extension adds the bed
// for the added nights and an early check-out takes off (refunds) the nights not used.
// NIGHTS_OFFSET = nights that had already passed when the bed was added during the stay (0 when added at booking).
// Lines saved before this rule have no PER_NIGHT_PRICE and stay a one-time charge.
const db = require('../config/database');

const isPerNightService = (name) => /extra\s*bed/i.test(String(name || ''));

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Runs on the given connection (inside its transaction) or on the pool.
const runner = (connection) => (connection
  ? (sql, params) => new Promise((resolve, reject) => connection.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))))
  : (sql, params) => db.queryDatabasePromise(sql, params));

// callback connections and promise connections both end up here
const plain = (connection) => (connection && connection.connection ? connection.connection : connection);

const STAY_SQL = `
  (SELECT bill.QTY FROM billing bill WHERE bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1 ORDER BY bill.IDNo LIMIT 1) AS ROOM_NIGHTS,
  (SELECT COALESCE(SUM(be.QTY), 0) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1) AS EXT_NIGHTS`;

// Recompute every per-night line of these bookings. Call it after anything that changes the nights charged.
async function syncPerNightServices(bookingIds, connection = null) {
  const ids = [].concat(bookingIds || []).filter(Boolean);
  if (!ids.length) return [];
  const run = runner(plain(connection));
  const lines = await run(
    `SELECT bs.IDNo, bs.BOOKING_ID, bs.QTY, bs.TOTAL_COST, bs.STATUS, bs.PER_NIGHT_PRICE, bs.NIGHTS, bs.NIGHTS_OFFSET, ${STAY_SQL}
       FROM booking_service bs JOIN booking b ON b.IDNo = bs.BOOKING_ID
      WHERE bs.BOOKING_ID IN (?) AND bs.ACTIVE = 1 AND bs.PER_NIGHT_PRICE IS NOT NULL`,
    [ids]
  );
  const changed = [];
  for (const line of lines) {
    if (line.ROOM_NIGHTS === null || line.ROOM_NIGHTS === undefined) continue;
    const stay = Number(line.ROOM_NIGHTS) + Number(line.EXT_NIGHTS || 0);
    const nights = Math.max(1, stay - (Number(line.NIGHTS_OFFSET) || 0));
    const before = round2(line.TOTAL_COST);
    const total = round2(Number(line.QTY) * Number(line.PER_NIGHT_PRICE) * nights);
    if (nights === Number(line.NIGHTS) && Math.abs(total - before) < 0.005) continue;
    // a paid line that now costs more has a balance again
    const status = total > before + 0.005 && line.STATUS === 'paid' ? 'unpaid' : line.STATUS;
    await run('UPDATE booking_service SET NIGHTS = ?, TOTAL_COST = ?, STATUS = ?, EDITED_DT = NOW() WHERE IDNo = ?', [nights, total, status, line.IDNo]);
    await run(
      'UPDATE billing SET SERVICES_CHARGE = GREATEST(COALESCE(SERVICES_CHARGE, 0) + ?, 0) WHERE BOOKING_ID = ? AND ACTIVE = 1',
      [round2(total - before), line.BOOKING_ID]
    );
    changed.push({ id: line.IDNo, bookingId: line.BOOKING_ID, nights, before, total });
  }
  return changed;
}

// Add beds to a booking that already exists (booking window "Extra Services"). A guest already checked in pays for the
// nights that are left, counting tonight. The caller keeps billing.SERVICES_CHARGE in step.
async function addPerNightService({ bookingId, serviceId, customName = null, qty, price, userId }, connection = null) {
  const run = runner(plain(connection));
  const [stayRow] = await run(
    `SELECT b.BOOKING_STATUS, DATEDIFF(CURDATE(), DATE(b.CHECK_IN_DATE)) AS PASSED, ${STAY_SQL} FROM booking b WHERE b.IDNo = ?`,
    [bookingId]
  );
  if (!stayRow) throw new Error('Booking not found.');
  const beds = Math.max(0, parseInt(qty, 10) || 0);
  const unit = Math.max(0, Number(price) || 0);
  if (!beds) return { total: 0 };
  const stay = Math.max(1, (Number(stayRow.ROOM_NIGHTS) || 1) + Number(stayRow.EXT_NIGHTS || 0));
  const offset = stayRow.BOOKING_STATUS === 'check-In' ? Math.min(Math.max(Number(stayRow.PASSED) || 0, 0), stay - 1) : 0;
  const nights = stay - offset;
  const [same] = await run(
    `SELECT IDNo, QTY FROM booking_service
      WHERE BOOKING_ID = ? AND SERVICE_ID = ? AND COALESCE(CUSTOM_NAME, '') = ? AND ACTIVE = 1
        AND COALESCE(STATUS, 'unpaid') <> 'paid' AND PER_NIGHT_PRICE = ? AND NIGHTS_OFFSET = ? AND NIGHTS = ?
      ORDER BY IDNo DESC LIMIT 1`,
    [bookingId, serviceId, customName || '', unit, offset, nights]
  );
  if (same) {
    const newQty = Number(same.QTY) + beds;
    await run('UPDATE booking_service SET QTY = ?, TOTAL_COST = ?, EDITED_BY = ?, EDITED_DT = NOW() WHERE IDNo = ?',
      [newQty, round2(newQty * unit * nights), userId, same.IDNo]);
  } else {
    await run(
      `INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE, CUSTOM_NAME, PER_NIGHT_PRICE, NIGHTS, NIGHTS_OFFSET)
       VALUES (?, ?, ?, ?, 'unpaid', ?, NOW(), 1, ?, ?, ?, ?)`,
      [bookingId, serviceId, beds, round2(beds * unit * nights), userId, customName, unit, nights, offset]
    );
  }
  return { total: round2(beds * unit * nights), nights };
}

module.exports = { isPerNightService, syncPerNightServices, addPerNightService };
