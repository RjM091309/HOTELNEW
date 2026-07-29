const express = require('express');
const router = express.Router();
const paymentsController = require('../controller/c_payments');
const ReceiptController = require('../controller/c_receipt');

// Render Payment Management page
router.get('/', paymentsController.renderPaymentsPage);

// List payments (generic list)
router.get('/list', paymentsController.list);

// DataTables endpoint
router.get('/payments_data', paymentsController.tableData);

// Sales summary
router.get('/sales-summary', paymentsController.salesSummary);

// Today's collected payments list
router.get('/today-paid', paymentsController.todayPaidPayments);

// Get payments by booking ID
router.get('/get-payments/:bookingId', paymentsController.getPaymentsByBooking);

// Detailed breakdown for a booking
router.get('/breakdown/:bookingId', paymentsController.breakdown);

// Printable breakdown receipt
router.get('/breakdown-receipt/:bookingId', paymentsController.breakdownReceipt);

// Receipt CRUD (digital receipts — signature left blank for handwriting)
router.get('/receipts', ReceiptController.getReceiptsPage);
router.get('/receipts/api', ReceiptController.getAll);
router.get('/receipts/api/booked-guests', ReceiptController.searchBookedGuests);
router.get('/receipts/api/:id', ReceiptController.getById);
router.post('/receipts/api/create', ReceiptController.create);
router.post('/receipts/api/update', ReceiptController.update);
router.delete('/receipts/api/:id', ReceiptController.delete);
router.get('/receipts/print/bulk', ReceiptController.printBulk);
router.get('/receipts/print/:id', ReceiptController.printReceipt);

// Blank printable payment receipt
router.get('/receipt/blank', ReceiptController.blankReceipt);

// Group booking breakdown
router.get('/group-breakdown/:bookingId', paymentsController.groupBreakdown);

module.exports = router;


