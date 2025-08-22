// ========================================
// USER INFO ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const UserController = require('../controller/c_user');

// ========================================
// PAGE ROUTES
// ========================================

// User info management page
router.get('/', UserController.getUserInfoManagement);
router.get('/management', UserController.getUserInfoManagement);

// ========================================
// API ROUTES - USER INFO CRUD
// ========================================

// Get all users
router.get('/api/users', UserController.getAllUsers);

// Get user by ID
router.get('/api/users/:id', UserController.getUserById);

// Create new user
router.post('/api/users/create', UserController.createUser);

// Update user
router.post('/api/users/update', UserController.updateUser);

// Delete user
router.delete('/api/users/:id', UserController.deleteUser);

// Check username availability
router.post('/api/users/check-username', UserController.checkUsernameAvailability);

// Get current user info
router.get('/api/current-user', UserController.getCurrentUser);

module.exports = router;
