const path = require('path');
const fs = require('fs');
const AuthModel = require('../models/authModel');
const StaffAppModel = require('../models/staffAppModel');
const RoomRequestModel = require('../models/roomRequestModel');
const OverviewModel = require('../models/overviewModel');
const ActivityLogModel = require('../models/activityLogModel');
const { getRequestMeta } = require('../utils/activityLogger');
const staffRealtime = require('../services/staffAppRealtime');

// /api/staff-app - the Housekeeping phone app (Hotelapp/standalone-apks) on HOTELNEW. The same answers as the K Grand PMS's API, so the
// app works unchanged: it signs in with a PMS account and sends the session token as a bearer token. Errors are { error } with a status.
//
// The property: the app's "PMS server" field may end with the property code (192.168.1.10:5001/clark_central). Without one, the
// account's only property (or the default one) is used. The session stays on that property.

const APPS = { housekeeping: 'Housekeeping' };
const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ error }, extra || {}));
const isAdmin = (user) => Number(user.PERMISSIONS) === 1;

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

// every handler: an error is answered, never thrown out of the route
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error('Staff app error:', e);
  if (!res.headersSent) fail(res, 500, 'The PMS could not do that. Try again.');
});

// the signed-in session (and the app it is for), or a 401 answered
async function session(req, res, appValue) {
  const s = await StaffAppModel.sessionOf(bearer(req));
  if (!s) { fail(res, 401, 'Please sign in.'); return null; }
  if (appValue && String(appValue).toLowerCase() !== s.app) { fail(res, 403, `This sign-in is for the ${APPS[s.app] || s.app} app.`); return null; }
  req.user = s.user;
  req.propertyId = s.propertyId;
  return s;
}

const appUser = (s) => ({
  id: String(s.user.IDNo),
  username: s.user.USERNAME,
  name: s.user.FULLNAME || s.user.USERNAME,
  role: isAdmin(s.user) ? 'admin' : 'staff',
  // the app shows this under the name: the property the phone works on is the useful part
  roleName: (isAdmin(s.user) ? 'Admin' : 'Staff') + ' · ' + s.propertyName,
  app: s.app,
  canAct: true,
  propertyCode: s.propertyCode,
  propertyName: s.propertyName
});

function audit(req, s, entry) {
  ActivityLogModel.log(Object.assign({}, getRequestMeta(req), { module: 'housekeeping', userId: s.user.IDNo, userName: s.user.FULLNAME, propertyId: s.propertyId }, entry)).catch(() => {});
}

// what changed is told to the web screens (dashboard / calendar) and to the phones of the property
function tell(req, s, what) {
  try { const io = req.app.get('io'); if (io) io.emit('dashboard-updated', { source: 'housekeeping-app', propertyId: s.propertyId, action: what }); } catch (e) { /* their refresh still runs */ }
  staffRealtime.changed(s.propertyId);
  staffRealtime.tasks(s.propertyId);
}

// The phone app's own updates: app-releases/<app>/version.json { versionCode, versionName, releaseNotes, file } next to the APK
// (written by Hotelapp/standalone-apks/publish-hk-update.ps1).
const RELEASES_DIR = path.join(__dirname, '..', 'app-releases');

async function publishedRelease(app) {
  if (!APPS[app]) return null;
  const dir = path.join(RELEASES_DIR, app);
  try {
    // a BOM (Windows PowerShell's UTF-8) would make JSON.parse fail
    const info = JSON.parse((await fs.promises.readFile(path.join(dir, 'version.json'), 'utf8')).replace(/^﻿/, ''));
    const versionCode = Number(info.versionCode);
    if (!Number.isInteger(versionCode) || versionCode < 1) return null;
    const file = path.join(dir, path.basename(String(info.file || `${app}-release.apk`)));
    const st = await fs.promises.stat(file);
    if (!st.isFile()) return null;
    return { versionCode, versionName: String(info.versionName || ''), releaseNotes: String(info.releaseNotes || ''), file, size: st.size };
  } catch (e) {
    return null;
  }
}

