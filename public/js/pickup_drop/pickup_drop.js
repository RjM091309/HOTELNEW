let pickupDropTable;
let pickupDropRecords = {};
let pickupDropFlightScheduleList = null;

$(document).ready(function () {
  initializePickupDropTable();
  setupPickupDropHandlers();
  setupPickupDropFlightSchedule();
});

function initializePickupDropTable() {
  if ($.fn.DataTable.isDataTable('#pickupDropTable')) {
    $('#pickupDropTable').DataTable().destroy();
  }

  pickupDropTable = $('#pickupDropTable').DataTable({
    columnDefs: [
      { targets: 3, className: 'text-center', orderable: false, searchable: false, width: '15%' }
    ],
    pageLength: -1,
    lengthMenu: [[10, 50, 100, -1], [10, 50, 100, 'All']],
    paging: true,
    searching: true,
    ordering: true,
    autoWidth: false,
    dom: 'lfrti',
    language: {
      search: 'Search:',
      info: 'Showing _TOTAL_ entries',
      infoFiltered: '(filtered from _MAX_ total entries)',
      lengthMenu: 'Show _MENU_ entries'
    }
  });

  reloadPickupDropData();
}

function setupPickupDropHandlers() {
  $('#editPickupDropForm').on('submit', function (e) {
    e.preventDefault();
    updatePickupDrop();
  });

  $(document).on('click', '.print-type-option', function () {
    const type = $(this).data('type');
    if (activePrintBookingId) {
      printPickupDrop(activePrintBookingId, type);
    }
    hidePrintTypeMenu();
  });

  $(document).on('click', function (e) {
    if (!$(e.target).closest('.print-type-menu, .btn-tbl-print').length) {
      hidePrintTypeMenu();
    }
  });
}

let activePrintBookingId = null;

function hidePrintTypeMenu() {
  $('#printTypeMenu').hide();
  activePrintBookingId = null;
}

function togglePrintMenu(bookingId, button) {
  const menu = $('#printTypeMenu');
  const isSameButton = activePrintBookingId === String(bookingId) && menu.is(':visible');

  if (isSameButton) {
    hidePrintTypeMenu();
    return;
  }

  activePrintBookingId = String(bookingId);
  const rect = button.getBoundingClientRect();

  menu.css({ visibility: 'hidden', display: 'flex' });
  const menuWidth = menu.outerWidth();
  const menuHeight = menu.outerHeight();
  const top = Math.max(8, rect.top - menuHeight - 6);
  const left = Math.max(8, rect.left + (rect.width / 2) - (menuWidth / 2));

  menu.css({
    top: top,
    left: left,
    visibility: 'visible'
  });
  menu.show();
}

function formatFlightNumber(record) {
  const parts = [record.FLIGHT_NUMBER, record.DROPOFF_FLIGHT_NUMBER]
    .filter(function (value) {
      return value != null && String(value).trim() !== '';
    });

  return parts.join(' / ');
}

