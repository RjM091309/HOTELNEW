// =============================================================================
// MOVE ROOMS: move several bookings to other rooms at once
// 1. "Move Rooms"  2. click the bookings  3. "Confirm"  4. drag one of them up or down: the others move the same number of rooms.
// The server checks every new room (other bookings, Late Check-Out / Late Check-In rules) and moves all of them or none.
// =============================================================================
(function () {
  const MOVABLE = ['pending', 'check-In'];
  let mode = 'off';            // 'off' | 'select' | 'drag'
  const picked = new Set();    // booking ids
  let busy = false;

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getCal = () => window.calendar;

  function notice(title, text, icon) {
    return Swal.fire({ icon: icon || 'info', title, text, heightAuto: false });
  }

  // a small bar that says what to do next
  function hint() {
    let bar = document.getElementById('move-rooms-hint');
    if (mode === 'off') { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'move-rooms-hint';
      document.body.appendChild(bar);
    }
    const n = picked.size;
    bar.textContent = mode === 'select'
      ? (n ? `${n} selected. Click more bookings, then press Confirm.` : 'Click the bookings you want to move.')
      : `Drag one of the ${n} selected booking${n === 1 ? '' : 's'} up or down. The others move the same number of rooms.`;
  }

  function updateButtons() {
    const toggle = document.querySelector('.fc-moveRooms-button');
    const confirm = document.querySelector('.fc-moveRoomsConfirm-button');
    if (toggle) {
      toggle.textContent = mode === 'off' ? 'Move Rooms' : 'Cancel Move';
      toggle.classList.toggle('bed-filter-btn-active', mode !== 'off');
      if (mode === 'off') toggle.blur();
    }
    if (confirm) {
      const show = mode === 'select' && picked.size > 0;
      confirm.classList.toggle('fc-proceed-visible', show);
      confirm.disabled = !show;
      confirm.textContent = show ? `Confirm (${picked.size})` : 'Confirm';
    }
  }

  function paint() {
    document.querySelectorAll('#calendar [data-move-id]').forEach((el) => {
      el.classList.toggle('move-picked', mode !== 'off' && picked.has(el.getAttribute('data-move-id')));
    });
    document.body.classList.toggle('move-rooms-on', mode !== 'off');
    updateButtons();
    hint();
  }

  function exit() {
    mode = 'off';
    picked.clear();
    paint();
  }

  function toggle() {
    if (mode !== 'off') return exit();
    if (typeof exitGroupCreateMode === 'function') exitGroupCreateMode();
    if (typeof resetGroupSelectState === 'function') resetGroupSelectState();
    mode = 'select';
    if (window.tippy && window.tippy.hideAll) window.tippy.hideAll({ duration: 0 });
    return paint();
  }

  function confirmSelection() {
    if (mode !== 'select' || !picked.size) return;
    mode = 'drag';
    paint();
  }

  // a click on a booking while the mode is on selects it (the booking window does not open)
  function click(info) {
    if (mode === 'off') return false;
    const id = String(info.event.id);
    if (!MOVABLE.includes(info.event.extendedProps.bookingStatus)) {
      notice('Cannot be moved', 'Only reserved or checked-in bookings can be moved.', 'warning');
      return true;
    }
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    // changing the selection after Confirm goes back to selecting
    mode = 'select';
    paint();
    return true;
  }

  // the rooms in the order the calendar shows them (floor headings are not rooms)
  function roomsInOrder() {
    const shown = getCal().getOption('resources');
    const list = Array.isArray(shown) && shown.length ? shown : (window.allCalendarFloors || []);
    return list.flatMap((entry) => (Array.isArray(entry.children) ? entry.children : [entry])).map((r) => String(r.id));
  }

  async function send(moves, dryRun) {
    const response = await fetch('/calendar/move-rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ moves, dryRun })
    });
    const data = await response.json().catch(() => null);
    if (!data || (!response.ok && !data.problems)) throw new Error((data && data.message) || 'The server did not answer. Nothing was moved.');
    return data;
  }

  function table(rows, problems) {
    const bad = new Map();
    (problems || []).forEach((p) => {
      const key = String(p.bookingId);
      if (!bad.has(key)) bad.set(key, []);
      bad.get(key).push(p.message);
    });
    const lines = (rows || []).map((m) => {
      const why = bad.get(String(m.bookingId));
      return `<tr><td style="text-align:left;">${esc(m.guest)}${why ? `<div style="color:#dc3545;font-size:12px;">${why.map(esc).join('<br>')}</div>` : ''}</td>
        <td style="white-space:nowrap;font-weight:600;">${esc(m.fromRoom)} &rarr; ${esc(m.toRoom)}</td></tr>`;
    }).join('');
    const general = (problems || []).filter((p) => p.bookingId == null).map((p) => `<div style="color:#dc3545;">${esc(p.message)}</div>`).join('');
    return `${general}<div style="max-height:50vh;overflow-y:auto;"><table class="table table-sm align-middle" style="font-size:14px;margin:0;"><tbody>${lines}</tbody></table></div>`;
  }

  async function moveBy(offset) {
    const calendar = getCal();
    const order = roomsInOrder();
    const moves = [];
    const outside = [];
    picked.forEach((id) => {
      const event = calendar.getEventById(id);
      const room = event && event.getResources()[0];
      if (!room) return;
      const at = order.indexOf(String(room.id));
      const target = at < 0 ? undefined : order[at + offset];
      if (target === undefined) outside.push(event.title);
      else moves.push({ bookingId: Number(id), newRoomId: Number(target) });
    });
    if (outside.length) return notice('Not enough rooms', `There is no room that far for: ${outside.join(', ')}. Nothing was moved.`, 'warning');
    if (!moves.length) return notice('Nothing to move', 'Refresh the calendar and select the bookings again.', 'warning');

    busy = true;
    try {
      const check = await send(moves, true);
      if (!check.success) {
        await Swal.fire({ icon: 'error', title: 'Cannot move there', html: table(check.moves, check.problems) + '<div style="margin-top:8px;">Nothing was moved. Drag to another position.</div>', width: 620, heightAuto: false });
        return null;
      }
      const answer = await Swal.fire({
        icon: 'question', title: `Move ${check.moves.length} booking${check.moves.length === 1 ? '' : 's'}?`,
        html: table(check.moves) + '<div style="margin-top:8px;font-size:13px;">Dates and prices stay the same.</div>',
        width: 620, showCancelButton: true, confirmButtonText: 'Move all', cancelButtonText: 'Cancel', heightAuto: false
      });
      if (!answer.isConfirmed) return null;
      const done = await send(moves, false); // checked again on the server: someone else may have booked a room meanwhile
      if (!done.success) {
        await Swal.fire({ icon: 'error', title: 'Not moved', html: table(done.moves, done.problems), width: 620, heightAuto: false });
        return null;
      }
      exit();
      if (typeof window.refreshCalendarBookings === 'function') await window.refreshCalendarBookings();
      if (window.PMSCore && PMSCore.showSuccess) PMSCore.showSuccess('Rooms moved', `${done.moves.length} booking${done.moves.length === 1 ? '' : 's'} moved.`);
      else notice('Rooms moved', `${done.moves.length} booking(s) moved.`, 'success');
    } catch (error) {
      notice('Not moved', error.message, 'error');
    } finally {
      busy = false;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // While dragging: every selected booking follows, shown where it would land. Red = it would hit a booking or break a rule.
  // (A preview only: the server checks again before anything is saved.) Only the room follows the pointer, never the dates.
  // ---------------------------------------------------------------------------
  let dragging = null; // { fromRoom, offset, x, y }

  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function stay(event) {
    const inDay = dayKey(event.start);
    let outDay = event.end ? dayKey(event.end) : inDay;
    if (outDay <= inDay) { const n = new Date(event.start); n.setDate(n.getDate() + 1); outDay = dayKey(n); }
    const x = event.extendedProps || {};
    return { inDay, outDay, checkIn: Number(x.checkInStatus ?? 1), late: Number(x.checkOutStatus ?? 0) === 1 };
  }
  // the same rules as the server: no shared night; no Early Check-In on a check-out day; after a Late Check-Out only a Late Check-In
  function clash(a, b) {
    if (a.inDay < b.outDay && a.outDay > b.inDay) return true;
    return [[a, b], [b, a]].some(([out, next]) => out.outDay === next.inDay && (next.checkIn === 2 || (out.late && next.checkIn !== 0)));
  }

  // the bookings (not selected ones: they move too) that stop this booking from going into that room; null = the room itself is closed
  function blockers(event, roomId) {
    const room = getCal().getResourceById(roomId);
    if (room && room.extendedProps && room.extendedProps.outOfOrder) return null;
    const mine = stay(event);
    return getCal().getEvents().filter((other) => {
      if (picked.has(String(other.id)) || !other.start) return false;
      if (['cancelled', 'canceled', 'void', 'no-show'].includes(String(other.extendedProps.bookingStatus || '').toLowerCase())) return false;
      const at = other.getResources()[0];
      return at && String(at.id) === String(roomId) && clash(mine, stay(other));
    });
  }

  const rowOf = (roomId) => (typeof findTimeRowByResourceId === 'function' ? findTimeRowByResourceId(roomId) : null);
  const barOf = (id) => document.querySelector(`#calendar .fc-timeline-event[data-move-id="${id}"]:not(.fc-event-mirror)`);

  function clearPreview() {
    document.querySelectorAll('.move-ghost').forEach((el) => el.remove());
    document.querySelectorAll('.move-blocking').forEach((el) => el.classList.remove('move-blocking'));
  }

  function drawPreview() {
    if (!dragging) return;
    clearPreview();
    const order = roomsInOrder();
    // the part of the calendar the rows are seen through: nothing is drawn over the date header
    const body = rowOf(dragging.fromRoom)?.closest('.fc-scroller');
    const view = body ? body.getBoundingClientRect() : null;
    let hits = 0;
    let outside = 0;
    picked.forEach((id) => {
      const event = getCal().getEventById(id);
      const room = event && event.getResources()[0];
      if (!room) return;
      const at = order.indexOf(String(room.id));
      const target = at < 0 ? undefined : order[at + dragging.offset];
      if (target === undefined) { outside++; return; }
      const blocking = dragging.offset ? blockers(event, target) : [];
      const bad = blocking === null || blocking.length > 0;
      if (bad) hits++;
      (blocking || []).forEach((other) => barOf(other.id)?.classList.add('move-blocking'));

      const bar = barOf(id);
      const fromRow = rowOf(room.id);
      const toRow = rowOf(target);
      if (!bar || !fromRow || !toRow) return;
      const b = bar.getBoundingClientRect();
      const top = toRow.getBoundingClientRect().top + (b.top - fromRow.getBoundingClientRect().top);
      if (view && (top + b.height / 2 < view.top || top + b.height / 2 > view.bottom)) return;
      const ghost = document.createElement('div');
      ghost.className = `move-ghost ${bad ? 'is-bad' : 'is-ok'}`;
      ghost.setAttribute('data-ghost-id', id);
      ghost.setAttribute('data-ghost-room', target);
      ghost.textContent = `${bad ? '✕ ' : ''}${event.title}`;
      ghost.style.cssText = `left:${b.left}px;top:${top}px;width:${b.width}px;height:${b.height}px;`;
      document.body.appendChild(ghost);
    });

    const bar = document.getElementById('move-rooms-hint');
    if (!bar) return;
    const n = picked.size;
    bar.classList.toggle('is-bad', hits + outside > 0);
    if (!dragging.offset) bar.textContent = 'Drag up or down to another room.';
    else if (hits + outside) bar.textContent = [hits ? `${hits} of ${n} would hit a booking or a rule` : '', outside ? `${outside} of ${n} past the last room` : ''].filter(Boolean).join(' · ');
    else bar.textContent = `All ${n} fit. Release to move.`;
  }

  function pointerMoved(e) {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    if (p && p.clientY != null) { dragging.x = p.clientX; dragging.y = p.clientY; }
    const hovered = typeof findResourceIdAtY === 'function' ? findResourceIdAtY(dragging.y) : null;
    const order = roomsInOrder();
    const to = order.indexOf(String(hovered));
    const from = order.indexOf(dragging.fromRoom);
    if (to >= 0 && from >= 0) dragging.offset = to - from;   // over a floor heading the last room stays
    drawPreview();
  }

  const onScroll = () => { if (dragging) requestAnimationFrame(() => pointerMoved({})); };

  function dragStart(info) {
    const id = String(info.event.id);
    const room = info.event.getResources()[0];
    if (mode !== 'drag' || !picked.has(id) || !room) return;
    const js = info.jsEvent || {};
    dragging = { fromRoom: String(room.id), offset: 0, x: js.clientX || 0, y: js.clientY || 0 };
    document.body.classList.add('move-rooms-dragging');
    document.addEventListener('mousemove', pointerMoved, true);
    document.addEventListener('touchmove', pointerMoved, true);
    document.addEventListener('scroll', onScroll, true);   // the calendar scrolls by itself near its edges
    drawPreview();
  }

  function dragStop() {
    if (!dragging) return;
    dragging = null;
    document.removeEventListener('mousemove', pointerMoved, true);
    document.removeEventListener('touchmove', pointerMoved, true);
    document.removeEventListener('scroll', onScroll, true);
    document.body.classList.remove('move-rooms-dragging');
    document.getElementById('move-rooms-hint')?.classList.remove('is-bad');
    clearPreview();
    hint();
  }

  // a drag while the mode is on never saves a single booking: it is put back and used as "move everything by this many rooms"
  function drop(info) {
    if (mode === 'off') return false;
    const id = String(info.event.id);
    const from = info.oldResource && String(info.oldResource.id);
    const to = info.newResource && String(info.newResource.id);
    info.revert();
    if (mode === 'select') { notice('Press Confirm first', 'Select the bookings, press Confirm, then drag one of them.'); return true; }
    if (!picked.has(id)) { notice('Not selected', 'Drag one of the selected bookings, or press Cancel Move.', 'warning'); return true; }
    if (!from || !to || from === to) { notice('Choose another room', 'Drag the booking up or down to another room. Dates are not changed here.'); return true; }
    const order = roomsInOrder();
    const offset = order.indexOf(to) - order.indexOf(from);
    if (order.indexOf(to) < 0 || order.indexOf(from) < 0 || !offset) return true;
    if (!busy) moveBy(offset);
    return true;
  }

  // keeps the highlight on bookings that are drawn again (scroll, refresh)
  function mount(info) {
    info.el.setAttribute('data-move-id', String(info.event.id));
    info.el.classList.toggle('move-picked', mode !== 'off' && picked.has(String(info.event.id)));
  }

  window.calendarMoveRooms = { toggle, confirmSelection, click, drop, dragStart, dragStop, mount, exit, active: () => mode !== 'off' };
})();
