const crypto = require('crypto');
const { queryDatabasePromise } = require('../config/database');
const PropertyModel = require('./propertyModel');
const RoomRequestModel = require('./roomRequestModel');

// The staff phone apps (Hotelapp/standalone-apks: the Housekeeping app) on HOTELNEW's data, in the shapes the app expects
// (the same API the K Grand PMS has at /api/staff-app). One property per sign-in.
//
// HOTELNEW              -> the app
//   room.ROOM_STATUS 1/2  -> clean (vacant / occupied by the stay that is checked in)
//   room.ROOM_STATUS 4    -> dirty (to be cleaned)        3 -> out of order        5 (tenant) -> not on the board
//   room_request (MUR / custom, the Housekeeping view of the dashboard) -> the app's requests; an open MUR = the guest asked for cleaning
//   booking (pending / check-In / check-Out)                            -> the arrivals and departures (reserved / checked_in / checked_out)

const SESSION_DAYS = 30;
// the hotel day starts at 6 AM (as on the dashboard): a stay that leaves at 2 AM still belongs to the day before
const HOTEL_DAY = "DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 HOUR), '%Y-%m-%d')";
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const iso = (d) => (d ? new Date(d).toISOString() : undefined);

// When each room became dirty (ROOM_STATUS 4), per property: { propertyId -> Map(roomNumber -> ISO time | null) }. HOTELNEW keeps no such
// time, so it is noted here the first time a room is SEEN dirty: on every change the web or the app announces (staffAppRealtime.changed ->
// trackDirty), and on every read of the board / pending. A room already dirty when the server starts has no time (null): it is not news.
// The app makes its "Room to clean" alert from it; /pending counts the dirty rooms, so the phone's background service rings for them too.
const dirtySeen = new Map();

class StaffAppModel {
  // the dirty rooms of a property now, with the time each one was first seen dirty
  static async trackDirty(propertyId) {
    const rows = await queryDatabasePromise(
      "SELECT ROOM_NUMBER AS no FROM room WHERE PROPERTY_ID = ? AND ACTIVE = 1 AND ROOM_STATUS = '4'", [propertyId]);
    const first = !dirtySeen.has(propertyId);
    const seen = dirtySeen.get(propertyId) || new Map();
    const now = new Date().toISOString();
    const dirty = new Set(rows.map((r) => String(r.no)));
    for (const no of Array.from(seen.keys())) if (!dirty.has(no)) seen.delete(no);
    for (const no of dirty) if (!seen.has(no)) seen.set(no, first ? null : now);
    dirtySeen.set(propertyId, seen);
    return seen;
  }

  // every active property (a change on the web does not always say which one)
  static async trackDirtyAll() {
    const props = await PropertyModel.getAllActive();
    for (const p of props) await StaffAppModel.trackDirty(p.IDNo);
  }

  // ---------- accounts & sessions ----------

  // the properties an account may open (Admin: all of them; others: the ones given in User Info, else the default one) - as m_auth does
  static async allowedProperties(user) {
    const all = await PropertyModel.getAllActive();
    if (Number(user.PERMISSIONS) === 1) return all;
    let ids = null;
    try { ids = await require('./userModels').getPropertyIds(user.IDNo); } catch (e) { ids = null; }
    if (!ids) return all;
    const mine = all.filter((p) => ids.includes(p.IDNo));
    return mine.length ? mine : all.filter((p) => p.IS_DEFAULT).slice(0, 1);
  }

  // The property of a sign-in: the one in the app's PMS address (".../clark_central"), else the account's only one, else the default one.
  static async pickProperty(user, code) {
    const allowed = await StaffAppModel.allowedProperties(user);
    if (!allowed.length) return { error: 'This account has no property.' };
    if (code) {
      const p = allowed.find((x) => String(x.CODE).toLowerCase() === String(code).toLowerCase());
      if (p) return { property: p };
      const exists = (await PropertyModel.getAllActive()).some((x) => String(x.CODE).toLowerCase() === String(code).toLowerCase());
      return { error: exists ? 'This account may not open that property.' : `There is no property "${code}". Use the PMS address with the property code, e.g. 192.168.1.10:5001/${allowed[0].CODE}` };
    }
    return { property: allowed.length === 1 ? allowed[0] : (allowed.find((p) => p.IS_DEFAULT) || allowed[0]) };
  }

