const express = require('express');
const router = express.Router();
const creditController = require('../controller/c_credit');

router.get('/', creditController.renderCreditPage);
router.get('/credit_data', creditController.tableData);
router.post('/settle/:paymentId', creditController.settle);

module.exports = router;
