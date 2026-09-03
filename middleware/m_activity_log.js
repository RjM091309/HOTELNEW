// ========================================
// ACTIVITY LOG MIDDLEWARE (auto audit trail)
// ========================================
// Drop-in middleware that records every state-changing request (POST/PUT/PATCH/
// DELETE) hitting a mounted route group into the `activity_log` table. This
// guarantees that *every* function reachable from a screen (e.g. the Room
// Reservation Details modal) leaves an audit-trail entry without having to
// hand-instrument each controller method.
//
// Usage in routes/route.js:
//   const { auditTrail } = require('../middleware/m_activity_log');
//   router.use('/dashboard', AuthMiddleware.requireAuth, auditTrail({ module: 'dashboard' }), dashboardRoutes);
//
// Notes:
//  - Read-only endpoints that happen to use POST (lookups / availability checks)
//    are listed in IGNORE_PATHS so they do not pollute the trail.
//  - Never throws and never blocks the response (logs on the 'finish' event).
//  - ActivityLogModel.log() already swallows its own errors.

const ActivityLogModel = require('../models/activityLogModel');
const { getRequestMeta } = require('../utils/activityLogger');

// METHOD + normalized-path  ->  human-friendly ACTION label.
// Numeric path segments are normalized to "#" before lookup.
const ACTION_MAP = {
  // ----- dashboard / room reservation modal -----
  'POST /dashboard/transfer-room': 'ROOM_TRANSFER',
  'POST /dashboard/late-checkout': 'LATE_CHECKOUT',
  'POST /dashboard/extend-stay': 'BOOKING_EXTEND',
  'POST /dashboard/move-to-occupied': 'MOVE_TO_OCCUPIED',
  'POST /dashboard/booking/update_status': 'BOOKING_STATUS_UPDATE',
  'POST /dashboard/booking/check-in-with-deposit': 'CHECK_IN_WITH_DEPOSIT',
  'POST /dashboard/booking/refund-security-deposit': 'SECURITY_DEPOSIT_REFUND',
  'POST /dashboard/booking/revert-security-deposit': 'SECURITY_DEPOSIT_REVERT',
  'PUT /dashboard/room_maintenance/updateStatus/#': 'ROOM_STATUS_UPDATE',

  // ----- booking module -----
  'POST /booking/checkout': 'CHECKOUT',
  'POST /booking/update_status': 'BOOKING_STATUS_UPDATE',
  'POST /booking/add_booking': 'BOOKING_CREATE',
  'POST /booking/edit_booking/#': 'BOOKING_UPDATE',
  'POST /booking/cancel': 'BOOKING_CANCEL',
  'POST /booking/cancel_group': 'GROUP_BOOKING_CANCEL',
  'POST /booking/save-booking-services': 'SERVICE_ADD',
  'POST /booking/remove-service': 'SERVICE_REMOVE',
  'POST /booking/update-service-status': 'SERVICE_STATUS_UPDATE',
  'POST /booking/apply-discount': 'DISCOUNT_APPLY',
  'POST /booking/process-payment': 'PAYMENT_ADD',
  'POST /booking/late_checkout': 'LATE_CHECKOUT',
  'POST /booking/set-maintenance': 'MAINTENANCE_SET',
  'POST /booking/reopen-maintenance': 'MAINTENANCE_REOPEN',
  'POST /booking/complete-maintenance': 'MAINTENANCE_COMPLETE',
  'POST /booking/update-room-payment-status': 'PAYMENT_STATUS_UPDATE',
  'POST /booking/update-extend-payment-status': 'EXTEND_PAYMENT_STATUS_UPDATE',
  'POST /booking/remarks': 'REMARK_ADD',
  'PUT /booking/remarks/#': 'REMARK_UPDATE',
  'DELETE /booking/remarks/#': 'REMARK_DELETE',
  'POST /booking/group_remarks': 'GROUP_REMARK_ADD',
  'POST /booking/complaint-request': 'COMPLAINT_REQUEST_ADD',
  'PUT /booking/complaint-request/#': 'COMPLAINT_REQUEST_UPDATE',
  'PUT /booking/complaint-request/#/status': 'COMPLAINT_REQUEST_STATUS',
  'DELETE /booking/complaint-request/#': 'COMPLAINT_REQUEST_DELETE',
  'POST /booking/add_group_booking': 'GROUP_BOOKING_CREATE',
  'POST /booking/update_group_booking': 'GROUP_BOOKING_UPDATE',
  'POST /booking/group_payment': 'GROUP_PAYMENT_ADD',
  'POST /booking/assign-room-to-direct-reservation': 'DIRECT_RESERVATION_ASSIGN_ROOM',
  'POST /booking/assign_room_to_direct_reservation': 'DIRECT_RESERVATION_ASSIGN_ROOM',
  'POST /booking/mark_notifications_as_read': 'NOTIFICATIONS_MARK_READ',
  'POST /booking/check-in-notifier/notify': 'CHECK_IN_NOTIFY',

  // ----- payments / receipts -----
  'POST /payments/receipts/api/create': 'RECEIPT_CREATE',
  'POST /payments/receipts/api/update': 'RECEIPT_UPDATE',
  'DELETE /payments/receipts/api/#': 'RECEIPT_DELETE',

  // ----- integration / card writer (REGISTER CARD) -----
  'POST /integration/api/card-writer/register': 'CARD_REGISTER',
  'POST /integration/api/card-writer/renew': 'CARD_TOKEN_RENEW',
  'POST /integration/api/card-writer': 'CARD_WRITER_CONFIG_SAVE',
  'POST /integration/api/card-writer/credentials': 'CARD_WRITER_CREDENTIALS_SAVE',
  'POST /integration/api/rooms/update': 'INTEGRATION_ROOM_UPDATE'
};

