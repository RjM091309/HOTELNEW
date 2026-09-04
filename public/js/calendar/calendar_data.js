// =============================================================================
// CALENDAR CONFIGURATION AND INITIALIZATION
// =============================================================================

// Load calendar modules in dependency order
// <script src="/js/calendar/calendar_utils.js"></script>
// <script src="/js/calendar/calendar_events.js"></script>
// <script src="/js/calendar/calendar_modals.js"></script>
// <script src="/js/calendar/calendar_drag_drop.js"></script>
// <script src="/js/calendar/calendar_validation.js"></script>
// <script src="/js/calendar/calendar_styles.js"></script>

// IMPORTANT: This calendar integrates with the room menu modal (room-menu_data.js)
// When events are dragged and dropped to transfer rooms, the transfer is logged
// to the room_transfer_logs table and will appear in the timeline when the
// room menu modal is opened via openRoomMenuModal().
// 
// REAL-TIME UPDATES: Calendar transfers update instantly without page reloads.
// The event moves to the new room position immediately after successful transfer.

// Global variables
let calendar;
let calendarEl; // Add this global variable
let currentRangeStart;
let currentWeekStart;
window.eventElements = {};
// Fine-tune centering biases (positive moves right/down, negative moves left/up)
const H_CENTER_BIAS_PX = 100;
const V_CENTER_BIAS_PX = 88;
// Days offset for today's position (positions today after X days from start)
const TODAY_OFFSET_DAYS = 10;

// =============================================================================
// LAZY-LOADED CALENDAR RANGE (rendered window grows as the user scrolls, instead
// of rendering the full 12-month navigable span into the DOM up front)
// =============================================================================
// resourceTimeline has no virtual scrolling: every day column x every room row in the
// rendered range is real DOM. Rendering all 12 navigable months at once (~180,000+ cells
// with 100+ rooms) is what caused the FPS drop. Instead we start with a window and
// extend it by CALENDAR_EXPAND_STEP_MONTHS whenever the user scrolls near an edge, up to
// these absolute bounds (5 back + 7 forward = 12 months total, same forward-leaning ratio
// as the original 3-back/4-forward default).
//
// The initial window is deliberately set to the FULL span (== absolute bounds) so that
// scrolling month-to-month never crosses an expansion boundary. Every expansion does a
// full calendar.changeView() re-mount + a blank ".calendar-not-ready" gap + a complete
// booking refetch, which users saw as the calendar "reloading" every single month they
// scrolled. With the whole navigable range rendered up front that path is never hit
// during normal browsing; expansion only remains as a safety net if the bounds ever grow.
const CALENDAR_ABSOLUTE_MONTHS_BACK = 5;
const CALENDAR_ABSOLUTE_MONTHS_FORWARD = 7;
const CALENDAR_INITIAL_MONTHS_BACK = CALENDAR_ABSOLUTE_MONTHS_BACK;
const CALENDAR_INITIAL_MONTHS_FORWARD = CALENDAR_ABSOLUTE_MONTHS_FORWARD;
const CALENDAR_EXPAND_STEP_MONTHS = 1;
const CALENDAR_EXPAND_EDGE_DAYS = 21;

let calendarWindowMonthsBack = CALENDAR_INITIAL_MONTHS_BACK;
let calendarWindowMonthsForward = CALENDAR_INITIAL_MONTHS_FORWARD;
let calendarExpansionInProgress = false;
let calendarExpandCheckTimer = null;

// Date utility functions
function getLastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// getDateString function moved to calendar_booking_data.js module
// Available globally via window.getDateString

// =============================================================================
// FULLSCREEN FUNCTIONALITY
// =============================================================================

function toggleFullScreen() {
  const calendarContainer = document.getElementById('calendar');

  if (!document.fullscreenElement) {
    calendarContainer.requestFullscreen()
      .then(() => calendar.updateSize())
      .catch(err => console.error("Fullscreen error:", err));
  } else {
    document.exitFullscreen()
      .then(() => calendar.updateSize())
      .catch(err => console.error("Exit fullscreen error:", err));
  }
}

// =============================================================================
// EVENT OVERLAP DETECTION
// =============================================================================

// This function is now moved to calendar_booking_data.js module
// It's available globally via window.globalOverlapCheck

// =============================================================================
// SCROLLBAR MANAGEMENT
// =============================================================================

function setupScrollbar() {
  const scs = Array.from(document.querySelectorAll('#calendar .fc-scroller'));
  const bodyScroller = scs.find(s => s.scrollWidth > s.clientWidth);
  if (!bodyScroller) {
    console.warn('No horizontal scroller found');
    return null; // Return null instead of undefined
  }

  // Build the horizontal scrollbar. Kept the #top-scroller id (many other refs).
  // It's now a <body> child, position:fixed to the VIEWPORT bottom - it can't
  // live under #calendar because #calendar has transform: translateZ(0), which
  // would trap position:fixed inside it (and #calendar is taller than the
  // viewport, so its "bottom" is off-screen).
  let top = document.getElementById('top-scroller');
  if (!top) {
    top = document.createElement('div');
    top.id = 'top-scroller';
    top.innerHTML = '<div></div>';
  }
  if (top.parentElement !== document.body) {
    document.body.appendChild(top);
  }

  // Size & two-way sync
  const inner = top.firstElementChild;
  inner.style.width = bodyScroller.scrollWidth + 'px';
  top.scrollLeft = bodyScroller.scrollLeft;
  top.addEventListener('scroll', () => bodyScroller.scrollLeft = top.scrollLeft);
  bodyScroller.addEventListener('scroll', () => top.scrollLeft = bodyScroller.scrollLeft);

  // Line the fixed bar up horizontally with the calendar grid (the layout has a
  // sidebar, so full-width would run under it).
  const alignBar = () => {
    const live = Array.from(document.querySelectorAll('#calendar .fc-scroller'))
      .find(s => s.scrollWidth > s.clientWidth) || bodyScroller;
    const r = live.getBoundingClientRect();
    if (r.width) {
      top.style.left = r.left + 'px';
      top.style.width = r.width + 'px';
    }
  };
  alignBar();
  if (!top._alignBound) {
    top._alignBound = true;
    window.addEventListener('resize', alignBar);
  }

  return { bodyScroller, top };
}

function getDatagridVerticalScroller() {
  return document.querySelector('#calendar .fc-datagrid-body .fc-scroller')
    || document.querySelector('#calendar .fc-resource-area .fc-scroller');
}

function getTimelineVerticalScroller() {
  return document.querySelector('#calendar .fc-timeline-body .fc-scroller');
}

let calendarVerticalScrollSyncLock = false;
let calendarVerticalScrollRaf = null;

function syncCalendarVerticalScroll(source, target) {
  if (calendarVerticalScrollSyncLock || !source || !target || source === target) return;

  calendarVerticalScrollSyncLock = true;
  const maxSource = Math.max(0, source.scrollHeight - source.clientHeight);
  const maxTarget = Math.max(0, target.scrollHeight - target.clientHeight);

  if (maxSource > 0 || maxTarget > 0) {
    const ratio = maxSource > 0 ? source.scrollTop / maxSource : 0;
    target.scrollTop = Math.min(maxTarget, ratio * maxTarget);
  }

  calendarVerticalScrollSyncLock = false;
}

function clampCalendarVerticalScroll() {
  const dgScroller = getDatagridVerticalScroller();
  const tlScroller = getTimelineVerticalScroller();
  if (!dgScroller || !tlScroller) return;

  const maxDg = Math.max(0, dgScroller.scrollHeight - dgScroller.clientHeight);
  const maxTl = Math.max(0, tlScroller.scrollHeight - tlScroller.clientHeight);
  if (maxDg <= 0 && maxTl <= 0) return;

  const ratioDg = maxDg > 0 ? dgScroller.scrollTop / maxDg : 0;
  const ratioTl = maxTl > 0 ? tlScroller.scrollTop / maxTl : 0;
  const ratio = Math.min(ratioDg, ratioTl, 1);

  calendarVerticalScrollSyncLock = true;
  if (maxDg > 0) dgScroller.scrollTop = ratio * maxDg;
  if (maxTl > 0) tlScroller.scrollTop = ratio * maxTl;
  calendarVerticalScrollSyncLock = false;
}

function onCalendarVerticalScroll(event) {
  const target = event.target;
  if (!target || !target.classList || !target.classList.contains('fc-scroller')) return;
  if (calendarVerticalScrollSyncLock) return;

  if (calendarVerticalScrollRaf) {
    cancelAnimationFrame(calendarVerticalScrollRaf);
  }

  calendarVerticalScrollRaf = requestAnimationFrame(function() {
    calendarVerticalScrollRaf = null;

    const dgScroller = getDatagridVerticalScroller();
    const tlScroller = getTimelineVerticalScroller();
    if (!dgScroller || !tlScroller) return;

    if (target === dgScroller || target.closest('.fc-datagrid-body') || target.closest('.fc-resource-area')) {
      syncCalendarVerticalScroll(dgScroller, tlScroller);
    } else if (target === tlScroller || target.closest('.fc-timeline-body')) {
      syncCalendarVerticalScroll(tlScroller, dgScroller);
    }

    clampCalendarVerticalScroll();
  });
}

function bindCalendarVerticalScrollSync() {
  const calendarRoot = document.getElementById('calendar');
  if (!calendarRoot || calendarRoot.dataset.verticalSyncBound) return;

  calendarRoot.dataset.verticalSyncBound = '1';
  calendarRoot.addEventListener('scroll', onCalendarVerticalScroll, { capture: true, passive: true });
}

function refreshCalendarVerticalScrollSync() {
  const dgScroller = getDatagridVerticalScroller();
  const tlScroller = getTimelineVerticalScroller();

  if (calendar && dgScroller && tlScroller) {
    const dgRows = dgScroller.querySelectorAll('tbody tr').length;
    const tlRows = tlScroller.querySelectorAll('tbody tr').length;
    if (dgRows !== tlRows && typeof calendar.updateSize === 'function') {
      calendar.updateSize();
    }
  }

  requestAnimationFrame(function() {
    clampCalendarVerticalScroll();
    bindCalendarVerticalScrollSync();
  });
}

function getVerticalScrollerForRow(rowEl) {
  if (!rowEl) return null;
  const scroller = rowEl.closest('.fc-scroller');
  if (scroller) return scroller;
  // Fallback to timeline body scroller
  return document.querySelector('#calendar .fc-timeline-body .fc-scroller')
      || document.querySelector('#calendar .fc-scroller');
}

function findTimeRowByResourceId(resourceId) {
  if (isFloorResourceId(resourceId)) return null;

  const id = CSS.escape(String(resourceId));
  let timeRow = document.querySelector(`#calendar .fc-timeline-body tr[data-resource-id="${id}"]`);
  if (timeRow) return isFloorTimelineRow(timeRow) ? null : timeRow;

  const laneCell = document.querySelector(`#calendar .fc-timeline-body td.fc-timeline-lane[data-resource-id="${id}"]`);
  if (laneCell) {
    timeRow = laneCell.closest('tr');
    return isFloorTimelineRow(timeRow) ? null : timeRow;
  }

  const labelCell = document.querySelector(`#calendar .fc-datagrid-cell.fc-resource[data-resource-id="${id}"]`);
  if (!labelCell || labelCell.hasAttribute('data-is-floor')) return null;

  const labelRow = labelCell.closest('tr');
  if (!labelRow || !labelRow.parentElement) return null;

  const idx = Array.prototype.indexOf.call(labelRow.parentElement.children, labelRow);
  const bodyRows = document.querySelectorAll('#calendar .fc-timeline-body tbody tr');
  timeRow = bodyRows[idx] || null;
  return isFloorTimelineRow(timeRow) ? null : timeRow;
}

