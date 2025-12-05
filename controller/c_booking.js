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

  // Render the agency booking page
  static async renderAgencyBookingPage(req, res) {
    try {
      // Get user from JWT token (set by middleware)
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('booking/agency_booking', {
        title: 'Agency Bookings',
        subTitle: 'Agency Bookings',
        activePage: 'booking',
        user: user
      });
    } catch (error) {
      console.error('Error rendering agency booking page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // Render the all booking page
  static async renderAllBookingPage(req, res) {
    try {
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('booking/all_booking', {
        title: 'All Bookings',
        subTitle: 'All Bookings',
        activePage: 'booking',
        user: user
      });
    } catch (error) {
      console.error('Error rendering all booking page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // Render the unpaid booking page
  static async renderUnpaidBookingPage(req, res) {
    try {
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
        PERMISSIONS: req.user.PERMISSIONS
      } : null;

      res.render('booking/unpaid_booking', {
        title: 'Unpaid Bookings',
        subTitle: 'Unpaid Bookings',
        activePage: 'booking',
        user: user
      });
    } catch (error) {
      console.error('Error rendering unpaid booking page:', error);
      res.status(500).render('error/500', {
        title: 'Server Error',
        subTitle: '500 Error'
      });
    }
  }

  // Get booking data for DataTables
  static async getBookingDataEnhanced(req, res) {
    try {
      const hasPaging = typeof req.query.start !== 'undefined' && typeof req.query.length !== 'undefined';
      const start = hasPaging ? parseInt(req.query.start, 10) : null;   // pagination start
      const length = hasPaging ? parseInt(req.query.length, 10) : null; // pagination length
      const draw = req.query.draw || 1;

      // sorting setup (unchanged)
      const orderColumnIndex = parseInt(req.query.order?.[0]?.column, 10);
      const orderDirection = req.query.order?.[0]?.dir || 'asc';
      const columns = [
        'c.NAME',
        'r.ROOM_NUMBER',
        'b.CONFIRMATION_NUMBER',
        'b.CHECK_IN_DATE',
        'b.CHECK_OUT_DATE',
        'TOTAL_COST',
        'BALANCE',
        'b.BOOKING_CHANNEL',
        'b.BOOKING_STATUS'
      ];
      const orderByColumn = columns[orderColumnIndex] || 'b.ENCODED_DT';

      // date-filter logic (enhanced with custom date range)
      const filter = req.query.filter || 'all';
      const scope = (req.query.scope || '').toLowerCase(); // 'single' | 'all' | 'agency'
      const dateFrom = req.query.dateFrom;
      const dateTo = req.query.dateTo;
      let dateCondition = '';
      let channelCondition = '';
      let groupCondition = '';
      
      // Check if custom date range is provided
      if (dateFrom && dateTo && filter === 'custom') {
        dateCondition = `AND DATE(b.ENCODED_DT) >= '${dateFrom}' AND DATE(b.ENCODED_DT) <= '${dateTo}'`;
      } else {
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
          case 'agency':
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          case 'agency_today':
            dateCondition = `AND DATE(b.ENCODED_DT) = CURRENT_DATE()`;
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          case 'agency_last3days':
            dateCondition = `
              AND b.ENCODED_DT >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 DAY)
              AND b.ENCODED_DT <= CURRENT_DATE()
            `;
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          case 'agency_thisweek':
            dateCondition = `AND YEARWEEK(b.ENCODED_DT, 1) = YEARWEEK(CURRENT_DATE(), 1)`;
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          case 'agency_thismonth':
            dateCondition = `
              AND MONTH(b.ENCODED_DT) = MONTH(CURRENT_DATE())
              AND YEAR(b.ENCODED_DT)  = YEAR(CURRENT_DATE())
            `;
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          case 'agency_all':
            channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
            break;
          default:
            dateCondition = '';
        }
      }

      // Check if there's a highlight parameter (specific booking ID to show)
      const highlightBookingId = req.query.highlight;
      // Flag to indicate if we should use individual calculation for group bookings
      const useIndividualCalculation = scope === 'single' && highlightBookingId && highlightBookingId !== '0' && highlightBookingId !== '';
      
      // Apply grouping scope rules
      if (scope === 'single') {
        // Single tab: only standalone bookings
        // BUT: if highlightBookingId is provided, allow that specific booking even if it's part of a group
        if (highlightBookingId && highlightBookingId !== '0' && highlightBookingId !== '') {
          // Validate and sanitize the booking ID (must be a positive integer)
          const bookingIdInt = parseInt(highlightBookingId, 10);
          if (!isNaN(bookingIdInt) && bookingIdInt > 0) {
            groupCondition = `AND (b.GROUP_BOOKING_ID IS NULL OR b.IDNo = ${bookingIdInt})`;
          } else {
            groupCondition = `AND b.GROUP_BOOKING_ID IS NULL`;
          }
        } else {
          groupCondition = `AND b.GROUP_BOOKING_ID IS NULL`;
        }
      } else if (scope === 'all') {
        // All tab: show non-group bookings plus one representative row per group
        groupCondition = `AND (b.GROUP_BOOKING_ID IS NULL OR b.IDNo = (
          SELECT MIN(b2.IDNo)
          FROM booking b2
          WHERE b2.GROUP_BOOKING_ID = b.GROUP_BOOKING_ID
        ))`;
      } else if (scope === 'agency') {
        // Agency tab: only agency bookings
        groupCondition = `AND b.GROUP_BOOKING_ID IS NULL`;
        channelCondition = `AND b.BOOKING_CHANNEL = 'agency'`;
      } else {
        groupCondition = '';
      }

      // If we are on Single scope and no explicit channel filter is applied, exclude agency rows
      if (scope === 'single' && !channelCondition) {
        channelCondition = `AND b.BOOKING_CHANNEL != 'agency'`;
      }

      // Get booking data from model with enhanced structure
      const result = await BookingModel.getBookingDataEnhanced({
        start,
        length,
        orderByColumn,
        orderDirection,
        dateCondition,
        channelCondition,
        groupCondition,
        useIndividualCalculation // Pass flag to use individual calculation for group bookings in single view
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

  // New: Checkout endpoint (supports individual or group scope)
  static async checkoutBookings(req, res) {
    try {
      const { bookingId, scope = 'individual', hasRefund = false, refundAmount = 0, penaltyAmount = 0, applyDiscount = false } = req.body;
      const encodedBy = req.user?.userId;

      if (!bookingId) {
        return res.status(400).json({ success: false, message: 'bookingId is required' });
      }

      let bookingIds = [bookingId];
      if (scope === 'group') {
        // Find all bookings within the same group as the provided bookingId
        const result = await BookingModel.getGroupBookingIdsByBooking(bookingId);
        if (result && Array.isArray(result) && result.length > 0) {
          bookingIds = result;
        }
      }

      const out = await BookingModel.checkoutBookings({ 
        bookingIds, 
        encodedBy,
        refundBookingId: bookingId,
        refundAmount: hasRefund ? parseFloat(refundAmount) || 0 : 0,
        penaltyAmount: parseFloat(penaltyAmount) || 0,
        applyDiscount: applyDiscount === true || applyDiscount === 'true'
      });
      
      // Emit Socket.IO event for calendar real-time updates
      const io = req.app.get('io');
      if (io && out && out.success) {
        try {
          // Fetch updated booking details for each checked out booking
          const updatedBookings = [];
          for (const id of bookingIds) {
            const bookingDetails = await BookingModel.getBookingDetails(id);
            if (bookingDetails) {
              updatedBookings.push({
                bookingId: id,
                checkOutDate: bookingDetails.CHECK_OUT_DATE,
                bookingStatus: 'check-Out',
                ...bookingDetails
              });
            }
          }
          
          if (updatedBookings.length > 0) {
            const eventData = {
              action: 'booking-checked-out',
              message: 'Booking(s) checked out successfully',
              data: {
                bookings: updatedBookings,
                bookingIds: bookingIds,
                timestamp: new Date().toISOString()
              }
            };
            
            // Emit to dashboard and calendar rooms
            io.to('dashboard-room').emit('dashboard-refresh', eventData);
            io.emit('calendar-booking-updated', eventData);
            console.log('📡 Emitted booking-checked-out event for bookings:', bookingIds);
          }
        } catch (err) {
          console.error('Error emitting checkout socket event:', err);
        }
      }
      
      return res.json({ 
        success: true, 
        message: out.message, 
        data: out.days,
        refundInfo: out.refundInfo || null,
        penaltyInfo: out.penaltyInfo || null
      });
    } catch (error) {
      console.error('❌ Checkout error:', error);
      return res.status(500).json({ success: false, message: error.message || 'Checkout failed' });
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
        paidAmount, // New field for paid amount
        price,
        diffindays,
        guestType,
        guestLevel,
        guestID,
        bookingRoute,
        checkInStatus,
        checkOutStatus,
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
      dropoffPrice,
      
      // ✅ Additional for Direct Reservations
      bedCount,
      directReservationFlag,
      reservationFee,
      discount,
      lateCheckoutFee
    } = req.body;

      const encodedBy = req.user.userId; // Use JWT user ID instead of session
      const date = new Date();

      if (!encodedBy) {
        return res.status(400).json({ success: false, message: 'User is not logged in' });
      }

      // Calculate payment status based on paid amount
      const paidAmountNum = parseFloat(paidAmount) || 0;
      const roomPriceNum = parseFloat(price) || 0;
      const reservationFeeNum = parseFloat(reservationFee) || 0;
      const discountNum = parseFloat(discount) || 0;
      const lateCheckoutFeeNum = parseFloat(lateCheckoutFee) || 0;
      
      // Calculate services costs
      const breakfastAdultCost = (parseInt(breakfastAdultQty) || 0) * (parseFloat(breakfastAdultPrice) || 0);
      const breakfastKidCost = (parseInt(breakfastKidQty) || 0) * (parseFloat(breakfastKidPrice) || 0);
      const pickupCost = parseFloat(pickupPrice) || 0;
      const dropoffCost = parseFloat(dropoffPrice) || 0;
      
      // Calculate total amount (matching frontend calculation)
      const roomTotal = roomPriceNum * parseInt(diffindays) || 1;
      const servicesTotal = breakfastAdultCost + breakfastKidCost + pickupCost + dropoffCost;
      const subtotal = roomTotal + servicesTotal + lateCheckoutFeeNum;
      const totalAmount = subtotal + reservationFeeNum - discountNum;
      
      // Determine payment status
      let paymentStatus;
      if (paidAmountNum <= 0) {
        paymentStatus = 'unpaid';
      } else if (paidAmountNum >= totalAmount) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }

      // console.log('Received booking data:', req.body);

      // Parse the date range first
      const dateRangeParts = daterange.split(' to ');
      const startDateStr = dateRangeParts[0].trim();
      const endDateStr = dateRangeParts[1].split('(')[0].trim();

      // Check if this is a direct reservation
      const isDirectReservation = directReservationFlag === 'true';

      // Generate confirmation number based on Hotel_Old format
      const moment = require('moment');
      const checkInDateFormatted = moment(startDateStr, 'MMM DD, YYYY').format('YYYYMMDD');
      let confirmationNumber;
      
      if (isDirectReservation) {
        // For direct reservations, use current time instead of room number
        const currentTime = new Date().toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit'
        }).replace(/:/g, '');
        confirmationNumber = checkInDateFormatted + 'UR' + currentTime;
      } else {
        // For regular bookings, check if room_id exists and create confirmation number
        if (!room_id) {
          return res.status(400).json({ success: false, message: 'Room ID is required for regular bookings' });
        }
        
        // Query room number to create confirmation number
        // This will be enhanced in the model function
        confirmationNumber = checkInDateFormatted + '0' + 'ROOM'; // Temporary, will be updated in model
      }
      
      // Determine the final booking route
      let finalBookingRoute = bookingRoute;
      if (bookingRoute === 'direct-booking' || bookingRoute === 'direct-reservation') {
        finalBookingRoute = 'walk-in';
      }
      // console.log('Final Booking Route:', finalBookingRoute);
      // console.log('Is Direct Reservation:', isDirectReservation);

      // Convert dates to MySQL format
      const checkInDate = moment(startDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + ' 14:00:00';
      
      // Set checkout time based on checkOutStatus
      let checkOutTime;
      if (checkOutStatus == 1) {
        // Late Check Out: Set to 11:00 PM
        checkOutTime = ' 23:00:00';
      } else {
        // Regular Check Out: Set to 11:00 AM
        checkOutTime = ' 11:00:00';
      }
      const checkOutDate = moment(endDateStr, 'MMM DD, YYYY').format('YYYY-MM-DD') + checkOutTime;

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
        paidAmount,
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
      });



      // Check if check-in date is today and emit socket event
      const today = moment().format('YYYY-MM-DD');
      const checkInDateOnly = checkInDate.split(' ')[0]; // Get date part only
      
      if (checkInDateOnly === today && result.bookingId) {
        // Emit Socket.IO event for new booking with check-in today
        const io = req.app.get('io');
        if (io) {
          // Fetch booking details in dashboard format (same as getTodayCheckInDetails)
          try {
            const DashboardModel = require('../models/dashboardModel');
            const todayCheckInBookings = await DashboardModel.getTodayCheckInDetails();
            // Find the newly created booking
            const newBooking = todayCheckInBookings.find(b => b.BookingID == result.bookingId);
            
            if (newBooking) {
              const eventData = {
                action: 'new-booking-checkin-today',
                message: 'New booking with check-in today has been created',
                data: {
                  booking: newBooking,
                  bookingId: result.bookingId,
                  timestamp: new Date().toISOString()
                }
              };
              
              io.to('dashboard-room').emit('dashboard-refresh', eventData);
              console.log('📡 Emitted new-booking-checkin-today event for booking:', result.bookingId);
            }
          } catch (err) {
            console.error('Error fetching booking details for socket emission:', err);
          }
        }
      }

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

  // Apply or update manual discount for an occupied booking
  static async applyDiscount(req, res) {
    try {
      const { bookingId, amount, remarks } = req.body;
      const editedBy = req.user?.userId || 'system';
      if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount < 0) {
        return res.status(400).json({ error: 'Invalid discount amount' });
      }

      const result = await BookingModel.applyDiscount({ bookingId, amount: numericAmount, remarks: remarks || '', editedBy });
      res.json({ success: true, result });
    } catch (error) {
      console.error('❌ Failed to apply discount:', error);
      res.status(500).json({ error: 'Failed to apply discount' });
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
      const { bookingId, serviceId, isExtension, isTransport, removalReason } = req.body;

      if (!bookingId || serviceId === undefined) {
        return res.status(400).json({ 
          error: 'Invalid request. Missing booking ID or service ID.' 
        });
      }

      const result = await BookingModel.removeService({
        bookingId,
        serviceId,
        isExtension,
        isTransport,
        removalReason,
        userId: req.user?.userId || null
      });

      console.log('Remove service - User ID:', req.user?.userId, 'Removal reason:', removalReason);

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
      const { paymentMethod, bookingId, paymentNotes, paymentAmount } = req.body;
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
        paymentNotes: paymentNotes || '', // Include payment notes, default to empty string
        paymentAmount: paymentAmount || null, // Include payment amount for partial payments
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

      const result = await BookingModel.getAvailableRooms({
        startDate,
        endDate
      });

      res.json({ 
        success: true, 
        rooms: result.rooms,
        unassignedBookings: result.unassignedBookings
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
      let { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus, excludeGroupBookingId } = req.body;
      const neededRoomsCount = parseInt(neededRooms, 10);
      const requiredBed1 = parseInt(bed1Needed, 10) || 0;
      const requiredBed2 = parseInt(bed2Needed, 10) || 0;
      const totalRequiredBeds = requiredBed1 + requiredBed2;
      const normalizedBookingRoute = bookingRoute || 'walk-in';

      if (!startDate || !endDate || !neededRoomsCount) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
      }

      if (totalRequiredBeds && totalRequiredBeds !== neededRoomsCount) {
        return res.status(400).json({ success: false, message: 'Bed requirement total must equal needed rooms.' });
      }

      const result = await BookingModel.findConsecutiveRooms({
        startDate,
        endDate,
        neededRooms: neededRoomsCount,
        floorNumber,
        bed1Needed: requiredBed1,
        bed2Needed: requiredBed2,
        bookingRoute: normalizedBookingRoute,
        checkInStatus,
        checkOutStatus,
        excludeGroupBookingId
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

  static async findConsecutiveRoomsEdit(req, res) {
    try {
      let { startDate, endDate, neededRooms, floorNumber, bed1Needed = 0, bed2Needed = 0, bookingRoute, checkInStatus, checkOutStatus, excludeGroupBookingId, currentGroupBookingId } = req.body;
      const neededRoomsCount = parseInt(neededRooms, 10);
      const requiredBed1 = parseInt(bed1Needed, 10) || 0;
      const requiredBed2 = parseInt(bed2Needed, 10) || 0;
      const totalRequiredBeds = requiredBed1 + requiredBed2;
      const normalizedBookingRoute = bookingRoute || 'walk-in';

      if (!startDate || !endDate || !neededRoomsCount) {
        return res.status(400).json({ success: false, message: 'Missing parameters' });
      }

      if (totalRequiredBeds && totalRequiredBeds !== neededRoomsCount) {
        return res.status(400).json({ success: false, message: 'Bed requirement total must equal needed rooms.' });
      }

      const result = await BookingModel.findConsecutiveRoomsEdit({
        startDate,
        endDate,
        neededRooms: neededRoomsCount,
        floorNumber,
        bed1Needed: requiredBed1,
        bed2Needed: requiredBed2,
        bookingRoute: normalizedBookingRoute,
        checkInStatus,
        checkOutStatus,
        excludeGroupBookingId,
        currentGroupBookingId
      });

      res.json(result);

    } catch (error) {
      console.error("Error in find_consecutive_rooms_edit:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error querying available rooms for edit" 
      });
    }
  }

  static async addGroupBooking(req, res) {
    try {
      const {
        selectedRooms,
        selectedRoomPrice,
        qty,
        daterange,
        groupName,
        groupContact,
        numberOfRooms,
        paidAmount,
        bookingRoute,
        guestType,
        guestLevel,
        checkInStatus,
        checkOutStatus,
        remarks,
        agencyId,
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,
        breakfastIndividual: breakfastIndividualValue,
        pickupServiceId,
        pickupPrice,
        dropoffServiceId,
        dropoffPrice,
        discount,
        individualBilling: individualBillingValue,
        perRoomDiscounts,
        directReservationFlag,
        lateCheckoutFee = 0
      } = req.body;

      // Convert individualBilling checkbox value to boolean (inverted logic)
      // If checked = individual billing, if unchecked = consolidated/master billing (default)
      console.log('🔄 Backend Controller - Received individualBillingValue:', individualBillingValue, 'Type:', typeof individualBillingValue);
      const consolidatedBilling = individualBillingValue !== 'on'; // Inverted: unchecked = consolidated
      console.log('🔄 Backend Controller - Converted to consolidatedBilling:', consolidatedBilling, '(Individual:', !consolidatedBilling, ')');
      
      // Convert individual service flag (only for Breakfast)
      const breakfastIndividual = breakfastIndividualValue === 'on';

      const encodedBy = req.user?.userId;
      if (!encodedBy) {
        return res.status(400).json({ success: false, message: 'User is not logged in' });
      }

      // Calculate payment status based on paid amount for group booking
      const paidAmountNum = parseFloat(paidAmount) || 0;
      const discountNum = parseFloat(discount) || 0;
      
      // For group booking, we need to calculate total from room prices
      const roomPrices = selectedRoomPrice.split(',').map(p => parseFloat(p) || 0);
      const totalRoomPrice = roomPrices.reduce((sum, price) => sum + price, 0) * parseInt(qty);
      
      // Calculate services total
      const breakfastAdultTotal = parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice) || 0;
      const breakfastKidTotal = parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice) || 0;
      const pickupTotal = parseFloat(pickupPrice) || 0;
      const dropoffTotal = parseFloat(dropoffPrice) || 0;
      const servicesTotal = breakfastAdultTotal + breakfastKidTotal + pickupTotal + dropoffTotal;
      
      // Calculate total amount (rooms + services - discount)
      const totalAmount = totalRoomPrice + servicesTotal - discountNum;
      
      // Determine payment status
      let paymentStatus;
      if (paidAmountNum <= 0) {
        paymentStatus = 'unpaid';
      } else if (paidAmountNum >= totalAmount) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }

      console.log(`Group Booking Payment Status Calculation: Total=${totalAmount}, Paid=${paidAmountNum}, Status=${paymentStatus}`);

      const date = new Date();

      const result = await BookingModel.addGroupBooking({
        selectedRooms,
        selectedRoomPrice,
        qty,
        daterange,
        groupName,
        groupContact,
        numberOfRooms,
        paymentStatus,
        paidAmount: paidAmountNum,
        bookingRoute,
        guestType,
        guestLevel,
        checkInStatus,
        checkOutStatus,
        remarks,
        agencyId,
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,
        breakfastIndividual,
        pickupServiceId,
        pickupPrice,
        dropoffServiceId,
        dropoffPrice,
        discount,
        consolidatedBilling,
        perRoomDiscounts,
        lateCheckoutFee,
        encodedBy,
        date,
        isDirectReservation: directReservationFlag === 'true'
      });

      return res.json(result);
    } catch (error) {
      console.error('❌ Error in addGroupBooking:', error);
      return res.status(500).json({ success: false, message: error.message || 'Error inserting group booking' });
    }
  }

  // Get edit group booking details
  static async getEditGroupBooking(req, res) {
    try {
      const { groupBookingId } = req.params;

      if (!groupBookingId) {
        return res.status(400).json({
          success: false,
          message: 'Group booking ID is required'
        });
      }

      const groupBookingDetails = await BookingModel.getEditGroupBookingDetails(groupBookingId);

      if (!groupBookingDetails) {
        return res.status(404).json({
          success: false,
          message: 'Group booking not found'
        });
      }

      res.json({
        success: true,
        booking: groupBookingDetails
      });

    } catch (error) {
      console.error('Error fetching edit group booking details:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching group booking details'
      });
    }
  }

  // Update group booking
  static async updateGroupBooking(req, res) {
    try {
      const {
        groupBookingId,
        selectedRooms,
        selectedRoomPrice,
        qty,
        daterange,
        groupName,
        groupContact,
        numberOfRooms,
        paidAmount,
        bookingRoute,
        guestType,
        guestLevel,
        checkInStatus,
        checkOutStatus,
        remarks,
        agencyId,
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,
        breakfastIndividual: breakfastIndividualValue,
        pickupServiceId,
        pickupPrice,
        dropoffServiceId,
        dropoffPrice,
        discount,
        individualBilling: individualBillingValue,
        lateCheckoutFee = 0
      } = req.body;

      if (!groupBookingId) {
        return res.status(400).json({
          success: false,
          message: 'Group booking ID is required'
        });
      }

      const encodedBy = req.user?.userId;
      if (!encodedBy) {
        return res.status(400).json({
          success: false,
          message: 'User is not logged in'
        });
      }

      // Convert individual service flag (only for Breakfast)
      const breakfastIndividual = breakfastIndividualValue === 'on';

      // Compute payment status based on paidAmount and recomputed total (rooms + services - discount)
      const paidAmountNum = parseFloat(paidAmount) || 0;
      const discountNum = parseFloat(discount) || 0;
      const roomPrices = (selectedRoomPrice || '').split(',').map(p => parseFloat(p) || 0);
      const totalRoomPrice = roomPrices.reduce((sum, price) => sum + price, 0) * (parseInt(qty, 10) || 0);
      const servicesTotal = (parseFloat(breakfastAdultQty) * parseFloat(breakfastAdultPrice) || 0)
        + (parseFloat(breakfastKidQty) * parseFloat(breakfastKidPrice) || 0)
        + (parseFloat(pickupPrice) || 0)
        + (parseFloat(dropoffPrice) || 0);
      const lateCheckoutFeeNum = parseFloat(lateCheckoutFee) || 0;
      const totalAmount = totalRoomPrice + servicesTotal + lateCheckoutFeeNum - discountNum;
      let paymentStatus;
      if (paidAmountNum <= 0) paymentStatus = 'unpaid';
      else if (paidAmountNum >= totalAmount) paymentStatus = 'paid';
      else paymentStatus = 'partial';

      const date = new Date();

      const result = await BookingModel.updateGroupBooking({
        groupBookingId,
        selectedRooms,
        selectedRoomPrice,
        qty,
        daterange,
        groupName,
        groupContact,
        numberOfRooms,
        paymentStatus,
        paidAmount,
        bookingRoute,
        guestType,
        guestLevel,
        checkInStatus,
        checkOutStatus,
        remarks,
        agencyId,
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,
        breakfastIndividual,
        pickupServiceId,
        pickupPrice,
        dropoffServiceId,
        dropoffPrice,
        discount,
        consolidatedBilling: individualBillingValue !== 'on', // Inverted logic: unchecked = consolidated
        lateCheckoutFee: lateCheckoutFeeNum,
        encodedBy,
        date
      });


      return res.json(result);

    } catch (error) {
      console.error('Error updating group booking:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating group booking'
      });
    }
  }

  // Get group booking data
  static async getGroupBookingData(req, res) {
    try {
      const filter = req.query.filter || 'all';
      const dateFrom = req.query.dateFrom;
      const dateTo = req.query.dateTo;
      const groupId = req.query.groupId || req.query.highlight || null;

      const groupBookingData = await BookingModel.getGroupBookingData(filter, dateFrom, dateTo, groupId);

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

      const details = await BookingModel.getGroupBookingDetails(groupId);

      if (!details || !details.bookingDetails || details.bookingDetails.length === 0) {
        return res.status(404).json({ 
          error: "No individual bookings found for this group." 
        });
      }

      res.json(details);

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
      const { bookingIDs, amountPaid, paymentMethod, paymentNotes } = req.body;
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
        paymentNotes,
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
      const { bookingId, reason, manualRefund, manualCancellationFee } = req.body;
      const encodedBy = req.user.userId;

      if (!bookingId || !encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing booking ID or user session.' 
        });
      }

      const parsedRefund = parseFloat(manualRefund);
      if (!Number.isFinite(parsedRefund) || parsedRefund < 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid refund amount.'
        });
      }

      const parsedFee = parseFloat(manualCancellationFee);
      if (!Number.isFinite(parsedFee) || parsedFee < 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid cancellation fee.'
        });
      }

      const result = await BookingModel.cancelBooking({ 
        bookingId, 
        reason, 
        manualRefund: parsedRefund,
        manualCancellationFee: parsedFee,
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

  // Cancel group booking
  static async cancelGroupBooking(req, res) {
    try {
      const { groupId, reason, manual, manualRefund } = req.body;
      const encodedBy = req.user.userId;

      if (!groupId || !encodedBy) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing group ID or user session.' 
        });
      }

      const result = await BookingModel.cancelGroupBooking({ 
        groupId, 
        reason, 
        manual, 
        manualRefund, 
        encodedBy 
      });

      res.json({ 
        success: true, 
        message: 'Group booking cancelled successfully.' 
      });

    } catch (error) {
      console.error("Group cancellation error:", error);
      
      if (error.message === 'Group booking not found.') {
        return res.status(404).json({ 
          success: false, 
          message: 'Group booking not found.' 
        });
      }
      
      if (error.message === 'Group has active bookings.') {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot cancel group booking with active check-ins.' 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: 'Failed to cancel group booking.' 
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
      
      // Use confirmation number for filename (same as voucher)
      const filename = `invoice-${invoiceData.confirmationNumber}.pdf`;
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename=${filename}`,
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

      // If bookingId is provided instead of full voucher data, fetch it from database
      if (!data.voucherNo && data.bookingId) {
        const voucherData = await BookingModel.getVoucherData(data.bookingId);
        
        if (!voucherData) {
          return res.status(404).send('Booking not found');
        }

        // Generate PDF using the same method as manual download
        const { chromium } = require('playwright');
        const path = require('path');
        const ejs = require('ejs');
        const fs = require('fs').promises;

        // Render EJS template
        const templatePath = path.join(__dirname, '../views/booking/pdf/booking_voucher.ejs');
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        
        // Get voucher number
        const voucherNo = voucherData.confirmationNumber || data.bookingId;
        
        // Get billing data for totals FIRST - we'll get breakfast/pickup/dropoff from here
        console.log('🔍 [VOUCHER] Fetching billing data for bookingId:', data.bookingId);
        const billingData = await BookingModel.getBilling(data.bookingId);
        
        if (!billingData) {
          console.error('❌ [VOUCHER] Billing data not found for bookingId:', data.bookingId);
          return res.status(404).send('Billing data not found');
        }
        
        console.log('📊 [VOUCHER] Billing data received:', {
          subTotal: billingData.subTotal,
          reservationFee: billingData.reservationFee,
          discountAmount: billingData.discountAmount,
          itemsCount: billingData.items ? billingData.items.length : 0,
          items: billingData.items ? billingData.items.map(item => ({
            description: item.description,
            basePrice: item.basePrice,
            qty: item.qty,
            subTotal: item.subTotal,
            serviceId: item.serviceId
          })) : []
        });
        
        // Get breakfast, pickup, and dropoff from billingData.items (more reliable than getVoucherData query)
        let breakfastAdult = 0;
        let breakfastKid = 0;
        let pickup = 0;
        let dropoff = 0;
        let otherServices = []; // Collect other services for remarks
        
        if (billingData && billingData.items && Array.isArray(billingData.items)) {
          console.log('🍳 [VOUCHER] Processing billing items for services:', billingData.items.map(item => ({
            description: item.description,
            basePrice: item.basePrice,
            qty: item.qty,
            subTotal: item.subTotal,
            serviceId: item.serviceId
          })));
          
          // Find breakfast, pickup, dropoff, and other services from items
          billingData.items.forEach(item => {
            const desc = (item.description || '').toLowerCase();
            const serviceId = item.serviceId;
            const itemDescription = item.description || '';
            
            // Breakfast - check description (case insensitive)
            if (desc.includes('breakfast') && desc.includes('adult')) {
              breakfastAdult = parseInt(item.qty) || 0;
              console.log('🍳 Found breakfast adult:', breakfastAdult, 'qty:', item.qty, 'from item:', itemDescription, 'serviceId:', serviceId);
            }
            // Check for Kid/Kids breakfast
            else if (desc.includes('breakfast') && (desc.includes('kid') || desc.includes('kids') || desc.includes('child'))) {
              breakfastKid = parseInt(item.qty) || 0;
              console.log('🍳 Found breakfast kid:', breakfastKid, 'qty:', item.qty, 'from item:', itemDescription, 'serviceId:', serviceId);
            }
            // Pickup (Service ID 90 or description contains pick-up)
            else if (serviceId === 90 || desc.includes('pick-up') || desc.includes('pickup') || desc.includes('pick up')) {
              pickup = parseFloat(item.subTotal) || parseFloat(item.basePrice) || 0;
            }
            // Dropoff (Service ID 91 or description contains drop-off)
            else if (serviceId === 91 || desc.includes('drop-off') || desc.includes('dropoff') || desc.includes('drop off')) {
              dropoff = parseFloat(item.subTotal) || parseFloat(item.basePrice) || 0;
            }
            // Late checkout (Service ID 72) - skip, handled separately
            else if (serviceId === 72 || desc.includes('late checkout') || desc.includes('late check-out')) {
              // Skip late checkout - handled separately
            }
            // Room items - ONLY if explicitly room-related AND no serviceId
            // Must match: bedroom, room, suite, or room type names, AND no serviceId
            else if (!item.serviceId && (
              desc.includes('bedroom') || 
              desc.includes('single bedroom') ||
              desc.includes('double bedroom') ||
              desc.includes('twin bedroom') ||
              desc.includes('deluxe bedroom') ||
              desc.includes('suite') ||
              (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
            )) {
              // This is a room item - skip (handled in roomCharges)
              console.log('🏠 [VOUCHER] Skipping room item:', itemDescription);
            }
            // Extended stay - skip
            else if (desc.includes('extended') || desc.includes('extension')) {
              // Skip extended stay
            }
            // Cancellation - skip
            else if (desc.includes('cancellation')) {
              // Skip cancellation fee
            }
            // Other services - collect for remarks (everything else is a service)
            else if (itemDescription && itemDescription.trim()) {
              const serviceName = itemDescription.trim();
              const serviceQty = parseInt(item.qty) || 1;
              otherServices.push({
                name: serviceName,
                qty: serviceQty
              });
              console.log('📦 [VOUCHER] Found other service:', serviceName, 'qty:', serviceQty, 'serviceId:', serviceId);
            }
          });
        }
        
        // Fallback: try from voucherData if still 0
        if (breakfastAdult === 0) {
          breakfastAdult = parseInt(voucherData.breakfastAdultQty) || 0;
        }
        if (breakfastKid === 0) {
          breakfastKid = parseInt(voucherData.breakfastKidQty) || 0;
        }
        if (pickup === 0) {
          pickup = parseFloat(voucherData.pickupPrice) || 0;
        }
        if (dropoff === 0) {
          dropoff = parseFloat(voucherData.dropoffPrice) || 0;
        }
        
        const lateCheckoutFee = parseFloat(voucherData.lateCheckoutFee) || 0;
        
        console.log('🍳🚗 [VOUCHER] Service values:', {
          breakfastAdult_from_voucher: voucherData.breakfastAdultQty,
          breakfastKid_from_voucher: voucherData.breakfastKidQty,
          breakfastAdult: breakfastAdult,
          breakfastKid: breakfastKid,
          pickupPrice_raw: voucherData.pickupPrice,
          dropoffPrice_raw: voucherData.dropoffPrice,
          pickup: pickup,
          dropoff: dropoff,
          totalPax: breakfastAdult + breakfastKid,
          willShowBreakfast: (breakfastAdult + breakfastKid) > 0,
          willShowPickup: pickup > 0,
          willShowDropoff: dropoff > 0
        });
        
        // Calculate total from billing data
        const subTotal = billingData.subTotal || 0;
        const reservationFee = billingData.reservationFee || 0;
        const discountAmount = billingData.discountAmount || 0;
        
        // Use roomCharges if provided, otherwise calculate from billingData items
        let roomCharges = 0;
        if (data.roomCharges !== undefined && data.roomCharges !== null && data.roomCharges !== '') {
          roomCharges = parseFloat(data.roomCharges.toString().replace(/[,\s₱₹$]/g, '')) || 0;
          console.log('💰 [VOUCHER] Using roomCharges from form data:', roomCharges);
        } else {
          console.log('🔍 [VOUCHER] Calculating roomCharges from billingData items...');
          // Calculate room charges from billingData items (room items only, excluding extensions)
          if (billingData.items && Array.isArray(billingData.items)) {
            // Sum all room items - ONLY items that are explicitly room-related
            // Must have room-related description AND no serviceId
            const roomItems = billingData.items.filter(item => {
              if (!item.description) return false;
              const desc = item.description.toLowerCase();
              // Must be room-related AND no serviceId
              const isRoomItem = !item.serviceId && (
                desc.includes('bedroom') || 
                desc.includes('single bedroom') ||
                desc.includes('double bedroom') ||
                desc.includes('twin bedroom') ||
                desc.includes('deluxe bedroom') ||
                desc.includes('suite') ||
                (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
              );
              return isRoomItem;
            });
            console.log('🏠 [VOUCHER] Filtered room items:', roomItems.map(item => ({
              description: item.description,
              basePrice: item.basePrice,
              qty: item.qty,
              subTotal: item.subTotal
            })));
            roomCharges = roomItems.reduce((sum, item) => sum + (item.subTotal || 0), 0);
            console.log('💰 [VOUCHER] Room charges from items:', roomCharges);
            
            // If still 0, try to get from first room item or calculate from basePrice * qty
            if (roomCharges === 0 && roomItems.length > 0) {
              const firstRoom = roomItems[0];
              roomCharges = (firstRoom.basePrice || 0) * (firstRoom.qty || 0);
              console.log('💰 [VOUCHER] Calculated from first room item:', roomCharges, '(basePrice:', firstRoom.basePrice, 'x qty:', firstRoom.qty, ')');
            }
          }
          
          // Fallback: query directly from billing table
          if (roomCharges === 0) {
            console.log('🔍 [VOUCHER] Room charges still 0, querying billing table...');
            const { queryDatabasePromise } = require('../config/database');
            const roomChargesQuery = `
              SELECT COALESCE(SUM(ROOM_CHARGE * QTY), 0) AS roomCharges
              FROM billing
              WHERE BOOKING_ID = ? AND ACTIVE = 1
            `;
            const roomChargesResult = await queryDatabasePromise(roomChargesQuery, [data.bookingId]);
            roomCharges = parseFloat(roomChargesResult?.[0]?.roomCharges || 0);
            console.log('💰 [VOUCHER] Room charges from billing table query:', roomCharges);
            console.log('📊 [VOUCHER] Query result:', roomChargesResult);
          }
        }
        
        // Use servicesTotal if provided, otherwise calculate from billingData items
        let servicesTotal = 0;
        if (data.servicesTotal !== undefined && data.servicesTotal !== null && data.servicesTotal !== '') {
          servicesTotal = parseFloat(data.servicesTotal.toString().replace(/[,\s₱₹$]/g, '')) || 0;
          console.log('🛎️ [VOUCHER] Using servicesTotal from form data:', servicesTotal);
        } else {
          console.log('🔍 [VOUCHER] Calculating servicesTotal from billingData items...');
          // Calculate services total from billingData items
          // Services = everything that's NOT a room item, extended stay, or cancellation
          if (billingData.items && Array.isArray(billingData.items)) {
            const serviceItems = billingData.items.filter(item => {
              if (!item.description) return false;
              const desc = (item.description || '').toLowerCase();
              
              // Exclude room items (must be explicitly room-related AND no serviceId)
              const isRoomItem = !item.serviceId && (
                desc.includes('bedroom') || 
                desc.includes('single bedroom') ||
                desc.includes('double bedroom') ||
                desc.includes('twin bedroom') ||
                desc.includes('deluxe bedroom') ||
                desc.includes('suite') ||
                (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
              );
              
              // Exclude extended stay and cancellation
              const isExcluded = desc.includes('extended') || desc.includes('extension') || desc.includes('cancellation');
              
              // Everything else is a service
              return !isRoomItem && !isExcluded;
            });
            console.log('🛎️ [VOUCHER] Filtered service items:', serviceItems.map(item => ({
              description: item.description,
              serviceId: item.serviceId,
              subTotal: item.subTotal
            })));
            servicesTotal = serviceItems.reduce((sum, item) => sum + (item.subTotal || 0), 0);
            console.log('🛎️ [VOUCHER] Services total from items:', servicesTotal);
          }
          
          // Fallback: query directly from booking_service table
          if (servicesTotal === 0) {
            console.log('🔍 [VOUCHER] Services total still 0, querying booking_service table...');
            const { queryDatabasePromise } = require('../config/database');
            const servicesTotalQuery = `
              SELECT COALESCE(SUM(TOTAL_COST), 0) AS servicesTotal
              FROM booking_service
              WHERE BOOKING_ID = ? 
                AND ACTIVE = 1
                AND SERVICE_ID != 72
            `;
            const servicesTotalResult = await queryDatabasePromise(servicesTotalQuery, [data.bookingId]);
            servicesTotal = parseFloat(servicesTotalResult?.[0]?.servicesTotal || 0);
            console.log('🛎️ [VOUCHER] Services total from booking_service table query:', servicesTotal);
            console.log('📊 [VOUCHER] Query result:', servicesTotalResult);
          }
        }
        
        console.log('✅ [VOUCHER] Final values:', {
          roomCharges,
          servicesTotal,
          subTotal,
          reservationFee,
          discountAmount,
          total: subTotal + reservationFee - discountAmount
        });
        
        // Total amount
        const total = subTotal + reservationFee - discountAmount;
        
        // Use paidAmount if provided from form data, otherwise use voucherData (ensure non-negative)
        let paidAmount = 0;
        if (data.paidAmount !== undefined && data.paidAmount !== null && data.paidAmount !== '') {
          paidAmount = Math.max(0, parseFloat(data.paidAmount.toString().replace(/[,\s₱₹$]/g, '')) || 0);
        } else {
          paidAmount = Math.max(0, parseFloat(voucherData.paidAmount) || 0);
        }
        
        // Calculate balance
        const balance = Math.max(0, total - paidAmount);

        // Format remarks - template will automatically add:
        // - "Room Accommodation" (if not already in remarks)
        // - Breakfast info (if breakfastAdult + breakfastKid > 0)
        // - "With Pick-Up" (if pickup > 0)
        // - "With Drop-off" (if dropoff > 0)
        // So we just pass the remarks from database as-is
        const formattedRemarks = voucherData.remarks || '';
        
        console.log('📝 [VOUCHER] Remarks and Services:', {
          original: voucherData.remarks,
          formatted: formattedRemarks,
          breakfastAdult,
          breakfastKid,
          pickup,
          dropoff,
          otherServices: otherServices.map(s => `${s.qty}x ${s.name}`),
          pickupPrice: voucherData.pickupPrice,
          dropoffPrice: voucherData.dropoffPrice,
          willShowBreakfast: (breakfastAdult + breakfastKid) > 0,
          willShowPickup: pickup > 0,
          willShowDropoff: dropoff > 0,
          otherServicesCount: otherServices.length
        });

        // Load logo as base64 for Playwright
        const logoPath = path.join(__dirname, '../public/img/Logo-Black.JPG');
        let imageUrl = '';
        try {
          if (require('fs').existsSync(logoPath)) {
            const imageBase64 = require('fs').readFileSync(logoPath, 'base64');
            imageUrl = `data:image/jpeg;base64,${imageBase64}`;
            console.log('✅ [VOUCHER] Logo loaded as base64');
          } else {
            console.error('❌ [VOUCHER] Logo file not found:', logoPath);
          }
        } catch (error) {
          console.error('❌ [VOUCHER] Error loading logo:', error);
        }

        // Render the HTML
        const html = await ejs.render(templateContent, {
          voucherNo,
          fullname: voucherData.fullname,
          dateFrom: voucherData.dateFrom,
          dateTo: voucherData.dateTo,
          roomNumber: voucherData.roomNumber || 'Unassigned',
          roomType: voucherData.roomType || 'Unassigned',
          remarks: formattedRemarks, // ✅ Pass formatted remarks (template will add Room Accommodation, Pick-up, Drop-off)
          breakfastAdult,
          breakfastKid,
          pickup,
          dropoff,
          otherServices, // ✅ Pass other services array for template to display
          reservationFee: voucherData.reservationFee || 0,
          discount: voucherData.discount || 0,
          checkOutStatus: voucherData.checkOutStatus,
          lateCheckoutFee,
          total,
          paidAmount,
          balance,
          roomCharges,
          servicesTotal,
          encodedBy: user.FULLNAME,
          imageUrl: imageUrl
        });

        // Generate PDF with playwright
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        const pdfBuffer = await page.pdf({ 
          format: 'A4',
          printBackground: true,
          margin: { top: '0', bottom: '0', left: '0', right: '0' }
        });
        await browser.close();

        // Send PDF
        const filename = `voucher-${voucherNo}.pdf`;
        const download = req.query.download === '1';
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
          'Content-Length': pdfBuffer.length.toString()
        });
        res.send(pdfBuffer);
        return;
      }

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

  // Generate group invoice PDF
  static async generateGroupInvoice(req, res) {
    try {
      const { groupId } = req.params;
      const user = req.user ? { FULLNAME: req.user.FULLNAME } : null;

      if (!groupId) {
        return res.status(400).json({ error: 'Group ID is required' });
      }

      const invoiceData = await BookingModel.generateGroupInvoice({ groupId, user });

      const filename = `group-invoice-${invoiceData.confirmationNumber || 'unknown'}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename=${filename}`,
        'Content-Length': invoiceData.pdfBuffer.length
      });
      res.send(invoiceData.pdfBuffer);
    } catch (error) {
      console.error('❌ Error generating group invoice PDF:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  // Generate group voucher PDF
  static async generateGroupVoucher(req, res) {
    try {
      const data = req.body;
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
      } : { FULLNAME: 'System User' };

      if (!data) {
        return res.status(400).json({ 
          success: false,
          error: "Group voucher data is required" 
        });
      }

      // Generate voucher number if not provided
      if (!data.voucherNo) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        data.voucherNo = `GV${yyyy}${mm}${dd}${hours}${minutes}`;
      }

      const voucherData = await BookingModel.generateGroupVoucher({ data, user });
      
      const download = req.query.download === '1';
      const filename = `group-voucher-${data.voucherNo}.pdf`;
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Content-Length': voucherData.pdfBuffer.length.toString()
      });
      res.send(voucherData.pdfBuffer);

    } catch (error) {
      console.error('Group Voucher Preview Error:', error);
      res.status(500).json({
        success: false,
        error: 'Group voucher preview failed.',
        message: error.message
      });
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

  // Get available rooms by bed count for direct reservations
  static async getAvailableRoomsByBedCount(req, res) {
    try {
      const { startDate, endDate, bedCount } = req.body;
      
      if (!startDate || !endDate || !bedCount) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: startDate, endDate, bedCount'
        });
      }

      const availableRooms = await BookingModel.getAvailableRoomsByBedCount(startDate, endDate, bedCount);
      
      res.json({
        success: true,
        rooms: availableRooms
      });
    } catch (error) {
      console.error('Error fetching available rooms by bed count:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching available rooms'
      });
    }
  }

  // Assign room to direct reservation
  static async assignRoomToDirectReservation(req, res) {
    try {
      const { bookingId, roomId, roomNumber, roomType, bedCount, price, floor, paymentStatus, paidAmount } = req.body;
      const encodedBy = req.user?.userId || null;
      
      if (!bookingId || !roomId || !roomNumber) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: bookingId, roomId, roomNumber'
        });
      }

      const result = await BookingModel.assignRoomToDirectReservation({
        bookingId,
        roomId,
        roomNumber,
        roomType,
        bedCount,
        price,
        floor,
        paymentStatus,
        paidAmount,
        encodedBy
      });

      if (result.success) {
        res.json({
          success: true,
          message: `Room ${roomNumber} assigned successfully to direct reservation`
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to assign room'
        });
      }
    } catch (error) {
      console.error('Error assigning room to direct reservation:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while assigning room'
      });
    }
  }

  // Get direct reservation details (Hotel_Old compatibility)
  static async getDirectReservationDetails(req, res) {
    try {
      const { bookingId } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameter: bookingId'
        });
      }

      const bookingDetails = await BookingModel.getDirectReservationDetails(bookingId);

      if (!bookingDetails) {
        return res.status(404).json({
          success: false,
          message: 'Direct reservation not found'
        });
      }

      res.json({ success: true, bookingDetails });
    } catch (error) {
      console.error('Error fetching direct reservation details:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error while fetching booking details'
      });
    }
  }

  // Hotel_Old compatibility: POST body version of get booking services
  static async getBookingServicesPost(req, res) {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: 'Booking ID is required.' });
      }
      const allServices = await BookingModel.getBookingServices(bookingId);
      res.json(allServices);
    } catch (error) {
      console.error('Error fetching booking services (POST):', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  }

  // Alias to support underscore URL used by Hotel_Old scripts
  static async assignRoomToDirectReservationAlias(req, res) {
    // Map roomPrice -> price if provided
    if (req.body && req.body.roomPrice && !req.body.price) {
      req.body.price = req.body.roomPrice;
    }
    return BookingController.assignRoomToDirectReservation(req, res);
  }

  // ==================== EDIT BOOKING FUNCTIONS ====================

  // Get booking details for editing
  static async getEditBookingDetails(req, res) {
    try {
      const bookingId = req.params.id;

      const bookingDetails = await BookingModel.getEditBookingDetails(bookingId);

      if (!bookingDetails) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      res.json({ success: true, booking: bookingDetails });

    } catch (error) {
      console.error('Error fetching booking details for edit:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching booking details' 
      });
    }
  }

  // Update existing booking
  static async updateBooking(req, res) {
    try {
      const bookingId = req.params.id;
      console.log('Received edit_booking request for ID:', bookingId);

      const {
        room_id, fullname, number, daterange, maxOccupants,
        paidAmount, price, diffindays, guestType, guestLevel,
        bookingRoute, checkInStatus, checkOutStatus, bookingRemarks, agencyID, bedCount,
        breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
        breakfastKidQty, breakfastKidPrice, breakfastKidId,
        pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
        discount, lateCheckoutFee,
        // Frontend already computes paymentStatus (unpaid/partial/paid)
        paymentStatus
      } = req.body;

      const editedBy = req.user.userId; // Use JWT user ID

      if (!editedBy) {
        return res.status(400).json({ success: false, message: 'User is not logged in' });
      }

      // Use paymentStatus coming from frontend (computeEditTotal),
      // which is based on TOTAL (room + services + late checkout - discount)
      const finalPaymentStatus = paymentStatus || 'unpaid';

      const result = await BookingModel.updateBooking({
        bookingId,
        room_id,
        fullname,
        number,
        daterange,
        maxOccupants,
        paidAmount,
        paymentStatus: finalPaymentStatus,
        price,
        diffindays,
        guestType,
        guestLevel,
        bookingRoute,
        checkInStatus,
        checkOutStatus,
        bookingRemarks,
        agencyID,
        bedCount,
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
        discount,
        lateCheckoutFee,
        editedBy
      });

      res.json({ 
        success: true, 
        message: result.message,
        bookingId: bookingId
      });

    } catch (error) {
      console.error('❌ Error updating booking:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Error updating booking' 
      });
    }
  }

  // Get available rooms by floor for edit booking
  static async getAvailableRoomsByFloor(req, res) {
    try {
      const { floor, checkInDate, checkOutDate, excludeBookingId } = req.body;

      console.log('getAvailableRoomsByFloor request:', { floor, checkInDate, checkOutDate, excludeBookingId });

      if (!floor || !checkInDate || !checkOutDate) {
        return res.status(400).json({
          error: 'Floor, check-in date, and check-out date are required'
        });
      }

      const availableRooms = await BookingModel.getAvailableRoomsByFloor({
        floor,
        checkInDate,
        checkOutDate,
        excludeBookingId
      });

      // console.log('Available rooms response:', availableRooms);

      res.json(availableRooms);

    } catch (error) {
      console.error('Error fetching available rooms by floor:', error);
      res.status(500).json({
        error: 'Error fetching available rooms'
      });
    }
  }

  // ==================== REMARKS FUNCTIONS ====================

  // Add a new remark
  static async addRemark(req, res) {
    try {
      const { bookingId, category, remarkText } = req.body;
      const encodedBy = req.user.userId;

      // Validate required fields
      if (!bookingId || !category || !remarkText) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required: bookingId, category, remarkText'
        });
      }

      // Add remark using model
      const result = await BookingModel.addRemark({
        bookingId,
        category,
        remarkText,
        encodedBy
      });

      if (result.success) {
        res.json({
          success: true,
          message: 'Remark added successfully',
          remarkId: result.remarkId
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Failed to add remark'
        });
      }
    } catch (error) {
      console.error('Error adding remark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get remarks by booking ID
  static async getRemarksByBooking(req, res) {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      // Get remarks using model
      const remarks = await BookingModel.getRemarksByBooking(bookingId);

      res.json({
        success: true,
        remarks: remarks
      });
    } catch (error) {
      console.error('Error fetching remarks:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Group-level remarks: list all remarks from all bookings in the group, plus group_booking.REMARKS as a virtual entry
  static async getGroupRemarksByGroup(req, res) {
    try {
      const { groupId } = req.params;
      if (!groupId) return res.status(400).json({ success: false, message: 'Group ID is required' });

      const remarks = await BookingModel.getGroupRemarksByGroup(groupId);
      return res.json({ success: true, remarks });
    } catch (err) {
      console.error('Error fetching group remarks:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Add a group remark: attaches to the first booking in the group and mirrors to group_booking.REMARKS
  static async addGroupRemark(req, res) {
    try {
      const { groupId, category, remarkText } = req.body;
      const encodedBy = req.user.userId;
      if (!groupId || !category || !remarkText) {
        return res.status(400).json({ success: false, message: 'groupId, category and remarkText are required' });
      }
      const result = await BookingModel.addGroupRemark({ groupId, category, remarkText, encodedBy });
      if (result.success) return res.json(result);
      return res.status(500).json({ success: false, message: result.message || 'Failed to add group remark' });
    } catch (err) {
      console.error('Error adding group remark:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Update a remark
  static async updateRemark(req, res) {
    try {
      const { remarkId } = req.params;
      const { remarkText } = req.body;
      const editedBy = req.user.userId;

      if (!remarkText) {
        return res.status(400).json({
          success: false,
          message: 'Remark text is required'
        });
      }

      // Update remark using model
      const result = await BookingModel.updateRemark({
        remarkId,
        remarkText,
        editedBy
      });

      if (result.success) {
        res.json({
          success: true,
          message: 'Remark updated successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Failed to update remark'
        });
      }
    } catch (error) {
      console.error('Error updating remark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete a remark
  static async deleteRemark(req, res) {
    try {
      const { remarkId } = req.params;

      if (!remarkId) {
        return res.status(400).json({
          success: false,
          message: 'Remark ID is required'
        });
      }

      // Delete remark using model
      const result = await BookingModel.deleteRemark(remarkId);

      if (result.success) {
        res.json({
          success: true,
          message: 'Remark deleted successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Failed to delete remark'
        });
      }
    } catch (error) {
      console.error('Error deleting remark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }


  // Get voucher data for modal display
  static async getVoucherData(req, res) {
    try {
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      const voucherData = await BookingModel.getVoucherData(bookingId);

      if (!voucherData) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      res.json({
        success: true,
        data: voucherData
      });

    } catch (error) {
      console.error('Error fetching voucher data:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching voucher data'
      });
    }
  }

  // Get group voucher data
  static async getGroupVoucherData(req, res) {
    try {
      const { groupId } = req.params;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: 'Group ID is required'
        });
      }

      const voucherData = await BookingModel.getGroupVoucherData(groupId);

      if (!voucherData) {
        return res.status(404).json({
          success: false,
          message: 'Group booking not found'
        });
      }

      res.json({
        success: true,
        data: voucherData
      });

    } catch (error) {
      console.error('Error fetching group voucher data:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching group voucher data'
      });
    }
  }

  // Generate voucher PDF
  static async generateVoucherPDF(req, res) {
    try {
      const { bookingId } = req.params;
      const download = req.query.download === '1';

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required'
        });
      }

      const voucherData = await BookingModel.getVoucherData(bookingId);

      if (!voucherData) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }

      // Use playwright to generate PDF from EJS template
      const { chromium } = require('playwright');
      const path = require('path');
      const ejs = require('ejs');
      const fs = require('fs').promises;

      // Get encoded by user
      const user = req.user ? {
        FULLNAME: req.user.FULLNAME,
      } : { FULLNAME: 'System User' };

      // Render EJS template
      const templatePath = path.join(__dirname, '../views/booking/pdf/booking_voucher.ejs');
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      
      // Get voucher number
      const voucherNo = voucherData.confirmationNumber || bookingId;
      
      // Get billing data for totals FIRST - we'll get pickup/dropoff/breakfast from here
      console.log('🔍 [VOUCHER PDF] Fetching billing data for bookingId:', bookingId);
      const billingData = await BookingModel.getBilling(bookingId);
      
        // Get breakfast, pickup, and dropoff from billingData.items (more reliable than getVoucherData query)
        let breakfastAdult = 0;
        let breakfastKid = 0;
        let pickup = 0;
        let dropoff = 0;
        let otherServices = []; // Collect other services for remarks
        
        if (billingData && billingData.items && Array.isArray(billingData.items)) {
          console.log('🍳 [VOUCHER PDF] Processing billing items for services:', billingData.items.map(item => ({
            description: item.description,
            basePrice: item.basePrice,
            qty: item.qty,
            subTotal: item.subTotal,
            serviceId: item.serviceId
          })));
          
          // Find breakfast, pickup, dropoff, and other services from items
          billingData.items.forEach(item => {
            const desc = (item.description || '').toLowerCase();
            const serviceId = item.serviceId;
            const itemDescription = item.description || '';
            
            // Breakfast - check description (case insensitive)
            if (desc.includes('breakfast') && desc.includes('adult')) {
              breakfastAdult = parseInt(item.qty) || 0;
              console.log('🍳 Found breakfast adult:', breakfastAdult, 'qty:', item.qty, 'from item:', itemDescription, 'serviceId:', serviceId);
            }
            // Check for Kid/Kids breakfast
            else if (desc.includes('breakfast') && (desc.includes('kid') || desc.includes('kids') || desc.includes('child'))) {
              breakfastKid = parseInt(item.qty) || 0;
              console.log('🍳 Found breakfast kid:', breakfastKid, 'qty:', item.qty, 'from item:', itemDescription, 'serviceId:', serviceId);
            }
            // Pickup (Service ID 90 or description contains pick-up)
            else if (serviceId === 90 || desc.includes('pick-up') || desc.includes('pickup') || desc.includes('pick up')) {
              pickup = parseFloat(item.subTotal) || parseFloat(item.basePrice) || 0;
            }
            // Dropoff (Service ID 91 or description contains drop-off)
            else if (serviceId === 91 || desc.includes('drop-off') || desc.includes('dropoff') || desc.includes('drop off')) {
              dropoff = parseFloat(item.subTotal) || parseFloat(item.basePrice) || 0;
            }
            // Late checkout (Service ID 72) - skip, handled separately
            else if (serviceId === 72 || desc.includes('late checkout') || desc.includes('late check-out')) {
              // Skip late checkout - handled separately
            }
            // Room items - ONLY if explicitly room-related AND no serviceId
            // Must match: bedroom, room, suite, or room type names, AND no serviceId
            else if (!item.serviceId && (
              desc.includes('bedroom') || 
              desc.includes('single bedroom') ||
              desc.includes('double bedroom') ||
              desc.includes('twin bedroom') ||
              desc.includes('deluxe bedroom') ||
              desc.includes('suite') ||
              (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
            )) {
              // This is a room item - skip (handled in roomCharges)
              console.log('🏠 [VOUCHER PDF] Skipping room item:', itemDescription);
            }
            // Extended stay - skip
            else if (desc.includes('extended') || desc.includes('extension')) {
              // Skip extended stay
            }
            // Cancellation - skip
            else if (desc.includes('cancellation')) {
              // Skip cancellation fee
            }
            // Other services - collect for remarks (everything else is a service)
            else if (itemDescription && itemDescription.trim()) {
              const serviceName = itemDescription.trim();
              const serviceQty = parseInt(item.qty) || 1;
              otherServices.push({
                name: serviceName,
                qty: serviceQty
              });
              console.log('📦 [VOUCHER PDF] Found other service:', serviceName, 'qty:', serviceQty, 'serviceId:', serviceId);
            }
          });
        }
      
      // Fallback: try from voucherData if still 0
      if (breakfastAdult === 0) {
        breakfastAdult = parseInt(voucherData.breakfastAdultQty) || 0;
      }
      if (breakfastKid === 0) {
        breakfastKid = parseInt(voucherData.breakfastKidQty) || 0;
      }
      if (pickup === 0) {
        pickup = parseFloat(voucherData.pickupPrice) || 0;
      }
      if (dropoff === 0) {
        dropoff = parseFloat(voucherData.dropoffPrice) || 0;
      }
      
      const lateCheckoutFee = parseFloat(voucherData.lateCheckoutFee) || 0;
      
      console.log('🍳🚗 [VOUCHER PDF] Service values:', {
        breakfastAdult_from_voucher: voucherData.breakfastAdultQty,
        breakfastKid_from_voucher: voucherData.breakfastKidQty,
        breakfastAdult: breakfastAdult,
        breakfastKid: breakfastKid,
        pickupPrice_raw: voucherData.pickupPrice,
        dropoffPrice_raw: voucherData.dropoffPrice,
        pickup: pickup,
        dropoff: dropoff,
        totalPax: breakfastAdult + breakfastKid,
        willShowBreakfast: (breakfastAdult + breakfastKid) > 0,
        willShowPickup: pickup > 0,
        willShowDropoff: dropoff > 0
      });
      
      if (!billingData) {
        console.error('❌ [VOUCHER PDF] Billing data not found for bookingId:', bookingId);
        return res.status(404).json({
          success: false,
          message: 'Billing data not found'
        });
      }
      
      console.log('📊 [VOUCHER PDF] Billing data received:', {
        subTotal: billingData.subTotal,
        reservationFee: billingData.reservationFee,
        discountAmount: billingData.discountAmount,
        itemsCount: billingData.items ? billingData.items.length : 0
      });
      
      // Calculate total from billing data
      const subTotal = billingData.subTotal || 0;
      const reservationFee = billingData.reservationFee || 0;
      const discountAmount = billingData.discountAmount || 0;
      
      // Calculate roomCharges from billingData items
      let roomCharges = 0;
      if (billingData.items && Array.isArray(billingData.items)) {
        // Sum all room items - ONLY items that are explicitly room-related
        // Must have room-related description AND no serviceId
        const roomItems = billingData.items.filter(item => {
          if (!item.description) return false;
          const desc = item.description.toLowerCase();
          // Must be room-related AND no serviceId
          const isRoomItem = !item.serviceId && (
            desc.includes('bedroom') || 
            desc.includes('single bedroom') ||
            desc.includes('double bedroom') ||
            desc.includes('twin bedroom') ||
            desc.includes('deluxe bedroom') ||
            desc.includes('suite') ||
            (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
          );
          return isRoomItem;
        });
        console.log('🏠 [VOUCHER PDF] Filtered room items:', roomItems.map(item => ({
          description: item.description,
          serviceId: item.serviceId,
          subTotal: item.subTotal
        })));
        roomCharges = roomItems.reduce((sum, item) => sum + (item.subTotal || 0), 0);
        
        // If still 0, try to get from first room item
        if (roomCharges === 0 && roomItems.length > 0) {
          const firstRoom = roomItems[0];
          roomCharges = (firstRoom.basePrice || 0) * (firstRoom.qty || 0);
        }
      }
      
      // Fallback: query directly from billing table
      if (roomCharges === 0) {
        const { queryDatabasePromise } = require('../config/database');
        const roomChargesQuery = `
          SELECT COALESCE(SUM(ROOM_CHARGE * QTY), 0) AS roomCharges
          FROM billing
          WHERE BOOKING_ID = ? AND ACTIVE = 1
        `;
        const roomChargesResult = await queryDatabasePromise(roomChargesQuery, [bookingId]);
        roomCharges = parseFloat(roomChargesResult?.[0]?.roomCharges || 0);
      }
      
      // Calculate servicesTotal from billingData items
      // Services = everything that's NOT a room item, extended stay, or cancellation
      let servicesTotal = 0;
      if (billingData.items && Array.isArray(billingData.items)) {
        const serviceItems = billingData.items.filter(item => {
          if (!item.description) return false;
          const desc = (item.description || '').toLowerCase();
          
          // Exclude room items (must be explicitly room-related AND no serviceId)
          const isRoomItem = !item.serviceId && (
            desc.includes('bedroom') || 
            desc.includes('single bedroom') ||
            desc.includes('double bedroom') ||
            desc.includes('twin bedroom') ||
            desc.includes('deluxe bedroom') ||
            desc.includes('suite') ||
            (desc.includes('room') && (desc.includes('single') || desc.includes('double') || desc.includes('twin') || desc.includes('deluxe')))
          );
          
          // Exclude extended stay and cancellation
          const isExcluded = desc.includes('extended') || desc.includes('extension') || desc.includes('cancellation');
          
          // Everything else is a service
          return !isRoomItem && !isExcluded;
        });
        console.log('🛎️ [VOUCHER PDF] Filtered service items:', serviceItems.map(item => ({
          description: item.description,
          serviceId: item.serviceId,
          subTotal: item.subTotal
        })));
        servicesTotal = serviceItems.reduce((sum, item) => sum + (item.subTotal || 0), 0);
      }
      
      // Fallback: query directly from booking_service table
      if (servicesTotal === 0) {
        const { queryDatabasePromise } = require('../config/database');
        const servicesTotalQuery = `
          SELECT COALESCE(SUM(TOTAL_COST), 0) AS servicesTotal
          FROM booking_service
          WHERE BOOKING_ID = ? 
            AND ACTIVE = 1
            AND SERVICE_ID != 72
        `;
        const servicesTotalResult = await queryDatabasePromise(servicesTotalQuery, [bookingId]);
        servicesTotal = parseFloat(servicesTotalResult?.[0]?.servicesTotal || 0);
      }
      
      console.log('✅ [VOUCHER PDF] Final values:', {
        roomCharges,
        servicesTotal,
        subTotal,
        reservationFee,
        discountAmount
      });
      
      // Total amount
      const total = subTotal + reservationFee - discountAmount;
      
      // Get paid amount and balance from voucher data (already calculated in query)
      const paidAmount = parseFloat(voucherData.paidAmount) || 0;
      const balance = total - paidAmount;

      // Format remarks - template will automatically add:
      // - "Room Accommodation" (if not already in remarks)
      // - Breakfast info (if breakfastAdult + breakfastKid > 0)
      // - "With Pick-Up" (if pickup > 0)
      // - "With Drop-off" (if dropoff > 0)
      // So we just pass the remarks from database as-is
      const formattedRemarks = voucherData.remarks || '';
      
      console.log('📝 [VOUCHER PDF] Remarks and Services:', {
        original: voucherData.remarks,
        formatted: formattedRemarks,
        breakfastAdult,
        breakfastKid,
        pickup,
        dropoff,
        otherServices: otherServices.map(s => `${s.qty}x ${s.name}`),
        willShowBreakfast: (breakfastAdult + breakfastKid) > 0,
        willShowPickup: pickup > 0,
        willShowDropoff: dropoff > 0,
        otherServicesCount: otherServices.length
      });

      // Load logo as base64 for Playwright
      const logoPath = path.join(__dirname, '../public/img/Logo-Black.JPG');
      let imageUrl = '';
      try {
        if (require('fs').existsSync(logoPath)) {
          const imageBase64 = require('fs').readFileSync(logoPath, 'base64');
          imageUrl = `data:image/jpeg;base64,${imageBase64}`;
          console.log('✅ [VOUCHER PDF] Logo loaded as base64');
        } else {
          console.error('❌ [VOUCHER PDF] Logo file not found:', logoPath);
        }
      } catch (error) {
        console.error('❌ [VOUCHER PDF] Error loading logo:', error);
      }

      // Render the HTML - pass raw dates and let template format them
      const html = await ejs.render(templateContent, {
        voucherNo,
        fullname: voucherData.fullname,
        dateFrom: voucherData.dateFrom,
        dateTo: voucherData.dateTo,
        roomNumber: voucherData.roomNumber || 'Unassigned',
        roomType: voucherData.roomType || 'Unassigned',
        remarks: formattedRemarks, // ✅ Pass formatted remarks (template will add Room Accommodation, Pick-up, Drop-off)
        breakfastAdult,
        breakfastKid,
        pickup,
        dropoff,
        otherServices, // ✅ Pass other services array for template to display
        reservationFee: voucherData.reservationFee || 0,
        discount: voucherData.discount || 0,
        checkOutStatus: voucherData.checkOutStatus,
        lateCheckoutFee,
        total,
        paidAmount,
        balance,
        roomCharges, // ✅ Add roomCharges
        servicesTotal, // ✅ Add servicesTotal
        encodedBy: user.FULLNAME,
        imageUrl: imageUrl
      });

      // Generate PDF with playwright
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      const pdfBuffer = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' }
      });
      await browser.close();

      // Send PDF
      const filename = `voucher-${voucherNo}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString()
      });
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error generating voucher PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating voucher PDF',
        error: error.message
      });
    }
  }

  // ==================== COMPLAINT / REQUEST API ====================
  static async listComplaintRequest(req, res) {
    try {
      const bookingId = req.params.bookingId;
      const rows = await BookingModel.listComplaintRequestByBooking(bookingId);
      return res.json({ success: true, data: rows });
    } catch (e) {
      console.error('Error listComplaintRequest:', e);
      return res.status(500).json({ success: false, message: 'Failed to load complaint/request' });
    }
  }

  static async addComplaintRequest(req, res) {
    try {
      const { bookingId, type, details } = req.body;
      if (!bookingId || !type || !details) return res.status(400).json({ success: false, message: 'Missing fields' });
      const encodedBy = req.user?.userId || req.session?.user?.userId || req.body?.encodedBy || 'system';
      const id = await BookingModel.addComplaintRequest({ bookingId, type, details, encodedBy });
      return res.json({ success: true, id });
    } catch (e) {
      console.error('Error addComplaintRequest:', e);
      return res.status(500).json({ success: false, message: 'Failed to add complaint/request' });
    }
  }

  static async updateComplaintRequestStatus(req, res) {
    try {
      const id = req.params.id;
      const { status } = req.body;
      if (!id || (status === undefined || status === null)) return res.status(400).json({ success: false, message: 'Missing fields' });
      const editedBy = req.user?.userId || req.session?.user?.userId || req.body?.editedBy || 'system';
      // Normalize to numeric 0/1; only '1' or 1 means complete
      const normalized = (status === 1 || status === '1') ? 1 : 0;
      await BookingModel.updateComplaintRequestStatus({ id, status: normalized, editedBy });
      return res.json({ success: true });
    } catch (e) {
      console.error('Error updateComplaintRequestStatus:', e);
      return res.status(500).json({ success: false, message: 'Failed to update status' });
    }
  }

  static async deleteComplaintRequest(req, res) {
    try {
      const id = req.params.id;
      await BookingModel.deleteComplaintRequest(id);
      return res.json({ success: true });
    } catch (e) {
      console.error('Error deleteComplaintRequest:', e);
      return res.status(500).json({ success: false, message: 'Failed to delete complaint/request' });
    }
  }

  static async updateComplaintRequest(req, res) {
    try {
      const id = req.params.id;
      const { type, details } = req.body;
      if (!id || !type || !details) return res.status(400).json({ success: false, message: 'Missing fields' });
      const editedBy = req.user?.userId || req.session?.user?.userId || req.body?.editedBy || 'system';
      await BookingModel.updateComplaintRequest({ id, type, details, editedBy });
      return res.json({ success: true });
    } catch (e) {
      console.error('Error updateComplaintRequest:', e);
      return res.status(500).json({ success: false, message: 'Failed to update complaint/request' });
    }
  }
}

module.exports = BookingController;
