// Calendar "Move Rooms": several bookings change rooms at once. All of them move or none does.
// Only the room changes - dates, prices and payments stay as they are.
const { pool } = require('../config/database');

const MOVABLE = ['pending', 'check-In'];

const nextDay = (day) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
// the nights a stay holds its room: check-in day up to (not including) the check-out day
const nightsEnd = (b) => (b.outDay > b.inDay ? b.outDay : nextDay(b.inDay));

// Rules between two stays that end up in the same room. Returns the reason they cannot be there together, or null.
function pairProblem(a, b) {
  if (a.inDay < nightsEnd(b) && nightsEnd(a) > b.inDay) return `overlaps ${b.guest} (${b.inDay} to ${b.outDay})`;
  for (const [leaving, arriving] of [[a, b], [b, a]]) {
    if (leaving.outDay !== arriving.inDay) continue;
    // Check-in status: 0 = Late, 1 = Regular, 2 = Early
    if (Number(arriving.checkInStatus) === 2) {
      return `${arriving.guest} has an Early Check-In on ${arriving.inDay}, the day ${leaving.guest} checks out`;
    }
    if (Number(leaving.lateCheckout) === 1 && Number(arriving.checkInStatus) !== 0) {
      return `${leaving.guest} has a Late Check-Out on ${leaving.outDay}, so ${arriving.guest} needs a Late Check-In`;
    }
  }
  return null;
}

// moving: the bookings being moved, each with newRoomId. staying: every other booking of the target rooms. rooms: Map id -> room row.
function findProblems(moving, staying, rooms, propertyId) {
  const problems = [];
  const add = (b, message) => problems.push({ bookingId: b.id, guest: b.guest, message });

  moving.forEach((b, i) => {
    const room = rooms.get(Number(b.newRoomId));
    if (!MOVABLE.includes(b.status)) return add(b, 'only reserved or checked-in bookings can be moved');
    if (!room || Number(room.ACTIVE) !== 1 || Number(room.PROPERTY_ID) !== Number(propertyId)) return add(b, 'that room does not exist');
    if (String(room.ROOM_STATUS) === '3') return add(b, `Room ${room.ROOM_NUMBER} is Out of order`);
    if (String(room.ROOM_STATUS) === '5') return add(b, `Room ${room.ROOM_NUMBER} is a Tenant room`);

    staying.filter((o) => Number(o.roomId) === Number(b.newRoomId)).forEach((o) => {
      const why = pairProblem(b, o);
      if (why) add(b, `Room ${room.ROOM_NUMBER}: ${why}`);
    });
    // between the moved bookings themselves (two that were already together in one room keep their relationship)
    moving.slice(i + 1).forEach((o) => {
      if (Number(o.newRoomId) !== Number(b.newRoomId) || Number(o.roomId) === Number(b.roomId)) return;
      const why = pairProblem(b, o);
      if (why) add(b, `Room ${room.ROOM_NUMBER}: ${why}`);
    });
    return null;
  });
  return problems;
}

const BOOKING_COLUMNS = `b.IDNo AS id, b.ROOM_ID AS roomId, b.BOOKING_STATUS AS status,
  DATE_FORMAT(b.CHECK_IN_DATE, '%Y-%m-%d') AS inDay, DATE_FORMAT(b.CHECK_OUT_DATE, '%Y-%m-%d') AS outDay,
  COALESCE(b.CHECK_IN_STATUS, 1) AS checkInStatus, COALESCE(b.LATE_CHECKOUT, 0) AS lateCheckout,
  COALESCE(c.NAME, 'Guest') AS guest, r.ROOM_NUMBER AS roomNumber`;

