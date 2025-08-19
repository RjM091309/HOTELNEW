const express = require('express');
const router = express.Router();
const CalendarController = require('../controller/c_calendar');

// Calendar routes
router.get('/', CalendarController.getCalendar);

// API endpoints for AJAX
router.get('/api/bookings', CalendarController.getBookingsForCalendar);
router.get('/api/bookings/details', CalendarController.getDetailedBookings);
router.post('/api/update-booking', CalendarController.updateBooking);
router.get('/api/available-rooms', CalendarController.getAvailableRooms);
router.post('/api/reopen-reservation', CalendarController.reopenReservation);
router.post('/api/remove-reservation', CalendarController.removeReservation);
router.post('/api/check-in-reservation', CalendarController.checkInReservation);

// Transfer routes for room transfer functionality
router.get('/transfer-available-rooms', CalendarController.getTransferAvailableRooms);
router.post('/transfer-room', CalendarController.transferRoom);
router.get('/transfer-logs/:bookingId', CalendarController.getTransferLogs);

// Extend routes for stay extension functionality
router.get('/extend-check-room', CalendarController.checkExtendRoom);
router.post('/extend-stay', CalendarController.extendStay);
router.get('/booking-extensions', CalendarController.getBookingExtensions);
router.post('/remove-booking-extension', CalendarController.removeBookingExtension);

// Late check-out routes
router.get('/late-check-room', CalendarController.checkLateCheckRoom);
router.post('/late-checkout', CalendarController.processLateCheckout);
router.get('/late-checkout-services', CalendarController.getLateCheckoutServices);
router.post('/remove-late-checkout-service', CalendarController.removeLateCheckoutService);

// Calendar data endpoints
router.get('/rooms', CalendarController.getRooms);
router.get('/bookings', CalendarController.getBookings);

module.exports = router;
