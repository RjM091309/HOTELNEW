// ========================================
// ROOM ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const RoomController = require('../controller/c_room');

// ========================================
// PAGE ROUTES
// ========================================

// Room management page
router.get('/', RoomController.getRoomManagement);
router.get('/management', RoomController.getRoomManagement);

// ========================================
// API ROUTES - ROOM CRUD
// ========================================

// Get all rooms
router.get('/api/rooms', RoomController.getAllRooms);

// Get room by ID
router.get('/api/rooms/:id', RoomController.getRoomById);

// Create new room
router.post('/api/rooms/create', RoomController.createRoom);

// Update room
router.post('/api/rooms/update', RoomController.updateRoom);

// Delete room
router.delete('/api/rooms/:id', RoomController.deleteRoom);

// ========================================
// API ROUTES - ROOM TYPE CRUD
// ========================================

// Get room type by ID
router.get('/api/room-types/:id', RoomController.getRoomTypeById);

// Create room type
router.post('/api/room-types/create', RoomController.createRoomType);

// Update room type
router.post('/api/room-types/update', RoomController.updateRoomType);

// Delete room type
router.delete('/api/room-types/:id', RoomController.deleteRoomType);

// ========================================
// API ROUTES - AMENITY CRUD
// ========================================

// Get amenity by ID
router.get('/api/amenities/:id', RoomController.getAmenityById);

// Create amenity
router.post('/api/amenities/create', RoomController.createAmenity);

// Update amenity
router.post('/api/amenities/update', RoomController.updateAmenity);

// Delete amenity
router.delete('/api/amenities/:id', RoomController.deleteAmenity);

// ========================================
// API ROUTES - DROPDOWN DATA
// ========================================

// Get room types for dropdown
router.get('/api/room-types', RoomController.getRoomTypes);

// Get amenities for dropdown
router.get('/api/amenities', RoomController.getAmenities);

// Get all amenities for dropdown
router.get('/api/all-amenities', RoomController.getAllAmenities);

// ========================================
// API ROUTES - SEASONAL PRICING
// ========================================

// Get seasons for seasonal pricing
router.get('/seasons', RoomController.getSeasons);

// ========================================
// API ROUTES - SEASON CRUD
// ========================================

// Get all seasons
router.get('/api/seasons', RoomController.getAllSeasons);

// Get season by ID
router.get('/api/seasons/:id', RoomController.getSeasonById);

// Create season
router.post('/api/seasons/create', RoomController.createSeason);

// Update season
router.post('/api/seasons/update', RoomController.updateSeason);



module.exports = router; 