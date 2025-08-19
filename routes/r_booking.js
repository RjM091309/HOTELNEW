const express = require('express');
const router = express.Router();
const BookingController = require('../controller/c_booking');

// Route to render the main booking page
router.get('/', BookingController.renderBookingPage);

// Route to render the group booking page
router.get('/group', BookingController.renderGroupBookingPage);

// API Routes for booking data
router.get('/booking_data', BookingController.getBookingData);
router.get('/booking_details/:bookingID', BookingController.getBookingDetails);
router.get('/booking/details/:confirmationNumber', BookingController.getBookingByConfirmationNumber);
router.get('/unpaid_balance/:bookingId', BookingController.getUnpaidBalance);
router.get('/get-booking-services/:bookingId', BookingController.getBookingServices);
router.get('/get-billing/:id', BookingController.getBilling);
router.post('/update_status', BookingController.updateBookingStatus);

// Booking creation
router.post('/add_booking', BookingController.addBooking);

// Booking services
router.post('/save-booking-services', BookingController.saveBookingServices);
router.post('/update-service-status', BookingController.updateServiceStatus);
router.post('/remove-service', BookingController.removeService);

// Payment processing
router.post('/process-payment', BookingController.processPayment);

// Check-out management
router.post('/late_checkout', BookingController.lateCheckout);

// Guest management
router.get('/get_guest_types', BookingController.getGuestTypes);
router.get('/get_guest_level', BookingController.getGuestLevel);

// Booking queries
router.get('/get_pending_bookings', BookingController.getPendingBookings);

// Customer management
router.get('/search-customer', BookingController.searchCustomer);

// Room management
router.post('/available-rooms', BookingController.getAvailableRooms);
router.post('/get-room-details', BookingController.getRoomDetails);

// Payment management
router.post('/update-room-payment-status', BookingController.updateRoomPaymentStatus);
router.post('/update-extend-payment-status', BookingController.updateExtendPaymentStatus);

// Room search
router.post('/find_consecutive_rooms', BookingController.findConsecutiveRooms);

// Group booking
router.post('/add_group_booking', BookingController.addGroupBooking);
router.get('/group_booking_data', BookingController.getGroupBookingData);
router.get('/group_booking_details/:groupId', BookingController.getGroupBookingDetails);
router.get('/group_billing_details/:groupId', BookingController.getGroupBillingDetails);
router.get('/check_group_payment_status/:groupId', BookingController.checkGroupPaymentStatus);
router.post('/group_payment', BookingController.groupPayment);
router.get('/bookings', BookingController.getBookings);
router.get('/rooms', BookingController.getRooms);
router.post('/cancel', BookingController.cancelBooking);


// Utility routes
router.get('/get_floors_for_dropdown', BookingController.getFloorsForDropdown);
router.get('/get_rooms_by_floor', BookingController.getRoomsByFloor);
router.get('/get_booked_dates', BookingController.getBookedDates);
router.get('/extra_service_dropdown', BookingController.getExtraServiceDropdown);
router.get('/notifications', BookingController.getNotifications);
router.post('/mark_notifications_as_read', BookingController.markNotificationsAsRead);

//Telegram
router.get('/summary', BookingController.getBookingSummary);

// Agency
router.get('/get-agency', BookingController.getAgency);

// Invoice / Voucher
router.get('/generate-invoice/:bookingId', BookingController.generateInvoice);
router.post('/generate-voucher', BookingController.generateVoucher);
router.post('/generate-group-voucher', BookingController.generateGroupVoucher);

// Service routes
router.get('/get-breakfast-prices', BookingController.getBreakfastPrices);
router.get('/get-pick-drop', BookingController.getPickDrop);
router.get('/get-services', BookingController.getExtraServiceDropdown);

module.exports = router;
