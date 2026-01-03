// ========================================
// GPS TRACKER ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const GpsTrackerController = require('../controller/c_gps_tracker');

// ========================================
// PUBLIC ROUTES (GPS Tracker Device)
// ========================================

// GPS tracker endpoint - receives data from GPS tracker device
// This must be public because GPS tracker device sends data here
router.post('/location', express.text({ type: '*/*' }), GpsTrackerController.receiveLocation);

// ========================================
// API ROUTES (For App/Web)
// ========================================

// Get latest location for a device
router.get('/driver/location/:deviceId', GpsTrackerController.getLocation);

// Get location history for a device
router.get('/history/:deviceId', GpsTrackerController.getLocationHistory);

// Get all active devices
router.get('/devices', GpsTrackerController.getActiveDevices);

module.exports = router;

