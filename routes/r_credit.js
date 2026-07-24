const express = require('express');
const router = express.Router();
const creditController = require('../controller/c_credit');

router.get('/', creditController.renderCreditPage);
router.get('/credit_data', creditController.tableData);
router.get('/breakdown', creditController.breakdown);
router.post('/settle/:paymentId', creditController.settle);
router.post('/settle-group', creditController.settleGroup);
router.post('/settle-selected', creditController.settleSelected);

module.exports = router;
