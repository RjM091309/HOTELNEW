// Numbers for the multi-property Dashboard (one card per property): reservations of today, housekeeping,
// check-ins of the last 7 days and the money received. Everything is scoped by PROPERTY_ID.
const fs = require('fs');
const path = require('path');
const { queryDatabasePromise } = require('../config/database');
const PaymentsModel = require('./paymentsModel');
const CreditModel = require('./creditModel');

// The hotel day rolls over at 6 AM (same rule as the calendar / check-in): 2 AM still belongs to the day before.
const HOTEL_DAY = 'DATE(DATE_SUB(NOW(), INTERVAL 6 HOUR))';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const num = (v) => Number(v) || 0;

class OverviewModel {
  static async getPropertyOverview(propertyId) {
    const live = `b.ACTIVE = 1 AND b.PROPERTY_ID = ? AND COALESCE(b.IS_CANCELLED, 0) = 0`;

    const [rooms] = await queryDatabasePromise(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(ROOM_STATUS = 1), 0) AS available,
              COALESCE(SUM(ROOM_STATUS = 2), 0) AS occupied,
              COALESCE(SUM(ROOM_STATUS = 3), 0) AS outOfOrder,
              COALESCE(SUM(ROOM_STATUS = 4), 0) AS dirty
         FROM room WHERE ACTIVE = 1 AND PROPERTY_ID = ?`,
      [propertyId]
    );

    // Arrivals of today: still to check in (reserved for today or earlier) + already checked in today.
    const [arrivals] = await queryDatabasePromise(
      `SELECT COALESCE(SUM(b.BOOKING_STATUS = 'pending' AND DATE(b.CHECK_IN_DATE) <= ${HOTEL_DAY}), 0) AS expected,
              COALESCE(SUM(b.BOOKING_STATUS IN ('check-In', 'check-Out') AND DATE(COALESCE(b.ACTUAL_CHECK_IN_DT, b.CHECK_IN_DATE)) = ${HOTEL_DAY}), 0) AS done
         FROM booking b WHERE ${live}`,
      [propertyId]
    );

    // Departures of today: still in-house and due (today or overdue) + already checked out today.
    const [departures] = await queryDatabasePromise(
      `SELECT COALESCE(SUM(b.BOOKING_STATUS = 'check-In' AND DATE(b.CHECK_OUT_DATE) <= ${HOTEL_DAY}), 0) AS expected,
              COALESCE(SUM(b.BOOKING_STATUS = 'check-Out' AND DATE(COALESCE(b.ACTUAL_CHECK_OUT_DT, b.CHECK_OUT_DATE)) = ${HOTEL_DAY}), 0) AS done
         FROM booking b WHERE ${live}`,
      [propertyId]
    );

    // Check-ins per day, last 7 hotel days (today included) + what is still expected today.
    const weekRows = await queryDatabasePromise(
      `SELECT DATE_FORMAT(DATE(COALESCE(b.ACTUAL_CHECK_IN_DT, b.CHECK_IN_DATE)), '%Y-%m-%d') AS d, COUNT(*) AS n
         FROM booking b
        WHERE ${live} AND b.BOOKING_STATUS IN ('check-In', 'check-Out')
          AND DATE(COALESCE(b.ACTUAL_CHECK_IN_DT, b.CHECK_IN_DATE)) BETWEEN DATE_SUB(${HOTEL_DAY}, INTERVAL 6 DAY) AND ${HOTEL_DAY}
        GROUP BY d`,
      [propertyId]
    );
    const [{ today: hotelToday }] = await queryDatabasePromise(`SELECT DATE_FORMAT(${HOTEL_DAY}, '%Y-%m-%d') AS today`);
    const byDay = new Map(weekRows.map((r) => [r.d, num(r.n)]));
    const base = new Date(`${hotelToday}T12:00:00`);
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      const key = ymd(d);
      week.push({
        date: key,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        short: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: byDay.get(key) || 0,
        expected: i === 0 ? num(arrivals.expected) : 0,
        isToday: i === 0
      });
    }

    // Money received (credit that is not paid yet is NOT counted: see PaymentsModel.salesSummary) and the credit still to collect.
    const now = new Date();
    const todayStr = ymd(now);
    const weekStart = ymd(new Date(now.getTime() - 6 * 86400000));
    const monthStart = `${todayStr.slice(0, 8)}01`;
    let revenueToday = 0;
    let revenueMonth = 0;
    try {
      const s = await PaymentsModel.salesSummary(todayStr, weekStart, monthStart, propertyId);
      revenueToday = num(s.daily && s.daily.dailyPaid);
      revenueMonth = num(s.monthly && s.monthly.monthlyPaid);
    } catch (e) { /* the card still shows the rest */ }
    let creditOutstanding = 0;
    try { creditOutstanding = num(await CreditModel.totalOutstandingCredit(propertyId)); } catch (e) { /* ignore */ }

    const total = num(rooms.total);
    const occupied = num(rooms.occupied);
    return {
      rooms: { total, available: num(rooms.available), occupied, dirty: num(rooms.dirty), outOfOrder: num(rooms.outOfOrder), occupancyPct: total ? Math.round((occupied / total) * 100) : 0 },
      reservation: {
        occupied,
        // total = still to come today (like KGrand): a guest who checked in is counted under Occupied, not again here.
        // done = already in / out today, planned = both together (for the progress bar)
        checkIn: { total: num(arrivals.expected), done: num(arrivals.done), planned: num(arrivals.expected) + num(arrivals.done) },
        checkOut: { total: num(departures.expected), done: num(departures.done), planned: num(departures.expected) + num(departures.done) }
      },
      housekeeping: { available: num(rooms.available), dirty: num(rooms.dirty), outOfOrder: num(rooms.outOfOrder) },
      week,
      revenue: { today: revenueToday, month: revenueMonth, credit: creditOutstanding },
      updatedAt: new Date().toISOString()
    };
  }

  // The rooms of a property as the 3D building draws them: status (1 clean, 2 occupied, 3 out of order, 4 dirty), who is in the room,
  // and whether a guest arrives / leaves today. bookingId = the stay in the room now, or the arrival of today.
  static async buildingRooms(propertyId) {
    const live = `b.ROOM_ID = r.IDNo AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0`;
    const rows = await queryDatabasePromise(
      `SELECT r.IDNo AS id, r.ROOM_NUMBER AS no, r.ROOM_STATUS AS status,
              (SELECT b.IDNo FROM booking b WHERE ${live} AND b.BOOKING_STATUS = 'check-In' ORDER BY b.IDNo DESC LIMIT 1) AS stayId,
              (SELECT c.NAME FROM booking b JOIN customer c ON c.IDNo = b.CUSTOMER_ID WHERE ${live} AND b.BOOKING_STATUS = 'check-In' ORDER BY b.IDNo DESC LIMIT 1) AS guest,
              (SELECT DATE(b.CHECK_OUT_DATE) <= ${HOTEL_DAY} FROM booking b WHERE ${live} AND b.BOOKING_STATUS = 'check-In' ORDER BY b.IDNo DESC LIMIT 1) AS leaving,
              (SELECT b.IDNo FROM booking b WHERE ${live} AND b.BOOKING_STATUS = 'pending' AND DATE(b.CHECK_IN_DATE) <= ${HOTEL_DAY} AND DATE(b.CHECK_OUT_DATE) > ${HOTEL_DAY} ORDER BY b.CHECK_IN_DATE LIMIT 1) AS arrivalId
         FROM room r WHERE r.ACTIVE = 1 AND r.PROPERTY_ID = ? ORDER BY r.ROOM_NUMBER`, [propertyId]);
    return rows.map((r) => ({
      no: String(r.no), status: String(r.status), guest: r.guest || '',
      bookingId: r.stayId || r.arrivalId || null, leaving: !!r.leaving, arriving: !!r.arrivalId
    }));
  }

  // The emblem of a property for its card: public/img/properties/<code>.png (a transparent PNG made for the dark cards).
  // Without one the card shows the property's icon.
  static logoOf(code) {
    try {
      const file = path.join(__dirname, '..', 'public', 'img', 'properties', `${code}.png`);
      if (fs.existsSync(file)) return `/img/properties/${code}.png?v=${Math.round(fs.statSync(file).mtimeMs)}`;
    } catch (e) { /* no logo */ }
    return '';
  }

  static async getAllProperties(properties) {
    const out = [];
    for (const p of properties) {
      let data = null;
      try {
        data = await OverviewModel.getPropertyOverview(p.IDNo);
        if (data && p.BUILDING_VIEW) data.building = await OverviewModel.buildingRooms(p.IDNo);   // this property's card shows its 3D building
      } catch (e) { console.error('Overview failed for property', p.CODE, e.message); }
      out.push({
        id: p.IDNo,
        code: p.CODE,
        name: p.NAME,
        displayName: p.DISPLAY_NAME || p.NAME,
        color: p.COLOR || '#4361ee',
        icon: p.ICON || 'fa-building',
        logo: OverviewModel.logoOf(p.CODE),
        data
      });
    }
    return out;
  }
}

module.exports = OverviewModel;