// Mutating requests that are actually read-only lookups -> skip.
const IGNORE_PATHS = new Set([
  'POST /booking/available-rooms',
  'POST /booking/get-room-details',
  'POST /booking/available-rooms-bed-count',
  'POST /booking/get-direct-reservation-details',
  'POST /booking/get-booking-services',
  'POST /booking/find_consecutive_rooms',
  'POST /booking/find_consecutive_rooms_edit',
  'POST /booking/check_rooms_availability',
  'POST /booking/get_bookings_paid_amounts',
  'POST /booking/get_available_rooms_by_floor',
  'POST /booking/check_room_occupied',
  'POST /dashboard/booking/check_room_occupied',
  'POST /integration/api/card-writer/test',
  'POST /integration/api/card-writer/read',
  // Vouchers are auto-generated on booking create and re-generated on demand -
  // noise, not an audit event.
  'POST /booking/generate-voucher',
  'POST /booking/generate-group-voucher'
]);

function normalizePath(p) {
  return String(p || '')
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? '#' : seg))
    .join('/')
    .replace(/\/$/, '');
}

// Booking id specifically (not any entity) - used for the dedicated BOOKING_ID column.
function pickBookingId(req, params, responseBody) {
  const b = req.body || {};
  const p = params || {};
  const fromReq =
    p.bookingId || p.bookingID ||
    b.bookingId || b.booking_id || b.bookingID || b.BOOKING_ID ||
    (b.booking && (b.booking.id || b.booking.IDNo));
  if (fromReq) return fromReq;
  if (responseBody && typeof responseBody === 'object') {
    return (
      responseBody.bookingId || responseBody.booking_id || responseBody.BOOKING_ID ||
      (responseBody.data && (responseBody.data.bookingId || responseBody.data.booking_id)) ||
      (responseBody.booking && (responseBody.booking.id || responseBody.booking.IDNo)) ||
      null
    );
  }
  return null;
}

