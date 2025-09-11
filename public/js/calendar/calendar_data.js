// =============================================================================
// CALENDAR CONFIGURATION AND INITIALIZATION
// =============================================================================

// Load booking module first to ensure all booking functions are available
// This module contains all booking-related functionality
// <script src="/js/calendar/calendar_booking_data.js"></script>

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

  // Build & insert the top scrollbar
  let top = document.getElementById('top-scroller');
  if (!top) {
    top = document.createElement('div');
    top.id = 'top-scroller';
    top.innerHTML = '<div></div>';
    const grid = document.querySelector('#calendar .fc-scrollgrid');
    if (grid) {
      grid.parentNode.insertBefore(top, grid);
    }
  }

  // Size & two-way sync
  const inner = top.firstElementChild;
  inner.style.width = bodyScroller.scrollWidth + 'px';
  top.scrollLeft = bodyScroller.scrollLeft;
  top.addEventListener('scroll', () => bodyScroller.scrollLeft = top.scrollLeft);
  bodyScroller.addEventListener('scroll', () => top.scrollLeft = bodyScroller.scrollLeft);

  return { bodyScroller, top };
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
  let timeRow = document.querySelector(`.fc-timeline-body tr[data-resource-id="${resourceId}"]`);
  if (!timeRow) {
    const resRow = document.querySelector(`.fc-resource-area tr[data-resource-id="${resourceId}"]`);
    if (resRow && resRow.parentElement) {
      const idx = Array.prototype.indexOf.call(resRow.parentElement.children, resRow);
      timeRow = document.querySelectorAll('.fc-timeline-body tbody tr')[idx];
    }
  }
  return timeRow || null;
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

  // LEFT-ALIGN today
  bodyScroller.scrollLeft = diffDays * dayWidth;
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

function updateHeaderOnScroll(bodyScroller, top) {
  const view = calendar.view;
  const toolbarTitle = document.querySelector('.fc-toolbar-title');
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = (view.activeEnd.getTime() - view.activeStart.getTime()) / msPerDay;
  const dayWidth = bodyScroller.scrollWidth / totalDays;
  
  let throttle;
  bodyScroller.addEventListener('scroll', () => {
    clearTimeout(throttle);
    throttle = setTimeout(() => {
      const daysFromStart = bodyScroller.scrollLeft / dayWidth;
      const leftDate = new Date(view.activeStart.getTime() + daysFromStart * msPerDay);
      toolbarTitle.textContent = leftDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }, 0);
  });

  // Initial header update
  const daysFromStart = bodyScroller.scrollLeft / dayWidth;
  const leftDate = new Date(view.activeStart.getTime() + daysFromStart * msPerDay);
  toolbarTitle.textContent = leftDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// =============================================================================
// HOVER ENHANCEMENTS
// =============================================================================

function setupHoverEffects() {
  const slots = document.querySelectorAll('.fc-timeline-slot');

  function getLaneCellFromSlot(slotEl) {
    return slotEl.closest('td.fc-timeline-lane');
  }

  slots.forEach(slot => {
    slot.addEventListener('mouseenter', function (e) {
      const isOverEvent = !!e.target.closest('.fc-event');

      // === Vertical hover ===
      this.classList.add('fc-slot-hover');
      if (!isOverEvent) {
        this.classList.add('fc-slot-pointer');
        this.setAttribute('title', 'Click to book this time slot');
      }

      // === Horizontal hover (time side) ===
      const laneTd = getLaneCellFromSlot(this);
      laneTd?.classList.add('fc-lane-hover');

      // === Horizontal mirror (resource side) ===
      const timeRow = this.closest('tr');
      let resRow = document.querySelector(`.fc-resource-area tr[data-resource-id="${timeRow?.dataset?.resourceId}"]`);
      if (!resRow && timeRow?.parentElement) {
        const idx = Array.prototype.indexOf.call(timeRow.parentElement.children, timeRow);
        resRow = document.querySelectorAll('.fc-resource-area .fc-datagrid-body tbody tr, .fc-resource-area tbody tr')[idx];
      }
      resRow?.classList.add('fc-row-hover');
    });

    slot.addEventListener('mouseleave', function () {
      // vertical
      this.classList.remove('fc-slot-hover', 'fc-slot-pointer');
      this.removeAttribute('title');

      // horizontal (time side)
      const laneTd = getLaneCellFromSlot(this);
      laneTd?.classList.remove('fc-lane-hover');

      // horizontal mirror (resource side)
      const timeRow = this.closest('tr');
      let resRow = document.querySelector(`.fc-resource-area tr[data-resource-id="${timeRow?.dataset?.resourceId}"]`);
      if (!resRow && timeRow?.parentElement) {
        const idx = Array.prototype.indexOf.call(timeRow.parentElement.children, timeRow);
        resRow = document.querySelectorAll('.fc-resource-area .fc-datagrid-body tbody tr, .fc-resource-area tbody tr')[idx];
      }
      resRow?.classList.remove('fc-row-hover');
    });
  });

  // Left resource cells hover (para mag-highlight din time side)
  const resourceCells = document.querySelectorAll('.fc-resource-area .fc-datagrid-cell');
  resourceCells.forEach(cell => {
    cell.addEventListener('mouseenter', function () {
      const tr = this.closest('tr');
      if (!tr) return;

      tr.classList.add('fc-row-hover');

      let timeRow = document.querySelector(`.fc-timeline-body tr[data-resource-id="${tr.dataset?.resourceId}"]`);
      if (!timeRow && tr?.parentElement) {
        const idx = Array.prototype.indexOf.call(tr.parentElement.children, tr);
        timeRow = document.querySelectorAll('.fc-timeline-body tbody tr')[idx];
      }
      timeRow?.classList.add('fc-lane-hover');
    });

    cell.addEventListener('mouseleave', function () {
      const tr = this.closest('tr');
      if (!tr) return;

      tr.classList.remove('fc-row-hover');

      let timeRow = document.querySelector(`.fc-timeline-body tr[data-resource-id="${tr.dataset?.resourceId}"]`);
      if (!timeRow && tr?.parentElement) {
        const idx = Array.prototype.indexOf.call(tr.parentElement.children, tr);
        timeRow = document.querySelectorAll('.fc-timeline-body tbody tr')[idx];
      }
      timeRow?.classList.remove('fc-lane-hover');
    });
  });

  // Event hover effect
  const events = document.querySelectorAll('.fc-event');
  events.forEach(ev => {
    ev.addEventListener('mouseenter', function () {
      this.style.zIndex = '20';
      this.style.boxShadow = '0 6px 16px rgba(0,0,0,.4), 0 3px 8px rgba(0,0,0,.3)';
      this.style.transition = 'box-shadow .2s ease';
    });
    ev.addEventListener('mouseleave', function () {
      this.style.zIndex = '';
      this.style.boxShadow = '0 4px 12px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.2)';
    });
  });
}


// =============================================================================
// CALENDAR EVENT HANDLERS
// =============================================================================

// These functions are now moved to calendar_booking_data.js module
// They are available globally via window.handleEventClick, window.handleEventDidMount, window.handleDatesSet

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
  }
};


