// =============================================================================
// CALENDAR EVENTS MODULE
// =============================================================================

// This module contains event handlers for the calendar system

// =============================================================================
// GROUP BOOKING COLOR ASSIGNMENT
// =============================================================================

// Color palette for different group bookings (neon/vibrant colors that don't match booking status colors)
// Avoid: Teal (#12866f), Amber (#e0a316), Red (#e53935), Gray, Black
const GROUP_COLORS = [
  '#00FFFF', // Neon Cyan / Aqua
  '#FF00FF', // Neon Magenta / Fuchsia
  '#FF1493', // Deep Pink / Neon Pink
  '#1E90FF', // Dodger Blue
  '#00FFCC', // Neon Turquoise
  '#AA00FF', // Neon Purple
  '#FFAA00', // Neon Orange
  '#FF00CC', // Neon Magenta-Pink
  '#8800FF', // Neon Violet
  '#FF0088', // Neon Rose
  '#00FF88', // Neon Green-Cyan
  '#FF8800', // Neon Orange-Red
  '#AA00AA', // Neon Violet-Magenta
  '#0088FF', // Neon Sky Blue
  '#FF00AA', // Neon Pink
  '#00AAFF', // Bright Neon Blue
  '#FF00DD', // Neon Pink-Magenta
  '#00DDFF', // Bright Neon Cyan
  '#DD00FF'  // Bright Neon Purple
];

// Cache to store groupBookingId -> color mapping (consistent across all events)
const groupColorCache = {};

/**
 * Get a consistent color for a group booking based on its ID
 * @param {number|string} groupBookingId - The group booking ID
 * @returns {string} - Hex color code
 */
function getGroupBookingColor(groupBookingId) {
  if (!groupBookingId || groupBookingId === 0 || groupBookingId === '') {
    return '#2196F3'; // Default blue if invalid
  }
  
  const id = String(groupBookingId);
  
  // Return cached color if exists
  if (groupColorCache[id]) {
    return groupColorCache[id];
  }
  
  // Assign color based on groupBookingId (consistent hash)
  const numericId = parseInt(id, 10) || id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colorIndex = numericId % GROUP_COLORS.length;
  const assignedColor = GROUP_COLORS[colorIndex];
  
  // Cache the color for this group
  groupColorCache[id] = assignedColor;
  
  return assignedColor;
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function handleEventClick(info) {
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
      // Check if this is a late check-in (orange) or regular pending (blue)
      const eventColor = event.backgroundColor;
      if (eventColor === '#e0a316') {
        showLateCheckInModal(event);
      } else {
        showPendingModal(event);
      }
      break;
      
    case 'cancelled':
      // Show cancelled reservation modal
      showCancelledModal(event);
      break;
      
    default:
      // For any other status, show appropriate modal
      if (status === 'late check-in' || status === 'late_check_in' || status === 'late_checkin') {
        showLateCheckInModal(event);
      } else {
        // Check if we can determine status from event color or other properties
        const eventColor = event.backgroundColor;
        
        if (eventColor === '#e0a316') {
          showLateCheckInModal(event);
        } else if (eventColor === 'red' || eventColor === '#e53935') {
          showPendingModal(event);
        } else if (eventColor === '#000000') {
          showCancelledModal(event);
        } else {
          // Fallback to event info modal
          showEventInfoModal(event);
        }
      }
      break;
  }
}

