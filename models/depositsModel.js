const { queryDatabasePromise } = require('../config/database');

class DepositsModel {
  static async getAll(propertyId = null) {
    const query = `
      SELECT
        sd.IDNo,
        sd.BOOKING_ID,
        sd.AMOUNT,
        sd.DEDUCTION_AMOUNT,
        sd.CASH_REFUND_AMOUNT,
        sd.APPLIED_TO_BALANCE,
        sd.PAYMENT_METHOD,
        sd.STATUS,
        sd.REMARKS,
        sd.COLLECTED_AT,
        sd.REFUNDED_AT,
        COALESCE(sd.REFUNDED_AT, sd.COLLECTED_AT) AS LAST_ACTIVITY_AT,
        b.CONFIRMATION_NUMBER,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        u.FULLNAME AS COLLECTED_BY,
        ru.FULLNAME AS REFUNDED_BY
      FROM security_deposits sd
      INNER JOIN booking b ON b.IDNo = sd.BOOKING_ID
      INNER JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN user_info u ON u.IDNo = sd.ENCODED_BY
      LEFT JOIN user_info ru ON ru.IDNo = sd.REFUNDED_BY
      WHERE sd.ACTIVE = 1
        ${propertyId ? 'AND b.PROPERTY_ID = ?' : ''}
      ORDER BY LAST_ACTIVITY_AT DESC, sd.IDNo DESC
    `;
    return await queryDatabasePromise(query, propertyId ? [propertyId] : []);
  }

  static async getSummary(propertyId = null) {
    const rows = await queryDatabasePromise(`
      SELECT
        COUNT(*) AS TOTAL_COUNT,
        COALESCE(SUM(CASE WHEN sd.STATUS = 'held' THEN sd.AMOUNT ELSE 0 END), 0) AS HELD_AMOUNT,
        COALESCE(SUM(CASE WHEN sd.STATUS = 'refunded' THEN sd.AMOUNT ELSE 0 END), 0) AS REFUNDED_AMOUNT,
        COALESCE(SUM(sd.AMOUNT), 0) AS TOTAL_AMOUNT
      FROM security_deposits sd
      INNER JOIN booking b ON b.IDNo = sd.BOOKING_ID
      WHERE sd.ACTIVE = 1
        ${propertyId ? 'AND b.PROPERTY_ID = ?' : ''}
    `, propertyId ? [propertyId] : []);
    return rows[0] || {
      TOTAL_COUNT: 0,
      HELD_AMOUNT: 0,
      REFUNDED_AMOUNT: 0,
      TOTAL_AMOUNT: 0
    };
  }
}

module.exports = DepositsModel;
