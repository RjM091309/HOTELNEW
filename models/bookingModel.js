const { queryDatabasePromise, pool } = require('../config/database');

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
          groupCondition
        } = params;
  
        // ---- COUNT QUERY ----
        const countQuery = `
          SELECT COUNT(*) AS total
          FROM booking b
            LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
            LEFT JOIN room     r ON b.ROOM_ID      = r.IDNo
            LEFT JOIN billing  bill ON bill.BOOKING_ID = b.IDNo
          WHERE b.ACTIVE = 1
            ${groupCondition || ''}
            ${dateCondition}
            ${channelCondition};
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
            b.IS_DIRECT_RESERVATION,
            (SELECT COUNT(*) FROM remarks rm WHERE rm.BOOKING_ID = b.IDNo AND rm.ACTIVE = 1) AS RemarksCount,
            bill.QTY,
            b.IS_CANCELLED,
            CASE 
              WHEN b.GROUP_BOOKING_ID IS NOT NULL THEN
                -- For group bookings, calculate group total
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
                      ), 0)
                    ), 0)
                    - COALESCE(gb.GROUP_DISCOUNT, 0)
                    - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                  FROM booking b2
                  LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                  LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                  WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                )
              ELSE
                -- For individual bookings, use existing calculation
                COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
                  + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
                  + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
                  - COALESCE(bill.RESERVATION_FEE, 0)
                  - COALESCE(bill.DISCOUNT_AMOUNT, 0)
            END AS TOTAL_COST,
            CASE 
              WHEN bill.PAYMENT_STATUS = 'paid' 
                AND COALESCE(services_unpaid_count.TOTAL_UNPAID_SERVICES, 0) = 0
                AND COALESCE(extensions_unpaid_count.TOTAL_UNPAID_EXTENSIONS, 0) = 0
              THEN 'paid'
              ELSE 'unpaid'
            END AS PAYMENT_STATUS,
            CASE 
              WHEN b.GROUP_BOOKING_ID IS NOT NULL THEN
                -- Group balance = Group Grand Total - Actual Payments (room + service)
                (
                  -- Group Grand Total
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
                        ), 0)
                      ), 0)
                      - COALESCE(gb.GROUP_DISCOUNT, 0)
                      - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
                    FROM booking b2
                    LEFT JOIN billing bill2 ON b2.IDNo = bill2.BOOKING_ID
                    LEFT JOIN group_booking gb ON b2.GROUP_BOOKING_ID = gb.IDNo
                    WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID AND b2.ACTIVE = 1
                  )
                  -
                  -- Actual payments made for the whole group (room + service)
                  (
                    SELECT COALESCE(SUM(p.AMOUNT_PAID), 0)
                    FROM payments p
                    JOIN booking b3 ON p.BOOKING_ID = b3.IDNo
                    WHERE b3.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID
                      AND p.PAYMENT_TYPE IN ('room','service')
                  )
                )
              ELSE
                -- For individual bookings, always calculate balance considering actual payments made
                -- (regardless of PAYMENT_STATUS to ensure accurate balance)
                ROUND(GREATEST(0, 
                  COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
                  + COALESCE(all_services_total.TOTAL_SERVICES_COST, 0)
                  + COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0)
                  - COALESCE(bill.RESERVATION_FEE, 0)
                  - COALESCE(bill.DISCOUNT_AMOUNT, 0)
                  - COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0)
                ), 2)
            END AS BALANCE,
            -- Debug logging fields
            COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) AS DEBUG_ROOM_COST,
            COALESCE(all_services_total.TOTAL_SERVICES_COST, 0) AS DEBUG_SERVICES_COST,
            COALESCE(all_extensions_total.TOTAL_EXTENSIONS_COST, 0) AS DEBUG_EXTENSIONS_COST,
            COALESCE(bill.RESERVATION_FEE, 0) AS DEBUG_RESERVATION_FEE,
            COALESCE(bill.DISCOUNT_AMOUNT, 0) AS DEBUG_DISCOUNT_AMOUNT,
            COALESCE(actual_payments.TOTAL_PAYMENTS_MADE, 0) AS DEBUG_TOTAL_PAYMENTS_MADE,
            bill.PAYMENT_STATUS AS DEBUG_PAYMENT_STATUS,
            COALESCE(services_unpaid_total.TOTAL_SERVICES_COST, 0) AS DEBUG_UNPAID_SERVICES,
            COALESCE(extensions_unpaid_total.TOTAL_EXTENSIONS_COST, 0) AS DEBUG_UNPAID_EXTENSIONS
          FROM booking b
            LEFT JOIN customer   c   ON b.CUSTOMER_ID = c.IDNo
            LEFT JOIN agency     a   ON b.AGENCY_ID   = a.IDNo
            LEFT JOIN billing    bill ON b.IDNo       = bill.BOOKING_ID
            LEFT JOIN room       r   ON b.ROOM_ID     = r.IDNo
            LEFT JOIN room_type  rt  ON r.ROOM_TYPE_ID= rt.IDNo
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
              WHERE p.PAYMENT_TYPE NOT IN ('reservation_fee', 'discount')
              GROUP BY p.BOOKING_ID
            ) actual_payments ON b.IDNo = actual_payments.BOOKING_ID
          WHERE b.ACTIVE = 1
            ${groupCondition || ''}
            ${dateCondition}
            ${channelCondition}
          ORDER BY b.IDNo
          ${Number.isInteger(start) && Number.isInteger(length) ? `LIMIT ${start}, ${length}` : ''};
        `;
  
        // First get the total count
        const countResults = await queryDatabasePromise(countQuery, []);
        const totalRecords = countResults[0]?.total || 0;
  
        // Now fetch the page of data
        const rows = await queryDatabasePromise(dataQuery, []);
  
        return {
          totalRecords,
          rows
        };
  
      } catch (error) {
        console.error('Error in getBookingDataEnhanced:', error);
        throw error;
      }
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
          COALESCE(s.SERVICE_NAME, 'Unknown Service') as SERVICE_NAME,
          COALESCE(s.SERVICE_COST, bs.TOTAL_COST) as SERVICE_COST
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

  // New: Checkout bookings now (set CHECK_OUT_DATE=NOW, status to check-Out, update room status)
  static async checkoutBookings({ bookingIds, encodedBy, refundBookingId = null, refundAmount = 0 }) {
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

      // Update billing.QTY to actual days, preserve ORIGINAL_QTY if not set
      const updateBillingQtySql = `
        UPDATE billing bill
        JOIN booking b ON bill.BOOKING_ID = b.IDNo
        SET bill.ORIGINAL_QTY = COALESCE(bill.ORIGINAL_QTY, bill.QTY),
            bill.QTY = GREATEST(1, DATEDIFF(DATE(NOW()), DATE(b.CHECK_IN_DATE)))
        WHERE b.IDNo IN (?) AND bill.ACTIVE = 1
      `;
      await new Promise((resolve, reject) => {
        connection.query(updateBillingQtySql, [ids], (err, res) => (err ? reject(err) : resolve(res)));
      });

      // Optional: Insert refund(s) and update billing.CHECKOUT_REFUND, with caps to avoid negative balances.
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

        // Helper to compute allowable refund per booking (paid - net, not below 0)
        async function computeAllowable(bookingId) {
          // Sum services and extensions
          const [svcRow] = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT COALESCE(SUM(bs.TOTAL_COST),0) AS svcTotal
               FROM booking_service bs WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });
          const [extRow] = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT COALESCE(SUM(COST * QTY),0) AS extTotal
               FROM booking_extension WHERE BOOKING_ID = ? AND ACTIVE = 1`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });
          const [billRow2] = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT IDNo AS billingId, ROOM_CHARGE, QTY, COALESCE(RESERVATION_FEE,0) AS reservationFee,
                      COALESCE(DISCOUNT_AMOUNT,0) AS discountAmount, COALESCE(CHECKOUT_REFUND,0) AS checkoutRefund
               FROM billing WHERE BOOKING_ID = ? AND ACTIVE = 1 LIMIT 1`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });
          const [payRow] = await new Promise((resolve, reject) => {
            connection.query(
              `SELECT COALESCE(SUM(AMOUNT_PAID),0) AS paid
               FROM payments WHERE BOOKING_ID = ? AND PAYMENT_TYPE NOT IN ('reservation_fee','discount')`,
              [bookingId],
              (err, rows) => (err ? reject(err) : resolve(rows))
            );
          });
          const subTotal = (parseFloat(billRow2.ROOM_CHARGE) * parseFloat(billRow2.QTY)) + (parseFloat(svcRow?.svcTotal) || 0) + (parseFloat(extRow?.extTotal) || 0);
          const currentNet = subTotal - parseFloat(billRow2.reservationFee) - parseFloat(billRow2.discountAmount) - parseFloat(billRow2.checkoutRefund || 0);
          const paid = parseFloat(payRow?.paid) || 0;
          const overpay = paid - currentNet; // amount we can refund without creating negative balance
          return { maxRefund: Math.max(0, overpay), billingId: billRow2?.billingId || null };
        }

        // Iterate and distribute
        for (const r of roomAmtRows) {
          const share = (parseFloat(r.roomAmount) || 0) / totalRoomAmount;
          const desired = refundAmount * share;
          const { maxRefund, billingId } = await computeAllowable(r.bookingId);
          const toRefund = Math.min(Math.abs(desired), maxRefund);
          if (toRefund <= 0) continue;

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

      return { success: true, message: 'Checked out successfully', days: daysRows };
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
            CANCELLATION_REASON = ?,
            UPDATED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(query, [reason, bookingId]);
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
          c.IS_GROUP,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          rt.NAME AS ROOM_TYPE,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.REMARKS,
          bill.ROOM_CHARGE AS ROOM_RATE,

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
          END AS PAYMENT_STATUS

        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;
      
      const results = await queryDatabasePromise(query, [bookingID]);
      return results[0] || null;
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
      bookingRemarks,
      agencyID,
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
      // ✅ Additional for Direct Reservations
      bedCount,
      isDirectReservation,
      reservationFee,
      discount,
      lateCheckoutFee
    } = bookingData;

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
          (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, REMARKS, CONFIRMATION_NUMBER, NOTIFICATION_READ, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, LATE_CHECKOUT, AGENCY_ID, IS_DIRECT_RESERVATION, BED_COUNT) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const directReservationFlag = isDirectReservation ? 1 : 0;
        // Handle empty agencyID - set to NULL if empty
        const processedAgencyID = (finalBookingRoute === 'agency' && agencyID && agencyID.trim() !== '') ? agencyID : null;
        
        const bookingValues = [
          customerId, room_id, checkInDate, checkOutDate, 'pending', finalBookingRoute,
          maxOccupants, bookingRemarks, finalConfirmationNumber, encodedBy, date, 1, checkInStatus, checkOutStatus,
          processedAgencyID, directReservationFlag, bedCount || null
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
          (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT, DISCOUNT_APPLIED) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const billingValues = [
          bookingId, numericRoomPrice, 0.00, 0.00, 0.00, diffindays, paymentStatus, 'cash', '', encodedBy, date, 1,
          parseFloat(reservationFee) || 0.00, parseFloat(discount) || 0.00, paymentStatus === 'paid' ? 1 : 0
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

        // Insert payment record for the paid amount only for PARTIAL payments
        // When fully paid, a consolidated room payment is inserted later from billing
        if (paymentStatus === 'partial') {
          // Calculate the paid amount from the controller
          const paidAmount = parseFloat(bookingData.paidAmount) || 0;
          
          if (paidAmount > 0) {
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
              'Initial payment for booking'
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
        }

        // Insert breakfast services if provided
        const services = [];

        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
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
          const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
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
            VALUES ?
          `;
          await new Promise((resolve, reject) => {
            connection.query(serviceQuery, [services], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // console.log('✅ booking_service inserted.');

          // Payment record for services if paid
          if (paymentStatus === 'paid') {
            const servicePayments = services.map(s => [
              bookingId,
              s[1],              // SERVICE_ID
              parseFloat(s[3]),  // TOTAL_COST
              'cash',
              'service',
              date,
              encodedBy
            ]);

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
            VALUES ?
          `;

          await new Promise((resolve, reject) => {
            connection.query(insertQuery, [pickAnddrop], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          // console.log('✅ booking_service inserted for pick/drop.');

          // If paid, insert into payments
          if (paymentStatus === 'paid') {
            const paymentInserts = pickAnddrop.map(s => [
              bookingId,
              s[1],             // SERVICE_ID
              parseFloat(s[3]), // AMOUNT
              'cash',           // PAYMENT_METHOD
              'service',        // PAYMENT_STATUS
              date,
              encodedBy
            ]);

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
          const remarksQuery = `
            INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) 
            VALUES (?, 'Booking', ?, ?, ?)
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

        // If paymentStatus is 'paid', insert into payments table
        if (paymentStatus === 'paid') {
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
          const checkQuery = `
            SELECT bs.IDNo, bs.QTY, bs.STATUS, bs.TOTAL_COST, s.SERVICE_COST 
            FROM booking_service bs
            INNER JOIN services s ON bs.SERVICE_ID = s.IDNo
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

          -- Transport Charges with remaining balance (considering partial payments)
          COALESCE((
              SELECT SUM(GREATEST(0, pd.RATE - COALESCE((
                  SELECT SUM(p.AMOUNT_PAID) 
                  FROM payments p 
                  WHERE p.BOOKING_PICKDROP_ID = pd.IDNo
                  AND p.PAYMENT_TYPE = 'pickdrop'
              ), 0)))
              FROM booking_pick_drop pd
              WHERE pd.BOOKING_ID = ? AND pd.ACTIVE = 1
          ), 0) AS transport_unpaid,

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
                          AND p.PAYMENT_TYPE != 'discount'
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
              +
              COALESCE((
                  SELECT SUM(GREATEST(0, pd.RATE - COALESCE((
                      SELECT SUM(p.AMOUNT_PAID) 
                      FROM payments p 
                      WHERE p.BOOKING_PICKDROP_ID = pd.IDNo
                      AND p.PAYMENT_TYPE = 'pickdrop'
                  ), 0)))
                  FROM booking_pick_drop pd
                  WHERE pd.BOOKING_ID = ? AND pd.ACTIVE = 1
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
        bookingId, // transport_unpaid
        bookingId, // reservation_fee
        bookingId, // discount_amount
        bookingId, // discount_applied
        bookingId, // total_unpaid_balance (room)
        bookingId, // total_unpaid_balance (extension)
        bookingId, // total_unpaid_balance (service)
        bookingId, // total_unpaid_balance (transport)
        bookingId  // discount_remarks
      ]);

      const balanceData = results.length > 0 ? results[0] : {
        room_charge_unpaid: 0,
        extension_charge_unpaid: 0,
        service_unpaid: 0,
        transport_unpaid: 0,
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
      // Get regular services
      const serviceQuery = `
        SELECT bs.SERVICE_ID, s.SERVICE_NAME, bs.QTY, bs.TOTAL_COST, bs.STATUS, bs.ENCODED_DT
        FROM booking_service bs
        JOIN services s ON bs.SERVICE_ID = s.IDNo
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

      // Get transport services
      const transportQuery = `
        SELECT pd.IDNo, pd.PICKDROP_ID, pd.TYPE, pd.RATE, pd.STATUS, r.NAME AS LOCATION_NAME, pd.ENCODED_DT
        FROM booking_pick_drop pd
        JOIN pick_drop_rates r ON pd.PICKDROP_ID = r.IDNo
        WHERE pd.BOOKING_ID = ? AND pd.ACTIVE = 1
      `;
      const pickupDropRows = await queryDatabasePromise(transportQuery, [bookingId]);

      // Format transport services
      const formattedTransport = pickupDropRows.map(row => ({
        SERVICE_ID: row.TYPE === 'pick-up' ? -101 : -102,
        SERVICE_NAME: `${row.TYPE === 'pick-up' ? 'Pick-up' : 'Drop-off'} - ${row.LOCATION_NAME}`,
        QTY: 1,
        TOTAL_COST: parseFloat(row.RATE),
        STATUS: row.STATUS,
        ENCODED_DT: row.ENCODED_DT
      }));

      // Combine all services
      const allServices = [...serviceRows, ...formattedExtensions, ...formattedTransport];

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
          gt.TYPE as guestType
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
          // Remove from booking_pick_drop
          const type = serviceId === -101 ? 'pick-up' : 'drop-off';

          const fetchQuery = `
            SELECT IDNo, RATE FROM booking_pick_drop 
            WHERE BOOKING_ID = ? AND TYPE = ? AND STATUS != 'paid' AND ACTIVE = 1
            ORDER BY IDNo DESC
            LIMIT 1
          `;

          const results = await new Promise((resolve, reject) => {
            connection.query(fetchQuery, [bookingId, type], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          if (results.length === 0) {
            throw new Error(`${type} not found or already paid.`);
          }

          const idToUpdate = results[0].IDNo;

          const deactivateQuery = `
            UPDATE booking_pick_drop
            SET ACTIVE = 0
            WHERE IDNo = ?
          `;

          await new Promise((resolve, reject) => {
            connection.query(deactivateQuery, [idToUpdate], (err) => {
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
            message: `${type} removed successfully.`,
            totalCost: 0
          };

        } else {
          // Handle booking_service logic
          const fetchTotalCostQuery = `
            SELECT TOTAL_COST 
            FROM booking_service
            WHERE BOOKING_ID = ? AND SERVICE_ID = ? AND ACTIVE = 1
          `;

          const results = await new Promise((resolve, reject) => {
            connection.query(fetchTotalCostQuery, [bookingId, serviceId], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          if (results.length === 0) {
            throw new Error('Service not found or already inactive.');
          }

          const totalCost = results[0].TOTAL_COST;

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
            message: 'Service removed and billing updated successfully!',
            totalCost
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
          bi.ROOM_CHARGE,
          bi.AMENITIES_CHARGE,
          bi.SERVICES_CHARGE,
          bi.QTY,
          bi.PAYMENT_STATUS,
          bi.RESERVATION_FEE,
          bi.DISCOUNT_AMOUNT,
          COALESCE(bi.CHECKOUT_REFUND, 0) AS CHECKOUT_REFUND,
          bi.DISCOUNT_APPLIED,
          rt.NAME AS ROOM_TYPE
        FROM booking b
        JOIN billing bi ON b.IDNo = bi.BOOKING_ID
        JOIN room r ON b.ROOM_ID = r.IDNo
        JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE b.IDNo = ?
      `;

      const bookingData = await queryDatabasePromise(bookingQuery, [bookingId]);

      if (bookingData.length === 0) {
        return null;
      }

      const b = bookingData[0];
      const customerId = b.customerId;
      const roomRate = parseFloat(b.ROOM_CHARGE);
      const originalQty = parseInt(b.QTY);

      // Get actual payments made for this booking
      const paymentsQuery = `
        SELECT AMOUNT_PAID, PAYMENT_TYPE
        FROM payments 
        WHERE BOOKING_ID = ?
      `;
      const paymentsData = await queryDatabasePromise(paymentsQuery, [bookingId]);
      
      // Calculate total payments made
      const totalPaymentsMade = paymentsData.reduce((sum, payment) => {
        return sum + parseFloat(payment.AMOUNT_PAID);
      }, 0);

      // Calculate room amount and determine status
      const roomAmount = roomRate * originalQty;
      const reservationFee = parseFloat(b.RESERVATION_FEE) || 0;
      const discountAmount = parseFloat(b.DISCOUNT_AMOUNT) || 0;
      const checkoutRefund = parseFloat(b.CHECKOUT_REFUND) || 0;
      const netRoomAmount = roomAmount - reservationFee - discountAmount - checkoutRefund;
      
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
        qty: originalQty,
        subTotal: roomRate * originalQty,
        status: roomStatus
      }];

      // Fetch customer data
      const customerQuery = `
        SELECT NAME AS customerName, ADDRESS 
        FROM customer 
        WHERE IDNo = ?
      `;
      const customerData = await queryDatabasePromise(customerQuery, [customerId]);

      // Fetch services
      const serviceQuery = `
        SELECT 
          s.SERVICE_NAME,
          s.SERVICE_COST,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS
        FROM booking_service bs
        JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.ACTIVE = 1 AND bs.BOOKING_ID = ?
      `;
      const serviceData = await queryDatabasePromise(serviceQuery, [bookingId]);

      // Fetch extensions
      const extensionQuery = `
        SELECT EXTEND_DATE, QTY, COST, PAYMENT_STATUS
        FROM booking_extension
        WHERE BOOKING_ID = ? AND ACTIVE = 1
      `;
      const extensionData = await queryDatabasePromise(extensionQuery, [bookingId]);

      // Fetch transport
      const transportQuery = `
        SELECT pd.TYPE, r.NAME AS LOCATION_NAME, pd.RATE, pd.STATUS
        FROM booking_pick_drop pd
        JOIN pick_drop_rates r ON pd.PICKDROP_ID = r.IDNo
        WHERE pd.BOOKING_ID = ? AND pd.ACTIVE = 1
      `;
      const pickDropData = await queryDatabasePromise(transportQuery, [bookingId]);

      // Format extensions
      extensionData.forEach(ext => {
        roomItems.push({
          date: ext.EXTEND_DATE,
          description: `${b.ROOM_TYPE} (Extended)`,
          basePrice: ext.COST,
          qty: ext.QTY,
          subTotal: ext.COST * ext.QTY,
          status: ext.PAYMENT_STATUS
        });
      });

      // Format services
      const serviceItems = serviceData.map(service => ({
        date: b.CHECK_IN_DATE,
        description: service.SERVICE_NAME,
        basePrice: parseFloat(service.SERVICE_COST),
        qty: service.QTY,
        subTotal: parseFloat(service.TOTAL_COST),
        status: service.STATUS
      }));

      // Format transport
      const transportItems = pickDropData.map(row => ({
        date: b.CHECK_IN_DATE,
        description: `${row.TYPE === 'pick-up' ? 'Pick-up' : 'Drop-off'} - ${row.LOCATION_NAME}`,
        basePrice: parseFloat(row.RATE),
        qty: null, // optional or 1
        subTotal: parseFloat(row.RATE),
        status: row.STATUS
      }));

      // Combine all items
      const allItems = [...roomItems, ...serviceItems, ...transportItems];

      // Calculate subtotal
      const subTotal = allItems.reduce((sum, item) => sum + item.subTotal, 0);

      const receiptData = {
        bookingId: b.bookingId,
        confNumber: b.CONFIRMATION_NUMBER,
        customerName: customerData[0]?.customerName || '',
        address: customerData[0]?.ADDRESS || '',
        invoiceDate: new Date(b.CHECK_IN_DATE).toLocaleDateString(),
        paymentStatus: b.PAYMENT_STATUS,
        items: allItems,
        subTotal: subTotal,
        reservationFee: parseFloat(b.RESERVATION_FEE) || 0,
        discountAmount: parseFloat(b.DISCOUNT_AMOUNT) || 0,
        checkoutRefund: checkoutRefund,
        discountApplied: b.DISCOUNT_APPLIED === 1 ? 1 : 0
      };

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
          SELECT IDNo, ROOM_CHARGE, QTY, PAYMENT_STATUS, EXTEND_PAYMENT_STATUS, RESERVATION_FEE, DISCOUNT_AMOUNT
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
        const serviceQuery = `
            SELECT 
              bs.IDNo, 
              bs.TOTAL_COST,
              COALESCE(SUM(p.AMOUNT_PAID), 0) as totalPaid,
              (bs.TOTAL_COST - COALESCE(SUM(p.AMOUNT_PAID), 0)) as remainingAmount
            FROM booking_service bs
            LEFT JOIN payments p ON p.BOOKING_SERVICE_ID = bs.IDNo AND p.PAYMENT_TYPE = 'service'
            WHERE bs.BOOKING_ID = ?
            GROUP BY bs.IDNo, bs.TOTAL_COST
            HAVING remainingAmount > 0
        `;
        
        const serviceRows = await new Promise((resolve, reject) => {
          connection.query(serviceQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        // Use remaining amount instead of total cost for payment allocation
        const totalServiceAmount = serviceRows.reduce((sum, service) => sum + parseFloat(service.remainingAmount), 0);
        
        // Calculate net balance
        // Note: reservation fee and discount are already deducted from fullRoomAmount in Step 3
        const reservationFee = parseFloat(billing.RESERVATION_FEE) || 0;
        const discountAmount = parseFloat(billing.DISCOUNT_AMOUNT) || 0;
        const grossTotal = fullRoomAmount + totalExtensionAmount + totalServiceAmount;
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
              `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES (?, ?, ?, ?, 'room', NOW(), ?)`,
                                [bookingId, billingId, roomPaymentAmount, paymentMethod, encodedBy],
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
                `UPDATE booking_extension SET PAYMENT_STATUS = ? WHERE IDNo = ?`,
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
                                    `INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY) 
                                    VALUES (?, ?, ?, ?, 'service', NOW(), ?)`,
                                    [bookingId, service.IDNo, servicePaymentAmount, paymentMethod, encodedBy],
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
                `UPDATE booking_service SET STATUS = ? WHERE IDNo = ?`,
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

          // Mark all extensions as paid
          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE BOOKING_ID = ? AND PAYMENT_STATUS != 'paid'`,
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
              `UPDATE booking_service SET STATUS = 'paid' WHERE BOOKING_ID = ? AND STATUS != 'paid'`,
              [bookingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Step 6: Process unpaid pickup/dropoff
        const pickDropQuery = `
          SELECT IDNo, RATE, TYPE FROM booking_pick_drop 
          WHERE BOOKING_ID = ? AND STATUS != 'paid' AND ACTIVE = 1
        `;
        const pickDropRows = await new Promise((resolve, reject) => {
          connection.query(pickDropQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        for (let pd of pickDropRows) {
          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (
                BOOKING_ID, BOOKING_PICKDROP_ID, AMOUNT_PAID, PAYMENT_METHOD, 
                                    PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS
                                ) VALUES (?, ?, ?, ?, 'pickdrop', NOW(), ?, ?)`,
                                [bookingId, pd.IDNo, pd.RATE, paymentMethod, encodedBy, paymentNotes || 'Pickup/Dropoff payment'],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_pick_drop SET STATUS = 'paid' WHERE IDNo = ?`,
              [pd.IDNo],
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
      const defaultCheckOutTime = '11:00:00';

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
  static async getGroupBookingData(filter, dateFrom, dateTo) {
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

      const query = `
        SELECT 
          gb.IDNo AS group_id,
          gb.GROUP_NAME,
          gb.CONTACT_NO,
          gb.NUMBER_OF_ROOMS,
          gb.REMARKS AS REMARKS,
          gb.BILLING_TYPE,
          b.BOOKING_CHANNEL,
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
              ), 0)
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
              AND p.PAYMENT_TYPE IN ('room','service')
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
          END AS PAYMENT_STATUS
        FROM booking b
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.GROUP_BOOKING_ID IS NOT NULL
          ${dateCondition}
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
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0) + 
          COALESCE(bill.AMENITIES_CHARGE, 0) + 
          COALESCE(bill.SERVICES_CHARGE, 0) AS TOTAL_COST,
          -- Join booking_service with services to get SERVICE_NAME
          COALESCE(GROUP_CONCAT(DISTINCT s.SERVICE_NAME ORDER BY s.SERVICE_NAME SEPARATOR ', '), 'No Services') AS SERVICES_AVAILED
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN booking_service bs ON b.IDNo = bs.BOOKING_ID
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo -- Fetch the correct service name
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
          gb.ENCODED_BY,
          gb.ENCODED_DT,
          gb.BILLING_TYPE
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
          b.CHECK_IN_STATUS,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.AGENCY_ID,
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

      // Get services for the group
      const servicesQuery = `
        SELECT
          bs.BOOKING_ID,
          bs.SERVICE_ID,
          s.SERVICE_NAME,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS
        FROM booking_service bs
        JOIN services s ON bs.SERVICE_ID = s.IDNo
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
            console.log('✅ Found breakfast adult service');
            groupServices.breakfastAdult = {
              qty: service.QTY,
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 75 || (serviceName.includes('kid') && serviceName.includes('breakfast'))) {
            console.log('✅ Found breakfast kid service');
            groupServices.breakfastKid = {
              qty: service.QTY,
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 76 || serviceName.includes('pick')) {
            console.log('✅ Found pickup service');
            groupServices.pickup = {
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
          } else if (service.SERVICE_ID === 77 || serviceName.includes('drop')) {
            console.log('✅ Found dropoff service');
            groupServices.dropoff = {
              price: service.TOTAL_COST,
              id: service.SERVICE_ID
            };
            console.log('🔍 Set dropoff service:', groupServices.dropoff);
          } else {
            console.log('❌ Service not categorized:', serviceName, 'ID:', service.SERVICE_ID);
          }
        }
      });

      // Debug: Log final group services
      console.log('🔍 Final group services:', {
        breakfastAdult: groupServices.breakfastAdult,
        breakfastKid: groupServices.breakfastKid,
        pickup: groupServices.pickup,
        dropoff: groupServices.dropoff
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
        remarks: groupBooking.REMARKS,
        selectedRooms,
        selectedRoomPrice: selectedRoomPrices,
        qty: diffInDays,
        daterange,
        guestType: bookingsResult[0]?.guestType, // Default guest type
        guestLevel: bookingsResult[0]?.guestLevel, // Default guest level
        checkInStatus: firstBooking.CHECK_IN_STATUS,
        checkOutStatus: firstBooking.LATE_CHECKOUT,
        paymentStatus: firstBooking.PAYMENT_STATUS,
        bookingRoute: firstBooking.BOOKING_CHANNEL,
        agencyId: firstBooking.AGENCY_ID,
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

      // Get room numbers
      const roomsQuery = `
        SELECT GROUP_CONCAT(DISTINCT r.ROOM_NUMBER ORDER BY r.ROOM_NUMBER SEPARATOR ', ') AS room_numbers
        FROM booking b
        JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
      `;
      const roomsResult = await queryDatabasePromise(roomsQuery, [groupId]);
      const roomNumbers = roomsResult?.[0]?.room_numbers || '';

      // Calculate total (room charges + services - discount - reservation fee)
      const totalQuery = `
        SELECT
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
            ), 0)
          ), 0)
          - COALESCE(gb.GROUP_DISCOUNT, 0)
          - COALESCE(gb.GROUP_RESERVATION_FEE, 0)
          AS total
        FROM booking b
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1
      `;
      const totalResult = await queryDatabasePromise(totalQuery, [groupId]);
      const total = parseFloat(totalResult?.[0]?.total || 0);

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
        confirmationNumber: groupBooking.confirmationNumber || null
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
      remarks,
      agencyId = null,
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
      encodedBy,
      date
    } = data;


    // Helper: parse daterange "MMM DD, YYYY to MMM DD, YYYY (..optional..)"
    const moment = require('moment');
    const [rawCheckIn = '', rawCheckOut = ''] = (daterange || '').split(' to ');
    const normalizeDate = (raw, isCheckIn) => {
      if (!raw) return null;
      const clean = raw.split(' (')[0].trim();
      const time = isCheckIn ? '14:00:00' : (checkOutStatus == 1 ? '23:00:00' : '11:00:00');
      const parsed = moment(clean, 'MMM DD, YYYY');
      if (!parsed.isValid()) return null;
      return `${parsed.format('YYYY-MM-DD')} ${time}`;
    };
    const checkInDate = normalizeDate(rawCheckIn, true);
    const checkOutDate = normalizeDate(rawCheckOut, false);
    if (!checkInDate || !checkOutDate) {
      throw new Error('Invalid date range supplied for group booking update');
    }

    // Get connection for transaction
    const connection = await new Promise((resolve, reject) => {
      pool.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
    });

    try {
      // Begin transaction
      await new Promise((resolve, reject) => connection.beginTransaction(err => (err ? reject(err) : resolve())));

      // Update group_booking table
      const updateGroupQuery = `
        UPDATE group_booking
        SET GROUP_NAME = ?, CONTACT_NO = ?, NUMBER_OF_ROOMS = ?, GROUP_RESERVATION_FEE = ?, GROUP_DISCOUNT = ?, REMARKS = ?, ENCODED_BY = ?, BILLING_TYPE = ?
        WHERE IDNo = ?
      `;

      await connection.promise().query(updateGroupQuery, [
        groupName,
        groupContact,
        numberOfRooms,
        0, // GROUP_RESERVATION_FEE removed - always set to 0
        parseFloat(discount) || 0,
        remarks || '',
        encodedBy,
        consolidatedBilling ? 1 : 0, // 1 = Master, 0 = Individual
        
        groupBookingId
      ]);

      // Get existing bookings for this group
      const existingBookingsQuery = `SELECT IDNo, ROOM_ID FROM booking WHERE GROUP_BOOKING_ID = ?`;
      const [existingBookings] = await connection.promise().query(existingBookingsQuery, [groupBookingId]);
      const existingRoomIds = existingBookings.map(b => b.ROOM_ID);
      // Use the earliest/first booking in the group as the anchor booking for consolidated entries
      const firstBookingId = existingBookings && existingBookings.length > 0 ? existingBookings[0].IDNo : null;

      // Parse new selected rooms - ensure consistent data types
      const newRoomIds = (selectedRooms || '').split(',').filter(Boolean).map(id => parseInt(id.trim()));
      const newRoomPrices = (selectedRoomPrice || '').split(',').filter(Boolean).map(p => parseFloat(p));

      // Handle room additions/removals - now comparing integers with integers
      const roomsToAdd = newRoomIds.filter(id => !existingRoomIds.includes(id));
      const roomsToRemove = existingRoomIds.filter(id => !newRoomIds.includes(id));
      const roomsToUpdate = newRoomIds.filter(id => existingRoomIds.includes(id));

      console.log('Room comparison debug:');
      console.log('Existing room IDs:', existingRoomIds);
      console.log('New room IDs:', newRoomIds);
      console.log('Rooms to add:', roomsToAdd);
      console.log('Rooms to remove:', roomsToRemove);
      console.log('Rooms to update:', roomsToUpdate);

      // Remove bookings for rooms no longer in the group
      if (roomsToRemove.length > 0) {
        const removeBookingIds = existingBookings
          .filter(b => roomsToRemove.includes(b.ROOM_ID))
          .map(b => b.IDNo);

        if (removeBookingIds.length > 0) {
          // Delete payments first
          await connection.promise().query('DELETE FROM payments WHERE BOOKING_ID IN (?)', [removeBookingIds]);
          // Delete booking services
          await connection.promise().query('DELETE FROM booking_service WHERE BOOKING_ID IN (?)', [removeBookingIds]);
          // Delete billing records
          await connection.promise().query('DELETE FROM billing WHERE BOOKING_ID IN (?)', [removeBookingIds]);
          // Delete bookings
          await connection.promise().query('DELETE FROM booking WHERE IDNo IN (?)', [removeBookingIds]);
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
            // Generate new confirmation number for updated booking
            const roomQuery = 'SELECT ROOM_NUMBER FROM room WHERE IDNo = ?';
            const [roomResult] = await connection.promise().query(roomQuery, [roomId]);
            const roomNumber = roomResult[0]?.ROOM_NUMBER || '';
            
            // Generate confirmation number in format: YYYYMMDD0ROOMNUMBER
            const datePart = moment(checkInDate).format('YYYYMMDD');
            const confirmationNumber = `${datePart}0${roomNumber}`;

            // Update booking
            await connection.promise().query(`
              UPDATE booking
              SET CHECK_IN_DATE = ?, CHECK_OUT_DATE = ?, BOOKING_CHANNEL = ?, CHECK_IN_STATUS = ?, LATE_CHECKOUT = ?, REMARKS = ?, CONFIRMATION_NUMBER = ?, ENCODED_BY = ?, ENCODED_DT = ?
              WHERE IDNo = ?
            `, [
              checkInDate, checkOutDate, bookingRoute, checkInStatus, checkOutStatus,
              index === 0 ? remarks : '', confirmationNumber, encodedBy, date, existingBooking.IDNo
            ]);

            // Sync remarks to remarks table for the main booking row
            if (index === 0) {
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
            let roomChargeForBilling, reservationFeeForBilling, discountForBilling;

            if (consolidatedBilling && index === 0) {
              // Main booking in consolidated billing gets all charges
              roomChargeForBilling = newRoomPrices.reduce((sum, price) => sum + price, 0); // Total of all rooms
              reservationFeeForBilling = 0; // Reservation fee removed
              discountForBilling = parseFloat(discount) || 0;
              console.log(`🔄 Room ${index + 1} (Main): CONSOLIDATED - Room Charge: ₱${roomChargeForBilling}, Fee: ₱${reservationFeeForBilling}, Discount: ₱${discountForBilling}`);
            } else if (consolidatedBilling) {
              // Other bookings in consolidated billing get zero charges
              roomChargeForBilling = 0;
              reservationFeeForBilling = 0;
              discountForBilling = 0;
              console.log(`🔄 Room ${index + 1}: CONSOLIDATED - Room Charge: ₱0, Fee: ₱0, Discount: ₱0`);
            } else {
              // Regular billing - each booking gets its own charges
              roomChargeForBilling = roomPrice;
              reservationFeeForBilling = 0; // Reservation fee and discount are group-level, not per booking
              discountForBilling = 0;
              console.log(`🔄 Room ${index + 1}: INDIVIDUAL - Room Charge: ₱${roomChargeForBilling}, Fee: ₱0, Discount: ₱0`);
            }

            // Update billing
            await connection.promise().query(`
              UPDATE billing
              SET ROOM_CHARGE = ?, QTY = ?, PAYMENT_STATUS = ?, RESERVATION_FEE = ?, DISCOUNT_AMOUNT = ?, ENCODED_BY = ?, ENCODED_DT = ?
              WHERE BOOKING_ID = ?
            `, [
              roomChargeForBilling, qty, paymentStatus, reservationFeeForBilling, discountForBilling, encodedBy, date, existingBooking.IDNo
            ]);

            // Update customer info for all bookings in the group
            const guestFullName = index === 0 ? `${groupName}-1-Main` : `${groupName}-${index + 1}`;
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
            INSERT INTO booking (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, LATE_CHECKOUT, REMARKS, CONFIRMATION_NUMBER, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, GROUP_BOOKING_ID, AGENCY_ID, IS_DIRECT_RESERVATION)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            guestID, roomId, checkInDate, checkOutDate, 'pending', bookingRoute, 1,
            checkOutStatus, index === 0 ? remarks : '', confirmationNumber, encodedBy, date, 1,
            checkInStatus, groupBookingId, agencyId || null, 0
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
            // Main booking in consolidated billing gets all charges
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
            // Regular billing - each booking gets its own charges
            roomChargeForBilling = roomPrice;
            reservationFeeForBilling = 0; // Reservation fee and discount are group-level, not per booking
            discountForBilling = 0;
            console.log(`🆕 New Room ${index + 1}: INDIVIDUAL - Room Charge: ₱${roomChargeForBilling}, Fee: ₱0, Discount: ₱0`);
          }

          // Insert billing
          await connection.promise().query(`
            INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            bookingId, roomChargeForBilling, 0.00, 0.00, 0.00, qty, paymentStatus, 'cash', '',
            encodedBy, date, 1, reservationFeeForBilling, discountForBilling
          ]);
        }
      }

      // Handle services update (delete existing and add new)
      // Get all booking IDs for this group
      const allBookingIdsQuery = `SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? ORDER BY IDNo`;
      const [allBookings] = await connection.promise().query(allBookingIdsQuery, [groupBookingId]);
      const targetBookingIds = allBookings.map(b => b.IDNo);

      // Delete existing services for all bookings and their payments
      for (const bookingId of targetBookingIds) {
        await connection.promise().query('DELETE FROM payments WHERE BOOKING_ID = ? AND PAYMENT_TYPE = ?', [bookingId, 'service']);
        await connection.promise().query('DELETE FROM booking_service WHERE BOOKING_ID = ?', [bookingId]);
      }

      if (targetBookingIds.length > 0) {
        const groupServices = [];

        // Breakfast Adult
        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
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
          const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
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

      // Handle payments for reservation fees and discounts
      if (firstBookingId) {
        // Delete existing reservation fee and discount payments for all bookings in the group
        const allBookingIds = existingBookings.map(b => b.IDNo);
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
          // Individual billing: apply fees/discounts to each booking
          for (let index = 0; index < newRoomIds.length; index++) {
            const bookingId = existingBookings.find(b => b.ROOM_ID === parseInt(newRoomIds[index]))?.IDNo;
            if (bookingId) {
              if (parseFloat(reservationFee) > 0) {
                additionalPayments.push([
                  bookingId,
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
                  bookingId,
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

      // Insert payment record for the paid amount if payment status is 'paid' or 'partial'
      if (paymentStatus === 'paid' || paymentStatus === 'partial') {
        const paidAmount = parseFloat(data.paidAmount) || 0;
        
        if (paidAmount > 0 && firstBookingId) {
          const paymentQuery = `
            INSERT INTO payments 
            (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const paymentValues = [
            firstBookingId,
            null, // No specific service ID for room payment
              paidAmount,
              'cash',
              'room', // Payment type for group room charges
              date,
              encodedBy,
            'Initial payment for group booking'
          ];
          
          await connection.promise().query(paymentQuery, paymentValues);
          console.log(`✅ Group room payment of ₱${paidAmount} recorded for group booking ${firstBookingId}`);
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
          bill.PAYMENT_STATUS
        FROM billing bill
        JOIN booking b ON bill.BOOKING_ID = b.IDNo
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo  
        JOIN room r ON b.ROOM_ID = r.IDNo  
        WHERE b.GROUP_BOOKING_ID = ?
        GROUP BY bill.BOOKING_ID, gb.GROUP_NAME, r.ROOM_NUMBER, bill.ROOM_CHARGE, bill.QTY, bill.PAYMENT_STATUS
        ORDER BY r.ROOM_NUMBER ASC, bill.BOOKING_ID ASC
      `;

      // Query for Service Charges ONLY
      const serviceBillingQuery = `
        SELECT 
          b.IDNo AS BOOKING_ID,
          r.ROOM_NUMBER,
          s.SERVICE_NAME AS description,
          CASE 
            WHEN LOWER(s.SERVICE_NAME) LIKE '%breakfast%'
              AND (LOWER(s.SERVICE_NAME) LIKE '%adult%' OR LOWER(s.SERVICE_NAME) LIKE '%kid%')
            THEN (bs.TOTAL_COST / NULLIF(bs.QTY, 0))
            ELSE bs.TOTAL_COST
          END AS charges,
          bs.QTY AS service_qty,
          bs.STATUS
        FROM booking_service bs
        JOIN booking b ON bs.BOOKING_ID = b.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        JOIN services s ON bs.SERVICE_ID = s.IDNo
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo 
        WHERE b.GROUP_BOOKING_ID = ?
        ORDER BY r.ROOM_NUMBER ASC, b.IDNo ASC
      `;

      // Execute both queries
      const [roomResults, serviceResults] = await Promise.all([
        queryDatabasePromise(roomBillingQuery, [groupId]),
        queryDatabasePromise(serviceBillingQuery, [groupId])
      ]);

      // Extract unique values for invoice
      const invoiceNumber = roomResults.length > 0 ? roomResults[0].invoiceNumber : "Not Assigned";
      const GroupName = roomResults.length > 0 ? roomResults[0].GROUP_NAME : "Unknown Group";

      // Get group summary data including reservation fee and discount
      const summaryQuery = `
        SELECT 
          COALESCE(gb.GROUP_DISCOUNT, 0) AS group_discount,
          COALESCE(gb.GROUP_RESERVATION_FEE, 0) AS reservation_fee
        FROM group_booking gb
        WHERE gb.IDNo = ?
      `;

      const [summaryRow] = await queryDatabasePromise(summaryQuery, [groupId]);
      const reservationFee = parseFloat(summaryRow?.reservation_fee || 0);
      const discount = parseFloat(summaryRow?.group_discount || 0);

      // Compute totals from items
      const roomTotal = roomResults.reduce((sum, r) => sum + ((parseFloat(r.charges) || 0) * (parseInt(r.room_qty, 10) || 0)), 0);
      const servicesTotal = serviceResults.reduce((sum, s) => sum + ((parseFloat(s.charges) || 0) * (parseInt(s.service_qty, 10) || 0)), 0);
      const grandTotal = Math.max(0, (roomTotal + servicesTotal) - discount - reservationFee);

      // Sum of payments from payments table (room + service only)
      const paidQuery = `
        SELECT COALESCE(SUM(p.AMOUNT_PAID), 0) AS paidTotal
        FROM payments p
        JOIN booking b ON p.BOOKING_ID = b.IDNo
        WHERE b.GROUP_BOOKING_ID = ?
          AND p.PAYMENT_TYPE IN ('room','service')
      `;
      const [paidRow] = await queryDatabasePromise(paidQuery, [groupId]);
      const totalPaid = parseFloat(paidRow?.paidTotal || 0);
      const balance = Math.max(0, grandTotal - totalPaid);

      return {
        invoiceNumber: invoiceNumber,
        GroupName,
        roomBillingDetails: roomResults,  // Room charges
        serviceBillingDetails: serviceResults,  // Service charges
        reservationFee: reservationFee,
        discount: discount,
        roomTotal: roomTotal,
        servicesTotal: servicesTotal,
        grandTotal: grandTotal,
        totalPaid: totalPaid,
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
      const imagePath = path.join(__dirname, '../public/img/Logo-Gold.png');
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
        rows.push({
          ROOM_NUMBER: s.ROOM_NUMBER,
          DESCRIPTION: s.description,
          CHARGES: parseFloat(s.charges) || 0,
          QTY: parseInt(s.service_qty, 10) || 0
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
          UPDATE booking_service SET STATUS = 'paid' WHERE IDNo = ?
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
    const { bookingId, reason, manual, manualRefund, encodedBy } = params;
    
    try {
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
          SELECT CHECK_IN_DATE, CHECK_OUT_DATE 
          FROM booking 
          WHERE IDNo = ?
        `;
        const bookingRows = await queryDatabasePromise(fetchBookingQuery, [bookingId], connection);

      if (bookingRows.length === 0) {
        connection.release();
        throw new Error('Booking not found.');
      }

      const { CHECK_IN_DATE, CHECK_OUT_DATE } = bookingRows[0];
      const today = new Date();
      const checkIn = new Date(CHECK_IN_DATE);
      const checkOut = new Date(CHECK_OUT_DATE);

      const totalNights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      const dayDiff = Math.floor((checkIn - today) / (1000 * 60 * 60 * 24));

      // Calculate penalty nights based on policy
      let penaltyNights = 0;
      if (dayDiff >= 20) penaltyNights = 1;
      else if (dayDiff >= 10) penaltyNights = 2;
      else if (dayDiff < 5) penaltyNights = totalNights;

      // Fetch billing details
      const billingQuery = `
        SELECT ROOM_CHARGE * QTY AS TOTAL_AMOUNT 
        FROM billing 
        WHERE BOOKING_ID = ?
      `;
      const billRows = await queryDatabasePromise(billingQuery, [bookingId], connection);

      if (billRows.length === 0) {
        connection.release();
        throw new Error('Billing not found.');
      }

      const totalAmount = billRows[0].TOTAL_AMOUNT;
      const nightlyRate = totalNights > 0 ? totalAmount / totalNights : 0;
      const penaltyAmount = nightlyRate * penaltyNights;

      // Calculate refund amount
      let refundAmount = 0;
      let fullPenalty = 0;

      if (manual === 'true' || manual === true) {
        refundAmount = parseFloat(manualRefund) || 0;
        fullPenalty = refundAmount === 0 ? 1 : 0;
      } else {
        refundAmount = totalAmount - penaltyAmount;
        fullPenalty = penaltyNights >= totalNights ? 1 : 0;
      }

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
            PENALTY_NIGHTS = ?,
            BOOKING_STATUS = 'cancelled'
        WHERE IDNo = ?
      `;
      await queryDatabasePromise(updateBookingQuery, [now, penaltyNights, bookingId], connection);

      // Update billing
      const updateBillingQuery = `
        UPDATE billing
        SET CANCELLATION_PENALTY = ?,
            REFUNDABLE_AMOUNT = ?
        WHERE BOOKING_ID = ?
      `;
      await queryDatabasePromise(updateBillingQuery, [penaltyAmount, refundAmount, bookingId], connection);

      // Insert cancellation log
      const insertLogQuery = `
        INSERT INTO booking_cancellation
        (BOOKING_ID, CANCELLATION_REASON, PENALTY_NIGHTS, REFUND_AMOUNT, FULL_PENALTY, ENCODED_BY)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await queryDatabasePromise(insertLogQuery, [
        bookingId, 
        reason || '', 
        penaltyNights, 
        refundAmount, 
        fullPenalty, 
        encodedBy
      ], connection);

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

  // Cancel group booking
  static async cancelGroupBooking(params) {
    const { groupId, reason, manual, manualRefund, encodedBy } = params;
    
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

        // Check if any bookings are already checked in or checked out
        const activeBookings = groupRows.filter(row => 
          row.BOOKING_STATUS && 
          (row.BOOKING_STATUS.toLowerCase() === 'check-in' || 
           row.BOOKING_STATUS.toLowerCase() === 'check-out')
        );

        if (activeBookings.length > 0) {
          connection.release();
          throw new Error('Group has active bookings.');
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

        // Process each individual booking in the group
        for (const booking of groupRows) {
          if (!booking.BOOKING_ID) continue; // Skip if no individual booking

          const { CHECK_IN_DATE, CHECK_OUT_DATE } = booking;
          const checkIn = new Date(CHECK_IN_DATE);
          const checkOut = new Date(CHECK_OUT_DATE);
          const today = new Date();

          const totalNights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
          const dayDiff = Math.floor((checkIn - today) / (1000 * 60 * 60 * 24));

          // Calculate penalty nights based on policy
          let penaltyNights = 0;
          if (dayDiff >= 20) penaltyNights = 1;
          else if (dayDiff >= 10) penaltyNights = 2;
          else if (dayDiff < 5) penaltyNights = totalNights;

          // Fetch billing details for this booking
          const billingQuery = `
            SELECT ROOM_CHARGE * QTY AS TOTAL_AMOUNT 
            FROM billing 
            WHERE BOOKING_ID = ?
          `;
          const billRows = await queryDatabasePromise(billingQuery, [booking.BOOKING_ID], connection);

          if (billRows.length > 0) {
            const totalAmount = billRows[0].TOTAL_AMOUNT;
            const nightlyRate = totalNights > 0 ? totalAmount / totalNights : 0;
            const penaltyAmount = nightlyRate * penaltyNights;

            // Calculate refund amount for this booking
            let refundAmount = 0;
            if (manual === 'true' || manual === true) {
              // For manual override, distribute the manual refund proportionally
              const bookingProportion = totalAmount / groupRows.reduce((sum, b) => {
                if (b.BOOKING_ID) {
                  const billQuery = `SELECT ROOM_CHARGE * QTY AS AMOUNT FROM billing WHERE BOOKING_ID = ?`;
                  // This is simplified - in real implementation, you'd need to fetch all amounts first
                  return sum + totalAmount; // Placeholder
                }
                return sum;
              }, 0);
              refundAmount = parseFloat(manualRefund) * bookingProportion || 0;
            } else {
              refundAmount = totalAmount - penaltyAmount;
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

            // Update billing for this booking
            const updateBillingQuery = `
              UPDATE billing
              SET CANCELLATION_PENALTY = ?,
                  REFUNDABLE_AMOUNT = ?
              WHERE BOOKING_ID = ?
            `;
            await queryDatabasePromise(updateBillingQuery, [penaltyAmount, refundAmount, booking.BOOKING_ID], connection);

            // Insert cancellation log for this booking
            const insertLogQuery = `
              INSERT INTO booking_cancellation
              (BOOKING_ID, CANCELLATION_REASON, PENALTY_NIGHTS, REFUND_AMOUNT, FULL_PENALTY, ENCODED_BY)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
            const fullPenalty = penaltyNights >= totalNights ? 1 : 0;
            await queryDatabasePromise(insertLogQuery, [
              booking.BOOKING_ID, 
              reason || '', 
              penaltyNights, 
              refundAmount, 
              fullPenalty, 
              encodedBy
            ], connection);
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
      data.TOTAL_UNPAID = parseFloat(data.GRAND_TOTAL) - parseFloat(data.TOTAL_PAID);

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

      // Add image and user data
      const path = require('path');
      const fs = require('fs');
      const imagePath = path.join(__dirname, '../public/img/Logo-Gold.png');
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
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
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
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.JPG');
      const imageBase64 = fs.readFileSync(imagePath, 'base64');

      data.imageUrl = `data:image/png;base64,${imageBase64}`;

      // Generate PDF using Playwright
      const { chromium } = require('playwright');
      const ejs = require('ejs');
      
      const templateData = {
        ...data,
        encodedBy: user.FULLNAME,
        reservationFee: data.reservationFee !== undefined ? data.reservationFee : 0
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
      const imagePath = path.join(__dirname, '../public/img/Logo-Black.JPG');
      
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
    const { bookingId, roomId, roomNumber, roomType, bedCount, price, floor } = params;
    
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Update the booking to assign the room
      const updateBookingQuery = `
        UPDATE booking 
        SET ROOM_ID = ?, 
            IS_DIRECT_RESERVATION = 0,
            EDITED_BY = 'System',
            EDITED_DT = NOW()
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
          b.GUESTS_COUNT,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          b.CHECK_IN_STATUS,
          b.LATE_CHECKOUT,
          b.IS_DIRECT_RESERVATION,
          b.AGENCY_ID,
          b.BED_COUNT,
          
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
        WHERE BOOKING_ID = ? AND PAYMENT_TYPE NOT IN ('reservation_fee', 'discount')
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
        bookingRoute, checkInStatus, checkOutStatus, bookingRemarks, agencyID, bedCount,
        breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
        breakfastKidQty, breakfastKidPrice, breakfastKidId,
        pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
        discount, lateCheckoutFee, editedBy
      } = params;

      const editDate = new Date();

      // Parse the date range
      const dateRangeParts = daterange.split(' to ');
      const startDateStr = dateRangeParts[0].trim();
      const endDateStr = dateRangeParts[1].split('(')[0].trim();

      // Convert dates to MySQL format
      const moment = require('moment');
      const checkInDate = moment(startDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' 14:00:00';

      // Set checkout time based on checkOutStatus (0 = regular, 1 = late)
      let checkOutTime;
      if (checkOutStatus == 1) {
        // Late Check Out: Set to 11:00 PM
        checkOutTime = ' 23:00:00';
      } else {
        // Regular Check Out: Set to 11:00 AM
        checkOutTime = ' 11:00:00';
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
                  GUESTS_COUNT = ?, REMARKS = ?, CHECK_IN_STATUS = ?, LATE_CHECKOUT = ?, AGENCY_ID = ?,
                  BED_COUNT = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE IDNo = ?
            `;
            // Handle empty agencyID and bedCount - set to NULL if empty
            const processedAgencyID = (bookingRoute === 'agency' && agencyID && agencyID.trim() !== '') ? agencyID : null;
            const processedBedCount = (bedCount && bedCount.trim() !== '') ? bedCount : null;
            
            await connection.promise().query(bookingUpdateQuery, [
              room_id, checkInDate, checkOutDate, bookingRoute, maxOccupants,
              bookingRemarks, checkInStatus, checkOutStatus || 0, processedAgencyID,
              processedBedCount, editedBy, editDate, bookingId
            ]);

            // 3. Update billing information
            const billingUpdateQuery = `
              UPDATE billing 
              SET ROOM_CHARGE = ?, QTY = ?, PAYMENT_STATUS = ?, 
                  DISCOUNT_AMOUNT = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE BOOKING_ID = ?
            `;
            await connection.promise().query(billingUpdateQuery, [
              numericRoomPrice, diffindays, paymentStatus, 
              parseFloat(discount) || 0.00,
              editedBy, editDate, bookingId
            ]);

            // 4. Delete existing services and re-insert
            await connection.promise().query('DELETE FROM booking_service WHERE BOOKING_ID = ?', [bookingId]);

            // 5. Insert updated services
            const services = [];
            
            if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
              const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
              services.push([
                bookingId, breakfastAdultId, breakfastAdultQty, totalAdult,
                paymentStatus === 'paid' ? 'paid' : 'unpaid', editedBy, editDate, 1
              ]);
            }

            if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
              const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
              services.push([
                bookingId, breakfastKidId, breakfastKidQty, totalKid,
                paymentStatus === 'paid' ? 'paid' : 'unpaid', editedBy, editDate, 1
              ]);
            }

            if (pickupServiceId && pickupPrice) {
              services.push([
                bookingId, pickupServiceId, 1, pickupPrice,
                paymentStatus === 'paid' ? 'paid' : 'unpaid', editedBy, editDate, 1
              ]);
            }

            if (dropoffServiceId && dropoffPrice) {
              services.push([
                bookingId, dropoffServiceId, 1, dropoffPrice,
                paymentStatus === 'paid' ? 'paid' : 'unpaid', editedBy, editDate, 1
              ]);
            }

            if (services.length > 0) {
              const serviceQuery = `
                INSERT INTO booking_service 
                (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
                VALUES ?
              `;
              await connection.promise().query(serviceQuery, [services]);
            }

            // 5A. Handle late checkout fee if applicable
            if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0) {
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
            }

            // 6. Update payments based on paid amount
            if (paymentStatus === 'paid' || paymentStatus === 'partial') {
              // Delete existing payments for this booking
              await connection.promise().query('DELETE FROM payments WHERE BOOKING_ID = ?', [bookingId]);
              
              // Insert payment record for the paid amount
              const paidAmountNum = parseFloat(paidAmount) || 0;
              if (paidAmountNum > 0) {
                const paymentQuery = `
                  INSERT INTO payments 
                  (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                await connection.promise().query(paymentQuery, [
                  bookingId, null, paidAmountNum, 'cash', 'room', editDate, editedBy
                ]);
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
  static async findConsecutiveRooms(params) {
    const { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus, excludeGroupBookingId } = params;
    
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
      console.error('Error in findConsecutiveRooms:', error);
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
      remarks,
      agencyId = null,
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
      discount = 0,
      consolidatedBilling = true, // Default: Master Billing (changed from false to true)
      perRoomDiscounts = [],
      lateCheckoutFee = 0,
      // Meta
      encodedBy,
      date,
      isDirectReservation
    } = data;

    // Helper: parse daterange "MMM DD, YYYY to MMM DD, YYYY (..optional..)"
    const moment = require('moment');
    const [rawCheckIn = '', rawCheckOut = ''] = (daterange || '').split(' to ');
    const normalizeDate = (raw, isCheckIn) => {
      if (!raw) return null;
      const clean = raw.split(' (')[0].trim();
      const time = isCheckIn ? '14:00:00' : (checkOutStatus == 1 ? '23:00:00' : '11:00:00');
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

      // Insert into group_booking
      const groupBookingQuery = `
        INSERT INTO group_booking (GROUP_NAME, CONTACT_NO, NUMBER_OF_ROOMS, ENCODED_BY, GROUP_RESERVATION_FEE, GROUP_DISCOUNT, REMARKS, BILLING_TYPE)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [groupResult] = await connection.promise().query(groupBookingQuery, [
        groupName,
        groupContact,
        numberOfRooms,
        encodedBy,
        0, // GROUP_RESERVATION_FEE removed - always set to 0
        parseFloat(discount) || 0,
        remarks || '',
        consolidatedBilling ? 1 : 0 // 1 = Master, 0 = Individual
      ]);
      const groupBookingId = groupResult.insertId;

      // Prepare per-room arrays
      const roomBasePrices = (selectedRoomPrice || '').split(',').map(p => parseFloat(p));
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

      // Insert each room booking
      for (let index = 0; index < roomIds.length; index++) {
        const roomId = roomIds[index];
        const guestFullName = index === 0 ? `${groupName}-Main-1` : `${groupName}-${index + 1}`;
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
          INSERT INTO booking (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, LATE_CHECKOUT, REMARKS, CONFIRMATION_NUMBER, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, GROUP_BOOKING_ID, AGENCY_ID, IS_DIRECT_RESERVATION)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const bookingValues = [
          guestID,
          roomId,
          checkInDate,
          checkOutDate,
          'pending',
          bookingRoute,
          1,
          checkOutStatus,
          bookingRemarksForThisRow,
          confirmationNumber,
          encodedBy,
          date,
          1,
          checkInStatus,
          groupBookingId,
          agencyId || null,
          0
        ];
        const [bookResult] = await connection.promise().query(bookingQuery, bookingValues);
        const bookingId = bookResult.insertId;
        if (!firstBookingId) firstBookingId = bookingId;

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
          INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let roomChargeForBilling, reservationFeeForBilling, discountForBilling, roomRatePerNight, quantityForBilling;

        if (consolidatedBilling && index === 0) {
          // Main booking in consolidated billing gets all charges
          console.log(`🔄 Backend - Room ${index + 1}: CONSOLIDATED BILLING (Main Booking)`);
          roomChargeForBilling = adjustedRoomCharge; // Total of all rooms
          reservationFeeForBilling = 0; // Reservation fee removed
          discountForBilling = parseFloat(discount) || 0;
          
          // For consolidated billing, calculate average room rate per night
          const totalRoomsBase = roomBasePrices.reduce((sum, price) => sum + price, 0);
          roomRatePerNight = totalRoomsBase; // Sum of all room rates per night
          quantityForBilling = nightsCount; // Number of nights
        } else if (consolidatedBilling) {
          // Other bookings in consolidated billing have no charges
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
          roomRatePerNight, // Room rate per night (not total)
          0.00,
          0.00,
          0.00,
          quantityForBilling, // QTY should be number of nights
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
        if (checkOutStatus == 1 && parseFloat(lateCheckoutFee) > 0) {
          const lateCheckoutQuery = `
            INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
            VALUES (?, 72, 1, ?, ?, ?, NOW())
          `;

          const status = 'unpaid'; // Will be updated by payment distribution logic
          await connection.promise().query(lateCheckoutQuery, [bookingId, lateCheckoutFee, status, encodedBy]);

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
      // Get all booking IDs for this group
      const allBookingIds = [];
      for (let index = 0; index < roomIds.length; index++) {
        const roomId = roomIds[index];
        const [existingBooking] = await connection.promise().query(
          'SELECT IDNo FROM booking WHERE GROUP_BOOKING_ID = ? AND ROOM_ID = ? ORDER BY IDNo ASC LIMIT 1',
          [groupBookingId, roomId]
        );
        if (existingBooking && existingBooking.length > 0) {
          allBookingIds.push(existingBooking[0].IDNo);
        }
      }
      
      // If no bookings found yet, use firstBookingId as fallback
      const targetBookingIds = allBookingIds.length > 0 ? allBookingIds : (firstBookingId ? [firstBookingId] : []);
      
      if (targetBookingIds.length > 0) {
        const groupServices = [];
        
        // Breakfast Adult
        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
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
          const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
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
        ? parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice) * (breakfastIndividual ? numRooms : 1) 
        : 0;
      const breakfastKidTotal = (parseInt(breakfastKidQty) > 0 && breakfastKidPrice) 
        ? parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice) * (breakfastIndividual ? numRooms : 1) 
        : 0;
      const pickupTotal = pickupPrice ? parseFloat(pickupPrice) : 0;
      const dropoffTotal = dropoffPrice ? parseFloat(dropoffPrice) : 0;
      const servicesTotal = breakfastAdultTotal + breakfastKidTotal + pickupTotal + dropoffTotal;

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
      
      if ((paymentStatus === 'paid' || paymentStatus === 'partial') && paidAmountNum > 0) {
        // Get all billing IDs for this group
        const [allBillings] = await connection.promise().query(
          'SELECT IDNo, BOOKING_ID, ROOM_CHARGE, QTY, PAYMENT_STATUS FROM billing WHERE BOOKING_ID IN (?)',
          [allBookingIds.length > 0 ? allBookingIds : targetBookingIds]
        );

        // Get all service IDs for this group  
        const [allServices] = await connection.promise().query(
          'SELECT IDNo, BOOKING_ID, TOTAL_COST, STATUS FROM booking_service WHERE BOOKING_ID IN (?)',
          [allBookingIds.length > 0 ? allBookingIds : targetBookingIds]
        );

        let remainingPayment = paidAmountNum;

        // Priority 1: Pay room charges first (apply discount to rooms)
        const totalBillingAmount = allBillings.reduce((sum, b) => sum + (b.ROOM_CHARGE * b.QTY), 0);
        const discountTotal = parseFloat(discount) || 0;
        // Budget for room after discount
        const roomTargetBudget = Math.max(totalBillingAmount - discountTotal, 0);

        if (remainingPayment > 0 && totalBillingAmount > 0 && roomTargetBudget > 0) {
          // Pay rooms proportionally up to the discounted cap
          for (const billing of allBillings) {
            if (remainingPayment <= 0) break;

            const billingAmount = billing.ROOM_CHARGE * billing.QTY;
            const proportion = billingAmount / totalBillingAmount;
            // Discount share for this billing
            const billingDiscount = discountTotal * proportion;
            // Max we intend to pay for this billing (cap after discount)
            const billingPayCap = Math.max(billingAmount - billingDiscount, 0);
            // Budget share for this billing from remaining room budget
            const billingBudgetShare = Math.min(remainingPayment, roomTargetBudget) * proportion;
            const roomPaymentAmount = Math.min(billingBudgetShare, billingPayCap);

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
              
              // Update billing payment status
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
        
        // Priority 2: Pay services with remaining payment
        if (remainingPayment > 0 && allServices.length > 0) {
          for (const service of allServices) {
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
                'UPDATE booking_service SET STATUS = ? WHERE IDNo = ?',
                [newStatus, service.IDNo]
              );
              
              remainingPayment -= servicePaymentAmount;
            }
          }
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
      throw err;
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
          b.CHECK_IN_DATE AS dateFrom,
          b.CHECK_OUT_DATE AS dateTo,
          b.REMARKS AS remarks,
          b.CHECK_IN_STATUS AS checkInStatus,
          b.LATE_CHECKOUT AS checkOutStatus,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
            + COALESCE(services_total.TOTAL_SERVICES_COST, 0)
            + COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0) AS total,
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
      const sql = `UPDATE complaint_request SET STATUS = ?, EDITDED_BY = ?, EDITDED_DT = CURRENT_TIMESTAMP WHERE IDNo = ? AND ACTIVE = 1`;
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
}

module.exports = BookingModel;


