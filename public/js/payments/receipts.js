let receiptsTable;
const bookedGuestResults = { add: [], edit: [] };
let bookedGuestSearchTimer = null;

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  check: 'Check',
  other: 'Other'
};

$(document).ready(function () {
  initializeReceiptsTable();
  setupReceiptHandlers();
});

function formatReceiptDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatReceiptDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getMethodLabel(method, other) {
  const key = (method || '').toLowerCase();
  if (key === 'other') return other || 'Other';
  return PAYMENT_METHOD_LABELS[key] || method || '';
}

function toggleOtherMethod(prefix) {
  const method = $('#' + prefix + 'PaymentMethod').val();
  const wrap = $('#' + prefix + 'PaymentMethodOtherWrap');
  if (method === 'other') {
    wrap.show();
  } else {
    wrap.hide();
    $('#' + prefix + 'PaymentMethodOther').val('');
  }
}

function hideGuestSearchResults(prefix) {
  $('#' + prefix + 'ReceivedFromResults').hide().empty();
}

function formatGuestResultMeta(guest) {
  const parts = [];
  if (guest.ROOM_NUMBER) parts.push('Room ' + guest.ROOM_NUMBER);
  if (guest.CONFIRMATION_NUMBER) parts.push('Conf. ' + guest.CONFIRMATION_NUMBER);
  if (guest.CHECK_IN_DATE) parts.push(formatReceiptDate(guest.CHECK_IN_DATE));
  return parts.join(' · ');
}

function searchBookedGuests(prefix) {
  const query = $('#' + prefix + 'ReceivedFrom').val().trim();

  fetch('/payments/receipts/api/booked-guests?q=' + encodeURIComponent(query), {
    credentials: 'same-origin'
  })
    .then(function (res) { return res.json(); })
    .then(function (response) {
      const resultsDiv = $('#' + prefix + 'ReceivedFromResults');
      bookedGuestResults[prefix] = response.success && response.data ? response.data : [];

      if (!bookedGuestResults[prefix].length) {
        resultsDiv.hide().empty();
        return;
      }

      const html = bookedGuestResults[prefix].map(function (guest, index) {
        const meta = formatGuestResultMeta(guest);
        return `
          <div class="guest-result-item" data-prefix="${prefix}" data-index="${index}">
            <div>${guest.GUEST_NAME || ''}</div>
            ${meta ? `<div class="guest-result-meta">${meta}</div>` : ''}
          </div>
        `;
      }).join('');

      resultsDiv.html(html).show();
    })
    .catch(function () {
      hideGuestSearchResults(prefix);
    });
}

function selectBookedGuest(prefix, index) {
  const guest = bookedGuestResults[prefix][index];
  if (!guest) return;

  $('#' + prefix + 'ReceivedFrom').val(guest.GUEST_NAME || '');
  if (guest.ROOM_NUMBER) {
    $('#' + prefix + 'RoomNo').val(guest.ROOM_NUMBER);
  }
  hideGuestSearchResults(prefix);
}

function setupGuestSearch(prefix) {
  const input = $('#' + prefix + 'ReceivedFrom');
  const resultsDiv = $('#' + prefix + 'ReceivedFromResults');

  input.on('input focus', function () {
    clearTimeout(bookedGuestSearchTimer);
    bookedGuestSearchTimer = setTimeout(function () {
      searchBookedGuests(prefix);
    }, 200);
  });

  input.on('blur', function () {
    setTimeout(function () {
      hideGuestSearchResults(prefix);
    }, 200);
  });

  resultsDiv.on('mousedown', '.guest-result-item', function (e) {
    e.preventDefault();
    const itemPrefix = $(this).data('prefix');
    const index = Number($(this).data('index'));
    selectBookedGuest(itemPrefix, index);
  });
}

function initializeReceiptsTable() {
  if ($.fn.DataTable.isDataTable('#receiptsTable')) {
    $('#receiptsTable').DataTable().destroy();
  }

  receiptsTable = $('#receiptsTable').DataTable({
    columnDefs: [
      {
        targets: 0,
        className: 'receipt-select-col text-center',
        orderable: false,
        searchable: false,
        width: '40px'
      },
      { targets: 4, className: 'text-right' },
      { targets: 7, className: 'text-center', orderable: false, searchable: false, width: '18%' }
    ],
    order: [[3, 'desc']],
    pageLength: 10,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    searching: true,
    ordering: true,
    autoWidth: false,
    responsive: true,
    language: { search: 'Search:' },
    initComplete: function () {
      $('#receiptsTable thead th.receipt-select-col')
        .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
        .addClass('sorting_disabled');
    }
  });

  $('#receiptsTable').on('draw.dt', function () {
    $('#receiptsTable thead th.receipt-select-col')
      .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
      .addClass('sorting_disabled');
    updatePrintSelectedButtonVisibility();
  });

  reloadReceiptsData();
}

