const { queryDatabasePromise } = require('../config/database');

// Housekeeping of the dashboard (the Housekeeping view of /dashboard/full, what the Housekeeping app did):
//  - requests for a room: MUR (make up room) or a custom text. pending -> accepted (someone took it, "in progress") -> done / cancelled
//  - a room marked clean or dirty
//  - minibar / laundry put on the bill of the guest in the room
// Always scoped to the property of the request.
const OPEN = "('pending', 'accepted')";
// The service categories (Settings -> Services) the minibar / laundry price list is read from
const CHARGE_CATEGORIES = ['Minibar', 'Laundry'];

class RoomRequestModel {
  // the open ones of the property (waiting or in progress), oldest first (the one waiting longest is on top)
  static async listPending(propertyId) {
    return queryDatabasePromise(
      `SELECT IDNo AS id, ROOM_ID AS roomId, ROOM_NUMBER AS roomNumber, REQUEST_TYPE AS type, REQUEST_TEXT AS text, STATUS AS status,
              REQUESTED_BY_NAME AS requestedBy, REQUESTED_DT AS requestedAt,
              ACCEPTED_BY AS acceptedById, ACCEPTED_BY_NAME AS acceptedBy, ACCEPTED_DT AS acceptedAt
         FROM room_request
        WHERE PROPERTY_ID = ? AND STATUS IN ${OPEN}
        ORDER BY REQUESTED_DT ASC, IDNo ASC`,
      [propertyId]
    );
  }

  // what was done today (hotel day starts at 6 AM, as on the dashboard): the "Done" list of the work panel
  static async listDoneToday(propertyId) {
    return queryDatabasePromise(
      `SELECT IDNo AS id, ROOM_NUMBER AS roomNumber, REQUEST_TYPE AS type, REQUEST_TEXT AS text, STATUS AS status,
              REQUESTED_BY_NAME AS requestedBy, REQUESTED_DT AS requestedAt, DONE_BY_NAME AS doneBy, DONE_DT AS doneAt
         FROM room_request
        WHERE PROPERTY_ID = ? AND STATUS = 'done' AND DONE_DT >= DATE_ADD(DATE(DATE_SUB(NOW(), INTERVAL 6 HOUR)), INTERVAL 6 HOUR)
        ORDER BY DONE_DT DESC, IDNo DESC
        LIMIT 50`,
      [propertyId]
    );
  }

  static async roomOf(propertyId, roomNumber) {
    const rows = await queryDatabasePromise(
      'SELECT IDNo, ROOM_NUMBER, ROOM_STATUS FROM room WHERE PROPERTY_ID = ? AND ROOM_NUMBER = ? AND ACTIVE = 1 LIMIT 1',
      [propertyId, String(roomNumber)]
    );
    return rows[0] || null;
  }