// Creates a left/right split color based on check-in/out statuses
function applyCompositeStatusStyles(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;
    // More robust check: groupBookingId must exist, not be null, not be 0, and not be empty string
    const groupBookingId = event.extendedProps?.groupBookingId;
    const isGroupBooking = groupBookingId != null && groupBookingId !== 0 && groupBookingId !== '' && String(groupBookingId).trim() !== '';

    // Colors
    const red = '#e53935';      // regular (keep original red)
    const lemon = '#e0a316';    // late = amber
    const green = '#12866f';    // occupied = teal

    let checkInStatusRaw = event.extendedProps?.checkInStatus;   // expected: 1 regular, 0 late
    let checkOutStatusRaw = event.extendedProps?.checkOutStatus; // expected: 0 regular, 1 late

    if (checkInStatusRaw === undefined && checkOutStatusRaw === undefined) {
      el.removeAttribute('data-composite');
      el.style.background = '';
      return;
    }

    // Normalizers to handle differing encodings from backend/UI
    const inferFromColor = () => (event.backgroundColor === '#e0a316' ? 'late' : 'regular');
    const normalizeCheckIn = (v) => {
      if (v === undefined || v === null || v === '') return inferFromColor();
      if (v === 1 || v === '1' || String(v).toLowerCase() === 'regular') return 'regular';
      if (v === 0 || v === '0' || String(v).toLowerCase().includes('late')) return 'late';
      return inferFromColor();
    };
    const normalizeCheckOut = (v) => {
      if (v === undefined || v === null || v === '') return inferFromColor();
      // Some systems store CO: 1 = late, 0 = regular. Others invert.
      const s = String(v).toLowerCase();
      if (v === 1 || v === '1' || s.includes('late')) return 'late';
      if (v === 0 || v === '0' || s.includes('regular')) return 'regular';
      return inferFromColor();
    };

    const ciNorm = normalizeCheckIn(checkInStatusRaw);
    let coNorm = normalizeCheckOut(checkOutStatusRaw);
    if (checkOutStatusRaw === undefined || checkOutStatusRaw === null || checkOutStatusRaw === '') {
      // If checkout status is absent, default to Regular (red) to avoid all-lemon bars
      // This aligns with typical default checkout behavior unless explicitly marked late
      coNorm = 'regular';
    }

    // Get group color if this is a group booking
    const groupColor = isGroupBooking ? getGroupBookingColor(groupBookingId) : null;

    // Decide behavior by booking status
    if (bookingStatus === 'pending') {
      // Determine each side for pending
      const leftColor = ciNorm === 'regular' ? red : lemon;    // left half = check-in
      const rightColor = coNorm === 'late' ? lemon : red;      // right half = check-out
      el.setAttribute('data-composite', 'true');
      el.style.background = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;
      el.style.color = isGroupBooking ? '#ffffff !important' : '#fff';
      if (isGroupBooking) {
        el.classList.add('group-booking');
        // Use dynamic group color for border - use !important to override CSS
        const borderColor = groupColor || '#2196F3';
        el.style.setProperty('border', `4px solid ${borderColor}`, 'important');
        el.setAttribute('data-group-color', borderColor);
        el.style.height = '24px';
        el.style.minHeight = '24px';
        el.style.marginTop = '-4px';
      } else {
        el.style.border = '';
        el.style.height = '';
        el.style.minHeight = '';
        el.style.marginTop = '';
      }
      
      // Find the text element and apply color directly for group bookings
      if (isGroupBooking) {
        const titleElement = el.querySelector('.fc-event-title');
        if (titleElement) {
          titleElement.style.color = '#ffffff !important';
          titleElement.classList.add('group-booking-text');
        }
      }
      
      // Lower z-index so checkout side (right half) visually sits underneath neighbors
      el.style.zIndex = '5';
      return;
    }

    if (bookingStatus === 'check-In') {
      // Occupied: keep left green, right reflects checkout status
      const leftColor = green;
      const rightColor = coNorm === 'late' ? lemon : red;
      el.setAttribute('data-composite', 'true');
      el.style.background = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;
      el.style.color = isGroupBooking ? '#ffffff !important' : '#fff';
      if (isGroupBooking) {
        el.classList.add('group-booking');
        // Use dynamic group color for border - use !important to override CSS
        const borderColor = groupColor || '#2196F3';
        el.style.setProperty('border', `4px solid ${borderColor}`, 'important');
        el.setAttribute('data-group-color', borderColor);
        el.style.height = '24px';
        el.style.minHeight = '24px';
        el.style.marginTop = '-4px';
      } else {
        el.style.border = '';
        el.style.height = '';
        el.style.minHeight = '';
        el.style.marginTop = '';
      }
      
      // Find the text element and apply color directly for group bookings
      if (isGroupBooking) {
        const titleElement = el.querySelector('.fc-event-title');
        if (titleElement) {
          titleElement.style.color = '#ffffff !important';
          titleElement.classList.add('group-booking-text');
        }
      }
      
      // Lower z-index so checkout side (right half) visually sits underneath neighbors
      el.style.zIndex = '5';
      return;
    }

    // Default: no composite, keep original color
    el.removeAttribute('data-composite');
    el.style.background = '';
    if (event.backgroundColor) {
      el.style.backgroundColor = event.backgroundColor;
    }
  const isCancelled = bookingStatus === 'cancelled';
    // Apply styles for group bookings
    if (isGroupBooking) {
      el.style.color = '#ffffff !important';
      el.classList.add('group-booking');
      // Border highlight to distinguish group bookings - use dynamic group color with !important
      const borderColor = groupColor || '#2196F3';
      el.style.setProperty('border', `4px solid ${borderColor}`, 'important');
      el.setAttribute('data-group-color', borderColor);
      el.style.height = '24px';
      el.style.minHeight = '24px';
      el.style.marginTop = '-4px';
      
      // Find the text element and apply color directly
      const titleElement = el.querySelector('.fc-event-title');
      if (titleElement) {
        titleElement.style.color = '#ffffff !important';
        titleElement.classList.add('group-booking-text');
      }
      
    } else {
      // Ensure non-group events don't keep a border
      el.style.border = '';
      el.style.height = '';
      el.style.minHeight = '';
      el.style.marginTop = '';
    }
    // Restore default stacking when not composite
  el.style.zIndex = isCancelled ? '1' : '';
  } catch (e) {
    // ignore
  }
}

