const express = require('express');
const router = express.Router();
const DashboardController = require('../controller/c_dashboard');

// Health check endpoint only
router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        data: { status: 'OK', timestamp: new Date().toISOString() },
        message: 'API is running'
    });
});

// Room monitoring endpoint (no authentication required)
router.get('/room-monitoring', DashboardController.getRoomMonitoring);

module.exports = router;