class RoomMoveModel {
  // moves: [{ bookingId, newRoomId }]. dryRun only checks. Returns { success, moves, problems }.
  static async moveRooms({ moves, propertyId, userId = null, dryRun = false }) {
    const conn = await pool.promise().getConnection();
    try {
      await conn.beginTransaction();
      const wanted = new Map(moves.map((m) => [Number(m.bookingId), Number(m.newRoomId)]));
      const roomIds = [...new Set(wanted.values())];

      // the target rooms are locked first, so two people moving into the same rooms are handled one after the other
      const [roomRows] = await conn.query(
        'SELECT IDNo, ROOM_NUMBER, ROOM_STATUS, PROPERTY_ID, ACTIVE FROM room WHERE IDNo IN (?) FOR UPDATE', [roomIds]
      );
      const [found] = await conn.query(
        `SELECT ${BOOKING_COLUMNS} FROM booking b
           LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
           LEFT JOIN room r ON r.IDNo = b.ROOM_ID
          WHERE b.IDNo IN (?) AND b.PROPERTY_ID = ? AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0
          FOR UPDATE`,
        [[...wanted.keys()], propertyId]
      );
      if (found.length !== wanted.size) {
        await conn.rollback();
        return { success: false, moves: [], problems: [{ message: 'A selected booking is no longer available. Refresh the calendar and select again.' }] };
      }
      // a booking "moved" to the room it is already in is not a move
      const moving = found.map((b) => ({ ...b, newRoomId: wanted.get(Number(b.id)) }))
        .filter((b) => Number(b.newRoomId) !== Number(b.roomId));
      if (!moving.length) {
        await conn.rollback();
        return { success: false, moves: [], problems: [{ message: 'Nothing to move.' }] };
      }

      const [staying] = await conn.query(
        `SELECT ${BOOKING_COLUMNS} FROM booking b
           LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
           LEFT JOIN room r ON r.IDNo = b.ROOM_ID
          WHERE b.ROOM_ID IN (?) AND b.IDNo NOT IN (?) AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0
            AND LOWER(COALESCE(b.BOOKING_STATUS, '')) NOT IN ('cancelled', 'canceled', 'void', 'no-show')`,
        [roomIds, moving.map((b) => b.id)]
      );

      const rooms = new Map(roomRows.map((r) => [Number(r.IDNo), r]));
      const problems = findProblems(moving, staying, rooms, propertyId);
      const summary = moving.map((b) => ({
        bookingId: b.id,
        guest: b.guest,
        status: b.status,
        fromRoomId: b.roomId,
        fromRoom: b.roomNumber,
        toRoomId: b.newRoomId,
        toRoom: rooms.get(Number(b.newRoomId))?.ROOM_NUMBER ?? '?',
        checkIn: b.inDay,
        checkOut: b.outDay
      }));

      if (problems.length || dryRun) {
        await conn.rollback();
        return { success: !problems.length, moves: summary, problems };
      }

      for (const b of moving) {
        await conn.query(
          'UPDATE booking SET ROOM_ID = ?, TRANSFER = 1, TRANSFER_FROM = ?, EDITED_DT = NOW() WHERE IDNo = ?',
          [b.newRoomId, b.roomId, b.id]
        );
        await conn.query(
          'INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE, TRANSFERRED_BY) VALUES (?, ?, ?, NOW(), ?)',
          [b.id, b.roomId, b.newRoomId, userId]
        );
      }
      // guests who are checked in take their room status with them: the room they are in = Occupied, a room they left = Cleaning
      const touched = [...new Set(moving.filter((b) => b.status === 'check-In').flatMap((b) => [b.roomId, b.newRoomId]))].filter(Boolean);
      if (touched.length) {
        await conn.query(
          `UPDATE room r SET r.ROOM_STATUS = CASE
             WHEN EXISTS (SELECT 1 FROM booking b WHERE b.ROOM_ID = r.IDNo AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0 AND b.BOOKING_STATUS = 'check-In') THEN 2
             WHEN r.ROOM_STATUS IN ('3', '5') THEN r.ROOM_STATUS
             ELSE 4
           END
           WHERE r.IDNo IN (?)`,
          [touched]
        );
      }

      await conn.commit();
      return { success: true, moves: summary, problems: [] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = RoomMoveModel;
module.exports.findProblems = findProblems;
