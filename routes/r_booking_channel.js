// ========================================
// BOOKING CHANNEL ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const BookingChannelController = require('../controller/c_booking_channel');

// ========================================
// PAGE ROUTES
// ========================================

// Booking channel management page
router.get('/', BookingChannelController.getBookingChannelManagement);
router.get('/management', BookingChannelController.getBookingChannelManagement);

// ========================================
// API ROUTES - BOOKING CHANNEL CRUD
// ========================================

// Get all booking channels
router.get('/api/channels', BookingChannelController.getAllBookingChannels);

// Get booking channel by ID
router.get('/api/channels/:id', BookingChannelController.getBookingChannelById);

// Create new booking channel
router.post('/api/channels/create', BookingChannelController.createBookingChannel);

// Update booking channel
router.post('/api/channels/update', BookingChannelController.updateBookingChannel);

// Toggle channel status
router.put('/toggleStatus/:id', BookingChannelController.toggleChannelStatus);

module.exports = router;
