const express = require('express');
const StaffApp = require('../controller/c_staff_app');

// /api/staff-app and /<property code>/api/staff-app - the Housekeeping phone app (Hotelapp/standalone-apks). It checks its own sign-in
// (bearer token, controller/c_staff_app.js): no cookie, no web login. See services/staffAppRealtime.js for its live updates.
const router = express.Router({ mergeParams: true });

router.post('/login', StaffApp.login);
router.post('/logout', StaffApp.logout);
router.get('/me', StaffApp.me);
router.get('/tasks', StaffApp.tasks);
router.get('/pending', StaffApp.pending);
router.post('/tasks/:id/:action', StaffApp.act);
router.get('/rooms', StaffApp.rooms);
router.post('/rooms/:id/housekeeping', StaffApp.setRoomCleaning);
router.post('/rooms/:id/charges', StaffApp.postRoomCharge);
router.post('/rooms/:id/requests', StaffApp.createRoomRequest);
router.get('/charge-items', StaffApp.chargeItems);
router.get('/movements', StaffApp.movements);
router.get('/building', StaffApp.building);
router.get('/version', StaffApp.version);
router.get('/apk', StaffApp.apk);
router.all(['/trips', '/trips/*', '/room-tablet/*'], StaffApp.notHere);

// The app runs on its own origin (https://localhost in the APK, a dev server on another port), so the browser asks first (CORS).
// Any origin may call these routes: they never use the cookie, only the token in a header, which another site does not have.
// Used in app.js BEFORE the site's own cors(), which only knows the web origins.
function staffAppCors(req, res, next) {
  if (!/\/api\/staff-app(\/|$)/.test(req.path)) return next();
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Room-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  req.staffApp = true;
  next();
}

module.exports = router;
module.exports.staffAppCors = staffAppCors;