// =============================================================================
// BACK-TO-BACK ROOM TURNOVER BORDER
// =============================================================================

const BACK_TO_BACK_BORDER_COLOR = '#AAFF00';

// Outlines both bookings involved in a same-room, same-day turnover
// (one checking out, the other checking in) instead of recoloring the fill.
function applyBackToBackBorder(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;
    const groupBookingId = event.extendedProps?.groupBookingId;
    const isGroupBooking = groupBookingId != null && groupBookingId !== 0 && groupBookingId !== '' && String(groupBookingId).trim() !== '';

    // Group bookings already own the border for their own highlight; don't fight over it
    if (isGroupBooking || bookingStatus === 'cancelled') {
      return;
    }

    if (event.extendedProps?.isBackToBack) {
      el.style.setProperty('border', `1.5px solid ${BACK_TO_BACK_BORDER_COLOR}`, 'important');
      el.setAttribute('data-back-to-back', 'true');
    } else if (el.getAttribute('data-back-to-back') === 'true') {
      el.style.border = '';
      el.removeAttribute('data-back-to-back');
    }
  } catch (e) {
    // ignore
  }
}

// =============================================================================
// PAYMENT STATUS INDICATOR (full / partial / unpaid)
// =============================================================================

const PAYMENT_STATUS_COLORS = {
  paid: '#2196f3',    // fully paid - blue
  partial: '#f57c00', // partially paid - orange
  unpaid: '#ffffff'   // unpaid - white
};

// Adds a small corner flag/triangle to the event indicating payment status.
// A solid triangle + white outline stays legible regardless of the
// booking-status background color underneath, unlike a thin edge line.
function applyPaymentStatusIndicator(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;
    const existing = el.querySelector('.payment-status-line');

    // Cancelled bookings don't carry a meaningful payment status to flag
    if (bookingStatus === 'cancelled') {
      if (existing) existing.remove();
      return;
    }

    const paymentStatus = (event.extendedProps?.paymentStatus || 'unpaid').toLowerCase();
    const lineColor = PAYMENT_STATUS_COLORS[paymentStatus] || PAYMENT_STATUS_COLORS.unpaid;

    const dot = existing || document.createElement('div');
    dot.className = 'payment-status-line';
    dot.style.backgroundColor = lineColor;
    dot.title = paymentStatus === 'paid' ? 'Fully Paid' : paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid';
    dot.setAttribute('data-payment-status', paymentStatus);

    if (!existing) el.appendChild(dot);
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

  const sameRoomEvents = info.view.calendar.getEvents().filter(e => {
    const eResources = e.getResources();
    const eResourceId = eResources.length && eResources[0] ? eResources[0].id : undefined;
    return String(assignedResourceId) === String(eResourceId) && info.event.id !== e.id;
  });

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

  // Apply composite check-in/check-out status colors (left = check-in, right = check-out)
  try {
    applyCompositeStatusStyles(info.event, info.el);
  } catch (e) {
    // ignore style errors
  }

  // Outline both bookings involved in a same-room, same-day turnover
  applyBackToBackBorder(info.event, info.el);

  // Apply payment status indicator dot (full / partial / unpaid)
  applyPaymentStatusIndicator(info.event, info.el);

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
  
  // Hide "12am" and "12pm" slot labels
  setTimeout(() => {
    $('a.fc-timeline-slot-cushion.fc-scrollgrid-sync-inner').filter(function() {
      return $(this).text() === '12am' || $(this).text() === '12pm';
    }).hide();
  }, 0);
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
window.applyCompositeStatusStyles = applyCompositeStatusStyles;
window.applyBackToBackBorder = applyBackToBackBorder;
window.applyPaymentStatusIndicator = applyPaymentStatusIndicator;
window.handleEventDidMount = handleEventDidMount;
window.handleDatesSet = handleDatesSet;
window.updateEventStatusInstantly = updateEventStatusInstantly;
window.updateEventStatus = updateEventStatus;
window.getGroupBookingColor = getGroupBookingColor;
