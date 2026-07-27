// ========================================
// AGENCY MANAGEMENT SYSTEM
// ========================================

let currentAgencyId = null;
let currentAgencyName = null;
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
            <button class="btn btn-tbl-edit btn-xs" onclick="editAgency('${agencyId}')" title="Edit Agency">
                <i class="fa fa-pencil"></i>
            </button>
            <button class="btn btn-primary btn-xs" onclick="openAgencyVoucherModal('${agencyId}')" title="Generate Voucher">
                <i class="fa fa-file-pdf-o"></i>
            </button>
            <a href="#" class="btn btn-tbl-delete btn-xs delete-link" data-id="${agencyId}" title="Delete Agency">
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
            columnDefs: [
                { targets: [4], orderable: false },
                { targets: [1, 2, 3, 4], searchable: false }
            ],
            search: {
                smart: false,
                regex: false,
                caseInsensitive: true
            },
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
    currentAgencyId = agencyId;
    currentAgencyName = agencyName;
    initializeBulkControls();

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
                <tr data-booking-id="${b.bookingId}" data-payment-status="${(b.PAYMENT_STATUS || '').toLowerCase()}">
                    <td class="text-center">
                      <input type="checkbox" class="form-check-input booking-select" data-booking-id="${b.bookingId}">
                    </td>
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
        order: [[5, 'desc']], // by Check-in desc (index shifted)
        columnDefs: [
            { targets: [0,1,2,3,4,5,9,10], className: 'text-center' },
            { targets: [7,8], className: 'text-end' },
            // Disable ordering for checkbox and # column
            { targets: [0,1], orderable: false }
        ]
    });

    // Re-apply cached totals/balances on every draw (for paginated rows)
    tableEl.on('draw.dt', applyCachedTotalsToTable);

    // Hook payment status filter tabs
    initStatusTabs();

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
            row.dataset.balance = balance != null ? balance : '';
            const paymentStatusText = (row.dataset.paymentStatus || '').toLowerCase();
            if (totalCell) totalCell.textContent = total != null ? formatNumberPlain(total) : '-';
            if (balanceCell) {
                if (balance != null) {
                    balanceCell.textContent = formatNumberPlain(balance);
                    balanceCell.classList.toggle('text-danger', balance > 0.0001);
                    const checkbox = row.querySelector('.booking-select');
                    if (checkbox) {
                        const shouldDisable = balance <= 0.0001 || paymentStatusText === 'paid';
                        checkbox.disabled = shouldDisable;
                        if (shouldDisable) {
                            checkbox.checked = false;
                        }
                    }
                } else {
                    balanceCell.textContent = '-';
                }
            }
        });
        updateBulkSummary();
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
        row.dataset.balance = cached.balance != null ? cached.balance : '';
        const paymentStatusText = (row.dataset.paymentStatus || '').toLowerCase();
        if (totalCell) totalCell.textContent = cached.total != null ? formatNumberPlain(cached.total) : '-';
        if (balanceCell) {
            if (cached.balance != null) {
                balanceCell.textContent = formatNumberPlain(cached.balance);
                balanceCell.classList.toggle('text-danger', cached.balance > 0.0001);
                const checkbox = row.querySelector('.booking-select');
                if (checkbox) {
                    const shouldDisable = cached.balance <= 0.0001 || paymentStatusText === 'paid';
                    checkbox.disabled = shouldDisable;
                    if (shouldDisable) {
                        checkbox.checked = false;
                    }
                }
            } else {
                balanceCell.textContent = '-';
            }
        }
    });
    updateBulkSummary();
}

// ========================================
// BULK PAYMENT HELPERS
// ========================================

