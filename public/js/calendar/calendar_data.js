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
// GROUP SELECT (auto-detected): dragging within one room works exactly as before
// (single-booking modal). Sweeping the drag down into other rooms along the way
// is auto-detected as a group booking and hands off to that modal instead - no
// separate mode/button needed.
// =============================================================================

const armedRoomIds = new Set();

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
    text: '1BR',
    click: function() {
      toggleBedFilter('1');
    }
  },

  bed2Filter: {
    text: '2BR',
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
      roomNumber: room.ROOM_NUMBER,
      bedCount: room.ROOM_BED
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

    window.allCalendarFloors = sortedFloors;
    window.allCalendarEvents = events;

    // Render calendar with performance optimization
    const renderStart = Date.now();

    calendar.getResources().forEach(resource => resource.remove());
    calendar.setOption('resources', sortedFloors);
    calendar.removeAllEvents();
    calendar.addEventSource(events);
    calendar.render();
    applyBedFilter();
    if (groupCreateModeActive && groupCreateSelectedRooms.size && groupCreateDateRange) {
      renderGroupCreateOverlays();
    }

    const renderTime = Date.now() - renderStart;

    // Setup UI enhancements
    const scrollbarData = setupScrollbar();
    if (scrollbarData) {
      scrollToToday(scrollbarData.bodyScroller, scrollbarData.top);
      updateHeaderOnScroll(scrollbarData.bodyScroller, scrollbarData.top);
    }
    refreshGroupOverlayScrollSync();
    refreshCalendarVerticalScrollSync();

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

async function refreshCalendarBookings() {
  if (!calendar) return;

  try {
    const bookingsResponse = await fetch('/calendar/api/bookings/optimized');
    if (!bookingsResponse.ok) {
      throw new Error(`Bookings API error: ${bookingsResponse.status}`);
    }

    const bookingsData = await bookingsResponse.json();
    const events = Array.isArray(bookingsData) ? bookingsData : [];

    window.allCalendarEvents = events;
    calendar.removeAllEvents();
    calendar.addEventSource(events);
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
    selectAllow: function(selectInfo) {
      return selectInfo.resource && !isFloorResourceId(selectInfo.resource.id);
    },
    // Resize options - compatible with older FullCalendar versions
    eventResize: true, // Enable event resizing
    eventResizableFromStart: false, // Only allow resizing from the end (extend checkout)
    
    // Note: eventDropTransformers removed - using eventDrop handler instead

    select: function(info) {
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

      // AUTO-DETECTED GROUP SELECT: if the drag swept into more than one room,
      // treat it as a group booking and open that modal instead of the normal
      // single-booking one. A plain single-room drag falls through unchanged below.
      if (isFloorResourceId(info.resource.id)) {
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
      return arg.resource.title;
    },

    resourceLabelDidMount: function(arg) {
      if (arg.resource.extendedProps.isFloor) {
        arg.el.setAttribute('data-is-floor', 'true');
        return;
      }

      // Re-apply the armed highlight after view re-renders (e.g. changing weeks)
      if (armedRoomIds.has(String(arg.resource.id))) {
        arg.el.classList.add('group-select-armed');
      }
      if (groupCreateSelectedRooms.has(String(arg.resource.id))) {
        arg.el.classList.add('group-create-armed');
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

  const filteredFloors = !activeBedFilter
    ? window.allCalendarFloors
    : window.allCalendarFloors
        .map(floor => ({
          ...floor,
          children: (floor.children || []).filter(room => String(room.bedCount) === activeBedFilter)
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
      const checkInStatus = event.extendedProps?.checkInStatus;
      const holdPending = event.extendedProps?.holdPending;
      const isHoldPending = holdPending === 1 || holdPending === '1' || holdPending === true;

      // Determine display status and color
      let displayStatus = eventStatus;
      let statusColor = '#b0b0b0';

      if (eventStatus === 'pending' && isHoldPending) {
        displayStatus = 'Hold Pending';
        statusColor = '#FF6D00'; // Bright orange for hold pending
      } else if (eventStatus === 'pending') {
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
window.loadCalendarData = loadCalendarData;
window.refreshCalendarBookings = refreshCalendarBookings;
window.refreshCalendarAfterBookingSave = refreshCalendarAfterBookingSave;
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
      <div class="calendar-legend-item" data-legend-key="hold-pending">
        <div class="calendar-legend-color legend-color-hold-pending"></div>
        <span class="calendar-legend-text">Hold Pending</span>
        <span class="calendar-legend-count" id="legend-count-hold-pending">0</span>
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
    'hold-pending': false,
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
    const holdPending = event.extendedProps?.holdPending;
    if (holdPending === 1 || holdPending === '1' || holdPending === true || backgroundColor === '#FF6D00') {
      flags['hold-pending'] = true;
      return flags;
    }
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
    'hold-pending': 0,
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
  updateLegendCount('legend-count-hold-pending', counts['hold-pending']);
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

