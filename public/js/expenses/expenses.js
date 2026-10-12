// ========================================
// EXPENSES (cage-system concept, data entry only - no settlement)
//   date range | total expenses / return money / net | selected total + breakdown |
//   main category | sub category | expenses table
// Return money ("sukli", the change given back) is listed with the expenses under
// its own green main category "Return Money" and taken off the expenses for the net.
// ========================================

(function () {
'use strict';

const RETURN_MONEY = 'Return Money';
const UNCATEGORIZED = 'Uncategorized';
const BAR_COLORS = ['#3b59ff', '#f06522', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#4f46e5', '#b45309'];
const RETURN_COLOR = '#109d59';
const RECEIPT_URL = '/uploads/expense_receipts/';

const xp = {
    rows: null,        // expenses and return money, one shape (see toRow / toReturnRow)
    categories: [],    // { id, name, parentId }
    vehicles: [],      // { id, name } for the expense form
    range: ['', ''],   // 'YYYY-MM-DD' pair; empty = any date
    main: '',
    sub: '',
    table: null,
    fp: null,
    breakdown: { name: '', color: '', sort: { key: 'date', dir: -1 } },
    vehicleList: []
};

document.addEventListener('DOMContentLoaded', function () {
    initTable();
    initRangePicker();
    bindEvents();
    loadData();
});

// ========================================
// DATA
// ========================================

function loadData() {
    $.getJSON('/expenses/data')
        .done(applyData)
        .fail(function () { showError('Failed to load expenses.'); });
}

function toRow(e) {
    return {
        kind: 'expense',
        id: String(e.IDNo),
        date: e.EXPENSE_DATE || '',
        main: (e.MAIN_CATEGORY || '').trim(),
        sub: (e.SUB_CATEGORY || '').trim(),
        details: e.Description || '',
        inCharge: e.IN_CHARGE || '',
        vehicleId: e.VEHICLE_ID ? String(e.VEHICLE_ID) : '',
        vehicleName: e.VEHICLE_NAME || '',
        odo: e.ODO == null ? null : Number(e.ODO),
        photo: e.RECEIPT_PHOTO || '',
        amount: Number(e.Amount) || 0,
        encodedBy: e.ENCODED_BY || '',
        encodedDt: e.ENCODED_DT || ''
    };
}

function toReturnRow(r) {
    return {
        kind: 'return',
        id: String(r.IDNo),
        date: r.RETURN_DATE || '',
        main: RETURN_MONEY,
        sub: '',
        details: r.DESCRIPTION || '',
        inCharge: '',
        vehicleName: '',
        odo: null,
        photo: '',
        amount: Number(r.AMOUNT) || 0,
        encodedBy: r.ENCODED_BY || '',
        encodedDt: r.ENCODED_DT || ''
    };
}

function applyData(res) {
    if (!res || !res.success) return showError((res && res.message) || 'Failed to load expenses.');
    xp.rows = (res.expenses || []).map(toRow).concat((res.returns || []).map(toReturnRow))
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.encodedDt || '').localeCompare(a.encodedDt || ''); });
    xp.categories = (res.categories || []).map(function (c) {
        return { id: String(c.IDNo), name: c.CATEGORY, parentId: c.PARENT_ID == null ? '' : String(c.PARENT_ID) };
    });
    xp.vehicles = (res.vehicles || []).map(function (v) { return { id: String(v.IDNo), name: v.NAME }; });
    render();
}

const mainOf = (r) => (r.kind === 'return' ? RETURN_MONEY : r.main || UNCATEGORIZED);
const isVehicleMain = (name) => /vehicle|차량/i.test(name || '');
const vehicleLine = (r) => [r.vehicleName, r.odo != null ? 'ODO ' + Number(r.odo).toLocaleString('en-US') + ' km' : ''].filter(Boolean).join(' - ');

function categoryTree() {
    return xp.categories.filter((c) => !c.parentId).map((m) => ({ ...m, subs: xp.categories.filter((c) => c.parentId === m.id) }));
}

/** The rows inside the date range. */
function inDates() {
    const [from, to] = xp.range;
    return (xp.rows || []).filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
}

/** The rows inside the date range and the selected category. */
function selectedRows() {
    return inDates().filter((r) => (!xp.main || mainOf(r) === xp.main) && (!xp.sub || r.sub === xp.sub));
}

const sumOf = (list, kind) => list.reduce((s, r) => s + (r.kind === kind ? r.amount : 0), 0);

// ========================================
// RENDER
// ========================================

