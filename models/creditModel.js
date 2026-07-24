const { pool } = require('../config/database');

const creditModel = {
  countDatatable: async (searchCondition, searchParams) => {
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT 1
        FROM payments p
        LEFT JOIN booking b ON b.IDNo = p.BOOKING_ID
        LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        LEFT JOIN room r ON r.IDNo = b.ROOM_ID
        WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
        ${searchCondition}
        GROUP BY p.BOOKING_ID, DATE(p.PAYMENT_DATE)
      ) grouped
    `;
    const [countResult] = await pool.promise().query(countQuery, searchParams);
    return countResult[0].total;
  },

  // Rows are grouped by BOOKING_ID + calendar date so multiple credit/marker
  // entries for the same booking on the same day collapse into one line;
  // the individual entries are fetched separately for the breakdown modal.
  fetchDatatable: async (searchCondition, searchParams, orderBy, orderDir, length, start) => {
    const dataQuery = `
      SELECT
        CONCAT(p.BOOKING_ID, '_', DATE(p.PAYMENT_DATE)) AS GROUP_KEY,
        p.BOOKING_ID,
        DATE_FORMAT(p.PAYMENT_DATE, '%Y-%m-%d') AS PAYMENT_DATE,
        MIN(p.PAYMENT_DATE) AS FIRST_PAYMENT_DATE,
        SUM(p.AMOUNT_PAID) AS AMOUNT_PAID,
        COUNT(*) AS ENTRY_COUNT,
        SUM(CASE WHEN p.SETTLED_DATE IS NULL THEN 1 ELSE 0 END) AS UNSETTLED_COUNT,
        b.CONFIRMATION_NUMBER,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        a.NAME AS AGENCY_NAME
      FROM payments p
      LEFT JOIN booking b ON b.IDNo = p.BOOKING_ID
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN agency a ON a.IDNo = b.AGENCY_ID
      WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
      ${searchCondition}
      GROUP BY p.BOOKING_ID, DATE(p.PAYMENT_DATE)
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...searchParams, parseInt(length), parseInt(start)];
    const [rows] = await pool.promise().query(dataQuery, dataParams);
    return rows;
  },

  // Individual credit/marker payments for one booking+date group, used by the breakdown modal.
  // PAYMENT_FOR resolves what the amount was actually charged for (room bill, a specific
  // availed service, an extension, or a pick-up/drop-off) via the payment's line-item FK.
  fetchBreakdown: async (bookingId, date) => {
    const [rows] = await pool.promise().query(
      `SELECT
        p.IDNo AS PAYMENT_ID,
        p.AMOUNT_PAID,
        p.PAYMENT_METHOD,
        p.PAYMENT_TYPE,
        p.PAYMENT_DATE,
        p.REMARKS,
        p.SETTLED_DATE,
        u.FULLNAME AS PROCESSED_BY_NAME,
        su.FULLNAME AS SETTLED_BY_NAME,
        COALESCE(
          bs.CUSTOM_NAME,
          svc.SERVICE_NAME,
          CASE WHEN bp.TYPE = 'pick-up' THEN 'Pick-up' WHEN bp.TYPE = 'drop-off' THEN 'Drop-off' END,
          CASE WHEN p.BILLING_ID IS NOT NULL THEN 'Room' END,
          CASE WHEN p.BOOKING_EXTENSION_ID IS NOT NULL THEN 'Room Extension' END
        ) AS PAYMENT_FOR
      FROM payments p
      LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
      LEFT JOIN user_info su ON su.IDNo = p.SETTLED_BY
      LEFT JOIN booking_service bs ON bs.IDNo = p.BOOKING_SERVICE_ID
      LEFT JOIN services svc ON svc.IDNo = bs.SERVICE_ID
      LEFT JOIN booking_pick_drop bp ON bp.IDNo = p.BOOKING_PICKDROP_ID
      WHERE p.BOOKING_ID = ? AND DATE(p.PAYMENT_DATE) = ? AND p.PAYMENT_METHOD IN ('credit', 'marker')
      ORDER BY p.PAYMENT_DATE ASC`,
      [bookingId, date]
    );
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
  },

  // Settles every outstanding credit/marker entry for one booking+date group at once.
  markSettledGroup: async (bookingId, date, settledBy) => {
    const [result] = await pool.promise().query(
      `UPDATE payments SET SETTLED_DATE = NOW(), SETTLED_BY = ?
       WHERE BOOKING_ID = ? AND DATE(PAYMENT_DATE) = ? AND PAYMENT_METHOD IN ('credit', 'marker') AND SETTLED_DATE IS NULL`,
      [settledBy, bookingId, date]
    );
    return result.affectedRows;
  },

  // Settles only the specific payment entries the user picked via checkboxes.
  markSettledMany: async (paymentIds, settledBy) => {
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) return 0;
    const [result] = await pool.promise().query(
      `UPDATE payments SET SETTLED_DATE = NOW(), SETTLED_BY = ?
       WHERE IDNo IN (?) AND PAYMENT_METHOD IN ('credit', 'marker') AND SETTLED_DATE IS NULL`,
      [settledBy, paymentIds]
    );
    return result.affectedRows;
  }
};

module.exports = creditModel;
