const express = require('express');
const router = express.Router();
const AuthController = require('../controller/c_auth');

// Auth routes
router.get('/login', AuthController.renderLoginPage);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh-token', AuthController.refreshToken);

module.exports = router; 