function render() {
    const rows = inDates();
    const total = sumOf(rows, 'expense');
    const returned = sumOf(rows, 'return');
    const expenseCount = rows.filter((r) => r.kind === 'expense').length;
    const returnCount = rows.length - expenseCount;
    const label = dateLabel();

    $('#xp-total').text(peso(total));
    $('#xp-total-meta').text(label + ' · ' + expenseCount + (expenseCount === 1 ? ' entry' : ' entries'));
    $('#xp-returned').text(peso(returned));
    $('#xp-returned-meta').text(label + ' · ' + returnCount + (returnCount === 1 ? ' entry' : ' entries'));
    $('#xp-net').text(peso(total - returned));
    $('#xp-net-meta').text(label + ' · expenses less return money');

    // Selected total, as a share of everything, the return money, or the expenses.
    const selected = selectedRows();
    const selectedTotal = selected.reduce((s, r) => s + r.amount, 0);
    const base = !xp.main ? total + returned : xp.main === RETURN_MONEY ? returned : total;
    const scope = xp.main ? xp.main + (xp.sub ? ' › ' + xp.sub : '') : 'All categories';
    const of = xp.main === RETURN_MONEY ? 'return money' : xp.main ? 'expenses' : 'total';
    $('#xp-selected').text(peso(selectedTotal));
    $('#xp-selected-meta').text(scope + (base > 0 ? ' · ' + ((selectedTotal / base) * 100).toFixed(1) + '% of ' + of : ''));
    $('#xp-selected-card').toggleClass('is-return', xp.main === RETURN_MONEY);

    const mains = mainItems(rows);
    renderBreakdown(mains, total + returned);
    renderMainList(mains, rows.length);
    renderSubList(rows);
    renderButtons();
    renderTable(selected);
    $('#xp-table-scope').text(xp.main ? scope : '');
}

/** The main categories with their counts and totals: the saved ones, then names only found on the rows, then Return Money. */
function mainItems(rows) {
    const stats = {};
    rows.forEach((r) => {
        const k = mainOf(r);
        stats[k] = stats[k] || { count: 0, sum: 0 };
        stats[k].count += 1;
        stats[k].sum += r.amount;
    });
    const tree = categoryTree();
    const items = tree.map((m) => ({ name: m.name, category: m, ...(stats[m.name] || { count: 0, sum: 0 }) }));
    Object.keys(stats)
        .filter((n) => n !== RETURN_MONEY && !tree.some((m) => m.name === n))
        .forEach((n) => items.push({ name: n, ...stats[n] }));
    items.push({ name: RETURN_MONEY, isReturn: true, ...(stats[RETURN_MONEY] || { count: 0, sum: 0 }) });
    return items;
}

function renderBreakdown(mains, base) {
    const top = mains.filter((m) => m.sum > 0).sort((a, b) => b.sum - a.sum).slice(0, 8);
    if (!top.length) {
        $('#xp-breakdown-body').html('<div class="xp-muted xp-small">No expense data for ' + escapeHtml(dateLabel() === 'All dates' ? 'any date' : dateLabel()) + '.</div>');
        return;
    }
    let i = 0;
    const html = top.map((m) => {
        const color = m.isReturn ? RETURN_COLOR : BAR_COLORS[i++ % BAR_COLORS.length];
        const pct = base > 0 ? (m.sum / base) * 100 : 0;
        return (
            '<button type="button" class="xp-bar-row' + (xp.main === m.name ? ' is-active' : '') + '" data-bd="' + attr(m.name) + '" data-color="' + color + '" title="Click to see its entries">' +
            '<span class="xp-bar-row__name"><span class="xp-dot" style="background:' + color + '"></span><span>' + escapeHtml(m.name) + '</span></span>' +
            '<span class="xp-track" style="background:' + color + '24"><span class="xp-fill" style="width:' + Math.min(100, pct).toFixed(2) + '%;background:' + color + '"></span></span>' +
            '<span class="xp-bar-row__value"><strong>' + peso(m.sum) + '</strong> <span style="color:' + color + '">(' + pct.toFixed(1) + '%)</span></span>' +
            '</button>'
        );
    });
    $('#xp-breakdown-body').html(html.join(''));
}

function catItemHtml(item, active, level) {
    const actions = item.category
        ? '<span class="xp-cat__actions">' +
          '<button type="button" data-cat-edit="' + item.category.id + '" title="Rename"><i class="fa fa-pen"></i></button>' +
          '<button type="button" class="is-danger" data-cat-del="' + item.category.id + '" title="Delete"><i class="fa fa-trash"></i></button>' +
          '</span>'
        : '';
    return (
        '<div class="xp-cat' + (active ? ' is-active' : '') + (item.isReturn ? ' xp-cat--return' : '') + '" data-' + level + '="' + attr(item.name) + '">' +
        '<span class="xp-cat__name"><span title="' + attr(item.name) + '">' + escapeHtml(item.name) + '</span>' +
        (item.sum > 0 ? '<span class="xp-cat__sum">' + peso(item.sum) + '</span>' : '') + '</span>' +
        '<span class="xp-cat__side">' + actions + '<span class="xp-count">' + item.count + '</span></span>' +
        '</div>'
    );
}

function renderMainList(mains, allCount) {
    const html = ['<div class="xp-cat' + (!xp.main ? ' is-active' : '') + '" data-main=""><span class="xp-cat__name"><span>All categories</span></span><span class="xp-count">' + allCount + '</span></div>'];
    mains.forEach((m) => html.push(catItemHtml(m, xp.main === m.name, 'main')));
    $('#xp-main-list').html(html.join(''));
}