function isFloorResourceId(resourceId) {
  if (resourceId == null) return false;
  const id = String(resourceId);
  if (/^floor_/i.test(id)) return true;

  const labelCell = document.querySelector(`#calendar .fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);
  if (labelCell && labelCell.hasAttribute('data-is-floor')) return true;

  if (calendar && typeof calendar.getResourceById === 'function') {
    const resource = calendar.getResourceById(id);
    if (resource && resource.extendedProps && resource.extendedProps.isFloor) return true;
  }

  return false;
}

// A valid highlight/selection must start in the PM slot (check-in in the
// evening) and land its check-out in the AM slot of a later day. Starting
// the drag in the AM slot (e.g. an AM-to-PM same-day highlight) is not a
// valid stay and must be blocked before any booking modal is opened.
function isValidCheckInSelectionStart(start) {
  return new Date(start).getHours() >= 12;
}

function showInvalidCheckInSelectionError() {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Invalid Check-in Selection',
      text: 'Check-in must start on the PM slot, with check-out landing on the AM slot of a later day. Please start your selection from the PM half of the day.',
      icon: 'warning',
      confirmButtonText: 'OK',
      background: '#2a3135',
      color: '#ffffff'
    });
  } else {
    alert('Check-in must start on the PM slot, with check-out on the AM slot of a later day.');
  }
}

// With 12-hour slots, a selection's exclusive end can land on either slot
// boundary of a day: 12:00 (drag stopped at the end of that day's AM slot -
// a regular checkout, that day) or 00:00 (drag stopped at the end of the
// PREVIOUS day's PM slot - a late checkout, but still that previous day).
// FullCalendar's raw end in the 00:00 case reads as the *next* calendar
// date, which is what made checkout show Aug 19 for a highlight the user
// dragged only through Aug 18's PM slot. Roll it back 12h onto the slot's
// actual day so display and night-count both land on the right date.
function normalizeSelectionEnd(end) {
  const e = new Date(end);
  if (e.getHours() === 0 && e.getMinutes() === 0) {
    return new Date(e.getTime() - 12 * 60 * 60 * 1000);
  }
  return e;
}

// Asks the user to confirm a calendar highlight as a Late Check Out before
// the Add Booking modal opens. Resolves true if they choose to proceed,
// false if they cancel.
//
// The block window (ignoreSelectUntil) is held open for the entire time the
// dialog is visible, plus a buffer after it closes, and is enforced by the
// capture-phase DOM listener set up in DOMContentLoaded above - that's what
// actually stops the ghost click a SweetAlert2 button leaves on the cell
// underneath it from reaching FullCalendar and arming a second room.
function confirmLateCheckoutSelection() {
  ignoreSelectUntil = Infinity;

  const reenable = function() {
    ignoreSelectUntil = Date.now() + 500;
  };

  if (typeof Swal === 'undefined') {
    const confirmed = confirm('This booking is Late Check Out. Continue to proceed?');
    reenable();
    return Promise.resolve(confirmed);
  }
  return Swal.fire({
    title: 'This booking is Late Check Out',
    text: 'Continue to proceed?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, continue',
    cancelButtonText: 'Cancel',
    background: '#2a3135',
    color: '#ffffff'
  }).then(function(result) {
    reenable();
    return !!result.isConfirmed;
  });
}

// Continues the select flow: auto-detected group select (synchronous, so a
// multi-row sweep is fully accounted for in armedRoomIds before anything
// async runs), then - only once we know for certain this is a single-room
// selection - the Late Check Out confirmation, and finally opening the Add
// Booking modal. The confirmation must stay behind the group-select check:
// asking it any earlier leaves armedRoomIds only partially populated while
// the dialog is up, which is what let two unrelated rooms both end up armed
// and mistakenly opened the group booking flow instead of Add Booking.
function continueCalendarSelectFlow(info, modal, today) {
  // AUTO-DETECTED GROUP SELECT: if the drag swept into more than one room,
  // treat it as a group booking and open that modal instead of the normal
  // single-booking one. A plain single-room drag falls through unchanged below.
  if (isFloorResourceId(info.resource.id)) {
    calendar.unselect();
    resetGroupSelectState();
    return;
  }

  // Check-in must start on the PM slot - an AM-started drag never proceeds,
  // regardless of where it stops.
  if (!isValidCheckInSelectionStart(info.start)) {
    showInvalidCheckInSelectionError();
    calendar.unselect();
    resetGroupSelectState();
    return;
  }

  armedRoomIds.add(String(info.resource.id));
  if (armedRoomIds.size > 1) {
    const roomIds = Array.from(armedRoomIds).filter(function(id) {
      return !isFloorResourceId(id);
    });
    if (roomIds.length < 2) {
      calendar.unselect();
      return;
    }
    groupSelectDateRange = { start: new Date(info.start), end: new Date(info.end) };

    calendar.unselect();

    checkCalendarRoomsAvailability(roomIds, info.start, info.end).then(function(result) {
      handleGroupSelectAvailabilityResult(result, roomIds, info.start, info.end);
    });

    return;
  }
  resetGroupSelectState();

  // With 12-hour slots, the raw exclusive end lands on either boundary of a
  // day: 12:00 means the drag stopped inside that day's AM slot (a regular,
  // morning checkout) - 00:00 means it stopped inside the PREVIOUS day's PM
  // slot (a late, afternoon/evening checkout). Only the PM-stop case is a
  // late checkout; a clean PM check-in to AM check-out needs no confirmation
  // at all and proceeds straight to Add Booking as Regular Check Out.
  const dragStoppedInPmSlot = new Date(info.end).getHours() === 0;

  if (!dragStoppedInPmSlot) {
    openAddBookingModalForSelection(info, modal, today, false);
    return;
  }

  confirmLateCheckoutSelection().then(function(confirmed) {
    if (!confirmed) {
      calendar.unselect();
      return;
    }
    openAddBookingModalForSelection(info, modal, today, true);
  });
}

// Opens the Add Booking modal for a confirmed single-room selection,
// applying any URL-highlight date override first.
function openAddBookingModalForSelection(info, modal, today, lateCheckout) {
  // Check if this selection is from a highlighted area (URL params). Only
  // honor it if the actual drag overlaps the highlighted range - matching on
  // room id alone let a stale hl* param (left over from an earlier search,
  // since nothing ever clears it) silently override a later, unrelated drag
  // on the same room with the wrong checkout date.
  const params = new URLSearchParams(window.location.search);
  const hlRoomId = params.get('hlRoomId');
  const hlStart = params.get('hlStart');
  const hlEnd = params.get('hlEnd');

  let usedHighlight = false;
  if (hlRoomId && hlStart && hlEnd && String(info.resource.id) === String(hlRoomId)) {
    const originalStartDate = new Date(hlStart);
    const originalEndDate = new Date(hlEnd);
    const dragStart = new Date(info.start);
    const dragEnd = new Date(info.end);
    const overlaps = dragStart < originalEndDate && dragEnd > originalStartDate;

    if (overlaps) {
      usedHighlight = true;
      console.log('Using highlight dates from URL params:', { hlStart, hlEnd });

      // Also check if highlight start date is in the past
      const highlightStartDateOnly = new Date(originalStartDate);
      highlightStartDateOnly.setHours(0, 0, 0, 0);

      if (highlightStartDateOnly < today) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Past Date Selected',
            text: 'Cannot create booking for past dates. Please select today or a future date.',
            icon: 'warning',
            confirmButtonText: 'OK',
            background: '#2a3135',
            color: '#ffffff'
          });
        } else {
          alert('Cannot create booking for past dates. Please select today or a future date.');
        }

        calendar.unselect();
        clearIncomingHighlightParams();
        return; // Exit early, don't show modal
      }

      // Set check-in time to 6 AM
      originalStartDate.setHours(6, 0, 0, 0);

      // Set check-out time to 6 PM
      originalEndDate.setHours(18, 0, 0, 0);

      modal.data('calendar-room-id', info.resource.id);
      modal.data('calendar-start', originalStartDate);
      modal.data('calendar-end', originalEndDate);
    }
  }

  if (!usedHighlight) {
    // Use the calendar selection dates for normal selections
    modal.data('calendar-room-id', info.resource.id);
    modal.data('calendar-start', info.start);
    modal.data('calendar-end', normalizeSelectionEnd(info.end));
  }

  // The highlight has now served its purpose (or didn't apply) - clear it so
  // it can't hijack a future drag on this same room.
  if (hlRoomId) clearIncomingHighlightParams();

  modal.data('calendar-late-checkout', !!lateCheckout);

  calendar.unselect();

  const addBookingModalEl = document.getElementById('modal-addbooking');
  if (addBookingModalEl) {
    if (typeof window.showBootstrapModal === 'function') {
      window.showBootstrapModal(addBookingModalEl, { backdrop: 'static', keyboard: true });
    } else if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      bootstrap.Modal.getOrCreateInstance(addBookingModalEl, {
        backdrop: 'static',
        keyboard: true
      }).show();
    } else if (typeof modal.modal === 'function') {
      modal.modal('show');
    }
  }
}

function isFloorTimelineRow(row) {
  if (!row) return false;
  const rowId = row.getAttribute('data-resource-id');
  if (rowId && isFloorResourceId(rowId)) return true;

  const laneCell = row.querySelector('td.fc-timeline-lane[data-resource-id]');
  if (laneCell && isFloorResourceId(laneCell.getAttribute('data-resource-id'))) return true;

  return false;
}

function centerResourceRow(resourceId) {
  const timeRow = findTimeRowByResourceId(resourceId);
  if (!timeRow) return;

  const vScroller = getVerticalScrollerForRow(timeRow);
  if (!vScroller) return;

  // Compute offsetTop relative to scroller for robust positioning
  let offsetTop = 0;
  let el = timeRow;
  while (el && el !== vScroller) {
    offsetTop += el.offsetTop;
    el = el.offsetParent;
  }

  const targetTop = offsetTop - (vScroller.clientHeight / 2) + (timeRow.offsetHeight / 2) + V_CENTER_BIAS_PX;
  const maxTop = Math.max(0, vScroller.scrollHeight - vScroller.clientHeight);
  vScroller.scrollTop = Math.min(Math.max(0, targetTop), maxTop);
}

function centerElementVerticallyInScroller(el) {
  if (!el) return;
  const vScroller = el.closest('.fc-scroller')
    || document.querySelector('#calendar .fc-timeline-body .fc-scroller')
    || document.querySelector('#calendar .fc-scroller');
  if (!vScroller) return;

  let offsetTop = 0;
  let node = el;
  while (node && node !== vScroller) {
    offsetTop += node.offsetTop || 0;
    node = node.offsetParent;
  }
  const targetTop = offsetTop - (vScroller.clientHeight / 2) + (el.offsetHeight / 2) + V_CENTER_BIAS_PX;
  const maxTop = Math.max(0, vScroller.scrollHeight - vScroller.clientHeight);
  vScroller.scrollTop = Math.min(Math.max(0, targetTop), maxTop);
}

function scrollToToday(bodyScroller, top) {
  const view = calendar.view;
  const startMs = view.activeStart.getTime();
  const endMs = view.activeEnd.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (endMs - startMs) / msPerDay;
  const dayWidth = bodyScroller.scrollWidth / totalDays;

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayMs = todayDate.getTime();
  const diffDays = (todayMs - startMs) / msPerDay;

  // Calculate today's position
  const todayPosition = diffDays * dayWidth;
  
  // Position scroll to show previous X days before today
  // This makes today appear on the right side with previous days visible on the left
  // Example: If today is December 5, show November 25 to December 5 (10 days before)
  let scrollPosition = todayPosition - (TODAY_OFFSET_DAYS * dayWidth);
  
  // Ensure scroll position is within valid bounds
  const maxScroll = Math.max(0, bodyScroller.scrollWidth - bodyScroller.clientWidth);
  scrollPosition = Math.max(0, Math.min(scrollPosition, maxScroll));
  
  bodyScroller.scrollLeft = scrollPosition;
  top.scrollLeft = bodyScroller.scrollLeft;
}

function scrollToDate(targetDate, bodyScroller, top) {
  const view = calendar.view;
  const startMs = view.activeStart.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - startMs) / msPerDay;
  const dayWidth = bodyScroller.scrollWidth / totalDays;
  
  targetDate.setHours(0, 0, 0, 0);
  const diffDays = (targetDate.getTime() - startMs) / msPerDay;
  bodyScroller.scrollLeft = diffDays * dayWidth;
  top.scrollLeft = bodyScroller.scrollLeft;
}

function scrollToDateCentered(targetDate, bodyScroller, top) {
  const view = calendar.view;
  const startMs = view.activeStart.getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - startMs) / msPerDay;
  const dayWidth = bodyScroller.scrollWidth / totalDays;

  targetDate.setHours(0, 0, 0, 0);
  const diffDays = (targetDate.getTime() - startMs) / msPerDay;

  const desiredLeft = diffDays * dayWidth - (bodyScroller.clientWidth / 2) + H_CENTER_BIAS_PX;
  const maxLeft = Math.max(0, bodyScroller.scrollWidth - bodyScroller.clientWidth);
  const clampedLeft = Math.min(Math.max(0, desiredLeft), maxLeft);

  bodyScroller.scrollLeft = clampedLeft;
  top.scrollLeft = bodyScroller.scrollLeft;
}

// =============================================================================
// LAZY-LOADED CALENDAR RANGE EXPANSION
// =============================================================================

function getCalendarAbsoluteBounds() {
  const today = new Date();
  const Y = today.getFullYear(), M = today.getMonth();
  return {
    min: new Date(Y, M - CALENDAR_ABSOLUTE_MONTHS_BACK, 1),
    max: new Date(Y, M + CALENDAR_ABSOLUTE_MONTHS_FORWARD, 1)
  };
}

// Checks how close the given horizontal scroll position is to either edge of the
// currently-rendered range, and grows the range by one month in that direction if
// the user has scrolled within CALENDAR_EXPAND_EDGE_DAYS of an edge that isn't already
// at the absolute 12-month bound.
function maybeExpandCalendarRange(scrollLeft, bodyScroller) {
  if (!calendar || calendarExpansionInProgress) return;
  const view = calendar.view;
  if (!view || !bodyScroller.scrollWidth) return;

  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - view.activeStart.getTime()) / msPerDay;
  if (!totalDays) return;
  const dayWidth = bodyScroller.scrollWidth / totalDays;
  if (!dayWidth) return;

  const daysFromStart = scrollLeft / dayWidth;
  const daysFromEnd = totalDays - (scrollLeft + bodyScroller.clientWidth) / dayWidth;

  const bounds = getCalendarAbsoluteBounds();
  const atMinBound = view.activeStart.getTime() <= bounds.min.getTime();
  const atMaxBound = view.activeEnd.getTime() >= bounds.max.getTime();

  if (!atMinBound && daysFromStart < CALENDAR_EXPAND_EDGE_DAYS) {
    expandCalendarRange('backward');
  } else if (!atMaxBound && daysFromEnd < CALENDAR_EXPAND_EDGE_DAYS) {
    expandCalendarRange('forward');
  }
}

// Grows the rendered window by CALENDAR_EXPAND_STEP_MONTHS in the given direction (capped at
// the absolute 12-month bound), re-renders the view with the wider range, and restores the
// user's scroll position (the date they were looking at) afterward. handleDatesSet already
// re-fetches booking data for whatever range calendar.view resolves to, so no manual fetch
// is needed here beyond the changeView() call.
function expandCalendarRange(direction) {
  if (calendarExpansionInProgress || !calendar || !calendar.view) return;

  if (direction === 'backward') {
    if (calendarWindowMonthsBack >= CALENDAR_ABSOLUTE_MONTHS_BACK) return;
    calendarWindowMonthsBack = Math.min(calendarWindowMonthsBack + CALENDAR_EXPAND_STEP_MONTHS, CALENDAR_ABSOLUTE_MONTHS_BACK);
  } else {
    if (calendarWindowMonthsForward >= CALENDAR_ABSOLUTE_MONTHS_FORWARD) return;
    calendarWindowMonthsForward = Math.min(calendarWindowMonthsForward + CALENDAR_EXPAND_STEP_MONTHS, CALENDAR_ABSOLUTE_MONTHS_FORWARD);
  }

  // Remember the date currently at the left edge of the viewport so we can scroll back to it
  // once the wider range finishes rendering.
  let anchorDate = new Date();
  const scrollbarBefore = setupScrollbar();
  if (scrollbarBefore && scrollbarBefore.bodyScroller.scrollWidth) {
    const view = calendar.view;
    const msPerDay = 1000 * 60 * 60 * 24;
    const totalDays = (view.activeEnd.getTime() - view.activeStart.getTime()) / msPerDay;
    const dayWidth = scrollbarBefore.bodyScroller.scrollWidth / totalDays;
    if (dayWidth) {
      const daysFromStart = scrollbarBefore.bodyScroller.scrollLeft / dayWidth;
      anchorDate = new Date(view.activeStart.getTime() + daysFromStart * msPerDay);
    }
  }

  const today = new Date();
  const Y = today.getFullYear(), M = today.getMonth();
  const newStart = new Date(Y, M - calendarWindowMonthsBack, 1);
  const newEnd = new Date(Y, M + calendarWindowMonthsForward, 1);

  calendarExpansionInProgress = true;
  // changeView() re-mounts the timeline starting from newStart (the far edge of the
  // widened range), and the corrected scroll position back to anchorDate isn't applied
  // until the setTimeout below - without hiding in between, the user saw the grid jump to
  // that far edge and then flick back, mid-drag, every time they scrolled near a boundary.
  // Same "hide until correct" trick already used for the initial load's today-scroll (see
  // #calendar.calendar-not-ready in calendar.css).
  if (calendarEl) calendarEl.classList.add('calendar-not-ready');
  calendar.changeView('month', { start: newStart, end: newEnd });

  // The datesSet handler kicks off a debounced booking refetch + re-render; give it time to
  // finish before restoring scroll position and re-binding the scrollbar/hover listeners.
  setTimeout(() => {
    const sb = setupScrollbar();
    if (sb) {
      scrollToDate(new Date(anchorDate), sb.bodyScroller, sb.top);
      updateHeaderOnScroll(sb.bodyScroller, sb.top);
    }
    setupHoverEffects();
    if (calendarEl) calendarEl.classList.remove('calendar-not-ready');
    calendarExpansionInProgress = false;
  }, 400);
}

function handleCalendarScrollForExpansion(e) {
  const el = e.target;
  if (!el || !el.classList || !el.classList.contains('fc-scroller')) return;
  if (!calendarEl || !calendarEl.contains(el)) return;
  if (el.scrollWidth <= el.clientWidth) return; // not the horizontally-scrollable timeline body

  clearTimeout(calendarExpandCheckTimer);
  calendarExpandCheckTimer = setTimeout(() => {
    maybeExpandCalendarRange(el.scrollLeft, el);
  }, 120);
}

function setupCalendarRangeExpansion() {
  const container = calendarEl || document.getElementById('calendar');
  if (!container || container.dataset.rangeExpansionBound === '1') return;
  container.dataset.rangeExpansionBound = '1';
  // Capture phase: 'scroll' doesn't bubble, but a capture listener on an ancestor still
  // receives it from any descendant scroller (the .fc-scroller elements get recreated on
  // every re-render, so binding to a stable ancestor avoids re-binding per reload).
  document.addEventListener('scroll', handleCalendarScrollForExpansion, true);
}

// The toolbar month/year shows the month at the CENTRE of what's currently
// visible - i.e. the month you're actually looking at - not the date sitting at
// the far-left scroll edge (which only flipped the title once the 1st of the
// next month scrolled into that corner).
function computeVisibleMonthTitle(bodyScroller) {
  if (!calendar || !calendar.view || !bodyScroller || !bodyScroller.scrollWidth) return null;
  const view = calendar.view;
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - view.activeStart.getTime()) / msPerDay;
  if (!totalDays) return null;
  const dayWidth = bodyScroller.scrollWidth / totalDays;
  if (!dayWidth) return null;

  const centreDays = (bodyScroller.scrollLeft + bodyScroller.clientWidth / 2) / dayWidth;
  const centreDate = new Date(view.activeStart.getTime() + centreDays * msPerDay);
  return centreDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function updateHeaderOnScroll(bodyScroller, top) {
  const toolbarTitle = document.querySelector('.fc-toolbar-title');
  if (!toolbarTitle || !bodyScroller) return;

  const setTitle = () => {
    const t = computeVisibleMonthTitle(bodyScroller);
    if (t) toolbarTitle.textContent = t;
  };

  // Bind the scroll listener ONCE per scroller element (the .fc-scroller is
  // re-created on every calendar re-render, so a fresh element => a fresh
  // listener, and the old element + its listener are GC'd on removal).
  if (!bodyScroller._headerScrollBound) {
    bodyScroller._headerScrollBound = true;
    let throttle;
    bodyScroller.addEventListener('scroll', () => {
      clearTimeout(throttle);
      throttle = setTimeout(setTitle, 0);
    });
  }

  setTitle();
}

// =============================================================================
// HOVER ENHANCEMENTS
// =============================================================================

// OPTIMIZATION: previously attached 2 listeners to every .fc-timeline-slot, every
// .fc-datagrid-cell, and every .fc-event individually (tens of thousands of listeners on
// a full 7-month timeline), re-created on every calendar reload. mouseenter/mouseleave fire
// repeatedly while the grid scrolls under a stationary cursor, so each of those listeners'
// DOM queries ran continuously during scroll, causing jank. This binds two delegated
// listeners once on the stable calendar container instead, using event bubbling + closest().
function getHoverLaneCellFromSlot(slotEl) {
  return slotEl.closest('td.fc-timeline-lane');
}

function getHoverMirrorRow(tr, mirrorSelector, allRowsSelector) {
  if (!tr) return null;
  const resourceId = tr.dataset?.resourceId;
  let mirror = resourceId ? document.querySelector(`${mirrorSelector} tr[data-resource-id="${resourceId}"]`) : null;
  if (!mirror && tr.parentElement) {
    const idx = Array.prototype.indexOf.call(tr.parentElement.children, tr);
    mirror = document.querySelectorAll(allRowsSelector)[idx];
  }
  return mirror;
}

function handleHoverDelegatedOver(e) {
  const slot = e.target.closest('.fc-timeline-slot');
  if (slot && !slot.classList.contains('fc-slot-hover')) {
    const isOverEvent = !!e.target.closest('.fc-event');
    slot.classList.add('fc-slot-hover');
    if (!isOverEvent) {
      slot.classList.add('fc-slot-pointer');
      slot.setAttribute('title', 'Click to book this time slot');
    }
    getHoverLaneCellFromSlot(slot)?.classList.add('fc-lane-hover');
    const timeRow = slot.closest('tr');
    getHoverMirrorRow(
      timeRow,
      '.fc-resource-area',
      '.fc-resource-area .fc-datagrid-body tbody tr, .fc-resource-area tbody tr'
    )?.classList.add('fc-row-hover');
  }

  const cell = e.target.closest('.fc-resource-area .fc-datagrid-cell');
  if (cell) {
    const tr = cell.closest('tr');
    if (tr && !tr.classList.contains('fc-row-hover')) {
      tr.classList.add('fc-row-hover');
      getHoverMirrorRow(tr, '.fc-timeline-body', '.fc-timeline-body tbody tr')?.classList.add('fc-lane-hover');
    }
  }

  const ev = e.target.closest('.fc-event');
  if (ev && !ev.style.zIndex) {
    ev.style.zIndex = '20';
    ev.style.transition = 'box-shadow .2s ease';
  }
}

function handleHoverDelegatedOut(e) {
  const related = e.relatedTarget;

  const slot = e.target.closest('.fc-timeline-slot');
  if (slot && !(related && slot.contains(related))) {
    slot.classList.remove('fc-slot-hover', 'fc-slot-pointer');
    slot.removeAttribute('title');
    getHoverLaneCellFromSlot(slot)?.classList.remove('fc-lane-hover');
    const timeRow = slot.closest('tr');
    getHoverMirrorRow(
      timeRow,
      '.fc-resource-area',
      '.fc-resource-area .fc-datagrid-body tbody tr, .fc-resource-area tbody tr'
    )?.classList.remove('fc-row-hover');
  }

  const cell = e.target.closest('.fc-resource-area .fc-datagrid-cell');
  if (cell) {
    const tr = cell.closest('tr');
    if (tr && !(related && tr.contains(related))) {
      tr.classList.remove('fc-row-hover');
      getHoverMirrorRow(tr, '.fc-timeline-body', '.fc-timeline-body tbody tr')?.classList.remove('fc-lane-hover');
    }
  }

  const ev = e.target.closest('.fc-event');
  if (ev && !(related && ev.contains(related))) {
    ev.style.zIndex = '';
    ev.style.boxShadow = '';
  }
}

function setupHoverEffects() {
  const container = calendarEl || document.getElementById('calendar');
  if (!container || container.dataset.hoverDelegationBound === '1') return;
  container.dataset.hoverDelegationBound = '1';
  container.addEventListener('mouseover', handleHoverDelegatedOver);
  container.addEventListener('mouseout', handleHoverDelegatedOut);
  container.addEventListener('mousemove', handleRowHoverMouseMove);
  container.addEventListener('mouseleave', clearRowHoverTrace);
  container.addEventListener('mouseleave', clearColHoverTrace);
}

// =============================================================================
// ROW HOVER TRACE (horizontal) - highlights the full room row (both the
// resource label and its matching timeline row) under the cursor, mirroring
// the vertical date-column trace above so hovering a cell shows both axes.
//
// Deliberately NOT built on the mouseover/mouseout pair used for the slot
// trace: an earlier attempt mirrored classes on enter/leave, but fast mouse
// movement drops/coalesces some of those events in the browser, so cleanup
// for a previously-hovered row could be skipped - each miss left one more
// row permanently blue, and enough of them accumulated to tint the whole
// grid. mousemove instead re-evaluates "what row is the cursor over right
// now" on every move and explicitly tracks the one currently-lit pair of
// elements in these variables, clearing exactly them before lighting a new
// pair - there is never a stale element left behind to accumulate.
// =============================================================================
let rowHoverRoomId = null;
let rowHoverTimelineTr = null;
let rowHoverResourceTr = null;
let colHoverDate = null;
let colHoverHeaderCell = null;

function clearRowHoverTrace() {
  if (rowHoverTimelineTr) rowHoverTimelineTr.classList.remove('fc-timeline-row-hover');
  if (rowHoverResourceTr) rowHoverResourceTr.classList.remove('fc-row-hover');
  rowHoverRoomId = null;
  rowHoverTimelineTr = null;
  rowHoverResourceTr = null;
}

// Column trace (vertical) - mirrors the hovered date into the sticky header,
// the same way the row trace above mirrors the hovered room into the label
// column. Header date cells (.fc-timeline-header .fc-timeline-slot) and body
// date cells (.fc-timeline-body .fc-timeline-slot) are two separate elements
// in two separate tables that just happen to line up visually, so hovering
// one never natively highlights the other - this keys them together by their
// shared data-date attribute.
function clearColHoverTrace() {
  if (colHoverHeaderCell) colHoverHeaderCell.classList.remove('fc-timeline-col-hover');
  colHoverDate = null;
  colHoverHeaderCell = null;
}

function handleRowHoverMouseMove(e) {
  // Only trace inside the actual grid (header toolbar/search box are also
  // inside #calendar, and shouldn't light up a row just because their Y
  // position happens to fall in a room's vertical range). FullCalendar v6
  // has no ".fc-resource-area" wrapper (that was a v5 class) - the label
  // grid's real container is ".fc-datagrid-body".
  if (!e.target.closest('.fc-timeline-body, .fc-datagrid-body')) {
    if (rowHoverRoomId) clearRowHoverTrace();
    if (colHoverDate) clearColHoverTrace();
    return;
  }

  // The month view runs a 12-hour slotDuration so it can position half-day
  // check-in/check-out bars precisely, so the body has two date cells per
  // day (T00:00:00 and T12:00:00) - but the header collapses those into one
  // cell per day (T00:00:00 only), since there's only room for one date
  // label. Matching on the full timestamp made the header trace vanish the
  // moment the cursor crossed into a day's PM half, whose exact timestamp
  // has no header counterpart. Matching on just the date portion (the first
  // 10 chars, "YYYY-MM-DD") finds that one header cell for either half.
  const slotEl = e.target.closest('.fc-timeline-slot');
  const date = slotEl ? slotEl.dataset.date : null;
  const dateOnly = date ? date.slice(0, 10) : null;
  if (dateOnly !== colHoverDate) {
    clearColHoverTrace();
    if (dateOnly) {
      const headerCell = document.querySelector(`.fc-timeline-header .fc-timeline-slot[data-date^="${CSS.escape(dateOnly)}"]`);
      if (headerCell) {
        headerCell.classList.add('fc-timeline-col-hover');
        colHoverHeaderCell = headerCell;
      }
      colHoverDate = dateOnly;
    }
  }

  // findResourceIdAtY (already used for group-select drag tracking) reads
  // purely off the cursor's Y position against the resource label rows -
  // unlike closest('tr') from e.target, this is unaffected by however a
  // hovered event bar happens to be nested/positioned in the timeline body,
  // which was resolving to the same wide row wrapper for every event and
  // painting the whole grid instead of just the one room under the cursor.
  const roomId = findResourceIdAtY(e.clientY);
  if (roomId === rowHoverRoomId) return;

  clearRowHoverTrace();
  if (!roomId) return;
  rowHoverRoomId = roomId;

  // The per-day background cells (.fc-timeline-slot) are NOT scoped to a
  // room - FullCalendar renders exactly one full-height slot per date,
  // shared across every row, in its own <tr> with no data-resource-id.
  // The only element that actually represents "this one room's row" in the
  // timeline is its single wide lane <td> (spans the full date range) - the
  // data-resource-id attribute lives on that <td>, never on an enclosing
  // <tr>, so querying for a "tr[data-resource-id]" here always came back
  // null. Same story on the label side: data-resource-id is on the
  // .fc-datagrid-cell itself, not its <tr>.
  const escapedId = CSS.escape(roomId);
  const timelineLane = document.querySelector(`.fc-timeline-body td.fc-timeline-lane.fc-resource[data-resource-id="${escapedId}"]`);
  const resourceCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${escapedId}"]`);

  if (timelineLane) {
    timelineLane.classList.add('fc-timeline-row-hover');
    rowHoverTimelineTr = timelineLane;
  }
  if (resourceCell) {
    resourceCell.classList.add('fc-row-hover');
    rowHoverResourceTr = resourceCell;
  }
}


