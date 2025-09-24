$(document).ready(function () {
    let table = $('#booking_tbl').DataTable({
        rowId: 'BookingID',
        processing: true,
        serverSide: true,
        pageLength: 15,
        lengthMenu: [[10, 15, 25, 50, 100], [10, 15, 25, 50, 100]],
        ajax: {
            url: '/booking/booking_data?filter=all',
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
                        // CustomerName: `<a href="#" data-bs-toggle="modal" data-bs-target="#modal-booking-details" onclick="bookingDetails(${item.BookingID})">${item.NAME}</a>`, // Clickable link
                        CustomerName: item.NAME,
                        RoomID: item.ROOM_NUMBER,
                        CONFIRMATION: item.CONFIRMATION_NUMBER,
                        Checkin: formatDate(item.CHECK_IN_DATE),
                        Checkout: `<button class="btn-checkout" data-booking-id="${item.BookingID}" style="background-color: transparent; padding: 0 !important; margin: 0 !important; font-family: Poppins, sans-serif; font-size: 13px; font-weight: 400; line-height: 1.7; color: #fff; border: none; box-shadow: none; outline: none; cursor: pointer;">
                                        ${formatDate(item.CHECK_OUT_DATE)}
                                    </button>`, // Custom button
                        Totalcost: item.TOTAL_COST,
                        Paymentstatus: item.PAYMENT_STATUS,
                        BookingChannel: item.BOOKING_CHANNEL,
                        Status: getStatusLabel(item.BookingStatus, item.BookingID), // Status label
                        BookingStatus: item.BookingStatus,
                        BookingRemarks: item.BookingRemarks || '',
                        RemarksCount: item.RemarksCount || 0
                    };
                });
            },
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
                    // Render the clickable link as-is
                    return data;
                }
            },
            { data: 'RoomID', title: 'ROOM NUMBER' },
            { data: 'CONFIRMATION', title: 'CONFIRMATION NUMBER' },
            { data: 'Checkin', title: 'CHECK IN' },
            {
                data: 'Checkout',
                title: 'CHECK OUT',
                render: function (data, type, row) {
                    // Render the custom HTML button for checkout
                    return data;
                }
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
            { data: 'BookingChannel', title: 'BOOKING CHANNEL' },
            {
                data: 'Paymentstatus',
                title: 'PAYMENT STATUS',
                render: function (data) {
                    const paymentStatus = data.toLowerCase().trim();
                    const labelClass = paymentStatus === 'paid' ? 'label-success' : 'label-danger';
                    return `<span class="label label-sm ${labelClass}">${data}</span>`;
                }
            },
            {
                data: 'Status',
                title: 'BOOKING STATUS',
                visible: false, // This hides the column
                render: function (data, type, row) {
                    // Render the custom status label
                    return data;
                }
            },
            {
               render: function (data, type, row) {
                    const paymentStatus = row.Paymentstatus.toLowerCase();
                    const bookingStatus = row.BookingStatus?.toLowerCase(); // safe check

                    const buttonText = paymentStatus === 'paid' ? 'BILLING' : 'BILLING';
                    const buttonClass = paymentStatus === 'paid' ? 'btn-primary' : 'btn-primary';

                    let html = `<button class="btn btn-tbl-view btn-xs ${buttonClass}" onclick="showBilling(${row.BookingID})" title="Billing"><i class="fas fa-file-invoice"></i></button>`;
                    
                    // Add Remarks button only if there are remarks
                    if ((row.BookingRemarks && row.BookingRemarks.trim() !== '') || (row.RemarksCount && row.RemarksCount > 0)) {
                        html += `<button class="btn btn-tbl-edit btn-xs" onclick="openRemarksModal(${row.BookingID})" title="Remarks"><i class="fas fa-comment-dots"></i></button>`;
                    }

                    if (bookingStatus === 'pending') {
                        html += `
                            <button class="btn btn-tbl-delete btn-xs" onclick="openCancelBookingModal(${row.BookingID})" title="Cancel Booking">
                                <i class="fa fa-cancel"></i>
                            </button>`;
                    } else if (bookingStatus === 'cancelled') {
                        html += `
                            <button class="btn btn-sm btn-danger ms-1" disabled>
                                Cancelled
                            </button>`;
                    }

                    return html;
                }
            }
        ],
        columnDefs: [
            { targets: [8, 9, 10 , 11 ], className: "text-center" },
            { targets: [11], width: '10%', orderable: false, searchable: false }
        ],
        order: [[9, 'desc']], // Default sort by Confirmation Number descending
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
    
    // Handle filter button clicks
    $('.filter-btn').on('click', function() {
        // Remove active class from all filter buttons
        $('.filter-btn').removeClass('active');
        // Add active class to clicked button
        $(this).addClass('active');
        
        // Get the filter value
        let filter = $(this).data('filter');
        
        // Update the DataTable's AJAX URL
        table.ajax.url(`/booking/booking_data?filter=${filter}`).load();
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

function showBilling(bookingID) {
    if (window.showBilling) return window.showBilling(bookingID);
    console.error('Global showBilling is not available');
}