function setupReceiptHandlers() {
  setupGuestSearch('add');
  setupGuestSearch('edit');

  $('#addReceiptBtn').on('click', function () {
    $('#addReceiptForm')[0].reset();
    $('#addReceiptDate').val(formatReceiptDateInput(new Date()));
    if (window.defaultReceiptReceivedBy) {
      $('#addReceivedBy').val(window.defaultReceiptReceivedBy);
    }
    toggleOtherMethod('add');
    hideGuestSearchResults('add');
    $('#addReceiptModal').modal('show');
  });

  $('#addPaymentMethod, #editPaymentMethod').on('change', function () {
    const prefix = this.id.startsWith('add') ? 'add' : 'edit';
    toggleOtherMethod(prefix);
  });

  $('#addReceiptForm').on('submit', function (e) {
    e.preventDefault();
    createReceipt(true);
  });

  $('#editReceiptForm').on('submit', function (e) {
    e.preventDefault();
    updateReceipt();
  });

  $('#printSelectedReceiptsBtn').on('click', function () {
    printSelectedReceipts();
  });

  $('#receiptSelectAll').on('change', function () {
    const checked = this.checked;
    $('#receiptsTable tbody .receipt-row-check').prop('checked', checked);
    updatePrintSelectedButtonVisibility();
  });

  $('#receiptsTable').on('change', '.receipt-row-check', function () {
    syncReceiptSelectAllState();
    updatePrintSelectedButtonVisibility();
  });
}

function syncReceiptSelectAllState() {
  const $checks = $('#receiptsTable tbody .receipt-row-check');
  const $selectAll = $('#receiptSelectAll');
  if (!$checks.length) {
    $selectAll.prop('checked', false).prop('indeterminate', false);
    return;
  }

  const checkedCount = $checks.filter(':checked').length;
  $selectAll.prop('checked', checkedCount === $checks.length);
  $selectAll.prop('indeterminate', checkedCount > 0 && checkedCount < $checks.length);
}

function getSelectedReceiptIds() {
  return $('#receiptsTable tbody .receipt-row-check:checked')
    .map(function () { return this.value; })
    .get();
}

function updatePrintSelectedButtonVisibility() {
  const $btn = $('#printSelectedReceiptsBtn');
  if (!$btn.length) return;
  const hasSelection = getSelectedReceiptIds().length > 0;
  $btn.toggle(hasSelection);
}

function printSelectedReceipts() {
  const ids = getSelectedReceiptIds();
  if (!ids.length) {
    Swal.fire('No selection', 'Please select at least one receipt to print.', 'info');
    return;
  }

  if (typeof printMultiplePaymentReceipts === 'function') {
    printMultiplePaymentReceipts(ids);
  } else {
    window.open('/payments/receipts/print/bulk?ids=' + encodeURIComponent(ids.join(',')) + '&embed=1', '_blank');
  }
}

function reloadReceiptsData() {
  $.ajax({
    url: '/payments/receipts/api',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      receiptsTable.clear();

      if (!response.success || !response.data || response.data.length === 0) {
        $('#receiptSelectAll').prop('checked', false).prop('indeterminate', false);
        receiptsTable.draw();
        updatePrintSelectedButtonVisibility();
        return;
      }

      response.data.forEach(function (receipt) {
        const actions = `
          <button type="button" class="btn btn-tbl-edit btn-xs" onclick="printReceiptRecord('${receipt.IDNo}')" title="Print">
            <i class="fa fa-print"></i>
          </button>
          <button type="button" class="btn btn-tbl-edit btn-xs" onclick="openEditReceiptModal('${receipt.IDNo}')" title="Edit">
            <i class="fa fa-pencil"></i>
          </button>
          <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteReceipt('${receipt.IDNo}')" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        `;

        const checkbox = `<input type="checkbox" class="receipt-row-check" value="${receipt.IDNo}" aria-label="Select receipt">`;

        receiptsTable.row.add([
          checkbox,
          receipt.RECEIVED_FROM || '',
          receipt.ROOM_NO || '',
          formatReceiptDate(receipt.RECEIPT_DATE),
          formatMoney(receipt.AMOUNT_PAID),
          getMethodLabel(receipt.PAYMENT_METHOD, receipt.PAYMENT_METHOD_OTHER),
          receipt.RECEIVED_BY || '',
          actions
        ]);
      });

      $('#receiptSelectAll').prop('checked', false).prop('indeterminate', false);
      receiptsTable.draw();
      updatePrintSelectedButtonVisibility();
    },
    error: function () {
      Swal.fire('Error', 'Failed to load receipts', 'error');
    }
  });
}