// =============================================================================
// CALENDAR EVENT HANDLERS
// =============================================================================

// These functions are now moved to calendar_booking_data.js module
// They are available globally via window.handleEventClick, window.handleEventDidMount, window.handleDatesSet

// =============================================================================
// GROUP SELECT (auto-detected): dragging within one room works exactly as before
// (single-booking modal). Sweeping the drag down into other rooms along the way
// is auto-detected as a group booking and hands off to that modal instead - no
// separate mode/button needed.
// =============================================================================

const armedRoomIds = new Set();

// Guards against the "ghost click" that some browsers/touch devices fire on
// whatever sits underneath a SweetAlert2 button right after it closes - that
// phantom click lands on the calendar cell beneath the OK button and re-enters
// select(), arming a second room and popping the group booking modal
// unintentionally. Any select() call before this timestamp is ignored.
let ignoreSelectUntil = 0;

function getOrderedRoomIds() {
  return Array.from(document.querySelectorAll('.fc-datagrid-cell.fc-resource[data-resource-id]:not([data-is-floor])'))
    .map(el => el.getAttribute('data-resource-id'));
}

// Sets the armed rooms to exactly the contiguous range between the drag's anchor
// (where mousedown happened) and whatever room is currently under the cursor - so
// dragging further sweeps more rooms in, and dragging back shrinks it, same as a
// spreadsheet range selection (instead of a one-way "only ever adds" set).
function setArmedRoomRange(anchorId, currentId) {
  const orderedIds = getOrderedRoomIds();
  const anchorIndex = orderedIds.indexOf(String(anchorId));
  const currentIndex = orderedIds.indexOf(String(currentId));
  if (anchorIndex === -1 || currentIndex === -1) return;

  const start = Math.min(anchorIndex, currentIndex);
  const end = Math.max(anchorIndex, currentIndex);
  const rangeIds = orderedIds.slice(start, end + 1).filter(function(id) {
    return !isFloorResourceId(id);
  });
  if (!rangeIds.length) return;
  const rangeSet = new Set(rangeIds);

  armedRoomIds.forEach(function(id) {
    if (!rangeSet.has(id)) {
      const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);
      if (labelCell) labelCell.classList.remove('group-select-armed');
    }
  });

  armedRoomIds.clear();
  rangeIds.forEach(function(id) {
    armedRoomIds.add(id);
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);
    if (labelCell) labelCell.classList.add('group-select-armed');
  });

  updateGroupSelectBadge();
  if (armedRoomIds.size > 1 && !groupCreateModeActive) {
    syncGroupSelectOverlay();
  }
}

// Draws a highlight rectangle for each swept room, scoped to exactly the date
// range the user dragged over - not the whole row. FullCalendar already computes
// that date range precisely for the room the drag started in (its native
// .fc-highlight element); this just borrows that element's left/width and repeats
// it at each additional armed room's row position.
let groupSelectOverlays = [];
let groupSelectDateRange = null; // { start: Date, end: Date } — kept after modal open
let calendarGroupBookingSnapshot = null; // persists selection across modal open/close

function getHorizontalTimelineScroller() {
  return Array.from(document.querySelectorAll('#calendar .fc-scroller'))
    .find(s => s.scrollWidth > s.clientWidth)
    || null;
}

function getVerticalTimelineScroller() {
  return document.querySelector('#calendar .fc-timeline-body .fc-scroller')
    || document.querySelector('#calendar .fc-scroller');
}

function getTimelineOverlayScroller() {
  const sampleRow = document.querySelector('#calendar .fc-timeline-body tbody tr');
  if (sampleRow) {
    const rowScroller = sampleRow.closest('.fc-scroller');
    if (rowScroller) return rowScroller;
  }
  return getHorizontalTimelineScroller() || getVerticalTimelineScroller();
}

function getTimelineBodyScroller() {
  return getTimelineOverlayScroller();
}

function computeDateRangeMetrics(startDate, endDate) {
  if (!calendar || !startDate || !endDate) return null;

  const scroller = getTimelineOverlayScroller();
  const hScroller = getHorizontalTimelineScroller();
  const widthSource = (hScroller && hScroller.scrollWidth > hScroller.clientWidth) ? hScroller : scroller;
  if (!widthSource) return null;

  const view = calendar.view;
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - view.activeStart.getTime()) / msPerDay;
  if (totalDays <= 0) return null;

  const dayWidth = widthSource.scrollWidth / totalDays;
  const startOffsetDays = (startDate.getTime() - view.activeStart.getTime()) / msPerDay;
  const endOffsetDays = (endDate.getTime() - view.activeStart.getTime()) / msPerDay;

  return {
    left: startOffsetDays * dayWidth,
    width: (endOffsetDays - startOffsetDays) * dayWidth
  };
}

function getRowContentTopInScroller(row, scroller) {
  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return rowRect.top - scrollerRect.top + scroller.scrollTop;
}

function getTimelineOverlayLayer() {
  const scroller = getTimelineOverlayScroller();
  if (!scroller) return null;

  const mount = scroller.querySelector(':scope > div') || scroller;
  let layer = mount.querySelector(':scope > .calendar-group-overlay-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'calendar-group-overlay-layer';
    layer.setAttribute('aria-hidden', 'true');
    mount.appendChild(layer);
  }

  const contentTable = mount.querySelector('table') || scroller.querySelector('table');
  layer.style.width = (contentTable ? contentTable.offsetWidth : scroller.scrollWidth) + 'px';
  layer.style.height = (contentTable ? contentTable.offsetHeight : 0) + 'px';
  return layer;
}

// Shade bars live inside the timeline scroller so they scroll with the grid
// (never bleed into the header) while spanning the full date range width.
function appendScrollerContentOverlay(className, timeRow, contentLeft, contentWidth) {
  const scroller = getTimelineOverlayScroller();
  const layer = getTimelineOverlayLayer();
  if (!scroller || !layer || !timeRow || contentWidth <= 0) return null;

  const overlay = document.createElement('div');
  overlay.className = className;
  overlay.style.top = getRowContentTopInScroller(timeRow, scroller) + 'px';
  overlay.style.left = contentLeft + 'px';
  overlay.style.width = contentWidth + 'px';
  overlay.style.height = timeRow.offsetHeight + 'px';
  layer.appendChild(overlay);
  return overlay;
}

let groupOverlayScrollSyncBound = false;
let groupOverlaySyncTimer = null;

function scheduleGroupOverlaySync() {
  if (groupOverlaySyncTimer) cancelAnimationFrame(groupOverlaySyncTimer);
  groupOverlaySyncTimer = requestAnimationFrame(function() {
    groupOverlaySyncTimer = null;
    // Resize the layer after scroll; content-positioned overlays move on their own.
    getTimelineOverlayLayer();
    if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
      renderGroupCreateOverlaysNow();
    }
    if (armedRoomIds.size >= 1 && !groupCreateModeActive) {
      syncGroupSelectOverlay();
    }
  });
}

function bindGroupOverlayScrollSync() {
  if (groupOverlayScrollSyncBound) return;
  groupOverlayScrollSyncBound = true;
  // Capture phase catches scroll on FC scrollers even if they mount after init.
  document.addEventListener('scroll', scheduleGroupOverlaySync, true);
  window.addEventListener('resize', scheduleGroupOverlaySync);
}

function refreshGroupOverlayScrollSync() {
  document.querySelectorAll('#calendar .fc-scroller').forEach(function(scroller) {
    if (scroller.dataset.groupOverlaySyncBound) return;
    scroller.dataset.groupOverlaySyncBound = '1';
    scroller.addEventListener('scroll', scheduleGroupOverlaySync, { passive: true });
  });
  const topScroller = document.getElementById('top-scroller');
  if (topScroller && !topScroller.dataset.groupOverlaySyncBound) {
    topScroller.dataset.groupOverlaySyncBound = '1';
    topScroller.addEventListener('scroll', scheduleGroupOverlaySync, { passive: true });
  }
}

function clearGroupSelectOverlays() {
  document.querySelectorAll('.group-select-overlay').forEach(function(el) { el.remove(); });
  groupSelectOverlays = [];
}

function getCalendarSelectDateRange() {
  if (!calendar) return null;

  if (typeof calendar.getSelection === 'function') {
    const sel = calendar.getSelection();
    if (sel && sel.start && sel.end) {
      return { start: new Date(sel.start), end: new Date(sel.end) };
    }
  }

  // FullCalendar 6 keeps in-progress date drag here before the select event fires.
  const currentData = calendar.currentData;
  const liveRange = currentData && currentData.dateSelection && currentData.dateSelection.range;
  if (liveRange && liveRange.start && liveRange.end) {
    return { start: new Date(liveRange.start), end: new Date(liveRange.end) };
  }

  return null;
}

function getGroupSelectDateRange() {
  return getCalendarSelectDateRange() || groupSelectDateRange;
}

function getHighlightOverlayMetrics() {
  const nativeHighlight = document.querySelector('#calendar .fc-highlight');
  if (!nativeHighlight) return null;

  const scroller = getTimelineOverlayScroller();
  if (!scroller) return null;

  const highlightRect = nativeHighlight.getBoundingClientRect();
  if (highlightRect.width <= 0) return null;

  const scrollerRect = scroller.getBoundingClientRect();
  return {
    left: highlightRect.left - scrollerRect.left + scroller.scrollLeft,
    width: highlightRect.width
  };
}

function getGroupSelectOverlayMetrics() {
  const highlightMetrics = getHighlightOverlayMetrics();
  if (highlightMetrics) return highlightMetrics;

  const range = getGroupSelectDateRange();
  if (!range) return null;

  return computeDateRangeMetrics(range.start, range.end);
}

function syncGroupSelectOverlay() {
  clearGroupSelectOverlays();
  if (!armedRoomIds.size || !calendar) return;

  const metrics = getGroupSelectOverlayMetrics();
  if (!metrics || metrics.width <= 0) return;

  const nativeHighlight = document.querySelector('#calendar .fc-highlight');
  const nativeLane = nativeHighlight ? nativeHighlight.closest('td.fc-timeline-lane') : null;

  armedRoomIds.forEach(function(id) {
    const timeRow = findTimeRowByResourceId(id);
    if (!timeRow || isFloorResourceId(id)) return;
    const laneCell = timeRow.querySelector('td.fc-timeline-lane');
    if (nativeLane && laneCell === nativeLane) return;

    const overlay = appendScrollerContentOverlay(
      'group-select-overlay',
      timeRow,
      metrics.left,
      metrics.width
    );
    if (overlay) groupSelectOverlays.push(overlay);
  });
}

// Single continuous drag: mousedown on a room row, drag down to sweep more rooms,
// drag across to set the date range, release to hand off. Tracks which room lanes
// the pointer passed over via the stable data-resource-id attribute FullCalendar
// puts on every row/lane cell; the date range itself still comes from FullCalendar's
// own native select event (info.start/info.end), so we never have to reimplement
// pixel-to-date math against the timeline grid.
let groupDragActive = false;

// FullCalendar renders its own drag-preview overlay in the timeline pane while a
// select-drag is in progress, which sits on top and blocks document.elementFromPoint
// from reaching the real cells. So instead of point-based hit-testing, this compares
// the cursor's Y position directly against each room label's bounding box — the
// label column (left side) is never covered by that overlay, so it's a reliable way
// to know which room row the cursor is over at any moment during the drag.
function findResourceIdAtY(clientY) {
  const labelCells = document.querySelectorAll('.fc-datagrid-cell.fc-resource[data-resource-id]:not([data-is-floor])');
  for (let i = 0; i < labelCells.length; i++) {
    const rect = labelCells[i].getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return labelCells[i].getAttribute('data-resource-id');
    }
  }
  return null;
}

let groupDragAnchorRoomId = null;

function attachGroupSelectDragTracking() {
  document.addEventListener('mousedown', function(e) {
    if (groupCreateModeActive) return;
    // findResourceIdAtY only tests the click's Y-coordinate against room row
    // bounding rects - it never checks that the click actually landed inside
    // the calendar. Room rows tile the full page height, so ANY mousedown
    // anywhere on the page (a SweetAlert2 button, a sidebar link, anything)
    // whose Y happens to line up with some room row was getting treated as
    // a group-select click on that room. Require the target to actually be
    // inside #calendar first.
    if (!calendarEl || !calendarEl.contains(e.target)) return;
    // A mousedown starting on an existing booking bar is the start of a
    // FullCalendar event drag (move/resize/transfer), not a new group-select
    // sweep - without this check, dragging a booking to another room also
    // armed this tracker's own room-range, incorrectly flagging the transfer
    // as a multi-room group booking. Checking the harness too (not just
    // .fc-event) matters because the event bars are CSS-skewed into a
    // parallelogram - a click near the harness's own padding/edge can land
    // outside the skewed .fc-event shape while still being on the booking.
    if (e.target.closest('.fc-event, .fc-timeline-event-harness')) return;
    // Same Y-position lookup as mousemove below: clicking a date cell in the
    // timeline lands on FullCalendar's decorative background slot layer, which
    // has no data-resource-id of its own, so closest() can't find the room here.
    const roomId = findResourceIdAtY(e.clientY);
    if (!roomId) return;
    // Always start a fresh sweep - a prior gesture that ended without FullCalendar's
    // select event firing (e.g. a plain click with no drag) would otherwise leave a
    // stale room armed, which then gets counted into THIS gesture too.
    resetGroupSelectState();
    groupDragActive = true;
    groupDragAnchorRoomId = roomId;
    document.body.classList.add('calendar-drag-active');
    setArmedRoomRange(roomId, roomId);
  });

  document.addEventListener('mousemove', function(e) {
    if (!groupDragActive) return;
    // Stop the browser's native text/element selection from kicking in mid-drag
    e.preventDefault();
    const roomId = findResourceIdAtY(e.clientY);
    if (roomId) {
      setArmedRoomRange(groupDragAnchorRoomId, roomId);
    }
    syncGroupSelectOverlay();
  });

  document.addEventListener('mouseup', function() {
    if (groupCreateModeActive) {
      groupDragActive = false;
      groupDragAnchorRoomId = null;
      document.body.classList.remove('calendar-drag-active');
      return;
    }
    groupDragActive = false;
    groupDragAnchorRoomId = null;
    document.body.classList.remove('calendar-drag-active');

    if (armedRoomIds.size > 1 && !groupCreateModeActive) {
      syncGroupSelectOverlay();
    }

    // Safety net: if this gesture didn't end in a valid FullCalendar selection
    // (e.g. released outside the grid), its own `select` handler - which normally
    // resets armedRoomIds - never runs, leaving a stale blue-highlighted room stuck
    // until the next drag. `select`, if it does fire, runs synchronously within this
    // same mouseup, so by the time this deferred callback runs it's already been
    // consumed - calling reset again here is just a harmless no-op in that case.
    setTimeout(function() {
      // Keep multi-room selection alive when handing off to the group booking modal.
      if (armedRoomIds.size > 1) return;
      resetGroupSelectState();
    }, 0);
  });
}

function updateGroupSelectBadge() {
  let badge = document.getElementById('group-select-badge');
  const count = armedRoomIds.size;

  // Only surface the badge once the drag has actually turned into a group
  // selection (2+ rooms) - a normal single-room drag shows nothing extra.
  if (count <= 1) {
    if (badge) badge.remove();
    return;
  }

  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'group-select-badge';
    badge.className = 'group-select-badge';
    document.body.appendChild(badge);
  }

  badge.textContent = `${count} rooms selected for this group booking - release to continue.`;
}

function resetGroupSelectState() {
  document.querySelectorAll('.group-select-armed').forEach(el => el.classList.remove('group-select-armed'));
  armedRoomIds.clear();
  groupSelectDateRange = null;
  clearGroupSelectOverlays();
  updateGroupSelectBadge();
}

// =============================================================================
// MANUAL GROUP CREATE MODE (separate feature - does not touch the auto-detected
// single-drag group select above). Toggle it on, pick any rooms across any floors
// one at a time (first pick is a drag that also sets the shared date range, every
// pick after that is just a click on the room's row since the dates are already
// locked in), then hit Proceed to hand the whole set off to the existing group
// booking modal via the same window.openGroupBookingFromCalendar() hook that the
// auto-detected flow already uses.
// =============================================================================

