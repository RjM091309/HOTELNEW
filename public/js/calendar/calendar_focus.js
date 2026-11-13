/* /calendar?focus=arrivals | departures  (from the Check in / Check out tiles of the Dashboard)
   Highlights today's check-ins (or check-outs) on the calendar and dims every other booking, with a bar on top that lists them
   (one chip per room, one per group) and a "Show all" button. The list is taken once when it starts: a booking stays lit after it has
   been checked in / out from here. Same idea as the Tape Chart of KGrand. */
/* /calendar?room=606  (from a room of the Dashboard's building that has no booking)
   Scrolls the calendar to that room's row and makes the row glow for a moment. */
(function () {
  var room = new URLSearchParams(window.location.search).get('room');
  if (!room) return;
  var tries = 0, timer = setInterval(function () {
    tries++;
    var res = window.calendar && window.calendar.getResources ? window.calendar.getResources().find(function (r) { return String(r.title).trim() === String(room).trim(); }) : null;
    var cells = res ? document.querySelectorAll('#calendar [data-resource-id="' + String(res.id).replace(/"/g, '') + '"]') : [];
    if (res && cells.length) {
      clearInterval(timer);
      setTimeout(function () {
        var first = document.querySelector('#calendar .fc-datagrid-body [data-resource-id="' + res.id + '"]') || cells[0];
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.querySelectorAll('#calendar [data-resource-id="' + res.id + '"]').forEach(function (el) {
          el.classList.add('cal-room-flash'); setTimeout(function () { el.classList.remove('cal-room-flash'); }, 3200);
        });
      }, 400);
    } else if (tries > 80) clearInterval(timer);
  }, 250);
})();

(function () {
  var params = new URLSearchParams(window.location.search);
  var kind = params.get('focus');
  if (kind !== 'arrivals' && kind !== 'departures') return;

  var ids = null;            // Set of booking ids in the highlight
  var bar = null, spacer = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // the hotel day rolls over at 6 AM: 2 AM still belongs to the day before
  function hotelToday() { return ymd(new Date(Date.now() - 6 * 3600 * 1000)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function pick() {
    var today = hotelToday(), list = [];
    window.calendar.getEvents().forEach(function (ev) {
      var p = ev.extendedProps || {}, st = p.bookingStatus;
      if (!ev.start || !ev.end || st === 'maintenance' || ev.title === 'Maintenance') return;
      var s = ymd(ev.start), e = ymd(ev.end);
      if (kind === 'arrivals' ? (st === 'pending' && s <= today) : (st === 'check-In' && e <= today)) list.push(ev);
    });
    function room(ev) { var r = ev.getResources()[0]; return r ? parseInt(String(r.title).replace(/[^\d]/g, ''), 10) || 0 : 0; }
    list.sort(function (a, b) { return room(a) - room(b); });
    return list;
  }

  // dims the other bookings, lights the highlighted ones (also for events that are drawn later, see handleEventDidMount)
  function style(id, el) {
    if (!ids || !el) return;
    var on = ids.has(String(id));
    el.classList.toggle('cal-focus-on', on);
    el.classList.toggle('cal-focus-dim', !on);
  }
  function styleAll() {
    if (!window.eventElements) return;
    Object.keys(window.eventElements).forEach(function (id) { style(id, window.eventElements[id]); });
  }
  function clearAll() {
    ids = null;
    Object.keys(window.eventElements || {}).forEach(function (id) {
      var el = window.eventElements[id]; if (el) el.classList.remove('cal-focus-on', 'cal-focus-dim', 'cal-focus-flash');
    });
  }

  function show(ev) {
    var el = window.eventElements && window.eventElements[ev.id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    el.classList.remove('cal-focus-flash'); void el.offsetWidth; el.classList.add('cal-focus-flash');
    setTimeout(function () { el.classList.remove('cal-focus-flash'); }, 2400);
  }

  // the bar sits just under the fixed header, as wide as the page area (it follows the sidebar opening / closing)
  function fit() {
    if (!bar) return;
    var pc = document.querySelector('.page-content'), hd = document.querySelector('.page-header');
    var r = pc ? pc.getBoundingClientRect() : { left: 0, width: window.innerWidth };
    bar.style.left = (r.left + 12) + 'px'; bar.style.width = (r.width - 24) + 'px';
    bar.style.top = ((hd ? hd.getBoundingClientRect().bottom : 0) + 8) + 'px';
    if (spacer && !bar.classList.contains('is-closing')) spacer.style.height = (bar.offsetHeight + 10) + 'px';
  }

  function buildBar(list) {
    var chips = [], byGroup = {};
    list.forEach(function (ev) {
      var g = ev.extendedProps && ev.extendedProps.groupBookingId;
      if (g && byGroup[g]) { byGroup[g].count++; return; }
      var chip = { ev: ev, count: 1 }; chips.push(chip); if (g) byGroup[g] = chip;
    });
    bar = document.createElement('div');
    bar.className = 'cal-focus-bar';
    bar.innerHTML =
      '<div class="cal-focus-text"><span>Today\'s <b>' + (kind === 'arrivals' ? 'check-ins' : 'check-outs') + '</b> (' + list.length + ') are highlighted' + (list.length ? ':' : ' — there are none.') + '</span>' +
      chips.map(function (c, i) {
        var r = c.ev.getResources()[0], title = String(c.ev.title || '').replace(/^AG - /, '');
        return '<button type="button" class="cal-focus-chip" data-i="' + i + '" title="' + (c.count > 1 ? 'Group: ' + c.count + ' rooms. ' : '') + 'Go to this booking on the chart">' + esc(r ? r.title : '?') +
          (title ? '<span> · ' + esc(title) + '</span>' : '') + (c.count > 1 ? '<em>' + c.count + ' rooms</em>' : '') + '</button>';
      }).join('') + '</div><button type="button" class="cal-focus-all">Show all</button>';
    bar.addEventListener('click', function (e) {
      var chip = e.target.closest('.cal-focus-chip');
      if (chip) { show(chips[parseInt(chip.getAttribute('data-i'), 10)].ev); return; }
      if (e.target.closest('.cal-focus-all')) {
        clearAll();
        var u = new URL(window.location.href); u.searchParams.delete('focus'); window.history.replaceState({}, '', u.toString());
        bar.classList.add('is-closing'); if (spacer) spacer.style.height = '0px';
        setTimeout(function () { if (bar) bar.remove(); if (spacer) spacer.remove(); bar = null; spacer = null; }, 480);
      }
    });
    var host = document.querySelector('#calendar'); host = host && host.closest('.card-body');
    if (host) {
      spacer = document.createElement('div'); spacer.className = 'cal-focus-spacer';
      host.insertBefore(spacer, host.firstChild); document.body.appendChild(bar);   // the bar itself is fixed: under the header, over the page area
      fit();
      window.addEventListener('resize', fit);
      var pc = document.querySelector('.page-content');
      if (window.ResizeObserver) { var ro = new ResizeObserver(fit); if (pc) ro.observe(pc); ro.observe(bar); }
    }
    return chips;
  }

  function start() {
    var list = pick();
    ids = new Set(list.map(function (ev) { return String(ev.id); }));
    var chips = buildBar(list);
    styleAll();
    if (chips.length) setTimeout(function () { show(chips[0].ev); }, 350);     // the first one, so it is not left below the fold
  }

  // wait until the calendar has its bookings
  var tries = 0, timer = setInterval(function () {
    tries++;
    var ready = window.calendar && window.calendar.getEvents && window.calendar.getEvents().length > 0;
    if (ready || tries > 60) { clearInterval(timer); if (window.calendar && window.calendar.getEvents) start(); }
  }, 250);

  window.__calFocus = { style: style };
})();
