// ========================================
// USER INFO ROUTES
// ========================================

const express = require('express');
const router = express.Router();
const UserController = require('../controller/c_user');

// Only Admin (PERMISSIONS === 1) may view or manage the user directory.
function requireAdminPage(req, res, next) {
  const isAdmin = req.user && Number(req.user.PERMISSIONS) === 1;
  if (isAdmin) return next();
  return res.redirect('/dashboard');
}

function requireAdminApi(req, res, next) {
  const isAdmin = req.user && Number(req.user.PERMISSIONS) === 1;
  if (isAdmin) return next();
  return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
}

// ========================================
// PAGE ROUTES
// ========================================

// User info management page
router.get('/', requireAdminPage, UserController.getUserInfoManagement);
router.get('/management', requireAdminPage, UserController.getUserInfoManagement);

// ========================================
// API ROUTES - USER INFO CRUD
// ========================================

// Get all users
router.get('/api/users', requireAdminApi, UserController.getAllUsers);

// Get user by ID
router.get('/api/users/:id', requireAdminApi, UserController.getUserById);

// Create new user
router.post('/api/users/create', requireAdminApi, UserController.createUser);

// Update user
router.post('/api/users/update', requireAdminApi, UserController.updateUser);

// Delete user
router.delete('/api/users/:id', requireAdminApi, UserController.deleteUser);

// NOTE: intentionally NOT admin-gated - shared utility endpoints used outside
// this page too: check-username is also called from the Employee module, and
// current-user is polled by session-handler.js on every page for all roles.
router.post('/api/users/check-username', UserController.checkUsernameAvailability);
router.get('/api/current-user', UserController.getCurrentUser);

module.exports = router;
