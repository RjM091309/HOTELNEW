// =============================================================================
// CALENDAR EVENTS MODULE
// =============================================================================

// This module contains event handlers for the calendar system

// =============================================================================
// GROUP BOOKING COLOR ASSIGNMENT
// =============================================================================

// Group booking border colors — normal hues, medium saturation (visible but not harsh).
// Avoid booking-highlight / legend colors: #FFC107, #6f9c40, #5B9BD5, #e53935,
// #D5A6BD, #FFEB3B, #424242, #00E5FF, #FB8C00, #1A3FA0, #7B1FA2, #000000, #9c27b0
const GROUP_COLORS = [
  '#5C6BC0', // indigo
  '#7E57C2', // purple
  '#26A69A', // teal
  '#66BB6A', // green
  '#EC407A', // pink
  '#AB47BC', // violet
  '#42A5F5', // sky blue
  '#29B6F6', // light blue
  '#4DB6AC', // turquoise
  '#9575CD', // lavender
  '#7986CB', // periwinkle
  '#BA68C8', // orchid
  '#81C784', // mint green
  '#4DD0E1', // cyan
  '#8D6E63', // brown
  '#78909C', // blue gray
  '#A1887F', // warm taupe
  '#FF8A65', // soft coral
  '#9CCC65', // lime green
  '#64B5F6'  // soft blue
];

const LONG_TERM_BORDER_COLOR = '#9c27b0'; // matches legend long-term purple
const BOOKING_CHANNEL_BORDER_COLOR = '#D5A6BD'; // matches legend OTA prepaid mauve

// =============================================================================
// BOOKING HIGHLIGHT COLOR SCHEME (phase x payment, plus side-indicator accents)
// =============================================================================
const CHECKIN_PAID_COLOR = '#FFC107';           // Yellow: Check-In (paid)
const CHECKIN_UNPAID_COLOR = '#6f9c40';         // Green: Check-In (unpaid)
const RESERVATION_PAID_COLOR = '#5B9BD5';       // Blue: Reservation (paid)
const RESERVATION_UNCONFIRMED_COLOR = '#e53935';// Red: Reservation (unconfirmed)
const OTA_PREPAID_COLOR = BOOKING_CHANNEL_BORDER_COLOR; // Mauve: OTA booking (prepaid)
const PENCIL_BOOKING_COLOR = '#FFEB3B';         // Bright yellow: Pencil booking (hold pending)
const CHECKOUT_PAID_COLOR = '#424242';          // Dark gray: Check-Out (paid)
const CHECKOUT_UNPAID_COLOR = '#00E5FF';        // Cyan: Check-Out (unpaid)

// Side indicators (box-shadow edge accents layered on top of the fill color above)
const LATE_CHECKIN_ACCENT_COLOR = '#FB8C00';        // Orange: Check-in late (12mn-2am)
const LATE_CHECKOUT_BTB_ACCENT_COLOR = '#1A3FA0';   // Dark blue: Late check-out (11PM) & BTB
const RESERVATION_FEE_ACCENT_COLOR = '#7B1FA2';     // Purple: Reservation fee paid

// Cache to store groupBookingId -> color mapping (consistent across all events)
const groupColorCache = {};

