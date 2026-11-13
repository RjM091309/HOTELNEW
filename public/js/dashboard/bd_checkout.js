/**
 * Check-out from the calendar's Booking details (KGrand style).
 *
 * One simple window instead of the long Confirm Checkout / Payment / Deposit chain:
 *  - what was stayed, what is billed, what is paid;
 *  - for an early check-out, what to do with the nights not stayed (refund / no refund / custom penalty);
 *  - one box that says what is owed, what is refunded, or that it is fully paid, and the one button that goes with it;
 *  - a second step only when a security deposit is held.
 *
 * The rules of the server are unchanged: the same /booking/checkout, /booking/process-payment and
 * /dashboard/booking/refund-security-deposit calls are used. The old dialog stays in room-menu_data.js and is used for
 * the cases this window does not cover yet (the whole group, groups with a bill per room).
 */
(function () {
    'use strict';

    const money = (n) => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /**
     * The numbers of the check-out. `ctx` is computeCheckoutContext() (room-menu_data.js).
     * mode: 'refund' = bill only the nights stayed, 'none' = the guest pays every night booked,
     *       'penalty' = bill the nights stayed plus a penalty (at most the value of the unused nights).
     */
    function compute(ctx, o) {
        o = o || {};
        const mode = o.mode || 'refund';
        const early = !!ctx.isEarlyCheckout;
        const unusedValue = early ? r2(ctx.earlyCheckoutAdjustment) : 0;
        const roomStay = r2(ctx.roomAmountForActualDays);
        const extStay = r2(ctx.billedExtensionAmount);
        const services = r2(ctx.servicesTotal);
        const resFee = r2(ctx.reservationFee);
        const discountFull = r2(ctx.discountAmount);
        // An early check-out drops the discount unless the front desk keeps it (the old rule); a normal one keeps it.
        const discount = early ? (o.keepDiscount ? discountFull : 0) : discountFull;
        const penalty = Math.min(Math.max(0, Number(o.penalty) || 0), unusedValue);
        const kept = mode === 'none' ? unusedValue : mode === 'penalty' ? penalty : 0;
        const paid = r2(ctx.totalPaid);
        const totalFor = (k) => Math.max(0, r2(roomStay + extStay + services + k - discount));
        const total = totalFor(kept);
        const balance = r2(total - resFee - paid);
        // What each choice would give back to the guest (negative: still owed).
        const backFor = (k) => r2(paid - (totalFor(k) - resFee));
        return {
            early, mode, unusedValue, roomStay, extStay, services, resFee, discount, discountFull, penalty, kept, paid, total, balance,
            owes: balance > 0.005, refund: balance < -0.005, amount: Math.abs(balance),
            backFor
        };
    }
    window.__bdCheckoutCompute = compute;

    function injectStyles() {
        if (document.getElementById('bdco-styles')) return;
        const st = document.createElement('style');
        st.id = 'bdco-styles';
        st.textContent = `
            .swal-bdco.swal2-popup { width: 580px !important; max-width: 94vw !important; padding: 1.1rem 1.25rem; }
            .swal-bdco .swal2-title { font-size: 1.45rem; font-weight: 700; color: #2b2f32; padding: .25rem 0 .5rem; }
            .swal-bdco .swal2-html-container { margin: .25rem 0 0; text-align: left; font-size: 15px; color: #495057; }
            .bdco-intro { margin: 0 0 10px; color: #6c757d; }
            .bdco-intro b { color: #212529; }
            .bdco-table { border: 1px solid #dee2e6; border-radius: 8px; padding: 0 12px; margin: 0; }
            .bdco-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f1f3f5; }
            .bdco-row:last-child { border-bottom: 0; }
            .bdco-row.strong { font-weight: 700; color: #212529; }
            .bdco-row dt { font-weight: 400; color: #6c757d; margin: 0; }
            .bdco-row.strong dt { color: #212529; }
            .bdco-row dd { margin: 0; text-align: right; }
            .bdco-fieldset { margin: 12px 0 0; border: 0; padding: 0; }
            .bdco-legend { font-weight: 700; color: #212529; margin: 0 0 6px; font-size: 15px; }
            .bdco-opt { display: flex; gap: 8px; align-items: flex-start; border: 1.5px solid #dee2e6; border-radius: 8px; padding: 9px 11px; margin-bottom: 6px; cursor: pointer; }
            .bdco-opt.on { border-color: #0c2a42; background: #e8f0f7; }
            .bdco-opt input[type=radio] { margin-top: 3px; accent-color: #0c2a42; }
            .bdco-opt-body { flex: 1; min-width: 0; }
            .bdco-opt-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
            .bdco-opt-title { font-weight: 600; color: #212529; }
            .bdco-opt-desc { display: block; font-size: 13px; color: #868e96; margin-top: 2px; }
            .bdco-res-refund { color: #8a5a12; font-weight: 700; white-space: nowrap; }
            .bdco-res-owes { color: #a12b2b; font-weight: 700; white-space: nowrap; }
            .bdco-res-none { color: #868e96; font-weight: 700; white-space: nowrap; }
            .bdco-box { margin-top: 12px; border-radius: 8px; padding: 12px 14px; }
            .bdco-box.owes { background: #fdecec; color: #a12b2b; }
            .bdco-box.refund { background: #fbf0d9; color: #8a5a12; }
            .bdco-box.paid { background: #eef1f3; color: #495057; }
            .bdco-box-label { font-size: 13px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
            .bdco-box-amt { font-size: 32px; font-weight: 800; line-height: 1.15; }
            .bdco-box small { display: block; margin-top: 4px; font-size: 14px; font-weight: 400; }
            .bdco-field { margin-top: 8px; color: #212529; }
            .bdco-field label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 3px; }
            .bdco-field select, .bdco-field input[type=text], .bdco-field input[type=number] { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 6px; font-size: 15px; }
            .bdco-note { margin-top: 10px; padding: 8px 10px; background: #e7f1fb; border-radius: 6px; color: #0c4a82; font-size: 14px; }
            .bdco-link { margin-top: 12px; text-align: center; }
            .bdco-link .bdco-btn { display: block; width: 100%; box-sizing: border-box; padding: 10px 14px; font-size: 15px; font-weight: 600; color: #0c2a42; background: #fff; border: 2px solid #0c2a42; border-radius: 8px; cursor: pointer; }
            .bdco-link .bdco-btn:hover { background: #0c2a42; color: #fff; }
            .swal-bdco .swal2-actions { gap: 10px; margin-top: 14px; }
            .swal-bdco .swal2-actions.bdco-pick { flex-wrap: wrap; }
            .swal-bdco .swal2-actions .btn { font-size: 15px; padding: 8px 18px; }
        `;
        document.head.appendChild(st);
    }

    // Bootstrap's focus trap fights SweetAlert while the Booking details window is open: switch it off meanwhile.
    function suspendFocusTrap() {
        const open = document.querySelector('.modal.show');
        let inst = null; let prev = null; let deactivated = false;
        try {
            if (open && window.bootstrap && bootstrap.Modal) {
                inst = bootstrap.Modal.getInstance(open);
                if (inst && inst._config) { prev = inst._config.focus; inst._config.focus = false; }
                open.setAttribute('data-bs-focus', 'false');
                if (inst && inst._focustrap && typeof inst._focustrap.deactivate === 'function') { inst._focustrap.deactivate(); deactivated = true; }
            }
        } catch (e) { /* ignore */ }
        return () => {
            try {
                if (!open || !inst || !inst._config) return;
                inst._config.focus = (prev !== null ? prev : true);
                open.setAttribute('data-bs-focus', String(prev !== false));
                if (deactivated && inst._focustrap && typeof inst._focustrap.activate === 'function') inst._focustrap.activate();
            } catch (e) { /* ignore */ }
        };
    }

    const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    function finish(bookingId, message) {
        try { if (typeof toastSuccess === 'function') toastSuccess('Checkout', message); } catch (e) { /* no-op */ }
        const m = document.getElementById(`dynamicRoomModal_${bookingId}`);
        try { if (m && window.bootstrap) { const inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); } } catch (e) { /* no-op */ }
        try { if (typeof scheduleCalendarRefresh === 'function') scheduleCalendarRefresh(); else if (typeof refreshCalendarBookings === 'function') refreshCalendarBookings(); } catch (e) { /* no-op */ }
        try { if (typeof dashboardSocket !== 'undefined' && dashboardSocket) dashboardSocket.emit('dashboard-updated', { action: 'calendar-checkout', message: `Booking ${bookingId} checked out` }); } catch (e) { /* no-op */ }
    }

    // The step that only exists when a security deposit is held.
    async function askDeposit(dep, owesNow) {
        const amount = Number(dep.amount) || 0;
        const canApply = owesNow > 0.005;
        const applied = Math.min(amount, owesNow);
        const r = await Swal.fire({
            title: 'Security deposit',
            html: `
                <p class="bdco-intro">A security deposit of <b>${money(amount)}</b> is held for this stay. What happens to it?</p>
                <div id="bdco-dep">
                    <label class="bdco-opt on"><input type="radio" name="bdcoDep" value="full_refund" checked>
                        <span class="bdco-opt-body"><span class="bdco-opt-top"><span class="bdco-opt-title">Refund the deposit</span><span class="bdco-res-refund">${money(amount)}</span></span>
                        <span class="bdco-opt-desc">The whole deposit goes back to the guest.</span></span></label>
                    <label class="bdco-opt"><input type="radio" name="bdcoDep" value="partial_deduct">
                        <span class="bdco-opt-body"><span class="bdco-opt-top"><span class="bdco-opt-title">Keep part (damages)</span><span class="bdco-res-none">you type it</span></span>
                        <span class="bdco-opt-desc">The hotel keeps an amount; the rest goes back to the guest.</span>
                        <span class="bdco-field" id="bdco-dep-keep" style="display:none;"><input type="number" min="0" max="${amount}" step="0.01" id="bdco-dep-keep-amt" placeholder="Amount to keep"></span></span></label>
                    ${canApply ? `<label class="bdco-opt"><input type="radio" name="bdcoDep" value="apply_to_balance">
                        <span class="bdco-opt-body"><span class="bdco-opt-top"><span class="bdco-opt-title">Use it for the balance</span><span class="bdco-res-owes">pays ${money(applied)}</span></span>
                        <span class="bdco-opt-desc">The deposit is put towards what the guest owes${amount > owesNow ? '; the rest goes back to the guest' : ''}.</span></span></label>` : ''}
                </div>`,
            showCancelButton: true,
            confirmButtonText: 'Check out',
            cancelButtonText: 'Back',
            buttonsStyling: false,
            customClass: { popup: 'swal-bdco', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-secondary' },
            didOpen: () => {
                const root = document.getElementById('bdco-dep');
                const sync = () => {
                    root.querySelectorAll('.bdco-opt').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
                    const keep = root.querySelector('input[value="partial_deduct"]').checked;
                    document.getElementById('bdco-dep-keep').style.display = keep ? 'block' : 'none';
                };
                root.addEventListener('change', sync);
            },
            preConfirm: () => {
                const action = document.querySelector('input[name="bdcoDep"]:checked').value;
                let deduct = 0;
                if (action === 'partial_deduct') {
                    deduct = parseFloat(document.getElementById('bdco-dep-keep-amt').value) || 0;
                    if (!(deduct > 0) || deduct > amount + 0.005) { Swal.showValidationMessage(`Enter an amount up to ${money(amount)}.`); return false; }
                }
                return { action, deductAmount: deduct, applyRemainderToBalance: false, remarks: 'Security deposit settled at check-out' };
            }
        });
        if (!r.isConfirmed) return null;
        return { selection: r.value, appliedToBalance: r.value.action === 'apply_to_balance' ? applied : 0 };
    }

    async function open(bookingId, fallbackToOld, opts0) {
        injectStyles();
        const wholeGroup = !!(opts0 && opts0.wholeGroup); // the whole group of a one-bill booking checks out together (bookingId = its main)
        const clickedId = (opts0 && opts0.clickedId) || bookingId;
        const fallback = typeof fallbackToOld === 'function' ? fallbackToOld : () => { /* no-op */ };
        window.__bdKeepNights = false; window.__bdForceScope = null;

        // Which kind of booking is this?
        const [master, groupInfo, ctx, dep] = await Promise.all([
            getJson(`/booking/group-summary/${bookingId}?_=${Date.now()}`),
            getJson(`/payments/group-breakdown/${bookingId}`),
            (typeof computeCheckoutContext === 'function') ? computeCheckoutContext(bookingId) : null,
            (typeof fetchCheckoutDepositInfo === 'function') ? fetchCheckoutDepositInfo(bookingId) : { exists: false, amount: 0 }
        ]);
        if (!ctx) return fallback();
        const inMasterGroup = !!(master && master.success && master.isMaster);
        const inOtherGroup = !!(groupInfo && groupInfo.success && groupInfo.isGroup) && !inMasterGroup;
        // A booking that is part of a group first asks: this room only, or the whole group? (nothing else is mixed in yet)
        const stillIn = inMasterGroup ? (master.rooms || []).filter((x) => String(x.status || '').toLowerCase() !== 'check-out').length : 0;
        if (!wholeGroup && ((inMasterGroup && stillIn >= 2) || inOtherGroup)) {
            const gName = inMasterGroup ? (master.groupName || '') : '';
            const pick = await Swal.fire({
                title: 'Check out',
                html: `This booking is part of a group${gName ? ` (<b>${esc(gName)}</b>)` : ''}.<br>Who is checking out?`,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: 'This room only',
                denyButtonText: 'Whole group',
                cancelButtonText: 'Cancel',
                buttonsStyling: false,
                reverseButtons: false,
                customClass: { popup: 'swal-bdco', confirmButton: 'btn btn-primary', denyButton: 'btn btn-primary', cancelButton: 'btn btn-secondary', actions: 'bdco-pick' }
            });
            if (pick.isDismissed) return;
            if (pick.isDenied) {
                // one-bill group: the new whole-group window (on the main booking); a group with a bill per room: the old window
                if (inMasterGroup) return open(master.mainBookingId, fallbackToOld, { wholeGroup: true, clickedId: bookingId });
                window.__bdForceScope = 'group'; return fallback();
            }
            if (inOtherGroup) { window.__bdForceScope = 'individual'; return fallback(); }
        }
        const grouped = inMasterGroup;
        // Whole group: the nights not stayed of EVERY room count (the options below apply to all of them).
        if (wholeGroup && grouped && typeof computeCheckoutContext === 'function') {
            let extraUnused = 0;
            const others = (master.rooms || []).filter((x) => String(x.id) !== String(bookingId) && String(x.status || '').toLowerCase() !== 'check-out');
            for (const m of others) {
                try {
                    const mc = await computeCheckoutContext(m.id);
                    if (mc && mc.isEarlyCheckout) extraUnused += Number(mc.earlyCheckoutAdjustment) || 0;
                } catch (e) { /* that room simply adds nothing */ }
            }
            if (extraUnused > 0) {
                ctx.earlyCheckoutAdjustment = (Number(ctx.earlyCheckoutAdjustment) || 0) + extraUnused;
                ctx.isEarlyCheckout = true;
            }
        }
        const roomsLeft = (master && master.rooms ? master.rooms.filter((x) => String(x.status || '').toLowerCase() !== 'check-out').length : 0);

        const checkoutBtn = document.getElementById(`btnCheckout-${clickedId}`);
        const overdue = !!(checkoutBtn && checkoutBtn.getAttribute('data-ec-choice') === '1' && checkoutBtn.getAttribute('data-ec-overdue') === '1');
        const dateChoice = overdue ? { scheduled: checkoutBtn.getAttribute('data-ec-scheduled') || '', overdue: true } : null;

        const heldAmount = (dep && dep.exists) ? Number(dep.amount) || 0 : 0;
        const state = { mode: 'refund', penalty: 0, keepDiscount: false, method: 'cash', approver: '' };
        const calc = () => compute(ctx, state);
        // Group with one shared bill: whatever the group still owes has to be settled (or left as credit) before a room leaves.
        // The group's balance follows the choice made here: nights not stayed that are released (or not kept) come off it.
        const gBalOf = (c) => (grouped && master.isMain)
            ? Math.max(0, r2((Number(master.balance) || 0) - (c.unusedValue - c.kept) + (c.discountFull - c.discount)))
            : 0;
        const gOwesOf = (c) => gBalOf(c) > 0.005;
        const methodHtml = () => `<div class="bdco-field"><label for="bdco-method">Payment method</label>
                    <select id="bdco-method">
                        <option value="cash"${state.method === 'cash' ? ' selected' : ''}>Cash</option>
                        <option value="bank_transfer"${state.method === 'bank_transfer' ? ' selected' : ''}>Bank transfer</option>
                        <option value="credit_card"${state.method === 'credit_card' ? ' selected' : ''}>Credit card</option>
                        <option value="credit"${state.method === 'credit' ? ' selected' : ''}>Pay later (credit)</option>
                    </select></div>
                    <div class="bdco-field" id="bdco-approver-wrap" style="display:${state.method === 'credit' ? 'block' : 'none'};"><label for="bdco-approver">Approved by</label>
                    <input type="text" id="bdco-approver" value="${esc(state.approver)}" placeholder="Who approved leaving this unpaid?"></div>`;
        const restoreFocus = suspendFocusTrap();

        // Group with one shared bill: this room's nights not stayed come off (or stay on) the MAIN bill, so the table shows the group's bill.
        const releasedOf = (c) => Math.max(0, r2(c.unusedValue - c.kept));
        const groupRows = (c) => {
            const net = Number(master.net) || 0;
            const paidG = Number(master.paid) || 0;
            const rel = releasedOf(c);
            const after = Math.max(0, r2(net - rel));
            const due = r2(after - paidG);
            const r = [['Group bill now', money(net)]];
            if (rel > 0.005) r.push(['Nights not stayed (' + (wholeGroup ? 'all rooms' : 'this room') + '), taken off', '-' + money(rel)]);
            else if (c.early && c.unusedValue > 0) r.push(['Nights not stayed (' + (wholeGroup ? 'all rooms' : 'this room') + '), kept', money(0)]);
            r.push(['Group bill after check-out', money(after), true]);
            r.push(['Paid so far (on the main)', money(paidG)]);
            if (due > 0.005) r.push(['Still to pay on the main', money(due)]);
            else if (due < -0.005) r.push(['Overpaid, to refund from the main', money(-due)]);
            return r.map((x) => `<div class="bdco-row${x[2] ? ' strong' : ''}"><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`).join('');
        };

        const rows = (c) => {
            if (grouped) return groupRows(c);
            const r = [];
            const early = c.early;
            const days = early ? ctx.actualDays : ctx.originalQty;
            r.push(['Room (' + days + ' × ' + money(ctx.roomRate) + ')', money(c.roomStay)]);
            if (ctx.extensionDays > 0) r.push(['Extended stay (' + (early ? ctx.billedExtensionDays : ctx.extensionDays) + ' × ' + money(ctx.extensionRate) + ')', money(c.extStay)]);
            if (c.kept > 0) r.push([c.mode === 'penalty' ? 'Early check-out penalty' : 'Nights not stayed, kept', money(c.kept)]);
            if (c.services > 0) r.push(['Services and charges', money(c.services)]);
            if (c.discount > 0) r.push(['Discount', '-' + money(c.discount)]);
            if (c.resFee > 0) r.push(['Reservation fee paid', '-' + money(c.resFee)]);
            r.push(['Total for the stay', money(c.total - c.resFee), true]);
            if (!grouped) r.push(['Paid so far', money(c.paid)]);
            return r.map((x) => `<div class="bdco-row${x[2] ? ' strong' : ''}"><dt>${x[0]}</dt><dd>${x[1]}</dd></div>`).join('');
        };

        const optionsHtml = (c) => {
            if (!c.early || c.unusedValue <= 0) return '';
            const nightsLeft = Math.max(1, (ctx.totalBookedDays || 0) - (ctx.calendarActualDays || 0));
            const defs = [
                ['refund', 'Refund the unused nights', wholeGroup ? `The nights not stayed by the rooms (${money(c.unusedValue)}) are not billed.` : `${nightsLeft} night${nightsLeft > 1 ? 's' : ''} not stayed (${money(c.unusedValue)}) are not billed.`],
                ['none', 'No refund', 'The guest still pays for all the nights booked.'],
                ['penalty', 'Custom penalty', 'The hotel keeps an amount you type; the rest of the unused nights is not billed.']
            ];
            return `<fieldset class="bdco-fieldset"><legend class="bdco-legend">The nights not stayed</legend>${defs.map(([key, title, desc]) => {
                let res = '';
                if (grouped) {
                    const rel = key === 'none' ? 0 : key === 'penalty' ? Math.max(0, c.unusedValue - c.penalty) : c.unusedValue;
                    res = rel > 0.005 ? `<span class="bdco-res-refund">Main bill -${money(rel)}</span>` : '<span class="bdco-res-none">Main bill unchanged</span>';
                } else {
                    const back = c.backFor(key === 'none' ? c.unusedValue : key === 'penalty' ? c.penalty : 0);
                    res = back > 0.005 ? `<span class="bdco-res-refund">Refund ${money(back)}</span>` : back < -0.005 ? `<span class="bdco-res-owes">Owes ${money(-back)}</span>` : '<span class="bdco-res-none">No refund</span>';
                }
                return `<label class="bdco-opt${state.mode === key ? ' on' : ''}"><input type="radio" name="bdcoMode" value="${key}" ${state.mode === key ? 'checked' : ''}>
                    <span class="bdco-opt-body"><span class="bdco-opt-top"><span class="bdco-opt-title">${title}</span>${res}</span>
                    <span class="bdco-opt-desc">${desc}</span>
                    ${key === 'penalty' && state.mode === 'penalty' ? `<span class="bdco-field"><input type="text" inputmode="decimal" autocomplete="off" max="${c.unusedValue}" id="bdco-pen" value="${state.penText != null ? state.penText : (state.penalty || '')}" placeholder="Penalty amount (up to ${money(c.unusedValue)})"></span>` : ''}
                    </span></label>`;
            }).join('')}</fieldset>${ctx.discountAmount > 0 ? `<label style="display:flex;gap:6px;margin-top:8px;"><input type="checkbox" id="bdco-keepdisc" ${state.keepDiscount ? 'checked' : ''}> Keep the discount (${money(ctx.discountAmount)}) on this early check-out</label>` : ''}`;
        };

        const resultHtml = (c) => {
            if (grouped) {
                const note = wholeGroup ? `<div class="bdco-note">All ${roomsLeft} rooms of the group check out together. The group has one shared bill.</div>` : `<div class="bdco-note">This room belongs to a group with one shared bill. ${master.isMain ? '' : `The main booking (room ${esc(String(master.mainRoomNo || ''))}) settles it &mdash; nothing to pay here.`}</div>`;
                if (!gOwesOf(c)) return note;
                return `<div class="bdco-box owes"><div class="bdco-box-label">The group still owes</div><div class="bdco-box-amt">${money(gBalOf(c))}</div>
                    <small>Next you pay it in the Payment window (cash, bank, card or credit). The room is checked out after the payment.</small></div>${note}`;
            }
            const label = c.owes ? 'The guest still owes' : c.refund ? 'Refund to the guest' : '';
            let inner = c.owes || c.refund
                ? `<div class="bdco-box-label">${label}</div><div class="bdco-box-amt">${money(c.amount)}</div>`
                : '<div style="font-weight:700;">Fully paid: nothing to collect or refund.</div>';
            if (c.owes && heldAmount > 0) inner += usesPaymentWindow(c) ? `<small>A security deposit of ${money(heldAmount)} is held. In the Payment window it can be put towards this balance.</small>` : `<small>A security deposit of ${money(heldAmount)} is held. In the next step it can be put towards this balance.</small>`;
            if (c.refund) inner += '<small>Refunded in cash.</small>';
            return `<div class="bdco-box ${c.owes ? 'owes' : c.refund ? 'refund' : 'paid'}">${inner}</div>`;
        };

        // A single booking that still owes money pays in the Payment window BEFORE it is checked out (the same window the group uses).
        // Every single booking that owes money pays in the Payment window; if it will not be paid now, "Credit" is chosen THERE.
        // "No refund" and a penalty are added to what the Payment window asks for.
        const usesPaymentWindow = (c) => !grouped && c.owes && typeof beginCheckoutPaymentFlow === 'function';

        const buttonLabel = (c) => {
            if (grouped) {
                if (gOwesOf(c)) return `Next: pay ${money(gBalOf(c))}`;
                return wholeGroup ? '<i class="fas fa-sign-out-alt me-1"></i>Check out the whole group' : '<i class="fas fa-sign-out-alt me-1"></i>Check out this room';
            }
            if (c.owes) {
                if (usesPaymentWindow(c)) return `Next: pay ${money(c.amount)}`;
                if (heldAmount > 0) return 'Next: security deposit';
                return state.method === 'credit' ? 'Check out, pay later' : `Pay ${money(c.amount)} & check out`;
            }
            if (c.refund) return `Refund ${money(c.amount)} & check out`;
            return heldAmount > 0 ? 'Next: security deposit' : '<i class="fas fa-sign-out-alt me-1"></i>Check out';
        };

        const intro = () => {
            const booked = ctx.totalBookedDays;
            const stayed = ctx.calendarActualDays;
            const sched = checkoutBtn ? checkoutBtn.getAttribute('data-ec-scheduled') : '';
            if (wholeGroup) return ctx.isEarlyCheckout ? `Check out the whole group (${roomsLeft} rooms). Some rooms leave before the nights they booked.` : `Check out the whole group (${roomsLeft} rooms).`;
            if (ctx.isEarlyCheckout) {
                const left = Math.max(1, booked - stayed);
                return `This stay is booked for <b>${booked} night${booked > 1 ? 's' : ''}</b>. The guest has stayed <b>${stayed} night${stayed > 1 ? 's' : ''}</b>, so only those are billed and the other ${left} night${left > 1 ? 's are' : ' is'} released.`;
            }
            return `Check out this guest${sched ? ` (booked until <b>${esc(sched)}</b>)` : ''}.`;
        };

        const render = () => {
            const c = calc();
            const el = document.getElementById('bdco-body');
            if (!el) return;
            el.innerHTML = `
                <p class="bdco-intro">${intro()}</p>
                ${dateChoice && typeof buildCheckoutDateChoiceHtml === 'function' ? buildCheckoutDateChoiceHtml(dateChoice) : ''}
                <dl class="bdco-table">${rows(c)}</dl>
                ${optionsHtml(c)}
                ${resultHtml(c)}`;
            const btn = Swal.getConfirmButton();
            if (btn) btn.innerHTML = buttonLabel(c);
            el.querySelectorAll('input[name="bdcoMode"]').forEach((i) => i.addEventListener('change', () => { state.mode = i.value; render(); }));
            const pen = el.querySelector('#bdco-pen');
            if (pen) {
                const place = (node, pos) => { try { node.focus(); node.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } };
                if (state.penPos != null) place(pen, state.penPos);
                pen.addEventListener('input', () => {
                    const max = parseFloat(pen.max) || 0;
                    const before = pen.value;
                    let pos = pen.selectionStart == null ? before.length : pen.selectionStart;
                    // numbers only (one dot, 2 decimals), no leading zeros ("02000" -> "2000")
                    let clean = before.replace(/[^0-9.]/g, '');
                    const dot = clean.indexOf('.');
                    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
                    clean = clean.replace(/^0+(?=\d)/, '');
                    if (parseFloat(clean) > max) clean = String(max);
                    pos = Math.max(0, Math.min(clean.length, pos - (before.length - clean.length)));
                    state.penalty = parseFloat(clean) || 0;
                    state.penText = clean;
                    state.penPos = pos;
                    render();
                    state.penPos = null;
                });
            }
            const kd = el.querySelector('#bdco-keepdisc');
            if (kd) kd.addEventListener('change', () => { state.keepDiscount = kd.checked; render(); });
            const method = el.querySelector('#bdco-method');
            if (method) method.addEventListener('change', () => {
                state.method = method.value;
                el.querySelector('#bdco-approver-wrap').style.display = state.method === 'credit' ? 'block' : 'none';
                const b = Swal.getConfirmButton(); if (b) b.innerHTML = buttonLabel(calc());
            });
            const ap = el.querySelector('#bdco-approver');
            if (ap) ap.addEventListener('input', () => { state.approver = ap.value; });
            if (typeof setupCheckoutDateChoiceControls === 'function' && dateChoice) setupCheckoutDateChoiceControls();
        };

        const r = await Swal.fire({
            title: 'Check out',
            html: '<div id="bdco-body"></div>',
            showCancelButton: true,
            confirmButtonText: 'Check out',
            cancelButtonText: 'Cancel',
            buttonsStyling: false,
            focusConfirm: false,
            customClass: { popup: 'swal-bdco', confirmButton: 'btn btn-primary', cancelButton: 'btn btn-secondary' },
            willClose: () => restoreFocus(),
            didOpen: () => render(),
            preConfirm: () => {
                const c = calc();
                if (state.mode === 'penalty' && c.early && !(c.penalty > 0)) { Swal.showValidationMessage('Enter the penalty amount.'); return false; }
                if ((!grouped && c.owes) && state.method === 'credit' && !String(state.approver).trim()) { Swal.showValidationMessage('Enter who approved leaving this unpaid.'); return false; }
                const dm = document.querySelector('input[name="checkoutDateMode"]:checked');
                return { checkoutDateMode: dm && dm.value === 'scheduled' ? 'scheduled' : 'now' };
            }
        });

        if (!r.isConfirmed) return;

        const c = calc();
        const opts = r.value || {};
        let depositResult = null;

        // Shared group bill with something still owed: the payment is taken in the normal Payment window (same as the
        // main booking's Payment button). That window checks the room out once the payment is confirmed.
        if (gOwesOf(c) && typeof beginCheckoutPaymentFlow === 'function') {
            window.__bdKeepNights = c.early && c.mode === 'none';
            // The Payment window must ask for what the GROUP owes (not just this room's own charges).
            let breakdown = {};
            try {
                const bill = await getJson(`/booking/get-billing/${bookingId}?_=${Date.now()}`);
                const its = Array.isArray(bill && bill.items) ? bill.items : [];
                let room = 0, ext = 0, other = 0;
                its.forEach((it, i) => {
                    const v = Number(it.subTotal) || 0;
                    if (i === 0) room += v; else if (/\(Extended\)/i.test(String(it.description || ''))) ext += v; else other += v;
                });
                breakdown = { roomAmount: room, extensionAmount: ext, serviceAmount: other, reservationFee: Number(bill && bill.reservationFee) || 0, discountAmount: Number(bill && bill.discountAmount) || 0, amountPaid: Number(master.paid) || 0 };
            } catch (e) { breakdown = {}; }
            window.__bdGroupPay = { bookingId, balance: gBalOf(c), released: releasedOf(c), breakdown };
            await beginCheckoutPaymentFlow(bookingId, {
                hasRefund: false,
                amount: 0,
                scope: wholeGroup ? 'group' : 'individual',
                penaltyAmount: c.mode === 'penalty' && c.early ? c.penalty : 0,
                applyDiscount: c.early ? !!state.keepDiscount : true,
                checkoutDateMode: opts.checkoutDateMode || 'now'
            }, dep && dep.exists ? dep : null);
            return;
        }

        // A single booking with a balance: the Payment window first (cash, bank, card; the held deposit can be used there), and the room
        // is checked out only after the payment is confirmed.
        if (usesPaymentWindow(c)) {
            window.__bdKeepNights = c.early && c.mode === 'none';
            window.__bdGroupPay = null;
            // Only a penalty is added on top. With "No refund" the flag above already makes computeCheckoutContext bill every night booked,
            // so adding the kept nights again would count them twice.
            window.__bdSingleExtra = { bookingId, extra: (c.mode === 'penalty' && c.early) ? (c.kept || 0) : 0 };
            await beginCheckoutPaymentFlow(bookingId, {
                hasRefund: false,
                amount: 0,
                scope: 'individual',
                penaltyAmount: c.mode === 'penalty' && c.early ? c.penalty : 0,
                applyDiscount: c.early ? !!state.keepDiscount : true,
                checkoutDateMode: opts.checkoutDateMode || 'now'
            }, dep && dep.exists ? dep : null);
            return;
        }

        // Step 2 (only with a deposit): what happens to it.
        if ((!grouped || wholeGroup) && heldAmount > 0) {
            const restore2 = suspendFocusTrap();
            depositResult = await askDeposit(dep, grouped ? 0 : (c.owes ? c.amount : 0));
            restore2();
            if (!depositResult) return open(bookingId, fallbackToOld, opts0);
        }

        Swal.fire({ title: 'Checking out...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const fail = (msg) => Swal.fire({ icon: 'error', title: 'Checkout failed', text: msg, heightAuto: false });

        let groupNote = '';
        let out;
        try {
            const body = {
                bookingId,
                scope: wholeGroup ? 'group' : 'individual',
                hasRefund: !grouped && c.refund,
                refundAmount: !grouped && c.refund ? c.amount : 0,
                penaltyAmount: c.mode === 'penalty' && c.early ? c.penalty : 0,
                applyDiscount: c.early ? !!state.keepDiscount : true,
                checkoutDateMode: opts.checkoutDateMode || 'now',
                keepBookedNights: c.early && c.mode === 'none'
            };
            const res = await fetch('/booking/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            out = await res.json();
            if (!res.ok || !out || !out.success) throw new Error((out && out.message) || 'Checkout failed');
        } catch (e) {
            return fail(e.message || 'Checkout failed');
        }

        // The deposit is settled after the check-out, so "use it for the balance" is measured on the bill as it now stands
        // (nights not stayed already taken off, penalty added).
        let depositApplied = 0;
        let remainingAfterDeposit = null;
        if (depositResult) {
            try {
                const dr = await processCheckoutDeposit(bookingId, depositResult.selection);
                depositApplied = Number(dr && dr.appliedToBalance) || 0;
                if (dr && dr.remainingBalance != null) remainingAfterDeposit = Number(dr.remainingBalance);
            } catch (e) {
                Swal.close();
                finish(clickedId, 'Checked out.');
                return Swal.fire({ icon: 'warning', title: 'Checked out, deposit not settled', text: `The guest is checked out, but the security deposit could not be processed (${e.message}). It is still held.`, heightAuto: false });
            }
        }

        // What is still owed (after the deposit) is collected now, or left as the guest's credit.
        let note = '';
        if (!grouped && c.owes) {
            const remaining = r2(remainingAfterDeposit != null ? remainingAfterDeposit : c.amount - depositApplied);
            if (remaining > 0.005) {
                try {
                    const pay = {
                        bookingId,
                        paymentAmount: remaining,
                        paymentMethod: state.method,
                        paymentNotes: state.method === 'credit' ? `Credit approved by: ${String(state.approver).trim()}.` : ''
                    };
                    const pr = await fetch('/booking/process-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pay) });
                    const pj = await pr.json();
                    if (!pr.ok || !(pj && pj.success)) throw new Error((pj && (pj.message || pj.error)) || 'Payment failed');
                    if (state.method === 'credit') note = ` ${money(remaining)} is left as credit.`;
                } catch (e) {
                    Swal.close();
                    finish(bookingId, 'Checked out.');
                    return Swal.fire({ icon: 'warning', title: 'Checked out, payment not recorded', text: `The guest is checked out, but the payment of ${money(remaining)} was not recorded (${e.message}). Record it from the Guest Bill.`, heightAuto: false });
                }
            }
        }
        Swal.close();
        finish(clickedId, 'Checkout completed.' + note + groupNote);
    }

    window.bdCheckoutOpen = open;
})();
