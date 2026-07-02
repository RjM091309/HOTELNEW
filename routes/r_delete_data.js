const express = require('express');
const router = express.Router();
const DeleteDataController = require('../controller/c_delete_data');

router.post('/purge', DeleteDataController.purgeTestData);

module.exports = router;