function hashGroupBookingId(id) {
  const str = String(id);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function isLongTermBooking(event) {
  const raw = event.extendedProps?.isLongTermStay;
  return raw === true || raw === 1 || raw === '1';
}

function isBookingChannelBooking(event) {
  const channel = String(event.extendedProps?.bookingChannel || '').trim().toLowerCase();
  return channel === 'booking-channel' || channel === 'booking channel';
}

function isGroupBookingEvent(event) {
  const groupBookingId = event.extendedProps?.groupBookingId;
  return groupBookingId != null && groupBookingId !== 0 && groupBookingId !== '' && String(groupBookingId).trim() !== '';
}

function applyHighlightBorderStyles(el, borderColor, variant) {
  el.classList.remove('group-booking', 'long-term-booking', 'booking-channel-booking');
  if (variant === 'group') el.classList.add('group-booking');
  if (variant === 'long-term') el.classList.add('long-term-booking');
  if (variant === 'booking-channel') el.classList.add('booking-channel-booking');
  el.style.setProperty('--booking-border-color', borderColor);
  el.style.setProperty('border', `4px solid ${borderColor}`, 'important');
  el.setAttribute('data-highlight-border-color', borderColor);
  el.style.height = '24px';
  el.style.minHeight = '24px';
  el.style.marginTop = '-4px';
  // Text color is left as-is here: applyCompositeStatusStyles already picked
  // black/white based on the fill color's contrast before this runs.
  const titleElement = el.querySelector('.fc-event-title');
  if (titleElement) {
    titleElement.classList.add('group-booking-text');
  }
}

function clearHighlightBorderStyles(el) {
  el.classList.remove('group-booking', 'long-term-booking', 'booking-channel-booking');
  el.style.removeProperty('--booking-border-color');
  el.removeAttribute('data-highlight-border-color');
  el.removeAttribute('data-channel-stripe-shadow');
  el.style.border = '';
  el.style.height = '';
  el.style.minHeight = '';
  el.style.marginTop = '';
  const titleElement = el.querySelector('.fc-event-title');
  if (titleElement) {
    titleElement.classList.remove('group-booking-text');
  }
}

function applyBookingHighlightBorder(event, el) {
  // Group / long-term / OTA outline borders are disabled for now — removed
  // per request ("alisin muna yung mga border status outline"). Clearing
  // whatever was previously applied and returning early; the logic below is
  // left intact so this can be turned back on later.
  clearHighlightBorderStyles(el);
  return;

  // eslint-disable-next-line no-unreachable
  if (isLongTermBooking(event)) {
    el.removeAttribute('data-channel-stripe-shadow');
    applyHighlightBorderStyles(el, LONG_TERM_BORDER_COLOR, 'long-term');
    return;
  }

  const isGroup = isGroupBookingEvent(event);
  const isChannel = isBookingChannelBooking(event);

  // Group bookings keep the group color as the outer border. Booking Channel
  // (OTA) adds a pink inner stripe so both types stay visible; the stripe is
  // stashed on a data attribute rather than applied directly to box-shadow
  // here, since applySideIndicatorAccents() owns that property and merges
  // this stripe into its own combined box-shadow value.
  if (isGroup) {
    applyHighlightBorderStyles(el, getGroupBookingColor(event.extendedProps.groupBookingId), 'group');
    if (isChannel) {
      el.classList.add('booking-channel-booking');
      el.setAttribute(
        'data-channel-stripe-shadow',
        `inset 0 0 0 3px ${BOOKING_CHANNEL_BORDER_COLOR}, 0 0 0 1px rgba(0, 0, 0, 0.12)`
      );
    } else {
      el.removeAttribute('data-channel-stripe-shadow');
    }
    return;
  }

  el.removeAttribute('data-channel-stripe-shadow');

  if (isChannel) {
    applyHighlightBorderStyles(el, BOOKING_CHANNEL_BORDER_COLOR, 'booking-channel');
    return;
  }

  clearHighlightBorderStyles(el);
}

/**
 * Get a consistent color for a group booking based on its ID
 * @param {number|string} groupBookingId - The group booking ID
 * @returns {string} - Hex color code
 */
function getGroupBookingColor(groupBookingId) {
  if (!groupBookingId || groupBookingId === 0 || groupBookingId === '') {
    return '#7986CB'; // Default periwinkle if invalid
  }
  
  const id = String(groupBookingId);
  
  // Return cached color if exists
  if (groupColorCache[id]) {
    return groupColorCache[id];
  }
  
  const colorIndex = hashGroupBookingId(id) % GROUP_COLORS.length;
  const assignedColor = GROUP_COLORS[colorIndex];
  
  // Cache the color for this group
  groupColorCache[id] = assignedColor;
  
  return assignedColor;
}

// =============================================================================
// SCHEDULE BAR GLOW (after modal close)
// =============================================================================

const calendarGlowTimers = {};
const calendarGlowSuppress = {};

function suppressCalendarScheduleBarGlow(bookingId) {
  if (!bookingId) return;
  calendarGlowSuppress[String(bookingId)] = true;
}

function glowCalendarScheduleBar(bookingId, durationMs = 3000) {
  if (!bookingId) return;

  const id = String(bookingId);
  if (calendarGlowSuppress[id]) {
    delete calendarGlowSuppress[id];
    return;
  }

  if (calendarGlowTimers[id]) {
    clearTimeout(calendarGlowTimers[id]);
    delete calendarGlowTimers[id];
  }

  let eventEl = window.eventElements?.[id] || window.eventElements?.[bookingId];
  if (!eventEl && window.calendar?.getEventById) {
    const fcEvent = window.calendar.getEventById(id);
    eventEl = fcEvent ? window.eventElements?.[fcEvent.id] : null;
  }
  if (!eventEl) return;

  const harness = eventEl.closest('.fc-timeline-event-harness');

  eventEl.classList.remove('schedule-bar-glow');
  if (harness) harness.classList.remove('schedule-bar-glow');

  // Force reflow so re-adding the class restarts the animation
  void eventEl.offsetWidth;

  eventEl.classList.add('schedule-bar-glow');
  if (harness) harness.classList.add('schedule-bar-glow');

  calendarGlowTimers[id] = setTimeout(() => {
    eventEl.classList.remove('schedule-bar-glow');
    if (harness) harness.classList.remove('schedule-bar-glow');
    delete calendarGlowTimers[id];
  }, durationMs);
}

function attachCalendarGlowOnBootstrapModal(modalEl, bookingId) {
  if (!modalEl || !bookingId) return;

  const onHidden = () => {
    glowCalendarScheduleBar(bookingId);
  };

  modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
}

function isCalendarPageContext() {
  return !!(window.calendar && document.getElementById('calendar'));
}

async function refreshCalendarAfterPaymentSuccess(bookingId) {
  if (!isCalendarPageContext()) return false;

  const id = bookingId ? String(bookingId) : '';
  if (id && typeof suppressCalendarScheduleBarGlow === 'function') {
    suppressCalendarScheduleBarGlow(id);
  }

  if (typeof window.refreshCalendarBookings === 'function') {
    await window.refreshCalendarBookings();
  }

  if (id) {
    requestAnimationFrame(() => glowCalendarScheduleBar(id));
  }

  return true;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function getCalendarBookingStatus(event) {
  return String(event?.extendedProps?.bookingStatus || '').trim().toLowerCase();
}

function isMaintenanceCalendarEvent(event) {
  if (getCalendarBookingStatus(event) === 'maintenance') {
    return true;
  }

  const title = String(event?.title || '').trim();
  if (title === 'Maintenance' || title === 'AG - Maintenance') {
    return true;
  }

  const bg = String(event?.backgroundColor || '').trim().toLowerCase();
  if (bg === '#000000' && event?.extendedProps?.maintenanceReason) {
    return true;
  }

  return false;
}

function handleEventClick(info) {
  if (info.jsEvent) {
    info.jsEvent.preventDefault();
    info.jsEvent.stopPropagation();
  }

  const calendar = info.view?.calendar || window.calendar;
  if (calendar) {
    calendar.unselect();
  }

  if (typeof window.cleanupModalOverlays === 'function' && !(typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible())) {
    window.cleanupModalOverlays();
  }

  const event = info.event;
  const status = event.extendedProps.bookingStatus;
  const bookingId = event.id;  // should match your BookingID

  // getResources() is on the EventApi, not on `info`
  const resources = event.getResources();
  const room = resources.length ? resources[0] : null;
  const roomId = room?.id;
  if (!roomId) {
    return;
  }

  if (isMaintenanceCalendarEvent(event)) {
    if (typeof showMaintenanceModal === 'function') {
      showMaintenanceModal(event);
    }
    return;
  }

  // Route to appropriate modal based on status
  switch (status) {
    case 'check-In':
      // Open room menu modal for active check-ins
      window.openRoomMenuModal(bookingId, event);
      break;
      
    case 'check-Out':
      // Open checkout backtrack modal for completed check-outs
      window.openCheckoutBacktrackModal(bookingId, event);
      break;
      
    case 'pending': {
      // Hold-pending reservations have no meaningful check-in status yet, so
      // never route them to the late-check-in modal - showPendingModal renders
      // the "HOLD PENDING" badge for them.
      const hpRaw = event.extendedProps?.holdPending;
      const isHoldPendingEvt = hpRaw === 1 || hpRaw === '1' || hpRaw === true
        || String(hpRaw).toLowerCase() === 'true';

      // Otherwise route on the actual late-check-in flag rather than fill color,
      // since fill color now encodes payment status (paid/unpaid/OTA/pencil).
      if (!isHoldPendingEvt && isLateCheckIn(event)) {
        showLateCheckInModal(event);
      } else {
        showPendingModal(event);
      }
      break;
    }
      
    case 'cancelled':
      // Open the full Room Reservation Details modal in read-only mode so a
      // cancelled booking can be inspected (guest, room, services, totals) while
      // every action button stays disabled.
      window.openRoomMenuModal(bookingId, event);
      break;

    case 'maintenance':
      showMaintenanceModal(event);
      break;
      
    default:
      // For any other status, show appropriate modal
      if (status === 'late check-in' || status === 'late_check_in' || status === 'late_checkin') {
        showLateCheckInModal(event);
      } else {
        // Check if we can determine status from event color or other properties
        const eventColor = event.backgroundColor;

        if (isLateCheckIn(event)) {
          showLateCheckInModal(event);
        } else if (eventColor === RESERVATION_UNCONFIRMED_COLOR) {
          showPendingModal(event);
        } else if (eventColor === '#000000') {
          const barStatus = getCalendarBookingStatus(event);
          if (barStatus === 'cancelled') {
            window.openRoomMenuModal(bookingId, event);
          } else if (isMaintenanceCalendarEvent(event)) {
            showMaintenanceModal(event);
          } else {
            showEventInfoModal(event);
          }
        } else {
          // Fallback to event info modal
          showEventInfoModal(event);
        }
      }
      break;
  }
}

// Single fill color per booking, driven by phase (reservation / check-in / check-out)
// crossed with payment status (paid vs not-fully-paid). Late check-in, late
// check-out/back-to-back, and "reservation fee paid" (partial payment) are shown
// separately as side-indicator accents — see applySideIndicatorAccents().
function getPaymentStatusNormalized(event) {
  const raw = (event.extendedProps?.paymentStatus || 'unpaid').toLowerCase();
  return raw === 'partial_paid' ? 'partial' : raw;
}

// Light fill colors need dark text for legibility; everything else stays white.
const DARK_TEXT_FILL_COLORS = new Set([
  CHECKIN_PAID_COLOR,
  PENCIL_BOOKING_COLOR,
  OTA_PREPAID_COLOR,
  CHECKOUT_UNPAID_COLOR
]);

function applyCompositeStatusStyles(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;

    if (bookingStatus === 'cancelled' || bookingStatus === 'maintenance') {
      el.removeAttribute('data-composite');
      el.style.background = '';
      el.style.backgroundColor = event.backgroundColor || '#000000';
      el.style.setProperty('color', '#fff', 'important');
      el.style.setProperty('text-shadow', '0 1px 1px rgba(0, 0, 0, 0.5)', 'important');
      applyBookingHighlightBorder(event, el);
      el.style.zIndex = bookingStatus === 'cancelled' ? '1' : '2';
      return;
    }

    const holdPendingRaw = event.extendedProps?.holdPending;
    const isHoldPending = holdPendingRaw === 1 || holdPendingRaw === '1' || holdPendingRaw === true
      || String(holdPendingRaw).toLowerCase() === 'true';

    const isFullyPaid = getPaymentStatusNormalized(event) === 'paid';

    let fillColor;
    if (bookingStatus === 'pending' && isHoldPending) {
      fillColor = PENCIL_BOOKING_COLOR; // Pencil booking / hold pending
    } else if (bookingStatus === 'pending') {
      fillColor = isBookingChannelBooking(event)
        ? OTA_PREPAID_COLOR
        : (isFullyPaid ? RESERVATION_PAID_COLOR : RESERVATION_UNCONFIRMED_COLOR);
    } else if (bookingStatus === 'check-In') {
      fillColor = isFullyPaid ? CHECKIN_PAID_COLOR : CHECKIN_UNPAID_COLOR;
    } else if (bookingStatus === 'check-Out') {
      fillColor = isFullyPaid ? CHECKOUT_PAID_COLOR : CHECKOUT_UNPAID_COLOR;
    } else {
      fillColor = event.backgroundColor || '';
    }

    el.removeAttribute('data-composite');
    el.style.background = '';
    if (fillColor) {
      el.style.backgroundColor = fillColor;
    }
    // !important: calendar.css forces white text on group/long-term-booking
    // events; this fill-based contrast choice must win over that.
    const useDarkText = DARK_TEXT_FILL_COLORS.has(fillColor);
    el.style.setProperty('color', useDarkText ? '#000' : '#fff', 'important');
    // The title chip's text-shadow inherits from here. A dark shadow behind
    // dark text just smudges the letters, so flip to a light halo instead.
    el.style.setProperty(
      'text-shadow',
      useDarkText ? '0 1px 1px rgba(255, 255, 255, 0.7)' : '0 1px 1px rgba(0, 0, 0, 0.5)',
      'important'
    );
    applyBookingHighlightBorder(event, el);

    // Lower z-index for pending/check-in bars so a same-day checkout bar
    // in the same room can render on top at the turnover boundary
    el.style.zIndex = (bookingStatus === 'pending' || bookingStatus === 'check-In') ? '5' : '';
  } catch (e) {
    // ignore
  }
}

// =============================================================================
// SIDE INDICATORS (late check-in / late check-out & BTB / reservation fee paid)
// =============================================================================
// Layered as box-shadow edge accents so they stack independently of the
// group/long-term/OTA `border` property set by applyBookingHighlightBorder().

// Outlines both bookings involved in a same-room, same-day turnover
// (one checking out, the other checking in).
function isBackToBackEvent(event) {
  return !!event.extendedProps?.isBackToBack;
}

// Renders just the group+OTA inner mauve stripe (stashed by applyBookingHighlightBorder
// on data-channel-stripe-shadow). Used while the rest of applySideIndicatorAccents()
// is disabled, so that unrelated combo still shows correctly.
function applyChannelStripeAccent(event, el) {
  try {
    const channelStripe = el.getAttribute('data-channel-stripe-shadow');
    if (channelStripe) {
      el.style.setProperty('box-shadow', channelStripe, 'important');
    } else {
      el.style.boxShadow = '';
    }
  } catch (e) {
    // ignore
  }
}

function applySideIndicatorAccents(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;

    if (bookingStatus === 'cancelled' || bookingStatus === 'maintenance') {
      el.style.boxShadow = '';
      el.removeAttribute('data-side-indicator');
      return;
    }

    const shadows = [];
    // Group+OTA bookings stash their inner mauve stripe here (see applyBookingHighlightBorder)
    // since this function owns the box-shadow property and must not clobber it.
    const channelStripe = el.getAttribute('data-channel-stripe-shadow');
    if (channelStripe) {
      shadows.push(channelStripe);
    }
    if (isLateCheckIn(event)) {
      shadows.push(`inset 4px 0 0 0 ${LATE_CHECKIN_ACCENT_COLOR}`);
    }
    if (isLateCheckout(event) || isBackToBackEvent(event)) {
      shadows.push(`inset -4px 0 0 0 ${LATE_CHECKOUT_BTB_ACCENT_COLOR}`);
    }
    if (getPaymentStatusNormalized(event) === 'partial') {
      shadows.push(`inset 0 -4px 0 0 ${RESERVATION_FEE_ACCENT_COLOR}`);
    }

    if (shadows.length) {
      el.style.setProperty('box-shadow', shadows.join(', '), 'important');
      el.setAttribute('data-side-indicator', 'true');
    } else if (el.getAttribute('data-side-indicator') === 'true') {
      el.style.boxShadow = '';
      el.removeAttribute('data-side-indicator');
    }
  } catch (e) {
    // ignore
  }
}

