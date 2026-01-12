const express = require('express');
const router = express.Router();
const AuthController = require('../controller/c_auth');
const AuthMiddleware = require('../middleware/m_auth');

// Auth routes
router.get('/login', AuthController.renderLoginPage);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh-token', AuthController.refreshToken);
router.get('/auth/api/current-token', AuthMiddleware.isAuthenticated, AuthController.getCurrentToken);
router.post('/auth/api/update-socket-id', AuthMiddleware.isAuthenticated, AuthController.updateSocketId);

module.exports = router; 