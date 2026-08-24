// View Guest Modal Functions
let currentGuestId = null;
let currentBookings = null;
let bookingDataTable = null;



// Initialize view guest functionality
function initializeViewGuest() {
    PMSCore.debugLog('View Guest functionality initialized');
}

// View guest details function
function viewGuestDetails(guestId) {
    currentGuestId = guestId;
    
    // Show the modal and initialize DataTable
    $('#viewGuestModal').modal('show');
    initializeBookingDataTable();
    
    // Initialize MDL components when modal is shown
    setTimeout(() => {
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
        // Also try to initialize with original handler if available
        if (window.originalComponentHandler) {
            window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
    }, 200);
    
    // Fetch guest details and booking data
    fetchGuestDetails(guestId);
    fetchGuestBookings(guestId);
}

// Expose function globally for compatibility
window.viewGuestDetailsFromNewFile = viewGuestDetails;

// Initialize booking DataTable
function initializeBookingDataTable() {
    if ($.fn.DataTable.isDataTable('#bookingTable')) {
        $('#bookingTable').DataTable().destroy();
    }

    bookingDataTable = $("#bookingTable").DataTable({
        columnDefs: [
            { targets: [1, 2, 3, 4, 5, 6, 7], className: "text-center" },
            { targets: [8], className: "text-center", orderable: false, searchable: false }
        ],
        pageLength: 10,
        lengthMenu: [[10, 15, 20], [10, 15, 20]],
        autoWidth: false,
        responsive: true,
        order: [[0, 'asc']], // Sort by guest name by default
        deferRender: true, // Optimize for large datasets
        processing: true, // Show processing indicator
        searching: true,
        ordering: true,
        language: {
            "search": "Search:"
        }
    });
}



// Fetch guest booking data from API
function fetchGuestBookings(guestId) {
    PMSCore.debugLog(`Fetching bookings for guest ID: ${guestId}`);
    
    $.ajax({
        url: `/guest/api/guests/${guestId}/bookings`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            try {
                PMSCore.validateResponse(response);
                populateBookingTable(response.data);
                PMSCore.debugLog(`Loaded ${response.data.length} bookings`);
            } catch (error) {
                PMSCore.handleError(error, 'fetchGuestBookings');
                showTableMessage('Failed to load booking data', 'error');
            }
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'fetchGuestBookings AJAX');
            showTableMessage('Failed to connect to server', 'error');
        }
    });
}

// Populate booking table with data
function populateBookingTable(bookings) {
    currentBookings = bookings;
    
    if (bookingDataTable) {
        bookingDataTable.clear();
        
        if (bookings && bookings.length > 0) {
            bookings.forEach(function(booking) {
                bookingDataTable.row.add([
                    booking.ROOM_NUMBER || 'N/A',
                    booking.CONFIRMATION_NUMBER || 'N/A',
                    formatDate(booking.CHECK_IN_DATE) || 'N/A',
                    formatDate(booking.CHECK_OUT_DATE) || 'N/A',
                    '₱' + formatCurrency(booking.TOTAL_ROOM_COST) || '₱0.00',
                    booking.BOOKING_CHANNEL || 'N/A',
                    `<span class="badge badge-${getPaymentStatusBadge(booking.PAYMENT_STATUS)}">
                        ${booking.PAYMENT_STATUS || 'Unknown'}
                    </span>`,
                    `<span class="badge badge-${getBookingStatusBadge(booking.BOOKING_STATUS)}">
                        ${booking.BOOKING_STATUS || 'Unknown'}
                    </span>`,
                    `<button type="button" class="btn btn-tbl-view btn-xs" onclick="viewBookingDetails('${booking.BookingID}')" title="View Details">
                        <i class="fa fa-eye"></i>
                    </button>`
                ]);
            });
        }
        bookingDataTable.draw();
    }
}

// Unified function to show table messages (loading, error, empty)
function showTableMessage(message, type = 'info') {
    if (bookingDataTable) {
        bookingDataTable.clear();
        bookingDataTable.draw();
    }
}

// Get badge class based on payment status
function getPaymentStatusBadge(status) {
    const statusMap = {
        'paid': 'success',
        'unpaid': 'danger',
        'partial_paid': 'warning',
        'pending': 'warning',
        'cancelled': 'danger',
        'refunded': 'info',
        'overdue': 'danger'
    };
    return statusMap[status?.toLowerCase()] || 'secondary';
}