function applyPickupIndicator(event, el) {
  try {
    const hasPickup = !!event.extendedProps?.hasPickup;
    const existing = el.querySelector('.pickup-service-indicator');

    if (!hasPickup) {
      if (existing) existing.remove();
      el.classList.remove('has-pickup-service');
      return;
    }

    el.classList.add('has-pickup-service');
    const indicator = existing || document.createElement('div');
    indicator.className = 'pickup-service-indicator';
    indicator.title = 'Pick-up Service';
    indicator.innerHTML = '<i class="fa fa-plane" aria-hidden="true"></i>';
    if (!existing) el.appendChild(indicator);
  } catch (e) {
    // ignore
  }
}

// Guest-name overlay drawn on the un-skewed harness ABOVE the edge caps, so the
// name always sits IN FRONT of the blue / orange cap instead of behind it.
function syncEventNameOverlay(event, el) {
  try {
    const harness = el.closest('.fc-timeline-event-harness') || el;
    let ov = harness.querySelector(':scope > .event-name-overlay');
    const want = el.classList.contains('has-late-checkout-end')
      || el.classList.contains('has-late-checkin-start')
      || el.classList.contains('has-early-checkin-start')
      || el.classList.contains('has-reservation-fee-start');

    if (!want) {
      if (ov) ov.remove();
      el.classList.remove('has-name-overlay');
      return;
    }
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'event-name-overlay';
      harness.appendChild(ov);
    }
    ov.textContent = event.title || '';
    el.classList.add('has-name-overlay');
  } catch (e) {
    // ignore
  }
}

