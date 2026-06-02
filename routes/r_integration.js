const express = require('express');
const router = express.Router();
const IntegrationController = require('../controller/c_integration');
const CardWriterController = require('../controller/c_card_writer');

router.get('/', IntegrationController.getIntegrationPage);
router.get('/api/rooms', IntegrationController.getAllIntegrationRooms);
router.get('/api/rooms/:id', IntegrationController.getIntegrationRoomById);
router.post('/api/rooms/update', IntegrationController.updateIntegrationRoom);

router.get('/card-writer', CardWriterController.getCardWriterPage);
router.get('/api/card-writer', CardWriterController.getCardWriterConfig);
router.post('/api/card-writer', CardWriterController.saveCardWriterConfig);
router.post('/api/card-writer/test', CardWriterController.testConnection);
router.post('/api/card-writer/renew', CardWriterController.renewToken);
router.post('/api/card-writer/register', CardWriterController.registerCard);
router.post('/api/card-writer/read', CardWriterController.readCard);
router.post('/api/card-writer/credentials', CardWriterController.saveCredentials);

module.exports = router; 