class StaffAppController {
  // POST /login { app, username, password } -> { token, user }
  static login = wrap(async (req, res) => {
    const app = String((req.body && req.body.app) || '').toLowerCase();
    if (!APPS[app]) return fail(res, 400, `Only the Housekeeping app is connected to this PMS${app ? ` (not "${app}")` : ''}.`);
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) return fail(res, 400, 'Enter your username and password.');
    const user = await AuthModel.getUserByUsername(username);
    const ok = user && user.PASSWORD ? await AuthModel.verifyPassword(password, user.PASSWORD).catch(() => false) : false;
    if (!ok) {
      ActivityLogModel.log(Object.assign({}, getRequestMeta(req), { module: 'auth', action: 'LOGIN_FAILED', status: 'FAILED', userName: username, description: `Failed sign-in to the ${APPS[app]} app` })).catch(() => {});
      return fail(res, 401, 'Incorrect username or password.');
    }
    const picked = await StaffAppModel.pickProperty(user, req.params.propertyCode);
    if (picked.error) return fail(res, 403, picked.error);
    const token = await StaffAppModel.createSession(user.IDNo, app, picked.property.IDNo);
    const s = await StaffAppModel.sessionOf(token);
    audit(req, s, { action: 'LOGIN', description: `Signed in to the ${APPS[app]} app (${s.propertyName})` });
    res.json({ token, user: appUser(s) });
  });

  static logout = wrap(async (req, res) => {
    const token = bearer(req);
    const s = token ? await StaffAppModel.sessionOf(token) : null;
    if (token) await StaffAppModel.endSession(token);
    if (s) audit(req, s, { action: 'LOGOUT', description: `Signed out of the ${APPS[s.app] || s.app} app` });
    res.json({ ok: true });
  });

  static me = wrap(async (req, res) => {
    const s = await session(req, res, req.query.app); if (!s) return;
    res.json({ user: appUser(s) });
  });

  // GET /tasks?type=housekeeping
  static tasks = wrap(async (req, res) => {
    const s = await session(req, res, req.query.type || req.query.app); if (!s) return;
    res.json({ tasks: await StaffAppModel.tasks(s.propertyId) });
  });

  static pending = wrap(async (req, res) => {
    const s = await session(req, res, req.query.type || req.query.app); if (!s) return;
    res.json(await StaffAppModel.pending(s.propertyId));
  });

  // POST /tasks/:id/:action  (accept | start | complete | decline | release). Only the one who took a request (or an Admin) finishes it or gives it back.
  static act = wrap(async (req, res) => {
    const s = await session(req, res); if (!s) return;
    const action = String(req.params.action || '');
    if (!['accept', 'start', 'complete', 'decline', 'release'].includes(action)) return fail(res, 400, 'Unknown action.');
    const id = parseInt(req.params.id, 10);
    const q = id ? await StaffAppModel.task(s.propertyId, id) : null;
    if (!q) return fail(res, 404, 'This request no longer exists.');
    const me = s.user.IDNo, name = s.user.FULLNAME || s.user.USERNAME;
    const mine = q.acceptedById != null && String(q.acceptedById) === String(me);
    const owner = mine || isAdmin(s.user);
    const closed = () => `This request is already ${StaffAppModel.TASK_STATUS[q.status] || q.status}.`;
    const args = { propertyId: s.propertyId, id, userId: me, userName: name };
    if (action === 'accept') {
      if (q.status !== 'pending') return fail(res, 409, q.status === 'accepted' ? (mine ? 'You already took this request.' : `${q.acceptedBy || 'Someone'} already took this request.`) : closed());
      if (!(await RoomRequestModel.accept(args))) return fail(res, 409, 'Someone already took this request.');
    } else if (action === 'start') {
      // housekeeping has no "on the way" step: a request taken is in progress
      if (q.status !== 'accepted') return fail(res, 409, q.status === 'pending' ? 'Accept the request first.' : closed());
      if (!owner) return fail(res, 403, `Only ${q.acceptedBy} can start this request.`);
    } else if (action === 'complete') {
      if (q.status !== 'accepted') return fail(res, 409, q.status === 'pending' ? 'Accept the request first.' : closed());
      if (!owner) return fail(res, 403, `Only ${q.acceptedBy} can complete this request.`);
      if (!(await RoomRequestModel.close(Object.assign({ status: 'done' }, args)))) return fail(res, 409, closed());
    } else if (action === 'decline') {
      if (q.status !== 'pending') return fail(res, 409, q.status === 'accepted' ? `${q.acceptedBy || 'Someone'} already took this request.` : closed());
      if (!(await RoomRequestModel.close(Object.assign({ status: 'declined' }, args)))) return fail(res, 409, closed());
    } else if (action === 'release') {
      if (q.status !== 'accepted') return fail(res, 409, closed());
      if (!owner) return fail(res, 403, `Only ${q.acceptedBy} can give this request back.`);
      if (!(await RoomRequestModel.release(args))) return fail(res, 409, closed());
    }
    const word = { accept: 'took', start: 'started', complete: 'completed', decline: 'declined', release: 'gave back' }[action];
    if (action !== 'start') {
      audit(req, s, { action: 'ROOM_REQUEST_' + action.toUpperCase(), entityType: 'room_request', entityId: id, description: `Housekeeping app: ${word} the ${q.type === 'MUR' ? 'MUR' : 'request "' + String(q.text || '').slice(0, 80) + '"'} of room ${q.roomNumber}` });
      tell(req, s, 'room-request-' + action);
    }
    res.json({ task: StaffAppModel.taskView(await StaffAppModel.task(s.propertyId, id)) });
  });

  // GET /rooms -> { rooms } (the room board)
  static rooms = wrap(async (req, res) => {
    const s = await session(req, res, 'housekeeping'); if (!s) return;
    res.json({ rooms: await StaffAppModel.roomBoard(s.propertyId) });
  });

  // POST /rooms/:id/housekeeping { status: 'clean' | 'dirty' } -> { rooms }
  //  clean: a dirty room becomes available; the open MUR of the room is done (an occupied room stays occupied).
  //  dirty: a clean empty room goes back to "to be cleaned"; an occupied room gets a MUR (its guest stays in).
  static setRoomCleaning = wrap(async (req, res) => {
    const s = await session(req, res, 'housekeeping'); if (!s) return;
    const status = String((req.body && req.body.status) || '');
    if (status !== 'clean' && status !== 'dirty') return fail(res, 400, 'Status must be clean or dirty.');
    const room = await StaffAppModel.roomById(s.propertyId, parseInt(req.params.id, 10) || 0);
    if (!room) return fail(res, 404, 'Room not found.');
    const who = { propertyId: s.propertyId, userId: s.user.IDNo, userName: s.user.FULLNAME || s.user.USERNAME };
    const no = String(room.ROOM_NUMBER);
    if (status === 'dirty' && String(room.ROOM_STATUS) === '2') {
      const r = await RoomRequestModel.create(Object.assign({ roomNumber: no, type: 'MUR', text: '' }, who));
      if (r.error) return fail(res, 404, r.error);
      audit(req, s, { action: 'ROOM_REQUEST_CREATE', entityType: 'room', entityId: room.IDNo, description: `Housekeeping app: MUR for occupied room ${no}` });
    } else {
      const r = await RoomRequestModel.setClean(Object.assign({ roomNumber: no, clean: status === 'clean' }, who));
      if (r.error) return fail(res, r.code || 400, r.error);
      if (r.status !== r.oldStatus) audit(req, s, { action: 'ROOM_STATUS_UPDATE', entityType: 'room', entityId: room.IDNo, oldData: { status: r.oldStatus }, newData: { status: r.status }, description: `Housekeeping app: room ${no} marked ${status === 'clean' ? 'clean (available)' : 'dirty (to be cleaned)'}` });
    }
    tell(req, s, 'room-status-updated');
    res.json({ rooms: await StaffAppModel.roomBoard(s.propertyId) });
  });

  // GET /movements?app=housekeeping&date=YYYY-MM-DD -> { date, arrivals, departures }
  static movements = wrap(async (req, res) => {
    const s = await session(req, res, req.query.app); if (!s) return;
    res.json(await StaffAppModel.movements(s.propertyId, req.query.date));
  });

  // GET /charge-items -> { items } (Services of the category "Minibar" / "Laundry")
  static chargeItems = wrap(async (req, res) => {
    const s = await session(req, res, 'housekeeping'); if (!s) return;
    const items = await RoomRequestModel.chargeItems();
    res.json({ items: items.map((i) => ({ id: String(i.id), category: i.category, name: i.name, price: i.price })) });
  });

  // POST /rooms/:id/charges { category, items: [{ id, count }] } | { category, description, amount } -> { total, lines }
  static postRoomCharge = wrap(async (req, res) => {
    const s = await session(req, res, 'housekeeping'); if (!s) return;
    const room = await StaffAppModel.roomById(s.propertyId, parseInt(req.params.id, 10) || 0);
    if (!room) return fail(res, 404, 'Room not found.');
    const b = req.body || {};
    const r = await RoomRequestModel.addCharge({ propertyId: s.propertyId, roomNumber: room.ROOM_NUMBER, category: String(b.category || ''), items: b.items, description: b.description, amount: b.amount, userId: s.user.IDNo });
    if (r.error) return fail(res, r.code || 400, r.error);
    audit(req, s, { action: 'SERVICE_ADD', bookingId: r.bookingId, entityType: 'booking', entityId: r.bookingId, amount: r.total, description: `Housekeeping app: ${String(b.category).toLowerCase()} for room ${room.ROOM_NUMBER} - ${r.lines.join(', ')}` });
    tell(req, s, 'room-charge');
    res.json({ total: r.total, lines: r.lines.length });
  });

  // GET /building -> the property's rooms as the Dashboard's 3D building draws them (only a property with BUILDING_VIEW has one)
  static building = wrap(async (req, res) => {
    const s = await session(req, res); if (!s) return;
    res.json({
      property: { code: s.propertyCode, name: s.propertyName, buildingView: s.buildingView },
      rooms: s.buildingView ? await OverviewModel.buildingRooms(s.propertyId) : []
    });
  });

  // GET /version?app=housekeeping -> the newest published build, or data: null. No sign-in: a phone signed out can still update.
  static version = wrap(async (req, res) => {
    const app = String(req.query.app || 'housekeeping').toLowerCase();
    const r = await publishedRelease(app);
    res.setHeader('Cache-Control', 'no-store');
    if (!r) return res.json({ success: true, data: null });
    // relative to this endpoint, so a "PMS server" with a property code (/clark_central) downloads through the same path
    res.json({ success: true, data: { versionCode: r.versionCode, versionName: r.versionName, releaseNotes: r.releaseNotes, size: r.size, apkUrl: `apk?app=${encodeURIComponent(app)}&v=${r.versionCode}` } });
  });

  // GET /apk?app=housekeeping -> the published APK
  static apk = wrap(async (req, res) => {
    const r = await publishedRelease(String(req.query.app || 'housekeeping').toLowerCase());
    if (!r) return fail(res, 404, 'No update is published.');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(r.file)}"`);
    res.sendFile(r.file);
  });

  // the Bellman / Driver apps and the room tablets are not connected to HOTELNEW
  static notHere = (req, res) => fail(res, 404, 'Only the Housekeeping app is connected to this PMS.');
}

module.exports = StaffAppController;