function renderSubList(rows) {
    const $list = $('#xp-sub-list');
    const mainCat = categoryTree().find((m) => m.name === xp.main);
    $('#xp-add-sub').prop('disabled', !mainCat);
    if (!xp.main) return $list.html('<div class="xp-empty">Select a main category</div>');
    if (xp.main === RETURN_MONEY || xp.main === UNCATEGORIZED) return $list.html('<div class="xp-empty">No sub categories for this main</div>');

    const ofMain = rows.filter((r) => mainOf(r) === xp.main);
    const stats = {};
    ofMain.forEach((r) => {
        if (!r.sub) return;
        stats[r.sub] = stats[r.sub] || { count: 0, sum: 0 };
        stats[r.sub].count += 1;
        stats[r.sub].sum += r.amount;
    });
    const subs = mainCat ? mainCat.subs : [];
    const items = subs.map((c) => ({ name: c.name, category: c, ...(stats[c.name] || { count: 0, sum: 0 }) }));
    Object.keys(stats).filter((n) => !subs.some((c) => c.name === n)).forEach((n) => items.push({ name: n, ...stats[n] }));
    if (!items.length) return $list.html('<div class="xp-empty">No sub categories for this main</div>');

    const html = ['<div class="xp-cat' + (!xp.sub ? ' is-active' : '') + '" data-sub=""><span class="xp-cat__name"><span>All</span></span><span class="xp-count">' + ofMain.length + '</span></div>'];
    items.forEach((it) => html.push(catItemHtml(it, xp.sub === it.name, 'sub')));
    $list.html(html.join(''));
}

/** As in the cage system, the buttons follow the selected main category. */
function renderButtons() {
    $('#xp-btn-new').toggleClass('xp-hidden', !xp.main || xp.main === RETURN_MONEY);
    $('#xp-btn-return').toggleClass('xp-hidden', xp.main !== RETURN_MONEY);
    $('#xp-btn-vehicles').toggleClass('xp-hidden', !isVehicleMain(xp.main));
}

function renderTable(rows) {
    if (!xp.table) return;
    xp.table.clear();
    xp.table.rows.add(rows.map((r) => {
        const isReturn = r.kind === 'return';
        const cls = isReturn ? ' class="xp-return-text"' : '';
        const subLine = r.sub ? '<span class="xp-sub-line">' + escapeHtml(r.sub) + '</span>' : '';
        const vLine = vehicleLine(r) ? '<span class="xp-sub-line"><i class="fa fa-car"></i> ' + escapeHtml(vehicleLine(r)) + '</span>' : '';
        const time = r.encodedDt ? ', ' + r.encodedDt.slice(11, 16) : '';
        const key = r.kind + ':' + r.id;
        return {
            category: '<strong' + cls + '>' + escapeHtml(mainOf(r)) + '</strong>' + subLine,
            details: escapeHtml(r.details || '—') + vLine,
            inCharge: escapeHtml(r.inCharge || '—'),
            amount: { display: '<span' + cls + '><strong>' + peso(r.amount) + '</strong></span>', sort: r.amount },
            date: {
                display: (r.date ? fmtDate(r.date) : '—') + time + (r.encodedBy ? '<span class="xp-sub-line">by ' + escapeHtml(r.encodedBy) + '</span>' : ''),
                sort: r.date + ' ' + r.encodedDt
            },
            actions: '<div class="xp-actions">' +
                '<button type="button" data-act="receipt" data-key="' + key + '" title="View receipt"><i class="fa fa-image"></i></button>' +
                '<button type="button" data-act="edit" data-key="' + key + '" title="Edit"><i class="fa fa-pen"></i></button>' +
                '<button type="button" class="is-danger" data-act="delete" data-key="' + key + '" title="Delete"><i class="fa fa-trash"></i></button>' +
            '</div>'
        };
    }));
    xp.table.draw();
}

function initTable() {
    if (typeof $.fn.DataTable === 'undefined') return;
    xp.table = $('#expenses_tbl').DataTable({
        data: [],
        order: [],
        pageLength: 20,
        lengthMenu: [5, 20, 50, 100, 200],
        autoWidth: false,
        // Amount and Date sort by their values, not the text shown.
        columns: [
            { data: 'category' },
            { data: 'details' },
            { data: 'inCharge' },
            { data: 'amount', className: 'text-end', render: { _: 'display', sort: 'sort', type: 'sort' } },
            { data: 'date', render: { _: 'display', sort: 'sort', type: 'sort' } },
            { data: 'actions', orderable: false, searchable: false, className: 'text-end' }
        ],
        language: {
            search: 'Search:',
            lengthMenu: 'Show _MENU_ entries',
            info: 'Showing _START_ to _END_ of _TOTAL_ entries',
            emptyTable: 'No expenses found for this date range or category.'
        }
    });
}

// ========================================
// DATE RANGE (cage: three months, this month on the right, a month name picks the whole month)
// ========================================