// =============================================================================
// VIEW CONFIGURATIONS
// =============================================================================

function getDayClassNames(date) {
  const classes = [];
  const day = date.getDay();
  const today = new Date();

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
    }
  },

  month: {
    type: 'resourceTimeline',
    slotDuration: { hours: 12 },
    dateAlignment: 'day',
    visibleRange() {
      const today = new Date();
      const Y = today.getFullYear(), M = today.getMonth();
      return { start: new Date(Y, M - 3, 1), end: new Date(Y, M + 4, 1) };
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
      roomNumber: room.ROOM_NUMBER
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

// These functions are now moved to calendar_booking_data.js module
// They are available globally via window.processBookingsData and window.getBookingColor

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

  // Align with booking logic: Check-in 2:00 PM, Check-out 11:00 AM
  const startAt = new Date(startDate);
  startAt.setHours(14, 0, 0, 0); // PM cell
  const endAt = new Date(endDate);
  endAt.setHours(11, 0, 0, 0);   // AM cell

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
            // match booking bar skew from calendar.css (.fc-event has skew -35deg)
            // compute extra width to compensate so tips are not cropped
            const skewDeg = 35; // keep in sync with CSS
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
            overlay.style.transform = 'skew(-35deg)';
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
      z-index: 2147483000;
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

function loadCalendarData() {
  // Loading removed for faster performance
  
  fetch('/calendar/rooms')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(roomsData => {
      if (!Array.isArray(roomsData)) {
        console.error('❌ Rooms data is not an array:', roomsData);
        roomsData = [];
      }
      
      return fetch('/calendar/bookings')
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(bookingsData => {
          if (!Array.isArray(bookingsData)) {
            console.error('❌ Bookings data is not an array:', bookingsData);
            bookingsData = [];
          }
          
          const sortedFloors = processRoomsData(roomsData);
          const events = processBookingsData(bookingsData);

          // Set resources and events
          calendar.getResources().forEach(resource => resource.remove());
          calendar.setOption('resources', sortedFloors);
          calendar.removeAllEvents();
          calendar.addEventSource(events);
          calendar.render();

          // Setup scrollbar immediately after render
          const scrollbarData = setupScrollbar();
          if (scrollbarData) {
            scrollToToday(scrollbarData.bodyScroller, scrollbarData.top);
            updateHeaderOnScroll(scrollbarData.bodyScroller, scrollbarData.top);
          }

          window.calendar = calendar;
          setupScrollToDate();
          
          // Setup hover effects immediately
          setupHoverEffects();

          // Apply any pending highlight passed from navbar/datePicker (URL or localStorage)
          try {
            applyIncomingHighlight();
          } catch (e) {
            // silent
          }
        })
        .catch(handleDataError);
    })
    .catch(handleDataError);
}

function handleDataError(err) {
  console.error("❌ Error loading data:", err);
  hideLoading();
  
  const calendarEl = document.getElementById('calendar');
  if (calendarEl) {
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
    height: '850px',
    eventOverlap: false,
    editable: true,
    selectable: true,
    // Resize options - compatible with older FullCalendar versions
    eventResize: true, // Enable event resizing
    eventResizableFromStart: false, // Only allow resizing from the end (extend checkout)
    
    // Note: eventDropTransformers removed - using eventDrop handler instead

    select: function(info) {
      const modal = $('#modal-addbooking');
      modal.data('calendar-room-id', info.resource.id);
      modal.data('calendar-start', info.start);
      modal.data('calendar-end', info.end);
      modal.modal('show');
      calendar.unselect();
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
      left:  'dayPrev customToday dayNext',
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
      return arg.resource.title;
    },

    resources: [],
    events: []
  });

  // Load data
  loadCalendarData();
  
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

});

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
      <h3 class="calendar-legend-title">Booking Status</h3>
      <button class="calendar-legend-toggle" onclick="toggleLegend()">−</button>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-occupied"></div>
        <span class="calendar-legend-text">Occupied (Checked In)</span>
        <span class="calendar-legend-count" id="legend-count-occupied">0</span>
      </div>
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-late-checkin"></div>
        <span class="calendar-legend-text">Pending – Late (CI/CO)</span>
        <span class="calendar-legend-count" id="legend-count-late-checkin">0</span>
      </div>
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-regular-checkin"></div>
        <span class="calendar-legend-text">Pending – Regular (CI/CO)</span>
        <span class="calendar-legend-count" id="legend-count-regular-checkin">0</span>
      </div>
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-checkout"></div>
        <span class="calendar-legend-text">Checked Out</span>
        <span class="calendar-legend-count" id="legend-count-checkout">0</span>
      </div>
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-cancelled"></div>
        <span class="calendar-legend-text">Cancelled</span>
        <span class="calendar-legend-count" id="legend-count-cancelled">0</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(legendOverlay);
  
  // Add drag functionality to legend
  makeLegendDraggable(legendOverlay);
}