function buildReceiptPayload(prefix) {
  return {
    roomNo: $('#' + prefix + 'RoomNo').val(),
    receiptDate: $('#' + prefix + 'ReceiptDate').val(),
    receivedFrom: $('#' + prefix + 'ReceivedFrom').val(),
    amountPaid: $('#' + prefix + 'AmountPaid').val(),
    paymentMethod: $('#' + prefix + 'PaymentMethod').val(),
    paymentMethodOther: $('#' + prefix + 'PaymentMethodOther').val(),
    purpose: $('#' + prefix + 'Purpose').val(),
    receivedBy: $('#' + prefix + 'ReceivedBy').val()
  };
}

function createReceipt(printAfterSave) {
  $.ajax({
    url: '/payments/receipts/api/create',
    method: 'POST',
    data: buildReceiptPayload('add'),
    success: function (response) {
      if (response.success) {
        $('#addReceiptModal').modal('hide');
        Swal.fire('Saved!', response.message, 'success');
        reloadReceiptsData();
        if (printAfterSave && response.data && response.data.id) {
          printReceiptRecord(response.data.id);
        }
      } else {
        Swal.fire('Error', response.message || 'Failed to save receipt', 'error');
      }
    },
    error: function (xhr) {
      Swal.fire('Error', xhr.responseJSON?.message || 'Failed to save receipt', 'error');
    }
  });
}

function openEditReceiptModal(id) {
  $.ajax({
    url: '/payments/receipts/api/' + id,
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      if (!response.success || !response.data) {
        Swal.fire('Error', response.message || 'Receipt not found', 'error');
        return;
      }

      const receipt = response.data;
      $('#editReceiptId').val(receipt.IDNo);
      $('#editRoomNo').val(receipt.ROOM_NO || '');
      $('#editReceiptDate').val(formatReceiptDateInput(receipt.RECEIPT_DATE));
      $('#editReceivedFrom').val(receipt.RECEIVED_FROM || '');
      $('#editAmountPaid').val(receipt.AMOUNT_PAID || '');
      $('#editPaymentMethod').val((receipt.PAYMENT_METHOD || 'cash').toLowerCase());
      $('#editPaymentMethodOther').val(receipt.PAYMENT_METHOD_OTHER || '');
      $('#editReceivedBy').val(receipt.RECEIVED_BY || '');
      $('#editPurpose').val(receipt.PURPOSE || '');
      toggleOtherMethod('edit');
      hideGuestSearchResults('edit');
      $('#editReceiptModal').modal('show');
    },
    error: function () {
      Swal.fire('Error', 'Failed to load receipt details', 'error');
    }
  });
}

function updateReceipt() {
  const payload = buildReceiptPayload('edit');
  payload.id = $('#editReceiptId').val();

  $.ajax({
    url: '/payments/receipts/api/update',
    method: 'POST',
    data: payload,
    success: function (response) {
      if (response.success) {
        $('#editReceiptModal').modal('hide');
        Swal.fire('Updated!', response.message, 'success');
        reloadReceiptsData();
      } else {
        Swal.fire('Error', response.message || 'Failed to update receipt', 'error');
      }
    },
    error: function (xhr) {
      Swal.fire('Error', xhr.responseJSON?.message || 'Failed to update receipt', 'error');
    }
  });
}

function deleteReceipt(id) {
  Swal.fire({
    title: 'Delete receipt?',
    text: 'This receipt record will be removed.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, delete'
  }).then(function (result) {
    if (!result.isConfirmed) return;

    $.ajax({
      url: '/payments/receipts/api/' + id,
      method: 'DELETE',
      success: function (response) {
        if (response.success) {
          Swal.fire('Deleted!', response.message, 'success');
          reloadReceiptsData();
        } else {
          Swal.fire('Error', response.message || 'Failed to delete receipt', 'error');
        }
      },
      error: function (xhr) {
        Swal.fire('Error', xhr.responseJSON?.message || 'Failed to delete receipt', 'error');
      }
    });
  });
}

function printReceiptRecord(id) {
  const url = '/payments/receipts/print/' + id + '?embed=1';
  if (typeof printPaymentReceipt === 'function') {
    printPaymentReceipt(url);
  } else {
    window.open(url, '_blank');
  }
}

window.openEditReceiptModal = openEditReceiptModal;
window.deleteReceipt = deleteReceipt;
window.printReceiptRecord = printReceiptRecord;
