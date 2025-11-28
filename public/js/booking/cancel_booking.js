function confirmCancelBooking() {
    const bookingId = $('#cancelBookingId').val();
    const reason = $('#cancelReason').val();
    const refundInput = $('#manualRefund').val();
    const feeInput = $('#manualCancellationFee').val();
    const manualRefund = parseFloat(refundInput);
    const manualCancellationFee = parseFloat(feeInput);
    const maxRefundText = $('#cancelMaxRefund').text().replace(/[₱,]/g, '');
    const maxRefund = parseFloat(maxRefundText) || 0;
    const paidAmount = maxRefund; // Paid amount is the same as max refund
    const totalAmount = parseFloat($('#manualRefund').data('total-amount')) || 0;

    if (!bookingId) {
        Swal.fire('Error', 'Missing booking reference.', 'error');
        return;
    }

    if (!Number.isFinite(manualRefund) || manualRefund < 0) {
        Swal.fire('Invalid Amount', 'Please enter a valid refund amount (0 or higher).', 'warning');
        return;
    }

    if (!Number.isFinite(manualCancellationFee) || manualCancellationFee < 0) {
        Swal.fire('Invalid Amount', 'Please enter a valid cancellation fee (0 or higher).', 'warning');
        return;
    }

    // Get max values from input attributes
    const maxRefundable = parseFloat($('#manualRefund').attr('max')) || maxRefund;
    // If nothing paid, max cancellation fee is totalAmount; otherwise it's paidAmount
    const maxCancellationFee = maxRefund === 0 
        ? totalAmount 
        : (parseFloat($('#manualCancellationFee').attr('max')) || paidAmount);
    
    if (manualRefund > maxRefundable) {
        Swal.fire('Invalid Amount', `Refund amount cannot exceed ₱${maxRefundable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, 'warning');
        return;
    }
    
    if (manualCancellationFee > maxCancellationFee) {
        Swal.fire('Invalid Amount', `Cancellation fee cannot exceed ₱${maxCancellationFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, 'warning');
        return;
    }

    // Validate that refund + fee equals paid amount (not total amount)
    // Exception: If nothing was paid (maxRefund = 0), fee can be set independently
    const sum = manualRefund + manualCancellationFee;
    const difference = Math.abs(sum - paidAmount);
    
    if (maxRefund === 0) {
        // If nothing was paid, refund must be 0, fee can be any amount up to totalAmount
        if (manualRefund !== 0) {
            Swal.fire('Invalid Amount', 'Refund amount must be 0 when no payment was made.', 'warning');
            return;
        }
        if (manualCancellationFee > totalAmount) {
            Swal.fire('Invalid Amount', `Cancellation fee cannot exceed Total Amount (₱${totalAmount.toFixed(2)}).`, 'warning');
            return;
        }
        // Allow fee to be less than totalAmount (the difference is written off)
    } else {
        // If payment was made, refund + fee must equal paid amount
        if (difference > 0.01) { // Allow small floating point differences
            Swal.fire('Invalid Amounts', `Refund amount (₱${manualRefund.toFixed(2)}) + Cancellation Fee (₱${manualCancellationFee.toFixed(2)}) must equal Paid Amount (₱${paidAmount.toFixed(2)}).`, 'warning');
            return;
        }
    }

    $.ajax({
        url: '/booking/cancel',
        type: 'POST',
        data: {
            bookingId,
            reason,
            manualRefund,
            manualCancellationFee
        },
        success: function (res) {
            if (res.success) {
                $('#modal-cancel-booking').modal('hide');
                Swal.fire('Cancelled!', res.message, 'success');
                $('#booking_tbl').DataTable().ajax.reload();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        },
        error: function () {
            Swal.fire('Error', 'Something went wrong.', 'error');
        }
    });
}

// Attach once the DOM is ready
$(document).ready(function () {
    $('#confirmCancelBtn').click(confirmCancelBooking);
    
    // Clear fields when modal is closed
    $('#modal-cancel-booking').on('hidden.bs.modal', function() {
        $('#manualRefund').val('');
        $('#manualRefund').prop('readonly', false); // Reset readonly state
        $('#manualCancellationFee').val('');
        $('#cancelReason').val('');
        $('#noPaymentNote').hide();
    });
}); 