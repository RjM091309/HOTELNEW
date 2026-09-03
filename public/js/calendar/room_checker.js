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
// while a selection is in progress, otherwise the last confirmed
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
  // Exception: the very first click of a fresh selection only sets the "From"
  // anchor (see handleRoomCheckerDateClick) - the 1-night default it computes
  // is just so the range is confirmable immediately if staff stop there, not a
  // real range yet, so only the anchor day itself lights up until a second,
  // distinct day is clicked.
  const end = new Date(range.start);
  end.setDate(end.getDate() + (range.awaitingSecondClick ? 1 : range.nights + 1));

  for (const d = new Date(range.start); d < end; d.setDate(d.getDate() + 1)) {
    const dateKey = roomCheckerFormatDateKey(d);
    document.querySelectorAll(`#room-checker-months td.fc-day[data-date="${dateKey}"]`)
      .forEach(cell => cell.classList.add('room-checker-range-selected'));
  }
}

function handleRoomCheckerDateClick(info) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (info.date < todayStart) return;

  const isFirstClick = !roomCheckerPendingAnchor;
  if (isFirstClick) {
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

  roomCheckerPreviewRange = { start, nights, awaitingSecondClick: isFirstClick };
  applyRoomCheckerRangeHighlight();

  // First click only sets the "From" anchor - nothing to confirm yet since
  // there's no "To" to pair it with. The swal only fires from the second
  // click onward, once an actual from-to range exists.
  if (!isFirstClick) {
    confirmRoomCheckerRange();
  }
}

// Asks whether to lock in the just-clicked range or keep extending it -
// replaces what used to be an explicit Save button. "Proceed" commits it to
// the Rate Summary panel (see commitRoomCheckerRange below); "More" (or
// dismissing the dialog any other way) just closes it, leaving the anchor and
// preview highlight in place so the next calendar click redefines the "to"
// date and asks again.
function confirmRoomCheckerRange() {
  if (!roomCheckerPreviewRange) return;

  const { start, nights } = roomCheckerPreviewRange;
  const end = new Date(start);
  end.setDate(end.getDate() + nights);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  Swal.fire({
    title: 'Proceed with this range?',
    html: `${fmt(start)} - ${fmt(end)} (${nights} night${nights === 1 ? '' : 's'})`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Proceed',
    cancelButtonText: 'More'
  }).then((result) => {
    if (result.isConfirmed) {
      commitRoomCheckerRange();
    }
  });
}

