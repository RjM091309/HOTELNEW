function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount) {
    return `₱${parseFloat(amount || 0).toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
}

function renderGroupCancelList(bookings) {
    const tbody = $('#groupCancelTableBody');
    const selectAll = $('#groupCancelSelectAll');
    tbody.empty();

    if (!bookings || !bookings.length) {
        tbody.append('<tr><td colspan="6" class="text-center text-muted py-3">No bookings found for this group.</td></tr>');
        selectAll.prop('checked', false).prop('disabled', true);
        updateGroupCancelSelectionTotals();
        return;
    }

    selectAll.prop('checked', false).prop('disabled', false);

    bookings.forEach((booking) => {
        const bookingId = booking.booking_id || booking.bookingId || booking.IDNo;
        const status = (booking.BOOKING_STATUS || '').toUpperCase();
        const isPending = status === 'PENDING';
        const statusClass = status === 'CHECK-IN' ? 'label-success'
            : status === 'CHECK-OUT' ? 'label-warning'
            : status === 'CANCELLED' ? 'label-danger'
            : 'label-info';

        const roomPrice = parseFloat(booking.ROOM_PRICE || booking.roomPrice || 0) || 0;
        const roomQty = parseFloat(booking.ROOM_QTY || booking.roomQty || booking.QTY || 0) || 0;
        const roomTotal = roomPrice * roomQty;
        
        // Get paid amount - try multiple possible field names
        const paidAmount = parseFloat(booking.TOTAL_PAID || booking.totalPaid || booking.PAID_AMOUNT || booking.paidAmount || 0) || 0;

        const checkIn = formatShortDate(booking.CHECK_IN_DATE);
        const checkOut = formatShortDate(booking.CHECK_OUT_DATE);
        const range = `${checkIn} - ${checkOut}`;

        const disabledAttr = isPending ? '' : 'disabled';

        const row = `
            <tr>
                <td class="text-center">
                    <input 
                      type="checkbox" 
                      class="form-check-input group-cancel-checkbox" 
                      value="${bookingId}" 
                      data-room-price="${roomPrice}" 
                      data-room-qty="${roomQty}" 
                      data-room-total="${roomTotal}"
                      data-paid-amount="${paidAmount}"
                      ${disabledAttr}>
                </td>
                <td>${booking.ROOM_NUMBER || booking.roomNumber || '-'}</td>
                <td>${booking.CUSTOMER_NAME || booking.customerName || '-'}</td>
                <td>${range}</td>
                <td class="text-center"><span class="label label-sm ${statusClass}">${status || '-'}</span></td>
                <td class="text-end">${formatCurrency(paidAmount)}</td>
            </tr>`;
        tbody.append(row);
    });

    // Update select-all when items change
    $(document).off('change.groupCancel', '.group-cancel-checkbox').on('change.groupCancel', '.group-cancel-checkbox', function () {
        const enabled = $('.group-cancel-checkbox:not(:disabled)');
        const checked = $('.group-cancel-checkbox:not(:disabled):checked');
        selectAll.prop('checked', enabled.length > 0 && enabled.length === checked.length);
        updateGroupCancelSelectionTotals();
    });

    // Reset totals on render
    updateGroupCancelSelectionTotals();
}

function loadGroupCancelList(groupId) {
    $('#groupCancelTableBody').html('<tr><td colspan="6" class="text-center text-muted py-3">Loading…</td></tr>');
    $('#groupCancelSelectAll').prop('checked', false);
    $('#groupCancelSelectedRoomPrices').val('');
    $('#groupCancelSelectedTotal').val('0');
    $('#groupCancellationFee').val('');
    $('#groupTotalRefund').val('₱0.00');
    $('#groupCancelTotalPaid').text('₱0.00').val('₱0.00');
    $('#groupCancelSelectedCount').text('0').val('0');
    $('#groupCancelFeeWarning').hide();

    $.ajax({
        url: `/booking/group_booking_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            if (data && Array.isArray(data.bookingDetails)) {
                // Fetch paid amounts for each booking if not included
                const bookingIds = data.bookingDetails.map(b => b.booking_id || b.bookingId || b.IDNo).filter(id => id);
                
                if (bookingIds.length > 0) {
                    // Try to get paid amounts from a separate endpoint or calculate from payments
                    $.ajax({
                        url: '/booking/get_bookings_paid_amounts',
                        type: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify({ bookingIds: bookingIds }),
                        success: function(paidData) {
                            // Merge paid amounts into booking details
                            if (paidData && paidData.paidAmounts) {
                                data.bookingDetails.forEach(booking => {
                                    const bid = booking.booking_id || booking.bookingId || booking.IDNo;
                                    if (paidData.paidAmounts[bid]) {
                                        booking.TOTAL_PAID = paidData.paidAmounts[bid];
                                    }
                                });
                            }
                            renderGroupCancelList(data.bookingDetails);
                        },
                        error: function() {
                            // If endpoint doesn't exist, render without paid amounts (will show 0)
                            renderGroupCancelList(data.bookingDetails);
                        }
                    });
                } else {
                    renderGroupCancelList(data.bookingDetails);
                }
            } else {
                renderGroupCancelList([]);
            }
        },
        error: function () {
            renderGroupCancelList([]);
            Swal.fire('Error', 'Failed to load group bookings for cancellation.', 'error');
        }
    });
}

