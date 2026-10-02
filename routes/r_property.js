const express = require('express');
const router = express.Router();
const propertyController = require('../controller/c_property');

router.post('/switch', propertyController.switchProperty);

module.exports = router;
