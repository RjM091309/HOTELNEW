const CalendarModel = require('../models/calendarModel');

class CalendarController {
  // Main calendar controller
  static async getCalendar(req, res) {
    try {
      // Get user from JWT token
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      // Get all calendar data in parallel
      const [
        allBookings,
        allRooms,
        floors,
        calendarStats
      ] = await Promise.all([
        CalendarModel.getAllBookings(),
        CalendarModel.getAllRooms(),
        CalendarModel.getFloors(),
        CalendarModel.getCalendarStats()
      ]);

      // Process calendar data for view
      const processedBookings = allBookings.map(booking => ({
        id: booking.BookingID,
        roomId: booking.ROOM_ID,
        guestName: booking.CUSTOMER_NAME || 'Unknown Guest',
        startDate: booking.CHECK_IN_DATE,
        endDate: booking.CHECK_OUT_DATE,
        status: booking.BOOKING_STATUS,
        roomNumber: booking.ROOM_NUMBER,
        totalCost: booking.TOTAL_COST,
        totalDays: booking.TOTAL_DAYS
      }));

      const processedRooms = allRooms.map(room => ({
        id: room.RoomID,
        name: room.ROOM_NUMBER,
        floor: room.ROOM_FLOOR,
        type: room.ROOM_TYPE,
        rate: room.ROOM_RATE,
        status: room.ROOM_STATUS
      }));

      // Generate date range for calendar (next 30 days)
      const dateRange = [];
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dateRange.push(date);
      }

      res.render('calendar/calendar', {
        title: 'Calendar', // Set the page title
        subTitle: 'Calendar', // Set the breadcrumb subtitle
        hideBreadcrumb: true, // Hide breadcrumb on calendar
        activePage: 'calendar', // Set active page for navigation highlighting
        user,
        userId,
        tabOrder,
        rooms: processedRooms, // Changed from allRooms to rooms
        bookings: processedBookings, // Changed from allBookings to bookings
        dateRange: dateRange, // Added dateRange
        floors,
        calendarStats,
        script: `<script>document.body.setAttribute('data-user-id', '${userId}');</script>`
        // Add any other variables needed by calendar.ejs
      });
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      res.status(500).render('error', { message: 'Server error' });
    }
  }

  // Get bookings for FullCalendar
  static async getBookingsForCalendar(req, res) {
    try {
      const { start, end } = req.query;

      if (!start || !end) {
        return res.status(400).json({ success: false, message: 'Missing start or end date.' });
      }

      const events = await CalendarModel.getBookingsForCalendar(start, end);
      res.json(events);
    } catch (error) {
      console.error('Error fetching bookings for calendar:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // NEW: Get optimized bookings for FullCalendar with pre-processed data
  static async getOptimizedBookingsForCalendar(req, res) {
    try {
      // Make start and end parameters optional to match original behavior
      const { start, end } = req.query;

      // Using optimized booking endpoint
      
      // If no date range provided, get all bookings (like original endpoint)
      const events = await CalendarModel.getOptimizedBookingsForCalendar(start, end);
      res.json(events);
    } catch (error) {
      console.error('Error fetching optimized bookings for calendar:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get detailed bookings for a specific date
  static async getDetailedBookings(req, res) {
    try {
      const { date } = req.query;

      if (!date) {
        console.log('Missing date parameter');
        return res.status(400).json({ success: false, message: 'Missing date parameter.' });
      }

      console.log(`Fetching bookings for date: ${date}`); // Debugging

      const bookings = await CalendarModel.getDetailedBookings(date);
      res.json({ success: true, bookings });
    } catch (error) {
      console.error('Error fetching detailed bookings:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Update booking - ENHANCED with better validation and error handling
  static async updateBooking(req, res) {
    try {
      const { 
        id, 
        room, 
        checkIn, 
        checkOut, 
        isExtended, 
        originalCheckOut, 
        extensionDate,
        isRoomTransfer = false,
        oldRoomNumber = null,
        newRoomId = null 
      } = req.body;
      
      // Enhanced input validation
      const validation = CalendarController.validateBookingUpdate({ id, room, checkIn, checkOut });
      if (!validation.isValid) {
        return res.status(400).json({ 
          success: false, 
          message: 'Validation failed',
          errors: validation.errors 
        });
      }

      console.log('📥 Calendar API processing update:', { 
        bookingId: id, 
        room, 
        checkIn, 
        checkOut, 
        isExtended,
        isRoomTransfer,
        oldRoomNumber,
        newRoomId
      });

      const result = await CalendarModel.updateBooking(
        id,
        room,
        checkIn,
        checkOut,
        {
          isExtended: Boolean(isExtended),
          originalCheckOut: originalCheckOut || null,
          extensionDate: extensionDate || null,
          isRoomTransfer: Boolean(isRoomTransfer),
          oldRoomNumber: oldRoomNumber || null,
          newRoomId: newRoomId || null
        }
      );
      
      if (result && result.success) {
        // Emit Socket.IO event for real-time updates
        const io = req.app.get('io');
        if (io) {
          let action = 'booking-updated';
          let message = 'Booking updated successfully';
          
          if (isExtended && originalCheckOut) {
            action = 'booking-extended';
            message = 'Booking extended successfully';
          }
          
          const eventData = {
            action,
            message,
            data: { 
              bookingId: id, 
              newRoom: room, 
              checkIn, 
              checkOut,
              isRoomTransfer: result.isRoomTransfer,
              isExtended: isExtended,
              originalCheckOut: originalCheckOut,
              timestamp: new Date().toISOString()
            }
          };
          
          io.to('dashboard-room').emit('dashboard-refresh', eventData);
        }
        
        res.json({
          success: true,
          message: result.isRoomTransfer 
            ? 'Room transfer completed successfully.' 
            : 'Booking updated successfully.',
          data: {
            bookingId: id,
            isRoomTransfer: result.isRoomTransfer,
            isExtended: Boolean(isExtended)
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to update booking. Please check if the booking exists and you have permission to modify it.',
          errorCode: 'BOOKING_UPDATE_FAILED'
        });
      }
    } catch (error) {
      console.error('❌ Calendar booking update error:', {
        error: error.message,
        stack: error.stack,
        bookingData: { id: req.body.id, room: req.body.room, checkIn: req.body.checkIn, checkOut: req.body.checkOut }
      });

      // Determine error type and provide appropriate response
      let errorMessage = 'Internal server error occurred';
      let statusCode = 500;

      if (error.code === 'ER_DUP_ENTRY') {
        errorMessage = 'Room conflict detected. Please choose a different room or time slot.';
        statusCode = 409;
      } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        errorMessage = 'Invalid booking or room reference.';
        statusCode = 404;
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Unable to connect to database. Please try again.';
        statusCode = 503;
      }

      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        errorCode: 'BOOKING_UPDATE_SERVER_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Input validation helper
  static validateBookingUpdate(data) {
    const errors = [];
    const { id, room, checkIn, checkOut } = data;

    // Required fields check
    if (!id || !room || !checkIn || !checkOut) {
      errors.push('All fields are required (id, room, checkIn, checkOut)');
    }

    // Data type validation
    if (id && !/^\d+$/.test(id)) {
      errors.push('Booking ID must be a valid number');
    }

    // Date validation
    if (checkIn && checkOut) {
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        errors.push('Invalid date format');
      } else {
        if (checkInDate < today) {
          errors.push('Check-in date cannot be in the past');
        }
        if (checkOutDate <= checkInDate) {
          errors.push('Check-out date must be after check-in date');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Get available rooms
  static async getAvailableRooms(req, res) {
    try {
      const rooms = await CalendarModel.getAvailableRooms();
      res.json({ success: true, rooms });
    } catch (error) {
      console.error('Error fetching available rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get rooms
  static async getRooms(req, res) {
    try {
      const rooms = await CalendarModel.getAllRooms();
      console.log('📅 Rooms data:', rooms);
      console.log('📅 Rooms data type:', typeof rooms);
      console.log('📅 Rooms is array:', Array.isArray(rooms));
      res.json(rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  }

  // Get bookings
  static async getBookings(req, res) {
    try {
      const bookings = await CalendarModel.getAllBookings();
      console.log('📅 Bookings data:', bookings);
      res.json(bookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      res.status(500).json({ error: 'Failed to fetch bookings' });
    }
  }

  // Get available rooms for transfer
  static async getTransferAvailableRooms(req, res) {
    try {
      const { currentRoom, checkOutDate } = req.query;

      if (!currentRoom || !checkOutDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing currentRoom or checkOutDate parameter.' 
        });
      }

      // Get available rooms for transfer using the same logic as dashboard
      const availableRooms = await CalendarModel.getTransferAvailableRooms(currentRoom, checkOutDate);
      res.json(availableRooms);
    } catch (error) {
      console.error('Error fetching transfer available rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Transfer room
  static async transferRoom(req, res) {
    try {
      const { bookingId, oldRoomNumber, newRoomId, transferDate } = req.body;

      if (!bookingId || !oldRoomNumber || !newRoomId || !transferDate) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters for room transfer.' 
        });
      }

      console.log('🔄 Calendar transfer request:', { bookingId, oldRoomNumber, newRoomId, transferDate });

      // Process room transfer using the same logic as dashboard
      const result = await CalendarModel.transferRoom(bookingId, oldRoomNumber, newRoomId, transferDate);
      
      if (result.success) {
        // Calendar transfer successful
        res.json({ 
          success: true,
          message: result.message 
        });
      } else {
        console.log('❌ Calendar transfer failed:', result);
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      console.error('❌ Error transferring room:', error);
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Server error occurred during room transfer.';
      if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
        errorMessage = 'Database field type mismatch. Please contact support.';
      } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        errorMessage = 'Referenced room or booking not found.';
      } else if (error.code === 'ER_DUP_ENTRY') {
        errorMessage = 'Duplicate entry detected.';
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  // Get transfer logs for a booking
  static async getTransferLogs(req, res) {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing bookingId parameter.' 
        });
      }

      const transferLogs = await CalendarModel.getTransferLogs(bookingId);
      res.json(transferLogs);
    } catch (error) {
      console.error('Error fetching transfer logs:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Check room availability for extension
  static async checkExtendRoom(req, res) {
    try {
      const { roomId, checkoutDate, daysToExtend } = req.query;

      if (!roomId || !checkoutDate || !daysToExtend) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await CalendarModel.checkExtendRoom(roomId, checkoutDate, daysToExtend);
      res.json(result);
    } catch (error) {
      console.error('Error checking room availability for extension:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Extend stay
  static async extendStay(req, res) {
    try {
      const { currentRoomId, newRoomId, daysToExtend, bookingId, cost } = req.body;

      if (!currentRoomId || !daysToExtend || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters for extension.' 
        });
      }

      const result = await CalendarModel.extendStay(currentRoomId, newRoomId, daysToExtend, bookingId, cost);
      
      if (result.success) {

        
        res.json({ success: true, message: 'Stay extended successfully!' });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error extending stay:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Get booking extensions
  static async getBookingExtensions(req, res) {
    try {
      const { bookingId } = req.query;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing bookingId parameter.' 
        });
      }

      const extensions = await CalendarModel.getBookingExtensions(bookingId);
      res.json({ success: true, extensions });
    } catch (error) {
      console.error('Error fetching booking extensions:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Remove booking extension
  static async removeBookingExtension(req, res) {
    try {
      const { extensionId, bookingId } = req.body;

      if (!extensionId || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await CalendarModel.removeBookingExtension(extensionId, bookingId);
      res.json(result);
    } catch (error) {
      console.error('Error removing booking extension:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Check late check-out room availability
  static async checkLateCheckRoom(req, res) {
    try {
      const { roomId, checkoutDate, currentBookingId } = req.query;

      if (!roomId || !checkoutDate || !currentBookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await CalendarModel.checkLateCheckRoom(roomId, checkoutDate, currentBookingId);
      res.json(result);
    } catch (error) {
      console.error('Error checking late check-out room availability:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Process late check-out
  static async processLateCheckout(req, res) {
    try {
      const { currentRoomId, newRoomId, bookingId } = req.body;

      if (!currentRoomId || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await CalendarModel.processLateCheckout(currentRoomId, newRoomId, bookingId);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Late check-out processed successfully!',
          lateCheckoutFee: result.lateCheckoutFee,
          isFree: result.isFree
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error processing late check-out:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Get late check-out services
  static async getLateCheckoutServices(req, res) {
    try {
      const { bookingId } = req.query;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing bookingId parameter.' 
        });
      }

      const lateCheckoutServices = await CalendarModel.getLateCheckoutServices(bookingId);
      res.json({ success: true, lateCheckoutServices });
    } catch (error) {
      console.error('Error fetching late check-out services:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Remove late check-out service
  static async removeLateCheckoutService(req, res) {
    try {
      const { serviceId, bookingId } = req.body;

      if (!serviceId || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await CalendarModel.removeLateCheckoutService(serviceId, bookingId);
      res.json(result);
    } catch (error) {
      console.error('Error removing late check-out service:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Reopen cancelled reservation
  static async reopenReservation(req, res) {
    try {
      const { bookingId, action, newStatus, checkInStatus } = req.body;

      if (!bookingId || !action || !newStatus) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      if (action !== 'reopen' || newStatus !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid action or status.' 
        });
      }

      // Validate checkInStatus (0 = late check-in, 1 = regular check-in)
      if (checkInStatus !== 0 && checkInStatus !== 1) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid check-in status. Must be 0 (late) or 1 (regular).' 
        });
      }

      const result = await CalendarModel.reopenReservation(bookingId, newStatus, checkInStatus);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Reservation reopened successfully!',
          newStatus: newStatus,
          checkInStatus: checkInStatus
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error reopening reservation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Remove cancelled reservation
  static async removeReservation(req, res) {
    try {
      const { bookingId, action, setActive } = req.body;

      if (!bookingId || !action || setActive !== 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      if (action !== 'remove') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid action.' 
        });
      }

      const result = await CalendarModel.removeReservation(bookingId);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Reservation removed successfully!'
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error removing reservation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Check-in reservation
  static async checkInReservation(req, res) {
    try {
      const { bookingId, action } = req.body;

      if (!bookingId || !action) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      if (action !== 'check-in') {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid action.' 
        });
      }

      const result = await CalendarModel.checkInReservation(bookingId);
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: 'Guest checked in successfully!',
          newStatus: 'check-In',
          isOccupied: result.isOccupied,
          roomId: result.roomId,
          roomStatus: result.roomStatus
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error checking in reservation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Get Unassigned Rooms page
  static async getUnassignedRooms(req, res) {
    try {
      // Get user from JWT token
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      const currentDate = new Date();
      const queryMonth = parseInt(req.query.month, 10) || currentDate.getMonth();
      const queryYear = parseInt(req.query.year, 10) || currentDate.getFullYear();

      // Get all calendar data in parallel
      const [
        allRooms,
        floors,
        calendarStats
      ] = await Promise.all([
        CalendarModel.getAllRooms(),
        CalendarModel.getFloors(),
        CalendarModel.getCalendarStats()
      ]);

      // Process room data to include status and CSS classes
      const processedRooms = allRooms.map((room) => {
        let status = 'Unknown';
        let statusClass = 'label-secondary';
        const roomStatus = Number(room.ROOM_STATUS);

        switch (roomStatus) {
          case 1:
            status = 'Available';
            statusClass = 'label-success';
            break;
          case 2:
            status = 'Occupied';
            statusClass = 'label-danger';
            break;
          case 3:
            status = 'Under Maintenance';
            statusClass = 'label-secondary';
            break;
          case 4:
            status = 'Cleaning';
            statusClass = 'label-info';
            break;
          default:
            status = 'Unknown';
            statusClass = 'label-warning';
        }

        return {
          ROOM_NUMBER: room.ROOM_NUMBER,
          ROOM_TYPE_NAME: room.ROOM_TYPE || 'N/A',
          ROOM_BED: room.ROOM_BED || 'N/A',
          status,
          statusClass,
        };
      });

      res.render('calendar/unassigned_rooms', {
        title: 'Unassigned Rooms',
        subTitle: 'Unassigned Rooms',
        hideBreadcrumb: true,
        activePage: 'unassigned-rooms',
        user,
        userId,
        tabOrder,
        rooms: processedRooms,
        currentMonth: queryMonth,
        currentYear: queryYear,
        script: `<script>document.body.setAttribute('data-user-id', '${userId}');</script>`
      });
    } catch (error) {
      console.error('Error fetching unassigned rooms data:', error);
      res.status(500).render('error', { message: 'Server error' });
    }
  }

  // Get Unassigned Rooms for FullCalendar
  static async getUnassignedRoomsForCalendar(req, res) {
    try {
      const { start, end } = req.query;

      if (!start || !end) {
        return res.status(400).json({ success: false, message: 'Missing start or end date.' });
      }

      const events = await CalendarModel.getUnassignedRoomsForCalendar(start, end);
      res.json(events);
    } catch (error) {
      console.error('Error fetching unassigned rooms for calendar:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get detailed Unassigned Rooms for a specific date
  static async getDetailedUnassignedRooms(req, res) {
    try {
      const { date } = req.query;

      if (!date) {
        console.log('Missing date parameter');
        return res.status(400).json({ success: false, message: 'Missing date parameter.' });
      }

    
      const result = await CalendarModel.getDetailedUnassignedRooms(date);
      
      if (result.success) {
        res.json({ success: true, bookings: result.bookings });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error fetching detailed unassigned rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // NEW: Check booking overlaps - replaces frontend logic
  static async checkBookingOverlaps(req, res) {
    try {
      const { roomId, checkIn, checkOut, excludeBookingId } = req.query;

      if (!roomId || !checkIn || !checkOut) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters (roomId, checkIn, checkOut).' 
        });
      }

      const overlaps = await CalendarModel.checkBookingOverlaps(
        roomId, 
        checkIn, 
        checkOut, 
        excludeBookingId || null
      );
      
      res.json({ 
        success: true, 
        overlaps: overlaps,
        hasOverlaps: overlaps.length > 0
      });
    } catch (error) {
      console.error('Error checking booking overlaps:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // NEW: Validate booking rules - replaces frontend logic
  static async validateBookingRules(req, res) {
    try {
      const { roomId, checkIn, checkOut, bookingId } = req.query;

      if (!roomId || !checkIn || !checkOut) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters (roomId, checkIn, checkOut).' 
        });
      }

      const conflicts = await CalendarModel.validateBookingRules(
        roomId, 
        checkIn, 
        checkOut, 
        bookingId || null
      );
      
      res.json({ 
        success: true, 
        conflicts: conflicts,
        hasConflicts: conflicts.length > 0
      });
    } catch (error) {
      console.error('Error validating booking rules:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
}

module.exports = CalendarController;