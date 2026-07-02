const { pool } = require('../config/database');

const TABLES_TO_PURGE = [
  'billing',
  'payments',
  'booking_service',
  'booking_extension',
  'booking_cancellation',
  'booking_pick_drop',
  'remarks',
  'room_transfer_logs',
  'room_clearance',
  'complaint_request',
  'cleanup_notifications',
  'expenses',
  'inventory',
  'booking',
  'group_booking'
];

class DeleteDataModel {
  static async purgeTestData() {
    const conn = await pool.promise().getConnection();

    try {
      await conn.beginTransaction();
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      const deletedCounts = {};

      for (const table of TABLES_TO_PURGE) {
        const [result] = await conn.query(`DELETE FROM \`${table}\``);
        deletedCounts[table] = result.affectedRows || 0;
      }

      const [roomResult] = await conn.query('UPDATE room SET ROOM_STATUS = 1');
      deletedCounts.room_status_updated = roomResult.affectedRows || 0;

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      await conn.commit();

      return {
        success: true,
        deletedCounts
      };
    } catch (error) {
      await conn.rollback();
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } catch (fkError) {
        console.error('Failed to re-enable foreign key checks:', fkError.message);
      }
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = DeleteDataModel;
