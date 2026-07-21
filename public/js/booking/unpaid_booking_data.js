// Fallback for editDirect function if not yet loaded from modal
if (typeof window.editDirect === 'undefined') {
    window.editDirect = function(bookingId) {
        // If editBooking is available, use it (edit form handles direct reservations)
        if (typeof window.editBooking === 'function') {
            window.editBooking(bookingId);
        } else {
            console.error('editBooking function is not available');
        }
    };
}

// Local status label renderer (same behavior as All/Single views)
function getStatusLabel(status, bookingId) {
    let labelClass, labelText;
    status = (status || '').toLowerCase();

    switch (status) {
        case 'check-in':
            labelClass = 'label-success';
            labelText = 'Check In';
            break;
        case 'check-out':
            labelClass = 'label-warning';
            labelText = 'Check Out';
            break;
        case 'pending':
            labelClass = 'label-info';
            labelText = 'Pending';
            break;
        case 'cancelled':
            labelClass = 'label-danger';
            labelText = 'Cancelled';
            break;
        default:
            labelClass = 'label-secondary';
            labelText = 'Unknown';
    }

    return `
    <span class="label label-sm ${labelClass}">
        ${labelText}
    </span>
    `;
}

$(document).ready(function () {
    // Unpaid page always uses 'all' scope so groups are represented once
    const scope = 'all';

    let table = $('#booking_tbl').DataTable({
        rowId: 'BookingID',
        processing: true,
        serverSide: false,
        ajax: {
            url: `/booking/booking_data?filter=all&scope=${scope}`,
            type: 'GET',
            dataSrc: function (json) {
                // Map first, then filter rows with Balance > 0 only
                const mapped = json.data.map(item => {
                    const formatDate = (dateString) => {
                        const date = new Date(dateString);
                        return new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: 'UTC'
                        }).format(date);
                    };
                    return {
                        BookingID: item.BookingID,
                        GroupBookingId: item.GROUP_BOOKING_ID,
                        CustomerName: item.NAME,
                        RoomID: item.ROOM_NUMBER,
                        CONFIRMATION: item.CONFIRMATION_NUMBER,
                        Checkin: formatDate(item.CHECK_IN_DATE),
                        Checkout: formatDate(item.CHECK_OUT_DATE),
                        Totalcost: item.TOTAL_COST,
                        Balance: item.BALANCE || 0,
                        Paymentstatus: item.PAYMENT_STATUS || 'unpaid',
                        BookingChannel: item.BOOKING_CHANNEL,
                        AgencyPayer: item.AGENCY_PAYER || null,
                        Status: getStatusLabel(item.BookingStatus, item.BookingID),
                        BookingStatus: item.BookingStatus,
                        IsDirectReservation: item.IS_DIRECT_RESERVATION,
                        BookingRemarks: item.BookingRemarks || '',
                        RemarksCount: item.RemarksCount || 0,
                        CreatedBy: item.ENCODED_BY_NAME || 'System',
                        EditedBy: item.EDITED_BY_NAME || null
                    };
                });
                return mapped.filter(row => (parseFloat(row.Balance) || 0) > 0);
            },
        },
        autoWidth: false,
        columnDefs: [
            { targets: 0,  visible: false },
            { targets: 1,  width: '50px',  className: 'text-center' },
            { targets: 2,  width: '120px' },
            { targets: 3,  width: '70px', className: 'text-center'  },
            { targets: 4,  width: '80px', className: 'text-center' },
            { targets: 5,  width: '80px', className: 'text-center' },
            { targets: 6,  width: '80px', className: 'text-center' },
            { targets: 7,  width: '70px', className: 'text-end' },
            { targets: 8,  width: '70px', className: 'text-end' },
            { targets: 9,  width: '70px', className: 'text-center' },
            { targets: 10, width: '70px', className: 'text-center' },
            { targets: 11, width: '70px', className: 'text-center' },
            { targets: 12, width: '100px', className: 'text-center' }, // Created By
            { targets: 13, width: '100px', className: 'text-center' }, // Edited By
            { targets: 14, width: '120px', className: 'text-center' }  // Action
        ],
        initComplete: function () {
            $('#booking_tbl thead th').addClass('text-center');
        },
        drawCallback: function () {
            var api = this.api();
            var start = api.page.info().start;
            api.column(1, { page: 'current' }).nodes().each(function (cell, i) {
                cell.innerHTML = start + i + 1;
            });
        },
        columns: [  
            { data: 'BookingID', visible: false },
            {
                title: '#',
                data: null,
                orderable: false,
                render: function (data, type, row, meta) {
                    return meta.settings._iDisplayStart + meta.row + 1;
                }
            },
            {
                data: 'CustomerName',
                title: 'GUEST NAME',
                render: function (data, type, row) {
                    if (row.GroupBookingId && String(row.GroupBookingId) !== '0') {
                        return `<a href="#" onclick="openGroupFromAll(${row.GroupBookingId})" style="color: #337ab7; text-decoration: none; cursor: pointer;">${data}</a>`;
                    }
                    return `<a href="#" onclick="showVoucherDetails(${row.BookingID})" style="color: #337ab7; text-decoration: none; cursor: pointer;">${data}</a>`;
                }
            },
            { 
                data: 'RoomID', 
                title: 'ROOM NUMBER',
                render: function(data) {
                    const value = (data ?? '').toString().trim();
                    if (!value || value === '0') {
                        return 'Unassigned Room';
                    }
                    return value;
                }
            },
            { data: 'CONFIRMATION', title: 'CONFIRMATION NUMBER' },
            { data: 'Checkin', title: 'CHECK IN' },
            { data: 'Checkout', title: 'CHECK OUT' },
            {
                data: 'Totalcost',
                title: 'TOTAL PAYMENT',
                render: function (data) {
                    return parseFloat(data).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            },
            {
                data: 'Balance',
                title: 'BALANCE',
                render: function (data) {
                    const balance = parseFloat(data) || 0;
                    const formattedBalance = balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return `<span style="color: #d9534f; font-weight: bold;">₱${formattedBalance}</span>`;
                }
            },
            {
                data: 'BookingChannel',
                title: 'BOOKING CHANNEL',
                render: function (data, type, row) {
                    if (data === 'agency') {
                        const paidBy = row.AgencyPayer === 'guest' ? 'Guest' : 'Agency';
                        const color = row.AgencyPayer === 'guest' ? '#f0ad4e' : '#5bc0de';
                        return `agency<br><small style="color:${color}; font-weight:600;">${paidBy}</small>`;
                    }
                    return data || '';
                }
            },
            {
                data: 'Paymentstatus',
                title: 'PAYMENT STATUS',
                className: 'text-center',
                type: 'string',
                render: function (data, type, row) {
                    if (type === 'sort' || type === 'type' || type === 'filter') return data;
                    const balance = parseFloat(row.Balance) || 0;
                    const totalCost = parseFloat(row.Totalcost) || 0;
                    let labelClass, displayText;
                    if (balance <= 0) { labelClass = 'label-success'; displayText = 'PAID'; }
                    else if (balance < totalCost) { labelClass = 'label-warning'; displayText = 'PARTIAL'; }
                    else { labelClass = 'label-danger'; displayText = 'UNPAID'; }
                    return `<div style="text-align: center;"><span class="label label-sm ${labelClass}">${displayText}</span></div>`;
                }
            },
            {
                data: 'Status',
                title: 'BOOKING STATUS',
                visible: true,
                className: 'text-center',
                render: function (data) { return data; }
            },
            {
                data: 'CreatedBy',
                title: 'CREATED BY',
                className: 'text-center',
                render: function (data) {
                    return data || 'System';
                }
            },
            {
                data: 'EditedBy',
                title: 'EDITED BY',
                className: 'text-center',
                render: function (data) {
                    return data || '-';
                }
            },
            {
                title: 'ACTION',
                className: 'text-center',
                orderable: false,
                render: function (data, type, row) {
                    const bookingStatus = row.BookingStatus?.toLowerCase();
                    const isDirect = String(row.IsDirectReservation) === '1';
                    let html = `<div style="text-align: center;">`;
                    // Billing action - enabled for all bookings including direct reservations
                    html += `
                        <span class="label label-sm label-billing" onclick="showBilling(${row.BookingID})" title="Billing" style="cursor:pointer; margin:0 2px; display:inline-block;">
                            <i class="fa fa-credit-card"></i>
                        </span>`;
                    html += `
                    <span class="label label-sm label-warning ms-1" onclick="${isDirect ? `editDirect(${row.BookingID})` : `editBooking(${row.BookingID})`}" title="Edit Booking" style="cursor:pointer; margin:0 2px; display:inline-block;">
                        <i class="fa fa-edit"></i>
                    </span>`;
                    const hasRemarks = (row.BookingRemarks && row.BookingRemarks.trim() !== '') || (row.RemarksCount && row.RemarksCount > 0);
                    if (hasRemarks) {
                        html += `
                        <span class="label label-sm label-success ms-1" onclick="openRemarksModal(${row.BookingID})" title="Remarks" style="cursor:pointer; margin:0 2px; display:inline-block;">
                            <i class="fa fa-comment-dots"></i>
                        </span>`;
                    } else {
                        html += `
                        <span class="label label-sm label-muted ms-1" onclick="openRemarksModal(${row.BookingID})" title="Remarks" style="cursor:pointer; margin:0 2px; display:inline-block;">
                            <i class="fa fa-comment-dots"></i>
                        </span>`;
                    }
                    html += `
                    <span class="label label-sm label-download ms-1" onclick="downloadVoucher(${row.BookingID})" title="Download Voucher" style="cursor:pointer; margin:0 2px; display:inline-block;">
                        <i class="fa fa-download"></i>
                    </span>`;
                    if (bookingStatus === 'pending') {
                        html += `
                        <span class="label label-sm label-danger ms-1" onclick="openCancelBookingModal(${row.BookingID})" title="Cancel Booking" style="cursor:pointer; margin:0 2px; display:inline-block;">
                            <i class="fa fa-times"></i>
                        </span>`;
                    } else if (bookingStatus === 'cancelled') {
                        html += `
                        <span class="label label-sm label-danger ms-1" title="Cancelled" style="opacity:.6; cursor:not-allowed; margin:0 2px; display:inline-block;">
                            <i class="fa fa-ban"></i>
                        </span>`;
                    }
                    html += `</div>`;
                    return html;
                }
            }
        ],
        order: [[0, 'desc']],
        language: { emptyTable: 'No unpaid bookings found.' }
    });

    // Tab links behavior
    $('.tab-item').on('click', function(e) {
        e.preventDefault();
        $('.tab-item').removeClass('is-active');
        $(this).addClass('is-active');
        const href = $(this).attr('href');
        if (href && href !== '#') window.location.href = href;
    });

    // Initialize Flatpickr for date range picker
    let dateRangePicker = null;
    
    // Check if flatpickr is available and the element exists before initializing
    if (typeof flatpickr !== 'undefined' && document.getElementById('dateRangePicker')) {
        try {
            dateRangePicker = flatpickr("#dateRangePicker", {
                mode: "range",
                dateFormat: "Y-m-d",
                allowInput: false,
                clickOpens: true,
                placeholder: "Select date range",
                showMonths: 2,
                static: false,
                monthSelectorType: "static",
                prevArrow: '<i class="fa fa-chevron-left"></i>',
                nextArrow: '<i class="fa fa-chevron-right"></i>',
                locale: {
                    firstDayOfWeek: 1, // Monday
                    weekdays: {
                        shorthand: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                        longhand: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    },
                    months: {
                        shorthand: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                        longhand: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                    }
                },
                onReady: function(selectedDates, dateStr, instance) {
                    // Add custom classes for styling
                    instance.calendarContainer.classList.add('flatpickr-range-mode');
                },
                onClose: function(selectedDates, dateStr, instance) {
                    // Prevent immediate reopening
                    instance.input.blur();
                },
                onChange: function(selectedDates, dateStr, instance) {
                    // Update input display when dates are selected
                    if (selectedDates.length === 2) {
                        const startDate = selectedDates[0];
                        const endDate = selectedDates[1];
                        const formattedStart = startDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                        });
                        const formattedEnd = endDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                        });
                        instance.input.value = `${formattedStart} to ${formattedEnd}`;
                        
                        // Auto-apply filter when both dates are selected
                        // Use local date formatting to avoid timezone issues
                        const dateFrom = startDate.getFullYear() + '-' + 
                            String(startDate.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(startDate.getDate()).padStart(2, '0');
                        const dateTo = endDate.getFullYear() + '-' + 
                            String(endDate.getMonth() + 1).padStart(2, '0') + '-' + 
                            String(endDate.getDate()).padStart(2, '0');
                        
                        // Remove active class from all predefined filter buttons
                        $('.filter-btn').removeClass('active');
                        
                        // Update the DataTable's AJAX URL with custom date range
                        table.ajax.url(`/booking/booking_data?filter=custom&scope=${scope}&dateFrom=${dateFrom}&dateTo=${dateTo}`).load();
                        
                        // Close the calendar after applying filter with a small delay
                        setTimeout(() => {
                            instance.close();
                        }, 100);
                        
                        // Show success message
                        Swal.fire({
                            icon: 'success',
                            title: 'Filter Applied',
                            text: `Showing bookings from ${formattedStart} to ${formattedEnd}`,
                            timer: 1500,
                            showConfirmButton: false
                        });
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing Flatpickr:', error);
            dateRangePicker = null;
        }
    } else {
        console.warn('Flatpickr library not loaded or dateRangePicker element not found');
    }

    // Date filter buttons - still fetch by date but keep client-side Balance>0 filter
    $('.filter-btn').on('click', function() {
        $('.filter-btn').removeClass('active');
        $(this).addClass('active');
        const filter = $(this).data('filter');
        table.ajax.url(`/booking/booking_data?filter=${filter}&scope=${scope}`).load();
    });

    // Clear date filter
    $('#clearDateFilter').on('click', function() {
        // Clear the date range picker if it exists
        if (dateRangePicker) {
            dateRangePicker.clear();
        }
        // Reset to "All" filter
        $('.filter-btn').removeClass('active');
        $('.filter-btn[data-filter="all"]').addClass('active');
        table.ajax.url(`/booking/booking_data?filter=all&scope=${scope}`).load();
    });
});