function initializeBulkControls() {
    const checkAll = document.getElementById('agency-bulk-check-all');
    const selectUnpaidBtn = document.getElementById('agency-bulk-select-unpaid');
    const paySelectedBtn = document.getElementById('agency-bulk-pay-selected');
    const payAllBtn = document.getElementById('agency-bulk-pay-all');
    const tableEl = document.getElementById('agency-bookings-table');

    if (checkAll) {
        checkAll.checked = false;
        checkAll.addEventListener('change', () => {
            const rows = document.querySelectorAll('#agency-bookings-table tbody tr[data-booking-id]');
            rows.forEach(row => {
                const cb = row.querySelector('.booking-select');
                const bal = parseFloat(row.dataset.balance || '0');
                if (cb && !cb.disabled) {
                    cb.checked = checkAll.checked && bal > 0.0001;
                }
            });
            updateBulkSummary();
        });
    }

    if (tableEl) {
        tableEl.addEventListener('change', (e) => {
            if (e.target && e.target.classList.contains('booking-select')) {
                updateBulkSummary();
                // sync check-all state
                const allBoxes = Array.from(document.querySelectorAll('#agency-bookings-table tbody .booking-select'));
                const enabled = allBoxes.filter(cb => !cb.disabled);
                const allChecked = enabled.length > 0 && enabled.every(cb => cb.checked);
                const checkAll = document.getElementById('agency-bulk-check-all');
                if (checkAll) checkAll.checked = allChecked;
            }
        });
    }

    if (paySelectedBtn) {
        paySelectedBtn.onclick = (e) => {
            e.preventDefault();
            const ids = getSelectedBookingIds();
            if (!ids.length) {
                showError('Select at least one booking before paying.');
                return;
            }
            confirmBulkPayment(ids, true);
        };
    }

    if (payAllBtn) {
        payAllBtn.onclick = (e) => {
            e.preventDefault();
            const ids = getUnpaidBookingIds();
            if (!ids.length) {
                showError('No unpaid bookings to pay.');
                return;
            }
            confirmBulkPayment(ids, false);
        };
    }

    // Clear form fields when modal opens
    const amountInput = document.getElementById('agency-bulk-amount');
    const remarksInput = document.getElementById('agency-bulk-remarks');
    if (amountInput) amountInput.value = '';
    if (remarksInput) remarksInput.value = '';
    if (amountInput) {
        amountInput.addEventListener('input', updateBulkSummary);
    }

    // Payment method cards
    document.querySelectorAll('#agency-bulk-method-group .pay-option').forEach(card => {
        card.classList.toggle('active', card.querySelector('input[type="radio"]')?.checked);
        card.addEventListener('click', () => {
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                document.querySelectorAll('#agency-bulk-method-group .pay-option').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            }
        });
    });

    updateBulkSummary();
}

function getSelectedBookingIds() {
    const ids = [];
    document.querySelectorAll('#agency-bookings-table tbody tr[data-booking-id]').forEach(row => {
        const cb = row.querySelector('.booking-select');
        if (cb && cb.checked) {
            const bookingId = parseInt(row.getAttribute('data-booking-id'), 10);
            if (Number.isInteger(bookingId)) ids.push(bookingId);
        }
    });
    return ids;
}

function getUnpaidBookingIds() {
    const ids = [];
    document.querySelectorAll('#agency-bookings-table tbody tr[data-booking-id]').forEach(row => {
        const bal = parseFloat(row.dataset.balance || '0');
        if (bal > 0.0001) {
            const bookingId = parseInt(row.getAttribute('data-booking-id'), 10);
            if (Number.isInteger(bookingId)) ids.push(bookingId);
        }
    });
    return ids;
}

function getSelectedBulkMethod() {
    const checked = document.querySelector('input[name="agencyBulkMethod"]:checked');
    return checked?.value || null;
}

