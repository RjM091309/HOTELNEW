const express = require('express');
const router = express.Router();
const paymentsController = require('../controller/c_payments');

// Render Payment Management page
router.get('/', paymentsController.renderPaymentsPage);

// List payments (generic list)
router.get('/list', paymentsController.list);

// DataTables endpoint
router.get('/payments_data', paymentsController.tableData);

// Sales summary
router.get('/sales-summary', paymentsController.salesSummary);

// Detailed breakdown for a booking
router.get('/breakdown/:bookingId', paymentsController.breakdown);

module.exports = router;


