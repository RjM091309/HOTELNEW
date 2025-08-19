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

// Room control endpoints (no authentication required - for guest use)
router.get('/room-control/:roomNumber', RoomController.getRoomControlStatus);
router.post('/room-control/update', RoomController.updateRoomControlSettings);
router.get('/room-control/:roomNumber/history', RoomController.getRoomControlHistory);
router.post('/room-control/emergency', RoomController.emergencyRoomControl);

// Booking endpoints (no authentication required - for guest use)
router.get('/booking/booking_data', BookingController.getBookingData);
router.post('/booking/get-room-details', BookingController.getRoomDetails);

module.exports = router;
