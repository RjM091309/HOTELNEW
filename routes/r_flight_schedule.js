const express = require('express');
const router = express.Router();
const FlightScheduleController = require('../controller/c_flight_schedule');

router.get('/', FlightScheduleController.getFlightSchedulePage);
router.get('/api/flights', FlightScheduleController.getAll);
router.get('/api/flights/:id', FlightScheduleController.getById);
router.post('/api/flights/create', FlightScheduleController.create);
router.post('/api/flights/update', FlightScheduleController.update);
router.delete('/api/flights/:id', FlightScheduleController.delete);

module.exports = router;
