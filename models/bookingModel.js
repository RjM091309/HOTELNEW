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
          COALESCE(bill.PAYMENT_STATUS, 'Not Paid') AS PAYMENT_STATUS
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
          bs.*,
          s.SERVICE_NAME,
          s.SERVICE_COST
        FROM booking_services bs
          LEFT JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
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
      dropoffPrice
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

        let customerId = guestID;

        // If no guestID, create new customer
        if (!customerId) {
          const customerQuery = `
            INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ADDRESS, ENCODED_BY, ENCODED_DT, ACTIVE) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `;
          const customerValues = [fullname, number, guestType, guestLevel, address, encodedBy, date];
          
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
          (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, REMARKS, CONFIRMATION_NUMBER, NOTIFICATION_READ, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, AGENCY_ID) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `;
        const bookingValues = [
          customerId, room_id, checkInDate, checkOutDate, 'pending', finalBookingRoute,
          maxOccupants, bookingRemarks, confirmationNumber, encodedBy, date, 1, checkInStatus, 
          finalBookingRoute === 'agency' ? agencyID : null 
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
          (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const billingValues = [
          bookingId, numericRoomPrice, 0.00, 0.00, 0.00, diffindays, paymentStatus, 'cash', '', encodedBy, date, 1
        ];

        await new Promise((resolve, reject) => {
          connection.query(billingQuery, billingValues, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // console.log('Billing inserted successfully');

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
          confirmationNumber,
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
          // Check if service already exists for this booking
          const checkQuery = `
            SELECT bs.IDNo, bs.QTY, bs.STATUS, s.SERVICE_COST 
            FROM booking_service bs
            INNER JOIN services s ON bs.SERVICE_ID = s.IDNo
            WHERE bs.BOOKING_ID = ? AND bs.SERVICE_ID = ?
            ORDER BY bs.IDNo DESC
            LIMIT 1
          `;

          const checkResults = await new Promise((resolve, reject) => {
            connection.query(checkQuery, [bookingId, service.SERVICE_ID], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });

          const hasUnpaid = checkResults.length > 0 && checkResults[0].STATUS !== 'paid';
          const serviceCost = checkResults.length > 0 ? parseFloat(checkResults[0].SERVICE_COST) : 0;

          if (hasUnpaid) {
            // Update if existing record is unpaid
            const updateQuery = `
              UPDATE booking_service 
              SET QTY = ?, 
                  TOTAL_COST = ? * ?, 
                  EDITED_BY = ?, 
                  EDITED_DT = NOW(),
                  ACTIVE = 1
              WHERE BOOKING_ID = ? AND SERVICE_ID = ? AND STATUS != 'paid'
            `;

            await new Promise((resolve, reject) => {
              connection.query(
                updateQuery,
                [service.QUANTITY, service.QUANTITY, serviceCost, userId, bookingId, service.SERVICE_ID],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            totalCost += service.QUANTITY * serviceCost;
          } else {
            // Insert new row if no unpaid or already paid
            const fetchCostQuery = `SELECT SERVICE_COST FROM services WHERE IDNo = ?`;
            const costResult = await new Promise((resolve, reject) => {
              connection.query(fetchCostQuery, [service.SERVICE_ID], (err, results) => {
                if (err) reject(err);
                else resolve(results);
              });
            });

            const cost = costResult[0]?.SERVICE_COST || 0;

            const insertQuery = `
              INSERT INTO booking_service 
                (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT)
              VALUES (?, ?, ?, ?, 'unpaid', ?, ?)
            `;

            await new Promise((resolve, reject) => {
              connection.query(
                insertQuery,
                [bookingId, service.SERVICE_ID, service.QUANTITY, service.QUANTITY * cost, userId, date],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            totalCost += service.QUANTITY * cost;
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
          ) AS total_unpaid_balance
      `;
      
      // Ensure param count matches query (8 parameters)
      const results = await queryDatabasePromise(query, [
        bookingId, bookingId, bookingId, bookingId, 
        bookingId, bookingId, bookingId, bookingId
      ]);

      const balanceData = results.length > 0 ? results[0] : {
        room_charge_unpaid: 0,
        extension_charge_unpaid: 0,
        service_unpaid: 0,
        transport_unpaid: 0,
        total_unpaid_balance: 0
      };

      return balanceData;
    } catch (error) {
      console.error('Error in getUnpaidBalance:', error);
      throw error;
    }
  }

  // Get booking services (including extensions and transport)
  static async getBookingServices(bookingId) {
    try {
      // Get regular services
      const serviceQuery = `
        SELECT bs.SERVICE_ID, s.SERVICE_NAME, bs.QTY, bs.TOTAL_COST, bs.STATUS
        FROM booking_service bs
        JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1
      `;
      const serviceRows = await queryDatabasePromise(serviceQuery, [bookingId]);

      // Get extensions
      const extensionQuery = `
        SELECT IDNo AS SERVICE_ID, EXTEND_DATE, QTY, COST, PAYMENT_STATUS
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
        STATUS: ext.PAYMENT_STATUS
      }));

      // Get transport services
      const transportQuery = `
        SELECT pd.IDNo, pd.PICKDROP_ID, pd.TYPE, pd.RATE, pd.STATUS, r.NAME AS LOCATION_NAME
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
        STATUS: row.STATUS
      }));

      // Combine all services
      const allServices = [...serviceRows, ...formattedExtensions, ...formattedTransport];

      return allServices;
    } catch (error) {
      console.error('Error in getBookingServices:', error);
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
        subTotal: subTotal
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

      const query = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW, (
            SELECT 1 
            FROM booking b2 
            WHERE b2.ROOM_ID = r.IDNo 
              AND DATE(b2.CHECK_OUT_DATE) = ? 
            LIMIT 1
          ) AS checkoutToday
        FROM room r
        LEFT JOIN booking b ON r.IDNo = b.ROOM_ID
            AND DATE(b.CHECK_IN_DATE) < ?
            AND DATE(b.CHECK_OUT_DATE) > ?
        WHERE r.ROOM_STATUS NOT IN (3, 4)
          AND (b.ROOM_ID IS NULL OR DATE(b.CHECK_OUT_DATE) = ?)
        ORDER BY r.ROOM_NUMBER ASC
      `;

      const results = await queryDatabasePromise(query, [
        startDateFormatted, 
        endDateFormatted, 
        startDateFormatted, 
        startDateFormatted
      ]);

      return results;

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

  // Find consecutive rooms
  static async findConsecutiveRooms(params) {
    let { startDate, endDate, neededRooms, floorNumber } = params;

    try {
      // Convert dates to YYYY-MM-DD using moment.js logic
      const moment = require('moment');
      startDate = moment(startDate, 'MMM DD, YYYY').format('YYYY-MM-DD');
      endDate = moment(endDate, 'MMM DD, YYYY').format('YYYY-MM-DD');

      // Get available rooms for the selected date range
      let query = `
        SELECT r.IDNo, r.ROOM_NUMBER, r.ROOM_FLOOR, r.ROOM_BED, r.ROOM_VIEW,
               COALESCE(r.ROOM_PRICE, rt.BASE_PRICE) AS FINAL_PRICE,
               r.ROOM_TYPE_ID
        FROM room r
        JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ROOM_STATUS != 3
        AND NOT EXISTS (
          SELECT 1 FROM booking b
          WHERE b.ROOM_ID = r.IDNo
            AND b.ACTIVE = 1
            AND ((DATE(b.CHECK_IN_DATE) < ? AND DATE(b.CHECK_OUT_DATE) > ?))
        )
        ${floorNumber ? "AND r.ROOM_FLOOR = ?" : ""}
        ORDER BY r.ROOM_NUMBER ASC
      `;

      let queryParams = [endDate, startDate];
      if (floorNumber) queryParams.push(floorNumber);

      const rooms = await queryDatabasePromise(query, queryParams);

      // For each room, get its seasonal prices
      const roomIds = rooms.map(r => r.IDNo);
      let seasonalPricesMap = {};

      if (roomIds.length > 0) {
        const seasonalQuery = `
          SELECT 
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
          ORDER BY rsp.ROOM_ID, rsp.SEASON_ID, rsp.BOOKING_TYPE, rsp.ROOM_BED
        `;

        const seasonalRows = await queryDatabasePromise(seasonalQuery, [roomIds]);

        // Group by room
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

      // Attach SEASONAL_PRICES to each room
      rooms.forEach(room => {
        room.SEASONAL_PRICES = seasonalPricesMap[room.IDNo] || [];
      });

      // Sort available rooms by ROOM_NUMBER (assuming numeric room numbers)
      rooms.sort((a, b) => parseInt(a.ROOM_NUMBER) - parseInt(b.ROOM_NUMBER));

      // Try to find consecutive blocks
      let consecutiveBlocks = [];
      for (let i = 0; i <= rooms.length - neededRooms; i++) {
        let block = rooms.slice(i, i + parseInt(neededRooms));
        let consecutive = true;
        for (let j = 1; j < block.length; j++) {
          if (parseInt(block[j].ROOM_NUMBER) !== parseInt(block[j - 1].ROOM_NUMBER) + 1) {
            consecutive = false;
            break;
          }
        }
        if (consecutive) {
          consecutiveBlocks.push(block);
        }
      }

      if (consecutiveBlocks.length > 0) {
        return { 
          success: true, 
          data: consecutiveBlocks, 
          priority: 'consecutive' 
        };
      } else {
        // If no consecutive block found, return available rooms (non-consecutive)
        return { 
          success: true, 
          data: rooms, 
          priority: 'available' 
        };
      }

    } catch (error) {
      console.error('Error in findConsecutiveRooms:', error);
      throw error;
    }
  }

  // Add group booking
  static async addGroupBooking(params) {
    const {
      selectedRooms, selectedRoomPrice, qty, daterange, groupName, groupContact, numberOfRooms, paymentStatus, bookingRoute, guestType, guestLevel, checkInStatus,
      breakfastAdultQty, breakfastAdultPrice, breakfastAdultId, breakfastKidQty, breakfastKidPrice, breakfastKidId, pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice, encodedBy
    } = params;

    try {
      const date = new Date();
      const confirmationNumber = 'CONF-' + Math.random().toString(36).substr(2, 9).toUpperCase();

      // Split daterange and add default times
      const [checkInDate, checkOutDate] = daterange.split(' to ').map((dateStr, index) => {
        const cleanDateStr = dateStr.split(' (')[0];
        const time = index === 0 ? '14:00:00' : '11:00:00';
        const moment = require('moment');
        return moment(cleanDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' ' + time;
      });

      // console.log('📌 Check-in:', checkInDate, 'Check-out:', checkOutDate);

      // Get connection for transaction
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

        // Insert into `group_booking`
        const groupBookingQuery = `
          INSERT INTO group_booking (GROUP_NAME, CONTACT_NO, NUMBER_OF_ROOMS, ENCODED_BY)
          VALUES (?, ?, ?, ?)
        `;
        const groupBookingValues = [groupName, groupContact, numberOfRooms, encodedBy];

        const groupResult = await new Promise((resolve, reject) => {
          connection.query(groupBookingQuery, groupBookingValues, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        const groupBookingId = groupResult.insertId;
        // console.log('✅ Group Booking ID:', groupBookingId);

        // Process each room in the selectedRooms list
        const roomIds = selectedRooms.split(',');
        const roomPrices = selectedRoomPrice.split(',').map(price => parseFloat(price));

        let firstBookingId = null;
        let firstBillingId = null;

        // Process rooms sequentially
        for (let index = 0; index < roomIds.length; index++) {
          const roomId = roomIds[index];
          const guestFullName = `${groupName}-${index + 1}`;
          const totalRoomCharge = roomPrices[index];

          // Insert into `customer`
          const customerQuery = `
            INSERT INTO customer (NAME, CONTACTNo, TYPE, LEVEL, ADDRESS, MESSAGE, ENCODED_BY, ENCODED_DT, ACTIVE, IS_GROUP)
            VALUES (?, ?, ?, ?, '', '', ?, ?, 1, 1)
          `;
          const customerValues = [guestFullName, groupContact, guestType, guestLevel, encodedBy, date];

          const custResult = await new Promise((resolve, reject) => {
            connection.query(customerQuery, customerValues, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          const guestID = custResult.insertId;
          // console.log(`✅ Customer ${guestFullName} ID:`, guestID);

          // Insert into `booking`
          const bookingQuery = `
            INSERT INTO booking (CUSTOMER_ID, ROOM_ID, CHECK_IN_DATE, CHECK_OUT_DATE, BOOKING_STATUS, BOOKING_CHANNEL, GUESTS_COUNT, REMARKS, CONFIRMATION_NUMBER, NOTIFICATION_READ, ENCODED_BY, ENCODED_DT, ACTIVE, CHECK_IN_STATUS, GROUP_BOOKING_ID)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
          `;
          const bookingValues = [
            guestID, roomId, checkInDate, checkOutDate, 'pending', bookingRoute, 1, '',
            confirmationNumber, encodedBy, date, 1, checkInStatus, groupBookingId
          ];

          const bookResult = await new Promise((resolve, reject) => {
            connection.query(bookingQuery, bookingValues, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          const bookingId = bookResult.insertId;
          if (index === 0) firstBookingId = bookingId;
          // console.log(`✅ Booking ID for ${guestFullName}:`, bookingId);

          // Insert into `billing`
          const billingQuery = `
            INSERT INTO billing (BOOKING_ID, ROOM_CHARGE, AMENITIES_CHARGE, SERVICES_CHARGE, LATE_CHECKOUT_CHARGE, QTY, PAYMENT_STATUS, PAYMENT_METHOD, REMARKS, ENCODED_BY, ENCODED_DT, ACTIVE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const billingValues = [
            bookingId, totalRoomCharge, 0.00, 0.00, 0.00, qty, paymentStatus, 'cash', '', encodedBy, date, 1
          ];

          const billResult = await new Promise((resolve, reject) => {
            connection.query(billingQuery, billingValues, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });

          if (index === 0) firstBillingId = billResult.insertId || bookingId;
          // console.log(`✅ Billing added for Booking ID: ${bookingId} with Room Charge: ₱${totalRoomCharge}`);

          // Insert into payments if status is paid (room charge)
          if (paymentStatus === 'paid') {
            const amountPaid = totalRoomCharge * qty;
            const paymentQuery = `
              INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY)
              VALUES (?, ?, ?, ?, 'room', NOW(), ?)
            `;
            await new Promise((resolve, reject) => {
              connection.query(paymentQuery, [bookingId, billResult.insertId || bookingId, amountPaid, 'cash', encodedBy], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
          }
        }

        // Insert group-level services using firstBookingId
        if (firstBookingId) {
          const groupServices = [];
          
          // Breakfast Adult
          if (parseInt(breakfastAdultQty) > 0 && breakfastAdultId) {
            const totalAdult = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice);
            groupServices.push([
              firstBookingId,
              breakfastAdultId,
              breakfastAdultQty,
              totalAdult,
              paymentStatus === 'paid' ? 'paid' : 'unpaid',
              encodedBy,
              date,
              1
            ]);
          }
          
          // Breakfast Kid
          if (parseInt(breakfastKidQty) > 0 && breakfastKidId) {
            const totalKid = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice);
            groupServices.push([
              firstBookingId,
              breakfastKidId,
              breakfastKidQty,
              totalKid,
              paymentStatus === 'paid' ? 'paid' : 'unpaid',
              encodedBy,
              date,
              1
            ]);
          }
          
          // Pickup
          if (pickupServiceId && pickupPrice) {
            groupServices.push([
              firstBookingId,
              pickupServiceId,
              1,
              pickupPrice,
              paymentStatus === 'paid' ? 'paid' : 'unpaid',
              encodedBy,
              date,
              1
            ]);
          }
          
          // Dropoff
          if (dropoffServiceId && dropoffPrice) {
            groupServices.push([
              firstBookingId,
              dropoffServiceId,
              1,
              dropoffPrice,
              paymentStatus === 'paid' ? 'paid' : 'unpaid',
              encodedBy,
              date,
              1
            ]);
          }

          if (groupServices.length > 0) {
            const serviceQuery = `
              INSERT INTO booking_service 
              (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE)
              VALUES ?
            `;
            await new Promise((resolve, reject) => {
              connection.query(serviceQuery, [groupServices], (err) => {
                if (err) reject(err);
                else resolve();
              });
            });

            // Insert payments for services if paid
            if (paymentStatus === 'paid') {
              const servicePayments = groupServices.map(s => [
                firstBookingId,
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
        }

        // Commit transaction
        await new Promise((resolve, reject) => {
          connection.commit(err => {
            if (err) reject(err);
            else resolve();
          });
        });

        connection.release();

        return {
          success: true,
          confirmationNumber
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
      console.error('Error in addGroupBooking:', error);
      throw error;
    }
  }

  // Get group booking data
  static async getGroupBookingData(filter) {
    try {
      // Build a date condition based on the filter
      let dateCondition = '';
      switch(filter.toLowerCase()) {
        case 'today':
          dateCondition = "AND DATE(b.ENCODED_DT) = CURRENT_DATE()";
          break;
        case 'last3days':
          dateCondition = "AND b.ENCODED_DT >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY) AND b.ENCODED_DT <= CURRENT_DATE()";
          break;
        case 'thisweek':
          dateCondition = "AND YEARWEEK(b.ENCODED_DT, 1) = YEARWEEK(CURRENT_DATE(), 1)";
          break;
        case 'thismonth':
          dateCondition = "AND MONTH(b.ENCODED_DT) = MONTH(CURRENT_DATE()) AND YEAR(b.ENCODED_DT) = YEAR(CURRENT_DATE())";
          break;
        default:
          dateCondition = "";
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
            WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1)) AS GRAND_TOTAL,

          (((COALESCE(bill.ORIGINAL_QTY, bill.QTY) * bill.ROOM_CHARGE) +
            COALESCE((SELECT SUM(COST * QTY) FROM booking_extension WHERE BOOKING_ID = b.IDNo), 0) +
            (SELECT COALESCE(SUM(bs.TOTAL_COST), 0)
             FROM booking_service bs
             WHERE bs.BOOKING_ID = b.IDNo AND bs.ACTIVE = 1)) -
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
        GROUP BY b.IDNo
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

      return { pdfBuffer };

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
}

module.exports = BookingModel;