// Solid blue cap over the END (checkout edge) of every Late Check-Out booking
// bar. Mounted on the un-skewed .fc-timeline-event-harness wrapper (NOT on the
// skewed, overflow:hidden .fc-event) so it can fully cover the bar's slanted
// tip - blue all the way, no bar colour left showing.
function applyLateCheckoutEndMarker(event, el) {
  try {
    const harness = el.closest('.fc-timeline-event-harness') || el;
    const status = String(event.extendedProps?.bookingStatus || '').toLowerCase();
    const isLate =
      event.extendedProps?.checkOutStatus === 1 ||
      event.extendedProps?.checkOutStatus === '1' ||
      (typeof isLateCheckout === 'function' && isLateCheckout(event));

    const existing = harness.querySelector(':scope > .late-checkout-end-marker');

    if (!isLate || status === 'cancelled' || status === 'maintenance') {
      if (existing) existing.remove();
      el.classList.remove('has-late-checkout-end');
      return;
    }

    el.classList.add('has-late-checkout-end');
    if (!existing) {
      const marker = document.createElement('div');
      marker.className = 'late-checkout-end-marker';
      marker.title = 'Late Check-Out';
      harness.appendChild(marker);
    }
  } catch (e) {
    // ignore
  }
}

// Orange cap over the START (check-in edge) of every Late Check-In booking bar -
// mirror of the blue late-check-out cap, on the left edge.
function applyLateCheckInStartMarker(event, el) {
  try {
    const harness = el.closest('.fc-timeline-event-harness') || el;
    const status = String(event.extendedProps?.bookingStatus || '').toLowerCase();
    const hpRaw = event.extendedProps?.holdPending;
    const isHoldPending = hpRaw === 1 || hpRaw === '1' || hpRaw === true
      || String(hpRaw).toLowerCase() === 'true';
    const isLate = !isHoldPending && (
      event.extendedProps?.checkInStatus === 0 ||
      event.extendedProps?.checkInStatus === '0' ||
      (typeof isLateCheckIn === 'function' && isLateCheckIn(event))
    );

    const existing = harness.querySelector(':scope > .late-checkin-start-marker');

    if (!isLate || status === 'cancelled' || status === 'maintenance') {
      if (existing) existing.remove();
      el.classList.remove('has-late-checkin-start');
      return;
    }

    el.classList.add('has-late-checkin-start');
    if (!existing) {
      const marker = document.createElement('div');
      marker.className = 'late-checkin-start-marker';
      marker.title = 'Late Check-In';
      harness.appendChild(marker);
    }
  } catch (e) {
    // ignore
  }
}

