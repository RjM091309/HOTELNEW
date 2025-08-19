// ========================================
// SERVICES ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const ServicesController = require('../controller/c_services');

// ========================================
// PAGE ROUTES
// ========================================

// Services management page
router.get('/', ServicesController.getServicesManagement);
router.get('/management', ServicesController.getServicesManagement);

// ========================================
// API ROUTES - SERVICES CRUD
// ========================================

// Get all services
router.get('/api/services', ServicesController.getAllServices);

// Get service by ID
router.get('/api/services/:id', ServicesController.getServiceById);

// Create new service
router.post('/api/services/create', ServicesController.createService);

// Update service
router.post('/api/services/update', ServicesController.updateService);

// Delete service
router.delete('/api/services/:id', ServicesController.deleteService);

module.exports = router; 