// Room id / number for room-centric actions that carry no booking id.
function pickRoomKey(req, params, responseBody) {
  const b = req.body || {};
  const p = params || {};
  const fromReq =
    p.roomId || p.roomID || p.room_id ||
    b.roomId || b.room_id || b.roomID || b.roomNumber || b.room_number || b.roomNo || b.room;
  if (fromReq) return fromReq;
  if (responseBody && typeof responseBody === 'object') {
    const d = responseBody.data || {};
    return responseBody.roomId || responseBody.roomNumber || d.roomId || d.roomNumber || null;
  }
  return null;
}

// Room-status body value for ROOM_STATUS_UPDATE (numeric code or word).
function pickRoomStatus(req, responseBody) {
  const b = req.body || {};
  if (b.status !== undefined) return b.status;
  if (responseBody && responseBody.data && responseBody.data.status !== undefined) return responseBody.data.status;
  return null;
}

function deriveAction(method, normFullPath) {
  const key = `${method} ${normFullPath}`;
  if (ACTION_MAP[key]) return ACTION_MAP[key];
  // Fallback: METHOD_LASTSEGMENT (skip trailing "#")
  const segs = normFullPath.split('/').filter((s) => s && s !== '#');
  const last = segs[segs.length - 1] || 'request';
  return `${method}_${last.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`.slice(0, 50);
}

// Short readable phrase for an ACTION token, e.g. BOOKING_UPDATE -> "Booking updated".
const ACTION_PHRASES = {
  BOOKING_CREATE: 'Booking created',
  BOOKING_UPDATE: 'Booking updated',
  BOOKING_CANCEL: 'Booking cancelled',
  BOOKING_STATUS_UPDATE: 'Booking status changed',
  CHECKOUT: 'Checked out',
  CHECK_IN_WITH_DEPOSIT: 'Checked in (with deposit)',
  MOVE_TO_OCCUPIED: 'Moved to occupied',
  ROOM_TRANSFER: 'Room transferred',
  BOOKING_EXTEND: 'Stay extended',
  LATE_CHECKOUT: 'Late check-out processed',
  DISCOUNT_APPLY: 'Discount applied',
  PAYMENT_ADD: 'Payment added',
  GROUP_PAYMENT_ADD: 'Group payment added',
  PAYMENT_STATUS_UPDATE: 'Payment status changed',
  EXTEND_PAYMENT_STATUS_UPDATE: 'Extension payment status changed',
  SERVICE_ADD: 'Extra service added',
  SERVICE_REMOVE: 'Extra service removed',
  SERVICE_STATUS_UPDATE: 'Service status changed',
  SECURITY_DEPOSIT_REFUND: 'Security deposit refunded',
  SECURITY_DEPOSIT_REVERT: 'Security deposit refund reverted',
  ROOM_STATUS_UPDATE: 'Room status changed',
  MAINTENANCE_SET: 'Room set to maintenance',
  MAINTENANCE_REOPEN: 'Maintenance reopened',
  MAINTENANCE_COMPLETE: 'Maintenance completed',
  REMARK_ADD: 'Remark added',
  REMARK_UPDATE: 'Remark updated',
  REMARK_DELETE: 'Remark deleted',
  COMPLAINT_REQUEST_ADD: 'Complaint/Request added',
  COMPLAINT_REQUEST_UPDATE: 'Complaint/Request updated',
  COMPLAINT_REQUEST_STATUS: 'Complaint/Request status changed',
  COMPLAINT_REQUEST_DELETE: 'Complaint/Request deleted',
  VOUCHER_GENERATE: 'Voucher generated',
  CARD_REGISTER: 'Key card registered',
  RECEIPT_CREATE: 'Receipt created',
  RECEIPT_UPDATE: 'Receipt updated',
  RECEIPT_DELETE: 'Receipt deleted'
};

function humanizeAction(action) {
  if (ACTION_PHRASES[action]) return ACTION_PHRASES[action];
  const s = String(action || '').replace(/_/g, ' ').toLowerCase().trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Action';
}

