// ========================================
// VEHICLE ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const VehicleController = require('../controller/c_vehicle');

// ========================================
// PAGE ROUTES
// ========================================

// Vehicle management page
router.get('/', VehicleController.getVehicleManagement);
router.get('/management', VehicleController.getVehicleManagement);

// ========================================
// API ROUTES - VEHICLE CRUD
// ========================================

// Get all vehicles
router.get('/api/vehicles', VehicleController.getAllVehicles);

// Get vehicle by ID
router.get('/api/vehicles/:id', VehicleController.getVehicleById);

// Create new vehicle
router.post('/api/vehicles/create', VehicleController.createVehicle);

// Update vehicle
router.post('/api/vehicles/update', VehicleController.updateVehicle);

// Delete vehicle
router.delete('/api/vehicles/:id', VehicleController.deleteVehicle);

module.exports = router; 