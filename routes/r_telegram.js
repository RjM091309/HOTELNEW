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

// KakaoTalk Routes
router.get('/kakao/config', TelegramController.getKakaoConfig);
router.post('/kakao/config', TelegramController.saveKakaoConfig);
router.delete('/kakao/config', TelegramController.deleteKakaoConfig);
router.get('/kakao/login', TelegramController.kakaoLogin);
router.get('/kakao/callback', TelegramController.kakaoCallback);
router.post('/kakao/test', TelegramController.testKakaoTalk);
router.post('/settlement/send/kakaotalk', TelegramController.sendSettlementKakaoTalk);

module.exports = router;