function confirmBulkPayment(targetIds, requireSelection) {
    const method = getSelectedBulkMethod();
    if (!method) {
        showError('Select a payment method.');
        return;
    }

    const amountInput = document.getElementById('agency-bulk-amount');
    const enteredAmount = parseFloat(amountInput?.value || '0') || 0;
    const totalSelectedBalance = targetIds.reduce((sum, id) => {
        const cached = agencyBookingTotalsCache[id];
        const bal = cached?.balance != null ? parseFloat(cached.balance) : parseFloat(document.querySelector(`#agency-bookings-table tr[data-booking-id="${id}"]`)?.dataset.balance || '0');
        return sum + (bal || 0);
    }, 0);
    const plannedAmount = enteredAmount > 0 ? enteredAmount : totalSelectedBalance;

    if (!plannedAmount || plannedAmount <= 0) {
        showError('Enter a valid amount.');
        return;
    }

    Swal.fire({
        title: 'Confirm Payment',
        text: `Pay ${formatNumberPlain(plannedAmount)} to ${targetIds.length} booking(s)?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, pay now',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            submitBulkPayment(targetIds, requireSelection);
        }
    });
}

function updateBulkSummary() {
    const summaryEl = document.getElementById('agency-bulk-summary');
    const totalUnpaidEl = document.getElementById('agency-bulk-total-unpaid');
    const selectedCountEl = document.getElementById('agency-bulk-selected-count');
    const selectedUnpaidEl = document.getElementById('agency-bulk-selected-unpaid');
    const amountInput = document.getElementById('agency-bulk-amount');

    let selected = 0;
    let selectedBalance = 0;
    let totalUnpaid = 0;

    document.querySelectorAll('#agency-bookings-table tbody tr[data-booking-id]').forEach(row => {
        const bal = parseFloat(row.dataset.balance || '0') || 0;
        totalUnpaid += bal;
        const cb = row.querySelector('.booking-select');
        if (cb && cb.checked) {
            selected += 1;
            selectedBalance += bal;
        }
    });

    if (summaryEl) summaryEl.textContent = `Selected: ${selected} | Selected Unpaid: ${formatNumberPlain(selectedBalance)} | Total Unpaid: ${formatNumberPlain(totalUnpaid)}`;
    if (totalUnpaidEl) totalUnpaidEl.textContent = formatNumberPlain(totalUnpaid);
    if (selectedCountEl) selectedCountEl.textContent = selected;
    if (selectedUnpaidEl) selectedUnpaidEl.textContent = formatNumberPlain(selectedBalance);
    // Keep amount in sync with selected unpaid (auto-set on every selection change, no decimals)
    if (amountInput) {
        const newVal = selectedBalance ? Math.round(selectedBalance) : '';
        amountInput.value = newVal;
        amountInput.setAttribute('step', '1');
        amountInput.setAttribute('placeholder', '0');
    }
}

function applyBookingStatusFilter(value) {
    if (!agencyBookingsTable) return;
    // Payment Status column index 9
    let regex = '';
    if (value === 'paid') regex = '^PAID$';
    else if (value === 'unpaid') regex = '^(UNPAID|PARTIAL)$';
    else regex = '';
    agencyBookingsTable.column(9).search(regex, true, false).draw();
}

function initStatusTabs() {
    const tabs = document.querySelectorAll('.agency-status-tab');
    if (!tabs || tabs.length === 0) return;
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            tabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            applyBookingStatusFilter(tab.dataset.status || 'all');
        });
    });
}

function submitBulkPayment(bookingIds, requireSelection = false) {
    if (!currentAgencyId) {
        showError('No agency selected.');
        return;
    }

    const amountInput = document.getElementById('agency-bulk-amount');
    const remarksInput = document.getElementById('agency-bulk-remarks');
    const method = getSelectedBulkMethod();
    if (!method) {
        showError('Select a payment method.');
        return;
    }

    const enteredAmount = parseFloat(amountInput?.value || '0');
    const remarks = remarksInput?.value || '';

    const targetIds = bookingIds && bookingIds.length > 0 ? bookingIds : [];
    if (requireSelection && targetIds.length === 0) {
        showError('Select at least one booking before paying.');
        return;
    }
    if (!targetIds.length) {
        showError('No bookings selected or unpaid.');
        return;
    }

    // If amount not provided or <=0, default to total selected balance
    const defaultTotal = targetIds.reduce((sum, id) => {
        const cached = agencyBookingTotalsCache[id];
        const bal = cached?.balance != null ? parseFloat(cached.balance) : parseFloat(document.querySelector(`#agency-bookings-table tr[data-booking-id="${id}"]`)?.dataset.balance || '0');
        return sum + (bal || 0);
    }, 0);
    const amount = (enteredAmount > 0 ? enteredAmount : defaultTotal);

    if (amount > defaultTotal + 0.0001) {
        showError(`Amount exceeds selected unpaid total (max ${formatNumberPlain(defaultTotal)}).`);
        return;
    }

    if (!amount || amount <= 0) {
        showError('Enter a valid amount.');
        return;
    }

    Swal.fire({
        title: 'Processing payment...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    $.ajax({
        url: `/agency/${currentAgencyId}/bulk-payment`,
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          bookingIds: targetIds,
          amount,
          paymentMethod: method,
          remarks
        }),
        success: function(resp) {
          Swal.close();
          if (resp.success) {
            const applied = formatNumberPlain(resp.appliedTotal || 0);
            const bookingsCount = (resp.bookings && resp.bookings.length) ? resp.bookings.length : targetIds.length;
            const reference = resp.reference || '';
            const ids = targetIds.join(',');
            const receiptUrl = `/agency/${currentAgencyId}/bulk-payment/receipt?bookingIds=${encodeURIComponent(ids)}&reference=${encodeURIComponent(reference)}&method=${encodeURIComponent(method)}&remarks=${encodeURIComponent(remarks)}&total=${resp.appliedTotal || 0}`;
            const downloadName = `bulk-payment-${reference || 'receipt'}.pdf`;

            Swal.fire({
              icon: 'success',
              title: 'Payment applied',
              html: `Applied: <strong>${applied}</strong><br/>Bookings paid: <strong>${bookingsCount}</strong>`,
              showCancelButton: true,
              confirmButtonText: 'Download receipt',
              cancelButtonText: 'Close'
            }).then(result => {
              if (result.isConfirmed) {
                // Open in new tab
                window.open(receiptUrl, '_blank');
                // Trigger download programmatically
                fetch(receiptUrl)
                  .then(res => res.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = downloadName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 5000);
                  })
                  .catch(() => {
                    // swallow download errors; at least the new tab opened
                  });
              }
            });

            // Refresh bookings to reflect new balances
            fetchAgencyBookings(currentAgencyId, currentAgencyName || 'Agency');
          } else {
            showError(resp.message || 'Bulk payment failed.');
          }
        },
        error: function(xhr) {
          Swal.close();
          const err = xhr.responseJSON?.message || 'Bulk payment failed.';
          showError(err);
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
            if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount' || payment.PAYMENT_TYPE === 'security_deposit') {
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

// ========================================
// AGENCY VOUCHER (AGENCY-WIDE)
// ========================================

window.openAgencyVoucherModal = function (agencyId) {
    if (!agencyId) return;

    const agencyRow = document.querySelector(`#agencies_tbl tbody tr[data-id="${agencyId}"]`);
    const nameCell = agencyRow ? agencyRow.querySelector('td:nth-child(1)') : null;
    const agencyName = nameCell ? nameCell.textContent.trim() : 'Agency';

    const modalId = 'agency-voucher-modal';
    let modalEl = document.getElementById(modalId);

    if (!modalEl) {
        const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="${modalId}-label" aria-hidden="true" data-bs-backdrop="static">
          <div class="modal-dialog modal-md modal-dialog-centered">
            <div class="modal-content">
              <style>
                /* Force black text for flatpickr input inside this modal */
                #agency-voucher-modal .flatpickr-input {
                  color: #000 !important;
                }
              </style>
              <div class="modal-header">
                <h5 class="modal-title" id="${modalId}-label">Generate Agency Voucher</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" id="agency-voucher-agency-id">
                <div class="mb-3">
                
                  <div><strong id="agency-voucher-agency-name"></strong></div>
                </div>
                <div class="mb-3">
                  <label class="form-label d-block">Filter by</label>
                  <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="agencyVoucherFilterType" id="agency-voucher-filter-reservation" value="reservation" checked>
                    <label class="form-check-label" for="agency-voucher-filter-reservation">Reservation Date</label>
                  </div>
                  <div class="form-check form-check-inline">
                    <input class="form-check-input" type="radio" name="agencyVoucherFilterType" id="agency-voucher-filter-checkin" value="checkin">
                    <label class="form-check-label" for="agency-voucher-filter-checkin">Check-in Date</label>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Date Range</label>
                  <input type="text" id="agency-voucher-daterange" class="form-control" placeholder="Select date range" style="color: #000 !important;">
                
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button type="button" class="btn btn-primary" id="agency-voucher-generate-btn">
                  <i class="fa fa-file-pdf-o"></i> Generate Voucher
                </button>
              </div>
            </div>
          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById(modalId);

        // Initialize date range picker if flatpickr is available
        if (window.flatpickr) {
            window.flatpickr('#agency-voucher-daterange', {
                mode: 'range',
                // VALUE sent to backend (YYYY-MM-DD) para sakto sa MySQL DATE(...)
                dateFormat: 'Y-m-d',
                // DISPLAY format sa input (e.g. Dec 16, 2025) na readable
                altInput: true,
                altFormat: 'M d, Y',
                onReady: function (selectedDates, dateStr, instance) {
                    if (instance.altInput) {
                        instance.altInput.style.setProperty('color', '#000', 'important');
                        instance.altInput.style.setProperty('-webkit-text-fill-color', '#000', 'important');
                        instance.altInput.style.setProperty('opacity', '1', 'important');
                    }
                },
                onChange: function (selectedDates, dateStr, instance) {
                    if (instance.altInput) {
                        instance.altInput.style.setProperty('color', '#000', 'important');
                        instance.altInput.style.setProperty('-webkit-text-fill-color', '#000', 'important');
                        instance.altInput.style.setProperty('opacity', '1', 'important');
                    }
                }
            });
            // siguraduhin na black din ang hidden input kung sakali makita
            const drEl = document.getElementById('agency-voucher-daterange');
            if (drEl) {
                drEl.style.color = '#000';
            }
        }

        // Reset fields when modal is closed
        $('#agency-voucher-modal').on('hidden.bs.modal', function () {
            const idInput = document.getElementById('agency-voucher-agency-id');
            const nameEl = document.getElementById('agency-voucher-agency-name');
            const rangeEl = document.getElementById('agency-voucher-daterange');

            if (idInput) idInput.value = '';
            if (nameEl) nameEl.textContent = '';

            if (rangeEl) {
                // Clear flatpickr selection if attached
                if (rangeEl._flatpickr) {
                    rangeEl._flatpickr.clear();
                    if (rangeEl._flatpickr.altInput) {
                        rangeEl._flatpickr.altInput.value = '';
                    }
                } else {
                    rangeEl.value = '';
                }
            }

            // Reset filter type to default (Reservation Date)
            const reservationRadio = document.getElementById('agency-voucher-filter-reservation');
            if (reservationRadio) {
                reservationRadio.checked = true;
            }
        });

        document.getElementById('agency-voucher-generate-btn').addEventListener('click', generateAgencyVoucher);
    }

    document.getElementById('agency-voucher-agency-id').value = agencyId;
    document.getElementById('agency-voucher-agency-name').textContent = agencyName;

    $('#agency-voucher-modal').modal('show');
};

