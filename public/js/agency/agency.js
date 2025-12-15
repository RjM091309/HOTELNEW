// ========================================
// AGENCY MANAGEMENT SYSTEM
// ========================================

let currentAgencyId = null;
let agenciesDataTable = null;
let agencyBookingsTable = null;
const agencyBookingTotalsCache = {};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    initializeDataTable();
    loadAgenciesData();
    initializeEventListeners();
});

// ========================================
// DATA LOADING
// ========================================

function loadAgenciesData() {
    $.ajax({
        url: '/agency/data',
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            if (data.success) {
                populateTableWithData(data.agencies);
            } else {
                showError(data.message || 'Failed to load agencies data.');
            }
        },
        error: function() {
            showError('Failed to load agencies data.');
        }
    });
}

function populateTableWithData(agencies) {
    if (!agenciesDataTable) return;
    
    agenciesDataTable.clear();
    
    agencies.forEach(agency => {
        const bookingsBtn = `
            <button class="btn btn-link p-0 view-bookings" data-id="${agency.IDNo}" data-name="${agency.NAME}">
                ${Number(agency.totalBookings || 0)}
            </button>
        `;
        const balanceSpan = `<span class="agency-balance" data-id="${agency.IDNo}">-</span>`;
        const rowData = [
            agency.NAME,
            agency.CONTACT_NUMBER || '-',
            bookingsBtn,
            balanceSpan,
            createActionButtons(agency.IDNo)
        ];
        
        const newRow = agenciesDataTable.row.add(rowData);
        newRow.node().setAttribute('data-id', agency.IDNo);
        // Compute balance asynchronously per agency
        computeAgencyBalance(agency.IDNo, newRow.node());
    });
    
    agenciesDataTable.draw();
}

// ========================================
// EVENT LISTENERS
// ========================================

function initializeEventListeners() {
    // Delete event delegation
    document.addEventListener('click', function(event) {
        if (event.target.closest('.delete-link')) {
            event.preventDefault();
            const agencyId = event.target.closest('.delete-link').getAttribute('data-id');
            confirmDeleteAgency(agencyId);
        }

        // View bookings
        if (event.target.closest('.view-bookings')) {
            event.preventDefault();
            const btn = event.target.closest('.view-bookings');
            const agencyId = btn.getAttribute('data-id');
            const agencyName = btn.getAttribute('data-name') || 'Agency';
            fetchAgencyBookings(agencyId, agencyName);
        }
    });
    
    // Form submissions
    const newAgencyForm = document.getElementById('new-agency-form');
    if (newAgencyForm) {
        newAgencyForm.addEventListener('submit', handleNewAgencySubmit);
    }
    
    const editAgencyForm = document.getElementById('edit-agency-form');
    if (editAgencyForm) {
        editAgencyForm.addEventListener('submit', handleEditAgencySubmit);
    }
    
    // Modal resets
    $('#new-agency-modal').on('hidden.bs.modal', () => {
        document.getElementById('new-agency-form')?.reset();
        // Reset MDL textfields
        const textfields = document.querySelectorAll('#new-agency-modal .mdl-textfield');
        textfields.forEach(tf => {
            tf.classList.remove('is-dirty', 'is-focused');
        });
    });
    
    $('#edit-agency-modal').on('hidden.bs.modal', () => {
        document.getElementById('edit-agency-form')?.reset();
        currentAgencyId = null;
        // Reset MDL textfields
        const textfields = document.querySelectorAll('#edit-agency-modal .mdl-textfield');
        textfields.forEach(tf => {
            tf.classList.remove('is-dirty', 'is-focused');
        });
    });
    
    // Initialize MDL components when modals are shown
    $('#new-agency-modal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
        }, 300);
    });

    $('#edit-agency-modal').on('shown.bs.modal', function() {
        setTimeout(() => {
            if (window.componentHandler) {
                window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            if (window.originalComponentHandler) {
                window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
            }
            
            // Force floating labels for all textfields with values
            const textfields = document.querySelectorAll('#edit-agency-modal .mdl-textfield');
            textfields.forEach(function(textfield) {
                const input = textfield.querySelector('.mdl-textfield__input');
                if (input && input.value) {
                    textfield.classList.add('is-dirty');
                    textfield.classList.remove('is-focused');
                }
            });
        }, 300);
    });
}

