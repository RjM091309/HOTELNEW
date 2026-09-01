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

// Rough fallback color for a booking (before the full phase x payment logic in
// applyCompositeStatusStyles runs). Defaults to the "not fully paid" variant of
// each phase since payment status usually isn't known at this point.
function getBookingColor(booking) {
  switch (booking.BOOKING_STATUS) {
    case 'check-In': return '#6f9c40';  // Check-In (unpaid) = green
    case 'check-Out': return '#00E5FF'; // Check-Out (unpaid) = cyan
    case 'pending':
      // Hold Pending / Pencil booking: booking has dates but no check-in/check-out processing yet
      if (booking.HOLD_PENDING === 1 || booking.HOLD_PENDING === '1' || booking.HOLD_PENDING === true) {
        return '#FFEB3B'; // Pencil booking = bright yellow
      }
      return '#e53935'; // Reservation (unconfirmed) = red
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
    const inferFromColor = () => 'regular'; // fill color no longer encodes late/regular status
    const coRaw = event?.extendedProps?.checkOutStatus;
    const coNorm = normalizeCheckOutStatus(coRaw, inferFromColor);
    return coNorm === 'late';
  } catch (e) {
    return false;
  }
}

function isRegularCheckIn(event) {
  try {
    const inferFromColor = () => 'regular'; // fill color no longer encodes late/regular status
    const ciRaw = event?.extendedProps?.checkInStatus;
    const ciNorm = normalizeCheckInStatus(ciRaw, inferFromColor);
    return ciNorm === 'regular';
  } catch (e) {
    return true;
  }
}

function isLateCheckIn(event) {
  try {
    const inferFromColor = () => 'regular'; // fill color no longer encodes late/regular status
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
// MODAL OVERLAY CLEANUP
// =============================================================================

function cleanupModalOverlays() {
  const openModals = Array.from(document.querySelectorAll('.modal.show'));
  const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));

  if (openModals.length === 0) {
    backdrops.forEach((backdrop) => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  } else {
    while (backdrops.length > openModals.length) {
      backdrops.pop()?.remove();
    }

    openModals.forEach((modal, index) => {
      const modalZ = 1055 + (index * 20);
      const backdropZ = modalZ - 5;
      modal.style.zIndex = String(modalZ);
      if (backdrops[index]) {
        backdrops[index].style.zIndex = String(backdropZ);
      }
    });
  }

  const swalVisible = typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible();
  if (!swalVisible) {
    document.querySelectorAll('.swal2-container').forEach((container) => {
      if (!container.classList.contains('swal2-shown')) {
        container.remove();
      }
    });
  }
}

function cleanupAfterNestedModalClose() {
  const openModals = document.querySelectorAll('.modal.show');
  const backdrops = document.querySelectorAll('.modal-backdrop');

  if (openModals.length > 0 && backdrops.length > openModals.length) {
    const extra = backdrops.length - openModals.length;
    for (let i = 0; i < extra; i += 1) {
      backdrops[backdrops.length - 1 - i]?.remove();
    }
  }

  cleanupModalOverlays();
}

function disposeBootstrapModal(modalEl) {
  if (!modalEl || typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    return;
  }

  const instance = bootstrap.Modal.getInstance(modalEl);
  if (instance) {
    instance.dispose();
  }
}

function showBootstrapModal(modalEl, options = {}) {
  if (!modalEl || typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    return null;
  }

  cleanupModalOverlays();

  const instance = bootstrap.Modal.getOrCreateInstance(modalEl, {
    backdrop: options.backdrop ?? 'static',
    keyboard: options.keyboard ?? true
  });
  instance.show();
  return instance;
}

function toLocalDayStartMs(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isCalendarSlotBooked(resourceId, start, end) {
  const calendar = getCalendar();
  if (!calendar || !resourceId || !start || !end) {
    return false;
  }

  const rid = String(resourceId);
  const selStart = toLocalDayStartMs(start);
  const selEnd = toLocalDayStartMs(end);

  return calendar.getEvents().some(function(ev) {
    const evResource = ev.getResources()[0];
    if (!evResource || String(evResource.id) !== rid) {
      return false;
    }

    const status = ev.extendedProps?.bookingStatus;
    if (status === 'cancelled' || status === 'maintenance') {
      return false;
    }

    const evStart = ev.start;
    const evEnd = ev.end;
    if (!evStart || !evEnd) {
      return false;
    }

    // Hotel nights occupy check-in date through the day before checkout.
    // Checkout day stays free so a back-to-back booking can start there.
    const occStart = toLocalDayStartMs(evStart);
    const occEnd = toLocalDayStartMs(evEnd);
    return selStart < occEnd && selEnd > occStart;
  });
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.isCalendarSlotBooked = isCalendarSlotBooked;
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
window.cleanupModalOverlays = cleanupModalOverlays;
window.cleanupAfterNestedModalClose = cleanupAfterNestedModalClose;
window.disposeBootstrapModal = disposeBootstrapModal;
window.showBootstrapModal = showBootstrapModal;
