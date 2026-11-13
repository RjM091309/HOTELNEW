const { pool } = require('../config/database');

// Master Billing (one bill per group): credit left on ANY room of the group belongs to the group's MAIN booking, so the
// Credit page lists ONE line per group and day (the main's), not one per room / per service. The payment rows themselves stay
// on their own booking (they carry the item they paid for), they are only grouped here.
const EVAL_JOINS = `
  LEFT JOIN booking pb ON pb.IDNo = p.BOOKING_ID
  LEFT JOIN group_booking pgb ON pgb.IDNo = pb.GROUP_BOOKING_ID AND pgb.BILLING_TYPE = 1
  LEFT JOIN (SELECT GROUP_BOOKING_ID, MIN(IDNo) AS MAIN_ID FROM booking WHERE ACTIVE = 1 GROUP BY GROUP_BOOKING_ID) pgm ON pgm.GROUP_BOOKING_ID = pgb.IDNo`;
const EVAL_ID = 'COALESCE(pgm.MAIN_ID, p.BOOKING_ID)';

const creditModel = {
  countDatatable: async (searchCondition, searchParams, propertyId = null) => {
    const countQuery = `
      SELECT COUNT(*) as total FROM (
        SELECT 1
        FROM payments p
        ${EVAL_JOINS}
        LEFT JOIN booking b ON b.IDNo = ${EVAL_ID}
        LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
        LEFT JOIN room r ON r.IDNo = b.ROOM_ID
        LEFT JOIN agency a ON a.IDNo = b.AGENCY_ID
        WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
        ${propertyId ? 'AND b.PROPERTY_ID = ?' : ''}
        ${searchCondition}
        GROUP BY ${EVAL_ID}, DATE(p.PAYMENT_DATE)
      ) grouped
    `;
    const [countResult] = await pool.promise().query(countQuery, propertyId ? [propertyId, ...searchParams] : searchParams);
    return countResult[0].total;
  },

  // Rows are grouped by BOOKING_ID + calendar date so multiple credit/marker
  // entries for the same booking on the same day collapse into one line;
  // the individual entries are fetched separately for the breakdown modal.
  fetchDatatable: async (searchCondition, searchParams, orderBy, orderDir, length, start, propertyId = null) => {
    const dataQuery = `
      SELECT
        CONCAT(${EVAL_ID}, '_', DATE(p.PAYMENT_DATE)) AS GROUP_KEY,
        ${EVAL_ID} AS BOOKING_ID,
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
      ${EVAL_JOINS}
      LEFT JOIN booking b ON b.IDNo = ${EVAL_ID}
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN agency a ON a.IDNo = b.AGENCY_ID
      WHERE p.PAYMENT_METHOD IN ('credit', 'marker')
      ${propertyId ? 'AND b.PROPERTY_ID = ?' : ''}
      ${searchCondition}
      GROUP BY ${EVAL_ID}, DATE(p.PAYMENT_DATE)
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...(propertyId ? [propertyId] : []), ...searchParams, parseInt(length), parseInt(start)];
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
        CONCAT(COALESCE(
          bs.CUSTOM_NAME,
          svc.SERVICE_NAME,
          CASE WHEN bp.TYPE = 'pick-up' THEN 'Pick-up' WHEN bp.TYPE = 'drop-off' THEN 'Drop-off' END,
          CASE WHEN p.BILLING_ID IS NOT NULL THEN 'Room' END,
          CASE WHEN p.BOOKING_EXTENSION_ID IS NOT NULL THEN 'Room Extension' END,
          CASE WHEN p.PAYMENT_TYPE = 'cancellation_fee' THEN 'Penalty' END,
          'Payment'
        ), IF(p.BOOKING_ID <> ${EVAL_ID}, CONCAT(' · Room ', mr.ROOM_NUMBER), '')) AS PAYMENT_FOR
      FROM payments p
      ${EVAL_JOINS}
      LEFT JOIN room mr ON mr.IDNo = pb.ROOM_ID
      LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
      LEFT JOIN user_info su ON su.IDNo = p.SETTLED_BY
      LEFT JOIN booking_service bs ON bs.IDNo = p.BOOKING_SERVICE_ID
      LEFT JOIN services svc ON svc.IDNo = bs.SERVICE_ID
      LEFT JOIN booking_pick_drop bp ON bp.IDNo = p.BOOKING_PICKDROP_ID
      WHERE ${EVAL_ID} = ? AND DATE(p.PAYMENT_DATE) = ? AND p.PAYMENT_METHOD IN ('credit', 'marker')
      ORDER BY p.PAYMENT_DATE ASC`,
      [bookingId, date]
    );
    return rows;
  },

  totalOutstandingCredit: async (propertyId = null) => {
    const [rows] = await pool.promise().query(
      `SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS total FROM payments p
       ${propertyId ? 'INNER JOIN booking b ON b.IDNo = p.BOOKING_ID' : ''}
       WHERE p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL
       ${propertyId ? 'AND b.PROPERTY_ID = ?' : ''}`,
      propertyId ? [propertyId] : []
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
      `UPDATE payments p ${EVAL_JOINS}
       SET p.SETTLED_DATE = NOW(), p.SETTLED_BY = ?
       WHERE ${EVAL_ID} = ? AND DATE(p.PAYMENT_DATE) = ? AND p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL`,
      [settledBy, bookingId, date]
    );
    return result.affectedRows;
  },

  // The guest pays (all or part of) the credit that was left at check-out - the whole group's credit when it is a one-bill
  // group. The money is received NOW, so it must count today, in today's shift and under the real payment method (not as
  // "credit settled" back on the day of check-out). So the credit entries are turned into real payments, oldest first:
  //  - an entry that is paid in full becomes a payment (method, date, cashier changed; the bill item it paid for is kept);
  //  - an entry that is only partly paid is split: the paid part becomes the payment, the rest stays as credit.
  // Returns { paid, creditLeft }.
  payCredit: async (evalBookingId, amount, method, notes, userId, paymentIds = null) => {
    const conn = await pool.promise().getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `SELECT p.IDNo, p.BOOKING_ID, p.BILLING_ID, p.BOOKING_EXTENSION_ID, p.BOOKING_SERVICE_ID, p.BOOKING_PICKDROP_ID,
                p.AMOUNT_PAID, p.PAYMENT_TYPE, p.REMARKS
           FROM payments p ${EVAL_JOINS}
          WHERE ${EVAL_ID} = ? AND p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL AND p.AMOUNT_PAID > 0
          ${Array.isArray(paymentIds) && paymentIds.length ? 'AND p.IDNo IN (?)' : ''}
          ORDER BY p.IDNo
          FOR UPDATE`,
        Array.isArray(paymentIds) && paymentIds.length ? [evalBookingId, paymentIds] : [evalBookingId]
      );
      const owed = rows.reduce((t, r) => t + (parseFloat(r.AMOUNT_PAID) || 0), 0);
      let left = Math.round(Math.min(parseFloat(amount) || 0, owed) * 100) / 100;
      if (left <= 0) { await conn.rollback(); return { paid: 0, creditLeft: owed }; }
      const paid = left;
      const tag = `Credit paid (${method})${notes ? ': ' + notes : ''}.`;
      for (const r of rows) {
        if (left <= 0.004) break;
        const amt = parseFloat(r.AMOUNT_PAID) || 0;
        const remarks = (tag + (r.REMARKS ? ' ' + r.REMARKS : '')).slice(0, 500);
        if (left >= amt - 0.004) {
          await conn.query(
            `UPDATE payments SET PAYMENT_METHOD = ?, PAYMENT_DATE = NOW(), ENCODED_BY = ?, SETTLED_DATE = NULL, SETTLED_BY = NULL, REMARKS = ? WHERE IDNo = ?`,
            [method, userId, remarks, r.IDNo]
          );
          left = Math.round((left - amt) * 100) / 100;
        } else {
          await conn.query(`UPDATE payments SET AMOUNT_PAID = AMOUNT_PAID - ? WHERE IDNo = ?`, [left, r.IDNo]);
          await conn.query(
            `INSERT INTO payments (BOOKING_ID, BILLING_ID, BOOKING_EXTENSION_ID, BOOKING_SERVICE_ID, BOOKING_PICKDROP_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_DATE, PAYMENT_TYPE, REMARKS, ENCODED_BY)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
            [r.BOOKING_ID, r.BILLING_ID, r.BOOKING_EXTENSION_ID, r.BOOKING_SERVICE_ID, r.BOOKING_PICKDROP_ID, left, method, r.PAYMENT_TYPE, remarks, userId]
          );
          left = 0;
        }
      }
      await conn.commit();
      return { paid, creditLeft: Math.round((owed - paid) * 100) / 100 };
    } catch (err) {
      try { await conn.rollback(); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }
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
