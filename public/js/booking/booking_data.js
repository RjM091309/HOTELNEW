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

$(document).ready(function () {
    // Determine scope based on current path: single pages exclude grouped bookings; 'all' includes everything
    const isAllPage = window.location.pathname.endsWith('/booking/all');
    const scope = isAllPage ? 'all' : 'single';
    
    // Check for highlight parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const highlightBookingId = urlParams.get('highlight');
    
    // Build initial URL with highlight parameter if present
    let initialUrl = `/booking/booking_data?filter=all&scope=${scope}`;
    if (highlightBookingId && String(highlightBookingId) !== '0' && String(highlightBookingId) !== '') {
        initialUrl += `&highlight=${highlightBookingId}`;
    }

    let table = $('#booking_tbl').DataTable({
        rowId: 'BookingID',
        processing: true,
        serverSide: false,
        ajax: {
            url: initialUrl,
            type: 'GET',
            dataSrc: function (json) {
                return json.data.map(item => {
                    const formatDate = (dateString) => {
                        const date = new Date(dateString); // Parse the date string
                        return new Intl.DateTimeFormat('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: 'UTC' // Force UTC to avoid timezone shifts
                        }).format(date);
                    };
                    const isCancelled = (item.BookingStatus || '').toLowerCase() === 'cancelled' || item.IS_CANCELLED === 1;
                    
                    return {
                        BookingID: item.BookingID,
                        GroupBookingId: item.GROUP_BOOKING_ID,
                        CustomerName: item.NAME,
                        RoomID: item.ROOM_NUMBER,
                        CONFIRMATION: item.CONFIRMATION_NUMBER,
                        Checkin: formatDate(item.CHECK_IN_DATE),
                        Checkout: formatDate(item.CHECK_OUT_DATE), // Plain text like check-in
                        Totalcost: item.TOTAL_COST,
                        Balance: item.BALANCE || 0,
                        Paymentstatus: item.PAYMENT_STATUS || 'unpaid',
                        PaymentMethod: item.PAYMENT_METHOD || '',
                        HasUnsettledCredit: !!item.HAS_UNSETTLED_CREDIT,
                        BookingChannel: item.BOOKING_CHANNEL,
                        AgencyPayer: item.AGENCY_PAYER || null,
                        Status: getStatusLabel(item.BookingStatus, item.BookingID), // Status label
                        BookingStatus: item.BookingStatus,
                        IsCancelled: isCancelled,
                        IsDirectReservation: item.IS_DIRECT_RESERVATION,
                        BookingRemarks: item.BookingRemarks || '',
                        RemarksCount: item.RemarksCount || 0,
                        CreatedBy: item.ENCODED_BY_NAME || 'System',
                        EditedBy: item.EDITED_BY_NAME || null
                    };
                });
            },
        },
        autoWidth: false,
        columnDefs: [
            { targets: 0,  visible: false },                    // BookingID (hidden)
            { targets: 1,  width: '50px',  className: 'text-center' }, // #
            { targets: 2,  width: '120px' },                    // Guest Name
            { targets: 3,  width: '70px', className: 'text-center'  },                    // Room Number
            { targets: 4,  width: '80px', className: 'text-center' },                    // Confirmation Number
            { targets: 5,  width: '80px', className: 'text-center' }, // Check In
            { targets: 6,  width: '80px', className: 'text-center' }, // Check Out
            { targets: 7,  width: '70px', className: 'text-end' },    // Total Payment
            { targets: 8,  width: '70px', className: 'text-end' },    // Balance
            { targets: 9,  width: '70px', className: 'text-center' },                    // Booking Channel
            { targets: 10, width: '70px', className: 'text-center' }, // Payment Status
            { targets: 11, width: '70px', className: 'text-center' }, // Booking Status
            { targets: 12, width: '100px', className: 'text-center' }, // Created By
            { targets: 13, width: '100px', className: 'text-center' }, // Edited By
            { targets: 14, width: '120px', className: 'text-center' }  // Action
        ],
        initComplete: function () {
            $('#booking_tbl thead th').addClass('text-center');
        },
        drawCallback: function () {
            // Ensure the "#" column always starts at 1 on each page regardless of sort
            var api = this.api();
            var start = api.page.info().start;
            api.column(1, { page: 'current' }).nodes().each(function (cell, i) {
                cell.innerHTML = start + i + 1;
            });
            
            // Fetch billing data for cancelled bookings to update TOTAL PAYMENT
            const cancelledBookings = [];
            api.rows({ page: 'current' }).every(function () {
                const rowData = this.data();
                if (rowData.IsCancelled && !rowData._cancellationPenaltyFetched) {
                    cancelledBookings.push({
                        bookingId: rowData.BookingID,
                        row: this
                    });
                    rowData._cancellationPenaltyFetched = true;
                }
            });
            
            // Batch fetch billing data for cancelled bookings
            if (cancelledBookings.length > 0) {
                Promise.all(
                    cancelledBookings.map(item => 
                        fetch(`/booking/get-billing/${item.bookingId}?_=${Date.now()}`)
                            .then(response => response.json())
                            .then(billingData => ({
                                bookingId: item.bookingId,
                                row: item.row,
                                penaltyAmount: parseFloat(billingData.penaltyAmount) || 0
                            }))
                            .catch(err => {
                                console.error(`Error fetching billing for booking ${item.bookingId}:`, err);
                                return {
                                    bookingId: item.bookingId,
                                    row: item.row,
                                    penaltyAmount: 0
                                };
                            })
                    )
                ).then(results => {
                    // Update the table with correct cancellation penalty values
                    results.forEach(result => {
                        const rowData = result.row.data();
                        rowData._cancellationPenalty = result.penaltyAmount;
                        result.row.data(rowData);
                    });
                    // Redraw to update display
                    api.draw(false);
                });
            }
        },
        columns: [  
            { data: 'BookingID', visible: false },
            {
                title: '#',
                data: null,
                orderable: false,
                render: function (data, type, row, meta) {
                    // _iDisplayStart ay ang index kung saan nagsisimula ang kasalukuyang page
                    // meta.row ay ang index ng row sa loob ng current page
                    return meta.settings._iDisplayStart + meta.row + 1;
                }
            },
            {
                data: 'CustomerName',
                title: 'GUEST NAME',
                render: function (data, type, row) {
                    // If this row represents a group, open the group details modal instead
                    if (row.GroupBookingId && String(row.GroupBookingId) !== '0') {
                        return `<a href="#" onclick="event.preventDefault(); openGroupFromAll(${row.GroupBookingId})" style="color: #337ab7; text-decoration: none; cursor: pointer;">${data}</a>`;
                    }
                    // Open full Room Reservation Details (same as dashboard/calendar)
                    return `<a href="#" onclick="event.preventDefault(); openRoomMenuModal(${row.BookingID})" style="color: #337ab7; text-decoration: none; cursor: pointer;">${data}</a>`;
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
            {
                data: 'Checkout',
                title: 'CHECK OUT',
            },
            {
                data: 'Totalcost',
                title: 'TOTAL PAYMENT',
                render: function (data, type, row) {
                    // For cancelled bookings, use stored cancellation penalty if available
                    // Otherwise use the data from backend (will be updated after billing fetch)
                    let totalCost = parseFloat(data) || 0;
                    
                    // If cancelled and we have the cancellation penalty stored, use it
                    if (row.IsCancelled && row._cancellationPenalty !== undefined) {
                        totalCost = row._cancellationPenalty;
                    }
                    
                    // Format the total cost as currency
                    return totalCost.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            },
            {
                data: 'Balance',
                title: 'BALANCE',
                render: function (data, type, row) {
                    // For cancelled bookings, balance should always be 0 (as per billing logic)
                    let balance = parseFloat(data) || 0;
                    
                    if (row.IsCancelled) {
                        balance = 0; // Cancelled bookings always show 0 balance
                    }
                    
                    // Format the balance as currency
                    const formattedBalance = balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    
                    // Add color coding for balance
                    if (balance > 0) {
                        return `<span style="color: #d9534f; font-weight: bold;">₱${formattedBalance}</span>`;
                    } else if (balance < 0) {
                        return `<span style="color: #5cb85c; font-weight: bold;">₱${formattedBalance}</span>`;
                    } else {
                        return `<span>₱${formattedBalance}</span>`;
                    }
                }
            },
            {
                data: 'BookingChannel',
                title: 'OTA',
                render: function (data, type, row) {
                    if (data === 'agency') {
                        const paidBy = row.AgencyPayer === 'guest' ? 'Guest' : 'Agency';
                        const color = row.AgencyPayer === 'guest' ? '#f0ad4e' : '#5bc0de';
                        return `agency<br><small style="color:${color}; font-weight:600;">${paidBy}</small>`;
                    }
                    if (data === 'booking-channel' || data === 'booking channel') {
                        return 'OTA';
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
                    // For sorting and filtering, return the raw normalized data
                    if (type === 'sort' || type === 'type' || type === 'filter') {
                        return data; // Already normalized in dataSrc
                    }
                    
                    // For cancelled bookings, always show CANCELLED status
                    if (row.IsCancelled || (data && data.toLowerCase() === 'cancelled')) {
                        return `<div style="text-align: center;"><span class="label label-sm label-danger">CANCELLED</span></div>`;
                    }
                    
                    // Calculate actual payment status based on balance for non-cancelled bookings
                    const balance = parseFloat(row.Balance) || 0;
                    const totalCost = parseFloat(row.Totalcost) || 0;
                    const paymentMethod = (row.PaymentMethod || '').toLowerCase();
                    const isOnCredit = (paymentMethod === 'credit' || paymentMethod === 'marker') && row.HasUnsettledCredit;
                    let labelClass, displayText;

                    if (balance <= 0 && isOnCredit) {
                        // Settled via credit/marker terms, not actual cash collected
                        labelClass = 'label-info';
                        displayText = 'CREDIT';
                    } else if (balance <= 0) {
                        // No balance or negative balance (overpaid) = PAID
                        labelClass = 'label-success';
                        displayText = 'PAID';
                    } else if (balance < totalCost) {
                        // Has balance but less than total = PARTIAL
                        labelClass = 'label-warning';
                        displayText = 'PARTIAL';
                    } else {
                        // Balance equals total = UNPAID
                        labelClass = 'label-danger';
                        displayText = 'UNPAID';
                    }
                    
                    return `<div style="text-align: center;"><span class="label label-sm ${labelClass}">${displayText}</span></div>`;
                }
            },
            {
                data: 'Status',
                title: 'BOOKING STATUS',
                visible: true, // This hides the column
                className: 'text-center',
                render: function (data, type, row) {
                    // Render the custom status label
                    return data;
                }
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
                const paymentStatus = row.Paymentstatus.toLowerCase();
                const bookingStatus = row.BookingStatus?.toLowerCase(); // safe check

                const isDirect = String(row.IsDirectReservation) === '1';

                let html = `<div style="text-align: center;">`;

                // Billing action - enabled for all bookings including direct reservations
                html += `
                    <span class="label label-sm label-billing" onclick="showBilling(${row.BookingID})" title="Billing" style="cursor:pointer; margin:0 2px; display:inline-block;">
                        <i class="fa fa-credit-card"></i>
                    </span>`;

                // Edit action
                html += `
                    <span class="label label-sm label-warning ms-1" onclick="${isDirect ? `editDirect(${row.BookingID})` : `editBooking(${row.BookingID})`}" title="Edit Booking" style="cursor:pointer; margin:0 2px; display:inline-block;">
                        <i class="fa fa-edit"></i>
                    </span>`;

                // Remarks action (highlight if remarks exist)
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

                // Download voucher action
                html += `
                    <span class="label label-sm label-download ms-1" onclick="downloadVoucher(${row.BookingID})" title="Download Voucher" style="cursor:pointer; margin:0 2px; display:inline-block;">
                        <i class="fa fa-download"></i>
                    </span>`;

                // Cancel action
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
        order: [[0, 'desc']], // Default sort by Confirmation Number descending
        language: {
            emptyTable: "No data available in the table."
        },
        createdRow: function (row) {
            $(row).addClass('booking-row-clickable');
        }
    });

    if (!document.getElementById('booking-row-clickable-style')) {
        const style = document.createElement('style');
        style.id = 'booking-row-clickable-style';
        style.textContent = `
            #booking_tbl tbody tr.booking-row-clickable { cursor: pointer; }
            #booking_tbl tbody tr.booking-row-clickable td:last-child { cursor: default; }
        `;
        document.head.appendChild(style);
    }

    function cleanupBookingModalOverlay() {
        if (typeof window.hardClearOrphanedModalBackdrops === 'function') {
            window.hardClearOrphanedModalBackdrops();
            return;
        }
        const openModals = document.querySelectorAll('.modal.show');
        if (!openModals.length) {
            document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
            return;
        }
        const backdrops = Array.from(document.querySelectorAll('.modal-backdrop'));
        while (backdrops.length > openModals.length) {
            backdrops.shift()?.remove();
        }
    }

    // Used by remarks modal (room-menu_data) when calendar_utils is not on this page
    window.cleanupBookingModalOverlay = cleanupBookingModalOverlay;
    window.cleanupModalOverlays = cleanupBookingModalOverlay;
    window.cleanupAfterNestedModalClose = cleanupBookingModalOverlay;

    // Prevent ACTION icons from bubbling into the row-click handler
    $('#booking_tbl tbody').on('click', 'td:last-child', function (e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
    });

    // Also stop on action labels themselves (covers any column-order quirks)
    $('#booking_tbl tbody').on('click', '.label', function (e) {
        e.stopPropagation();
    });

    // Whole row opens the same view as Guest Name, except ACTION column icons
    $('#booking_tbl tbody').on('click', 'tr.booking-row-clickable', function (e) {
        const $target = $(e.target);
        const $cell = $target.closest('td');
        if (!$cell.length) return;

        // Ignore ACTION column (last cell) and its buttons/icons
        if ($cell.is(':last-child')) return;
        if ($target.closest('button, .label, input, select, textarea').length) return;

        // Don't stack another modal while one is already open
        if (document.querySelector('.modal.show')) return;

        // Guest-name link already has its own handler
        if ($target.closest('a[onclick*="openRoomMenuModal"], a[onclick*="openGroupFromAll"]').length) {
            return;
        }

        cleanupBookingModalOverlay();

        const rowData = table.row(this).data();
        if (!rowData || !rowData.BookingID) return;

        if (rowData.GroupBookingId && String(rowData.GroupBookingId) !== '0') {
            if (typeof window.openGroupFromAll === 'function') {
                window.openGroupFromAll(rowData.GroupBookingId);
            }
        } else if (typeof window.openRoomMenuModal === 'function') {
            window.openRoomMenuModal(rowData.BookingID);
        }
    });

    // Clean leftover fade/backdrop after booking-related modals close (incl. Remarks)
    $(document).on(
        'hidden.bs.modal',
        '#modal-voucher-details, #modal-billing, #modal-editbooking, #modal-payment, #modal-status, [id^="remarksModal_"], [id^="editRemarkModal_"]',
        function () {
            setTimeout(cleanupBookingModalOverlay, 50);
        }
    );
    
    // Handle custom tab clicks (Single/Group)
    $('.tab-item').on('click', function(e) {
        e.preventDefault();
        
        // Remove active class from all tabs
        $('.tab-item').removeClass('is-active');
        // Add active class to clicked tab
        $(this).addClass('is-active');
        
        // Get the href attribute
        let href = $(this).attr('href');
        
        // If it's a link to another page, navigate to it
        if (href && href !== '#') {
            window.location.href = href;
        }
    });
    
    // When a tab is shown, update the DataTable's AJAX URL with the right filter
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        // e.target is the newly activated tab
        let href = $(e.target).attr('href');  // e.g. "#today"
        let filter = href.replace('#', '');   // e.g. "today"

        // OPTIONAL: If you want to normalize case (ex: #thisWeek => 'thisweek'):
        filter = filter.toLowerCase();

        // Update the DataTable's AJAX URL
        table.ajax.url(`/booking/booking_data?filter=${filter}&scope=${scope}`).load();
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

    // Handle filter button clicks
    $('.filter-btn').on('click', function() {
        // Remove active class from all filter buttons
        $('.filter-btn').removeClass('active');
        // Add active class to clicked button
        $(this).addClass('active');
        
        
        // Get the filter value
        let filter = $(this).data('filter');
        
        // Update the DataTable's AJAX URL
        table.ajax.url(`/booking/booking_data?filter=${filter}&scope=${scope}`).load();
    });
    
    
    // Handle clear date filter
    $('#clearDateFilter').on('click', function() {
        // Reset to "All" filter
        $('.filter-btn').removeClass('active');
        $('.filter-btn[data-filter="all"]').addClass('active');
        
        // Update the DataTable's AJAX URL
        table.ajax.url(`/booking/booking_data?filter=all&scope=${scope}`).load();
    });
    ;(function(){
        const params      = new URLSearchParams(window.location.search);
        const highlightId = params.get('highlight');
        if (!highlightId) return;

        // 1) pump the search box with your ID & redraw
        table.search(highlightId).draw(false);

        // 2) once the row is on screen, give it a visual cue
        table.on('draw', () => {
            const row = table.row('#' + highlightId).node();
            if (row) $(row).addClass('highlight-checkout');
        });
    })();
    
    // Removed: Status column is no longer clickable

    // Handle form submission for status change
    $('#change_status').submit(function (e) {
        e.preventDefault();

        const status = $('#txtstatus').val();
        const bookingId = $(this).data('booking-id');

        $.ajax({
            url: '/booking/update_status',
            type: 'POST',
            data: { BookingID: bookingId, status: status },
            success: function (response) {
                if (response.success) {
                    $('#booking_tbl').DataTable().ajax.reload();
                    $('#modal-status').modal('hide');
                    Swal.fire({
                        icon: 'success',
                        title: 'Status Updated',
                        text: 'The booking status has been updated successfully.',
                        confirmButtonText: 'OK'
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Failed to Update Status',
                        text: response.error || 'An error occurred while updating the status.',
                        confirmButtonText: 'Try Again'
                    });
                }
            },
            error: function () {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'There was an issue connecting to the server. Please try again later.',
                    confirmButtonText: 'OK'
                });
            }
        });
    });
});

function handleQRCodeScan(qrData) {
    if (!qrData) {
        alert("Invalid QR Code data.");
        return;
    }

    // Debug: Log QR data to verify it's being passed correctly
    console.log('Scanned QR Code:', qrData);

    $.ajax({
        url: `/booking/details/${qrData}`,
        method: 'GET',
        success: function (response) {
            if (response.success) {
                const booking = response.data;

                // Debug: Log response to check if booking data is retrieved
                console.log('Booking Data:', booking);

                $('#bookingDetailsContainer').html(`
                <h2>Booking Details</h2>
                <p><strong>Guest Name:</strong> ${booking.CustomerName}</p>
                <p><strong>Room Number:</strong> ${booking.RoomNumber}</p>
                <p><strong>Check-In Date:</strong> ${moment(booking.CheckInDate).format('MMM DD, YYYY')}</p>
                <p><strong>Check-Out Date:</strong> ${moment(booking.CheckOutDate).format('MMM DD, YYYY')}</p>
                <p><strong>Total Cost:</strong> ₱${parseFloat(booking.TotalCost).toFixed(2)}</p>
                <p><strong>Payment Status:</strong> ${booking.PaymentStatus}</p>
                <p><strong>Booking Status:</strong> ${booking.BookingStatus}</p>
                <p><strong>Remarks:</strong> ${booking.Remarks || 'None'}</p>
                <h3>QR Code</h3>
                <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(booking.ConfirmationNumber)}&size=150x150" alt="QR Code" />
            `);
            } else {
                alert(response.message || "Failed to retrieve booking details.");
            }
        },
        error: function (xhr, status, error) {
            console.error("Error fetching booking details:", error);
            alert("Error fetching booking details. Please try again.");
        }
    });
}

// Function to generate status label with modal trigger
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



// OPEN CANCEL BOOKING MODAL
function openCancelBookingModal(bookingId) {
    $('#cancelBookingId').val(bookingId);
    $('#cancelReason').val('');
    $('#manualRefund').val('');
    $('#manualCancellationFee').val('');
    
    // Fetch billing details to show in modal
    $.ajax({
        url: `/booking/get-billing/${bookingId}?_=${Date.now()}`,
        method: 'GET',
        cache: false,
        success: async function (data) {
            // Get payments to calculate paid amount
            const paymentsResponse = await fetch(`/payments/get-payments/${bookingId}?_=${Date.now()}`);
            const paymentsData = await paymentsResponse.json();
            const paymentsArray = (paymentsData && paymentsData.data) ? paymentsData.data : (Array.isArray(paymentsData) ? paymentsData : []);
            
            const totalPaymentsMade = paymentsArray.reduce((sum, payment) => {
                if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount' || payment.PAYMENT_TYPE === 'security_deposit') {
                    return sum;
                }
                return sum + parseFloat(payment.AMOUNT_PAID || 0);
            }, 0);
            
            const effectiveSubTotal = Number.isFinite(parseFloat(data.effectiveSubTotal))
                ? parseFloat(data.effectiveSubTotal)
                : parseFloat(data.subTotal || 0);
            const reservationFee = parseFloat(data.reservationFee || 0);
            const discountAmount = parseFloat(data.discountAmount || 0);
            
            const totalAmount = effectiveSubTotal - reservationFee - discountAmount;
            const balance = Math.max(0, totalAmount - totalPaymentsMade);
            const maxRefund = totalPaymentsMade; // Maximum refund is what was paid
            
            // Display booking details
            $('#cancelTotalAmount').text('₱' + totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#cancelPaidAmount').text('₱' + totalPaymentsMade.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#cancelBalance').text('₱' + balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#cancelMaxRefund').text('₱' + maxRefund.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            
            // Set max attributes on both inputs
            // Refundable amount: max is what was paid (can't refund more than paid)
            const maxRefundable = maxRefund;
            $('#manualRefund').attr('max', maxRefundable);
            
            // Cancellation fee: max depends on payment status
            // If nothing paid, can set up to totalAmount; if paid, max is paid amount
            const maxCancellationFee = maxRefund === 0 ? totalAmount : maxRefund;
            $('#manualCancellationFee').attr('max', maxCancellationFee);
            
            // Store values in data attributes for easy access
            $('#manualRefund').data('max-refund', maxRefund);
            $('#manualRefund').data('paid-amount', maxRefund); // Store paid amount for calculation
            $('#manualRefund').data('total-amount', totalAmount);
            $('#manualCancellationFee').data('paid-amount', maxRefund); // Store paid amount for calculation
            $('#manualCancellationFee').data('total-amount', totalAmount); // Store total amount for when nothing paid
            $('#manualCancellationFee').data('max-refund', maxRefund); // Store for validation
            
            // If nothing was paid, set default values and show note
            if (maxRefund === 0) {
                $('#manualRefund').val('0.00');
                $('#manualRefund').prop('readonly', true); // Lock refund at 0
                $('#manualCancellationFee').val(totalAmount.toFixed(2)); // Default to full amount
                $('#refundHelpText').text('No payment made - refund is locked at ₱0.00.');
                $('#feeHelpText').text('Set the cancellation penalty (can be less than total amount).');
                $('#noPaymentNote').show();
            } else {
                $('#manualRefund').prop('readonly', false);
                $('#refundHelpText').text('Enter the amount to refund.');
                $('#feeHelpText').text('Enter the cancellation penalty.');
                $('#noPaymentNote').hide();
            }
            
            $('#cancelBookingDetails').show();
            
            // Add event listeners for mutual calculation
            let isUpdating = false; // Prevent infinite loop
            
            // When refund amount changes, calculate cancellation fee
            $('#manualRefund').off('input change').on('input change', function() {
                if (isUpdating) return;
                isUpdating = true;
                let refundAmount = parseFloat($(this).val()) || 0;
                const maxRefundable = parseFloat($(this).attr('max')) || 0;
                const paidAmount = parseFloat($(this).data('paid-amount')) || 0;
                
                // Enforce max limit (can't refund more than what was paid)
                if (refundAmount > maxRefundable) {
                    refundAmount = maxRefundable;
                    $(this).val(refundAmount.toFixed(2));
                }
                
                // Calculate cancellation fee: paidAmount - refundAmount
                const cancellationFee = Math.max(0, paidAmount - refundAmount);
                $('#manualCancellationFee').val(cancellationFee.toFixed(2));
                isUpdating = false;
            });
            
            // When cancellation fee changes, calculate refund amount
            $('#manualCancellationFee').off('input change').on('input change', function() {
                if (isUpdating) return;
                isUpdating = true;
                let cancellationFee = parseFloat($(this).val()) || 0;
                const maxCancellationFee = parseFloat($(this).attr('max')) || 0;
                const paidAmount = parseFloat($(this).data('paid-amount')) || 0;
                const maxRefund = parseFloat($(this).data('max-refund')) || 0;
                
                // Enforce max limit
                if (cancellationFee > maxCancellationFee) {
                    cancellationFee = maxCancellationFee;
                    $(this).val(cancellationFee.toFixed(2));
                }
                
                // Calculate refund: paidAmount - cancellationFee
                // But refund cannot exceed what was actually paid
                let refundAmount = Math.max(0, paidAmount - cancellationFee);
                
                // If nothing was paid (maxRefund = 0), refund must stay at 0
                // In this case, fee can be set independently (up to totalAmount)
                if (maxRefund === 0) {
                    refundAmount = 0;
                    $('#manualRefund').val('0.00');
                } else {
                    // If something was paid, cap refund at maxRefund
                    if (refundAmount > maxRefund) {
                        refundAmount = maxRefund;
                        // Adjust fee to maintain: refund + fee = paidAmount
                        cancellationFee = paidAmount - refundAmount;
                        $(this).val(cancellationFee.toFixed(2));
                    }
                    $('#manualRefund').val(refundAmount.toFixed(2));
                }
                
                isUpdating = false;
            });
        },
        error: function (err) {
            console.error('Failed to fetch billing data:', err);
            // Still show modal even if billing fetch fails
            $('#cancelBookingDetails').hide();
        }
    });
    
    $('#modal-cancel-booking').modal('show');
}

// Function to fetch and display booking details based on the scanned confirmation number
function fetchBookingDetails(confirmationNumber) {
    $.ajax({
        url: `/booking/details/${confirmationNumber}`,
        method: 'GET',
        success: function (data) {
            // Handle success, display booking details in a modal or section
            $('#bookingModal .customer-name').text(data.CustomerName);
            $('#bookingModal .room-number').text(data.RoomID);
            $('#bookingModal .check-in').text(data.CHECK_IN_DATE);
            $('#bookingModal .check-out').text(data.CHECK_OUT_DATE);
            $('#bookingModal .payment-status').text(data.PAYMENT_STATUS);
            // Add other fields as needed
            $('#bookingModal').modal('show');
        },
        error: function () {
            alert('Booking not found.');
        }
    });
}

function bookingDetails(bookingID) {
    // Find the input element and set its value
    const bookingInput = document.getElementById('bookingID');
    if (bookingInput) {
        bookingInput.value = bookingID;
    } else {
        console.error('BookingID input not found!');
    }
}

// Function to download voucher
function downloadVoucher(bookingID) {
    // Show loading indicator
    Swal.fire({
        title: 'Generating Voucher...',
        text: 'Please wait while we prepare your voucher.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Create a form to trigger voucher download (same method as auto-download)
    const form = $('<form>', {
        method: 'POST',
        action: '/booking/generate-voucher?download=1',
        target: '_self'
    });
    
    // Add booking data to form
    form.append($('<input>', {
        type: 'hidden',
        name: 'bookingId',
        value: bookingID
    }));
    
    // Submit the form to trigger download
    $('body').append(form);
    form.submit();
    
    // Remove form and show success after a delay
    setTimeout(() => {
        form.remove();
        Swal.fire({
            icon: 'success',
            title: 'PDF Voucher Downloaded!',
            text: 'Your voucher has been downloaded as PDF automatically.',
            confirmButtonText: 'OK'
        });
    }, 1500);
}

// Function to show voucher details modal
function showVoucherDetails(bookingID) {
    // Fetch voucher data
    $.ajax({
        url: `/booking/get-voucher-data/${bookingID}`,
        method: 'GET',
        success: function (response) {
            if (response.success) {
                const data = response.data;
                
                // Populate modal fields
                document.getElementById('voucher-guest-name').textContent = data.fullname || 'N/A';
                
                // Calculate reservation date (today's date)
                const today = new Date();
                const reservationDate = today.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                document.getElementById('voucher-reservation-date').textContent = reservationDate;
                
                // Format dates properly
                const formatDate = (dateString) => {
                    if (!dateString) return 'N/A';
                    const date = new Date(dateString);
                    return new Intl.DateTimeFormat('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC'
                    }).format(date);
                };
                
                document.getElementById('voucher-checkin').textContent = formatDate(data.dateFrom);
                document.getElementById('voucher-checkout').textContent = formatDate(data.dateTo);
                
                // Set check-in status
                const checkInStatus = data.checkInStatus;
                const checkInStatusText = checkInStatus === 1 ? 'Regular Check-in' : 'Late Check-in';
                document.getElementById('voucher-checkin-status').textContent = checkInStatusText;
                
                // Set check-out status
                const checkOutStatus = data.checkOutStatus;
                const checkOutStatusText = checkOutStatus === 1 ? 'Late Check-out' : 'Regular Check-out';
                document.getElementById('voucher-checkout-status').textContent = checkOutStatusText;
                
                // Calculate length of stay
                if (data.dateFrom && data.dateTo) {
                    const checkIn = new Date(data.dateFrom);
                    const checkOut = new Date(data.dateTo);
                    const diffTime = Math.abs(checkOut - checkIn);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const nights = diffDays === 1 ? '1 NIGHT' : `${diffDays} NIGHTS`;
                    document.getElementById('voucher-length-stay').textContent = nights;
                } else {
                    document.getElementById('voucher-length-stay').textContent = 'N/A';
                }
                
                // Room type with room number if available
                let roomTypeText = data.roomType || 'Unassigned Room';
                if (data.roomNumber && data.roomNumber !== 'Unassigned Room') {
                    roomTypeText = `${data.roomNumber} - (${data.roomType})`;
                } else {
                    roomTypeText = 'Unassigned Room - (Unassigned Room)';
                }
                document.getElementById('voucher-room-type').textContent = roomTypeText;
                
                document.getElementById('voucher-remarks').textContent = data.remarks || 'Room Accommodation';
                
                // Reservation fee (from billing data) - only show if > 0
                const reservationFee = parseFloat(data.reservationFee || 0);
                const reservationFeeRow = document.getElementById('reservation-fee-row');
                
                if (reservationFee > 0) {
                    document.getElementById('voucher-reservation-fee').textContent = `PHP ${reservationFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    reservationFeeRow.style.display = 'table-row';
                } else {
                    reservationFeeRow.style.display = 'none';
                }
                
                // Discount amount (from billing data) - only show if > 0
                const discountAmount = parseFloat(data.discount || 0);
                const discountAmountRow = document.getElementById('discount-amount-row');
                
                if (discountAmount > 0) {
                    document.getElementById('voucher-discount-amount').textContent = `PHP ${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    discountAmountRow.style.display = 'table-row';
                } else {
                    discountAmountRow.style.display = 'none';
                }
                
                // Helpers for consistent numeric parsing/formatting
                const parseAmount = (value) => {
                    const parsed = parseFloat(value);
                    return isNaN(parsed) ? 0 : parsed;
                };
                const formatCurrency = (value) => `PHP ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                
                // Calculate totals
                const grossTotal = Math.max(0, parseAmount(data.total));
                const normalizedDiscountAmount = Math.max(0, discountAmount);
                const paidAmountRaw = parseAmount(data.paidAmount);
                
                // Net due should exclude discounts (already shown separately)
                const netDueAmount = Math.max(0, grossTotal - normalizedDiscountAmount);
                // Paid amount from API includes discounts as negative values, add them back for display
                const paidAmountDisplay = Math.max(0, paidAmountRaw + normalizedDiscountAmount);
                const balance = Math.max(0, netDueAmount - paidAmountDisplay);
                
                // Display totals
                document.getElementById('voucher-total-amount').textContent = formatCurrency(grossTotal);
                document.getElementById('voucher-paid-amount').textContent = formatCurrency(paidAmountDisplay);
                document.getElementById('voucher-balance').textContent = formatCurrency(balance);
                
                // Store booking ID for download function
                document.getElementById('modal-voucher-details').setAttribute('data-booking-id', bookingID);
                
                // Clear orphaned backdrops before opening (Remarks can leave a high z-index fade)
                document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
                document.body.style.removeProperty('overflow');

                const voucherEl = document.getElementById('modal-voucher-details');
                if (!voucherEl) return;

                // Keep voucher above any leftover nested-stack backdrop CSS
                voucherEl.style.zIndex = '1060';

                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    const existing = bootstrap.Modal.getInstance(voucherEl);
                    if (existing) existing.dispose();
                    const voucherModal = bootstrap.Modal.getOrCreateInstance(voucherEl, {
                        backdrop: true,
                        keyboard: true
                    });
                    voucherModal.show();
                } else {
                    $('#modal-voucher-details').modal('show');
                }
                
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: response.message || 'Failed to fetch voucher details.',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function (xhr, status, error) {
            console.error('Error fetching voucher details:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'There was an issue fetching the voucher details. Please try again.',
                confirmButtonText: 'OK'
            });
        }
    });
}

// Function to download voucher from modal
function downloadVoucherFromModal() {
    const modal = document.getElementById('modal-voucher-details');
    const bookingID = modal.getAttribute('data-booking-id');
    
    if (bookingID) {
        // Close modal first
        $('#modal-voucher-details').modal('hide');
        
        // Trigger download
        downloadVoucher(bookingID);
    }
}

function showBilling(bookingID) {
    if (window.showBilling) return window.showBilling(bookingID);
    console.error('Global showBilling is not available');
}