let groupCreateModeActive = false;
const groupCreateSelectedRooms = new Set();
let groupCreateDateRange = null; // { start: Date, end: Date }
let groupCreateOverlays = [];

function clearGroupCreateOverlays() {
  document.querySelectorAll('.group-create-overlay').forEach(function(el) { el.remove(); });
  groupCreateOverlays = [];
}

function renderGroupCreateOverlaysNow() {
  clearGroupCreateOverlays();
  if (!groupCreateModeActive || !groupCreateSelectedRooms.size || !groupCreateDateRange || !calendar) return;

  groupCreateSelectedRooms.forEach(function(id) {
    if (isFloorResourceId(id)) {
      groupCreateSelectedRooms.delete(id);
      const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(String(id))}"]`);
      if (labelCell) labelCell.classList.remove('group-create-armed');
    }
  });
  if (!groupCreateSelectedRooms.size) return;

  const metrics = computeDateRangeMetrics(groupCreateDateRange.start, groupCreateDateRange.end);
  if (!metrics) return;

  groupCreateSelectedRooms.forEach(function(roomId) {
    if (isFloorResourceId(roomId)) return;
    const timeRow = findTimeRowByResourceId(roomId);
    if (!timeRow) return;

    const overlay = appendScrollerContentOverlay(
      'group-create-overlay',
      timeRow,
      metrics.left,
      metrics.width
    );
    if (overlay) groupCreateOverlays.push(overlay);
  });
}

function renderGroupCreateOverlays() {
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      renderGroupCreateOverlaysNow();
    });
  });
}

function updateGroupCreateButtonStates() {
  const toggleBtn = document.querySelector('.fc-groupCreateToggle-button');
  const proceedBtn = document.querySelector('.fc-groupCreateProceed-button');
  if (toggleBtn) {
    toggleBtn.classList.toggle('bed-filter-btn-active', groupCreateModeActive);
    toggleBtn.textContent = groupCreateModeActive ? 'Cancel Group Select' : 'Create Group Booking';
    if (!groupCreateModeActive) {
      toggleBtn.classList.remove('fc-button-active');
      toggleBtn.blur();
    }
  }
  if (proceedBtn) {
    const count = groupCreateSelectedRooms.size;
    const eligible = groupCreateModeActive && count >= 2;
    proceedBtn.classList.toggle('fc-proceed-visible', eligible);
    proceedBtn.disabled = !eligible;
    proceedBtn.textContent = eligible ? `Proceed (${count} rooms)` : 'Proceed';
    if (!eligible) {
      proceedBtn.classList.remove('fc-button-active');
      proceedBtn.blur();
    }
  }
}

function resetGroupCreateState() {
  groupCreateSelectedRooms.clear();
  groupCreateDateRange = null;
  clearGroupCreateOverlays();
  document.querySelectorAll('.group-create-armed').forEach(function(el) {
    el.classList.remove('group-create-armed');
  });
  document.querySelectorAll('.group-create-overlay').forEach(function(el) {
    el.remove();
  });

  groupDragActive = false;
  groupDragAnchorRoomId = null;
  document.body.classList.remove('calendar-drag-active');

  if (calendar && typeof calendar.unselect === 'function') {
    calendar.unselect();
  }

  updateGroupCreateButtonStates();
}

function exitGroupCreateMode() {
  groupCreateModeActive = false;
  resetGroupCreateState();
}

function toggleGroupCreateMode() {
  if (groupCreateModeActive) {
    exitGroupCreateMode();
    return;
  }

  groupCreateModeActive = true;
  // Starting a fresh pick session shouldn't inherit an unrelated in-progress
  // single-drag selection from the other (auto-detected) flow
  resetGroupSelectState();
  updateGroupCreateButtonStates();
}

function toggleGroupCreateRoom(roomId, start, end) {
  const id = String(roomId);
  if (isFloorResourceId(id)) return;

  const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);

  if (groupCreateSelectedRooms.has(id)) {
    groupCreateSelectedRooms.delete(id);
    if (labelCell) labelCell.classList.remove('group-create-armed');
    renderGroupCreateOverlays();
    updateGroupCreateButtonStates();
    return;
  }

  if (!groupCreateDateRange && start && end) {
    groupCreateDateRange = { start: new Date(start), end: new Date(end) };
  }
  if (!groupCreateDateRange) return;

  checkCalendarRoomsAvailability([id], groupCreateDateRange.start, groupCreateDateRange.end)
    .then(function(result) {
      if (result.error) return;
      if (!result.ok) {
        showUnavailableRoomsAlert(
          result.unavailable.map(function(r) { return r.ROOM_NUMBER; }),
          result.missingCount
        );
        return;
      }

      groupCreateSelectedRooms.add(id);
      if (labelCell) labelCell.classList.add('group-create-armed');
      renderGroupCreateOverlays();
      updateGroupCreateButtonStates();
    });
}

// Room-label clicks add/remove rooms 2+ once the date range is already locked in -
// only active while the mode is on, so it never interferes with normal clicks
function attachGroupCreateLabelClicks() {
  document.addEventListener('click', function(e) {
    if (!groupCreateModeActive) return;
    const labelCell = e.target.closest('.fc-datagrid-cell.fc-resource[data-resource-id]:not([data-is-floor])');
    if (!labelCell) return;
    if (!groupCreateDateRange) {
      if (typeof toastr !== 'undefined') {
        toastr.info('Drag across dates on a room first to set the check-in/check-out for the group.');
      }
      return;
    }
    e.preventDefault();
    toggleGroupCreateRoom(labelCell.getAttribute('data-resource-id'));
  });

  window.addEventListener('resize', function() {
    if (groupCreateModeActive && groupCreateSelectedRooms.size) {
      renderGroupCreateOverlays();
    }
  });

  bindGroupOverlayScrollSync();
}

function buildUnavailableRoomsAlertContent(unavailableRoomNumbers, missingCount) {
  const unavailable = (unavailableRoomNumbers || []).map(String).filter(Boolean);
  const missing = Number(missingCount) || 0;
  const parts = [];

  if (unavailable.length === 1) {
    parts.push('Room ' + unavailable[0] + ' is already booked for the selected dates.');
  } else if (unavailable.length > 1) {
    parts.push('These rooms are already booked: ' + unavailable.join(', ') + '.');
  }

  if (missing === 1) {
    parts.push('1 selected room no longer exists.');
  } else if (missing > 1) {
    parts.push(missing + ' selected rooms no longer exist.');
  }

  const issueCount = unavailable.length + missing;
  let title;

  if (issueCount === 1 && unavailable.length === 1) {
    title = 'Room ' + unavailable[0] + ' is unavailable';
  } else if (issueCount === 1) {
    title = 'Selected room is unavailable';
  } else {
    title = issueCount + ' selected rooms are unavailable';
  }

  return {
    title: title,
    text: parts.join(' ') || title
  };
}

function showUnavailableRoomsAlert(unavailableRoomNumbers, missingCount) {
  const alertContent = buildUnavailableRoomsAlertContent(unavailableRoomNumbers, missingCount);

  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title: alertContent.title,
      text: alertContent.text,
      icon: 'warning',
      confirmButtonText: 'OK',
      background: '#2a3135',
      color: '#ffffff'
    });
  }

  alert(alertContent.text || alertContent.title);
  return Promise.resolve();
}

function removeRoomsFromGroupSelect(roomIdsToRemove) {
  (roomIdsToRemove || []).forEach(function(id) {
    const rid = String(id);
    if (!armedRoomIds.has(rid)) return;
    armedRoomIds.delete(rid);
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(rid)}"]`);
    if (labelCell) labelCell.classList.remove('group-select-armed');
  });
  syncGroupSelectOverlay();
  updateGroupSelectBadge();
}

function removeRoomsFromGroupCreate(roomIdsToRemove) {
  (roomIdsToRemove || []).forEach(function(id) {
    const rid = String(id);
    if (!groupCreateSelectedRooms.has(rid)) return;
    groupCreateSelectedRooms.delete(rid);
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(rid)}"]`);
    if (labelCell) labelCell.classList.remove('group-create-armed');
  });
  renderGroupCreateOverlays();
  updateGroupCreateButtonStates();
}

function getUnavailableSelectionIds(result, requestedRoomIds) {
  const removeSet = new Set();
  (result.unavailable || []).forEach(function(r) { removeSet.add(String(r.IDNo)); });
  (result.missingIds || []).forEach(function(id) { removeSet.add(String(id)); });
  return (requestedRoomIds || []).map(String).filter(function(id) { return removeSet.has(id); });
}

function getAvailableSelectionIds(result, requestedRoomIds) {
  if (result.availableIds && result.availableIds.length) {
    return result.availableIds.map(String);
  }
  const removeSet = new Set(getUnavailableSelectionIds(result, requestedRoomIds));
  return (requestedRoomIds || []).map(String).filter(function(id) { return !removeSet.has(id); });
}

function applyCalendarGroupBookingRoomIds(roomIds, startDate, endDate) {
  const allowed = (roomIds || []).map(String);
  const start = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
  const end = endDate instanceof Date ? new Date(endDate) : new Date(endDate);

  if (groupCreateModeActive) {
    document.querySelectorAll('.group-create-armed').forEach(function(el) {
      el.classList.remove('group-create-armed');
    });
    groupCreateSelectedRooms.clear();
    allowed.forEach(function(id) {
      groupCreateSelectedRooms.add(id);
      const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);
      if (labelCell) labelCell.classList.add('group-create-armed');
    });
    groupCreateDateRange = { start: start, end: end };
    renderGroupCreateOverlays();
    updateGroupCreateButtonStates();
    return;
  }

  document.querySelectorAll('.group-select-armed').forEach(function(el) {
    el.classList.remove('group-select-armed');
  });
  armedRoomIds.clear();
  allowed.forEach(function(id) {
    armedRoomIds.add(id);
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(id)}"]`);
    if (labelCell) labelCell.classList.add('group-select-armed');
  });
  groupSelectDateRange = { start: start, end: end };
  syncGroupSelectOverlay();
  updateGroupSelectBadge();
}

function saveCalendarGroupBookingSnapshot(roomIds, startDate, endDate) {
  calendarGroupBookingSnapshot = {
    roomIds: (roomIds || []).map(String),
    start: startDate instanceof Date ? new Date(startDate) : new Date(startDate),
    end: endDate instanceof Date ? new Date(endDate) : new Date(endDate),
    fromGroupCreate: groupCreateModeActive
  };
}

function restoreCalendarSelectionFromSnapshot() {
  if (!calendarGroupBookingSnapshot) {
    return syncCalendarSelectionToAvailableOnly().then(function() {
      restoreCalendarGroupSelectionVisuals();
    });
  }

  const snap = calendarGroupBookingSnapshot;
  return checkCalendarRoomsAvailability(snap.roomIds, snap.start, snap.end).then(function(result) {
    if (result.error) {
      restoreCalendarGroupSelectionVisuals();
      return;
    }

    const availableIds = getAvailableSelectionIds(result, snap.roomIds);
    if (!availableIds.length) {
      calendarGroupBookingSnapshot = null;
      resetCalendarGroupSelection();
      return;
    }

    calendarGroupBookingSnapshot = {
      roomIds: availableIds,
      start: snap.start,
      end: snap.end,
      fromGroupCreate: snap.fromGroupCreate
    };

    if (snap.fromGroupCreate) {
      groupCreateModeActive = true;
    }

    applyCalendarGroupBookingRoomIds(availableIds, snap.start, snap.end);

    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (snap.fromGroupCreate) {
          renderGroupCreateOverlays();
          updateGroupCreateButtonStates();
        } else {
          syncGroupSelectOverlay();
          updateGroupSelectBadge();
        }
      });
    });
  });
}

function openGroupBookingModalForCalendarSelection(roomIds, startDate, endDate) {
  saveCalendarGroupBookingSnapshot(roomIds, startDate, endDate);
  applyCalendarGroupBookingRoomIds(roomIds, startDate, endDate);
  if (typeof window.openGroupBookingFromCalendar === 'function') {
    window.openGroupBookingFromCalendar(roomIds, startDate, endDate);
  }
}

function syncCalendarSelectionToAvailableOnly() {
  return new Promise(function(resolve) {
    if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
      const roomIds = Array.from(groupCreateSelectedRooms);
      checkCalendarRoomsAvailability(roomIds, groupCreateDateRange.start, groupCreateDateRange.end)
        .then(function(result) {
          if (!result.error) {
            removeRoomsFromGroupCreate(getUnavailableSelectionIds(result, roomIds));
          }
          resolve();
        });
      return;
    }

    if (armedRoomIds.size > 0 && groupSelectDateRange) {
      const roomIds = Array.from(armedRoomIds);
      checkCalendarRoomsAvailability(roomIds, groupSelectDateRange.start, groupSelectDateRange.end)
        .then(function(result) {
          if (!result.error) {
            removeRoomsFromGroupSelect(getUnavailableSelectionIds(result, roomIds));
          }
          resolve();
        });
      return;
    }

    resolve();
  });
}

function handleGroupSelectAvailabilityResult(result, requestedRoomIds, startDate, endDate) {
  if (result.error) return;

  if (result.ok) {
    openGroupBookingModalForCalendarSelection(requestedRoomIds, startDate, endDate);
    return;
  }

  const removeIds = getUnavailableSelectionIds(result, requestedRoomIds);
  const availableIds = getAvailableSelectionIds(result, requestedRoomIds);

  showUnavailableRoomsAlert(
    result.unavailable.map(function(r) { return r.ROOM_NUMBER; }),
    result.missingCount
  ).then(function() {
    removeRoomsFromGroupSelect(removeIds);

    if (availableIds.length >= 2) {
      openGroupBookingModalForCalendarSelection(availableIds, startDate, endDate);
    } else if (availableIds.length === 1 && typeof toastr !== 'undefined') {
      toastr.info('Only 1 available room remains. Pick another room to continue the group booking.');
    } else if (!availableIds.length) {
      resetGroupSelectState();
    }
  });
}

function handleGroupCreateAvailabilityResult(result, requestedRoomIds, startDate, endDate) {
  if (result.error) return;

  if (result.ok) {
    openGroupBookingModalForCalendarSelection(requestedRoomIds, startDate, endDate);
    return;
  }

  const removeIds = getUnavailableSelectionIds(result, requestedRoomIds);
  const availableIds = getAvailableSelectionIds(result, requestedRoomIds);

  showUnavailableRoomsAlert(
    result.unavailable.map(function(r) { return r.ROOM_NUMBER; }),
    result.missingCount
  ).then(function() {
    removeRoomsFromGroupCreate(removeIds);

    if (availableIds.length >= 2) {
      openGroupBookingModalForCalendarSelection(availableIds, startDate, endDate);
    } else if (availableIds.length === 1 && typeof toastr !== 'undefined') {
      toastr.info('Only 1 available room remains. Pick another room to continue the group booking.');
    }
  });
}

function checkCalendarRoomsAvailability(roomIds, startDate, endDate) {
  return new Promise(function(resolve) {
    const parsedIds = (roomIds || [])
      .map(function(id) { return parseInt(id, 10); })
      .filter(function(id) { return !Number.isNaN(id); });

    if (!parsedIds.length || !startDate || !endDate) {
      resolve({ ok: true, unavailable: [], missingCount: 0 });
      return;
    }

    $.ajax({
      url: '/booking/check_rooms_availability',
      type: 'POST',
      data: {
        roomIds: parsedIds,
        startDate: startDate instanceof Date ? startDate.toISOString() : startDate,
        endDate: endDate instanceof Date ? endDate.toISOString() : endDate
      },
      success: function(response) {
        if (!response.success) {
          if (typeof Swal !== 'undefined') {
            Swal.fire('Error', response.message || 'Could not check room availability.', 'error');
          }
          resolve({ ok: false, error: true });
          return;
        }

        const rooms = response.data.rooms || [];
        const unavailable = rooms.filter(function(r) { return !r.isAvailable; });
        const foundIds = rooms.map(function(r) { return r.IDNo; });
        const missingCount = parsedIds.filter(function(id) {
          return foundIds.indexOf(id) === -1;
        }).length;

        resolve({
          ok: unavailable.length === 0 && missingCount === 0,
          unavailable: unavailable,
          available: rooms.filter(function(r) { return r.isAvailable; }),
          availableIds: rooms.filter(function(r) { return r.isAvailable; }).map(function(r) { return String(r.IDNo); }),
          missingIds: parsedIds.filter(function(id) { return foundIds.indexOf(id) === -1; }).map(String),
          missingCount: missingCount
        });
      },
      error: function() {
        if (typeof Swal !== 'undefined') {
          Swal.fire('Error', 'Failed to check room availability. Please try again.', 'error');
        }
        resolve({ ok: false, error: true });
      }
    });
  });
}

function proceedWithGroupCreate() {
  if (groupCreateSelectedRooms.size < 2 || !groupCreateDateRange) return;
  const roomIds = Array.from(groupCreateSelectedRooms);
  const start = groupCreateDateRange.start;
  const end = groupCreateDateRange.end;

  checkCalendarRoomsAvailability(roomIds, start, end).then(function(result) {
    handleGroupCreateAvailabilityResult(result, roomIds, start, end);
  });
}

function restoreCalendarGroupSelectionVisuals() {
  groupCreateSelectedRooms.forEach(function(roomId) {
    if (isFloorResourceId(roomId)) return;
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(String(roomId))}"]`);
    if (labelCell) labelCell.classList.add('group-create-armed');
  });

  armedRoomIds.forEach(function(id) {
    if (isFloorResourceId(id)) return;
    const labelCell = document.querySelector(`.fc-datagrid-cell.fc-resource[data-resource-id="${CSS.escape(String(id))}"]`);
    if (labelCell) labelCell.classList.add('group-select-armed');
  });

  if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
    renderGroupCreateOverlays();
  } else if (armedRoomIds.size >= 1 && groupSelectDateRange) {
    syncGroupSelectOverlay();
  }

  updateGroupCreateButtonStates();
  updateGroupSelectBadge();
}

function resetCalendarGroupSelection() {
  calendarGroupBookingSnapshot = null;

  if (calendar && typeof calendar.unselect === 'function') {
    calendar.unselect();
  }

  groupCreateModeActive = false;
  groupCreateSelectedRooms.clear();
  groupCreateDateRange = null;
  clearGroupCreateOverlays();
  document.querySelectorAll('.group-create-armed').forEach(function(el) {
    el.classList.remove('group-create-armed');
  });

  armedRoomIds.clear();
  groupSelectDateRange = null;
  clearGroupSelectOverlays();
  document.querySelectorAll('.group-select-armed').forEach(function(el) {
    el.classList.remove('group-select-armed');
  });

  document.querySelectorAll('.group-create-overlay, .group-select-overlay').forEach(function(el) {
    el.remove();
  });

  const overlayLayer = document.querySelector('#calendar .calendar-group-overlay-layer');
  if (overlayLayer) overlayLayer.innerHTML = '';

  if (typeof window.clearGroupBookingCalendarHandoff === 'function') {
    window.clearGroupBookingCalendarHandoff();
  }

  updateGroupCreateButtonStates();
  updateGroupSelectBadge();
}

function attachGroupBookingModalHandlers() {
  const modal = document.getElementById('modal-add-group-booking');
  if (!modal || modal.dataset.calendarSelectionHandlerBound) return;
  modal.dataset.calendarSelectionHandlerBound = '1';

  modal.addEventListener('hidden.bs.modal', function() {
    window.__groupBookingSavedFromCalendar = false;
    resetCalendarGroupSelection();
  });
}

