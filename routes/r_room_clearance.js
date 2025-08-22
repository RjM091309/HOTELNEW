const express = require('express');
const router = express.Router();
const RoomClearanceController = require('../controller/c_room_clearance');

// Landing page
router.get('/', RoomClearanceController.renderPage);

// Data endpoints
router.get('/data', RoomClearanceController.getData);
router.get('/checkout-bookings', RoomClearanceController.getCheckoutBookings);
router.get('/all-checkout-bookings', RoomClearanceController.getAllCheckoutBookings);
router.get('/bellmen', RoomClearanceController.getBellmen);

// CRUD
router.post('/add', RoomClearanceController.add);
router.post('/edit/:id', RoomClearanceController.update);
router.delete('/delete/:id', RoomClearanceController.delete);
router.get('/:id', RoomClearanceController.getById);

module.exports = router;


