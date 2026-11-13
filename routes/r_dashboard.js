const express = require('express');
const router = express.Router();
const DashboardController = require('../controller/c_dashboard');

// Dashboard routes: the home is the overview of every property; the full operations dashboard of the
// active property is /dashboard/full (the "Expand Full Dashboard" button of a card)
router.get('/', DashboardController.getOverview);
router.get('/dashboard', DashboardController.getOverview);
router.get('/overview-data', DashboardController.getOverviewData);
router.get('/full', DashboardController.getFullDashboard);
router.get('/full-data', DashboardController.getFullData);
router.get('/legacy', (req, res) => res.redirect('/dashboard'));   // the old operations dashboard was removed

// Room transfer routes
router.get('/transfer-available-rooms', DashboardController.getAvailableRoomsForTransfer);
router.get('/transfer-logs/:bookingId', DashboardController.getTransferLogs);
router.post('/transfer-room', DashboardController.transferRoom);

// Booking status routes
router.post('/booking/check_room_occupied', DashboardController.checkRoomOccupied);
router.get('/booking/security-deposit/:bookingId', DashboardController.getSecurityDeposit);
router.post('/booking/check-in-with-deposit', DashboardController.checkInWithSecurityDeposit);
router.post('/booking/refund-security-deposit', DashboardController.refundSecurityDepositAtCheckout);
router.post('/booking/revert-security-deposit', DashboardController.revertSecurityDepositRefund);
router.post('/booking/update_status', DashboardController.updateBookingStatus);

// Room maintenance routes
router.put('/room_maintenance/updateStatus/:roomId', DashboardController.updateRoomStatus);
router.put('/room_maintenance/updateStatusBulk', DashboardController.updateRoomStatusBulk);

// Room monitoring routes
router.get('/room-monitoring', DashboardController.getRoomMonitoring);

// Dashboard counts for real-time updates
router.get('/counts', DashboardController.getDashboardCounts);
// Complaints/Requests/Remarks counts
router.get('/crr-counts', DashboardController.getComplaintRequestSummary);
router.get('/navbar-notifications', DashboardController.getNavbarNotifications);
// Get all complaints
router.get('/complaints', DashboardController.getAllComplaints);

// Get all requests
router.get('/requests', DashboardController.getAllRequests);

// Get all remarks
router.get('/remarks', DashboardController.getAllRemarks);

// Late check-out routes
router.get('/late-check-room', DashboardController.checkLateCheckRoom);
router.post('/late-checkout', DashboardController.processLateCheckout);

// Extend stay routes
router.get('/extend-check-room', DashboardController.checkExtendRoom);
router.post('/extend-stay', DashboardController.extendStay);

// Extended data route for real-time updates
router.get('/extended-data', DashboardController.getExtendedData);

module.exports = router;