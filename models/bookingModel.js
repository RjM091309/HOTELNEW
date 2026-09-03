const { queryDatabasePromise, pool } = require('../config/database');
const CalendarModel = require('./calendarModel');

class BookingModel {

    // Get enhanced booking data for DataTables (matching Hotel_Old structure)
    static async getBookingDataEnhanced(params) {
      try {
        const {
          start,
          length,
          orderByColumn,
          orderDirection,
          dateCondition,
          channelCondition,
          groupCondition,
          searchCondition = '',
          searchParams = [],
          useIndividualCalculation = false // Flag to use individual calculation for group bookings
        } = params;

        const countJoins = `
            LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
            LEFT JOIN agency   a ON b.AGENCY_ID   = a.IDNo
            LEFT JOIN room     r ON b.ROOM_ID      = r.IDNo
            LEFT JOIN billing  bill ON bill.BOOKING_ID = b.IDNo
            LEFT JOIN user_info u  ON b.ENCODED_BY  = u.IDNo
            LEFT JOIN user_info u2 ON b.EDITED_BY  = u2.IDNo`;

        const baseWhere = `
          WHERE b.ACTIVE = 1
            ${groupCondition || ''}
            ${dateCondition}
            ${channelCondition}`;

        // ---- COUNT QUERY (total without search) ----
        const countQuery = `
          SELECT COUNT(*) AS total
          FROM booking b
            ${countJoins}
          ${baseWhere};
        `;

        const filteredCountQuery = `
          SELECT COUNT(*) AS total
          FROM booking b
            ${countJoins}
          ${baseWhere}
            ${searchCondition};
        `;
  
        // ---- MAIN DATA QUERY ----
        const dataQuery = `
          SELECT 
            b.IDNo           AS BookingID,
            b.GROUP_BOOKING_ID,
            b.CUSTOMER_ID,
            c.NAME,
            COALESCE(a.NAME, 'N/A') AS AGENCY_NAME,
            b.ROOM_ID,
            r.ROOM_NUMBER,
            IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE,
            rt.NAME         AS ROOM_TYPE,
            b.CHECK_IN_DATE,
            b.CHECK_OUT_DATE,
            DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS,
            b.BOOKING_STATUS AS BookingStatus,
            b.GUESTS_COUNT,
            b.REMARKS       AS BookingRemarks,
            b.CONFIRMATION_NUMBER,
            b.BOOKING_CHANNEL,
            b.AGENCY_PAYER,
            b.IS_DIRECT_RESERVATION,
            (SELECT COUNT(*) FROM remarks rm WHERE rm.BOOKING_ID = b.IDNo AND rm.ACTIVE = 1) AS RemarksCount,
            bill.QTY,
            b.IS_CANCELLED,
            ${useIndividualCalculation ? `
            -- Use individual calculation for all bookings (including group bookings shown individually)
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
              + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
              + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
              + COALESCE(bill.CANCELLATION_PENALTY, 0)
              - COALESCE(bill.RESERVATION_FEE, 0)
              - COALESCE(bill.DISCOUNT_AMOUNT, 0)
            ` : `
            CASE 
              WHEN b.GROUP_BOOKING_ID IS NOT NULL THEN
                -- For group bookings, check if it's master billing
                CASE 
                  WHEN (SELECT gb.BILLING_TYPE FROM group_booking gb WHERE gb.IDNo = b.GROUP_BOOKING_ID) = 1 THEN
                    -- Master Billing: Only main booking (minimum IDNo) shows group total, others show 0
                    CASE 
                      WHEN b.IDNo = (SELECT MIN(b2.IDNo) FROM booking b2 WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1) THEN
                        -- Main booking: show group total
                        (
                          SELECT 
                            COALESCE(SUM(
                              (bill2.ROOM_CHARGE * (CASE WHEN COALESCE(bill2.CHECKOUT_REFUND,0) > 0 THEN bill2.QTY ELSE COALESCE(bill2.ORIGINAL_QTY, bill2.QTY) END)) + 
                              COALESCE((
                                SELECT SUM(bs.TOTAL_COST) 
                                FROM booking_service bs 
                                WHERE bs.BOOKING_ID = b2.IDNo AND bs.ACTIVE = 1
                              ), 0) +
                              COALESCE((
                                SELECT SUM(be.COST * be.QTY) 
                                FROM booking_extension be 
                                WHERE be.BOOKING_ID = b2.IDNo AND be.ACTIVE = 1
                              ), 0) +
                              COALESCE(bill2.CANCELLATION_PENALTY, 0)
                            ), 0)
                            - COALESCE(gb.GROUP_DISCOUNT, 0)
                            - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                          FROM booking b2
                          LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                          LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                          WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                        )
                      ELSE
                        -- Other bookings in master billing: show 0
                        0
                    END
                  ELSE
                    -- Individual Billing: All bookings show group total (existing behavior)
                    (
                      SELECT 
                        COALESCE(SUM(
                          (bill2.ROOM_CHARGE * (CASE WHEN COALESCE(bill2.CHECKOUT_REFUND,0) > 0 THEN bill2.QTY ELSE COALESCE(bill2.ORIGINAL_QTY, bill2.QTY) END)) + 
                          COALESCE((
                            SELECT SUM(bs.TOTAL_COST) 
                            FROM booking_service bs 
                            WHERE bs.BOOKING_ID = b2.IDNo AND bs.ACTIVE = 1
                          ), 0) +
                          COALESCE((
                            SELECT SUM(be.COST * be.QTY) 
                            FROM booking_extension be 
                            WHERE be.BOOKING_ID = b2.IDNo AND be.ACTIVE = 1
                          ), 0) +
                          COALESCE(bill2.CANCELLATION_PENALTY, 0)
                        ), 0)
                        - COALESCE(gb.GROUP_DISCOUNT, 0)
                        - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                      FROM booking b2
                      LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                      LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                      WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                    )
                END
              ELSE
                -- For individual bookings, use individual calculation
                COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
                  + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
                  + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
                  + COALESCE(bill.CANCELLATION_PENALTY, 0)
                  - COALESCE(bill.RESERVATION_FEE, 0)
                  - COALESCE(bill.DISCOUNT_AMOUNT, 0)
            END
            `} AS TOTAL_COST,
            CASE
              WHEN bill.PAYMENT_STATUS = 'cancelled' THEN 'cancelled'
              WHEN bill.PAYMENT_STATUS = 'paid'
                AND COALESCE(services_unpaid_count.TOTAL_UNPAID_SERVICES, 0) = 0
                AND COALESCE(extensions_unpaid_count.TOTAL_UNPAID_EXTENSIONS, 0) = 0
              THEN 'paid'
              ELSE 'unpaid'
            END AS PAYMENT_STATUS,
            bill.PAYMENT_METHOD AS PAYMENT_METHOD,
            EXISTS (
              SELECT 1 FROM payments p_credit
              WHERE p_credit.BOOKING_ID = b.IDNo
                AND p_credit.PAYMENT_METHOD IN ('credit', 'marker')
                AND p_credit.SETTLED_DATE IS NULL
            ) AS HAS_UNSETTLED_CREDIT,
            ${useIndividualCalculation ? `
            -- Use individual balance calculation for all bookings (including group bookings shown individually)
            ROUND(GREATEST(0, 
              COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
              + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
              + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
              + COALESCE(bill.CANCELLATION_PENALTY, 0)
              - COALESCE(bill.RESERVATION_FEE, 0)
              - COALESCE(bill.DISCOUNT_AMOUNT, 0)
              - COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0)
            ), 2)
            ` : `
            CASE 
              WHEN b.GROUP_BOOKING_ID IS NOT NULL THEN
                -- For group bookings, check if it's master billing
                CASE 
                  WHEN (SELECT gb.BILLING_TYPE FROM group_booking gb WHERE gb.IDNo = b.GROUP_BOOKING_ID) = 1 THEN
                    -- Master Billing: Only main booking (minimum IDNo) shows group balance, others show 0
                    CASE 
                      WHEN b.IDNo = (SELECT MIN(b2.IDNo) FROM booking b2 WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1) THEN
                        -- Main booking: show group balance
                        GREATEST(0,
                          (
                            -- Group Grand Total
                            SELECT 
                            COALESCE(SUM(
                                (bill2.ROOM_CHARGE * (CASE WHEN COALESCE(bill2.CHECKOUT_REFUND,0) > 0 THEN bill2.QTY ELSE COALESCE(bill2.ORIGINAL_QTY, bill2.QTY) END)) + 
                                COALESCE((
                                  SELECT SUM(bs.TOTAL_COST) 
                                  FROM booking_service bs 
                                  WHERE bs.BOOKING_ID = b2.IDNo AND bs.ACTIVE = 1
                                ), 0) +
                                COALESCE((
                                  SELECT SUM(be.COST * be.QTY) 
                                  FROM booking_extension be 
                                  WHERE be.BOOKING_ID = b2.IDNo AND be.ACTIVE = 1
                                ), 0) +
                                COALESCE(bill2.CANCELLATION_PENALTY, 0)
                              ), 0)
                              - COALESCE(gb.GROUP_DISCOUNT, 0)
                              - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                            FROM booking b2
                            LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                            LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                            WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                          )
                          -
                          (
                            -- Actual payments made for the whole group (room + service + extended)
                            SELECT COALESCE(SUM(p.AMOUNT_PAID), 0)
                            FROM payments p
                            JOIN booking b3 ON p.BOOKING_ID = b3.IDNo
                            WHERE b3.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID
                              AND p.PAYMENT_TYPE IN ('room','service','extended')
                          )
                        )
                      ELSE
                        -- Other bookings in master billing: show 0
                        0
                    END
                  ELSE
                    -- Individual Billing: All bookings show group balance (existing behavior)
                    GREATEST(0,
                      (
                        -- Group Grand Total
                        SELECT 
                        COALESCE(SUM(
                            (bill2.ROOM_CHARGE * (CASE WHEN COALESCE(bill2.CHECKOUT_REFUND,0) > 0 THEN bill2.QTY ELSE COALESCE(bill2.ORIGINAL_QTY, bill2.QTY) END)) + 
                            COALESCE((
                              SELECT SUM(bs.TOTAL_COST) 
                              FROM booking_service bs 
                              WHERE bs.BOOKING_ID = b2.IDNo AND bs.ACTIVE = 1
                            ), 0) +
                            COALESCE((
                              SELECT SUM(be.COST * be.QTY) 
                              FROM booking_extension be 
                              WHERE be.BOOKING_ID = b2.IDNo AND be.ACTIVE = 1
                            ), 0) +
                            COALESCE(bill2.CANCELLATION_PENALTY, 0)
                          ), 0)
                          - COALESCE(gb.GROUP_DISCOUNT, 0)
                          - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                        FROM booking b2
                        LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                        LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                        WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                      )
                      -
                      (
                        -- Actual payments made for the whole group (room + service + extended)
                        SELECT COALESCE(SUM(p.AMOUNT_PAID), 0)
                        FROM payments p
                        JOIN booking b3 ON p.BOOKING_ID = b3.IDNo
                        WHERE b3.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID
                          AND p.PAYMENT_TYPE IN ('room','service','extended')
                      )
                    )
                END
              ELSE
                -- For individual bookings, calculate individual balance
                ROUND(GREATEST(0, 
                  COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
                  + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
                  + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
                  + COALESCE(bill.CANCELLATION_PENALTY, 0)
                  - COALESCE(bill.RESERVATION_FEE, 0)
                  - COALESCE(bill.DISCOUNT_AMOUNT, 0)
                  - COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0)
                ), 2)
            END
            `} AS BALANCE,
            -- Debug logging fields
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS DEBUG_ROOM_COST,
            COALESCE(all_services_total.TOTAL_SERVICES_COST, 0) AS DEBUG_SERVICES_COST,
            COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0) AS DEBUG_EXTENSIONS_COST,
            COALESCE(bill.RESERVATION_FEE, 0) AS DEBUG_RESERVATION_FEE,
            COALESCE(bill.DISCOUNT_AMOUNT, 0) AS DEBUG_DISCOUNT_AMOUNT,
            COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0) AS DEBUG_TOTAL_PAYMENTS_MADE,
            bill.PAYMENT_STATUS AS DEBUG_PAYMENT_STATUS,
            COALESCE(services_unpaid_total.TOTAL_SERVICES_COST, 0) AS DEBUG_UNPAID_SERVICES,
            COALESCE(extensions_unpaid_total.TOTAL_EXTENSIONS_COST, 0) AS DEBUG_UNPAID_EXTENSIONS,
            b.ENCODED_BY,
            COALESCE(u.FULLNAME, 'System') AS ENCODED_BY_NAME,
            b.EDITED_BY,
            COALESCE(u2.FULLNAME, NULL) AS EDITED_BY_NAME,
            b.IS_LONG_TERM_STAY,
            b.ROOM_CHANGE_NOTE
          FROM booking b
            LEFT JOIN customer   c   ON b.CUSTOMER_ID = c.IDNo
            LEFT JOIN agency     a   ON b.AGENCY_ID   = a.IDNo
            LEFT JOIN billing    bill ON b.IDNo       = bill.BOOKING_ID
            LEFT JOIN room       r   ON b.ROOM_ID     = r.IDNo
            LEFT JOIN room_type  rt  ON r.ROOM_TYPE_ID= rt.IDNo
            LEFT JOIN user_info  u   ON b.ENCODED_BY  = u.IDNo
            LEFT JOIN user_info  u2  ON b.EDITED_BY  = u2.IDNo
            LEFT JOIN (
              SELECT 
                bs.BOOKING_ID,
                SUM(bs.TOTAL_COST) AS TOTAL_SERVICES_COST
              FROM booking_service bs
              WHERE bs.ACTIVE = 1
              GROUP BY bs.BOOKING_ID
            ) all_services_total ON b.IDNo = all_services_total.BOOKING_ID
            LEFT JOIN (
              SELECT 
                be.BOOKING_ID,
                SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
              FROM booking_extension be 
              WHERE be.ACTIVE = 1
              GROUP BY be.BOOKING_ID
            ) all_extensions_total ON b.IDNo = all_extensions_total.BOOKING_ID
            LEFT JOIN (
              SELECT 
                bs.BOOKING_ID,
                SUM(bs.TOTAL_COST) AS TOTAL_SERVICES_COST
              FROM booking_service bs
              WHERE bs.ACTIVE = 1 AND bs.STATUS = 'unpaid'
              GROUP BY bs.BOOKING_ID
            ) services_unpaid_total ON b.IDNo = services_unpaid_total.BOOKING_ID
            LEFT JOIN (
              SELECT 
                be.BOOKING_ID,
                SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
              FROM booking_extension be
              WHERE be.PAYMENT_STATUS = 'unpaid' AND be.ACTIVE = 1
              GROUP BY be.BOOKING_ID
            ) extensions_unpaid_total ON b.IDNo = extensions_unpaid_total.BOOKING_ID
            LEFT JOIN (
              SELECT 
                bs.BOOKING_ID,
                COUNT(*) AS TOTAL_UNPAID_SERVICES
              FROM booking_service bs
              WHERE bs.ACTIVE = 1 AND bs.STATUS = 'unpaid'
              GROUP BY bs.BOOKING_ID
            ) services_unpaid_count ON b.IDNo = services_unpaid_count.BOOKING_ID
            LEFT JOIN (
              SELECT 
                be.BOOKING_ID,
                COUNT(*) AS TOTAL_UNPAID_EXTENSIONS
              FROM booking_extension be
              WHERE be.PAYMENT_STATUS = 'unpaid' AND be.ACTIVE = 1
              GROUP BY be.BOOKING_ID
            ) extensions_unpaid_count ON b.IDNo = extensions_unpaid_count.BOOKING_ID
            LEFT JOIN (
              SELECT 
                p.BOOKING_ID,
                SUM(p.AMOUNT_PAID) AS TOTAL_PAYMENTS_MADE
              FROM payments p
              WHERE p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit', 'security_deposit_refund')
              GROUP BY p.BOOKING_ID
            ) actual_payments ON b.IDNo = actual_payments.BOOKING_ID
          WHERE b.ACTIVE = 1
            ${groupCondition || ''}
            ${dateCondition}
            ${channelCondition}
            ${searchCondition}
          ORDER BY b.IDNo
          ${Number.isInteger(start) && Number.isInteger(length) ? `LIMIT ${start}, ${length}` : ''};
        `;
  
        // First get the total count
        const countResults = await queryDatabasePromise(countQuery, []);
        const totalRecords = countResults[0]?.total || 0;

        let filteredRecords = totalRecords;
        if (searchCondition) {
          const filteredCountResults = await queryDatabasePromise(filteredCountQuery, searchParams);
          filteredRecords = filteredCountResults[0]?.total || 0;
        }
  
        // Now fetch the page of data
        const rows = await queryDatabasePromise(dataQuery, searchParams);
  
        return {
          totalRecords,
          filteredRecords,
          rows
        };
  
      } catch (error) {
        console.error('Error in getBookingDataEnhanced:', error);
        throw error;
      }
    }

  static async getUpcomingCheckIns(filter = 'all') {
    try {
      const normalizedFilter = String(filter || 'all').toLowerCase();
      let daysCondition = '';

      switch (normalizedFilter) {
        case '1day':
          daysCondition = 'AND DATEDIFF(DATE(b.CHECK_IN_DATE), CURDATE()) = 1';
          break;
        case '3day':
          daysCondition = 'AND DATEDIFF(DATE(b.CHECK_IN_DATE), CURDATE()) = 3';
          break;
        case '7day':
        case 'week':
          daysCondition = 'AND DATEDIFF(DATE(b.CHECK_IN_DATE), CURDATE()) = 7';
          break;
        default:
          daysCondition = '';
          break;
      }

      const query = `
        SELECT
          b.IDNo AS BookingID,
          c.NAME AS guestName,
          c.CONTACTNo AS contactNumber,
          CASE
            WHEN b.IS_DIRECT_RESERVATION = 1 AND (b.ROOM_ID IS NULL OR b.ROOM_ID = 0) THEN 'Unassigned'
            ELSE COALESCE(r.ROOM_NUMBER, 'Unassigned')
          END AS roomNumber,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_CHANNEL,
          b.BOOKING_STATUS AS bookingStatus,
          COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0) AS totalPaid,
          ROUND(GREATEST(0,
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
            + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
            - COALESCE(bill.RESERVATION_FEE, 0)
            - COALESCE(bill.DISCOUNT_AMOUNT, 0)
            - COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0)
          ), 2) AS balance,
          CASE
            WHEN COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0) <= 0 THEN 'no_payment'
            WHEN ROUND(GREATEST(0,
              COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
              + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
              - COALESCE(bill.RESERVATION_FEE, 0)
              - COALESCE(bill.DISCOUNT_AMOUNT, 0)
              - COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0)
            ), 2) <= 0 THEN 'paid'
            ELSE 'partial'
          END AS paymentStatus
        FROM booking b
        INNER JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo AND b.ROOM_ID > 0
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID AND bill.ACTIVE = 1
        LEFT JOIN (
          SELECT bs.BOOKING_ID, COALESCE(SUM(bs.TOTAL_COST), 0) AS TOTAL_SERVICES_COST
          FROM booking_service bs
          WHERE bs.ACTIVE = 1
          GROUP BY bs.BOOKING_ID
        ) all_services_total ON b.IDNo = all_services_total.BOOKING_ID
        LEFT JOIN (
          SELECT BOOKING_ID, COALESCE(SUM(AMOUNT_PAID), 0) AS TOTAL_PAYMENTS_MADE
          FROM payments
          WHERE PAYMENT_TYPE IN ('room', 'service', 'extended')
          GROUP BY BOOKING_ID
        ) actual_payments ON b.IDNo = actual_payments.BOOKING_ID
        WHERE b.ACTIVE = 1
          AND (b.IS_CANCELLED = 0 OR b.IS_CANCELLED IS NULL)
          AND b.BOOKING_STATUS = 'pending'
          AND DATE(b.CHECK_IN_DATE) >= CURDATE()
          ${daysCondition}
        ORDER BY b.CHECK_IN_DATE ASC, c.NAME ASC
      `;

      return await queryDatabasePromise(query);
    } catch (error) {
      console.error('Error in getUpcomingCheckIns:', error);
      throw error;
    }
  }

  static async logCheckInNotifications(bookingIds, notifyWindow = 'all', encodedBy = null) {
    const allowedWindows = new Set(['1day', '3day', '7day', 'all']);
    const normalizedWindow = allowedWindows.has(String(notifyWindow || '').toLowerCase())
      ? String(notifyWindow).toLowerCase()
      : 'all';

    const placeholders = bookingIds.map(() => '?').join(', ');
    const bookings = await queryDatabasePromise(
      `SELECT IDNo AS BookingID, DATE(CHECK_IN_DATE) AS checkInDate
       FROM booking
       WHERE IDNo IN (${placeholders}) AND ACTIVE = 1`,
      bookingIds
    );

    let logged = 0;
    for (const booking of bookings) {
      await queryDatabasePromise(
        `INSERT INTO check_in_notifier_log
          (BOOKING_ID, NOTIFY_WINDOW, REFERENCE_CHECKIN_DATE, ENCODED_BY)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          ENCODED_BY = VALUES(ENCODED_BY),
          ENCODED_DT = CURRENT_TIMESTAMP,
          ACTIVE = 1`,
        [booking.BookingID, normalizedWindow, booking.checkInDate, encodedBy]
      );
      logged += 1;
    }

    return { logged, total: bookings.length };
  }

  // Get booking by ID
  static async getBookingById(bookingId) {
    try {
      const query = `
        SELECT 
          b.*,
          c.NAME as CUSTOMER_NAME,
          r.ROOM_NUMBER,
          rt.NAME as ROOM_TYPE
        FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN room r ON b.ROOM_ID = r.IDNo
          LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;
      
      const results = await queryDatabasePromise(query, [bookingId]);
      return results[0] || null;
    } catch (error) {
      console.error('Error in getBookingById:', error);
      throw error;
    }
  }

  // Helper: get all booking IDs in the same group as a given booking
  static async getGroupBookingIdsByBooking(bookingId) {
    const q1 = `SELECT GROUP_BOOKING_ID FROM booking WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`;
    const [row] = await pool.promise().query(q1, [bookingId]);
    const groupId = row?.[0]?.GROUP_BOOKING_ID;
    if (!groupId) return [];
    const q2 = `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1`;
    const [rows] = await pool.promise().query(q2, [groupId]);
    return rows.map(r => r.IDNo);
  }

  // Get booking services
  static async getBookingServices(bookingId) {
    try {
      const query = `
        SELECT 
          bs.IDNo,
          bs.BOOKING_ID,
          bs.SERVICE_ID,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS,
          bs.ENCODED_DT,
          bs.ACTIVE,
          bs.REMARKS,
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE COALESCE(s.SERVICE_NAME, 'Unknown Service')
          END as SERVICE_NAME,
          CASE 
            WHEN bs.SERVICE_ID = -1 
            THEN bs.TOTAL_COST / NULLIF(bs.QTY, 0) -- Calculate unit cost for custom services
            ELSE COALESCE(s.SERVICE_COST, bs.TOTAL_COST / NULLIF(bs.QTY, 0))
          END as SERVICE_COST
        FROM booking_service bs
          LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
        ORDER BY bs.ENCODED_DT DESC
      `;
      
      const results = await queryDatabasePromise(query, [bookingId]);
      return results;
    } catch (error) {
      console.error('Error in getBookingServices:', error);
      throw error;
    }
  }

  // Update booking status and room status with transaction
  static async updateBookingStatus(params) {
    const { bookingID, status, lateCheckOut, roomStatus } = params;
    
    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Step 1: Update booking status, handling CHECK_OUT_DATE based on lateCheckOut
        let updateBookingQuery;
        let queryParams;

        if (status === 'check-In') {
          updateBookingQuery = `
            UPDATE booking
            SET BOOKING_STATUS = ?
            WHERE IDNo = ? AND ACTIVE = 1;
          `;
          queryParams = [status, bookingID];

        } else if (status === 'check-Out') {
          if (lateCheckOut == 1) {
            updateBookingQuery = `
              UPDATE booking
              SET BOOKING_STATUS = ?, CHECK_OUT_DATE = NOW()
              WHERE IDNo = ? AND ACTIVE = 1;
            `;
          } else {
            updateBookingQuery = `
              UPDATE booking
              SET BOOKING_STATUS = ?
              WHERE IDNo = ? AND ACTIVE = 1;
            `;
          }
          queryParams = [status, bookingID];
        } else {
          updateBookingQuery = `
            UPDATE booking
            SET BOOKING_STATUS = ?
            WHERE IDNo = ? AND ACTIVE = 1;
          `;
          queryParams = [status, bookingID];
        }

        // console.log("Executing updateBookingQuery:", updateBookingQuery, queryParams);

        // Execute booking update
        await new Promise((resolve, reject) => {
          connection.query(updateBookingQuery, queryParams, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        // Step 2: Update room status if applicable
        if (roomStatus !== null) {
          const updateRoomQuery = `
            UPDATE room
            SET ROOM_STATUS = ?
            WHERE IDNo = (SELECT ROOM_ID FROM booking WHERE IDNo = ?);
          `;
          
          await new Promise((resolve, reject) => {
            connection.query(updateRoomQuery, [roomStatus, bookingID], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
        }

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();
        
        return {
          success: true,
          message: roomStatus !== null 
            ? 'Booking and room status updated successfully.' 
            : 'Booking status updated successfully.'
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in updateBookingStatus:', error);
      throw error;
    }
  }

  // Check if room is occupied (has active checked-in booking)
  static async checkRoomOccupied(bookingId) {
    try {
      // First, get the room ID for this booking
      const getRoomQuery = `
        SELECT ROOM_ID 
        FROM booking 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const roomResult = await queryDatabasePromise(getRoomQuery, [bookingId]);
      
      if (roomResult.length === 0) {
        return { 
          isOccupied: false, 
          isCleaning: false,
          message: 'Booking not found' 
        };
      }

      const roomId = roomResult[0].ROOM_ID;

      // Check if room is under cleaning (ROOM_STATUS = 4)
      const checkCleaningQuery = `
        SELECT ROOM_NUMBER, ROOM_STATUS
        FROM room
        WHERE IDNo = ? AND ACTIVE = 1 AND ROOM_STATUS = 4
        LIMIT 1
      `;
      
      const cleaningResult = await queryDatabasePromise(checkCleaningQuery, [roomId]);
      
      if (cleaningResult.length > 0) {
        return {
          isOccupied: false,
          isCleaning: true,
          roomNumber: cleaningResult[0].ROOM_NUMBER,
          message: `Room ${cleaningResult[0].ROOM_NUMBER} is currently under cleaning`
        };
      }

      // Get current booking dates to check for overlap
      const getCurrentBookingQuery = `
        SELECT CHECK_IN_DATE, CHECK_OUT_DATE
        FROM booking
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      const currentBookingResult = await queryDatabasePromise(getCurrentBookingQuery, [bookingId]);
      
      if (currentBookingResult.length === 0) {
        return {
          isOccupied: false,
          message: 'Current booking dates not found'
        };
      }

      const currentCheckIn = currentBookingResult[0].CHECK_IN_DATE;
      const currentCheckOut = currentBookingResult[0].CHECK_OUT_DATE;

      // Check if there's another active checked-in booking for this room
      // IMPORTANT: If status is "check-In", room is occupied regardless of dates
      // This handles cases where guest hasn't checked out even after scheduled check-out date
      const checkOccupiedQuery = `
        SELECT 
          b.IDNo AS BookingID,
          c.NAME AS CustomerName,
          b.BOOKING_STATUS,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        WHERE b.ROOM_ID = ?
          AND b.IDNo != ?
          AND b.ACTIVE = 1
          AND b.BOOKING_STATUS = 'check-In'
        LIMIT 1
      `;
      
      const occupiedResult = await queryDatabasePromise(checkOccupiedQuery, [roomId, bookingId]);
      
      if (occupiedResult.length > 0) {
        return {
          isOccupied: true,
          isCleaning: false,
          occupiedBooking: occupiedResult[0],
          message: `Room is currently occupied by ${occupiedResult[0].CustomerName || 'another guest'}`
        };
      }

      return {
        isOccupied: false,
        isCleaning: false,
        message: 'Room is available'
      };
    } catch (error) {
      console.error('Error checking room occupancy:', error);
      throw error;
    }
  }

  // Prorate booking_extension rows when guest checks out before using all extended days.
  // Mirrors frontend computeCheckoutContext(): extensionDaysUsed = max(0, min(actualDays - originalRoomDays, totalExtensionDays))
  static async prorateExtensionsOnEarlyCheckout(connection, bookingIds, encodedBy = 'system') {
    for (const bookingId of bookingIds) {
      const billingRows = await new Promise((resolve, reject) => {
        connection.query(
          `SELECT
             GREATEST(1, DATEDIFF(DATE(NOW()), DATE(b.CHECK_IN_DATE))) AS calendarActualDays,
             COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS originalRoomDays
           FROM billing bill
           JOIN booking b ON bill.BOOKING_ID = b.IDNo
           WHERE bill.BOOKING_ID = ? AND bill.ACTIVE = 1
           LIMIT 1`,
          [bookingId],
          (err, rows) => (err ? reject(err) : resolve(rows))
        );
      });

      if (!billingRows.length) continue;

      const calendarActualDays = parseInt(billingRows[0].calendarActualDays, 10) || 1;
      const originalRoomDays = parseInt(billingRows[0].originalRoomDays, 10) || calendarActualDays;

      const extensionRows = await new Promise((resolve, reject) => {
        connection.query(
          `SELECT IDNo, QTY, COST
           FROM booking_extension
           WHERE BOOKING_ID = ? AND ACTIVE = 1
           ORDER BY EXTEND_DATE ASC, IDNo ASC`,
          [bookingId],
          (err, rows) => (err ? reject(err) : resolve(rows))
        );
      });

      if (!extensionRows.length) continue;

      const totalExtensionDays = extensionRows.reduce((sum, row) => sum + (parseInt(row.QTY, 10) || 0), 0);
      const extensionDaysUsed = Math.max(0, Math.min(calendarActualDays - originalRoomDays, totalExtensionDays));

      if (extensionDaysUsed >= totalExtensionDays) continue;

      let remainingUsed = extensionDaysUsed;
      for (const ext of extensionRows) {
        const originalQty = parseInt(ext.QTY, 10) || 0;
        const keepQty = Math.min(originalQty, remainingUsed);
        remainingUsed -= keepQty;

        if (keepQty <= 0) {
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_extension
               SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW(), REMARKS = 'Early checkout proration'
               WHERE IDNo = ?`,
              [encodedBy || 'system', ext.IDNo],
              (err, res) => (err ? reject(err) : resolve(res))
            );
          });
        } else if (keepQty < originalQty) {
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_extension SET QTY = ? WHERE IDNo = ? AND ACTIVE = 1`,
              [keepQty, ext.IDNo],
              (err, res) => (err ? reject(err) : resolve(res))
            );
          });
        }
      }

      await new Promise((resolve, reject) => {
        connection.query(
          `UPDATE booking
           SET EXTENDED_DAYS = ?,
               EXTENDED = CASE WHEN ? > 0 THEN 1 ELSE 0 END
           WHERE IDNo = ?`,
          [extensionDaysUsed, extensionDaysUsed, bookingId],
          (err, res) => (err ? reject(err) : resolve(res))
        );
      });
    }
  }

  // New: Checkout bookings now (set CHECK_OUT_DATE=NOW, status to check-Out, update room status)
  static async checkoutBookings({ bookingIds, encodedBy, refundBookingId = null, refundAmount = 0, penaltyAmount = 0, applyDiscount = false }) {
    if (!bookingIds || bookingIds.length === 0) {
      throw new Error('No bookings to checkout');
    }

    const ids = Array.isArray(bookingIds) ? bookingIds : [bookingIds];

    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
    });

    try {
      await new Promise((resolve, reject) => {
        connection.beginTransaction(err => (err ? reject(err) : resolve()));
      });

      // Update bookings: status and checkout timestamp
      const updateBookingSql = `
        UPDATE booking
        SET BOOKING_STATUS = 'check-Out', CHECK_OUT_DATE = NOW()
        WHERE IDNo IN (?) AND ACTIVE = 1
      `;
      await new Promise((resolve, reject) => {
        connection.query(updateBookingSql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
      });

      // Update related room status to Cleaning (4)
      const updateRoomSql = `
        UPDATE room r
        JOIN booking b ON b.ROOM_ID = r.IDNo
        SET r.ROOM_STATUS = 4
        WHERE b.IDNo IN (?) AND b.ACTIVE = 1
      `;
      await new Promise((resolve, reject) => {
        connection.query(updateRoomSql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
      });

      // Update billing.QTY: cap at originally booked room days unless guest left before that period ended
      const updateBillingQtySql = `
        UPDATE billing bill
        JOIN booking b ON bill.BOOKING_ID = b.IDNo
        SET bill.ORIGINAL_QTY = COALESCE(bill.ORIGINAL_QTY, bill.QTY),
            bill.QTY = GREATEST(1, LEAST(
              DATEDIFF(DATE(NOW()), DATE(b.CHECK_IN_DATE)),
              COALESCE(bill.ORIGINAL_QTY, bill.QTY)
            ))
        WHERE b.IDNo IN (?) AND bill.ACTIVE = 1
      `;
      await new Promise((resolve, reject) => {
        connection.query(updateBillingQtySql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
      });

      // Prorate unused extension days so billing receipt matches early checkout
      await BookingModel.prorateExtensionsOnEarlyCheckout(connection, ids, encodedBy);

      // Remove discount from billing and payments if applyDiscount is false (early checkout without discount)
      if (!applyDiscount) {
        // Remove discount from billing table
        const removeDiscountBillingSql = `
          UPDATE billing
          SET DISCOUNT_AMOUNT = 0,
              DISCOUNT_APPLIED = 0
          WHERE BOOKING_ID IN (?) AND ACTIVE = 1
        `;
        await new Promise((resolve, reject) => {
          connection.query(removeDiscountBillingSql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
        });

        // Delete discount payments from payments table
        const deleteDiscountPaymentsSql = `
          DELETE FROM payments
          WHERE BOOKING_ID IN (?) AND PAYMENT_TYPE = 'discount'
        `;
        await new Promise((resolve, reject) => {
          connection.query(deleteDiscountPaymentsSql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
        });
      }

      // Optional: Insert refund(s) and update billing.CHECKOUT_REFUND (manual refund amount, no capping)
      const normalizedPenaltyAmount = Math.max(0, parseFloat(penaltyAmount) || 0);
      let refundInfo = { requested: refundAmount, processed: 0, details: [] };
      let penaltyInfo = { requested: normalizedPenaltyAmount, processed: 0 };
      if (refundBookingId && refundAmount > 0) {
        // If multiple bookings were checked out (group scope), split proportionally by room amount
        const targetIds = ids.includes(refundBookingId) && ids.length > 1 ? ids : [refundBookingId];

        // Fetch room amounts (ROOM_CHARGE * QTY) for proportion
        const roomAmtRows = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT b.IDNo AS bookingId, (bill.ROOM_CHARGE * bill.QTY) AS roomAmount
             FROM booking b JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
             WHERE b.IDNo IN (?)`,
            [targetIds],
            (err, rows) => (err ? reject(err) : resolve(rows))
          );
        });
        const totalRoomAmount = roomAmtRows.reduce((s, r) => s + (parseFloat(r.roomAmount) || 0), 0) || 1;

        // Get billing ID for each booking
        async function getBillingId(bookingId) {
          const [billRow] = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT IDNo AS billingId FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });
          return billRow?.billingId || null;
        }

        // Iterate and distribute refund proportionally
        for (const r of roomAmtRows) {
          const share = (parseFloat(r.roomAmount) || 0) / totalRoomAmount;
          const toRefund = refundAmount * share;
          
          if (toRefund <= 0) {
            refundInfo.details.push({ 
              bookingId: r.bookingId, 
              requested: toRefund, 
              processed: 0
            });
            continue;
          }

          const billingId = await getBillingId(r.bookingId);

          // Update billing accumulator
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE billing SET CHECKOUT_REFUND = COALESCE(CHECKOUT_REFUND,0) + ? WHERE BOOKING_ID = ? AND ACTIVE = 1`,
              [toRefund, r.bookingId],
              (err, res) => (err ? reject(err) : resolve(res))
            );
          });

          // Insert negative payment row
          const refundSql = billingId
            ? `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
               VALUES (?, ?, ?, 'cash', 'refund', NOW(), ?, 'Checkout refund')`
            : `INSERT INTO payments (BOOKING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
               VALUES (?, ?, 'cash', 'refund', NOW(), ?, 'Checkout refund')`;
          const refundParams = billingId
            ? [r.bookingId, billingId, -toRefund, encodedBy || 'system']
            : [r.bookingId, -toRefund, encodedBy || 'system'];
          await new Promise((resolve, reject) => {
            connection.query(refundSql, refundParams, (err, res) => (err ? reject(err) : resolve(res)));
          });

          refundInfo.processed += toRefund;
          refundInfo.details.push({ 
            bookingId: r.bookingId, 
            requested: toRefund, 
            processed: toRefund
          });
        }
      }

      // Record penalty (reuse cancellation_penalty column for checkout penalties)
      if (refundBookingId && normalizedPenaltyAmount > 0) {
        await new Promise((resolve, reject) => {
          connection.query(
            `UPDATE billing 
             SET CANCELLATION_PENALTY = COALESCE(CANCELLATION_PENALTY, 0) + ?
             WHERE BOOKING_ID = ? AND ACTIVE = 1`,
            [normalizedPenaltyAmount, refundBookingId],
            (err, res) => (err ? reject(err) : resolve(res))
          );
        });
        penaltyInfo.processed = normalizedPenaltyAmount;
      }

      // Recalculate and update PAYMENT_STATUS for all checked out bookings
      for (const bookingId of ids) {
        // Get billing details
        const billingRows = await new Promise((resolve, reject) => {
          connection.query(
            `SELECT bill.IDNo, bill.ROOM_CHARGE, bill.QTY, bill.RESERVATION_FEE, bill.DISCOUNT_AMOUNT, 
                    bill.CHECKOUT_REFUND, bill.CANCELLATION_PENALTY,
                    (SELECT COALESCE(SUM(bs.TOTAL_COST), 0) FROM booking_service bs WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1) AS services_total,
                    (SELECT COALESCE(SUM(be.COST * be.QTY), 0) FROM booking_extension be WHERE be.BOOKING_ID = ? AND be.ACTIVE = 1) AS extensions_total
             FROM billing bill
             WHERE bill.BOOKING_ID = ? AND bill.ACTIVE = 1
             LIMIT 1`,
            [bookingId, bookingId, bookingId],
            (err, rows) => (err ? reject(err) : resolve(rows))
          );
        });

        if (billingRows.length > 0) {
          const bill = billingRows[0];
          const roomCharge = parseFloat(bill.ROOM_CHARGE) || 0;
          const qty = parseInt(bill.QTY) || 1;
          const reservationFee = parseFloat(bill.RESERVATION_FEE) || 0;
          const discountAmount = parseFloat(bill.DISCOUNT_AMOUNT) || 0;
          const checkoutRefund = parseFloat(bill.CHECKOUT_REFUND) || 0;
          const penalty = parseFloat(bill.CANCELLATION_PENALTY) || 0;
          const servicesTotal = parseFloat(bill.services_total) || 0;
          const extensionsTotal = parseFloat(bill.extensions_total) || 0;

          // Calculate new total (room + services + extensions + penalty - reservation fee - discount)
          const newTotal = (roomCharge * qty) + servicesTotal + extensionsTotal + penalty - reservationFee - discountAmount;

          // Get total payments made (including refunds which are negative)
          const paymentsRows = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT COALESCE(SUM(AMOUNT_PAID), 0) AS total_paid
               FROM payments
               WHERE BOOKING_ID = ? AND PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit')`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });

          const totalPaid = parseFloat(paymentsRows[0]?.total_paid || 0);
          const balance = newTotal - totalPaid;

          // Determine payment status
          let newPaymentStatus = 'unpaid';
          if (balance <= 0) {
            newPaymentStatus = 'paid';
          } else if (totalPaid > 0 && balance < newTotal) {
            newPaymentStatus = 'partial';
          }

          // Update PAYMENT_STATUS
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?`,
              [newPaymentStatus, bill.IDNo],
              (err, res) => (err ? reject(err) : resolve(res))
            );
          });

          // If fully paid (balance <= 0), update all service and extension statuses to 'paid'
          if (balance <= 0) {
            // Update booking_service status to 'paid'
            await new Promise((resolve, reject) => {
              connection.query(
                `UPDATE booking_service SET STATUS = 'paid' WHERE BOOKING_ID = ? AND ACTIVE = 1 AND STATUS != 'paid'`,
                [bookingId],
                (err, res) => (err ? reject(err) : resolve(res))
              );
            });

            // Update booking_extension status to 'paid'
            await new Promise((resolve, reject) => {
              connection.query(
                `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE BOOKING_ID = ? AND ACTIVE = 1 AND PAYMENT_STATUS != 'paid'`,
                [bookingId],
                (err, res) => (err ? reject(err) : resolve(res))
              );
            });
          }
        }
      }

      // Compute original vs actual days for reporting
      const daysQuery = `
        SELECT 
          b.IDNo AS bookingId,
          DATE(b.CHECK_IN_DATE) AS checkInDate,
          DATE(b.CHECK_OUT_DATE) AS plannedCheckOut,
          DATEDIFF(DATE(NOW()), DATE(b.CHECK_IN_DATE)) AS actualDays,
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS originalDays
        FROM booking b
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
        WHERE b.IDNo IN (?)
      `;
      const daysRows = await new Promise((resolve, reject) => {
        connection.query(daysQuery, [ids], (err, rows) => (err ? reject(err) : resolve(rows)));
      });

      await new Promise((resolve, reject) => {
        connection.commit(err => (err ? reject(err) : resolve()));
      });

      // Build success message with refund info if applicable
      let message = 'Checked out successfully.';
      if (refundInfo.requested > 0) {
        message = `Checked out successfully. Refund of ₱${refundInfo.processed.toFixed(2)} processed.`;
      }
      if (penaltyInfo.processed > 0) {
        message += ` Penalty of ₱${penaltyInfo.processed.toFixed(2)} recorded.`;
      }

      return { success: true, message, days: daysRows, refundInfo, penaltyInfo };
    } catch (err) {
      try { await new Promise(r => connection.rollback(() => r())); } catch (e) {}
      throw err;
    } finally {
      connection.release();
    }
  }

  // Cancel booking
  static async cancelBooking(bookingId, reason) {
    try {
      const query = `
        UPDATE booking 
        SET BOOKING_STATUS = 'cancelled', 
            IS_CANCELLED = 1,
            UPDATED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(query, [bookingId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error in cancelBooking:', error);
      throw error;
    }
  }

  // Get booking details by ID
  static async getBookingDetails(bookingID) {
    try {
      const query = `
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CustomerName,
          c.CONTACTNo AS CONTACT_NO,
          c.IS_GROUP,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          rt.NAME AS ROOM_TYPE,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          COALESCE(b.CHECK_IN_STATUS, 1) AS CHECK_IN_STATUS,
          COALESCE(b.LATE_CHECKOUT, 0) AS LATE_CHECKOUT,
          b.REMARKS,
          b.BOOKING_CHANNEL,
          b.AGENCY_PAYER,
          b.AGENCY_ID,
          a.NAME AS AGENCY_NAME,
          COALESCE(NULLIF(TRIM(b.CHANNEL_BOOKING_ID), ''), gb.CHANNEL_BOOKING_ID) AS CHANNEL_BOOKING_ID,
          b.FLIGHT_NUMBER,
          b.DROPOFF_FLIGHT_NUMBER,
          b.PICKUP_DATE,
          b.PASSENGER_COUNT,
          b.ENCODED_DT,
          COALESCE(u.FULLNAME, 'System') AS ENCODED_BY_NAME,
          bill.ROOM_CHARGE AS ROOM_RATE,
          COALESCE(bill.RESERVATION_FEE, 0) AS RESERVATION_FEE,

          bill.QTY AS ORIGINAL_DAYS,

          -- Extended days from booking_extension
          COALESCE((
              SELECT SUM(QTY) 
              FROM booking_extension 
              WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
          ), 0) AS EXTENDED_DAYS,

          -- Total days = original + extended
          bill.QTY AS TOTAL_DAYS,

          -- Total room cost = base + extended
          (bill.QTY * bill.ROOM_CHARGE) +
          COALESCE((
              SELECT SUM(COST * QTY) 
              FROM booking_extension  
              WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
          ), 0) AS TOTAL_ROOM_COST,

          (bill.QTY * bill.ROOM_CHARGE) AS ROOM_COST,

          -- Total Paid = original payments + extension payments
          (
              COALESCE((
                  SELECT SUM(p.AMOUNT_PAID) 
                  FROM payments p 
                  WHERE p.BILLING_ID = bill.IDNo
              ), 0) +
              COALESCE((
                  SELECT SUM(p2.AMOUNT_PAID) 
                  FROM payments p2 
                  WHERE p2.BOOKING_EXTENSION_ID IN (
                      SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1
                  )
              ), 0)
          ) AS TOTAL_PAID,

          -- Payment status logic based on real extension statuses
          CASE
              WHEN bill.PAYMENT_STATUS = 'paid' THEN 'paid'
              WHEN bill.PAYMENT_STATUS = 'unpaid' THEN 'unpaid'
              ELSE 'partial_paid'
          END AS PAYMENT_STATUS,

          COALESCE((
            SELECT SUM(bs.QTY)
            FROM booking_service bs
            WHERE bs.BOOKING_ID = b.IDNo
              AND bs.ACTIVE = 1
              AND bs.SERVICE_ID IN (74, 75)
          ), 0) AS BREAKFAST_QTY,

          EXISTS (
            SELECT 1
            FROM booking_service bs
            LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
            WHERE bs.BOOKING_ID = b.IDNo
              AND bs.ACTIVE = 1
              AND (
                bs.SERVICE_ID IN (76, -101)
                OR LOWER(COALESCE(s.SERVICE_NAME, '')) LIKE '%pick%'
              )
          ) AS HAS_PICKUP,

          EXISTS (
            SELECT 1
            FROM booking_service bs
            LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
            WHERE bs.BOOKING_ID = b.IDNo
              AND bs.ACTIVE = 1
              AND (
                bs.SERVICE_ID IN (77, -102)
                OR LOWER(COALESCE(s.SERVICE_NAME, '')) LIKE '%drop%'
              )
          ) AS HAS_DROPOFF,

          (
            SELECT p.PAYMENT_METHOD
            FROM payments p
            WHERE p.BOOKING_ID = b.IDNo
              AND p.PAYMENT_TYPE NOT IN ('discount', 'security_deposit', 'security_deposit_refund')
            ORDER BY p.PAYMENT_DATE DESC, p.IDNo DESC
            LIMIT 1
          ) AS LATEST_PAYMENT_METHOD,

          (
            SELECT rm.REMARK_TEXT
            FROM remarks rm
            WHERE rm.BOOKING_ID = b.IDNo
              AND rm.CATEGORY = 'MaintenanceRestore'
            ORDER BY rm.ACTIVE DESC, rm.IDNo DESC
            LIMIT 1
          ) AS MAINTENANCE_RESTORE_JSON,

          (
            SELECT rm.REMARK_TEXT
            FROM remarks rm
            WHERE rm.BOOKING_ID = b.IDNo
              AND rm.CATEGORY = 'Maintenance'
              AND rm.ACTIVE = 1
            ORDER BY rm.IDNo DESC
            LIMIT 1
          ) AS MAINTENANCE_REASON

        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID AND bill.ACTIVE = 1
        LEFT JOIN agency a ON b.AGENCY_ID = a.IDNo
        LEFT JOIN user_info u ON b.ENCODED_BY = u.IDNo
        LEFT JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;
      
      const results = await queryDatabasePromise(query, [bookingID]);
      const row = results[0] || null;
      if (row && String(row.BOOKING_STATUS || '').toLowerCase() === 'maintenance') {
        row.MAINTENANCE_GUEST_NAME = '';
        if (row.MAINTENANCE_RESTORE_JSON) {
          try {
            const restoreData = JSON.parse(row.MAINTENANCE_RESTORE_JSON);
            row.MAINTENANCE_GUEST_NAME = String(restoreData?.guestName || '').trim();
          } catch (parseErr) {
            row.MAINTENANCE_GUEST_NAME = '';
          }
        }
      }
      return row;
    } catch (error) {
      console.error('Error in getBookingDetails:', error);
      throw error;
    }
  }

  // Get floors for dropdown
  static async getFloorsForDropdown() {
    try {
      const query = `
        SELECT DISTINCT ROOM_FLOOR AS floor_number
        FROM room
        WHERE ACTIVE = 1
        ORDER BY ROOM_FLOOR;
      `;
      
      const results = await queryDatabasePromise(query);
      return results;
    } catch (error) {
      console.error('Error in getFloorsForDropdown:', error);
      throw error;
    }
  }

  // Get rooms by floor
  static async getRoomsByFloor(floor) {
    try {
      const query = `
        SELECT 
          IDNo AS room_id, 
          ROOM_NUMBER
        FROM 
          room
        WHERE 
          ACTIVE = 1 
          AND ROOM_STATUS != 3 
          AND ROOM_FLOOR = ?;
      `;
      
      const results = await queryDatabasePromise(query, [floor]);
      return results;
    } catch (error) {
      console.error('Error in getRoomsByFloor:', error);
      throw error;
    }
  }

  // Get booked dates for a room
  static async getBookedDates(room_id) {
    try {
      const query = `
        SELECT 
          CHECK_IN_DATE AS start_date, 
          CHECK_OUT_DATE AS end_date
        FROM 
          booking
        WHERE 
          ROOM_ID = ? 
          AND (BOOKING_STATUS = 'pending' OR BOOKING_STATUS = 'check-In');
      `;
      
      const results = await queryDatabasePromise(query, [room_id]);
      return results;
    } catch (error) {
      console.error('Error in getBookedDates:', error);
      throw error;
    }
  }

  // Add new booking with all related data
  static async addBooking(bookingData) {
    const {
      room_id,
      fullname,
      number,
      address,
      checkInDate,
      checkOutDate,
      finalBookingRoute,
      maxOccupants,
      confirmationNumber,
      paymentStatus,
      diffindays,
      numericRoomPrice,
      encodedBy,
      date,
      checkInStatus,
      checkOutStatus,
      holdPending,
      bookingRemarks,
      agencyID,
      agencyPayer,
      guestID,
      guestType,
      guestLevel,
      breakfastAdultQty,
      breakfastAdultPrice,
      breakfastAdultId,
      breakfastKidQty,
      breakfastKidPrice,
      breakfastKidId,
      pickupServiceId,
      pickupPrice,
      dropoffServiceId,
      dropoffPrice,
      flightNumber,
      dropoffFlightNumber,
      pickupDate,
      passengerCount,
      // ✅ Additional for Direct Reservations
      bedCount,
      isDirectReservation,
      reservationFee,
      discount,
      seniorPwdDiscountPercent = 0, // Senior/PWD discount percentage
      lateCheckoutFee,
      isLongTermStay,
      roomChangeNote,
      channelBookingId
    } = bookingData;

    const holdPendingFlag = (holdPending === true || holdPending === 1 || holdPending === '1' || holdPending === 'true') ? 1 : 0;

    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Generate final confirmation number based on Hotel_Old format
        let finalConfirmationNumber = confirmationNumber;
        
        if (!isDirectReservation && finalConfirmationNumber.includes('ROOM')) {
          // For regular bookings, get room number and update confirmation number
          const roomQuery = 'SELECT ROOM_NUMBER FROM room WHERE IDNo = ?';
          const roomResult = await new Promise((resolve, reject) => {
            connection.query(connection.format(roomQuery, [room_id]), (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          
          if (roomResult.length === 0) {
            throw new Error('Room not found');
          }
          
          const roomNumber = roomResult[0].ROOM_NUMBER;
          // Extract date part and create final confirmation number
          const datePart = finalConfirmationNumber.substring(0, 8); // YYYYMMDD
          finalConfirmationNumber = datePart + '0' + roomNumber;
        }

        let customerId = guestID;

        // If no guestID, create new customer
        if (!customerId) {
          // Handle empty guestType and guestLevel - set to NULL if empty
          const processedGuestType = (guestType && guestType.trim() !== '') ? guestType : null;
          const processedGuestLevel = (guestLevel && guestLevel.trim() !== '') ? guestLevel : null;
          
          const customerQuery = `
            INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ADDRESS, ENCODED_BY, ENCODED_DT, ACTIVE) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `;
          const customerValues = [fullname, number, processedGuestType, processedGuestLevel, address, encodedBy, date];
          
          const customerResult = await new Promise((resolve, reject) => {
            connection.query(customerQuery, customerValues, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          
          customerId = customerResult.insertId;
        }

        // Create booking
        const bookingQuery = `
          INSERT INTO booking
          (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, CHANNEL_BOOKING_ID, GUESTS_COUNT, REMARKS, CONFIRMATION_NUMBER, NOTIFICATION_READ, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, LATE_CHECKOUT, HOLD_PENDING, AGENCY_ID, AGENCY_PAYER, IS_DIRECT_RESERVATION, BED_COUNT, FLIGHT_NUMBER, DROPOFF_FLIGHT_NUMBER, PICKUP_DATE, PASSENGER_COUNT, IS_LONG_TERM_STAY, ROOM_CHANGE_NOTE)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const directReservationFlag = isDirectReservation ? 1 : 0;
        // Handle empty agencyID - set to NULL if empty
        let processedAgencyID = null;
        
        // Validate agency if booking route is agency
        if (finalBookingRoute === 'agency' && agencyID && agencyID.trim() !== '') {
          // Validate that agency exists and is active
          const agencyCheckQuery = 'SELECT IDNo FROM agency WHERE IDNo = ? AND ACTIVE = 1';
          const [agencyCheck] = await new Promise((resolve, reject) => {
            connection.query(agencyCheckQuery, [agencyID], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          
          if (agencyCheck.length === 0) {
            throw new Error('Invalid agency selected. Agency does not exist or is inactive.');
          }
          
          processedAgencyID = agencyID;
        }

        let processedAgencyPayer = null;
        if (finalBookingRoute === 'agency' && agencyPayer) {
          processedAgencyPayer = agencyPayer === 'guest' ? 'guest' : 'agency';
        }

        const processedChannelBookingId = finalBookingRoute === 'booking-channel'
          ? (String(channelBookingId || '').trim() || null)
          : null;
        
        const bookingValues = [
          customerId, room_id, checkInDate, checkOutDate, 'pending', finalBookingRoute,
          processedChannelBookingId,
          maxOccupants, bookingRemarks, finalConfirmationNumber, encodedBy, date, 1, checkInStatus, checkOutStatus,
          holdPendingFlag,
          processedAgencyID, processedAgencyPayer, directReservationFlag, bedCount || null,
          pickupServiceId ? (flightNumber || null) : null,
          dropoffServiceId ? (dropoffFlightNumber || null) : null,
          pickupServiceId && pickupDate ? pickupDate : null,
          (pickupServiceId || dropoffServiceId) ? (parseInt(passengerCount) || null) : null,
          isLongTermStay ? 1 : 0,
          isLongTermStay ? (roomChangeNote || null) : null
        ];

        const bookingResult = await new Promise((resolve, reject) => {
          connection.query(bookingQuery, bookingValues, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const bookingId = bookingResult.insertId;

        // Create billing
        const billingQuery = `
          INSERT INTO billing 
          (BOOKING_ID, ROOM_CHARGE, ROOM_PRICE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT, DISCOUNT_APPLIED, SENIOR_PWD_DISCOUNT_PERCENT) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const billingValues = [
          bookingId,
          numericRoomPrice, // ROOM_CHARGE (per-night stored as charge)
          numericRoomPrice, // ROOM_PRICE (explicit per-night rate)
          0.00, 0.00, 0.00,
          diffindays,
          paymentStatus,
          'cash',
          '',
          encodedBy,
          date,
          1,
          parseFloat(reservationFee) || 0.00,
          parseFloat(discount) || 0.00,
          paymentStatus === 'paid' ? 1 : 0,
          parseFloat(seniorPwdDiscountPercent) || 0.00
        ];

        await new Promise((resolve, reject) => {
          connection.query(billingQuery, billingValues, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // console.log('Billing inserted successfully');
        
        // Insert payment records for reservation fee and discount if they exist
        const additionalPayments = [];
        
        // Add reservation fee payment record
        if (parseFloat(reservationFee) > 0) {
          additionalPayments.push([
            bookingId,
            null, // No specific service ID for reservation fee
            parseFloat(reservationFee),
            'cash',
            'reservation_fee', // New payment type
            date,
            encodedBy
          ]);
        }
        
        // Add discount payment record (negative amount)
        if (parseFloat(discount) > 0) {
          additionalPayments.push([
            bookingId,
            null, // No specific service ID for discount
            -parseFloat(discount), // Negative amount for discount
            'cash',
            'discount', // New payment type
            date,
            encodedBy
          ]);
        }
        
        // Insert additional payments if any
        if (additionalPayments.length > 0) {
          const additionalPayQuery = `
            INSERT INTO payments 
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES ?
          `;
          
          await new Promise((resolve, reject) => {
            connection.query(additionalPayQuery, [additionalPayments], (err) => {
              if (err) {
                console.error('❌ Failed to insert reservation fee/discount payments:', err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        }

        // Insert payment record for the paid amount.
        // For regular bookings we still follow the old rule (only when PARTIAL),
        // but for direct reservations (unassigned room) we ALWAYS record the paid amount
        // so that the initial cash/payment is visible in the payments table.
        const paidAmount = parseFloat(bookingData.paidAmount) || 0;
        if (paidAmount > 0 && (paymentStatus === 'partial' || isDirectReservation)) {
          const paymentQuery = `
            INSERT INTO payments 
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const paymentValues = [
            bookingId,
            null, // No specific service ID for room payment
            paidAmount,
            'cash',
            'room', // Payment type for room charges
            date,
            encodedBy,
            isDirectReservation
              ? 'Initial payment for direct reservation (unassigned room)'
              : 'Initial payment for booking'
          ];
          
          await new Promise((resolve, reject) => {
            connection.query(paymentQuery, paymentValues, (err) => {
              if (err) {
                console.error('❌ Failed to insert room payment:', err);
                reject(err);
              } else {
                console.log(`✅ Room payment of ₱${paidAmount} recorded for booking ${bookingId}`);
                resolve();
              }
            });
          });
        }

        // Insert breakfast services if provided
        const services = [];

        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = (parseFloat(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0);
          services.push([
            bookingId,
            breakfastAdultId,
            breakfastAdultQty,
            totalAdult,
            paymentStatus === 'paid' ? 'paid' : 'unpaid',
            encodedBy,
            date,
            1
          ]);
        }

        if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
          const totalKid = (parseFloat(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0);
          services.push([
            bookingId,
            breakfastKidId,
            breakfastKidQty,
            totalKid,
            paymentStatus === 'paid' ? 'paid' : 'unpaid',
            encodedBy,
            date,
            1
          ]);
        }

        if (services.length > 0) {
          const serviceQuery = `
            INSERT INTO booking_service 
            (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const servicePayments = [];

          for (const s of services) {
            const serviceResult = await new Promise((resolve, reject) => {
              connection.query(serviceQuery, s, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });

            if (paymentStatus === 'paid') {
              servicePayments.push([
                bookingId,
                serviceResult.insertId, // booking_service.IDNo
                parseFloat(s[3]),
                'cash',
                'service',
                date,
                encodedBy
              ]);
            }
          }

          if (servicePayments.length > 0) {
            const payQuery = `
              INSERT INTO payments 
              (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES ?
            `;
            await new Promise((resolve, reject) => {
              connection.query(payQuery, [servicePayments], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        }

        // Insert transport services
        const pickAnddrop = [];

        if (pickupServiceId && pickupPrice) {
          pickAnddrop.push([
            bookingId,
            pickupServiceId,
            1,
            pickupPrice,
            paymentStatus === 'paid' ? 'paid' : 'unpaid',
            encodedBy,
            date,
            1
          ]);
        }

        if (dropoffServiceId && dropoffPrice) {
          pickAnddrop.push([
            bookingId,
            dropoffServiceId,
            1,
            dropoffPrice,
            paymentStatus === 'paid' ? 'paid' : 'unpaid',
            encodedBy,
            date,
            1
          ]);
        }

        if (pickAnddrop.length > 0) {
          const insertQuery = `
            INSERT INTO booking_service 
            (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const paymentInserts = [];

          for (const s of pickAnddrop) {
            const pickDropResult = await new Promise((resolve, reject) => {
              connection.query(insertQuery, s, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });

            if (paymentStatus === 'paid') {
              paymentInserts.push([
                bookingId,
                pickDropResult.insertId, // booking_service.IDNo
                parseFloat(s[3]),
                'cash',
                'service',
                date,
                encodedBy
              ]);
            }
          }

          if (paymentInserts.length > 0) {
            const payQuery = `
              INSERT INTO payments 
              (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES ?
            `;

            await new Promise((resolve, reject) => {
              connection.query(payQuery, [paymentInserts], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        }

        // Process late check-out fee if applicable
        if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0) {
          const lateCheckoutQuery = `
            INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
            VALUES (?, 72, 1, ?, ?, ?, NOW())
          `;

          const status = paymentStatus === 'paid' ? 'paid' : 'unpaid';
          const lateCheckoutResult = await new Promise((resolve, reject) => {
            connection.query(lateCheckoutQuery, [bookingId, lateCheckoutFee, status, encodedBy], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          // Insert payment record for late checkout fee if paid
          if (paymentStatus === 'paid') {
            const lateCheckoutPaymentQuery = `
              INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES (?, ?, ?, ?, 'service', NOW(), ?)
            `;
            await new Promise((resolve, reject) => {
              connection.query(lateCheckoutPaymentQuery, [bookingId, lateCheckoutResult.insertId, parseFloat(lateCheckoutFee), 'cash', encodedBy], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }

        }

        // Add booking remarks to remarks table if bookingRemarks has content
        if (bookingRemarks && bookingRemarks.trim() !== '') {
          const remarksCategory = isLongTermStay ? 'Long Term' : 'Booking';
          const remarksQuery = `
            INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY)
            VALUES (?, '${remarksCategory}', ?, ?, ?)
          `;

          await new Promise((resolve, reject) => {
            connection.query(remarksQuery, [bookingId, bookingRemarks.trim(), encodedBy, encodedBy], (err, results) => {
              if (err) {
                console.error('❌ Failed to insert booking remarks:', err);
                reject(err);
              } else {
                resolve(results);
              }
            });
          });
        }

        // If paymentStatus is 'paid', insert into payments table.
        // For DIRECT RESERVATIONS (unassigned room) we SKIP this block because
        // there is no room charge yet (ROOM_CHARGE is 0) and it would create a
        // duplicate 0.00 payment row. The real initial cash for direct reservations
        // is handled separately in the paidAmount logic above.
        if (paymentStatus === 'paid' && !isDirectReservation) {
          const getBillingIdQuery = `SELECT IDNo, ROOM_CHARGE, QTY, RESERVATION_FEE, DISCOUNT_AMOUNT FROM billing WHERE BOOKING_ID = ? LIMIT 1`;
          const billingRows = await new Promise((resolve, reject) => {
            connection.query(getBillingIdQuery, [bookingId], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });

          if (billingRows.length === 0) {
            throw new Error('Failed to fetch billing for payment insert');
          }

          const billing = billingRows[0];
          // Calculate final amount: (ROOM_CHARGE * QTY) + RESERVATION_FEE - DISCOUNT_AMOUNT
          const amountPaid = (billing.ROOM_CHARGE * billing.QTY) - (parseFloat(billing.RESERVATION_FEE) || 0) - (parseFloat(billing.DISCOUNT_AMOUNT) || 0);

          const insertPaymentQuery = `
            INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES (?, ?, ?, ?, 'room', NOW(), ?)
          `;
          await new Promise((resolve, reject) => {
            connection.query(insertPaymentQuery, [bookingId, billing.IDNo, amountPaid, 'cash', encodedBy], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // console.log('✅ Payment inserted after booking.');
        }

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();

        return {
          success: true,
          message: paymentStatus === 'paid' ? 'Booking and payment saved successfully!' : 'Booking added successfully!',
          confirmationNumber: finalConfirmationNumber,
          bookingId
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in addBooking:', error);
      throw error;
    }
  }

  // Get booking details by confirmation number
  static async getBookingByConfirmationNumber(confirmationNumber) {
    try {
      const query = `
        SELECT
          b.IDNo AS BookingID,
          c.NAME AS CustomerName,
          r.ROOM_NUMBER AS RoomNumber,
          b.CHECK_IN_DATE AS CheckInDate,
          b.CHECK_OUT_DATE AS CheckOutDate,
          COALESCE(bs.TOTAL_COST, 0) AS TotalCost,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PaymentStatus,
          b.BOOKING_STATUS AS BookingStatus,
          b.REMARKS,
          b.CONFIRMATION_NUMBER AS ConfirmationNumber
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN booking_service bs ON b.IDNo = bs.BOOKING_ID
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.CONFIRMATION_NUMBER = ?
          AND b.ACTIVE = 1
      `;
      
      const results = await queryDatabasePromise(query, [confirmationNumber]);
      return results[0] || null;
    } catch (error) {
      console.error('Error in getBookingByConfirmationNumber:', error);
      throw error;
    }
  }

  // Get extra service dropdown
  static async getExtraServiceDropdown() {
    try {
      const query = `
        SELECT IDNo, SERVICE_NAME, SERVICE_COST 
        FROM services 
        WHERE SERVICE_AVAILABILITY = 'Available' AND ACTIVE = 1
      `;
      
      const results = await queryDatabasePromise(query);
      return results;
    } catch (error) {
      console.error('Error in getExtraServiceDropdown:', error);
      throw error;
    }
  }

  // Save booking services
  static async saveBookingServices(params) {
    const { bookingId, services, userId } = params;
    const date = new Date();

    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        let totalCost = 0;

        // Process each service
        for (const service of services) {
          // Handle custom services (SERVICE_ID = -1)
          if (service.SERVICE_ID === -1 || service.IS_CUSTOM) {
            // For custom services, create a temporary service entry or handle specially
            // We'll insert directly into booking_service with SERVICE_ID = -1
            // and store the custom name in a way we can retrieve it later
            
            const customServiceName = service.SERVICE_NAME || 'Custom Service';
            const costToUse = parseFloat(service.CUSTOM_COST || service.SERVICE_COST || 0);
            
            // Check if custom service already exists with same name and cost
            const checkCustomQuery = `
              SELECT bs.IDNo, bs.QTY, bs.STATUS, bs.TOTAL_COST, bs.CUSTOM_NAME
              FROM booking_service bs
              WHERE bs.BOOKING_ID = ? 
                AND bs.SERVICE_ID = -1 
                AND bs.STATUS != 'paid'
                AND bs.CUSTOM_NAME = ?
              ORDER BY bs.IDNo DESC
              LIMIT 1
            `;
            
            const checkCustomResults = await new Promise((resolve, reject) => {
              connection.query(checkCustomQuery, [bookingId, customServiceName], (err, results) => {
                if (err) reject(err);
                else resolve(results);
              });
            });
            
            // Check if there's an existing unpaid custom service with the EXACT same name and cost
            let hasUnpaidCustom = false;
            let existingCustomId = null;
            let existingCustomQty = 0;
            
            if (checkCustomResults.length > 0) {
              const existing = checkCustomResults[0];
              const existingTotalCost = parseFloat(existing.TOTAL_COST);
              const existingQty = parseFloat(existing.QTY);
              const thisExistingCost = existingQty > 0 ? existingTotalCost / existingQty : 0;
              
              // Compare costs with tolerance for floating point differences
              const costMatches = Math.abs(thisExistingCost - costToUse) < 0.01;
              
              if (costMatches) {
                hasUnpaidCustom = true;
                existingCustomId = existing.IDNo;
                existingCustomQty = existingQty;
              }
            }
            
            if (hasUnpaidCustom && existingCustomId) {
              // Update existing custom service
              const updateCustomQuery = `
                UPDATE booking_service 
                SET QTY = ?, 
                    TOTAL_COST = ? * ?, 
                    EDITED_BY = ?, 
                    EDITED_DT = NOW(),
                    ACTIVE = 1
                WHERE IDNo = ?
              `;
              
              const newQty = existingCustomQty + service.QUANTITY;
              
              await new Promise((resolve, reject) => {
                connection.query(
                  updateCustomQuery,
                  [newQty, newQty, costToUse, userId, existingCustomId],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
              
              totalCost += service.QUANTITY * costToUse;
            } else {
              // Insert new custom service
              const insertCustomQuery = `
                INSERT INTO booking_service 
                  (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, CUSTOM_NAME)
                VALUES (?, -1, ?, ?, 'unpaid', ?, ?, ?)
              `;
              
              await new Promise((resolve, reject) => {
                connection.query(
                  insertCustomQuery,
                  [bookingId, service.QUANTITY, service.QUANTITY * costToUse, userId, date, customServiceName],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
              
              totalCost += service.QUANTITY * costToUse;
            }
            
            continue; // Skip to next service
          }
          
          // Determine the cost to use for this service
          let costToUse;
          if (service.CUSTOM_COST !== undefined && service.CUSTOM_COST !== null) {
            costToUse = parseFloat(service.CUSTOM_COST);
          } else {
            // Fetch cost from services table
            const fetchCostQuery = `SELECT SERVICE_COST FROM services WHERE IDNo = ?`;
            const costResult = await new Promise((resolve, reject) => {
              connection.query(fetchCostQuery, [service.SERVICE_ID], (err, results) => {
                if (err) reject(err);
                else resolve(results);
              });
            });
            costToUse = costResult[0]?.SERVICE_COST || 0;
          }

          // Check if service already exists for this booking with the same cost
          // Use LEFT JOIN to include custom services (SERVICE_ID = -1)
          const checkQuery = `
            SELECT bs.IDNo, bs.QTY, bs.STATUS, bs.TOTAL_COST, 
                   COALESCE(s.SERVICE_COST, bs.TOTAL_COST / NULLIF(bs.QTY, 0)) as SERVICE_COST
            FROM booking_service bs
            LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
            WHERE bs.BOOKING_ID = ? AND bs.SERVICE_ID = ? AND bs.STATUS != 'paid'
            ORDER BY bs.IDNo DESC
          `;

          const checkResults = await new Promise((resolve, reject) => {
            connection.query(checkQuery, [bookingId, service.SERVICE_ID], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          // Check if there's an existing unpaid service with the EXACT same cost
          let hasUnpaid = false;
          let existingCost = 0;
          let existingId = null;
          
          for (const result of checkResults) {
            // Calculate the cost per unit of this existing service
            const existingTotalCost = parseFloat(result.TOTAL_COST);
            const existingQty = parseFloat(result.QTY);
            const thisExistingCost = existingQty > 0 ? existingTotalCost / existingQty : 0;
            
            // Compare costs with tolerance for floating point differences
            const costMatches = Math.abs(thisExistingCost - costToUse) < 0.01;
            
            if (costMatches) {
              hasUnpaid = true;
              existingCost = thisExistingCost;
              existingId = result.IDNo;
              break; // Found an exact match, use this one
            }
          }
          
          // If no exact cost match found, we'll insert a new record
          if (hasUnpaid && existingId) {
            // Update if existing record is unpaid AND has the same cost
            
            const updateQuery = `
              UPDATE booking_service 
              SET QTY = ?, 
                  TOTAL_COST = ? * ?, 
                  EDITED_BY = ?, 
                  EDITED_DT = NOW(),
                  ACTIVE = 1
              WHERE IDNo = ?
            `;

            await new Promise((resolve, reject) => {
              connection.query(
                updateQuery,
                [service.QUANTITY, service.QUANTITY, costToUse, userId, existingId],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            totalCost += service.QUANTITY * costToUse;
          } else {
            // Insert new row if no unpaid service exists OR if costs don't match
            const insertQuery = `
              INSERT INTO booking_service 
                (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
              VALUES (?, ?, ?, ?, 'unpaid', ?, ?)
            `;

            await new Promise((resolve, reject) => {
              connection.query(
                insertQuery,
                [bookingId, service.SERVICE_ID, service.QUANTITY, service.QUANTITY * costToUse, userId, date],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            totalCost += service.QUANTITY * costToUse;
          }
        }

        // Update billing with total service cost
        const updateBillingQuery = `
          UPDATE billing
          SET SERVICES_CHARGE = ?
          WHERE BOOKING_ID = ?
        `;

        await new Promise((resolve, reject) => {
          connection.query(updateBillingQuery, [totalCost, bookingId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();

        return {
          success: true,
          message: 'Booking services saved and billing updated successfully!',
          totalCost
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in saveBookingServices:', error);
      throw error;
    }
  }

  // Get unpaid balance for a booking
  static async getUnpaidBalance(bookingId) {
    try {
      const query = `
        SELECT 
          -- Room Charge with remaining balance (considering partial payments, reservation fee, and discount)
          COALESCE((
              SELECT 
                  (b.ROOM_CHARGE * b.QTY - COALESCE(b.RESERVATION_FEE, 0) - COALESCE(b.DISCOUNT_AMOUNT, 0)) 
                  - COALESCE((
                      SELECT SUM(p.AMOUNT_PAID) 
                      FROM payments p 
                      WHERE p.BOOKING_ID = b.BOOKING_ID 
                      AND p.PAYMENT_TYPE != 'discount'
                  ), 0)
              FROM billing b
              WHERE b.BOOKING_ID = ?
          ), 0) AS room_charge_unpaid,

          -- Extension Charges with remaining balance (considering partial payments)
          COALESCE((
              SELECT SUM(GREATEST(0, be.COST * be.QTY - COALESCE((
                  SELECT SUM(p.AMOUNT_PAID) 
                  FROM payments p 
                  WHERE p.BOOKING_EXTENSION_ID = be.IDNo
                  AND p.PAYMENT_TYPE = 'extended'
              ), 0)))
              FROM booking_extension be
              WHERE be.BOOKING_ID = ? AND be.ACTIVE = 1
          ), 0) AS extension_charge_unpaid,

          -- Service Charges with remaining balance (considering partial payments)
          COALESCE((
              SELECT SUM(GREATEST(0, bs.TOTAL_COST - COALESCE((
                  SELECT SUM(p.AMOUNT_PAID) 
                  FROM payments p 
                  WHERE p.BOOKING_SERVICE_ID = bs.IDNo
                  AND p.PAYMENT_TYPE = 'service'
              ), 0)))
              FROM booking_service bs
              WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
          ), 0) AS service_unpaid,

          -- Reservation Fee (always applied to reduce balance)
          COALESCE((
              SELECT b.RESERVATION_FEE
              FROM billing b
              WHERE b.BOOKING_ID = ?
          ), 0) AS reservation_fee,

          -- Discount Amount (always applied to reduce balance)
          COALESCE((
              SELECT b.DISCOUNT_AMOUNT
              FROM billing b
              WHERE b.BOOKING_ID = ?
          ), 0) AS discount_amount,

          -- Discount Applied flag (0 = Discount, 1 = Discount Applied)
          COALESCE((
              SELECT b.DISCOUNT_APPLIED
              FROM billing b
              WHERE b.BOOKING_ID = ?
          ), 0) AS discount_applied,

          -- Total Outstanding Balance (considering all partial payments)
          (
              COALESCE((
                  SELECT 
                      GREATEST(0, (b.ROOM_CHARGE * b.QTY - COALESCE(b.RESERVATION_FEE, 0) - COALESCE(b.DISCOUNT_AMOUNT, 0)) - COALESCE((
                          SELECT SUM(p.AMOUNT_PAID) 
                          FROM payments p 
                          WHERE p.BOOKING_ID = b.BOOKING_ID 
                          AND p.PAYMENT_TYPE NOT IN ('discount', 'security_deposit_refund')
                      ), 0))
                  FROM billing b
                  WHERE b.BOOKING_ID = ?
              ), 0)
              +
              COALESCE((
                  SELECT SUM(GREATEST(0, be.COST * be.QTY - COALESCE((
                      SELECT SUM(p.AMOUNT_PAID) 
                      FROM payments p 
                      WHERE p.BOOKING_EXTENSION_ID = be.IDNo
                      AND p.PAYMENT_TYPE = 'extended'
                  ), 0)))
                  FROM booking_extension be
                  WHERE be.BOOKING_ID = ? AND be.ACTIVE = 1
              ), 0)
              +
              COALESCE((
                  SELECT SUM(GREATEST(0, bs.TOTAL_COST - COALESCE((
                      SELECT SUM(p.AMOUNT_PAID) 
                      FROM payments p 
                      WHERE p.BOOKING_SERVICE_ID = bs.IDNo
                      AND p.PAYMENT_TYPE = 'service'
                  ), 0)))
                  FROM booking_service bs
                  WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
              ), 0)
          ) AS total_unpaid_balance,
          COALESCE((
            SELECT b.REMARKS FROM billing b WHERE b.BOOKING_ID = ?
          ), '') AS discount_remarks
      `;
      
      // Ensure param count matches query
      const results = await queryDatabasePromise(query, [
        bookingId, // room_charge_unpaid
        bookingId, // extension_charge_unpaid
        bookingId, // service_unpaid
        bookingId, // reservation_fee
        bookingId, // discount_amount
        bookingId, // discount_applied
        bookingId, // total_unpaid_balance (room)
        bookingId, // total_unpaid_balance (extension)
        bookingId, // total_unpaid_balance (service)
        bookingId  // discount_remarks
      ]);

      const balanceData = results.length > 0 ? results[0] : {
        room_charge_unpaid: 0,
        extension_charge_unpaid: 0,
        service_unpaid: 0,
        reservation_fee: 0,
        discount_amount: 0,
        total_unpaid_balance: 0
      };

      return balanceData;
    } catch (error) {
      console.error('Error in getUnpaidBalance:', error);
      throw error;
    }
  }

  // Apply or update manual discount
  static async applyDiscount(params) {
    const { bookingId, amount, remarks, editedBy } = params;
    try {
      // Update billing discount and optionally remarks
      const updateBillingSql = `
        UPDATE billing 
        SET DISCOUNT_AMOUNT = ?, 
            EDITED_BY = ?, 
            EDITED_DT = NOW(),
            REMARKS = CASE WHEN ? <> '' THEN ? ELSE REMARKS END
        WHERE BOOKING_ID = ?
      `;
      await queryDatabasePromise(updateBillingSql, [amount, editedBy, remarks, remarks, bookingId]);

      // Remove existing discount payments, then insert a new negative one if amount > 0
      const deleteSql = `DELETE FROM payments WHERE BOOKING_ID = ? AND PAYMENT_TYPE = 'discount'`;
      await queryDatabasePromise(deleteSql, [bookingId]);

      if (amount > 0) {
        const insertSql = `
          INSERT INTO payments (BOOKING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
          VALUES (?, ?, 'cash', 'discount', NOW(), ?)
        `;
        await queryDatabasePromise(insertSql, [bookingId, -amount, editedBy]);
      }

      // Add discount remarks to remarks table if remarks has content
      if (remarks && remarks.trim() !== '') {
        // Check if a discount remark already exists for this booking
        const existingRemark = await queryDatabasePromise(
          `SELECT IDNo, REMARK_TEXT FROM remarks 
           WHERE BOOKING_ID = ? AND CATEGORY = 'Discount' AND ACTIVE = 1`,
          [bookingId]
        );
        
        if (existingRemark.length > 0) {
          // Merge with existing remark - append new text with separator
          const currentText = existingRemark[0].REMARK_TEXT;
          const mergedText = `${currentText}\n--\n${remarks.trim()}`;
          
          await queryDatabasePromise(
            `UPDATE remarks SET REMARK_TEXT = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP 
             WHERE IDNo = ? AND ACTIVE = 1`,
            [mergedText, editedBy, existingRemark[0].IDNo]
          );
          
        } else {
          // Insert new discount remark
          await queryDatabasePromise(
            `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) 
             VALUES (?, 'Discount', ?, ?, ?)`,
            [bookingId, remarks.trim(), editedBy, editedBy]
          );
          
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in applyDiscount:', error);
      throw error;
    }
  }

  // Get booking services (including extensions and transport)
  static async getBookingServices(bookingId) {
    try {
      // Get regular services (including custom services)
      const serviceQuery = `
        SELECT 
          bs.SERVICE_ID, 
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE s.SERVICE_NAME
          END as SERVICE_NAME,
          bs.QTY, 
          bs.TOTAL_COST, 
          bs.STATUS, 
          bs.ENCODED_DT
        FROM booking_service bs
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
      `;
      const serviceRows = await queryDatabasePromise(serviceQuery, [bookingId]);

      // Get extensions
      const extensionQuery = `
        SELECT IDNo AS SERVICE_ID, EXTEND_DATE AS ENCODED_DT, QTY, COST, PAYMENT_STATUS
        FROM booking_extension
        WHERE BOOKING_ID = ? AND ACTIVE = 1
      `;
      const extensionRows = await queryDatabasePromise(extensionQuery, [bookingId]);

      // Format extensions
      const formattedExtensions = extensionRows.map(ext => ({
        SERVICE_ID: -999, // extended stay
        SERVICE_NAME: 'Extended Stay',
        QTY: ext.QTY,
        TOTAL_COST: ext.COST,
        STATUS: ext.PAYMENT_STATUS,
        ENCODED_DT: ext.ENCODED_DT
      }));

      // Combine all services
      const allServices = [...serviceRows, ...formattedExtensions];

      return allServices;
    } catch (error) {
      console.error('Error in getBookingServices:', error);
      throw error;
    }
  }

  // Get direct reservation details (Hotel_Old compatibility)
  static async getDirectReservationDetails(bookingId) {
    try {
      const query = `
        SELECT 
          b.IDNo as bookingId,
          c.NAME as fullname,
          c.CONTACTNo as number,
          c.ADDRESS as address,
          CONCAT(DATE_FORMAT(b.CHECK_IN_DATE, '%M %d, %Y'), ' to ', DATE_FORMAT(b.CHECK_OUT_DATE, '%M %d, %Y')) as daterange,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) as diffindays,
          b.BOOKING_CHANNEL as bookingRoute,
          b.GUESTS_COUNT as maxOccupants,
          b.REMARKS as bookingRemarks,
          b.AGENCY_ID as agencyID,
          b.CONFIRMATION_NUMBER as voucherNo,
          b.CHECK_IN_STATUS as checkInStatus,
          bill.PAYMENT_STATUS as paymentStatus,
          bill.RESERVATION_FEE as reservationFee,
          bill.DISCOUNT_AMOUNT as discountAmount,
          gl.TYPE as guestLevel,
          gt.TYPE as guestType,
          COALESCE((
            SELECT SUM(p.AMOUNT_PAID) 
            FROM payments p 
            WHERE (p.BILLING_ID = bill.IDNo OR p.BOOKING_ID = b.IDNo) 
            AND p.PAYMENT_TYPE != 'discount'
          ), 0) as paidAmount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        LEFT JOIN guest_level gl ON gl.IDNo = c.LEVEL
        LEFT JOIN guest_type gt ON gt.IDNo = c.TYPE
        WHERE b.IDNo = ? AND b.IS_DIRECT_RESERVATION = 1
      `;

      const results = await queryDatabasePromise(query, [bookingId]);
      return results.length ? results[0] : null;
    } catch (error) {
      console.error('Error in getDirectReservationDetails:', error);
      throw error;
    }
  }

  // Update service status
  static async updateServiceStatus(serviceId, status) {
    try {
      const query = `
        UPDATE booking_service 
        SET STATUS = ? 
        WHERE SERVICE_ID = ?
      `;
      
      const result = await queryDatabasePromise(query, [status, serviceId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.error('Error in updateServiceStatus:', error);
      throw error;
    }
  }

  // Remove service (handles regular services, extensions, and transport)
  static async removeService(params) {
    const { bookingId, serviceId, isExtension, isTransport, removalReason, userId } = params;

    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        if (isExtension) {
          // Step 1: Get the extension details first
          const getExtensionQuery = `
            SELECT QTY, COST FROM booking_extension 
            WHERE BOOKING_ID = ? AND ACTIVE = 1
            ORDER BY IDNo DESC
            LIMIT 1
          `;
          
          const extension = await new Promise((resolve, reject) => {
            connection.query(getExtensionQuery, [bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (extension.length === 0) {
            throw new Error('No extension found to remove.');
          }

          const extensionData = extension[0];
          const daysToRemove = extensionData.QTY;

          // Step 2: Get current booking details
          const getBookingQuery = `
            SELECT CHECK_OUT_DATE, EXTENDED_DAYS
            FROM booking
            WHERE IDNo = ?
          `;
          
          const booking = await new Promise((resolve, reject) => {
            connection.query(getBookingQuery, [bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (booking.length === 0) {
            throw new Error('Booking not found.');
          }

          const bookingData = booking[0];
          const currentCheckoutDate = new Date(bookingData.CHECK_OUT_DATE);
          
          // Step 3: Calculate new checkout date by subtracting the extension days
          const newCheckoutDate = new Date(currentCheckoutDate);
          newCheckoutDate.setDate(newCheckoutDate.getDate() - daysToRemove);

          // Step 4: Update booking_extension (soft delete)
          const updateExtensionQuery = `
            UPDATE booking_extension
            SET ACTIVE = 0, 
                EDITED_BY = ?, 
                EDITED_DT = NOW(),
                REMARKS = ?
            WHERE BOOKING_ID = ? AND ACTIVE = 1
            ORDER BY IDNo DESC
            LIMIT 1
          `;

          const result = await new Promise((resolve, reject) => {
            connection.query(updateExtensionQuery, [userId, removalReason, bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (result.affectedRows === 0) {
            throw new Error('No extension found to remove.');
          }

          // Step 5: Update booking to revert checkout date and reduce extended days
          const updateBookingQuery = `
            UPDATE booking
            SET EXTENDED_DAYS = GREATEST(0, EXTENDED_DAYS - ?),
                CHECK_OUT_DATE = ?
            WHERE IDNo = ?
          `;
          
          await new Promise((resolve, reject) => {
            connection.query(updateBookingQuery, [daysToRemove, newCheckoutDate, bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          // Step 6: If extended days becomes 0, reset the EXTENDED flag
          const resetExtendedQuery = `
            UPDATE booking
            SET EXTENDED = CASE 
              WHEN EXTENDED_DAYS = 0 THEN 0 
              ELSE EXTENDED 
            END
            WHERE IDNo = ?
          `;
          
          await new Promise((resolve, reject) => {
            connection.query(resetExtendedQuery, [bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          // Commit the transaction
          await new Promise((resolve, reject) => {
            connection.commit(err => {
              if (err) reject(err);
              else resolve();
            });
          });

          connection.release();

          return {
            success: true,
            message: 'Extension removed successfully!',
            totalCost: 0,
            newCheckoutDate: newCheckoutDate,
            daysRemoved: daysToRemove
          };

        } else if (isTransport) {
          throw new Error('Transport services are no longer supported.');
        } else {
          // Handle booking_service logic
          const fetchServiceQuery = `
            SELECT TOTAL_COST, STATUS 
            FROM booking_service
            WHERE BOOKING_ID = ? AND SERVICE_ID = ? AND ACTIVE = 1
          `;

          const results = await new Promise((resolve, reject) => {
            connection.query(fetchServiceQuery, [bookingId, serviceId], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          if (results.length === 0) {
            throw new Error('Service not found or already inactive.');
          }

          const totalCost = results[0].TOTAL_COST;
          const serviceStatus = results[0].STATUS || 'unpaid';
          const isPaid = serviceStatus === 'paid';
          const isLateCheckout = serviceId === 72;
          let refundProcessed = false;

          // Prevent deletion of paid services, except Late Checkout (SERVICE_ID = 72)
          if (isPaid && !isLateCheckout) {
            throw new Error('Paid services cannot be removed. Only Late Checkout can be removed even when paid.');
          }

          console.log('BookingModel.removeService - userId:', userId, 'removalReason:', removalReason);

          const updateActiveQuery = `
            UPDATE booking_service
            SET ACTIVE = 0, REMARKS = ?, EDITED_BY = ?, EDITED_DT = NOW()
            WHERE BOOKING_ID = ? AND SERVICE_ID = ?
          `;

          await new Promise((resolve, reject) => {
            connection.query(updateActiveQuery, [removalReason || '', userId, bookingId, serviceId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          const updateBillingQuery = `
            UPDATE billing
            SET SERVICES_CHARGE = SERVICES_CHARGE - ?
            WHERE BOOKING_ID = ?
          `;

          await new Promise((resolve, reject) => {
            connection.query(updateBillingQuery, [totalCost, bookingId], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // If deleting Late Checkout service (SERVICE_ID = 72), update LATE_CHECKOUT = 0 in booking table
          if (serviceId === 72) {
            const updateLateCheckoutQuery = `
              UPDATE booking
              SET LATE_CHECKOUT = 0
              WHERE IDNo = ?
            `;

            await new Promise((resolve, reject) => {
              connection.query(updateLateCheckoutQuery, [bookingId], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // If Late Checkout was paid, create refund entry
            if (isPaid && totalCost > 0) {
              // Get billing_id
              const getBillingIdQuery = `
                SELECT IDNo FROM billing
                WHERE BOOKING_ID = ? AND ACTIVE = 1
                LIMIT 1
              `;

              const billingResult = await new Promise((resolve, reject) => {
                connection.query(getBillingIdQuery, [bookingId], (err, result) => {
                  if (err) reject(err);
                  else resolve(result);
                });
              });

              const billingId = billingResult.length > 0 ? billingResult[0].IDNo : null;

              // Update billing CHECKOUT_REFUND
              const updateRefundQuery = `
                UPDATE billing
                SET CHECKOUT_REFUND = COALESCE(CHECKOUT_REFUND, 0) + ?
                WHERE BOOKING_ID = ? AND ACTIVE = 1
              `;

              await new Promise((resolve, reject) => {
                connection.query(updateRefundQuery, [totalCost, bookingId], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Insert refund payment record (negative amount)
              const refundSql = billingId
                ? `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                   VALUES (?, ?, ?, 'cash', 'refund', NOW(), ?, 'Late Checkout service refund')`
                : `INSERT INTO payments (BOOKING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                   VALUES (?, ?, 'cash', 'refund', NOW(), ?, 'Late Checkout service refund')`;

              const refundParams = billingId
                ? [bookingId, billingId, -totalCost, userId || 'system']
                : [bookingId, -totalCost, userId || 'system'];

              await new Promise((resolve, reject) => {
                connection.query(refundSql, refundParams, (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              refundProcessed = true;
            }
          }

          // Commit the transaction
          await new Promise((resolve, reject) => {
            connection.commit(err => {
              if (err) reject(err);
              else resolve();
            });
          });

          connection.release();

          let message = 'Service removed and billing updated successfully!';
          if (refundProcessed) {
            message = `Late Checkout service removed successfully! Refund of ₱${totalCost.toFixed(2)} has been processed.`;
          }

          return {
            success: true,
            message: message,
            totalCost,
            refundProcessed: refundProcessed
          };
        }

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in removeService:', error);
      throw error;
    }
  }

  // Get billing information
  static async getBilling(bookingId) {
    try {
      // Get booking and billing data
      const bookingQuery = `
        SELECT 
          b.IDNo AS bookingId,
          b.CUSTOMER_ID AS customerId,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_STATUS,
          bi.ROOM_CHARGE,
          bi.AMENITIES_CHARGE,
          bi.SERVICES_CHARGE,
          bi.QTY,
          COALESCE(bi.ORIGINAL_QTY, bi.QTY) AS ORIGINAL_QTY,
          bi.PAYMENT_STATUS,
          bi.RESERVATION_FEE,
          bi.DISCOUNT_AMOUNT,
          COALESCE(bi.CANCELLATION_PENALTY, 0) AS PENALTY_AMOUNT,
          COALESCE(bi.CHECKOUT_REFUND, 0) AS CHECKOUT_REFUND,
          COALESCE(bi.REFUNDABLE_AMOUNT, 0) AS REFUNDABLE_AMOUNT,
          COALESCE(bi.LATE_CHECKOUT_CHARGE, 0) AS LATE_CHECKOUT_CHARGE,
          bi.DISCOUNT_APPLIED,
          COALESCE(bi.REMARKS, '') AS BILLING_REMARKS,
          COALESCE(rt.NAME, 'Unassigned Room') AS ROOM_TYPE,
          r.ROOM_NUMBER
        FROM booking b
        JOIN billing bi ON b.IDNo = bi.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE b.IDNo = ?
      `;

      const bookingData = await queryDatabasePromise(bookingQuery, [bookingId]);

      if (bookingData.length === 0) {
        return null;
      }

      const b = bookingData[0];
      const customerId = b.customerId;
      const roomRate = parseFloat(b.ROOM_CHARGE);
      const billingQty = parseInt(b.QTY, 10) || 1;
      const originalRoomDays = parseInt(b.ORIGINAL_QTY, 10) || billingQty;
      const bookingStatus = (b.BOOKING_STATUS || '').toLowerCase();
      const isCancelled = bookingStatus === 'cancelled';
      const isCheckedOut = bookingStatus === 'check-out' || bookingStatus === 'checkout';

      // Billed room days: only reduce when guest left before original room period ended
      let roomDaysBilled = billingQty;
      let calendarActualDays = billingQty;
      if (isCheckedOut) {
        roomDaysBilled = Math.min(billingQty, originalRoomDays);
        if (b.CHECK_IN_DATE && b.CHECK_OUT_DATE) {
          const checkIn = new Date(b.CHECK_IN_DATE);
          const checkOut = new Date(b.CHECK_OUT_DATE);
          checkIn.setHours(0, 0, 0, 0);
          checkOut.setHours(0, 0, 0, 0);
          calendarActualDays = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
        }
      }

      // Get actual payments made for this booking
      const paymentsQuery = `
        SELECT AMOUNT_PAID, PAYMENT_TYPE
        FROM payments 
        WHERE BOOKING_ID = ?
      `;
      const paymentsData = await queryDatabasePromise(paymentsQuery, [bookingId]);
      
      // Calculate room amount and get billing values
      const roomAmount = roomRate * roomDaysBilled;
      const reservationFee = parseFloat(b.RESERVATION_FEE) || 0;
      const discountAmount = parseFloat(b.DISCOUNT_AMOUNT) || 0;
      const checkoutRefund = parseFloat(b.CHECKOUT_REFUND) || 0;
      const penaltyAmount = parseFloat(b.PENALTY_AMOUNT) || 0;
      const manualRefundAmount = parseFloat(b.REFUNDABLE_AMOUNT) || 0;
      
      // Calculate total payments made (includes refunds which are negative)
      const totalPaymentsMade = paymentsData.reduce((sum, payment) => {
        return sum + parseFloat(payment.AMOUNT_PAID);
      }, 0);
      
      // Calculate total paid before refund (only positive payments)
      const totalPaidBeforeRefund = paymentsData.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        // Exclude reservation_fee, discount, and refund payments; only count positive amounts
        if (
          payment.PAYMENT_TYPE === 'reservation_fee' ||
          payment.PAYMENT_TYPE === 'discount' ||
          payment.PAYMENT_TYPE === 'refund'
        ) {
          return sum;
        }
        return sum + Math.max(0, amount);
      }, 0);
      
      // Calculate refund amount (sum of negative payments or use CHECKOUT_REFUND)
      const refundAmountFromPayments = paymentsData.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        // Only count actual refund entries (negative amount + refund type)
        if (payment.PAYMENT_TYPE === 'refund' && amount < 0) {
          return sum + Math.abs(amount);
        }
        return sum;
      }, 0);
      
      // Use the larger of checkoutRefund from billing table or calculated refund from payments
      let refundAmount = Math.max(checkoutRefund, refundAmountFromPayments);
      if (isCancelled) {
        refundAmount = manualRefundAmount;
      }

      const netRoomAmount = roomAmount - reservationFee - discountAmount - (isCancelled ? 0 : checkoutRefund);
      
      let roomStatus = 'unpaid';
      if (totalPaymentsMade >= netRoomAmount) {
        roomStatus = 'paid';
      } else if (totalPaymentsMade > 0) {
        roomStatus = 'partial';
      }

      // Base room billing
      const roomItems = [{
        date: b.CHECK_IN_DATE,
        description: `${b.ROOM_TYPE}`,
        basePrice: roomRate,
        qty: roomDaysBilled,
        subTotal: roomRate * roomDaysBilled,
        status: roomStatus
      }];

      // Fetch customer data
      const customerQuery = `
        SELECT NAME AS customerName, ADDRESS 
        FROM customer 
        WHERE IDNo = ?
      `;
      const customerData = await queryDatabasePromise(customerQuery, [customerId]);

      // Fetch services (including custom services)
      const serviceQuery = `
        SELECT 
          bs.SERVICE_ID,
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE s.SERVICE_NAME
          END as SERVICE_NAME,
          CASE 
            WHEN bs.SERVICE_ID = -1 
            THEN bs.TOTAL_COST / NULLIF(bs.QTY, 0)
            ELSE s.SERVICE_COST
          END as SERVICE_COST,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS
        FROM booking_service bs
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.ACTIVE = 1 AND bs.BOOKING_ID = ?
      `;
      const serviceData = await queryDatabasePromise(serviceQuery, [bookingId]);

      // Fetch extensions
      const extensionQuery = `
        SELECT EXTEND_DATE, QTY, COST, PAYMENT_STATUS
        FROM booking_extension
        WHERE BOOKING_ID = ? AND ACTIVE = 1 AND QTY > 0
        ORDER BY EXTEND_DATE ASC, IDNo ASC
      `;
      const extensionData = await queryDatabasePromise(extensionQuery, [bookingId]);

      let extensionsToBill = extensionData;
      if (isCheckedOut && extensionData.length > 0) {
        const totalExtensionDays = extensionData.reduce((sum, ext) => sum + (parseInt(ext.QTY, 10) || 0), 0);
        const extensionDaysUsed = Math.max(0, Math.min(calendarActualDays - originalRoomDays, totalExtensionDays));

        if (extensionDaysUsed < totalExtensionDays) {
          let remainingUsed = extensionDaysUsed;
          extensionsToBill = [];

          extensionData.forEach(ext => {
            const extQty = parseInt(ext.QTY, 10) || 0;
            const keepQty = Math.min(extQty, remainingUsed);
            remainingUsed -= keepQty;

            if (keepQty > 0) {
              extensionsToBill.push({ ...ext, QTY: keepQty });
            }
          });
        }
      }

      // Format extensions
      extensionsToBill.forEach(ext => {
        roomItems.push({
          date: ext.EXTEND_DATE,
          description: `${b.ROOM_TYPE} (Extended)`,
          basePrice: ext.COST,
          qty: ext.QTY,
          subTotal: ext.COST * ext.QTY,
          status: ext.PAYMENT_STATUS
        });
      });

      const lateCheckoutChargeFromBilling = parseFloat(b.LATE_CHECKOUT_CHARGE) || 0;

      // Format services
      const serviceItems = serviceData.map(service => {
        const isLateCheckout = service.SERVICE_ID === 72;
        const totalCost = parseFloat(service.TOTAL_COST) || 0;
        const catalogCost = parseFloat(service.SERVICE_COST) || 0;
        const qty = parseInt(service.QTY, 10) || 1;

        let basePrice = catalogCost;
        let subTotal = totalCost;

        if (isLateCheckout) {
          // Late checkout is a flat fee — base price and subtotal must match the entered amount
          let feeAmount = totalCost;
          if (feeAmount <= 0 && lateCheckoutChargeFromBilling > 0) {
            feeAmount = lateCheckoutChargeFromBilling;
          } else if (feeAmount <= 0 && service.STATUS !== 'paid') {
            feeAmount = catalogCost;
          }
          basePrice = feeAmount;
          subTotal = feeAmount;
        }

        return {
          date: b.CHECK_IN_DATE,
          description: service.SERVICE_NAME,
          basePrice,
          qty: isLateCheckout ? '-' : service.QTY,
          subTotal,
          status: service.STATUS,
          serviceId: service.SERVICE_ID
        };
      });

      const penaltyItems = penaltyAmount > 0 ? [{
        date: b.CHECK_OUT_DATE || b.CHECK_IN_DATE,
        description: 'Cancellation Fee',
        basePrice: penaltyAmount,
        qty: 1,
        subTotal: penaltyAmount,
        status: 'penalty'
      }] : [];

      const baseChargeItems = [...roomItems, ...serviceItems];

      // Combine all items
      const allItems = [...baseChargeItems, ...penaltyItems];

      // Calculate subtotals
      const baseChargeSubTotal = baseChargeItems.reduce((sum, item) => sum + item.subTotal, 0);
      const subTotal = allItems.reduce((sum, item) => sum + item.subTotal, 0);
      const effectiveSubTotal = isCancelled ? baseChargeSubTotal : subTotal;

      const paidAmountAfterRefund = isCancelled
        ? Math.max(0, (totalPaidBeforeRefund || 0) - refundAmount)
        : totalPaymentsMade;

      const receiptData = {
        bookingId: b.bookingId,
        confNumber: b.CONFIRMATION_NUMBER,
        roomNumber: b.ROOM_NUMBER || null,
        customerName: customerData[0]?.customerName || '',
        address: customerData[0]?.ADDRESS || '',
        invoiceDate: new Date(b.CHECK_IN_DATE).toLocaleDateString(),
        paymentStatus: b.PAYMENT_STATUS,
        items: allItems,
        subTotal: subTotal,
        effectiveSubTotal,
        reservationFee: parseFloat(b.RESERVATION_FEE) || 0,
        discountAmount: parseFloat(b.DISCOUNT_AMOUNT) || 0,
        discountRemarks: (b.BILLING_REMARKS || '').trim(),
        checkoutRefund: checkoutRefund,
        refundAmount: refundAmount,
        totalPaidBeforeRefund: totalPaidBeforeRefund,
        penaltyAmount: penaltyAmount,
        discountApplied: b.DISCOUNT_APPLIED === 1 ? 1 : 0,
        isCancelled,
        paidAmountAfterRefund
      };

      // If billing.REMARKS is empty, fall back to latest Discount-category remark
      if (!receiptData.discountRemarks && receiptData.discountAmount > 0) {
        try {
          const remarkRows = await queryDatabasePromise(
            `SELECT REMARK_TEXT FROM remarks
             WHERE BOOKING_ID = ? AND CATEGORY = 'Discount' AND ACTIVE = 1
             ORDER BY IDNo DESC LIMIT 1`,
            [bookingId]
          );
          if (remarkRows.length && remarkRows[0].REMARK_TEXT) {
            receiptData.discountRemarks = String(remarkRows[0].REMARK_TEXT).trim();
          }
        } catch (remarkErr) {
          console.warn('Could not load discount remarks fallback:', remarkErr.message);
        }
      }

      return receiptData;
    } catch (error) {
      console.error('Error in getBilling:', error);
      throw error;
    }
  }

  // Get notifications
  static async getNotifications() {
    try {
      const query = `
        SELECT 
          b.IDNo AS id,
          b.ROOM_ID AS room_id,
          r.ROOM_NUMBER AS room_number,
          IFNULL(c.NAME, 'Guest') AS customer_name,
          b.CHECK_IN_DATE AS checkin_date,
          b.CHECK_OUT_DATE AS checkout_date,
          b.CONFIRMATION_NUMBER AS confirmation_number,
          b.GUESTS_COUNT AS guests_count,
          DATE_FORMAT(b.ENCODED_DT, '%Y-%m-%d %H:%i:%s') AS booking_time,
          b.NOTIFICATION_READ AS is_read
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE b.ACTIVE = 1
        ORDER BY b.ENCODED_DT DESC
        LIMIT 10
      `;
      
      const results = await queryDatabasePromise(query);

      const notifications = results.map(row => ({
        id: row.id,
        room_id: row.room_id,
        customer_name: row.customer_name,
        room_number: row.room_number,
        checkin_date: row.checkin_date,
        checkout_date: row.checkout_date,
        confirmation_number: row.confirmation_number,
        guests_count: row.guests_count,
        time: row.booking_time,
        icon: 'fa-bed', // Default icon
        color: 'blue',  // Default color
        read: row.is_read === 1 // Convert to boolean
      }));

      return notifications;
    } catch (error) {
      console.error('Error in getNotifications:', error);
      throw error;
    }
  }

  // Mark notifications as read
  static async markNotificationsAsRead() {
    try {
      const query = `
        UPDATE booking 
        SET NOTIFICATION_READ = 1 
        WHERE NOTIFICATION_READ = 0 AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(query);
      return result;
    } catch (error) {
      console.error('Error in markNotificationsAsRead:', error);
      throw error;
    }
  }

  // Process payment
  static async processPayment(params) {
    const { paymentMethod, bookingId, paymentNotes, paymentAmount, encodedBy } = params;

    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Step 1: Get billing info
        const billingQuery = `
          SELECT IDNo, ROOM_CHARGE, QTY, PAYMENT_STATUS, EXTEND_PAYMENT_STATUS, RESERVATION_FEE, DISCOUNT_AMOUNT, CANCELLATION_PENALTY
          FROM billing 
          WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1
        `;
        const billingRows = await new Promise((resolve, reject) => {
          connection.query(billingQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (billingRows.length === 0) {
          throw new Error("No billing record found.");
        }

        const billing = billingRows[0];
        const billingId = billing.IDNo;

        // Step 2: Calculate total amounts and determine payment allocation
        const originalQty = billing.QTY;
        const extendedQty = 0;

        // Calculate room amount - consider partial payments, reservation fee, and discount
        let fullRoomAmount = 0;
        if (billing.PAYMENT_STATUS !== 'paid' && originalQty > 0) {
          const totalRoomCost = parseFloat(billing.ROOM_CHARGE) * parseFloat(originalQty);
          
          // Get total room payments already made
          const roomPaymentsQuery = `
            SELECT COALESCE(SUM(AMOUNT_PAID), 0) as totalRoomPaid
            FROM payments 
            WHERE BOOKING_ID = ? AND PAYMENT_TYPE = 'room'
          `;
          const roomPaymentsRows = await new Promise((resolve, reject) => {
            connection.query(roomPaymentsQuery, [bookingId], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          
          const totalRoomPaid = parseFloat(roomPaymentsRows[0].totalRoomPaid) || 0;
          
          // Calculate net room cost (after reservation fee and discount)
          const netRoomCost = totalRoomCost - parseFloat(billing.RESERVATION_FEE) - parseFloat(billing.DISCOUNT_AMOUNT);
          fullRoomAmount = Math.max(0, netRoomCost - totalRoomPaid);
        }
        
        // Get unpaid extensions total
        const extensionQuery = `
          SELECT IDNo, QTY, COST FROM booking_extension 
          WHERE BOOKING_ID = ? AND PAYMENT_STATUS = 'unpaid' AND ACTIVE = 1
        `;
        const extensionRows = await new Promise((resolve, reject) => {
          connection.query(extensionQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        const totalExtensionAmount = extensionRows.reduce((sum, ext) => sum + (parseFloat(ext.QTY) * parseFloat(ext.COST)), 0);
        
        // Get services with remaining balance (exclude fully paid or overpaid services)
        // Include SERVICE_ID so we can prioritize specific services (e.g. Upgrade, Custom)
        // Only include ACTIVE = 1 services
        const serviceQuery = `
            SELECT 
              bs.IDNo, 
              bs.SERVICE_ID,
              bs.TOTAL_COST,
              COALESCE(SUM(p.AMOUNT_PAID), 0) as totalPaid,
              (bs.TOTAL_COST - COALESCE(SUM(p.AMOUNT_PAID), 0)) as remainingAmount
            FROM booking_service bs
            LEFT JOIN payments p ON p.BOOKING_SERVICE_ID = bs.IDNo AND p.PAYMENT_TYPE = 'service'
            WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
            GROUP BY bs.IDNo, bs.SERVICE_ID, bs.TOTAL_COST
            HAVING remainingAmount > 0
        `;
        
        const serviceRows = await new Promise((resolve, reject) => {
          connection.query(serviceQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        // Use remaining amount instead of total cost for payment allocation
        // Also, sort services so that:
        //  1) Custom / Upgrade services (SERVICE_ID = -1, 71) are paid first
        //  2) Within the same type, smaller remainingAmount are paid first
        const totalServiceAmount = serviceRows.reduce(
          (sum, service) => sum + parseFloat(service.remainingAmount),
          0
        );

        const priorityServiceIds = [-1, 71]; // -1 = custom, 71 = Upgrade
        serviceRows.sort((a, b) => {
          const aSpecial = priorityServiceIds.includes(parseInt(a.SERVICE_ID));
          const bSpecial = priorityServiceIds.includes(parseInt(b.SERVICE_ID));

          if (aSpecial && !bSpecial) return -1;
          if (!aSpecial && bSpecial) return 1;

          return parseFloat(a.remainingAmount) - parseFloat(b.remainingAmount);
        });
        
        // Get cancellation penalty and check if it's already paid
        const cancellationPenalty = parseFloat(billing.CANCELLATION_PENALTY) || 0;
        let unpaidCancellationPenalty = 0;
        if (cancellationPenalty > 0) {
          const penaltyPaymentsQuery = `
            SELECT COALESCE(SUM(AMOUNT_PAID), 0) as totalPenaltyPaid
            FROM payments 
            WHERE BOOKING_ID = ? AND PAYMENT_TYPE = 'cancellation_fee'
          `;
          const penaltyPaymentsRows = await new Promise((resolve, reject) => {
            connection.query(penaltyPaymentsQuery, [bookingId], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          const totalPenaltyPaid = parseFloat(penaltyPaymentsRows[0]?.totalPenaltyPaid) || 0;
          unpaidCancellationPenalty = Math.max(0, cancellationPenalty - totalPenaltyPaid);
        }
        
        // Calculate net balance
        // Note: reservation fee and discount are already deducted from fullRoomAmount in Step 3
        const reservationFee = parseFloat(billing.RESERVATION_FEE) || 0;
        const discountAmount = parseFloat(billing.DISCOUNT_AMOUNT) || 0;
        const grossTotal = fullRoomAmount + totalExtensionAmount + totalServiceAmount + unpaidCancellationPenalty;
        const netBalance = grossTotal; // No need to deduct reservation fee and discount again
        
        // Determine payment amount
        const paymentAmountToUse = paymentAmount !== null && paymentAmount !== undefined ? paymentAmount : netBalance;
        let remainingPayment = Math.min(paymentAmountToUse, netBalance);
        
        // Step 3: Process payments in priority order (Room -> Extensions -> Services)
        
        // 1. Pay room first
        if (remainingPayment > 0 && fullRoomAmount > 0) {
          const roomPaymentAmount = Math.min(remainingPayment, fullRoomAmount);

          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
              VALUES (?, ?, ?, ?, 'room', NOW(), ?, ?)`,
                                [bookingId, billingId, roomPaymentAmount, paymentMethod, encodedBy, paymentNotes || null],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });


          // Determine billing status: paid, partial, or unpaid
          let newPaymentStatus = 'unpaid';
          if (roomPaymentAmount >= fullRoomAmount) {
              newPaymentStatus = 'paid';
          } else if (roomPaymentAmount > 0) {
              newPaymentStatus = 'partial';
          }

          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE billing SET PAYMENT_STATUS = ?, PAYMENT_METHOD = ? WHERE IDNo = ?`,
              [newPaymentStatus, paymentMethod, billingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          remainingPayment -= roomPaymentAmount;
        }

        // 2. Pay extensions if remaining payment available
        if (remainingPayment > 0 && extensionRows.length > 0) {

        for (let ext of extensionRows) {
            if (remainingPayment <= 0) break;
            
            const extensionAmount = parseFloat(ext.QTY) * parseFloat(ext.COST);
            const extensionPaymentAmount = Math.min(remainingPayment, extensionAmount);

          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (
                BOOKING_ID, BOOKING_EXTENSION_ID, AMOUNT_PAID, PAYMENT_METHOD,
                                        PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS
              )
                                    VALUES (?, ?, ?, ?, 'extended', NOW(), ?, ?)`,
                                    [bookingId, ext.IDNo, extensionPaymentAmount, paymentMethod, encodedBy, paymentNotes || 'Extension payment'],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });


            // Determine extension status: paid, partial, or unpaid
            let newExtensionStatus = 'unpaid';
            if (extensionPaymentAmount >= extensionAmount) {
                newExtensionStatus = 'paid';
            } else if (extensionPaymentAmount > 0) {
                newExtensionStatus = 'partial';
            }

          await new Promise((resolve, reject) => {
            connection.query(
                `UPDATE booking_extension SET PAYMENT_STATUS = ? WHERE IDNo = ? AND ACTIVE = 1`,
                [newExtensionStatus, ext.IDNo],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
            
            remainingPayment -= extensionPaymentAmount;
          }
        }

        // 3. Pay services if remaining payment available
        if (remainingPayment > 0 && serviceRows.length > 0) {
          
        for (let service of serviceRows) {
            if (remainingPayment <= 0) break;
            
            const serviceCost = parseFloat(service.remainingAmount);
            const servicePaymentAmount = Math.min(remainingPayment, serviceCost);

                            await new Promise((resolve, reject) => {
                                connection.query(
                                    `INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                                    VALUES (?, ?, ?, ?, 'service', NOW(), ?, ?)`,
                                    [bookingId, service.IDNo, servicePaymentAmount, paymentMethod, encodedBy, paymentNotes || null],
                                    (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    }
                                );
                            });


            // Determine service status: paid, partial, or unpaid
            let newServiceStatus = 'unpaid';
            if (servicePaymentAmount >= serviceCost) {
                newServiceStatus = 'paid';
            } else if (servicePaymentAmount > 0) {
                newServiceStatus = 'partial';
            }

          await new Promise((resolve, reject) => {
            connection.query(
                `UPDATE booking_service SET STATUS = ? WHERE IDNo = ? AND ACTIVE = 1`,
                [newServiceStatus, service.IDNo],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
            
            remainingPayment -= servicePaymentAmount;
          }
        }

        // 4. Pay cancellation penalty if remaining payment available
        if (remainingPayment > 0 && unpaidCancellationPenalty > 0) {
          const penaltyPaymentAmount = Math.min(remainingPayment, unpaidCancellationPenalty);

          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
              VALUES (?, ?, ?, ?, 'cancellation_fee', NOW(), ?, ?)`,
              [bookingId, billingId, penaltyPaymentAmount, paymentMethod, encodedBy, paymentNotes],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          remainingPayment -= penaltyPaymentAmount;
        }
        

        // Step 5: Check if all balances are cleared, mark everything as 'paid'
        // Calculate remaining balance after this payment
        // We need to check if there are still unpaid amounts for room, extensions, and services
        
        // Check remaining room amount - consider partial payments, reservation fee, and discount
        const remainingRoomQuery = `
          SELECT 
            COALESCE((SELECT SUM(AMOUNT_PAID) FROM payments WHERE BOOKING_ID = ? AND PAYMENT_TYPE = 'room'), 0) as roomPaid,
            COALESCE((SELECT ROOM_CHARGE * QTY FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1), 0) as totalRoomCost,
            COALESCE((SELECT RESERVATION_FEE FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1), 0) as reservationFee,
            COALESCE((SELECT DISCOUNT_AMOUNT FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1), 0) as discountAmount
        `;
        const roomRows = await new Promise((resolve, reject) => {
          connection.query(remainingRoomQuery, [bookingId, bookingId, bookingId, bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        const roomPaid = parseFloat(roomRows[0].roomPaid) || 0;
        const totalRoomCost = parseFloat(roomRows[0].totalRoomCost) || 0;
        const remainingReservationFee = parseFloat(roomRows[0].reservationFee) || 0;
        const remainingDiscountAmount = parseFloat(roomRows[0].discountAmount) || 0;
        
        // Calculate net room cost (after reservation fee and discount)
        const netRoomCost = totalRoomCost - remainingReservationFee - remainingDiscountAmount;
        const remainingRoom = Math.max(0, netRoomCost - roomPaid);
        
        
        // Check remaining extension amounts
        const remainingExtensionQuery = `
          SELECT COALESCE(SUM(be.QTY * be.COST), 0) as totalExtensionCost,
                 COALESCE(SUM(CASE WHEN p.AMOUNT_PAID IS NULL THEN 0 ELSE p.AMOUNT_PAID END), 0) as extensionPaid
          FROM booking_extension be
          LEFT JOIN payments p ON p.BOOKING_EXTENSION_ID = be.IDNo AND p.PAYMENT_TYPE = 'extended'
          WHERE be.BOOKING_ID = ? AND be.ACTIVE = 1
        `;
        const remainingExtensionRows = await new Promise((resolve, reject) => {
          connection.query(remainingExtensionQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        const totalExtensionCost = parseFloat(remainingExtensionRows[0].totalExtensionCost) || 0;
        const extensionPaid = parseFloat(remainingExtensionRows[0].extensionPaid) || 0;
        const remainingExtensions = Math.max(0, totalExtensionCost - extensionPaid);
        
        // Check remaining service amounts - consider partial payments
        const remainingServiceQuery = `
          SELECT 
            bs.IDNo,
            bs.TOTAL_COST,
            COALESCE(SUM(p.AMOUNT_PAID), 0) as servicePaid
          FROM booking_service bs
          LEFT JOIN payments p ON p.BOOKING_SERVICE_ID = bs.IDNo AND p.PAYMENT_TYPE = 'service'
          WHERE bs.BOOKING_ID = ?
          GROUP BY bs.IDNo, bs.TOTAL_COST
        `;
        const remainingServiceRows = await new Promise((resolve, reject) => {
          connection.query(remainingServiceQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        let remainingServices = 0;
        for (let service of remainingServiceRows) {
          const serviceCost = parseFloat(service.TOTAL_COST);
          const servicePaid = parseFloat(service.servicePaid);
          const serviceRemaining = Math.max(0, serviceCost - servicePaid);
          remainingServices += serviceRemaining;
          
        }
        
        // Calculate total remaining balance
        const totalRemainingBalance = remainingRoom + remainingExtensions + remainingServices;
        
        
                    // If balance is zero or negative, mark all remaining items as 'paid'
                    if (totalRemainingBalance <= 0) {
          
          // Mark billing as paid
          if (billing.PAYMENT_STATUS !== 'paid') {
          await new Promise((resolve, reject) => {
            connection.query(
                `UPDATE billing SET PAYMENT_STATUS = 'paid' WHERE IDNo = ?`,
                [billingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          }

          // Mark all extensions as paid (only ACTIVE = 1)
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE BOOKING_ID = ? AND PAYMENT_STATUS != 'paid' AND ACTIVE = 1`,
              [bookingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
          
          // Mark all services as paid
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_service SET STATUS = 'paid' WHERE BOOKING_ID = ? AND STATUS != 'paid' AND ACTIVE = 1`,
              [bookingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Step 6: Insert payment notes into remarks table if provided
        if (paymentNotes && paymentNotes.trim() !== '') {
          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ENCODED_DT, ACTIVE)
              VALUES (?, 'Payment', ?, ?, NOW(), 1)`,
              [bookingId, paymentNotes.trim(), encodedBy],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Step 7: If this booking is part of a group with Master Billing, 
        // sync payment_status for all group members to match the current booking's status
        // IMPORTANT: Exclude joined bookings with separate billing (different dates)
        // Get GROUP_BOOKING_ID from the booking
        const groupIdQuery = `
          SELECT b.GROUP_BOOKING_ID, gb.BILLING_TYPE
          FROM booking b
          LEFT JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
          WHERE b.IDNo = ? AND b.ACTIVE = 1 
          LIMIT 1
        `;
        const groupIdRows = await new Promise((resolve, reject) => {
          connection.query(groupIdQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        // Only sync if it's Master Billing (BILLING_TYPE = 1)
        if (groupIdRows && groupIdRows.length > 0 && groupIdRows[0].GROUP_BOOKING_ID && groupIdRows[0].BILLING_TYPE === 1) {
          const groupBookingId = groupIdRows[0].GROUP_BOOKING_ID;
          
          // Get the payment_status of the CURRENT booking's billing record (the one that was just paid)
          const currentBillingQuery = `
            SELECT PAYMENT_STATUS, PAYMENT_METHOD 
            FROM billing 
            WHERE BOOKING_ID = ? 
            ORDER BY IDNo DESC 
            LIMIT 1
          `;
          const currentBillingRows = await new Promise((resolve, reject) => {
            connection.query(currentBillingQuery, [bookingId], (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
          
          if (currentBillingRows && currentBillingRows.length > 0) {
            const currentPaymentStatus = currentBillingRows[0].PAYMENT_STATUS;
            const currentPaymentMethod = currentBillingRows[0].PAYMENT_METHOD;
            
            // Get all bookings in the same group with their dates to identify joined bookings
            const allGroupBookingsQuery = `
              SELECT IDNo, CHECK_IN_DATE, CHECK_OUT_DATE
              FROM booking 
              WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1
              ORDER BY IDNo ASC
            `;
            const allGroupBookingsRows = await new Promise((resolve, reject) => {
              connection.query(allGroupBookingsQuery, [groupBookingId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
              });
            });
            
            if (allGroupBookingsRows && allGroupBookingsRows.length > 0) {
              // Get main booking (first booking - lowest ID)
              const mainBooking = allGroupBookingsRows[0];
              const mainCheckIn = mainBooking.CHECK_IN_DATE ? new Date(mainBooking.CHECK_IN_DATE).toISOString().split('T')[0] : null;
              const mainCheckOut = mainBooking.CHECK_OUT_DATE ? new Date(mainBooking.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
              
              // Check if current booking is a joined booking with SEPARATE BILLING (different dates from main)
              // IMPORTANT: If joined booking has SAME dates as main, it should SYNC (not separate billing)
              const currentBookingRow = allGroupBookingsRows.find(b => b.IDNo === bookingId);
              
              if (!currentBookingRow) {
                // Current booking not found in group - skip sync
              } else {
                const currentCheckIn = currentBookingRow.CHECK_IN_DATE ? new Date(currentBookingRow.CHECK_IN_DATE).toISOString().split('T')[0] : null;
                const currentCheckOut = currentBookingRow.CHECK_OUT_DATE ? new Date(currentBookingRow.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
                const isCurrentBookingJoinedWithSeparateBilling = (
                  currentCheckIn !== mainCheckIn || currentCheckOut !== mainCheckOut
                );
                
                // If current booking is a joined booking with DIFFERENT dates (separate billing), DON'T sync
                // If current booking has SAME dates as main (even if joined later), it SHOULD sync
                if (isCurrentBookingJoinedWithSeparateBilling) {
                  // Joined booking with separate billing - don't sync
                } else {
                // Current booking is main or has same dates as main - sync to all bookings with same dates
                // This includes: main booking + any joined bookings with same dates
                // Filter out only joined bookings with DIFFERENT dates (separate billing)
                const bookingsToSync = allGroupBookingsRows.filter(b => {
                  const bookingCheckIn = b.CHECK_IN_DATE ? new Date(b.CHECK_IN_DATE).toISOString().split('T')[0] : null;
                  const bookingCheckOut = b.CHECK_OUT_DATE ? new Date(b.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
                  return bookingCheckIn === mainCheckIn && bookingCheckOut === mainCheckOut;
                });
                
                const bookingIdsToSync = bookingsToSync.map(b => b.IDNo);
                
                // Update billing records only for bookings with same dates (exclude joined bookings)
                if (bookingIdsToSync.length > 0) {
                  await new Promise((resolve, reject) => {
                    connection.query(
                      `UPDATE billing 
                       SET PAYMENT_STATUS = ?, PAYMENT_METHOD = ? 
                       WHERE BOOKING_ID IN (?)`,
                      [currentPaymentStatus, currentPaymentMethod, bookingIdsToSync],
                      (err) => {
                        if (err) reject(err);
                        else resolve();
                      }
                    );
                  });
                }
              }
              }
            }
          }
        }

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();

        return {
          success: true,
          message: 'Payment and services processed successfully.'
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in processPayment:', error);
      throw error;
    }
  }

  // Late check-out
  static async lateCheckout(params) {
    const { bookingId, hours } = params;

    try {
      // Default check-out time
      const defaultCheckOutTime = '18:00:00';

      // Query to update check-out time
      const query = `
        UPDATE booking
        SET CHECK_OUT_DATE = CONCAT(DATE(CHECK_OUT_DATE), ' ', TIME(DATE_ADD(TIME(?), INTERVAL ? HOUR)))
        WHERE IDNo = ?
      `;

      const result = await queryDatabasePromise(query, [defaultCheckOutTime, hours, bookingId]);

      if (result.affectedRows === 0) {
        throw new Error('Booking not found or inactive.');
      }

      return {
        success: true,
        message: `Check-out extended to ${hours} hour(s)`
      };

    } catch (error) {
      console.error('Error in lateCheckout:', error);
      throw error;
    }
  }

  // Get guest types
  static async getGuestTypes() {
    try {
      const query = `
        SELECT IDNo, TYPE
        FROM guest_type
        WHERE ACTIVE = 1
      `;

      const results = await queryDatabasePromise(query);

      return results;

    } catch (error) {
      console.error('Error in getGuestTypes:', error);
      throw error;
    }
  }

  // Get guest level
  static async getGuestLevel() {
    try {
      const query = `
        SELECT IDNo, TYPE
        FROM guest_level
        WHERE ACTIVE = 1
      `;

      const results = await queryDatabasePromise(query);

      return results;

    } catch (error) {
      console.error('Error in getGuestLevel:', error);
      throw error;
    }
  }

  // Get pending bookings
  static async getPendingBookings(roomId) {
    try {
      const query = `
        SELECT 
          ROOM_NUMBER,
          customer.NAME AS name,
          DATE_FORMAT(booking.CHECK_IN_DATE, '%b %d, %Y') AS start_date,
          DATE_FORMAT(booking.CHECK_OUT_DATE, '%b %d, %Y') AS end_date,
          booking.BOOKING_STATUS AS status
        FROM 
          booking
        JOIN 
          customer ON customer.IDNo = booking.CUSTOMER_ID
        LEFT JOIN room ON room.IDNo = booking.ROOM_ID
        WHERE 
          booking.ROOM_ID = ? 
          AND (booking.BOOKING_STATUS = 'pending' OR booking.BOOKING_STATUS = 'check-In')
      `;

      const results = await queryDatabasePromise(query, [roomId]);

      return results;

    } catch (error) {
      console.error('Error in getPendingBookings:', error);
      throw error;
    }
  }

  // Search customer
  static async searchCustomer(searchQuery) {
    try {
      const query = `
        SELECT 
          customer.IDNo as CUSTOMER_ID, 
          customer.NAME AS NAME, 
          guest_level.TYPE AS LEVEL, 
          guest_type.TYPE AS TYPE, 
          customer.CONTACTNo AS CONTACT_NO 
        FROM customer 
        LEFT JOIN guest_level ON guest_level.IDNo = customer.LEVEL
        LEFT JOIN guest_type ON guest_type.IDNo = customer.TYPE
        WHERE customer.NAME LIKE ? 
          AND (customer.IS_GROUP IS NULL OR customer.IS_GROUP != 1) 
        LIMIT 10
      `;

      const results = await queryDatabasePromise(query, [`%${searchQuery}%`]);

      return results;

    } catch (error) {
      console.error('Error in searchCustomer:', error);
      throw error;
    }
  }

  // Get available rooms
  static async getAvailableRooms(params) {
    const { startDate, endDate } = params;

    try {
      // Format dates to YYYY-MM-DD
      const formatDate = (date) => {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${year}-${month}-${day}`;
      };

      const startDateFormatted = formatDate(startDate);
      const endDateFormatted = formatDate(endDate);

      // Query for available rooms
      const roomsQuery = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW, 
               (
            SELECT 1 
            FROM booking b2 
            WHERE b2.ROOM_ID = r.IDNo 
              AND DATE(b2.CHECK_OUT_DATE) = ? 
            LIMIT 1
          ) AS checkoutToday,
          (
            SELECT CASE 
              WHEN b3.LATE_CHECKOUT = 1 THEN 'L/O'
              WHEN b3.LATE_CHECKOUT = 0 OR b3.LATE_CHECKOUT IS NULL THEN 'R/O'
              ELSE NULL
            END
            FROM booking b3 
            WHERE b3.ROOM_ID = r.IDNo 
              AND DATE(b3.CHECK_OUT_DATE) = ? 
            LIMIT 1
          ) AS checkoutType,
          (
            SELECT CASE 
              WHEN b4.CHECK_IN_STATUS = 0 THEN 'L/I'
              WHEN b4.CHECK_IN_STATUS = 1 THEN 'R/I'
              ELSE NULL
            END
            FROM booking b4 
            WHERE b4.ROOM_ID = r.IDNo 
              AND DATE(b4.CHECK_IN_DATE) = ? 
            LIMIT 1
          ) AS checkinType
        FROM room r
        LEFT JOIN booking b ON r.IDNo = b.ROOM_ID
            AND DATE(b.CHECK_IN_DATE) < ?
            AND DATE(b.CHECK_OUT_DATE) > ?
        WHERE r.ROOM_STATUS !=3
          AND (b.ROOM_ID IS NULL OR DATE(b.CHECK_OUT_DATE) = ?)
        ORDER BY r.ROOM_NUMBER ASC;
      `;

      // Query for unassigned bookings (IS_DIRECT_RESERVATION = 1)
      const unassignedBookingsQuery = `
        SELECT 
          b.IDNo as bookingId,
          b.CUSTOMER_ID,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.BOOKING_CHANNEL,
          b.GUESTS_COUNT,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.CHECK_IN_STATUS,
          b.IS_DIRECT_RESERVATION,
          b.BED_COUNT,
          c.NAME as customerName,
          c.CONTACTNo as customerContact,
          c.TYPE as guestType,
          c.LEVEL as guestLevel,
          bill.ROOM_CHARGE as price,
          bill.QTY as diffindays,
          bill.PAYMENT_STATUS,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1 
          AND b.IS_DIRECT_RESERVATION = 1
          AND b.ROOM_ID = 0
          AND DATE(b.CHECK_IN_DATE) < ?
          AND DATE(b.CHECK_OUT_DATE) > ?
        ORDER BY b.CHECK_IN_DATE ASC;
      `;

      // Execute both queries
      const roomsResults = await queryDatabasePromise(roomsQuery, [
        startDateFormatted, 
        startDateFormatted, 
        endDateFormatted, 
        endDateFormatted, 
        startDateFormatted, 
        startDateFormatted
      ]);

      const unassignedBookingsResults = await queryDatabasePromise(unassignedBookingsQuery, [
        endDateFormatted, 
        startDateFormatted
      ]);

      return {
        rooms: roomsResults,
        unassignedBookings: unassignedBookingsResults
      };

    } catch (error) {
      console.error('Error in getAvailableRooms:', error);
      throw error;
    }
  }

  // Get room details
  static async getRoomDetails(roomId) {
    try {
      const query = `
        SELECT 
          room.ROOM_NUMBER, 
          room.ROOM_VIEW, 
          room_type.NAME AS ROOM_TYPE, 
          room.ROOM_PRICE, 
          room.ROOM_MAX, 
          room.ROOM_BED, 
          GROUP_CONCAT(DISTINCT amenity.NAME SEPARATOR ', ') AS AMENITIES,
          rsp.SEASON_ID,
          s.NAME AS SEASON_NAME,
          s.START_DATE,
          s.END_DATE,
          rsp.ROOM_BED AS BED_COUNT,
          rsp.BOOKING_TYPE,
      rsp.PRICE AS SEASONAL_PRICE
        FROM room 
        JOIN room_type ON room.ROOM_TYPE_ID = room_type.IDNo 
        LEFT JOIN room_amenities ON room.IDNo = room_amenities.ROOM_ID 
        LEFT JOIN amenity ON room_amenities.AMENITY_ID = amenity.IDNo 
        LEFT JOIN room_season_price rsp ON rsp.ROOM_ID = room.IDNo 
        LEFT JOIN season s ON s.IDNo = rsp.SEASON_ID
        WHERE room.IDNo = ?
        GROUP BY room.ROOM_NUMBER, rsp.SEASON_ID, rsp.BOOKING_TYPE, rsp.ROOM_BED
      `;

      const results = await queryDatabasePromise(query, [roomId]);

      if (results.length === 0) {
        return null;
      }

      // Extract static room info from the first row
      const base = results[0];
      const seasonalPrices = results.map(row => ({
        seasonId: row.SEASON_ID,
        seasonName: row.SEASON_NAME,
        bedCount: row.BED_COUNT,
        bookingType: row.BOOKING_TYPE,
        price: row.SEASONAL_PRICE,
        startDate: row.START_DATE,
        endDate: row.END_DATE
      }));

      const roomDetails = {
        ROOM_NUMBER: base.ROOM_NUMBER,
        ROOM_VIEW: base.ROOM_VIEW,
        ROOM_TYPE: base.ROOM_TYPE,
        ROOM_PRICE: base.ROOM_PRICE,
        ROOM_MAX: base.ROOM_MAX,
        ROOM_BED: base.ROOM_BED,
        AMENITIES: base.AMENITIES,
        SEASONAL_PRICES: seasonalPrices
      };

      return roomDetails;

    } catch (error) {
      console.error('Error in getRoomDetails:', error);
      throw error;
    }
  }

  // Update room payment status
  static async updateRoomPaymentStatus(params) {
    const { bookingId, status } = params;

    try {
      // console.log("🔹 Running Query: UPDATE billing SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?");
      // console.log("🔹 Query Parameters:", [status, bookingId]);

      const query = `UPDATE billing SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ?`;

      const result = await queryDatabasePromise(query, [status, bookingId]);

      // If this booking is part of a group with Master Billing, 
      // sync payment_status for all group members to match the current booking's status
      // IMPORTANT: Exclude joined bookings with separate billing (different dates)
      // Get GROUP_BOOKING_ID and BILLING_TYPE from the booking
      const groupIdQuery = `
        SELECT b.GROUP_BOOKING_ID, gb.BILLING_TYPE
        FROM booking b
        LEFT JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1 
        LIMIT 1
      `;
      const groupIdResult = await queryDatabasePromise(groupIdQuery, [bookingId]);
      
      // Only sync if it's Master Billing (BILLING_TYPE = 1)
      if (groupIdResult && groupIdResult.length > 0 && groupIdResult[0].GROUP_BOOKING_ID && groupIdResult[0].BILLING_TYPE === 1) {
        const groupBookingId = groupIdResult[0].GROUP_BOOKING_ID;
        
        // Get all bookings in the same group with their dates to identify joined bookings
        const allGroupBookingsQuery = `
          SELECT IDNo, CHECK_IN_DATE, CHECK_OUT_DATE
          FROM booking 
          WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1
          ORDER BY IDNo ASC
        `;
        const allGroupBookings = await queryDatabasePromise(allGroupBookingsQuery, [groupBookingId]);
        
        if (allGroupBookings && allGroupBookings.length > 0) {
          // Get main booking (first booking - lowest ID)
          const mainBooking = allGroupBookings[0];
          const mainCheckIn = mainBooking.CHECK_IN_DATE ? new Date(mainBooking.CHECK_IN_DATE).toISOString().split('T')[0] : null;
          const mainCheckOut = mainBooking.CHECK_OUT_DATE ? new Date(mainBooking.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
          
          // Check if current booking is a joined booking with SEPARATE BILLING (different dates from main)
          // IMPORTANT: If joined booking has SAME dates as main, it should SYNC (not separate billing)
          const currentBookingRow = allGroupBookings.find(b => b.IDNo === bookingId);
          
          if (!currentBookingRow) {
            // Current booking not found in group - skip sync
          } else {
            const currentCheckIn = currentBookingRow.CHECK_IN_DATE ? new Date(currentBookingRow.CHECK_IN_DATE).toISOString().split('T')[0] : null;
            const currentCheckOut = currentBookingRow.CHECK_OUT_DATE ? new Date(currentBookingRow.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
            const isCurrentBookingJoinedWithSeparateBilling = (
              currentCheckIn !== mainCheckIn || currentCheckOut !== mainCheckOut
            );
            
            // If current booking is a joined booking with DIFFERENT dates (separate billing), DON'T sync
            // If current booking has SAME dates as main (even if joined later), it SHOULD sync
            if (isCurrentBookingJoinedWithSeparateBilling) {
              // Joined booking with separate billing - don't sync
            } else {
            // Current booking is main or has same dates as main - sync to all bookings with same dates
            // This includes: main booking + any joined bookings with same dates
            // Filter out only joined bookings with DIFFERENT dates (separate billing)
            const bookingsToSync = allGroupBookings.filter(b => {
              const bookingCheckIn = b.CHECK_IN_DATE ? new Date(b.CHECK_IN_DATE).toISOString().split('T')[0] : null;
              const bookingCheckOut = b.CHECK_OUT_DATE ? new Date(b.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
              return bookingCheckIn === mainCheckIn && bookingCheckOut === mainCheckOut;
            });
            
            const bookingIdsToSync = bookingsToSync.map(b => b.IDNo);
            
            // Update billing records only for bookings with same dates (exclude joined bookings)
            if (bookingIdsToSync.length > 0) {
              const updateGroupBillingQuery = `
                UPDATE billing 
                SET PAYMENT_STATUS = ? 
                WHERE BOOKING_ID IN (?)
              `;
              await queryDatabasePromise(updateGroupBillingQuery, [status, bookingIdsToSync]);
            }
            }
          }
        }
      }

      return result;

    } catch (error) {
      console.error('Error in updateRoomPaymentStatus:', error);
      throw error;
    }
  }

  // Update extend payment status
  static async updateExtendPaymentStatus(params) {
    const { bookingId, status } = params;

    try {
      // console.log("🔹 Running Query: UPDATE billing SET EXTEND_PAYMENT_STATUS = ? WHERE BOOKING_ID = ?");
      // console.log("🔹 Query Parameters:", [status, bookingId]);

      const query = `UPDATE billing SET EXTEND_PAYMENT_STATUS = ? WHERE BOOKING_ID = ?`;

      const result = await queryDatabasePromise(query, [status, bookingId]);

      return result;

    } catch (error) {
      console.error('Error in updateExtendPaymentStatus:', error);
      throw error;
    }
  }

  // Get group booking data
  static async getGroupBookingData(filter, dateFrom, dateTo, groupId = null) {
    try {
      let dateCondition = '';
      
      // Check if custom date range is provided
      if (dateFrom && dateTo && filter === 'custom') {
        dateCondition = `AND DATE(b.ENCODED_DT) >= '${dateFrom}' AND DATE(b.ENCODED_DT) <= '${dateTo}'`;
      } else {
        if (filter === 'today') {
          dateCondition = 'AND DATE(b.ENCODED_DT) = CURDATE()';
        } else if (filter === 'last3days') {
          dateCondition = 'AND DATE(b.ENCODED_DT) >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)';
        } else if (filter === 'thisweek') {
          dateCondition = 'AND YEARWEEK(b.ENCODED_DT) = YEARWEEK(CURDATE())';
        } else if (filter === 'thismonth') {
          dateCondition = 'AND YEAR(b.ENCODED_DT) = YEAR(CURDATE()) AND MONTH(b.ENCODED_DT) = MONTH(CURDATE())';
        }
      }

      // Add group ID filter if provided
      let groupIdCondition = '';
      if (groupId && String(groupId) !== '0' && String(groupId) !== '') {
        groupIdCondition = `AND gb.IDNo = ${parseInt(groupId)}`;
      }

      const query = `
        SELECT 
          gb.IDNo AS group_id,
          gb.GROUP_NAME,
          gb.CONTACT_NO,
          gb.NUMBER_OF_ROOMS,
          gb.REMARKS AS REMARKS,
          gb.BILLING_TYPE,
          b.BOOKING_CHANNEL,
          MAX(b.AGENCY_PAYER) AS AGENCY_PAYER,
          /* Total active remarks across all bookings in this group */
          (
            SELECT COUNT(*) FROM remarks rm 
            WHERE rm.ACTIVE = 1 
              AND rm.BOOKING_ID IN (SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = gb.IDNo)
          ) AS remarks_count,
          GROUP_CONCAT(r.ROOM_NUMBER ORDER BY r.ROOM_NUMBER SEPARATOR ', ') AS room_numbers,
          COUNT(b.IDNo) AS total_bookings,
          -- Calculate total payment including services, then subtract group discount and reservation fee
          (
            COALESCE(SUM(
              (bill.ROOM_CHARGE * bill.QTY) + 
              COALESCE((
                SELECT SUM(bs.TOTAL_COST) 
                FROM booking_service bs 
                WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1
              ), 0) +
              COALESCE((
                SELECT SUM(be.COST * be.QTY) 
                FROM booking_extension be 
                WHERE be.BOOKING_ID = b.IDNo AND be.ACTIVE = 1
              ), 0) +
              COALESCE(bill.CANCELLATION_PENALTY, 0)
            ), 0)
            - COALESCE(gb.GROUP_DISCOUNT, 0)
            - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
          ) AS TOTAL_PAYMENT,
          -- Calculate total paid from payments table (exclude discount rows)
          (
            SELECT COALESCE(SUM(p.AMOUNT_PAID), 0)
            FROM payments p
            JOIN booking b2 ON p.BOOKING_ID = b2.IDNo
            WHERE b2.GROUP_BOOKING_ID = gb.IDNo
              AND p.PAYMENT_TYPE IN ('room','service','extended')
          ) AS TOTAL_PAID,
          -- Get all statuses in a group
          GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS SEPARATOR ', ') AS all_statuses,
          -- Status Overview Logic
          CASE 
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) = 'cancelled' 
              THEN 'ALL CANCELLED'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%cancelled%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%pending%' 
              THEN 'PARTIAL CANCELLED'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%cancelled%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-in%' 
              THEN 'CANCELLED & CHECK-IN'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%cancelled%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-out%' 
              THEN 'CANCELLED & CHECK-OUT'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-in%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-out%' 
              THEN 'PARTIAL CHECK-OUT'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%pending%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-in%' 
              THEN 'PENDING & CHECK-IN'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%pending%' 
              AND GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) LIKE '%check-out%' 
              THEN 'PENDING & CHECK-OUT'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) = 'check-in' 
              THEN 'ALL CHECK-IN'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) = 'check-out' 
              THEN 'ALL CHECK-OUT'
            WHEN GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS) = 'pending' 
              THEN 'ALL PENDING'
            ELSE 'MIXED STATUS'
          END AS STATUS_OVERVIEW,
          -- Payment Status Logic (similar to getBookingDataEnhanced)
          CASE 
            WHEN COUNT(CASE WHEN bill.PAYMENT_STATUS = 'paid' THEN 1 END) = COUNT(b.IDNo)
              AND COUNT(CASE WHEN EXISTS(
                SELECT 1 FROM booking_service bs 
                WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1 AND bs.STATUS = 'unpaid'
              ) THEN 1 END) = 0
              AND COUNT(CASE WHEN EXISTS(
                SELECT 1 FROM booking_extension be 
                WHERE be.BOOKING_ID = b.IDNo AND be.PAYMENT_STATUS = 'unpaid' AND be.ACTIVE = 1
              ) THEN 1 END) = 0
              THEN 'paid'
            WHEN COUNT(CASE WHEN bill.PAYMENT_STATUS = 'paid' THEN 1 END) > 0
              THEN 'partial_paid'
            ELSE 'unpaid'
          END AS PAYMENT_STATUS,
          gb.ENCODED_BY,
          COALESCE(u.FULLNAME, 'System') AS ENCODED_BY_NAME,
          gb.EDITED_BY,
          COALESCE(u2.FULLNAME, NULL) AS EDITED_BY_NAME
        FROM booking b
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN user_info u ON gb.ENCODED_BY = u.IDNo
        LEFT JOIN user_info u2 ON gb.EDITED_BY = u2.IDNo
        WHERE b.GROUP_BOOKING_ID IS NOT NULL
          ${dateCondition}
          ${groupIdCondition}
        GROUP BY gb.IDNo
        ORDER BY gb.IDNo DESC
      `;

      const results = await queryDatabasePromise(query);

      return results;

    } catch (error) {
      console.error('Error in getGroupBookingData:', error);
      throw error;
    }
  }

  // Get group booking details
  static async getGroupBookingDetails(groupId) {
    try {
      const bookingQuery = `
        SELECT 
          b.IDNo AS booking_id,
          c.NAME AS CUSTOMER_NAME,
          r.ROOM_NUMBER,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          COALESCE(bill.ROOM_PRICE, 0) AS ROOM_PRICE,
          COALESCE(bill.QTY, 0) AS ROOM_QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + 
          COALESCE(bill.AMENITIES_CHARGE, 0) + 
          COALESCE(bill.SERVICES_CHARGE, 0) AS TOTAL_COST,
          -- Join booking_service with services to get SERVICE_NAME (including custom services)
          COALESCE(GROUP_CONCAT(DISTINCT 
            CASE 
              WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
              THEN bs.CUSTOM_NAME
              ELSE s.SERVICE_NAME
            END
            ORDER BY 
            CASE 
              WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
              THEN bs.CUSTOM_NAME
              ELSE s.SERVICE_NAME
            END
            SEPARATOR ', '), 'No Services') AS SERVICES_AVAILED
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN booking_service bs ON b.IDNo = bs.BOOKING_ID
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo AND bs.SERVICE_ID != -1 -- Fetch the correct service name (exclude custom services from join)
        WHERE b.GROUP_BOOKING_ID = ?
        GROUP BY b.IDNo, c.NAME, r.ROOM_NUMBER, b.CHECK_IN_DATE, b.CHECK_OUT_DATE, b.BOOKING_STATUS
      `;

      const results = await queryDatabasePromise(bookingQuery, [groupId]);

      // Compute group-level summary: rooms, services, extensions, discount, reservation fee, grand total
      const summaryQuery = `
        SELECT 
          COALESCE(SUM(bill.ROOM_CHARGE * bill.QTY), 0) AS room_total,
          COALESCE((
            SELECT SUM(bs.TOTAL_COST)
            FROM booking_service bs
            JOIN booking b2 ON bs.BOOKING_ID = b2.IDNo
            WHERE b2.GROUP_BOOKING_ID = ? AND bs.ACTIVE = 1
          ), 0) AS services_total,
          COALESCE((
            SELECT SUM(be.COST * be.QTY)
            FROM booking_extension be
            JOIN booking b3 ON be.BOOKING_ID = b3.IDNo
            WHERE b3.GROUP_BOOKING_ID = ? AND be.ACTIVE = 1
          ), 0) AS extensions_total,
          COALESCE(gb.GROUP_DISCOUNT, 0) AS group_discount,
          COALESCE(gb.GROUP_RESERVATION_FEE, 0) AS reservation_fee
        FROM booking b
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
      `;

      const [summaryRow] = await queryDatabasePromise(summaryQuery, [groupId, groupId, groupId]);

      const totalBeforeLess = (parseFloat(summaryRow?.room_total || 0)
        + parseFloat(summaryRow?.services_total || 0)
        + parseFloat(summaryRow?.extensions_total || 0));
      const grandTotal = totalBeforeLess
        - parseFloat(summaryRow?.group_discount || 0)
        - parseFloat(summaryRow?.reservation_fee || 0);

      // Compute total paid from payments table for this group
      const paidQuery = `
        SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS paidTotal
        FROM payments p
        JOIN booking b ON p.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
          AND p.PAYMENT_TYPE IN ('room','service')
      `;
      const [paidRow] = await queryDatabasePromise(paidQuery, [groupId]);

      const summary = {
        roomTotal: totalBeforeLess - parseFloat(summaryRow?.services_total || 0) - parseFloat(summaryRow?.extensions_total || 0),
        servicesTotal: parseFloat(summaryRow?.services_total || 0),
        extensionsTotal: parseFloat(summaryRow?.extensions_total || 0),
        discount: parseFloat(summaryRow?.group_discount || 0),
        reservationFee: parseFloat(summaryRow?.reservation_fee || 0),
        grandTotal: grandTotal,
        paidTotal: parseFloat(paidRow?.paidTotal || 0),
        balanceTotal: Math.max(0, grandTotal - parseFloat(paidRow?.paidTotal || 0))
      };

      return { bookingDetails: results, summary };

    } catch (error) {
      console.error('Error in getGroupBookingDetails:', error);
      throw error;
    }
  }

  // Aggregate remarks for a whole group
  static async getGroupRemarksByGroup(groupId) {
    try {
      // First booking id
      const firstBookingRows = await queryDatabasePromise(
        `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo ASC LIMIT 1`,
        [groupId]
      );

      // Collect remarks from remarks table across all group bookings
      const remarkRows = await queryDatabasePromise(
        `SELECT r.IDNo, r.BOOKING_ID, r.CATEGORY, r.REMARK_TEXT, r.ENCODED_BY, r.ENCODED_DT, r.EDITDED_BY, r.EDITDED_DT, r.ACTIVE,
                u1.FULLNAME as ENCODED_BY_NAME,
                u2.FULLNAME as EDITDED_BY_NAME
         FROM remarks r
         LEFT JOIN user_info u1 ON r.ENCODED_BY = u1.IDno
         LEFT JOIN user_info u2 ON r.EDITDED_BY = u2.IDno
         WHERE r.ACTIVE = 1 AND r.BOOKING_ID IN (SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ?)
         ORDER BY r.ENCODED_DT DESC`,
        [groupId]
      );

      // Include group_booking.REMARKS as a virtual row at the top if present
      const groupRows = await queryDatabasePromise(
        `SELECT REMARKS FROM group_booking WHERE IDNo = ?`,
        [groupId]
      );
      const groupRemarks = (groupRows[0]?.REMARKS || '').trim();
      if (groupRemarks) {
        // Avoid duplication: if the same exact text already exists in remarks table, do not add virtual row
        const hasDuplicate = remarkRows.some(r => (r?.REMARK_TEXT || '').trim() === groupRemarks);
        if (!hasDuplicate) {
        remarkRows.unshift({
          IDNo: 0,
          BOOKING_ID: firstBookingRows[0]?.IDNo || null,
          CATEGORY: 'Group',
          REMARK_TEXT: groupRemarks,
          ENCODED_BY: null,
          ENCODED_DT: null,
          EDITDED_BY: null,
          EDITDED_DT: null,
          ACTIVE: 1,
          ENCODED_BY_NAME: 'Group Booking',
          EDITDED_BY_NAME: null
        });
        }
      }

      return remarkRows;
    } catch (err) {
      console.error('Error fetching group remarks:', err);
      return [];
    }
  }

  // Add a remark for a group (attach to first booking and update group_booking.REMARKS)
  static async addGroupRemark({ groupId, category, remarkText, encodedBy }) {
    try {
      const firstRows = await queryDatabasePromise(
        `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo ASC LIMIT 1`,
        [groupId]
      );
      const firstBookingId = firstRows[0]?.IDNo;
      if (!firstBookingId) return { success: false, message: 'No booking found for group' };

      // Insert into remarks table
      await queryDatabasePromise(
        `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) VALUES (?, ?, ?, ?, ?)`,
        [firstBookingId, category || 'Booking', remarkText, encodedBy, encodedBy]
      );

      // Also update/append to group_booking.REMARKS (append with separator)
      const groupRows = await queryDatabasePromise(`SELECT REMARKS FROM group_booking WHERE IDNo = ?`, [groupId]);
      const current = groupRows[0]?.REMARKS || '';
      const merged = current ? `${current}\n--\n${remarkText}` : remarkText;
      await queryDatabasePromise(`UPDATE group_booking SET REMARKS = ? WHERE IDNo = ?`, [merged, groupId]);

      return { success: true, message: 'Group remark added' };
    } catch (err) {
      console.error('Error adding group remark:', err);
      return { success: false, message: 'Failed to add group remark' };
    }
  }

  // Get edit group booking details
  static async getEditGroupBookingDetails(groupBookingId) {
    try {
      // Get group booking info
      const groupQuery = `
        SELECT
          gb.IDNo,
          gb.GROUP_NAME,
          gb.CONTACT_NO,
          gb.NUMBER_OF_ROOMS,
          gb.GROUP_RESERVATION_FEE,
          gb.GROUP_DISCOUNT,
          gb.REMARKS,
          gb.CHANNEL_BOOKING_ID,
          gb.ENCODED_BY,
          gb.ENCODED_DT,
          gb.BILLING_TYPE,
          gb.SENIOR_PWD_DISCOUNT_PERCENT,
          gb.SENIOR_PWD_ROOM_COUNT
        FROM group_booking gb
        WHERE gb.IDNo = ?
      `;

      const groupResult = await queryDatabasePromise(groupQuery, [groupBookingId]);

      if (!groupResult || groupResult.length === 0) {
        return null;
      }

      const groupBooking = groupResult[0];

      // Get individual bookings in the group
      const bookingsQuery = `
        SELECT
          b.IDNo as bookingId,
          b.CUSTOMER_ID,
          c.NAME as fullname,
          c.CONTACTNo as number,
          c.TYPE as guestType,
          c.LEVEL as guestLevel,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_BED,
          r.ROOM_VIEW,
          r.ROOM_FLOOR,
          r.ROOM_SIZE,
          r.ROOM_DESCRIPTION,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.BOOKING_CHANNEL,
          b.GUESTS_COUNT,
          b.LATE_CHECKOUT,
          b.HOLD_PENDING,
          b.CHECK_IN_STATUS,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.AGENCY_ID,
          b.AGENCY_PAYER,
          b.IS_DIRECT_RESERVATION,
          bill.PAYMENT_STATUS,
          bill.RESERVATION_FEE,
          bill.DISCOUNT_AMOUNT,
          bill.ROOM_CHARGE,
          bill.QTY
        FROM booking b
        JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.GROUP_BOOKING_ID = ?
        ORDER BY b.IDNo
      `;

      const bookingsResult = await queryDatabasePromise(bookingsQuery, [groupBookingId]);

      // Get total paid across the group (room + service payments)
      const paidSumQuery = `
        SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS totalPaid
        FROM payments p
        JOIN booking b ON p.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
          AND p.PAYMENT_TYPE IN ('room','service','extended')
      `;
      const paidSumResult = await queryDatabasePromise(paidSumQuery, [groupBookingId]);
      const groupTotalPaid = parseFloat(paidSumResult?.[0]?.totalPaid || 0);

      // Get billing type from database (1 = Master, 0 = Individual)
      const isConsolidatedBilling = groupBooking.BILLING_TYPE === 1;

      // Get services for the group (including custom services)
      const servicesQuery = `
        SELECT
          bs.BOOKING_ID,
          bs.SERVICE_ID,
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE s.SERVICE_NAME
          END as SERVICE_NAME,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS
        FROM booking_service bs
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        JOIN booking b ON bs.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
      `;

      const servicesResult = await queryDatabasePromise(servicesQuery, [groupBookingId]);
      
      // Debug: Log services found

      // Format date range
      const firstBooking = bookingsResult[0];
      if (!firstBooking) {
        return null;
      }

      const checkInDate = new Date(firstBooking.CHECK_IN_DATE);
      const checkOutDate = new Date(firstBooking.CHECK_OUT_DATE);
      const diffInTime = checkOutDate.getTime() - checkInDate.getTime();
      const diffInDays = Math.round(diffInTime / (1000 * 3600 * 24));

      const checkInFormatted = checkInDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const checkOutFormatted = checkOutDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const daterange = `${checkInFormatted} to ${checkOutFormatted} (${diffInDays} night/s)`;

      // Get selected rooms and prices
      const selectedRooms = bookingsResult.map(b => b.ROOM_ID).join(',');
      const selectedRoomPrices = bookingsResult.map(b => b.ROOM_CHARGE).join(',');

      // Calculate bed requirements from selected rooms
      const bedRequirements = { bed1: 0, bed2: 0 };
      bookingsResult.forEach(booking => {
        const bedCount = parseInt(booking.ROOM_BED, 10);
        if (bedCount === 1) {
          bedRequirements.bed1++;
        } else if (bedCount === 2) {
          bedRequirements.bed2++;
        }
      });

      // Group services by booking ID and categorize them
      const servicesByBooking = {};
      const groupServices = {
        breakfastAdult: { qty: '0', price: '0', id: '' },
        breakfastKid: { qty: '0', price: '0', id: '' },
        pickup: { price: '0', id: '' },
        dropoff: { price: '0', id: '' }
      };

      servicesResult.forEach(service => {
        if (!servicesByBooking[service.BOOKING_ID]) {
          servicesByBooking[service.BOOKING_ID] = [];
        }
        servicesByBooking[service.BOOKING_ID].push(service);

        // Categorize group-level services (services for any booking in the group)
        // Check if this service belongs to any booking in the group
        const belongsToGroup = bookingsResult.some(booking => booking.bookingId === service.BOOKING_ID);
        if (belongsToGroup) {
          const serviceName = service.SERVICE_NAME.toLowerCase();
          
          // Use service ID matching as primary method, with name fallback
          if (service.SERVICE_ID === 74 || (serviceName.includes('adult') && serviceName.includes('breakfast'))) {
            // console.log('✅ Found breakfast adult service');
            groupServices.breakfastAdult = {
              qty: service.QTY,
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 75 || (serviceName.includes('kid') && serviceName.includes('breakfast'))) {
            // console.log('✅ Found breakfast kid service');
            groupServices.breakfastKid = {
              qty: service.QTY,
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 76 || serviceName.includes('pick')) {
            // console.log('✅ Found pickup service');
            groupServices.pickup = {
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 77 || serviceName.includes('drop')) {
            // console.log('✅ Found dropoff service');
            groupServices.dropoff = {
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          }
        }
      });

      // Detect if breakfast is applied individually
      // If breakfast service exists in MORE THAN ONE booking, it's individual
      const breakfastAdultBookings = servicesResult.filter(s => {
        const serviceName = s.SERVICE_NAME.toLowerCase();
        return s.SERVICE_ID === 74 || (serviceName.includes('adult') && serviceName.includes('breakfast'));
      }).map(s => s.BOOKING_ID);
      
      const breakfastKidBookings = servicesResult.filter(s => {
        const serviceName = s.SERVICE_NAME.toLowerCase();
        return s.SERVICE_ID === 75 || (serviceName.includes('kid') && serviceName.includes('breakfast'));
      }).map(s => s.BOOKING_ID);
      
      const uniqueBreakfastBookings = new Set([...breakfastAdultBookings, ...breakfastKidBookings]);
      const isBreakfastIndividual = uniqueBreakfastBookings.size > 1;

      return {
        groupBookingId: groupBooking.IDNo,
        groupName: groupBooking.GROUP_NAME,
        groupContact: groupBooking.CONTACT_NO,
        numberOfRooms: groupBooking.NUMBER_OF_ROOMS,
        reservationFee: groupBooking.GROUP_RESERVATION_FEE,
        discount: groupBooking.GROUP_DISCOUNT,
        seniorPwdDiscountPercent: groupBooking.SENIOR_PWD_DISCOUNT_PERCENT || 0,
      seniorPwdRoomCount: groupBooking.SENIOR_PWD_ROOM_COUNT || 0,
        remarks: groupBooking.REMARKS,
        channelBookingId: groupBooking.CHANNEL_BOOKING_ID || '',
        selectedRooms,
        selectedRoomPrice: selectedRoomPrices,
        qty: diffInDays,
        daterange,
        guestType: bookingsResult[0]?.guestType, // Default guest type
        guestLevel: bookingsResult[0]?.guestLevel, // Default guest level
        checkInStatus: firstBooking.CHECK_IN_STATUS,
        checkOutStatus: firstBooking.LATE_CHECKOUT,
        holdPending: firstBooking.HOLD_PENDING,
        paymentStatus: firstBooking.PAYMENT_STATUS,
        bookingRoute: firstBooking.BOOKING_CHANNEL,
        agencyId: firstBooking.AGENCY_ID,
        agencyPayer: firstBooking.AGENCY_PAYER || 'agency',
        consolidatedBilling: isConsolidatedBilling, // Derived from billing data
        bedRequirements: bedRequirements, // Calculated from selected rooms
        breakfastIndividual: isBreakfastIndividual, // Detected: true if breakfast exists in multiple bookings
        // Services data
        breakfastAdultQty: groupServices.breakfastAdult.qty || '0',
        breakfastAdultPrice: groupServices.breakfastAdult.price || '0',
        breakfastAdultId: groupServices.breakfastAdult.id || '',
        breakfastKidQty: groupServices.breakfastKid.qty || '0',
        breakfastKidPrice: groupServices.breakfastKid.price || '0',
        breakfastKidId: groupServices.breakfastKid.id || '',
        pickupServiceId: groupServices.pickup.id || '',
        pickupPrice: groupServices.pickup.price || '0',
        dropoffServiceId: groupServices.dropoff.id || '',
        dropoffPrice: groupServices.dropoff.price || '0',
        // Individual booking data for form population
        bookings: bookingsResult,
        // expose group-wide paid figures for edit prefill
        totalPaid: groupTotalPaid,
        paidAmount: groupTotalPaid
      };

    } catch (error) {
      console.error('Error in getEditGroupBookingDetails:', error);
      throw error;
    }
  }

  // Get group info for joining existing group
  static async getGroupInfo(groupId) {
    try {
      const query = `
        SELECT
          gb.IDNo,
          gb.GROUP_NAME as groupName,
          gb.CONTACT_NO as groupContact,
          gb.NUMBER_OF_ROOMS as numberOfRooms,
          gb.BILLING_TYPE as billingType,
          gb.REMARKS as remarks,
          MIN(b.CHECK_IN_DATE) as earliestCheckIn,
          MAX(b.CHECK_OUT_DATE) as latestCheckOut,
          COUNT(DISTINCT b.IDNo) as existingBookingCount,
          GROUP_CONCAT(DISTINCT r.ROOM_NUMBER ORDER BY r.ROOM_NUMBER SEPARATOR ', ') as existingRooms
        FROM group_booking gb
        LEFT JOIN booking b ON gb.IDNo = b.GROUP_BOOKING_ID AND b.ACTIVE = 1
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE gb.IDNo = ?
        GROUP BY gb.IDNo, gb.GROUP_NAME, gb.CONTACT_NO, gb.NUMBER_OF_ROOMS, gb.BILLING_TYPE, gb.REMARKS
      `;

      const result = await queryDatabasePromise(query, [groupId]);

      if (!result || result.length === 0) {
        return null;
      }

      return result[0];
    } catch (error) {
      console.error('Error in getGroupInfo:', error);
      throw error;
    }
  }

  // Get group voucher data
  static async getGroupVoucherData(groupId) {
    try {
      // Get group booking info with confirmation number from first booking
      const groupQuery = `
        SELECT
          gb.IDNo,
          gb.GROUP_NAME,
          gb.CONTACT_NO,
          gb.GROUP_RESERVATION_FEE,
          gb.GROUP_DISCOUNT,
          gb.REMARKS,
          MIN(b.CHECK_IN_DATE) AS dateFrom,
          MAX(b.CHECK_OUT_DATE) AS dateTo,
          (SELECT b2.CONFIRMATION_NUMBER 
           FROM booking b2 
           WHERE b2.GROUP_BOOKING_ID = gb.IDNo AND b2.ACTIVE = 1 
           ORDER BY b2.IDNo ASC 
           LIMIT 1) AS confirmationNumber
        FROM group_booking gb
        JOIN booking b ON gb.IDNo = b.GROUP_BOOKING_ID
        WHERE gb.IDNo = ? AND b.ACTIVE = 1
        GROUP BY gb.IDNo
      `;

      const groupResult = await queryDatabasePromise(groupQuery, [groupId]);

      if (!groupResult || groupResult.length === 0) {
        return null;
      }

      const groupBooking = groupResult[0];

      // Room numbers change too often to print reliably - count only, no room numbers on the voucher
      const roomsQuery = `
        SELECT COUNT(DISTINCT b.ROOM_ID) AS room_count
        FROM booking b
        JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
      `;
      const roomsResult = await queryDatabasePromise(roomsQuery, [groupId]);
      const roomCount = roomsResult?.[0]?.room_count || 0;
      const roomNumbers = `${roomCount} Room${roomCount === 1 ? '' : 's'}`;

      // Calculate room charges (sum of all room charges)
      const roomChargesQuery = `
        SELECT COALESCE(SUM(bill.ROOM_CHARGE * bill.QTY), 0) AS roomCharges
        FROM booking b
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
      `;
      const roomChargesResult = await queryDatabasePromise(roomChargesQuery, [groupId]);
      const roomCharges = parseFloat(roomChargesResult?.[0]?.roomCharges || 0);

      // Calculate services total (sum of all services, excluding late checkout)
      // Late checkout service ID is typically 72
      const servicesTotalQuery = `
        SELECT COALESCE(SUM(bs.TOTAL_COST), 0) AS servicesTotal
        FROM booking_service bs
        JOIN booking b ON bs.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ? 
          AND bs.ACTIVE = 1
          AND bs.SERVICE_ID != 72
      `;
      const servicesTotalResult = await queryDatabasePromise(servicesTotalQuery, [groupId]);
      const servicesTotal = parseFloat(servicesTotalResult?.[0]?.servicesTotal || 0);

      // Calculate total (room charges + services - discount - reservation fee)
      const total = roomCharges + servicesTotal - parseFloat(groupBooking.GROUP_DISCOUNT || 0) - parseFloat(groupBooking.GROUP_RESERVATION_FEE || 0);

      // Get total paid
      const paidQuery = `
        SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS totalPaid
        FROM payments p
        JOIN booking b ON p.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
          AND p.PAYMENT_TYPE IN ('room','service','extended')
      `;
      const paidResult = await queryDatabasePromise(paidQuery, [groupId]);
      const paidAmount = parseFloat(paidResult?.[0]?.totalPaid || 0);

      // Calculate balance
      const balance = Math.max(0, total - paidAmount);

      // Get breakfast totals (sum across all bookings in group)
      // Using service IDs: 74 = Breakfast Adult, 75 = Breakfast Kid, 76 = Pickup, 77 = Dropoff
      const breakfastQuery = `
        SELECT 
          SUM(CASE WHEN bs.SERVICE_ID = 74 THEN bs.QTY ELSE 0 END) AS breakfastAdult,
          SUM(CASE WHEN bs.SERVICE_ID = 75 THEN bs.QTY ELSE 0 END) AS breakfastKid,
          SUM(CASE WHEN bs.SERVICE_ID = 76 THEN bs.TOTAL_COST ELSE 0 END) AS pickup,
          SUM(CASE WHEN bs.SERVICE_ID = 77 THEN bs.TOTAL_COST ELSE 0 END) AS dropoff
        FROM booking_service bs
        JOIN booking b ON bs.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ? AND bs.ACTIVE = 1
      `;
      const breakfastResult = await queryDatabasePromise(breakfastQuery, [groupId]);

      // Get check-out status (0 = normal, 1 = late checkout)
      const checkoutQuery = `
        SELECT MAX(CASE WHEN b.LATE_CHECKOUT = 1 THEN 1 ELSE 0 END) AS checkOutStatus
        FROM booking b
        WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
      `;
      const checkoutResult = await queryDatabasePromise(checkoutQuery, [groupId]);
      const checkOutStatus = checkoutResult?.[0]?.checkOutStatus || 0;

      return {
        groupId: groupBooking.IDNo,
        groupName: groupBooking.GROUP_NAME || 'Group Booking',
        groupContact: groupBooking.CONTACT_NO || '',
        dateFrom: groupBooking.dateFrom ? new Date(groupBooking.dateFrom).toISOString().split('T')[0] : '',
        dateTo: groupBooking.dateTo ? new Date(groupBooking.dateTo).toISOString().split('T')[0] : '',
        roomSummary: roomNumbers,
        remarks: groupBooking.REMARKS || '',
        breakfastAdult: parseInt(breakfastResult?.[0]?.breakfastAdult || 0),
        breakfastKid: parseInt(breakfastResult?.[0]?.breakfastKid || 0),
        pickup: parseFloat(breakfastResult?.[0]?.pickup || 0),
        dropoff: parseFloat(breakfastResult?.[0]?.dropoff || 0),
        total: total,
        paidAmount: paidAmount,
        balance: balance,
        checkOutStatus: checkOutStatus,
        lateCheckoutFee: 0,
        discount: parseFloat(groupBooking.GROUP_DISCOUNT || 0),
        reservationFee: parseFloat(groupBooking.GROUP_RESERVATION_FEE || 0),
        confirmationNumber: groupBooking.confirmationNumber || null,
        roomCharges: roomCharges,
        servicesTotal: servicesTotal
      };

    } catch (error) {
      console.error('Error in getGroupVoucherData:', error);
      throw error;
    }
  }

  // Update group booking
  static async updateGroupBooking(data) {
    const {
      groupBookingId,
      selectedRooms,
      selectedRoomPrice,
      qty,
      daterange,
      groupName,
      groupContact,
      numberOfRooms,
      paymentStatus,
      bookingRoute,
      guestType,
      guestLevel,
      checkInStatus,
      checkOutStatus,
      holdPending,
      remarks,
      agencyId = null,
      agencyPayer = null,
      channelBookingId = null,
      breakfastAdultQty,
      breakfastAdultPrice,
      breakfastAdultId,
      breakfastKidQty,
      breakfastKidPrice,
      breakfastKidId,
      breakfastIndividual = false,
      pickupServiceId,
      pickupPrice,
      dropoffServiceId,
      dropoffPrice,
      reservationFee = 0,
      discount = 0,
      consolidatedBilling = true, // Default: Master Billing (changed from false to true)
      lateCheckoutFee = 0,
      encodedBy,
      date,
      seniorPwdDiscountPercent = 0,
      seniorPwdRoomCount = 0,
      perRoomDiscounts = [],
      individualBookingDates = null // Individual booking dates if they differ from main date range
    } = data;

    const holdPendingFlag = (holdPending === true || holdPending === 1 || holdPending === '1' || holdPending === 'true') ? 1 : 0;


    // Helper: parse daterange "MMM DD, YYYY to MMM DD, YYYY (..optional..)"
    const moment = require('moment');
    const [rawCheckIn = '', rawCheckOut = ''] = (daterange || '').split(' to ');
    const normalizeDate = (raw, isCheckIn) => {
      if (!raw) return null;
      const clean = raw.split(' (')[0].trim();
      const time = isCheckIn ? '06:00:00' : (checkOutStatus == 1 ? '23:00:00' : '18:00:00');
      const parsed = moment(clean, 'MMM DD, YYYY');
      if (!parsed.isValid()) return null;
      return `${parsed.format('YYYY-MM-DD')} ${time}`;
    };
    const checkInDate = normalizeDate(rawCheckIn, true);
    const checkOutDate = normalizeDate(rawCheckOut, false);
    if (!checkInDate || !checkOutDate) {
      throw new Error('Invalid date range supplied for group booking update');
    }

    const processedAgencyId = bookingRoute === 'agency' ? (agencyId || null) : null;
    const processedAgencyPayer = (bookingRoute === 'agency' && agencyPayer)
      ? (agencyPayer === 'guest' ? 'guest' : 'agency')
      : (bookingRoute === 'agency' ? 'agency' : null);

    // Get connection for transaction
    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
    });

    try {
      // Begin transaction
      await new Promise((resolve, reject) => connection.beginTransaction(err => (err ? reject(err) : resolve())));

      // Update group_booking table
      // Note: ENCODED_BY is NOT updated (it should remain as the original creator)
      // EDITED_BY and EDITED_DT track who last edited and when
      const updateGroupQuery = `
        UPDATE group_booking
        SET GROUP_NAME = ?, CONTACT_NO = ?, NUMBER_OF_ROOMS = ?, GROUP_RESERVATION_FEE = ?, GROUP_DISCOUNT = ?, REMARKS = ?, CHANNEL_BOOKING_ID = ?, BILLING_TYPE = ?, SENIOR_PWD_DISCOUNT_PERCENT = ?, SENIOR_PWD_ROOM_COUNT = ?, EDITED_BY = ?, EDITED_DT = ?
        WHERE IDNo = ?
      `;

      await connection.promise().query(updateGroupQuery, [
        groupName,
        groupContact,
        numberOfRooms,
        0, // GROUP_RESERVATION_FEE removed - always set to 0
        parseFloat(discount) || 0,
        remarks || '',
        bookingRoute === 'booking-channel' ? (channelBookingId || null) : null,
        consolidatedBilling ? 1 : 0, // 1 = Master, 0 = Individual
        parseFloat(seniorPwdDiscountPercent) || 0.00,
        parseInt(seniorPwdRoomCount, 10) || 0,
        encodedBy, // EDITED_BY - user who edited
        date, // EDITED_DT - when it was edited
        groupBookingId
      ]);

      // Get existing bookings for this group
      const existingBookingsQuery = `SELECT IDNo, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo ASC`;
      const [existingBookings] = await connection.promise().query(existingBookingsQuery, [groupBookingId]);
      const existingRoomIds = existingBookings.map(b => b.ROOM_ID);
      // IMPORTANT: Use the ORIGINAL first booking (lowest ID) as the main booking for consolidated entries
      // This ensures that joined bookings don't become the main booking
      const firstBookingId = existingBookings && existingBookings.length > 0 ? existingBookings[0].IDNo : null;

      // Parse new selected rooms - ensure consistent data types
      const newRoomIds = (selectedRooms || '').split(',').filter(Boolean).map(id => parseInt(id.trim()));
      const newRoomPrices = (selectedRoomPrice || '').split('|').filter(p => p.trim() !== '').map(p => parseFloat(p.replace(/,/g, '')) || 0);
      const perRoomDiscountsArray = Array.isArray(perRoomDiscounts)
        ? perRoomDiscounts
        : (typeof perRoomDiscounts === 'string' ? perRoomDiscounts.split(',').map(d => parseFloat(d) || 0) : []);

      // Handle room additions/removals - now comparing integers with integers
      const roomsToAdd = newRoomIds.filter(id => !existingRoomIds.includes(id));
      const roomsToRemove = existingRoomIds.filter(id => !newRoomIds.includes(id));
      const roomsToUpdate = newRoomIds.filter(id => existingRoomIds.includes(id));

      // Remove bookings for rooms no longer in the group
      if (roomsToRemove.length > 0) {
        const removeBookingIds = existingBookings
          .filter(b => roomsToRemove.includes(b.ROOM_ID))
          .map(b => b.IDNo);

        if (removeBookingIds.length > 0) {
          // Delete payments first
          const paymentPlaceholders = removeBookingIds.map(() => '?').join(',');
          await connection.promise().query(`DELETE FROM payments WHERE BOOKING_ID IN (${paymentPlaceholders})`, removeBookingIds);
          // Delete booking services
          const servicePlaceholders = removeBookingIds.map(() => '?').join(',');
          await connection.promise().query(`DELETE FROM booking_service WHERE BOOKING_ID IN (${servicePlaceholders})`, removeBookingIds);
          // Delete billing records
          const billingPlaceholders = removeBookingIds.map(() => '?').join(',');
          await connection.promise().query(`DELETE FROM billing WHERE BOOKING_ID IN (${billingPlaceholders})`, removeBookingIds);
          // Delete bookings
          const bookingPlaceholders = removeBookingIds.map(() => '?').join(',');
          await connection.promise().query(`DELETE FROM booking WHERE IDNo IN (${bookingPlaceholders})`, removeBookingIds);
          // Delete customers (if not used elsewhere)
          const customerIds = existingBookings
            .filter(b => roomsToRemove.includes(b.ROOM_ID))
            .map(b => b.CUSTOMER_ID);
          if (customerIds.length > 0) {
            await connection.promise().query('DELETE FROM customer WHERE IDNo IN (?)', [customerIds]);
          }
        }
      }

      // Update existing bookings or add new ones
      for (let index = 0; index < newRoomIds.length; index++) {
        const roomId = newRoomIds[index];
        const roomPrice = newRoomPrices[index] || 0;
        const isExistingRoom = existingRoomIds.includes(parseInt(roomId));

        if (isExistingRoom) {
          // Update existing booking
          const existingBooking = existingBookings.find(b => b.ROOM_ID === parseInt(roomId));
          if (existingBooking) {
            // IMPORTANT: Check if this is the MAIN booking (lowest ID), not just index === 0
            // The main booking should always be the original first booking (lowest ID), not a joined booking
            const isMainBooking = existingBooking.IDNo === firstBookingId;
            // Check if this booking has individual dates (different from main date range)
            const individualDates = data.individualBookingDates && data.individualBookingDates[existingBooking.IDNo];
            
            // IMPORTANT: Check if booking originally had different dates (joined booking)
            // Even if not in individualBookingDates, preserve original dates if different from main
            const mainBooking = existingBookings[0];
            const mainCheckIn = mainBooking ? moment(mainBooking.CHECK_IN_DATE) : moment(checkInDate);
            const mainCheckOut = mainBooking ? moment(mainBooking.CHECK_OUT_DATE) : moment(checkOutDate);
            const existingCheckIn = moment(existingBooking.CHECK_IN_DATE);
            const existingCheckOut = moment(existingBooking.CHECK_OUT_DATE);
            
            const originallyHadDifferentDates = (
              existingCheckIn.format('YYYY-MM-DD') !== mainCheckIn.format('YYYY-MM-DD') ||
              existingCheckOut.format('YYYY-MM-DD') !== mainCheckOut.format('YYYY-MM-DD')
            );
            
            // Use individual dates if provided, otherwise preserve original dates if different from main
            let finalCheckInDate = checkInDate;
            let finalCheckOutDate = checkOutDate;
            
            if (individualDates) {
              // Use dates from form
              finalCheckInDate = individualDates.checkIn;
              finalCheckOutDate = individualDates.checkOut;
            } else if (originallyHadDifferentDates) {
              // Preserve original dates (joined booking)
              finalCheckInDate = existingBooking.CHECK_IN_DATE;
              finalCheckOutDate = existingBooking.CHECK_OUT_DATE;
            }
            
            // Preserve original time component (hours/min/sec) from existing booking
            const preserveTimeFromExisting = (newDateStr, existingDateTime) => {
              const newMoment = moment(newDateStr);
              const existingMoment = moment(existingDateTime);
              if (!newMoment.isValid() || !existingMoment.isValid()) return newDateStr;
              return newMoment
                .hour(existingMoment.hour())
                .minute(existingMoment.minute())
                .second(existingMoment.second())
                .millisecond(0)
                .format('YYYY-MM-DD HH:mm:ss');
            };

            const finalCheckInWithTime = preserveTimeFromExisting(finalCheckInDate, existingBooking.CHECK_IN_DATE);
            const finalCheckOutWithTime = preserveTimeFromExisting(finalCheckOutDate, existingBooking.CHECK_OUT_DATE);

            // Generate new confirmation number for updated booking (use final check-in date)
            const roomQuery = 'SELECT ROOM_NUMBER FROM room WHERE IDNo = ?';
            const [roomResult] = await connection.promise().query(roomQuery, [roomId]);
            const roomNumber = roomResult[0]?.ROOM_NUMBER || '';
            
            // Generate confirmation number in format: YYYYMMDD0ROOMNUMBER
            const datePart = moment(finalCheckInWithTime).format('YYYYMMDD');
            const confirmationNumber = `${datePart}0${roomNumber}`;

            // IMPORTANT: Only main booking (lowest ID) should have remarks
            // (isMainBooking already declared above)
            
            // Update booking (use final dates)
            await connection.promise().query(`
              UPDATE booking
              SET CHECK_IN_DATE = ?, CHECK_OUT_DATE = ?, BOOKING_CHANNEL = ?, CHECK_IN_STATUS = ?, LATE_CHECKOUT = ?, HOLD_PENDING = ?, REMARKS = ?, CONFIRMATION_NUMBER = ?, AGENCY_ID = ?, AGENCY_PAYER = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE IDNo = ?
            `, [
              finalCheckInWithTime, finalCheckOutWithTime, bookingRoute, checkInStatus, checkOutStatus, holdPendingFlag,
              isMainBooking ? remarks : '', confirmationNumber, processedAgencyId, processedAgencyPayer, encodedBy, date, existingBooking.IDNo
            ]);

            // Sync remarks to remarks table for the main booking row (lowest ID booking)
            if (isMainBooking) {
              const trimmed = (remarks || '').trim();
              if (trimmed !== '') {
                // Upsert: if a Booking-category remark exists, update it; otherwise insert
                const [existingRemarkRows] = await connection.promise().query(
                  `SELECT IDNo FROM remarks WHERE BOOKING_ID = ? AND CATEGORY = 'Booking' AND ACTIVE = 1 LIMIT 1`,
                  [existingBooking.IDNo]
                );

                if (Array.isArray(existingRemarkRows) && existingRemarkRows.length > 0) {
                  await connection.promise().query(
                    `UPDATE remarks SET REMARK_TEXT = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`,
                    [trimmed, encodedBy, existingRemarkRows[0].IDNo]
                  );
                } else {
                  await connection.promise().query(
                    `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) VALUES (?, 'Booking', ?, ?, ?)`,
                    [existingBooking.IDNo, trimmed, encodedBy, encodedBy]
                  );
                }
              } else {
                // If remarks cleared, soft-delete existing Booking-category remarks
                await connection.promise().query(
                  `UPDATE remarks SET ACTIVE = 0, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP WHERE BOOKING_ID = ? AND CATEGORY = 'Booking' AND ACTIVE = 1`,
                  [encodedBy, existingBooking.IDNo]
                );
              }
            }

            // Calculate billing amounts based on consolidated billing
            // IMPORTANT: For bookings with different dates, calculate QTY based on actual nights
            // Reuse individualDates and originallyHadDifferentDates variables already declared above
            let finalQty = qty; // Default to main qty
            
            if (individualDates) {
              // Calculate actual nights from form dates
              const checkInMoment = moment(individualDates.checkIn);
              const checkOutMoment = moment(individualDates.checkOut);
              finalQty = checkOutMoment.diff(checkInMoment, 'days');
            } else if (originallyHadDifferentDates) {
              // Calculate actual nights from original dates (joined booking)
              // Re-calculate from existing booking dates to ensure accuracy
              const existingCheckInMoment = moment(existingBooking.CHECK_IN_DATE);
              const existingCheckOutMoment = moment(existingBooking.CHECK_OUT_DATE);
              finalQty = existingCheckOutMoment.diff(existingCheckInMoment, 'days');
              console.log(`   Booking ${existingBooking.IDNo} has ${finalQty} nights (from original dates, different from main ${qty} nights)`);
            }
            
            // Ensure finalQty is at least 1 (safety check)
            // IMPORTANT: For joined bookings, we must preserve their QTY
            if (finalQty <= 0) {
              console.warn(`⚠️ Warning: Booking ${existingBooking.IDNo} has invalid QTY (${finalQty})`);
              
              // Try to get original QTY from billing first
              const [billingCheck] = await connection.promise().query(
                'SELECT QTY FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1',
                [existingBooking.IDNo]
              );
              
              if (billingCheck && billingCheck.length > 0 && billingCheck[0].QTY > 0) {
                finalQty = billingCheck[0].QTY;
                console.log(`   Using original QTY from billing: ${finalQty}`);
              } else if (originallyHadDifferentDates) {
                // For joined bookings, calculate from dates again as fallback
                const existingCheckInMoment = moment(existingBooking.CHECK_IN_DATE);
                const existingCheckOutMoment = moment(existingBooking.CHECK_OUT_DATE);
                const calculatedQty = existingCheckOutMoment.diff(existingCheckInMoment, 'days');
                if (calculatedQty > 0) {
                  finalQty = calculatedQty;
                  console.log(`   Recalculated QTY from dates: ${finalQty}`);
                } else {
                  finalQty = qty; // Last resort fallback
                  console.log(`   Fallback to main QTY: ${finalQty}`);
                }
              } else {
                finalQty = qty; // Fallback to main qty
                console.log(`   Fallback to main QTY: ${finalQty}`);
              }
            }
            
            let roomChargeForBilling, reservationFeeForBilling, discountForBilling;

            // IMPORTANT: Use isMainBooking (already declared above) to determine main booking
            // The main booking should always be the original first booking (lowest ID), not a joined booking
            if (consolidatedBilling && isMainBooking) {
              // Main booking in consolidated billing (lowest ID booking)
              // IMPORTANT: Main booking should only include its OWN charge plus other bookings with SAME dates
              // Joined bookings (different dates) should be EXCLUDED from main total
              
              // Get main booking dates for comparison
              const mainBooking = existingBookings.find(b => b.IDNo === firstBookingId) || existingBookings[0];
              const mainCheckIn = moment(mainBooking ? mainBooking.CHECK_IN_DATE : checkInDate);
              const mainCheckOut = moment(mainBooking ? mainBooking.CHECK_OUT_DATE : checkOutDate);
              
              // Calculate total room charges - ONLY include bookings with same dates as main
              // EXCLUDE joined bookings (those with different dates)
              let totalRoomCharges = 0;
              
              // IMPORTANT: Only process bookings that have the same dates as the main booking
              // The main booking itself (index === 0) should be included, plus any other bookings with same dates
              // BUT: We should only include bookings that are NOT joined bookings (different dates)
              for (let i = 0; i < newRoomIds.length; i++) {
                const otherBooking = existingBookings.find(b => b.ROOM_ID === parseInt(newRoomIds[i]));
                if (otherBooking) {
                  // Check if this booking has individual dates (joined booking)
                  const otherIndividualDates = data.individualBookingDates && data.individualBookingDates[otherBooking.IDNo];
                  
                  // If has individual dates, it's a joined booking - SKIP it (has separate billing)
                  if (otherIndividualDates) {
                    continue; // Skip joined bookings
                  }
                  
                  // Check if booking has different dates from main (even without individualDates in form)
                  const otherCheckIn = moment(otherBooking.CHECK_IN_DATE);
                  const otherCheckOut = moment(otherBooking.CHECK_OUT_DATE);
                  const hasDifferentDates = (
                    otherCheckIn.format('YYYY-MM-DD') !== mainCheckIn.format('YYYY-MM-DD') ||
                    otherCheckOut.format('YYYY-MM-DD') !== mainCheckOut.format('YYYY-MM-DD')
                  );
                  
                  if (hasDifferentDates) {
                    continue; // Skip joined bookings
                  }
                  
                  // Same dates as main - include in consolidated total
                  // IMPORTANT: newRoomPrices[i] is TOTAL price (ROOM_CHARGE from billing), so we need to divide by QTY to get per-night price
                  const otherNights = qty; // Use main qty (same dates)
                  
                  // Get the original QTY from billing to calculate per-night price
                  const [billingCheck] = await connection.promise().query(
                    'SELECT ROOM_CHARGE, QTY FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1',
                    [otherBooking.IDNo]
                  );
                  
                  let perNightPrice = newRoomPrices[i] || 0;
                  
                  if (billingCheck && billingCheck.length > 0 && billingCheck[0].QTY > 0) {
                    // newRoomPrices[i] is total price (ROOM_CHARGE), divide by QTY to get per night
                    const originalQty = billingCheck[0].QTY;
                    const totalPrice = newRoomPrices[i] || 0;
                    
                    if (originalQty > 0) {
                      perNightPrice = totalPrice / originalQty;
                    }
                  }
                  
                  // Now multiply per-night price by the new nights (qty)
                  const roomCharge = perNightPrice * otherNights;
                  totalRoomCharges += roomCharge;
                } else {
                  // New booking - include it (assumes same dates as main)
                  // For new bookings, price should be per night (not total)
                  const perNightPrice = newRoomPrices[i] || 0;
                  const roomCharge = perNightPrice * qty;
                  totalRoomCharges += roomCharge;
                }
              }
              
              roomChargeForBilling = totalRoomCharges;
              reservationFeeForBilling = 0; // Reservation fee removed
              discountForBilling = parseFloat(discount) || 0;
            } else if (consolidatedBilling) {
              // Other bookings in consolidated billing
              // IMPORTANT: Joined bookings (with different dates) should keep their separate billing
              if (individualDates || originallyHadDifferentDates) {
                // Joined booking - keep separate billing with actual charges
                // IMPORTANT: roomPrice is per night, so multiply by finalQty (actual nights)
                // If finalQty is still 0, use original billing QTY as fallback
                let nightsToUse = finalQty;
                if (nightsToUse <= 0) {
                  // Get original QTY from billing as fallback
                  const [billingQtyCheck] = await connection.promise().query(
                    'SELECT QTY FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1',
                    [existingBooking.IDNo]
                  );
                  if (billingQtyCheck && billingQtyCheck.length > 0 && billingQtyCheck[0].QTY > 0) {
                    nightsToUse = billingQtyCheck[0].QTY;
                    finalQty = nightsToUse; // Update finalQty for billing update
                    console.log(`   Using original billing QTY: ${nightsToUse}`);
                  } else {
                    // Calculate from dates as last resort
                    const existingCheckInMoment = moment(existingBooking.CHECK_IN_DATE);
                    const existingCheckOutMoment = moment(existingBooking.CHECK_OUT_DATE);
                    nightsToUse = existingCheckOutMoment.diff(existingCheckInMoment, 'days');
                    finalQty = nightsToUse; // Update finalQty for billing update
                    console.log(`   Calculated QTY from dates: ${nightsToUse}`);
                  }
                }
                
                roomChargeForBilling = roomPrice * nightsToUse; // Use actual nights
                reservationFeeForBilling = 0;
                discountForBilling = parseFloat(perRoomDiscountsArray[index]) || 0;
              } else {
                // Regular booking in consolidated billing - gets zero charges
                roomChargeForBilling = 0;
                reservationFeeForBilling = 0;
                discountForBilling = 0;
              }
            } else {
              // Individual billing - each booking gets its own room charge
              // Calculate based on actual nights if booking has different dates
              if (individualDates) {
                roomChargeForBilling = roomPrice * finalQty; // Multiply by actual nights
              } else {
                roomChargeForBilling = roomPrice; // Use room price (will be multiplied by qty in billing)
              }
              reservationFeeForBilling = 0; // Reservation fee removed
              discountForBilling = index === 0 ? (parseFloat(discount) || 0) : 0;
              console.log(`🔄 Room ${index + 1}: INDIVIDUAL - Room Charge: ₱${roomChargeForBilling}, Fee: ₱0, Discount: ₱${discountForBilling}, Nights: ${finalQty}`);
            }

            // Update billing
            // IMPORTANT: Preserve original ROOM_CHARGE - only update QTY and dates
            // Get original ROOM_CHARGE from billing to preserve it
            const [originalBilling] = await connection.promise().query(
              'SELECT ROOM_CHARGE FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1',
              [existingBooking.IDNo]
            );
            
            // Use original ROOM_CHARGE if it exists, otherwise use calculated value
            const preservedRoomCharge = (originalBilling && originalBilling.length > 0 && originalBilling[0].ROOM_CHARGE > 0) 
              ? originalBilling[0].ROOM_CHARGE 
              : roomChargeForBilling;
            
            // NOTE: We continue to store DISCOUNT_AMOUNT in billing for reporting & summary screens.
            //       Discount is also represented in the payments table as negative rows.
            // IMPORTANT: Use finalQty (actual nights) for bookings with different dates
            // IMPORTANT: Preserve original ROOM_CHARGE - only update QTY
            await connection.promise().query(`
              UPDATE billing
              SET QTY = ?, PAYMENT_STATUS = ?, RESERVATION_FEE = ?, DISCOUNT_AMOUNT = ?, ENCODED_BY = ?, ENCODED_DT = ?
              WHERE BOOKING_ID = ?
            `, [
              finalQty, paymentStatus, reservationFeeForBilling, discountForBilling, encodedBy, date, existingBooking.IDNo
            ]);

            // Update customer info for all bookings in the group
            // IMPORTANT: Only the main booking (lowest ID) should have "-Main" suffix
            // Joined bookings should keep their original numbering or get sequential numbers
            // Get the position of this booking in the sorted list to determine numbering
            const sortedBookings = [...existingBookings].sort((a, b) => a.IDNo - b.IDNo);
            const bookingPosition = sortedBookings.findIndex(b => b.IDNo === existingBooking.IDNo);
            
            // Main booking (lowest ID) gets "-Main" suffix, others get sequential numbers
            const guestFullName = isMainBooking 
              ? `${groupName}-Main-1` 
              : `${groupName}-${bookingPosition + 1}`;
            
            
            await connection.promise().query(`
              UPDATE customer
              SET NAME = ?, CONTACTNo = ?, TYPE = ?, LEVEL = ?, ENCODED_BY = ?, ENCODED_DT = ?
              WHERE IDNo = (SELECT CUSTOMER_ID FROM booking WHERE IDNo = ?)
            `, [
              guestFullName, groupContact, guestType, guestLevel, encodedBy, date, existingBooking.IDNo
            ]);
          }
        } else {
          // Add new booking
          const guestFullName = index === 0 ? `${groupName}-1-Main` : `${groupName}-${index + 1}`;

          // Insert customer
          const [custResult] = await connection.promise().query(`
            INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ADDRESS, MESSAGE, ENCODED_BY, ENCODED_DT, ACTIVE, IS_GROUP)
            VALUES (?, ?, ?, ?, '', '', ?, ?, 1, 1)
          `, [
            guestFullName, groupContact, guestType, guestLevel, encodedBy, date
          ]);

          const guestID = custResult.insertId;

          // Generate confirmation number for new booking
          const roomQuery = 'SELECT ROOM_NUMBER FROM room WHERE IDNo = ?';
          const [roomResult] = await connection.promise().query(roomQuery, [roomId]);
          const roomNumber = roomResult[0]?.ROOM_NUMBER || '';
          
          // Generate confirmation number in format: YYYYMMDD0ROOMNUMBER
          const datePart = moment(checkInDate).format('YYYYMMDD');
          const confirmationNumber = `${datePart}0${roomNumber}`;

          // Insert booking
          const [bookResult] = await connection.promise().query(`
            INSERT INTO booking (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, LATE_CHECKOUT, HOLD_PENDING, REMARKS, CONFIRMATION_NUMBER, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, GROUP_BOOKING_ID, AGENCY_ID, AGENCY_PAYER, IS_DIRECT_RESERVATION)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            guestID, roomId, checkInDate, checkOutDate, 'pending', bookingRoute, 1,
            checkOutStatus, holdPendingFlag, index === 0 ? remarks : '', confirmationNumber, encodedBy, date, 1,
            checkInStatus, groupBookingId, processedAgencyId, processedAgencyPayer, 0
          ]);

          const bookingId = bookResult.insertId;

          // Insert corresponding remarks row for the main booking if provided
          if (index === 0) {
            const trimmed = (remarks || '').trim();
            if (trimmed !== '') {
              await connection.promise().query(
                `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) VALUES (?, 'Booking', ?, ?, ?)`,
                [bookingId, trimmed, encodedBy, encodedBy]
              );
            }
          }

          // Calculate billing amounts based on consolidated billing
          let roomChargeForBilling, reservationFeeForBilling, discountForBilling;

          if (consolidatedBilling && index === 0) {
            // Main booking in consolidated billing gets all charges (including full group discount)
            roomChargeForBilling = newRoomPrices.reduce((sum, price) => sum + price, 0); // Total of all rooms
            reservationFeeForBilling = 0; // Reservation fee removed
            discountForBilling = parseFloat(discount) || 0;
            console.log(`🆕 New Room ${index + 1} (Main): CONSOLIDATED - Room Charge: ₱${roomChargeForBilling}, Fee: ₱${reservationFeeForBilling}, Discount: ₱${discountForBilling}`);
          } else if (consolidatedBilling) {
            // Other bookings in consolidated billing get zero charges
            roomChargeForBilling = 0;
            reservationFeeForBilling = 0;
            discountForBilling = 0;
            console.log(`🆕 New Room ${index + 1}: CONSOLIDATED - Room Charge: ₱0, Fee: ₱0, Discount: ₱0`);
          } else {
            // Individual billing - each booking gets its own room charge
            // Group discount should still be visible on the main booking's billing row
            roomChargeForBilling = roomPrice;
            reservationFeeForBilling = 0; // Reservation fee removed
            discountForBilling = index === 0 ? (parseFloat(discount) || 0) : 0;
            console.log(`🆕 New Room ${index + 1}: INDIVIDUAL - Room Charge: ₱${roomChargeForBilling}, Fee: ₱0, Discount: ₱${discountForBilling}`);
          }

          // Insert billing
          await connection.promise().query(`
            INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, ROOM_PRICE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            bookingId,
            roomChargeForBilling,             // charge stored for billing (may be consolidated)
            roomPrice,                        // per-night price of this room
            0.00, 0.00, 0.00,
            qty,
            paymentStatus,
            'cash',
            '',
            encodedBy,
            date,
            1,
            reservationFeeForBilling,
            discountForBilling
          ]);
        }
      }

      // Handle services update (delete existing form-managed services and add new)
      // Get all booking IDs for this group
      const allBookingIdsQuery = `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo`;
      const [allBookings] = await connection.promise().query(allBookingIdsQuery, [groupBookingId]);
      const targetBookingIds = allBookings.map(b => b.IDNo);

      // Delete only form-managed services (breakfast, pickup, dropoff, late checkout)
      // Preserve other extra services (like Car Rentals, Extended Stay, etc.)
      for (const bookingId of targetBookingIds) {
        // Delete service payments for form-managed services only
        await connection.promise().query(
          `DELETE FROM payments 
           WHERE BOOKING_ID = ? 
             AND PAYMENT_TYPE = 'service' 
             AND BOOKING_SERVICE_ID IN (
               SELECT IDNo FROM booking_service 
               WHERE BOOKING_ID = ? 
                 AND SERVICE_ID IN (72, 74, 75, 76, 77)
             )`,
          [bookingId, bookingId]
        );
        
        // Delete only form-managed services (72, 74, 75, 76, 77)
        // 72 = Late Checkout, 74 = Breakfast Adult, 75 = Breakfast Kid, 76 = Pick-up, 77 = Drop-off
        await connection.promise().query(
          'DELETE FROM booking_service WHERE BOOKING_ID = ? AND SERVICE_ID IN (72, 74, 75, 76, 77)',
          [bookingId]
        );
      }

      if (targetBookingIds.length > 0) {
        const groupServices = [];

        // Breakfast Adult
        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = (parseFloat(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0);
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          
          if (breakfastIndividual) {
            // Apply individually to each booking
            for (const bookingId of targetBookingIds) {
              groupServices.push([bookingId, breakfastAdultId, breakfastAdultQty, totalAdult, serviceStatus, encodedBy, date, 1]);
              // Payment distribution logic will handle service payments
            }
          } else {
            // Apply only to first booking
            groupServices.push([targetBookingIds[0], breakfastAdultId, breakfastAdultQty, totalAdult, serviceStatus, encodedBy, date, 1]);
            // Payment distribution logic will handle service payments
          }
        }

        // Breakfast Kid
        if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
          const totalKid = (parseFloat(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0);
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          
          if (breakfastIndividual) {
            // Apply individually to each booking
            for (const bookingId of targetBookingIds) {
              groupServices.push([bookingId, breakfastKidId, breakfastKidQty, totalKid, serviceStatus, encodedBy, date, 1]);
              // Payment distribution logic will handle service payments
            }
          } else {
            // Apply only to first booking
            groupServices.push([targetBookingIds[0], breakfastKidId, breakfastKidQty, totalKid, serviceStatus, encodedBy, date, 1]);
            // Payment distribution logic will handle service payments
          }
        }

        // Pickup
        if (pickupServiceId && pickupPrice) {
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          groupServices.push([targetBookingIds[0], pickupServiceId, 1, parseFloat(pickupPrice) || 0, serviceStatus, encodedBy, date, 1]);
          // Payment distribution logic will handle service payments
        }

        // Dropoff
        if (dropoffServiceId && dropoffPrice) {
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          groupServices.push([targetBookingIds[0], dropoffServiceId, 1, parseFloat(dropoffPrice), serviceStatus, encodedBy, date, 1]);
          // Payment distribution logic will handle service payments
        }

        // Late Checkout Fee (PER ROOM, but handling differs by billing type)
        if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0 && targetBookingIds.length > 0) {
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          
          if (consolidatedBilling) {
            // Consolidated Billing: Total fee (fee × numRooms) goes to main booking only
            const totalLateCheckoutFee = parseFloat(lateCheckoutFee) * targetBookingIds.length;
            groupServices.push([targetBookingIds[0], 72, 1, totalLateCheckoutFee, serviceStatus, encodedBy, date, 1]);
          } else {
            // Individual Billing: Each room gets the fee
            for (const bookingId of targetBookingIds) {
              groupServices.push([bookingId, 72, 1, parseFloat(lateCheckoutFee), serviceStatus, encodedBy, date, 1]);
            }
          }
          // Payment distribution logic will handle service payments
        }

        if (groupServices.length > 0) {
          const serviceQuery = `
            INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES ?
          `;
          await connection.promise().query(serviceQuery, [groupServices]);
          
          // Service payments will be handled by payment distribution logic
        }
      }

      // Handle payments for reservation fees and discounts
      if (firstBookingId) {
        // Get current bookings in the group (after updates/additions/removals)
        const currentBookingsQuery = `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ?`;
        const [currentBookings] = await connection.promise().query(currentBookingsQuery, [groupBookingId]);
        const allBookingIds = currentBookings.map(b => b.IDNo);
        
        // Delete existing reservation fee and discount payments for all bookings in the group
        if (allBookingIds.length > 0) {
          const placeholders = allBookingIds.map(() => '?').join(',');
          await connection.promise().query(`DELETE FROM payments WHERE BOOKING_ID IN (${placeholders}) AND PAYMENT_TYPE IN (?, ?)`, [...allBookingIds, 'reservation_fee', 'discount']);
        }
        
        // Insert new payments for reservation fees and discounts
        const additionalPayments = [];
        
        // console.log(`🔄 Billing Mode: ${consolidatedBilling ? 'CONSOLIDATED' : 'INDIVIDUAL'}`);
        // console.log(`💰 Reservation Fee: ₱${reservationFee || 0}`);
        // console.log(`💸 Discount: ₱${discount || 0}`);
        
        if (consolidatedBilling) {
          // Consolidated billing: apply fees/discounts only to main booking
          if (parseFloat(reservationFee) > 0) {
            additionalPayments.push([
              firstBookingId,
              null, // No specific service ID for reservation fee
              parseFloat(reservationFee),
              'cash',
              'reservation_fee',
              date,
              encodedBy
            ]);
          }
          
          if (parseFloat(discount) > 0) {
            additionalPayments.push([
              firstBookingId,
              null, // No specific service ID for discount
              -parseFloat(discount), // Negative amount for discount
              'cash',
              'discount',
              date,
              encodedBy
            ]);
          }
        } else {
          // Individual billing: apply fees/discounts only to main booking (group-level discount)
          // Don't apply to each booking - that would multiply the discount incorrectly
          if (firstBookingId) {
              if (parseFloat(reservationFee) > 0) {
                additionalPayments.push([
                firstBookingId,
                  null,
                  parseFloat(reservationFee),
                  'cash',
                  'reservation_fee',
                  date,
                  encodedBy
                ]);
              }
              
              if (parseFloat(discount) > 0) {
                additionalPayments.push([
                firstBookingId,
                  null,
                  -parseFloat(discount),
                  'cash',
                  'discount',
                  date,
                  encodedBy
                ]);
            }
          }
        }
        
        if (additionalPayments.length > 0) {
          const additionalPayQuery = `
            INSERT INTO payments
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES ?
          `;
          await connection.promise().query(additionalPayQuery, [additionalPayments]);
        }
      }

      // Payment Distribution Logic - Separate room and service payments
      if (paymentStatus === 'paid' || paymentStatus === 'partial') {
        const paidAmount = parseFloat(data.paidAmount) || 0;
        
        if (paidAmount > 0 && firstBookingId) {
          // Get all booking IDs for this group
          const allBookingIdsQuery = `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo`;
          const [allBookingsResult] = await connection.promise().query(allBookingIdsQuery, [groupBookingId]);
          const allBookingIds = allBookingsResult.map(b => b.IDNo);
          
          if (allBookingIds.length > 0) {
            // Delete existing room, service, and extension payments for all bookings in the group to avoid duplicates
            const paymentPlaceholders = allBookingIds.map(() => '?').join(',');
            await connection.promise().query(
              `DELETE FROM payments WHERE BOOKING_ID IN (${paymentPlaceholders}) AND PAYMENT_TYPE IN (?, ?, ?)`,
              [...allBookingIds, 'room', 'service', 'extended']
            );
            
            // Get all billing records for this group
            const billingPlaceholders = allBookingIds.map(() => '?').join(',');
            const [allBillings] = await connection.promise().query(
              `SELECT IDNo, BOOKING_ID, ROOM_CHARGE, QTY, PAYMENT_STATUS FROM billing WHERE BOOKING_ID IN (${billingPlaceholders})`,
              allBookingIds
            );
            
            // Get all service records for this group
            const servicePlaceholders = allBookingIds.map(() => '?').join(',');
            const [allServices] = await connection.promise().query(
              `SELECT IDNo, BOOKING_ID, TOTAL_COST, STATUS FROM booking_service WHERE BOOKING_ID IN (${servicePlaceholders}) AND ACTIVE = 1`,
              allBookingIds
            );
            
            // Get all extension records (Extended Stay) for this group
            const [allExtensions] = await connection.promise().query(
              `SELECT IDNo, BOOKING_ID, COST, QTY, PAYMENT_STATUS FROM booking_extension WHERE BOOKING_ID IN (${servicePlaceholders}) AND ACTIVE = 1`,
              allBookingIds
            );
            
            let remainingPayment = paidAmount;
            
            // Check if individual billing - ONLY for room charges, NOT for services
            const isIndividualBilling = !consolidatedBilling;
            
            // Priority 1: Pay room charges first (apply discount to rooms)
            const totalBillingAmount = allBillings.reduce((sum, b) => sum + (b.ROOM_CHARGE * b.QTY), 0);
            const discountTotal = parseFloat(discount) || 0;
            // Budget for room after discount
            const roomTargetBudget = Math.max(totalBillingAmount - discountTotal, 0);
            // Track paid amounts per billing so we can redistribute any remainder
            const billingPaidMap = new Map();
            
            if (remainingPayment > 0 && totalBillingAmount > 0 && roomTargetBudget > 0) {
              
               if (isIndividualBilling) {
                 // INDIVIDUAL BILLING: Hati-hati ang bayad per booking (equal share, capped per billing)
                 // Example: 5 rooms, ₱20,000 payment = ₱4,000 per booking (max per billing cap)
                 const numberOfBookings = allBillings.length;
                 const equalPaymentPerBooking = numberOfBookings > 0 ? remainingPayment / numberOfBookings : 0;
                 
                 for (const billing of allBillings) {
                   if (equalPaymentPerBooking <= 0 || remainingPayment <= 0) break;
                   
                   const billingAmount = billing.ROOM_CHARGE * billing.QTY;
                   const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
                   const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
                   
                   const roomPaymentAmount = Math.min(equalPaymentPerBooking, billingPayCap, remainingPayment);
                   
                   if (roomPaymentAmount > 0) {
                     const roomPaymentQuery = `
                       INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                       VALUES (?, ?, ?, ?, 'room', ?, ?)
                     `;
                     await connection.promise().query(roomPaymentQuery, [
                       billing.BOOKING_ID,
                       billing.IDNo,
                       roomPaymentAmount,
                       'cash',
                       date,
                       encodedBy
                     ]);
                     
                     // Record paid amount for redistribution
                     billingPaidMap.set(
                       billing.IDNo,
                       (billingPaidMap.get(billing.IDNo) || 0) + roomPaymentAmount
                     );
                     
                     let newStatus;
                     if (roomPaymentAmount >= billingPayCap && billingPayCap > 0) {
                       newStatus = 'paid';
                     } else if (roomPaymentAmount > 0) {
                       newStatus = 'partial';
                     } else {
                       newStatus = 'unpaid';
                     }
                     await connection.promise().query(
                       'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                       [newStatus, billing.IDNo]
                     );
                     
                     remainingPayment -= roomPaymentAmount;
                   }
                 }
                 
                 // REDISTRIBUTE REMAINING PAYMENT: cover outstanding balances when payment is enough
                 if (remainingPayment > 0) {
                   for (const billing of allBillings) {
                     if (remainingPayment <= 0) break;
                     
                     const billingAmount = billing.ROOM_CHARGE * billing.QTY;
                     const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
                     const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
                     const alreadyPaid = billingPaidMap.get(billing.IDNo) || 0;
                     const outstanding = Math.max(billingPayCap - alreadyPaid, 0);
                     
                     const roomPaymentAmount = Math.min(outstanding, remainingPayment);
                     
                     if (roomPaymentAmount > 0) {
                       const roomPaymentQuery = `
                         INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                         VALUES (?, ?, ?, ?, 'room', ?, ?)
                       `;
                       await connection.promise().query(roomPaymentQuery, [
                         billing.BOOKING_ID,
                         billing.IDNo,
                         roomPaymentAmount,
                         'cash',
                         date,
                         encodedBy
                       ]);
                       
                       const totalPaidForBilling = alreadyPaid + roomPaymentAmount;
                       let newStatus;
                       if (totalPaidForBilling >= billingPayCap && billingPayCap > 0) {
                         newStatus = 'paid';
                       } else if (totalPaidForBilling > 0) {
                         newStatus = 'partial';
                       } else {
                         newStatus = 'unpaid';
                       }
                       await connection.promise().query(
                         'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                         [newStatus, billing.IDNo]
                       );
                       
                       billingPaidMap.set(billing.IDNo, totalPaidForBilling);
                       remainingPayment -= roomPaymentAmount;
                     }
                   }
                 }
               } else {
                 // CONSOLIDATED BILLING: Unang babayaran ang MAIN booking, tapos saka ang iba
                 // Priority lagi ang main; kapag sobra pa ang bayad, saka pupunta sa ibang billing
                 const sortedBillings = [...allBillings].sort((a, b) => {
                   if (a.BOOKING_ID === firstBookingId && b.BOOKING_ID !== firstBookingId) return -1;
                   if (b.BOOKING_ID === firstBookingId && a.BOOKING_ID !== firstBookingId) return 1;
                   return a.BOOKING_ID - b.BOOKING_ID;
                 });
                 
                 for (const billing of sortedBillings) {
                   if (remainingPayment <= 0) break;
                   
                   const billingAmount = billing.ROOM_CHARGE * billing.QTY;
                   const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
                   const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
                   
                   const roomPaymentAmount = Math.min(remainingPayment, billingPayCap);
                   
                   if (roomPaymentAmount > 0) {
                     const roomPaymentQuery = `
                       INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                       VALUES (?, ?, ?, ?, 'room', ?, ?)
                     `;
                     await connection.promise().query(roomPaymentQuery, [
                       billing.BOOKING_ID,
                       billing.IDNo,
                       roomPaymentAmount,
                       'cash',
                       date,
                       encodedBy
                     ]);
                     
                     let newStatus;
                     if (roomPaymentAmount >= billingPayCap && billingPayCap > 0) {
                       newStatus = 'paid';
                     } else if (roomPaymentAmount > 0) {
                       newStatus = 'partial';
                     } else {
                       newStatus = 'unpaid';
                     }
                     await connection.promise().query(
                       'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                       [newStatus, billing.IDNo]
                     );
                     
                     remainingPayment -= roomPaymentAmount;
                   }
                 }
               }
            }
            
            // Priority 2: Pay services with remaining payment
            // Note: Individual billing is ONLY for room charges, NOT for services
            // Services: Pickup/Dropoff always on main booking, Breakfast has separate individual checkbox
            if (remainingPayment > 0 && allServices.length > 0) {
              // For paid status, prioritize main booking services first (Pickup/Dropoff are always on main)
              let sortedServices = [...allServices];
              if (paymentStatus === 'paid' && firstBookingId) {
                // Sort: main booking services first, then others
                sortedServices.sort((a, b) => {
                  if (a.BOOKING_ID === firstBookingId && b.BOOKING_ID !== firstBookingId) return -1;
                  if (b.BOOKING_ID === firstBookingId && a.BOOKING_ID !== firstBookingId) return 1;
                  return a.BOOKING_ID - b.BOOKING_ID;
                });
              }
              
              for (const service of sortedServices) {
                if (remainingPayment <= 0) break;
                
                const servicePaymentAmount = Math.min(remainingPayment, service.TOTAL_COST);
                
                if (servicePaymentAmount > 0) {
                  const servicePaymentQuery = `
                    INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                    VALUES (?, ?, ?, ?, 'service', ?, ?)
                  `;
                  await connection.promise().query(servicePaymentQuery, [
                    service.BOOKING_ID,
                    service.IDNo,
                    servicePaymentAmount,
                    'cash',
                    date,
                    encodedBy
                  ]);
                  
                  // Update service payment status
                  let newStatus;
                  if (servicePaymentAmount >= service.TOTAL_COST) {
                    newStatus = 'paid';
                  } else if (servicePaymentAmount > 0) {
                    newStatus = 'partial';
                  } else {
                    newStatus = 'unpaid';
                  }
                  await connection.promise().query(
                    'UPDATE booking_service SET STATUS = ? WHERE IDNo = ? AND ACTIVE = 1',
                    [newStatus, service.IDNo]
                  );
                  
                  remainingPayment -= servicePaymentAmount;
                }
              }
            }
            
            // Priority 3: Pay Extended Stay (booking_extension) with remaining payment
            if (remainingPayment > 0 && allExtensions.length > 0) {
              // For paid status, prioritize main booking extensions first
              let sortedExtensions = [...allExtensions];
              if (paymentStatus === 'paid' && firstBookingId) {
                // Sort: main booking extensions first, then others
                sortedExtensions.sort((a, b) => {
                  if (a.BOOKING_ID === firstBookingId && b.BOOKING_ID !== firstBookingId) return -1;
                  if (b.BOOKING_ID === firstBookingId && a.BOOKING_ID !== firstBookingId) return 1;
                  return a.BOOKING_ID - b.BOOKING_ID;
                });
              }
              
              for (const extension of sortedExtensions) {
                if (remainingPayment <= 0) break;
                
                const extensionTotalCost = parseFloat(extension.COST || 0) * parseInt(extension.QTY || 1);
                const extensionPaymentAmount = Math.min(remainingPayment, extensionTotalCost);
                
                if (extensionPaymentAmount > 0) {
                  const extensionPaymentQuery = `
                    INSERT INTO payments (BOOKING_ID, BOOKING_EXTENSION_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                    VALUES (?, ?, ?, ?, 'extended', ?, ?)
                  `;
                  await connection.promise().query(extensionPaymentQuery, [
                    extension.BOOKING_ID,
                    extension.IDNo,
                    extensionPaymentAmount,
                    'cash',
                    date,
                    encodedBy
                  ]);
                  
                  // Update extension payment status
                  let newStatus;
                  if (extensionPaymentAmount >= extensionTotalCost) {
                    newStatus = 'paid';
                  } else if (extensionPaymentAmount > 0) {
                    newStatus = 'partial';
                  } else {
                    newStatus = 'unpaid';
                  }
                  await connection.promise().query(
                    'UPDATE booking_extension SET PAYMENT_STATUS = ? WHERE IDNo = ? AND ACTIVE = 1',
                    [newStatus, extension.IDNo]
                  );
                  
                  remainingPayment -= extensionPaymentAmount;
                }
              }
            }
            
            // IMPORTANT: For consolidated billing, apply SAME LOGIC to all (billing, services, extensions)
            // If fully paid (payment >= total of all bookings), mark ALL as "paid"
            // Otherwise, keep individual statuses
            if (!isIndividualBilling && paidAmount > 0) {
              // Calculate total amount (rooms + services + extensions)
              const totalServicesAmount = allServices.reduce((sum, s) => sum + parseFloat(s.TOTAL_COST || 0), 0);
              const totalExtensionsAmount = allExtensions.reduce((sum, e) => sum + (parseFloat(e.COST || 0) * parseInt(e.QTY || 1)), 0);
              const grandTotal = totalBillingAmount + totalServicesAmount + totalExtensionsAmount - discountTotal;
              
              // Check if fully paid
              const isFullyPaidTotal = paidAmount >= grandTotal;
              
              if (isFullyPaidTotal) {
                // SAME LOGIC: Update ALL billing records (main + joined) to "paid"
                const allBillingIds = allBillings.map(b => b.IDNo);
                if (allBillingIds.length > 0) {
                  const billingPlaceholders = allBillingIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE billing SET PAYMENT_STATUS = 'paid' WHERE IDNo IN (${billingPlaceholders})`,
                    allBillingIds
                  );
                }
                
                // SAME LOGIC: Update ALL services to "paid" (all bookings in group)
                if (allServices.length > 0) {
                  const serviceIds = allServices.map(s => s.IDNo);
                  const servicePlaceholders = serviceIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE booking_service SET STATUS = 'paid' WHERE IDNo IN (${servicePlaceholders}) AND ACTIVE = 1`,
                    serviceIds
                  );
                }
                
                // SAME LOGIC: Update ALL extensions to "paid" (all bookings in group)
                if (allExtensions.length > 0) {
                  const extensionIds = allExtensions.map(e => e.IDNo);
                  const extensionPlaceholders = extensionIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE IDNo IN (${extensionPlaceholders}) AND ACTIVE = 1`,
                    extensionIds
                  );
                }
              } else {
                // If partial payment, joined bookings remain unpaid (payments go to main booking only)
                // SAME LOGIC: Update joined bookings' billing, services, and extensions to "unpaid"
                const joinedBookings = allBookingIds.filter(id => id !== firstBookingId);
                
                if (joinedBookings.length > 0) {
                  const joinedPlaceholders = joinedBookings.map(() => '?').join(',');
                  
                  // Update joined bookings' billing to "unpaid"
                  const joinedBillings = allBillings.filter(b => b.BOOKING_ID !== firstBookingId);
                  if (joinedBillings.length > 0) {
                    const joinedBillingIds = joinedBillings.map(b => b.IDNo);
                    const billingPlaceholders = joinedBillingIds.map(() => '?').join(',');
                    await connection.promise().query(
                      `UPDATE billing SET PAYMENT_STATUS = 'unpaid' WHERE IDNo IN (${billingPlaceholders})`,
                      joinedBillingIds
                    );
                  }
                  
                  // Update joined bookings' services to "unpaid" (SAME LOGIC)
                  // IMPORTANT: Only update services that are truly unpaid (not partially paid during distribution)
                  // Check payment records to see if any payment was made to these services
                  const joinedServices = allServices.filter(s => s.BOOKING_ID !== firstBookingId);
                  if (joinedServices.length > 0) {
                    // Check which services actually received payment during distribution
                    const [servicePayments] = await connection.promise().query(
                      `SELECT BOOKING_SERVICE_ID, SUM(AMOUNT_PAID) as total_paid 
                       FROM payments 
                       WHERE BOOKING_SERVICE_ID IN (?) 
                       AND PAYMENT_TYPE = 'service' 
                       GROUP BY BOOKING_SERVICE_ID`,
                      [joinedServices.map(s => s.IDNo)]
                    );
                    
                    const paidServiceIds = new Set(servicePayments.map(p => p.BOOKING_SERVICE_ID));
                    
                    // Only update services that didn't receive any payment
                    const unpaidServiceIds = joinedServices
                      .filter(s => !paidServiceIds.has(s.IDNo))
                      .map(s => s.IDNo);
                    
                    if (unpaidServiceIds.length > 0) {
                      const servicePlaceholders = unpaidServiceIds.map(() => '?').join(',');
                      await connection.promise().query(
                        `UPDATE booking_service SET STATUS = 'unpaid' WHERE IDNo IN (${servicePlaceholders}) AND ACTIVE = 1`,
                        unpaidServiceIds
                      );
                    }
                  }
                  
                  // Update joined bookings' extensions to "unpaid" (SAME LOGIC)
                  // IMPORTANT: Only update extensions that are truly unpaid (not partially paid during distribution)
                  const joinedExtensions = allExtensions.filter(e => e.BOOKING_ID !== firstBookingId);
                  if (joinedExtensions.length > 0) {
                    // Check which extensions actually received payment during distribution
                    const [extensionPayments] = await connection.promise().query(
                      `SELECT BOOKING_EXTENSION_ID, SUM(AMOUNT_PAID) as total_paid 
                       FROM payments 
                       WHERE BOOKING_EXTENSION_ID IN (?) 
                       AND PAYMENT_TYPE = 'extended' 
                       GROUP BY BOOKING_EXTENSION_ID`,
                      [joinedExtensions.map(e => e.IDNo)]
                    );
                    
                    const paidExtensionIds = new Set(extensionPayments.map(p => p.BOOKING_EXTENSION_ID));
                    
                    // Only update extensions that didn't receive any payment
                    const unpaidExtensionIds = joinedExtensions
                      .filter(e => !paidExtensionIds.has(e.IDNo))
                      .map(e => e.IDNo);
                    
                    if (unpaidExtensionIds.length > 0) {
                      const extensionPlaceholders = unpaidExtensionIds.map(() => '?').join(',');
                      await connection.promise().query(
                        `UPDATE booking_extension SET PAYMENT_STATUS = 'unpaid' WHERE IDNo IN (${extensionPlaceholders}) AND ACTIVE = 1`,
                        unpaidExtensionIds
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Update extra services and Extended Stay payment status based on payment status
      // If payment status is 'paid', mark all unpaid extra services and extensions as 'paid'
      if (paymentStatus === 'paid' && targetBookingIds.length > 0) {
        const bookingPlaceholders = targetBookingIds.map(() => '?').join(',');
        
        // Update booking_service (extra services) - exclude form-managed services (72, 74, 75, 76, 77)
        await connection.promise().query(
          `UPDATE booking_service 
           SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
           WHERE BOOKING_ID IN (${bookingPlaceholders}) 
             AND STATUS != 'paid' 
             AND ACTIVE = 1
             AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
          [encodedBy, date, ...targetBookingIds]
        );
        
        // Update booking_extension (Extended Stay)
        await connection.promise().query(
          `UPDATE booking_extension 
           SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
           WHERE BOOKING_ID IN (${bookingPlaceholders}) 
             AND PAYMENT_STATUS != 'paid' 
             AND ACTIVE = 1`,
          [encodedBy, date, ...targetBookingIds]
        );
      } else if (paymentStatus === 'partial' && targetBookingIds.length > 0) {
        // For partial payment, check if paid amount covers all extra services and extensions
        const bookingPlaceholders = targetBookingIds.map(() => '?').join(',');
        
        // Get total cost of unpaid extra services
        const [unpaidServicesResult] = await connection.promise().query(
          `SELECT SUM(TOTAL_COST) as totalUnpaid
           FROM booking_service 
           WHERE BOOKING_ID IN (${bookingPlaceholders}) 
             AND STATUS != 'paid' 
             AND ACTIVE = 1
             AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
          targetBookingIds
        );
        
        // Get total cost of unpaid extensions
        const [unpaidExtensionsResult] = await connection.promise().query(
          `SELECT SUM(COST * QTY) as totalUnpaid
           FROM booking_extension 
           WHERE BOOKING_ID IN (${bookingPlaceholders}) 
             AND PAYMENT_STATUS != 'paid' 
             AND ACTIVE = 1`,
          targetBookingIds
        );
        
        const totalUnpaidExtraServices = parseFloat(unpaidServicesResult[0]?.totalUnpaid || 0);
        const totalUnpaidExtensions = parseFloat(unpaidExtensionsResult[0]?.totalUnpaid || 0);
        const paidAmountNum = parseFloat(data.paidAmount) || 0;
        
        // Get total booking cost to determine allocation
        const [billingDataResult] = await connection.promise().query(
          `SELECT 
             SUM(ROOM_CHARGE * QTY) as roomCost,
             COALESCE((SELECT SUM(TOTAL_COST) FROM booking_service WHERE BOOKING_ID IN (${bookingPlaceholders}) AND ACTIVE = 1 AND SERVICE_ID IN (72, 74, 75, 76, 77)), 0) as formServicesCost,
             COALESCE(SUM(LATE_CHECKOUT_CHARGE), 0) as lateCheckoutCharge,
             COALESCE(SUM(DISCOUNT_AMOUNT), 0) as discount
           FROM billing 
           WHERE BOOKING_ID IN (${bookingPlaceholders}) AND ACTIVE = 1`,
          [...targetBookingIds, ...targetBookingIds, ...targetBookingIds]
        );
        
        const roomCost = parseFloat(billingDataResult[0]?.roomCost || 0);
        const formServicesCost = parseFloat(billingDataResult[0]?.formServicesCost || 0);
        const lateCheckoutCharge = parseFloat(billingDataResult[0]?.lateCheckoutCharge || 0);
        const discount = parseFloat(billingDataResult[0]?.discount || 0);
        
        const totalBookingCost = roomCost + formServicesCost + lateCheckoutCharge + totalUnpaidExtraServices + totalUnpaidExtensions - discount;
        
        // If paid amount covers or exceeds the total, mark all services and extensions as paid
        if (paidAmountNum >= totalBookingCost) {
          await connection.promise().query(
            `UPDATE booking_service 
             SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
             WHERE BOOKING_ID IN (${bookingPlaceholders}) 
               AND STATUS != 'paid' 
               AND ACTIVE = 1
               AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
            [encodedBy, date, ...targetBookingIds]
          );
          
          await connection.promise().query(
            `UPDATE booking_extension 
             SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
             WHERE BOOKING_ID IN (${bookingPlaceholders}) 
               AND PAYMENT_STATUS != 'paid' 
               AND ACTIVE = 1`,
            [encodedBy, date, ...targetBookingIds]
          );
        } else {
          // Calculate how much is left after paying for room and form services
          const remainingAfterRoomAndForm = paidAmountNum - (roomCost + formServicesCost + lateCheckoutCharge - discount);
          const totalUnpaidExtraAndExtensions = totalUnpaidExtraServices + totalUnpaidExtensions;
          
          // If remaining amount covers all extra services and extensions, mark them as paid
          if (remainingAfterRoomAndForm >= totalUnpaidExtraAndExtensions && totalUnpaidExtraAndExtensions > 0) {
            await connection.promise().query(
              `UPDATE booking_service 
               SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
               WHERE BOOKING_ID IN (${bookingPlaceholders}) 
                 AND STATUS != 'paid' 
                 AND ACTIVE = 1
                 AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
              [encodedBy, date, ...targetBookingIds]
            );
            
            await connection.promise().query(
              `UPDATE booking_extension 
               SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
               WHERE BOOKING_ID IN (${bookingPlaceholders}) 
                 AND PAYMENT_STATUS != 'paid' 
                 AND ACTIVE = 1`,
              [encodedBy, date, ...targetBookingIds]
            );
          }
        }
      }

      // Commit transaction
      await new Promise((resolve, reject) => connection.commit(err => (err ? reject(err) : resolve())));
      connection.release();

      console.log('✅ Group Booking Updated Successfully!');

      return {
        success: true,
        message: 'Group Booking updated successfully!'
      };

    } catch (err) {
      await new Promise(resolve => connection.rollback(() => resolve()));
      connection.release();
      throw err;
    }
  }

  // Get group billing details
  static async getGroupBillingDetails(groupId) {
    try {
      // Query for Room Charges ONLY (prevents duplication)
      // For Master Billing, we'll consolidate later, so get all room numbers
      const roomBillingQuery = `
        SELECT 
          b.IDNo AS BOOKING_ID,
          b.CONFIRMATION_NUMBER AS invoiceNumber,
          DATE(bill.ENCODED_DT) AS date,
          gb.GROUP_NAME,  
          r.ROOM_NUMBER,  
          'Room Charge' AS description,
          bill.ROOM_CHARGE AS charges,
          bill.QTY AS room_qty,
          bill.PAYMENT_STATUS,
          COALESCE(bill.CANCELLATION_PENALTY, 0) AS PENALTY_AMOUNT,
          gb.BILLING_TYPE
        FROM billing bill
        JOIN booking b ON bill.BOOKING_ID = b.IDNo
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo  
        JOIN room r ON b.ROOM_ID = r.IDNo  
        WHERE b.GROUP_BOOKING_ID = ? AND bill.ACTIVE = 1
        GROUP BY bill.BOOKING_ID, gb.GROUP_NAME, r.ROOM_NUMBER, bill.ROOM_CHARGE, bill.QTY, bill.PAYMENT_STATUS, gb.BILLING_TYPE
        ORDER BY r.ROOM_NUMBER ASC, bill.BOOKING_ID ASC
      `;

      // Query for Service Charges ONLY
      const serviceBillingQuery = `
        SELECT 
          b.IDNo AS BOOKING_ID,
          r.ROOM_NUMBER,
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE s.SERVICE_NAME
          END AS description,
          CASE 
            WHEN bs.SERVICE_ID = -1
            THEN bs.TOTAL_COST
            WHEN LOWER(COALESCE(s.SERVICE_NAME, '')) LIKE '%breakfast%'
              AND (LOWER(COALESCE(s.SERVICE_NAME, '')) LIKE '%adult%' OR LOWER(COALESCE(s.SERVICE_NAME, '')) LIKE '%kid%')
            THEN (bs.TOTAL_COST / NULLIF(bs.QTY, 0))
            ELSE bs.TOTAL_COST
          END AS charges,
          bs.QTY AS service_qty,
          bs.STATUS
        FROM booking_service bs
        JOIN booking b ON bs.BOOKING_ID = b.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo 
        WHERE b.GROUP_BOOKING_ID = ?
        ORDER BY r.ROOM_NUMBER ASC, b.IDNo ASC
      `;

      // Execute both queries
      const [roomResults, serviceResults] = await Promise.all([
        queryDatabasePromise(roomBillingQuery, [groupId]),
        queryDatabasePromise(serviceBillingQuery, [groupId])
      ]);

      // Extract unique values for invoice (use original results for invoice number and group name)
      const invoiceNumber = roomResults.length > 0 ? roomResults[0].invoiceNumber : "Not Assigned";
      const GroupName = roomResults.length > 0 ? roomResults[0].GROUP_NAME : "Unknown Group";

      // Get group summary data including reservation fee, discount, and billing type
      const summaryQuery = `
        SELECT 
          COALESCE(gb.GROUP_DISCOUNT, 0) AS group_discount,
          COALESCE(gb.GROUP_RESERVATION_FEE, 0) AS reservation_fee,
          COALESCE(gb.BILLING_TYPE, 0) AS billing_type
        FROM group_booking gb
        WHERE gb.IDNo = ?
      `;

      const [summaryRow] = await queryDatabasePromise(summaryQuery, [groupId]);
      const reservationFee = parseFloat(summaryRow?.reservation_fee || 0);
      const discount = parseFloat(summaryRow?.group_discount || 0);
      const billingType = parseInt(summaryRow?.billing_type || 0, 10);
      
      // If BILLING_TYPE = 1 (MASTER), get the master booking ID (first booking/lowest ID)
      let masterBookingId = null;
      if (billingType === 1) {
        const masterBookingQuery = `
          SELECT MIN(b.IDNo) AS master_booking_id
          FROM booking b
          WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
        `;
        const [masterRow] = await queryDatabasePromise(masterBookingQuery, [groupId]);
        masterBookingId = masterRow?.master_booking_id || null;
      }

      // Filter results if BILLING_TYPE = 1 (MASTER)
      // - Room charges: consolidate into single line for master booking
      // - Service charges: always show ALL services for the group (so individual breakfasts, etc. all appear)
      let filteredRoomResults = roomResults;
      let filteredServiceResults = serviceResults;
      
      if (billingType === 1 && masterBookingId) {
        // For Master Billing: Show ALL bookings separately (each has its own billing record)
        // Even though charges are synced to master, we show individual bookings for tracking
        // This allows users to see which booking has which charges
        filteredRoomResults = roomResults; // Show all bookings, not just master
        
        console.log(`✅ Master Billing: Showing all ${roomResults.length} bookings separately (charges synced to master booking ${masterBookingId})`);
        // Keep all serviceResults so that services from all group members are visible on the group invoice
      }
      
      // Compute totals
      const roomTotal = filteredRoomResults.reduce((sum, r) => sum + ((parseFloat(r.charges) || 0) * (parseInt(r.room_qty, 10) || 0)), 0);
      const servicesTotal = filteredServiceResults.reduce((sum, s) => sum + ((parseFloat(s.charges) || 0) * (parseInt(s.service_qty, 10) || 0)), 0);
      
      // Build penalty rows from filtered room results
      const penaltyRows = [];
      let penaltyTotal = 0;
      filteredRoomResults.forEach(row => {
        const penaltyAmount = parseFloat(row.PENALTY_AMOUNT || 0);
        if (penaltyAmount > 0) {
          penaltyTotal += penaltyAmount;
          penaltyRows.push({
            BOOKING_ID: row.BOOKING_ID,
            ROOM_NUMBER: row.ROOM_NUMBER,
            description: 'Cancellation Fee',
            charges: penaltyAmount,
            service_qty: 1,
            STATUS: 'penalty'
          });
        }
      });
      
      const grandTotal = Math.max(0, (roomTotal + servicesTotal + penaltyTotal) - discount - reservationFee);

      // Get all payments from payments table to calculate refund data
      const paidQuery = `
        SELECT p.AMOUNT_PAID, p.PAYMENT_TYPE
        FROM payments p
        JOIN booking b ON p.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
      `;
      const paymentsData = await queryDatabasePromise(paidQuery, [groupId]);
      
      // Calculate total payments made (includes refunds which are negative)
      const totalPaymentsMade = paymentsData.reduce((sum, payment) => {
        return sum + parseFloat(payment.AMOUNT_PAID);
      }, 0);
      
      // Calculate total paid before refund (only positive payments, excluding reservation_fee and discount)
      const totalPaidBeforeRefund = paymentsData.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        // Exclude reservation_fee, discount, and refund payments; only count positive amounts
        if (
          payment.PAYMENT_TYPE === 'reservation_fee' ||
          payment.PAYMENT_TYPE === 'discount' ||
          payment.PAYMENT_TYPE === 'refund'
        ) {
          return sum;
        }
        return sum + Math.max(0, amount);
      }, 0);
      
      // Calculate refund amount (sum of negative payments or sum of CHECKOUT_REFUND from billing)
      const refundAmountFromPayments = paymentsData.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        // Only count actual refund entries (negative amount + refund type)
        if (payment.PAYMENT_TYPE === 'refund' && amount < 0) {
          return sum + Math.abs(amount);
        }
        return sum;
      }, 0);
      
      // Get total checkout refund from billing table
      const checkoutRefundQuery = `
        SELECT COALESCE(SUM(bi.CHECKOUT_REFUND), 0) AS totalCheckoutRefund
        FROM billing bi
        JOIN booking b ON bi.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ? AND bi.ACTIVE = 1
      `;
      const [refundRow] = await queryDatabasePromise(checkoutRefundQuery, [groupId]);
      const totalCheckoutRefund = parseFloat(refundRow?.totalCheckoutRefund || 0);
      
      // Use the larger of checkoutRefund from billing table or calculated refund from payments
      const refundAmount = Math.max(totalCheckoutRefund, refundAmountFromPayments);
      
      // Calculate total paid (only room and service payments, excluding refunds)
      const totalPaid = paymentsData.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        // Only count room and service payments, exclude refunds (negative), reservation_fee, and discount
        if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount' || payment.PAYMENT_TYPE === 'security_deposit' || payment.PAYMENT_TYPE === 'security_deposit_refund' || amount < 0) {
          return sum;
        }
        if (payment.PAYMENT_TYPE === 'room' || payment.PAYMENT_TYPE === 'service') {
          return sum + amount;
        }
        return sum;
      }, 0);
      
      const balance = Math.max(0, grandTotal - totalPaid);

      return {
        invoiceNumber: invoiceNumber,
        GroupName,
        roomBillingDetails: filteredRoomResults,  // Room charges (filtered if MASTER billing)
        serviceBillingDetails: [...filteredServiceResults, ...penaltyRows],  // Service charges + penalties (filtered if MASTER billing)
        reservationFee: reservationFee,
        discount: discount,
        roomTotal: roomTotal,
        servicesTotal: servicesTotal,
        penaltyTotal: penaltyTotal,
        grandTotal: grandTotal,
        totalPaid: totalPaid,
        totalPaidBeforeRefund: totalPaidBeforeRefund,
        refundAmount: refundAmount,
        balance: balance
      };

    } catch (error) {
      console.error('Error in getGroupBillingDetails:', error);
      throw error;
    }
  }

  // Generate group invoice PDF
  static async generateGroupInvoice(params) {
    const { groupId, user } = params;
    try {
      // Reuse existing aggregation
      const details = await BookingModel.getGroupBillingDetails(groupId);

      const path = require('path');
      const fs = require('fs');
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.png');
      const imageBase64 = fs.existsSync(imagePath) ? fs.readFileSync(imagePath, 'base64') : '';

      // Map rows for template
      const rows = [];
      (details.roomBillingDetails || []).forEach(r => {
        rows.push({
          ROOM_NUMBER: r.ROOM_NUMBER,
          DESCRIPTION: 'Room Charge',
          CHARGES: parseFloat(r.charges) || 0,
          QTY: parseInt(r.room_qty, 10) || 0
        });
      });
      (details.serviceBillingDetails || []).forEach(s => {
        const serviceName = (s.description || '').toLowerCase();
        const isSpecialService = serviceName === 'upgrade' || serviceName === 'pick-up' || serviceName === 'drop-off';
        const qtyDisplay = isSpecialService ? '-' : (parseInt(s.service_qty, 10) || 0);
        
        rows.push({
          ROOM_NUMBER: s.ROOM_NUMBER,
          DESCRIPTION: s.description,
          CHARGES: parseFloat(s.charges) || 0,
          QTY: qtyDisplay
        });
      });

      const date = new Date();

      const templateData = {
        DATE_ISSUED: date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
        INVOICE_NO: details.invoiceNumber || `G${groupId}`,
        DISPLAY_NAME: details.GroupName || 'Group',
        ROWS: rows,
        ROOM_TOTAL: parseFloat(details.roomTotal || 0),
        SERVICES_TOTAL: parseFloat(details.servicesTotal || 0),
        RESERVATION_FEE: parseFloat(details.reservationFee || 0),
        DISCOUNT: parseFloat(details.discount || 0),
        GRAND_TOTAL: parseFloat(details.grandTotal || 0),
        TOTAL_PAID: parseFloat(details.totalPaid || 0),
        SERVICES_PAID: 0, // not split accurately; optional
        ROOM_PAID: 0,     // optional breakdown (can be refined later)
        TOTAL_UNPAID: Math.max(0, parseFloat(details.grandTotal || 0) - parseFloat(details.totalPaid || 0)),
        imageUrl: imageBase64 ? `data:image/png;base64,${imageBase64}` : '',
        ISSUED_BY: user?.FULLNAME || 'N/A'
      };

      const { chromium } = require('playwright');
      const ejs = require('ejs');
      const templatePath = path.join(__dirname, '../views/booking/pdf/group_booking_invoice.ejs');
      const html = await ejs.renderFile(templatePath, templateData);

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();

      return { pdfBuffer, confirmationNumber: templateData.INVOICE_NO };

    } catch (error) {
      console.error('Error in generateGroupInvoice:', error);
      throw error;
    }
  }

  // Check group payment status
  static async checkGroupPaymentStatus(groupId) {
    try {
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM billing bill
           JOIN booking b ON bill.BOOKING_ID = b.IDNo
           WHERE b.GROUP_BOOKING_ID = ? 
           AND bill.PAYMENT_STATUS != 'paid') AS unpaid_rooms,
          (SELECT COUNT(*) FROM booking_service bs
           JOIN booking b ON bs.BOOKING_ID = b.IDNo
           WHERE b.GROUP_BOOKING_ID = ? 
           AND bs.STATUS != 'paid') AS unpaid_services
      `;

      const results = await queryDatabasePromise(query, [groupId, groupId]);

      const unpaidRooms = results[0].unpaid_rooms || 0;
      const unpaidServices = results[0].unpaid_services || 0;

      const allPaid = (unpaidRooms === 0 && unpaidServices === 0);

      return { allPaid };

    } catch (error) {
      console.error('Error in checkGroupPaymentStatus:', error);
      throw error;
    }
  }

  // Process group payment
  static async groupPayment(params) {
    const { bookingIDs, amountPaid, paymentMethod, paymentNotes, encodedBy } = params;
    
    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Fetch UNPAID billing records
        const billingQuery = `
          SELECT IDNo, BOOKING_ID, ROOM_CHARGE, QTY 
          FROM billing 
          WHERE BOOKING_ID IN (?) AND PAYMENT_STATUS != 'paid'
        `;
        const billingResults = await queryDatabasePromise(billingQuery, [bookingIDs], connection);

        // Fetch UNPAID service records
        const serviceQuery = `
          SELECT IDNo, BOOKING_ID, TOTAL_COST 
          FROM booking_service 
          WHERE BOOKING_ID IN (?) AND STATUS != 'paid'
        `;
        const serviceResults = await queryDatabasePromise(serviceQuery, [bookingIDs], connection);

        // Process Room Payments
        for (let bill of billingResults) {
          const originalQty = bill.QTY;
          const amountToPay = bill.ROOM_CHARGE * originalQty;

        // Insert payment record for room
        const paymentInsertQuery = `
          INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY) 
          VALUES (?, ?, ?, ?, 'room', NOW(), ?)
        `;
        
        await queryDatabasePromise(paymentInsertQuery, [
          bill.BOOKING_ID, 
          bill.IDNo, 
          amountToPay, 
          paymentMethod, 
          encodedBy
        ], connection);

        // Update billing table
        const billingUpdateQuery = `
          UPDATE billing SET PAYMENT_STATUS = 'paid', PAYMENT_METHOD = ? WHERE IDNo = ?
        `;
        await queryDatabasePromise(billingUpdateQuery, [paymentMethod, bill.IDNo], connection);
      }

      // Process Service Payments
      for (let service of serviceResults) {
        // Insert payment record for service
        const servicePaymentInsertQuery = `
          INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY) 
          VALUES (?, ?, ?, ?, 'service', NOW(), ?)
        `;
        await queryDatabasePromise(servicePaymentInsertQuery, [
          service.BOOKING_ID, 
          service.IDNo, 
          service.TOTAL_COST, 
          paymentMethod, 
          encodedBy
        ], connection);

        // Mark service as paid
        const serviceUpdateQuery = `
          UPDATE booking_service SET STATUS = 'paid' WHERE IDNo = ? AND ACTIVE = 1
        `;
        await queryDatabasePromise(serviceUpdateQuery, [service.IDNo], connection);
      }

      // Insert payment notes into remarks table if provided (one entry per group payment)
      if (paymentNotes && paymentNotes.trim() !== '') {
        const mainBookingId = bookingIDs[0]; // First booking is the main booking for remarks
        const remarksInsertQuery = `
          INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ENCODED_DT, ACTIVE)
          VALUES (?, 'Payment', ?, ?, NOW(), 1)
        `;
        await queryDatabasePromise(remarksInsertQuery, [mainBookingId, paymentNotes.trim(), encodedBy], connection);
      }

      // Update payment_status for all group members when main booking payment_status is updated
      // Only for Master Billing (BILLING_TYPE = 1)
      // IMPORTANT: Exclude joined bookings with separate billing (different dates)
      // Get the main booking ID (first booking in the array)
      const mainBookingId = bookingIDs[0];
      
      // Get GROUP_BOOKING_ID and BILLING_TYPE from the main booking
      const groupIdQuery = `
        SELECT b.GROUP_BOOKING_ID, gb.BILLING_TYPE
        FROM booking b
        LEFT JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1 
        LIMIT 1
      `;
      const groupIdResult = await queryDatabasePromise(groupIdQuery, [mainBookingId], connection);
      
      // Only sync if it's Master Billing (BILLING_TYPE = 1)
      if (groupIdResult && groupIdResult.length > 0 && groupIdResult[0].GROUP_BOOKING_ID && groupIdResult[0].BILLING_TYPE === 1) {
        const groupBookingId = groupIdResult[0].GROUP_BOOKING_ID;
        
        // Get all bookings in the same group with their dates to identify joined bookings
        const allGroupBookingsQuery = `
          SELECT IDNo, CHECK_IN_DATE, CHECK_OUT_DATE
          FROM booking 
          WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1
          ORDER BY IDNo ASC
        `;
        const allGroupBookings = await queryDatabasePromise(allGroupBookingsQuery, [groupBookingId], connection);
        
        if (allGroupBookings && allGroupBookings.length > 0) {
          // Get main booking (first booking - lowest ID)
          const mainBooking = allGroupBookings[0];
          const mainCheckIn = mainBooking.CHECK_IN_DATE ? new Date(mainBooking.CHECK_IN_DATE).toISOString().split('T')[0] : null;
          const mainCheckOut = mainBooking.CHECK_OUT_DATE ? new Date(mainBooking.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
          
          // Check if any of the bookings being paid are joined bookings with SEPARATE BILLING (different dates from main)
          // IMPORTANT: If joined booking has SAME dates as main, it should SYNC (not separate billing)
          const paidBookingsHaveSeparateBilling = bookingIDs.some(paidBookingId => {
            const paidBookingRow = allGroupBookings.find(b => b.IDNo === paidBookingId);
            if (!paidBookingRow) return false;
            const paidCheckIn = paidBookingRow.CHECK_IN_DATE ? new Date(paidBookingRow.CHECK_IN_DATE).toISOString().split('T')[0] : null;
            const paidCheckOut = paidBookingRow.CHECK_OUT_DATE ? new Date(paidBookingRow.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
            return paidCheckIn !== mainCheckIn || paidCheckOut !== mainCheckOut;
          });
          
          // If any paid booking has DIFFERENT dates (separate billing), DON'T sync to main and other bookings
          // If all paid bookings have SAME dates as main (even if joined later), they SHOULD sync
          if (paidBookingsHaveSeparateBilling) {
            // Joined booking(s) with separate billing - don't sync
          } else {
            // All paid bookings have same dates as main - sync to all bookings with same dates
            // This includes: main booking + any joined bookings with same dates
            // Filter out only joined bookings with DIFFERENT dates (separate billing)
            const bookingsToSync = allGroupBookings.filter(b => {
              const bookingCheckIn = b.CHECK_IN_DATE ? new Date(b.CHECK_IN_DATE).toISOString().split('T')[0] : null;
              const bookingCheckOut = b.CHECK_OUT_DATE ? new Date(b.CHECK_OUT_DATE).toISOString().split('T')[0] : null;
              return bookingCheckIn === mainCheckIn && bookingCheckOut === mainCheckOut;
            });
            
            const bookingIdsToSync = bookingsToSync.map(b => b.IDNo);
            
            // Get the payment_status of the main booking's billing record
            const mainBillingQuery = `
              SELECT PAYMENT_STATUS, PAYMENT_METHOD 
              FROM billing 
              WHERE BOOKING_ID = ? 
              ORDER BY IDNo DESC 
              LIMIT 1
            `;
            const mainBillingResult = await queryDatabasePromise(mainBillingQuery, [mainBookingId], connection);
            
            if (mainBillingResult && mainBillingResult.length > 0) {
              const mainPaymentStatus = mainBillingResult[0].PAYMENT_STATUS;
              const mainPaymentMethod = mainBillingResult[0].PAYMENT_METHOD;
              
              // Update billing records only for bookings with same dates (exclude joined bookings)
              if (bookingIdsToSync.length > 0) {
                const updateGroupBillingQuery = `
                  UPDATE billing 
                  SET PAYMENT_STATUS = ?, PAYMENT_METHOD = ? 
                  WHERE BOOKING_ID IN (?)
                `;
                await queryDatabasePromise(updateGroupBillingQuery, [mainPaymentStatus, mainPaymentMethod, bookingIdsToSync], connection);
              }
            }
          }
        }
      }

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();
        
        return { 
          success: true, 
          message: "Payment recorded successfully." 
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in groupPayment:', error);
      throw error;
    }
  }

  // Get all bookings
  static async getBookings() {
    try {
      const query = `
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE,
          rt.NAME AS ROOM_TYPE,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS,
          b.BOOKING_STATUS AS BookingStatus,
          b.GUESTS_COUNT,
          b.REMARKS AS BookingRemarks,
          b.CONFIRMATION_NUMBER,
          b.BOOKING_CHANNEL,
          b.CHECK_IN_STATUS,
          bill.QTY,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) AS TOTAL_COST,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PAYMENT_STATUS
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE b.ACTIVE = 1 
          AND b.GROUP_BOOKING_ID IS NULL
        ORDER BY r.ROOM_NUMBER ASC
      `;

      const results = await queryDatabasePromise(query);
      return results;

    } catch (error) {
      console.error('Error in getBookings:', error);
      throw error;
    }
  }

  // Get all rooms
  static async getRooms() {
    try {
      const query = `
        SELECT 
          r.IDNo AS RoomID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          rt.NAME AS ROOM_TYPE,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE,
          r.ROOM_MAX,
          r.ROOM_BED,
          r.ROOM_SIZE,
          r.ROOM_DESCRIPTION,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS,
          r.ACTIVE
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ACTIVE = 1
        ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
      `;

      const results = await queryDatabasePromise(query);
      return results;

    } catch (error) {
      console.error('Error in getRooms:', error);
      throw error;
    }
  }

  // Cancel booking
  static async cancelBooking(params) {
    const { bookingId, reason, manualRefund, manualCancellationFee, encodedBy } = params;
    
    try {
      const refundAmount = parseFloat(manualRefund);
      if (!Number.isFinite(refundAmount) || refundAmount < 0) {
        throw new Error('Invalid refund amount.');
      }

      const cancellationFee = parseFloat(manualCancellationFee);
      if (!Number.isFinite(cancellationFee) || cancellationFee < 0) {
        throw new Error('Invalid cancellation fee.');
      }

      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Fetch booking details
        const fetchBookingQuery = `
          SELECT IDNo 
          FROM booking 
          WHERE IDNo = ?
        `;
        const bookingRows = await queryDatabasePromise(fetchBookingQuery, [bookingId], connection);

      if (bookingRows.length === 0) {
        connection.release();
        throw new Error('Booking not found.');
      }

      // Fetch billing details
      const billingQuery = `
        SELECT COALESCE(SUM(ROOM_CHARGE * QTY), 0) AS TOTAL_AMOUNT 
        FROM billing 
        WHERE BOOKING_ID = ?
      `;
      const billRows = await queryDatabasePromise(billingQuery, [bookingId], connection);

      if (billRows.length === 0) {
        connection.release();
        throw new Error('Billing not found.');
      }

      const totalAmount = billRows[0].TOTAL_AMOUNT || 0;
      
      // Get total payments made to determine if anything was paid
      const paymentsQuery = `
        SELECT COALESCE(SUM(AMOUNT_PAID), 0) AS TOTAL_PAID
        FROM payments 
        WHERE BOOKING_ID = ? 
        AND PAYMENT_TYPE NOT IN ('reservation_fee', 'discount')
      `;
      const paymentRows = await queryDatabasePromise(paymentsQuery, [bookingId], connection);
      
      // Handle different result formats
      let totalPaid = 0;
      if (paymentRows && paymentRows.length > 0) {
        const paidValue = paymentRows[0].TOTAL_PAID || paymentRows[0].total_paid || paymentRows[0][0] || 0;
        totalPaid = parseFloat(paidValue) || 0;
      }
      
      // Ensure refund doesn't exceed what was paid
      if (refundAmount > totalPaid) {
        connection.release();
        throw new Error('Refund cannot exceed the amount that was paid.');
      }
      
      // Validate amounts based on payment status
      // Use a small epsilon for floating point comparison
      if (totalPaid < 0.01) {
        // If nothing was paid (or very close to 0), refund must be 0, fee can be any amount up to totalAmount
        if (Math.abs(refundAmount) > 0.01) {
          connection.release();
          throw new Error('Refund must be 0 when no payment was made.');
        }
        if (cancellationFee > totalAmount + 0.01) {
          connection.release();
          throw new Error('Cancellation fee cannot exceed total amount.');
        }
        // Allow fee to be less than totalAmount (difference is written off)
      } else {
        // If payment was made, cancellation fee cannot exceed paid amount
        if (cancellationFee > totalPaid + 0.01) {
          connection.release();
          throw new Error('Cancellation fee cannot exceed paid amount.');
        }
        // Refund + fee must equal paid amount (not total amount)
        const sum = refundAmount + cancellationFee;
        const difference = Math.abs(sum - totalPaid);
        if (difference > 0.01) { // Allow small floating point differences
          connection.release();
          throw new Error('Refund amount and cancellation fee must equal paid amount.');
        }
      }
      
      const penaltyAmount = cancellationFee;

        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

      const now = new Date();

      // Update booking
      const updateBookingQuery = `
        UPDATE booking
        SET IS_CANCELLED = 1,
            CANCELLED_AT = ?,
            PENALTY_NIGHTS = NULL,
            BOOKING_STATUS = 'cancelled'
        WHERE IDNo = ?
      `;
      await queryDatabasePromise(updateBookingQuery, [now, bookingId], connection);

      // Update billing - set payment status to 'cancelled' for cancelled bookings
      const updateBillingQuery = `
        UPDATE billing
        SET CANCELLATION_PENALTY = ?,
            REFUNDABLE_AMOUNT = ?,
            PAYMENT_STATUS = 'cancelled'
        WHERE BOOKING_ID = ?
      `;
      await queryDatabasePromise(updateBillingQuery, [penaltyAmount, refundAmount, bookingId], connection);

      // Update booking_service status to 'cancelled' for all services
      const updateServicesQuery = `
        UPDATE booking_service
        SET STATUS = 'cancelled'
        WHERE BOOKING_ID = ? AND ACTIVE = 1
      `;
      await queryDatabasePromise(updateServicesQuery, [bookingId], connection);

      // Update booking_extension payment status to 'cancelled' for all extensions
      const updateExtensionsQuery = `
        UPDATE booking_extension
        SET PAYMENT_STATUS = 'cancelled'
        WHERE BOOKING_ID = ? AND ACTIVE = 1
      `;
      await queryDatabasePromise(updateExtensionsQuery, [bookingId], connection);

      // Insert cancellation log
      const insertLogQuery = `
        INSERT INTO booking_cancellation
        (BOOKING_ID, CANCELLATION_REASON, PENALTY_NIGHTS, REFUND_AMOUNT, FULL_PENALTY, ENCODED_BY)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await queryDatabasePromise(insertLogQuery, [
        bookingId, 
        reason || '', 
        null, 
        refundAmount, 
        null, 
        encodedBy
      ], connection);

      // Insert remark if reason is provided
      if (reason && reason.trim() !== '') {
        const insertRemarkQuery = `
          INSERT INTO remarks
          (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ACTIVE)
          VALUES (?, 'Cancelled', ?, ?, 1)
        `;
        await queryDatabasePromise(insertRemarkQuery, [
          bookingId,
          reason.trim(),
          encodedBy
        ], connection);
      }

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();
        
        return { 
          success: true, 
          message: 'Booking cancelled successfully.' 
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in cancelBooking:', error);
      throw error;
    }
  }

  // Mark booking as maintenance (black bar + guest name Maintenance)
  static async setBookingMaintenance(params) {
    const { bookingId, reason, guestName: guestNameFromUi, encodedBy } = params;

    const isGenericGuestName = (name) => {
      const normalized = String(name || '').trim().toLowerCase();
      return !normalized || normalized === 'maintenance' || normalized === 'guest';
    };

    const pickRestoreGuestName = (...names) => {
      for (const name of names) {
        const trimmed = String(name || '').trim();
        if (trimmed && !isGenericGuestName(trimmed)) {
          return trimmed;
        }
      }
      return String(names.find((name) => String(name || '').trim()) || '').trim();
    };

    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });

    try {
      await new Promise((resolve, reject) => {
        connection.beginTransaction((err) => (err ? reject(err) : resolve()));
      });

      const bookingRows = await queryDatabasePromise(
        `SELECT b.IDNo, b.CUSTOMER_ID, b.ROOM_ID, b.BOOKING_STATUS,
                c.NAME AS CUSTOMER_NAME,
                r.ROOM_STATUS, r.ROOM_MAINTENANCE_STATUS
         FROM booking b
         LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
         LEFT JOIN room r ON r.IDNo = b.ROOM_ID
         WHERE b.IDNo = ? AND b.ACTIVE = 1`,
        [bookingId],
        connection
      );

      if (!bookingRows.length) {
        throw new Error('Booking not found.');
      }

      const booking = bookingRows[0];
      const status = String(booking.BOOKING_STATUS || '').toLowerCase();
      if (status === 'maintenance') {
        throw new Error('Booking is already set to Maintenance.');
      }
      if (status === 'cancelled' || status === 'check-out') {
        throw new Error('This booking cannot be set to Maintenance.');
      }

      const restoreSnapshot = JSON.stringify({
        guestName: pickRestoreGuestName(booking.CUSTOMER_NAME, guestNameFromUi),
        bookingStatus: booking.BOOKING_STATUS || 'pending',
        roomStatus: booking.ROOM_STATUS ?? null,
        roomMaintenanceStatus: booking.ROOM_MAINTENANCE_STATUS ?? null
      });

      await queryDatabasePromise(
        `UPDATE remarks SET ACTIVE = 0
         WHERE BOOKING_ID = ? AND CATEGORY = 'MaintenanceRestore' AND ACTIVE = 1`,
        [bookingId],
        connection
      );

      await queryDatabasePromise(
        `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ACTIVE)
         VALUES (?, 'MaintenanceRestore', ?, ?, 1)`,
        [bookingId, restoreSnapshot, encodedBy || 0],
        connection
      );

      await queryDatabasePromise(
        `UPDATE booking
         SET BOOKING_STATUS = 'maintenance'
         WHERE IDNo = ? AND ACTIVE = 1`,
        [bookingId],
        connection
      );

      if (booking.CUSTOMER_ID) {
        await queryDatabasePromise(
          `UPDATE customer
           SET NAME = 'Maintenance'
           WHERE IDNo = ?`,
          [booking.CUSTOMER_ID],
          connection
        );
      }

      if (booking.ROOM_ID) {
        await queryDatabasePromise(
          `UPDATE room
           SET ROOM_STATUS = 3,
               ROOM_MAINTENANCE_STATUS = 'Under Maintenance'
           WHERE IDNo = ?`,
          [booking.ROOM_ID],
          connection
        );
      }

      const trimmedReason = String(reason || '').trim();
      if (trimmedReason && encodedBy) {
        await queryDatabasePromise(
          `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ACTIVE)
           VALUES (?, 'Maintenance', ?, ?, 1)`,
          [bookingId, trimmedReason, encodedBy],
          connection
        );
      }

      await new Promise((resolve, reject) => {
        connection.commit((err) => (err ? reject(err) : resolve()));
      });

      connection.release();

      return {
        success: true,
        message: 'Booking set to Maintenance successfully.',
        guestName: 'Maintenance',
        reason: trimmedReason
      };
    } catch (error) {
      await new Promise((resolve) => {
        connection.rollback(() => resolve());
      });
      connection.release();
      throw error;
    }
  }

  // Resolve restore snapshot for a maintenance booking (saved data or best-effort fallback)
  static async resolveMaintenanceSnapshot(bookingId, connection, overrides = {}) {
    const isGenericGuestName = (name) => {
      const normalized = String(name || '').trim().toLowerCase();
      return !normalized || normalized === 'maintenance' || normalized === 'guest';
    };

    let parsedSnapshot = null;
    const snapshotRows = await queryDatabasePromise(
      `SELECT REMARK_TEXT
       FROM remarks
       WHERE BOOKING_ID = ? AND CATEGORY = 'MaintenanceRestore'
       ORDER BY ACTIVE DESC, IDNo DESC
       LIMIT 1`,
      [bookingId],
      connection
    );

    if (snapshotRows.length) {
      try {
        const parsed = JSON.parse(snapshotRows[0].REMARK_TEXT || '{}');
        if (parsed && typeof parsed === 'object') {
          parsedSnapshot = parsed;
        }
      } catch (parseErr) {
        parsedSnapshot = null;
      }
    }

    const bookingRows = await queryDatabasePromise(
      `SELECT b.IDNo, b.CUSTOMER_ID, b.ROOM_ID, b.CHECK_IN_DATE, b.CHECK_OUT_DATE,
              b.CHECK_IN_STATUS, b.BOOKING_CHANNEL, b.AGENCY_ID,
              c.NAME AS CUSTOMER_NAME,
              r.ROOM_NUMBER, r.ROOM_STATUS, r.ROOM_MAINTENANCE_STATUS,
              a.NAME AS AGENCY_NAME
       FROM booking b
       LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
       LEFT JOIN room r ON r.IDNo = b.ROOM_ID
       LEFT JOIN agency a ON a.IDNo = b.AGENCY_ID
       WHERE b.IDNo = ? AND b.ACTIVE = 1`,
      [bookingId],
      connection
    );

    if (!bookingRows.length) {
      throw new Error('Booking not found.');
    }

    const booking = bookingRows[0];
    let guestName = overrides.guestName ? String(overrides.guestName).trim() : null;

    if (!guestName && parsedSnapshot?.guestName && !isGenericGuestName(parsedSnapshot.guestName)) {
      guestName = String(parsedSnapshot.guestName).trim();
    }

    const currentCustomerName = String(booking.CUSTOMER_NAME || '').trim();
    if (!guestName && currentCustomerName && !isGenericGuestName(currentCustomerName)) {
      guestName = currentCustomerName;
    }

    if (!guestName && booking.AGENCY_NAME) {
      guestName = String(booking.AGENCY_NAME).trim();
    }

    if (!guestName && booking.ROOM_NUMBER) {
      const receiptRows = await queryDatabasePromise(
        `SELECT RECEIVED_FROM
         FROM payment_receipt
         WHERE ROOM_NO = ?
           AND RECEIVED_FROM IS NOT NULL
           AND TRIM(RECEIVED_FROM) <> ''
           AND LOWER(TRIM(RECEIVED_FROM)) <> 'maintenance'
         ORDER BY RECEIPT_DATE DESC, IDNo DESC
         LIMIT 1`,
        [String(booking.ROOM_NUMBER)],
        connection
      );
      if (receiptRows.length) {
        guestName = String(receiptRows[0].RECEIVED_FROM).trim();
      }
    }

    if (!guestName && parsedSnapshot?.guestName) {
      guestName = String(parsedSnapshot.guestName).trim();
    }

    if (!guestName) {
      guestName = 'Guest';
    }

    let bookingStatus = overrides.bookingStatus || parsedSnapshot?.bookingStatus || 'pending';
    if (!overrides.bookingStatus && !parsedSnapshot?.bookingStatus) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkInDate = booking.CHECK_IN_DATE ? new Date(booking.CHECK_IN_DATE) : null;
      if (checkInDate) {
        checkInDate.setHours(0, 0, 0, 0);
      }

      if (checkInDate && checkInDate <= today) {
        const paymentRows = await queryDatabasePromise(
          `SELECT 1
           FROM payments
           WHERE BOOKING_ID = ?
             AND PAYMENT_TYPE NOT IN ('discount', 'security_deposit', 'security_deposit_refund')
           LIMIT 1`,
          [bookingId],
          connection
        );
        if (paymentRows.length) {
          bookingStatus = 'check-In';
        }
      }
    }

    const roomStatus = parsedSnapshot?.roomStatus ?? (bookingStatus === 'check-In' ? 2 : 1);
    const roomMaintenanceStatus = parsedSnapshot?.roomMaintenanceStatus ?? null;

    return {
      guestName,
      bookingStatus,
      roomStatus,
      roomMaintenanceStatus,
      isFallback: !parsedSnapshot
    };
  }

  // Reopen maintenance booking and restore previous data
  static async reopenMaintenanceBooking(params) {
    const { bookingId, encodedBy, guestName, bookingStatus } = params;

    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });

    try {
      await new Promise((resolve, reject) => {
        connection.beginTransaction((err) => (err ? reject(err) : resolve()));
      });

      const bookingRows = await queryDatabasePromise(
        `SELECT b.IDNo, b.CUSTOMER_ID, b.ROOM_ID, b.BOOKING_STATUS
         FROM booking b
         WHERE b.IDNo = ? AND b.ACTIVE = 1`,
        [bookingId],
        connection
      );

      if (!bookingRows.length) {
        throw new Error('Booking not found.');
      }

      const booking = bookingRows[0];
      if (String(booking.BOOKING_STATUS || '').toLowerCase() !== 'maintenance') {
        throw new Error('Booking is not under Maintenance.');
      }

      const snapshot = await BookingModel.resolveMaintenanceSnapshot(
        bookingId,
        connection,
        {
          guestName: guestName ? String(guestName).trim() : undefined,
          bookingStatus: bookingStatus ? String(bookingStatus).trim() : undefined
        }
      );

      const restoredStatus = snapshot.bookingStatus || 'pending';
      const restoredGuestName = snapshot.guestName || 'Guest';

      await queryDatabasePromise(
        `UPDATE booking
         SET BOOKING_STATUS = ?
         WHERE IDNo = ? AND ACTIVE = 1`,
        [restoredStatus, bookingId],
        connection
      );

      if (booking.CUSTOMER_ID && restoredGuestName) {
        await queryDatabasePromise(
          `UPDATE customer SET NAME = ? WHERE IDNo = ?`,
          [restoredGuestName, booking.CUSTOMER_ID],
          connection
        );
      }

      if (booking.ROOM_ID) {
        const roomStatus = snapshot.roomStatus ?? (restoredStatus === 'check-In' ? 2 : 1);
        const roomMaintenanceStatus = snapshot.roomMaintenanceStatus ?? null;
        await queryDatabasePromise(
          `UPDATE room
           SET ROOM_STATUS = ?,
               ROOM_MAINTENANCE_STATUS = ?
           WHERE IDNo = ?`,
          [roomStatus, roomMaintenanceStatus, booking.ROOM_ID],
          connection
        );
      }

      await queryDatabasePromise(
        `UPDATE remarks SET ACTIVE = 0
         WHERE BOOKING_ID = ? AND CATEGORY = 'MaintenanceRestore' AND ACTIVE = 1`,
        [bookingId],
        connection
      );

      await new Promise((resolve, reject) => {
        connection.commit((err) => (err ? reject(err) : resolve()));
      });

      connection.release();

      return {
        success: true,
        message: snapshot.isFallback
          ? `Booking reopened. Restored as ${restoredGuestName} (${restoredStatus}). Please verify guest details if needed.`
          : 'Booking reopened and previous data restored.',
        guestName: restoredGuestName,
        bookingStatus: restoredStatus,
        usedFallback: !!snapshot.isFallback
      };
    } catch (error) {
      await new Promise((resolve) => {
        connection.rollback(() => resolve());
      });
      connection.release();
      throw error;
    }
  }

  // Mark maintenance as fixed — remove booking from calendar entirely (no restore)
  static async completeMaintenanceBooking(params) {
    const { bookingId, encodedBy } = params;

    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });

    try {
      await new Promise((resolve, reject) => {
        connection.beginTransaction((err) => (err ? reject(err) : resolve()));
      });

      const bookingRows = await queryDatabasePromise(
        `SELECT b.IDNo, b.ROOM_ID, b.BOOKING_STATUS, b.REMARKS,
                c.NAME AS CUSTOMER_NAME,
                r.ROOM_MAINTENANCE_STATUS,
                (
                  SELECT COUNT(*)
                  FROM remarks rm
                  WHERE rm.BOOKING_ID = b.IDNo
                    AND rm.CATEGORY IN ('Maintenance', 'MaintenanceRestore')
                    AND rm.ACTIVE = 1
                ) AS maintenanceRemarkCount
         FROM booking b
         LEFT JOIN customer c ON c.IDNo = b.CUSTOMER_ID
         LEFT JOIN room r ON r.IDNo = b.ROOM_ID
         WHERE b.IDNo = ? AND b.ACTIVE = 1`,
        [bookingId],
        connection
      );

      if (!bookingRows.length) {
        throw new Error('Booking not found.');
      }

      const booking = bookingRows[0];
      const status = String(booking.BOOKING_STATUS || '').trim().toLowerCase();
      const customerName = String(booking.CUSTOMER_NAME || '').trim().toLowerCase();
      const roomMaintenanceStatus = String(booking.ROOM_MAINTENANCE_STATUS || '').trim().toLowerCase();
      const hasMaintenanceRemark = Number(booking.maintenanceRemarkCount || 0) > 0;
      const isMaintenanceBooking =
        status === 'maintenance' ||
        customerName === 'maintenance' ||
        hasMaintenanceRemark ||
        roomMaintenanceStatus.includes('maintenance');

      if (!isMaintenanceBooking) {
        throw new Error('Booking is not under Maintenance.');
      }

      await queryDatabasePromise(
        `UPDATE booking
         SET ACTIVE = 0,
             EDITED_BY = ?,
             EDITED_DT = NOW()
         WHERE IDNo = ?`,
        [encodedBy || 0, bookingId],
        connection
      );

      if (booking.ROOM_ID) {
        await queryDatabasePromise(
          `UPDATE room
           SET ROOM_STATUS = 1,
               ROOM_MAINTENANCE_STATUS = NULL
           WHERE IDNo = ?`,
          [booking.ROOM_ID],
          connection
        );
      }

      await queryDatabasePromise(
        `UPDATE remarks SET ACTIVE = 0
         WHERE BOOKING_ID = ? AND CATEGORY IN ('Maintenance', 'MaintenanceRestore') AND ACTIVE = 1`,
        [bookingId],
        connection
      );

      await new Promise((resolve, reject) => {
        connection.commit((err) => (err ? reject(err) : resolve()));
      });

      connection.release();

      return {
        success: true,
        message: 'Maintenance completed. Booking schedule removed.'
      };
    } catch (error) {
      await new Promise((resolve) => {
        connection.rollback(() => resolve());
      });
      connection.release();
      throw error;
    }
  }

  // Cancel group booking
  static async cancelGroupBooking(params) {
    const { groupId, reason, cancellationFee, encodedBy, bookingIds } = params;
    
    try {
      // Get connection from pool for transaction
      const connection = await new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      try {
        // Check if group booking exists and get all individual bookings
        const fetchGroupQuery = `
          SELECT gb.IDNo as GROUP_ID, gb.GROUP_NAME, gb.CONTACT_NO, gb.BILLING_TYPE,
                 b.IDNo as BOOKING_ID, b.CHECK_IN_DATE, b.CHECK_OUT_DATE, b.BOOKING_STATUS
          FROM group_booking gb
          LEFT JOIN booking b ON gb.IDNo = b.GROUP_BOOKING_ID
          WHERE gb.IDNo = ? AND gb.ACTIVE = 1
        `;
        const groupRows = await queryDatabasePromise(fetchGroupQuery, [groupId], connection);

        if (groupRows.length === 0) {
          connection.release();
          throw new Error('Group booking not found.');
        }

        const selectedIds = Array.isArray(bookingIds) ? bookingIds : [];
        const selectedRows = groupRows.filter(row => row.BOOKING_ID && selectedIds.includes(row.BOOKING_ID));

        if (!selectedRows.length) {
          connection.release();
          throw new Error('Selected bookings not found.');
        }

        // Only evaluate the selected bookings for active/check-in/out restrictions
        const activeBookings = selectedRows.filter(row => 
          row.BOOKING_STATUS && 
          (row.BOOKING_STATUS.toLowerCase() === 'check-in' || 
           row.BOOKING_STATUS.toLowerCase() === 'check-out')
        );

        if (activeBookings.length > 0) {
          connection.release();
          throw new Error('Selected bookings have active check-ins.');
        }

        // Ensure all selected bookings are pending
        const nonPending = selectedRows.filter(row => !row.BOOKING_STATUS || row.BOOKING_STATUS.toLowerCase() !== 'pending');
        if (nonPending.length > 0) {
          connection.release();
          throw new Error('Only pending bookings can be cancelled.');
        }

        // Start transaction
        await new Promise((resolve, reject) => {
          connection.beginTransaction(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        const now = new Date();
        let totalRefundAmount = 0;
        let totalPenaltyAmount = 0;
        let totalSelectedAmount = 0;
        const manualFee = parseFloat(cancellationFee) || 0;
        const useManualFee = manualFee > 0;
        const isConsolidated = groupRows[0]?.BILLING_TYPE === 1;
        // For consolidated billing, track total paid across the group to cap refunds
        let consolidatedPaidRemaining = 0;
        if (isConsolidated) {
          const [groupPaidRows] = await connection.promise().query(
            `SELECT COALESCE(SUM(p.AMOUNT_PAID),0) AS total_paid
             FROM payments p
             JOIN booking b ON p.BOOKING_ID = b.IDNo
             WHERE b.GROUP_BOOKING_ID = ?
               AND p.AMOUNT_PAID > 0
               AND p.PAYMENT_TYPE IN ('room','service')`,
            [groupId]
          );
          consolidatedPaidRemaining = parseFloat(groupPaidRows?.[0]?.total_paid || 0);
        }

        // Identify main billing booking (first with ROOM_CHARGE > 0) for consolidated groups
        let mainBillingBookingId = null;
        if (isConsolidated) {
          const [mainBillingRow] = await connection.promise().query(
            `SELECT b.IDNo 
             FROM booking b 
             JOIN billing bill ON bill.BOOKING_ID = b.IDNo 
             WHERE b.GROUP_BOOKING_ID = ? 
               AND bill.ROOM_CHARGE > 0 
             ORDER BY b.IDNo ASC 
             LIMIT 1`,
            [groupId]
          );
          if (mainBillingRow && mainBillingRow.length > 0) {
            mainBillingBookingId = mainBillingRow[0].IDNo;
          } else {
            // Fallback: use the lowest booking ID in the group
            const [fallbackMain] = await connection.promise().query(
              `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo ASC LIMIT 1`,
              [groupId]
            );
            mainBillingBookingId = fallbackMain && fallbackMain.length > 0 ? fallbackMain[0].IDNo : null;
          }
        }

        // First pass: get total amounts per selected booking for proportional manual refund
        const bookingAmountMap = new Map(); // bookingId -> { totalAmount, roomPricePerNight, roomQtyNights }
        for (const booking of selectedRows) {
          const billingQuery = `
            SELECT 
              COALESCE(ROOM_PRICE, 0) AS ROOM_PRICE,
              COALESCE(QTY, 0) AS QTY,
              (COALESCE(ROOM_PRICE, 0) * COALESCE(QTY, 0)) AS TOTAL_AMOUNT
            FROM billing 
            WHERE BOOKING_ID = ?
            LIMIT 1
          `;
          const billRows = await queryDatabasePromise(billingQuery, [booking.BOOKING_ID], connection);
          const totalAmount = billRows[0] && billRows[0].TOTAL_AMOUNT ? billRows[0].TOTAL_AMOUNT : 0;
          const roomPricePerNight = billRows[0] && billRows[0].ROOM_PRICE ? parseFloat(billRows[0].ROOM_PRICE) : 0;
          const roomQtyNights = billRows[0] && billRows[0].QTY ? parseFloat(billRows[0].QTY) : 0;
          bookingAmountMap.set(booking.BOOKING_ID, { totalAmount, roomPricePerNight, roomQtyNights });
          totalSelectedAmount += totalAmount;
        }

        // Process each individual booking in the group
        for (const booking of selectedRows) {
          if (!booking.BOOKING_ID) continue; // Skip if no individual booking

          const { CHECK_IN_DATE, CHECK_OUT_DATE } = booking;
          const checkIn = new Date(CHECK_IN_DATE);
          const checkOut = new Date(CHECK_OUT_DATE);
          const today = new Date();

          const totalNights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
          const dayDiff = Math.floor((checkIn - today) / (1000 * 60 * 60 * 24));

          // Calculate penalty using either manual fee (distributed) or policy-based nights
          let penaltyNights = 0;
          let penaltyAmount = 0;

          const bookingPricing = bookingAmountMap.get(booking.BOOKING_ID) || { totalAmount: 0, roomPricePerNight: 0, roomQtyNights: 0 };
          const totalAmount = bookingPricing.totalAmount || 0;

          if (useManualFee && totalSelectedAmount > 0) {
            // Distribute manual cancellation fee proportionally based on booking totals
            const proportion = totalAmount / totalSelectedAmount;
            penaltyAmount = manualFee * proportion;
            penaltyNights = 0; // Not applicable in manual fee mode
          } else {
            // Policy-based penalty nights
            if (dayDiff >= 20) penaltyNights = 1;
            else if (dayDiff >= 10) penaltyNights = 2;
            else if (dayDiff < 5) penaltyNights = totalNights;

            const nightlyRate = totalNights > 0 ? totalAmount / totalNights : 0;
            penaltyAmount = nightlyRate * penaltyNights;
          }

          // Payment-aware refund: cap by what has been paid
          let paidAmount = 0;
          if (isConsolidated) {
            paidAmount = consolidatedPaidRemaining;
          } else {
            const [paidRows] = await connection.promise().query(
              'SELECT COALESCE(SUM(AMOUNT_PAID), 0) AS TOTAL_PAID FROM payments WHERE BOOKING_ID = ?',
              [booking.BOOKING_ID]
            );
            paidAmount = parseFloat(paidRows[0]?.TOTAL_PAID) || 0;
          }

          // Calculate refund amount for this booking (cannot exceed paidAmount, never negative)
          const requestedRefund = Math.max(totalAmount - penaltyAmount, 0);
          const refundAmount = Math.max(Math.min(requestedRefund, paidAmount), 0);
          if (isConsolidated) {
            consolidatedPaidRemaining = Math.max(0, consolidatedPaidRemaining - refundAmount);
          }

          totalRefundAmount += refundAmount;
          totalPenaltyAmount += penaltyAmount;

          // Update individual booking
          const updateBookingQuery = `
            UPDATE booking
            SET IS_CANCELLED = 1,
                CANCELLED_AT = ?,
                PENALTY_NIGHTS = ?,
                BOOKING_STATUS = 'cancelled'
            WHERE IDNo = ?
          `;
          await queryDatabasePromise(updateBookingQuery, [now, penaltyNights, booking.BOOKING_ID], connection);

          // Update billing for this booking - set payment status to 'cancelled' for cancelled bookings
          const updateBillingQuery = `
          UPDATE billing
          SET CANCELLATION_PENALTY = ?,
              REFUNDABLE_AMOUNT = ?,
              PAYMENT_STATUS = 'cancelled'
          WHERE BOOKING_ID = ?
        `;
          await queryDatabasePromise(updateBillingQuery, [penaltyAmount, refundAmount, booking.BOOKING_ID], connection);

          // Update booking_service status to 'cancelled' for all services
          const updateServicesQuery = `
            UPDATE booking_service
            SET STATUS = 'cancelled'
            WHERE BOOKING_ID = ? AND ACTIVE = 1
          `;
          await queryDatabasePromise(updateServicesQuery, [booking.BOOKING_ID], connection);

          // Update booking_extension payment status to 'cancelled' for all extensions
          const updateExtensionsQuery = `
            UPDATE booking_extension
            SET PAYMENT_STATUS = 'cancelled'
            WHERE BOOKING_ID = ? AND ACTIVE = 1
          `;
          await queryDatabasePromise(updateExtensionsQuery, [booking.BOOKING_ID], connection);

          // Insert cancellation log for this booking (include refund amount)
          const insertLogQuery = `
          INSERT INTO booking_cancellation
          (BOOKING_ID, CANCELLATION_REASON, PENALTY_NIGHTS, REFUND_AMOUNT, FULL_PENALTY, ENCODED_BY)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
          const fullPenalty = penaltyNights >= totalNights ? 1 : 0;
          const safeRefundAmount = Math.max(0, refundAmount);
          const logResult = await queryDatabasePromise(insertLogQuery, [
            booking.BOOKING_ID, 
            reason || '', 
            penaltyNights, 
            safeRefundAmount, 
            fullPenalty, 
            encodedBy
          ], connection);

          // Ensure booking_cancellation reflects the refund explicitly
          if (logResult && logResult.insertId) {
            await queryDatabasePromise(
              'UPDATE booking_cancellation SET REFUND_AMOUNT = ? WHERE IDNo = ?',
              [safeRefundAmount, logResult.insertId],
              connection
            );
          }

          // Record refund payment entry (negative amount) if applicable
          if (refundAmount > 0) {
            const refundQuery = `
              INSERT INTO payments
              (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
              VALUES (?, NULL, ?, 'cash', 'refund', NOW(), ?, ?)
            `;
            const refundRemarks = reason ? `Cancellation refund - ${reason}` : 'Cancellation refund';
            await queryDatabasePromise(refundQuery, [
              isConsolidated && mainBillingBookingId ? mainBillingBookingId : booking.BOOKING_ID,
              -refundAmount, // Negative to reflect payout/refund
              encodedBy,
              refundRemarks
            ], connection);
          }

          // Adjust billing charges to avoid double-charging
          const perNightReduction = bookingPricing.roomPricePerNight || 0;
          if (perNightReduction > 0) {
            if (isConsolidated && mainBillingBookingId) {
              // Consolidated/master: always reduce the designated main booking charge
              await queryDatabasePromise(
                `UPDATE billing
                 SET ROOM_CHARGE = GREATEST(ROOM_CHARGE - ?, 0)
                 WHERE BOOKING_ID = ?`,
                [perNightReduction, mainBillingBookingId],
                connection
              );
            } else if (!isConsolidated) {
              // Individual billing: reduce the same booking's charge
              await queryDatabasePromise(
                `UPDATE billing
                 SET ROOM_CHARGE = GREATEST(ROOM_CHARGE - ?, 0)
                 WHERE BOOKING_ID = ?`,
                [perNightReduction, booking.BOOKING_ID],
                connection
              );
            }
          }
        }

        // No need to update group_booking table since there's no STATUS column
        // The group status is determined by the individual booking statuses

        // Commit the transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();
        
        return { 
          success: true, 
          message: 'Group booking cancelled successfully.',
          totalRefundAmount,
          totalPenaltyAmount
        };

      } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
          connection.rollback(() => resolve());
        });
        connection.release();
        throw error;
      }

    } catch (error) {
      console.error('Error in cancelGroupBooking:', error);
      throw error;
    }
  }

  // Get booking summary for Telegram bot
  static async getBookingSummary() {
    try {
      // Main summary query
      const summaryQuery = `
        SELECT
          COUNT(*) AS totalBookings,
          COUNT(CASE WHEN DATE(ENCODED_DT) = CURDATE() THEN 1 END) AS dailyBookings,
          COUNT(CASE WHEN WEEK(ENCODED_DT) = WEEK(CURDATE()) THEN 1 END) AS weeklyBookings,
          COUNT(CASE WHEN MONTH(ENCODED_DT) = MONTH(CURDATE()) AND YEAR(ENCODED_DT) = YEAR(CURDATE()) THEN 1 END) AS monthlyBookings,
          COUNT(CASE WHEN BOOKING_STATUS = 'cancelled' THEN 1 END) AS cancelledBookings,
          COUNT(CASE WHEN BOOKING_STATUS = 'no-show' THEN 1 END) AS noShowBookings,
          COUNT(CASE WHEN BOOKING_STATUS = 'pending' THEN 1 END) AS pendingBookings,
          COUNT(CASE WHEN BOOKING_STATUS = 'check-In' THEN 1 END) AS checkInBookings,
          COUNT(CASE WHEN BOOKING_STATUS = 'check-Out' THEN 1 END) AS checkOutBookings
        FROM booking
        WHERE ACTIVE = 1
      `;
      const summaryRows = await queryDatabasePromise(summaryQuery);
      const summary = summaryRows[0];

      // Get total rooms for occupancy calculation
      const roomQuery = `SELECT COUNT(*) AS totalRooms FROM room WHERE ACTIVE = 1`;
      const roomRows = await queryDatabasePromise(roomQuery);
      const totalRooms = roomRows[0].totalRooms || 1;

      // Calculate occupancy rates
      const occupancyToday = summary.dailyBookings / totalRooms * 100;
      const occupancyWeek = summary.weeklyBookings / (totalRooms * 7) * 100;
      const occupancyMonth = summary.monthlyBookings / (totalRooms * 30) * 100;

      // Average length of stay query
      const avgQuery = `
        SELECT
          AVG(DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE)) AS avgStayAll,
          AVG(CASE WHEN DATE(ENCODED_DT) = CURDATE() THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS avgStayToday,
          AVG(CASE WHEN WEEK(ENCODED_DT) = WEEK(CURDATE()) THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS avgStayWeek,
          AVG(CASE WHEN MONTH(ENCODED_DT) = MONTH(CURDATE()) AND YEAR(ENCODED_DT) = YEAR(CURDATE()) THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS avgStayMonth
        FROM booking
        WHERE ACTIVE = 1
      `;
      const avgRows = await queryDatabasePromise(avgQuery);
      const avg = avgRows[0];

      // Total nights stayed query
      const nightsQuery = `
        SELECT
          SUM(DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE)) AS nightsAll,
          SUM(CASE WHEN DATE(ENCODED_DT) = CURDATE() THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS nightsToday,
          SUM(CASE WHEN WEEK(ENCODED_DT) = WEEK(CURDATE()) THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS nightsWeek,
          SUM(CASE WHEN MONTH(ENCODED_DT) = MONTH(CURDATE()) AND YEAR(ENCODED_DT) = YEAR(CURDATE()) THEN DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) END) AS nightsMonth
        FROM booking
        WHERE ACTIVE = 1
      `;
      const nightsRows = await queryDatabasePromise(nightsQuery);
      const nights = nightsRows[0];

      // Top booking channel query
      const channelQuery = `
        SELECT BOOKING_CHANNEL, COUNT(*) AS count
        FROM booking
        WHERE ACTIVE = 1
        GROUP BY BOOKING_CHANNEL
        ORDER BY count DESC
        LIMIT 1
      `;
      const channelRows = await queryDatabasePromise(channelQuery);
      const topChannel = channelRows[0]?.BOOKING_CHANNEL || 'N/A';

      return {
        ...summary,
        occupancyToday: Math.round(occupancyToday),
        occupancyWeek: Math.round(occupancyWeek),
        occupancyMonth: Math.round(occupancyMonth),
        avgStayAll: Number(avg.avgStayAll || 0).toFixed(2),
        avgStayToday: Number(avg.avgStayToday || 0).toFixed(2),
        avgStayWeek: Number(avg.avgStayWeek || 0).toFixed(2),
        avgStayMonth: Number(avg.avgStayMonth || 0).toFixed(2),
        nightsAll: nights.nightsAll || 0,
        nightsToday: nights.nightsToday || 0,
        nightsWeek: nights.nightsWeek || 0,
        nightsMonth: nights.nightsMonth || 0,
        topChannel
      };

    } catch (error) {
      console.error('Error in getBookingSummary:', error);
      throw error;
    }
  }

  // Get all agencies
  static async getAgency() {
    try {
      const query = `
        SELECT IDNo, NAME 
        FROM agency 
        WHERE ACTIVE = 1 
        ORDER BY NAME
      `;

      const results = await queryDatabasePromise(query);
      return results;

    } catch (error) {
      console.error('Error in getAgency:', error);
      throw error;
    }
  }

  // Generate invoice PDF
  static async generateInvoice(params) {
    const { bookingId, user } = params;
    
    try {
      // Complex invoice query with all calculations
      const query = `
        SELECT 
        b.IDNo AS BookingID,
        b.CONFIRMATION_NUMBER,
        b.CUSTOMER_ID,
        b.AGENCY_ID,
        c.NAME AS CUSTOMER_NAME,
        c.IS_GROUP,
        b.AGENCY_ID,
        a.NAME AS AGENCY_NAME,
        b.ROOM_ID,
        r.ROOM_NUMBER,
        rt.NAME AS ROOM_TYPE,
        b.CHECK_IN_DATE,
        b.CHECK_OUT_DATE,
        b.BOOKING_STATUS,
        bill.ROOM_CHARGE AS ROOM_RATE,

        COALESCE(bill.QTY) AS ORIGINAL_DAYS,
        COALESCE((SELECT SUM(QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) AS EXTENDED_DAYS,
        COALESCE(bill.QTY + EXTENDED_DAYS) AS TOTAL_NIGHTS,

        (COALESCE(bill.QTY) * bill.ROOM_CHARGE) AS ROOM_COST,
        (COALESCE(bill.QTY) * bill.ROOM_CHARGE) +
        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) AS ROOM_TOTAL,

        (
          SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
          FROM booking_service bs
          WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1
        ) AS SERVICES_TOTAL,

        COALESCE(bill.RESERVATION_FEE, 0) AS RESERVATION_FEE,
        COALESCE(bill.DISCOUNT_AMOUNT, 0) AS DISCOUNT,
        COALESCE(bill.CANCELLATION_PENALTY, 0) AS CANCELLATION_FEE,
        COALESCE(bill.REFUNDABLE_AMOUNT, 0) AS REFUND_AMOUNT,

        (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
         FROM booking_service bs
         WHERE bs.BOOKING_ID = b.IDNo AND bs.STATUS = 'paid' AND bs.ACTIVE = 1) AS SERVICES_PAID,

        (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
         FROM booking_service bs
         WHERE bs.BOOKING_ID = b.IDNo AND bs.STATUS = 'unpaid' AND bs.ACTIVE = 1) AS SERVICES_UNPAID,

        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) AS EXTENDED_TOTAL,

        COALESCE((SELECT SUM(p2.AMOUNT_PAID) FROM payments p2 WHERE p2.BOOKING_EXTENSION_ID IN (
          SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1)), 0) AS EXTENDED_PAID,

        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) -
        COALESCE((SELECT SUM(p2.AMOUNT_PAID) FROM payments p2 WHERE p2.BOOKING_EXTENSION_ID IN (
          SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1)), 0) AS EXTENDED_UNPAID,

        (COALESCE((SELECT SUM(p.AMOUNT_PAID) 
                   FROM payments p 
                   WHERE p.BILLING_ID = bill.IDNo), 0) +
         COALESCE((SELECT SUM(p2.AMOUNT_PAID) 
                   FROM payments p2 
                   WHERE p2.BOOKING_EXTENSION_ID IN (
                     SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1)), 0)) AS ROOM_PAID,

        ((COALESCE((SELECT SUM(p.AMOUNT_PAID) 
                    FROM payments p 
                    WHERE p.BILLING_ID = bill.IDNo), 0) +
          COALESCE((SELECT SUM(p2.AMOUNT_PAID) 
                    FROM payments p2 
                    WHERE p2.BOOKING_EXTENSION_ID IN (
                      SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1)), 0)) +
         (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
          FROM booking_service bs
          WHERE bs.BOOKING_ID = b.IDNo AND bs.STATUS = 'paid' AND bs.ACTIVE = 1)) AS TOTAL_PAID,

        ((bill.QTY * bill.ROOM_CHARGE) +
         COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) +
         (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
          FROM booking_service bs
          WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1) -
         COALESCE(bill.RESERVATION_FEE, 0) -
         COALESCE(bill.DISCOUNT_AMOUNT, 0)) AS GRAND_TOTAL,

        (((bill.QTY * bill.ROOM_CHARGE) +
          COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1), 0) +
          (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
           FROM booking_service bs
           WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1) -
          COALESCE(bill.RESERVATION_FEE, 0) -
          COALESCE(bill.DISCOUNT_AMOUNT, 0)) -
         ((COALESCE((SELECT SUM(p.AMOUNT_PAID) 
                     FROM payments p 
                     WHERE p.BILLING_ID = bill.IDNo), 0) +
           COALESCE((SELECT SUM(p2.AMOUNT_PAID) 
                     FROM payments p2 
                     WHERE p2.BOOKING_EXTENSION_ID IN (
                       SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo AND ACTIVE = 1)), 0)) +
          (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
           FROM booking_service bs
           WHERE bs.BOOKING_ID = b.IDNo AND bs.STATUS = 'paid' AND bs.ACTIVE = 1))) AS TOTAL_UNPAID

      FROM booking b
      LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
      LEFT JOIN agency a ON b.AGENCY_ID = a.IDNo
      LEFT JOIN room r ON b.ROOM_ID = r.IDNo
      LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
      LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
      WHERE b.IDNo = ? AND b.ACTIVE = 1
      GROUP BY b.IDNo;
      `;

      const rows = await queryDatabasePromise(query, [bookingId]);

      if (rows.length === 0) {
        throw new Error('Booking not found');
      }

      const data = rows[0];
      data.DISPLAY_NAME = data.AGENCY_ID ? data.AGENCY_NAME : data.CUSTOMER_NAME;
      const isCancelled = (data.BOOKING_STATUS || '').toLowerCase() === 'cancelled';

      // Recompute payment figures to match billing logic
      const paymentsQuery = `
        SELECT AMOUNT_PAID, PAYMENT_TYPE
        FROM payments 
        WHERE BOOKING_ID = ?
      `;
      const paymentRows = await queryDatabasePromise(paymentsQuery, [bookingId]);

      const totalPaidBeforeRefund = paymentRows.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        if (
          payment.PAYMENT_TYPE === 'reservation_fee' ||
          payment.PAYMENT_TYPE === 'discount' ||
          payment.PAYMENT_TYPE === 'refund'
        ) {
          return sum;
        }
        return sum + Math.max(0, amount);
      }, 0);

      const refundAmountFromPayments = paymentRows.reduce((sum, payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        if (payment.PAYMENT_TYPE === 'refund' && amount < 0) {
          return sum + Math.abs(amount);
        }
        return sum;
      }, 0);

      const effectiveRefundAmount = Math.max(parseFloat(data.REFUND_AMOUNT) || 0, refundAmountFromPayments);
      const paidAmountAfterCancellation = isCancelled
        ? Math.max(0, totalPaidBeforeRefund - effectiveRefundAmount)
        : totalPaidBeforeRefund;

      data.TOTAL_PAID = totalPaidBeforeRefund;
      data.TOTAL_PAID_BEFORE = totalPaidBeforeRefund;
      data.PAID_AFTER_CANCELLATION = paidAmountAfterCancellation;
      data.REFUND_AMOUNT = effectiveRefundAmount;
      data.TOTAL_UNPAID = isCancelled
        ? 0
        : Math.max(0, (parseFloat(data.GRAND_TOTAL) || 0) - totalPaidBeforeRefund);

      // Generate invoice number and dates
      const date = new Date();
      const yy = String(date.getFullYear()).slice(2);
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const todayFormatted = `${mm}${dd}`;

      data.DATE_ISSUED = date.toLocaleDateString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      data.INVOICE_NO = `${todayFormatted}${bookingId}`;
      data.ROOM_COUNT = '1';

      // Format dates
      const formatDDMMYY = (dateString) => {
        const d = new Date(dateString);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = String(d.getFullYear()).slice(-2);
        return `${month}/${day}/${year}`;
      };

      data.CHECKIN_DATE = formatDDMMYY(data.CHECK_IN_DATE);
      data.CHECKOUT_DATE = formatDDMMYY(data.CHECK_OUT_DATE);

      // Fetch individual services for the invoice
      const servicesQuery = `
        SELECT 
          CASE 
            WHEN bs.SERVICE_ID = -1 AND bs.CUSTOM_NAME IS NOT NULL
            THEN bs.CUSTOM_NAME
            ELSE s.SERVICE_NAME
          END as SERVICE_NAME,
          bs.QTY, 
          bs.TOTAL_COST
        FROM booking_service bs
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
        ORDER BY bs.ENCODED_DT ASC
      `;
      const servicesRows = await queryDatabasePromise(servicesQuery, [bookingId]);
      data.SERVICES_LIST = servicesRows || [];

      const paymentsDetailQuery = `
        SELECT
          p.AMOUNT_PAID,
          p.PAYMENT_TYPE,
          p.PAYMENT_METHOD,
          p.PAYMENT_DATE,
          p.REMARKS,
          u.FULLNAME AS RECEIVED_BY
        FROM payments p
        LEFT JOIN user_info u ON u.IDNo = p.ENCODED_BY
        WHERE p.BOOKING_ID = ?
          AND p.PAYMENT_TYPE NOT IN ('discount', 'security_deposit')
        ORDER BY p.PAYMENT_DATE ASC, p.IDNo ASC
      `;
      data.PAYMENTS_LIST = await queryDatabasePromise(paymentsDetailQuery, [bookingId]);

      // Add image and user data
      const path = require('path');
      const fs = require('fs');
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.png');
      const imageBase64 = fs.readFileSync(imagePath, 'base64');
      data.imageUrl = `data:image/png;base64,${imageBase64}`;
      data.ISSUED_BY = user?.FULLNAME || 'N/A';

      // Generate PDF using Playwright
      const { chromium } = require('playwright');
      const ejs = require('ejs');
      
      const templatePath = path.join(__dirname, '../views/booking/pdf/booking_invoice.ejs');
      const html = await ejs.renderFile(templatePath, data);
      
      // Debug: Save HTML for inspection
      fs.writeFileSync('debug_invoice.html', html, 'utf8');

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.emulateMedia('screen');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '5mm', right: '5mm' },
      });

      await browser.close();

      return { 
        pdfBuffer,
        confirmationNumber: data.CONFIRMATION_NUMBER
      };

    } catch (error) {
      console.error('Error in generateInvoice:', error);
      throw error;
    }
  }

  // Generate voucher PDF
  static async generateVoucher(params) {
    const { data, user } = params;
    
    try {
      // Add image and user data
      const path = require('path');
      const fs = require('fs');
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.png');
      const imageBase64 = fs.readFileSync(imagePath, 'base64');

      data.imageUrl = `data:image/png;base64,${imageBase64}`;

      // Generate PDF using Playwright
      const { chromium } = require('playwright');
      const ejs = require('ejs');
      
      // Ensure paidAmount and balance are non-negative (remove commas when parsing)
      const paidAmount = Math.max(0, parseFloat((data.paidAmount || 0).toString().replace(/,/g, '')));
      const total = parseFloat((data.total || 0).toString().replace(/,/g, ''));
      // Use passed balance if available, otherwise calculate
      let balance = 0;
      if (data.balance !== undefined && data.balance !== null && data.balance !== '') {
        balance = Math.max(0, parseFloat(data.balance.toString().replace(/,/g, '')));
      } else {
        balance = Math.max(0, total - paidAmount);
      }
      
      const templateData = {
        ...data,
        // Ensure checkOutStatus is always defined for the EJS template
        checkOutStatus: data.checkOutStatus !== undefined && data.checkOutStatus !== null
          ? data.checkOutStatus
          : (data.LATE_CHECKOUT !== undefined && data.LATE_CHECKOUT !== null
              ? data.LATE_CHECKOUT
              : 0),
        encodedBy: user.FULLNAME,
        reservationFee: data.reservationFee !== undefined ? data.reservationFee : 0,
        roomCharges: data.roomCharges !== undefined ? data.roomCharges : 0,
        servicesTotal: data.servicesTotal !== undefined ? data.servicesTotal : 0,
        paidAmount: paidAmount,
        balance: balance
      };
      
      const html = await ejs.renderFile(
        path.join(__dirname, '../views/booking/pdf/booking_voucher.ejs'),
        templateData
      );

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({ 
        format: 'A4', 
        printBackground: true 
      });
      
      await browser.close();

      return { pdfBuffer };

    } catch (error) {
      console.error('Error in generateVoucher:', error);
      throw error;
    }
  }

  // Generate group voucher PDF
  static async generateGroupVoucher(params) {
    const { data, user } = params;
    
    try {
      // Add image and user data
      const path = require('path');
      const fs = require('fs');
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.png');
      
      let imageBase64 = '';
      let imageUrl = '';
      
      try {
        if (fs.existsSync(imagePath)) {
          imageBase64 = fs.readFileSync(imagePath, 'base64');
          imageUrl = `data:image/png;base64,${imageBase64}`;
        } else {
          console.warn('Logo image not found, using placeholder');
          imageUrl = '';
        }
      } catch (imgError) {
        console.error('Error loading image:', imgError);
        imageUrl = '';
      }

      // Use servicesTotal if provided, otherwise calculate from breakfast/pickup/dropoff
      let servicesTotal = 0;
      if (data.servicesTotal !== undefined && data.servicesTotal !== null && data.servicesTotal !== '') {
        servicesTotal = parseFloat(data.servicesTotal.toString().replace(/[,\s₱₹$]/g, '')) || 0;
      } else {
        // Calculate servicesTotal (exclude late checkout fee)
        const breakfastAdultQty = parseInt(data.breakfastAdult || 0);
        const breakfastKidQty = parseInt(data.breakfastKid || 0);
        const breakfastAdultPrice = parseFloat(data.breakfastAdultPrice || 0);
        const breakfastKidPrice = parseFloat(data.breakfastKidPrice || 0);
        const breakfastTotal = (breakfastAdultQty * breakfastAdultPrice) + (breakfastKidQty * breakfastKidPrice);
        const pickup = parseFloat(data.pickup || 0);
        const dropoff = parseFloat(data.dropoff || 0);
        // Exclude late checkout fee from servicesTotal as it's displayed separately
        servicesTotal = breakfastTotal + pickup + dropoff;
      }
      
      // Use roomCharges if provided, otherwise calculate from total
      let roomCharges = 0;
      if (data.roomCharges !== undefined && data.roomCharges !== null && data.roomCharges !== '') {
        roomCharges = parseFloat(data.roomCharges.toString().replace(/[,\s₱₹$]/g, '')) || 0;
      } else {
        // Calculate from total
        const total = parseFloat(data.total.toString().replace(/[,\s₱₹$]/g, '')) || 0;
        const lateCheckoutFee = parseFloat(data.lateCheckoutFee || 0);
        const discount = parseFloat(data.discount || 0);
        const reservationFee = parseFloat(data.reservationFee || 0);
        // total = roomCharges + servicesTotal + lateCheckoutFee - discount + reservationFee
        // roomCharges = total - servicesTotal - lateCheckoutFee + discount - reservationFee
        roomCharges = total - servicesTotal - lateCheckoutFee + discount - reservationFee;
        roomCharges = Math.max(0, roomCharges); // Ensure non-negative
      }
      
      // Ensure all required variables have defaults
      const templateData = {
        voucherNo: data.voucherNo || 'N/A',
        groupName: data.groupName || 'Group Booking',
        groupContact: data.groupContact || '',
        dateFrom: data.dateFrom || '',
        dateTo: data.dateTo || '',
        roomSummary: data.roomSummary || 'No rooms selected',
        remarks: data.remarks || '',
        breakfastAdult: data.breakfastAdult || 0,
        breakfastKid: data.breakfastKid || 0,
        pickup: data.pickup || 0,
        dropoff: data.dropoff || 0,
        total: data.total || '0',
        paidAmount: data.paidAmount !== undefined ? data.paidAmount : 0,
        balance: data.balance !== undefined ? data.balance : (() => {
          const total = parseFloat(data.total || 0);
          const paid = parseFloat(data.paidAmount || 0);
          return Math.max(0, total - paid);
        })(),
        checkOutStatus: data.checkOutStatus || 0,
        lateCheckoutFee: data.lateCheckoutFee || 0,
        discount: data.discount || 0,
        reservationFee: data.reservationFee !== undefined ? data.reservationFee : 0,
        roomCharges: roomCharges,
        servicesTotal: servicesTotal,
        imageUrl: imageUrl,
        encodedBy: user.FULLNAME || 'System User'
      };

      // Generate PDF using Playwright
      const { chromium } = require('playwright');
      const ejs = require('ejs');
      
      const html = await ejs.renderFile(
        path.join(__dirname, '../views/booking/pdf/booking_group_voucher.ejs'),
        templateData
      );

      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({ 
        format: 'A4', 
        printBackground: true 
      });
      
      await browser.close();

      return { pdfBuffer };

    } catch (error) {
      console.error('Error in generateGroupVoucher:', error);
      throw error;
    }
  }

  // Get breakfast prices
  static async getBreakfastPrices() {
    try {
      const sql = `
        SELECT IDNo, SERVICE_NAME, SERVICE_COST 
        FROM services 
        WHERE SERVICE_NAME LIKE '%Breakfast%'
      `;
      const results = await queryDatabasePromise(sql);
      return results;
    } catch (error) {
      console.error('Error in getBreakfastPrices:', error);
      throw error;
    }
  }

  // Get pick and drop services
  static async getPickDrop() {
    try {
      const sql = `
        SELECT IDNo, SERVICE_NAME, SERVICE_COST
        FROM services
        WHERE SERVICE_CATEGORY = 'Pick & Drop' AND ACTIVE = 1
        ORDER BY SERVICE_NAME
      `;
      const results = await queryDatabasePromise(sql);
      return results;
    } catch (error) {
      console.error('Error in getPickDrop:', error);
      throw error;
    }
  }

  // Get available rooms by bed count for direct reservations
  static async getAvailableRoomsByBedCount(startDate, endDate, bedCount) {
    try {
      // Format dates to YYYY-MM-DD
      const formatDate = (date) => {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-based
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${year}-${month}-${day}`;
      };

      const startDateFormatted = formatDate(startDate);
      const endDateFormatted = formatDate(endDate);
      
      const query = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW,  (
        SELECT 1 
        FROM booking b2 
        WHERE b2.ROOM_ID = r.IDNo 
          AND DATE(b2.CHECK_OUT_DATE) = ? 
          AND (b2.IS_CANCELLED IS NULL OR b2.IS_CANCELLED != 1)
        LIMIT 1
      ) AS checkoutToday
    FROM room r
    LEFT JOIN booking b ON r.IDNo = b.ROOM_ID
        AND DATE(b.CHECK_IN_DATE) < ?
        AND DATE(b.CHECK_OUT_DATE) > ?
        AND (b.IS_CANCELLED IS NULL OR b.IS_CANCELLED != 1)
    WHERE r.ROOM_STATUS != 3
      AND (b.ROOM_ID IS NULL OR DATE(b.CHECK_OUT_DATE) = ?)
      ${bedCount ? 'AND r.ROOM_BED = ?' : ''}
    ORDER BY r.ROOM_NUMBER ASC;
      `;

      const queryParams = [startDateFormatted, endDateFormatted, startDateFormatted, startDateFormatted];
      if (bedCount) {
        queryParams.push(bedCount);
      }
      
      const results = await queryDatabasePromise(query, queryParams);
      return results;
    } catch (error) {
      console.error('Error in getAvailableRoomsByBedCount:', error);
      throw error;
    }
  }

  // Assign room to direct reservation
  static async assignRoomToDirectReservation(params) {
  const { bookingId, roomId, roomNumber, roomType, bedCount, price, floor, paymentStatus, paidAmount, encodedBy } = params;
    
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Update the booking to assign the room
      // Note: EDITED_BY and EDITED_DT are NOT updated here since this is just room assignment, not booking edit
      const updateBookingQuery = `
        UPDATE booking 
        SET ROOM_ID = ?, 
            IS_DIRECT_RESERVATION = 0
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const bookingResult = await queryDatabasePromise(updateBookingQuery, [roomId, bookingId]);
      
      if (bookingResult.affectedRows === 0) {
        await queryDatabasePromise('ROLLBACK');
        return {
          success: false,
          message: 'Booking not found or already inactive'
        };
      }

      // Update room status to occupied
      const updateRoomQuery = `
        UPDATE room 
        SET ROOM_STATUS = 2 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      await queryDatabasePromise(updateRoomQuery, [roomId]);

      // Update billing to include room charge
      const updateBillingQuery = `
        UPDATE billing 
        SET ROOM_CHARGE = ? 
        WHERE BOOKING_ID = ? AND ACTIVE = 1
      `;
      
      await queryDatabasePromise(updateBillingQuery, [price, bookingId]);

      // If a paidAmount is provided from the Room Assignment modal, make sure
      // payments table reflects it (especially for direct reservations that had
      // an initial downpayment before room was assigned).
      const targetPaid = parseFloat(paidAmount || 0);
      if (!Number.isNaN(targetPaid) && targetPaid > 0) {
        // Get current total paid (excluding discount entries)
        const paidRows = await queryDatabasePromise(
          `SELECT COALESCE(SUM(AMOUNT_PAID),0) AS totalPaid
           FROM payments
           WHERE BOOKING_ID = ? AND PAYMENT_TYPE != 'discount'`,
          [bookingId]
        );
        const alreadyPaid = parseFloat(paidRows[0]?.totalPaid || 0);
        const diff = targetPaid - alreadyPaid;

        // Only insert additional payment if the target is greater than what we already have
        if (diff > 0.009) {
          const insertPaymentQuery = `
            INSERT INTO payments 
              (BOOKING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
            VALUES (?, ?, 'cash', 'room', NOW(), ?, 'Additional payment on room assignment')
          `;
          await queryDatabasePromise(insertPaymentQuery, [bookingId, diff, encodedBy || 'system']);
        }
      }

      // Optionally sync billing payment status if frontend marked as paid/partial
      if (paymentStatus) {
        let mappedStatus = paymentStatus;
        if (paymentStatus === 'partial') {
          mappedStatus = 'partial_paid';
        }
        const updateStatusQuery = `
          UPDATE billing
          SET PAYMENT_STATUS = ?
          WHERE BOOKING_ID = ? AND ACTIVE = 1
        `;
        await queryDatabasePromise(updateStatusQuery, [mappedStatus, bookingId]);
      }

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return {
        success: true,
        message: `Room ${roomNumber} assigned successfully to direct reservation`
      };

    } catch (error) {
      // Rollback transaction on error
      try {
        await queryDatabasePromise('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      
      console.error('Error in assignRoomToDirectReservation:', error);
      throw error;
    }
  }

  // ==================== REMARKS FUNCTIONS ====================

  // Add a new remark
  static async addRemark({ bookingId, category, remarkText, encodedBy }) {
    try {
      // Check if a remark with the same category already exists for this booking
      const existingRemark = await queryDatabasePromise(
        `SELECT IDNo, REMARK_TEXT FROM remarks 
         WHERE BOOKING_ID = ? AND CATEGORY = ? AND ACTIVE = 1`,
        [bookingId, category]
      );
      
      if (existingRemark.length > 0) {
        // Merge with existing remark - append new text with separator
        const currentText = existingRemark[0].REMARK_TEXT;
        const mergedText = `${currentText}\n--\n${remarkText}`;
        
        const result = await queryDatabasePromise(
          `UPDATE remarks SET REMARK_TEXT = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP 
           WHERE IDNo = ? AND ACTIVE = 1`,
          [mergedText, encodedBy, existingRemark[0].IDNo]
        );
        
        return {
          success: true,
          remarkId: existingRemark[0].IDNo,
          message: 'Remark merged successfully'
        };
      } else {
        // Insert the new remark
        const result = await queryDatabasePromise(
          `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) 
           VALUES (?, ?, ?, ?, ?)`,
          [bookingId, category, remarkText, encodedBy, encodedBy]
        );

        return {
          success: true,
          remarkId: result.insertId,
          message: 'Remark added successfully'
        };
      }

    } catch (error) {
      console.error('Error adding remark:', error);
      return {
        success: false,
        message: 'Failed to add remark'
      };
    }
  }

  // Get remarks by booking ID
  static async getRemarksByBooking(bookingId) {
    try {
      // Get remarks for the booking with user names
      const remarks = await queryDatabasePromise(
        `SELECT r.IDNo, r.BOOKING_ID, r.CATEGORY, r.REMARK_TEXT, r.ENCODED_BY, r.ENCODED_DT, r.EDITDED_BY, r.EDITDED_DT, r.ACTIVE,
                u1.FULLNAME as ENCODED_BY_NAME,
                u2.FULLNAME as EDITDED_BY_NAME
         FROM remarks r
         LEFT JOIN user_info u1 ON r.ENCODED_BY = u1.IDno
         LEFT JOIN user_info u2 ON r.EDITDED_BY = u2.IDno
         WHERE r.BOOKING_ID = ? AND r.ACTIVE = 1 
         ORDER BY r.ENCODED_DT DESC`,
        [bookingId]
      );

      return remarks;

    } catch (error) {
      console.error('Error fetching remarks:', error);
      return [];
    }
  }

  // Update a remark
  static async updateRemark({ remarkId, remarkText, editedBy }) {
    try {
      // Get remark details first to check category and booking ID
      const remarkDetails = await queryDatabasePromise(
        `SELECT BOOKING_ID, CATEGORY FROM remarks WHERE IDNo = ? AND ACTIVE = 1`,
        [remarkId]
      );

      if (remarkDetails.length === 0) {
        return {
          success: false,
          message: 'Remark not found or already deleted'
        };
      }

      const { BOOKING_ID, CATEGORY } = remarkDetails[0];

      // Update the remark
      const result = await queryDatabasePromise(
        `UPDATE remarks SET REMARK_TEXT = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`,
        [remarkText, editedBy, remarkId]
      );

      if (result.affectedRows > 0) {
        // If this is a "Booking" category remark, also update the booking table's REMARKS field
        if (CATEGORY === 'Booking') {
          await queryDatabasePromise(
            `UPDATE booking SET REMARKS = ? WHERE IDNo = ?`,
            [remarkText, BOOKING_ID]
          );
          console.log('✅ Booking REMARKS field updated to match remarks table');
        }

        return {
          success: true,
          message: 'Remark updated successfully'
        };
      } else {
        return {
          success: false,
          message: 'Remark not found or already deleted'
        };
      }

    } catch (error) {
      console.error('Error updating remark:', error);
      return {
        success: false,
        message: 'Failed to update remark'
      };
    }
  }

  // Delete a remark (soft delete by setting ACTIVE = 0)
  static async deleteRemark(remarkId) {
    try {
      // Get remark details first to check category and booking ID
      const remarkDetails = await queryDatabasePromise(
        `SELECT BOOKING_ID, CATEGORY, REMARK_TEXT FROM remarks WHERE IDNo = ? AND ACTIVE = 1`,
        [remarkId]
      );

      if (remarkDetails.length === 0) {
        return {
          success: false,
          message: 'Remark not found'
        };
      }

      // Soft delete the remark
      const result = await queryDatabasePromise(
        `UPDATE remarks SET ACTIVE = 0 WHERE IDNo = ?`,
        [remarkId]
      );

      if (result.affectedRows > 0) {
        // If the remark category is "BOOKING", also clear the remarks in booking table
        if (remarkDetails[0].CATEGORY && remarkDetails[0].CATEGORY.toUpperCase() === 'BOOKING') {
          const bookingId = remarkDetails[0].BOOKING_ID;

          // Update the booking table to set REMARKS to NULL
          await queryDatabasePromise(
            `UPDATE booking SET REMARKS = NULL WHERE IDNo = ?`,
            [bookingId]
          );

          console.log(`Cleared remarks from booking table for booking ID: ${bookingId}`);
        }

        // If the booking belongs to a group, mirror the deletion in group_booking.REMARKS
        try {
          const bookingRow = await queryDatabasePromise(
            `SELECT GROUP_BOOKING_ID FROM booking WHERE IDNo = ? LIMIT 1`,
            [remarkDetails[0].BOOKING_ID]
          );
          const groupId = bookingRow[0]?.GROUP_BOOKING_ID || null;
          if (groupId) {
            const groupRows = await queryDatabasePromise(
              `SELECT REMARKS FROM group_booking WHERE IDNo = ?`,
              [groupId]
            );
            const currentRemarks = (groupRows[0]?.REMARKS || '').trim();
            if (currentRemarks) {
              const toRemove = (remarkDetails[0].REMARK_TEXT || '').trim();
              if (toRemove) {
                // group remarks are appended using "\n--\n" separator. Remove the exact chunk.
                const pieces = currentRemarks
                  .split('\n--\n')
                  .map(s => s.trim())
                  .filter(s => s.length > 0 && s !== toRemove);
                const updated = pieces.join('\n--\n');
                await queryDatabasePromise(
                  `UPDATE group_booking SET REMARKS = ? WHERE IDNo = ?`,
                  [updated || null, groupId]
                );
              }
            }
          }
        } catch (mirrorErr) {
          console.warn('Warning: failed to mirror remark deletion to group_booking:', mirrorErr?.message || mirrorErr);
        }

        return {
          success: true,
          message: 'Remark deleted successfully'
        };
      } else {
        return {
          success: false,
          message: 'Failed to delete remark'
        };
      }

    } catch (error) {
      console.error('Error deleting remark:', error);
      return {
        success: false,
        message: 'Failed to delete remark'
      };
    }
  }

  // ==================== EDIT BOOKING METHODS ====================

  // Get booking details for editing
  static async getEditBookingDetails(bookingId) {
    try {
      const query = `
        SELECT 
          b.IDNo as bookingId,
          b.CUSTOMER_ID,
          b.ROOM_ID,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.BOOKING_CHANNEL,
          COALESCE(NULLIF(TRIM(b.CHANNEL_BOOKING_ID), ''), gb.CHANNEL_BOOKING_ID) as channelBookingId,
          b.GUESTS_COUNT,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.CHECK_IN_STATUS,
          b.LATE_CHECKOUT,
          b.HOLD_PENDING,
          b.IS_DIRECT_RESERVATION,
          b.AGENCY_ID,
          b.AGENCY_PAYER as agencyPayer,
          b.BED_COUNT,
          b.FLIGHT_NUMBER as flightNumber,
          b.DROPOFF_FLIGHT_NUMBER as dropoffFlightNumber,
          b.PICKUP_DATE as pickupDate,
          b.PASSENGER_COUNT as passengerCount,

          c.NAME as fullname,
          c.CONTACTNo as number,
          c.TYPE as guestType,
          c.LEVEL as guestLevel,
          
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          r.ROOM_VIEW,
          r.ROOM_TYPE_ID,
          r.ROOM_BED,
          rt.NAME as ROOM_TYPE,
          
          bill.ROOM_CHARGE as price,
          bill.QTY as diffindays,
          bill.PAYMENT_STATUS,
          bill.RESERVATION_FEE,
          bill.DISCOUNT_AMOUNT,
          bill.SENIOR_PWD_DISCOUNT_PERCENT,
          
          bs_adult.QTY as breakfastAdultQty,
          bs_adult.TOTAL_COST as breakfastAdultPrice,
          bs_adult.SERVICE_ID as breakfastAdultId,
          
          bs_kid.QTY as breakfastKidQty,
          bs_kid.TOTAL_COST as breakfastKidPrice,
          bs_kid.SERVICE_ID as breakfastKidId,
          
          bs_pickup.TOTAL_COST as pickupPrice,
          bs_pickup.SERVICE_ID as pickupServiceId,
          
          bs_dropoff.TOTAL_COST as dropoffPrice,
          bs_dropoff.SERVICE_ID as dropoffServiceId,
          
          bs_late_checkout.TOTAL_COST as lateCheckoutFee,
          bs_late_checkout.SERVICE_ID as lateCheckoutServiceId,
          
          ag.IDNo as agencyID,
          ag.NAME as agencyName
          
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        LEFT JOIN booking_service bs_adult ON bs_adult.BOOKING_ID = b.IDNo AND bs_adult.SERVICE_ID = 74 AND bs_adult.ACTIVE = 1
        LEFT JOIN booking_service bs_kid ON bs_kid.BOOKING_ID = b.IDNo AND bs_kid.SERVICE_ID = 75 AND bs_kid.ACTIVE = 1
        LEFT JOIN booking_service bs_pickup ON bs_pickup.BOOKING_ID = b.IDNo AND bs_pickup.SERVICE_ID = 76 AND bs_pickup.ACTIVE = 1
        LEFT JOIN booking_service bs_dropoff ON bs_dropoff.BOOKING_ID = b.IDNo AND bs_dropoff.SERVICE_ID = 77 AND bs_dropoff.ACTIVE = 1
        LEFT JOIN booking_service bs_late_checkout ON bs_late_checkout.BOOKING_ID = b.IDNo AND bs_late_checkout.SERVICE_ID = 72 AND bs_late_checkout.ACTIVE = 1
        LEFT JOIN agency ag ON b.AGENCY_ID = ag.IDNo
        LEFT JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;

      const results = await queryDatabasePromise(query, [bookingId]);
      
      if (results.length === 0) {
        return null;
      }

      const booking = results[0];
      
      // Format dates for frontend
      const moment = require('moment');
      const checkInDate = moment(booking.CHECK_IN_DATE).format('MMM DD, YYYY');
      const checkOutDate = moment(booking.CHECK_OUT_DATE).format('MMM DD, YYYY');
      const daterange = `${checkInDate} to ${checkOutDate} (${booking.diffindays} night/s)`;
      
      // Calculate breakfast prices per unit
      const breakfastAdultPrice = booking.breakfastAdultQty > 0 ? 
        (booking.breakfastAdultPrice / booking.breakfastAdultQty) : 0;
      const breakfastKidPrice = booking.breakfastKidQty > 0 ? 
        (booking.breakfastKidPrice / booking.breakfastKidQty) : 0;

      // Calculate total paid amount from payments table
      const paidAmountQuery = `
        SELECT COALESCE(SUM(AMOUNT_PAID), 0) as totalPaid
        FROM payments 
        WHERE BOOKING_ID = ? AND PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit')
      `;
      const paidAmountResult = await queryDatabasePromise(paidAmountQuery, [bookingId]);
      const totalPaidAmount = parseFloat(paidAmountResult[0]?.totalPaid) || 0;

      const formattedBooking = {
        ...booking,
        daterange,
        breakfastAdultPrice: breakfastAdultPrice.toFixed(2),
        breakfastKidPrice: breakfastKidPrice.toFixed(2),
        paidAmount: totalPaidAmount.toFixed(2)
      };

      return formattedBooking;

    } catch (error) {
      console.error('Error fetching booking details for edit:', error);
      throw error;
    }
  }

  // Update existing booking
  static async updateBooking(params) {
    return new Promise((resolve, reject) => {
      const {
        bookingId, room_id, fullname, number, daterange, maxOccupants,
        paidAmount, paymentStatus, price, diffindays, guestType, guestLevel,
        bookingRoute, checkInStatus, checkOutStatus, holdPending, bookingRemarks, agencyID, agencyPayer, bedCount,
        breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
        breakfastKidQty, breakfastKidPrice, breakfastKidId,
        pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
        flightNumber, dropoffFlightNumber, pickupDate, passengerCount,
        discount, seniorPwdDiscountPercent = 0, lateCheckoutFee, editedBy,
        channelBookingId
      } = params;

      const holdPendingFlag = (holdPending === true || holdPending === 1 || holdPending === '1' || holdPending === 'true') ? 1 : 0;

      const editDate = new Date();

      // Parse the date range
      const dateRangeParts = daterange.split(' to ');
      const startDateStr = dateRangeParts[0].trim();
      const endDateStr = dateRangeParts[1].split('(')[0].trim();

      // Convert dates to MySQL format
      const moment = require('moment');
      const checkInDate = moment(startDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' 06:00:00';

      // Set checkout time based on checkOutStatus (0 = regular, 1 = late)
      let checkOutTime;
      if (checkOutStatus == 1) {
        // Late Check Out: Set to 11:00 PM
        checkOutTime = ' 23:00:00';
      } else {
        // Regular Check Out: Set to 6:00 PM
        checkOutTime = ' 18:00:00';
      }
      const checkOutDate = moment(endDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + checkOutTime;

      // Remove commas from price and convert to decimal
      let numericRoomPrice = parseFloat(price.replace(/,/g, ''));
      if (isNaN(numericRoomPrice)) {
        return reject(new Error('Invalid room price format'));
      }

      // Start transaction
      pool.getConnection((err, connection) => {
        if (err) {
          console.error('Error getting connection:', err);
          return reject(new Error('Database connection error'));
        }

        connection.beginTransaction(async (err) => {
          if (err) {
            connection.release();
            return reject(new Error('Transaction start error'));
          }

          try {
            // 1. Update customer information
            // Handle empty guestType and guestLevel - set to NULL if empty
            const processedGuestType = (guestType && guestType.trim() !== '') ? guestType : null;
            const processedGuestLevel = (guestLevel && guestLevel.trim() !== '') ? guestLevel : null;
            
            const customerUpdateQuery = `
              UPDATE customer 
              SET NAME = ?, CONTACTNo = ?, TYPE = ?, LEVEL = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE IDNo = (SELECT CUSTOMER_ID FROM booking WHERE IDNo = ?)
            `;
            await connection.promise().query(customerUpdateQuery, [
              fullname, number, processedGuestType, processedGuestLevel, editedBy, editDate, bookingId
            ]);

            // 2. Update booking information
            const bookingUpdateQuery = `
              UPDATE booking
              SET ROOM_ID = ?, CHECK_IN_DATE = ?, CHECK_OUT_DATE = ?, BOOKING_CHANNEL = ?,
                  CHANNEL_BOOKING_ID = ?,
                  GUESTS_COUNT = ?, REMARKS = ?, CHECK_IN_STATUS = ?, LATE_CHECKOUT = ?, HOLD_PENDING = ?, AGENCY_ID = ?,
                  AGENCY_PAYER = ?, BED_COUNT = ?, FLIGHT_NUMBER = ?, DROPOFF_FLIGHT_NUMBER = ?, PICKUP_DATE = ?, PASSENGER_COUNT = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE IDNo = ?
            `;
            // Handle empty agencyID and bedCount - set to NULL if empty
            let processedAgencyID = null;
            
            // Validate agency if booking route is agency
            if (bookingRoute === 'agency' && agencyID && agencyID.trim() !== '') {
              // Validate that agency exists and is active
              const [agencyCheck] = await connection.promise().query(
                'SELECT IDNo FROM agency WHERE IDNo = ? AND ACTIVE = 1',
                [agencyID]
              );
              
              if (agencyCheck.length === 0) {
                connection.rollback();
                connection.release();
                return reject(new Error('Invalid agency selected. Agency does not exist or is inactive.'));
              }
              
              processedAgencyID = agencyID;
            }

            let processedAgencyPayer = null;
            if (bookingRoute === 'agency' && agencyPayer) {
              processedAgencyPayer = agencyPayer === 'guest' ? 'guest' : 'agency';
            }

            const processedChannelBookingId = bookingRoute === 'booking-channel'
              ? (String(channelBookingId || '').trim() || null)
              : null;
            
            const processedBedCount = (bedCount && bedCount.trim() !== '') ? bedCount : null;
            const processedFlightNumber = pickupServiceId ? (flightNumber || null) : null;
            const processedDropoffFlightNumber = dropoffServiceId ? (dropoffFlightNumber || null) : null;
            const processedPickupDate = pickupServiceId && pickupDate ? pickupDate : null;
            const processedPassengerCount = (pickupServiceId || dropoffServiceId) ? (parseInt(passengerCount) || null) : null;

            await connection.promise().query(bookingUpdateQuery, [
              room_id, checkInDate, checkOutDate, bookingRoute,
              processedChannelBookingId,
              maxOccupants,
              bookingRemarks, checkInStatus, checkOutStatus || 0, holdPendingFlag, processedAgencyID,
              processedAgencyPayer, processedBedCount, processedFlightNumber, processedDropoffFlightNumber, processedPickupDate, processedPassengerCount,
              editedBy, editDate, bookingId
            ]);

            // Propagate channel/agency to sibling rooms in the same group booking
            // (editing the main room should update walk-in → agency on all group rooms)
            const [groupRows] = await connection.promise().query(
              `SELECT GROUP_BOOKING_ID FROM booking WHERE IDNo = ? AND ACTIVE = 1 LIMIT 1`,
              [bookingId]
            );
            const groupBookingId = groupRows?.[0]?.GROUP_BOOKING_ID || null;
            if (groupBookingId) {
              await connection.promise().query(
                `UPDATE booking
                 SET BOOKING_CHANNEL = ?,
                     CHANNEL_BOOKING_ID = ?,
                     AGENCY_ID = ?,
                     AGENCY_PAYER = ?,
                     EDITED_BY = ?,
                     EDITED_DT = ?
                 WHERE GROUP_BOOKING_ID = ?
                   AND ACTIVE = 1
                   AND IDNo <> ?`,
                [
                  bookingRoute,
                  processedChannelBookingId,
                  processedAgencyID,
                  processedAgencyPayer,
                  editedBy,
                  editDate,
                  groupBookingId,
                  bookingId
                ]
              );
            }

            // 3. Update billing information
            const billingUpdateQuery = `
              UPDATE billing 
              SET ROOM_CHARGE = ?, QTY = ?, PAYMENT_STATUS = ?, 
                  DISCOUNT_AMOUNT = ?, SENIOR_PWD_DISCOUNT_PERCENT = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE BOOKING_ID = ?
            `;
            await connection.promise().query(billingUpdateQuery, [
              numericRoomPrice, diffindays, paymentStatus, 
              parseFloat(discount) || 0.00,
              parseFloat(seniorPwdDiscountPercent) || 0.00,
              editedBy, editDate, bookingId
            ]);

            // 4. DO NOT DELETE ALL UNPAID SERVICES - only delete specific form-managed services
            //    Extra services (like Car Rentals) should be preserved and not deleted
            //    We'll only delete breakfast, pickup, dropoff, and late checkout services below

            // 4A. If checkout status is now REGULAR (0) or fee is 0,
            //     tanggalin lahat ng late checkout services (SERVICE_ID = 72),
            //     kahit dati pa silang paid – dahil binago na ang status.
            if (checkOutStatus != 1 || !(parseFloat(lateCheckoutFee) > 0)) {
              await connection.promise().query(
                'DELETE FROM booking_service WHERE BOOKING_ID = ? AND SERVICE_ID = 72',
                [bookingId]
              );
            }

            // 4B. Sync BREAKFAST services with the form.
            //     Kapag walang adult at kids qty (checkbox unchecked),
            //     burahin lahat ng breakfast-type services for this booking.
            const adultQtyNum = parseInt(breakfastAdultQty) || 0;
            const kidQtyNum = parseInt(breakfastKidQty) || 0;
            if (adultQtyNum === 0 && kidQtyNum === 0) {
              await connection.promise().query(
                `DELETE FROM booking_service 
                 WHERE BOOKING_ID = ? 
                   AND SERVICE_ID IN (
                     SELECT IDNo FROM services 
                     WHERE SERVICE_NAME LIKE '%Breakfast%'
                   )`,
                [bookingId]
              );
            }

            // 4C. Sync PICK-UP services with the form.
            //     Kapag walang pickupServiceId (checkbox unchecked),
            //     burahin lahat ng pick-up services for this booking.
            if (!pickupServiceId) {
              await connection.promise().query(
                `DELETE FROM booking_service 
                 WHERE BOOKING_ID = ? 
                   AND SERVICE_ID IN (
                     SELECT IDNo FROM services 
                     WHERE LOWER(SERVICE_NAME) LIKE '%pick-up%' 
                        OR LOWER(SERVICE_NAME) LIKE '%pick up%'
                   )`,
                [bookingId]
              );
            }

            // 4D. Sync DROPOFF services with the form.
            //     Kapag walang dropoffServiceId (checkbox unchecked),
            //     burahin lahat ng drop-off services for this booking.
            if (!dropoffServiceId) {
              await connection.promise().query(
                `DELETE FROM booking_service 
                 WHERE BOOKING_ID = ? 
                   AND SERVICE_ID IN (
                     SELECT IDNo FROM services 
                     WHERE LOWER(SERVICE_NAME) LIKE '%drop-off%' 
                        OR LOWER(SERVICE_NAME) LIKE '%drop off%'
                   )`,
                [bookingId]
              );
            }

            // 5. Insert (or update) services from edit form
            //    - Kung may existing service na may parehong SERVICE_ID, i-UPDATE lang (walang duplicate row)
            //    - Kung wala pa, saka lang mag-iINSERT
            const servicesToInsert = [];

            // Kunin lahat ng existing active services for this booking
            const [existingServiceRows] = await connection.promise().query(
              `SELECT IDNo, SERVICE_ID 
               FROM booking_service 
               WHERE BOOKING_ID = ? AND ACTIVE = 1`,
              [bookingId]
            );
            const existingByServiceId = new Map();
            for (const row of existingServiceRows) {
              existingByServiceId.set(String(row.SERVICE_ID), row.IDNo);
            }

            // Helper para mag-update o mag-queue for insert
            async function upsertService(serviceId, qty, totalCost) {
              const statusValue = paymentStatus === 'paid' ? 'paid' : 'unpaid';
              const key = String(serviceId);
              const existingId = existingByServiceId.get(key);

              if (existingId) {
                // UPDATE existing row (walang bagong row sa booking_service)
                await connection.promise().query(
                  `UPDATE booking_service
                   SET QTY = ?, TOTAL_COST = ?, STATUS = ?, EDITED_BY = ?, EDITED_DT = ?
                   WHERE IDNo = ?`,
                  [qty, totalCost, statusValue, editedBy, editDate, existingId]
                );
              } else {
                // Queue for INSERT (bagong service)
                servicesToInsert.push([
                  bookingId, serviceId, qty, totalCost,
                  statusValue, editedBy, editDate, 1
                ]);
              }
            }

            if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
              const totalAdult = (parseFloat(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0);
              await upsertService(breakfastAdultId, parseInt(breakfastAdultQty), totalAdult);
            }

            if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
              const totalKid = (parseFloat(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0);
              await upsertService(breakfastKidId, parseInt(breakfastKidQty), totalKid);
            }

            if (pickupServiceId && pickupPrice) {
              const pickupTotal = parseFloat(pickupPrice);
              await upsertService(pickupServiceId, 1, pickupTotal);
            }

            if (dropoffServiceId && dropoffPrice) {
              const dropoffTotal = parseFloat(dropoffPrice);
              await upsertService(dropoffServiceId, 1, dropoffTotal);
            }

            if (servicesToInsert.length > 0) {
              const serviceQuery = `
                INSERT INTO booking_service 
                (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
                VALUES ?
              `;
              await connection.promise().query(serviceQuery, [servicesToInsert]);
            }

            // 5A. Handle late checkout fee if applicable
            if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0) {
              // Huwag mag-duplicate ng late checkout service (SERVICE_ID = 72)
              const [existingLate] = await connection.promise().query(
                `SELECT IDNo FROM booking_service 
                 WHERE BOOKING_ID = ? AND SERVICE_ID = 72 AND ACTIVE = 1 
                 LIMIT 1`,
                [bookingId]
              );

              if (existingLate.length === 0) {
                console.log('✅ Adding late checkout service to booking_service (EDIT)');
                const lateCheckoutQuery = `
                  INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
                  VALUES (?, 72, 1, ?, ?, ?, NOW(), 1)
                `;
                
                const lateCheckoutStatus = paymentStatus === 'paid' ? 'paid' : 'unpaid';
                await connection.promise().query(lateCheckoutQuery, [
                  bookingId, lateCheckoutFee, lateCheckoutStatus, editedBy
                ]);
                console.log('✅ Late checkout service added successfully');
              } else {
                console.log('ℹ️ Late checkout service already exists for booking, skipping insert.');
              }
            }

            // 6. Update payments based on paid amount
            if (paymentStatus === 'paid' || paymentStatus === 'partial') {
              // Only remove the generic cash/room placeholder row(s) this same block
              // creates below (BILLING_ID/BOOKING_SERVICE_ID/etc all NULL, never settled).
              // Real transactions - credit/marker entries, settled payments, and
              // payments tied to a specific bill/service/extension/pickdrop - must never
              // be touched here, or booking edits silently destroy the credit ledger.
              await connection.promise().query(
                `DELETE FROM payments
                 WHERE BOOKING_ID = ? AND PAYMENT_METHOD = 'cash' AND PAYMENT_TYPE = 'room'
                   AND BILLING_ID IS NULL AND BOOKING_SERVICE_ID IS NULL
                   AND BOOKING_EXTENSION_ID IS NULL AND BOOKING_PICKDROP_ID IS NULL
                   AND SETTLED_DATE IS NULL`,
                [bookingId]
              );

              // The submitted paidAmount is the FULL total (it's pre-filled server-side as
              // SUM of every payment already on this booking - see getEditBookingDetails).
              // Only insert the portion not already covered by payments still on record
              // after the placeholder cleanup above, so re-saving an unchanged amount
              // doesn't keep stacking duplicate cash rows on top of the real ones.
              const paidAmountNum = parseFloat(paidAmount) || 0;
              const [[{ alreadyRecorded }]] = await connection.promise().query(
                'SELECT COALESCE(SUM(AMOUNT_PAID), 0) AS alreadyRecorded FROM payments WHERE BOOKING_ID = ?',
                [bookingId]
              );
              const deltaToInsert = Math.round((paidAmountNum - parseFloat(alreadyRecorded)) * 100) / 100;
              if (deltaToInsert > 0) {
                const paymentQuery = `
                  INSERT INTO payments
                  (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                await connection.promise().query(paymentQuery, [
                  bookingId, null, deltaToInsert, 'cash', 'room', editDate, editedBy
                ]);
              }
            }

            // 6A. Update extra services status based on payment status
            // If payment status is 'paid', mark all unpaid extra services as 'paid'
            // Exclude form-managed services (72, 74, 75, 76, 77) as they're handled separately
            if (paymentStatus === 'paid') {
              // Update booking_service (extra services)
              await connection.promise().query(
                `UPDATE booking_service 
                 SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                 WHERE BOOKING_ID = ? 
                   AND STATUS != 'paid' 
                   AND ACTIVE = 1
                   AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
                [editedBy, editDate, bookingId]
              );
              
              // Update booking_extension (Extended Stay)
              await connection.promise().query(
                `UPDATE booking_extension 
                 SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                 WHERE BOOKING_ID = ? 
                   AND PAYMENT_STATUS != 'paid' 
                   AND ACTIVE = 1`,
                [editedBy, editDate, bookingId]
              );
            } else if (paymentStatus === 'partial') {
              // For partial payment, we need to check if the paid amount covers the extra services
              // Get total cost of unpaid extra services
              const [unpaidServices] = await connection.promise().query(
                `SELECT SUM(TOTAL_COST) as totalUnpaid
                 FROM booking_service 
                 WHERE BOOKING_ID = ? 
                   AND STATUS != 'paid' 
                   AND ACTIVE = 1
                   AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
                [bookingId]
              );
              
              // Get total cost of unpaid extensions
              const [unpaidExtensions] = await connection.promise().query(
                `SELECT SUM(COST * QTY) as totalUnpaid
                 FROM booking_extension 
                 WHERE BOOKING_ID = ? 
                   AND PAYMENT_STATUS != 'paid' 
                   AND ACTIVE = 1`,
                [bookingId]
              );
              
              const totalUnpaidExtraServices = parseFloat(unpaidServices[0]?.totalUnpaid || 0);
              const totalUnpaidExtensions = parseFloat(unpaidExtensions[0]?.totalUnpaid || 0);
              const paidAmountNum = parseFloat(paidAmount) || 0;
              
              // Get total booking cost to determine allocation
              const [billingData] = await connection.promise().query(
                `SELECT 
                   (ROOM_CHARGE * QTY) as roomCost,
                   COALESCE((SELECT SUM(TOTAL_COST) FROM booking_service WHERE BOOKING_ID = ? AND ACTIVE = 1 AND SERVICE_ID IN (72, 74, 75, 76, 77)), 0) as formServicesCost,
                   COALESCE(LATE_CHECKOUT_CHARGE, 0) as lateCheckoutCharge,
                   COALESCE(DISCOUNT_AMOUNT, 0) as discount
                 FROM billing 
                 WHERE BOOKING_ID = ? AND ACTIVE = 1`,
                [bookingId, bookingId]
              );
              
              const roomCost = parseFloat(billingData[0]?.roomCost || 0);
              const formServicesCost = parseFloat(billingData[0]?.formServicesCost || 0);
              const lateCheckoutCharge = parseFloat(billingData[0]?.lateCheckoutCharge || 0);
              const discount = parseFloat(billingData[0]?.discount || 0);
              
              const totalBookingCost = roomCost + formServicesCost + lateCheckoutCharge + totalUnpaidExtraServices + totalUnpaidExtensions - discount;
              
              // If paid amount covers or exceeds the total, mark all services and extensions as paid
              if (paidAmountNum >= totalBookingCost) {
                await connection.promise().query(
                  `UPDATE booking_service 
                   SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                   WHERE BOOKING_ID = ? 
                     AND STATUS != 'paid' 
                     AND ACTIVE = 1
                     AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
                  [editedBy, editDate, bookingId]
                );
                
                await connection.promise().query(
                  `UPDATE booking_extension 
                   SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                   WHERE BOOKING_ID = ? 
                     AND PAYMENT_STATUS != 'paid' 
                     AND ACTIVE = 1`,
                  [editedBy, editDate, bookingId]
                );
              } else {
                // Calculate how much is left after paying for room and form services
                const remainingAfterRoomAndForm = paidAmountNum - (roomCost + formServicesCost + lateCheckoutCharge - discount);
                const totalUnpaidExtraAndExtensions = totalUnpaidExtraServices + totalUnpaidExtensions;
                
                // If remaining amount covers all extra services and extensions, mark them as paid
                if (remainingAfterRoomAndForm >= totalUnpaidExtraAndExtensions && totalUnpaidExtraAndExtensions > 0) {
                  await connection.promise().query(
                    `UPDATE booking_service 
                     SET STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                     WHERE BOOKING_ID = ? 
                       AND STATUS != 'paid' 
                       AND ACTIVE = 1
                       AND SERVICE_ID NOT IN (72, 74, 75, 76, 77)`,
                    [editedBy, editDate, bookingId]
                  );
                  
                  await connection.promise().query(
                    `UPDATE booking_extension 
                     SET PAYMENT_STATUS = 'paid', EDITED_BY = ?, EDITED_DT = ?
                     WHERE BOOKING_ID = ? 
                       AND PAYMENT_STATUS != 'paid' 
                       AND ACTIVE = 1`,
                    [editedBy, editDate, bookingId]
                  );
                }
              }
            }

            // Commit transaction
            await connection.promise().commit();
            connection.release();
            
            console.log('✅ Booking updated successfully');
            resolve({ 
              message: 'Booking updated successfully!',
              bookingId: bookingId
            });

          } catch (error) {
            // Rollback on error
            await connection.promise().rollback();
            connection.release();
            console.error('❌ Error updating booking:', error);
            reject(new Error('Error updating booking: ' + error.message));
          }
        });
      });
    });
  }

  // Get available rooms by floor for edit booking
  static async getAvailableRoomsByFloor(params) {
    try {
      const { floor, checkInDate, checkOutDate, excludeBookingId } = params;

      let query = `
        SELECT
          r.IDNo as room_id,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          r.ROOM_TYPE_ID,
          r.ROOM_BED,
          r.ROOM_MAX,
          r.ROOM_VIEW,
          rt.NAME as ROOM_TYPE,
          r.ROOM_PRICE
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ROOM_FLOOR = ?
        AND r.ACTIVE = 1
        AND (
          r.IDNo NOT IN (
            SELECT DISTINCT b.ROOM_ID
            FROM booking b
            WHERE b.ACTIVE = 1
            AND b.BOOKING_STATUS IN ('pending', 'check-In')
            AND (
              (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE > ?) OR
              (b.CHECK_IN_DATE < ? AND b.CHECK_OUT_DATE >= ?) OR
              (b.CHECK_IN_DATE >= ? AND b.CHECK_OUT_DATE <= ?)
            )
          )
          OR r.IDNo IN (
            SELECT b.ROOM_ID
            FROM booking b
            WHERE b.IDNo = ?
            AND b.ACTIVE = 1
          )
        )
        ORDER BY r.ROOM_NUMBER ASC
      `;

      const queryParams = [floor, checkInDate, checkInDate, checkOutDate, checkOutDate, checkInDate, checkOutDate, excludeBookingId];

      console.log('Executing query:', query);
      console.log('With parameters:', queryParams);

      const results = await queryDatabasePromise(query, queryParams);

      console.log('Query results:', results);
      return results;

    } catch (error) {
      console.error('Error fetching available rooms by floor:', error);
      throw error;
    }
  }

  // Find consecutive rooms with bed requirements (Hotel_Old logic)
  // Shared by findConsecutiveRooms (Add Group Booking's actual room search) and
  // getRangeAvailabilityCounts (Room Checker's quote) so both apply the exact
  // same availability rules - same room free for every night of the range,
  // unassigned-reservation bed holds subtracted, Check-In/Check-Out Status
  // compatibility filtered. Without this being shared, a count Room Checker
  // quotes as available can silently stop being available by the time staff
  // proceed to Add Group Booking's own (stricter) search.
  static async _findAvailableRoomsForRange(connection, { formattedStartDate, formattedEndDate, floorNumber, checkInStatus, checkOutStatus }) {
    const roomsQuery = `
      SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW,
             COALESCE(r.ROOM_PRICE, rt.BASE_PRICE) AS FINAL_PRICE,
             r.ROOM_TYPE_ID,
             (
               SELECT CASE
                 WHEN b2.LATE_CHECKOUT = 1 THEN 'L/O'
                 WHEN b2.LATE_CHECKOUT = 0 OR b2.LATE_CHECKOUT IS NULL THEN 'R/O'
                 ELSE NULL
               END
               FROM booking b2
               WHERE b2.ROOM_ID = r.IDNo
                 AND DATE(b2.CHECK_OUT_DATE) = ?
                 AND (b2.IS_CANCELLED IS NULL OR b2.IS_CANCELLED != 1)
                 AND b2.ACTIVE = 1
               LIMIT 1
             ) AS checkoutType,
             (
               SELECT CASE
                 WHEN b3.CHECK_IN_STATUS = 0 THEN 'L/I'
                 WHEN b3.CHECK_IN_STATUS = 1 THEN 'R/I'
                 ELSE NULL
               END
               FROM booking b3
               WHERE b3.ROOM_ID = r.IDNo
                 AND DATE(b3.CHECK_IN_DATE) = ?
                 AND (b3.IS_CANCELLED IS NULL OR b3.IS_CANCELLED != 1)
                 AND b3.ACTIVE = 1
               LIMIT 1
             ) AS checkinType
      FROM room r
      JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
      WHERE r.ROOM_STATUS != 3
        AND NOT EXISTS (
          SELECT 1 FROM booking b
          WHERE b.ROOM_ID = r.IDNo
            AND b.ACTIVE = 1
            AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
            AND (DATE(b.CHECK_IN_DATE) < ? AND DATE(b.CHECK_OUT_DATE) > ?)
        )`;

    const roomParams = [formattedStartDate, formattedEndDate, formattedEndDate, formattedStartDate];

    if (floorNumber) {
      roomParams.push(floorNumber);
    }

    const unassignedQuery = `
      SELECT
        b.IDNo AS bookingId,
        b.CHECK_IN_DATE,
        b.CHECK_OUT_DATE,
        b.BED_COUNT,
        COALESCE(r.ROOM_BED, b.BED_COUNT) AS REQUIRED_BEDS
      FROM booking b
      LEFT JOIN room r ON b.ROOM_ID = r.IDNo
      WHERE b.ACTIVE = 1
        AND b.IS_DIRECT_RESERVATION = 1
        AND (b.ROOM_ID = 0 OR b.ROOM_ID IS NULL)
        AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
        AND DATE(b.CHECK_IN_DATE) < ?
        AND DATE(b.CHECK_OUT_DATE) > ?
    `;

    const [unassignedRows] = await connection.query(unassignedQuery, [formattedEndDate, formattedStartDate]);

    const reservedBeds = unassignedRows.reduce((acc, booking) => {
      const bedCount = parseInt(booking.REQUIRED_BEDS, 10) || 0;
      if (bedCount === 1) acc.bed1 += 1;
      if (bedCount === 2) acc.bed2 += 1;
      return acc;
    }, { bed1: 0, bed2: 0 });

    let finalRoomsQuery = roomsQuery;
    if (floorNumber) {
      finalRoomsQuery += ' AND r.ROOM_FLOOR = ?';
    }
    finalRoomsQuery += ' ORDER BY r.ROOM_FLOOR, CAST(r.ROOM_NUMBER AS UNSIGNED)';

    const [rooms] = await connection.query(finalRoomsQuery, roomParams);

    // Count total rooms by bed type
    const totalRoomsByBed = rooms.reduce((acc, room) => {
      const bedCount = parseInt(room.ROOM_BED, 10);
      acc[bedCount] = (acc[bedCount] || 0) + 1;
      return acc;
    }, {});

    // Filter out rooms that are reserved for unassigned bookings (like topbar.ejs logic)
    const availableRooms = rooms.filter(room => {
      const bedCount = parseInt(room.ROOM_BED, 10);
      if (bedCount === 1) {
        const total1Bed = totalRoomsByBed[1] || 0;
        const available1Bed = Math.max(0, total1Bed - reservedBeds.bed1);
        return available1Bed > 0; // Show if there are any available 1-bed rooms
      } else if (bedCount === 2) {
        const total2Bed = totalRoomsByBed[2] || 0;
        const available2Bed = Math.max(0, total2Bed - reservedBeds.bed2);
        return available2Bed > 0; // Show if there are any available 2-bed rooms
      }
      return true; // Show other bed types
    });

    // Apply Check-In Status and Check-Out Status filters like topbar.ejs
    let filteredRooms = availableRooms;

    if (checkInStatus !== undefined && checkInStatus !== '' || checkOutStatus !== undefined && checkOutStatus !== '') {
      filteredRooms = availableRooms.filter(room => {
        const checkoutType = room.checkoutType;
        const checkinType = room.checkinType;
        let belongsToCheckin = true;
        let belongsToCheckout = true;

        // Check-In Status Filter Logic - Convert numeric values to matching logic
        if (checkInStatus === '1') {
          // Regular Check-In (value 1): Only compatible with R/O checkout OR no checkout conflict
          belongsToCheckin = (checkoutType === 'R/O' || !checkoutType);
        } else if (checkInStatus === '0') {
          // Late Check-In (value 0): Compatible with BOTH R/O and L/O checkout OR no checkout conflict
          belongsToCheckin = (checkoutType === 'R/O' || checkoutType === 'L/O' || !checkoutType);
        }

        // Check-Out Status Filter Logic - Convert numeric values to matching logic
        if (checkOutStatus === '0') {
          // Regular Check-Out (value 0): Compatible with BOTH R/I and L/I checkin OR no checkin conflict
          belongsToCheckout = (checkinType === 'R/I' || checkinType === 'L/I' || !checkinType);
        } else if (checkOutStatus === '1') {
          // Late Check-Out (value 1): Only compatible with L/I checkin OR no checkin conflict
          belongsToCheckout = (checkinType === 'L/I' || !checkinType);
        }

        return belongsToCheckin && belongsToCheckout;
      });
    }

    return { filteredRooms, reservedBeds };
  }

  // Whole-range King/Queen counts for Room Checker's quote panel, using the
  // exact same availability rules findConsecutiveRooms applies for Add Group
  // Booking's actual search (via the shared _findAvailableRoomsForRange
  // helper) - so a quote is guaranteed still bookable when staff proceed from
  // Room Checker into that modal.
  static async getRangeAvailabilityCounts(params) {
    const { startDate, endDate, checkInStatus, checkOutStatus, floorNumber } = params;

    const connection = await pool.promise().getConnection();
    try {
      const moment = require('moment');
      const formattedStartDate = moment(startDate, 'YYYY-MM-DD').format('YYYY-MM-DD');
      const formattedEndDate = moment(endDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

      const { filteredRooms } = await BookingModel._findAvailableRoomsForRange(connection, {
        formattedStartDate, formattedEndDate, floorNumber, checkInStatus, checkOutStatus
      });

      return {
        success: true,
        single: filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 1).length,
        double: filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 2).length
      };
    } finally {
      connection.release();
    }
  }

  static async findConsecutiveRooms(params) {
    const { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus, excludeGroupBookingId } = params;

    const connection = await pool.promise().getConnection();
    try {
      // Format dates
      const moment = require('moment');
      const formattedStartDate = moment(startDate, 'MMM DD, YYYY').format('YYYY-MM-DD');
      const formattedEndDate = moment(endDate, 'MMM DD, YYYY').format('YYYY-MM-DD');

      const { filteredRooms, reservedBeds } = await BookingModel._findAvailableRoomsForRange(connection, {
        formattedStartDate, formattedEndDate, floorNumber, checkInStatus, checkOutStatus
      });

      const conflicts = [];
      if (bed1Needed > 0 && reservedBeds.bed1 >= bed1Needed) {
        conflicts.push({ bed: 1, reserved: reservedBeds.bed1 });
      }
      if (bed2Needed > 0 && reservedBeds.bed2 >= bed2Needed) {
        conflicts.push({ bed: 2, reserved: reservedBeds.bed2 });
      }

      if (!filteredRooms.length) {
        return {
          success: false,
          message: 'No rooms available for the selected dates.',
          data: { unassignedConflicts: conflicts }
        };
      }

      const roomIds = filteredRooms.map(r => r.IDNo);
      const seasonalPricesMap = {};

      if (roomIds.length > 0) {
        const [seasonalRows] = await connection.query(
          `SELECT 
            rsp.ROOM_ID,
            rsp.SEASON_ID,
            s.NAME AS SEASON_NAME,
            s.START_DATE,
            s.END_DATE,
            rsp.ROOM_BED AS BED_COUNT,
            rsp.BOOKING_TYPE,
            rsp.PRICE AS SEASONAL_PRICE
          FROM room_season_price rsp
          LEFT JOIN season s ON s.IDNo = rsp.SEASON_ID
          WHERE rsp.ROOM_ID IN (?)
          ORDER BY rsp.ROOM_ID, rsp.SEASON_ID, rsp.BOOKING_TYPE, rsp.ROOM_BED`,
          [roomIds]
        );

        for (const row of seasonalRows) {
          if (!seasonalPricesMap[row.ROOM_ID]) seasonalPricesMap[row.ROOM_ID] = [];
          seasonalPricesMap[row.ROOM_ID].push({
            seasonId: row.SEASON_ID,
            seasonName: row.SEASON_NAME,
            bedCount: row.BED_COUNT,
            bookingType: row.BOOKING_TYPE,
            price: row.SEASONAL_PRICE,
            startDate: row.START_DATE,
            endDate: row.END_DATE
          });
        }
      }

      filteredRooms.forEach(room => {
        room.SEASONAL_PRICES = seasonalPricesMap[room.IDNo] || [];
      });

      const resolveSeasonalPrice = (room, checkInDate) => {
        const seasonalPrices = room.SEASONAL_PRICES || [];
        const bedCount = parseInt(room.ROOM_BED, 10);
        const checkMoment = moment(checkInDate, 'YYYY-MM-DD');
        if (!checkMoment.isValid()) return 0;

        const matchSeason = seasonalPrices.find(price => {
          const start = moment(price.startDate);
          const end = moment(price.endDate);
          if (!start.isValid() || !end.isValid()) return false;
          const inRange = start.isSameOrBefore(end)
            ? checkMoment.isBetween(start, end, 'day', '[]')
            : checkMoment.isSameOrAfter(start) || checkMoment.isSameOrBefore(end);

          return inRange && parseInt(price.bedCount, 10) === bedCount && price.bookingType === bookingRoute;
        });

        if (matchSeason) {
          return parseFloat(matchSeason.price) || 0;
        }

        const fallbackSeason = seasonalPrices.find(price => {
          const start = moment(price.startDate);
          const end = moment(price.endDate);
          if (!start.isValid() || !end.isValid()) return false;
          const inRange = start.isSameOrBefore(end)
            ? checkMoment.isBetween(start, end, 'day', '[]')
            : checkMoment.isSameOrAfter(start) || checkMoment.isSameOrBefore(end);

          return inRange && parseInt(price.bedCount, 10) === bedCount;
        });

        return fallbackSeason ? (parseFloat(fallbackSeason.price) || 0) : 0;
      };

      filteredRooms.sort((a, b) => parseInt(a.ROOM_NUMBER, 10) - parseInt(b.ROOM_NUMBER, 10));

      if (neededRooms > filteredRooms.length) {
        return {
          success: false,
          message: 'Not enough rooms available after accounting for unassigned bookings.',
          data: {
            availableRooms: filteredRooms,
            unassignedConflicts: conflicts
          }
        };
      }

      // CHECK: Validate bed requirements against available rooms
      const bedValidationPassed = !(bed1Needed + bed2Needed) ||
        (filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 1).length >= bed1Needed) &&
        (filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 2).length >= bed2Needed);

      if (!bedValidationPassed) {
        return {
          success: false,
          message: 'Not enough rooms with required bed types.',
          data: {
            availableRooms: filteredRooms.map(room => ({
              ...room,
              RESOLVED_PRICE: resolveSeasonalPrice(room, formattedStartDate)
            })),
            unassignedConflicts: conflicts
          }
        };
      }

      const payload = {
        consecutiveBlocks: [], // REMOVED: No auto-suggested consecutive blocks
        nonConsecutiveBlocks: [], // REMOVED: No auto-suggested non-consecutive blocks
        availableRooms: filteredRooms.map(room => ({
          ...room,
          RESOLVED_PRICE: resolveSeasonalPrice(room, formattedStartDate)
        })),
        unassignedConflicts: conflicts
      };

      return {
        success: true,
        data: payload,
        priority: 'manual' // Manual selection is now the default
      };

    } catch (error) {
      console.error('Error in findConsecutiveRooms:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Direct availability/pricing lookup for a specific set of room IDs (e.g. rooms
  // picked by dragging across the calendar), instead of a generic criteria search.
  // Returns the same room shape find_consecutive_rooms uses (IDNo, ROOM_NUMBER,
  // ROOM_BED, ROOM_PRICE, SEASONAL_PRICES) plus an isAvailable flag per room, so the
  // frontend can flag any room that got booked by someone else in the meantime.
  static async checkRoomsAvailability({ roomIds, startDate, endDate }) {
    const connection = await pool.promise().getConnection();

    try {
      const moment = require('moment');
      const formattedStartDate = moment(startDate).format('YYYY-MM-DD');
      const formattedEndDate = moment(endDate).format('YYYY-MM-DD');

      const roomsQuery = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW,
               COALESCE(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_PRICE,
               r.ROOM_TYPE_ID,
               EXISTS (
                 SELECT 1 FROM booking b
                 WHERE b.ROOM_ID = r.IDNo
                   AND b.ACTIVE = 1
                   AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                   AND (DATE(b.CHECK_IN_DATE) < ? AND DATE(b.CHECK_OUT_DATE) > ?)
               ) AS HAS_CONFLICT
        FROM room r
        JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.IDNo IN (?)
          AND r.ROOM_STATUS != 3
        ORDER BY CAST(r.ROOM_NUMBER AS UNSIGNED)
      `;

      const [rooms] = await connection.query(roomsQuery, [formattedEndDate, formattedStartDate, roomIds]);

      const foundIds = rooms.map(r => r.IDNo);
      const seasonalPricesMap = {};

      if (foundIds.length > 0) {
        const [seasonalRows] = await connection.query(
          `SELECT
            rsp.ROOM_ID,
            rsp.SEASON_ID,
            s.NAME AS SEASON_NAME,
            s.START_DATE,
            s.END_DATE,
            rsp.ROOM_BED AS BED_COUNT,
            rsp.BOOKING_TYPE,
            rsp.PRICE AS SEASONAL_PRICE
          FROM room_season_price rsp
          LEFT JOIN season s ON s.IDNo = rsp.SEASON_ID
          WHERE rsp.ROOM_ID IN (?)
          ORDER BY rsp.ROOM_ID, rsp.SEASON_ID, rsp.BOOKING_TYPE, rsp.ROOM_BED`,
          [foundIds]
        );

        for (const row of seasonalRows) {
          if (!seasonalPricesMap[row.ROOM_ID]) seasonalPricesMap[row.ROOM_ID] = [];
          seasonalPricesMap[row.ROOM_ID].push({
            seasonId: row.SEASON_ID,
            seasonName: row.SEASON_NAME,
            bedCount: row.BED_COUNT,
            bookingType: row.BOOKING_TYPE,
            price: row.SEASONAL_PRICE,
            startDate: row.START_DATE,
            endDate: row.END_DATE
          });
        }
      }

      const resultRooms = rooms.map(room => ({
        IDNo: room.IDNo,
        ROOM_NUMBER: room.ROOM_NUMBER,
        ROOM_FLOOR: room.ROOM_FLOOR,
        ROOM_BED: room.ROOM_BED,
        ROOM_VIEW: room.ROOM_VIEW,
        ROOM_PRICE: room.ROOM_PRICE,
        SEASONAL_PRICES: seasonalPricesMap[room.IDNo] || [],
        isAvailable: !room.HAS_CONFLICT
      }));

      connection.release();

      return {
        success: true,
        data: { rooms: resultRooms }
      };
    } catch (error) {
      connection.release();
      console.error('Error in checkRoomsAvailability:', error);
      throw error;
    }
  }

  static async findConsecutiveRoomsEdit(params) {
    const { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus, excludeGroupBookingId, currentGroupBookingId } = params;
    
    try {
      const connection = await pool.promise().getConnection();
      
      // Format dates
      const moment = require('moment');
      const formattedStartDate = moment(startDate, 'MMM DD, YYYY').format('YYYY-MM-DD');
      const formattedEndDate = moment(endDate, 'MMM DD, YYYY').format('YYYY-MM-DD');

      const roomsQuery = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW,
               COALESCE(r.ROOM_PRICE, rt.BASE_PRICE) AS FINAL_PRICE,
               r.ROOM_TYPE_ID,
               (
                 SELECT b.GROUP_BOOKING_ID
                 FROM booking b
                 WHERE b.ROOM_ID = r.IDNo
                   AND b.ACTIVE = 1
                   AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                   AND (DATE(b.CHECK_IN_DATE) < ? AND DATE(b.CHECK_OUT_DATE) > ?)
                 LIMIT 1
               ) AS currentGroupBookingId,
               (
                 SELECT CASE 
                   WHEN b2.LATE_CHECKOUT = 1 THEN 'L/O'
                   WHEN b2.LATE_CHECKOUT = 0 OR b2.LATE_CHECKOUT IS NULL THEN 'R/O'
                   ELSE NULL
                 END
                 FROM booking b2 
                 WHERE b2.ROOM_ID = r.IDNo 
                   AND DATE(b2.CHECK_OUT_DATE) = ?
                   AND (b2.IS_CANCELLED IS NULL OR b2.IS_CANCELLED != 1)
                   AND b2.ACTIVE = 1
                 LIMIT 1
               ) AS checkoutType,
               (
                 SELECT CASE 
                   WHEN b3.CHECK_IN_STATUS = 0 THEN 'L/I'
                   WHEN b3.CHECK_IN_STATUS = 1 THEN 'R/I'
                   ELSE NULL
                 END
                 FROM booking b3 
                 WHERE b3.ROOM_ID = r.IDNo 
                   AND DATE(b3.CHECK_IN_DATE) = ?
                   AND (b3.IS_CANCELLED IS NULL OR b3.IS_CANCELLED != 1)
                   AND b3.ACTIVE = 1
                 LIMIT 1
               ) AS checkinType
        FROM room r
        JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ROOM_STATUS != 3
          AND (
            -- Only include rooms that are currently assigned to the excluded group booking
            EXISTS (
              SELECT 1 FROM booking b
              WHERE b.ROOM_ID = r.IDNo
                AND b.ACTIVE = 1
                AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                AND b.GROUP_BOOKING_ID = ?
            )
            -- OR include all truly available rooms
            OR NOT EXISTS (
              SELECT 1 FROM booking b
              WHERE b.ROOM_ID = r.IDNo
                AND b.ACTIVE = 1
                AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
                AND (DATE(b.CHECK_IN_DATE) < ? AND DATE(b.CHECK_OUT_DATE) > ?)
            )
          )`;

      const roomParams = [
        formattedEndDate, formattedStartDate,  // For currentGroupBookingId subquery
        formattedStartDate,                    // For checkoutType subquery  
        formattedEndDate,                      // For checkinType subquery
        currentGroupBookingId,                 // For EXISTS clause
        formattedEndDate, formattedStartDate,  // For NOT EXISTS clause
        formattedEndDate, formattedStartDate   // For subquery in OR condition
      ];

      if (floorNumber) {
        roomParams.push(floorNumber);
      }

      const unassignedQuery = `
        SELECT 
          b.IDNo AS bookingId,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BED_COUNT,
          COALESCE(r.ROOM_BED, b.BED_COUNT) AS REQUIRED_BEDS
        FROM booking b
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE b.ACTIVE = 1
          AND b.IS_DIRECT_RESERVATION = 1
          AND (b.ROOM_ID = 0 OR b.ROOM_ID IS NULL)
          AND b.BOOKING_STATUS NOT IN ('cancelled', 'void', 'no-show')
          AND DATE(b.CHECK_IN_DATE) < ?
          AND DATE(b.CHECK_OUT_DATE) > ?
      `;

      const [unassignedRows] = await connection.query(unassignedQuery, [formattedEndDate, formattedStartDate]);

      const reservedBeds = unassignedRows.reduce((acc, booking) => {
        const bedCount = parseInt(booking.REQUIRED_BEDS, 10) || 0;
        if (bedCount === 1) acc.bed1 += 1;
        if (bedCount === 2) acc.bed2 += 1;
        return acc;
      }, { bed1: 0, bed2: 0 });

      const conflicts = [];
      if (bed1Needed > 0 && reservedBeds.bed1 >= bed1Needed) {
        conflicts.push({ bed: 1, reserved: reservedBeds.bed1 });
      }
      if (bed2Needed > 0 && reservedBeds.bed2 >= bed2Needed) {
        conflicts.push({ bed: 2, reserved: reservedBeds.bed2 });
      }

      const bedNeedsAfterReserve = {
        bed1: Math.max(bed1Needed - reservedBeds.bed1, 0),
        bed2: Math.max(bed2Needed - reservedBeds.bed2, 0)
      };

      let finalRoomsQuery = roomsQuery;
      if (floorNumber) {
        finalRoomsQuery += ' AND r.ROOM_FLOOR = ?';
      }
      finalRoomsQuery += ' ORDER BY r.ROOM_FLOOR, CAST(r.ROOM_NUMBER AS UNSIGNED)';

      const [rooms] = await connection.query(finalRoomsQuery, roomParams);

      // Count total rooms by bed type
      const totalRoomsByBed = rooms.reduce((acc, room) => {
        const bedCount = parseInt(room.ROOM_BED, 10);
        acc[bedCount] = (acc[bedCount] || 0) + 1;
        return acc;
      }, {});

      // Filter out rooms that are reserved for unassigned bookings (like topbar.ejs logic)
      const availableRooms = rooms.filter(room => {
        const bedCount = parseInt(room.ROOM_BED, 10);
        if (bedCount === 1) {
          const total1Bed = totalRoomsByBed[1] || 0;
          const available1Bed = Math.max(0, total1Bed - reservedBeds.bed1);
          return available1Bed > 0; // Show if there are any available 1-bed rooms
        } else if (bedCount === 2) {
          const total2Bed = totalRoomsByBed[2] || 0;
          const available2Bed = Math.max(0, total2Bed - reservedBeds.bed2);
          return available2Bed > 0; // Show if there are any available 2-bed rooms
        }
        return true; // Show other bed types
      });

      // Apply Check-In Status and Check-Out Status filters like topbar.ejs
      let filteredRooms = availableRooms;
      
      if (checkInStatus !== undefined && checkInStatus !== '' || checkOutStatus !== undefined && checkOutStatus !== '') {
        filteredRooms = availableRooms.filter(room => {
          const checkoutType = room.checkoutType;
          const checkinType = room.checkinType;
          let belongsToCheckin = true;
          let belongsToCheckout = true;
          
          // Check-In Status Filter Logic - Convert numeric values to matching logic
          if (checkInStatus === '1') {
            // Regular Check-In (value 1): Only compatible with R/O checkout OR no checkout conflict
            belongsToCheckin = (checkoutType === 'R/O' || !checkoutType);
          } else if (checkInStatus === '0') {
            // Late Check-In (value 0): Compatible with BOTH R/O and L/O checkout OR no checkout conflict
            belongsToCheckin = (checkoutType === 'R/O' || checkoutType === 'L/O' || !checkoutType);
          }
          
          // Check-Out Status Filter Logic - Convert numeric values to matching logic
          if (checkOutStatus === '0') {
            // Regular Check-Out (value 0): Compatible with BOTH R/I and L/I checkin OR no checkin conflict
            belongsToCheckout = (checkinType === 'R/I' || checkinType === 'L/I' || !checkinType);
          } else if (checkOutStatus === '1') {
            // Late Check-Out (value 1): Only compatible with L/I checkin OR no checkin conflict
            belongsToCheckout = (checkinType === 'L/I' || !checkinType);
          }
          
          const finalResult = belongsToCheckin && belongsToCheckout;
          return finalResult;
        });
      }

      if (!filteredRooms.length) {
        return {
          success: false,
          message: 'No rooms available for the selected dates.',
          data: { unassignedConflicts: conflicts }
        };
      }

      const roomIds = filteredRooms.map(r => r.IDNo);
      const seasonalPricesMap = {};

      if (roomIds.length > 0) {
        const [seasonalRows] = await connection.query(
          `SELECT 
            rsp.ROOM_ID,
            rsp.SEASON_ID,
            s.NAME AS SEASON_NAME,
            s.START_DATE,
            s.END_DATE,
            rsp.ROOM_BED AS BED_COUNT,
            rsp.BOOKING_TYPE,
            rsp.PRICE AS SEASONAL_PRICE
          FROM room_season_price rsp
          LEFT JOIN season s ON s.IDNo = rsp.SEASON_ID
          WHERE rsp.ROOM_ID IN (?)
          ORDER BY rsp.ROOM_ID, rsp.SEASON_ID, rsp.BOOKING_TYPE, rsp.ROOM_BED`,
          [roomIds]
        );

        for (const row of seasonalRows) {
          if (!seasonalPricesMap[row.ROOM_ID]) seasonalPricesMap[row.ROOM_ID] = [];
          seasonalPricesMap[row.ROOM_ID].push({
            seasonId: row.SEASON_ID,
            seasonName: row.SEASON_NAME,
            bedCount: row.BED_COUNT,
            bookingType: row.BOOKING_TYPE,
            price: row.SEASONAL_PRICE,
            startDate: row.START_DATE,
            endDate: row.END_DATE
          });
        }
      }

      filteredRooms.forEach(room => {
        room.SEASONAL_PRICES = seasonalPricesMap[room.IDNo] || [];
      });

      const resolveSeasonalPrice = (room, checkInDate) => {
        const seasonalPrices = room.SEASONAL_PRICES || [];
        const bedCount = parseInt(room.ROOM_BED, 10);
        const checkMoment = moment(checkInDate, 'YYYY-MM-DD');
        if (!checkMoment.isValid()) return 0;

        const matchSeason = seasonalPrices.find(price => {
          const start = moment(price.startDate);
          const end = moment(price.endDate);
          if (!start.isValid() || !end.isValid()) return false;
          const inRange = start.isSameOrBefore(end)
            ? checkMoment.isBetween(start, end, 'day', '[]')
            : checkMoment.isSameOrAfter(start) || checkMoment.isSameOrBefore(end);

          return inRange && parseInt(price.bedCount, 10) === bedCount && price.bookingType === bookingRoute;
        });

        if (matchSeason) {
          return parseFloat(matchSeason.price) || 0;
        }

        const fallbackSeason = seasonalPrices.find(price => {
          const start = moment(price.startDate);
          const end = moment(price.endDate);
          if (!start.isValid() || !end.isValid()) return false;
          const inRange = start.isSameOrBefore(end)
            ? checkMoment.isBetween(start, end, 'day', '[]')
            : checkMoment.isSameOrAfter(start) || checkMoment.isSameOrBefore(end);

          return inRange && parseInt(price.bedCount, 10) === bedCount;
        });

        return fallbackSeason ? (parseFloat(fallbackSeason.price) || 0) : 0;
      };

      const attachResolvedPrices = (block) => {
        return block.map(room => {
          return {
            ...room,
            RESOLVED_PRICE: resolveSeasonalPrice(room, formattedStartDate)
          };
        });
      };

      filteredRooms.sort((a, b) => parseInt(a.ROOM_NUMBER, 10) - parseInt(b.ROOM_NUMBER, 10));

      if (neededRooms > filteredRooms.length) {
        return {
          success: false,
          message: 'Not enough rooms available after accounting for unassigned bookings.',
          data: {
            availableRooms: filteredRooms,
            unassignedConflicts: conflicts
          }
        };
      }

      // CHECK: Validate bed requirements against available rooms
      const bedValidationPassed = !(bed1Needed + bed2Needed) || 
        (filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 1).length >= bed1Needed) &&
        (filteredRooms.filter(r => parseInt(r.ROOM_BED, 10) === 2).length >= bed2Needed);

      if (!bedValidationPassed) {
        return {
          success: false,
          message: 'Not enough rooms with required bed types.',
          data: {
            availableRooms: filteredRooms.map(room => ({
              ...room,
              RESOLVED_PRICE: resolveSeasonalPrice(room, formattedStartDate)
            })),
            unassignedConflicts: conflicts
          }
        };
      }

      const payload = {
        consecutiveBlocks: [], // REMOVED: No auto-suggested consecutive blocks
        nonConsecutiveBlocks: [], // REMOVED: No auto-suggested non-consecutive blocks
        availableRooms: filteredRooms.map(room => ({
          ...room,
          RESOLVED_PRICE: resolveSeasonalPrice(room, formattedStartDate)
        })),
        unassignedConflicts: conflicts
      };

      connection.release();

      return {
        success: true,
        data: payload,
        priority: 'manual' // Manual selection is now the default
      };

    } catch (error) {
      console.error('Error in findConsecutiveRoomsEdit:', error);
      throw error;
    }
  }

  // addGroupBooking temporarily removed per request
  static async addGroupBooking(data) {
    const {
      selectedRooms,
      selectedRoomPrice,
      qty,
      daterange,
      groupName,
      groupContact,
      numberOfRooms,
      paymentStatus,
      paidAmount = 0,
      bookingRoute,
      guestType,
      guestLevel,
      checkInStatus,
      checkOutStatus,
      holdPending,
      remarks,
      agencyId = null,
      agencyPayer = null,
      channelBookingId = null,
      // Group-level services
      breakfastAdultQty,
      breakfastAdultPrice,
      breakfastAdultId,
      breakfastKidQty,
      breakfastKidPrice,
      breakfastKidId,
      breakfastIndividual = false,
      pickupServiceId,
      pickupPrice,
      dropoffServiceId,
      dropoffPrice,
      flightNumber,
      passengerCount,
      discount = 0,
      consolidatedBilling: consolidatedBillingParam = true, // Default: Master Billing (changed from false to true)
      perRoomDiscounts = [],
      lateCheckoutFee = 0,
      // Meta
      encodedBy,
      date,
      isDirectReservation,
      seniorPwdDiscountPercent = 0,
      seniorPwdRoomCount = 0,
      existingGroupId = null // ID of existing group to join
    } = data;

    const holdPendingFlag = (holdPending === true || holdPending === 1 || holdPending === '1' || holdPending === 'true') ? 1 : 0;

    // Use let so we can override when joining existing group
    let consolidatedBilling = consolidatedBillingParam;

    // Helper: parse daterange "MMM DD, YYYY to MMM DD, YYYY (..optional..)"
    const moment = require('moment');
    const [rawCheckIn = '', rawCheckOut = ''] = (daterange || '').split(' to ');
    const normalizeDate = (raw, isCheckIn) => {
      if (!raw) return null;
      const clean = raw.split(' (')[0].trim();
      const time = isCheckIn ? '06:00:00' : (checkOutStatus == 1 ? '23:00:00' : '18:00:00');
      const parsed = moment(clean, 'MMM DD, YYYY');
      if (!parsed.isValid()) return null;
      return `${parsed.format('YYYY-MM-DD')} ${time}`;
    };
    const checkInDate = normalizeDate(rawCheckIn, true);
    const checkOutDate = normalizeDate(rawCheckOut, false);
    if (!checkInDate || !checkOutDate) {
      throw new Error('Invalid date range supplied for group booking');
    }
    const checkInDateFormatted = moment(checkInDate, 'YYYY-MM-DD HH:mm:ss').format('YYYYMMDD');

    // Compute confirmation number base
    const roomIds = (selectedRooms || '').split(',').filter(Boolean);
    if (!roomIds.length) {
      throw new Error('No rooms selected');
    }

    // Get connection for transaction
    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
    });

    // Get room numbers for logging (now that connection is available)
    const roomNumbers = [];
    for (const roomId of roomIds) {
      const [roomRows] = await connection.promise().query('SELECT ROOM_NUMBER FROM room WHERE IDNo = ?', [roomId]);
      if (roomRows && roomRows.length > 0) {
        roomNumbers.push(roomRows[0].ROOM_NUMBER);
      }
    }

    // Log consolidated billing status
    console.log('🚀 Starting Group Booking Process...');
    console.log(`📋 Consolidated Billing: ${consolidatedBilling ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🏨 Number of Rooms: ${roomIds.length}`);
    console.log(`💰 Payment Status: ${paymentStatus}`);

    try {
      // Begin transaction
      await new Promise((resolve, reject) => connection.beginTransaction(err => (err ? reject(err) : resolve())));

      // Determine confirmation number
      let confirmationNumber;
      if (isDirectReservation) {
        const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }).replace(/:/g, '');
        confirmationNumber = checkInDateFormatted + 'UR' + currentTime;
      } else {
        const [roomRows] = await connection.promise().query('SELECT ROOM_NUMBER FROM room WHERE IDNo = ?', [roomIds[0]]);
        if (!roomRows || roomRows.length === 0) {
          throw new Error('Room not found');
        }
        const roomNumber = roomRows[0].ROOM_NUMBER;
        confirmationNumber = checkInDateFormatted + '0' + roomNumber;
      }

      // Check if joining existing group or creating new one
      let groupBookingId;
      let existingMasterBookingId = null; // For Master Billing when joining
      
      if (existingGroupId) {
        // Joining existing group - use existing group ID
        groupBookingId = existingGroupId;
        
        // Verify the group exists and get its billing type
        const [existingGroup] = await connection.promise().query(
          'SELECT IDNo, NUMBER_OF_ROOMS, BILLING_TYPE, GROUP_NAME, CONTACT_NO FROM group_booking WHERE IDNo = ?',
          [existingGroupId]
        );
        
        if (!existingGroup || existingGroup.length === 0) {
          throw new Error(`Existing group not found (ID: ${existingGroupId})`);
        }
        
        const existingGroupData = existingGroup[0];
        
        // Validate group name and contact match (IMPROVEMENT #3)
        if (existingGroupData.GROUP_NAME !== groupName) {
          throw new Error(`Group name mismatch. Expected: "${existingGroupData.GROUP_NAME}", Got: "${groupName}". Please ensure you're joining the correct group.`);
        }
        
        if (existingGroupData.CONTACT_NO !== groupContact) {
          throw new Error(`Group contact mismatch. Expected: "${existingGroupData.CONTACT_NO}", Got: "${groupContact}". Please ensure you're joining the correct group.`);
        }
        
        // IMPORTANT: Override consolidatedBilling with existing group's billing type
        // BILLING_TYPE: 1 = Master/Consolidated, 0 = Individual
        const existingBillingType = existingGroupData.BILLING_TYPE;
        consolidatedBilling = (existingBillingType === 1);
        
        // If Master Billing, get the master booking ID (first booking in the group)
        if (consolidatedBilling) {
          const [masterBooking] = await connection.promise().query(
            'SELECT MIN(IDNo) AS master_booking_id FROM booking WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1',
            [existingGroupId]
          );
          existingMasterBookingId = masterBooking[0]?.master_booking_id || null;
          console.log(`📋 Master Billing: Found master booking ID: ${existingMasterBookingId}`);
        }
        
        console.log(`✅ Joining existing group ${existingGroupId}`);
        console.log(`📋 Existing Group Billing Type: ${existingBillingType === 1 ? 'MASTER/CONSOLIDATED' : 'INDIVIDUAL'}`);
        console.log(`📋 Overriding consolidatedBilling to: ${consolidatedBilling}`);
        
        // NOTE: Room count update moved to AFTER successful booking creation (IMPROVEMENT #2)
      } else {
        // Creating new group - insert new group_booking record
        const groupBookingQuery = `
          INSERT INTO group_booking (
            GROUP_NAME,
            CONTACT_NO,
            NUMBER_OF_ROOMS,
            ENCODED_BY,
            GROUP_RESERVATION_FEE,
            GROUP_DISCOUNT,
            REMARKS,
            CHANNEL_BOOKING_ID,
            BILLING_TYPE,
            SENIOR_PWD_DISCOUNT_PERCENT,
            SENIOR_PWD_ROOM_COUNT
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [groupResult] = await connection.promise().query(groupBookingQuery, [
          groupName,
          groupContact,
          numberOfRooms,
          encodedBy,
          0, // GROUP_RESERVATION_FEE removed - always set to 0
          parseFloat(discount) || 0,
          remarks || '',
          (String(bookingRoute || '') === 'booking-channel' || channelBookingId)
            ? (channelBookingId || null)
            : null,
          consolidatedBilling ? 1 : 0, // 1 = Master, 0 = Individual
          parseFloat(seniorPwdDiscountPercent) || 0.00,
          parseInt(seniorPwdRoomCount, 10) || 0
        ]);
        groupBookingId = groupResult.insertId;
        console.log(`✅ Created new group ${groupBookingId}`);
      }

      // Prepare per-room arrays
      // selectedRoomPrice is a pipe-separated list of per-room prices (prices may contain commas as thousands separators)
      const roomPriceParts = (selectedRoomPrice || '').split('|').filter(p => p.trim() !== '');
      // Fallback: if no pipe separators, treat the whole value as a single price
      const roomBasePrices = roomPriceParts.length > 0
        ? roomPriceParts.map(p => parseFloat(p.replace(/,/g, '').trim()) || 0)
        : [(parseFloat((selectedRoomPrice || '').replace(/,/g, '').trim()) || 0)];
      const nightsCount = parseInt(qty, 10) || 1;
      // Reservation fees removed
      const perRoomDiscountsArray = Array.isArray(perRoomDiscounts) ? perRoomDiscounts : (typeof perRoomDiscounts === 'string' ? perRoomDiscounts.split(',') : []);

      // console.log('🔄 Group Booking Debug Info:');
      // console.log(`   selectedRoomPrice: "${selectedRoomPrice}"`);
      // console.log(`   roomBasePrices: [${roomBasePrices.join(', ')}]`);
      // console.log(`   perRoomDiscountsArray: [${perRoomDiscountsArray.join(', ')}]`);
      // console.log(`   nightsCount: ${nightsCount}`);
      // console.log(`   consolidatedBilling: ${consolidatedBilling}`);

      let firstBookingId = null;
      let totalGroupRoomCharges = 0;
      const newBookingIdsInTransaction = []; // Track all booking IDs created in this transaction

      // Get existing booking count if joining existing group
      let existingBookingCount = 0;
      if (existingGroupId) {
        const [existingBookings] = await connection.promise().query(
          'SELECT COUNT(*) AS count FROM booking WHERE GROUP_BOOKING_ID = ? AND ACTIVE = 1',
          [groupBookingId]
        );
        existingBookingCount = existingBookings[0]?.count || 0;
        console.log(`📊 Existing bookings in group: ${existingBookingCount}`);
        
        // IMPROVEMENT #1 & #4: Validate room availability and check for duplicates
        console.log('🔍 Validating room availability and checking for duplicates...');
        for (let i = 0; i < roomIds.length; i++) {
          const roomId = roomIds[i];
          
          // Check for duplicate room in same group with overlapping dates (IMPROVEMENT #4)
          const [duplicateCheck] = await connection.promise().query(
            `SELECT b.IDNo, b.CHECK_IN_DATE, b.CHECK_OUT_DATE, r.ROOM_NUMBER
             FROM booking b
             JOIN room r ON b.ROOM_ID = r.IDNo
             WHERE b.GROUP_BOOKING_ID = ? 
               AND b.ROOM_ID = ? 
               AND b.ACTIVE = 1
               AND (
                 (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE >= ?) OR
                 (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE >= ?) OR
                 (b.CHECK_IN_DATE >= ? AND b.CHECK_OUT_DATE <= ?)
               )`,
            [existingGroupId, roomId, checkOutDate, checkInDate, checkInDate, checkOutDate, checkInDate, checkOutDate]
          );
          
          if (duplicateCheck && duplicateCheck.length > 0) {
            const conflict = duplicateCheck[0];
            throw new Error(`Duplicate room booking detected: Room ${conflict.ROOM_NUMBER} (ID: ${roomId}) already has a booking in this group (Booking ID: ${conflict.IDNo}) for the selected dates (${checkInDate} to ${checkOutDate}).`);
          }
          
          // Check for room availability conflicts with other bookings (IMPROVEMENT #1)
          try {
            const overlaps = await CalendarModel.checkBookingOverlaps(roomId, checkInDate, checkOutDate);
            
            if (overlaps && overlaps.length > 0) {
              // Filter out bookings from the same group (those are handled by duplicate check)
              const externalConflicts = overlaps.filter(o => {
                // Check if this booking is from the same group
                return true; // We'll check this in the query
              });
              
              // Get room number for better error message
              const [roomInfo] = await connection.promise().query(
                'SELECT ROOM_NUMBER FROM room WHERE IDNo = ?',
                [roomId]
              );
              const roomNumber = roomInfo && roomInfo.length > 0 ? roomInfo[0].ROOM_NUMBER : `Room ID ${roomId}`;
              
              // Check each overlap to see if it's from the same group
              const conflictDetails = [];
              for (const overlap of overlaps) {
                const [bookingGroup] = await connection.promise().query(
                  'SELECT GROUP_BOOKING_ID FROM booking WHERE IDNo = ?',
                  [overlap.IDNo]
                );
                
                // Only report conflicts from different groups
                if (!bookingGroup || bookingGroup.length === 0 || bookingGroup[0].GROUP_BOOKING_ID !== existingGroupId) {
                  conflictDetails.push(`Booking ${overlap.IDNo} (${overlap.CUSTOMER_NAME})`);
                }
              }
              
              if (conflictDetails.length > 0) {
                throw new Error(`Room ${roomNumber} (ID: ${roomId}) is not available for the selected dates (${checkInDate} to ${checkOutDate}). Conflicts with: ${conflictDetails.join(', ')}`);
              }
            }
          } catch (error) {
            // If it's our custom error, throw it as-is
            if (error.message.includes('Room') && error.message.includes('not available')) {
              throw error;
            }
            // Otherwise, log and rethrow
            console.error('Error checking room availability:', error);
            throw new Error(`Failed to validate room availability for room ${roomId}: ${error.message}`);
          }
        }
        console.log('✅ Room availability validation passed');
      }

      // Insert each room booking
      for (let index = 0; index < roomIds.length; index++) {
        const roomId = roomIds[index];
        // Calculate customer name: if joining, continue numbering from existing count
        // First booking in new group: "TEST-Main-1", others: "TEST-2", "TEST-3", etc.
        // When joining: continue from existing count (e.g., if 5 exist, new ones: "TEST-6", "TEST-7", etc.)
        let guestFullName;
        if (existingGroupId) {
          // Joining existing group: continue numbering
          const bookingNumber = existingBookingCount + index + 1;
          guestFullName = `${groupName}-${bookingNumber}`;
        } else {
          // New group: first is "Main-1", others are numbered
          guestFullName = index === 0 ? `${groupName}-Main-1` : `${groupName}-${index + 1}`;
        }
        const bookingRemarksForThisRow = index === 0 ? (remarks || '') : '';
        const baseRoomPrice = roomBasePrices[index];
        const totalRoomCharge = baseRoomPrice * nightsCount;

        // Calculate per-room adjustments
        const perRoomFee = 0; // Reservation fees removed
        const perRoomDiscount = parseFloat(perRoomDiscountsArray[index]) || 0;

        // If consolidated billing, all room charges go to main booking
        let adjustedRoomCharge;
        if (consolidatedBilling && index === 0) {
          // Main booking gets all room charges
          // Calculate total for ALL rooms including nights: (room1 + room2 + ...) × nights
          const totalAllRoomsBase = roomBasePrices.reduce((sum, price) => sum + price, 0);
          const totalAllRooms = totalAllRoomsBase * nightsCount; // Multiply by number of nights
          const totalAllFees = 0; // Reservation fees removed
          const totalAllDiscounts = perRoomDiscountsArray.reduce((sum, discount) => sum + (parseFloat(discount) || 0), 0);
          adjustedRoomCharge = Math.max(totalAllRooms + totalAllFees - totalAllDiscounts, 0);
          totalGroupRoomCharges = adjustedRoomCharge; // Store for later use

        
        } else if (consolidatedBilling) {
          // Other bookings get zero room charges (consolidated billing)
          adjustedRoomCharge = 0;
          // console.log(`🔄 Consolidated Billing - Room ${index + 1}: ₱0.00 (additional room)`);
        } else {
          // Regular billing: each room gets its own charges
          adjustedRoomCharge = Math.max(totalRoomCharge + perRoomFee - perRoomDiscount, 0);
          totalGroupRoomCharges += adjustedRoomCharge;
          // console.log(`🔄 Individual Billing - Room ${index + 1}: ₱${adjustedRoomCharge.toLocaleString()} (${roomNumbers[index]}: ₱${baseRoomPrice} × ${nightsCount} nights)`);
        }

        // customer
        const customerQuery = `
          INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ADDRESS, MESSAGE, ENCODED_BY, ENCODED_DT, ACTIVE, IS_GROUP)
          VALUES (?, ?, ?, ?, '', '', ?, ?, 1, 1)
        `;
        const [custResult] = await connection.promise().query(customerQuery, [
          guestFullName,
          groupContact,
          guestType,
          guestLevel,
          encodedBy,
          date
        ]);
        const guestID = custResult.insertId;

        // booking
        const bookingQuery = `
          INSERT INTO booking (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, LATE_CHECKOUT, HOLD_PENDING, REMARKS, CONFIRMATION_NUMBER, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, GROUP_BOOKING_ID, AGENCY_ID, AGENCY_PAYER, IS_DIRECT_RESERVATION, FLIGHT_NUMBER, PASSENGER_COUNT)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const processedAgencyPayer = (bookingRoute === 'agency' && agencyPayer)
          ? (agencyPayer === 'guest' ? 'guest' : 'agency')
          : null;
        const bookingValues = [
          guestID,
          roomId,
          checkInDate,
          checkOutDate,
          'pending',
          bookingRoute,
          1,
          checkOutStatus,
          holdPendingFlag,
          bookingRemarksForThisRow,
          confirmationNumber,
          encodedBy,
          date,
          1,
          checkInStatus,
          groupBookingId,
          agencyId || null,
          processedAgencyPayer,
          0,
          (pickupServiceId || dropoffServiceId) ? (flightNumber || null) : null,
          (pickupServiceId || dropoffServiceId) ? (parseInt(passengerCount) || null) : null
        ];
        const [bookResult] = await connection.promise().query(bookingQuery, bookingValues);
        const bookingId = bookResult.insertId;
        if (!firstBookingId) firstBookingId = bookingId;
        newBookingIdsInTransaction.push(bookingId); // Track this booking ID

        // If this booking row has remarks, mirror to remarks table (like addBooking)
        if (bookingRemarksForThisRow && bookingRemarksForThisRow.trim() !== '') {
          await connection.promise().query(
            `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY)
             VALUES (?, 'Booking', ?, ?, ?)`,
            [bookingId, bookingRemarksForThisRow.trim(), encodedBy, encodedBy]
          );
        }

        // billing
        const billingQuery = `
          INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, ROOM_PRICE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let roomChargeForBilling, reservationFeeForBilling, discountForBilling, roomRatePerNight, quantityForBilling;

        // Special handling when joining existing group with Master Billing
        // IMPORTANT: Even with Master Billing, new bookings should have their own billing records
        // The charges will be synced to master booking separately, but keep individual records for tracking
        if (existingGroupId && consolidatedBilling && existingMasterBookingId) {
          // Joining existing group with Master Billing
          // Keep individual billing records but with actual charges (not 0)
          // This allows proper tracking while still syncing to master
          console.log(`🔄 Backend - Room ${index + 1}: JOINING GROUP WITH MASTER BILLING`);
          console.log(`   Individual billing record will be created with actual charges`);
          console.log(`   Charges will also be synced to master booking ${existingMasterBookingId}`);
          
          // Create individual billing record with actual charges (for tracking)
          roomChargeForBilling = totalRoomCharge; // Actual room charge for this booking
          reservationFeeForBilling = 0;
          discountForBilling = parseFloat(perRoomDiscountsArray[index]) || 0;
          roomRatePerNight = baseRoomPrice; // Room rate per night
          quantityForBilling = nightsCount; // Number of nights for this booking
        } else if (consolidatedBilling && index === 0) {
          // Main booking in consolidated billing gets all charges (new group)
          console.log(`🔄 Backend - Room ${index + 1}: CONSOLIDATED BILLING (Main Booking)`);
          roomChargeForBilling = adjustedRoomCharge; // Total of all rooms
          reservationFeeForBilling = 0; // Reservation fee removed
          discountForBilling = parseFloat(discount) || 0;
          
          // For consolidated billing, calculate average room rate per night
          const totalRoomsBase = roomBasePrices.reduce((sum, price) => sum + price, 0);
          roomRatePerNight = totalRoomsBase; // Sum of all room rates per night
          quantityForBilling = nightsCount; // Number of nights
        } else if (consolidatedBilling) {
          // Other bookings in consolidated billing have no charges (new group)
          console.log(`🔄 Backend - Room ${index + 1}: CONSOLIDATED BILLING (Other Booking - ₱0.00)`);
          roomChargeForBilling = 0;
          reservationFeeForBilling = 0;
          discountForBilling = 0;
          roomRatePerNight = 0;
          quantityForBilling = nightsCount;
        } else {
          // Regular billing: each room gets its own charges
          const roomNumber = roomNumbers[index] || `Room-${index + 1}`;
          console.log(`🔄 Backend - Room ${index + 1}: INDIVIDUAL BILLING (${roomNumber})`);
          roomChargeForBilling = totalRoomCharge; // Already includes nights multiplication
          reservationFeeForBilling = 0; // Reservation fee removed
          discountForBilling = parseFloat(perRoomDiscountsArray[index]) || 0;
          roomRatePerNight = baseRoomPrice; // Room rate per night
          quantityForBilling = nightsCount; // Number of nights
        }

        const billingValues = [
          bookingId,
          roomRatePerNight,          // ROOM_CHARGE (per-night charge applied in billing)
          baseRoomPrice,             // ROOM_PRICE (per-night rate for this specific room)
          0.00,
          0.00,
          0.00,
          quantityForBilling,        // QTY should be number of nights
          paymentStatus,
          'cash',
          '',
          encodedBy,
          date,
          1,
          reservationFeeForBilling,
          discountForBilling
        ];
        const [billResult] = await connection.promise().query(billingQuery, billingValues);

        // Log final billing for this booking
        // Both consolidated and individual billing now have roomChargeForBilling already including nights
        const finalAmount = roomChargeForBilling - reservationFeeForBilling - discountForBilling;
        // console.log(`💰 Final Billing - Room ${index + 1}: ₱${finalAmount.toLocaleString()} (Room: ₱${roomChargeForBilling}, Fee: ₱${reservationFeeForBilling}, Discount: -₱${discountForBilling})`);

        // Process late check-out fee if applicable
        // Late checkout fee is PER ROOM, but handling differs by billing type:
        // - Consolidated Billing: Total fee (fee × numRooms) goes to main booking only
        // - Individual Billing: Each room gets the fee
        // - When joining existing group with Master Billing: Each booking gets its own fee (separate billing)
        if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0) {
          if (existingGroupId && consolidatedBilling && existingMasterBookingId) {
            // Joining existing group with Master Billing: Add late checkout fee to current booking (separate billing)
            const lateCheckoutQuery = `
              INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
              VALUES (?, 72, 1, ?, ?, ?, NOW())
            `;
            const status = 'unpaid'; // Will be updated by payment distribution logic
            await connection.promise().query(lateCheckoutQuery, [bookingId, lateCheckoutFee, status, encodedBy]);
            console.log(`✅ Added late checkout fee (${lateCheckoutFee}) to booking ${bookingId} (separate billing)`);
          } else if (consolidatedBilling && index === 0) {
            // Consolidated: Add total late checkout fee (fee × number of rooms) to main booking only
            const totalLateCheckoutFee = parseFloat(lateCheckoutFee) * roomIds.length;
            const lateCheckoutQuery = `
              INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
              VALUES (?, 72, 1, ?, ?, ?, NOW())
            `;
            const status = 'unpaid'; // Will be updated by payment distribution logic
            await connection.promise().query(lateCheckoutQuery, [bookingId, totalLateCheckoutFee, status, encodedBy]);
          } else if (!consolidatedBilling) {
            // Individual: Add fee to each room
            const lateCheckoutQuery = `
              INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
              VALUES (?, 72, 1, ?, ?, ?, NOW())
            `;
            const status = 'unpaid'; // Will be updated by payment distribution logic
            await connection.promise().query(lateCheckoutQuery, [bookingId, lateCheckoutFee, status, encodedBy]);
          }
          // For consolidated billing and index > 0, skip (fee already added to main booking)
        }

        // Always insert payment records for reservation fee and discount (paid or unpaid)
        const additionalPayments = [];

        // For consolidated billing: apply group-level fees/discounts only to main booking
        // For individual billing: apply per-room fees/discounts to each room
        if (consolidatedBilling && index === 0) {
          if (reservationFeeForBilling > 0) {
            additionalPayments.push([
              bookingId,
              null,
              reservationFeeForBilling,
              'cash',
              'reservation_fee',
              date,
              encodedBy
            ]);
          }
          if (discountForBilling > 0) {
            additionalPayments.push([
              bookingId,
              null,
              -discountForBilling,
              'cash',
              'discount',
              date,
              encodedBy
            ]);
          }
        } else if (!consolidatedBilling) {
          if (reservationFeeForBilling > 0) {
            additionalPayments.push([
              bookingId,
              null,
              reservationFeeForBilling,
              'cash',
              'reservation_fee',
              date,
              encodedBy
            ]);
          }
          if (discountForBilling > 0) {
            additionalPayments.push([
              bookingId,
              null,
              -discountForBilling,
              'cash',
              'discount',
              date,
              encodedBy
            ]);
          }
        }

        if (additionalPayments.length > 0) {
          const additionalPayQuery = `
            INSERT INTO payments
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES ?
          `;
          await connection.promise().query(additionalPayQuery, [additionalPayments]);
        }

        // Room payments will be handled by payment distribution logic
      }

      // Fallback: if non-consolidated and no per-room discounts provided, but group-level provided
      if (!consolidatedBilling && firstBookingId) {
        const perRoomFeeSum = 0; // Reservation fees removed
        const perRoomDiscSum = (perRoomDiscountsArray || []).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const inserts = [];
        if (perRoomDiscSum <= 0 && (parseFloat(discount) || 0) > 0) {
          inserts.push([firstBookingId, null, -(parseFloat(discount) || 0), 'cash', 'discount', date, encodedBy]);
        }
        if (inserts.length > 0) {
          const q = `
            INSERT INTO payments
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES ?
          `;
          await connection.promise().query(q, [inserts]);
        }
      }

      // Insert group-level services
      // For new group: use all bookings created in this transaction
      // For joining existing group: use only the new bookings created in this transaction (separate billing)
      let targetBookingIds = [];
      
      if (existingGroupId && consolidatedBilling && existingMasterBookingId) {
        // Joining existing group: Use only NEW bookings created in this transaction
        targetBookingIds = newBookingIdsInTransaction.length > 0 ? newBookingIdsInTransaction : (firstBookingId ? [firstBookingId] : []);
        
        console.log(`🔄 Joining with Master Billing: Each booking will have separate billing records`);
        console.log(`   Master booking: ${existingMasterBookingId}`);
        console.log(`   New bookings (${targetBookingIds.length}): ${targetBookingIds.join(', ')}`);
        console.log(`   Services will be added to each new booking separately (not consolidated to master)`);
      } else {
        // New group: Use all bookings created in this transaction
        targetBookingIds = newBookingIdsInTransaction.length > 0 ? newBookingIdsInTransaction : (firstBookingId ? [firstBookingId] : []);
      }
      
      if (targetBookingIds.length > 0) {
        const groupServices = [];
        
        // Breakfast Adult
        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = (parseFloat(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0);
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          
          if (breakfastIndividual) {
            // Apply individually to each booking
            for (const bookingId of targetBookingIds) {
              groupServices.push([bookingId, breakfastAdultId, breakfastAdultQty, totalAdult, serviceStatus, encodedBy, date, 1]);
              // Payment distribution logic will handle service payments
            }
          } else {
            // Apply only to first booking
            groupServices.push([targetBookingIds[0], breakfastAdultId, breakfastAdultQty, totalAdult, serviceStatus, encodedBy, date, 1]);
            // Payment distribution logic will handle service payments
          }
        }
        
        // Breakfast Kid
        if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
          const totalKid = (parseFloat(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0);
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          
          if (breakfastIndividual) {
            // Apply individually to each booking
            for (const bookingId of targetBookingIds) {
              groupServices.push([bookingId, breakfastKidId, breakfastKidQty, totalKid, serviceStatus, encodedBy, date, 1]);
              // Payment distribution logic will handle service payments
            }
          } else {
            // Apply only to first booking
            groupServices.push([targetBookingIds[0], breakfastKidId, breakfastKidQty, totalKid, serviceStatus, encodedBy, date, 1]);
            // Payment distribution logic will handle service payments
          }
        }
        
        // Pickup
        if (pickupServiceId && pickupPrice) {
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          groupServices.push([targetBookingIds[0], pickupServiceId, 1, parseFloat(pickupPrice), serviceStatus, encodedBy, date, 1]);
          // Payment distribution logic will handle service payments
        }
        
        // Dropoff
        if (dropoffServiceId && dropoffPrice) {
          const serviceStatus = 'unpaid'; // Will be updated based on payment distribution
          groupServices.push([targetBookingIds[0], dropoffServiceId, 1, parseFloat(dropoffPrice), serviceStatus, encodedBy, date, 1]);
          // Payment distribution logic will handle service payments
        }
        
        if (groupServices.length > 0) {
          const serviceQuery = `
            INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES ?
          `;
          await connection.promise().query(serviceQuery, [groupServices]);
          
          // Service payments will be handled by payment distribution logic
        }
      }

      // Calculate services total and grand total
      // If individual breakfast, multiply by number of rooms; otherwise, apply once
      const numRooms = targetBookingIds.length;
      const breakfastAdultTotal = (parseInt(breakfastAdultQty) > 0 && breakfastAdultPrice) 
        ? (parseFloat(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0) * (breakfastIndividual ? numRooms : 1) 
        : 0;
      const breakfastKidTotal = (parseInt(breakfastKidQty) > 0 && breakfastKidPrice) 
        ? (parseFloat(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0) * (breakfastIndividual ? numRooms : 1) 
        : 0;
      const pickupTotal = pickupPrice ? parseFloat(pickupPrice) : 0;
      const dropoffTotal = dropoffPrice ? parseFloat(dropoffPrice) : 0;
      
      // Calculate late checkout fee total
      // For consolidated billing: total fee = fee × numRooms (all goes to main booking)
      // For individual billing: total fee = fee × numRooms (one per booking, but total is same)
      const lateCheckoutFeeTotal = (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0)
        ? parseFloat(lateCheckoutFee) * numRooms
        : 0;
      
      const servicesTotal = breakfastAdultTotal + breakfastKidTotal + pickupTotal + dropoffTotal + lateCheckoutFeeTotal;

      // console.log('🔄 Grand Total Calculation:');
      // console.log(`   totalGroupRoomCharges: ₱${totalGroupRoomCharges.toLocaleString()}`);
      // console.log(`   servicesTotal: ₱${servicesTotal.toLocaleString()}`);
      // console.log(`   subtotal: ₱${(totalGroupRoomCharges + servicesTotal).toLocaleString()}`);
      // console.log(`   reservationFee (subtract): -₱${(parseFloat(reservationFee) || 0).toLocaleString()}`);
      // console.log(`   discount (subtract): -₱${(parseFloat(discount) || 0).toLocaleString()}`);

      const subtotal = totalGroupRoomCharges + servicesTotal;
      const grandTotal = subtotal - (parseFloat(discount) || 0);

      // Payment Distribution Logic
      const paidAmountNum = parseFloat(paidAmount) || 0;
      const isIndividualBilling = !consolidatedBilling;
      
      if ((paymentStatus === 'paid' || paymentStatus === 'partial') && paidAmountNum > 0) {
        // Get all billing IDs for this group (use targetBookingIds which contains the relevant booking IDs)
        const [allBillings] = await connection.promise().query(
          'SELECT IDNo, BOOKING_ID, ROOM_CHARGE, QTY, PAYMENT_STATUS FROM billing WHERE BOOKING_ID IN (?)',
          [targetBookingIds.length > 0 ? targetBookingIds : (firstBookingId ? [firstBookingId] : [])]
        );

        // Get all service IDs for this group (only ACTIVE = 1)
        const [allServices] = await connection.promise().query(
          'SELECT IDNo, BOOKING_ID, TOTAL_COST, STATUS FROM booking_service WHERE BOOKING_ID IN (?) AND ACTIVE = 1',
          [targetBookingIds.length > 0 ? targetBookingIds : (firstBookingId ? [firstBookingId] : [])]
        );

        let remainingPayment = paidAmountNum;

        // Priority 1: Pay room charges first (apply discount to rooms)
        const totalBillingAmount = allBillings.reduce((sum, b) => sum + (b.ROOM_CHARGE * b.QTY), 0);
        const discountTotal = parseFloat(discount) || 0;
        // Budget for room after discount
        const roomTargetBudget = Math.max(totalBillingAmount - discountTotal, 0);
        // Track paid per billing to redistribute remainder
        const billingPaidMap = new Map();

        if (remainingPayment > 0 && totalBillingAmount > 0 && roomTargetBudget > 0) {
          
           if (isIndividualBilling) {
             // INDIVIDUAL BILLING: Hati-hati ang bayad per booking (equal share, capped per billing)
             const numberOfBookings = allBillings.length;
             const equalPaymentPerBooking = numberOfBookings > 0 ? remainingPayment / numberOfBookings : 0;
             
             for (const billing of allBillings) {
               if (equalPaymentPerBooking <= 0 || remainingPayment <= 0) break;
               
               const billingAmount = billing.ROOM_CHARGE * billing.QTY;
               const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
               const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
               
               const roomPaymentAmount = Math.min(equalPaymentPerBooking, billingPayCap, remainingPayment);
               
               if (roomPaymentAmount > 0) {
                 const roomPaymentQuery = `
                   INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                   VALUES (?, ?, ?, ?, 'room', NOW(), ?)
                 `;
                 await connection.promise().query(roomPaymentQuery, [
                   billing.BOOKING_ID,
                   billing.IDNo,
                   roomPaymentAmount,
                   'cash',
                   encodedBy
                 ]);
                 
                 // Record paid amount for redistribution
                 billingPaidMap.set(
                   billing.IDNo,
                   (billingPaidMap.get(billing.IDNo) || 0) + roomPaymentAmount
                 );
                 
                 let newStatus;
                 if (roomPaymentAmount >= billingPayCap && billingPayCap > 0) {
                   newStatus = 'paid';
                 } else if (roomPaymentAmount > 0) {
                   newStatus = 'partial';
                 } else {
                   newStatus = 'unpaid';
                 }
                 await connection.promise().query(
                   'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                   [newStatus, billing.IDNo]
                 );
                 
                 remainingPayment -= roomPaymentAmount;
               }
             }
             
             // REDISTRIBUTE REMAINING PAYMENT: pay any outstanding balances if funds remain
             if (remainingPayment > 0) {
               for (const billing of allBillings) {
                 if (remainingPayment <= 0) break;
                 
                 const billingAmount = billing.ROOM_CHARGE * billing.QTY;
                 const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
                 const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
                 const alreadyPaid = billingPaidMap.get(billing.IDNo) || 0;
                 const outstanding = Math.max(billingPayCap - alreadyPaid, 0);
                 
                 const roomPaymentAmount = Math.min(outstanding, remainingPayment);
                 
                 if (roomPaymentAmount > 0) {
                   const roomPaymentQuery = `
                     INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                     VALUES (?, ?, ?, ?, 'room', NOW(), ?)
                   `;
                   await connection.promise().query(roomPaymentQuery, [
                     billing.BOOKING_ID,
                     billing.IDNo,
                     roomPaymentAmount,
                     'cash',
                     encodedBy
                   ]);
                   
                   const totalPaidForBilling = alreadyPaid + roomPaymentAmount;
                   let newStatus;
                   if (totalPaidForBilling >= billingPayCap && billingPayCap > 0) {
                     newStatus = 'paid';
                   } else if (totalPaidForBilling > 0) {
                     newStatus = 'partial';
                   } else {
                     newStatus = 'unpaid';
                   }
                   await connection.promise().query(
                     'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                     [newStatus, billing.IDNo]
                   );
                   
                   billingPaidMap.set(billing.IDNo, totalPaidForBilling);
                   remainingPayment -= roomPaymentAmount;
                 }
               }
             }
           } else {
             // CONSOLIDATED BILLING: Unang babayaran ang MAIN booking, tapos saka ang iba
             const sortedBillings = [...allBillings].sort((a, b) => {
               if (a.BOOKING_ID === firstBookingId && b.BOOKING_ID !== firstBookingId) return -1;
               if (b.BOOKING_ID === firstBookingId && a.BOOKING_ID !== firstBookingId) return 1;
               return a.BOOKING_ID - b.BOOKING_ID;
             });
             
             for (const billing of sortedBillings) {
               if (remainingPayment <= 0) break;
               
               const billingAmount = billing.ROOM_CHARGE * billing.QTY;
               const billingDiscount = (billing.BOOKING_ID === firstBookingId) ? discountTotal : 0;
               const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
               
               const roomPaymentAmount = Math.min(remainingPayment, billingPayCap);
               
               if (roomPaymentAmount > 0) {
                 const roomPaymentQuery = `
                   INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                   VALUES (?, ?, ?, ?, 'room', NOW(), ?)
                 `;
                 await connection.promise().query(roomPaymentQuery, [
                   billing.BOOKING_ID,
                   billing.IDNo,
                   roomPaymentAmount,
                   'cash',
                   encodedBy
                 ]);
                 
                 let newStatus;
                 if (roomPaymentAmount >= billingPayCap && billingPayCap > 0) {
                   newStatus = 'paid';
                 } else if (roomPaymentAmount > 0) {
                   newStatus = 'partial';
                 } else {
                   newStatus = 'unpaid';
                 }
                 await connection.promise().query(
                   'UPDATE billing SET PAYMENT_STATUS = ? WHERE IDNo = ?',
                   [newStatus, billing.IDNo]
                 );
                 
                 remainingPayment -= roomPaymentAmount;
               }
             }
           }
        }
        
        // Priority 2: Pay services with remaining payment
        // Note: Individual billing is ONLY for room charges, NOT for services
        // Services: Pickup/Dropoff always on main booking, Breakfast has separate individual checkbox
        if (remainingPayment > 0 && allServices.length > 0) {
          // For paid status, prioritize main booking services first (Pickup/Dropoff are always on main)
          let sortedServices = [...allServices];
          if (paymentStatus === 'paid' && firstBookingId) {
            // Sort: main booking services first, then others
            sortedServices.sort((a, b) => {
              if (a.BOOKING_ID === firstBookingId && b.BOOKING_ID !== firstBookingId) return -1;
              if (b.BOOKING_ID === firstBookingId && a.BOOKING_ID !== firstBookingId) return 1;
              return a.BOOKING_ID - b.BOOKING_ID;
            });
          }
          
          for (const service of sortedServices) {
            if (remainingPayment <= 0) break;
            
            const servicePaymentAmount = Math.min(remainingPayment, service.TOTAL_COST);
            
            if (servicePaymentAmount > 0) {
              const servicePaymentQuery = `
                INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                VALUES (?, ?, ?, ?, 'service', NOW(), ?)
              `;
              await connection.promise().query(servicePaymentQuery, [
                service.BOOKING_ID,
                service.IDNo,
                servicePaymentAmount,
                'cash',
                encodedBy
              ]);
              
              // Update service payment status
              let newStatus;
              if (servicePaymentAmount >= service.TOTAL_COST) {
                newStatus = 'paid';
              } else if (servicePaymentAmount > 0) {
                newStatus = 'partial';
              } else {
                newStatus = 'unpaid';
              }
              await connection.promise().query(
                'UPDATE booking_service SET STATUS = ? WHERE IDNo = ? AND ACTIVE = 1',
                [newStatus, service.IDNo]
              );
              
              remainingPayment -= servicePaymentAmount;
            }
          }
        }
        
        // IMPORTANT: For consolidated billing, apply SAME LOGIC to all (billing, services, extensions)
        // If fully paid (payment >= total of all bookings), mark ALL as "paid"
        // Otherwise, keep individual statuses
        if (!isIndividualBilling && paidAmountNum > 0) {
          // Get all extensions for this group (if any)
          const [allExtensions] = await connection.promise().query(
            `SELECT IDNo, BOOKING_ID, COST, QTY, PAYMENT_STATUS FROM booking_extension WHERE BOOKING_ID IN (?) AND ACTIVE = 1`,
            [targetBookingIds.length > 0 ? targetBookingIds : (firstBookingId ? [firstBookingId] : [])]
          );
          
          // Calculate total amount (rooms + services + extensions)
          const totalServicesAmount = allServices.reduce((sum, s) => sum + parseFloat(s.TOTAL_COST || 0), 0);
          const totalExtensionsAmount = allExtensions.reduce((sum, e) => sum + (parseFloat(e.COST || 0) * parseInt(e.QTY || 1)), 0);
          const grandTotal = totalBillingAmount + totalServicesAmount + totalExtensionsAmount - discountTotal;
          
          // Check if fully paid
          const isFullyPaidTotal = paidAmountNum >= grandTotal;
          
          if (isFullyPaidTotal) {
            // SAME LOGIC: Update ALL billing records (main + others) to "paid"
            const allBillingIds = allBillings.map(b => b.IDNo);
            if (allBillingIds.length > 0) {
              const billingPlaceholders = allBillingIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE billing SET PAYMENT_STATUS = 'paid' WHERE IDNo IN (${billingPlaceholders})`,
                    allBillingIds
                  );
                }
                
                // SAME LOGIC: Update ALL services to "paid" (all bookings in group)
                if (allServices.length > 0) {
                  const serviceIds = allServices.map(s => s.IDNo);
                  const servicePlaceholders = serviceIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE booking_service SET STATUS = 'paid' WHERE IDNo IN (${servicePlaceholders}) AND ACTIVE = 1`,
                    serviceIds
                  );
                }
                
                // SAME LOGIC: Update ALL extensions to "paid" (all bookings in group)
                if (allExtensions.length > 0) {
                  const extensionIds = allExtensions.map(e => e.IDNo);
                  const extensionPlaceholders = extensionIds.map(() => '?').join(',');
                  await connection.promise().query(
                    `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE IDNo IN (${extensionPlaceholders}) AND ACTIVE = 1`,
                    extensionIds
                  );
                }
          } else {
            // If partial payment, other bookings remain unpaid (payments go to main booking only)
            // SAME LOGIC: Update other bookings' billing, services, and extensions to "unpaid"
            const otherBookings = targetBookingIds.filter(id => id !== firstBookingId);
            
            if (otherBookings.length > 0) {
              // Update other bookings' billing to "unpaid"
              const otherBillings = allBillings.filter(b => b.BOOKING_ID !== firstBookingId);
              if (otherBillings.length > 0) {
                const otherBillingIds = otherBillings.map(b => b.IDNo);
                const billingPlaceholders = otherBillingIds.map(() => '?').join(',');
                    await connection.promise().query(
                      `UPDATE billing SET PAYMENT_STATUS = 'unpaid' WHERE IDNo IN (${billingPlaceholders})`,
                      otherBillingIds
                    );
                  }
                  
                  // Update other bookings' services to "unpaid" (SAME LOGIC)
              // IMPORTANT: Only update services that are truly unpaid (not partially paid during distribution)
              const otherServices = allServices.filter(s => s.BOOKING_ID !== firstBookingId);
              if (otherServices.length > 0) {
                // Check which services actually received payment during distribution
                const [servicePayments] = await connection.promise().query(
                  `SELECT BOOKING_SERVICE_ID, SUM(AMOUNT_PAID) as total_paid 
                   FROM payments 
                   WHERE BOOKING_SERVICE_ID IN (?) 
                   AND PAYMENT_TYPE = 'service' 
                   GROUP BY BOOKING_SERVICE_ID`,
                  [otherServices.map(s => s.IDNo)]
                );
                
                const paidServiceIds = new Set(servicePayments.map(p => p.BOOKING_SERVICE_ID));
                
                // Only update services that didn't receive any payment
                const unpaidServiceIds = otherServices
                  .filter(s => !paidServiceIds.has(s.IDNo))
                  .map(s => s.IDNo);
                
                if (unpaidServiceIds.length > 0) {
                  const servicePlaceholders = unpaidServiceIds.map(() => '?').join(',');
                      await connection.promise().query(
                        `UPDATE booking_service SET STATUS = 'unpaid' WHERE IDNo IN (${servicePlaceholders}) AND ACTIVE = 1`,
                        unpaidServiceIds
                      );
                    }
                  }
                  
                  // Update other bookings' extensions to "unpaid" (SAME LOGIC)
              const otherExtensions = allExtensions.filter(e => e.BOOKING_ID !== firstBookingId);
              if (otherExtensions.length > 0) {
                // Check which extensions actually received payment during distribution
                const [extensionPayments] = await connection.promise().query(
                  `SELECT BOOKING_EXTENSION_ID, SUM(AMOUNT_PAID) as total_paid 
                   FROM payments 
                   WHERE BOOKING_EXTENSION_ID IN (?) 
                   AND PAYMENT_TYPE = 'extended' 
                   GROUP BY BOOKING_EXTENSION_ID`,
                  [otherExtensions.map(e => e.IDNo)]
                );
                
                const paidExtensionIds = new Set(extensionPayments.map(p => p.BOOKING_EXTENSION_ID));
                
                // Only update extensions that didn't receive any payment
                const unpaidExtensionIds = otherExtensions
                  .filter(e => !paidExtensionIds.has(e.IDNo))
                  .map(e => e.IDNo);
                
                if (unpaidExtensionIds.length > 0) {
                  const extensionPlaceholders = unpaidExtensionIds.map(() => '?').join(',');
                      await connection.promise().query(
                        `UPDATE booking_extension SET PAYMENT_STATUS = 'unpaid' WHERE IDNo IN (${extensionPlaceholders}) AND ACTIVE = 1`,
                        unpaidExtensionIds
                      );
                    }
                  }
            }
          }
        }
      }

      // IMPROVEMENT #2: Update room count AFTER successful booking creation
      if (existingGroupId && newBookingIdsInTransaction.length > 0) {
        const [currentGroup] = await connection.promise().query(
          'SELECT NUMBER_OF_ROOMS FROM group_booking WHERE IDNo = ?',
          [existingGroupId]
        );
        
        if (currentGroup && currentGroup.length > 0) {
          const newRoomCount = currentGroup[0].NUMBER_OF_ROOMS + newBookingIdsInTransaction.length;
          await connection.promise().query(
            'UPDATE group_booking SET NUMBER_OF_ROOMS = ? WHERE IDNo = ?',
            [newRoomCount, existingGroupId]
          );
          console.log(`✅ Updated room count to ${newRoomCount} (added ${newBookingIdsInTransaction.length} new booking(s))`);
        }
      }

      // Commit
      await new Promise((resolve, reject) => connection.commit(err => (err ? reject(err) : resolve())));
      connection.release();

      console.log('✅ Group Booking Process Completed Successfully!');
      // console.log(`🎯 Grand Total: ₱${grandTotal.toLocaleString()}`);
      // console.log(`🏷️  Confirmation Number: ${confirmationNumber}`);

      return { success: true, message: 'Group Booking added successfully!', confirmationNumber, grandTotal, paidAmount: parseFloat(paidAmount) || 0, discount: parseFloat(discount) || 0 };
    } catch (err) {
      await new Promise(resolve => connection.rollback(() => resolve()));
      connection.release();
      
      // IMPROVEMENT #7: Better error messages
      if (err.message.includes('Group name mismatch') || err.message.includes('Group contact mismatch')) {
        throw err; // Keep specific validation errors as-is
      } else if (err.message.includes('Duplicate room booking') || err.message.includes('already has a booking')) {
        throw new Error(`Duplicate booking detected: ${err.message}`);
      } else if (err.message.includes('not available') || err.message.includes('Conflicts with')) {
        throw new Error(`Room availability conflict: ${err.message}`);
      } else if (err.message.includes('validate room availability')) {
        throw err; // Keep validation errors as-is
      } else if (err.message.includes('Existing group not found')) {
        throw err; // Keep as-is
      } else {
        console.error('❌ Group booking error:', err);
        throw new Error(`Failed to ${existingGroupId ? 'join group' : 'create group'} booking: ${err.message || 'Unknown error occurred'}`);
      }
    }
  }



  // Get voucher data for modal display
  static async getVoucherData(bookingId) {
    try {
      const query = `
        SELECT 
          b.IDNo AS BookingID,
          b.CONFIRMATION_NUMBER AS confirmationNumber,
          c.NAME AS fullname,
          r.ROOM_NUMBER AS roomNumber,
          rt.NAME AS roomType,
          b.IS_DIRECT_RESERVATION AS isDirectReservation,
          b.BED_COUNT AS bedCount,
          b.CHECK_IN_DATE AS dateFrom,
          b.CHECK_OUT_DATE AS dateTo,
          b.REMARKS AS remarks,
          b.CHECK_IN_STATUS AS checkInStatus,
          b.LATE_CHECKOUT AS checkOutStatus,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
            + COALESCE(services_total.TOTAL_SERVICES_COST, 0)
            + COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0)
            + COALESCE(bill.CANCELLATION_PENALTY, 0) AS total,
          COALESCE(bill.RESERVATION_FEE, 0) AS reservationFee,
          COALESCE(bill.DISCOUNT_AMOUNT, 0) AS discount,
          CASE 
            WHEN bill.PAYMENT_STATUS = 'paid' THEN 
              COALESCE(services_total.TOTAL_SERVICES_COST, 0)
              + COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0)
            ELSE 
              COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
              + COALESCE(services_total.TOTAL_SERVICES_COST, 0)
              + COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0)
              - COALESCE(bill.RESERVATION_FEE, 0)
              - COALESCE(bill.DISCOUNT_AMOUNT, 0)
          END AS totalBalance,
          -- Payments total
          COALESCE(payments_total.TOTAL_PAID, 0) AS paidAmount,
          -- Breakfast fields
          bs_adult.QTY AS breakfastAdultQty,
          bs_kid.QTY AS breakfastKidQty,
          -- Pickup/Dropoff fields
          bs_pickup.TOTAL_COST AS pickupPrice,
          bs_dropoff.TOTAL_COST AS dropoffPrice,
          -- Late checkout fee
          bs_late.TOTAL_COST AS lateCheckoutFee
        FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN room r ON b.ROOM_ID = r.IDNo
          LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
          LEFT JOIN (
            SELECT 
              bs.BOOKING_ID,
              SUM(bs.TOTAL_COST) AS TOTAL_SERVICES_COST
            FROM booking_service bs
            WHERE bs.ACTIVE = 1
            GROUP BY bs.BOOKING_ID
          ) services_total ON b.IDNo = services_total.BOOKING_ID
          LEFT JOIN (
            SELECT 
              be.BOOKING_ID,
              SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
            FROM booking_extension be
            WHERE be.ACTIVE = 1
            GROUP BY be.BOOKING_ID
          ) extensions_total ON b.IDNo = extensions_total.BOOKING_ID
          -- Payments total
          LEFT JOIN (
            SELECT 
              p.BOOKING_ID,
              SUM(p.AMOUNT_PAID) AS TOTAL_PAID
            FROM payments p
            WHERE p.BOOKING_ID IS NOT NULL
            GROUP BY p.BOOKING_ID
          ) payments_total ON b.IDNo = payments_total.BOOKING_ID
          -- Breakfast Adult (Service ID = 80)
          LEFT JOIN booking_service bs_adult ON b.IDNo = bs_adult.BOOKING_ID 
            AND bs_adult.SERVICE_ID = 80 AND bs_adult.ACTIVE = 1
          -- Breakfast Kid (Service ID = 81)
          LEFT JOIN booking_service bs_kid ON b.IDNo = bs_kid.BOOKING_ID 
            AND bs_kid.SERVICE_ID = 81 AND bs_kid.ACTIVE = 1
          -- Pickup (Service ID = 90)
          LEFT JOIN booking_service bs_pickup ON b.IDNo = bs_pickup.BOOKING_ID 
            AND bs_pickup.SERVICE_ID = 90 AND bs_pickup.ACTIVE = 1
          -- Dropoff (Service ID = 91)
          LEFT JOIN booking_service bs_dropoff ON b.IDNo = bs_dropoff.BOOKING_ID 
            AND bs_dropoff.SERVICE_ID = 91 AND bs_dropoff.ACTIVE = 1
          -- Late Checkout (Service ID = 72)
          LEFT JOIN booking_service bs_late ON b.IDNo = bs_late.BOOKING_ID 
            AND bs_late.SERVICE_ID = 72 AND bs_late.ACTIVE = 1
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;

      const results = await queryDatabasePromise(query, [bookingId]);
      return results[0] || null;

    } catch (error) {
      console.error('Error in getVoucherData:', error);
      throw error;
    }
  }

  // ==================== COMPLAINT / REQUEST (complaint_request table) ====================
  static async listComplaintRequestByBooking(bookingId) {
    try {
      const sql = `
        SELECT cr.*,
               u1.FULLNAME AS ENCODED_BY_NAME,
               u2.FULLNAME AS EDITDED_BY_NAME
        FROM complaint_request cr
        LEFT JOIN user_info u1 ON cr.ENCODED_BY = u1.IDno
        LEFT JOIN user_info u2 ON cr.EDITDED_BY = u2.IDno
        WHERE cr.BOOKING_ID = ? AND cr.ACTIVE = 1
        ORDER BY cr.ENCODED_DT DESC, cr.IDNo DESC`;
      return await queryDatabasePromise(sql, [bookingId]);
    } catch (e) {
      console.error('Error listComplaintRequestByBooking:', e);
      return [];
    }
  }

  static async addComplaintRequest({ bookingId, type, details, encodedBy }) {
    try {
      const sql = `INSERT INTO complaint_request (BOOKING_ID, TYPE, DETAILS, STATUS, ENCODED_BY) VALUES (?, ?, ?, 0, ?)`; // 0 = not complete
      const res = await queryDatabasePromise(sql, [bookingId, type, details, encodedBy]);
      return res.insertId;
    } catch (e) {
      console.error('Error addComplaintRequest:', e);
      throw e;
    }
  }

  static async updateComplaintRequestStatus({ id, status, editedBy }) {
    try {
      const sql = `UPDATE complaint_request SET STATUS = ?, COMPLETED_BY = ?, COMPLETED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`;
      await queryDatabasePromise(sql, [status, editedBy, id]);
      return true;
    } catch (e) {
      console.error('Error updateComplaintRequestStatus:', e);
      throw e;
    }
  }

  static async deleteComplaintRequest(id) {
    try {
      const sql = `UPDATE complaint_request SET ACTIVE = 0, EDITDED_DT = CURRENT_TIMESTAMP WHERE IDNo = ?`;
      await queryDatabasePromise(sql, [id]);
      return true;
    } catch (e) {
      console.error('Error deleteComplaintRequest:', e);
      throw e;
    }
  }

  static async updateComplaintRequest({ id, type, details, editedBy }) {
    try {
      const sql = `UPDATE complaint_request SET TYPE = ?, DETAILS = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`;
      await queryDatabasePromise(sql, [type, details, editedBy, id]);
      return true;
    } catch (e) {
      console.error('Error updateComplaintRequest:', e);
      throw e;
    }
  }

  // Get total paid amounts for a list of booking IDs (excludes reservation_fee, discount, refund)
  static async getBookingsPaidAmounts(bookingIds) {
    try {
      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return {};
      }

      const placeholders = bookingIds.map(() => '?').join(',');
      const sql = `
        SELECT 
          p.BOOKING_ID AS bookingId,
          COALESCE(SUM(p.AMOUNT_PAID), 0) AS total_paid
        FROM payments p
        WHERE p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount', 'security_deposit', 'security_deposit_refund', 'refund')
          AND p.BOOKING_ID IN (${placeholders})
        GROUP BY p.BOOKING_ID
      `;

      const rows = await queryDatabasePromise(sql, bookingIds);
      const map = {};
      rows.forEach(row => {
        map[row.bookingId] = parseFloat(row.total_paid) || 0;
      });
      return map;
    } catch (e) {
      console.error('Error getBookingsPaidAmounts:', e);
      throw e;
    }
  }
}

module.exports = BookingModel;


