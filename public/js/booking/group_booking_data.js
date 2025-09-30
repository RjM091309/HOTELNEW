$(document).ready(function () {
    let groupTable = $('#group_booking_tbl').DataTable({
        ajax: {
            url: '/booking/group_booking_data?filter=all',
            type: 'GET',
            dataSrc: function (json) {
                return json.map(item => {
                    return {
                        GroupID: item.group_id,
                        GroupName: item.GROUP_NAME,
                        ContactNo: item.CONTACT_NO,
                        NumberOfRooms: item.NUMBER_OF_ROOMS,
                        RoomNumbers: item.room_numbers || 'N/A',
                        TotalBookings: item.total_bookings,
                        Channel: item.BOOKING_CHANNEL,
                        Status: item.STATUS_OVERVIEW,
                        TotalPayment: item.TOTAL_PAYMENT
                    };
                });
            },
        },
        columns: [
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
                data: 'GroupName',
                title: 'GROUP NAME',
                render: function (data, type, row) {
                    return `
                        <a href="#" data-bs-toggle="modal" data-bs-target="#groupBookingModal"
                           onclick="viewGroupBooking(${row.GroupID})">
                           ${data}
                        </a>`;
                }
            },
            { data: 'ContactNo', title: 'CONTACT NUMBER' },
            { data: 'NumberOfRooms', title: 'TOTAL ROOMS' },
            { data: 'RoomNumbers', title: 'ROOM NUMBERS' },
            {
                data: 'TotalPayment',
                title: 'TOTAL PAYMENT',
                render: function (data) {
                    return parseFloat(data).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            },
            { data: 'Channel', title: 'BOOKING CHANNEL' },
            {
                data: 'Status',
                title: 'BOOKING STATUS',
                visible: false, // This hides the column
                render: function (data) {
                    let labelClass = "label-secondary";
                    if (data === "ALL CHECK-IN") labelClass = "label-success";
                    else if (data === "ALL CHECK-OUT") labelClass = "label-warning";
                    else if (data === "PARTIAL CHECK-OUT") labelClass = "label-primary";
                    else if (data === "ALL PENDING") labelClass = "label-info";
                    else if (data.includes("PENDING & CHECK-IN")) labelClass = "label-dark";
                    else if (data.includes("PENDING & CHECK-OUT")) labelClass = "label-light";

                    return `<span class="label label-sm ${labelClass}">${data}</span>`;
                }
            },
            {
                data: '',
                title: 'ACTION',
                orderable: false,
                render: function (data, type, row) {
                    const buttonId = `billing_btn_${row.GroupID}`;
                    // AJAX to check payment status
                    $.ajax({
                        url: `/booking/check_group_payment_status/${row.GroupID}`,
                        method: 'GET',
                        success: function(res) {
                            const btn = $(`#${buttonId}`);
                            if (res.allPaid) {
                                btn.text('Billed');
                            } else {
                                btn.text('Billing');
                            }
                        },
                        error: function(err) {
                            console.error("Error checking payment status:", err);
                        }
                    });
                    return `
                        <button id="${buttonId}" class="btn btn-sm btn-primary"
                            onclick="viewGroupBilling(${row.GroupID})">
                            Billing
                        </button>`;
                }
            }
        ],
        language: {
            emptyTable: "No group bookings available."
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
    
    // Handle filter button clicks - Fixed with proper event delegation
    $(document).on('click', '.filter-btn', function() {
        // Remove active class from all filter buttons
        $('.filter-btn').removeClass('active');
        // Add active class to clicked button
        $(this).addClass('is-active');
        
        // Get the filter value
        let filter = $(this).data('filter');
        
        // Update the DataTable's AJAX URL
        groupTable.ajax.url(`/booking/group_booking_data?filter=${filter}`).load();
    });
    
    // When a group booking tab is clicked, update the DataTable AJAX URL accordingly.
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        // e.target's href is something like "#groupToday"
        let href = $(e.target).attr('href');
        // Remove the '#' and convert to lowercase, e.g., "grouptoday"
        let filter = href.replace('#', '').toLowerCase();
        groupTable.ajax.url(`/booking/group_booking_data?filter=${filter}`).load();
    });
});

// Attach click event to set BookingID in modal for status change
$('#group_booking_tbl').on('click', 'span[data-bs-toggle="modal"]', function () {
    const bookingId = $(this).data('booking-id');
    $('#change_status').data('booking-id', bookingId);

    // If needed, handle logic here
});

// PRINT FUNCTION: Updated to use 'groupBillingModal' 
function printDiv(divId) {
    const printContents = document.getElementById(divId);
    const originalContents = document.body.innerHTML;

    // 1) Hide buttons before printing
    const buttons = printContents.querySelectorAll('button');
    buttons.forEach(button => button.style.display = 'none');
    
    // 2) Inject print-specific CSS for borderless or minimal margins (if desired)
    const style = document.createElement('style');
    style.setAttribute('media', 'print');
    style.textContent = `
      @page {
        size: A4;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100%;
        height: 100%;
      }
      .modal, .modal-dialog, .modal-content {
        position: static !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    // 3) Replace body content with the printable area
    document.body.innerHTML = printContents.innerHTML;

    // 4) Print
    window.print();

    // 5) Restore original content after printing
    document.body.innerHTML = originalContents;

    // (Optional) Remove the style tag if you don't want it to persist
    // document.head.removeChild(style);

    // 6) Reload page to restore modal functionality
    location.reload();
}

// Ensure the modal is reset properly when closed
document.getElementById('groupBillingModal').addEventListener('hidden.bs.modal', function () {
    const modalElement = document.getElementById('groupBillingModal');
    modalElement.innerHTML = modalElement.innerHTML; // Reset modal content
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
                $('#group_booking_tbl').DataTable().ajax.reload();
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

// SHOW GROUP BOOKING DETAILS MODAL
function viewGroupBooking(groupId) {
    $.ajax({
        url: `/booking/group_booking_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            let bookingTable = $('#groupBookingModal tbody');
            bookingTable.empty();

            if (data.bookingDetails.length > 0) {
                data.bookingDetails.forEach(booking => {
                    let statusClass = "label-secondary";
                    if (booking.BOOKING_STATUS.toLowerCase() === "check-in") statusClass = "label-success";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "check-out") statusClass = "label-warning";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "pending") statusClass = "label-info";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "cancelled") statusClass = "label-danger";

                    let row = `
                        <tr>
                            <td>${booking.ROOM_NUMBER}</td>
                            <td>${formatDate(booking.CHECK_IN_DATE)}</td>
                            <td>${formatDate(booking.CHECK_OUT_DATE)}</td>
                            <td><span class="label label-sm ${statusClass}">${booking.BOOKING_STATUS}</span></td>
                            <td>${parseFloat(booking.TOTAL_COST).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            <td>${booking.SERVICES_AVAILED}</td>
                        </tr>`;
                    bookingTable.append(row);
                });
            } else {
                bookingTable.append(`<tr><td colspan="6" class="text-center">No individual bookings found.</td></tr>`);
            }
            $('#groupBookingModal').modal('show');
        },
        error: function (error) {
            console.error("Error fetching group booking details:", error);
            alert("Failed to load group booking details.");
        }
    });
}

