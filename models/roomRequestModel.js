const { queryDatabasePromise } = require('../config/database');

// Requests for a room (Housekeeping view of the dashboard): MUR (make up room) or a custom text. Always scoped to the property of the request.
class RoomRequestModel {
  // pending ones of the property, oldest first (the one waiting longest is on top)
  static async listPending(propertyId) {
    return queryDatabasePromise(
      `SELECT IDNo AS id, ROOM_ID AS roomId, ROOM_NUMBER AS roomNumber, REQUEST_TYPE AS type, REQUEST_TEXT AS text, STATUS AS status,
              REQUESTED_BY_NAME AS requestedBy, REQUESTED_DT AS requestedAt
         FROM room_request
        WHERE PROPERTY_ID = ? AND STATUS = 'pending'
        ORDER BY REQUESTED_DT ASC, IDNo ASC`,
      [propertyId]
    );
  }

  static async roomOf(propertyId, roomNumber) {
    const rows = await queryDatabasePromise(
      'SELECT IDNo, ROOM_NUMBER FROM room WHERE PROPERTY_ID = ? AND ROOM_NUMBER = ? AND ACTIVE = 1 LIMIT 1',
      [propertyId, String(roomNumber)]
    );
    return rows[0] || null;
  }

  // One pending MUR per room is enough: asking again returns the one that is already waiting (duplicate = true).
  static async create({ propertyId, roomNumber, type, text, userId, userName }) {
    const room = await RoomRequestModel.roomOf(propertyId, roomNumber);
    if (!room) return { error: 'Room not found in this property.' };
    if (type === 'MUR') {
      const [dup] = await queryDatabasePromise(
        "SELECT IDNo FROM room_request WHERE PROPERTY_ID = ? AND ROOM_ID = ? AND REQUEST_TYPE = 'MUR' AND STATUS = 'pending' LIMIT 1",
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

  // 'done' or 'cancelled', only for a pending request of this property
  static async close({ propertyId, id, status, userId, userName }) {
    const res = await queryDatabasePromise(
      `UPDATE room_request SET STATUS = ?, DONE_BY = ?, DONE_BY_NAME = ?, DONE_DT = NOW()
        WHERE IDNo = ? AND PROPERTY_ID = ? AND STATUS = 'pending'`,
      [status, userId || null, userName || null, id, propertyId]
    );
    return res.affectedRows > 0;
  }
}

module.exports = RoomRequestModel;
