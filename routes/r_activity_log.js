const express = require('express');
const router = express.Router();
const ActivityLogController = require('../controller/c_activity_log');

// Landing page
router.get('/', ActivityLogController.renderPage);

// Data endpoints
router.get('/data', ActivityLogController.getData);
router.get('/filter-options', ActivityLogController.getFilterOptions);

module.exports = router;
