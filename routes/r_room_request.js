const express = require('express');
const router = express.Router();
const RoomRequestController = require('../controller/c_room_request');

// Housekeeping of the dashboard (Housekeeping view of /dashboard/full) - mounted at /room-requests behind the login
router.get('/', RoomRequestController.list);
router.post('/', RoomRequestController.create);
router.post('/:id/done', RoomRequestController.done);
router.post('/:id/cancel', RoomRequestController.cancel);
router.post('/:id/accept', RoomRequestController.accept);
router.post('/:id/release', RoomRequestController.release);
// rooms: mark clean / dirty, minibar & laundry on the guest's bill
router.get('/charge-items', RoomRequestController.chargeItems);
router.post('/rooms/:roomNumber/status', RoomRequestController.roomStatus);
router.post('/rooms/:roomNumber/charges', RoomRequestController.charge);

module.exports = router;