// Get badge class based on booking status
function getBookingStatusBadge(status) {
    const statusMap = {
        'pending': 'warning',
        'check-in': 'info',
        'check-out': 'secondary',
        'cancelled': 'danger'
    };
    return statusMap[status?.toLowerCase()] || 'secondary';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format currency
function formatCurrency(amount) {
    if (!amount) return '0.00';
    return parseFloat(amount).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// View booking details
function viewBookingDetails(bookingId) {
    const booking = currentBookings?.find(b => b.BookingID == bookingId);
    
    if (!booking) {
        alert(`Booking ID: ${bookingId} not found`);
        return;
    }
    
    // Populate billing modal with booking data
    populateBookingDetailsModal(booking);
    
    // Show the billing modal
    $('#modal-booking-details').modal('show');
}

// Populate booking details modal
function populateBookingDetailsModal(booking) {
    // Set modal title and booking ID
    $('#bookingDetailsId').text(booking.BookingID);
    $('#confNumber').text(booking.CONFIRMATION_NUMBER || 'N/A');
    $('#hiddenBookingId').val(booking.BookingID);
    
    // Set customer information
    $('#customerName').text(booking.CustomerName || 'N/A');
    $('#customerAddress').text('Hotel Guest');
    $('#bookingDate').text(formatDate(booking.CHECK_IN_DATE) || 'N/A');
    
    // Set payment status image
    const paymentStatus = booking.PAYMENT_STATUS?.toLowerCase();
    const statusImage = paymentStatus === 'paid' ? '/img/paid.png' : '/img/unpaid.png';
    $('#paymentStatusImage').attr('src', statusImage);
    
    // Populate table body
    const tableBody = $('#bookingDetailsTableBody');
    tableBody.empty();
    
    // Calculate balance
    const totalCost = parseFloat(booking.TOTAL_ROOM_COST) || 0;
    const totalPaid = parseFloat(booking.TOTAL_PAID) || 0;
    const balance = totalCost - totalPaid;
    
    // Add room booking row
    const roomRow = `
        <tr>
            <td class="text-center">1</td>
            <td class="text-center">${formatDate(booking.CHECK_IN_DATE) || 'N/A'}</td>
            <td class="text-center">Room ${booking.ROOM_NUMBER} - ${booking.ROOM_TYPE || 'Standard'}</td>
            <td class="text-center">₱${formatCurrency(booking.ROOM_RATE) || '0.00'}</td>
            <td class="text-center">${booking.TOTAL_DAYS || '0'} days</td>
            <td class="text-right">₱${formatCurrency(booking.ROOM_COST) || '0.00'}</td>
        </tr>
    `;
    tableBody.append(roomRow);
    
    // Add extension if any
    if (booking.EXTENDED_DAYS > 0) {
        const extensionCost = parseFloat(booking.TOTAL_ROOM_COST) - parseFloat(booking.ROOM_COST);
        if (extensionCost > 0) {
            const extensionRow = `
                <tr>
                    <td class="text-center">2</td>
                    <td class="text-center">${formatDate(booking.CHECK_OUT_DATE) || 'N/A'}</td>
                    <td class="text-center">Room Extension</td>
                    <td class="text-center">₱${formatCurrency(booking.ROOM_RATE) || '0.00'}</td>
                    <td class="text-center">${booking.EXTENDED_DAYS || '0'} days</td>
                    <td class="text-right">₱${formatCurrency(extensionCost) || '0.00'}</td>
                </tr>
            `;
            tableBody.append(extensionRow);
        }
    }
    
    // Set totals
    $('#totalPayment').text('₱' + formatCurrency(totalCost));
    $('#totalPaid').text('₱' + formatCurrency(totalPaid));
    $('#balanceAmount').text('₱' + formatCurrency(balance));
}

// Print booking details function
function printBookingDiv(divId) {
    const printContents = document.getElementById(divId);
    const originalContents = document.body.innerHTML;

    // Hide buttons before printing
    const buttons = printContents.querySelectorAll('button');
    buttons.forEach(button => button.style.display = 'none');

    // Add a "Thank You" message temporarily
    const thankYouMessage = document.createElement('p');
    thankYouMessage.textContent = "Thank you for choosing Main Stay Hotel. We look forward to welcoming you again!";
    thankYouMessage.style.textAlign = "center";
    thankYouMessage.style.fontSize = "16px";
    thankYouMessage.style.fontWeight = "bold";
    thankYouMessage.style.marginTop = "20px";
    printContents.appendChild(thankYouMessage);

    // Print the modified content
    document.body.innerHTML = printContents.innerHTML;
    window.print();

    // Restore original content after printing
    document.body.innerHTML = originalContents;
    location.reload(); // Reload page to restore modal functionality
}

// Fetch guest details
function fetchGuestDetails(guestId) {
    PMSCore.debugLog(`Fetching guest details for ID: ${guestId}`);
    
    $.ajax({
        url: `/guest/api/guests/${guestId}`,
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            try {
                PMSCore.validateResponse(response);
                populateCustomerDetails(response.data);
                PMSCore.debugLog('Guest details loaded successfully');
            } catch (error) {
                PMSCore.handleError(error, 'fetchGuestDetails');
            }
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'fetchGuestDetails AJAX');
        }
    });
}