function initRangePicker() {
    if (typeof flatpickr === 'undefined') return;
    const months = window.innerWidth >= 992 ? 3 : 1;
    xp.range = [today(), today()];
    xp.fp = flatpickr('#xp-range', {
        mode: 'range',
        showMonths: months,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        altInputClass: 'xp-range__input',
        monthSelectorType: 'static',
        disableMobile: true,
        defaultDate: xp.range,
        onReady: function (_d, _s, fp) {
            fp.calendarContainer.classList.add('xp-fp');
            bindMonthNameSelect(fp);
        },
        onOpen: function (_d, _s, fp) {
            const now = new Date();
            fp.jumpToDate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1), false);
        },
        onChange: function (dates) {
            if (dates.length === 2) setRange(ymd(dates[0]), ymd(dates[1]));
        }
    });
}

/** Clicking a month's name selects that whole month (the cage system's flatpickr_month_range.js). */
function bindMonthNameSelect(fp) {
    fp.calendarContainer.addEventListener('click', function (e) {
        const target = e.target;
        if (!target.classList || !target.classList.contains('cur-month')) return;
        const panels = fp.calendarContainer.querySelectorAll('.flatpickr-month');
        let index = -1;
        panels.forEach((p, i) => { if (p.contains(target)) index = i; });
        if (index < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const first = new Date(fp.currentYear, fp.currentMonth + index, 1);
        const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
        fp.setDate([first, last], false);
        setRange(ymd(first), ymd(last));
        fp.close();
    });
}

function setRange(from, to) {
    xp.range = from <= to ? [from, to] : [to, from];
    render();
}

function dateLabel() {
    const [from, to] = xp.range;
    if (!from) return 'All dates';
    return from === to ? fmtDate(from) : fmtDate(from) + ' – ' + fmtDate(to);
}

// ========================================
// EVENTS
// ========================================

function bindEvents() {
    $('#xp-range-clear').on('click', function () {
        if (xp.fp) xp.fp.clear();
        xp.range = ['', ''];
        render();
    });

    // category panels
    $('#xp-main-list').on('click', '.xp-cat', function (e) {
        if ($(e.target).closest('.xp-cat__actions').length) return;
        xp.main = $(this).attr('data-main') || '';
        xp.sub = '';
        render();
    });
    $('#xp-sub-list').on('click', '.xp-cat', function (e) {
        if ($(e.target).closest('.xp-cat__actions').length) return;
        xp.sub = $(this).attr('data-sub') || '';
        render();
    });
    $('.xp').on('click', '[data-cat-edit]', function () { renameCategory($(this).attr('data-cat-edit')); });
    $('.xp').on('click', '[data-cat-del]', function () { deleteCategory($(this).attr('data-cat-del')); });
    $('#xp-add-main').on('click', function () { addCategory(null); });
    $('#xp-add-sub').on('click', function () {
        const main = categoryTree().find((m) => m.name === xp.main);
        if (main) addCategory(main);
    });

    // breakdown -> Category Breakdown window
    $('#xp-breakdown-body').on('click', '[data-bd]', function () {
        openBreakdown($(this).attr('data-bd'), $(this).attr('data-color'));
    });
    $('#xp-breakdown-modal thead').on('click', 'th[data-sort]', function () {
        const key = $(this).attr('data-sort');
        const s = xp.breakdown.sort;
        xp.breakdown.sort = { key, dir: s.key === key ? -s.dir : key === 'amount' || key === 'date' ? -1 : 1 };
        renderBreakdownRows();
    });

    // table buttons
    $('#expenses_tbl').on('click', 'button[data-act]', function () {
        const [kind, id] = $(this).attr('data-key').split(':');
        const row = (xp.rows || []).find((r) => r.kind === kind && r.id === id);
        if (!row) return;
        const act = $(this).attr('data-act');
        if (act === 'receipt') return viewReceipt(row);
        if (act === 'edit') return kind === 'return' ? openReturn(row) : openExpense(row);
        if (act === 'delete') return deleteRow(row);
    });

    // header buttons
    $('#xp-btn-new').on('click', function () { openExpense(null); });
    $('#xp-btn-return').on('click', function () { openReturn(null); });
    $('#xp-btn-vehicles').on('click', openVehicles);
    $('#exportToExcel').on('click', exportToExcel);

    // expense form
    $('#xp-main').on('change', function () { fillSubSelect($(this).val(), ''); toggleVehicleFields(); });
    $('#xp-photo-remove').on('click', function () {
        $('#xp-remove-photo').val('1');
        $('#xp-photo').val('');
        $('#xp-photo-note').addClass('xp-hidden');
    });
    // Amount / ODO fields show thousands separators while typing (2,550.50).
    $('.xp').on('input', '.xp-money', function () { formatMoneyInput(this); });
    $('#xp-expense-form').on('submit', submitExpense);
    $('#xp-return-form').on('submit', submitReturn);

    // vehicles window
    $('#xp-vehicle-add').on('click', function () { showVehicleForm(null); });
    $('#xp-vehicle-back').on('click', showVehicleList);
    $('#xp-vehicle-form').on('submit', submitVehicle);
    $('#xp-vehicles-list').on('click', '[data-v-edit]', function () {
        showVehicleForm(xp.vehicleList.find((v) => String(v.IDNo) === $(this).attr('data-v-edit')));
    });
    $('#xp-vehicles-list').on('click', '[data-v-del]', function () {
        deleteVehicle(xp.vehicleList.find((v) => String(v.IDNo) === $(this).attr('data-v-del')));
    });
}

// ========================================
// EXPENSE FORM
// ========================================

function optionsHtml(values, selected, placeholder) {
    return (placeholder !== undefined ? '<option value="">' + escapeHtml(placeholder) + '</option>' : '') +
        values.map((v) => '<option value="' + attr(v.value) + '"' + (v.value === selected ? ' selected' : '') + '>' + escapeHtml(v.label) + '</option>').join('');
}

function fillSubSelect(mainName, selected) {
    const main = categoryTree().find((m) => m.name === mainName);
    const names = main ? main.subs.map((s) => s.name) : [];
    if (selected && !names.includes(selected)) names.push(selected); // filed under a removed sub
    $('#xp-sub').html(optionsHtml(names.map((n) => ({ value: n, label: n })), selected, 'None'));
    $('#xp-sub-wrap').toggleClass('xp-hidden', names.length === 0);
}

function toggleVehicleFields() {
    $('#xp-vehicle-wrap').toggleClass('xp-hidden', !isVehicleMain($('#xp-main').val()));
}

function openExpense(row) {
    const tree = categoryTree();
    const mainName = row ? row.main : xp.main === UNCATEGORIZED || xp.main === RETURN_MONEY ? '' : xp.main;
    const mains = tree.map((m) => m.name);
    if (mainName && !mains.includes(mainName)) mains.push(mainName); // filed under a removed main
    $('#xp-expense-title').text(row ? 'Edit Expense' : 'Add Expense');
    $('#xp-expense-id').val(row ? row.id : '');
    $('#xp-main').html(optionsHtml(mains.map((n) => ({ value: n, label: n })), mainName, mains.length ? 'Select…' : 'Add a main category first'));
    fillSubSelect(mainName, row ? row.sub : xp.sub);
    $('#xp-vehicle').html(optionsHtml(xp.vehicles.map((v) => ({ value: v.id, label: v.name })), row ? row.vehicleId : '', xp.vehicles.length ? '-- Select vehicle --' : 'No vehicles yet'));
    $('#xp-odo').val(row && row.odo != null ? withCommas(row.odo) : '');
    toggleVehicleFields();
    $('#xp-details').val(row ? row.details : '');
    $('#xp-incharge').val(row ? row.inCharge : '');
    $('#xp-amount').val(row ? withCommas(row.amount.toFixed(2)) : '');
    $('#xp-photo').val('');
    $('#xp-remove-photo').val('0');
    $('#xp-photo-note').toggleClass('xp-hidden', !(row && row.photo));
    $('#xp-expense-modal').modal('show');
}

function submitExpense(e) {
    e.preventDefault();
    const main = $('#xp-main').val();
    const amount = parseMoney($('#xp-amount').val());
    if (!main) return showError('Choose a main category.');
    if (!$('#xp-details').val().trim() || !(amount > 0)) return showError('Description and an amount are required.');
    const form = new FormData(this);
    form.set('amount', String(amount));
    form.set('odo', $('#xp-odo').val() ? String(parseMoney($('#xp-odo').val())) : '');
    if (!isVehicleMain(main)) {
        form.set('vehicleId', '');
        form.set('odo', '');
    }
    const id = $('#xp-expense-id').val();
    sendForm(id ? '/expenses/edit_expense/' + id : '/expenses/add', form, '#xp-expense-modal');
}

// ========================================
// RETURN MONEY FORM
// ========================================

function openReturn(row) {
    $('#xp-return-title').text(row ? 'Edit Return Money' : 'Add Return Money');
    $('#xp-return-id').val(row ? row.id : '');
    $('#xp-return-amount').val(row ? withCommas(row.amount.toFixed(2)) : '');
    $('#xp-return-details').val(row ? row.details : '');
    $('#xp-return-modal').modal('show');
}

function submitReturn(e) {
    e.preventDefault();
    const amount = parseMoney($('#xp-return-amount').val());
    if (!(amount > 0)) return showError('Enter the amount returned.');
    const id = $('#xp-return-id').val();
    sendJson('POST', id ? '/expenses/return-money/' + id : '/expenses/return-money', { amount, details: $('#xp-return-details').val().trim() }, '#xp-return-modal');
}

// ========================================
// DELETE / RECEIPT
// ========================================

function deleteRow(row) {
    const isReturn = row.kind === 'return';
    Swal.fire({
        title: isReturn ? 'Delete return money?' : 'Delete expense?',
        text: (row.details || mainOf(row)) + ' · ' + peso(row.amount),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Delete'
    }).then((r) => {
        if (r.isConfirmed) sendJson('DELETE', isReturn ? '/expenses/return-money/' + row.id : '/expenses/delete/' + row.id);
    });
}

function viewReceipt(row) {
    if (!row.photo) {
        Swal.fire({
            icon: 'info',
            title: 'No receipt uploaded',
            text: row.kind === 'return' ? 'Return money has no receipt photo.' : 'No receipt photo was uploaded for this expense. Add one with Edit.'
        });
        return;
    }
    const url = RECEIPT_URL + encodeURIComponent(row.photo);
    Swal.fire({
        title: 'Receipt',
        text: row.details,
        imageUrl: url,
        imageAlt: 'Receipt',
        width: 720,
        confirmButtonText: 'Close',
        footer: '<a href="' + url + '" download><i class="fa fa-download"></i> Download</a>'
    });
}

// ========================================
// CATEGORIES (Swal prompts)
// ========================================

function addCategory(main) {
    Swal.fire({
        title: main ? 'Add Sub Category' : 'Add Main Category',
        text: main ? 'Under ' + main.name : '',
        input: 'text',
        inputPlaceholder: 'Category name',
        showCancelButton: true,
        confirmButtonText: 'Save',
        inputValidator: (v) => (!v || !v.trim() ? 'Enter a category name.' : undefined)
    }).then((r) => {
        if (r.isConfirmed) sendJson('POST', '/expenses/categories', { name: r.value.trim(), parentId: main ? main.id : '' });
    });
}

function renameCategory(id) {
    const c = xp.categories.find((x) => x.id === id);
    if (!c) return;
    Swal.fire({
        title: 'Rename Category',
        input: 'text',
        inputValue: c.name,
        showCancelButton: true,
        confirmButtonText: 'Save',
        inputValidator: (v) => (!v || !v.trim() ? 'Enter a category name.' : undefined)
    }).then((r) => {
        if (!r.isConfirmed) return;
        const name = r.value.trim();
        sendJson('POST', '/expenses/categories/' + id, { name }).then((ok) => {
            if (!ok) return;
            if (!c.parentId && xp.main === c.name) xp.main = name;
            if (c.parentId && xp.sub === c.name) xp.sub = name;
            render();
        });
    });
}

function deleteCategory(id) {
    const c = xp.categories.find((x) => x.id === id);
    if (!c) return;
    Swal.fire({
        title: 'Delete ' + (c.parentId ? 'sub' : 'main') + ' category?',
        text: c.name + (c.parentId ? '' : ' and its sub categories') + ' will be removed from the list. Expenses already filed under it keep the name.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Delete'
    }).then((r) => {
        if (!r.isConfirmed) return;
        sendJson('DELETE', '/expenses/categories/' + id).then((ok) => {
            if (!ok) return;
            if (!c.parentId && xp.main === c.name) { xp.main = ''; xp.sub = ''; }
            if (c.parentId && xp.sub === c.name) xp.sub = '';
            render();
        });
    });
}

// ========================================
// CATEGORY BREAKDOWN WINDOW
// ========================================

function openBreakdown(name, color) {
    xp.breakdown.name = name;
    xp.breakdown.color = color;
    xp.breakdown.sort = { key: 'date', dir: -1 };
    $('#xp-bd-name').text(name).css('color', color);
    renderBreakdownRows();
    $('#xp-breakdown-modal').modal('show');
}

function renderBreakdownRows() {
    const { name, color, sort } = xp.breakdown;
    const entries = inDates().filter((r) => mainOf(r) === name);
    const value = (r) =>
        sort.key === 'amount' ? r.amount : sort.key === 'date' ? r.date + ' ' + r.encodedDt : sort.key === 'inCharge' ? (r.inCharge || '').toLowerCase() : (r.details || '').toLowerCase();
    entries.sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    $('#xp-bd-sub').text('Showing ' + entries.length + (entries.length === 1 ? ' entry' : ' entries') + ' for the selected category.');
    $('#xp-bd-body').html(
        entries.map((r) => {
            const extra = [r.sub, vehicleLine(r)].filter(Boolean).join(' · ');
            return '<tr><td>' + escapeHtml(r.details || '—') + (extra ? '<span class="xp-sub-line">' + escapeHtml(extra) + '</span>' : '') + '</td>' +
                '<td>' + escapeHtml(r.inCharge || '—') + '</td>' +
                '<td class="text-end"' + (r.kind === 'return' ? ' style="color:' + RETURN_COLOR + '"' : '') + '><strong>' + peso(r.amount) + '</strong></td>' +
                '<td>' + (r.date ? fmtDate(r.date) : '—') + (r.encodedDt ? ', ' + r.encodedDt.slice(11, 16) : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="4" class="xp-muted">No entries.</td></tr>'
    );
    $('#xp-bd-total').text(peso(entries.reduce((s, r) => s + r.amount, 0))).css('color', color);
    $('#xp-breakdown-modal th[data-sort]').each(function () {
        const k = $(this).attr('data-sort');
        $(this).find('.xp-sort').text(k === sort.key ? (sort.dir === 1 ? '▲' : '▼') : '-');
    });
}

// ========================================
// VEHICLES WINDOW (Vehicle Management's API)
// ========================================

function openVehicles() {
    showVehicleList();
    $('#xp-vehicles-modal').modal('show');
    loadVehicleList();
}

function loadVehicleList() {
    $('#xp-vehicles-list').html('<div class="xp-muted xp-small" style="padding:10px 12px">Loading…</div>');
    $.getJSON('/vehicle/api/vehicles')
        .done(function (res) {
            xp.vehicleList = (res && res.data) || [];
            if (!xp.vehicleList.length) {
                $('#xp-vehicles-list').html('<div class="xp-muted xp-small" style="padding:10px 12px">No vehicles yet. Add the hotel\'s vehicles to pick them on a vehicle expense.</div>');
                return;
            }
            $('#xp-vehicles-list').html(xp.vehicleList.map((v) =>
                '<div class="xp-vehicle"><span class="xp-vehicle__icon"><i class="fa fa-car"></i></span>' +
                '<div class="xp-vehicle__text"><div class="xp-vehicle__plate">' + escapeHtml(v.PLATE_NUMBER) + '</div>' +
                '<div class="xp-vehicle__meta">' + escapeHtml([v.MODEL_NAME, v.VEHICLE_TYPE, v.COLOR, v.FUEL_TYPE].filter(Boolean).join(' · ')) + '</div>' +
                (v.REMARKS ? '<div class="xp-vehicle__meta">' + escapeHtml(v.REMARKS) + '</div>' : '') + '</div>' +
                '<div class="xp-actions"><button type="button" data-v-edit="' + v.IDNo + '" title="Edit"><i class="fa fa-pen"></i></button>' +
                '<button type="button" class="is-danger" data-v-del="' + v.IDNo + '" title="Delete"><i class="fa fa-trash"></i></button></div></div>'
            ).join(''));
        })
        .fail(function () { $('#xp-vehicles-list').html('<div class="xp-muted xp-small" style="padding:10px 12px">Failed to load vehicles.</div>'); });
}

function showVehicleList() {
    $('#xp-vehicles-title').text('Vehicles');
    $('#xp-vehicle-form').addClass('xp-hidden');
    $('#xp-vehicles-list-view').removeClass('xp-hidden');
}

function showVehicleForm(v) {
    $('#xp-vehicles-title').text(v ? 'Edit Vehicle' : 'Add Vehicle');
    $('#xp-vehicle-id').val(v ? v.IDNo : '');
    $('#xp-vehicle-gps').val(v ? v.GPS_DEVICE_ID || '' : '');
    $('#xp-v-plate').val(v ? v.PLATE_NUMBER : '');
    $('#xp-v-model').val(v ? v.MODEL_NAME : '');
    $('#xp-v-type').val(v ? v.VEHICLE_TYPE : '');
    $('#xp-v-fuel').val(v ? v.FUEL_TYPE : '');
    $('#xp-v-color').val(v ? v.COLOR : '');
    $('#xp-v-remarks').val(v ? v.REMARKS || '' : '');
    $('#xp-vehicles-list-view').addClass('xp-hidden');
    $('#xp-vehicle-form').removeClass('xp-hidden');
}

function submitVehicle(e) {
    e.preventDefault();
    const required = ['#xp-v-plate', '#xp-v-model', '#xp-v-type', '#xp-v-fuel', '#xp-v-color'];
    if (required.some((s) => !String($(s).val() || '').trim())) return showError('Plate number, model, type, fuel and color are required.');
    const id = $('#xp-vehicle-id').val();
    $.ajax({
        url: id ? '/vehicle/api/vehicles/update' : '/vehicle/api/vehicles/create',
        type: 'POST',
        data: new FormData(this),
        processData: false,
        contentType: false
    })
        .done(function (res) {
            if (!res || !res.success) return showError((res && res.message) || 'Failed to save the vehicle.');
            toast(res.message || 'Vehicle saved');
            showVehicleList();
            loadVehicleList();
            loadData();
        })
        .fail(function (xhr) { showError(errorText(xhr, 'Failed to save the vehicle.')); });
}

function deleteVehicle(v) {
    if (!v) return;
    Swal.fire({
        title: 'Delete vehicle?',
        text: v.MODEL_NAME + ' · ' + v.PLATE_NUMBER,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Delete'
    }).then((r) => {
        if (!r.isConfirmed) return;
        $.ajax({ url: '/vehicle/api/vehicles/' + v.IDNo, type: 'DELETE' })
            .done(function () {
                toast('Vehicle deleted');
                loadVehicleList();
                loadData();
            })
            .fail(function (xhr) { showError(errorText(xhr, 'Failed to delete the vehicle.')); });
    });
}

// ========================================
// EXPORT (ExcelJS) - what is on screen: date range + category
// ========================================

async function exportToExcel() {
    if (typeof ExcelJS === 'undefined') return showError('Excel library not loaded. Please refresh and try again.');
    const rows = selectedRows();
    if (!rows.length) return showError('There is nothing to export for this date range or category.');
    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Expenses');
        ws.columns = [16, 16, 34, 30, 16, 14, 14, 16, 20].map((w) => ({ width: w }));
        const border = () => {
            const s = { style: 'thin', color: { argb: 'FFBFBFBF' } };
            return { top: s, left: s, bottom: s, right: s };
        };
        const title = ws.addRow(['Expenses · ' + dateLabel() + (xp.main ? ' · ' + xp.main + (xp.sub ? ' › ' + xp.sub : '') : '')]);
        title.font = { bold: true, size: 13 };
        ws.addRow([]);
        const header = ws.addRow(['Main Category', 'Sub Category', 'Description', 'Vehicle / ODO', 'In-Charge', 'Amount', 'Date', 'Encoded By', 'Encoded Date & Time']);
        header.font = { bold: true };
        header.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
            cell.border = border();
        });
        rows.forEach((r) => {
            const row = ws.addRow([mainOf(r), r.sub, r.details, vehicleLine(r), r.inCharge, r.amount, r.date, r.encodedBy, r.encodedDt]);
            row.getCell(6).numFmt = '#,##0.00';
            if (r.kind === 'return') row.getCell(1).font = row.getCell(6).font = { color: { argb: 'FF109D59' } };
            row.eachCell({ includeEmpty: true }, (cell) => { cell.border = border(); });
        });
        const total = sumOf(rows, 'expense');
        const returned = sumOf(rows, 'return');
        [['Total Expenses', total], ['Total Return Money', returned], ['Net Expenses', total - returned]].forEach(([label, amount]) => {
            const row = ws.addRow(['', '', '', '', label, amount, '', '', '']);
            row.font = { bold: true };
            row.getCell(6).numFmt = '#,##0.00';
            row.getCell(5).alignment = { horizontal: 'right' };
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
                cell.border = border();
            });
        });
        const filename = 'Expenses_' + today() + '.xlsx';
        const buf = await wb.xlsx.writeBuffer();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('Excel export error:', error);
        showError('Failed to export expenses to Excel.');
    }
}