// Common request-body keys that carry a peso amount for an action.
const AMOUNT_KEYS = [
  'amount', 'amountPaid', 'amount_paid', 'paidAmount', 'paid_amount',
  'payment_amount', 'paymentAmount', 'cost', 'lateCheckoutFee', 'late_checkout_fee',
  'discount', 'discountAmount', 'discount_amount', 'depositAmount', 'deposit_amount',
  'securityDeposit', 'security_deposit', 'refundAmount', 'refund_amount', 'total', 'grandTotal'
];

function extractAmount(body) {
  if (!body || typeof body !== 'object') return null;
  for (const k of AMOUNT_KEYS) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
      const n = parseFloat(String(body[k]).replace(/[, ]/g, ''));
      if (Number.isFinite(n) && n !== 0) return n;
    }
  }
  return null;
}

// Money delta pulled out of a before/after diff (for the Amount column).
const MONEY_DIFF_FIELDS = ['paidAmount', 'discount', 'servicesTotal', 'securityDeposit', 'totalCost'];
function amountFromChanges(changes) {
  if (!Array.isArray(changes)) return null;
  for (const f of MONEY_DIFF_FIELDS) {
    const c = changes.find((x) => x.field === f);
    if (c) {
      const delta = Math.abs(Number(c.to || 0) - Number(c.from || 0));
      if (delta) return delta;
    }
  }
  return null;
}

// Booking id straight from the URL (before the sub-router populates req.params).
function urlBookingId(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  let m = path.match(/(?:edit_booking|booking_details|booking)\/(\d+)/i);
  if (m) return m[1];
  m = path.match(/\/(\d+)(?:\/[a-z_-]+)?\/?$/i);
  return m ? m[1] : null;
}

// Room id straight from the URL (e.g. /room_maintenance/updateStatus/12).
function urlRoomKey(req) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  const m = path.match(/(?:updateStatus|room[s_-]?(?:maintenance)?)\/(\d+)/i) || path.match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
}

// Actions where a before/after booking snapshot diff is worth taking.
const SNAPSHOT_ACTIONS = new Set([
  'BOOKING_UPDATE', 'BOOKING_STATUS_UPDATE', 'BOOKING_CANCEL', 'CHECKOUT',
  'CHECK_IN_WITH_DEPOSIT', 'ROOM_TRANSFER', 'BOOKING_EXTEND',
  'LATE_CHECKOUT', 'DISCOUNT_APPLY', 'PAYMENT_ADD', 'GROUP_PAYMENT_ADD',
  'PAYMENT_STATUS_UPDATE', 'EXTEND_PAYMENT_STATUS_UPDATE', 'SERVICE_ADD', 'SERVICE_REMOVE',
  'SECURITY_DEPOSIT_REFUND', 'SECURITY_DEPOSIT_REVERT'
]);

/**
 * @param {Object} opts
 * @param {string} opts.module   module label stored on each row (e.g. 'dashboard')
 * @param {boolean} [opts.logReads=false]  also log GET/HEAD (default: no)
 */
