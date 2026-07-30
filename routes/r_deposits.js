const express = require('express');
const router = express.Router();
const DepositsController = require('../controller/c_deposits');

router.get('/', DepositsController.getDepositsPage);
router.get('/api/records', DepositsController.getAll);

module.exports = router;