// =============================================================================
// CUSTOM BUTTONS
// =============================================================================

const customButtons = {
  customToday: {
    text: 'Today',
    click: function() {
      const today = new Date();
      calendar.gotoDate(today);
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToToday(sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },

  customMonth: {
    text: 'month',
    click: function() {
      // 1. compute “today” at midnight
      const today = new Date();
      today.setHours(0,0,0,0);

      // 2. jump the calendar to THIS month on today
      calendar.changeView('month', today);

      // 3. let FC re‐render, then sync & scroll
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToToday(sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },
  
  dayPrev: {
    text: '<',
    click: function() {
      const currentDate = calendar.getDate();
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);
      calendar.gotoDate(newDate);
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToDate(newDate, sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },
  
  dayNext: {
    text: '>',
    click: function() {
      const currentDate = calendar.getDate();
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);
      calendar.gotoDate(newDate);
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToDate(newDate, sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },
  

  customPrev: {
    text: 'prev',
    click: function() {
      const current = calendar.getDate();
      let newDate = new Date(current);
  
      if (calendar.view.type === 'month') {
        newDate.setDate(newDate.getDate() - 14);
        calendar.gotoDate(newDate);
      } else {
        calendar.prev();
        newDate = calendar.getDate();
      }
  
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToDate(newDate, sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },
  
  customNext: {
    text: 'next',
    click: function() {
      const current = calendar.getDate();
      let newDate = new Date(current);
  
      if (calendar.view.type === 'month') {
        newDate.setDate(newDate.getDate() + 14);
        calendar.gotoDate(newDate);
      } else {
        calendar.next();
        newDate = calendar.getDate();
      }
  
      setTimeout(() => {
        const sb = setupScrollbar();
        if (sb) {
          scrollToDate(newDate, sb.bodyScroller, sb.top);
          updateHeaderOnScroll(sb.bodyScroller, sb.top);
        }
      }, 0);
    }
  },
  

  customFullscreen: {
    text: 'Full Screen',
    click: toggleFullScreen
  },

  searchBox: {
    text: 'Search',
    click: function() {
      toggleSearchBox();
    }
  },

  bed1Filter: {
    text: 'K',
    click: function() {
      toggleBedFilter('1');
    }
  },

  bed2Filter: {
    text: 'Q',
    click: function() {
      toggleBedFilter('2');
    }
  },

  groupCreateToggle: {
    text: 'Create Group Booking',
    click: function() {
      toggleGroupCreateMode();
    }
  },

  groupCreateProceed: {
    text: 'Proceed',
    click: function() {
      proceedWithGroupCreate();
    }
  }
};


// =============================================================================
// VIEW CONFIGURATIONS
// =============================================================================

// ---- Date bookmarks (click a date header to keep its column highlighted) ------
const CALENDAR_BOOKMARK_KEY = 'calendarBookmarkedDates';

function dateKeyOf(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadBookmarkedDates() {
  try {
    const raw = localStorage.getItem(CALENDAR_BOOKMARK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

let calendarBookmarkedDates = loadBookmarkedDates();
window.calendarBookmarkedDates = calendarBookmarkedDates;

function saveBookmarkedDates() {
  try {
    localStorage.setItem(CALENDAR_BOOKMARK_KEY, JSON.stringify([...calendarBookmarkedDates]));
  } catch (e) {}
}

// Toggle both the header slot and every body lane cell for that day, and keep the
// set so re-renders (scroll / view change) restore it via getDayClassNames().
function applyDateBookmarks() {
  document.querySelectorAll('#calendar .fc-timeline-slot[data-date]').forEach((slot) => {
    const key = String(slot.getAttribute('data-date')).slice(0, 10);
    slot.classList.toggle('date-bookmarked', calendarBookmarkedDates.has(key));
  });
}
window.applyDateBookmarks = applyDateBookmarks;

function toggleDateBookmark(dateInput) {
  const key = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)
    ? dateInput.slice(0, 10)
    : dateKeyOf(dateInput);
  if (calendarBookmarkedDates.has(key)) {
    calendarBookmarkedDates.delete(key);
  } else {
    calendarBookmarkedDates.add(key);
  }
  saveBookmarkedDates();
  applyDateBookmarks();
}
window.toggleDateBookmark = toggleDateBookmark;

// One delegated click listener on the timeline header - a click on a date label
// toggles that day's bookmark column.
function setupDateBookmarks() {
  const container = calendarEl || document.getElementById('calendar');
  if (!container || container.dataset.dateBookmarksBound === '1') return;
  container.dataset.dateBookmarksBound = '1';

  container.addEventListener('click', (e) => {
    const header = e.target.closest('.fc-timeline-header');
    if (!header) return;
    const slot = e.target.closest('[data-date]');
    if (!slot || !header.contains(slot)) return;
    e.preventDefault();
    e.stopPropagation();
    toggleDateBookmark(slot.getAttribute('data-date'));
  }, true);
}
window.setupDateBookmarks = setupDateBookmarks;

function getDayClassNames(date) {
  const classes = [];
  const day = date.getDay();
  const today = new Date();

  if (calendarBookmarkedDates.has(dateKeyOf(date))) {
    classes.push('date-bookmarked');
  }

  // Highlight today
  if (date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()) {
    classes.push('current-day');
  }

  // Weekend/weekday highlights
  const dayClasses = {
    0: 'sunday-border',
    1: 'monday-border',
    2: 'tuesday-border',
    4: 'thursday-border',
    5: 'friday-border',
    6: 'saturday-border'
  };
  
  if (dayClasses[day]) {
    classes.push(dayClasses[day]);
  }

  return classes;
}

const views = {
  week: {
    type: 'resourceTimeline',
    duration: { days: 14 },
    dateIncrement: { days: 3 },
    dateAlignment: 'day',
    slotDuration: { hours: 12 },

    // custom vertical label for BOTH rows (minor is hidden via CSS)
    slotLabelContent(arg) {
      const d = arg.date;
      const dayNum = d.getDate();
      const dow = d.toLocaleDateString('en-US', { weekday: 'short' })
                    .slice(0,3).toUpperCase();
      return {
        html: `<span class="dow">${dow}</span><br><span class="day">${dayNum}</span>`
      };
    },

    slotLaneClassNames(arg) {
      return getDayClassNames(arg.date);
    },
    slotLabelClassNames(arg) {
      return getDayClassNames(arg.date);
    }
  },

  month: {
    type: 'resourceTimeline',
    slotDuration: { hours: 12 },
    dateAlignment: 'day',
    visibleRange() {
      // Starts small (calendarWindowMonthsBack/Forward) and grows via expandCalendarRange()
      // as the user scrolls near an edge — see the LAZY-LOADED CALENDAR RANGE block above.
      const today = new Date();
      const Y = today.getFullYear(), M = today.getMonth();
      return {
        start: new Date(Y, M - calendarWindowMonthsBack, 1),
        end: new Date(Y, M + calendarWindowMonthsForward, 1)
      };
    },

    slotLabelContent(arg) {
      const d = arg.date;
      const dayNum = d.getDate();
      const dow = d.toLocaleDateString('en-US', { weekday: 'short' })
                    .slice(0,3).toUpperCase();
      return {
        html: `<span class="dow">${dow}</span><br><span class="day">${dayNum}</span>`
      };
    },
    

    slotLaneClassNames(arg) {
      const classes = getDayClassNames(arg.date);
      const lastDay = new Date(arg.date.getFullYear(), arg.date.getMonth() + 1, 0).getDate();
      if (arg.date.getDate() === lastDay) classes.push('month-separator-end');
      return classes;
    },
    slotLabelClassNames(arg) {
      const classes = getDayClassNames(arg.date);
      const lastDay = new Date(arg.date.getFullYear(), arg.date.getMonth() + 1, 0).getDate();
      if (arg.date.getDate() === lastDay) classes.push('month-separator-end');
      return classes;
    }
  }
};


// =============================================================================
// DATA PROCESSING FUNCTIONS
// =============================================================================

function processRoomsData(roomsData) {
  const floors = {};
  
  roomsData.forEach(room => {
    const floorName = `Floor ${room.ROOM_FLOOR}`;
    if (!floors[floorName]) {
      floors[floorName] = {
        id: `floor_${room.ROOM_FLOOR}`,
        title: floorName,
        extendedProps: { isFloor: true },
        children: []
      };
    }
    
    const roomObj = {
      id: String(room.RoomID),
      title: `${room.ROOM_NUMBER}`.trim(),
      roomNumber: room.ROOM_NUMBER,
      bedCount: room.ROOM_BED,
      roomView: parseInt(room.ROOM_VIEW, 10) || null
    };
    floors[floorName].children.push(roomObj);
  });

  // Sort floors and rooms
  const sortedFloors = Object.values(floors).sort((a, b) =>
    Number(a.id.match(/\d+/)) - Number(b.id.match(/\d+/))
  );
  
  sortedFloors.forEach(floor => {
    floor.children.sort((a, b) => {
      const numA = parseInt(String(a.roomNumber).replace(/[^\d]/g, ''), 10);
      const numB = parseInt(String(b.roomNumber).replace(/[^\d]/g, ''), 10);
      return numA - numB;
    });
  });

  return sortedFloors;
}

function buildCalendarRoomLabel(arg) {
  const bedCount = parseInt(
    arg.resource.extendedProps?.bedCount ?? arg.resource.bedCount,
    10
  );

  const wrap = document.createElement('div');
  wrap.className = 'calendar-room-label';

  if (bedCount === 1 || bedCount === 2) {
    const beds = document.createElement('span');
    beds.className = 'calendar-room-beds';
    beds.setAttribute('aria-label', bedCount === 1 ? 'King Bedroom' : 'Queen Bedroom');
    for (let i = 0; i < bedCount; i++) {
      const icon = document.createElement('i');
      icon.className = 'fa fa-bed calendar-bed-icon';
      icon.setAttribute('aria-hidden', 'true');
      beds.appendChild(icon);
    }
    wrap.appendChild(beds);
  }

  const num = document.createElement('span');
  num.className = 'calendar-room-number';
  num.textContent = arg.resource.title;
  wrap.appendChild(num);

  return { domNodes: [wrap] };
}

// NOTE: processBookingsData() has been removed - backend now handles all data processing
// getBookingColor() is still available globally via window.getBookingColor

// =============================================================================
// SCROLL TO DATE FUNCTIONALITY - REMOVED
// =============================================================================

function setupScrollToDate() {
  // This function is now empty as the click-to-scroll functionality has been removed
  // The function is kept for compatibility but does nothing
}

// =============================================================================
// LOADING STATE MANAGEMENT
// =============================================================================

function showLoading() {
  // Loading functionality removed for faster performance
}

function hideLoading() {
  // Loading functionality removed for faster performance
}

// =============================================================================
// DATA LOADING
// =============================================================================

// Removes the hlRoomId/hlStart/hlEnd/hlColor incoming-highlight params from
// the URL and localStorage once they've been consumed, so they can't keep
// silently overriding whatever the user drags on that room afterward.
function clearIncomingHighlightParams() {
  try {
    const url = new URL(window.location.href);
    ['hlRoomId', 'hlStart', 'hlEnd', 'hlColor'].forEach(function(key) {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, '', url.toString());
  } catch (e) { /* no-op */ }
  try { localStorage.removeItem('calendarHighlight'); } catch (e) { /* no-op */ }
}

// Highlight incoming selection from navbar → calendar (via URL/localStorage)
function applyIncomingHighlight() {
  if (!calendar) return;

  // 1) Read from URL params
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get('hlRoomId');
  let startStr = params.get('hlStart');
  let endStr = params.get('hlEnd');
  let colorParam = params.get('hlColor'); // optional custom color, e.g. #000000 or rgba()

  // 2) Fallback to localStorage
  if (!roomId || !startStr || !endStr) {
    try {
      const cached = localStorage.getItem('calendarHighlight');
      if (cached) {
        const obj = JSON.parse(cached);
        roomId = roomId || obj.roomId;
        startStr = startStr || obj.start;
        endStr = endStr || obj.end;
        if (!colorParam && obj.color) colorParam = obj.color;
      }
    } catch (e) { /* no-op */ }
  }

  if (!roomId || !startStr || !endStr) return; // nothing to do

  // Parse dates; accept "MMM d, yyyy" or "yyyy-mm-dd"
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

  // Align with booking logic: Check-in 6:00 AM, Check-out 6:00 PM
  const startAt = new Date(startDate);
  startAt.setHours(6, 0, 0, 0);
  const endAt = new Date(endDate);
  endAt.setHours(18, 0, 0, 0);

  // Ensure resource exists
  const resource = (typeof calendar.getResourceById === 'function')
    ? calendar.getResourceById(String(roomId))
    : (calendar.getResources() || []).find(r => String(r.id) === String(roomId));
  if (!resource) return;

  // Jump calendar to start date
  try { calendar.gotoDate(startDate); } catch (e) {}

  // Resolve highlight color (priority: URL param > persisted > default)
  let highlightColor = colorParam || null;
  if (!highlightColor) {
    try {
      const persisted = localStorage.getItem('calendarHighlightColor');
      if (persisted) highlightColor = persisted;
    } catch (e) { /* no-op */ }
  }
  if (!highlightColor) highlightColor = 'rgba(255, 255, 255, 1)';

  // Ensure custom highlight CSS is injected/updated
  try { ensureHighlightStyles(highlightColor); } catch (e) { /* no-op */ }

  // Add background highlight event
  try {
    const evt = calendar.addEvent({
      id: 'temp-highlight-' + Date.now(),
      start: startAt,
      end: endAt,
      resourceIds: [String(roomId)],
      display: 'background',
      backgroundColor: highlightColor, // backup for older themes
      classNames: ['calendar-temp-highlight']
    });
    // After render, toggle pulse class to force animation
    setTimeout(() => {
      const nodes = calendarEl.querySelectorAll('.fc-bg-event.calendar-temp-highlight');
      nodes.forEach(node => {
        node.classList.remove('calendar-temp-highlight-pulse');
        // Force reflow to restart CSS animation
        void node.offsetWidth;
        node.classList.add('calendar-temp-highlight-pulse');
      });
    }, 30);
  } catch (e) { /* no-op */ }

  // Scroll horizontally to the center of the highlighted range
  try {
    const midMs = (startDate.getTime() + endDate.getTime()) / 2;
    const midDate = new Date(midMs);
    // defer until after DOM paints to ensure accurate widths
    setTimeout(() => {
      const sb = setupScrollbar();
      if (sb) {
        scrollToDateCentered(midDate, sb.bodyScroller, sb.top);
        updateHeaderOnScroll(sb.bodyScroller, sb.top);
      }
      // also center vertically using the actual highlight background element if present,
      // fallback to centering the resource row
      setTimeout(() => {
        const sel = `.fc-bg-event.calendar-temp-highlight`;
        const bgEl = document.querySelector(sel);
        if (bgEl) {
          centerElementVerticallyInScroller(bgEl);
          // Create a temporary overlay pulse on top of the exact screen bounds
          try {
            const r = bgEl.getBoundingClientRect();
            const overlay = document.createElement('div');
            overlay.className = 'calendar-highlight-overlay-pulse';
            // match booking bar skew from calendar.css (.fc-event has skew -18deg)
            // compute extra width to compensate so tips are not cropped
            const skewDeg = 18; // keep in sync with CSS
            const skewRad = skewDeg * Math.PI / 180;
            const extra = Math.tan(skewRad) * (r.height / 2);
            const pad = 6; // border/blur breathing room
            const left = r.left - extra - pad;
            const width = r.width + extra * 2 + pad * 2;
            const top = r.top - pad;
            const height = r.height + pad * 2;
            overlay.style.left = Math.max(0, left) + 'px';
            overlay.style.top = Math.max(0, top) + 'px';
            overlay.style.width = Math.max(0, width) + 'px';
            overlay.style.height = Math.max(0, height) + 'px';
            overlay.style.transform = 'skew(-18deg)';
            // inner white fill to mimic event highlight interior
            const fill = document.createElement('div');
            fill.style.position = 'absolute';
            fill.style.inset = '3px';
            fill.style.background = 'rgba(255,255,255,0.08)';
            fill.style.pointerEvents = 'none';
            overlay.appendChild(fill);
            document.body.appendChild(overlay);
            setTimeout(() => overlay.remove(), 6200);
          } catch (e) { /* no-op */ }
        } else {
          centerResourceRow(String(roomId));
        }
      }, 60);
    }, 20);
  } catch (e) { /* no-op */ }

  // Clear one-time highlight
  try { localStorage.removeItem('calendarHighlight'); } catch (e) { /* no-op */ }
}

// Inject or update CSS to force background for bg-events with our class
function ensureHighlightStyles(color) {
  let style = document.getElementById('calendar-highlight-styles');
  const content = `
    /* Highlight color for background events we add */
    .fc .fc-bg-event.calendar-temp-highlight {
      background: ${color} !important;
      opacity: 1 !important;
      border-radius: 6px;
      box-shadow: 0 0 0 2px rgba(255, 255, 0, 0.6) inset, 0 0 10px rgba(255, 255, 0, 0.5);
      position: relative;
      z-index: 1;
    }
    /* Some themes wrap the bg element one level deeper */
    .calendar-temp-highlight .fc-bg-event {
      background: ${color} !important;
      opacity: 1 !important;
      border-radius: 6px;
      box-shadow: 0 0 0 2px rgba(255, 255, 0, 0.6) inset, 0 0 10px rgba(255, 255, 0, 0.5);
      position: relative;
      z-index: 1;
    }

    /* Dedicated pulse class so we can retrigger via JS */
    .calendar-temp-highlight-pulse {
      animation: calendarHighlightPulse 1500ms ease-out 6;
    }

    /* Visible pulse ring even on white background */
    .calendar-temp-highlight-pulse::after {
      content: "";
      position: absolute;
      left: -3px; right: -3px; top: -3px; bottom: -3px;
      border-radius: 0;
      pointer-events: none;
      border: 3px solid rgba(0, 184, 255, 0.95);
      box-shadow: 0 0 12px rgba(0, 184, 255, 0.7);
      animation: calendarHighlightPulseRing 1500ms ease-out 6;
      /* Keep rectangular to avoid cropping; overlay handles parallelogram */
    }

    /* Full overlay pulse for cases where bg elements are visually masked */
    .calendar-highlight-overlay-pulse {
      position: fixed;
      pointer-events: none;
      /* Keep below Bootstrap modal backdrop (1040) so it doesn't show over modals */
      z-index: 1000;
      border-radius: 0;
      border: 3px solid rgba(0, 184, 255, 0.95);
      box-shadow: 0 0 8px rgba(0, 184, 255, 0.6);
      animation: calendarHighlightPulseRing 1500ms ease-out 6;
      mix-blend-mode: normal;
      transform-origin: center;
      will-change: transform;
    }

    @keyframes calendarHighlightPulse {
      0%   { box-shadow: 0 0 0 2px rgba(255, 255, 0, 0.8) inset, 0 0 0 rgba(255, 255, 0, 0.0); }
      50%  { box-shadow: 0 0 0 6px rgba(255, 255, 0, 0.0) inset, 0 0 18px rgba(255, 255, 0, 0.9); }
      100% { box-shadow: 0 0 0 2px rgba(255, 255, 0, 0.0) inset, 0 0 0 rgba(255, 255, 0, 0.0); }
    }

    @keyframes calendarHighlightPulseRing {
      0%   { transform: scale(0.98); opacity: 0.0; }
      30%  { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.02); opacity: 0; }
    }
  `;
  if (style) {
    style.textContent = content;
    return;
  }
  style = document.createElement('style');
  style.id = 'calendar-highlight-styles';
  style.textContent = content;
  document.head.appendChild(style);
}

const CALENDAR_DATE_BUFFER_DAYS = 14;
let calendarBookingsFetchToken = 0;
let lastFetchedRangeKey = null;
let calendarBookingsReloadTimer = null;

function formatCalendarDateParam(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultCalendarDateRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  return {
    start: new Date(year, month - calendarWindowMonthsBack, 1),
    end: new Date(year, month + calendarWindowMonthsForward, 1)
  };
}

function getCalendarVisibleDateRange() {
  if (calendar && calendar.view) {
    return {
      start: calendar.view.activeStart,
      end: calendar.view.activeEnd
    };
  }
  return getDefaultCalendarDateRange();
}

function getCalendarFetchDateRange() {
  const { start, end } = getCalendarVisibleDateRange();
  const bufferedStart = new Date(start);
  bufferedStart.setDate(bufferedStart.getDate() - CALENDAR_DATE_BUFFER_DAYS);
  const bufferedEnd = new Date(end);
  bufferedEnd.setDate(bufferedEnd.getDate() + CALENDAR_DATE_BUFFER_DAYS);
  return {
    start: formatCalendarDateParam(bufferedStart),
    end: formatCalendarDateParam(bufferedEnd)
  };
}

function getCalendarFetchRangeKey(dateRange) {
  const range = dateRange || getCalendarFetchDateRange();
  return `${range.start}|${range.end}`;
}

function buildOptimizedBookingsUrl(dateRange) {
  const range = dateRange || getCalendarFetchDateRange();
  const params = new URLSearchParams({
    start: range.start,
    end: range.end,
    _: String(Date.now())
  });
  return `/calendar/api/bookings/optimized?${params.toString()}`;
}

async function fetchCalendarBookings(dateRange) {
  const range = dateRange || getCalendarFetchDateRange();
  const fetchToken = ++calendarBookingsFetchToken;
  const response = await fetch(buildOptimizedBookingsUrl(range));
  if (!response.ok) {
    throw new Error(`Bookings API error: ${response.status}`);
  }
  const bookingsData = await response.json();
  if (fetchToken !== calendarBookingsFetchToken) {
    return null;
  }
  lastFetchedRangeKey = getCalendarFetchRangeKey(range);
  return Array.isArray(bookingsData) ? bookingsData : [];
}

function applyCalendarBookings(events) {
  if (!calendar) return;
  window.allCalendarEvents = events;
  calendar.removeAllEvents();
  calendar.addEventSource(events);
  if (typeof updateLegendCounts === 'function') {
    // Counts must refresh after bulk source replace — eventAdd may not fire for every event
    setTimeout(() => updateLegendCounts(), 0);
  }
}

async function reloadCalendarBookingsForVisibleRange() {
  const rangeKey = getCalendarFetchRangeKey();
  if (rangeKey === lastFetchedRangeKey) return;

  clearTimeout(calendarBookingsReloadTimer);
  calendarBookingsReloadTimer = setTimeout(async () => {
    const currentKey = getCalendarFetchRangeKey();
    if (currentKey === lastFetchedRangeKey) return;

    try {
      const events = await fetchCalendarBookings();
      if (!events) return;
      applyCalendarBookings(events);
      if (typeof applyBedFilter === 'function') {
        applyBedFilter();
      }
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
        renderGroupCreateOverlays();
      }
    } catch (error) {
      console.error('❌ Calendar bookings reload failed:', error);
    }
  }, 150);
}

async function loadCalendarData() {
  const dataStartTime = Date.now();
  
  try {
    const dateRange = getCalendarFetchDateRange();

    const [roomsResponse, bookingsData] = await Promise.all([
      fetch('/calendar/rooms').then(res => {
        if (!res.ok) throw new Error(`Rooms API error: ${res.status}`);
        return res.json();
      }),
      fetchCalendarBookings(dateRange)
    ]);

    if (!bookingsData) return;

    const roomsData = Array.isArray(roomsResponse) ? roomsResponse : [];
    const sortedFloors = processRoomsData(roomsData);
    const events = bookingsData;

    window.allCalendarFloors = sortedFloors;
    window.allCalendarEvents = events;

    const renderStart = Date.now();

    calendar.getResources().forEach(resource => resource.remove());
    calendar.setOption('resources', sortedFloors);
    applyCalendarBookings(events);

    // Render first paints at scrollLeft 0 (the start of the visible window,
    // e.g. last month) before scrollToToday() below corrects it. The
    // .calendar-not-ready CSS class (on by default in the HTML, see
    // calendar.ejs/calendar.css) is already hiding the grid across that gap -
    // re-adding it here too covers reloads of this function after the page's
    // very first paint.
    if (calendarEl) calendarEl.classList.add('calendar-not-ready');
    calendar.render();
    applyBedFilter();
    if (typeof updateLegendCounts === 'function') {
      updateLegendCounts();
    } else if (typeof updateRoomViewLegendCounts === 'function') {
      updateRoomViewLegendCounts();
    }
    if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
      renderGroupCreateOverlays();
    }

    const renderTime = Date.now() - renderStart;

    // Setup UI enhancements. FullCalendar's initial mount can still be
    // finishing its internal DOM build a frame or two after render()
    // returns, so the .fc-scroller elements setupScrollbar() looks for may
    // not exist yet on the very first check - retry across a few frames
    // instead of revealing at the wrong (unscrolled) position when that
    // happens.
    //
    // A single correction wasn't enough to stop the "last month" flash even
    // with the reveal gated on it, which points to something AFTER that
    // first correction (a later reflow - resource row sync, a resize, a
    // second internal layout pass) silently resetting scrollLeft back to 0
    // while the calendar was already visible. Re-apply the correction a few
    // more times at increasing delays and only reveal once the last one has
    // run, so any such delayed reset gets caught and fixed before the user
    // ever sees it, regardless of what's causing it.
    function applyTodayScroll() {
      const sb = setupScrollbar();
      if (!sb) return false;
      scrollToToday(sb.bodyScroller, sb.top);
      updateHeaderOnScroll(sb.bodyScroller, sb.top);
      refreshGroupOverlayScrollSync();
      refreshCalendarVerticalScrollSync();
      setupDateBookmarks();
      applyDateBookmarks();
      return true;
    }

    (function ensureScrolledToTodayThenReveal(attemptsLeft) {
      if (!applyTodayScroll()) {
        if (attemptsLeft > 0) {
          requestAnimationFrame(() => ensureScrolledToTodayThenReveal(attemptsLeft - 1));
          return;
        }
        // Give up after ~0.5s so a genuinely scroller-less state (e.g. an
        // error state) never leaves the calendar permanently hidden.
        if (calendarEl) calendarEl.classList.remove('calendar-not-ready');
        return;
      }

      const recheckDelays = [50, 150, 400];
      let i = 0;
      (function recheck() {
        if (i >= recheckDelays.length) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (calendarEl) calendarEl.classList.remove('calendar-not-ready');
            });
          });
          return;
        }
        setTimeout(() => {
          applyTodayScroll();
          i++;
          recheck();
        }, recheckDelays[i]);
      })();
    })(30);

    window.calendar = calendar;
    setupScrollToDate();
    setupHoverEffects();
    setupCalendarRangeExpansion();

    // Apply any pending highlight
    try {
      applyIncomingHighlight();
    } catch (e) {
      console.warn('Failed to apply incoming highlight:', e);
    }

    const totalTime = Date.now() - dataStartTime;
    
    // Performance metrics reporting
    if (window.calendarConfig) {
      window.calendarConfig.dataLoadComplete = Date.now();
    }

  } catch (error) {
    console.error('❌ Calendar data loading failed:', error);
    handleDataError(error);
  }
}

async function refreshCalendarBookings() {
  if (!calendar) return;

  try {
    lastFetchedRangeKey = null;
    const events = await fetchCalendarBookings();
    if (!events) return;

    applyCalendarBookings(events);
    calendar.render();

    if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
      renderGroupCreateOverlays();
    }

    if (typeof updateLegendCounts === 'function') {
      updateLegendCounts();
    }

    requestAnimationFrame(function() {
      refreshCalendarVerticalScrollSync();
      if (typeof refreshGroupBookingShadesAfterLayout === 'function') {
        refreshGroupBookingShadesAfterLayout();
      }
    });
  } catch (error) {
    console.error('❌ Calendar bookings refresh failed:', error);
    if (typeof loadCalendarData === 'function') {
      loadCalendarData();
    }
  }
}

function refreshCalendarAfterBookingSave() {
  const onDashboard = window.location.pathname.includes('/dashboard');
  if (onDashboard) return;

  if (typeof refreshCalendarBookings === 'function') {
    refreshCalendarBookings();
    return;
  }

  if (typeof loadCalendarData === 'function') {
    loadCalendarData();
  }
}

function handleDataError(err) {
  console.error("❌ Error loading data:", err);
  hideLoading();
  
  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
    calendarEl.classList.remove('calendar-not-ready');
    calendarEl.innerHTML = `
      <div style="text-align: center; padding: 50px; color: #666;">
        <h3>⚠️ Unable to load calendar data</h3>
        <p>Please check your connection and try refreshing the page.</p>
        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3598dc; color: white; border: none; border-radius: 5px; cursor: pointer;">
          Refresh Page
        </button>
      </div>
    `;
  }
}

// =============================================================================
// CALENDAR INITIALIZATION
// =============================================================================



document.addEventListener('DOMContentLoaded', function() {
  calendarEl = document.getElementById('calendar'); // Set the global variable

  // Failsafe: the calendar starts hidden via the .calendar-not-ready class
  // (see calendar.ejs/calendar.css) and loadCalendarData() is what normally
  // removes it once the corrected scroll position is set. If anything throws
  // before that point (or the page fails to load calendar_data.js at all
  // on some future edit), this guarantees the grid still becomes visible
  // instead of staying blank forever.
  setTimeout(function() {
    if (calendarEl) calendarEl.classList.remove('calendar-not-ready');
  }, 8000);

  // Swallow any mousedown/click/touch that lands on the calendar while a
  // block window is active (see ignoreSelectUntil). This runs in the capture
  // phase, ahead of FullCalendar's own listeners, so it catches the event
  // before FullCalendar's interaction plugin ever sees it - toggling the
  // `selectable` option alone isn't reliable here because that change is
  // applied on FullCalendar's own render cycle, which can lag behind a ghost
  // click that a SweetAlert2 button leaves on the cell underneath it.
  ['mousedown', 'pointerdown', 'touchstart', 'click'].forEach(function(evtName) {
    document.addEventListener(evtName, function(e) {
      if (Date.now() < ignoreSelectUntil && calendarEl && calendarEl.contains(e.target)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
  });

  // Loading removed for faster performance

 // ←– INSERT MUTATION OBSERVER HERE
  // =================================
// ←– UPDATED MUTATION OBSERVER HERE
let headerContainer = null;
const findHeader = setInterval(() => {
  headerContainer = calendarEl.querySelector('.fc-scrollgrid-header');
  if (headerContainer) {
    clearInterval(findHeader);
    const mo = new MutationObserver(() => {
      // keep only the first <thead> in the header
      const theads = headerContainer.querySelectorAll('thead');
      if (theads.length > 1) {
        theads.forEach((t, i) => {
          if (i > 0) t.remove();
        });
      }
    });
    mo.observe(headerContainer, { childList: true });
  }
}, 50);
  // =================================
  // end of observer setup

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Initialize date ranges
  currentRangeStart = new Date(today);
  currentRangeStart.setDate(today.getDate() - 9);
  currentWeekStart = new Date();
  currentWeekStart.setHours(0, 0, 0, 0);

  // Initialize calendar
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'month',
    initialDate: today,
    resourceAreaHeaderContent: 'Rooms',
    resourceAreaWidth: "70px",
    // The horizontal scrollbar is a position:fixed <body> child pinned to the
    // viewport bottom, so it doesn't consume grid height; #calendar has
    // padding-bottom so its last row stays clear of the fixed bar.
    height: '850px',
    eventOverlap: true,
    editable: true,
    eventResourceEditable: true,
    selectable: true,
    selectOverlap: true,
    selectAllow: function(selectInfo) {
      if (!selectInfo.resource || isFloorResourceId(selectInfo.resource.id)) {
        return false;
      }
      if (typeof window.isCalendarSlotBooked === 'function') {
        return !window.isCalendarSlotBooked(selectInfo.resource.id, selectInfo.start, selectInfo.end);
      }
      return true;
    },
    // Resize options - compatible with older FullCalendar versions
    eventResize: true, // Enable event resizing
    eventResizableFromStart: false, // Only allow resizing from the end (extend checkout)
    
    // Note: eventDropTransformers removed - using eventDrop handler instead

    select: function(info) {
      // Swallow the ghost click a SweetAlert2 button leaves behind on the
      // calendar cell underneath it right after closing.
      if (Date.now() < ignoreSelectUntil) {
        calendar.unselect();
        return;
      }

      // Manual Group Create mode: this drag just picks a room + (on the first
      // pick) locks in the shared date range - never opens any booking modal
      // directly, and never touches the auto-detected single-drag flow below.
      if (groupCreateModeActive) {
        if (isFloorResourceId(info.resource.id)) {
          calendar.unselect();
          return;
        }
        const startOk = new Date(info.start);
        startOk.setHours(0, 0, 0, 0);
        const todayOk = new Date();
        todayOk.setHours(0, 0, 0, 0);
        if (startOk < todayOk) {
          calendar.unselect();
          return;
        }
        if (!isValidCheckInSelectionStart(info.start)) {
          showInvalidCheckInSelectionError();
          calendar.unselect();
          return;
        }
        toggleGroupCreateRoom(info.resource.id, info.start, info.end);
        calendar.unselect();
        return;
      }

      const modal = $('#modal-addbooking');

      // Check if selected date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

      const selectedStartDate = new Date(info.start);
      selectedStartDate.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

      // If selected start date is before today, prevent modal from opening
      if (selectedStartDate < today) {
        // Show error message
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Past Date Selected',
            text: 'Cannot create booking for past dates. Please select today or a future date.',
            icon: 'warning',
            confirmButtonText: 'OK',
            background: '#2a3135',
            color: '#ffffff'
          });
        } else {
          alert('Cannot create booking for past dates. Please select today or a future date.');
        }

        calendar.unselect();
        return; // Exit early, don't show modal
      }

      continueCalendarSelectFlow(info, modal, today);
    },

    eventClick: handleEventClick,
    eventDidMount: handleEventDidMount,
    datesSet: handleDatesSet,
    eventDrop: handleEventDrop,
    eventDragStart: handleEventDragStart,
    eventDragStop: handleEventDragStop,
    eventResize: handleEventResize,
    eventResizeStart: handleEventResizeStart,
    eventResizeStop: handleEventResizeStop,

    resourceOrder: '',
    headerToolbar: {
      left:  'searchBox bed1Filter bed2Filter groupCreateToggle groupCreateProceed dayPrev customToday dayNext',
      center:'title',
      right: 'customFullscreen week customMonth customPrev customNext'
    },

    customButtons: customButtons,
    views: views,

    resourceLabelContent: function(arg) {
      if (arg.resource.extendedProps.isFloor) {
        const div = document.createElement("div");
        div.innerHTML = `<strong>${arg.resource.title}</strong>`;
        div.classList.add("fc-resource-bold");
        return { domNodes: [div] };
      }
      return buildCalendarRoomLabel(arg);
    },

    resourceLabelDidMount: function(arg) {
      if (arg.resource.extendedProps.isFloor) {
        arg.el.setAttribute('data-is-floor', 'true');
        return;
      }

      const roomView = parseInt(
        arg.resource.extendedProps.roomView ?? arg.resource.roomView,
        10
      );
      const bedCount = parseInt(
        arg.resource.extendedProps?.bedCount ?? arg.resource.bedCount,
        10
      );
      arg.el.classList.remove('room-view-condo', 'room-view-mountain');
      const tooltipParts = [];
      if (bedCount === 1) tooltipParts.push('King Bedroom');
      else if (bedCount === 2) tooltipParts.push('Queen Bedroom');
      if (roomView === 1) {
        arg.el.classList.add('room-view-condo');
        tooltipParts.push('Condo View');
      } else if (roomView === 2) {
        arg.el.classList.add('room-view-mountain');
        tooltipParts.push('Mountain View');
      }
      if (tooltipParts.length) {
        arg.el.title = tooltipParts.join(' · ');
      }

      // Re-apply the armed highlight after view re-renders (e.g. changing weeks)
      if (armedRoomIds.has(String(arg.resource.id))) {
        arg.el.classList.add('group-select-armed');
      }
      if (groupCreateSelectedRooms.has(String(arg.resource.id))) {
        arg.el.classList.add('group-create-armed');
      }
    },

    // Black out the timeline body of the Floor (3/4/5) grouping rows so the
    // day-column grid lines don't show through on the label row.
    resourceLaneClassNames: function(arg) {
      return (arg.resource && arg.resource.extendedProps && arg.resource.extendedProps.isFloor)
        ? ['fc-floor-lane']
        : [];
    },

    // resourceLaneClassNames is unreliable for parent/floor rows in this FC
    // build, so also stamp the lane <td> (and its <tr>) directly on mount and
    // paint them solid black inline - CSS alone can't win if the class is
    // missing from the element the grid lines actually render on.
    resourceLaneDidMount: function(arg) {
      if (!(arg.resource && arg.resource.extendedProps && arg.resource.extendedProps.isFloor)) return;
      const td = arg.el;
      if (!td) return;
      td.classList.add('fc-floor-lane');
      const paint = (node) => {
        if (!node || node.classList.contains('fc-floor-blackout')) return;
        node.style.setProperty('background', '#000', 'important');
        node.style.setProperty('background-image', 'none', 'important');
        node.style.setProperty('border-color', '#000', 'important');
        node.style.setProperty('box-shadow', 'none', 'important');
      };
      paint(td);
      if (td.parentElement) paint(td.parentElement);
      td.querySelectorAll('*').forEach(paint);
      td.style.setProperty('position', 'relative', 'important');

      // Physical opaque cover so the shared today/weekend column layer that
      // renders through the lane can't show any tint on the black band.
      if (!td.querySelector(':scope > .fc-floor-blackout')) {
        const cover = document.createElement('div');
        cover.className = 'fc-floor-blackout';
        td.appendChild(cover);
      }

      // Descendants (slot cells, bg harness) can be (re)created after mount.
      if (!td._floorPaintObserver && window.MutationObserver) {
        td._floorPaintObserver = new MutationObserver(() => {
          paint(td);
          td.querySelectorAll('*').forEach(paint);
          if (!td.querySelector(':scope > .fc-floor-blackout')) {
            const cover = document.createElement('div');
            cover.className = 'fc-floor-blackout';
            td.appendChild(cover);
          }
        });
        td._floorPaintObserver.observe(td, { childList: true, subtree: true });
      }
    },

    resources: [],
    events: []
  });

  // Load data
  loadCalendarData();

  // Group Select: press-drag-release across rooms and dates in one gesture
  attachGroupSelectDragTracking();

  // Manual Group Create mode: pick rooms one at a time across any floor
  attachGroupCreateLabelClicks();
  attachGroupBookingModalHandlers();
  updateGroupCreateButtonStates();

  // Initialize drag and drop functionality immediately
  if (typeof window.initializeDragAndDrop === 'function') {
    window.initializeDragAndDrop();
  }
  
  // Inject custom drag styles and set up cleanup
  if (typeof window.injectDragStyles === 'function') {
    window.injectDragStyles();
  }
  if (typeof window.setupPeriodicCleanup === 'function') {
    window.setupPeriodicCleanup();
  }
  
  // Initialize calendar legend
  initializeCalendarLegend();

  // Initialize search and filter functionality
  initializeSearchAndFilter();

  // Setup Socket.IO for real-time calendar updates
  if (typeof io !== 'undefined') {
    const calendarSocket = io({
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000
    });

    calendarSocket.on('connect', () => {
      console.log('🔌 Calendar connected to Socket.IO server');
    });

    calendarSocket.on('disconnect', () => {
      console.log('🔌 Calendar disconnected from Socket.IO server');
    });

    // Listen for booking checkout updates and general booking updates
    calendarSocket.on('calendar-booking-updated', (data) => {
      console.log('📡 Received calendar booking update event:', data);
      
      if (data && data.data) {
        if (data.action === 'booking-checked-out' && data.data.bookings) {
          // Update calendar events for checked out bookings
          updateCalendarEventsForCheckout(data.data.bookings);
        } else if (data.action === 'booking-updated' || data.action === 'booking-extended') {
          // Update calendar event for general booking updates (including checkout date changes)
          updateCalendarEventForBooking(data.data);
        }
      }
    });

    // Also listen to dashboard-refresh events for checkout
    if (typeof window.dashboardSocket !== 'undefined' && window.dashboardSocket) {
      window.dashboardSocket.on('dashboard-refresh', (data) => {
        if (data && data.action === 'booking-checked-out' && data.data && data.data.bookings) {
          console.log('📡 Received dashboard-refresh checkout event:', data);
          updateCalendarEventsForCheckout(data.data.bookings);
        }
      });
    }

    // Store socket globally for calendar
    window.calendarSocket = calendarSocket;
  }

});

// Function to update calendar events when checkout happens
function updateCalendarEventsForCheckout(bookings) {
  if (!window.calendar || !bookings || bookings.length === 0) {
    return;
  }

  try {
    bookings.forEach(bookingData => {
      const bookingId = String(bookingData.bookingId || bookingData.BookingID);
      if (!bookingId) return;

      // Find the event in the calendar
      const event = window.calendar.getEventById(bookingId);
      if (!event) {
        console.log('Event not found for booking:', bookingId);
        return;
      }

      // Get updated checkout date
      const checkOutDate = bookingData.checkOutDate || bookingData.CHECK_OUT_DATE;
      if (!checkOutDate) return;

      // Parse the checkout date
      const newEndDate = new Date(checkOutDate);
      // Set checkout time to 6:00 PM
      newEndDate.setHours(18, 0, 0, 0);

      // Update event end date
      event.setEnd(newEndDate);

      // Update event extendedProps if needed
      if (event.setExtendedProp) {
        event.setExtendedProp('bookingStatus', 'check-Out');
        event.setExtendedProp('checkOutDate', checkOutDate);
      }

      // Update event title/display if needed
      if (event.setProp) {
        event.setProp('title', event.title || ''); // Keep existing title
      }

      console.log('✅ Updated calendar event for booking:', bookingId, 'New checkout:', newEndDate);
    });

    // Refresh calendar to show changes
    window.calendar.render();
  } catch (error) {
    console.error('Error updating calendar events for checkout:', error);
    // Fallback: refetch all events if update fails
    if (window.calendar && typeof window.calendar.refetchEvents === 'function') {
      window.calendar.refetchEvents();
    }
  }
}

// Function to update calendar event for general booking updates (checkout date changes, etc.)
function updateCalendarEventForBooking(bookingData) {
  if (!window.calendar || !bookingData) {
    return;
  }

  try {
    const bookingId = String(bookingData.bookingId);
    if (!bookingId) return;

    // Find the event in the calendar
    const event = window.calendar.getEventById(bookingId);
    if (!event) {
      console.log('Event not found for booking:', bookingId);
      return;
    }

    // Update checkout date if provided
    if (bookingData.checkOut) {
      const newEndDate = new Date(bookingData.checkOut);
      // Set checkout time to 6:00 PM
      newEndDate.setHours(18, 0, 0, 0);
      event.setEnd(newEndDate);
    }

    // Update check-in date if provided
    if (bookingData.checkIn) {
      const newStartDate = new Date(bookingData.checkIn);
      // Set check-in time to 6:00 AM
      newStartDate.setHours(6, 0, 0, 0);
      event.setStart(newStartDate);
    }

    // Update room if provided
    if (bookingData.newRoom) {
      const newResource = window.calendar.getResourceById(String(bookingData.newRoom));
      if (newResource) {
        event.setResources([newResource]);
      }
    }

    // Update extendedProps
    if (event.setExtendedProp) {
      if (bookingData.checkOut) {
        event.setExtendedProp('checkOutDate', bookingData.checkOut);
      }
      if (bookingData.isExtended) {
        event.setExtendedProp('isExtended', true);
      }
    }

    console.log('✅ Updated calendar event for booking:', bookingId);
    
    // Refresh calendar to show changes
    window.calendar.render();
  } catch (error) {
    console.error('Error updating calendar event for booking:', error);
    // Fallback: refetch all events if update fails
    if (window.calendar && typeof window.calendar.refetchEvents === 'function') {
      window.calendar.refetchEvents();
    }
  }
}

// =============================================================================
// SEARCH AND FILTER FUNCTIONALITY
// =============================================================================

// Global variables for search and filter
let searchBoxVisible = false;
let filterBoxVisible = false;
let currentFilters = {
  guestName: '',
  floor: 'all',
  roomType: 'all',
  status: 'all',
  dateRange: null
};

// Initialize search and filter functionality
function initializeSearchAndFilter() {
  createSearchBox();
  createFilterBox();
  setupSearchAndFilterEvents();
}

// Create search box overlay
function createSearchBox() {
  const searchOverlay = document.createElement('div');
  searchOverlay.id = 'calendar-search-overlay';
  searchOverlay.className = 'calendar-search-overlay hidden';
  
  searchOverlay.innerHTML = `
    <div class="search-box-container">
      <div class="search-header">
        <h4><i class="fa fa-search"></i> Search Bookings</h4>
        <button class="close-search" onclick="toggleSearchBox()">
          <i class="fa fa-times"></i>
        </button>
      </div>
      <div class="search-content">
        <div class="search-field">
          <label for="guest-search">Guest Name:</label>
          <input type="text" id="guest-search" placeholder="Enter guest name..." />
        </div>
        <div class="search-field">
          <label>Booking Status:</label>
          <div class="status-radio-group">
            <label class="radio-option">
              <input type="radio" name="search-status" value="all" checked>
              <span class="radio-label">All Statuses</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="search-status" value="check-In">
              <span class="radio-label">Occupied (Checked In)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="search-status" value="pending-late">
              <span class="radio-label">Pending - Late (CI/CO)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="search-status" value="pending-regular">
              <span class="radio-label">Pending - Regular (CI/CO)</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="search-status" value="check-Out">
              <span class="radio-label">Checked Out</span>
            </label>
            <label class="radio-option">
              <input type="radio" name="search-status" value="cancelled">
              <span class="radio-label">Cancelled</span>
            </label>
          </div>
        </div>
        <!-- Auto-search enabled; buttons removed -->
        <div class="search-results" id="search-results"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(searchOverlay);
}

// Create filter box overlay
function createFilterBox() {}

// =============================================================================
// BED COUNT FILTER (Rooms) - toolbar toggle buttons
// =============================================================================
let activeBedFilter = null;

function toggleBedFilter(bedValue) {
  activeBedFilter = (activeBedFilter === bedValue) ? null : bedValue;
  updateBedFilterButtonStates();
  applyBedFilter();
}

function updateBedFilterButtonStates() {
  const btn1 = document.querySelector('.fc-bed1Filter-button');
  const btn2 = document.querySelector('.fc-bed2Filter-button');
  if (btn1) btn1.classList.toggle('bed-filter-btn-active', activeBedFilter === '1');
  if (btn2) btn2.classList.toggle('bed-filter-btn-active', activeBedFilter === '2');

  if (btn1) btn1.blur();
  if (btn2) btn2.blur();
}

function refreshGroupBookingShadesAfterLayout() {
  const hasGroupCreate = groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange;
  const hasGroupSelect = !groupCreateModeActive && armedRoomIds.size >= 1 && groupSelectDateRange;
  if (!hasGroupCreate && !hasGroupSelect) return;

  getTimelineOverlayLayer();
  restoreCalendarGroupSelectionVisuals();
}

function applyBedFilter() {
  if (!calendar || !window.allCalendarFloors) return;

  const roomViewFilters = getActiveRoomViewFilters();
  const filteredFloors = window.allCalendarFloors
    .map(floor => ({
      ...floor,
      children: (floor.children || []).filter(room => {
        if (activeBedFilter && String(room.bedCount) !== activeBedFilter) return false;
        if (roomViewFilters && roomViewFilters.length) {
          const view = parseInt(room.roomView, 10);
          if (!roomViewFilters.includes(view)) return false;
        }
        return true;
      })
    }))
    .filter(floor => floor.children.length > 0);

  calendar.setOption('resources', filteredFloors);

  requestAnimationFrame(function() {
    if (typeof calendar.updateSize === 'function') {
      calendar.updateSize();
    }

    const scrollbarData = setupScrollbar();
    if (scrollbarData) {
      updateHeaderOnScroll(scrollbarData.bodyScroller, scrollbarData.top);
    }

    requestAnimationFrame(function() {
      refreshCalendarVerticalScrollSync();
      requestAnimationFrame(refreshGroupBookingShadesAfterLayout);
    });
  });
}

// Setup event listeners for search and filter
function setupSearchAndFilterEvents() {
  // Guest search input
  const guestSearch = document.getElementById('guest-search');
  if (guestSearch) {
    guestSearch.addEventListener('input', debounce(performSearch, 300));
    guestSearch.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }
  
  // Search status radio buttons
  const searchStatusRadios = document.querySelectorAll('input[name="search-status"]');
  searchStatusRadios.forEach(radio => {
    radio.addEventListener('change', performSearch);
  });


  // Filter change events
  const floorFilter = document.getElementById('floor-filter');
  const statusFilter = document.getElementById('status-filter');
  const dateRangeFilter = document.getElementById('date-range-filter');
  
  if (floorFilter) {
    floorFilter.addEventListener('change', applyFilters);
  }
  
  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
  
  if (dateRangeFilter) {
    // Initialize date range picker
    flatpickr(dateRangeFilter, {
      mode: "range",
      altInput: true,
      altFormat: "M d, Y",
      dateFormat: "Y-m-d",
      onChange: function(selectedDates, dateStr, instance) {
        if (selectedDates.length === 2) {
          currentFilters.dateRange = {
            start: selectedDates[0],
            end: selectedDates[1]
          };
          applyFilters();
        }
      }
    });
  }
}

// Toggle search box visibility
function toggleSearchBox() {
  const searchOverlay = document.getElementById('calendar-search-overlay');
  if (searchOverlay) {
    searchBoxVisible = !searchBoxVisible;
    if (searchBoxVisible) {
      searchOverlay.classList.remove('hidden');
      document.getElementById('guest-search').focus();
    } else {
      searchOverlay.classList.add('hidden');
    }
  }
}

// Toggle filter box visibility (unused - bed filters are now direct toolbar buttons)
function toggleFilterBox() {}

// Perform guest name search with status filter
function performSearch() {
  const guestName = document.getElementById('guest-search').value.trim();
  const statusFilter = document.querySelector('input[name="search-status"]:checked').value;
  const resultsContainer = document.getElementById('search-results');
  
  if (!guestName && statusFilter === 'all') {
    resultsContainer.innerHTML = '';
    return;
  }
  
  // Get all events from calendar
  const allEvents = calendar.getEvents();
  const matchingEvents = allEvents.filter(event => {
    let matchesGuest = true;
    let matchesStatus = true;
    
    // Check guest name filter
    if (guestName) {
      const eventTitle = event.title.toLowerCase();
      matchesGuest = eventTitle.includes(guestName.toLowerCase());
    }
    
    // Check status filter
    if (statusFilter !== 'all') {
      const eventStatus = event.extendedProps?.bookingStatus || '';
      const checkInStatus = event.extendedProps?.checkInStatus;
      
      if (statusFilter === 'pending-late') {
        // Late pending: booking status is 'pending' AND checkInStatus is 0
        matchesStatus = eventStatus === 'pending' && checkInStatus === 0;
      } else if (statusFilter === 'pending-regular') {
        // Regular pending: booking status is 'pending' AND checkInStatus is 1
        matchesStatus = eventStatus === 'pending' && checkInStatus === 1;
      } else {
        // Other statuses match directly
        matchesStatus = eventStatus === statusFilter;
      }
    }
    
    return matchesGuest && matchesStatus;
  });
  
  // Display search results
  if (matchingEvents.length === 0) {
    let noResultsMessage = 'No bookings found';
    if (guestName && statusFilter !== 'all') {
      noResultsMessage = `No bookings found for "${guestName}" with status "${statusFilter}"`;
    } else if (guestName) {
      noResultsMessage = `No bookings found for "${guestName}"`;
    } else if (statusFilter !== 'all') {
      noResultsMessage = `No bookings found with status "${statusFilter}"`;
    }
    resultsContainer.innerHTML = '<div class="no-results">' + noResultsMessage + '</div>';
  } else {
    let resultsHTML = '<div class="search-results-header">Found ' + matchingEvents.length + ' booking(s):</div>';
    
    matchingEvents.forEach(event => {
      const resources = event.getResources();
      const roomNumber = resources.length ? resources[0].title : 'N/A';
      const startDate = event.start.toLocaleDateString();
      const endDate = event.end.toLocaleDateString();
      const eventStatus = event.extendedProps?.bookingStatus || 'Unknown';
      const holdPending = event.extendedProps?.holdPending;
      const isHoldPending = holdPending === 1 || holdPending === '1' || holdPending === true;
      const rawPaymentStatus = (event.extendedProps?.paymentStatus || 'unpaid').toLowerCase();
      const isFullyPaid = (rawPaymentStatus === 'paid');
      const isOTA = (() => {
        const channel = String(event.extendedProps?.bookingChannel || '').trim().toLowerCase();
        return channel === 'booking-channel' || channel === 'booking channel';
      })();

      // Determine display status and color
      let displayStatus = eventStatus;
      let statusColor = '#b0b0b0';

      if (eventStatus === 'pending' && isHoldPending) {
        displayStatus = 'Pencil Booking';
        statusColor = '#FFEB3B'; // Bright yellow for pencil booking
      } else if (eventStatus === 'pending' && isOTA) {
        displayStatus = 'OTA Booking (Prepaid)';
        statusColor = '#D5A6BD'; // Mauve for OTA prepaid
      } else if (eventStatus === 'pending') {
        displayStatus = isFullyPaid ? 'Reservation (Paid)' : 'Reservation (Unconfirmed)';
        statusColor = isFullyPaid ? '#5B9BD5' : '#e53935';
      } else if (eventStatus === 'check-In') {
        displayStatus = isFullyPaid ? 'Check-In (Paid)' : 'Check-In (Unpaid)';
        statusColor = isFullyPaid ? '#FFC107' : '#6f9c40';
      } else if (eventStatus === 'check-Out') {
        displayStatus = isFullyPaid ? 'Check-Out (Paid)' : 'Check-Out (Unpaid)';
        statusColor = isFullyPaid ? '#424242' : '#00E5FF';
      } else if (eventStatus === 'cancelled') {
        displayStatus = 'Cancelled';
        statusColor = '#000000'; // Black
      }
      
      resultsHTML += `
        <div class="search-result-item" onclick="highlightBooking('${event.id}')">
          <div class="guest-name">${event.title}</div>
          <div class="booking-details">
            Room ${roomNumber} • ${startDate} - ${endDate}
          </div>
          <div class="booking-status" style="color: ${statusColor}; font-weight: 600; font-size: 12px; margin-top: 3px;">
            Status: ${displayStatus}
          </div>
          <div class="click-hint">Click to focus on calendar</div>
        </div>
      `;
    });
    
    resultsContainer.innerHTML = resultsHTML;
  }
}

// Clear search
function clearSearch() {
  document.getElementById('guest-search').value = '';
  document.querySelector('input[name="search-status"][value="all"]').checked = true;
  document.getElementById('search-results').innerHTML = '';
  currentFilters.guestName = '';
  applyFilters();
}

// Apply filters
function applyFilters() {
  // Update current filters
  currentFilters.guestName = document.getElementById('guest-search').value.trim();
  currentFilters.floor = document.getElementById('floor-filter').value;
  currentFilters.status = document.getElementById('status-filter').value;
  
  // Get all events
  const allEvents = calendar.getEvents();
  
  // Apply filters
  allEvents.forEach(event => {
    let shouldShow = true;
    
    // Guest name filter
    if (currentFilters.guestName) {
      const eventTitle = event.title.toLowerCase();
      shouldShow = shouldShow && eventTitle.includes(currentFilters.guestName.toLowerCase());
    }
    
    // Floor filter
    if (currentFilters.floor !== 'all') {
      const resources = event.getResources();
      if (resources.length) {
        const roomNumber = resources[0].title;
        const floorNumber = roomNumber.charAt(0);
        shouldShow = shouldShow && floorNumber === currentFilters.floor;
      }
    }
    
    // Status filter
    if (currentFilters.status !== 'all') {
      const eventStatus = event.extendedProps?.bookingStatus || '';
      shouldShow = shouldShow && eventStatus === currentFilters.status;
    }
    
    // Date range filter
    if (currentFilters.dateRange) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const filterStart = currentFilters.dateRange.start;
      const filterEnd = currentFilters.dateRange.end;
      
      shouldShow = shouldShow && (
        (eventStart >= filterStart && eventStart <= filterEnd) ||
        (eventEnd >= filterStart && eventEnd <= filterEnd) ||
        (eventStart <= filterStart && eventEnd >= filterEnd)
      );
    }
    
    // Show/hide event based on filter result
    if (shouldShow) {
      event.setProp('display', 'block');
    } else {
      event.setProp('display', 'none');
    }
  });
  
  // Update active filters display
  updateActiveFiltersDisplay();
  
  // Update legend counts
  if (typeof updateLegendCounts === 'function') {
    updateLegendCounts();
  }
}

// Clear all filters
function clearFilters() {
  // Reset filter inputs
  document.getElementById('guest-search').value = '';
  document.getElementById('floor-filter').value = 'all';
  document.getElementById('status-filter').value = 'all';
  document.getElementById('date-range-filter').value = '';
  
  // Reset current filters
  currentFilters = {
    guestName: '',
    floor: 'all',
    roomType: 'all',
    status: 'all',
    dateRange: null
  };
  
  // Show all events
  const allEvents = calendar.getEvents();
  allEvents.forEach(event => {
    event.setProp('display', 'block');
  });
  
  // Clear search results
  document.getElementById('search-results').innerHTML = '';
  
  // Update active filters display
  updateActiveFiltersDisplay();
  
  // Update legend counts
  if (typeof updateLegendCounts === 'function') {
    updateLegendCounts();
  }
}

// Update active filters display
function updateActiveFiltersDisplay() {
  const activeFiltersContainer = document.getElementById('active-filters');
  const activeFilters = [];
  
  if (currentFilters.guestName) {
    activeFilters.push(`Guest: "${currentFilters.guestName}"`);
  }
  
  if (currentFilters.floor !== 'all') {
    activeFilters.push(`Floor: ${currentFilters.floor}`);
  }
  
  if (currentFilters.status !== 'all') {
    activeFilters.push(`Status: ${currentFilters.status}`);
  }
  
  if (currentFilters.dateRange) {
    const startStr = currentFilters.dateRange.start.toLocaleDateString();
    const endStr = currentFilters.dateRange.end.toLocaleDateString();
    activeFilters.push(`Date: ${startStr} - ${endStr}`);
  }
  
  if (activeFilters.length > 0) {
    activeFiltersContainer.innerHTML = `
      <div class="active-filters-header">Active Filters:</div>
      <div class="active-filters-list">
        ${activeFilters.map(filter => `<span class="active-filter-tag">${filter}</span>`).join('')}
      </div>
    `;
  } else {
    activeFiltersContainer.innerHTML = '';
  }
}

// Highlight specific booking and focus on calendar
function highlightBooking(eventId) {
  const event = calendar.getEventById(eventId);
  if (event) {
    // Get the event's start date to navigate calendar to that date
    const eventStartDate = new Date(event.start);
    
    // Navigate calendar to the event's date
    calendar.gotoDate(eventStartDate);
    
    // Wait for calendar to render, then scroll to the event
    setTimeout(() => {
      const eventElement = window.eventElements[eventId];
      if (eventElement) {
        // Scroll the calendar to center the event
        eventElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        // Add highlight effect (keep long enough to match CSS ~20s)
        eventElement.classList.add('search-highlight');
        setTimeout(() => {
          eventElement.classList.remove('search-highlight');
        }, 10000);
      }
      
      // Also scroll the calendar container to focus on the event
      const calendarContainer = document.getElementById('calendar');
      if (calendarContainer) {
        calendarContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
    }, 100);
    
    // Close search box
    toggleSearchBox();
  }
}

// Debounce function for search input
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Make functions globally available
window.loadCalendarData = loadCalendarData;
window.refreshCalendarBookings = refreshCalendarBookings;
window.refreshCalendarAfterBookingSave = refreshCalendarAfterBookingSave;
window.reloadCalendarBookingsForVisibleRange = reloadCalendarBookingsForVisibleRange;
window.toggleSearchBox = toggleSearchBox;
window.toggleFilterBox = toggleFilterBox;
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.applyBedFilter = applyBedFilter;
window.updateBedFilterButtonStates = updateBedFilterButtonStates;
window.refreshCalendarVerticalScrollSync = refreshCalendarVerticalScrollSync;
window.refreshGroupBookingShadesAfterLayout = refreshGroupBookingShadesAfterLayout;
window.buildUnavailableRoomsAlertContent = buildUnavailableRoomsAlertContent;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.highlightBooking = highlightBooking;
window.renderGroupCreateOverlays = renderGroupCreateOverlays;
window.syncGroupSelectOverlay = syncGroupSelectOverlay;
window.restoreCalendarGroupSelectionVisuals = restoreCalendarGroupSelectionVisuals;
window.resetCalendarGroupSelection = resetCalendarGroupSelection;
window.getGroupCreateShadeStatus = function() {
  return {
    active: groupCreateModeActive,
    expectedCount: groupCreateSelectedRooms.size,
    hasRange: !!groupCreateDateRange
  };
};
window.countGroupCreateShadeEvents = function() {
  return document.querySelectorAll('.group-create-overlay').length;
};

// =============================================================================
// CALENDAR LEGEND FUNCTIONALITY
// =============================================================================

function initializeCalendarLegend() {
  // Create legend overlay
  createLegendOverlay();
  
  // Update legend counts initially
  updateLegendCounts();
  
  // Update legend counts when events change
  if (calendar) {
    calendar.on('eventAdd', updateLegendCounts);
    calendar.on('eventRemove', updateLegendCounts);
    calendar.on('eventChange', updateLegendCounts);
  }
}

function createLegendOverlay() {
  // Check if legend already exists
  if (document.querySelector('.calendar-legend-overlay')) {
    return;
  }
  
  const legendOverlay = document.createElement('div');
  legendOverlay.className = 'calendar-legend-overlay';
  legendOverlay.innerHTML = `
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Check In</h3>
      <button class="calendar-legend-toggle" onclick="toggleLegend()">−</button>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="checkin-paid">
        <div class="calendar-legend-color legend-color-checkin-paid"></div>
        <span class="calendar-legend-text">Check-In (Paid)</span>
        <span class="calendar-legend-count" id="legend-count-checkin-paid">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="checkin-unpaid">
        <div class="calendar-legend-color legend-color-checkin-unpaid"></div>
        <span class="calendar-legend-text">Check-In (Unpaid)</span>
        <span class="calendar-legend-count" id="legend-count-checkin-unpaid">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Reservation</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="reservation-paid">
        <div class="calendar-legend-color legend-color-reservation-paid"></div>
        <span class="calendar-legend-text">Reservation (Paid)</span>
        <span class="calendar-legend-count" id="legend-count-reservation-paid">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="reservation-unconfirmed">
        <div class="calendar-legend-color legend-color-reservation-unconfirmed"></div>
        <span class="calendar-legend-text">Unconfirmed</span>
        <span class="calendar-legend-count" id="legend-count-reservation-unconfirmed">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="ota-prepaid">
        <div class="calendar-legend-color legend-color-ota-prepaid"></div>
        <span class="calendar-legend-text">OTA Booking (Prepaid)</span>
        <span class="calendar-legend-count" id="legend-count-ota-prepaid">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="pencil-booking">
        <div class="calendar-legend-color legend-color-pencil-booking"></div>
        <span class="calendar-legend-text">Pencil Booking</span>
        <span class="calendar-legend-count" id="legend-count-pencil-booking">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Check Out</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="checkout-paid">
        <div class="calendar-legend-color legend-color-checkout-paid"></div>
        <span class="calendar-legend-text">Check-Out (Paid)</span>
        <span class="calendar-legend-count" id="legend-count-checkout-paid">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="checkout-unpaid">
        <div class="calendar-legend-color legend-color-checkout-unpaid"></div>
        <span class="calendar-legend-text">Check-Out (Unpaid)</span>
        <span class="calendar-legend-count" id="legend-count-checkout-unpaid">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Other</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="cancelled">
        <div class="calendar-legend-color legend-color-cancelled"></div>
        <span class="calendar-legend-text">Cancelled</span>
        <span class="calendar-legend-count" id="legend-count-cancelled">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="long-term">
        <div class="calendar-legend-color legend-color-long-term"></div>
        <span class="calendar-legend-text">Long-Term Stay</span>
        <span class="calendar-legend-count" id="legend-count-long-term">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Room View</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="condo-view" style="cursor: pointer;">
        <div class="calendar-legend-color legend-color-condo-view"></div>
        <span class="calendar-legend-text">Condo View</span>
        <span class="calendar-legend-count" id="legend-count-condo-view">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="mountain-view" style="cursor: pointer;">
        <div class="calendar-legend-color legend-color-mountain-view"></div>
        <span class="calendar-legend-text">Mountain View</span>
        <span class="calendar-legend-count" id="legend-count-mountain-view">0</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(legendOverlay);

  // Add drag functionality to legend
  makeLegendDraggable(legendOverlay);
  clampLegendToViewport(legendOverlay);

  // Click a legend item to dim every non-matching event on the calendar
  setupLegendFilterClicks(legendOverlay);
}

// Classify a calendar event against every legend key.
// Shared by updateLegendCounts() (tallying) and applyLegendFilter() (dim/highlight),
// so the two never drift apart.
function classifyEventForLegend(event) {
  const status = event.extendedProps?.bookingStatus || '';
  const paymentStatus = (() => {
    const raw = (event.extendedProps?.paymentStatus || 'unpaid').toLowerCase();
    if (raw === 'partial_paid') return 'partial';
    return raw;
  })();
  const isFullyPaid = paymentStatus === 'paid';
  const isOTA = (() => {
    const channel = String(event.extendedProps?.bookingChannel || '').trim().toLowerCase();
    return channel === 'booking-channel' || channel === 'booking channel';
  })();
  const holdPendingRaw = event.extendedProps?.holdPending;
  const isHoldPending = holdPendingRaw === 1 || holdPendingRaw === '1' || holdPendingRaw === true
    || String(holdPendingRaw).toLowerCase() === 'true';

  const flags = {
    // Booking-phase buckets (mutually exclusive, one true per event)
    'checkin-paid': false,
    'checkin-unpaid': false,
    'reservation-paid': false,
    'reservation-unconfirmed': false,
    'ota-prepaid': false,
    'pencil-booking': false,
    'checkout-paid': false,
    'checkout-unpaid': false,
    'cancelled': false,
    // Side indicators (independent booleans, can combine with any phase bucket above)
    'late-checkout-btb': (typeof isLateCheckout === 'function' && isLateCheckout(event)) || !!event.extendedProps?.isBackToBack,
    'reservation-fee-paid': paymentStatus === 'partial',
    'late-checkin': typeof isLateCheckIn === 'function' && isLateCheckIn(event),
    // Other
    'long-term': !!event.extendedProps?.isLongTermStay
  };

  if (status === 'cancelled' || status === 'maintenance') {
    flags.cancelled = true;
    return flags;
  }

  if (status === 'check-In') {
    if (isFullyPaid) flags['checkin-paid'] = true; else flags['checkin-unpaid'] = true;
    return flags;
  }

  if (status === 'check-Out') {
    if (isFullyPaid) flags['checkout-paid'] = true; else flags['checkout-unpaid'] = true;
    return flags;
  }

  if (status === 'pending') {
    if (isHoldPending) {
      flags['pencil-booking'] = true;
    } else if (isOTA) {
      flags['ota-prepaid'] = true;
    } else if (isFullyPaid) {
      flags['reservation-paid'] = true;
    } else {
      flags['reservation-unconfirmed'] = true;
    }
  }

  return flags;
}

function updateLegendCounts() {
  if (!calendar) return;

  // Prefer live calendar events; fall back to last fetched payload if FC has none yet
  let events = calendar.getEvents();
  if ((!events || events.length === 0) && Array.isArray(window.allCalendarEvents) && window.allCalendarEvents.length) {
    events = window.allCalendarEvents.map((e) => ({
      id: e.id,
      backgroundColor: e.backgroundColor,
      extendedProps: e.extendedProps || {}
    }));
  }

  const counts = {
    'checkin-paid': 0,
    'checkin-unpaid': 0,
    'reservation-paid': 0,
    'reservation-unconfirmed': 0,
    'ota-prepaid': 0,
    'pencil-booking': 0,
    'checkout-paid': 0,
    'checkout-unpaid': 0,
    'cancelled': 0,
    'late-checkout-btb': 0,
    'reservation-fee-paid': 0,
    'late-checkin': 0,
    'long-term': 0
  };

  events.forEach(event => {
    const flags = classifyEventForLegend(event);
    Object.keys(counts).forEach(key => {
      if (flags[key]) counts[key]++;
    });
  });

  // Update legend counts
  Object.keys(counts).forEach(key => {
    updateLegendCount(`legend-count-${key}`, counts[key]);
  });
  updateRoomViewLegendCounts();

  // Re-apply the active dim filter (if any) so newly added/changed events stay in sync
  applyLegendFilter();
}

function updateRoomViewLegendCounts() {
  const floors = window.allCalendarFloors || [];
  let condo = 0;
  let mountain = 0;
  floors.forEach(floor => {
    (floor.children || []).forEach(room => {
      const view = parseInt(room.roomView, 10);
      if (view === 1) condo += 1;
      else if (view === 2) mountain += 1;
    });
  });
  updateLegendCount('legend-count-condo-view', condo);
  updateLegendCount('legend-count-mountain-view', mountain);
}

// ============================================================
// LEGEND CLICK-TO-FILTER (dim non-matching events / filter rooms by view)
// Multi-select: OR within a category, AND across categories.
// Example: Occupied + Fully Paid → only occupied bookings that are fully paid.
// ============================================================
const activeLegendFilterKeys = new Set();

const ROOM_VIEW_LEGEND_KEYS = {
  'condo-view': 1,
  'mountain-view': 2
};

const LEGEND_FILTER_GROUPS = {
  booking: new Set([
    'checkin-paid',
    'checkin-unpaid',
    'reservation-paid',
    'reservation-unconfirmed',
    'ota-prepaid',
    'pencil-booking',
    'checkout-paid',
    'checkout-unpaid',
    'cancelled'
  ]),
  sideIndicator: new Set(['late-checkout-btb', 'reservation-fee-paid', 'late-checkin']),
  other: new Set(['long-term']),
  roomView: new Set(['condo-view', 'mountain-view'])
};

function getLegendFilterGroup(key) {
  for (const [groupName, keys] of Object.entries(LEGEND_FILTER_GROUPS)) {
    if (keys.has(key)) return groupName;
  }
  return null;
}

function getActiveRoomViewFilters() {
  const views = [];
  activeLegendFilterKeys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(ROOM_VIEW_LEGEND_KEYS, key)) {
      views.push(ROOM_VIEW_LEGEND_KEYS[key]);
    }
  });
  return views.length ? views : null;
}

