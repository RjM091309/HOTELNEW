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
        <span class="calendar-legend-text">Late Check-in</span>
        <span class="calendar-legend-count" id="legend-count-late-checkin">0</span>
      </div>
      <div class="calendar-legend-item">
        <div class="calendar-legend-color legend-color-regular-checkin"></div>
        <span class="calendar-legend-text">Regular Check-in</span>
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
    
    // Determine status based on background color and extended properties
    if (status === 'check-In' || backgroundColor === 'green' || backgroundColor === '#43a047') {
      counts.occupied++;
    } else if (status === 'pending' && (backgroundColor === 'orange' || backgroundColor === '#fb8c00')) {
      counts.lateCheckin++;
    } else if (status === 'pending' && (backgroundColor === 'blue' || backgroundColor === '#42a5f5')) {
      counts.regularCheckin++;
    } else if (status === 'check-Out' || backgroundColor === '#B3B3B3' || backgroundColor === '#6c757d') {
      counts.checkout++;
    } else if (status === 'cancelled' || backgroundColor === 'yellow' || backgroundColor === '#fd3535') {
      counts.cancelled++;
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

