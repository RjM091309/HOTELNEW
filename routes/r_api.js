const express = require('express');
const router = express.Router();
const DashboardController = require('../controller/c_dashboard');
const RoomController = require('../controller/c_room');
const BookingController = require('../controller/c_booking');

// Health check endpoint only
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        data: { status: 'OK', timestamp: new Date().toISOString() },
        message: 'API is running'
    });
});

// Room monitoring endpoint (no authentication required)
router.get('/room-monitoring', DashboardController.getRoomMonitoring);

// Occupied rooms endpoint (no authentication required - for guest app)
router.get('/dashboard/occupied-rooms', DashboardController.getOccupiedRooms);

// Room control Home Assistant integration (no authentication required - for guest control)
// IMPORTANT: Place specific routes BEFORE parameterized routes to avoid shadowing
router.get('/room-control/cleaning-status', RoomController.getCleaningStatus);
router.get('/room-control/dnd-status', RoomController.getDNDStatus);
router.post('/room-control/toggle-cleaning', RoomController.toggleCleaning);
router.post('/room-control/toggle-dnd', RoomController.toggleDND);

// Room control endpoints (no authentication required - for guest use)
router.get('/room-control/:roomNumber', RoomController.getRoomControlStatus);
router.post('/room-control/update', RoomController.updateRoomControlSettings);
router.get('/room-control/:roomNumber/history', RoomController.getRoomControlHistory);
router.post('/room-control/emergency', RoomController.emergencyRoomControl);

// Housekeeping integration (no authentication required)
router.get('/housekeeping/cleaning-status', RoomController.getAllRoomsCleaningStatus);
router.post('/housekeeping/mark-cleaned', RoomController.markRoomCleaned);

// Booking endpoints (no authentication required - for guest use)
router.get('/booking/booking_data', BookingController.getBookingDataEnhanced);
router.post('/booking/get-room-details', BookingController.getRoomDetails);
router.get('/booking/get-booking-services/:bookingId', BookingController.getBookingServices);

module.exports = router;
