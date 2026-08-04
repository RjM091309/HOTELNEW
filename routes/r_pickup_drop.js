const express = require('express');
const router = express.Router();
const PickupDropController = require('../controller/c_pickup_drop');

router.get('/', PickupDropController.getPickupDropPage);
router.get('/print/bulk', PickupDropController.printBulk);
router.get('/print/:id', PickupDropController.getPrintPage);
router.get('/api/records', PickupDropController.getAll);
router.get('/api/records/:id', PickupDropController.getById);
router.post('/api/records/update', PickupDropController.update);
router.delete('/api/records/:id', PickupDropController.delete);

module.exports = router;
