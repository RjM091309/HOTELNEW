$('#groupManualOverrideToggle').on('change', function () {
    $('#groupManualFields').toggle(this.checked);
});

function confirmGroupCancelBooking() {
    const groupId = $('#cancelGroupBookingId').val();
    const reason = $('#groupCancelReason').val();
    const manual = $('#groupManualOverrideToggle').is(':checked');
    const manualRefund = parseFloat($('#groupManualRefund').val()) || 0;

    // Validate manual refund if manual override is enabled
    if (manual && manualRefund < 0) {
        Swal.fire('Invalid Amount', 'Refund amount cannot be negative.', 'error');
        return;
    }

    // Show loading state
    const confirmBtn = $('#confirmGroupCancelBtn');
    const originalText = confirmBtn.html();
    confirmBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Processing...');

    $.ajax({
        url: '/booking/cancel_group',
        type: 'POST',
        data: {
            groupId: groupId,
            reason: reason,
            manual: manual,
            manualRefund: manualRefund
        },
        success: function (res) {
            if (res.success) {
                $('#modal-cancel-group-booking').modal('hide');
                Swal.fire('Group Booking Cancelled!', res.message || 'The entire group booking has been cancelled successfully.', 'success');
                $('#group_booking_tbl').DataTable().ajax.reload();
            } else {
                Swal.fire('Error', res.message || 'Failed to cancel group booking.', 'error');
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
            // Restore button state
            confirmBtn.prop('disabled', false).html(originalText);
        }
    });
}

// Attach once the DOM is ready
$(document).ready(function () {
    $('#confirmGroupCancelBtn').click(confirmGroupCancelBooking);
});
