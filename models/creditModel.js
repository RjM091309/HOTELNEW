const { pool } = require('../config/database');

const creditModel = {
  countDatatable: async (searchCondition, searchParams) => {
    const countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      LEFT JOIN booking b ON b.IDNo = p.BOOKING_ID
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
      ${searchCondition}
    `;
    const [countResult] = await pool.promise().query(countQuery, searchParams);
    return countResult[0].total;
  },

  fetchDatatable: async (searchCondition, searchParams, orderBy, orderDir, length, start) => {
    const dataQuery = `
      SELECT
        p.IDNo AS PAYMENT_ID,
        p.BOOKING_ID,
        p.AMOUNT_PAID,
        p.PAYMENT_METHOD,
        p.PAYMENT_TYPE,
        p.PAYMENT_DATE,
        p.REMARKS,
        p.SETTLED_DATE,
        b.CONFIRMATION_NUMBER,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        u.FULLNAME AS PROCESSED_BY_NAME,
        su.FULLNAME AS SETTLED_BY_NAME
      FROM payments p
      LEFT JOIN booking b ON b.IDNo = p.BOOKING_ID
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
      LEFT JOIN user_info su ON su.IDNo = p.SETTLED_BY
      WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
      ${searchCondition}
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...searchParams, parseInt(length), parseInt(start)];
    const [rows] = await pool.promise().query(dataQuery, dataParams);
    return rows;
  },

  totalOutstandingCredit: async () => {
    const [rows] = await pool.promise().query(
      `SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS total FROM payments p WHERE p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL`
    );
    return rows[0].total || 0;
  },

  markSettled: async (paymentId, settledBy) => {
    const [result] = await pool.promise().query(
      `UPDATE payments SET SETTLED_DATE = NOW(), SETTLED_BY = ? WHERE IDNo = ? AND PAYMENT_METHOD IN ('credit', 'marker') AND SETTLED_DATE IS NULL`,
      [settledBy, paymentId]
    );
    return result.affectedRows > 0;
  }
};

module.exports = creditModel;
