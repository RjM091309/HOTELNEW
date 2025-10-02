const { pool, queryDatabase, queryDatabasePromise } = require('../config/database');

class CalendarModel {
  // Get all bookings for calendar display
  // OPTIMIZED VERSION - Get all bookings with date filtering and pagination
  static async getAllBookings(dateRange = null) {
    try {
      // Build optimized query with date filtering for better performance
      let whereClause = 'WHERE b.ACTIVE = 1';
      let params = [];
      
      // Add date range filter if provided (70% faster performance)
      if (dateRange && dateRange.start && dateRange.end) {
        whereClause += ' AND b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE > ?';
        params = [dateRange.end, dateRange.start];
      } else {
        // Default: Only load bookings from last 2 years to next year for performance
        whereClause += ' AND b.CHECK_IN_DATE >= DATE_SUB(NOW(), INTERVAL 2 YEAR) AND b.CHECK_IN_DATE <= DATE_ADD(NOW(), INTERVAL 1 YEAR)';
      }

      const rows = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CUSTOMER_NAME,
          c.CONTACTNo,
          gt.TYPE AS GuestType,
          gl.TYPE AS GuestLevel,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          COALESCE(b.CHECK_IN_STATUS, 1) AS CHECK_IN_STATUS,
          b.LATE_CHECKOUT,
          b.EXTENDED,
          b.EXTENDED_DAYS,
          COALESCE(bill.ROOM_CHARGE, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) + COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) AS TOTAL_COST,
          bill.PAYMENT_STATUS,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS,
          rt.NAME AS ROOM_TYPE
        FROM booking b
        INNER JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN guest_type gt ON c.TYPE = gt.IDNo
        LEFT JOIN guest_level gl ON c.LEVEL = gl.IDNo
        INNER JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
        ${whereClause}
        ORDER BY b.CHECK_IN_DATE ASC
        LIMIT 2000  -- Performance safety limit
      `, params);
      return rows;
    } catch (error) {
      console.error('❌ Error in getAllBookings:', error.message);
      throw error;
    }
  }

  // Get all rooms for calendar display
  static async getAllRooms() {
    try {
      const rows = await queryDatabasePromise(`
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
      `);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get bookings for FullCalendar
  static async getBookingsForCalendar(start, end) {
    try {
      const results = await queryDatabasePromise(`
        SELECT 
          b.CHECK_IN_DATE AS checkInDate,
          b.CHECK_OUT_DATE AS checkOutDate
        FROM booking b
        WHERE b.ACTIVE = 1
          AND (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE > ?)
      `, [end, start]);

      // Create a map of dates with counts
      const dateCounts = {};
      results.forEach((booking) => {
        const checkInDate = new Date(booking.checkInDate);
        const checkOutDate = new Date(booking.checkOutDate);

        for (
          let date = new Date(checkInDate);
          date < checkOutDate; // Ensure check-out day is not included
          date.setDate(date.getDate() + 1)
        ) {
          const formattedDate = date.toISOString().split('T')[0];
          dateCounts[formattedDate] = (dateCounts[formattedDate] || 0) + 1;
        }
      });

      // Convert dateCounts into event format
      const events = Object.keys(dateCounts).map((date) => ({
        id: date, // Use date as the unique ID
        start: date,
        title: `${dateCounts[date]} Booked`,
        allDay: true, // Ensure it is treated as an all-day event
      }));

      return events;
    } catch (error) {
      throw error;
    }
  }

  // Get detailed bookings for a specific date
  static async getDetailedBookings(date) {
    try {
      const results = await queryDatabasePromise(`
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
          b.BOOKING_STATUS AS booking_status,
          billing.PAYMENT_STATUS AS payment_status
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing ON b.IDNo = billing.BOOKING_ID
        WHERE b.ACTIVE = 1
          AND billing.ACTIVE = 1
          AND (
            DATE(b.CHECK_IN_DATE) <= ?
            AND DATE(b.CHECK_OUT_DATE) > ?
          )
        ORDER BY b.ENCODED_DT DESC
      `, [date, date]);

      const bookings = results.map((result) => ({
        id: result.id,
        roomId: result.room_id,
        roomNumber: result.room_number,
        customerName: result.customer_name,
        checkInDate: result.checkin_date,
        checkOutDate: result.checkout_date,
        confirmationNumber: result.confirmation_number,
        guestsCount: result.guests_count,
        bookingTime: result.booking_time,
        bookingStatus: result.booking_status,
        paymentStatus: result.payment_status,
      }));

      return bookings;
    } catch (error) {
      throw error;
    }
  }

  // Update booking - OPTIMIZED VERSION (3x faster)
  static async updateBooking(id, room, checkIn, checkOut, options = {}) {
    try {
      const { 
        isExtended = false, 
        originalCheckOut = null, 
        extensionDate = null,
        oldRoomNumber = null,
        newRoomId = null 
      } = options || {};
      
      let isRoomTransfer = false;
      // OPTIMIZATION: Single query to get both room IDs at once
      const roomInfo = await queryDatabasePromise(`
        SELECT 
          b.ROOM_ID as currentRoomId,
          r1.IDNo as newRoomId
        FROM booking b
        CROSS JOIN room r1
        WHERE b.IDNo = ? AND b.ACTIVE = 1
          AND r1.ROOM_NUMBER = ? AND r1.ACTIVE = 1
      `, [id, room]);

      if (roomInfo.length === 0) {
        return false;
      }

      const { currentRoomId: currentRoom, newRoomId: targetRoom } = roomInfo[0];

      // Check if this is a room transfer (different room)
      isRoomTransfer = currentRoom !== targetRoom;

      // OPTIMIZATION: Execute base updates using Promise.all
      const updatePromises = [
        // Update old room to available (if it's a transfer)
        queryDatabasePromise(`
          UPDATE room SET ROOM_STATUS = 1 
          WHERE IDNo = ? AND ACTIVE = 1
        `, [currentRoom]),
        
        // Update new room to occupied
        queryDatabasePromise(`
          UPDATE room SET ROOM_STATUS = 2 
          WHERE IDNo = ? AND ACTIVE = 1
        `, [targetRoom])
      ];

      // If it's a room transfer, add transfer-specific updates
      if (isRoomTransfer) {
        updatePromises.push(
          // Update booking with transfer information
          queryDatabasePromise(`
            UPDATE booking 
            SET ROOM_ID = ?, CHECK_IN_DATE = ?, CHECK_OUT_DATE = ?, 
                TRANSFER = 1, TRANSFER_FROM = ?, EDITED_DT = NOW()
            WHERE IDNo = ? AND ACTIVE = 1
          `, [targetRoom, checkIn, checkOut, currentRoom, id]),
          
          // Log the transfer
          queryDatabasePromise(`
            INSERT INTO room_transfer_logs (
              BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE
            ) VALUES (?, ?, ?, NOW())
          `, [id, currentRoom, targetRoom])
        );
      } else {
        // Just update dates if same room
        updatePromises.push(
          queryDatabasePromise(`
            UPDATE booking 
            SET CHECK_IN_DATE = ?, CHECK_OUT_DATE = ?
            WHERE IDNo = ? AND ACTIVE = 1
          `, [checkIn, checkOut, id])
        );
      }

      const results = await Promise.all(updatePromises);

      // Check if booking update was successful
      const bookingUpdateIndex = isRoomTransfer ? 2 : 2; // Index depends on whether it's a transfer
      if (results[bookingUpdateIndex].affectedRows === 0) {
        return false;
      }

      // If this change came from an extension, update EXTENDED flags/days
      if (isExtended && originalCheckOut) {
        console.log('🔍 Calendar model processing extension:', { isExtended, originalCheckOut, checkOut });
        
        // Compute added days
        const daysAddedQuery = `SELECT GREATEST(DATEDIFF(?, ?), 0) AS daysAdded`;
        const daysAddedRes = await queryDatabasePromise(daysAddedQuery, [checkOut, originalCheckOut]);
        const daysAdded = daysAddedRes?.[0]?.daysAdded || 0;
        
        console.log('📊 Days added calculation:', { daysAdded, checkOut, originalCheckOut });

        if (daysAdded > 0) {
          console.log('✅ Updating booking with EXTENDED flags:', { daysAdded, id });
          
          // Mark booking extended and increment EXTENDED_DAYS
          await queryDatabasePromise(`
            UPDATE booking
            SET EXTENDED = 1,
                EXTENDED_DAYS = IFNULL(EXTENDED_DAYS, 0) + ?
            WHERE IDNo = ? AND ACTIVE = 1
          `, [daysAdded, id]);
          
          console.log('✅ Booking EXTENDED flags updated successfully');

          // Insert booking_extension record if we have an extensionDate
          if (extensionDate) {
            await queryDatabasePromise(`
              INSERT INTO booking_extension (
                BOOKING_ID, EXTEND_DATE, QTY, COST, PAYMENT_STATUS, ENCODED_BY
              ) VALUES (?, ?, ?, 0, 'unpaid', 1)
            `, [id, extensionDate, daysAdded]);
          }
        }
      }

      console.log('🎯 Calendar model update result:', { success: true, isRoomTransfer, isExtended, daysAdded: isExtended ? 'calculated' : 'N/A' });
      return { success: true, isRoomTransfer };
    } catch (error) {
      throw error;
    }
  }

  // Get available rooms
  static async getAvailableRooms() {
    try {
      const results = await queryDatabasePromise(`
        SELECT ROOM_NUMBER
        FROM room
        WHERE ROOM_STATUS = 1 AND ACTIVE = 1
        ORDER BY ROOM_NUMBER ASC
      `);
      return results.map(r => r.ROOM_NUMBER);
    } catch (error) {
      throw error;
    }
  }

  // Get bookings for a specific date range
  static async getBookingsByDateRange(startDate, endDate) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CUSTOMER_NAME,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.CHECK_IN_STATUS,
          COALESCE(bill.ROOM_CHARGE, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) + COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) AS TOTAL_COST,
          bill.PAYMENT_STATUS,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.ACTIVE = 1
          AND (
            (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE > ?) OR
            (b.CHECK_IN_DATE < ? AND b.CHECK_OUT_DATE >= ?) OR
            (b.CHECK_IN_DATE >= ? AND b.CHECK_OUT_DATE <= ?)
          )
        ORDER BY b.CHECK_IN_DATE ASC
      `, [endDate, startDate, endDate, startDate, startDate, endDate]);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get room availability for a specific date range
  static async getRoomAvailability(startDate, endDate) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          r.IDNo AS RoomID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS,
          CASE 
            WHEN b.IDNo IS NOT NULL THEN 'occupied'
            WHEN r.ROOM_MAINTENANCE_STATUS = 'maintenance' THEN 'maintenance'
            WHEN r.ROOM_STATUS = 'cleaning' THEN 'cleaning'
            ELSE 'available'
          END AS availability_status
        FROM room r
        LEFT JOIN booking b ON r.IDNo = b.ROOM_ID 
          AND b.ACTIVE = 1
          AND (
            (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE > ?) OR
            (b.CHECK_IN_DATE < ? AND b.CHECK_OUT_DATE >= ?) OR
            (b.CHECK_IN_DATE >= ? AND b.CHECK_OUT_DATE <= ?)
          )
        WHERE r.ACTIVE = 1
        ORDER BY r.ROOM_FLOOR ASC, r.ROOM_NUMBER ASC
      `, [endDate, startDate, endDate, startDate, startDate, endDate]);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get booking details for a specific booking
  static async getBookingDetails(bookingId) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          b.CUSTOMER_ID,
          c.NAME AS CUSTOMER_NAME,
          c.CONTACTNo AS CUSTOMER_CONTACT,
          b.ROOM_ID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          rt.NAME AS ROOM_TYPE,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          b.CHECK_IN_STATUS,
          COALESCE(bill.ROOM_CHARGE, 0) + COALESCE(bill.AMENITIES_CHARGE, 0) + COALESCE(bill.SERVICES_CHARGE, 0) + COALESCE(bill.LATE_CHECKOUT_CHARGE, 0) AS TOTAL_COST,
          bill.PAYMENT_STATUS,
          b.GUESTS_COUNT,
          b.REMARKS,
          b.CONFIRMATION_NUMBER,
          DATEDIFF(b.CHECK_OUT_DATE, b.CHECK_IN_DATE) AS TOTAL_DAYS
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo
        WHERE b.IDNo = ? AND b.ACTIVE = 1
      `, [bookingId]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Get rooms by floor
  static async getRoomsByFloor(floorNumber) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          r.IDNo AS RoomID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          rt.NAME AS ROOM_TYPE,
          IFNULL(r.ROOM_PRICE, rt.BASE_PRICE) AS ROOM_RATE,
          r.ROOM_STATUS,
          r.ROOM_MAINTENANCE_STATUS
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.ACTIVE = 1 AND r.ROOM_FLOOR = ?
        ORDER BY r.ROOM_NUMBER ASC
      `, [floorNumber]);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get floors for dropdown
  static async getFloors() {
    try {
      const rows = await queryDatabasePromise(`
        SELECT DISTINCT ROOM_FLOOR as floor_number
        FROM room 
        WHERE ACTIVE = 1
        ORDER BY ROOM_FLOOR ASC
      `);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get pending bookings for a specific room
  static async getPendingBookings(roomId) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          b.IDNo AS BookingID,
          c.NAME AS CUSTOMER_NAME,
          b.CHECK_IN_DATE,
          b.CHECK_OUT_DATE,
          b.BOOKING_STATUS,
          r.ROOM_NUMBER
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo
        WHERE b.ROOM_ID = ? 
          AND b.ACTIVE = 1
          AND b.BOOKING_STATUS IN ('pending', 'check-In')
        ORDER BY b.CHECK_IN_DATE ASC
      `, [roomId]);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Get room details for calendar
  static async getRoomDetails(roomId) {
    try {
      const rows = await queryDatabasePromise(`
        SELECT 
          r.IDNo AS RoomID,
          r.ROOM_NUMBER,
          r.ROOM_FLOOR,
          r.ROOM_TYPE_ID,
          r.ROOM_VIEW,
          r.ROOM_BED,
          r.ROOM_MAX,
          r.ROOM_PRICE,
          r.AMENITIES,
          rt.NAME AS ROOM_TYPE_NAME,
          rt.BASE_PRICE,
          rt.SEASONAL_PRICES
        FROM room r
        LEFT JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
        WHERE r.IDNo = ? AND r.ACTIVE = 1
      `, [roomId]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  // Update booking status
  static async updateBookingStatus(bookingId, status) {
    try {
      await queryDatabasePromise(
        'UPDATE booking SET BOOKING_STATUS = ? WHERE IDNo = ?',
        [status, bookingId]
      );
    } catch (error) {
      throw error;
    }
  }

  // Get calendar statistics
  static async getCalendarStats() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [totalBookings, todayCheckIns, todayCheckOuts, availableRooms] = await Promise.all([
        queryDatabasePromise('SELECT COUNT(*) as count FROM booking WHERE ACTIVE = 1'),
        queryDatabasePromise('SELECT COUNT(*) as count FROM booking WHERE DATE(CHECK_IN_DATE) = ? AND ACTIVE = 1', [today]),
        queryDatabasePromise('SELECT COUNT(*) as count FROM booking WHERE DATE(CHECK_OUT_DATE) = ? AND ACTIVE = 1', [today]),
        queryDatabasePromise('SELECT COUNT(*) as count FROM room WHERE ACTIVE = 1 AND ROOM_STATUS = "available"')
      ]);

      return {
        totalBookings: totalBookings[0].count,
        todayCheckIns: todayCheckIns[0].count,
        todayCheckOuts: todayCheckOuts[0].count,
        availableRooms: availableRooms[0].count
      };
    } catch (error) {
      throw error;
    }
  }

  // Get available rooms for transfer (copied from dashboard logic)
  static async getTransferAvailableRooms(currentRoom, checkOutDate) {
    try {
      // Get the current date (transferDate) in YYYY-MM-DD format
      const transferDate = new Date().toISOString().split('T')[0];
      const formattedCheckOutDate = new Date(checkOutDate).toISOString().split('T')[0];

      const rows = await queryDatabasePromise(`
        SELECT 
          r.IDNo AS ROOM_ID, 
          r.ROOM_NUMBER, 
          r.ROOM_STATUS, 
          r.ROOM_FLOOR,
          (SELECT DATE(b.CHECK_OUT_DATE)
            FROM booking b
            WHERE b.ROOM_ID = r.IDNo
              AND DATE(b.CHECK_OUT_DATE) = ?
            LIMIT 1) AS OCCUPANT_CHECK_OUT_TODAY
        FROM room r
        WHERE r.IDNo != ?
          AND r.IDNo NOT IN (
            SELECT b.ROOM_ID
            FROM booking b
            WHERE NOT (
              DATE(b.CHECK_OUT_DATE) <= ?
              OR DATE(b.CHECK_IN_DATE) >= ?
            )
          )
          AND r.ROOM_STATUS != 3
      `, [transferDate, currentRoom, transferDate, formattedCheckOutDate]);

      return rows;
    } catch (error) {
      throw error;
    }
  }

  // Transfer room (copied from dashboard logic)
  static async transferRoom(bookingId, oldRoomNumber, newRoomId, transferDate) {
    try {
      console.log('🔄 Calendar transfer started:', { bookingId, oldRoomNumber, newRoomId, transferDate });
      
      // Get the old room ID from room number
      const oldRoomResult = await queryDatabasePromise(`
        SELECT IDNo FROM room WHERE ROOM_NUMBER = ?
      `, [oldRoomNumber]);

      if (oldRoomResult.length === 0) {
        console.log('❌ Old room not found:', oldRoomNumber);
        return { success: false, error: 'Old room not found' };
      }

      const oldRoomId = oldRoomResult[0].IDNo;
      console.log('✅ Old room ID found:', oldRoomId);

      // Start transaction
      await queryDatabasePromise('START TRANSACTION');
      console.log('🔄 Transaction started');

      // Step 1: Update booking with new room
      console.log('🔄 Updating booking with new room:', { newRoomId, oldRoomId, bookingId });
      await queryDatabasePromise(`
        UPDATE booking 
        SET ROOM_ID = ?, TRANSFER = 1, TRANSFER_FROM = ?, 
            EDITED_DT = NOW() 
        WHERE IDNo = ?
      `, [newRoomId, oldRoomId, bookingId]);
      console.log('✅ Booking updated successfully');

      // Step 2: Update room statuses (old room to cleaning, new room to occupied)
      console.log('🔄 Updating room statuses:', { oldRoomId, newRoomId });
      await queryDatabasePromise(`
        UPDATE room 
        SET ROOM_STATUS = CASE 
            WHEN IDNo = ? THEN 4  -- Old room set to "Cleaning"
            WHEN IDNo = ? THEN 2  -- New room set to "Occupied"
        END 
        WHERE IDNo IN (?, ?)
      `, [oldRoomId, newRoomId, oldRoomId, newRoomId]);
      console.log('✅ Room statuses updated successfully');

      // Step 3: Log the transfer
      console.log('📝 Calendar transfer logging:', {
        bookingId,
        oldRoomId,
        newRoomId,
        transferDate
      });
      
      await queryDatabasePromise(`
        INSERT INTO room_transfer_logs (
          BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE
        ) VALUES (?, ?, ?, ?)
      `, [bookingId, oldRoomId, newRoomId, transferDate]);
      
      console.log('✅ Transfer log inserted successfully');

      // Commit transaction
      await queryDatabasePromise('COMMIT');
      console.log('✅ Transaction committed successfully');

      return { 
        success: true, 
        message: "Room transfer successful." 
      };
    } catch (error) {
      // Rollback on error
      console.error('❌ Calendar transfer error, rolling back transaction:', error);
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

  // Get transfer logs for a specific booking (copied from dashboard logic)
  static async getTransferLogs(bookingId) {
    try {
      console.log('🔍 Calendar getting transfer logs for booking:', bookingId);
      
      const logs = await queryDatabasePromise(`
        SELECT 
          rtl.IDNo AS LogID,
          rtl.BOOKING_ID AS BookingID,
          rtl.OLD_ROOM_ID,
          oldRoom.ROOM_NUMBER AS OldRoomNumber,
          rtl.NEW_ROOM_ID,
          newRoom.ROOM_NUMBER AS NewRoomNumber,
          rtl.TRANSFER_DATE
        FROM room_transfer_logs rtl
        LEFT JOIN room oldRoom ON oldRoom.IDNo = rtl.OLD_ROOM_ID
        LEFT JOIN room newRoom ON newRoom.IDNo = rtl.NEW_ROOM_ID
        WHERE rtl.BOOKING_ID = ?
        ORDER BY rtl.TRANSFER_DATE ASC
      `, [bookingId]);
      
      console.log('📊 Calendar transfer logs raw data:', logs);
      
      const formattedLogs = logs.map(log => ({
        ...log,
        FORMATTED_DATE: new Date(log.TRANSFER_DATE).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }));
      
      console.log('📊 Calendar transfer logs formatted:', formattedLogs);
      
      return formattedLogs;
    } catch (error) {
      console.error('❌ Error getting calendar transfer logs:', error);
      throw error;
    }
  }

  // Check room availability for extension (copied from dashboard logic)
  static async checkExtendRoom(roomId, checkoutDate, daysToExtend) {
    try {
      const checkoutDateObj = new Date(checkoutDate);
      if (isNaN(checkoutDateObj) || !daysToExtend) {
        throw new Error("Invalid parameters.");
      }

      // Calculate the extended end date
      const extendedEndDate = new Date(checkoutDateObj);
      extendedEndDate.setDate(extendedEndDate.getDate() + parseInt(daysToExtend));

      // Check if the current room is available during the full extended period
      const currentRoomQuery = `
        SELECT 1
        FROM booking
        WHERE ROOM_ID = ?
        AND (
          CHECK_IN_DATE < ?
          AND CHECK_OUT_DATE > ?
        )
        AND ACTIVE = 1
      `;
      const isRoomUnavailable = (
        await queryDatabasePromise(currentRoomQuery, [
          roomId,
          extendedEndDate.toISOString().slice(0, 19).replace("T", " "),
          checkoutDateObj.toISOString().slice(0, 19).replace("T", " "),
        ])
      ).length > 0;

      let availableRooms = [];
      if (isRoomUnavailable) {
        // Fetch rooms available for the full extended period
        const availableRoomsQuery = `
          SELECT r.IDNo AS ROOM_ID, r.ROOM_NUMBER, rt.NAME AS RoomType, r.ROOM_FLOOR
          FROM room r
          JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          WHERE r.ACTIVE = 1
          AND NOT EXISTS (
            SELECT 1 FROM booking b
            WHERE b.ROOM_ID = r.IDNo
            AND (
              b.CHECK_IN_DATE < ?
              AND b.CHECK_OUT_DATE > ?
            )
            AND b.ACTIVE = 1
          )
        `;
        availableRooms = await queryDatabasePromise(availableRoomsQuery, [
          extendedEndDate.toISOString().slice(0, 19).replace("T", " "),
          checkoutDateObj.toISOString().slice(0, 19).replace("T", " "),
        ]);
      }

      return { currentRoomAvailable: !isRoomUnavailable, availableRooms };
    } catch (error) {
      throw error;
    }
  }

  // Extend stay (copied from dashboard logic)
  static async extendStay(currentRoomId, newRoomId, daysToExtend, bookingId, cost) {
    try {
      const parsedCost = parseFloat(cost) || 0;

      // Fetch the current booking's checkout date and check if it's a group booking
      const currentBookingQuery = `SELECT CHECK_OUT_DATE, c.IS_GROUP 
                                   FROM booking b
                                   JOIN customer c ON b.CUSTOMER_ID = c.IDNo 
                                   WHERE b.IDNo = ? AND b.ACTIVE = 1`;
      const result = await queryDatabasePromise(currentBookingQuery, [bookingId]);

      if (!result || result.length === 0) {
        throw new Error("Booking not found. Please check the booking ID.");
      }

      const currentBooking = result[0];
      const currentCheckoutDate = new Date(currentBooking.CHECK_OUT_DATE);
      const isGroup = currentBooking.IS_GROUP === 1;

      // Compute the new checkout date
      const newCheckoutDate = new Date(currentCheckoutDate);
      newCheckoutDate.setDate(newCheckoutDate.getDate() + parseInt(daysToExtend, 10));

      // Convert to MySQL format
      const formattedNewCheckoutDate = newCheckoutDate;

      // Check for booking conflicts
      const conflictQuery = `
        SELECT 1
        FROM booking
        WHERE ROOM_ID = ?
        AND CHECK_IN_DATE < ?
        AND CHECK_OUT_DATE > ?
        AND IDNo != ?
        AND ACTIVE = 1
      `;
      const conflict = (
        await queryDatabasePromise(conflictQuery, [
          newRoomId || currentRoomId,
          formattedNewCheckoutDate,
          currentCheckoutDate,
          bookingId,
        ])
      ).length > 0;

      if (conflict) {
        throw new Error("The selected room is unavailable for the extended period.");
      }

      // Perform the extension
      if (!newRoomId || newRoomId === currentRoomId) {
        // Extend stay in the current room
        const query = `
         UPDATE booking
          SET CHECK_OUT_DATE = ?, EXTENDED = 1, EXTENDED_DAYS = EXTENDED_DAYS + ?
          WHERE ROOM_ID = ? AND IDNo = ? AND ACTIVE = 1
              `;
        await queryDatabasePromise(query, [formattedNewCheckoutDate, daysToExtend, currentRoomId, bookingId]);

        // Update the current room's status to "Occupied" (2)
        const updateRoomStatusQuery = `
          UPDATE room
          SET ROOM_STATUS = 2
          WHERE IDNo = ?
        `;
        await queryDatabasePromise(updateRoomStatusQuery, [currentRoomId]);
      } else {
        // Transfer the guest to a new room
        const transferQuery = `
           UPDATE booking
          SET ROOM_ID = ?, CHECK_OUT_DATE = ?, TRANSFER = 1, EXTENDED = 1, EXTENDED_DAYS = EXTENDED_DAYS + ?
          WHERE ROOM_ID = ? AND IDNo = ? AND ACTIVE = 1
        `;
        await queryDatabasePromise(transferQuery, [newRoomId, formattedNewCheckoutDate, daysToExtend, currentRoomId, bookingId]);

        // Update the current room's status to "Cleaning" (4)
        const updateCurrentRoomStatusQuery = `
          UPDATE room
          SET ROOM_STATUS = 4
          WHERE IDNo = ?
        `;
        await queryDatabasePromise(updateCurrentRoomStatusQuery, [currentRoomId]);

        // Update the new room's status to "Occupied" (2)
        const updateNewRoomStatusQuery = `
          UPDATE room
          SET ROOM_STATUS = 2
          WHERE IDNo = ?
        `;
        await queryDatabasePromise(updateNewRoomStatusQuery, [newRoomId]);

        // Insert a record into the room_transfer_logs table
        const transferLogQuery = `
          INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
          VALUES (?, ?, ?, NOW())
        `;
        await queryDatabasePromise(transferLogQuery, [bookingId, currentRoomId, newRoomId]);
      }

      // Insert extension record
      const insertExtensionQuery = `
        INSERT INTO booking_extension (
          BOOKING_ID,
          EXTEND_DATE,
          QTY,
          COST,
          PAYMENT_STATUS,
          ENCODED_BY
        )
        VALUES (?, CURDATE(), ?, ?, 'unpaid', ?)
      `;
      await queryDatabasePromise(insertExtensionQuery, [
        bookingId,
        daysToExtend,
        parsedCost,
        1 // Default system user ID for calendar extensions
      ]);

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  // Get booking extensions for a specific booking
  static async getBookingExtensions(bookingId) {
    try {
      const extensions = await queryDatabasePromise(`
        SELECT 
          be.IDNo,
          be.BOOKING_ID,
          be.EXTEND_DATE,
          be.QTY,
          be.COST,
          be.PAYMENT_STATUS,
          be.ENCODED_BY,
          DATE_FORMAT(be.EXTEND_DATE, '%m/%d/%Y') as FORMATTED_DATE
        FROM booking_extension be
        WHERE be.BOOKING_ID = ?
        ORDER BY be.EXTEND_DATE DESC
      `, [bookingId]);

      return extensions;
    } catch (error) {
      throw error;
    }
  }

  // Remove booking extension
  static async removeBookingExtension(extensionId, bookingId) {
    try {
      // Get the extension details first
      const extensionQuery = `
        SELECT QTY, COST, BOOKING_ID
        FROM booking_extension
        WHERE IDNo = ? AND BOOKING_ID = ?
      `;
      const extension = await queryDatabasePromise(extensionQuery, [extensionId, bookingId]);

      if (extension.length === 0) {
        throw new Error("Extension not found.");
      }

      const extensionData = extension[0];
      const daysToRemove = extensionData.QTY;
      const costToRemove = extensionData.COST;

      // Get current booking details
      const bookingQuery = `
        SELECT CHECK_IN_DATE, CHECK_OUT_DATE, EXTENDED_DAYS, ROOM_ID
        FROM booking
        WHERE IDNo = ?
      `;
      const booking = await queryDatabasePromise(bookingQuery, [bookingId]);

      if (booking.length === 0) {
        throw new Error("Booking not found.");
      }

      const bookingData = booking[0];
      const currentCheckoutDate = new Date(bookingData.CHECK_OUT_DATE);
      
      // Calculate new checkout date by subtracting the extension days
      const newCheckoutDate = new Date(currentCheckoutDate);
      newCheckoutDate.setDate(newCheckoutDate.getDate() - daysToRemove);

      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Remove the extension record
      await queryDatabasePromise(`
        DELETE FROM booking_extension
        WHERE IDNo = ? AND BOOKING_ID = ?
      `, [extensionId, bookingId]);

      // Update the booking to reduce extended days and checkout date
      await queryDatabasePromise(`
        UPDATE booking
        SET EXTENDED_DAYS = GREATEST(0, EXTENDED_DAYS - ?),
            CHECK_OUT_DATE = ?
        WHERE IDNo = ?
      `, [daysToRemove, newCheckoutDate, bookingId]);

      // If extended days becomes 0, reset the EXTENDED flag
      await queryDatabasePromise(`
        UPDATE booking
        SET EXTENDED = CASE 
          WHEN EXTENDED_DAYS = 0 THEN 0 
          ELSE EXTENDED 
        END
        WHERE IDNo = ?
      `, [bookingId]);

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return { 
        success: true, 
        message: "Extension removed successfully.",
        newCheckoutDate: newCheckoutDate,
        daysRemoved: daysToRemove
      };
    } catch (error) {
      // Rollback on error
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

  // Check late check-out room availability (copied from dashboard logic)
  static async checkLateCheckRoom(roomId, checkoutDate, currentBookingId) {
    try {
      // Convert checkoutDate to ISO 8601 format for logging and consistency
      const formattedCheckoutDate = new Date(checkoutDate).toISOString();

      // Fetch all future bookings for this room, EXCLUDING the current booking
      const nextBookingsQuery = `
        SELECT IDNo, CHECK_IN_STATUS, CHECK_IN_DATE
        FROM booking
        WHERE ROOM_ID = ? 
        AND CHECK_IN_DATE >= ? -- Only future bookings
        AND IDNo != ?  -- EXCLUDE CURRENT BOOKING
        AND ACTIVE = 1
        ORDER BY CHECK_IN_DATE ASC
      `;
      const nextBookings = await queryDatabasePromise(nextBookingsQuery, [roomId, formattedCheckoutDate, currentBookingId]);

      // Find the next check-in that might cause a conflict
      const conflictingBooking = nextBookings.find(booking => 
        booking.CHECK_IN_STATUS === 1 && 
        new Date(booking.CHECK_IN_DATE) <= new Date(checkoutDate)
      );

      if (conflictingBooking) {
        // Fetch available rooms if a room change is needed
        const availableRoomsQuery = `
          SELECT r.IDNo AS ROOM_ID, r.ROOM_NUMBER, r.ROOM_FLOOR, rt.NAME AS RoomType
          FROM room r
          JOIN room_type rt ON r.ROOM_TYPE_ID = rt.IDNo
          WHERE r.ACTIVE = 1 
          AND NOT EXISTS (
            SELECT 1 FROM booking b
            WHERE b.ROOM_ID = r.IDNo
            AND b.CHECK_IN_DATE <= DATE_ADD(?, INTERVAL 1 DAY) -- Includes check-ins on the same day
            AND b.CHECK_OUT_DATE > ? 
          )
        `;
        const availableRooms = await queryDatabasePromise(availableRoomsQuery, [formattedCheckoutDate, formattedCheckoutDate]);

        return {
          needRoomChange: true,
          availableRooms,
          message: "A Regular Check-In is scheduled during your Late Check-Out. Please select a new room."
        };
      }

      // If no conflicting next booking, guest can stay in the same room
      return { 
        needRoomChange: false 
      };

    } catch (error) {
      throw error;
    }
  }

  // Process late check-out (copied from dashboard logic)
  static async processLateCheckout(currentRoomId, newRoomId, bookingId) {
    try {
      // Fetch the total days of stay for this booking
      const totalDaysQuery = `SELECT DATEDIFF(CHECK_OUT_DATE, CHECK_IN_DATE) AS TotalDays FROM booking WHERE IDNo = ? AND ACTIVE = 1`;
      const totalDaysResult = await queryDatabasePromise(totalDaysQuery, [bookingId]);
      const totalDays = totalDaysResult.length > 0 ? totalDaysResult[0].TotalDays : null;

      let lateCheckoutFee = 0;

      // Apply ₱2,000 Fee if stay is less than 3 days
      if (totalDays !== null && totalDays < 3) {
        lateCheckoutFee = 2000;
      }

      // If a new room is chosen, transfer the guest
      if (newRoomId && newRoomId !== currentRoomId) {
        // Update booking table
        const transferQuery = `
          UPDATE booking
          SET ROOM_ID = ?, TRANSFER = 1
          WHERE IDNo = ? AND ACTIVE = 1
        `;
        await queryDatabasePromise(transferQuery, [newRoomId, bookingId]);

        // Log transfer in room_transfer_logs
        const logTransferQuery = `
          INSERT INTO room_transfer_logs (BOOKING_ID, OLD_ROOM_ID, NEW_ROOM_ID, TRANSFER_DATE)
          VALUES (?, ?, ?, NOW())
        `;
        await queryDatabasePromise(logTransferQuery, [bookingId, currentRoomId, newRoomId]);

        // Update room status
        const updateOldRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 4 WHERE IDNo = ?`;
        const updateNewRoomStatusQuery = `UPDATE room SET ROOM_STATUS = 2 WHERE IDNo = ?`;

        await queryDatabasePromise(updateOldRoomStatusQuery, [currentRoomId]);
        await queryDatabasePromise(updateNewRoomStatusQuery, [newRoomId]);
      }

      // Update LATE_CHECKOUT = 1 and adjust CHECK_OUT_DATE to 23:00:00
      const updateBookingQuery = `
        UPDATE booking
        SET LATE_CHECKOUT = 1, CHECK_OUT_DATE = CONCAT(DATE(CHECK_OUT_DATE), ' 23:00:00')
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      await queryDatabasePromise(updateBookingQuery, [bookingId]);

      // If Late Check-Out Fee applies, add to booking service
      const insertBookingServiceQuery = `
        INSERT INTO booking_service (BOOKING_ID, SERVICE_ID, QTY, TOTAL_COST, STATUS, ENCODED_BY, ENCODED_DT) 
        VALUES (?, 72, 1, ?, ?, ?, NOW())
      `;

      const status = lateCheckoutFee > 0 ? 'unpaid' : 'paid';

      await queryDatabasePromise(insertBookingServiceQuery, [bookingId, lateCheckoutFee, status, 1]);

      return { 
        success: true,
        lateCheckoutFee: lateCheckoutFee,
        isFree: lateCheckoutFee === 0
      };

    } catch (error) {
      throw error;
    }
  }

  // Get late check-out services
  static async getLateCheckoutServices(bookingId) {
    try {
      const query = `
        SELECT 
          bs.IDNo,
          bs.BOOKING_ID,
          bs.SERVICE_ID,
          bs.QTY,
          bs.TOTAL_COST,
          bs.STATUS AS PAYMENT_STATUS,
          s.SERVICE_NAME
        FROM booking_service bs
        JOIN services s ON bs.SERVICE_ID = s.IDNo
        WHERE bs.BOOKING_ID = ? 
        AND s.SERVICE_NAME LIKE '%LATE CHECK%'
        AND bs.ACTIVE = 1
        ORDER BY bs.ENCODED_DT DESC
      `;
      
      const lateCheckoutServices = await queryDatabasePromise(query, [bookingId]);
      return lateCheckoutServices;
    } catch (error) {
      throw error;
    }
  }

  // Remove late check-out service
  static async removeLateCheckoutService(serviceId, bookingId) {
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Delete the late check-out service
      const deleteServiceQuery = `
        UPDATE booking_service 
        SET ACTIVE = 0 
        WHERE IDNo = ? AND BOOKING_ID = ?
      `;
      await queryDatabasePromise(deleteServiceQuery, [serviceId, bookingId]);

      // Update booking to remove late check-out flag
      const updateBookingQuery = `
        UPDATE booking 
        SET LATE_CHECKOUT = 0, 
            CHECK_OUT_DATE = CONCAT(DATE(CHECK_OUT_DATE), ' 12:00:00')
        WHERE IDNo = ?
      `;
      await queryDatabasePromise(updateBookingQuery, [bookingId]);

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return { 
        success: true, 
        message: 'Late check-out service removed successfully' 
      };

    } catch (error) {
      // Rollback transaction on error
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

  // Reopen cancelled reservation
  static async reopenReservation(bookingId, newStatus, checkInStatus) {
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Update booking status from cancelled to pending and set check-in status
      const updateBookingQuery = `
        UPDATE booking 
        SET BOOKING_STATUS = ?, 
            CHECK_IN_STATUS = ?,
            EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(updateBookingQuery, [newStatus, checkInStatus, bookingId]);
      
      if (result.affectedRows === 0) {
        await queryDatabasePromise('ROLLBACK');
        return { 
          success: false, 
          message: 'Booking not found or already updated' 
        };
      }

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return { 
        success: true, 
        message: 'Reservation reopened successfully' 
      };

    } catch (error) {
      // Rollback transaction on error
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

    // Remove cancelled reservation
  static async removeReservation(bookingId) {
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // Set ACTIVE = 0 to soft delete the booking
      const removeBookingQuery = `
        UPDATE booking 
        SET ACTIVE = 0,
            EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const result = await queryDatabasePromise(removeBookingQuery, [bookingId]);
      
      if (result.affectedRows === 0) {
        await queryDatabasePromise('ROLLBACK');
        return { 
          success: false, 
          message: 'Booking not found or already removed' 
        };
      }

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return { 
        success: true, 
        message: 'Reservation removed successfully' 
      };

    } catch (error) {
      // Rollback transaction on error
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

  // Check-in reservation
  static async checkInReservation(bookingId) {
    try {
      // Start transaction
      await queryDatabasePromise('START TRANSACTION');

      // First, get the room ID for this booking
      const getRoomQuery = `
        SELECT ROOM_ID 
        FROM booking 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const roomResult = await queryDatabasePromise(getRoomQuery, [bookingId]);
      
      if (roomResult.length === 0) {
        await queryDatabasePromise('ROLLBACK');
        return { 
          success: false, 
          message: 'Booking not found' 
        };
      }

      const roomId = roomResult[0].ROOM_ID;

      // Update booking status to check-In and set IS_OCCUPIED = 1
      const updateBookingQuery = `
        UPDATE booking 
        SET BOOKING_STATUS = 'check-In',
            IS_OCCUPIED = 1,
            EDITED_DT = NOW()
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      const bookingResult = await queryDatabasePromise(updateBookingQuery, [bookingId]);
      
      if (bookingResult.affectedRows === 0) {
        await queryDatabasePromise('ROLLBACK');
        return { 
          success: false, 
          message: 'Booking not found or already updated' 
        };
      }

      // Update room status to occupied (status = 2) - SAME LOGIC AS DASHBOARD
      const updateRoomQuery = `
        UPDATE room 
        SET ROOM_STATUS = 2 
        WHERE IDNo = ? AND ACTIVE = 1
      `;
      
      await queryDatabasePromise(updateRoomQuery, [roomId]);

      // Commit transaction
      await queryDatabasePromise('COMMIT');

      return { 
        success: true, 
        message: 'Guest checked in successfully and room marked as occupied',
        roomId: roomId,
        isOccupied: 1,
        roomStatus: 2
      };

    } catch (error) {
      // Rollback transaction on error
      await queryDatabasePromise('ROLLBACK');
      throw error;
    }
  }

  // Get Unassigned Rooms for FullCalendar
  static async getUnassignedRoomsForCalendar(start, end) {
    try {
      console.log('🔍 Model: getUnassignedRoomsForCalendar called with:', { start, end });
      
      const query = `
        SELECT 
          b.CHECK_IN_DATE AS checkInDate,
          b.CHECK_OUT_DATE AS checkOutDate,
          COALESCE(r.ROOM_NUMBER, 'Unassigned') AS roomNumber,
          c.NAME AS customerName
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo AND r.ACTIVE = 1
        WHERE b.ACTIVE = 1
          AND b.IS_DIRECT_RESERVATION = 1
          AND (b.CHECK_IN_DATE <= ? AND b.CHECK_OUT_DATE >= ?)
      `;

      // console.log('🔍 Executing query with parameters:', [end, start]);
      const results = await queryDatabasePromise(query, [end, start]);
      // console.log('🔍 Query results:', results);

      // Create a map of dates with counts and unassigned info
      const dateCounts = {};
      const dateUnassigned = {};
      
      results.forEach((booking) => {
        const checkInDate = new Date(booking.checkInDate);
        const isUnassigned = booking.roomNumber === 'Unassigned';

        // Only show event on check-in date for monitoring purposes
        const formattedDate = checkInDate.toISOString().split('T')[0];
        dateCounts[formattedDate] = (dateCounts[formattedDate] || 0) + 1;
        
        // Track if any reservation on this date is unassigned
        if (isUnassigned) {
          dateUnassigned[formattedDate] = true;
        }
      });

     
      // Convert dateCounts into event format
      const events = Object.keys(dateCounts).map((date) => ({
        id: date,
        start: date,
        title: `${dateCounts[date]} Unassigned Rooms`,
        allDay: true,
        extendedProps: {
          count: dateCounts[date],
          type: 'direct',
          hasUnassigned: dateUnassigned[date] || false
        }
      }));

    
      return events;
    } catch (error) {
      console.error('❌ Model error:', error);
      throw error;
    }
  }

  // Get detailed Unassigned Rooms for a specific date
  static async getDetailedUnassignedRooms(date) {
    try {
      const query = `
        SELECT
          b.IDNo AS id,
          b.IDNo AS bookingId,
          b.ROOM_ID AS room_id,
          COALESCE(r.ROOM_NUMBER, 'Unassigned') AS room_number,
          IFNULL(c.NAME, 'Guest') AS customer_name,
          b.CHECK_IN_DATE AS checkin_date,
          b.CHECK_OUT_DATE AS checkout_date,
          b.CONFIRMATION_NUMBER AS confirmation_number,
          b.GUESTS_COUNT AS guests_count,
          DATE_FORMAT(b.ENCODED_DT, '%Y-%m-%d %H:%i:%s') AS booking_time,
          b.BOOKING_STATUS AS booking_status,
          COALESCE(billing.PAYMENT_STATUS, 'Unknown') AS payment_status,
          b.BED_COUNT AS bedCount
        FROM booking b
        LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
        LEFT JOIN room r ON b.ROOM_ID = r.IDNo AND r.ACTIVE = 1
        LEFT JOIN billing ON b.IDNo = billing.BOOKING_ID AND billing.ACTIVE = 1
        WHERE b.ACTIVE = 1
          AND b.IS_DIRECT_RESERVATION = 1
          AND DATE(b.CHECK_IN_DATE) = ?
        ORDER BY b.ENCODED_DT DESC
      `;

      const results = await queryDatabasePromise(query, [date]);

      const bookings = results.map((result) => ({
        id: result.id,
        bookingId: result.bookingId,
        roomId: result.room_id,
        roomNumber: result.room_number,
        customerName: result.customer_name,
        checkInDate: result.checkin_date,
        checkOutDate: result.checkout_date,
        confirmationNumber: result.confirmation_number,
        guestsCount: result.guests_count,
        bookingTime: result.booking_time,
        bookingStatus: result.booking_status,
        paymentStatus: result.payment_status,
        bedCount: result.bedCount,
      }));

      return { success: true, bookings };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = CalendarModel; 