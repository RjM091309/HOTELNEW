const DashboardModel = require('../models/dashboardModel');

class DashboardController {
  // Main dashboard controller
  static async getDashboard(req, res) {
    try {
      // Get user from JWT token
      const user = req.user || null;
      const userId = user?.userId || null;
      const tabOrder = user?.TAB_ORDER || null;

      // Get all dashboard data in parallel
      const [
        employeesResults,
        todayCheckInDetails,
        groupBookingDetails,
        lateInOutDetails,
        todayCheckedOutDetails,
        extendedDetails,
        lateCheckOutDetails,
        dashboardCounts,
        roomStatusesResults,
        roomDetails,
        roomDataResults,
        floors,
        cleanupNotifications
      ] = await Promise.all([
        DashboardModel.getEmployees(),
        DashboardModel.getTodayCheckInDetails(),
        DashboardModel.getGroupBookingDetails(),
        DashboardModel.getLateInOutDetails(),
        DashboardModel.getTodayCheckedOutDetails(),
        DashboardModel.getExtendedDetails(),
        DashboardModel.getLateCheckOutDetails(),
        DashboardModel.getDashboardCounts(),
        DashboardModel.getRoomStatuses(),
        DashboardModel.getRoomDetails(),
        DashboardModel.getRoomData(),
        DashboardModel.getFloors(),
        DashboardModel.getCleanupNotifications()
      ]);

      // Process employee data
      const categorizedEmployees = DashboardModel.categorizeEmployees(employeesResults);

      // The Today Check-out tab should only list pending checkouts - once a room is
      // actually checked out, it moves to the Cleaning tab instead of staying here.
      const pendingTodayCheckedOutDetails = (todayCheckedOutDetails || []).filter(
        (booking) => booking.BookingStatus !== 'check-Out'
      );

      // Process room data
      const processedRoomData = DashboardModel.processRoomData(roomDataResults);

      // Get occupied room details and update device statuses - TEMPORARILY COMMENTED OUT DUE TO CONNECTION ISSUES
      const occupiedRoomDetails = roomDetails.occupied || [];
      // const updatedRoomDetails = await DashboardModel.updateDeviceStatuses(occupiedRoomDetails);
      const updatedRoomDetails = occupiedRoomDetails; // Use original data without device status updates

      // Get transfer logs for occupied rooms
      const transferLogs = await DashboardModel.getTransferLogs(updatedRoomDetails);

      // Extract counts from dashboard counts
      const {
        bookingToday,
        todayCheckedIn,
        todayCheckedOut,
        extended,
        lateInOut,
        bookingMonthly,
        totalSales,
        lateCheckOut,
        occupiedNotMove
      } = dashboardCounts;

      const totalBookingsToday = bookingToday[0]?.totalBookingsToday || 0;
      const TODAY_CHECKEDIN = todayCheckedIn[0]?.TODAY_CHECKEDIN || 0;
      const TODAY_CHECKEDOUT = todayCheckedOut[0]?.TODAY_CHECKEDOUT || 0;
      const EXTENDED = extended[0]?.EXTENDED || 0;
      const LATE_IN_OUT = lateInOut[0]?.TotalLateInOut || 0;
      const totalBookingsMonthly = bookingMonthly[0]?.totalBookingsMonthly || 0;
      const completedBookingsMonthly = bookingMonthly[0]?.completedBookingsMonthly || 0;
      const pendingBookingsMonthly = bookingMonthly[0]?.pendingBookingsMonthly || 0;
      const totalSalesAmount = totalSales[0]?.totalSales || 0;
      const LATE_CHECKOUT = lateCheckOut[0]?.LATE_CHECKOUT || 0;
      const OccupiedNotMove = occupiedNotMove[0]?.OccupiedNotMove || 0;

      // Extract room status counts
      const {
        totalRooms = 0,
        availableRooms = 0,
        occupiedRooms = 0,
        underMaintenanceRooms = 0,
        cleaningRooms = 0,
      } = roomStatusesResults[0] || {};

      // Process broom notifications
      const broomNotifications = updatedRoomDetails.filter(
        (room) => room.deviceStatus === 'on' || room.completedTimestamp
      );
      const pendingBroomNotifications = broomNotifications.filter(notif => !notif.completedTimestamp);

      // Set locals for socket.io updates
      res.locals.updatedRoomDetails = updatedRoomDetails;

      // Emit socket event for real-time updates
      const io = req.app.get('io');
      if (io) {
        io.emit('occupiedRoomDetailsUpdate', updatedRoomDetails);
      }

      // Render dashboard with all data
      res.render('dashboard/dashboard', {
        title: 'Dashboard', // Set the page title
        subTitle: 'Dashboard',
        page: 'dashboard',
        activePage: 'dashboard',
        hideBreadcrumb: true, // Hide breadcrumb on dashboard
        user,
        userId,
        tabOrder,
        totalBookingsToday,
        TODAY_CHECKEDIN,
        TODAY_CHECKEDOUT,
        EXTENDED,
        LATE_IN_OUT,
        LATE_CHECKOUT,
        totalBookingsMonthly,
        completedBookingsMonthly,
        pendingBookingsMonthly,
        totalSales: totalSalesAmount,
        employees: categorizedEmployees,
        todayCheckInDetails,
        groupBookingDetails,
        lateInOutDetails,
        todayCheckedOutDetails: pendingTodayCheckedOutDetails,
        extendedDetails,
        lateCheckOutDetails,
        cleaningRoomDetails: roomDetails.cleaning || [],
        totalRooms,
        availableRooms,
        occupiedRooms,
        underMaintenanceRooms,
        cleaningRooms,
        availableRoomDetails: roomDetails.available || [],
        underMaintenanceRoomDetails: roomDetails.underMaintenance || [],
        OccupiedNotMove,
        transferredRoomDetails: roomDetails.transferred || [],
        occupiedRoomDetails: updatedRoomDetails,
        rooms: processedRoomData,
        floors,
        broomNotifications,
        pendingBroomNotifications,
        cleanupNotifications,
        hasValidNotifications: updatedRoomDetails.some((room) => room.deviceStatus === 'on' || room.completedTimestamp),
        transferLogs,
        timeAgo: DashboardModel.timeAgo,
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).render('error', { message: 'Server error' });
    }
  }

  // Complaints/Requests/Remarks summary counts
  static async getComplaintRequestSummary(req, res) {
    try {
      const summary = await DashboardModel.getComplaintRequestSummary();
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error('Error fetching complaint/request summary:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Get all complaints
  static async getAllComplaints(req, res) {
    try {
      const complaints = await DashboardModel.getAllComplaints();
      res.json({ success: true, data: complaints });
    } catch (error) {
      console.error('Error fetching all complaints:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Get all requests
  static async getAllRequests(req, res) {
    try {
      const requests = await DashboardModel.getAllRequests();
      res.json({ success: true, data: requests });
    } catch (error) {
      console.error('Error fetching all requests:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Get all remarks
  static async getAllRemarks(req, res) {
    try {
      const remarks = await DashboardModel.getAllRemarks();
      res.json({ success: true, data: remarks });
    } catch (error) {
      console.error('Error fetching all remarks:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Check move to occupied controller
  static async checkMoveToOccupied(req, res) {
    try {
      const count = await DashboardModel.getCheckInBookings();
      res.json({
        success: true,
        message: 'Move to occupied check completed',
        canMove: count > 0,
        count: count
      });
    } catch (error) {
      console.error('Error checking move to occupied:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Move to occupied controller
  static async moveToOccupied(req, res) {
    try {
      const affectedRows = await DashboardModel.moveToOccupied();
      
      // Get the io instance from the app
      const io = req.app.get('io');
      
      // Emit Socket.IO event for real-time dashboard updates
      if (io) {
        io.to('dashboard-room').emit('dashboard-refresh', {
          action: 'dashboard-updated',
          message: `${affectedRows} guests moved to occupied successfully`,
          data: { affectedRows }
        });
      }
      
      res.json({
        success: true,
        message: `${affectedRows} guests moved to occupied successfully`
      });
    } catch (error) {
      console.error('Error moving to occupied:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Check if room is occupied before check-in
  static async checkRoomOccupied(req, res) {
    try {
      const { BookingID } = req.body;
      
      if (!BookingID) {
        return res.status(400).json({
          success: false,
          message: 'BookingID is required'
        });
      }

      const BookingModel = require('../models/bookingModel');
      const result = await BookingModel.checkRoomOccupied(BookingID);
      
      res.json({
        success: true,
        isOccupied: result.isOccupied || false,
        isCleaning: result.isCleaning || false,
        message: result.message,
        data: result.occupiedBooking || null,
        roomNumber: result.roomNumber || null
      });
    } catch (error) {
      console.error('Error checking room occupancy:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get security deposit for a booking
  static async getSecurityDeposit(req, res) {
    try {
      const { bookingId } = req.params;
      const deposit = await DashboardModel.getSecurityDeposit(bookingId);
      res.json({ success: true, data: deposit });
    } catch (error) {
      console.error('Error fetching security deposit:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Undo security deposit refund (manual or via checkout revert)
  static async revertSecurityDepositRefund(req, res) {
    try {
      const { BookingID } = req.body;

      if (!BookingID) {
        return res.status(400).json({ success: false, message: 'Booking ID is required.' });
      }

      const result = await DashboardModel.revertSecurityDepositRefund(BookingID);

      if (result.reverted) {
        res.json({
          success: true,
          message: 'Security deposit refund has been undone. Deposit is on hold again.',
          data: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'No refunded security deposit found to undo.'
        });
      }
    } catch (error) {
      console.error('Error reverting security deposit refund:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Process security deposit refund at checkout
  static async refundSecurityDepositAtCheckout(req, res) {
    try {
      const { BookingID, action, deductAmount, applyRemainderToBalance, remarks } = req.body;
      const encodedBy = req.user?.userId;

      if (!BookingID) {
        return res.status(400).json({ success: false, message: 'Booking ID is required.' });
      }
      if (!action) {
        return res.status(400).json({ success: false, message: 'Refund action is required.' });
      }

      const result = await DashboardModel.processSecurityDepositAtCheckout(BookingID, {
        action,
        deductAmount,
        applyRemainderToBalance: !!applyRemainderToBalance,
        remarks,
        encodedBy
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error processing security deposit at checkout:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Check in guest with security deposit
  static async checkInWithSecurityDeposit(req, res) {
    try {
      const { BookingID, depositAmount, paymentMethod, remarks } = req.body;
      const encodedBy = req.user?.userId;

      if (!BookingID) {
        return res.status(400).json({ success: false, message: 'Booking ID is required.' });
      }

      const result = await DashboardModel.checkInWithSecurityDeposit(BookingID, {
        depositAmount,
        paymentMethod,
        remarks,
        encodedBy
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error checking in with security deposit:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // Update booking status controller
  static async updateBookingStatus(req, res) {
    try {
      const { BookingID, status, lateCheckOut } = req.body;
      
      // Convert empty string to null for lateCheckOut
      const processedLateCheckOut = lateCheckOut === '' ? null : lateCheckOut;
      
      const success = await DashboardModel.updateBookingStatus(BookingID, status, processedLateCheckOut, req.user?.userId);
      
      if (success) {
        res.json({
          success: true,
          message: `Booking ${BookingID} status updated to ${status}`,
          data: { BookingID, status, lateCheckOut: processedLateCheckOut }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to update booking status'
        });
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Update room status controller
  static async updateRoomStatus(req, res) {
    try {
      const { roomId } = req.params;
      const { status } = req.body;
      
      const success = await DashboardModel.updateRoomStatus(roomId, status);
      
      if (success) {
        res.json({
          success: true,
          message: `Room ${roomId} status updated to ${status}`,
          data: { roomId, status }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to update room status'
        });
      }
    } catch (error) {
      console.error('Error updating room status:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Room monitoring controller
  static async getRoomMonitoring(req, res) {
    try {
      const floors = await DashboardModel.getRoomMonitoringData();
      res.json({ floors });
    } catch (error) {
      console.error('Error getting room monitoring data:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get available rooms for transfer
  static async getAvailableRoomsForTransfer(req, res) {
    try {
      const { currentRoom, checkOutDate } = req.query;
      
      if (!currentRoom || !checkOutDate) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
      }

      const availableRooms = await DashboardModel.getAvailableRoomsForTransfer(currentRoom, checkOutDate);
      
      res.json(availableRooms);
    } catch (error) {
      console.error('Error getting available rooms for transfer:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

   // Get transfer logs for a booking
  static async getTransferLogs(req, res) {
    try {
      const { bookingId } = req.params;
      
      console.log('getTransferLogs called with bookingId:', bookingId);
      
      if (!bookingId) {
        console.log('Missing booking ID in request');
        return res.status(400).json({
          success: false,
          message: 'Missing booking ID'
        });
      }

      console.log('Calling DashboardModel.getTransferLogsForBooking with bookingId:', bookingId);
      const transferLogs = await DashboardModel.getTransferLogsForBooking(bookingId);
      
      console.log('Transfer logs result:', transferLogs);
      console.log('Transfer logs length:', transferLogs ? transferLogs.length : 'null');
      
      res.json(transferLogs);
    } catch (error) {
      console.error('Error getting transfer logs:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
  // Room transfer controller
  static async transferRoom(req, res) {
    try {
      const { bookingId, oldRoomId, newRoomId, transferDate } = req.body;
      
      if (!bookingId || !oldRoomId || !newRoomId || !transferDate) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters for room transfer'
        });
      }

      const success = await DashboardModel.transferRoom(bookingId, oldRoomId, newRoomId, transferDate);
      
      if (success) {
        // Get the io instance from the app
        const io = req.app.get('io');
        
        // Emit Socket.IO event for real-time dashboard updates
        if (io) {
          io.to('dashboard-room').emit('dashboard-refresh', {
            action: 'booking-status-updated',
            message: 'Room transferred successfully',
            data: { bookingId, oldRoomId, newRoomId, transferDate }
          });
        }
        
        res.json({
          success: true,
          message: 'Room transferred successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Failed to transfer room'
        });
      }
    } catch (error) {
      console.error('Error transferring room:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during room transfer'
      });
    }
  }

  // Get dashboard counts for real-time updates
  static async getDashboardCounts(req, res) {
    try {
      // Get all dashboard counts in parallel
      const [
        dashboardCounts,
        roomStatusesResults
      ] = await Promise.all([
        DashboardModel.getDashboardCounts(),
        DashboardModel.getRoomStatuses()
      ]);

      // Extract counts from dashboard counts
      const {
        bookingToday,
        todayCheckedIn,
        todayCheckedOut,
        extended,
        lateInOut,
        bookingMonthly,
        totalSales,
        lateCheckOut,
        occupiedNotMove
      } = dashboardCounts;

      const totalBookingsToday = bookingToday[0]?.totalBookingsToday || 0;
      const TODAY_CHECKEDIN = todayCheckedIn[0]?.TODAY_CHECKEDIN || 0;
      const TODAY_CHECKEDOUT = todayCheckedOut[0]?.TODAY_CHECKEDOUT || 0;
      const EXTENDED = extended[0]?.EXTENDED || 0;
      const LATE_IN_OUT = lateInOut[0]?.TotalLateInOut || 0;
      const totalBookingsMonthly = bookingMonthly[0]?.totalBookingsMonthly || 0;
      const completedBookingsMonthly = bookingMonthly[0]?.completedBookingsMonthly || 0;
      const pendingBookingsMonthly = bookingMonthly[0]?.pendingBookingsMonthly || 0;
      const LATE_CHECKOUT = lateCheckOut[0]?.LATE_CHECKOUT || 0;
      const OccupiedNotMove = occupiedNotMove[0]?.OccupiedNotMove || 0;

      // Extract room status counts
      const {
        totalRooms = 0,
        availableRooms = 0,
        occupiedRooms = 0,
        underMaintenanceRooms = 0,
        cleaningRooms = 0,
      } = roomStatusesResults[0] || {};

      res.json({
        success: true,
        data: {
          totalBookingsToday,
          todayCheckedIn: TODAY_CHECKEDIN,
          todayCheckedOut: TODAY_CHECKEDOUT,
          extended: EXTENDED,
          lateInOut: LATE_IN_OUT,
          totalBookingsMonthly,
          completedBookingsMonthly,
          pendingBookingsMonthly,
          lateCheckout: LATE_CHECKOUT,
          occupiedNotMove: OccupiedNotMove,
          totalRooms,
          availableRooms,
          occupiedRooms,
          underMaintenanceRooms,
          cleaningRooms
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard counts:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard counts',
        error: error.message
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

      const result = await DashboardModel.checkLateCheckRoom(roomId, checkoutDate, currentBookingId);
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
      const { currentRoomId, newRoomId, bookingId, lateCheckoutFee } = req.body;

      if (!currentRoomId || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await DashboardModel.processLateCheckout(
        currentRoomId,
        newRoomId,
        bookingId,
        lateCheckoutFee
      );
      
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

      const result = await DashboardModel.checkExtendRoom(roomId, checkoutDate, daysToExtend);
      res.json(result);
    } catch (error) {
      console.error('Error checking room availability for extension:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Process stay extension
  static async extendStay(req, res) {
    try {
      const { roomId, checkoutDate, daysToExtend, bookingId, newRoomId, cost } = req.body;
      const userId = req.user?.userId || null;

      if (!roomId || !checkoutDate || !daysToExtend || !bookingId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters.' 
        });
      }

      const result = await DashboardModel.extendStay(roomId, checkoutDate, daysToExtend, bookingId, newRoomId, cost, userId);
      
      if (result.success) {
        // Get the io instance from the app
        const io = req.app.get('io');
        
        // Emit Socket.IO event for real-time dashboard updates
        if (io) {
          io.to('dashboard-room').emit('dashboard-refresh', {
            action: 'booking-extended',
            message: `Stay extended successfully by ${daysToExtend} day${daysToExtend > 1 ? 's' : ''}!`,
            data: {
              bookingId,
              roomId,
              daysExtended: daysToExtend,
              newCheckoutDate: result.newCheckoutDate,
              timestamp: new Date().toISOString()
            }
          });
        }
        
        res.json({ 
          success: true, 
          message: `Stay extended successfully by ${daysToExtend} day${daysToExtend > 1 ? 's' : ''}!`,
          newCheckoutDate: result.newCheckoutDate,
          totalDays: result.totalDays
        });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Error processing stay extension:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error'
      });
    }
  }

  // Get extended data for real-time updates
  static async getExtendedData(req, res) {
    try {
      const extendedDetails = await DashboardModel.getExtendedDetails();
      
      res.json({
        success: true,
        data: extendedDetails
      });
    } catch (error) {
      console.error('Error fetching extended data:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }

  // Get occupied rooms for guest app
  // Get today checkout details (API endpoint)
  static async getTodayCheckoutDetails(req, res) {
    try {
      const todayCheckedOutDetails = await DashboardModel.getTodayCheckedOutDetails();
      res.json({
        success: true,
        data: todayCheckedOutDetails,
        message: 'Today checkout details retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching today checkout details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch today checkout details',
        error: error.message
      });
    }
  }

  // Get occupied rooms (API endpoint)
  static async getOccupiedRoomsAPI(req, res) {
    try {
      const roomDetails = await DashboardModel.getRoomDetails();
      const occupiedRooms = roomDetails.occupied || [];
      res.json({
        success: true,
        data: occupiedRooms,
        message: 'Occupied rooms retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching occupied rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch occupied rooms',
        error: error.message
      });
    }
  }

  // Get cleaning rooms (API endpoint)
  static async getCleaningRoomsAPI(req, res) {
    try {
      const roomDetails = await DashboardModel.getRoomDetails();
      const cleaningRooms = roomDetails.cleaning || [];
      res.json({
        success: true,
        data: cleaningRooms,
        message: 'Cleaning rooms retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching cleaning rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cleaning rooms',
        error: error.message
      });
    }
  }

  // Get housekeeping summary (for housekeeping app)
  static async getHousekeepingSummary(req, res) {
    try {
      // Get all required data in parallel
      const [
        todayCheckedOutDetails,
        roomDetails,
        complaintRequestSummary
      ] = await Promise.all([
        DashboardModel.getTodayCheckedOutDetails(),
        DashboardModel.getRoomDetails(),
        DashboardModel.getComplaintRequestSummary().catch(() => ({ complaintsPending: 0, requestsPending: 0 }))
      ]);

      // Count today checkout
      const todayCheckout = todayCheckedOutDetails ? todayCheckedOutDetails.length : 0;

      // Count occupied rooms
      const occupied = roomDetails.occupied ? roomDetails.occupied.length : 0;

      // Count cleaning rooms (need cleaning)
      const needCleaning = roomDetails.cleaning ? roomDetails.cleaning.length : 0;

      // Count special requests (pending complaints + pending requests)
      const specialRequest = (complaintRequestSummary.complaintsPending || 0) + (complaintRequestSummary.requestsPending || 0);

      res.json({
        success: true,
        data: {
          todayCheckout,
          occupied,
          needCleaning,
          specialRequest
        },
        message: 'Housekeeping summary retrieved successfully'
      });
    } catch (error) {
      console.error('Error fetching housekeeping summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch housekeeping summary',
        error: error.message
      });
    }
  }

  static async getOccupiedRooms(req, res) {
    try {
      const roomDetails = await DashboardModel.getRoomDetails();
      const occupiedRooms = roomDetails.occupied || [];
      
      // Format the data for the guest app
      const formattedRooms = occupiedRooms.map(room => ({
        ROOM_NUMBER: room.ROOM_NUMBER,
        NAME: room.CustomerName,
        CUSTOMER_NAME: room.CustomerName,
        CHECK_IN_DATE: room.CHECK_IN_DATE,
        CHECK_OUT_DATE: room.CHECK_OUT_DATE,
        TOTAL_DAYS: room.TotalDays,
        BOOKING_STATUS: room.BookingStatus,
        ROOM_TYPE: room.RoomType,
        ROOM_FLOOR: room.ROOM_FLOOR,
        GUEST_COUNT: room.GuestCount,
        CONFIRMATION_NUMBER: room.CONFIRMATION_NUMBER,
        BOOKING_CHANNEL: room.BOOKING_CHANNEL
      }));
      
      res.json({
        success: true,
        data: formattedRooms
      });
    } catch (error) {
      console.error('Error fetching occupied rooms:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  }
}

module.exports = DashboardController;