// Commits the in-progress preview to the Rate Summary panel (see
// confirmRoomCheckerRange above) and clears the anchor so the next click
// starts a fresh selection.
function commitRoomCheckerRange() {
  if (!roomCheckerPreviewRange) return;

  const { start, nights } = roomCheckerPreviewRange;
  const end = new Date(start);
  end.setDate(end.getDate() + nights);

  handleRoomCheckerRangeSelect({ start, end });

  roomCheckerPendingAnchor = null;
  roomCheckerPreviewRange = null;
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
  document.getElementById('rateSummaryExtraBedQty').value = 0;
  document.getElementById('rateSummaryBreakfastQty').value = 0;
  document.getElementById('rateSummaryDiscount').value = 0;
  document.getElementById('rateSummaryDateRange').textContent = 'Select a range on the calendar';
  syncRoomCheckerBreakfastPresetActiveState();

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

// null = not fetched yet / "Extra Bed" service not found or unavailable -
// distinct from 0, which would be a legitimate free extra bed. Suggestions
// that add an extra bed only ever show once this is a real number (see
// fetchRoomCheckerExtraBedRate and updateRoomCheckerSuggestion).
window.__rateSummaryExtraBedRate = null;

// Per-date bed availability, keyed by "YYYY-MM-DD" - populated as each
// calendar's visible range gets fetched (see fetchRoomCheckerBedAvailability).
// This is a per-night estimate (rooms free THAT night, not necessarily the
// SAME room across the whole stay), so it only backs the calendar's day
// badges now - the Rate Summary warning below needs the stricter whole-range
// check in window.__rateSummaryRangeAvailability instead (see
// getRoomCheckerRangeMinAvailability).
window.__roomCheckerAvailabilityByDate = {};

// Whole-range King/Queen counts for the current selection, from
// /booking/api/range-availability - the exact same availability rules Add
// Group Booking's own search applies (same room free for every night of the
// stay, unassigned-reservation bed holds subtracted, Check-In/Check-Out
// Status compatibility filtered). Populated by fetchRoomCheckerRangeAvailability
// below; null while loading or on error, so callers don't warn off stale data.
// This replaced a per-night-minimum estimate that could disagree with the
// real search - e.g. showing "27 King available" here when Add Group
// Booking's stricter whole-range check would come back short moments later,
// surfacing a confusing "No Rooms Found" alert after a guest was already
// quoted a number.
window.__rateSummaryRangeAvailability = null;

// Matches Add Group Booking's own field defaults (Regular Check-In / Regular
// Check-Out) - openRoomCheckerGroupBooking hands off into that modal without
// touching those fields, so this quote has to assume the same values or the
// two won't agree.
const ROOM_CHECKER_DEFAULT_CHECK_IN_STATUS = '1';
const ROOM_CHECKER_DEFAULT_CHECK_OUT_STATUS = '0';

// Refetches window.__rateSummaryRangeAvailability for the current
// window.__rateSummaryRange - called from fetchRateSummary, which already
// runs at every point the selected range (or booking type) changes.
function fetchRoomCheckerRangeAvailability() {
  const range = window.__rateSummaryRange;
  const end = new Date(range.start);
  end.setDate(end.getDate() + range.nights);

  const startStr = roomCheckerFormatDateKey(range.start);
  const endStr = roomCheckerFormatDateKey(end);
  const bookingType = document.querySelector('input[name="rateSummaryBookingType"]:checked').value;

  // Clear immediately so a stale prior-range count/rate can't be used to warn
  // against (or quote) the new range while this request is in flight.
  window.__rateSummaryRangeAvailability = null;

  fetch(`/booking/api/range-availability?startDate=${startStr}&endDate=${endStr}`
    + `&checkInStatus=${ROOM_CHECKER_DEFAULT_CHECK_IN_STATUS}&checkOutStatus=${ROOM_CHECKER_DEFAULT_CHECK_OUT_STATUS}`
    + `&bookingType=${bookingType}`)
    .then((response) => response.json())
    .then((data) => {
      window.__rateSummaryRangeAvailability = data.success ? { single: data.single, double: data.double } : null;
      window.__rateSummaryKingRate = data.success ? (data.kingRate || 0) : 0;
      window.__rateSummaryQueenRate = data.success ? (data.queenRate || 0) : 0;
      recomputeRateSummaryTotals();
    })
    .catch((err) => {
      console.error('Error fetching room range availability:', err);
      window.__rateSummaryRangeAvailability = null;
      window.__rateSummaryKingRate = 0;
      window.__rateSummaryQueenRate = 0;
      recomputeRateSummaryTotals();
    });
}

// Lowest availability for a bed type (single = King, double = Queen) across
// the whole current selection - see window.__rateSummaryRangeAvailability.
function getRoomCheckerRangeMinAvailability(bedKey) {
  const avail = window.__rateSummaryRangeAvailability;
  if (!avail) return null;
  return bedKey === 'single' ? avail.single : avail.double;
}

// Soft warning only - see the "necessary ba?" discussion: Room Checker is a
// quoting tool, not the actual booking-assignment flow, so this informs staff
// rather than blocking the input outright.
function updateRoomCheckerAvailabilityWarning(warningElId, label, qty, bedKey) {
  const warningEl = document.getElementById(warningElId);
  if (!warningEl) return null;

  const min = getRoomCheckerRangeMinAvailability(bedKey);
  if (min !== null && qty > min) {
    warningEl.textContent = `Only ${min} ${label} room${min === 1 ? '' : 's'} available for the full range`;
    warningEl.style.display = 'block';
  } else {
    warningEl.style.display = 'none';
  }
  return min;
}

// Works out the best King/Queen split achievable when what's typed overflows
// availability on one side, the other, or BOTH at once - e.g. "need 30 King,
// only 28 available" -> the 2-room shortfall is 2 King beds' worth of guests
// (a King room = 1 bed), which only takes 1 spare Queen room to cover (a
// Queen room = 2 beds) - NOT a 1-for-1 King-room-for-Queen-room swap, or it'd
// suggest twice as many Queen rooms as guests actually need. Converts every
// shortfall to bed-slot units before crossing it to the other type, then back
// to whole rooms of that type (rounding up, since a room can't be partly
// booked). Two-pass so it's symmetric regardless of which side is short:
// first let King's shortfall draw on Queen's spare capacity, then let
// whatever King headroom is left absorb back any of Queen's own overflow.
// Returns null only when neither side overflows (nothing to suggest) or the
// range's availability hasn't loaded yet (kingMin/queenMin still null).
// Otherwise returns { kingQty, queenQty, complete, shortBy }: `complete` is
// true when the split covers everything originally typed; when it's false,
// `shortBy` is how many bed-slots still can't be placed anywhere even after
// maxing out both types - callers show that as a best-effort suggestion
// rather than staying silent just because a full fix isn't possible.
function computeRoomCheckerRoomAllocationSuggestion(kingQty, queenQty, kingMin, queenMin) {
  if (kingMin === null || queenMin === null) return null;
  if (kingQty <= kingMin && queenQty <= queenMin) return null;

  let kingAlloc = Math.min(kingQty, kingMin);
  let queenAlloc = Math.min(queenQty, queenMin);

  let kingShortSlots = (kingQty - kingAlloc) * KING_BEDS_PER_ROOM;
  let queenShortSlots = (queenQty - queenAlloc) * QUEEN_BEDS_PER_ROOM;

  if (kingShortSlots > 0) {
    const queenRoomsUsed = Math.min(Math.ceil(kingShortSlots / QUEEN_BEDS_PER_ROOM), queenMin - queenAlloc);
    queenAlloc += queenRoomsUsed;
    kingShortSlots = Math.max(0, kingShortSlots - queenRoomsUsed * QUEEN_BEDS_PER_ROOM);
  }

  if (queenShortSlots > 0) {
    const kingRoomsUsed = Math.min(Math.ceil(queenShortSlots / KING_BEDS_PER_ROOM), kingMin - kingAlloc);
    kingAlloc += kingRoomsUsed;
    queenShortSlots = Math.max(0, queenShortSlots - kingRoomsUsed * KING_BEDS_PER_ROOM);
  }

  // Nothing actually changed from what's already typed (e.g. the "overflow"
  // was on a side with zero spare capacity anywhere) - no point suggesting
  // the exact same numbers back.
  if (kingAlloc === kingQty && queenAlloc === queenQty) return null;

  return {
    kingQty: kingAlloc,
    queenQty: queenAlloc,
    complete: kingShortSlots === 0 && queenShortSlots === 0,
    shortBy: kingShortSlots + queenShortSlots
  };
}

// Independent alternative to computeRoomCheckerRoomAllocationSuggestion above:
// instead of reassigning bed TYPES to use up whatever capacity exists on the
// other side, this keeps King and Queen at whatever was actually typed
// (Queen capped at what's available) and covers a Queen shortfall with extra
// beds in those same rooms instead - a Queen room already sleeps 2, so an
// extra bed there is a real substitute for a whole extra Queen room. A King
// room only ever has the one bed, so a King shortfall has no such
// equivalent - never offered for King overflow, no matter how large.
// Offered whenever Queen overflows and the Extra Bed service is active,
// regardless of whether a same-type reassignment could also fully solve it -
// staff may well prefer keeping the originally-requested bed type over
// reassigning rooms. Returns null when Queen isn't over, availability hasn't
// loaded, or the Extra Bed service isn't active.
function computeRoomCheckerExtraBedSuggestion(kingQty, queenQty, kingMin, queenMin, currentExtraBedQty) {
  if (window.__rateSummaryExtraBedRate === null) return null;
  if (queenMin === null) return null;

  const queenOverflow = queenQty > queenMin ? queenQty - queenMin : 0;
  if (queenOverflow === 0) return null;

  return {
    kingQty,
    queenQty: queenMin,
    extraBedQty: (currentExtraBedQty || 0) + queenOverflow,
    addedBeds: queenOverflow
  };
}

// Sets King/Queen/Extra Bed qty inputs and re-runs the totals (including the
// Breakfast auto-sync, since King/Queen just changed) - shared by every
// suggestion button below. extraBedQty is optional; omit to leave it as
// whatever the staff already had typed.
function applyRoomCheckerSuggestion(kingQty, queenQty, extraBedQty) {
  document.getElementById('rateSummaryKingQty').value = kingQty;
  document.getElementById('rateSummaryQueenQty').value = queenQty;
  if (extraBedQty !== undefined) {
    document.getElementById('rateSummaryExtraBedQty').value = extraBedQty;
  }
  syncRoomCheckerBreakfastToRoomCount();
}

// Renders up to two independent suggestion buttons under the King/Queen rows:
//   1. roomSuggestion - the closest King/Queen-only split (green if it fully
//      covers what was typed, amber "closest fit" if rooms alone can't).
//   2. extraBedSuggestion - keeps King/Queen at the originally-requested type
//      (capped at what's available) and covers the rest with extra beds.
//      Shown whenever there's ANY overflow and the Extra Bed service is
//      active - not just when #1 falls short - since staff may prefer
//      keeping the requested bed type over reassigning rooms.
// Both are computed independently by the caller and may appear together.
// Joins non-zero "N Label" parts with " + " (e.g. a suggestion with 0 Queen
// reads as "28 King + 2 extra beds", not "28 King + 0 Queen + 2 extra beds").
// `plural`, if given, is the word to use when qty !== 1 (e.g. "extra beds");
// omit it for labels that don't pluralize (room types read as "22 King", not
// "22 Kings").
function formatRoomCheckerBedParts(parts) {
  return parts
    .filter((p) => p.qty > 0)
    .map((p) => `${p.qty} ${p.qty === 1 ? p.label : (p.plural || p.label)}`)
    .join(' + ');
}

function updateRoomCheckerSuggestion(suggestionElId, roomSuggestion, extraBedSuggestion) {
  const el = document.getElementById(suggestionElId);
  if (!el) return;

  const buttons = [];

  if (roomSuggestion) {
    const rooms = formatRoomCheckerBedParts([
      { qty: roomSuggestion.kingQty, label: 'King' },
      { qty: roomSuggestion.queenQty, label: 'Queen' }
    ]);
    const label = roomSuggestion.complete
      ? `Try ${rooms} instead`
      : `Closest fit: ${rooms} `
        + `(still short ${roomSuggestion.shortBy} room${roomSuggestion.shortBy === 1 ? '' : 's'})`;
    buttons.push({
      label,
      variant: roomSuggestion.complete ? 'complete' : 'partial',
      onClick: () => applyRoomCheckerSuggestion(roomSuggestion.kingQty, roomSuggestion.queenQty)
    });
  }

  if (extraBedSuggestion) {
    const n = extraBedSuggestion.addedBeds;
    const rooms = formatRoomCheckerBedParts([
      { qty: extraBedSuggestion.kingQty, label: 'King' },
      { qty: extraBedSuggestion.queenQty, label: 'Queen' },
      { qty: extraBedSuggestion.extraBedQty, label: 'extra bed', plural: 'extra beds' }
    ]);
    buttons.push({
      label: `Add ${n} extra bed${n === 1 ? '' : 's'} instead: ${rooms}`,
      variant: 'complete',
      onClick: () => applyRoomCheckerSuggestion(
        extraBedSuggestion.kingQty, extraBedSuggestion.queenQty, extraBedSuggestion.extraBedQty
      )
    });
  }

  if (!buttons.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.innerHTML = buttons
    .map((b, i) => `<button type="button" class="${b.variant}" data-suggestion-index="${i}">\u{1F4A1} ${b.label}</button>`)
    .join('');
  el.style.display = 'flex';
  buttons.forEach((b, i) => {
    el.querySelector(`[data-suggestion-index="${i}"]`).addEventListener('click', b.onClick);
  });
}

// A bulk quote almost always wants one breakfast per room, so this keeps
// #rateSummaryBreakfastQty tracking King qty + Queen qty by default. Called
// whenever either room qty changes (typed directly, or via a suggestion
// button) - NOT from recomputeRateSummaryTotals itself, so typing directly
// into the Breakfast field or clicking a None/1/2 preset isn't immediately
// overwritten by this same sync on the next recompute.
// A King room has 1 bed; a Queen room has 2 - so a Queen room feeds twice as
// many guests as a King room, not the same "1 room = 1 breakfast" rate.
const KING_BEDS_PER_ROOM = 1;
const QUEEN_BEDS_PER_ROOM = 2;

function getRoomCheckerTotalBeds() {
  const kingQty = Math.max(0, parseInt(document.getElementById('rateSummaryKingQty').value, 10) || 0);
  const queenQty = Math.max(0, parseInt(document.getElementById('rateSummaryQueenQty').value, 10) || 0);
  const extraBedQty = Math.max(0, parseInt(document.getElementById('rateSummaryExtraBedQty').value, 10) || 0);
  // Each extra bed is one more guest to feed too, same as any other bed.
  return (kingQty * KING_BEDS_PER_ROOM) + (queenQty * QUEEN_BEDS_PER_ROOM) + extraBedQty;
}

// Marks which None/1/2 preset (if any) matches the field's current value as
// "active" (highlighted) - called after every change to the Breakfast qty,
// whichever triggered it, so the highlight always reflects reality instead
// of just tracking clicks. No preset lights up once staff hand-edit the
// field to something that isn't an exact per-bed multiple.
function syncRoomCheckerBreakfastPresetActiveState() {
  const qty = parseInt(document.getElementById('rateSummaryBreakfastQty').value, 10) || 0;
  const totalBeds = getRoomCheckerTotalBeds();
  document.querySelectorAll('.rate-summary-preset-btn[data-breakfast-preset]').forEach((btn) => {
    const perBed = parseInt(btn.getAttribute('data-breakfast-preset'), 10) || 0;
    const matches = perBed === 0 ? qty === 0 : (totalBeds > 0 && qty === perBed * totalBeds);
    btn.classList.toggle('active', matches);
  });
}

function syncRoomCheckerBreakfastToRoomCount() {
  document.getElementById('rateSummaryBreakfastQty').value = getRoomCheckerTotalBeds();
  syncRoomCheckerBreakfastPresetActiveState();
  recomputeRateSummaryTotals();
}

// The None/1/2 preset buttons mean "breakfasts per bed", not a flat guest
// count - e.g. 10 beds selected with the "2" preset means 2 breakfasts per
// bed (20 total), matching how many people that many beds actually sleep.
function wireRoomCheckerBreakfastPresets() {
  document.querySelectorAll('.rate-summary-preset-btn[data-breakfast-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const perBed = parseInt(btn.getAttribute('data-breakfast-preset'), 10) || 0;
      document.getElementById('rateSummaryBreakfastQty').value = perBed * getRoomCheckerTotalBeds();
      syncRoomCheckerBreakfastPresetActiveState();
      recomputeRateSummaryTotals();
    });
  });
}