// Fuchsia cap over the START (left) edge of every booking that has a reservation
// fee paid (partial payment) - same shape as the orange late-check-in cap.
function applyReservationFeeStartMarker(event, el) {
  try {
    const harness = el.closest('.fc-timeline-event-harness') || el;
    const status = String(event.extendedProps?.bookingStatus || '').toLowerCase();
    const isResFee = getPaymentStatusNormalized(event) === 'partial';

    const existing = harness.querySelector(':scope > .reservation-fee-start-marker');

    if (!isResFee || status === 'cancelled' || status === 'maintenance') {
      if (existing) existing.remove();
      el.classList.remove('has-reservation-fee-start');
      return;
    }

    el.classList.add('has-reservation-fee-start');
    if (!existing) {
      const marker = document.createElement('div');
      marker.className = 'reservation-fee-start-marker';
      marker.title = 'Reservation Fee Paid';
      harness.appendChild(marker);
    }
  } catch (e) {
    // ignore
  }
}

// Pixels this bar spans per calendar day, from its own rendered geometry
// (pixel width / duration in days) - no dependency on slot DOM layout timing.
function oneDayWidthForBar(event, el) {
  const startMs = event.start ? event.start.getTime() : 0;
  const endMs = event.end ? event.end.getTime() : 0;
  const durMs = endMs - startMs;
  const barW = el.getBoundingClientRect().width;
  if (durMs > 0 && barW > 0) return barW * (86400000 / durMs);
  return 40;
}

// Right edge (viewport px) of the nearest earlier bar (incl. its blue late-
// checkout cap) in the SAME room row - used to butt the Early Check-In black
// block right against a previous stay, which reads as a back-to-back booking.
function prevBarRightEdge(harness, myEl, myLeft) {
  try {
    const scope = harness.closest('.fc-timeline-lane, .fc-timeline-lane-frame')
      || harness.parentElement;
    if (!scope) return null;
    let best = null;
    scope.querySelectorAll('.fc-timeline-event-harness').forEach(h => {
      if (h === harness) return;
      const ev = h.querySelector('.fc-event');
      if (!ev || ev === myEl) return;
      if (ev.classList.contains('fc-event-cancelled') || h.style.zIndex === '1') return;
      const r = ev.getBoundingClientRect();
      if (r.width === 0) return;
      let right = r.right;
      const cap = h.querySelector('.late-checkout-end-marker');
      if (cap) right = Math.max(right, cap.getBoundingClientRect().right);
      if (right <= myLeft + 4 && (best === null || right > best)) best = right;
    });
    return best;
  } catch (e) {
    return null;
  }
}

// Black block for every Early Check-In bar. The red bar keeps its real start
// (3 PM of the check-in day, so drag/resize math is untouched). The black marks
// the day BEFORE check-in - one full day column ("no booking allowed" day) -
// sitting flush against the red bar. When the previous stay in that room ends
// just before it (back-to-back), the black stretches left to butt against that
// stay's end / its blue late-checkout cap so the two connect visually.
function applyEarlyCheckInStartMarker(event, el) {
  try {
    const harness = el.closest('.fc-timeline-event-harness') || el;
    const status = String(event.extendedProps?.bookingStatus || '').toLowerCase();
    const hpRaw = event.extendedProps?.holdPending;
    const isHoldPending = hpRaw === 1 || hpRaw === '1' || hpRaw === true
      || String(hpRaw).toLowerCase() === 'true';
    const isEarly = !isHoldPending && Number(event.extendedProps?.checkInStatus) === 2;

    const existing = harness.querySelector(':scope > .early-checkin-start-marker');

    if (!isEarly || status === 'cancelled' || status === 'maintenance') {
      if (existing) existing.remove();
      el.classList.remove('has-early-checkin-start');
      el.style.removeProperty('--early-ci-cap-w');
      el.style.removeProperty('--early-ci-cap-left');
      el.style.removeProperty('--early-ci-cap-inset');
      return;
    }

    el.classList.add('has-early-checkin-start');
    let marker = existing;
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'early-checkin-start-marker';
      marker.title = 'Early Check-In';
      harness.appendChild(marker);
    }

    const sizeCap = () => {
      const dayW = oneDayWidthForBar(event, el);   // px per calendar day
      const rightRel = 2;                          // black right edge: 2px into the bar (no gap)
      // Default: one full day column ("no booking allowed" day) before check-in.
      let leftRel = -(dayW - rightRel);

      // Back-to-back: if a stay ends within ~1 box of the black's left edge,
      // pull the black's left edge over to butt against it (its blue cap incl.).
      const barLeft = el.getBoundingClientRect().left;
      const prevRight = prevBarRightEdge(harness, el, barLeft);
      if (prevRight !== null) {
        const prevRel = prevRight - barLeft;       // negative = left of the bar
        if (prevRel <= rightRel && prevRel >= leftRel - dayW * 0.6) {
          leftRel = prevRel - 1;                   // 1px overlap so they connect cleanly
        }
      }

      const width = rightRel - leftRel;
      el.style.setProperty('--early-ci-cap-left', leftRel + 'px');
      el.style.setProperty('--early-ci-cap-w', width + 'px');
      el.style.setProperty('--early-ci-cap-inset', '0px');   // never covers the bar
      marker.style.left = leftRel + 'px';
      marker.style.width = width + 'px';
    };
    sizeCap();
    requestAnimationFrame(sizeCap);
    setTimeout(sizeCap, 80);   // re-measure after sibling bars finish mounting
  } catch (e) {
    // ignore
  }
}

