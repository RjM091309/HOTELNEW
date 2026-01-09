$('#groupManualOverrideToggle').on('change', function () {
    $('#groupManualFields').toggle(this.checked);
});

function formatShortDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function renderGroupCancelList(bookings) {
    const tbody = $('#groupCancelTableBody');
    const selectAll = $('#groupCancelSelectAll');
    tbody.empty();

    if (!bookings || !bookings.length) {
        tbody.append('<tr><td colspan="5" class="text-center text-muted py-3">No bookings found for this group.</td></tr>');
        selectAll.prop('checked', false).prop('disabled', true);
        return;
    }

    selectAll.prop('checked', false).prop('disabled', false);

    bookings.forEach((booking, idx) => {
        const bookingId = booking.booking_id || booking.bookingId || booking.IDNo;
        const status = (booking.BOOKING_STATUS || '').toUpperCase();
        const isPending = status === 'PENDING';
        const statusClass = status === 'CHECK-IN' ? 'label-success'
            : status === 'CHECK-OUT' ? 'label-warning'
            : status === 'CANCELLED' ? 'label-danger'
            : 'label-info';

        const checkIn = formatShortDate(booking.CHECK_IN_DATE);
        const checkOut = formatShortDate(booking.CHECK_OUT_DATE);
        const range = `${checkIn} - ${checkOut}`;

        const disabledAttr = isPending ? '' : 'disabled';

        const row = `
            <tr>
                <td class="text-center">
                    <input type="checkbox" class="form-check-input group-cancel-checkbox" value="${bookingId}" ${disabledAttr}>
                </td>
                <td>${booking.ROOM_NUMBER || booking.roomNumber || '-'}</td>
                <td>${booking.CUSTOMER_NAME || booking.customerName || '-'}</td>
                <td>${range}</td>
                <td class="text-center"><span class="label label-sm ${statusClass}">${status || '-'}</span></td>
            </tr>`;
        tbody.append(row);
    });

    // Update select-all when items change
    $(document).off('change.groupCancel', '.group-cancel-checkbox').on('change.groupCancel', '.group-cancel-checkbox', function () {
        const enabled = $('.group-cancel-checkbox:not(:disabled)');
        const checked = $('.group-cancel-checkbox:not(:disabled):checked');
        selectAll.prop('checked', enabled.length > 0 && enabled.length === checked.length);
    });
}

function loadGroupCancelList(groupId) {
    $('#groupCancelTableBody').html('<tr><td colspan="5" class="text-center text-muted py-3">Loading…</td></tr>');
    $('#groupCancelSelectAll').prop('checked', false);

    $.ajax({
        url: `/booking/group_booking_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            if (data && Array.isArray(data.bookingDetails)) {
                renderGroupCancelList(data.bookingDetails);
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
    const manual = $('#groupManualOverrideToggle').is(':checked');
    const manualRefund = parseFloat($('#groupManualRefund').val()) || 0;
    const bookingIds = $('.group-cancel-checkbox:checked').map(function () { return $(this).val(); }).get();

    if (!bookingIds.length) {
        Swal.fire('Select bookings', 'Please select at least one pending booking to cancel.', 'warning');
        return;
    }

    if (manual && manualRefund < 0) {
        Swal.fire('Invalid Amount', 'Refund amount cannot be negative.', 'error');
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
            manual: manual,
            manualRefund: manualRefund,
            bookingIds: bookingIds
        },
        success: function (res) {
            if (res.success) {
                $('#modal-cancel-group-booking').modal('hide');
                Swal.fire('Group Booking Cancelled!', res.message || 'Selected bookings have been cancelled successfully.', 'success');
                $('#group_booking_tbl').DataTable().ajax.reload();
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

$(document).ready(function () {
    $('#confirmGroupCancelBtn').click(confirmGroupCancelBooking);

    $('#groupCancelSelectAll').on('change', function () {
        const checked = $(this).is(':checked');
        $('.group-cancel-checkbox:not(:disabled)').prop('checked', checked);
    });
});