// ========================================
// REQUESTS
// ========================================

/** Every change answers with the whole page data; resolves true when it worked. */
function sendJson(method, url, body, modal) {
    return new Promise((resolve) => {
        $.ajax({ url, type: method, data: body ? JSON.stringify(body) : undefined, contentType: 'application/json', dataType: 'json' })
            .done((res) => resolve(afterChange(res, modal)))
            .fail((xhr) => {
                showError(errorText(xhr, 'Something went wrong. Please try again.'));
                resolve(false);
            });
    });
}

function sendForm(url, form, modal) {
    $.ajax({ url, type: 'POST', data: form, processData: false, contentType: false, dataType: 'json' })
        .done((res) => afterChange(res, modal))
        .fail((xhr) => showError(errorText(xhr, 'Something went wrong. Please try again.')));
}

function afterChange(res, modal) {
    if (!res || !res.success) {
        showError((res && res.message) || 'Something went wrong. Please try again.');
        return false;
    }
    if (modal) $(modal).modal('hide');
    applyData(res);
    toast(res.message || 'Saved');
    return true;
}

function errorText(xhr, fallback) {
    return (xhr && xhr.responseJSON && xhr.responseJSON.message) || fallback;
}

// ========================================
// UTILITIES
// ========================================

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function today() { return ymd(new Date()); }

