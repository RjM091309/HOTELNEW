// ========================================
// ACTIVITY LOG / AUDIT TRAIL VIEWER
// End-user friendly: plain-language rows, click a row for before/after detail.
// ========================================

let activityLogTable = null;
let activityLogRows = [];

const AL_ACTION_PHRASES = {
	BOOKING_CREATE: 'New booking', BOOKING_UPDATE: 'Booking edited', BOOKING_CANCEL: 'Booking cancelled',
	BOOKING_STATUS_UPDATE: 'Status changed', CHECKOUT: 'Check-out', CHECK_IN: 'Check-in',
	CHECK_IN_WITH_DEPOSIT: 'Check-in (deposit)', CHECK_IN_RESERVATION: 'Check-in',
	MOVE_TO_OCCUPIED: 'Moved to occupied', ROOM_TRANSFER: 'Room transfer', BOOKING_EXTEND: 'Stay extended',
	LATE_CHECKOUT: 'Late check-out', DISCOUNT_APPLY: 'Discount', PAYMENT_ADD: 'Payment',
	GROUP_PAYMENT_ADD: 'Group payment', PAYMENT_STATUS_UPDATE: 'Payment status', EXTEND_PAYMENT_STATUS_UPDATE: 'Ext. payment status',
	SERVICE_ADD: 'Service added', SERVICE_REMOVE: 'Service removed', SERVICE_STATUS_UPDATE: 'Service status',
	SECURITY_DEPOSIT_REFUND: 'Deposit refund', SECURITY_DEPOSIT_REVERT: 'Deposit revert',
	ROOM_STATUS_UPDATE: 'Room status', MAINTENANCE_SET: 'Maintenance', MAINTENANCE_REOPEN: 'Maintenance reopen',
	MAINTENANCE_COMPLETE: 'Maintenance done', RESERVATION_REOPEN: 'Reopened',
	REMARK_ADD: 'Remark added', REMARK_UPDATE: 'Remark edited', REMARK_DELETE: 'Remark deleted',
	DELETE: 'Deleted', UPDATE: 'Edited',
	COMPLAINT_REQUEST_ADD: 'Request added', COMPLAINT_REQUEST_UPDATE: 'Request edited',
	COMPLAINT_REQUEST_STATUS: 'Request status', COMPLAINT_REQUEST_DELETE: 'Request deleted',
	VOUCHER_GENERATE: 'Voucher', CARD_REGISTER: 'Key card', RECEIPT_CREATE: 'Receipt created',
	RECEIPT_UPDATE: 'Receipt edited', RECEIPT_DELETE: 'Receipt deleted'
};

// Source = the landing page / menu where the function lives.
const AL_CATEGORY = {
	dashboard: 'Dashboard',
	calendar: 'Calendar',
	booking: 'Booking',
	payments: 'Payment Management',
	integration: 'Settings',
	room: 'Rooms',
	general: 'System'
};

// One badge colour per Source (class suffix -> defined in the page <style>).
const AL_SOURCE_CLASS = {
	dashboard: 'dashboard',
	calendar: 'calendar',
	booking: 'booking',
	payments: 'payments',
	integration: 'settings',
	room: 'rooms',
	general: 'system'
};

const AL_FIELD_LABELS = {
	guestName: 'Guest', roomNumber: 'Room', checkIn: 'Check-in', checkOut: 'Check-out',
	nights: 'Nights', bookingStatus: 'Booking Status', checkInStatus: 'Check-in Status',
	guests: 'Guests', bedCount: 'Beds', remarks: 'Remarks', roomRate: 'Room Rate',
	discount: 'Discount', reservationFee: 'Reservation Fee', paymentStatus: 'Payment Status',
	totalCost: 'Total Cost', paidAmount: 'Paid Amount', balance: 'Balance',
	securityDeposit: 'Security Deposit', extended: 'Extended', extendedDays: 'Extended Days',
	lateCheckout: 'Late Check-out', holdPending: 'Hold Pending', servicesTotal: 'Extra Services'
};

