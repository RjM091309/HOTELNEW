// ========================================
// VEHICLE ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const VehicleController = require('../controller/c_vehicle');
const VehicleMonitoringController = require('../controller/c_vehicle_monitoring');

// ========================================
// PAGE ROUTES
// ========================================

// Vehicle management page
router.get('/', VehicleController.getVehicleManagement);
router.get('/management', VehicleController.getVehicleManagement);

// Vehicle monitoring page
router.get('/monitoring', VehicleMonitoringController.getVehicleMonitoring);

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

// ========================================
// API ROUTES - VEHICLE MONITORING
// ========================================

// Get all vehicles with GPS location
router.get('/api/monitoring/vehicles', VehicleMonitoringController.getVehiclesWithLocation);

// Get vehicle with location by ID
router.get('/api/monitoring/vehicles/:id', VehicleMonitoringController.getVehicleWithLocation);

// Get vehicle location history
router.get('/api/monitoring/vehicles/:id/history', VehicleMonitoringController.getVehicleLocationHistory);

// Get all GPS devices (including unassigned)
router.get('/api/monitoring/gps-devices', VehicleMonitoringController.getAllGpsDevices);

module.exports = router; 