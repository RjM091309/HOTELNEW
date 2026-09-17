const express = require('express');
const router = express.Router();
const RoomRatesController = require('../controller/c_room_rates');

// Settings -> Room Rates
router.get('/', RoomRatesController.renderPage);
router.get('/data', RoomRatesController.getData);
router.get('/season-months', RoomRatesController.getSeasonMonths);
router.post('/save', RoomRatesController.saveRates);
router.post('/save-season-months', RoomRatesController.saveSeasonMonths);

module.exports = router;
