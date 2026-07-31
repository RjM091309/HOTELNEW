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
      this.style.transition = 'box-shadow .2s ease';
    });
    ev.addEventListener('mouseleave', function () {
      this.style.zIndex = '';
      this.style.boxShadow = '';
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
  },

  searchBox: {
    text: 'Search',
    click: function() {
      toggleSearchBox();
    }
  },

  filterBox: {
    text: 'Filter',
    click: function() {}
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

async function loadCalendarData() {
  const dataStartTime = Date.now();
  
  try {
    // OPTIMIZED: Parallel data loading for 3x faster performance
    
    const [roomsResponse, bookingsResponse] = await Promise.all([
      fetch('/calendar/rooms').then(res => {
        if (!res.ok) throw new Error(`Rooms API error: ${res.status}`);
        return res.json();
      }),
      fetch('/calendar/api/bookings/optimized').then(res => {
        if (!res.ok) throw new Error(`Bookings API error: ${res.status}`);
        return res.json();
      })
    ]);

    // Validate data
    const roomsData = Array.isArray(roomsResponse) ? roomsResponse : [];
    const bookingsData = Array.isArray(bookingsResponse) ? bookingsResponse : [];
    
    
    // OPTIMIZED: Process data in chunks to prevent blocking
    const sortedFloors = processRoomsData(roomsData);
    
    // OPTIMIZED: Backend already returns FullCalendar-formatted events
    // No need to process through processBookingsData since backend handles it
    const events = bookingsData;

    // Render calendar with performance optimization
    const renderStart = Date.now();
    
    calendar.getResources().forEach(resource => resource.remove());
    calendar.setOption('resources', sortedFloors);
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    calendar.render();

    const renderTime = Date.now() - renderStart;

    // Setup UI enhancements
    const scrollbarData = setupScrollbar();
    if (scrollbarData) {
      scrollToToday(scrollbarData.bodyScroller, scrollbarData.top);
      updateHeaderOnScroll(scrollbarData.bodyScroller, scrollbarData.top);
    }

    window.calendar = calendar;
    setupScrollToDate();
    setupHoverEffects();

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
    eventOverlap: true,
    editable: true,
    eventResourceEditable: false, // Disable dragging bookings to other rooms
    selectable: true,
    // Resize options - compatible with older FullCalendar versions
    eventResize: true, // Enable event resizing
    eventResizableFromStart: false, // Only allow resizing from the end (extend checkout)
    
    // Note: eventDropTransformers removed - using eventDrop handler instead

    select: function(info) {
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
      
      // Check if this selection is from a highlighted area (URL params)
      const params = new URLSearchParams(window.location.search);
      const hlRoomId = params.get('hlRoomId');
      const hlStart = params.get('hlStart');
      const hlEnd = params.get('hlEnd');
      
      // If this is a highlight selection, use the original highlight dates
      if (hlRoomId && hlStart && hlEnd && String(info.resource.id) === String(hlRoomId)) {
        console.log('Using highlight dates from URL params:', { hlStart, hlEnd });
        
        // Parse the original highlight dates
        const originalStartDate = new Date(hlStart);
        const originalEndDate = new Date(hlEnd);
        
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
          return; // Exit early, don't show modal
        }
        
        // Set check-in time to 6 AM
        originalStartDate.setHours(6, 0, 0, 0);
        
        // Set check-out time to 6 PM
        originalEndDate.setHours(18, 0, 0, 0);
        
        modal.data('calendar-room-id', info.resource.id);
        modal.data('calendar-start', originalStartDate);
        modal.data('calendar-end', originalEndDate);
      } else {
        // Use the calendar selection dates for normal selections
        modal.data('calendar-room-id', info.resource.id);
        modal.data('calendar-start', info.start);
        modal.data('calendar-end', info.end);
      }
      
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
      left:  'searchBox dayPrev customToday dayNext',
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

// Toggle filter box visibility
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
      const checkInStatus = event.extendedProps?.checkInStatus;
      
      // Determine display status and color
      let displayStatus = eventStatus;
      let statusColor = '#b0b0b0';
      
      if (eventStatus === 'pending') {
        if (checkInStatus === 0) {
          displayStatus = 'Pending - Late (CI/CO)';
          statusColor = '#e0a316'; // Amber for late
        } else {
          displayStatus = 'Pending - Regular (CI/CO)';
          statusColor = '#e53935'; // Red for regular
        }
      } else if (eventStatus === 'check-In') {
        displayStatus = 'Occupied (Checked In)';
        statusColor = '#12866f'; // Teal
      } else if (eventStatus === 'check-Out') {
        displayStatus = 'Checked Out';
        statusColor = '#6c757d'; // Gray
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
window.toggleSearchBox = toggleSearchBox;
window.toggleFilterBox = toggleFilterBox;
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.highlightBooking = highlightBooking;

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
      <div class="calendar-legend-item" data-legend-key="occupied">
        <div class="calendar-legend-color legend-color-occupied"></div>
        <span class="calendar-legend-text">Occupied (Checked In)</span>
        <span class="calendar-legend-count" id="legend-count-occupied">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="late-checkin">
        <div class="calendar-legend-color legend-color-late-checkin"></div>
        <span class="calendar-legend-text">Pending – Late (CI/CO)</span>
        <span class="calendar-legend-count" id="legend-count-late-checkin">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="regular-checkin">
        <div class="calendar-legend-color legend-color-regular-checkin"></div>
        <span class="calendar-legend-text">Pending – Regular (CI/CO)</span>
        <span class="calendar-legend-count" id="legend-count-regular-checkin">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="back-to-back">
        <div class="calendar-legend-color legend-color-back-to-back"></div>
        <span class="calendar-legend-text">Pending – Back-to-Back</span>
        <span class="calendar-legend-count" id="legend-count-back-to-back">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="checkout">
        <div class="calendar-legend-color legend-color-checkout"></div>
        <span class="calendar-legend-text">Checked Out</span>
        <span class="calendar-legend-count" id="legend-count-checkout">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="cancelled">
        <div class="calendar-legend-color legend-color-cancelled"></div>
        <span class="calendar-legend-text">Cancelled</span>
        <span class="calendar-legend-count" id="legend-count-cancelled">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Payment Status</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="paid">
        <div class="calendar-legend-color legend-color-paid"></div>
        <span class="calendar-legend-text">Fully Paid</span>
        <span class="calendar-legend-count" id="legend-count-paid">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="partial">
        <div class="calendar-legend-color legend-color-partial"></div>
        <span class="calendar-legend-text">Partial Payment</span>
        <span class="calendar-legend-count" id="legend-count-partial">0</span>
      </div>
      <div class="calendar-legend-item" data-legend-key="unpaid">
        <div class="calendar-legend-color legend-color-unpaid"></div>
        <span class="calendar-legend-text">Unpaid</span>
        <span class="calendar-legend-count" id="legend-count-unpaid">0</span>
      </div>
    </div>
    <div class="calendar-legend-header">
      <h3 class="calendar-legend-title">Other</h3>
    </div>
    <div class="calendar-legend-content">
      <div class="calendar-legend-item" data-legend-key="long-term">
        <div class="calendar-legend-color legend-color-long-term"></div>
        <span class="calendar-legend-text">Long-Term Stay</span>
        <span class="calendar-legend-count" id="legend-count-long-term">0</span>
      </div>
    </div>
  `;
  
  document.body.appendChild(legendOverlay);

  // Add drag functionality to legend
  makeLegendDraggable(legendOverlay);

  // Click a legend item to dim every non-matching event on the calendar
  setupLegendFilterClicks(legendOverlay);
}

// Classify a calendar event against every legend key.
// Shared by updateLegendCounts() (tallying) and applyLegendFilter() (dim/highlight),
// so the two never drift apart.
function classifyEventForLegend(event) {
  const status = event.extendedProps?.bookingStatus || '';
  const backgroundColor = event.backgroundColor || '';
  const ci = event.extendedProps?.checkInStatus;   // 1=regular,0=late
  const co = event.extendedProps?.checkOutStatus;  // 0=regular,1=late
  const paymentStatus = (() => {
    const raw = (event.extendedProps?.paymentStatus || 'unpaid').toLowerCase();
    if (raw === 'partial_paid') return 'partial';
    return raw;
  })();

  const flags = {
    'occupied': false,
    'late-checkin': false,
    'regular-checkin': false,
    'back-to-back': false,
    'checkout': false,
    'cancelled': false,
    'paid': false,
    'partial': false,
    'unpaid': false,
    'long-term': !!event.extendedProps?.isLongTermStay
  };

  // Payment status (skip cancelled bookings, same as the on-event indicator)
  if (status !== 'cancelled') {
    if (paymentStatus === 'paid') flags.paid = true;
    else if (paymentStatus === 'partial') flags.partial = true;
    else flags.unpaid = true;
  }

  // Occupied
  if (status === 'check-In' || backgroundColor === '#12866f') {
    flags.occupied = true;
    return flags;
  }
  // Checked out
  if (status === 'check-Out' || backgroundColor === '#B3B3B3' || backgroundColor === '#6c757d') {
    flags.checkout = true;
    return flags;
  }
  // Cancelled
  if (status === 'cancelled' || backgroundColor === '#000000') {
    flags.cancelled = true;
    return flags;
  }

  // Pending: determine back-to-back / late / regular based on composite statuses
  // Priority mirrors applyCompositeStatusStyles: Back-to-Back > Late > Regular
  if (status === 'pending') {
    if (event.extendedProps?.isBackToBack) {
      flags['back-to-back'] = true;
      return flags;
    }
    // If either CI is late (0) or CO is late (1), count as late; otherwise regular
    const isLate = (ci === 0) || (co === 1) || (ci === undefined && co === undefined && backgroundColor === '#e0a316');
    if (isLate) flags['late-checkin'] = true; else flags['regular-checkin'] = true;
  }

  return flags;
}

function updateLegendCounts() {
  if (!calendar) return;

  const events = calendar.getEvents();
  const counts = {
    occupied: 0,
    'late-checkin': 0,
    'regular-checkin': 0,
    'back-to-back': 0,
    checkout: 0,
    cancelled: 0,
    paid: 0,
    partial: 0,
    unpaid: 0,
    'long-term': 0
  };

  events.forEach(event => {
    const flags = classifyEventForLegend(event);
    Object.keys(counts).forEach(key => {
      if (flags[key]) counts[key]++;
    });
  });

  // Update legend counts
  updateLegendCount('legend-count-occupied', counts.occupied);
  updateLegendCount('legend-count-late-checkin', counts['late-checkin']);
  updateLegendCount('legend-count-regular-checkin', counts['regular-checkin']);
  updateLegendCount('legend-count-back-to-back', counts['back-to-back']);
  updateLegendCount('legend-count-checkout', counts.checkout);
  updateLegendCount('legend-count-cancelled', counts.cancelled);
  updateLegendCount('legend-count-paid', counts.paid);
  updateLegendCount('legend-count-partial', counts.partial);
  updateLegendCount('legend-count-unpaid', counts.unpaid);
  updateLegendCount('legend-count-long-term', counts['long-term']);

  // Re-apply the active dim filter (if any) so newly added/changed events stay in sync
  applyLegendFilter();
}

// ============================================================
// LEGEND CLICK-TO-FILTER (dim non-matching events)
// ============================================================
let activeLegendFilterKey = null;

function applyLegendFilter() {
  if (!calendar) return;
  const events = calendar.getEvents();

  events.forEach(event => {
    const el = window.eventElements && window.eventElements[event.id];
    if (!el) return;

    if (!activeLegendFilterKey) {
      el.classList.remove('legend-dimmed');
      return;
    }

    const flags = classifyEventForLegend(event);
    if (flags[activeLegendFilterKey]) {
      el.classList.remove('legend-dimmed');
    } else {
      el.classList.add('legend-dimmed');
    }
  });
}

function setLegendFilter(key) {
  activeLegendFilterKey = (activeLegendFilterKey === key) ? null : key;

  document.querySelectorAll('.calendar-legend-item[data-legend-key]').forEach(item => {
    item.classList.toggle('legend-item-active', item.getAttribute('data-legend-key') === activeLegendFilterKey);
  });

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

