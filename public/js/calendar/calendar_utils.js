// =============================================================================
// CALENDAR UTILITIES MODULE
// =============================================================================

// This module contains utility functions for the calendar system

// =============================================================================
// SECURITY UTILITY FUNCTIONS
// =============================================================================

// Get CSRF token (simplified version)
function getCSRFToken() {
  return 'csrf-token-placeholder'; // Temporary placeholder
}

// =============================================================================
// BOOKING COLOR LOGIC
// =============================================================================

function getBookingColor(booking) {
  // Check if this is a group booking first
  // const isGroupBooking = booking.GROUP_BOOKING_ID && booking.GROUP_BOOKING_ID !== null;
  
  switch (booking.BOOKING_STATUS) {
    case 'check-In': return '#12866f'; // Occupied = teal
    case 'check-Out': return '#B3B3B3';
    case 'pending':
      // Distinguish between pending and late check-in based on CHECK_IN_STATUS
      if (booking.CHECK_IN_STATUS === 0 || booking.CHECK_IN_STATUS === '0') {
        return '#e0a316'; // Late check-in = amber
      } else {
        return '#e53935'; // Regular check-in = red (keep original)
      }
    case 'cancelled': return '#000000';
    default: return 'pink';
  }
}

// =============================================================================
// CALENDAR ACCESS UTILITIES
// =============================================================================

// Safe calendar access helper function
function getCalendar(event = null) {
  // Try to get calendar from event.view first, then fallback to global
  if (event && event.view && event.view.calendar) {
    return event.view.calendar;
  }
  // Fallback to global calendar
  return window.calendar;
}

// Date utility function (needed for overlap detection)
function getDateString(date) {
  return new Date(date).toISOString().split('T')[0];
}

// Format Date to MySQL DATETIME (YYYY-MM-DD HH:MM:SS) using local time
function formatMySQLDateTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// =============================================================================
// EVENT STATUS UTILITIES
// =============================================================================

// Identify checkout events. Treat events whose bookingStatus is 'check-Out'
// OR whose right half reflects checkout state (composite styles applied) as checkout carriers.
function isCheckoutEvent(event) {
  try {
    const status = event?.extendedProps?.bookingStatus;
    if (status === 'check-Out') return true;
    // If composite is applied for check-In/pending, it's not a pure checkout
    return false;
  } catch (e) {
    return false;
  }
}

// Adjacency validation helpers for late checkout vs regular check-in
function normalizeCheckInStatus(value, inferColorFn) {
  if (value === undefined || value === null || value === '') return inferColorFn();
  const s = String(value).toLowerCase();
  if (value === 1 || value === '1' || s.includes('regular')) return 'regular';
  if (value === 0 || value === '0' || s.includes('late')) return 'late';
  return inferColorFn();
}

function normalizeCheckOutStatus(value, inferColorFn) {
  if (value === undefined || value === null || value === '') return inferColorFn();
  const s = String(value).toLowerCase();
  if (value === 1 || value === '1' || s.includes('late')) return 'late';
  if (value === 0 || value === '0' || s.includes('regular')) return 'regular';
  return inferColorFn();
}

function isLateCheckout(event) {
  try {
    const inferFromColor = () => (event.backgroundColor === '#e0a316' ? 'late' : 'regular');
    const coRaw = event?.extendedProps?.checkOutStatus;
    const coNorm = normalizeCheckOutStatus(coRaw, inferFromColor);
    return coNorm === 'late';
  } catch (e) {
    return false;
  }
}

function isRegularCheckIn(event) {
  try {
    const inferFromColor = () => (event.backgroundColor === '#e0a316' ? 'late' : 'regular');
    const ciRaw = event?.extendedProps?.checkInStatus;
    const ciNorm = normalizeCheckInStatus(ciRaw, inferFromColor);
    return ciNorm === 'regular';
  } catch (e) {
    return true;
  }
}

function isLateCheckIn(event) {
  try {
    const inferFromColor = () => (event.backgroundColor === '#e0a316' ? 'late' : 'regular');
    const ciRaw = event?.extendedProps?.checkInStatus;
    const ciNorm = normalizeCheckInStatus(ciRaw, inferFromColor);
    return ciNorm === 'late';
  } catch (e) {
    return false;
  }
}

// =============================================================================
// ROOM STATUS CHECKING UTILITIES
// =============================================================================