function confirmGroupCancelBooking() {
    const groupId = $('#cancelGroupBookingId').val();
    const reason = $('#groupCancelReason').val();
    const cancellationFeeInput = $('#groupCancellationFee').val();
    const cancellationFee = parseFloat(cancellationFeeInput) || 0;
    const bookingIds = $('.group-cancel-checkbox:checked').map(function () { 
        return $(this).val(); 
    }).get();

    if (!bookingIds.length) {
        Swal.fire('Select bookings', 'Please select at least one pending booking to cancel.', 'warning');
        return;
    }

    // Get total paid from selected bookings
    let totalPaid = 0;
    $('.group-cancel-checkbox:checked').each(function() {
        const paid = parseFloat($(this).data('paid-amount')) || 0;
        totalPaid += paid;
    });

    // Validate cancellation fee
    if (cancellationFee < 0) {
        Swal.fire('Invalid Amount', 'Cancellation fee cannot be negative.', 'error');
        return;
    }

    // If cancellation fee is provided, validate it doesn't exceed total paid
    if (cancellationFeeInput && cancellationFeeInput.trim() !== '' && cancellationFee > totalPaid && totalPaid > 0) {
        Swal.fire('Invalid Amount', 
            `Cancellation fee (${formatCurrency(cancellationFee)}) cannot exceed total paid amount (${formatCurrency(totalPaid)}).`, 
            'error');
        return;
    }

    const confirmBtn = $('#confirmGroupCancelBtn');
    const originalText = confirmBtn.html();
    confirmBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Processing...');

    $.ajax({
        url: '/booking/cancel_group',
        type: 'POST',
        traditional: true, // send arrays as repeated params
        data: {
            groupId: groupId,
            reason: reason,
            cancellationFee: cancellationFee,
            bookingIds: bookingIds
        },
        success: function (res) {
            if (res.success) {
                $('#modal-cancel-group-booking').modal('hide');
                Swal.fire('Group Booking Cancelled!', res.message || 'Selected bookings have been cancelled successfully.', 'success')
                    .then(() => {
                        $('#group_booking_tbl').DataTable().ajax.reload();
                    });
            } else {
                Swal.fire('Error', res.message || 'Failed to cancel selected bookings.', 'error');
            }
        },
        error: function (xhr) {
            let errorMessage = 'Something went wrong.';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMessage = xhr.responseJSON.message;
            }
            Swal.fire('Error', errorMessage, 'error');
        },
        complete: function() {
            confirmBtn.prop('disabled', false).html(originalText);
        }
    });
}

function updateGroupCancelSelectionTotals() {
    const selected = $('.group-cancel-checkbox:not(:disabled):checked');
    const prices = [];
    let total = 0;
    let totalPaid = 0;

    selected.each(function () {
        const price = parseFloat($(this).data('room-price')) || 0;
        const roomTotal = parseFloat($(this).data('room-total')) || 0;
        const paid = parseFloat($(this).data('paid-amount')) || 0;
        prices.push(price);
        total += roomTotal;
        totalPaid += paid;
    });

    $('#groupCancelSelectedRoomPrices').val(prices.join(','));
    $('#groupCancelSelectedTotal').val(total.toFixed(2));
    
    // Update UI displays
    $('#groupCancelSelectedCount').text(selected.length);
    $('#groupCancelTotalPaid').text(formatCurrency(totalPaid)).val(formatCurrency(totalPaid));
    
    // Calculate and display refund
    const cancellationFee = parseFloat($('#groupCancellationFee').val()) || 0;
    const refund = Math.max(0, totalPaid - cancellationFee);
    $('#groupTotalRefund').val(formatCurrency(refund));
    
    // Show warning if cancellation fee exceeds total paid
    if (cancellationFee > totalPaid && totalPaid > 0) {
        $('#groupCancelFeeWarning').show();
    } else {
        $('#groupCancelFeeWarning').hide();
    }
}

$(document).ready(function () {
    $('#confirmGroupCancelBtn').click(confirmGroupCancelBooking);

    $('#groupCancelSelectAll').on('change', function () {
        const checked = $(this).is(':checked');
        $('.group-cancel-checkbox:not(:disabled)').prop('checked', checked);
        updateGroupCancelSelectionTotals();
    });

    // Update refund when cancellation fee changes
    $('#groupCancellationFee').on('input', function() {
        updateGroupCancelSelectionTotals();
    });

    // Clear fields when modal is closed
    $('#modal-cancel-group-booking').on('hidden.bs.modal', function() {
        $('#groupCancelReason').val('');
        $('#groupCancellationFee').val('');
        $('#groupTotalRefund').val('₱0.00');
        $('#groupCancelTotalPaid').text('₱0.00');
    $('#groupCancelSelectedCount').text('0').val('0');
        $('#groupCancelFeeWarning').hide();
    });
});
