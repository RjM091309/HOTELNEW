// Room Checker: two independent month calendars stacked vertically (current month +
// next month by default, each still navigable with prev/next) so staff can browse
// availability further out without needing the full booking-assignment workflow that
// lives on the Unassigned Rooms page. Click-click range selection (see
// handleRoomCheckerDateClick) works across both calendars - e.g. click a day in
// August, then a day in September - and feeds the rate Summary panel.

function roomCheckerFormatDateKey(date) {
  if (typeof date === 'string') {
    const datePart = date.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Click-click range selection (works across both calendars, e.g. click a day in
// August then a day in September): the first click sets a "From" anchor day and
// reveals a Save button in the "Room Checker" card header. Every click after that keeps
// the anchor fixed and re-previews the range from anchor to whichever day was
// just clicked (whichever order they land in) - so staff can freely click around
// to grow/shrink/move the far end before committing. Nothing is applied to the
// Rate Summary panel until Save is clicked; that's also what clears the anchor,
// so the next click after Save starts a brand new selection.
let roomCheckerPendingAnchor = null;
let roomCheckerPreviewRange = null;

// window.__rateSummaryRange defaults to "today, 1 night" on load purely so the
// Rate Summary panel has a real quote to show (see initRateSummary) - that's
// not a staff-made selection, so nothing should be highlighted on the calendar
// until Save actually commits one. Flipped true inside handleRoomCheckerRangeSelect.
let roomCheckerHasCommittedSelection = false;

// Repaints highlighting from the active display range - the pending preview
// while a selection is in progress, otherwise the last Save-committed
// window.__rateSummaryRange - rather than tracking which cells got highlighted.
// FullCalendar tears down and rebuilds a month's cells on every prev/next
// navigation, which would otherwise silently drop the classList changes the
// moment either calendar re-rendered. Called after every selection AND from
// datesRender below, so navigating away from a selected range and back still
// shows it highlighted.
function applyRoomCheckerRangeHighlight() {
  document.querySelectorAll('#room-checker-months td.fc-day.room-checker-range-selected')
    .forEach(cell => cell.classList.remove('room-checker-range-selected'));

  const range = roomCheckerPreviewRange || (roomCheckerHasCommittedSelection ? window.__rateSummaryRange : null);
  if (!range) return;
  // Highlight through the check-out day too (nights + 1 cells) - staff expect to
  // see the full stay span on the calendar (e.g. Aug 31-Sep 3 highlighted for a
  // 3-night stay), even though the check-out day itself isn't a charged night.
  const end = new Date(range.start);
  end.setDate(end.getDate() + range.nights + 1);

  for (const d = new Date(range.start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = roomCheckerFormatDateKey(d);
    document.querySelectorAll(`#room-checker-months td.fc-day[data-date="${dateKey}"]`)
      .forEach(cell => cell.classList.add('room-checker-range-selected'));
  }
}

function toggleRoomCheckerSaveButton(show) {
  const btn = document.getElementById('roomCheckerSaveRangeBtn');
  if (!btn) return;
  // Explicit 'inline-block' (button's native display), not '' - clearing the
  // inline style would just fall back to the stylesheet's display:none rule
  // that hides this button by default, leaving it stuck invisible.
  btn.style.display = show ? 'inline-block' : 'none';
}

function handleRoomCheckerDateClick(info) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (info.date < todayStart) return;

  if (!roomCheckerPendingAnchor) {
    roomCheckerPendingAnchor = info.date;
  }

  // The later of the two clicked dates is the CHECK-OUT date (standard hotel
  // convention, matches the Add/Group Booking modals downstream) - not an
  // occupied night itself, so nights is the plain difference, no +1. A single
  // click (start === checkoutDay) floors to 1 night via Math.max, meaning
  // "check in today, check out tomorrow."
  const start = info.date < roomCheckerPendingAnchor ? info.date : roomCheckerPendingAnchor;
  const checkoutDay = info.date < roomCheckerPendingAnchor ? roomCheckerPendingAnchor : info.date;
  const nights = Math.max(1, Math.round((checkoutDay - start) / (1000 * 60 * 60 * 24)));

  roomCheckerPreviewRange = { start, nights };
  applyRoomCheckerRangeHighlight();
  toggleRoomCheckerSaveButton(true);
}

// Commits the in-progress preview to the Rate Summary panel (see the
// #roomCheckerSaveRangeBtn click handler below) and clears the anchor so the
// next click starts a fresh selection.
function commitRoomCheckerRange() {
  if (!roomCheckerPreviewRange) return;

  const { start, nights } = roomCheckerPreviewRange;
  const end = new Date(start);
  end.setDate(end.getDate() + nights);

  handleRoomCheckerRangeSelect({ start, end });

  roomCheckerPendingAnchor = null;
  roomCheckerPreviewRange = null;
  toggleRoomCheckerSaveButton(false);
}

// Blanks the Rate Summary panel back to its just-loaded state once a booking
// made from it actually saves (see the 'bookingSaved' listener below) - so
// staff aren't left staring at a quote for a room that's now taken, and the
// next lookup starts clean instead of carrying over stale King/Queen counts,
// discount, or breakfast selection.
function resetRoomCheckerSummary() {
  roomCheckerPendingAnchor = null;
  roomCheckerPreviewRange = null;
  roomCheckerHasCommittedSelection = false;
  window.__rateSummaryRange = { start: new Date(), nights: 1 };

  document.getElementById('rateSummaryKingQty').value = 0;
  document.getElementById('rateSummaryQueenQty').value = 0;
  document.getElementById('rateSummaryDiscount').value = 0;
  document.getElementById('rateSummaryDateRange').textContent = 'Select a range on the calendar';

  const noneBreakfast = document.querySelector('input[name="rateSummaryBreakfast"][value="0"]');
  if (noneBreakfast) noneBreakfast.checked = true;

  toggleRoomCheckerSaveButton(false);
  applyRoomCheckerRangeHighlight();
  updateRoomCheckerTodayButtonVisibility();
  fetchRateSummary();
}

$(document).ready(function () {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  initRoomCheckerCalendar('calendar-month-1', today);
  initRoomCheckerCalendar('calendar-month-2', nextMonth);
  initRateSummary();

  const saveRangeBtn = document.getElementById('roomCheckerSaveRangeBtn');
  if (saveRangeBtn) saveRangeBtn.addEventListener('click', commitRoomCheckerRange);

  const todayBtn = document.getElementById('roomCheckerTodayBtn');
  if (todayBtn) todayBtn.addEventListener('click', goToRoomCheckerToday);

  const proceedBtn = document.getElementById('roomCheckerProceedBookingBtn');
  if (proceedBtn) proceedBtn.addEventListener('click', proceedRoomCheckerBooking);

  // Clicking prev/next re-renders both calendars (the other one via
  // syncRoomCheckerCompanionMonth) - a month with a different week-row count
  // changes that calendar's height, which was nudging the shared scroll
  // container's position. Pin the scroll position across that whole click:
  // capture-phase so this runs before FullCalendar's own click handler
  // triggers the render, then restore once it (and the synced companion's
  // render) has settled.
  const monthsEl = document.getElementById('room-checker-months');
  if (monthsEl) {
    monthsEl.addEventListener('click', function (e) {
      if (!e.target.closest('.fc-prev-button, .fc-next-button')) return;
      const scrollTop = monthsEl.scrollTop;
      setTimeout(() => { monthsEl.scrollTop = scrollTop; }, 0);
    }, true);
  }

  document.addEventListener('bookingSaved', resetRoomCheckerSummary);

  const socket = io();
  socket.on('bookingUpdated', () => {
    if (window.roomCheckerCalendars) {
      window.roomCheckerCalendars.forEach(cal => cal.refetchEvents());
    }
  });
});

const BREAKFAST_PRICE = 500;

function formatPeso(amount) {
  return '₱' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Selected date range from the calendar - defaults to "today, 1 night" until the
// staff clicks a date, so the panel always shows a real quote instead of zeros.
window.__rateSummaryRange = { start: new Date(), nights: 1 };

// Per-date bed availability, keyed by "YYYY-MM-DD" - populated as each
// calendar's visible range gets fetched (see fetchRoomCheckerBedAvailability).
// Reused here so the Rate Summary panel can warn if a King/Queen qty exceeds
// what's actually free across every night of the selected range, without a
// second round-trip to the server.
window.__roomCheckerAvailabilityByDate = {};

// Lowest availability for a bed type (single = King, double = Queen) across
// every night of the current selection. Returns null if any night in the
// range hasn't been fetched yet, so callers don't warn off incomplete data.
function getRoomCheckerRangeMinAvailability(bedKey) {
  const range = window.__rateSummaryRange;
  if (!range) return null;

  const end = new Date(range.start);
  end.setDate(end.getDate() + range.nights);

  let min = Infinity;
  for (const d = new Date(range.start); d < end; d.setDate(d.getDate() + 1)) {
    const entry = window.__roomCheckerAvailabilityByDate[roomCheckerFormatDateKey(d)];
    if (!entry) return null;
    min = Math.min(min, entry[bedKey]);
  }
  return min === Infinity ? null : min;
}

// Soft warning only - see the "necessary ba?" discussion: Room Checker is a
// quoting tool, not the actual booking-assignment flow, so this informs staff
// rather than blocking the input outright.
function updateRoomCheckerAvailabilityWarning(warningElId, label, qty, bedKey) {
  const warningEl = document.getElementById(warningElId);
  if (!warningEl) return;

  const min = getRoomCheckerRangeMinAvailability(bedKey);
  if (min !== null && qty > min) {
    warningEl.textContent = `Only ${min} ${label} room${min === 1 ? '' : 's'} available for the full range`;
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
}

function initRateSummary() {
  const bookingTypeInputs = document.querySelectorAll('input[name="rateSummaryBookingType"]');
  const breakfastInputs = document.querySelectorAll('input[name="rateSummaryBreakfast"]');
  const discountInput = document.getElementById('rateSummaryDiscount');
  const kingQtyInput = document.getElementById('rateSummaryKingQty');
  const queenQtyInput = document.getElementById('rateSummaryQueenQty');

  bookingTypeInputs.forEach(input => input.addEventListener('change', fetchRateSummary));
  breakfastInputs.forEach(input => input.addEventListener('change', recomputeRateSummaryTotals));
  discountInput.addEventListener('input', recomputeRateSummaryTotals);
  kingQtyInput.addEventListener('input', recomputeRateSummaryTotals);
  queenQtyInput.addEventListener('input', recomputeRateSummaryTotals);

  fetchRateSummary();
}

// Called once a range is finalized (see handleRoomCheckerDateClick). The rate
// itself is looked up for the range's START date only (a stay isn't re-priced
// mid-season any more than a real booking would be), but the number of nights
// spans the whole selection and multiplies the room rate.
function handleRoomCheckerRangeSelect(info) {
  const nights = Math.max(1, Math.round((info.end - info.start) / (1000 * 60 * 60 * 24)));
  window.__rateSummaryRange = { start: info.start, nights };
  roomCheckerHasCommittedSelection = true;

  // Shows the actual check-out date (info.end), not the last occupied night -
  // matches the calendar highlight, which also spans through check-out day.
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('rateSummaryDateRange').textContent =
    `${fmt(info.start)} - ${fmt(info.end)} (${nights} night${nights === 1 ? '' : 's'})`;

  applyRoomCheckerRangeHighlight();
  fetchRateSummary();
}

// King/Queen nightly rates come from the server (season for the selected range's
// start date, per the selected booking type) - everything below that (nights,
// room quantities, breakfast, discount) is pure client-side arithmetic.
function fetchRateSummary() {
  const bookingType = document.querySelector('input[name="rateSummaryBookingType"]:checked').value;
  const dateKey = roomCheckerFormatDateKey(window.__rateSummaryRange.start);

  fetch(`/calendar/api/room-rate-summary?bookingType=${bookingType}&date=${dateKey}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) throw new Error(data.message || 'Failed to load rates');
      window.__rateSummaryKingRate = data.kingRate || 0;
      window.__rateSummaryQueenRate = data.queenRate || 0;
      recomputeRateSummaryTotals();
    })
    .catch((err) => {
      console.error('Error fetching room rate summary:', err);
      window.__rateSummaryKingRate = 0;
      window.__rateSummaryQueenRate = 0;
      recomputeRateSummaryTotals();
    });
}

function recomputeRateSummaryTotals() {
  const kingRate = window.__rateSummaryKingRate || 0;
  const queenRate = window.__rateSummaryQueenRate || 0;
  const nights = window.__rateSummaryRange.nights || 1;

  const kingQty = Math.max(0, parseInt(document.getElementById('rateSummaryKingQty').value, 10) || 0);
  const queenQty = Math.max(0, parseInt(document.getElementById('rateSummaryQueenQty').value, 10) || 0);

  updateRoomCheckerAvailabilityWarning('rateSummaryKingWarning', 'King', kingQty, 'single');
  updateRoomCheckerAvailabilityWarning('rateSummaryQueenWarning', 'Queen', queenQty, 'double');

  const totalRoomRate = (kingQty * kingRate + queenQty * queenRate) * nights;

  const breakfastCount = parseInt(document.querySelector('input[name="rateSummaryBreakfast"]:checked').value, 10) || 0;
  const breakfastTotal = breakfastCount * BREAKFAST_PRICE;

  const subTotal = totalRoomRate + breakfastTotal;

  const discountInput = document.getElementById('rateSummaryDiscount');
  const discountPerNight = Math.max(0, parseFloat(discountInput.value) || 0);
  const discount = discountPerNight * nights;

  const grandTotal = Math.max(0, subTotal - discount);

  document.getElementById('rateSummaryKingRate').textContent = formatPeso(kingRate);
  document.getElementById('rateSummaryQueenRate').textContent = formatPeso(queenRate);
  document.getElementById('rateSummaryTotalRoomRate').textContent = formatPeso(totalRoomRate);
  document.getElementById('rateSummaryBreakfastTotal').textContent = formatPeso(breakfastTotal);
  document.getElementById('rateSummarySubTotal').textContent = formatPeso(subTotal);
  document.getElementById('rateSummaryGrandTotal').textContent = formatPeso(grandTotal);
}

window.roomCheckerCalendars = [];

// The two calendars are meant to always show consecutive months (month-2 is
// always exactly one month ahead of month-1) - keyed here by element id so
// syncRoomCheckerCompanionMonth can look either one up and compute the other's
// expected month regardless of which one the staff navigated.
const roomCheckerCalendarsById = {};
const ROOM_CHECKER_MONTH_OFFSETS = { 'calendar-month-1': 0, 'calendar-month-2': 1 };

// calendar-month-1's month on a fresh page load - what "Today" navigates back
// to. Computed once so it stays fixed even if the page is left open across
// midnight.
const roomCheckerDefaultMonthStart = (function () {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
})();

// Shows the Today button (in the "Room Checker" card header) whenever
// calendar-month-1 has been navigated away from its default month, hides it
// once back. Called from datesRender after every render, including the ones
// triggered by syncRoomCheckerCompanionMonth.
function updateRoomCheckerTodayButtonVisibility() {
  const todayBtn = document.getElementById('roomCheckerTodayBtn');
  if (!todayBtn) return;
  const cal1 = roomCheckerCalendarsById['calendar-month-1'];
  if (!cal1) return;

  const start = cal1.view.currentStart;
  const onDefaultMonth = start.getFullYear() === roomCheckerDefaultMonthStart.getFullYear() &&
    start.getMonth() === roomCheckerDefaultMonthStart.getMonth();
  todayBtn.style.display = onDefaultMonth ? 'none' : 'inline-block';
}

// Today button click handler - jumps calendar-month-1 back to its default
// month; syncRoomCheckerCompanionMonth then carries calendar-month-2 back to
// the following month automatically.
function goToRoomCheckerToday() {
  const cal1 = roomCheckerCalendarsById['calendar-month-1'];
  if (!cal1) return;

  const monthsEl = document.getElementById('room-checker-months');
  const scrollTop = monthsEl ? monthsEl.scrollTop : null;

  cal1.gotoDate(roomCheckerDefaultMonthStart);

  if (monthsEl && scrollTop !== null) {
    setTimeout(() => { monthsEl.scrollTop = scrollTop; }, 0);
  }
}

// Re-entrancy guard: syncing the companion calendar calls its own gotoDate,
// which fires ITS datesRender synchronously, which would otherwise try to sync
// back and loop. Set right before the programmatic gotoDate, cleared right after.
let roomCheckerSyncingNav = false;

function syncRoomCheckerCompanionMonth(elId, currentStart) {
  if (roomCheckerSyncingNav) return;

  const companionId = elId === 'calendar-month-1' ? 'calendar-month-2' : 'calendar-month-1';
  const companion = roomCheckerCalendarsById[companionId];
  if (!companion) return; // not initialized yet (still mid-page-load)

  const offsetDiff = ROOM_CHECKER_MONTH_OFFSETS[companionId] - ROOM_CHECKER_MONTH_OFFSETS[elId];
  const desired = new Date(currentStart.getFullYear(), currentStart.getMonth() + offsetDiff, 1);

  const companionStart = companion.view.currentStart;
  if (companionStart.getFullYear() === desired.getFullYear() && companionStart.getMonth() === desired.getMonth()) {
    return; // already in sync
  }

  roomCheckerSyncingNav = true;
  companion.gotoDate(desired);
  roomCheckerSyncingNav = false;
}

function initRoomCheckerCalendar(elId, defaultDate) {
  const calendarEl = document.getElementById(elId);
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    plugins: ['interaction', 'dayGrid'],
    defaultDate: defaultDate,
    showNonCurrentDates: false,
    fixedWeekCount: false,
    header: {
      left: 'prev,next',
      center: 'title',
      right: ''
    },
    // Deliberately not using FullCalendar's own selectable/select drag-range here -
    // it manages its own highlight and, in this v4 build, scrolls the clicked cell
    // into view as part of that, which fought with the page's own scroll (see the
    // #room-checker-months comment above). Range selection is instead built entirely
    // from plain clicks - see handleRoomCheckerDateClick.
    dateClick: handleRoomCheckerDateClick,

    // NOTE: same FullCalendar v4 build as Unassigned Rooms - dayRender/datesRender,
    // not the v5 dayCellDidMount/datesSet names.
    dayRender: function (info) {
      // showNonCurrentDates is off, but FullCalendar still renders these cells
      // (blank, no day number) to fill out the grid rows - skip the bed
      // availability badge on them too so no data leaks into a blank day.
      if (info.el.classList.contains('fc-disabled-day')) return;
      // Past days aren't selectable (see handleRoomCheckerDateClick) - no point
      // showing bed availability for a date staff can't book anymore.
      if (info.el.classList.contains('fc-past')) return;
      if (info.el.querySelector('.bed-availability-badge')) return;
      const dateKey = roomCheckerFormatDateKey(info.date);
      if (getComputedStyle(info.el).position === 'static') {
        info.el.style.position = 'relative';
      }
      const badge = document.createElement('div');
      badge.className = 'bed-availability-badge';
      badge.setAttribute('data-date', dateKey);
      badge.textContent = '';
      info.el.appendChild(badge);
    },

    datesRender: function (info) {
      const startStr = roomCheckerFormatDateKey(info.view.activeStart);
      const endStr = roomCheckerFormatDateKey(info.view.activeEnd);
      fetchRoomCheckerBedAvailability(startStr, endStr);
      // Navigating months (prev/next) rebuilds this view's cells from scratch,
      // dropping any highlight classList changes - reapply so a range selection
      // is still visible if the staff navigates away and back to it.
      applyRoomCheckerRangeHighlight();
      syncRoomCheckerCompanionMonth(elId, info.view.currentStart);
      updateRoomCheckerTodayButtonVisibility();
    }
  });

  calendar.render();
  window.roomCheckerCalendars.push(calendar);
  roomCheckerCalendarsById[elId] = calendar;
}

function fetchRoomCheckerBedAvailability(startStr, endStr) {
  fetch(`/calendar/api/room-bed-availability?start=${startStr}&end=${endStr}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.success || !data.availability) return;
      Object.keys(data.availability).forEach((dateKey) => {
        window.__roomCheckerAvailabilityByDate[dateKey] = data.availability[dateKey];
        document.querySelectorAll(`.bed-availability-badge[data-date="${dateKey}"]`).forEach((badge) => {
          const { single, double } = data.availability[dateKey];
          badge.innerHTML = `<span class="bed-chip bed-chip-single">K ${single}</span><span class="bed-availability-sep">&middot;</span><span class="bed-chip bed-chip-double">Q ${double}</span>`;
        });
      });
      // Newly-fetched data may now cover every night of the current
      // selection (it didn't a moment ago) - recheck the warning.
      recomputeRateSummaryTotals();
    })
    .catch((err) => {
      console.error('Error fetching room bed availability:', err);
    });
}

// Matches the "M d, Y" flatpickr format both booking modals use closely enough for
// their own " to " / "(" parsing (see add_booking.js and add_group_booking.ejs) -
// exact zero-padding of the day doesn't matter since they just feed it to `new Date()`.
function roomCheckerFormatDisplayDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Proceed Booking" - opens the single Add Booking modal for exactly 1 room, or the
// Add Group Booking modal for more than 1, prefilled with the committed date range
// (and King/Queen counts for the group case). Room Checker only tracks bed-type
// counts, not specific rooms, so staff still pick the actual room(s) inside whichever
// modal opens - same as if they'd opened it fresh and filled in the dates themselves.
function proceedRoomCheckerBooking() {
  if (!roomCheckerHasCommittedSelection) {
    Swal.fire({
      icon: 'warning',
      title: 'Select dates first',
      text: 'Pick a date range on the calendar and click Save before proceeding.'
    });
    return;
  }

  const kingQty = Math.max(0, parseInt(document.getElementById('rateSummaryKingQty').value, 10) || 0);
  const queenQty = Math.max(0, parseInt(document.getElementById('rateSummaryQueenQty').value, 10) || 0);
  const totalRooms = kingQty + queenQty;

  if (totalRooms < 1) {
    Swal.fire({
      icon: 'warning',
      title: 'Select room count',
      text: 'Enter at least 1 King or Queen room before proceeding.'
    });
    return;
  }

  // checkoutDate (not "last occupied night") - matches both modals' own native
  // flatpickr range picker, where the second clicked date is check-out.
  const range = window.__rateSummaryRange;
  const start = new Date(range.start);
  const checkoutDate = new Date(start);
  checkoutDate.setDate(checkoutDate.getDate() + range.nights);
  const dateRangeStr = `${roomCheckerFormatDisplayDate(start)} to ${roomCheckerFormatDisplayDate(checkoutDate)} (${range.nights} night/s)`;

  // Room Checker's Discount field is per-night; both booking modals take a flat
  // total discount amount (subtracted once, not multiplied by nights) - convert
  // here so a discount already set in the Rate Summary panel actually carries
  // over instead of silently resetting to 0 in whichever modal opens.
  const discountPerNight = Math.max(0, parseFloat(document.getElementById('rateSummaryDiscount').value) || 0);
  const totalDiscount = discountPerNight * range.nights;

  // Room Checker's breakfast option is just a flat guest count (None/1/2), with no
  // adult/kid split - both modals do split adult/kid, so carry the count over as
  // "adults" (the modals' own default per-head price already applies once the
  // checkbox is on).
  const breakfastCount = parseInt(document.querySelector('input[name="rateSummaryBreakfast"]:checked').value, 10) || 0;

  if (totalRooms === 1) {
    openRoomCheckerSingleBooking(dateRangeStr, range.nights, start, checkoutDate, totalDiscount, breakfastCount);
  } else {
    openRoomCheckerGroupBooking(dateRangeStr, range.nights, start, checkoutDate, kingQty, queenQty, totalDiscount, breakfastCount);
  }
}

function openRoomCheckerSingleBooking(dateRangeStr, nights, start, checkoutDate, totalDiscount, breakfastCount) {
  const modalEl = document.getElementById('modal-addbooking');
  if (!modalEl) return;

  new bootstrap.Modal(modalEl, { backdrop: 'static' }).show();

  const daterangeInput = document.getElementById('daterange');
  const diffInDaysInput = document.getElementById('diffindays');
  if (daterangeInput) {
    daterangeInput.value = dateRangeStr;
    if (daterangeInput._flatpickr) {
      try { daterangeInput._flatpickr.setDate([start, checkoutDate], false); } catch (e) { /* no-op */ }
    }
    daterangeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (diffInDaysInput) diffInDaysInput.value = nights;

  if (totalDiscount > 0) {
    const includeDiscount = document.getElementById('includeDiscount');
    const discountAmount = document.getElementById('discountAmount');
    if (includeDiscount && !includeDiscount.checked) {
      includeDiscount.checked = true;
      includeDiscount.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (discountAmount) {
      discountAmount.value = totalDiscount.toFixed(2);
      discountAmount.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  if (breakfastCount > 0) {
    const includeBreakfast = document.getElementById('includeBreakfast');
    const breakfastAdultQty = document.getElementById('breakfastAdultQty');
    if (includeBreakfast && !includeBreakfast.checked) {
      includeBreakfast.checked = true;
      includeBreakfast.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (breakfastAdultQty) {
      breakfastAdultQty.value = breakfastCount;
      breakfastAdultQty.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

function openRoomCheckerGroupBooking(dateRangeStr, nights, start, checkoutDate, kingQty, queenQty, totalDiscount, breakfastCount) {
  const modalEl = document.getElementById('modal-add-group-booking');
  if (!modalEl) return;

  new bootstrap.Modal(modalEl, { backdrop: 'static' }).show();

  // The modal's own shown.bs.modal handler (add_group_booking.ejs) resets the whole
  // form and re-initializes its flatpickr on every open - that handler is registered
  // before this page's script runs (the partial is included earlier in the page), so
  // ours fires after it; the setTimeout is extra insurance against that ordering ever
  // changing, so the Room Checker's values always land on top of the reset, not under it.
  $(modalEl).one('shown.bs.modal', function () {
    setTimeout(() => {
      const daterangeInput = document.getElementById('groupDaterange');
      const nightsInput = document.getElementById('groupNights');
      const kingInput = document.getElementById('groupBed1Count');
      const queenInput = document.getElementById('groupBed2Count');

      if (daterangeInput) {
        daterangeInput.value = dateRangeStr;
        if (daterangeInput._flatpickr) {
          try { daterangeInput._flatpickr.setDate([start, checkoutDate], false); } catch (e) { /* no-op */ }
        }
      }
      if (nightsInput) nightsInput.value = nights;
      if (kingInput) kingInput.value = kingQty;
      if (queenInput) queenInput.value = queenQty;

      if (totalDiscount > 0) {
        const groupIncludeDiscount = document.getElementById('groupIncludeDiscount');
        const groupDiscount = document.getElementById('groupDiscount');
        if (groupIncludeDiscount && !groupIncludeDiscount.checked) {
          groupIncludeDiscount.checked = true;
          groupIncludeDiscount.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (groupDiscount) groupDiscount.value = totalDiscount.toFixed(2);
      }

      if (breakfastCount > 0) {
        const groupIncludeBreakfast = document.getElementById('groupIncludeBreakfast');
        const groupBreakfastAdultQty = document.getElementById('groupBreakfastAdultQty');
        const groupBreakfastAdultPrice = document.getElementById('groupBreakfastAdultPrice');
        if (groupIncludeBreakfast && !groupIncludeBreakfast.checked) {
          groupIncludeBreakfast.checked = true;
          groupIncludeBreakfast.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (groupBreakfastAdultQty) groupBreakfastAdultQty.value = breakfastCount;
        // This modal leaves Adult/Kid Price blank by design (staff fill it in per
        // booking) - unlike the single Add Booking modal, which auto-fills it from
        // the real breakfast service cost. Default it to Room Checker's own
        // BREAKFAST_PRICE so the group total actually matches what was quoted,
        // still editable by staff afterward.
        if (groupBreakfastAdultPrice && !groupBreakfastAdultPrice.value) {
          groupBreakfastAdultPrice.value = BREAKFAST_PRICE;
        }
      }

      // The group form recomputes its total on any 'change'/'input' event within it
      // (see add_group_booking.ejs) - nudge that instead of reaching into its private
      // closures (computeGroupTotal, updateGroupWeekendToggleVisibility, etc).
      $('#groupBookingForm').trigger('change');
    }, 0);
  });
}

