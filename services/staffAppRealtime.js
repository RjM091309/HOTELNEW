// Live updates for the staff phone apps (the Housekeeping app of Hotelapp/standalone-apks).
//
// The app connects with socket.io to <PMS address>/api/socket.io and sends its session token in the handshake (auth: { token }).
// This is a SECOND socket.io server on the same http server, on its own path, so the web PMS's socket (/socket.io) is not touched.
// The app's PMS address may carry a property ("http://host:5001/clark_central"): socket.io then opens the namespace "/clark_central",
// so any namespace of one word is accepted. The property itself always comes from the session.
//
// Two events, as the app expects:
//   'changed'        - something in the PMS changed (a check-in / out, a room cleaned at the front desk...): it reloads its room board
//   'service-tasks'  - the requests changed: it reloads them
// Only the phones of the property that changed are told.
const { Server } = require('socket.io');

let io = null;
let nsp = null;
const roomOf = (propertyId) => `staff-hk-${propertyId}`;

function attach(server) {
  if (io) return io;
  const StaffAppModel = require('../models/staffAppModel');
  // The app runs on its own origin (https://localhost inside the APK, a dev server on another port): any origin, never cookies.
  io = new Server(server, { path: '/api/socket.io', serveClient: false, cors: { origin: true, credentials: false }, destroyUpgrade: false, transports: ['websocket', 'polling'] });
  const guard = async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      const s = typeof token === 'string' && token ? await StaffAppModel.sessionOf(token) : null;
      if (!s) return next(new Error('Please sign in.'));
      socket.data.session = s;
      next();
    } catch (e) {
      next(new Error('Please sign in.'));
    }
  };
  const join = (socket) => socket.join(roomOf(socket.data.session.propertyId));
  io.use(guard);
  io.on('connection', join);
  nsp = io.of(/^\/[\w-]+$/);
  nsp.use(guard);
  nsp.on('connection', join);
  return io;
}

function emit(event, propertyId, data) {
  if (!io) return;
  try {
    // the main namespace, and every namespace opened under the parent one ("/clark_central"...): a parent namespace's own .to() would reach nobody
    const spaces = [io.of('/')].concat(Array.from((nsp && nsp.children) || []));
    spaces.forEach((space) => (propertyId ? space.to(roomOf(propertyId)) : space).emit(event, data));
  } catch (e) { /* the app's poll still runs */ }
}

// The time a room became dirty is noted when the change is announced (not only when a phone next asks), so the "Room to clean" alert
// carries the real time even with no app open. Grouped: a burst of changes is looked at once.
let trackTimer = null, trackAll = false;
const trackIds = new Set();
function trackSoon(propertyId) {
  if (propertyId) trackIds.add(Number(propertyId)); else trackAll = true;
  if (trackTimer) return;
  trackTimer = setTimeout(() => {
    trackTimer = null;
    const all = trackAll, ids = Array.from(trackIds);
    trackAll = false; trackIds.clear();
    const M = require('../models/staffAppModel');
    (all ? M.trackDirtyAll() : Promise.all(ids.map((id) => M.trackDirty(id)))).catch(() => {});
  }, 300);
}

// something changed in the PMS (propertyId: only that property; none: every property)
const changed = (propertyId) => { trackSoon(propertyId); emit('changed', propertyId); };
// the housekeeping requests of a property changed
const tasks = (propertyId) => emit('service-tasks', propertyId, { type: 'housekeeping' });

module.exports = { attach, changed, tasks };