// Populate customer details in modal
function populateCustomerDetails(guest) {
    // Label constants
    const typeLabels = {'1': 'Golf', '2': 'Group', '3': 'Casino', '4': 'Learning', '5': 'Relaxing', '6': 'Entertainment', '7': 'Investment'};
    const levelLabels = {'1': 'VIP', '2': 'Regular', '3': 'New Guest'};
    
    // Format phone number
    const formatPhoneNumber = (phone) => {
        if (!phone || phone === 'N/A') return 'N/A';
        const raw = phone.toString().trim();
        const channelMatch = raw.match(/^(KakaoTalk|Viber|Telegram|Phone)\s*:\s*(.*)$/i);
        const channel = channelMatch ? channelMatch[1] : null;
        const numberPart = channelMatch ? channelMatch[2] : raw;
        const cleaned = numberPart.replace(/\D/g, '');
        let formatted = numberPart;
        if (cleaned.length === 11) {
            formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
        } else if (cleaned.length === 10) {
            formatted = `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        if (channel && channel.toLowerCase() !== 'phone') {
            return `${channel}: ${formatted}`;
        }
        return formatted;
    };
    
    // Populate customer details
    $('#modalCustomerName').val(guest.NAME || 'N/A');
    $('#modalCustomerPhone').val(formatPhoneNumber(guest.CONTACTNo));
    $('#modalCustomerType').val(typeLabels[guest.TYPE] || 'Unknown');
    $('#modalCustomerLevel').val(levelLabels[guest.LEVEL] || 'Unknown');
    
    // Initialize MDL components after populating data
    setTimeout(() => {
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
        // Also try to initialize with original handler if available
        if (window.originalComponentHandler) {
            window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
        
        // Force update the floating labels
        const textfields = document.querySelectorAll('.mdl-textfield');
        textfields.forEach(function(textfield) {
            const input = textfield.querySelector('.mdl-textfield__input');
            if (input && input.value) {
                textfield.classList.add('is-dirty');
                // Remove is-focused to prevent green underline by default
                textfield.classList.remove('is-focused');
            }
        });
    }, 100);
}

// Initialize when document is ready
$(document).ready(function() {
    initializeViewGuest();
    
    // Handle modal close with cleanup
    $('#viewGuestModal').on('hidden.bs.modal', function() {
        currentGuestId = null;
        currentBookings = null;
        if (bookingDataTable) {
            bookingDataTable.destroy();
            bookingDataTable = null;
        }
    });
    
    // Handle close button clicks
    $('#viewGuestModal [data-dismiss="modal"]').on('click', function() {
        $('#viewGuestModal').modal('hide');
    });
    
    // Handle booking details modal close
    $('#modal-booking-details').on('hidden.bs.modal', function() {
        // Reset modal content
        $('#bookingDetailsTableBody').empty();
    });
    
    // Handle generate invoice button
    $('#generateBookingInvoiceBtn').on('click', function() {
        const bookingId = $('#hiddenBookingId').val();
        
        if (!bookingId) {
            alert("Missing Booking ID!");
            return;
        }
        
        const url = `/booking/generate-invoice/${bookingId}`;
        window.open(url, '_blank');
    });
}); 