  static async createSession(userId, app, propertyId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await queryDatabasePromise(
      `INSERT INTO staff_app_session (TOKEN_HASH, USER_ID, APP, PROPERTY_ID, EXPIRES_DT) VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ${SESSION_DAYS} DAY))`,
      [sha256(token), userId, app, propertyId]
    );
    // old ones: gone
    queryDatabasePromise('DELETE FROM staff_app_session WHERE EXPIRES_DT < NOW() OR (ACTIVE = 0 AND LAST_SEEN_DT < DATE_SUB(NOW(), INTERVAL 7 DAY))').catch(() => {});
    return token;
  }

  // The session of a token, with its account (still active) and property (still allowed). null = signed out.
  static async sessionOf(token) {
    if (!token) return null;
    const [s] = await queryDatabasePromise(
      `SELECT s.IDNo, s.USER_ID, s.APP, s.PROPERTY_ID, s.LAST_SEEN_DT, u.FULLNAME, u.USERNAME, u.PERMISSIONS, p.CODE, p.NAME AS PNAME, p.DISPLAY_NAME AS PDISPLAY
         FROM staff_app_session s
         JOIN user_info u ON u.IDNo = s.USER_ID AND u.ACTIVE = 1
         JOIN property p ON p.IDNo = s.PROPERTY_ID AND p.ACTIVE = 1
        WHERE s.TOKEN_HASH = ? AND s.ACTIVE = 1 AND s.EXPIRES_DT > NOW()
        LIMIT 1`,
      [sha256(token)]
    );
    if (!s) return null;
    const allowed = await StaffAppModel.allowedProperties({ IDNo: s.USER_ID, PERMISSIONS: s.PERMISSIONS });
    if (!allowed.some((p) => p.IDNo === s.PROPERTY_ID)) return null;
    // in use: it lasts SESSION_DAYS more (written at most every 10 minutes)
    if (!s.LAST_SEEN_DT || Date.now() - new Date(s.LAST_SEEN_DT).getTime() > 600000) {
      queryDatabasePromise(`UPDATE staff_app_session SET LAST_SEEN_DT = NOW(), EXPIRES_DT = DATE_ADD(NOW(), INTERVAL ${SESSION_DAYS} DAY) WHERE IDNo = ?`, [s.IDNo]).catch(() => {});
    }
    return {
      id: s.IDNo,
      app: s.APP,
      propertyId: s.PROPERTY_ID,
      propertyCode: s.CODE,
      propertyName: s.PDISPLAY || s.PNAME,
      user: { IDNo: s.USER_ID, userId: s.USER_ID, FULLNAME: s.FULLNAME, USERNAME: s.USERNAME, PERMISSIONS: s.PERMISSIONS }
    };
  }

  static async endSession(token) {
    await queryDatabasePromise('UPDATE staff_app_session SET ACTIVE = 0 WHERE TOKEN_HASH = ?', [sha256(token)]);
  }

  // ---------- stays ----------

  static async hotelDay() {
    const [r] = await queryDatabasePromise(`SELECT ${HOTEL_DAY} AS d`);
    return r.d;
  }