  // One open MUR per room is enough: asking again returns the one that is already open (duplicate = true).
  static async create({ propertyId, roomNumber, type, text, userId, userName }) {
    const room = await RoomRequestModel.roomOf(propertyId, roomNumber);
    if (!room) return { error: 'Room not found in this property.' };
    if (type === 'MUR') {
      const [dup] = await queryDatabasePromise(
        `SELECT IDNo FROM room_request WHERE PROPERTY_ID = ? AND ROOM_ID = ? AND REQUEST_TYPE = 'MUR' AND STATUS IN ${OPEN} LIMIT 1`,
        [propertyId, room.IDNo]
      );
      if (dup) return { id: dup.IDNo, duplicate: true, roomNumber: String(room.ROOM_NUMBER) };
    }
    const res = await queryDatabasePromise(
      `INSERT INTO room_request (PROPERTY_ID, ROOM_ID, ROOM_NUMBER, REQUEST_TYPE, REQUEST_TEXT, STATUS, REQUESTED_BY, REQUESTED_BY_NAME)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [propertyId, room.IDNo, String(room.ROOM_NUMBER), type, type === 'CUSTOM' ? text : null, userId || null, userName || null]
    );
    return { id: res.insertId, duplicate: false, roomNumber: String(room.ROOM_NUMBER) };
  }

  // 'done' or 'cancelled', only for an open request of this property
  static async close({ propertyId, id, status, userId, userName }) {
    const res = await queryDatabasePromise(
      `UPDATE room_request SET STATUS = ?, DONE_BY = ?, DONE_BY_NAME = ?, DONE_DT = NOW()
        WHERE IDNo = ? AND PROPERTY_ID = ? AND STATUS IN ${OPEN}`,
      [status, userId || null, userName || null, id, propertyId]
    );
    return res.affectedRows > 0;
  }

  // someone takes a waiting request (it is "in progress", with their name on it)
  static async accept({ propertyId, id, userId, userName }) {
    const res = await queryDatabasePromise(
      `UPDATE room_request SET STATUS = 'accepted', ACCEPTED_BY = ?, ACCEPTED_BY_NAME = ?, ACCEPTED_DT = NOW()
        WHERE IDNo = ? AND PROPERTY_ID = ? AND STATUS = 'pending'`,
      [userId || null, userName || null, id, propertyId]
    );
    return res.affectedRows > 0;
  }

  // a request in progress is given back: it waits again for anyone
  static async release({ propertyId, id }) {
    const res = await queryDatabasePromise(
      `UPDATE room_request SET STATUS = 'pending', ACCEPTED_BY = NULL, ACCEPTED_BY_NAME = NULL, ACCEPTED_DT = NULL
        WHERE IDNo = ? AND PROPERTY_ID = ? AND STATUS = 'accepted'`,
      [id, propertyId]
    );
    return res.affectedRows > 0;
  }

  // Housekeeping marks a room clean or dirty. room.ROOM_STATUS: 1 available (clean), 2 occupied, 3 out of order, 4 to be cleaned, 5 tenant.
  //  - clean: a dirty room (4) becomes available (1). An occupied room stays occupied (its cleaning is the stay-over service).
  //    Either way, the open MUR of the room is done by this cleaning.
  //  - dirty: only a clean, empty room (1) goes back to "to be cleaned" (4) - e.g. it needs another pass.
  static async setClean({ propertyId, roomNumber, clean, userId, userName }) {
    const room = await RoomRequestModel.roomOf(propertyId, roomNumber);
    if (!room) return { error: 'Room not found in this property.', code: 404 };
    const status = Number(room.ROOM_STATUS);
    const no = String(room.ROOM_NUMBER);
    if (status === 3) return { error: `Room ${no} is out of order.`, code: 409 };
    if (status === 5) return { error: `Room ${no} is a tenant room.`, code: 409 };
    let newStatus = status;
    if (clean) {
      if (status === 4) newStatus = 1;   // (a clean room with an open MUR: the MUR is done below; nothing at all to do is said below too)
    } else {
      if (status === 4) return { error: `Room ${no} is already marked to be cleaned.`, code: 409 };
      if (status !== 1) return { error: `Room ${no} has a guest: send a MUR request instead.`, code: 409 };
      newStatus = 4;
    }
    if (newStatus !== status) {
      await queryDatabasePromise('UPDATE room SET ROOM_STATUS = ? WHERE IDNo = ? AND PROPERTY_ID = ? AND ACTIVE = 1', [String(newStatus), room.IDNo, propertyId]);
    }
    let closedMur = 0;
    if (clean) {
      const res = await queryDatabasePromise(
        `UPDATE room_request SET STATUS = 'done', DONE_BY = ?, DONE_BY_NAME = ?, DONE_DT = NOW()
          WHERE PROPERTY_ID = ? AND ROOM_ID = ? AND REQUEST_TYPE = 'MUR' AND STATUS IN ${OPEN}`,
        [userId || null, userName || null, propertyId, room.IDNo]
      );
      closedMur = res.affectedRows || 0;
      if (status === 1 && !closedMur) return { error: `Room ${no} is already clean.`, code: 409 };
      if (status === 2 && !closedMur) return { error: `Room ${no} has a guest and no MUR is open.`, code: 409 };
    }
    return { roomId: room.IDNo, roomNumber: no, oldStatus: status, status: newStatus, closedMur };
  }

  // ---------- minibar & laundry ----------

  // the price list: the active services of the category "Minibar" or "Laundry"
  static async chargeItems() {
    const rows = await queryDatabasePromise(
      `SELECT IDNo AS id, SERVICE_CATEGORY AS category, SERVICE_NAME AS name, SERVICE_COST AS price
         FROM services
        WHERE ACTIVE = 1 AND SERVICE_CATEGORY IN (?)
        ORDER BY SERVICE_CATEGORY, SERVICE_NAME`,
      [CHARGE_CATEGORIES]
    );
    return rows.map((r) => ({ id: r.id, category: r.category, name: r.name, price: Number(r.price) || 0 }));
  }

  // the guest in the room now (checked in), or null
  static async stayOf(propertyId, roomNumber) {
    const rows = await queryDatabasePromise(
      `SELECT b.IDNo AS bookingId, c.NAME AS guest
         FROM booking b
         JOIN room r ON r.IDNo = b.ROOM_ID
         LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        WHERE r.PROPERTY_ID = ? AND r.ROOM_NUMBER = ? AND r.ACTIVE = 1
          AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0 AND b.BOOKING_STATUS = 'check-In'
        ORDER BY b.IDNo DESC LIMIT 1`,
      [propertyId, String(roomNumber)]
    );
    return rows[0] || null;
  }

  // Puts minibar / laundry on the bill (Extra Services, unpaid) of the guest in the room:
  //   { category, items: [{ id, count }] }  - counted from the price list
  //   { category, description, amount }    - no price list: a line typed by housekeeping
  static async addCharge({ propertyId, roomNumber, category, items, description, amount, userId }) {
    if (!CHARGE_CATEGORIES.includes(category)) return { error: 'Pick Minibar or Laundry.', code: 400 };
    const stay = await RoomRequestModel.stayOf(propertyId, roomNumber);
    if (!stay) return { error: `No guest is checked in to room ${roomNumber}.`, code: 409 };
    const lines = [];
    if (Array.isArray(items) && items.length) {
      const list = await RoomRequestModel.chargeItems();
      for (const it of items) {
        const svc = list.find((s) => String(s.id) === String(it && it.id) && s.category === category);
        const count = Math.max(0, Math.min(99, parseInt(it && it.count, 10) || 0));
        if (!svc || !count) continue;
        lines.push({ serviceId: svc.id, qty: count, total: Math.round(svc.price * count * 100) / 100, name: null, label: `${count} x ${svc.name}` });
      }
      if (!lines.length) return { error: 'Pick at least one item.', code: 400 };
    } else {
      const what = String(description || '').trim().slice(0, 150);
      const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
      if (!what) return { error: 'Write what it is.', code: 400 };
      if (!(amt > 0) || amt > 1000000) return { error: 'Type the amount.', code: 400 };
      lines.push({ serviceId: -1, qty: 1, total: amt, name: `${category}: ${what}`, label: what });
    }
    for (const l of lines) {
      await queryDatabasePromise(
        `INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, CUSTOM_NAME, ENCODED_BY, ENCODED_DT, ACTIVE)
         VALUES (?, ?, ?, ?, 'unpaid', ?, ?, NOW(), 1)`,
        [stay.bookingId, l.serviceId, l.qty, l.total, l.name, userId || null]
      );
    }
    const total = lines.reduce((s, l) => s + l.total, 0);
    return { bookingId: stay.bookingId, guest: stay.guest || '', total, lines: lines.map((l) => l.label) };
  }
}

module.exports = RoomRequestModel;
