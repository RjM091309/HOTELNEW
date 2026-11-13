// The full Dashboard of ONE property (the page behind "Expand Full Dashboard"): reservation + housekeeping, rooms by status,
// revenue, bookings per day, a room calendar, new customers and recent activities. Everything is scoped by PROPERTY_ID.
const { queryDatabasePromise } = require('../config/database');
const OverviewModel = require('./overviewModel');

const HOTEL_DAY = 'DATE(DATE_SUB(NOW(), INTERVAL 6 HOUR))';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const num = (v) => Number(v) || 0;
const NOT_UNSETTLED_CREDIT = `NOT (p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL)`;

function lastDays(n, fromDate) {
  const out = [];
  const base = new Date(`${fromDate}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000);
    out.push({
      date: ymd(d),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      letter: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday: i === 0
    });
  }
  return out;
}

class PropertyDashboardModel {
  static async getFull(propertyId) {
    const overview = await OverviewModel.getPropertyOverview(propertyId);
    const [{ today }] = await queryDatabasePromise(`SELECT DATE_FORMAT(${HOTEL_DAY}, '%Y-%m-%d') AS today`);

    // ---- money received per day (last 30 days): booking payments (credit not paid yet is NOT counted) + standalone receipts
    const payRows = await queryDatabasePromise(
      `SELECT DATE_FORMAT(DATE(p.PAYMENT_DATE), '%Y-%m-%d') AS d, SUM(p.AMOUNT_PAID) AS amt
         FROM payments p JOIN booking b ON b.IDNo = p.BOOKING_ID
        WHERE b.PROPERTY_ID = ? AND DATE(p.PAYMENT_DATE) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
          AND p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit') AND ${NOT_UNSETTLED_CREDIT}
        GROUP BY d`, [propertyId]);
    let recRows = [];
    try {
      recRows = await queryDatabasePromise(
        `SELECT DATE_FORMAT(DATE(RECEIPT_DATE), '%Y-%m-%d') AS d, SUM(AMOUNT_PAID) AS amt
           FROM payment_receipt WHERE ACTIVE = 1 AND PROPERTY_ID = ? AND DATE(RECEIPT_DATE) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY d`, [propertyId]);
    } catch (e) { /* receipts are optional */ }
    const money = new Map();
    [...payRows, ...recRows].forEach((r) => money.set(r.d, (money.get(r.d) || 0) + num(r.amt)));
    const now = new Date();
    const calToday = ymd(now);
    const days30 = lastDays(30, calToday).map((d) => ({ ...d, amount: Math.round(money.get(d.date) || 0) }));
    const last30 = days30.reduce((s, d) => s + d.amount, 0);
    const yesterday = days30.length > 1 ? days30[days30.length - 2].amount : 0;

    // ---- bookings per day (last 30 hotel days): check-ins, and reservations made
    const ciRows = await queryDatabasePromise(
      `SELECT DATE_FORMAT(DATE(COALESCE(b.ACTUAL_CHECK_IN_DT, b.CHECK_IN_DATE)), '%Y-%m-%d') AS d, COUNT(*) AS n
         FROM booking b WHERE b.ACTIVE = 1 AND b.PROPERTY_ID = ? AND COALESCE(b.IS_CANCELLED, 0) = 0 AND b.BOOKING_STATUS IN ('check-In', 'check-Out')
          AND DATE(COALESCE(b.ACTUAL_CHECK_IN_DT, b.CHECK_IN_DATE)) BETWEEN DATE_SUB(${HOTEL_DAY}, INTERVAL 29 DAY) AND ${HOTEL_DAY} GROUP BY d`, [propertyId]);
    const resRows = await queryDatabasePromise(
      `SELECT DATE_FORMAT(DATE(b.ENCODED_DT), '%Y-%m-%d') AS d, COUNT(*) AS n
         FROM booking b WHERE b.ACTIVE = 1 AND b.PROPERTY_ID = ? AND COALESCE(b.IS_CANCELLED, 0) = 0
          AND DATE(b.ENCODED_DT) BETWEEN DATE_SUB(${HOTEL_DAY}, INTERVAL 29 DAY) AND ${HOTEL_DAY} GROUP BY d`, [propertyId]);
    const ci = new Map(ciRows.map((r) => [r.d, num(r.n)]));
    const rs = new Map(resRows.map((r) => [r.d, num(r.n)]));
    const bookings = lastDays(30, today).map((d) => ({ ...d, checkIns: ci.get(d.date) || 0, reserved: rs.get(d.date) || 0 }));

    // ---- rooms (for the "rooms by status" bar and the room calendar) + the next 2 weeks of bookings
    const rooms = await queryDatabasePromise(
      `SELECT r.IDNo AS id, r.ROOM_NUMBER AS no, r.ROOM_STATUS AS status, rt.IDNo AS typeId, rt.NAME AS type
         FROM room r JOIN room_type rt ON rt.IDNo = r.ROOM_TYPE_ID WHERE r.ACTIVE = 1 AND r.PROPERTY_ID = ? ORDER BY r.ROOM_NUMBER`, [propertyId]);
    const agenda = await queryDatabasePromise(
      `SELECT b.IDNo AS id, b.ROOM_ID AS roomId, c.NAME AS guest, b.BOOKING_STATUS AS status,
              DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS ci, DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS co
         FROM booking b JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        WHERE b.ACTIVE = 1 AND b.PROPERTY_ID = ? AND COALESCE(b.IS_CANCELLED, 0) = 0 AND b.ROOM_ID IS NOT NULL
          AND b.BOOKING_STATUS IN ('pending', 'check-In')
          AND DATE(b.CHECK_OUT_DATE) >= ${HOTEL_DAY} AND DATE(b.CHECK_IN_DATE) <= DATE_ADD(${HOTEL_DAY}, INTERVAL 14 DAY)`, [propertyId]);

    // ---- newest bookings and the latest things done in the system
    const customers = await queryDatabasePromise(
      `SELECT b.IDNo AS id, c.NAME AS name, r.ROOM_NUMBER AS room, b.BOOKING_STATUS AS status,
              DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS nights,
              DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS ci, DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS co, b.ENCODED_DT AS at
         FROM booking b JOIN customer c ON c.IDNo = b.CUSTOMER_ID LEFT JOIN room r ON r.IDNo = b.ROOM_ID
        WHERE b.ACTIVE = 1 AND b.PROPERTY_ID = ? AND COALESCE(b.IS_CANCELLED, 0) = 0 AND c.NAME <> 'Maintenance' AND b.BOOKING_STATUS <> 'maintenance'
        ORDER BY b.IDNo DESC LIMIT 6`, [propertyId]);
    const activities = await queryDatabasePromise(
      `SELECT al.IDNo AS id, al.ACTION AS action, al.MODULE AS module, al.DESCRIPTION AS description, al.ENCODED_DT AS at,
              COALESCE(ui.FULLNAME, al.USER_NAME, 'System') AS who, c.NAME AS guest, r.ROOM_NUMBER AS room
         FROM activity_log al
         LEFT JOIN user_info ui ON ui.IDno = al.USER_ID
         LEFT JOIN booking b ON b.IDNo = al.BOOKING_ID
         LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
         LEFT JOIN room r ON r.IDNo = b.ROOM_ID
        WHERE (al.PROPERTY_ID = ? OR al.PROPERTY_ID IS NULL) AND al.STATUS = 'SUCCESS' AND al.MODULE <> 'calendar'
          AND al.ACTION IN ('BOOKING_CREATE', 'BOOKING_UPDATE', 'CHECKOUT', 'CHECK_IN_WITH_DEPOSIT', 'PAYMENT_ADD', 'BOOKING_EXTEND', 'BOOKING_CANCEL', 'BOOKING_STATUS_UPDATE')
        ORDER BY al.IDNo DESC LIMIT 7`, [propertyId]);

    const byStatus = { available: 0, occupied: 0, dirty: 0, outOfOrder: 0 };
    rooms.forEach((r) => {
      if (String(r.status) === '1') byStatus.available++;
      else if (String(r.status) === '2') byStatus.occupied++;
      else if (String(r.status) === '3') byStatus.outOfOrder++;
      else if (String(r.status) === '4') byStatus.dirty++;
    });

    return {
      overview,
      byStatus,
      totalRooms: rooms.length,
      revenue: { today: overview.revenue.today, yesterday, last30, perDay: Math.round(last30 / 30), days: days30.slice(-7) },
      bookings,
      rooms,
      building: await OverviewModel.buildingRooms(propertyId),
      agenda,
      customers,
      activities,
      today,
      updatedAt: new Date().toISOString()
    };
  }
}

module.exports = PropertyDashboardModel;