// OPTIMIZATION: handleEventDidMount fires once per event on every full re-mount (initial
// load, refresh, bed-filter toggle). It used to call calendar.getEvents().filter(...) inside
// that per-event callback, an O(n) scan repeated for every one of the n events (O(n^2) total
// per re-mount). This caches a resourceId -> events[] grouping per re-mount batch instead, so
// each mount is an O(1) lookup. The cache is keyed off the events array reference + length,
// which is stable for the whole synchronous mount batch FullCalendar runs per reload.
let __overlapCacheEventsRef = null;
let __overlapCacheEventsLength = -1;
let __overlapCacheMap = null;

function getEventsByResourceIdMap(calendarApi) {
  const events = calendarApi.getEvents();
  if (__overlapCacheMap && __overlapCacheEventsRef === events && __overlapCacheEventsLength === events.length) {
    return __overlapCacheMap;
  }
  const map = new Map();
  events.forEach(e => {
    const resources = e.getResources();
    const resourceId = String(resources.length && resources[0] ? resources[0].id : undefined);
    if (!map.has(resourceId)) map.set(resourceId, []);
    map.get(resourceId).push(e);
  });
  __overlapCacheMap = map;
  __overlapCacheEventsRef = events;
  __overlapCacheEventsLength = events.length;
  return map;
}

// ---------------------------------------------------------------------------
// HOVER TOOLTIP - full booking breakdown, so a tiny single-day bar can still
// carry Late C/I + Reservation fee + Late C/O + Pick-up etc. without stacking
// unreadable markers on the bar itself.
//
// NOT released yet - OFF by default. To preview without a code change, run in
// the browser console:  localStorage.setItem('calendarBookingTooltip', 'on')
// then reload. Flip EVENT_TOOLTIP_DEFAULT_ON to true to ship it to everyone.
// ---------------------------------------------------------------------------
const EVENT_TOOLTIP_DEFAULT_ON = true;

function isEventTooltipEnabled() {
  try {
    const v = localStorage.getItem('calendarBookingTooltip');
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch (e) { /* ignore */ }
  return EVENT_TOOLTIP_DEFAULT_ON;
}

function fmtTooltipDate(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return '-';
  }
}