function updateLegendCounts() {
  if (!calendar) return;
  
  const events = calendar.getEvents();
  const counts = {
    occupied: 0,
    lateCheckin: 0,
    regularCheckin: 0,
    checkout: 0,
    cancelled: 0
  };
  
  events.forEach(event => {
    const status = event.extendedProps?.bookingStatus || '';
    const backgroundColor = event.backgroundColor || '';
    const ci = event.extendedProps?.checkInStatus;   // 1=regular,0=late
    const co = event.extendedProps?.checkOutStatus;  // 0=regular,1=late

    // Occupied
    if (status === 'check-In' || backgroundColor === 'green' || backgroundColor === '#43a047') {
      counts.occupied++;
      return;
    }
    // Checked out
    if (status === 'check-Out' || backgroundColor === '#B3B3B3' || backgroundColor === '#6c757d') {
      counts.checkout++;
      return;
    }
    // Cancelled
    if (status === 'cancelled' || backgroundColor === '#000000') {
      counts.cancelled++;
      return;
    }

    // Pending: determine late vs regular based on composite statuses
    if (status === 'pending') {
      // If either CI is late (0) or CO is late (1), count as late; otherwise regular
      const isLate = (ci === 0) || (co === 1) || (ci === undefined && co === undefined && backgroundColor === '#fff700');
      if (isLate) counts.lateCheckin++; else counts.regularCheckin++;
    }
  });
  
  // Update legend counts
  updateLegendCount('legend-count-occupied', counts.occupied);
  updateLegendCount('legend-count-late-checkin', counts.lateCheckin);
  updateLegendCount('legend-count-regular-checkin', counts.regularCheckin);
  updateLegendCount('legend-count-checkout', counts.checkout);
  updateLegendCount('legend-count-cancelled', counts.cancelled);
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
  const toggleBtn = legend.querySelector('.calendar-legend-toggle');
  const content = legend.querySelector('.calendar-legend-content');
  
  if (content.classList.contains('collapsed')) {
    // Expand
    content.classList.remove('collapsed');
    legend.classList.remove('minimized');
    toggleBtn.textContent = '−'; // Minus sign to minimize
  } else {
    // Collapse
    content.classList.add('collapsed');
    legend.classList.add('minimized');
    toggleBtn.textContent = '→'; // Right arrow to indicate expandable
  }
}

function makeLegendDraggable(legend) {
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;
  
  legend.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  function dragStart(e) {
    if (e.target.classList.contains('calendar-legend-toggle')) {
      return; // Don't drag when clicking toggle button
    }
    
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    
    if (e.target === legend || legend.contains(e.target)) {
      isDragging = true;
    }
  }
  
  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      xOffset = currentX;
      yOffset = currentY;
      
      setTranslate(currentX, currentY, legend);
    }
  }
  
  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }
  
  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

// Global function for legend toggle (accessible from HTML)
window.toggleLegend = toggleLegend;

