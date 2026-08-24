function formatNotifierDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function formatPaymentStatusBadge(status) {
  const normalized = String(status || 'no_payment').toLowerCase();

  if (normalized === 'paid') {
    return '<span class="payment-badge payment-badge-paid">Paid</span>';
  }
  if (normalized === 'partial') {
    return '<span class="payment-badge payment-badge-partial">Partial</span>';
  }
  return '<span class="payment-badge payment-badge-none">No Payment</span>';
}

function paymentStatusSortValue(status) {
  const normalized = String(status || 'no_payment').toLowerCase();
  if (normalized === 'paid') return 1;
  if (normalized === 'partial') return 2;
  return 3;
}

function syncNotifierPageHeight() {
  const page = document.querySelector('.checkin-notifier-page');
  if (!page) return;
  const top = page.getBoundingClientRect().top;
  const bottomGap = 16;
  page.style.height = Math.max(320, window.innerHeight - top - bottomGap) + 'px';
}

function getNotifierScrollHeight() {
  const box = document.querySelector('.checkin-notifier-scroll-box');
  const wrapper = document.getElementById('checkin_notifier_tbl_wrapper');
  if (!box || !wrapper) return 400;

  const filter = wrapper.querySelector('.dataTables_filter');
  const info = wrapper.querySelector('.dataTables_info');
  const wrapperPadding = 20;
  const extra = (filter ? filter.offsetHeight : 0)
    + (info ? info.offsetHeight : 0)
    + wrapperPadding;

  return Math.max(200, box.clientHeight - extra);
}

function applyNotifierScrollHeight(table) {
  const height = getNotifierScrollHeight() + 'px';
  const scrollBody = document.querySelector('#checkin_notifier_tbl_wrapper .dataTables_scrollBody');
  if (scrollBody) {
    scrollBody.style.maxHeight = height;
    scrollBody.style.height = height;
  }
  if (table) {
    table.columns.adjust();
  }
}

function syncNotifierSelectAllState() {
  const $checks = $('#checkin_notifier_tbl_wrapper .notifier-row-check');
  const $selectAll = $('#notifierSelectAll');
  if (!$selectAll.length) return;

  if (!$checks.length) {
    $selectAll.prop('checked', false).prop('indeterminate', false);
    return;
  }

  const checkedCount = $checks.filter(':checked').length;
  $selectAll.prop('checked', checkedCount === $checks.length);
  $selectAll.prop('indeterminate', checkedCount > 0 && checkedCount < $checks.length);
}

function resetNotifierSelection() {
  $('#notifierSelectAll').prop('checked', false).prop('indeterminate', false);
  $('#checkin_notifier_tbl_wrapper .notifier-row-check').prop('checked', false);
}

function getSelectedNotifierBookingIds() {
  return $('#checkin_notifier_tbl_wrapper .notifier-row-check:checked')
    .map(function () { return this.value; })
    .get();
}

window.getSelectedNotifierBookingIds = getSelectedNotifierBookingIds;

function updateNotifyButtonState() {
  const hasSelection = getSelectedNotifierBookingIds().length > 0;
  $('#checkinNotifyBtn').prop('disabled', !hasSelection);
}

function sendCheckInNotifications(filter) {
  const bookingIds = getSelectedNotifierBookingIds();
  if (!bookingIds.length) {
    Swal.fire('No Selection', 'Select at least one booking to notify.', 'warning');
    return;
  }

  Swal.fire({
    title: 'Send Notification?',
    text: 'Log notification for ' + bookingIds.length + ' selected booking(s)?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'NOTIFY',
    cancelButtonText: 'Cancel'
  }).then(function (result) {
    if (!result.isConfirmed) return;

    $('#checkinNotifyBtn').prop('disabled', true);

    $.ajax({
      url: '/booking/check-in-notifier/notify',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        bookingIds: bookingIds,
        filter: filter
      }),
      success: function (response) {
        if (response.success) {
          Swal.fire('Notified', response.message || 'Notifications logged.', 'success');
          resetNotifierSelection();
          updateNotifyButtonState();
          return;
        }
        Swal.fire('Error', response.message || 'Failed to log notifications.', 'error');
        updateNotifyButtonState();
      },
      error: function (xhr) {
        const message = xhr.responseJSON?.message || 'Failed to log notifications.';
        Swal.fire('Error', message, 'error');
        updateNotifyButtonState();
      }
    });
  });
}

