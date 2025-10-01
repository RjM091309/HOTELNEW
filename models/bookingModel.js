const { queryDatabasePromise, pool } = require('../config/database');

class BookingModel {
  // Get booking data for DataTables
  static async getBookingData(params) {
    try {
      const {
        start,
        length,
        likeTerm,
        exactId,
        orderByColumn,
        orderDirection,
        dateCondition
      } = params;

      // ---- COUNT QUERY ----
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN room     r ON b.ROOM_ID      = r.IDNo
          LEFT JOIN billing  bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1
          ${dateCondition}
          AND (
            b.CUSTOMER_ID       LIKE ? OR
            c.NAME               LIKE ? OR
            r.ROOM_NUMBER        LIKE ? OR
            b.CONFIRMATION_NUMBER LIKE ? OR
            b.BOOKING_CHANNEL    LIKE ? OR
            bill.PAYMENT_STATUS  LIKE ? OR
            b.BOOKING_STATUS     LIKE ? OR
            b.IDNo               = ?      /* <-- exact-ID match */
          );
      `;

      // ---- MAIN DATA QUERY ----
      const dataQuery = `
        SELECT 
          b.IDNo           AS BookingID,
          b.CUSTOMER_ID,
          c.NAME,
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
          bill.QTY,
          b.IS_CANCELLED,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
            + COALESCE(bill.AMENITIES_CHARGE,  0)
            + COALESCE(bill.SERVICES_CHARGE,   0) AS TOTAL_COST,
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PAYMENT_STATUS,
          (SELECT COUNT(*) FROM remarks rm WHERE rm.BOOKING_ID = b.IDNo AND rm.ACTIVE = 1) AS RemarksCount
        FROM booking b
          LEFT JOIN customer   c   ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN billing    bill ON b.IDNo       = bill.BOOKING_ID
          LEFT JOIN room       r   ON b.ROOM_ID     = r.IDNo
          LEFT JOIN room_type  rt  ON r.ROOM_TYPE_ID= rt.IDNo
        WHERE b.ACTIVE = 1
          ${dateCondition}
          AND (
            b.CUSTOMER_ID       LIKE ? OR
            c.NAME               LIKE ? OR
            r.ROOM_NUMBER        LIKE ? OR
            b.CONFIRMATION_NUMBER LIKE ? OR
            b.BOOKING_CHANNEL    LIKE ? OR
            bill.PAYMENT_STATUS  LIKE ? OR
            b.BOOKING_STATUS     LIKE ? OR
            b.IDNo               = ?      /* <-- exact-ID match */
          )
        ORDER BY ${orderByColumn} ${orderDirection}
        LIMIT ?, ?;
      `;

      // First get the total count
      const countParams = [
        likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, exactId
      ];
      const countResults = await queryDatabasePromise(countQuery, countParams);
      const totalRecords = countResults[0]?.total || 0;

      // Now fetch the page of data
      const dataParams = [
        likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm,
        exactId,
        start, length
      ];
      const rows = await queryDatabasePromise(dataQuery, dataParams);

      return {
        totalRecords,
        rows
      };

    } catch (error) {
      console.error('Error in getBookingData:', error);
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
      console.log('Booking services query results:', results);
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
          bill.ROOM_CHARGE AS ROOM_RATE,

          -- Fallback to QTY if ORIGINAL_QTY is NULL
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS ORIGINAL_DAYS,

          -- Extended days from booking_extension
          COALESCE((
              SELECT SUM(QTY) 
              FROM booking_extension 
              WHERE BOOKING_ID = b.IDNo
          ), 0) AS EXTENDED_DAYS,

          -- Total days = original + extended
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS TOTAL_DAYS,

          -- Total room cost = base + extended
          (COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) +
          COALESCE((
              SELECT SUM(COST * QTY) 
              FROM booking_extension 
              WHERE BOOKING_ID = b.IDNo
          ), 0) AS TOTAL_ROOM_COST,

          (COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) AS ROOM_COST,

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
                      SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo
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
                console.log('✅ Reservation fee and discount payments inserted successfully');
                resolve();
              }
            });
          });
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
              'service',        // PAYMENT_TYPE
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
          await new Promise((resolve, reject) => {
            connection.query(lateCheckoutQuery, [bookingId, lateCheckoutFee, status, encodedBy], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          console.log(`🔄 Late Check-Out Fee Applied: ₱${lateCheckoutFee} (Status: ${status})`);
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
                console.log('✅ Booking remarks inserted successfully');
                resolve(results);
              }
            });
          });
        }

        // If paymentStatus is 'paid', insert into payments table
        if (paymentStatus === 'paid') {
          const getBillingIdQuery = `SELECT IDNo, ROOM_CHARGE, QTY FROM billing WHERE BOOKING_ID = ? LIMIT 1`;
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
          const amountPaid = billing.ROOM_CHARGE * billing.QTY;

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
          -- Unpaid Room Charge (original stay)
          COALESCE((
              SELECT 
                  CASE 
                      WHEN b.PAYMENT_STATUS = 'unpaid' THEN b.ROOM_CHARGE * COALESCE(b.ORIGINAL_QTY, b.QTY)
                      ELSE 0
                  END
              FROM billing b
              WHERE b.BOOKING_ID = ?
          ), 0) AS room_charge_unpaid,

          -- Unpaid Extension Charges
          COALESCE((
              SELECT SUM(be.COST * be.QTY)
              FROM booking_extension be
              WHERE be.BOOKING_ID = ? AND be.PAYMENT_STATUS = 'unpaid'
          ), 0) AS extension_charge_unpaid,

          -- Unpaid Service Charges
          COALESCE((
              SELECT SUM(bs.TOTAL_COST)
              FROM booking_service bs
              WHERE bs.BOOKING_ID = ? AND bs.STATUS = 'unpaid' AND bs.ACTIVE = 1
          ), 0) AS service_unpaid,

          -- Unpaid Transport Charges
          COALESCE((
              SELECT SUM(pd.RATE)
              FROM booking_pick_drop pd
              WHERE pd.BOOKING_ID = ? AND pd.STATUS = 'unpaid' AND pd.ACTIVE = 1
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

          -- Total Outstanding Balance
          (
              COALESCE((
                  SELECT 
                      CASE 
                          WHEN b.PAYMENT_STATUS = 'unpaid' THEN b.ROOM_CHARGE * COALESCE(b.ORIGINAL_QTY, b.QTY)
                          ELSE 0
                      END
                  FROM billing b
                  WHERE b.BOOKING_ID = ?
              ), 0)
              +
              COALESCE((
                  SELECT SUM(be.COST * be.QTY)
                  FROM booking_extension be
                  WHERE be.BOOKING_ID = ? AND be.PAYMENT_STATUS = 'unpaid'
              ), 0)
              +
              COALESCE((
                  SELECT SUM(bs.TOTAL_COST)
                  FROM booking_service bs
                  WHERE bs.BOOKING_ID = ? AND bs.STATUS = 'unpaid' AND bs.ACTIVE = 1
              ), 0)
              +
              COALESCE((
                  SELECT SUM(pd.RATE)
                  FROM booking_pick_drop pd
                  WHERE pd.BOOKING_ID = ? AND pd.STATUS = 'unpaid' AND pd.ACTIVE = 1
              ), 0)
          ) AS total_unpaid_balance,
          COALESCE((
            SELECT b.REMARKS FROM billing b WHERE b.BOOKING_ID = ?
          ), '') AS discount_remarks
      `;
      
      // Ensure param count matches query (13 parameters)
      const results = await queryDatabasePromise(query, [
        bookingId, bookingId, bookingId, bookingId, 
        bookingId, bookingId, bookingId, bookingId,
        bookingId, /* discount_amount */ 
        bookingId, /* discount_applied */
        bookingId, bookingId, bookingId, bookingId,
        bookingId
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
          
          console.log('✅ Discount remarks merged successfully');
        } else {
          // Insert new discount remark
          await queryDatabasePromise(
            `INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, EDITDED_BY) 
             VALUES (?, 'Discount', ?, ?, ?)`,
            [bookingId, remarks.trim(), editedBy, editedBy]
          );
          
          console.log('✅ Discount remarks inserted successfully');
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
        WHERE BOOKING_ID = ?
      `;
      const extensionRows = await queryDatabasePromise(extensionQuery, [bookingId]);

      // Format extensions
      const formattedExtensions = extensionRows.map(ext => ({
        SERVICE_ID: -999, // extended stay
        SERVICE_NAME: 'Extended Stay',
        QTY: ext.QTY,
        TOTAL_COST: ext.COST * ext.QTY,
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
    const { bookingId, serviceId, isExtension, isTransport } = params;

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
          // Handle booking_extension deletion
          const query = `
            DELETE FROM booking_extension
            WHERE BOOKING_ID = ? AND PAYMENT_STATUS = 'unpaid'
            ORDER BY IDNo DESC
            LIMIT 1
          `;

          const result = await new Promise((resolve, reject) => {
            connection.query(query, [bookingId], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (result.affectedRows === 0) {
            throw new Error('No unpaid extension found to remove.');
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
            message: 'Extension removed successfully!',
            totalCost: 0
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

          const updateActiveQuery = `
            UPDATE booking_service
            SET ACTIVE = 0
            WHERE BOOKING_ID = ? AND SERVICE_ID = ?
          `;

          await new Promise((resolve, reject) => {
            connection.query(updateActiveQuery, [bookingId, serviceId], (err) => {
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
          bi.ORIGINAL_QTY,
          bi.PAYMENT_STATUS,
          bi.RESERVATION_FEE,
          bi.DISCOUNT_AMOUNT,
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
      const originalQty = parseInt(b.ORIGINAL_QTY) || parseInt(b.QTY);

      // Base room billing
      const roomItems = [{
        date: b.CHECK_IN_DATE,
        description: `${b.ROOM_TYPE}`,
        basePrice: roomRate,
        qty: originalQty,
        subTotal: roomRate * originalQty,
        status: b.PAYMENT_STATUS
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
        WHERE BOOKING_ID = ?
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
    const { paymentMethod, bookingId, encodedBy } = params;

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
          SELECT IDNo, ROOM_CHARGE, QTY, ORIGINAL_QTY, PAYMENT_STATUS, EXTEND_PAYMENT_STATUS 
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

        // Step 2: Determine what to pay
        const originalQty = billing.ORIGINAL_QTY ?? billing.QTY;
        const extendedQty = billing.QTY - originalQty;

        // Process room payment if unpaid
        if (billing.PAYMENT_STATUS !== 'paid' && originalQty > 0) {
          const roomAmount = billing.ROOM_CHARGE * originalQty;

          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES (?, ?, ?, ?, 'room', NOW(), ?)`,
              [bookingId, billingId, roomAmount, paymentMethod, encodedBy],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE billing SET PAYMENT_STATUS = 'paid', PAYMENT_METHOD = ? WHERE IDNo = ?`,
              [paymentMethod, billingId],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Step 3: Pay all unpaid extensions from booking_extension
        const extensionQuery = `
          SELECT IDNo, QTY, COST FROM booking_extension 
          WHERE BOOKING_ID = ? AND PAYMENT_STATUS = 'unpaid'
        `;
        const extensionRows = await new Promise((resolve, reject) => {
          connection.query(extensionQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        for (let ext of extensionRows) {
          const amountToPay = ext.QTY * ext.COST;

          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (
                BOOKING_ID, BOOKING_EXTENSION_ID, AMOUNT_PAID, PAYMENT_METHOD,
                PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY
              )
              VALUES (?, ?, ?, ?, 'extended', NOW(), ?)`,
              [bookingId, ext.IDNo, amountToPay, paymentMethod, encodedBy],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_extension SET PAYMENT_STATUS = 'paid' WHERE IDNo = ?`,
              [ext.IDNo],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        }

        // Step 4: Get unpaid services
        const serviceQuery = `
          SELECT IDNo, TOTAL_COST FROM booking_service 
          WHERE BOOKING_ID = ? AND STATUS != 'paid'
        `;
        const serviceRows = await new Promise((resolve, reject) => {
          connection.query(serviceQuery, [bookingId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        // Step 5: Process each unpaid service
        for (let service of serviceRows) {
          await new Promise((resolve, reject) => {
            connection.query(
              `INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY) 
              VALUES (?, ?, ?, ?, 'service', NOW(), ?)`,
              [bookingId, service.IDNo, service.TOTAL_COST, paymentMethod, encodedBy],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });

          await new Promise((resolve, reject) => {
            connection.query(
              `UPDATE booking_service SET STATUS = 'paid' WHERE IDNo = ?`,
              [service.IDNo],
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
                PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY
              ) VALUES (?, ?, ?, ?, 'pickdrop', NOW(), ?)`,
              [bookingId, pd.IDNo, pd.RATE, paymentMethod, encodedBy],
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
  static async getGroupBookingData(filter) {
    try {
      let dateCondition = '';
      
      if (filter === 'today') {
        dateCondition = 'AND DATE(b.CHECK_IN_DATE) = CURDATE()';
      } else if (filter === 'last3days') {
        dateCondition = 'AND DATE(b.CHECK_IN_DATE) >= DATE_SUB(CURDATE(), INTERVAL 3 DAY)';
      } else if (filter === 'thisweek') {
        dateCondition = 'AND YEARWEEK(b.CHECK_IN_DATE) = YEARWEEK(CURDATE())';
      } else if (filter === 'thismonth') {
        dateCondition = 'AND YEAR(b.CHECK_IN_DATE) = YEAR(CURDATE()) AND MONTH(b.CHECK_IN_DATE) = MONTH(CURDATE())';
      }

      const query = `
        SELECT 
          gb.IDNo AS group_id,
          gb.GROUP_NAME,
          gb.CONTACT_NO,
          gb.NUMBER_OF_ROOMS,
          b.BOOKING_CHANNEL,
          GROUP_CONCAT(r.ROOM_NUMBER ORDER BY r.ROOM_NUMBER SEPARATOR ', ') AS room_numbers,
          COUNT(b.IDNo) AS total_bookings,
          -- Calculate total payment excluding extended days
          COALESCE(SUM(
            (bill.ROOM_CHARGE * 
              CASE 
                WHEN bill.ORIGINAL_QTY IS NOT NULL THEN bill.ORIGINAL_QTY  -- Use original stay duration
                ELSE bill.QTY  -- If no extension, use QTY normally
              END
            ) + bill.AMENITIES_CHARGE + bill.SERVICES_CHARGE
          ), 0) AS TOTAL_PAYMENT,
          -- Get all statuses in a group
          GROUP_CONCAT(DISTINCT b.BOOKING_STATUS ORDER BY b.BOOKING_STATUS SEPARATOR ', ') AS all_statuses,
          -- Status Overview Logic
          CASE 
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
          END AS STATUS_OVERVIEW
        FROM booking b
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        WHERE b.GROUP_BOOKING_ID IS NOT NULL
          ${dateCondition}
        GROUP BY gb.IDNo
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
        JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON b.IDNo = bill.BOOKING_ID
        LEFT JOIN booking_service bs ON b.IDNo = bs.BOOKING_ID
        LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo -- Fetch the correct service name
        WHERE b.GROUP_BOOKING_ID = ?
        GROUP BY b.IDNo, r.ROOM_NUMBER, b.CHECK_IN_DATE, b.CHECK_OUT_DATE, b.BOOKING_STATUS
      `;

      const results = await queryDatabasePromise(bookingQuery, [groupId]);

      return results;

    } catch (error) {
      console.error('Error in getGroupBookingDetails:', error);
      throw error;
    }
  }

  // Get group billing details
  static async getGroupBillingDetails(groupId) {
    try {
      // Query for Room Charges ONLY (prevents duplication)
      const roomBillingQuery = `
        SELECT 
          b.IDNo AS BOOKING_ID,  
          DATE(bill.ENCODED_DT) AS date,
          gb.GROUP_NAME,  
          r.ROOM_NUMBER,  
          'Room Charge' AS description,
          bill.ROOM_CHARGE AS charges,
          COALESCE(bill.ORIGINAL_QTY, bill.QTY) AS room_qty,
          bill.PAYMENT_STATUS
        FROM billing bill
        JOIN booking b ON bill.BOOKING_ID = b.IDNo
        JOIN group_booking gb ON b.GROUP_BOOKING_ID = gb.IDNo  
        JOIN room r ON b.ROOM_ID = r.IDNo  
        WHERE b.GROUP_BOOKING_ID = ?
        GROUP BY bill.BOOKING_ID, gb.GROUP_NAME, r.ROOM_NUMBER, bill.ROOM_CHARGE, bill.ORIGINAL_QTY, bill.QTY, bill.PAYMENT_STATUS
        ORDER BY r.ROOM_NUMBER ASC, bill.BOOKING_ID ASC
      `;

      // Query for Service Charges ONLY
      const serviceBillingQuery = `
        SELECT 
          b.IDNo AS BOOKING_ID,
          r.ROOM_NUMBER,
          s.SERVICE_NAME AS description,
          s.SERVICE_COST AS charges,
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

      return {
        invoiceNumber,
        GroupName,
        roomBillingDetails: roomResults,  // Room charges
        serviceBillingDetails: serviceResults  // Service charges
      };

    } catch (error) {
      console.error('Error in getGroupBillingDetails:', error);
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
    const { bookingIDs, amountPaid, paymentMethod, encodedBy } = params;
    
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
          SELECT IDNo, BOOKING_ID, ROOM_CHARGE, QTY, ORIGINAL_QTY 
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
          const originalQty = bill.ORIGINAL_QTY ?? bill.QTY;
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
        COALESCE((SELECT SUM(QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) AS EXTENDED_DAYS,
        COALESCE(bill.QTY + EXTENDED_DAYS) AS TOTAL_NIGHTS,

        (COALESCE(bill.QTY) * bill.ROOM_CHARGE) AS ROOM_COST,
        (COALESCE(bill.QTY) * bill.ROOM_CHARGE) +
        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) AS ROOM_TOTAL,

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

        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) AS EXTENDED_TOTAL,

        COALESCE((SELECT SUM(p2.AMOUNT_PAID) FROM payments p2 WHERE p2.BOOKING_EXTENSION_ID IN (
          SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo)), 0) AS EXTENDED_PAID,

        COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) -
        COALESCE((SELECT SUM(p2.AMOUNT_PAID) FROM payments p2 WHERE p2.BOOKING_EXTENSION_ID IN (
          SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo)), 0) AS EXTENDED_UNPAID,

        (COALESCE((SELECT SUM(p.AMOUNT_PAID) 
                   FROM payments p 
                   WHERE p.BILLING_ID = bill.IDNo), 0) +
         COALESCE((SELECT SUM(p2.AMOUNT_PAID) 
                   FROM payments p2 
                   WHERE p2.BOOKING_EXTENSION_ID IN (
                     SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo)), 0)) AS ROOM_PAID,

        ((COALESCE((SELECT SUM(p.AMOUNT_PAID) 
                    FROM payments p 
                    WHERE p.BILLING_ID = bill.IDNo), 0) +
          COALESCE((SELECT SUM(p2.AMOUNT_PAID) 
                    FROM payments p2 
                    WHERE p2.BOOKING_EXTENSION_ID IN (
                      SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo)), 0)) +
         (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
          FROM booking_service bs
          WHERE bs.BOOKING_ID = b.IDNo AND bs.STATUS = 'paid' AND bs.ACTIVE = 1)) AS TOTAL_PAID,

        ((COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) +
         COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) +
         (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
          FROM booking_service bs
          WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1) -
         COALESCE(bill.RESERVATION_FEE, 0) -
         COALESCE(bill.DISCOUNT_AMOUNT, 0)) AS GRAND_TOTAL,

        (((COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) +
          COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) +
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
                       SELECT IDNo FROM booking_extension WHERE BOOKING_ID = b.IDNo)), 0)) +
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
      
      const html = await ejs.renderFile(
        path.join(__dirname, '../views/booking/pdf/booking_voucher.ejs'),
        {
          ...data,
          encodedBy: user.FULLNAME
        }
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
      const imageBase64 = fs.readFileSync(imagePath, 'base64');

      data.imageUrl = `data:image/png;base64,${imageBase64}`;

      // Generate PDF using Playwright
      const { chromium } = require('playwright');
      const ejs = require('ejs');
      
      const html = await ejs.renderFile(
        path.join(__dirname, '../views/booking/pdf/booking_group_voucher.ejs'),
        {
          ...data,
          encodedBy: user.FULLNAME
        }
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
        `SELECT BOOKING_ID, CATEGORY FROM remarks WHERE IDNo = ? AND ACTIVE = 1`,
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

      const formattedBooking = {
        ...booking,
        daterange,
        breakfastAdultPrice: breakfastAdultPrice.toFixed(2),
        breakfastKidPrice: breakfastKidPrice.toFixed(2)
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
        paymentStatus, price, diffindays, guestType, guestLevel,
        bookingRoute, checkInStatus, checkOutStatus, bookingRemarks, agencyID, bedCount,
        breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
        breakfastKidQty, breakfastKidPrice, breakfastKidId,
        pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
        reservationFee, discount, editedBy
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
              SET ROOM_CHARGE = ?, QTY = ?, PAYMENT_STATUS = ?, RESERVATION_FEE = ?, 
                  DISCOUNT_AMOUNT = ?, EDITED_BY = ?, EDITED_DT = ?
              WHERE BOOKING_ID = ?
            `;
            await connection.promise().query(billingUpdateQuery, [
              numericRoomPrice, diffindays, paymentStatus, 
              parseFloat(reservationFee) || 0.00, parseFloat(discount) || 0.00,
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

            // 6. Update payments if status changed to paid
            if (paymentStatus === 'paid') {
              // Delete existing payments for this booking
              await connection.promise().query('DELETE FROM payments WHERE BOOKING_ID = ?', [bookingId]);
              
              // Insert new payment records
              const payments = [];
              
              // Room payment
              const roomAmount = numericRoomPrice * diffindays;
              payments.push([bookingId, null, roomAmount, 'cash', 'room', editDate, editedBy]);
              
              // Service payments
              services.forEach(service => {
                payments.push([bookingId, service[1], service[3], 'cash', 'service', editDate, editedBy]);
              });
              
              // Reservation fee payment
              if (parseFloat(reservationFee) > 0) {
                payments.push([bookingId, null, parseFloat(reservationFee), 'cash', 'reservation_fee', editDate, editedBy]);
              }
              
              // Discount payment (negative amount)
              if (parseFloat(discount) > 0) {
                payments.push([bookingId, null, -parseFloat(discount), 'cash', 'discount', editDate, editedBy]);
              }
              
              if (payments.length > 0) {
                const paymentQuery = `
                  INSERT INTO payments 
                  (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
                  VALUES ?
                `;
                await connection.promise().query(paymentQuery, [payments]);
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
    const { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus } = params;
    
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
      pickupServiceId,
      pickupPrice,
      dropoffServiceId,
      dropoffPrice,
      reservationFee = 0,
      discount = 0,
      perRoomReservationFees = [],
      perRoomDiscounts = [],
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
        INSERT INTO group_booking (GROUP_NAME, CONTACT_NO, NUMBER_OF_ROOMS, ENCODED_BY, GROUP_RESERVATION_FEE, GROUP_DISCOUNT, REMARKS)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const [groupResult] = await connection.promise().query(groupBookingQuery, [
        groupName,
        groupContact,
        numberOfRooms,
        encodedBy,
        parseFloat(reservationFee) || 0,
        parseFloat(discount) || 0,
        remarks || ''
      ]);
      const groupBookingId = groupResult.insertId;

      // Prepare per-room arrays
      const roomBasePrices = (selectedRoomPrice || '').split(',').map(p => parseFloat(p));
      const nightsCount = parseInt(qty, 10) || 1;
      const perRoomFeesArray = Array.isArray(perRoomReservationFees) ? perRoomReservationFees : (typeof perRoomReservationFees === 'string' ? perRoomReservationFees.split(',') : []);
      const perRoomDiscountsArray = Array.isArray(perRoomDiscounts) ? perRoomDiscounts : (typeof perRoomDiscounts === 'string' ? perRoomDiscounts.split(',') : []);

      let firstBookingId = null;
      let totalGroupRoomCharges = 0;

      // Insert each room booking
      for (let index = 0; index < roomIds.length; index++) {
        const roomId = roomIds[index];
        const guestFullName = `${groupName}-${index + 1}`;
        const baseRoomPrice = roomBasePrices[index];
        const totalRoomCharge = baseRoomPrice * nightsCount;
        const perRoomFee = parseFloat(perRoomFeesArray[index]) || 0;
        const perRoomDiscount = parseFloat(perRoomDiscountsArray[index]) || 0;
        const adjustedRoomCharge = Math.max(totalRoomCharge + perRoomFee - perRoomDiscount, 0);
        totalGroupRoomCharges += adjustedRoomCharge;

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
          '',
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

        // billing
        const billingQuery = `
          INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE, RESERVATION_FEE, DISCOUNT_AMOUNT)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const billingValues = [
          bookingId,
          baseRoomPrice,
          0.00,
          0.00,
          0.00,
          qty,
          paymentStatus,
          'cash',
          '',
          encodedBy,
          date,
          1,
          perRoomFee || 0,
          perRoomDiscount || 0
        ];
        const [billResult] = await connection.promise().query(billingQuery, billingValues);

        // payments for room if paid
        if (paymentStatus === 'paid') {
          const amountPaid = adjustedRoomCharge * qty;
          const paymentQuery = `
            INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
            VALUES (?, ?, ?, ?, 'room', NOW(), ?)
          `;
          await connection.promise().query(paymentQuery, [bookingId, billResult.insertId || bookingId, amountPaid, 'cash', encodedBy]);
        }
      }

      // Insert group-level services against firstBookingId
      if (firstBookingId) {
        const groupServices = [];
        // Breakfast Adult
        if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
          const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
          groupServices.push([firstBookingId, breakfastAdultId, breakfastAdultQty, totalAdult, paymentStatus === 'paid' ? 'paid' : 'unpaid', encodedBy, date, 1]);
        }
        // Breakfast Kid
        if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
          const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
          groupServices.push([firstBookingId, breakfastKidId, breakfastKidQty, totalKid, paymentStatus === 'paid' ? 'paid' : 'unpaid', encodedBy, date, 1]);
        }
        // Pickup
        if (pickupServiceId && pickupPrice) {
          groupServices.push([firstBookingId, pickupServiceId, 1, parseFloat(pickupPrice), paymentStatus === 'paid' ? 'paid' : 'unpaid', encodedBy, date, 1]);
        }
        // Dropoff
        if (dropoffServiceId && dropoffPrice) {
          groupServices.push([firstBookingId, dropoffServiceId, 1, parseFloat(dropoffPrice), paymentStatus === 'paid' ? 'paid' : 'unpaid', encodedBy, date, 1]);
        }
        if (groupServices.length > 0) {
          const serviceQuery = `
            INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES ?
          `;
          await connection.promise().query(serviceQuery, [groupServices]);
          if (paymentStatus === 'paid') {
            const servicePayments = groupServices.map(s => [firstBookingId, s[1], parseFloat(s[3]), 'cash', 'service', date, encodedBy]);
            const payQuery = `
              INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES ?
            `;
            await connection.promise().query(payQuery, [servicePayments]);
          }
        }
      }

      // Calculate services total and grand total
      const breakfastAdultTotal = (parseInt(breakfastAdultQty) > 0 && breakfastAdultPrice) ? parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice) : 0;
      const breakfastKidTotal = (parseInt(breakfastKidQty) > 0 && breakfastKidPrice) ? parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice) : 0;
      const pickupTotal = pickupPrice ? parseFloat(pickupPrice) : 0;
      const dropoffTotal = dropoffPrice ? parseFloat(dropoffPrice) : 0;
      const servicesTotal = breakfastAdultTotal + breakfastKidTotal + pickupTotal + dropoffTotal;
      const subtotal = totalGroupRoomCharges + servicesTotal;
      const grandTotal = subtotal + (parseFloat(reservationFee) || 0) - (parseFloat(discount) || 0);

      // Commit
      await new Promise((resolve, reject) => connection.commit(err => (err ? reject(err) : resolve())));
      connection.release();

      return { success: true, message: 'Group Booking added successfully!', confirmationNumber, grandTotal, reservationFee: parseFloat(reservationFee) || 0, discount: parseFloat(discount) || 0 };
    } catch (err) {
      await new Promise(resolve => connection.rollback(() => resolve()));
      connection.release();
      throw err;
    }
  }

  // Get enhanced booking data for DataTables (matching Hotel_Old structure)
  static async getBookingDataEnhanced(params) {
    try {
      const {
        start,
        length,
        orderByColumn,
        orderDirection,
        dateCondition,
        channelCondition
      } = params;

      // ---- COUNT QUERY ----
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM booking b
          LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
          LEFT JOIN room     r ON b.ROOM_ID      = r.IDNo
          LEFT JOIN billing  bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1
          ${dateCondition}
          ${channelCondition};
      `;

      // ---- MAIN DATA QUERY ----
      const dataQuery = `
        SELECT 
          b.IDNo           AS BookingID,
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
          bill.QTY,
          b.IS_CANCELLED,
          COALESCE(bill.ROOM_CHARGE * bill.QTY, 0)
            + COALESCE(services_total.TOTAL_SERVICES_COST, 0)
            + COALESCE(extensions_total.TOTAL_EXTENSIONS_COST, 0) AS TOTAL_COST,
          CASE 
            WHEN bill.PAYMENT_STATUS = 'paid' 
              AND COALESCE(services_unpaid_count.TOTAL_UNPAID_SERVICES, 0) = 0
              AND COALESCE(extensions_unpaid_count.TOTAL_UNPAID_EXTENSIONS, 0) = 0
            THEN 'paid'
            ELSE 'unpaid'
          END AS PAYMENT_STATUS,
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
          END AS BALANCE
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
            WHERE bs.ACTIVE = 1 AND bs.STATUS = 'unpaid'
            GROUP BY bs.BOOKING_ID
          ) services_total ON b.IDNo = services_total.BOOKING_ID
          LEFT JOIN (
            SELECT 
              be.BOOKING_ID,
              SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
            FROM booking_extension be
            WHERE be.PAYMENT_STATUS = 'unpaid'
            GROUP BY be.BOOKING_ID
          ) extensions_total ON b.IDNo = extensions_total.BOOKING_ID
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
            WHERE be.PAYMENT_STATUS = 'unpaid'
            GROUP BY be.BOOKING_ID
          ) extensions_unpaid_count ON b.IDNo = extensions_unpaid_count.BOOKING_ID
        WHERE b.ACTIVE = 1
          ${dateCondition}
          ${channelCondition}
        ORDER BY ${orderByColumn} ${orderDirection};
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
          END AS totalBalance
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
            WHERE bs.ACTIVE = 1 AND bs.STATUS = 'unpaid'
            GROUP BY bs.BOOKING_ID
          ) services_total ON b.IDNo = services_total.BOOKING_ID
          LEFT JOIN (
            SELECT 
              be.BOOKING_ID,
              SUM(be.QTY * be.COST) AS TOTAL_EXTENSIONS_COST
            FROM booking_extension be
            WHERE be.PAYMENT_STATUS = 'unpaid'
            GROUP BY be.BOOKING_ID
          ) extensions_total ON b.IDNo = extensions_total.BOOKING_ID
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `;

      const results = await queryDatabasePromise(query, [bookingId]);
      return results[0] || null;

    } catch (error) {
      console.error('Error in getVoucherData:', error);
      throw error;
    }
  }
}

module.exports = BookingModel;
