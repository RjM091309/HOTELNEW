const express = require('express');
const router = express.Router();

// Import route modules
const loginRoutes = require('./r_login');
const dashboardRoutes = require('./r_dashboard');
const bookingRoutes = require('./r_booking');
const userRoutes = require('./r_user');
const guestRoutes = require('./r_guest');
const roomRoutes = require('./r_room');
const calendarRoutes = require('./r_calendar');
const expensesRoutes = require('./r_expenses');
const employeeRoutes = require('./r_employee');
const servicesRoutes = require('./r_services');
const vehicleRoutes = require('./r_vehicle');
const integrationRoutes = require('./r_integration');
const roomClearanceRoutes = require('./r_room_clearance');
const bookingChannelRoutes = require('./r_booking_channel');
const paymentsRoutes = require('./r_payments');
const telegramRoutes = require('./r_telegram');
const agencyRoutes = require('./r_agency');
const apiRoutes = require('./r_api');
const updatesRoutes = require('./r_updates');

// Auth middleware
const AuthMiddleware = require('../middleware/m_auth');

// Public routes (no authentication required)
router.use('/', loginRoutes);
router.use('/api', apiRoutes);
router.use('/updates', updatesRoutes);

// Telegram webhook endpoint (public - Telegram needs to access this)
const TelegramController = require('../controller/c_telegram');
router.post('/telegram/webhook/update', TelegramController.handleWebhook);


// Protected routes (require authentication)
router.use('/dashboard', AuthMiddleware.requireAuth, dashboardRoutes);
router.use('/booking', AuthMiddleware.requireAuth, bookingRoutes);
router.use('/user_info', AuthMiddleware.requireAuth, userRoutes);
router.use('/guest', AuthMiddleware.requireAuth, guestRoutes);
router.use('/calendar', AuthMiddleware.requireAuth, calendarRoutes);
router.use('/expenses', AuthMiddleware.requireAuth, expensesRoutes);
router.use('/employee', AuthMiddleware.requireAuth, employeeRoutes);
router.use('/services', AuthMiddleware.requireAuth, servicesRoutes);
router.use('/vehicle', AuthMiddleware.requireAuth, vehicleRoutes);
router.use('/room', AuthMiddleware.requireAuth, roomRoutes);
router.use('/integration', AuthMiddleware.requireAuth, integrationRoutes);
router.use('/booking_channel', AuthMiddleware.requireAuth, bookingChannelRoutes);
router.use('/payments', AuthMiddleware.requireAuth, paymentsRoutes);
router.use('/room_clearance', AuthMiddleware.requireAuth, roomClearanceRoutes);
router.use('/telegram', AuthMiddleware.requireAuth, telegramRoutes);
router.use('/agency', AuthMiddleware.requireAuth, agencyRoutes);

// Redirect root to dashboard if authenticated, otherwise to login
router.get('/', AuthMiddleware.redirectIfAuthenticated, (req, res) => {
  res.redirect('/login');
});

module.exports = router;
