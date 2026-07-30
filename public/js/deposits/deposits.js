let depositsTable;

$(document).ready(function () {
  initializeDepositsTable();
  loadDepositsData();
});

function initializeDepositsTable() {
  if ($.fn.DataTable.isDataTable('#depositsTable')) {
    $('#depositsTable').DataTable().destroy();
  }

  depositsTable = $('#depositsTable').DataTable({
    order: [[0, 'desc']],
    pageLength: 25,
    lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'All']],
    autoWidth: false,
    language: {
      search: 'Search:',
      emptyTable: 'No security deposits found'
    },
    columnDefs: [
      { targets: [4, 5, 6, 7], className: 'text-end' },
      { targets: [9], className: 'text-center' }
    ]
  });
}

function formatMoney(value) {
  return '₱' + (parseFloat(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatAmountCell(value) {
  const amount = parseFloat(value) || 0;
  return amount > 0 ? formatMoney(amount) : '-';
}

function formatStatus(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'held') {
    return '<span class="deposit-status-held">Held</span>';
  }
  if (normalized === 'refunded') {
    return '<span class="deposit-status-refunded">Refunded</span>';
  }
  return status || '-';
}

function updateSummary(summary) {
  $('#depositsTotalAmount').text(formatMoney(summary?.TOTAL_AMOUNT));
  $('#depositsHeldAmount').text(formatMoney(summary?.HELD_AMOUNT));
  $('#depositsRefundedAmount').text(formatMoney(summary?.REFUNDED_AMOUNT));
}

function loadDepositsData() {
  $.ajax({
    url: '/deposits/api/records',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      depositsTable.clear();

      if (!response.success || !response.data || response.data.length === 0) {
        updateSummary(response.summary || {});
        depositsTable.draw();
        return;
      }

      updateSummary(response.summary);

      response.data.forEach(function (record) {
        depositsTable.row.add([
          formatDateTime(record.COLLECTED_AT),
          record.GUEST_NAME || '-',
          record.ROOM_NUMBER || '-',
          record.CONFIRMATION_NUMBER || '-',
          formatAmountCell(record.AMOUNT),
          formatAmountCell(record.DEDUCTION_AMOUNT),
          formatAmountCell(record.CASH_REFUND_AMOUNT),
          formatAmountCell(record.APPLIED_TO_BALANCE),
          record.PAYMENT_METHOD || '-',
          formatStatus(record.STATUS),
          record.REMARKS || '-'
        ]);
      });

      depositsTable.draw();
    },
    error: function () {
      Swal.fire('Error', 'Failed to load deposits', 'error');
    }
  });
}