function buildEventTooltipHtml(event) {
  const p = event.extendedProps || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

  const rows = [];
  const add = (label, value, accent) => {
    if (value == null || value === '') return;
    const dot = accent ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${accent};margin-right:6px;vertical-align:middle"></span>` : '';
    rows.push(`<div style="display:flex;gap:8px;line-height:1.5;white-space:nowrap"><span style="opacity:.65;min-width:74px;flex:none">${esc(label)}</span><span style="font-weight:600">${dot}${esc(value)}</span></div>`);
  };

  const res = event.getResources && event.getResources()[0];
  const roomNo = res ? res.title : '';

  const status = String(p.bookingStatus || '').toLowerCase();
  if (status === 'cancelled') {
    return `<div style="font-weight:700;margin-bottom:4px">${esc(event.title || 'Booking')}</div>`
      + `<div style="opacity:.7">Cancelled${p.cancellationReason ? ' - ' + esc(p.cancellationReason) : ''}</div>`;
  }
  if (status === 'maintenance') {
    return `<div style="font-weight:700;margin-bottom:4px">Maintenance - Room ${esc(roomNo)}</div>`
      + (p.maintenanceReason ? `<div style="opacity:.7">${esc(p.maintenanceReason)}</div>` : '');
  }

  const ci = Number(p.checkInStatus);
  const ciText = ci === 2 ? 'Early Check-In' : (ci === 0 ? 'Late Check-In (after 12mn)' : 'Regular (3:00 PM)');
  const ciAccent = ci === 2 ? '#000' : (ci === 0 ? '#FB8C00' : null);

  const lateCO = Number(p.checkOutStatus) === 1;
  const coText = lateCO ? 'Late Check-Out (11:00 PM)' : 'Regular (12:00 noon)';
  const coAccent = lateCO ? '#1A3FA0' : null;

  const pay = String(p.paymentStatus || '').toLowerCase().replace('partial_paid', 'partial');
  const payText = pay === 'paid' ? 'Fully paid'
    : pay === 'partial' ? 'Reservation fee paid (partial)'
    : 'Unpaid';
  const payAccent = pay === 'partial' ? '#D500F9' : null;

  add('Room', roomNo);
  add('Check-in', `${fmtTooltipDate(event.start)} - ${ciText}`, ciAccent);
  add('Check-out', `${fmtTooltipDate(event.end)} - ${coText}`, coAccent);
  add('Payment', payText, payAccent);
  if (p.totalCost != null) add('Total', '₱' + Number(p.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  if (p.hasPickup) add('Transport', '✈ Pick-up / Drop-off');
  if (p.isLongTermStay) add('Note', 'Long-term stay');
  if (p.isBackToBack) add('Note', 'Back-to-back');
  if (p.holdPending) add('Note', 'Hold pending');
  const channel = String(p.bookingChannel || '').trim();
  if (channel && channel.toLowerCase() !== 'walk-in') add('Channel', channel);

  return `<div style="font-weight:700;margin-bottom:5px;font-size:12.5px">${esc(event.title || 'Booking')}</div>`
    + `<div style="display:flex;flex-direction:column;gap:2px;font-size:11.5px">${rows.join('')}</div>`;
}

function attachEventTooltip(event, el) {
  try {
    if (el._tippy) el._tippy.destroy();
    if (!isEventTooltipEnabled()) return;
    if (typeof window.tippy !== 'function') return;
    window.tippy(el, {
      // Build the content on every open from the CURRENT event state (dates, room,
      // status) instead of freezing a string at mount time. Keeps the tooltip
      // correct after an in-place drag / resize / room transfer / socket update
      // without re-attaching anything.
      content: '',
      onShow(instance) {
        const live = (window.calendar && typeof window.calendar.getEventById === 'function')
          ? (window.calendar.getEventById(event.id) || event)
          : event;
        instance.setContent(buildEventTooltipHtml(live));
      },
      allowHTML: true,
      theme: 'light',
      placement: 'top',
      arrow: true,
      delay: [140, 0],
      duration: [120, 80],
      maxWidth: 'none',
      offset: [0, 8],
      appendTo: () => document.body
    });
  } catch (e) {
    // ignore
  }
}

function handleEventDidMount(info) {
  // TOOLTIPS COMPLETELY REMOVED - No more tooltip setup

  // Overlap detection
  const assignedResources = info.event.getResources();
  const assignedResourceId = assignedResources.length && assignedResources[0] ? assignedResources[0].id : undefined;

  const eventStartDate = getDateString(info.event.start);
  const eventEndDate = getDateString(info.event.end);

  const resourceMap = getEventsByResourceIdMap(info.view.calendar);
  const sameRoomEvents = (resourceMap.get(String(assignedResourceId)) || []).filter(e => info.event.id !== e.id);

  const overlappingEvents = sameRoomEvents.filter(e => {
    const eStartDate = getDateString(e.start);
    const eEndDate = getDateString(e.end);
    // Allow overlap when either the current event or the compared event is a checkout
    if (isCheckoutEvent(info.event) || isCheckoutEvent(e)) return false;
    return (eventStartDate <= eEndDate && eventEndDate >= eStartDate);
  });

  if (overlappingEvents.length > 0) {
    info.el.classList.add("overlapping-event");
  } else {
    info.el.classList.remove("overlapping-event");
  }

  window.eventElements[info.event.id] = info.el;

  // Apply the booking-highlight fill color (phase x payment status)
  try {
    applyCompositeStatusStyles(info.event, info.el);
  } catch (e) {
    // ignore style errors
  }

  // Side indicators (late check-in / late check-out & BTB / reservation fee paid)
  // are disabled for now — removed per request, keeping the function itself
  // intact in case they come back later. The group+OTA channel stripe is
  // unrelated to those statuses, so it still renders on its own.
  // applySideIndicatorAccents(info.event, info.el);
  applyChannelStripeAccent(info.event, info.el);

  // Pick-up service car icon
  applyPickupIndicator(info.event, info.el);

  // Blue end marker for Late Check-Out bookings
  applyLateCheckoutEndMarker(info.event, info.el);
  applyLateCheckInStartMarker(info.event, info.el);
  applyEarlyCheckInStartMarker(info.event, info.el);
  applyReservationFeeStartMarker(info.event, info.el);
  syncEventNameOverlay(info.event, info.el);
  attachEventTooltip(info.event, info.el);

  // Control visual overlay: allow only if either event is checkout
  try {
    const harness = info.el.closest('.fc-timeline-event-harness');
    const isCancelled = info.event.extendedProps?.bookingStatus === 'cancelled';
    if (harness) {
      if (isCheckoutEvent(info.event)) {
        harness.classList.add('fc-allow-overlay');
        harness.style.zIndex = '';
      } else if (isCancelled) {
        // Let cancelled bookings sit behind overlapping active events
        harness.classList.add('fc-allow-overlay');
        harness.style.zIndex = '1';
      } else {
        harness.classList.remove('fc-allow-overlay');
        harness.style.zIndex = '';
      }
    }
  } catch (e) {}

  // Improve title readability with a top-aligned parallelogram chip overlay
  try {
    // Hide/remove FullCalendar's default title to avoid duplicates
    const defaultTitle = info.el.querySelector('.fc-event-title, .fc-event-title-container');
    if (defaultTitle) {
      defaultTitle.textContent = '';
      defaultTitle.style.display = 'none';
    }

    const existing = info.el.querySelector('.event-title-chip');
    if (!existing) {
      const chip = document.createElement('div');
      chip.className = 'event-title-chip';
      const span = document.createElement('span');
      span.textContent = info.event.title || '';
      chip.appendChild(span);
      info.el.appendChild(chip);
    } else {
      const span = existing.querySelector('span') || document.createElement('span');
      span.textContent = info.event.title || '';
      if (!existing.contains(span)) existing.appendChild(span);
    }
  } catch (e) {
    // silent
  }
}

function handleDatesSet(info) {
  globalOverlapCheck(info.view.calendar);

  if (typeof window.setupDateBookmarks === 'function') {
    window.setupDateBookmarks();
    window.applyDateBookmarks();
    setTimeout(window.applyDateBookmarks, 60);
  }

  if (typeof window.reloadCalendarBookingsForVisibleRange === 'function') {
    window.reloadCalendarBookingsForVisibleRange(info);
  }

  if (typeof window.applyBedFilter === 'function') {
    window.applyBedFilter();
  }
  if (typeof window.updateBedFilterButtonStates === 'function') {
    window.updateBedFilterButtonStates();
  }
  
  // Hide "12am" and "12pm" slot labels
  setTimeout(() => {
    $('a.fc-timeline-slot-cushion.fc-scrollgrid-sync-inner').filter(function() {
      return $(this).text() === '12am' || $(this).text() === '12pm';
    }).hide();
  }, 0);

  // Restore group-create shades after calendar re-render / view change
  setTimeout(function() {
    if (typeof window.refreshCalendarVerticalScrollSync === 'function') {
      window.refreshCalendarVerticalScrollSync();
    }
    if (typeof window.refreshGroupBookingShadesAfterLayout === 'function') {
      window.refreshGroupBookingShadesAfterLayout();
    }
    if (typeof window.getGroupCreateShadeStatus !== 'function') return;
    if (typeof window.renderGroupCreateOverlays !== 'function') return;
    const status = window.getGroupCreateShadeStatus();
    if (status.active && status.expectedCount && status.hasRange) {
      window.renderGroupCreateOverlays();
    }
    if (typeof window.syncGroupSelectOverlay === 'function' && !status.active) {
      window.syncGroupSelectOverlay();
    }
  }, 50);
}

// =============================================================================
// EVENT STATUS UPDATE FUNCTIONS
// =============================================================================

// Function to update event status in the calendar (INSTANT UPDATE VERSION)
function updateEventStatusInstantly(event, newStatus) {
  try {
    // Prevent duplicate updates
    if (event._isStatusUpdating) {
      return;
    }
    
    // Mark event as being updated
    event._isStatusUpdating = true;
    
    // Create a mock booking object to use with existing getBookingColor function
    const mockBooking = {
      BOOKING_STATUS: newStatus, // Use the actual newStatus (pending, check-In, etc.)
      CHECK_IN_STATUS: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
    };
    
    // Use existing getBookingColor function
    const newColor = getBookingColor(mockBooking);
    
    // PROPER FULLCALENDAR APPROACH: Use setExtendedProp and setProp methods
    try {
      // Update extended properties using FullCalendar's API
      event.setExtendedProp('bookingStatus', newStatus);
      event.setExtendedProp('checkInStatus', mockBooking.CHECK_IN_STATUS);
      
      // Update background color using FullCalendar's API
      event.setProp('backgroundColor', newColor);
      
    } catch (apiError) {
      // Alternative: Try to update the calendar event directly
      const calendar = getCalendar(event);
      if (calendar) {
        const calendarEvent = calendar.getEventById(event.id);
        if (calendarEvent) {
          try {
            calendarEvent.setExtendedProp('bookingStatus', newStatus);
            calendarEvent.setExtendedProp('checkInStatus', mockBooking.CHECK_IN_STATUS);
            calendarEvent.setProp('backgroundColor', newColor);
          } catch (calendarApiError) {
            // Silent fallback
          }
        }
      }
    }
    
    // ULTRA-FAST: Update visual styling instantly
    const eventElement = window.eventElements[event.id];
    if (eventElement) {
      // Update background color immediately
      eventElement.style.backgroundColor = newColor;
      
      // Add a visual update indicator
      eventElement.classList.add('status-updated');
      setTimeout(() => {
        eventElement.classList.remove('status-updated');
      }, 1000);
      
      // CRITICAL: Also update the event element's data attributes
      eventElement.setAttribute('data-status', newStatus);
      eventElement.setAttribute('data-booking-status', newStatus);

      // Re-apply composite styles if check-in/check-out extendedProps are present
      try {
        applyCompositeStatusStyles(event, eventElement);
      } catch (e) {}
    }
    
    // Force calendar to re-render to show the changes
    const calendar = getCalendar(event);
    if (calendar) {
      calendar.render();
    }
    
    // Update overlap detection for this specific event
    setTimeout(() => {
      if (calendar) {
        globalOverlapCheck(calendar);
      }
    }, 50);
    
    // Update legend counts to reflect the status change
    if (typeof updateLegendCounts === 'function') {
      updateLegendCounts();
    }
    
    // Clear update flag after a delay
    setTimeout(() => {
      event._isStatusUpdating = false;
    }, 100);
    
  } catch (error) {
    // Clear update flag on error
    if (event) event._isStatusUpdating = false;
  }
}

// Function to update event status in the calendar (ORIGINAL VERSION - kept for compatibility)
function updateEventStatus(event, newStatus) {
  try {
    // Update the event's extended properties
    if (event.extendedProps) {
      event.extendedProps.bookingStatus = newStatus;
    }
    
    // Create a mock booking object to use with existing getBookingColor function
    const mockBooking = {
      BOOKING_STATUS: newStatus,
      CHECK_IN_STATUS: newStatus === 'pending' ? 1 : 0 // Set appropriate check-in status
    };
    
    // Use existing getBookingColor function
    const newColor = getBookingColor(mockBooking);
    event.backgroundColor = newColor;
    
    // Update the event element styling
    const eventElement = window.eventElements[event.id];
    if (eventElement) {
      // Update background color
      eventElement.style.backgroundColor = newColor;
      
      // Add a visual update indicator
      eventElement.classList.add('status-updated');
      setTimeout(() => {
        eventElement.classList.remove('status-updated');
      }, 1000);
    }
    
    // Force calendar to re-render the event
    if (event.view && event.view.calendar) {
      event.view.calendar.render();
    }
    
    // Also update the event in the calendar's event source
    try {
      const calendar = event.view?.calendar || window.calendar;
      if (calendar) {
        // Get the current event from calendar
        const currentEvent = calendar.getEventById(event.id);
        if (currentEvent) {
          // Update the event's extended properties
          if (currentEvent.extendedProps) {
            currentEvent.extendedProps.bookingStatus = newStatus;
          }
          currentEvent.backgroundColor = newColor;
        }
      }
    } catch (calendarError) {
      // Silent fallback
    }
    
  } catch (error) {
    // Silent error handling
  }
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.handleEventClick = handleEventClick;
window.glowCalendarScheduleBar = glowCalendarScheduleBar;
window.suppressCalendarScheduleBarGlow = suppressCalendarScheduleBarGlow;
window.attachCalendarGlowOnBootstrapModal = attachCalendarGlowOnBootstrapModal;
window.isCalendarPageContext = isCalendarPageContext;
window.refreshCalendarAfterPaymentSuccess = refreshCalendarAfterPaymentSuccess;
window.applyCompositeStatusStyles = applyCompositeStatusStyles;
window.applySideIndicatorAccents = applySideIndicatorAccents;
window.applyChannelStripeAccent = applyChannelStripeAccent;
window.handleEventDidMount = handleEventDidMount;
window.handleDatesSet = handleDatesSet;
window.updateEventStatusInstantly = updateEventStatusInstantly;
window.updateEventStatus = updateEventStatus;
window.getGroupBookingColor = getGroupBookingColor;