function auditTrail(opts = {}) {
  const moduleName = opts.module || 'general';
  const logReads = Boolean(opts.logReads);
  const mutating = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return async function auditTrailMiddleware(req, res, next) {
    let beforeSnapshot = null;
    let beforeRoom = null;
    let pendingMoves = null;
    try {
      const method = req.method;
      if (!logReads && !mutating.has(method)) return next();

      const fullPath = normalizePath((req.baseUrl || '') + (req.path || ''));
      const matchKey = `${method} ${fullPath}`;
      if (IGNORE_PATHS.has(matchKey)) return next();

      const plannedAction = deriveAction(method, fullPath);

      // Grab a monetary amount from the request while req.body is still intact.
      const reqAmount = extractAmount(req.body);
      const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]).catch(() => null);

      // Take a "before" snapshot for edit-type actions so we can show what changed.
      if (SNAPSHOT_ACTIONS.has(plannedAction)) {
        const preBookingId = pickBookingId(req, null, null) || urlBookingId(req);
        if (preBookingId) beforeSnapshot = await race(ActivityLogModel.snapshotForAudit(preBookingId), 2500);
      } else if (plannedAction === 'ROOM_STATUS_UPDATE') {
        const rk = pickRoomKey(req, null, null) || urlRoomKey(req);
        if (rk) beforeRoom = await race(ActivityLogModel.roomContext(rk), 2000);
      } else if (plannedAction === 'MOVE_TO_OCCUPIED') {
        pendingMoves = await race(ActivityLogModel.pendingCheckInsSnapshot(), 2500);
      }

      // Capture the response body + route params without altering behaviour.
      // req.params is snapshotted here because Express restores it to the parent
      // router's params once the sub-router finishes (i.e. before 'finish' fires).
      let responseBody = null;
      let capturedParams = req.params && Object.keys(req.params).length ? { ...req.params } : null;
      const origJson = res.json;
      const origSend = res.send;

      res.json = function (body) {
        responseBody = body;
        if (!capturedParams && req.params && Object.keys(req.params).length) capturedParams = { ...req.params };
        return origJson.call(this, body);
      };
      res.send = function (body) {
        if (responseBody === null) responseBody = body;
        if (!capturedParams && req.params && Object.keys(req.params).length) capturedParams = { ...req.params };
        return origSend.call(this, body);
      };

      let logged = false;
      const writeEntry = async () => {
        if (logged) return;
        logged = true;
        try {
          const meta = getRequestMeta(req);
          const action = deriveAction(method, fullPath);
          const success = res.statusCode < 400;

          let parsedResponse = responseBody;
          if (typeof parsedResponse === 'string') {
            try { parsedResponse = JSON.parse(parsedResponse); } catch (e) { /* keep string */ }
          }

          const respMsg =
            parsedResponse && typeof parsedResponse === 'object'
              ? (parsedResponse.message || parsedResponse.error || null)
              : null;

          const bookingId = pickBookingId(req, capturedParams, parsedResponse);

          // "After" snapshot + field-level diff for edit-type actions.
          let changes = null;
          let afterSnapshot = null;
          if (success && SNAPSHOT_ACTIONS.has(action) && bookingId) {
            afterSnapshot = await Promise.race([
              ActivityLogModel.snapshotForAudit(bookingId),
              new Promise((resolve) => setTimeout(() => resolve(null), 2500))
            ]).catch(() => null);
            if (beforeSnapshot && afterSnapshot) {
              const d = ActivityLogModel.diffSnapshots(beforeSnapshot, afterSnapshot);
              changes = d.length ? d : null;
            }
          }

          // Guest / room context for a readable description.
          const bkCtx = afterSnapshot || beforeSnapshot || null;
          let guestName = bkCtx && bkCtx.guestName ? bkCtx.guestName : null;
          let roomNumber = bkCtx && bkCtx.roomNumber ? bkCtx.roomNumber : null;

          // Room-centric actions (no booking id): resolve room number + current guest.
          let roomCtx = null;
          if (!bookingId && !roomNumber) {
            const roomKey = pickRoomKey(req, capturedParams, parsedResponse);
            if (roomKey) {
              roomCtx = await Promise.race([
                ActivityLogModel.roomContext(roomKey),
                new Promise((resolve) => setTimeout(() => resolve(null), 2000))
              ]).catch(() => null);
              if (roomCtx) {
                roomNumber = roomCtx.roomNumber || roomNumber;
                guestName = guestName || roomCtx.guestName || null;
              }
            }
          }

          // Amount for this action (request value, or the money delta from the diff).
          const amount = reqAmount != null ? reqAmount : amountFromChanges(changes);

          // ---- Build a description + detail that always names what/who/where ----
          let description;
          let movedBookings = null;
          let roomForDetail = roomNumber || null;

          if (action === 'MOVE_TO_OCCUPIED') {
            const moved = Array.isArray(pendingMoves) ? pendingMoves : [];
            const n = moved.length;
            if (n) {
              const names = moved.slice(0, 3)
                .map((m) => `${m.guest || 'Guest'}${m.room ? ` (Room ${m.room})` : ''}`).join(', ');
              description = `Moved ${n} guest${n > 1 ? 's' : ''} to occupied: ${names}${n > 3 ? ` +${n - 3} more` : ''}`;
              movedBookings = moved;
            } else {
              description = respMsg ? respMsg.charAt(0).toUpperCase() + respMsg.slice(1) : 'Moved pending check-ins to occupied';
            }
          } else if (action === 'ROOM_STATUS_UPDATE') {
            const newCode = (roomCtx && roomCtx.roomStatus != null) ? roomCtx.roomStatus : pickRoomStatus(req, parsedResponse);
            const newStatusName = ActivityLogModel.roomStatusName(newCode);
            const oldStatusName = beforeRoom ? ActivityLogModel.roomStatusName(beforeRoom.roomStatus) : null;
            if (beforeRoom && beforeRoom.roomNumber) roomForDetail = beforeRoom.roomNumber;

            description = 'Room status changed';
            if (roomForDetail) description += ` — Room ${roomForDetail}`;
            if (oldStatusName && newStatusName) description += `: ${oldStatusName} → ${newStatusName}`;
            else if (newStatusName) description += ` → ${newStatusName}`;
            if (guestName) description += ` · ${guestName}`;

            if (oldStatusName && newStatusName && oldStatusName !== newStatusName) {
              changes = [{ field: 'roomStatus', label: 'Room Status', from: oldStatusName, to: newStatusName }];
            }
          } else {
            description = humanizeAction(action);
            if (bookingId) description += ` — Booking #${bookingId}`;
            if (guestName) {
              description += ` · ${guestName}${roomNumber ? ` (Room ${roomNumber})` : ''}`;
            } else if (roomNumber) {
              description += ` · Room ${roomNumber}`;
            }
            // Amount is shown in its own column - keep it out of the sentence.
            if (!bookingId && !roomNumber && respMsg && description.toLowerCase().indexOf(respMsg.toLowerCase()) === -1) {
              description += ` — ${respMsg}`;
            }
          }
          if (!success) description = `FAILED: ${description}${respMsg ? ` — ${respMsg}` : ''}`;

          // NEW_DATA holds only what a reader needs: changed fields, amount,
          // affected rooms/guests, and a short outcome. Raw payload is dropped.
          const newData = {};
          if (changes) newData.changes = changes;
          if (amount != null) newData.amount = amount;
          if (roomForDetail && !bookingId) newData.room = roomForDetail;
          if (guestName && !bookingId) newData.guest = guestName;
          if (movedBookings) newData.movedBookings = movedBookings;
          if (respMsg) newData.result = respMsg;

          ActivityLogModel.log({
            module: moduleName,
            action,
            bookingId: bookingId || (roomCtx && roomCtx.bookingId) || null,
            status: success ? 'SUCCESS' : 'FAILED',
            errorMessage: success ? null : (respMsg || `HTTP ${res.statusCode}`),
            description,
            amount: amount != null ? amount : null,
            oldData: changes ? beforeSnapshot : null,
            newData: Object.keys(newData).length ? newData : null,
            userId: meta.userId,
            userName: meta.userName
          });
        } catch (e) {
          console.error('⚠️ auditTrail middleware failed:', e.message);
        }
      };

      res.on('finish', () => { writeEntry(); });
      res.on('close', () => { writeEntry(); });
    } catch (e) {
      console.error('⚠️ auditTrail middleware setup failed:', e.message);
    }
    next();
  };
}

module.exports = { auditTrail };