function printPickupDrop(bookingId, type) {
  if (!pickupDropRecords[bookingId]) {
    Swal.fire('Error', 'Record not found', 'error');
    return;
  }

  const printType = type === 'dropoff' ? 'dropoff' : 'pickup';
  const record = pickupDropRecords[bookingId];
  const flightNo = printType === 'dropoff' ? record.DROPOFF_FLIGHT_NUMBER : record.FLIGHT_NUMBER;

  if (!flightNo || String(flightNo).trim() === '') {
    Swal.fire('Error', printType === 'dropoff' ? 'No drop-off flight number set' : 'No pick-up flight number set', 'error');
    return;
  }

  hidePrintTypeMenu();

  const existingFrame = document.getElementById('pickupDropPrintFrame');
  if (existingFrame) {
    existingFrame.remove();
  }

  const printUrl = '/pickup-drop/print/' + bookingId + '?embed=1&type=' + printType;

  fetch(printUrl, { credentials: 'same-origin' })
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load print page');
      }
      return response.text();
    })
    .then(function (html) {
      const iframe = document.createElement('iframe');
      iframe.id = 'pickupDropPrintFrame';
      iframe.setAttribute('style', 'position:fixed;top:0;left:0;width:0;height:0;border:0;visibility:hidden;');
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDoc = iframe.contentDocument || frameWindow.document;
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();
      frameDoc.title = '';

      const runPrint = function () {
        if (frameWindow.fitGuestName) {
          frameWindow.fitGuestName();
        }
        setTimeout(function () {
          frameWindow.focus();
          frameWindow.print();
          setTimeout(function () {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 1000);
        }, 150);
      };

      const logoImg = frameDoc.querySelector('.print-logo img');
      if (logoImg && !logoImg.complete) {
        logoImg.onload = function () { setTimeout(runPrint, 200); };
        logoImg.onerror = function () { setTimeout(runPrint, 200); };
      } else {
        setTimeout(runPrint, 300);
      }
    })
    .catch(function () {
      Swal.fire('Error', 'Failed to load print page', 'error');
    });
}

function reloadPickupDropData() {
  $.ajax({
    url: '/pickup-drop/api/records',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      pickupDropTable.clear();

      if (!response.success || !response.data || response.data.length === 0) {
        pickupDropTable.draw();
        return;
      }

      response.data.forEach(function (record) {
        pickupDropRecords[record.BOOKING_ID] = record;

        const actions = `
          <button type="button" class="btn btn-tbl-print btn-xs" onclick="togglePrintMenu('${record.BOOKING_ID}', this)" title="Print">
            <i class="fa fa-print"></i>
          </button>
          <button type="button" class="btn btn-tbl-edit btn-xs" onclick="openEditPickupDropModal('${record.BOOKING_ID}')" title="Edit">
            <i class="fa fa-pencil"></i>
          </button>
          <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deletePickupDrop('${record.BOOKING_ID}')" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        `;

        pickupDropTable.row.add([
          record.NAME || '',
          formatFlightNumber(record),
          record.PASSENGER_COUNT != null ? record.PASSENGER_COUNT : '',
          actions
        ]);
      });

      pickupDropTable.draw();
    },
    error: function () {
      Swal.fire('Error', 'Failed to load pickup & drop records', 'error');
    }
  });
}

function loadPickupDropFlightSchedule(callback) {
  if (Array.isArray(pickupDropFlightScheduleList)) {
    callback(pickupDropFlightScheduleList);
    return;
  }

  $.ajax({
    url: '/flight-schedule/api/flights',
    method: 'GET',
    cache: false,
    success: function (response) {
      pickupDropFlightScheduleList = (response.success && Array.isArray(response.data)) ? response.data : [];
      callback(pickupDropFlightScheduleList);
    },
    error: function () {
      pickupDropFlightScheduleList = [];
      callback(pickupDropFlightScheduleList);
    }
  });
}