// Back-compat for callers that expect a single value
function getActiveRoomViewFilter() {
  const views = getActiveRoomViewFilters();
  return views && views.length === 1 ? views[0] : (views ? views[0] : null);
}

function isRoomViewLegendKey(key) {
  return Object.prototype.hasOwnProperty.call(ROOM_VIEW_LEGEND_KEYS, key);
}

function hasActiveEventLegendFilters() {
  for (const key of activeLegendFilterKeys) {
    if (!isRoomViewLegendKey(key)) return true;
  }
  return false;
}

function eventMatchesActiveLegendFilters(flags) {
  const activeByGroup = {};

  activeLegendFilterKeys.forEach((key) => {
    if (isRoomViewLegendKey(key)) return;
    const group = getLegendFilterGroup(key);
    if (!group) return;
    if (!activeByGroup[group]) activeByGroup[group] = [];
    activeByGroup[group].push(key);
  });

  const groups = Object.keys(activeByGroup);
  if (!groups.length) return true;

  // AND across categories, OR within the same category
  return groups.every((group) =>
    activeByGroup[group].some((key) => !!flags[key])
  );
}

function applyLegendFilter() {
  if (!calendar) return;

  const events = calendar.getEvents();
  const filterEvents = hasActiveEventLegendFilters();

  events.forEach(event => {
    const el = window.eventElements && window.eventElements[event.id];
    if (!el) return;

    if (!filterEvents) {
      el.classList.remove('legend-dimmed');
      return;
    }

    const flags = classifyEventForLegend(event);
    if (eventMatchesActiveLegendFilters(flags)) {
      el.classList.remove('legend-dimmed');
    } else {
      el.classList.add('legend-dimmed');
    }
  });
}