// ========================================
// CRUD OPERATIONS
// ========================================

function confirmDeleteAgency(agencyId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "This action cannot be undone!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            deleteAgency(agencyId);
        }
    });
}

function deleteAgency(agencyId) {
    $.ajax({
        url: `/agency/delete/${agencyId}`,
        type: 'DELETE',
        dataType: 'json',
        success: function(data) {
            if (data.success) {
                const row = agenciesDataTable.row(`[data-id="${agencyId}"]`);
                if (row.length) {
                    row.remove().draw();
                }
                showSuccess('Agency deleted successfully!');
            } else {
                showError(data.message || 'Error deleting agency.');
            }
        },
        error: function(xhr) {
            const errorMsg = xhr.responseJSON?.message || 'Something went wrong while deleting the agency.';
            showError(errorMsg);
        }
    });
}

function editAgency(agencyId) {
    $.ajax({
        url: `/agency/edit_agency?id=${agencyId}`,
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            if (data.success && data.agency) {
                populateEditForm(data.agency);
                $('#edit-agency-modal').modal('show');
            } else {
                showError('Agency not found.');
            }
        },
        error: function() {
            showError('Failed to fetch agency details.');
        }
    });
}

function populateEditForm(agency) {
    document.getElementById('edit-agency-id').value = agency.IDNo;
    document.getElementById('edit-agency-name').value = agency.NAME || '';
    document.getElementById('edit-agency-contact-number').value = agency.CONTACT_NUMBER || '';
    
    // Trigger MDL update for floating labels
    const nameField = document.getElementById('edit-agency-name').closest('.mdl-textfield');
    const contactField = document.getElementById('edit-agency-contact-number').closest('.mdl-textfield');
    
    if (nameField && agency.NAME) {
        nameField.classList.add('is-dirty');
    }
    if (contactField && agency.CONTACT_NUMBER) {
        contactField.classList.add('is-dirty');
    }
    
    currentAgencyId = agency.IDNo;
}

function handleNewAgencySubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const agencyData = {
        name: formData.get('name'),
        contactNumber: formData.get('contactNumber')
    };
    
    if (validateAgencyData(agencyData)) {
        submitAgency('/agency/add', agencyData, 'Adding Agency...', 'Agency added successfully!');
    }
}

function handleEditAgencySubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const agencyData = {
        name: formData.get('name'),
        contactNumber: formData.get('contactNumber')
    };
    
    if (!currentAgencyId) {
        showError('No agency selected for editing.');
        return;
    }
    
    if (validateAgencyData(agencyData)) {
        submitAgency(`/agency/edit_agency/${currentAgencyId}`, agencyData, 'Updating Agency...', 'Agency updated successfully!');
    }
}

function validateAgencyData(data) {
    if (!data.name || data.name.trim() === '') {
        showError('Please enter an agency name.');
        return false;
    }
    
    return true;
}

function submitAgency(url, agencyData, loadingText, successMessage) {
    Swal.fire({
        title: loadingText,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
    
    $.ajax({
        url: url,
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify(agencyData),
        success: function(data) {
            Swal.close();
            if (data.success) {
                if (data.agency) {
                    if (url.includes('add')) {
                        addAgencyToTable(data.agency);
                    } else {
                        updateAgencyInTable(data.agency);
                    }
                }
                
                $(url.includes('add') ? '#new-agency-modal' : '#edit-agency-modal').modal('hide');
                showSuccess(successMessage);
            } else {
                showError(data.message || 'Operation failed.');
            }
        },
        error: function(xhr) {
            Swal.close();
            const errorMsg = xhr.responseJSON?.message || 'Something went wrong.';
            showError(errorMsg);
        }
    });
}

// ========================================
// DATATABLE OPERATIONS
// ========================================

function addAgencyToTable(agency) {
    if (!agenciesDataTable) return;
    
    const bookingsBtn = `
        <button class="btn btn-link p-0 view-bookings" data-id="${agency.IDNo}" data-name="${agency.NAME}">
            ${Number(agency.totalBookings || 0)}
        </button>
    `;
    const rowData = [
        agency.NAME,
        agency.CONTACT_NUMBER || '-',
        bookingsBtn,
        createActionButtons(agency.IDNo)
    ];
    
    const newRow = agenciesDataTable.row.add(rowData).draw();
    newRow.node().setAttribute('data-id', agency.IDNo);
}

function updateAgencyInTable(agency) {
    if (!agenciesDataTable) return;
    
    const rows = agenciesDataTable.rows().nodes();
    let rowIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-id') === agency.IDNo.toString()) {
            rowIndex = i;
            break;
        }
    }
    
    if (rowIndex !== -1) {
        const bookingsBtn = `
            <button class="btn btn-link p-0 view-bookings" data-id="${agency.IDNo}" data-name="${agency.NAME}">
                ${Number(agency.totalBookings || 0)}
            </button>
        `;
        const rowData = [
            agency.NAME,
            agency.CONTACT_NUMBER || '-',
            bookingsBtn,
            createActionButtons(agency.IDNo)
        ];
        
        agenciesDataTable.row(rowIndex).data(rowData).draw();
    }
}