function initRateSummary() {
  const bookingTypeInputs = document.querySelectorAll('input[name="rateSummaryBookingType"]');
  const breakfastQtyInput = document.getElementById('rateSummaryBreakfastQty');
  const discountInput = document.getElementById('rateSummaryDiscount');
  const kingQtyInput = document.getElementById('rateSummaryKingQty');
  const queenQtyInput = document.getElementById('rateSummaryQueenQty');

  const extraBedQtyInput = document.getElementById('rateSummaryExtraBedQty');

  bookingTypeInputs.forEach(input => input.addEventListener('change', fetchRateSummary));
  breakfastQtyInput.addEventListener('input', () => {
    syncRoomCheckerBreakfastPresetActiveState();
    recomputeRateSummaryTotals();
  });
  discountInput.addEventListener('input', recomputeRateSummaryTotals);
  kingQtyInput.addEventListener('input', syncRoomCheckerBreakfastToRoomCount);
  queenQtyInput.addEventListener('input', syncRoomCheckerBreakfastToRoomCount);
  extraBedQtyInput.addEventListener('input', syncRoomCheckerBreakfastToRoomCount);
  wireRoomCheckerBreakfastPresets();

  fetchRateSummary();
  fetchRoomCheckerExtraBedRate();
}

// Extra Bed isn't a room type - it's the "Extra Bed" entry under /services
// (Special Requests category), a flat per-bed add-on like Breakfast rather
// than a per-night room rate. Fetched once on load, not per date/booking-type,
// since the service list isn't seasonal. Stays at ₱0 / has no suggestion if
// that service is missing or marked unavailable there.
function fetchRoomCheckerExtraBedRate() {
  fetch('/services/api/services')
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) throw new Error(data.message || 'Failed to load services');
      const extraBedService = (data.data || []).find((s) =>
        String(s.SERVICE_NAME || '').trim().toLowerCase() === 'extra bed'
        && String(s.SERVICE_AVAILABILITY || '').trim().toLowerCase() === 'available'
      );
      window.__rateSummaryExtraBedRate = extraBedService ? (parseFloat(extraBedService.SERVICE_COST) || 0) : null;
      recomputeRateSummaryTotals();
    })
    .catch((err) => {
      console.error('Error fetching Extra Bed service rate:', err);
      window.__rateSummaryExtraBedRate = null;
      recomputeRateSummaryTotals();
    });
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

