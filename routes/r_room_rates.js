const express = require('express');
const router = express.Router();
const RoomRatesController = require('../controller/c_room_rates');

// Settings -> Room Rates
router.get('/', RoomRatesController.renderPage);
router.get('/data', RoomRatesController.getData);
router.get('/season-months', RoomRatesController.getSeasonMonths);
router.get('/pool-villa-rates', RoomRatesController.getPoolVillaRates);
router.post('/save', RoomRatesController.saveRates);
router.post('/save-season-months', RoomRatesController.saveSeasonMonths);
router.post('/save-pool-villa-rates', RoomRatesController.savePoolVillaRates);

module.exports = router;