// SHOW GROUP BILLING
function viewGroupBilling(groupId) {
    $.ajax({
        url: `/booking/group_billing_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            if (!data || (data.roomBillingDetails.length === 0 && data.serviceBillingDetails.length === 0)) {
                alert("No billing records found for this group.");
                return;
            }

            $('#invoiceNumber').text(`${data.BOOKING_ID}`);
            $('#GroupName').text(data.GroupName);
            $('#invoiceDate').text(new Date().toLocaleDateString());

            let billingTable = $('#billingDetails');
            billingTable.empty();

            let totalAmount = 0;
            let totalPaid = 0;
            let rowNumber = 1;

            let allBillingData = [...data.roomBillingDetails, ...data.serviceBillingDetails];
            // Sort the data
            allBillingData.sort((a, b) => {
                return a.ROOM_NUMBER - b.ROOM_NUMBER || a.BOOKING_ID - b.BOOKING_ID;
            });

            let currentRoom = null;
            let roomTotal = 0;

            allBillingData.forEach((bill, index) => {
                let chargeAmount = parseFloat(bill.charges) || 0;
                let amount = chargeAmount * (bill.room_qty || bill.service_qty || 1);
                let paidIcon = (bill.PAYMENT_STATUS === 'paid' || bill.STATUS === 'paid') ? '✅' : '';

                if (bill.PAYMENT_STATUS === 'paid' || bill.STATUS === 'paid') {
                    totalPaid += amount;
                }
                totalAmount += amount;

                if (currentRoom !== bill.ROOM_NUMBER && currentRoom !== null) {
                    // Insert total row for previous room
                    let totalRow = `
                        <tr class="room-total">
                            <td colspan="5" class="text-right"><b>Total for Room - ${currentRoom}:</b></td>
                            <td class="text-right"><b>${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
                        </tr>`;
                    billingTable.append(totalRow);
                    roomTotal = 0;
                }

                currentRoom = bill.ROOM_NUMBER;
                roomTotal += amount;

                let row = `
                    <tr data-booking-id="${bill.BOOKING_ID}">
                        <td class="text-center">${rowNumber++}</td>
                        <td class="text-center">Room - ${bill.ROOM_NUMBER}</td>
                        <td class="text-center">${bill.description} ${paidIcon}</td>
                        <td class="text-center">${chargeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="text-center">${bill.room_qty || bill.service_qty || 1}</td>
                        <td class="text-right">${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <input type="hidden" name="bookingId[]" value="${bill.BOOKING_ID}">
                    </tr>`;
                billingTable.append(row);

                // If last item, insert final total row
                if (index === allBillingData.length - 1) {
                    let totalRow = `
                        <tr class="room-total">
                            <td colspan="5" class="text-right"><b>Total for Room - ${currentRoom}:</b></td>
                            <td class="text-right"><b>${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
                        </tr>`;
                    billingTable.append(totalRow);
                }
            });

            let balance = totalAmount - totalPaid;
            $('#totalAmount').text(totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#totalPaid').text(totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#balanceAmount').text(balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

            const allPaid = allBillingData.every(bill => bill.PAYMENT_STATUS === 'paid' || bill.STATUS === 'paid');
            const paymentBtn = $('#groupProceedPaymentButton');
            if (allPaid) {
                paymentBtn.prop('disabled', true).text('Payment Completed');
            } else {
                paymentBtn.prop('disabled', false).text('Proceed to Payment');
            }

            $('#groupBillingModal').modal('show');
        },
        error: function (error) {
            console.error("Error fetching billing details:", error);
            alert("Failed to load billing details.");
        }
    });
}

// SHOW GROUP PAYMENT
function openGroupPaymentModal() {
    let selectedBookingIDs = [];
    let totalBalance = parseFloat($('#balanceAmount').text().replace(/,/g, '')) || 0;

    $('#billingDetails tr').each(function () {
        let bookingID = $(this).data('booking-id');
        if (bookingID) {
            selectedBookingIDs.push(bookingID);
        }
    });

    $('#bookingID').val(selectedBookingIDs.join(','));
    $('#groupPaymentAmount').val(totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    $('#group_modal-payment').modal('show');
}

// CONFIRM PAYMENT BUTTON FUNCTION
$(document).on('click', '#groupConfirmPaymentButton', function () {
    let bookingIDs = $('#bookingID').val().split(',');
    let amountPaid = parseFloat($('#groupPaymentAmount').val().replace(/,/g, '')) || 0;
    let paymentMethod = $('#groupPaymentMethod').val();

    if (amountPaid <= 0) {
        Swal.fire('Invalid Amount', 'Please enter a valid amount to pay.', 'warning');
        return;
    }
    if (!paymentMethod) {
        Swal.fire('No Payment Method', 'Please select a payment method.', 'warning');
        return;
    }

    Swal.fire({
        title: 'Confirm Payment',
        text: `Are you sure you want to proceed with the payment of ₱${amountPaid.toLocaleString()}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Pay Now!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            let paymentData = {
                bookingIDs: bookingIDs,
                amountPaid: amountPaid,
                paymentMethod: paymentMethod
            };

            $.ajax({
                url: '/booking/group_payment',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(paymentData),
                success: function (response) {
                    Swal.fire('Payment Successful!', 'The payment has been processed successfully.', 'success')
                        .then(() => {
                            $('#group_modal-payment').modal('hide');
                            location.reload();
                        });
                },
                error: function (error) {
                    console.error("Payment Error:", error);
                    Swal.fire('Payment Failed', 'Payment failed. Please try again.', 'error');
                }
            });
        }
    });
});

// Single definition of formatDate
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
} 