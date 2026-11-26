const { pool } = require('../config/database');

// "Delete Data" removes the data of ONE property only (the one that is open). Every statement below is limited to it:
// either the table has its own PROPERTY_ID, or its rows are reached through that property's bookings / rooms.
// The inventory table has no property (it is shared by all of them), so it is never touched here.
const BOOKINGS = 'SELECT IDNo FROM booking WHERE PROPERTY_ID = ?';
const ROOMS = 'SELECT IDNo FROM room WHERE PROPERTY_ID = ?';

// order matters: everything that points to a booking goes before the bookings themselves
const PURGE_STEPS = [
  ['billing', `DELETE FROM billing WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['payments', `DELETE FROM payments WHERE BOOKING_ID IN (${BOOKINGS}) OR ROOM_BOOKING_ID IN (${BOOKINGS})`, 2],
  ['booking_service', `DELETE FROM booking_service WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['booking_extension', `DELETE FROM booking_extension WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['booking_cancellation', `DELETE FROM booking_cancellation WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['booking_pick_drop', `DELETE FROM booking_pick_drop WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['remarks', `DELETE FROM remarks WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['room_transfer_logs', `DELETE FROM room_transfer_logs WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['room_clearance', `DELETE FROM room_clearance WHERE BOOKING_ID IN (${BOOKINGS}) OR ROOM_ID IN (${ROOMS})`, 2],
  ['complaint_request', `DELETE FROM complaint_request WHERE BOOKING_ID IN (${BOOKINGS})`, 1],
  ['cleanup_notifications', `DELETE FROM cleanup_notifications WHERE room_id IN (${ROOMS})`, 1],
  ['expenses', 'DELETE FROM expenses WHERE PROPERTY_ID = ?', 1]
];

class DeleteDataModel {
  static async purgeTestData(propertyId) {
    const pid = Number(propertyId);
    // without a property there is nothing safe to delete: never fall back to "everything"
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('No active property. Nothing was deleted.');

    const conn = await pool.promise().getConnection();

    try {
      await conn.beginTransaction();
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      const deletedCounts = {};

      // group_booking has no PROPERTY_ID: remember this property's groups before its bookings are gone
      const [groupRows] = await conn.query(
        'SELECT DISTINCT GROUP_BOOKING_ID AS id FROM booking WHERE PROPERTY_ID = ? AND GROUP_BOOKING_ID IS NOT NULL', [pid]
      );

      // rooms that are out of order only because of a maintenance booking (which is deleted below)
      const [maintRows] = await conn.query(
        "SELECT DISTINCT ROOM_ID AS id FROM booking WHERE PROPERTY_ID = ? AND ACTIVE = 1 AND BOOKING_STATUS = 'maintenance'", [pid]
      );

      for (const [table, sql, params] of PURGE_STEPS) {
        const [result] = await conn.query(sql, Array(params).fill(pid));
        deletedCounts[table] = result.affectedRows || 0;
      }

      const [bookingResult] = await conn.query('DELETE FROM booking WHERE PROPERTY_ID = ?', [pid]);
      deletedCounts.booking = bookingResult.affectedRows || 0;

      deletedCounts.group_booking = 0;
      const groupIds = groupRows.map((g) => g.id).filter(Boolean);
      if (groupIds.length) {
        // (a group that another property's booking still uses stays)
        const [groupResult] = await conn.query(
          `DELETE FROM group_booking WHERE IDNo IN (?)
             AND IDNo NOT IN (SELECT GROUP_BOOKING_ID FROM booking WHERE GROUP_BOOKING_ID IS NOT NULL)`,
          [groupIds]
        );
        deletedCounts.group_booking = groupResult.affectedRows || 0;
      }

      // Rooms are set-up, not data. Only what the deleted bookings caused is cleared: occupied (2) and dirty (4) become available.
      // Out of order (3) and Tenant (5) stay as they were set.
      const maintIds = maintRows.map((m) => m.id).filter(Boolean);
      const [roomResult] = await conn.query(
        `UPDATE room SET ROOM_STATUS = 1 WHERE PROPERTY_ID = ? AND (ROOM_STATUS IN ('2', '4')${maintIds.length ? " OR (ROOM_STATUS = '3' AND IDNo IN (?))" : ''})`,
        maintIds.length ? [pid, maintIds] : [pid]
      );
      deletedCounts.room_status_updated = roomResult.affectedRows || 0;

      await conn.commit();

      return {
        success: true,
        deletedCounts
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      // the connection goes back to the pool: always switch the checks on again
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (fkError) {
        console.error('Failed to re-enable foreign key checks:', fkError.message);
      }
      conn.release();
    }
  }
}

module.exports = DeleteDataModel;