function setupPickupDropFlightSchedule() {
  function filterFlightScheduleList(term, codeField) {
    const list = pickupDropFlightScheduleList || [];
    const needle = (term || '').trim().toUpperCase();
    if (!needle) {
      return list;
    }

    return list.filter(function (flight) {
      return (flight[codeField] || '').toUpperCase().includes(needle)
        || (flight.FLIGHT_NUMBER || '').toUpperCase().includes(needle);
    });
  }

  function renderFlightDropdown(dropdownId, list, codeField, inputId) {
    const $dropdown = $('#' + dropdownId);
    if (!list.length) {
      $dropdown.html('<div class="pickup-drop-flight-option">No flight in Flight Schedule</div>').show();
      return;
    }

    $dropdown.empty();
    list.forEach(function (flight) {
      const code = flight[codeField] || '';
      const airline = flight.FLIGHT_NUMBER || '';
      $('<div class="pickup-drop-flight-option"></div>')
        .html('<strong>' + code + '</strong> <span>— ' + airline + '</span>')
        .on('click', function () {
          $('#' + inputId).val(code);
          if (codeField === 'ARRIVAL') {
            $('#editDropoffFlightNumber').val(flight.DEPARTURE || '');
          } else {
            $('#editFlightNumber').val(flight.ARRIVAL || '');
          }
          $dropdown.hide();
        })
        .appendTo($dropdown);
    });
    $dropdown.show();
  }

  function setupFlightLookup(inputId, dropdownId, codeField) {
    $(document).on('input', '#' + inputId, function () {
      renderFlightDropdown(
        dropdownId,
        filterFlightScheduleList($(this).val(), codeField),
        codeField,
        inputId
      );
    });

    $(document).on('focus click', '#' + inputId, function () {
      loadPickupDropFlightSchedule(function () {
        renderFlightDropdown(
          dropdownId,
          filterFlightScheduleList($('#' + inputId).val(), codeField),
          codeField,
          inputId
        );
      });
    });
  }

  setupFlightLookup('editFlightNumber', 'editPickupFlightDropdown', 'ARRIVAL');
  setupFlightLookup('editDropoffFlightNumber', 'editDropoffFlightDropdown', 'DEPARTURE');

  $(document).on('click', function (e) {
    if (!$(e.target).closest('.pickup-drop-flight-field').length) {
      $('.pickup-drop-flight-dropdown').hide();
    }
  });

  $('#editPickupDropModal').on('hidden.bs.modal', function () {
    $('.pickup-drop-flight-dropdown').hide();
  });
}

function openEditPickupDropModal(id) {
  $.ajax({
    url: '/pickup-drop/api/records/' + id,
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      if (!response.success || !response.data) {
        Swal.fire('Error', response.message || 'Record not found', 'error');
        return;
      }

      const record = response.data;
      $('#editPickupDropId').val(record.BOOKING_ID);
      $('#editName').val(record.NAME || '');
      $('#editFlightNumber').val(record.FLIGHT_NUMBER || '');
      $('#editDropoffFlightNumber').val(record.DROPOFF_FLIGHT_NUMBER || '');
      $('#editPersonCount').val(record.PASSENGER_COUNT != null ? record.PASSENGER_COUNT : '');
      $('#editSpecialNotes').val(record.PICKUP_DROP_SPECIAL_NOTES || '');
      $('#editPickupDropModal').modal('show');
    },
    error: function () {
      Swal.fire('Error', 'Failed to load record details', 'error');
    }
  });
}

function updatePickupDrop() {
  $.ajax({
    url: '/pickup-drop/api/records/update',
    method: 'POST',
    data: {
      id: $('#editPickupDropId').val(),
      flightNumber: $('#editFlightNumber').val(),
      dropoffFlightNumber: $('#editDropoffFlightNumber').val(),
      personCount: $('#editPersonCount').val(),
      specialNotes: $('#editSpecialNotes').val()
    },
    success: function (response) {
      if (response.success) {
        $('#editPickupDropModal').modal('hide');
        Swal.fire('Updated!', response.message, 'success');
        reloadPickupDropData();
      } else {
        Swal.fire('Error', response.message || 'Failed to update record', 'error');
      }
    },
    error: function (xhr) {
      Swal.fire('Error', xhr.responseJSON?.message || 'Failed to update record', 'error');
    }
  });
}

function deletePickupDrop(id) {
  Swal.fire({
    title: 'Remove pick up & drop?',
    text: 'This will remove pick-up and drop-off services from the booking.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, remove'
  }).then(function (result) {
    if (!result.isConfirmed) return;

    $.ajax({
      url: '/pickup-drop/api/records/' + id,
      method: 'DELETE',
      success: function (response) {
        if (response.success) {
          Swal.fire('Removed!', response.message, 'success');
          reloadPickupDropData();
        } else {
          Swal.fire('Error', response.message || 'Failed to remove record', 'error');
        }
      },
      error: function (xhr) {
        Swal.fire('Error', xhr.responseJSON?.message || 'Failed to remove record', 'error');
      }
    });
  });
}