function hasRegularCheckInStartingOn(dateStr, roomId, excludeEventId) {
  const calendar = window.calendar;
  if (!calendar) return false;
  const events = calendar.getEvents();
  for (const e of events) {
    try {
      if (e.id === excludeEventId) continue;
      const res = e.getResources();
      const rid = res && res[0] ? res[0].id : undefined;
      if (String(rid) !== String(roomId)) continue;
      if (getDateString(e.start) !== dateStr) continue;
      if (isRegularCheckIn(e)) return true;
    } catch (err) {
      // skip
    }
  }
  return false;
}

function hasLateCheckoutEndingOn(dateStr, roomId, excludeEventId) {
  const calendar = window.calendar;
  if (!calendar) return false;
  const events = calendar.getEvents();
  for (const e of events) {
    try {
      if (e.id === excludeEventId) continue;
      const res = e.getResources();
      const rid = res && res[0] ? res[0].id : undefined;
      if (String(rid) !== String(roomId)) continue;
      if (getDateString(e.end) !== dateStr) continue;
      if (isLateCheckout(e)) return true;
    } catch (err) {
      // skip
    }
  }
  return false;
}

function hasLateCheckInStartingOn(dateStr, roomId, excludeEventId) {
  const calendar = window.calendar;
  if (!calendar) return false;
  const events = calendar.getEvents();
  for (const e of events) {
    try {
      if (e.id === excludeEventId) continue;
      const res = e.getResources();
      const rid = res && res[0] ? res[0].id : undefined;
      if (String(rid) !== String(roomId)) continue;
      if (getDateString(e.start) !== dateStr) continue;
      if (isLateCheckIn(e)) return true;
    } catch (err) {
      // skip
    }
  }
  return false;
}

function hasRegularCheckoutEndingOn(dateStr, roomId, excludeEventId) {
  const calendar = window.calendar;
  if (!calendar) return false;
  const events = calendar.getEvents();
  for (const e of events) {
    try {
      if (e.id === excludeEventId) continue;
      const res = e.getResources();
      const rid = res && res[0] ? res[0].id : undefined;
      if (String(rid) !== String(roomId)) continue;
      if (getDateString(e.end) !== dateStr) continue;
      if (!isLateCheckout(e)) return true; // Regular checkout (not late)
    } catch (err) {
      // skip
    }
  }
  return false;
}

// =============================================================================
// OVERLAP DETECTION UTILITIES
// =============================================================================

function globalOverlapCheck(calendar) {
  const allEvents = calendar.getEvents();

  allEvents.forEach(event => {
    const assignedResources = event.getResources();
    const assignedResourceId = assignedResources.length && assignedResources[0] ? assignedResources[0].id : undefined;

    const eventStartDate = getDateString(event.start);
    const eventEndDate = getDateString(event.end);

    const sameRoomEvents = allEvents.filter(e => {
      const eResources = e.getResources();
      const eResourceId = eResources.length && eResources[0] ? eResources[0].id : undefined;
      return String(assignedResourceId) === String(eResourceId) && event.id !== e.id;
    });

    const overlappingEvents = sameRoomEvents.filter(e => {
      const eStartDate = getDateString(e.start);
      const eEndDate = getDateString(e.end);
      // Allow overlap when either side is a checkout event
      if (isCheckoutEvent(event) || isCheckoutEvent(e)) return false;
      return (eventStartDate <= eEndDate && eventEndDate >= eStartDate);
    });

    const el = window.eventElements[event.id];
    if (el) {
      if (overlappingEvents.length > 0) {
        el.classList.add("overlapping-event");
      } else {
        el.classList.remove("overlapping-event");
      }
    }
  });
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.getCSRFToken = getCSRFToken;
window.getBookingColor = getBookingColor;
window.getCalendar = getCalendar;
window.getDateString = getDateString;
window.formatMySQLDateTime = formatMySQLDateTime;
window.isCheckoutEvent = isCheckoutEvent;
window.normalizeCheckInStatus = normalizeCheckInStatus;
window.normalizeCheckOutStatus = normalizeCheckOutStatus;
window.isLateCheckout = isLateCheckout;
window.isRegularCheckIn = isRegularCheckIn;
window.isLateCheckIn = isLateCheckIn;
window.hasRegularCheckInStartingOn = hasRegularCheckInStartingOn;
window.hasLateCheckoutEndingOn = hasLateCheckoutEndingOn;
window.hasLateCheckInStartingOn = hasLateCheckInStartingOn;
window.hasRegularCheckoutEndingOn = hasRegularCheckoutEndingOn;
window.globalOverlapCheck = globalOverlapCheck;
