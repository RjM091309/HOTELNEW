const express = require('express');
const router = express.Router();
const AgencyController = require('../controller/c_agency');

// Render agency management page
router.get('/', AgencyController.renderAgencyPage);

// API endpoint to get agencies data
router.get('/data', AgencyController.getAgenciesData);

// Get bookings for an agency
router.get('/bookings/:id', AgencyController.getAgencyBookings);

// Agency-wide voucher (PDF)
router.get('/voucher/:id', AgencyController.generateAgencyVoucherPDF);

// Add a new agency
router.post('/add', AgencyController.addAgency);

// Fetch specific agency by ID
router.get('/edit_agency', AgencyController.getAgencyById);

// Update an existing agency
router.post('/edit_agency/:id', AgencyController.updateAgency);

// Soft delete an agency
router.delete('/delete/:id', AgencyController.deleteAgency);

module.exports = router;