function syncLegendActiveClasses() {
  document.querySelectorAll('.calendar-legend-item[data-legend-key]').forEach(item => {
    const key = item.getAttribute('data-legend-key');
    item.classList.toggle('legend-item-active', activeLegendFilterKeys.has(key));
  });
}

function setLegendFilter(key) {
  if (!key) return;

  const hadRoomView = [...activeLegendFilterKeys].some(isRoomViewLegendKey);

  if (activeLegendFilterKeys.has(key)) {
    activeLegendFilterKeys.delete(key);
  } else {
    activeLegendFilterKeys.add(key);
  }

  syncLegendActiveClasses();

  const hasRoomView = [...activeLegendFilterKeys].some(isRoomViewLegendKey);
  if (
    typeof applyBedFilter === 'function' &&
    (hadRoomView || hasRoomView || isRoomViewLegendKey(key))
  ) {
    applyBedFilter();
  }

  applyLegendFilter();
}

function setupLegendFilterClicks(legendOverlay) {
  legendOverlay.querySelectorAll('.calendar-legend-item[data-legend-key]').forEach(item => {
    item.addEventListener('click', () => {
      setLegendFilter(item.getAttribute('data-legend-key'));
    });
  });
}

function updateLegendCount(elementId, count) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = count;
    
    // Add animation for count changes
    element.style.transform = 'scale(1.2)';
    element.style.color = count > 0 ? '#6f9c40' : '#ffffff';
    setTimeout(() => {
      element.style.transform = 'scale(1)';
    }, 200);
  }
}

