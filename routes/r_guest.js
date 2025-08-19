const express = require('express');
const router = express.Router();
const GuestController = require('../controller/c_guest');

// Guest profile page routes
router.get('/', GuestController.getGuestProfile);
router.get('/profile', GuestController.getGuestProfile);

// Guest API routes
router.get('/api/guests', GuestController.getAllGuests);
router.get('/api/guests/:id', GuestController.getGuestById);
router.get('/api/guests/:id/bookings', GuestController.getGuestBookings);
router.post('/api/guests/create', GuestController.createGuest);
router.post('/api/guests/update', GuestController.updateGuest);
router.delete('/api/guests/:id', GuestController.deleteGuest);

// Guest statistics routes
router.get('/api/statistics', GuestController.getGuestStatistics);

// File Maintenance Routes
router.get('/guest_type', GuestController.getGuestTypePage);
router.get('/guest_level', GuestController.getGuestLevelPage);

// Guest Type API Routes
router.post('/guest_type/add', GuestController.addGuestType);
router.get('/guest_type/get-all', GuestController.getAllGuestTypes);
router.get('/guest_type/get/:id', GuestController.getGuestTypeById);
router.put('/guest_type/edit/:id', GuestController.editGuestType);
router.put('/guest_type/toggle/:id', GuestController.toggleGuestType);
router.delete('/guest_type/delete/:id', GuestController.deleteGuestType);

// Guest Level API Routes
router.post('/guest_level/add', GuestController.addGuestLevel);
router.get('/guest_level/get-all', GuestController.getAllGuestLevels);
router.get('/guest_level/get/:id', GuestController.getGuestLevelById);
router.put('/guest_level/edit/:id', GuestController.editGuestLevel);
router.put('/guest_level/toggle/:id', GuestController.toggleGuestLevel);
router.delete('/guest_level/delete/:id', GuestController.deleteGuestLevel);

module.exports = router; 