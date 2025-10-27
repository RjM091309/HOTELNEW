const { queryDatabasePromise, pool } = require('../config/database');

const paymentsModel = {
  listPayments: async (filters = {}, limit = 200) => {
    const { bookingId, type, method, from, to } = filters;
    const clauses = [];
    const params = [];
    if (bookingId) { clauses.push('p.BOOKING_ID = ?'); params.push(bookingId); }
    if (type) { clauses.push('p.PAYMENT_TYPE = ?'); params.push(type); }
    if (method) { clauses.push('p.PAYMENT_METHOD = ?'); params.push(method); }
    if (from) { clauses.push('DATE(p.PAYMENT_DATE) >= DATE(?)'); params.push(from); }
    if (to) { clauses.push('DATE(p.PAYMENT_DATE) <= DATE(?)'); params.push(to); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT 
        p.IDNo,
        p.BOOKING_ID,
        p.BILLING_ID,
        p.BOOKING_EXTENSION_ID,
        p.BOOKING_SERVICE_ID,
        p.BOOKING_PICKDROP_ID,
        p.AMOUNT_PAID,
        p.PAYMENT_METHOD,
        p.PAYMENT_TYPE,
        p.PAYMENT_DATE,
        p.ENCODED_BY,
        p.REMARKS,
        b.CONFIRMATION_NUMBER,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        u.FULLNAME AS NAME
      FROM payments p
      LEFT JOIN booking b ON b.IDNo = p.BOOKING_ID
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
      ${whereSql}
      ORDER BY p.PAYMENT_DATE DESC
      LIMIT ?`;
    params.push(Number(limit));
    const [rows] = await pool.promise().query(sql, params);
    return rows;
  },

  countDatatable: async (searchCondition, searchParams) => {
    const countQuery = `
      SELECT COUNT(*) as total
      FROM booking b
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
      WHERE b.ACTIVE = 1 ${searchCondition}
    `;
    const [countResult] = await pool.promise().query(countQuery, searchParams);
    return countResult[0].total;
  },

  fetchDatatable: async (searchCondition, searchParams, orderBy, orderDir, length, start) => {
    const dataQuery = `
      SELECT 
        b.IDNo AS BOOKING_ID,
        b.CONFIRMATION_NUMBER,
        c.NAME AS GUEST_NAME,
        r.ROOM_NUMBER,
        bill.PAYMENT_STATUS,
        bill.PAYMENT_METHOD,
        (
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
          COALESCE(bill.AMENITIES_CHARGE, 0) +
          COALESCE(bill.SERVICES_CHARGE, 0) +
          COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
          COALESCE(bill.CANCELLATION_PENALTY, 0) +
          COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
          COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
        ) AS TOTAL_AMOUNT,
        COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) AS TOTAL_PAID,
        (
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
          COALESCE(bill.AMENITIES_CHARGE, 0) +
          COALESCE(bill.SERVICES_CHARGE, 0) +
          COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
          COALESCE(bill.CANCELLATION_PENALTY, 0) +
          COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
          COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
        ) - COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) - COALESCE(bill.DISCOUNT_AMOUNT, 0) AS BALANCE,
        b.ENCODED_DT AS BOOKING_DATE
      FROM booking b
      LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
      LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
      WHERE b.ACTIVE = 1 ${searchCondition}
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...searchParams, parseInt(length), parseInt(start)];
    const [rows] = await pool.promise().query(dataQuery, dataParams);
    return rows;
  },

  salesSummary: async (todayStr, weekStartStr, monthStartStr) => {
    const sumExpr = `COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
      COALESCE(bill.AMENITIES_CHARGE, 0) +
      COALESCE(bill.SERVICES_CHARGE, 0) +
      COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
      COALESCE(bill.CANCELLATION_PENALTY, 0) +
      COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
      COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)`;

    const paidExpr = `(SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount')`;

    const [daily] = await pool.promise().query(
      `SELECT SUM(${sumExpr}) AS dailyTotal, SUM(COALESCE(${paidExpr}, 0)) AS dailyPaid
       FROM booking b LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
       WHERE DATE(b.ENCODED_DT) = ? AND b.ACTIVE = 1`, [todayStr]);

    const [weekly] = await pool.promise().query(
      `SELECT SUM(${sumExpr}) AS weeklyTotal, SUM(COALESCE(${paidExpr}, 0)) AS weeklyPaid
       FROM booking b LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
       WHERE DATE(b.ENCODED_DT) >= ? AND b.ACTIVE = 1`, [weekStartStr]);

    const [monthly] = await pool.promise().query(
      `SELECT SUM(${sumExpr}) AS monthlyTotal, SUM(COALESCE(${paidExpr}, 0)) AS monthlyPaid
       FROM booking b LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
       WHERE DATE(b.ENCODED_DT) >= ? AND b.ACTIVE = 1`, [monthStartStr]);

    return {
      daily: daily[0] || {},
      weekly: weekly[0] || {},
      monthly: monthly[0] || {}
    };
  },

  bookingBreakdown: async (bookingId) => {
    const [rows] = await pool.promise().query(
      `SELECT 
         b.IDNo AS BOOKING_ID,
         b.CONFIRMATION_NUMBER,
         c.NAME AS GUEST_NAME,
         r.ROOM_NUMBER,
         rt.NAME AS ROOM_TYPE,
         bill.ROOM_CHARGE,
         bill.QTY,
         bill.AMENITIES_CHARGE,
         bill.SERVICES_CHARGE,
         bill.LATE_CHECKOUT_CHARGE,
         bill.CANCELLATION_PENALTY,
         bill.RESERVATION_FEE,
         bill.DISCOUNT_AMOUNT,
         bill.PAYMENT_STATUS AS ROOM_PAYMENT_STATUS,
         bill.IDNo AS BILLING_ID,
         COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS ROOM_TOTAL,
         COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) AS SERVICES_TOTAL,
         COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0) AS EXTENSIONS_TOTAL,
         (
           COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
           COALESCE(bill.AMENITIES_CHARGE, 0) +
           COALESCE(bill.SERVICES_CHARGE, 0) +
           COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
           COALESCE(bill.CANCELLATION_PENALTY, 0) +
           COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
           COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
         ) AS TOTAL_AMOUNT,
         COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) AS TOTAL_PAID,
         (
           COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
           COALESCE(bill.AMENITIES_CHARGE, 0) +
           COALESCE(bill.SERVICES_CHARGE, 0) +
           COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
           COALESCE(bill.CANCELLATION_PENALTY, 0) +
           COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
           COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
         ) - COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) - COALESCE(bill.DISCOUNT_AMOUNT, 0) AS BALANCE
       FROM booking b
       LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
       LEFT JOIN room r ON r.IDNo = b.ROOM_ID
       LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
       LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
       WHERE b.IDNo = ? AND b.ACTIVE = 1`,
      [bookingId]
    );

    const booking = rows[0];
    if (!booking) return null;

    const [services] = await pool.promise().query(
      `SELECT s.SERVICE_NAME, bs.QTY, bs.TOTAL_COST, bs.STATUS, bs.ACTIVE, bs.EDITED_DT, bs.EDITED_BY, bs.REMARKS, bs.IDNo AS BOOKING_SERVICE_ID, u.FULLNAME AS EDITED_BY_NAME
       FROM booking_service bs
       JOIN services s ON bs.SERVICE_ID = s.IDNo
       LEFT JOIN user_info u ON u.IDNo = bs.EDITED_BY
       WHERE bs.BOOKING_ID = ?`, [bookingId]
    );

    const [extensions] = await pool.promise().query(
      `SELECT be.EXTEND_DATE, be.QTY, be.COST, be.PAYMENT_STATUS, be.ACTIVE, be.EDITED_DT, be.EDITED_BY, be.REMARKS, u.FULLNAME AS EDITED_BY_NAME
       FROM booking_extension be
       LEFT JOIN user_info u ON u.IDNo = be.EDITED_BY
       WHERE be.BOOKING_ID = ?`, [bookingId]
    );

    const [payments] = await pool.promise().query(
      `SELECT p.AMOUNT_PAID, p.PAYMENT_METHOD, p.PAYMENT_TYPE, p.PAYMENT_DATE, p.REMARKS, p.BILLING_ID, p.BOOKING_SERVICE_ID, u.FULLNAME AS NAME
       FROM payments p
       LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
       WHERE p.BOOKING_ID = ?
       ORDER BY p.PAYMENT_DATE DESC`, [bookingId]
    );

    return { booking, services, extensions, payments };
  }
};

module.exports = paymentsModel;


