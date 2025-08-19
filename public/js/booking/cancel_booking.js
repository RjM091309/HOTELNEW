$('#manualOverrideToggle').on('change', function () {
    $('#manualFields').toggle(this.checked);
});

function confirmCancelBooking() {
    const bookingId = $('#cancelBookingId').val();
    const reason = $('#cancelReason').val();
    const manual = $('#manualOverrideToggle').is(':checked');
    const manualRefund = parseFloat($('#manualRefund').val()) || 0;

    $.ajax({
        url: '/booking/cancel',
        type: 'POST',
        data: {
            bookingId,
            reason,
            manual,
            manualRefund
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
}); 