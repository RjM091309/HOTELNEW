const express = require('express');
const router = express.Router();
const IntegrationController = require('../controller/c_integration');

router.get('/', IntegrationController.getIntegrationPage);
router.get('/api/rooms', IntegrationController.getAllIntegrationRooms);
router.get('/api/rooms/:id', IntegrationController.getIntegrationRoomById);
router.post('/api/rooms/update', IntegrationController.updateIntegrationRoom);

module.exports = router; 