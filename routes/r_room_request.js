const express = require('express');
const router = express.Router();
const RoomRequestController = require('../controller/c_room_request');

// Room requests (MUR / custom) of the Housekeeping view - mounted at /room-requests behind the login
router.get('/', RoomRequestController.list);
router.post('/', RoomRequestController.create);
router.post('/:id/done', RoomRequestController.done);
router.post('/:id/cancel', RoomRequestController.cancel);

module.exports = router;