// King/Queen nightly rates come from fetchRoomCheckerRangeAvailability (the
// mode/most-common ACTUAL price among rooms genuinely available for the
// whole selected range + booking type) rather than a separate "cheapest
// seasonal price anywhere in the property" lookup - Room Checker is used as
// a real guest quotation, so it has to quote a price a room actually
// available right now can be booked at, not just an exception that happens
// to exist on some other room. Everything below that (nights, room
// quantities, breakfast, discount) is pure client-side arithmetic.
function fetchRateSummary() {
  fetchRoomCheckerRangeAvailability();
}

function recomputeRateSummaryTotals() {
  const kingRate = window.__rateSummaryKingRate || 0;
  const queenRate = window.__rateSummaryQueenRate || 0;
  const extraBedRate = window.__rateSummaryExtraBedRate || 0;
  const nights = window.__rateSummaryRange.nights || 1;

  const kingQty = Math.max(0, parseInt(document.getElementById('rateSummaryKingQty').value, 10) || 0);
  const queenQty = Math.max(0, parseInt(document.getElementById('rateSummaryQueenQty').value, 10) || 0);
  const extraBedQty = Math.max(0, parseInt(document.getElementById('rateSummaryExtraBedQty').value, 10) || 0);

  const kingMin = updateRoomCheckerAvailabilityWarning('rateSummaryKingWarning', 'King', kingQty, 'single');
  const queenMin = updateRoomCheckerAvailabilityWarning('rateSummaryQueenWarning', 'Queen', queenQty, 'double');

  const roomSuggestion = computeRoomCheckerRoomAllocationSuggestion(kingQty, queenQty, kingMin, queenMin);
  const extraBedSuggestion = computeRoomCheckerExtraBedSuggestion(kingQty, queenQty, kingMin, queenMin, extraBedQty);
  updateRoomCheckerSuggestion('rateSummaryBedSuggestion', roomSuggestion, extraBedSuggestion);

  const totalRoomRate = (kingQty * kingRate + queenQty * queenRate) * nights;

  const breakfastCount = Math.max(0, parseInt(document.getElementById('rateSummaryBreakfastQty').value, 10) || 0);
  const breakfastTotal = breakfastCount * BREAKFAST_PRICE;
  const extraBedTotal = extraBedQty * extraBedRate;

  const subTotal = totalRoomRate + breakfastTotal + extraBedTotal;

  // Per room, per night - same scaling as Total Room Rate above, so a bulk
  // quote's discount grows with the room count instead of staying a single
  // flat amount no matter how many rooms are booked.
  const discountInput = document.getElementById('rateSummaryDiscount');
  const discountPerNight = Math.max(0, parseFloat(discountInput.value) || 0);
  const totalRooms = kingQty + queenQty;
  const discount = discountPerNight * nights * totalRooms;

  const grandTotal = Math.max(0, subTotal - discount);

  document.getElementById('rateSummaryKingRate').textContent = formatPeso(kingRate);
  document.getElementById('rateSummaryQueenRate').textContent = formatPeso(queenRate);
  document.getElementById('rateSummaryTotalRoomRate').textContent = formatPeso(totalRoomRate);
  document.getElementById('rateSummaryBreakfastTotal').textContent = formatPeso(breakfastTotal);
  document.getElementById('rateSummaryExtraBedRate').textContent = formatPeso(extraBedRate);
  document.getElementById('rateSummaryExtraBedTotal').textContent = formatPeso(extraBedTotal);
  document.getElementById('rateSummarySubTotal').textContent = formatPeso(subTotal);
  document.getElementById('rateSummaryDiscountTotal').textContent = (discount > 0 ? '-' : '') + formatPeso(discount);
  document.getElementById('rateSummaryGrandTotal').textContent = formatPeso(grandTotal);

  updateRoomCheckerSummaryChip(nights, kingQty, queenQty, breakfastCount);
}