function createActionButtons(agencyId) {
    return `
        <div class="text-center">
            <button class="btn btn-tbl-edit btn-xs" onclick="editAgency('${agencyId}')">
                <i class="fa fa-pencil"></i>
            </button>
            <a href="#" class="btn btn-tbl-delete btn-xs delete-link" data-id="${agencyId}">
                <i class="fa fa-trash-o"></i>
            </a>
        </div>
    `;
}

// ========================================
// DATATABLE INITIALIZATION
// ========================================

function initializeDataTable() {
    const table = document.getElementById('agencies_tbl');
    if (!table || typeof $.fn.DataTable === 'undefined') return;
    
    try {
        agenciesDataTable = $('#agencies_tbl').DataTable({
            data: [],
            responsive: true,
            pageLength: 25,
            order: [[0, 'asc']],
            columnDefs: [{ targets: [4], orderable: false }],
            language: {
                search: "Search agencies:",
                lengthMenu: "Show _MENU_ agencies per page",
                info: "Showing _START_ to _END_ of _TOTAL_ agencies",
                emptyTable: "No agencies found. Click 'Add Agency' to get started."
            }
        });
    } catch (error) {
        console.error('DataTable initialization error:', error);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).replace(',', '');
}

function formatDateOnly(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });
}

function showSuccess(message) {
    Swal.fire({
        title: 'Success!',
        text: message,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
}

function showError(message) {
    Swal.fire({
        title: 'Error!',
        text: message,
        icon: 'error'
    });
}

// ========================================
// GLOBAL EXPORTS
// ========================================

window.editAgency = editAgency;
window.deleteAgency = deleteAgency;

// ========================================
// AGENCY BOOKINGS MODAL
// ========================================

function fetchAgencyBookings(agencyId, agencyName) {
    if (!agencyId) return;

    // reset cached totals per open
    Object.keys(agencyBookingTotalsCache).forEach(k => delete agencyBookingTotalsCache[k]);

    $('#agency-bookings-modal').modal('show');
    document.getElementById('agency-bookings-agency-name').textContent = agencyName;

    const tbody = document.querySelector('#agency-bookings-table tbody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Loading...</td></tr>';
    }

    // destroy any existing DataTable to avoid stale state
    const tableEl = $('#agency-bookings-table');
    if ($.fn.DataTable.isDataTable(tableEl)) {
        tableEl.DataTable().clear().destroy();
    }

    $.ajax({
        url: `/agency/bookings/${agencyId}`,
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            if (data.success) {
                renderAgencyBookings(data.bookings || []);
            } else {
                renderAgencyBookings([]);
                showError(data.message || 'Failed to load bookings.');
            }
        },
        error: function() {
            renderAgencyBookings([]);
            showError('Failed to load bookings.');
        }
    });
}

function renderAgencyBookings(bookings) {
    const tableEl = $('#agency-bookings-table');
    const tbody = document.querySelector('#agency-bookings-table tbody');
    if (!tbody) return;

    // Destroy previous DataTable to avoid duplicates
    if ($.fn.DataTable.isDataTable(tableEl)) {
        tableEl.DataTable().clear().destroy();
    }
    // Remove any existing draw handler to avoid double-binding
    tableEl.off('draw.dt');

    const hasData = bookings && bookings.length > 0;
    if (!hasData) {
        tbody.innerHTML = '';
    } else {
        const rows = bookings.map((b, idx) => {
            const checkIn = formatDateOnly(b.CHECK_IN_DATE);
            const checkOut = formatDateOnly(b.CHECK_OUT_DATE);
            const bookingStatus = bookingStatusBadge(b.BOOKING_STATUS);
            const paymentStatus = paymentStatusBadge(b.PAYMENT_STATUS);
            const guest = b.CUSTOMER_NAME || '-';
            const room = b.ROOM_NUMBER || '-';
            const conf = b.CONFIRMATION_NUMBER || '-';
            return `
                <tr data-booking-id="${b.bookingId}">
                    <td>${idx + 1}</td>
                    <td>${guest}</td>
                    <td>${room}</td>
                    <td>${conf}</td>
                    <td>${checkIn}</td>
                    <td>${checkOut}</td>
                    <td class="text-end booking-total">-</td>
                    <td class="text-end booking-balance">-</td>
                    <td>${paymentStatus}</td>
                    <td>${bookingStatus}</td>
                </tr>
            `;
        }).join('');
        tbody.innerHTML = rows;
    }

    // Initialize DataTable with pagination/search/info
    agencyBookingsTable = tableEl.DataTable({
        paging: true,
        pageLength: 10,
        lengthChange: true,
        searching: true,
        ordering: true,
        info: true,
        order: [[4, 'desc']], // by Check-in desc
        columnDefs: [
            { targets: [0,1,2,3,4,5,8,9], className: 'text-center' },
            { targets: [6,7], className: 'text-end' },
            // Disable ordering for the # column (index 0)
            { targets: [0], orderable: false }
        ]
    });

    // Re-apply cached totals/balances on every draw (for paginated rows)
    tableEl.on('draw.dt', applyCachedTotalsToTable);

    // After rendering, fetch billing/payments to fill totals & balances
    enrichAgencyBookingsWithBilling(hasData ? bookings : []);
}

// Helpers for status badges
function bookingStatusBadge(status) {
    const val = (status || '').toLowerCase();
    let cls = 'label-secondary';
    let text = status || '-';
    if (val === 'pending') { cls = 'label-info'; text = 'Pending'; }
    else if (val === 'check-in' || val === 'check-in') { cls = 'label-success'; text = 'Check In'; }
    else if (val === 'check-out' || val === 'checkout') { cls = 'label-warning'; text = 'Check Out'; }
    else if (val === 'cancelled' || val === 'canceled') { cls = 'label-danger'; text = 'Cancelled'; }
    return `<span class="label label-sm ${cls}">${text}</span>`;
}

function paymentStatusBadge(status) {
    const val = (status || '').toLowerCase();
    let cls = 'label-secondary';
    let text = status || '-';
    if (val === 'paid') { cls = 'label-success'; text = 'PAID'; }
    else if (val === 'partial') { cls = 'label-warning'; text = 'PARTIAL'; }
    else if (val === 'unpaid') { cls = 'label-danger'; text = 'UNPAID'; }
    else if (val === 'cancelled' || val === 'canceled') { cls = 'label-danger'; text = 'CANCELLED'; }
    return `<span class="label label-sm ${cls}">${text}</span>`;
}

// Enrich bookings with billing/payments to compute totals and balance (like booking_data.js)
function enrichAgencyBookingsWithBilling(bookings) {
    if (!bookings || bookings.length === 0) return;
    const tasks = bookings.map(b => fetchBillingAndPayments(b.bookingId)
        .then(result => ({ bookingId: b.bookingId, ...result }))
        .catch(() => ({ bookingId: b.bookingId, total: null, balance: null })));

    Promise.all(tasks).then(results => {
        results.forEach(({ bookingId, total, balance }) => {
            agencyBookingTotalsCache[bookingId] = { total, balance };
            const row = document.querySelector(`#agency-bookings-table tbody tr[data-booking-id="${bookingId}"]`);
            if (!row) return;
            const totalCell = row.querySelector('.booking-total');
            const balanceCell = row.querySelector('.booking-balance');
            if (totalCell) totalCell.textContent = total != null ? formatNumberPlain(total) : '-';
            if (balanceCell) {
                if (balance != null) {
                    balanceCell.textContent = formatNumberPlain(balance);
                    balanceCell.classList.toggle('text-danger', balance > 0.0001);
                } else {
                    balanceCell.textContent = '-';
                }
            }
        });
    });
}

function applyCachedTotalsToTable() {
    const rows = document.querySelectorAll('#agency-bookings-table tbody tr[data-booking-id]');
    rows.forEach(row => {
        const bookingId = row.getAttribute('data-booking-id');
        const cached = agencyBookingTotalsCache[bookingId];
        if (!cached) return;
        const totalCell = row.querySelector('.booking-total');
        const balanceCell = row.querySelector('.booking-balance');
        if (totalCell) totalCell.textContent = cached.total != null ? formatNumberPlain(cached.total) : '-';
        if (balanceCell) {
            if (cached.balance != null) {
                balanceCell.textContent = formatNumberPlain(cached.balance);
                balanceCell.classList.toggle('text-danger', cached.balance > 0.0001);
            } else {
                balanceCell.textContent = '-';
            }
        }
    });
}

// Compute total balance per agency for the main list
function computeAgencyBalance(agencyId, rowNode) {
    const balanceEl = rowNode ? rowNode.querySelector('.agency-balance') : null;
    if (balanceEl) balanceEl.textContent = '...';

    fetch(`/agency/bookings/${agencyId}`)
        .then(res => res.json())
        .then(async data => {
            if (!data.success) {
                if (balanceEl) balanceEl.textContent = '-';
                return;
            }
            const bookings = data.bookings || [];
            if (bookings.length === 0) {
                if (balanceEl) balanceEl.textContent = '0';
                return;
            }

            const results = await Promise.all(bookings.map(b =>
                fetchBillingAndPayments(b.bookingId)
                    .then(res => ({ bookingId: b.bookingId, ...res }))
                    .catch(() => ({ bookingId: b.bookingId, total: null, balance: null }))
            ));

            const sumBalance = results.reduce((sum, item) => {
                const bal = parseFloat(item.balance);
                return sum + (isNaN(bal) ? 0 : bal);
            }, 0);

            if (balanceEl) balanceEl.textContent = formatNumberPlain(sumBalance);
        })
        .catch(() => {
            if (balanceEl) balanceEl.textContent = '-';
        });
}

function fetchBillingAndPayments(bookingId) {
    const billingUrl = `/booking/get-billing/${bookingId}?_=${Date.now()}`;
    const paymentsUrl = `/payments/get-payments/${bookingId}?_=${Date.now()}`;

    return Promise.all([
        fetch(billingUrl).then(r => r.json()),
        fetch(paymentsUrl).then(r => r.json())
    ]).then(([billingData, paymentsData]) => {
        // Normalize payments array
        const paymentsArray = (paymentsData && paymentsData.data) ? paymentsData.data
            : (Array.isArray(paymentsData) ? paymentsData : []);

        // Total payments made (exclude reservation_fee and discount like in cancel logic)
        const paymentsMade = paymentsArray.reduce((sum, payment) => {
            if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount') {
                return sum;
            }
            return sum + parseFloat(payment.AMOUNT_PAID || 0);
        }, 0);

        const effectiveSubTotal = toNumber(billingData?.effectiveSubTotal, billingData?.subTotal);
        const reservationFee = toNumber(billingData?.reservationFee);
        const discountAmount = toNumber(billingData?.discountAmount);
        const cancellationPenalty = toNumber(billingData?.penaltyAmount || billingData?.cancellationPenalty);

        // If cancelled with penalty, treat penalty as total and balance 0
        if (cancellationPenalty > 0) {
            return { total: cancellationPenalty, balance: 0 };
        }

        const totalAmount = Math.max(0, effectiveSubTotal - reservationFee - discountAmount);
        const balance = Math.max(0, totalAmount - paymentsMade);
        return { total: totalAmount, balance };
    });
}

function toNumber(...vals) {
    for (const v of vals) {
        const n = parseFloat(v);
        if (!isNaN(n)) return n;
    }
    return 0;
}

function formatCurrency(num) {
    const n = parseFloat(num);
    if (isNaN(n)) return '-';
    return '₱' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumberPlain(num) {
    const n = parseFloat(num);
    if (isNaN(n)) return '-';
    // No peso sign, no trailing .00 if whole number
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

