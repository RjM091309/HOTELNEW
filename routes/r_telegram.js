const express = require('express');
const router = express.Router();
const TelegramController = require('../controller/c_telegram');

// Telegram Bot Management Routes (Protected)
router.get('/settings', TelegramController.getTelegramSettingsPage);
router.get('/config', TelegramController.getBotConfig);
router.post('/config', TelegramController.saveBotConfig);
router.delete('/config', TelegramController.deleteBotConfig);
router.post('/test', TelegramController.testBot);
router.post('/send', TelegramController.sendMessage);
router.get('/webhook', TelegramController.getWebhookInfo);
router.post('/webhook', TelegramController.setWebhook);
router.delete('/webhook', TelegramController.deleteWebhook);

// Daily Settlement Routes
router.get('/settlement', TelegramController.getDailySettlementPage);
router.get('/settlement/data', TelegramController.getDailySettlement);
router.post('/settlement/send', TelegramController.sendDailySettlement);

module.exports = router;

