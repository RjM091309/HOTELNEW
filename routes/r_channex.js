const express = require('express');
const router = express.Router();
const ChannexController = require('../controller/c_channex');

router.get('/settings', ChannexController.getSettingsPage);
router.get('/test-connection', ChannexController.testConnection);
router.post('/sync-room-types', ChannexController.syncRoomTypes);

module.exports = router;