function toggleLegend() {
  const legend = document.querySelector('.calendar-legend-overlay');
  if (!legend) return;

  const toggleBtn = legend.querySelector('.calendar-legend-toggle');
  const contents = legend.querySelectorAll('.calendar-legend-content');
  const isCollapsed = legend.classList.contains('minimized');

  if (isCollapsed) {
    contents.forEach((content) => content.classList.remove('collapsed'));
    legend.classList.remove('minimized');
    if (toggleBtn) toggleBtn.textContent = '−';
  } else {
    contents.forEach((content) => content.classList.add('collapsed'));
    legend.classList.add('minimized');
    if (toggleBtn) toggleBtn.textContent = '→';
  }

  if (typeof window.clampLegendToViewport === 'function') {
    window.clampLegendToViewport(legend);
  }
}

function clampLegendToViewport(legend) {
  if (!legend || legend.classList.contains('minimized')) return;

  const margin = 8;
  const rect = legend.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let shiftX = 0;
  let shiftY = 0;

  if (rect.right > vw - margin) shiftX -= rect.right - (vw - margin);
  if (rect.left < margin) shiftX += margin - rect.left;
  if (rect.bottom > vh - margin) shiftY -= rect.bottom - (vh - margin);
  if (rect.top < margin) shiftY += margin - rect.top;

  if (shiftX === 0 && shiftY === 0) return;

  const transform = legend.style.transform || '';
  const match = transform.match(/translate3d\(\s*([-\d.]+)px,\s*([-\d.]+)px/);
  const currentX = match ? parseFloat(match[1]) : 0;
  const currentY = match ? parseFloat(match[2]) : 0;
  legend.style.transform = `translate3d(${currentX + shiftX}px, ${currentY + shiftY}px, 0)`;
  legend.dataset.legendOffsetX = String(currentX + shiftX);
  legend.dataset.legendOffsetY = String(currentY + shiftY);
}

function makeLegendDraggable(legend) {
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;
  let xOffset = parseFloat(legend.dataset.legendOffsetX || '0') || 0;
  let yOffset = parseFloat(legend.dataset.legendOffsetY || '0') || 0;

  legend.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  window.addEventListener('resize', () => clampLegendToViewport(legend));

  function dragStart(e) {
    if (e.target.classList.contains('calendar-legend-toggle')) {
      return;
    }

    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === legend || legend.contains(e.target)) {
      isDragging = true;
    }
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();

    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
    setTranslate(currentX, currentY, legend);
  }

  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    clampLegendToViewport(legend);
    xOffset = parseFloat(legend.dataset.legendOffsetX || String(xOffset)) || xOffset;
    yOffset = parseFloat(legend.dataset.legendOffsetY || String(yOffset)) || yOffset;
  }

  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    el.dataset.legendOffsetX = String(xPos);
    el.dataset.legendOffsetY = String(yPos);
  }
}

window.clampLegendToViewport = clampLegendToViewport;

// Global function for legend toggle (accessible from HTML)
window.toggleLegend = toggleLegend;