  // the stays of the property around a day: checked in now, or with that day between arrival and departure (both included)
  static async staysAround(propertyId, day) {
    return queryDatabasePromise(
      `SELECT b.IDNo AS id, b.ROOM_ID AS roomId, r.ROOM_NUMBER AS roomNumber, b.BOOKING_STATUS AS status,
              DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS checkIn, DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS checkOut,
              b.ACTUAL_CHECK_IN_DT AS checkedInAt, b.ACTUAL_CHECK_OUT_DT AS checkedOutAt,
              COALESCE(b.CHECK_IN_STATUS, 1) AS ciStatus,
              (COALESCE(b.LATE_CHECKOUT, 0) = 1 OR EXISTS (SELECT 1 FROM booking_service s WHERE s.BOOKING_ID = b.IDNo AND s.SERVICE_ID = 72 AND s.ACTIVE = 1)) AS lateOut,
              COALESCE(b.HOLD_PENDING, 0) AS onHold, b.GUESTS_COUNT AS guests, b.FLIGHT_NUMBER AS flight, b.DROPOFF_FLIGHT_NUMBER AS dropFlight,
              c.NAME AS guestName, c.NATIONALITY AS nationality, c.LEVEL AS guestLevel
         FROM booking b
         JOIN room r ON r.IDNo = b.ROOM_ID AND r.PROPERTY_ID = ?
         LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        WHERE b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0 AND b.BOOKING_STATUS IN ('pending', 'check-In', 'check-Out')
          AND (b.BOOKING_STATUS = 'check-In' OR (DATE(b.CHECK_IN_DATE) <= ? AND DATE(b.CHECK_OUT_DATE) >= ?))
        ORDER BY b.CHECK_IN_DATE, b.IDNo`,
      [propertyId, day, day]
    );
  }

  static stayStatus(s) { return s === 'check-In' ? 'checked_in' : s === 'check-Out' ? 'checked_out' : 'reserved'; }
  static checkInType(n) { return Number(n) === 2 ? 'early' : Number(n) === 0 ? 'late' : 'regular'; }
  static guestOf(s) {
    if (!s) return undefined;
    const lvl = String(s.guestLevel || '').trim();
    return {
      name: s.guestName || 'Guest',
      nationality: s.nationality || undefined,
      // the guest level, when it says something (VIP...): "regular" / a number is not shown
      level: lvl && !/^(regular|normal|\d+)$/i.test(lvl) ? lvl : undefined,
      adults: Number(s.guests) || 0,
      children: 0
    };
  }

  // A day's arrivals and departures (today's hotel day when none is given): { date, arrivals, departures }
  static async movements(propertyId, date) {
    const day = isDate(date) ? date : await StaffAppModel.hotelDay();
    const rows = await StaffAppModel.staysAround(propertyId, day);
    const view = (s) => ({
      bookingId: String(s.id),
      roomNumber: String(s.roomNumber),
      status: StaffAppModel.stayStatus(s.status),
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      checkInType: StaffAppModel.checkInType(s.ciStatus),
      checkOutType: Number(s.lateOut) ? 'late' : 'regular',
      checkedInAt: s.status !== 'pending' ? iso(s.checkedInAt) : undefined,
      checkedOutAt: s.status === 'check-Out' ? iso(s.checkedOutAt) : undefined,
      onHold: Boolean(Number(s.onHold)),
      guest: StaffAppModel.guestOf(s),
      pickup: Boolean(s.flight),
      dropoff: Boolean(s.dropFlight)
    });
    return {
      date: day,
      // (a reservation whose day of arrival has passed but who has not come yet is still expected: listed too, as on the dashboard)
      arrivals: rows.filter((s) => s.checkIn === day || (s.status === 'pending' && s.checkIn < day && s.checkOut > day)).map(view),
      departures: rows.filter((s) => s.checkOut === day && s.status !== 'pending').map(view)
    };
  }

  // ---------- the room board ----------

  // The order housekeeping cleans in (lower first), as the app shows it: an arrival today (early first) -> a guest asked -> checked out today
  // -> a stayover -> due out today (once the guest is gone) -> any other dirty room.
  static priorityOf(room) {
    if (!room.needsCleaning || room.housekeeping === 'out_of_order') return null;
    if (room.arrivingToday && !room.occupied) return room.arrival && room.arrival.checkInType === 'early' ? { rank: 0, label: 'Early check-in today' } : { rank: 1, label: 'Arrival today' };
    if (room.cleaningRequested && room.occupied) return { rank: 2, label: 'Guest asked' };
    if (room.departedToday && !room.occupied) return { rank: 3, label: 'Checked out' };
    if (room.occupied && !room.isTodayCheckout) return { rank: 4, label: 'Stayover' };
    if (room.occupied) return { rank: 5, label: 'Due out' };
    return { rank: 6, label: 'Vacant' };
  }