/** 'YYYY-MM-DD' -> '12 Oct 2026' */
function fmtDate(value) {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    if (!y) return '';
    return pad2(d) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + y;
}

/** '2,550.50' -> 2550.5 (NaN when it is not a number). */
function parseMoney(value) {
    const text = String(value == null ? '' : value).replace(/,/g, '').trim();
    return text === '' ? NaN : Number(text);
}

/** '2550.5' -> '2,550.5' (keeps the decimals as typed). */
function withCommas(value) {
    const [whole, dec] = String(value).replace(/,/g, '').split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec !== undefined ? '.' + dec : '');
}

/** Keeps digits and one dot (two decimals at most), adds the commas, and keeps the caret after the same digit. */
function formatMoneyInput(input) {
    const raw = input.value;
    const caret = input.selectionStart == null ? raw.length : input.selectionStart;
    const digitsBefore = raw.slice(0, caret).replace(/[^\d.]/g, '').length;
    let clean = raw.replace(/[^\d.]/g, '');
    const dot = clean.indexOf('.');
    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    const formatted = clean === '' ? '' : withCommas(clean);
    input.value = formatted;
    let pos = 0;
    for (let seen = 0; pos < formatted.length && seen < digitsBefore; pos++) {
        if (formatted[pos] !== ',') seen++;
    }
    input.setSelectionRange(pos, pos);
}

function peso(n) {
    return '₱' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const attr = escapeHtml;

function toast(message) {
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: message, timer: 1800, showConfirmButton: false });
}

function showError(message) {
    Swal.fire({ title: 'Error!', text: message, icon: 'error' });
}
})();
