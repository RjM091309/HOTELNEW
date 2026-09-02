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
      
    case 'pending':
      // Route based on the actual late-check-in flag rather than fill color,
      // since fill color now encodes payment status (paid/unpaid/OTA/pencil).
      if (isLateCheckIn(event)) {
        showLateCheckInModal(event);
      } else {
        showPendingModal(event);
      }
      break;
      
    case 'cancelled':
      // Show cancelled reservation modal
      showCancelledModal(event);
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
            showCancelledModal(event);
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