const AL_MONEY_HINT = /(rate|cost|amount|deposit|fee|discount|balance|total|charge|paid|price)/i;
const AL_DATE_HINT = /(date|check ?-?in|check ?-?out)/i;

let alRangeFrom = null;   // epoch ms, start of day
let alRangeTo = null;     // epoch ms, end of day
let alFlatpickr = null;

function alInit() {
	if (typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') { setTimeout(alInit, 100); return; }
	alInitRangeFilter();
	alInitTable();
	alInitDateRange();
	alLoadData();
	alBindEvents();
}

// DataTables custom filter: keep only rows whose Date & Time falls in the range.
function alInitRangeFilter() {
	if (!$.fn.dataTable || alInitRangeFilter._done) return;
	alInitRangeFilter._done = true;
	$.fn.dataTable.ext.search.push(function (settings, rowData) {
		if (settings.nTable.id !== 'activity_log_tbl') return true;
		if (alRangeFrom == null || alRangeTo == null) return true;
		const m = /data-order="(\d+)"/.exec(rowData[5] || '');
		const ts = m ? parseInt(m[1], 10) : 0;
		return ts >= alRangeFrom && ts <= alRangeTo;
	});
}

function alInitDateRange() {
	const el = document.getElementById('al-date-range');
	if (!el || typeof flatpickr === 'undefined') return;

	alFlatpickr = flatpickr(el, {
		mode: 'range',
		showMonths: 2,
		altInput: true,
		altFormat: 'M j, Y',
		dateFormat: 'Y-m-d',
		locale: { firstDayOfWeek: 1 },
		onChange: function (dates) {
			if (dates.length === 2) {
				alRangeFrom = new Date(dates[0]).setHours(0, 0, 0, 0);
				alRangeTo = new Date(dates[1]).setHours(23, 59, 59, 999);
			} else {
				alRangeFrom = alRangeTo = null;
			}
			if (activityLogTable) activityLogTable.draw();
		}
	});

	document.getElementById('al-date-clear').addEventListener('click', function () {
		if (alFlatpickr) alFlatpickr.clear();
		alRangeFrom = alRangeTo = null;
		if (activityLogTable) activityLogTable.draw();
	});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alInit);
else alInit();

function alInitTable() {
	activityLogTable = $('#activity_log_tbl').DataTable({
		data: [],
		responsive: true,
		pageLength: 10,
		lengthMenu: [10, 25, 50, 100],
		order: [[5, 'desc']],
		autoWidth: false,
		columnDefs: [
			{ targets: 0, width: '40%' },                 // Description takes the slack
			{ targets: [1, 2, 3, 4, 5], width: '12%' },   // the rest share the remainder evenly
			{
				// Amount - sort by the numeric value tucked in data-order.
				targets: [2],
				className: 'text-end',
				render: function (data, type) {
					if (type === 'sort' || type === 'type') {
						const m = /data-order="(-?[\d.]+)"/.exec(data || '');
						return m ? parseFloat(m[1]) : -1;
					}
					return data;
				}
			},
			{
				// Date & Time - sort chronologically via the epoch in data-order.
				targets: [5],
				render: function (data, type) {
					if (type === 'sort' || type === 'type') {
						const m = /data-order="(\d+)"/.exec(data || '');
						return m ? parseInt(m[1], 10) : 0;
					}
					return data;
				}
			}
		],
		language: {
			search: '',
			searchPlaceholder: 'Quick filter…',
			lengthMenu: 'Show _MENU_',
			info: 'Showing _START_ to _END_ of _TOTAL_ activities',
			infoEmpty: 'No activities',
			infoFiltered: '(filtered from _MAX_)',
			zeroRecords: 'No matching activities found'
		}
	});
}

function alLoadData() {
	$.ajax({
		url: '/activity-log/data?limit=1000', type: 'GET', dataType: 'json',
		success: function (res) {
			if (res.success) { activityLogRows = res.rows || []; alPopulate(activityLogRows); }
		},
		error: function () { if (window.Swal) Swal.fire('Error', 'Could not load the activity log.', 'error'); }
	});
}

function alGuestRoom(r) {
	const p = [];
	const nd = alParse(r.NEW_DATA) || {};
	const guest = r.BOOKING_GUEST_NAME || nd.guest;
	const room = r.BOOKING_ROOM_NUMBER || nd.room;
	if (guest) p.push(guest);
	if (room) p.push('Room ' + room);
	return p.join(' · ');
}

function alRowChanges(r) {
	const nd = alParse(r.NEW_DATA);
	if (nd && Array.isArray(nd.changes) && nd.changes.length) {
		return nd.changes.map(c => ({ label: c.label || AL_FIELD_LABELS[c.field] || c.field, from: c.from, to: c.to }));
	}
	return [];
}

function alRowAmount(r) {
	if (r.AMOUNT != null && r.AMOUNT !== '' && !isNaN(parseFloat(r.AMOUNT))) return Math.abs(parseFloat(r.AMOUNT));
	const nd = alParse(r.NEW_DATA);
	if (nd && nd.amount != null && !isNaN(parseFloat(nd.amount))) return Math.abs(parseFloat(nd.amount));
	const changes = alRowChanges(r);
	for (const f of ['Paid Amount', 'Discount', 'Extra Services', 'Security Deposit', 'Total Cost']) {
		const c = changes.find(x => x.label === f);
		if (c) { const d = Math.abs(Number(c.to || 0) - Number(c.from || 0)); if (d) return d; }
	}
	return null;
}

function alPopulate(rows) {
	if (!activityLogTable) return;
	activityLogTable.clear();
	rows.forEach(r => {
		const failed = String(r.STATUS).toUpperCase() === 'FAILED';
		const amt = alRowAmount(r);
		const ts = alEpoch(r.ENCODED_DT);
		const rowData = [
			alDescription(r, failed),
			'<span class="al-cat al-cat--' + (AL_SOURCE_CLASS[r.MODULE] || 'system') + '">'
				+ alEsc(AL_CATEGORY[r.MODULE] || alTitle(r.MODULE)) + '</span>',
			amt != null
				? '<span class="al-amt" data-order="' + amt + '">' + alPeso(amt) + '</span>'
				: '<span class="al-muted" data-order="-1">—</span>',
			'<span class="al-act">' + alEsc(alHumanAction(r.ACTION)) + '</span>',
			alEsc(r.PROCESSED_BY || 'System'),
			'<span data-order="' + ts + '">' + alEsc(alDateNice(r.ENCODED_DT)) + '</span>'
		];
		const row = activityLogTable.row.add(rowData);
		const node = row.node();
		node.setAttribute('data-id', r.IDNo);
		if (failed) node.classList.add('al-row-failed');
	});
	activityLogTable.draw();
}

// A stored description that looks like developer output (endpoint, HTTP, ACTION token).
function alIsTechnical(s) {
	return /\((?:POST|PUT|DELETE|PATCH|GET)\s|\bHTTP\b|\[HTTP|^[A-Z][A-Z0-9_]{3,}\s+(?:booking|via|#)/i.test(s || '');
}

// Plain-language activity sentence (plain string, no markup).
function alSentence(r) {
	let base = (r.DESCRIPTION || '')
		.replace(/^FAILED:\s*/i, '')
		.replace(/\s*\(₱\s*[\d,]+(?:\.\d{1,2})?\)/g, '')   // amount has its own column
		.replace(/\bRm\.?\s+(?=\d)/g, 'Room ')              // "Rm 311" -> "Room 311" (legacy rows)
		.trim();

	if (!base || alIsTechnical(base)) {
		// Rebuild a clean sentence from structured fields (covers legacy rows).
		base = alHumanAction(r.ACTION);
		if (r.BOOKING_ID) base += ' — Booking #' + r.BOOKING_ID;
		const gr = alGuestRoom(r);
		if (gr) base += ' · ' + gr;
	} else {
		const gr = alGuestRoom(r);
		if (gr && base.indexOf(gr) === -1 && r.BOOKING_GUEST_NAME && base.indexOf(r.BOOKING_GUEST_NAME) === -1) {
			base += ' · ' + gr;
		}
	}
	return base;
}

// HTML cell for the first column - single line, ellipsis, full text on hover.
function alDescription(r, failed) {
	const text = alSentence(r);
	const prefix = failed ? '<span class="al-badge al-badge-failed" style="margin-right:6px;">FAILED</span>' : '';
	return '<span class="al-desc-1line" title="' + alEsc(text) + '">' + prefix + alEsc(text) + '</span>';
}

function alBindEvents() {
	document.getElementById('al-refresh').addEventListener('click', alLoadData);
	document.getElementById('al-export').addEventListener('click', alExport);

	$('#activity_log_tbl tbody').on('click', 'tr', function () {
		const id = this.getAttribute('data-id');
		if (id) alShowDetails(id);
	});
}

function alShowDetails(id) {
	const r = activityLogRows.find(x => String(x.IDNo) === String(id));
	if (!r) return;

	document.getElementById('al-d-desc').textContent = alSentence(r);
	document.getElementById('al-d-dt').textContent = alDateNice(r.ENCODED_DT);
	document.getElementById('al-d-user').textContent = r.PROCESSED_BY || 'System';
	document.getElementById('al-d-module').innerHTML =
		'<span class="al-cat al-cat--' + (AL_SOURCE_CLASS[r.MODULE] || 'system') + '">'
		+ alEsc(AL_CATEGORY[r.MODULE] || alTitle(r.MODULE)) + '</span>';
	document.getElementById('al-d-action').textContent = alHumanAction(r.ACTION);
	document.getElementById('al-d-booking').textContent = r.BOOKING_ID ? ('#' + r.BOOKING_ID) : '—';
	document.getElementById('al-d-guestroom').textContent = alGuestRoom(r) || '—';
	const amt = alRowAmount(r);
	document.getElementById('al-d-amount').textContent = amt != null ? alPeso(amt) : '—';
	document.getElementById('al-d-status').innerHTML = alStatusBadge(r.STATUS);

	const errWrap = document.getElementById('al-d-error-wrap');
	if (r.ERROR_MESSAGE) { document.getElementById('al-d-error').textContent = r.ERROR_MESSAGE; errWrap.hidden = false; }
	else errWrap.hidden = true;

	const changes = alRowChanges(r);
	const tbl = document.getElementById('al-d-changes-tbl');
	const empty = document.getElementById('al-d-changes-empty');
	const tbody = tbl.querySelector('tbody');
	tbody.innerHTML = '';

	// Bulk "move to occupied" - list the affected bookings.
	const nd = alParse(r.NEW_DATA) || {};
	const moved = Array.isArray(nd.movedBookings) ? nd.movedBookings : [];
	const movedWrap = document.getElementById('al-d-moved-wrap');
	const movedBody = document.getElementById('al-d-moved-tbl').querySelector('tbody');
	movedBody.innerHTML = '';
	if (moved.length) {
		moved.forEach(m => {
			const tr = document.createElement('tr');
			tr.innerHTML =
				'<td>#' + alEsc(m.bookingId || '') + '</td>' +
				'<td>' + alEsc(m.guest || '(no name)') + '</td>' +
				'<td>' + alEsc(m.room ? 'Room ' + m.room : '—') + '</td>';
			movedBody.appendChild(tr);
		});
		movedWrap.hidden = false;
	} else {
		movedWrap.hidden = true;
	}

	if (changes.length) {
		changes.forEach(c => {
			const tr = document.createElement('tr');
			tr.innerHTML =
				'<td>' + alEsc(c.label) + '</td>' +
				'<td class="al-chg-from">' + alEsc(alFmtVal(c.label, c.from)) + '</td>' +
				'<td class="al-chg-to">' + alEsc(alFmtVal(c.label, c.to)) + '</td>';
			tbody.appendChild(tr);
		});
		tbl.style.display = ''; empty.style.display = 'none';
	} else {
		tbl.style.display = 'none';
		empty.style.display = moved.length ? 'none' : '';
	}

	if (window.bootstrap && bootstrap.Modal) bootstrap.Modal.getOrCreateInstance(document.getElementById('al-details-modal')).show();
	else $('#al-details-modal').modal('show');
}

function alExport() {
	if (typeof XLSX === 'undefined') { if (window.Swal) Swal.fire('Unavailable', 'Excel export is not available right now.', 'warning'); return; }
	const data = activityLogRows.map(r => {
		const changes = alRowChanges(r);
		const amt = alRowAmount(r);
		return {
			'Description': alSentence(r),
			'Source': AL_CATEGORY[r.MODULE] || alTitle(r.MODULE),
			'Amount': amt != null ? amt : '',
			'Action': alHumanAction(r.ACTION),
			'Booking No.': r.BOOKING_ID || '',
			'Guest': r.BOOKING_GUEST_NAME || '',
			'Room': r.BOOKING_ROOM_NUMBER || '',
			'Result': String(r.STATUS).toUpperCase() === 'FAILED' ? 'Failed' : 'Successful',
			'Processed By': r.PROCESSED_BY || 'System',
			'Date & Time': alDateNice(r.ENCODED_DT),
			'Changes': changes.map(c => c.label + ': ' + alFmtVal(c.label, c.from) + ' -> ' + alFmtVal(c.label, c.to)).join(' | ')
		};
	});
	const ws = XLSX.utils.json_to_sheet(data);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');
	XLSX.writeFile(wb, 'activity_log_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

// ---------- helpers ----------
function alHumanAction(a) {
	if (!a) return 'Action';
	return AL_ACTION_PHRASES[a] || alTitle(a);
}
function alTitle(s) {
	s = String(s || '').replace(/_/g, ' ').toLowerCase().trim();
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
function alStatusBadge(status) {
	return String(status).toUpperCase() === 'FAILED'
		? '<span class="al-badge al-badge-failed">Failed</span>'
		: '<span class="al-badge al-badge-success">Successful</span>';
}
function alParse(v) {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v === 'object') return v;
	try { return JSON.parse(v); } catch (e) { return null; }
}
function alPeso(v) {
	const n = Number(v);
	if (!isFinite(n)) return String(v);
	return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function alEpoch(d) {
	const t = new Date(d).getTime();
	return isNaN(t) ? 0 : t;
}
function alFmtVal(label, v) {
	if (v === null || v === undefined || v === '') return '(none)';
	const key = String(label || '');
	if (AL_MONEY_HINT.test(key) && !isNaN(parseFloat(v)) && isFinite(v)) return alPeso(v);
	if (AL_DATE_HINT.test(key)) {
		const d = new Date(v);
		if (!isNaN(d.getTime())) return window.moment ? moment(v).format('MMM D, YYYY') : d.toISOString().slice(0, 10);
	}
	if (v === true || v === 1 || v === '1') return 'Yes';
	if (v === false || v === 0 || v === '0') return 'No';
	return String(v);
}
function alDateNice(d) {
	if (!d) return '';
	if (window.moment) return moment(d).format('MMM D, YYYY, h:mm A');
	const dt = new Date(d);
	return isNaN(dt.getTime()) ? d : dt.toLocaleString();
}
function alEsc(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
