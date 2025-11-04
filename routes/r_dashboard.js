const express = require('express');
const router = express.Router();
const DashboardController = require('../controller/c_dashboard');

// Dashboard routes
router.get('/', DashboardController.getDashboard);
router.get('/dashboard', DashboardController.getDashboard);

// Move to occupied routes
router.get('/check-move-to-occupied', DashboardController.checkMoveToOccupied);
router.post('/move-to-occupied', DashboardController.moveToOccupied);

// Room transfer routes
router.get('/transfer-available-rooms', DashboardController.getAvailableRoomsForTransfer);
router.get('/transfer-logs/:bookingId', DashboardController.getTransferLogs);
router.post('/transfer-room', DashboardController.transferRoom);

// Booking status routes
router.post('/booking/check_room_occupied', DashboardController.checkRoomOccupied);
router.post('/booking/update_status', DashboardController.updateBookingStatus);

// Room maintenance routes
router.put('/room_maintenance/updateStatus/:roomId', DashboardController.updateRoomStatus);

// Room monitoring routes
router.get('/room-monitoring', DashboardController.getRoomMonitoring);

// Dashboard counts for real-time updates
router.get('/counts', DashboardController.getDashboardCounts);
// Complaints/Requests/Remarks counts
router.get('/crr-counts', DashboardController.getComplaintRequestSummary);

// Late check-out routes
router.get('/late-check-room', DashboardController.checkLateCheckRoom);
router.post('/late-checkout', DashboardController.processLateCheckout);

// Extend stay routes
router.get('/extend-check-room', DashboardController.checkExtendRoom);
router.post('/extend-stay', DashboardController.extendStay);

// Extended data route for real-time updates
router.get('/extended-data', DashboardController.getExtendedData);

module.exports = router;