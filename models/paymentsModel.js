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
          COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
          COALESCE(bill.CANCELLATION_PENALTY, 0) +
          COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
          COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
        ) AS TOTAL_AMOUNT,
        COALESCE(bill.DISCOUNT_AMOUNT, 0) AS DISCOUNT_AMOUNT,
        COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) AS TOTAL_PAID,
        (
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
          COALESCE(bill.AMENITIES_CHARGE, 0) +
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
           COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
           COALESCE(bill.CANCELLATION_PENALTY, 0) +
           COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
           COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
         ) AS TOTAL_AMOUNT,
         COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) AS TOTAL_PAID,
         (
           COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
           COALESCE(bill.AMENITIES_CHARGE, 0) +
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
      `SELECT 
         CASE 
           WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
           THEN bs.CUSTOM_NAME
           ELSE s.SERVICE_NAME
         END as SERVICE_NAME,
         bs.QTY, 
         bs.TOTAL_COST, 
         bs.STATUS, 
         bs.ACTIVE, 
         bs.EDITED_DT, 
         bs.EDITED_BY, 
         bs.REMARKS, 
         bs.IDNo AS BOOKING_SERVICE_ID, 
         u.FULLNAME AS EDITED_BY_NAME
       FROM booking_service bs
       LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
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
  },

  // Get group booking breakdown - for all bookings in a group
  groupBookingBreakdown: async (bookingId) => {
    // First, get the group_id from the booking
    const [groupInfo] = await pool.promise().query(
      `SELECT GROUP_BOOKING_ID FROM booking WHERE IDNo = ? AND ACTIVE = 1`,
      [bookingId]
    );

    const groupId = groupInfo[0]?.GROUP_BOOKING_ID;

    if (!groupId) {
      // Not a group booking, return null
      return null;
    }

    // Get all bookings in the group
    const [allBookings] = await pool.promise().query(
      `SELECT IDNo AS BOOKING_ID FROM booking WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1 ORDER BY IDNo`,
      [groupId]
    );

    const bookingIds = allBookings.map(b => b.BOOKING_ID);

    // Get group booking details
    const [groupDetails] = await pool.promise().query(
      `SELECT 
        gb.IDNo AS GROUP_ID,
        gb.GROUP_NAME,
        gb.GROUP_DISCOUNT,
        gb.GROUP_RESERVATION_FEE
      FROM group_booking gb
      WHERE gb.IDNo = ?`,
      [groupId]
    );

    const groupInfoRow = groupDetails[0];

    // Get breakdown for all bookings in the group
    const [rows] = await pool.promise().query(
      `SELECT 
         b.IDNo AS BOOKING_ID,
         b.GROUP_BOOKING_ID,
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
           COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) +
           COALESCE(bill.CANCELLATION_PENALTY, 0) +
           COALESCE((SELECT SUM(bs.TOTAL_COST) FROM booking_service bs WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1), 0) +
           COALESCE((SELECT SUM(be.COST) FROM booking_extension be WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1), 0)
         ) AS TOTAL_AMOUNT,
         COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = b.IDNo AND p.PAYMENT_TYPE != 'discount'), 0) AS TOTAL_PAID,
         (
           COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) +
           COALESCE(bill.AMENITIES_CHARGE, 0) +
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
       WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
       ORDER BY r.ROOM_NUMBER, b.IDNo`,
      [groupId]
    );

    // Get all services for all bookings in the group
    const [services] = await pool.promise().query(
      `SELECT s.SERVICE_NAME, bs.QTY, bs.TOTAL_COST, bs.STATUS, bs.ACTIVE, bs.EDITED_DT, bs.EDITED_BY, bs.REMARKS, bs.IDNo AS BOOKING_SERVICE_ID, bs.BOOKING_ID, u.FULLNAME AS EDITED_BY_NAME, r.ROOM_NUMBER
       FROM booking_service bs
       JOIN booking b ON bs.BOOKING_ID = b.IDNo
       JOIN services s ON bs.SERVICE_ID = s.IDNo
       LEFT JOIN user_info u ON u.IDNo = bs.EDITED_BY
       LEFT JOIN room r ON b.ROOM_ID = r.IDNo
       WHERE b.GROUP_BOOKING_ID = ? AND bs.ACTIVE = 1
       ORDER BY r.ROOM_NUMBER, b.IDNo, bs.IDNo`, [groupId]
    );

    // Get all extensions for all bookings in the group
    const [extensions] = await pool.promise().query(
      `SELECT be.EXTEND_DATE, be.QTY, be.COST, be.PAYMENT_STATUS, be.ACTIVE, be.EDITED_DT, be.EDITED_BY, be.REMARKS, u.FULLNAME AS EDITED_BY_NAME, b.IDNo AS BOOKING_ID, r.ROOM_NUMBER
       FROM booking_extension be
       JOIN booking b ON be.BOOKING_ID = b.IDNo
       LEFT JOIN user_info u ON u.IDNo = be.EDITED_BY
       LEFT JOIN room r ON b.ROOM_ID = r.IDNo
       WHERE b.GROUP_BOOKING_ID = ?
       ORDER BY r.ROOM_NUMBER, b.IDNo, be.IDNo`, [groupId]
    );

    // Get all payments for all bookings in the group
    const [payments] = await pool.promise().query(
      `SELECT p.AMOUNT_PAID, p.PAYMENT_METHOD, p.PAYMENT_TYPE, p.PAYMENT_DATE, p.REMARKS, p.BILLING_ID, p.BOOKING_SERVICE_ID, p.BOOKING_ID, u.FULLNAME AS NAME, r.ROOM_NUMBER
       FROM payments p
       JOIN booking b ON p.BOOKING_ID = b.IDNo
       LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
       LEFT JOIN room r ON b.ROOM_ID = r.IDNo
       WHERE b.GROUP_BOOKING_ID = ?
       ORDER BY p.PAYMENT_DATE DESC`, [groupId]
    );

    return { 
      isGroup: true,
      groupId: groupInfoRow?.GROUP_ID,
      groupName: groupInfoRow?.GROUP_NAME,
      groupDiscount: groupInfoRow?.GROUP_DISCOUNT || 0,
      groupReservationFee: groupInfoRow?.GROUP_RESERVATION_FEE || 0,
      bookings: rows,
      services,
      extensions,
      payments
    };
  }
};

module.exports = paymentsModel;