$(document).ready(function () {
  syncNotifierPageHeight();
  let currentFilter = 'all';

  const table = $('#checkin_notifier_tbl').DataTable({
    processing: true,
    serverSide: false,
    paging: false,
    lengthChange: false,
    scrollY: getNotifierScrollHeight() + 'px',
    scrollCollapse: true,
    dom: 'frti',
    ajax: {
      url: '/booking/check-in-notifier/data',
      type: 'GET',
      data: function () {
        return { filter: currentFilter };
      },
      dataSrc: function (json) {
        if (!json.success || !Array.isArray(json.data)) {
          return [];
        }

        return json.data.map(function (item) {
          const paymentStatus = item.paymentStatus || 'no_payment';
          return {
            BookingID: item.BookingID,
            guestName: item.guestName || 'N/A',
            contactNumber: item.contactNumber || 'N/A',
            roomNumber: item.roomNumber || 'Unassigned',
            checkIn: formatNotifierDate(item.CHECK_IN_DATE),
            checkOut: formatNotifierDate(item.CHECK_OUT_DATE),
            paymentStatus: formatPaymentStatusBadge(paymentStatus),
            paymentStatusSort: paymentStatusSortValue(paymentStatus),
            channel: item.BOOKING_CHANNEL || 'walk-in'
          };
        });
      }
    },
    order: [[6, 'asc']],
    autoWidth: false,
    columns: [
      {
        data: 'BookingID',
        orderable: false,
        searchable: false,
        render: function (data) {
          return '<input type="checkbox" class="notifier-row-check" value="' + data + '" aria-label="Select booking">';
        }
      },
      { data: null, orderable: false, searchable: false },
      { data: 'guestName' },
      { data: 'contactNumber' },
      { data: 'roomNumber' },
      { data: 'checkIn' },
      { data: 'checkOut' },
      {
        data: 'paymentStatusSort',
        render: function (data, type, row) {
          if (type === 'sort' || type === 'type') {
            return data;
          }
          return row.paymentStatus;
        }
      },
      { data: 'channel' }
    ],
    columnDefs: [
      { targets: 0, width: '36px', className: 'text-center notifier-select-col' },
      { targets: 1, width: '40px', className: 'text-center' },
      { targets: 2, width: '180px' },
      { targets: 3, width: '150px' },
      { targets: 4, width: '80px', className: 'text-center' },
      { targets: 5, width: '110px', className: 'text-center' },
      { targets: 6, width: '110px', className: 'text-center' },
      { targets: 7, width: '110px', className: 'text-center' },
      { targets: 8, width: '100px', className: 'text-center' }
    ],
    language: {
      emptyTable: 'No upcoming check-ins for this filter.'
    },
    initComplete: function () {
      const scrollHeadFirst = $('#checkin_notifier_tbl_wrapper .dataTables_scrollHead th').first();
      if (scrollHeadFirst.length) {
        scrollHeadFirst
          .addClass('notifier-select-col text-center')
          .html('<input type="checkbox" id="notifierSelectAll" title="Select all" aria-label="Select all bookings">');
      }

      $('#checkin_notifier_tbl thead th').addClass('text-center');
      $('#checkin_notifier_tbl thead th').eq(2).removeClass('text-center');
      $('#checkin_notifier_tbl thead th').eq(3).removeClass('text-center');
      syncNotifierPageHeight();
      requestAnimationFrame(function () {
        applyNotifierScrollHeight(table);
      });
    },
    drawCallback: function () {
      const api = this.api();
      api.column(1).nodes().each(function (cell, i) {
        cell.innerHTML = i + 1;
      });

      const scrollHeadFirst = $('#checkin_notifier_tbl_wrapper .dataTables_scrollHead th').first();
      if (scrollHeadFirst.length && !scrollHeadFirst.find('#notifierSelectAll').length) {
        scrollHeadFirst
          .addClass('notifier-select-col text-center')
          .html('<input type="checkbox" id="notifierSelectAll" title="Select all" aria-label="Select all bookings">');
      }

      syncNotifierSelectAllState();
      updateNotifyButtonState();
      applyNotifierScrollHeight(api);
    }
  });

  $('#checkin_notifier_tbl_wrapper').on('change', '#notifierSelectAll', function () {
    const checked = this.checked;
    $('#checkin_notifier_tbl_wrapper .notifier-row-check').prop('checked', checked);
    syncNotifierSelectAllState();
    updateNotifyButtonState();
  });

  $('#checkin_notifier_tbl_wrapper').on('change', '.notifier-row-check', function () {
    syncNotifierSelectAllState();
    updateNotifyButtonState();
  });

  $('#checkinNotifyBtn').on('click', function () {
    sendCheckInNotifications(currentFilter);
  });

  $(window).on('resize', function () {
    syncNotifierPageHeight();
    applyNotifierScrollHeight(table);
  });

  $('.filter-btn').on('click', function () {
    const filter = $(this).data('filter');
    if (!filter || filter === currentFilter) return;

    currentFilter = filter;
    $('.filter-btn').removeClass('active');
    $(this).addClass('active');
    resetNotifierSelection();
    updateNotifyButtonState();
    table.ajax.reload();
  });
});
