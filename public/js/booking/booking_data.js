$(document).ready(function () {
    // Determine scope based on current path: single pages exclude grouped bookings; 'all' includes everything
    const isAllPage = window.location.pathname.endsWith('/booking/all');
    const scope = isAllPage ? 'all' : 'single';

    let table = $('#booking_tbl').DataTable({
        rowId: 'BookingID',
        processing: true,
        serverSide: false,
        ajax: {
            url: `/booking/booking_data?filter=all&scope=${scope}`,
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
                        BookingChannel: item.BOOKING_CHANNEL,
                        Status: getStatusLabel(item.BookingStatus, item.BookingID), // Status label
                        BookingStatus: item.BookingStatus,
                        IsDirectReservation: item.IS_DIRECT_RESERVATION,
                        BookingRemarks: item.BookingRemarks || '',
                        RemarksCount: item.RemarksCount || 0
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
            { targets: 12, width: '120px', className: 'text-center' }  // Action
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
                        return `<a href="#" onclick="openGroupFromAll(${row.GroupBookingId})" style="color: #337ab7; text-decoration: none; cursor: pointer;">${data}</a>`;
                    }
                    // Otherwise show voucher details for single booking
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
            {
                data: 'Checkout',
                title: 'CHECK OUT',
            },
            {
                data: 'Totalcost',
                title: 'TOTAL PAYMENT',
                render: function (data) {
                    // Format the total cost as currency
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
                    // Format the balance as currency
                    const balance = parseFloat(data) || 0;
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
            { data: 'BookingChannel', title: 'BOOKING CHANNEL' },
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
                    
                    // Calculate actual payment status based on balance
                    const balance = parseFloat(row.Balance) || 0;
                    const totalCost = parseFloat(row.Totalcost) || 0;
                    let labelClass, displayText;
                    
                    if (balance <= 0) {
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
                className: 'text-center',
                render: function (data, type, row) {
                const paymentStatus = row.Paymentstatus.toLowerCase();
                const bookingStatus = row.BookingStatus?.toLowerCase(); // safe check

                const isDirect = String(row.IsDirectReservation) === '1';

                let html = `<div style="text-align: center;">`;

                // Billing action
                if (isDirect) {
                    html += `
                        <span class="label label-sm label-default" title="Disabled for Direct Reservation" style="opacity:.6; cursor:not-allowed; margin:0 2px; display:inline-block;">
                            <i class="fa fa-credit-card"></i>
                        </span>`;
                } else {
                    html += `
                        <span class="label label-sm label-billing" onclick="showBilling(${row.BookingID})" title="Billing" style="cursor:pointer; margin:0 2px; display:inline-block;">
                            <i class="fa fa-credit-card"></i>
                        </span>`;
                }

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
        }
    });
    
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
    
    // Attach click event to set BookingID in modal for status change
    $('#booking_tbl').on('click', 'span[data-bs-toggle="modal"]', function () {
        const bookingId = $(this).data('booking-id');
        $('#change_status').data('booking-id', bookingId);
    });

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
    <span class="label label-sm ${labelClass}" data-bs-toggle="modal" data-bs-target="#modal-status" data-booking-id="${bookingId}">
        ${labelText}
    </span>
    `;
}



// OPEN CANCEL BOOKING MODAL
function openCancelBookingModal(bookingId) {
    $('#cancelBookingId').val(bookingId);
    $('#cancelReason').val('');
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
                const reservationFee = data.reservationFee || 0;
                const reservationFeeRow = document.getElementById('reservation-fee-row');
                
                if (parseFloat(reservationFee) > 0) {
                    document.getElementById('voucher-reservation-fee').textContent = `PHP ${parseFloat(reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    reservationFeeRow.style.display = 'table-row';
                } else {
                    reservationFeeRow.style.display = 'none';
                }
                
                // Discount amount (from billing data) - only show if > 0
                const discountAmount = data.discount || 0;
                const discountAmountRow = document.getElementById('discount-amount-row');
                
                if (parseFloat(discountAmount) > 0) {
                    document.getElementById('voucher-discount-amount').textContent = `PHP ${parseFloat(discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    discountAmountRow.style.display = 'table-row';
                } else {
                    discountAmountRow.style.display = 'none';
                }
                
                // Calculate TOTAL AMOUNT (subTotal + reservationFee - discount)
                const subTotal = parseFloat(data.total || 0);
                const totalAmount = subTotal + parseFloat(reservationFee) - parseFloat(discountAmount);
                
                // Get PAID AMOUNT (from API response)
                const paidAmount = parseFloat(data.paidAmount || 0);
                
                // Calculate BALANCE
                const balance = totalAmount - paidAmount;
                
                // Display TOTAL AMOUNT
                document.getElementById('voucher-total-amount').textContent = `PHP ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                
                // Display PAID AMOUNT
                document.getElementById('voucher-paid-amount').textContent = `PHP ${paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                
                // Display BALANCE
                document.getElementById('voucher-balance').textContent = `PHP ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                
                // Store booking ID for download function
                document.getElementById('modal-voucher-details').setAttribute('data-booking-id', bookingID);
                
                // Show modal
                $('#modal-voucher-details').modal('show');
                
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