const express = require('express');
const router = express.Router();
const CalendarController = require('../controller/c_calendar');
const CalendarSecurity = require('../middleware/m_calendar_security');

// Calendar routes
router.get('/', CalendarController.getCalendar);

// Unassigned Rooms route
router.get('/unassigned-rooms', CalendarController.getUnassignedRooms);

// API endpoints for AJAX - with security middleware
router.get('/api/bookings', 
  CalendarSecurity.rateLimit,
  CalendarSecurity.setSecurityHeaders,
  CalendarController.getBookingsForCalendar
);

// NEW: Optimized bookings endpoint - replaces heavy frontend processing
router.get('/api/bookings/optimized', 
  CalendarSecurity.rateLimit,
  CalendarSecurity.setSecurityHeaders,
  CalendarController.getOptimizedBookingsForCalendar
);

router.get('/api/bookings/details', 
  CalendarSecurity.validateDateRange(), 
  CalendarSecurity.rateLimit,
  CalendarController.getDetailedBookings
);

// NEW: Backend validation endpoints - replaces frontend logic
router.get('/api/bookings/check-overlaps', 
  CalendarSecurity.rateLimit,
  CalendarController.checkBookingOverlaps
);

router.get('/api/bookings/validate-rules', 
  CalendarSecurity.rateLimit,
  CalendarController.validateBookingRules
);

router.post('/api/update-booking', 
  CalendarSecurity.validateBookingUpdate(), 
  CalendarSecurity.csrfProtection,
  CalendarSecurity.auditLog('BOOKING_UPDATE'),
  CalendarController.updateBooking
);

router.get('/api/available-rooms', 
  CalendarSecurity.rateLimit,
  CalendarController.getAvailableRooms
);

router.post('/api/reopen-reservation', 
  CalendarSecurity.csrfProtection,
  CalendarSecurity.auditLog('BOOKING_REOPEN'),
  CalendarController.reopenReservation
);

router.post('/api/remove-reservation', 
  CalendarSecurity.csrfProtection,
  CalendarSecurity.auditLog('BOOKING_REMOVE'),
  CalendarController.removeReservation
);

router.post('/api/check-in-reservation', 
  CalendarSecurity.csrfProtection,
  CalendarSecurity.auditLog('BOOKING_CHECKIN'),
  CalendarController.checkInReservation
);

// Unassigned Rooms API endpoints
router.get('/api/unassigned-rooms', CalendarController.getUnassignedRoomsForCalendar);
router.get('/api/unassigned-rooms/details', CalendarController.getDetailedUnassignedRooms);
router.get('/api/room-bed-availability', CalendarController.getRoomBedAvailabilityForCalendar);

// Transfer routes for room transfer functionality - with security
router.get('/transfer-available-rooms', 
  CalendarSecurity.rateLimit,
  CalendarController.getTransferAvailableRooms
);

router.post('/transfer-room', 
  CalendarSecurity.validateRoomTransfer(), 
  CalendarSecurity.csrfProtection,
  CalendarSecurity.auditLog('ROOM_TRANSFER'),
  CalendarController.transferRoom
);

router.get('/transfer-logs/:bookingId', 
  CalendarSecurity.rateLimit,
  CalendarController.getTransferLogs
);

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