// Recap chip next to Proceed Booking - lets staff double-check nights/rooms/
// breakfast at a glance right before committing, without scanning back up
// through the whole itemized panel.
function updateRoomCheckerSummaryChip(nights, kingQty, queenQty, breakfastCount) {
  const nightsEl = document.getElementById('roomCheckerChipNights');
  const roomsEl = document.getElementById('roomCheckerChipRooms');
  const breakfastEl = document.getElementById('roomCheckerChipBreakfast');
  if (!nightsEl || !roomsEl || !breakfastEl) return;

  nightsEl.textContent = `${nights} night${nights === 1 ? '' : 's'}`;
  roomsEl.textContent = `${kingQty} King, ${queenQty} Queen`;
  breakfastEl.textContent = `${breakfastCount} BF`;
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

  // Room Checker's Discount field is per room, per night; both booking modals take
  // a flat total discount amount (subtracted once) - convert here, matching the
  // same per-room x per-night scaling used in recomputeRateSummaryTotals, so a
  // discount already set in the Rate Summary panel actually carries over instead
  // of silently resetting to 0 (or under-counting rooms) in whichever modal opens.
  const discountPerNight = Math.max(0, parseFloat(document.getElementById('rateSummaryDiscount').value) || 0);
  const totalDiscount = discountPerNight * range.nights * totalRooms;

  // Room Checker's breakfast option is just a flat guest count (None/1/2), with no
  // adult/kid split - both modals do split adult/kid, so carry the count over as
  // "adults" (the modals' own default per-head price already applies once the
  // checkbox is on).
  const breakfastCount = Math.max(0, parseInt(document.getElementById('rateSummaryBreakfastQty').value, 10) || 0);

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

      // Room Checker already worked out the exact King/Queen breakdown - run the
      // same search "Search Rooms" would immediately, so the Rooms section shows
      // it right away instead of requiring an identical extra click before staff
      // see anything. Uses the modal's own default Booking Resource/Check-In/
      // Check-Out selections (Walk-in / Regular / Regular), same as a fresh open.
      const searchBtn = document.getElementById('groupSearchRooms');
      if (searchBtn && (kingQty > 0 || queenQty > 0)) searchBtn.click();
    }, 0);
  });
}