function generateAgencyVoucher() {
    const agencyId = document.getElementById('agency-voucher-agency-id').value;
    const filterType = document.querySelector('input[name="agencyVoucherFilterType"]:checked')?.value || 'reservation';
    const rangeInput = document.getElementById('agency-voucher-daterange').value.trim();

    if (!agencyId) {
        showError('No agency selected.');
        return;
    }

    if (!rangeInput) {
        showError('Please select a date range.');
        return;
    }

    let from = null;
    let to = null;
    if (rangeInput.includes(' to ')) {
        const parts = rangeInput.split(' to ');
        from = parts[0];
        to = parts[1] || parts[0];
    } else if (rangeInput.includes(' - ')) {
        const parts = rangeInput.split(' - ');
        from = parts[0];
        to = parts[1] || parts[0];
    } else {
        from = rangeInput;
        to = rangeInput;
    }

    if (!from || !to) {
        showError('Invalid date range.');
        return;
    }

    const url = `/agency/voucher/${agencyId}?filterType=${encodeURIComponent(filterType)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&download=1`;

    Swal.fire({
        title: 'Generating Voucher...',
        text: 'Please wait while we prepare the agency voucher.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Trigger download via opening the URL; then close loader after a short delay
    window.open(url, '_blank');

    setTimeout(() => {
        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'Voucher generated!',
            text: 'Agency voucher PDF has been downloaded.',
            timer: 2000,
            showConfirmButton: false
        });
    }, 2000);

    $('#agency-voucher-modal').modal('hide');
}

