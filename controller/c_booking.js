const BookingModel = require('../models/bookingModel');

class BookingController {
  // Render the main booking page
  static async renderBookingPage(req, res) {
    try {
      // Get user from JWT token (set by middleware)
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('booking/booking', {
        title: 'Bookings',
        subTitle: 'Bookings',
        activePage: 'booking',
        user: user
      });
    } catch (error) {
      console.error('Error rendering booking page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // Render the group booking page
  static async renderGroupBookingPage(req, res) {
    try {
      // Get user from JWT token (set by middleware)
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('booking/group_booking', {
        title: 'Group Bookings',
        subTitle: 'Group Bookings',
        activePage: 'booking',
        user: user
      });
    } catch (error) {
      console.error('Error rendering group booking page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // Get booking data for DataTables
  static async getBookingData(req, res) {
    try {
      const start = parseInt(req.query.start, 10) || 0;   // pagination start
      const length = parseInt(req.query.length, 10) || 10; // pagination length
      const search = req.query.search?.value || '';        // incoming search term
      const draw = req.query.draw || 1;

      // build your "LIKE" term and also capture exact ID
      const likeTerm = `%${search}%`;
      const exactId = search; 

      // sorting setup
      const orderColumnIndex = parseInt(req.query.order?.[0]?.column, 10);
      const orderDirection = req.query.order?.[0]?.dir || 'asc';
      const columns = [
        'c.NAME',
        'r.ROOM_NUMBER',
        'b.CONFIRMATION_NUMBER',
        'b.CHECK_IN_DATE',
        'b.CHECK_OUT_DATE',
        'TOTAL_COST',
        'b.BOOKING_CHANNEL',
        'PAYMENT_STATUS',
        'b.BOOKING_STATUS'
      ];
      const orderByColumn = columns[orderColumnIndex] || 'b.ENCODED_DT';

      // date-filter logic
      const filter = req.query.filter || 'all';
      let dateCondition = '';
      switch (filter.toLowerCase()) {
        case 'today':
          dateCondition = `AND DATE(b.ENCODED_DT) = CURRENT_DATE()`;
          break;
        case 'last3days':
          dateCondition = `
            AND b.ENCODED_DT >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
            AND b.ENCODED_DT <= CURRENT_DATE()
          `;
          break;
        case 'thisweek':
          dateCondition = `AND YEARWEEK(b.ENCODED_DT, 1) = YEARWEEK(CURRENT_DATE(), 1)`;
          break;
        case 'thismonth':
          dateCondition = `
            AND MONTH(b.ENCODED_DT) = MONTH(CURRENT_DATE())
            AND YEAR(b.ENCODED_DT)  = YEAR(CURRENT_DATE())
          `;
          break;
        default:
          dateCondition = '';
      }

      // Get booking data from model
      const result = await BookingModel.getBookingData({
        start,
        length,
        likeTerm,
        exactId,
        orderByColumn,
        orderDirection,
        dateCondition
      });

      res.json({
        draw,
        recordsTotal: result.totalRecords,
        recordsFiltered: result.totalRecords,
        data: result.rows
      });

    } catch (error) {
      console.error('Error fetching booking data:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get booking details by ID
  static async getBookingDetails(req, res) {
    try {
      const bookingID = req.params.bookingID;

      const bookingDetails = await BookingModel.getBookingDetails(bookingID);

      if (!bookingDetails) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      res.json(bookingDetails);

    } catch (error) {
      console.error('Error fetching booking details:', error);
      res.status(500).json({ 
        error: 'Error fetching booking details', 
        details: error.message 
      });
    }
  }

  // Update booking status and room status
  static async updateBookingStatus(req, res) {
    try {
      const { BookingID, status, lateCheckOut } = req.body;

      // console.log("Received update_status request:", { BookingID, status, lateCheckOut });

      // Map BOOKING_STATUS to ROOM_STATUS
      let roomStatus;
      switch (status) {
        case 'check-In':
          roomStatus = 2; // Occupied
          break;
        case 'check-Out':
          roomStatus = 4; // Cleaning
          break;
        case 'cancelled':
          roomStatus = 1; // Available
          break;
        case 'pending':
          roomStatus = 1; // No change
          break;
        default:
          return res.status(400).json({ success: false, error: 'Invalid booking status' });
      }

      const result = await BookingModel.updateBookingStatus({
        bookingID: BookingID,
        status,
        lateCheckOut,
        roomStatus
      });

      res.json({ 
        success: true, 
        message: result.message 
      });

    } catch (error) {
      console.error('Error updating booking status:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // Get floors for dropdown
  static async getFloorsForDropdown(req, res) {
    try {
      const floors = await BookingModel.getFloorsForDropdown();
      res.json(floors);
    } catch (error) {
      console.error('Error fetching floors:', error);
      res.status(500).json({ error: 'Error fetching floors' });
    }
  }

  // Get rooms by floor
  static async getRoomsByFloor(req, res) {
    try {
      const { floor } = req.query;

      if (!floor) {
        return res.status(400).json({ error: 'Floor parameter is required' });
      }

      const rooms = await BookingModel.getRoomsByFloor(floor);
      res.json(rooms);
    } catch (error) {
      console.error('Error fetching rooms for floor:', error);
      res.status(500).json({ error: 'Error fetching rooms' });
    }
  }

  // Get booked dates for a room
  static async getBookedDates(req, res) {
    try {
      const { room_id } = req.query;

      if (!room_id) {
        return res.status(400).json({ error: 'Room ID is required' });
      }

      const bookedDates = await BookingModel.getBookedDates(room_id);
      res.json(bookedDates);
    } catch (error) {
      console.error('Error fetching booked dates:', error);
      res.status(500).json({ 
        error: 'Failed to fetch booked dates. Please try again later.' 
      });
    }
  }

  // Add new booking
  static async addBooking(req, res) {
    try {
      // console.log('Received /add_booking request with body:', JSON.stringify(req.body, null, 2));

      // Standardized variable names from the form
      const {
        room_id,
        fullname,
        number,
        address = '', // Default address to empty string if not provided
        daterange,
        maxOccupants,
        paymentStatus,
        price,
        diffindays,
        guestType,
        guestLevel,
        guestID,
        bookingRoute,
        checkInStatus,
        bookingRemarks,
        agencyID,
        // ✅ Additional for Services (breakfast)
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,

        // ✅ Additional for Transport
        pickupServiceId,     // should be transport ID
        pickupPrice,
        dropoffServiceId,    // should be transport ID
        dropoffPrice
      } = req.body;

      const encodedBy = req.user.userId; // Use JWT user ID instead of session
      const date = new Date();
      const confirmationNumber = 'CONF-' + Math.random().toString(36).substr(2, 9).toUpperCase();

      if (!encodedBy) {
        return res.status(400).json({ success: false, message: 'User is not logged in' });
      }

      // console.log('Received booking data:', req.body);

      // Determine the final booking route
      let finalBookingRoute = bookingRoute;
      if (bookingRoute === 'direct-booking') {
        finalBookingRoute = 'walk-in';
      }
      // console.log('Final Booking Route:', finalBookingRoute);

      // Parse the date range
      const dateRangeParts = daterange.split(' to ');
      const startDateStr = dateRangeParts[0].trim();
      const endDateStr = dateRangeParts[1].split('(')[0].trim();

      // Convert dates to MySQL format
      const moment = require('moment');
      const checkInDate = moment(startDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' 14:00:00';
      const checkOutDate = moment(endDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' 11:00:00';

      // console.log('Check-in date:', checkInDate, 'Check-out date:', checkOutDate);

      // Remove commas from price and convert to a decimal number
      let numericRoomPrice = parseFloat(price.replace(',', ''));

      if (isNaN(numericRoomPrice)) {
        return res.status(400).json({ success: false, message: 'Invalid room price format' });
      }

      // Create booking with all the data
      const result = await BookingModel.addBooking({
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
      });



      res.json({
        success: true,
        message: result.message,
        confirmationNumber: result.confirmationNumber,
        bookingId: result.bookingId
      });

    } catch (error) {
      console.error('Error adding booking:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to create booking' 
      });
    }
  }

  // Get booking details by confirmation number
  static async getBookingByConfirmationNumber(req, res) {
    try {
      const { confirmationNumber } = req.params;

      if (!confirmationNumber) {
        return res.status(400).json({ 
          success: false, 
          message: 'Confirmation number is required' 
        });
      }

      const bookingDetails = await BookingModel.getBookingByConfirmationNumber(confirmationNumber);

      if (!bookingDetails) {
        return res.status(404).json({ 
          success: false, 
          message: 'No booking found with the provided QR code.' 
        });
      }

      res.json({ 
        success: true, 
        data: bookingDetails 
      });

    } catch (error) {
      console.error('Error fetching booking details:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching booking details.' 
      });
    }
  }

  // Get extra service dropdown
  static async getExtraServiceDropdown(req, res) {
    try {
      const services = await BookingModel.getExtraServiceDropdown();
      res.json(services);
    } catch (error) {
      console.error('Error fetching services:', error);
      res.status(500).json({ error: 'Error fetching services' });
    }
  }

  // Save booking services
  static async saveBookingServices(req, res) {
    try {
      const { bookingId, services } = req.body;

      if (!bookingId || !services || services.length === 0) {
        return res.status(400).json({ 
          error: 'Invalid request. Missing booking ID or services.' 
        });
      }

      // Filter out virtual services: -999 (Extended Stay), -101 (Pickup), -102 (Dropoff)
      const validServices = services.filter(s => ![-999, -101, -102].includes(parseInt(s.SERVICE_ID)));
      
      if (validServices.length === 0) {
        return res.status(400).json({ error: 'No valid services to process.' });
      }

      const result = await BookingModel.saveBookingServices({
        bookingId,
        services: validServices,
        userId: req.user.userId // Use JWT user ID instead of session
      });

      res.json({
        success: true,
        message: 'Booking services saved and billing updated successfully!'
      });

    } catch (error) {
      console.error('Error saving booking services:', error);
      res.status(500).json({ 
        error: error.message || 'Error saving booking services.' 
      });
    }
  }

  // Get unpaid balance for a booking
  static async getUnpaidBalance(req, res) {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ 
          error: 'Booking ID is required' 
        });
      }

      const balanceData = await BookingModel.getUnpaidBalance(bookingId);

      // console.log(`✅ Processed Balance Data for Booking ID ${bookingId}:`, balanceData);
      res.json(balanceData);

    } catch (error) {
      console.error('❌ Error fetching unpaid balance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get booking services
  static async getBookingServices(req, res) {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ error: 'Booking ID is required.' });
      }

      const allServices = await BookingModel.getBookingServices(bookingId);

      res.json({
        success: true,
        data: allServices
      });

    } catch (error) {
      console.error('Error fetching booking services + extensions + transport:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  // Update service status
  static async updateServiceStatus(req, res) {
    try {
      const { serviceId, status } = req.body;

      if (!serviceId) {
        return res.status(400).json({ 
          success: false, 
          message: "Service ID is required." 
        });
      }

      if (!status) {
        return res.status(400).json({ 
          success: false, 
          message: "Status is required." 
        });
      }

      const result = await BookingModel.updateServiceStatus(serviceId, status);

      if (!result) {
        return res.status(404).json({ 
          success: false, 
          message: "Service not found." 
        });
      }

      res.json({ 
        success: true, 
        message: "Service status updated successfully." 
      });

    } catch (error) {
      console.error('Error updating service status:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update service status." 
      });
    }
  }

  // Remove service
  static async removeService(req, res) {
    try {
      const { bookingId, serviceId, isExtension, isTransport } = req.body;

      if (!bookingId || serviceId === undefined) {
        return res.status(400).json({ 
          error: 'Invalid request. Missing booking ID or service ID.' 
        });
      }

      const result = await BookingModel.removeService({
        bookingId,
        serviceId,
        isExtension,
        isTransport
      });

      res.json({
        success: true,
        message: result.message,
        totalCost: result.totalCost
      });

    } catch (error) {
      console.error('Error removing service:', error);
      res.status(500).json({ 
        error: error.message || 'Error removing service.' 
      });
    }
  }

  // Get billing information
  static async getBilling(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ 
          error: 'Booking ID is required.' 
        });
      }

      const receiptData = await BookingModel.getBilling(id);

      if (!receiptData) {
        return res.status(404).json({ 
          error: 'Booking not found' 
        });
      }

      // console.log('📦 Sending billing items:', receiptData.items);
      res.json(receiptData);

    } catch (error) {
      console.error('Error fetching billing data:', error);
      res.status(500).json({ 
        error: error.message || 'Error fetching billing data' 
      });
    }
  }

  // Get notifications
  static async getNotifications(req, res) {
    try {
      const notifications = await BookingModel.getNotifications();

      res.json(notifications);

    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Error fetching notifications' });
    }
  }

  // Mark notifications as read
  static async markNotificationsAsRead(req, res) {
    try {
      const result = await BookingModel.markNotificationsAsRead();

      res.json({ 
        success: true, 
        message: 'Notifications marked as read',
        updatedCount: result.affectedRows
      });

    } catch (error) {
      console.error('Error marking notifications as read:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to mark notifications as read' 
      });
    }
  }

  // Process payment
  static async processPayment(req, res) {
    try {
      const { paymentMethod, bookingId } = req.body;
      const encodedBy = req.user.userId; // Use JWT user ID instead of session

      if (!paymentMethod || !bookingId) {
        console.error('Missing fields:', { paymentMethod, bookingId });
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields.' 
        });
      }

      const result = await BookingModel.processPayment({
        paymentMethod,
        bookingId,
        encodedBy
      });

      res.json({ 
        success: true, 
        message: 'Payment and services processed successfully.' 
      });

    } catch (error) {
      console.error('Transaction Error:', error);
      res.status(500).json({ 
        error: 'Transaction failed. Payment not processed.' 
      });
    }
  }

  // Late check-out
  static async lateCheckout(req, res) {
    try {
      const { bookingId, hours } = req.body;

      // Debugging log
      // console.log('Late Check-Out Request:', { bookingId, hours });

      if (!bookingId || !hours) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields.' 
        });
      }

      // Validation: Check if hours exceed 5
      if (hours > 5) {
        return res.status(400).json({
          success: false,
          message: 'Late check-out cannot exceed 5 hours.',
        });
      }

      const result = await BookingModel.lateCheckout({
        bookingId,
        hours
      });

      res.json({
        success: true,
        message: `Check-out extended to ${hours} hour(s)`,
      });

    } catch (error) {
      console.error('Late check-out error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Database error. Please try again later.' 
      });
    }
  }

  // Get guest types
  static async getGuestTypes(req, res) {
    try {
      const guestTypes = await BookingModel.getGuestTypes();

      res.json(guestTypes);

    } catch (error) {
      console.error('Error fetching guest types:', error);
      res.status(500).json({ 
        error: 'Error fetching guest types' 
      });
    }
  }

  // Get guest level
  static async getGuestLevel(req, res) {
    try {
      const guestLevels = await BookingModel.getGuestLevel();

      res.json(guestLevels);

    } catch (error) {
      console.error('Error fetching guest level:', error);
      res.status(500).json({ 
        error: 'Error fetching guest level' 
      });
    }
  }

  // Get pending bookings
  static async getPendingBookings(req, res) {
    try {
      const { room_id } = req.query;

      if (!room_id) {
        return res.status(400).json({ 
          error: 'Room ID is required' 
        });
      }

      const pendingBookings = await BookingModel.getPendingBookings(room_id);

      res.json(pendingBookings);

    } catch (error) {
      console.error('Error fetching pending bookings:', error);
      res.status(500).json({ 
        error: 'Failed to fetch pending bookings' 
      });
    }
  }

  // Search customer
  static async searchCustomer(req, res) {
    try {
      const query = req.query.query;

      if (!query) {
        return res.json([]);
      }

      const customers = await BookingModel.searchCustomer(query);

      res.json(customers);

    } catch (error) {
      console.error('Error fetching customer data:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  // Get available rooms
  static async getAvailableRooms(req, res) {
    try {
      const { startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ 
          success: false, 
          error: 'Start date and end date are required' 
        });
      }

      const availableRooms = await BookingModel.getAvailableRooms({
        startDate,
        endDate
      });

      res.json({ 
        success: true, 
        rooms: availableRooms 
      });

    } catch (error) {
      console.error('Database query failed:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Database query failed' 
      });
    }
  }

  // Get room details
  static async getRoomDetails(req, res) {
    try {
      const { roomId } = req.body;

      if (!roomId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Room ID is required' 
        });
      }

      const roomDetails = await BookingModel.getRoomDetails(roomId);

      if (!roomDetails) {
        return res.json({ 
          success: false, 
          message: 'Room not found' 
        });
      }

      res.json({ 
        success: true, 
        roomDetails 
      });

    } catch (error) {
      console.error('Database query failed:', error);
      res.json({ 
        success: false, 
        message: 'Database query failed' 
      });
    }
  }

  // Update room payment status
  static async updateRoomPaymentStatus(req, res) {
    try {
      const { bookingId, status } = req.body;

      // console.log("🔹 Received Request to Update Payment Status");
      // console.log("🔹 Booking ID:", bookingId);
      // console.log("🔹 New Status:", status);

      if (!bookingId) {
        console.error("❌ Error: Booking ID is missing.");
        return res.status(400).json({ 
          success: false, 
          message: "Booking ID is required." 
        });
      }

      const result = await BookingModel.updateRoomPaymentStatus({
        bookingId,
        status
      });

      // console.log("✅ Payment status updated successfully in the database.");
      // console.log("🔹 Affected Rows:", result.affectedRows);

      // Get the io instance from the app
      const io = req.app.get('io');
      
      // Emit Socket.IO event for real-time dashboard updates
      if (io) {
        io.to('dashboard-room').emit('dashboard-refresh', {
          action: 'payment-status-updated',
          message: 'Payment status updated successfully',
          data: { bookingId, status }
        });
      }

      res.json({ 
        success: true, 
        message: "Total Room Cost marked as PAID." 
      });

    } catch (error) {
      console.error("❌ Error updating room payment status:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update payment status." 
      });
    }
  }

  // Update extend payment status
  static async updateExtendPaymentStatus(req, res) {
    try {
      const { bookingId, status } = req.body;

      // console.log("🔹 Received Request to Update Extend Payment Status");
      // console.log("🔹 Booking ID:", bookingId);
      // console.log("🔹 New Status:", status);

      if (!bookingId) {
        console.error("❌ Error: Booking ID is missing.");
        return res.status(400).json({ 
          success: false, 
          message: "Booking ID is required." 
        });
      }

      const result = await BookingModel.updateExtendPaymentStatus({
        bookingId,
        status
      });

      // console.log("✅ Extend payment status updated successfully in the database.");
      // console.log("🔹 Affected Rows:", result.affectedRows);

      // Get the io instance from the app
      const io = req.app.get('io');
      
      // Emit Socket.IO event for real-time dashboard updates
      if (io) {
        io.to('dashboard-room').emit('dashboard-refresh', {
          action: 'payment-status-updated',
          message: 'Extend payment status updated successfully',
          data: { bookingId, status }
        });
      }

      res.json({ 
        success: true, 
        message: "Extend Payment Status updated successfully." 
      });

    } catch (error) {
      console.error("❌ Error updating extend payment status:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update extend payment status." 
      });
    }
  }

  // Find consecutive rooms
  static async findConsecutiveRooms(req, res) {
    try {
      let { startDate, endDate, neededRooms, floorNumber } = req.body;

      if (!startDate || !endDate || !neededRooms) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing parameters" 
        });
      }

      const result = await BookingModel.findConsecutiveRooms({
        startDate,
        endDate,
        neededRooms,
        floorNumber
      });

      res.json(result);

    } catch (error) {
      console.error("Error in find_consecutive_rooms:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error querying available rooms" 
      });
    }
  }

  // Add group booking
  static async addGroupBooking(req, res) {
    try {
      const {
        selectedRooms, selectedRoomPrice, qty, daterange, groupName, groupContact, numberOfRooms, paymentStatus, bookingRoute, guestType, guestLevel, checkInStatus,
        // Group-level services
        breakfastAdultQty, breakfastAdultPrice, breakfastAdultId, breakfastKidQty, breakfastKidPrice, breakfastKidId, pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice
      } = req.body;

      const encodedBy = req.user.userId; // Use JWT user ID instead of session

      if (!encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'User is not logged in' 
        });
      }

      // console.log('📌 Received group booking data:', req.body);

      const result = await BookingModel.addGroupBooking({
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
        encodedBy
      });

      res.json({ 
        success: true, 
        message: 'Group Booking added successfully!', 
        confirmationNumber: result.confirmationNumber 
      });

    } catch (error) {
      console.error('❌ Error in addGroupBooking:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Error adding group booking' 
      });
    }
  }

  // Get group booking data
  static async getGroupBookingData(req, res) {
    try {
      const filter = req.query.filter || 'all';

      const groupBookingData = await BookingModel.getGroupBookingData(filter);

      res.json(groupBookingData);

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Database error" 
      });
    }
  }

  // Get group booking details
  static async getGroupBookingDetails(req, res) {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({ 
          error: "Group ID is required" 
        });
      }

      const bookingDetails = await BookingModel.getGroupBookingDetails(groupId);

      if (!bookingDetails || bookingDetails.length === 0) {
        return res.status(404).json({ 
          error: "No individual bookings found for this group." 
        });
      }

      res.json({ 
        bookingDetails 
      });

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Internal Server Error" 
      });
    }
  }

  // Get group billing details
  static async getGroupBillingDetails(req, res) {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({ 
          error: "Group ID is required" 
        });
      }

      const billingDetails = await BookingModel.getGroupBillingDetails(groupId);

      if (!billingDetails.roomBillingDetails.length && !billingDetails.serviceBillingDetails.length) {
        return res.status(404).json({ 
          error: "No billing records found for this group." 
        });
      }

      res.json(billingDetails);

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Database error" 
      });
    }
  }

  // Check group payment status
  static async checkGroupPaymentStatus(req, res) {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({ 
          error: "Group ID is required" 
        });
      }

      const paymentStatus = await BookingModel.checkGroupPaymentStatus(groupId);

      res.json({ 
        allPaid: paymentStatus.allPaid 
      });

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Database error" 
      });
    }
  }

  // Process group payment
  static async groupPayment(req, res) {
    try {
      const { bookingIDs, amountPaid, paymentMethod } = req.body;
      const encodedBy = req.user.userId;

      if (!bookingIDs || amountPaid <= 0 || !paymentMethod) {
        return res.status(400).json({ 
          error: "Invalid payment data." 
        });
      }

      const result = await BookingModel.groupPayment({ 
        bookingIDs, 
        amountPaid, 
        paymentMethod, 
        encodedBy 
      });

      res.json({ 
        success: true, 
        message: "Payment recorded successfully." 
      });

    } catch (error) {
      console.error("Transaction Error:", error);
      res.status(500).json({ 
        error: "Transaction failed. Payment not processed." 
      });
    }
  }

  // Get all bookings
  static async getBookings(req, res) {
    try {
      const bookings = await BookingModel.getBookings();
      res.json(bookings);

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Database error" 
      });
    }
  }

  // Get all rooms
  static async getRooms(req, res) {
    try {
      const rooms = await BookingModel.getRooms();
      res.json(rooms);

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Database error while fetching rooms" 
      });
    }
  }

  // Cancel booking
  static async cancelBooking(req, res) {
    try {
      const { bookingId, reason, manual, manualRefund } = req.body;
      const encodedBy = req.user.userId;

      if (!bookingId || !encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing booking ID or user session.' 
        });
      }

      const result = await BookingModel.cancelBooking({ 
        bookingId, 
        reason, 
        manual, 
        manualRefund, 
        encodedBy 
      });



      res.json({ 
        success: true, 
        message: 'Booking cancelled successfully.' 
      });

    } catch (error) {
      console.error("Cancellation error:", error);
      
      if (error.message === 'Booking not found.') {
        return res.status(404).json({ 
          success: false, 
          message: 'Booking not found.' 
        });
      }
      
      if (error.message === 'Billing not found.') {
        return res.status(404).json({ 
          success: false, 
          message: 'Billing not found.' 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to cancel booking.' 
      });
    }
  }

  // Get booking summary for Telegram bot
  static async getBookingSummary(req, res) {
    try {
      const summary = await BookingModel.getBookingSummary();
      res.json(summary);

    } catch (error) {
      console.error('Error fetching booking summary:', error);
      res.status(500).json({ 
        error: 'Failed to fetch booking summary' 
      });
    }
  }

  // Get all agencies
  static async getAgency(req, res) {
    try {
      const agencies = await BookingModel.getAgency();
      res.json(agencies);

    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ 
        error: "Server error" 
      });
    }
  }

  // Generate invoice PDF
  static async generateInvoice(req, res) {
    try {
      const { bookingId } = req.params;
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
      } : null;

      if (!bookingId) {
        return res.status(400).json({ 
          error: "Booking ID is required" 
        });
      }

      const invoiceData = await BookingModel.generateInvoice({ bookingId, user });
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': invoiceData.pdfBuffer.length
      });
      res.send(invoiceData.pdfBuffer);

    } catch (error) {
      console.error('❌ Error generating invoice PDF:', error);
      
      if (error.message === 'Booking not found') {
        return res.status(404).send('Booking not found');
      }

      res.status(500).send('Internal Server Error');
    }
  }

  // Generate voucher PDF
  static async generateVoucher(req, res) {
    try {
      const data = req.body;
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
      } : { FULLNAME: 'System User' };

      if (!data || !data.voucherNo) {
        return res.status(400).json({ 
          error: "Voucher data is required" 
        });
      }

      const voucherData = await BookingModel.generateVoucher({ data, user });
      
      const download = req.query.download === '1';
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="voucher-${data.voucherNo}.pdf"`,
        'Content-Length': voucherData.pdfBuffer.length
      });
      res.send(voucherData.pdfBuffer);

    } catch (error) {
      console.error('Voucher Preview Error:', error);
      res.status(500).send('Voucher preview failed.');
    }
  }

  // Generate group voucher PDF
  static async generateGroupVoucher(req, res) {
    try {
      const data = req.body;
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
      } : { FULLNAME: 'System User' };

      if (!data || !data.voucherNo) {
        return res.status(400).json({ 
          error: "Group voucher data is required" 
        });
      }

      const voucherData = await BookingModel.generateGroupVoucher({ data, user });
      
      const download = req.query.download === '1';
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="group-voucher-${data.voucherNo}.pdf"`,
        'Content-Length': voucherData.pdfBuffer.length
      });
      res.send(voucherData.pdfBuffer);

    } catch (error) {
      console.error('Group Voucher Preview Error:', error);
      res.status(500).send('Group voucher preview failed.');
    }
  }

  // Get breakfast prices
  static async getBreakfastPrices(req, res) {
    try {
      const breakfastPrices = await BookingModel.getBreakfastPrices();
      res.json(breakfastPrices);
    } catch (error) {
      console.error('Error fetching breakfast prices:', error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }

  // Get pick and drop services
  static async getPickDrop(req, res) {
    try {
      const pickDropServices = await BookingModel.getPickDrop();
      res.json(pickDropServices);
    } catch (error) {
      console.error('Error fetching pick and drop services:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = BookingController;