  static async roomBoard(propertyId) {
    const day = await StaffAppModel.hotelDay();
    const [rooms, stays, open, seen] = await Promise.all([
      queryDatabasePromise(
        `SELECT r.IDNo AS id, r.ROOM_NUMBER AS roomNumber, r.ROOM_STATUS AS status, r.ROOM_FLOOR AS floor, t.NAME AS typeName
           FROM room r LEFT JOIN room_type t ON t.IDNo = r.ROOM_TYPE_ID
          WHERE r.ACTIVE = 1 AND r.PROPERTY_ID = ? AND COALESCE(r.ROOM_STATUS, '1') <> '5'
          ORDER BY r.ROOM_NUMBER`, [propertyId]),
      StaffAppModel.staysAround(propertyId, day),
      RoomRequestModel.listPending(propertyId),
      StaffAppModel.trackDirty(propertyId)
    ]);
    const byRoom = new Map();
    stays.forEach((s) => { const k = String(s.roomId); if (!byRoom.has(k)) byRoom.set(k, []); byRoom.get(k).push(s); });
    const murRooms = new Set(open.filter((q) => q.type === 'MUR').map((q) => String(q.roomNumber)));
    return rooms.map((r) => {
      const number = String(r.roomNumber);
      const own = byRoom.get(String(r.id)) || [];
      const inHouse = own.filter((s) => s.status === 'check-In').pop();
      const arriving = own.find((s) => s.status === 'pending' && s.checkIn <= day && s.checkOut > day);
      const st = String(r.status);
      const housekeeping = st === '3' ? 'out_of_order' : st === '4' ? 'dirty' : 'clean';
      const cleaningRequested = murRooms.has(number);
      const room = {
        id: String(r.id),
        roomNumber: number,
        floor: r.floor != null && String(r.floor).trim() !== '' ? String(r.floor) : number.slice(0, number.length > 3 ? 2 : 1),
        typeName: r.typeName || '',
        housekeeping,
        occupied: Boolean(inHouse),
        isTodayCheckout: Boolean(inHouse && inHouse.checkOut <= day),
        arrivingToday: Boolean(arriving),
        departedToday: own.some((s) => s.status === 'check-Out' && s.checkOut === day),
        cleaningRequested,
        needsCleaning: housekeeping === 'dirty' || cleaningRequested,
        lastCleanedAt: null,
        // when it became dirty (null: unknown / not dirty) - the app's "Room to clean" alert
        dirtySince: housekeeping === 'dirty' ? (seen.get(number) || null) : null,
        guest: StaffAppModel.guestOf(inHouse) || null,
        checkOutType: inHouse ? (Number(inHouse.lateOut) ? 'late' : 'regular') : null,
        arrival: arriving ? Object.assign({}, StaffAppModel.guestOf(arriving), { checkInType: StaffAppModel.checkInType(arriving.ciStatus), onHold: Boolean(Number(arriving.onHold)) }) : null,
        dnd: false,
        use: null,
        useNote: null,
        oooUntil: null
      };
      const p = StaffAppModel.priorityOf(room);
      return Object.assign(room, { priority: p ? p.rank : null, priorityLabel: p ? p.label : null });
    });
  }

  static async roomById(propertyId, roomId) {
    const [r] = await queryDatabasePromise('SELECT IDNo, ROOM_NUMBER, ROOM_STATUS FROM room WHERE IDNo = ? AND PROPERTY_ID = ? AND ACTIVE = 1 LIMIT 1', [roomId, propertyId]);
    return r || null;
  }

  // ---------- requests (room_request) as the app's tasks ----------

  static TASK_STATUS = { pending: 'pending', accepted: 'accepted', done: 'completed', cancelled: 'cancelled', declined: 'declined' };

