const express = require('express');
const router = express.Router();
const RoomRatesController = require('../controller/c_room_rates');

// Settings -> Room Rates
router.get('/', RoomRatesController.renderPage);
router.get('/data', RoomRatesController.getData);
router.post('/save', RoomRatesController.saveRates);

module.exports = router;
