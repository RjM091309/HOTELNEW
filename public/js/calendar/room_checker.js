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
// August then a day in September): first click sets a lone anchor day - already
// shown as a 1-night range, per how the panel should read before a second date
// is picked - and a second click completes the range from anchor to that day
// (whichever order they were clicked in) and resets the anchor, so the very next
// click starts a fresh selection rather than extending this one further.
let roomCheckerPendingAnchor = null;

// Repaints highlighting from window.__rateSummaryRange (the single source of
// truth) rather than tracking which cells got highlighted - FullCalendar tears
// down and rebuilds a month's cells on every prev/next navigation, which would
// otherwise silently drop the classList changes the moment either calendar
// re-rendered. Called after every selection AND from datesRender below, so
// navigating away from a selected range and back still shows it highlighted.
function applyRoomCheckerRangeHighlight() {
  document.querySelectorAll('#room-checker-months td.fc-day.room-checker-range-selected')
    .forEach(cell => cell.classList.remove('room-checker-range-selected'));

  const range = window.__rateSummaryRange;
  if (!range) return;
  const end = new Date(range.start);
  end.setDate(end.getDate() + range.nights);

  for (const d = new Date(range.start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = roomCheckerFormatDateKey(d);
    document.querySelectorAll(`#room-checker-months td.fc-day[data-date="${dateKey}"]`)
      .forEach(cell => cell.classList.add('room-checker-range-selected'));
  }
}

function handleRoomCheckerDateClick(info) {
  if (!roomCheckerPendingAnchor) {
    roomCheckerPendingAnchor = info.date;
    const end = new Date(info.date);
    end.setDate(end.getDate() + 1);
    handleRoomCheckerRangeSelect({ start: info.date, end });
    return;
  }

  const start = info.date < roomCheckerPendingAnchor ? info.date : roomCheckerPendingAnchor;
  const lastDay = info.date < roomCheckerPendingAnchor ? roomCheckerPendingAnchor : info.date;
  const end = new Date(lastDay);
  end.setDate(end.getDate() + 1);

  handleRoomCheckerRangeSelect({ start, end });
  roomCheckerPendingAnchor = null;
}

$(document).ready(function () {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  initRoomCheckerCalendar('calendar-month-1', today);
  initRoomCheckerCalendar('calendar-month-2', nextMonth);
  initRateSummary();

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

  const endInclusive = new Date(info.end);
  endInclusive.setDate(endInclusive.getDate() - 1);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  document.getElementById('rateSummaryDateRange').textContent =
    nights === 1 ? `${fmt(info.start)} (1 night)` : `${fmt(info.start)} - ${fmt(endInclusive)} (${nights} nights)`;

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

function initRoomCheckerCalendar(elId, defaultDate) {
  const calendarEl = document.getElementById(elId);
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    plugins: ['interaction', 'dayGrid'],
    defaultDate: defaultDate,
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
    }
  });

  calendar.render();
  window.roomCheckerCalendars.push(calendar);
}

function fetchRoomCheckerBedAvailability(startStr, endStr) {
  fetch(`/calendar/api/room-bed-availability?start=${startStr}&end=${endStr}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.success || !data.availability) return;
      Object.keys(data.availability).forEach((dateKey) => {
        document.querySelectorAll(`.bed-availability-badge[data-date="${dateKey}"]`).forEach((badge) => {
          const { single, double } = data.availability[dateKey];
          badge.innerHTML = `<span class="bed-chip bed-chip-single">K ${single}</span><span class="bed-availability-sep">&middot;</span><span class="bed-chip bed-chip-double">Q ${double}</span>`;
        });
      });
    })
    .catch((err) => {
      console.error('Error fetching room bed availability:', err);
    });
}