  static taskView(q, guest) {
    const t = {
      id: String(q.id),
      type: 'housekeeping',
      serviceType: 'housekeeping',
      requestType: q.type === 'MUR' ? 'cleaning' : 'custom',
      roomId: String(q.roomNumber),
      message: q.type === 'MUR' ? 'Make up room (MUR)' : (q.text || 'Request'),
      language: 'en',
      source: 'pms',
      requestedBy: q.requestedBy || undefined,
      status: StaffAppModel.TASK_STATUS[q.status] || q.status,
      timestamp: iso(q.requestedAt),
      createdAt: iso(q.requestedAt),
      updatedAt: iso(q.doneAt || q.acceptedAt || q.requestedAt),
      assignedTo: q.acceptedById != null ? String(q.acceptedById) : undefined,
      assignedName: q.acceptedBy || undefined,
      acceptedAt: iso(q.acceptedAt),
      completedAt: q.status === 'done' ? iso(q.doneAt) : undefined,
      declinedAt: q.status === 'declined' ? iso(q.doneAt) : undefined,
      declinedBy: q.status === 'declined' ? (q.doneBy || undefined) : undefined,
      cancelledAt: q.status === 'cancelled' ? iso(q.doneAt) : undefined
    };
    return guest ? Object.assign(t, { guest }) : t;
  }

  static async taskRows(propertyId, where, params) {
    return queryDatabasePromise(
      `SELECT IDNo AS id, ROOM_NUMBER AS roomNumber, REQUEST_TYPE AS type, REQUEST_TEXT AS text, STATUS AS status,
              REQUESTED_BY_NAME AS requestedBy, REQUESTED_DT AS requestedAt,
              ACCEPTED_BY AS acceptedById, ACCEPTED_BY_NAME AS acceptedBy, ACCEPTED_DT AS acceptedAt,
              DONE_BY_NAME AS doneBy, DONE_DT AS doneAt
         FROM room_request
        WHERE PROPERTY_ID = ? AND ${where}
        ORDER BY REQUESTED_DT DESC, IDNo DESC`,
      [propertyId].concat(params || [])
    );
  }

  // the open requests and the ones closed in the last 24 hours, newest first, each with the guest who is in the room (if they were in when it was sent)
  static async tasks(propertyId) {
    const [rows, stays] = await Promise.all([
      StaffAppModel.taskRows(propertyId, "(STATUS IN ('pending', 'accepted') OR DONE_DT >= DATE_SUB(NOW(), INTERVAL 24 HOUR))"),
      StaffAppModel.staysAround(propertyId, await StaffAppModel.hotelDay())
    ]);
    const inHouse = new Map(stays.filter((s) => s.status === 'check-In').map((s) => [String(s.roomNumber), s]));
    return rows.map((q) => {
      const s = inHouse.get(String(q.roomNumber));
      const ok = s && (!s.checkedInAt || new Date(s.checkedInAt) <= new Date(q.requestedAt));
      return StaffAppModel.taskView(q, ok ? StaffAppModel.guestOf(s) : undefined);
    });
  }

  static async task(propertyId, id) {
    const [q] = await StaffAppModel.taskRows(propertyId, 'IDNo = ?', [id]);
    return q || null;
  }

  // For the app's background service: how much work waits (requests + rooms to clean) and the newest piece (to show and read aloud).
  // The service rings when the count goes up, so a room marked dirty rings like a new request.
  static async pending(propertyId) {
    const [rows, seen] = await Promise.all([StaffAppModel.taskRows(propertyId, "STATUS = 'pending'"), StaffAppModel.trackDirty(propertyId)]);
    const items = rows.map((q) => ({ at: iso(q.requestedAt) || '', roomId: String(q.roomNumber), message: q.type === 'MUR' ? 'Make up room' : (q.text || '') }));
    seen.forEach((at, no) => items.push({ at: at || '', roomId: no, message: 'Ready to clean' }));
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const latest = items[0];
    return { count: items.length, latest: latest ? { roomId: latest.roomId, message: latest.message, language: 'en' } : null };
  }
}

module.exports = StaffAppModel;
