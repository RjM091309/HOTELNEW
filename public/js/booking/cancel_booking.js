function refreshAfterCancelBooking() {
    if (typeof refreshCalendarBookings === 'function') {
        refreshCalendarBookings();
    } else if (typeof loadCalendarData === 'function') {
        loadCalendarData();
    } else if ($.fn.DataTable && $.fn.DataTable.isDataTable('#booking_tbl')) {
        $('#booking_tbl').DataTable().ajax.reload();
    }
}

function hideCancelAndRoomModals() {
    const cancelEl = document.getElementById('modal-cancel-booking');
    if (cancelEl && window.bootstrap && bootstrap.Modal) {
        const cancelInst = bootstrap.Modal.getInstance(cancelEl);
        if (cancelInst) {
            cancelInst.hide();
        }
    }

    document.querySelectorAll('[id^="dynamicRoomModal_"]').forEach((roomModal) => {
        if (window.bootstrap && bootstrap.Modal) {
            const roomInst = bootstrap.Modal.getInstance(roomModal);
            if (roomInst) {
                roomInst.hide();
            }
        }
    });
}

function cleanupCancelModalUi() {
    const cancelEl = document.getElementById('modal-cancel-booking');

    if (typeof window.resetSharedCancelModal === 'function') {
        window.resetSharedCancelModal(cancelEl);
    } else if (cancelEl && window.bootstrap && bootstrap.Modal) {
        const inst = bootstrap.Modal.getInstance(cancelEl);
        if (inst) inst.dispose();
    }

    if (typeof window.cleanupAfterNestedModalClose === 'function') {
        window.cleanupAfterNestedModalClose();
    } else if (typeof window.cleanupModalOverlays === 'function') {
        window.cleanupModalOverlays();
    }

    document.querySelectorAll('.swal2-container').forEach((container) => {
        if (!container.classList.contains('swal2-shown')) {
            container.remove();
        }
    });
}

function confirmCancelBooking() {
    const bookingId = $('#cancelBookingId').val();
    const reason = $('#cancelReason').val();
    const refundInput = $('#manualRefund').val();
    const feeInput = $('#manualCancellationFee').val();
    const manualRefund = parseFloat(refundInput);
    const manualCancellationFee = parseFloat(feeInput);
    const maxRefundText = $('#cancelMaxRefund').text().replace(/[₱,]/g, '');
    const maxRefund = parseFloat(maxRefundText) || 0;
    const paidAmount = maxRefund;
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

    const maxRefundable = parseFloat($('#manualRefund').attr('max')) || maxRefund;
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

    const sum = manualRefund + manualCancellationFee;
    const difference = Math.abs(sum - paidAmount);

    if (maxRefund === 0) {
        if (manualRefund !== 0) {
            Swal.fire('Invalid Amount', 'Refund amount must be 0 when no payment was made.', 'warning');
            return;
        }
        if (manualCancellationFee > totalAmount) {
            Swal.fire('Invalid Amount', `Cancellation fee cannot exceed Total Amount (₱${totalAmount.toFixed(2)}).`, 'warning');
            return;
        }
    } else if (difference > 0.01) {
        Swal.fire('Invalid Amounts', `Refund amount (₱${manualRefund.toFixed(2)}) + Cancellation Fee (₱${manualCancellationFee.toFixed(2)}) must equal Paid Amount (₱${paidAmount.toFixed(2)}).`, 'warning');
        return;
    }

    const $confirmBtn = $('#confirmCancelBtn');
    $confirmBtn.prop('disabled', true);

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
            $confirmBtn.prop('disabled', false);

            if (res.success) {
                hideCancelAndRoomModals();
                refreshAfterCancelBooking();

                setTimeout(() => {
                    cleanupCancelModalUi();
                }, 300);

                Swal.fire('Cancelled!', res.message, 'success').then(() => {
                    refreshAfterCancelBooking();
                    cleanupCancelModalUi();
                });
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        },
        error: function () {
            $confirmBtn.prop('disabled', false);
            Swal.fire('Error', 'Something went wrong.', 'error');
        }
    });
}

function bindCancelModalCleanup() {
    const cancelEl = document.getElementById('modal-cancel-booking');
    if (!cancelEl || cancelEl.dataset.cancelCleanupBound === '1') return;
    cancelEl.dataset.cancelCleanupBound = '1';

    cancelEl.addEventListener('hidden.bs.modal', function () {
        $('#manualRefund').val('');
        $('#manualRefund').prop('readonly', false);
        $('#manualCancellationFee').val('');
        $('#cancelReason').val('');
        $('#noPaymentNote').hide();
        $('#confirmCancelBtn').prop('disabled', false);
        cleanupCancelModalUi();
    });
}

$(document).ready(function () {
    $('#confirmCancelBtn').off('click.cancelBooking').on('click.cancelBooking', confirmCancelBooking);
    bindCancelModalCleanup();
});

if (document.readyState !== 'loading') {
    bindCancelModalCleanup();
} else {
    document.addEventListener('DOMContentLoaded', bindCancelModalCleanup);
}
