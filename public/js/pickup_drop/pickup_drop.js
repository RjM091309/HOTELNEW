let pickupTable;
let dropoffTable;
let pickupDropRecords = {};
let pickupDropAllRecords = [];
let pickupDropFlightScheduleList = null;
let currentDateFilter = 'today';
let pickupDropVehicleList = null;
let pendingBulkPrint = null;

$(document).ready(function () {
  initializePickupDropTables();
  setupPickupDropHandlers();
  setupPickupDropFlightSchedule();
});

function initializePickupDropTables() {
  const baseOptions = {
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
      lengthMenu: 'Show _MENU_ entries',
      emptyTable: 'No records found.'
    }
  };

  if ($.fn.DataTable.isDataTable('#pickupTable')) {
    $('#pickupTable').DataTable().destroy();
  }
  pickupTable = $('#pickupTable').DataTable({
    ...baseOptions,
    columnDefs: [
      {
        targets: 0,
        className: 'pd-select-col text-center',
        orderable: false,
        searchable: false,
        width: '40px'
      },
      { targets: 5, className: 'text-center', orderable: false, searchable: false, width: '15%' }
    ],
    initComplete: function () {
      $('#pickupTable thead th.pd-select-col')
        .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
        .addClass('sorting_disabled');
    }
  });

  $('#pickupTable').on('draw.dt', function () {
    $('#pickupTable thead th.pd-select-col')
      .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
      .addClass('sorting_disabled');
    syncPickupDropSelectAllState('pickupTable', 'pickupSelectAll');
    updatePrintSelectedButtonVisibility();
  });

  if ($.fn.DataTable.isDataTable('#dropoffTable')) {
    $('#dropoffTable').DataTable().destroy();
  }
  dropoffTable = $('#dropoffTable').DataTable({
    ...baseOptions,
    columnDefs: [
      {
        targets: 0,
        className: 'pd-select-col text-center',
        orderable: false,
        searchable: false,
        width: '40px'
      },
      { targets: 5, className: 'text-center', orderable: false, searchable: false, width: '15%' }
    ],
    initComplete: function () {
      $('#dropoffTable thead th.pd-select-col')
        .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
        .addClass('sorting_disabled');
    }
  });

  $('#dropoffTable').on('draw.dt', function () {
    $('#dropoffTable thead th.pd-select-col')
      .removeClass('sorting sorting_asc sorting_desc sorting_asc_disabled sorting_desc_disabled')
      .addClass('sorting_disabled');
    syncPickupDropSelectAllState('dropoffTable', 'dropoffSelectAll');
    updatePrintSelectedButtonVisibility();
  });

  reloadPickupDropData();
}

function setupPickupDropHandlers() {
  $('#editPickupDropForm').on('submit', function (e) {
    e.preventDefault();
    updatePickupDrop();
  });

  if ($('#editPickupDate').length && !$('#editPickupDate')[0]._flatpickr) {
    flatpickr('#editPickupDate', {
      dateFormat: 'Y-m-d',
      allowInput: true,
      clickOpens: true
    });
  }

  // Pick Up / Drop Off tab switch
  $(document).on('click', '.tab-bar .tab-item[data-view]', function () {
    const view = $(this).data('view');
    $('.tab-bar .tab-item[data-view]').removeClass('is-active');
    $(this).addClass('is-active');

    if (view === 'dropoff') {
      $('#pickupTableWrap').hide();
      $('#dropoffTableWrap').show();
      dropoffTable.columns.adjust();
    } else {
      $('#dropoffTableWrap').hide();
      $('#pickupTableWrap').show();
      pickupTable.columns.adjust();
    }
    updatePrintSelectedButtonVisibility();
  });

  // Today / Previous Week / Future Week / All - applies to both tabs
  $(document).on('click', '.filter-btn-group .filter-btn[data-filter]', function () {
    $('.filter-btn-group .filter-btn').removeClass('active');
    $(this).addClass('active');
    currentDateFilter = $(this).data('filter');
    renderPickupDropTables();
  });

  $('#printSelectedPickupDropBtn').on('click', function () {
    openPickupDropPrintModal();
  });

  $('#confirmPickupDropPrintBtn').on('click', function () {
    confirmPickupDropPrint();
  });

  $('#pdPrintDriverName').on('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmPickupDropPrint();
    }
  });

  $('#pickupSelectAll').on('change', function () {
    const checked = this.checked;
    $('#pickupTable tbody .pd-row-check').prop('checked', checked);
    syncPickupDropSelectAllState('pickupTable', 'pickupSelectAll');
    updatePrintSelectedButtonVisibility();
  });

  $('#dropoffSelectAll').on('change', function () {
    const checked = this.checked;
    $('#dropoffTable tbody .pd-row-check').prop('checked', checked);
    syncPickupDropSelectAllState('dropoffTable', 'dropoffSelectAll');
    updatePrintSelectedButtonVisibility();
  });

  $('#pickupTable').on('change', '.pd-row-check', function () {
    syncPickupDropSelectAllState('pickupTable', 'pickupSelectAll');
    updatePrintSelectedButtonVisibility();
  });

  $('#dropoffTable').on('change', '.pd-row-check', function () {
    syncPickupDropSelectAllState('dropoffTable', 'dropoffSelectAll');
    updatePrintSelectedButtonVisibility();
  });
}

function formatDisplayDate(effectiveDate) {
  if (!effectiveDate) return '';
  return effectiveDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Uses the explicit Pickup Date set on the booking (Add/Edit Booking) when present -
// this is what actually handles late-night arrivals that fall a day after check-in.
// Falls back to CHECK_IN_DATE when no Pickup Date was set.
function getEffectivePickupDate(record) {
  const source = record.PICKUP_DATE || record.CHECK_IN_DATE;
  if (!source) return null;
  const base = new Date(source);
  if (isNaN(base.getTime())) return null;
  base.setHours(0, 0, 0, 0);
  return base;
}

// Pick Up only: today = tomorrow's calendar day (today + 1), prevWeek = the 7 days
// before today, futureWeek = the 7 days after tomorrow (today + 2 to today + 8) so it
// never overlaps with what "today" already shows.
function matchesPickupDateFilter(effectiveDate) {
  if (currentDateFilter === 'all') return true;
  if (!effectiveDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((effectiveDate - today) / (1000 * 60 * 60 * 24));

  if (currentDateFilter === 'today') return diffDays === 1;
  if (currentDateFilter === 'prevWeek') return diffDays >= -7 && diffDays <= -1;
  if (currentDateFilter === 'futureWeek') return diffDays >= 2 && diffDays <= 8;
  return true;
}

// Drop Off: plain rolling window relative to today's actual local date, no +1 offset.
function matchesDropoffDateFilter(effectiveDate) {
  if (currentDateFilter === 'all') return true;
  if (!effectiveDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((effectiveDate - today) / (1000 * 60 * 60 * 24));

  if (currentDateFilter === 'today') return diffDays === 0;
  if (currentDateFilter === 'prevWeek') return diffDays >= -7 && diffDays <= -1;
  if (currentDateFilter === 'futureWeek') return diffDays >= 1 && diffDays <= 7;
  return true;
}

function buildCheckbox(bookingId, printType) {
  return '<input type="checkbox" class="pd-row-check" value="' + bookingId + '" data-type="' + printType + '" aria-label="Select row">';
}

function buildActions(bookingId, printType) {
  const printBtn = `
    <button type="button" class="btn btn-tbl-print btn-xs" onclick="printPickupDrop('${bookingId}', '${printType}')" title="Print">
      <i class="fa fa-print"></i>
    </button>`;

  return `
    ${printBtn}
    <button type="button" class="btn btn-tbl-edit btn-xs" onclick="openEditPickupDropModal('${bookingId}')" title="Edit">
      <i class="fa fa-pencil"></i>
    </button>
    <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deletePickupDrop('${bookingId}')" title="Delete">
      <i class="fa fa-trash"></i>
    </button>
  `;
}

function renderPickupDropTables() {
  pickupTable.clear();
  dropoffTable.clear();

  pickupDropAllRecords.forEach(function (record) {
    const hasPickupFlightNumber = record.FLIGHT_NUMBER != null && String(record.FLIGHT_NUMBER).trim() !== '';
    if (Number(record.HAS_PICKUP) === 1 && hasPickupFlightNumber) {
      const effectiveDate = getEffectivePickupDate(record);
      if (matchesPickupDateFilter(effectiveDate)) {
        const checkInDate = record.CHECK_IN_DATE ? new Date(record.CHECK_IN_DATE) : null;
        if (checkInDate && !isNaN(checkInDate.getTime())) checkInDate.setHours(0, 0, 0, 0);

        pickupTable.row.add([
          buildCheckbox(record.BOOKING_ID, 'pickup'),
          record.NAME || '',
          formatDisplayDate(checkInDate),
          record.FLIGHT_NUMBER || '',
          record.PASSENGER_COUNT != null ? record.PASSENGER_COUNT : '',
          buildActions(record.BOOKING_ID, 'pickup')
        ]);
      }
    }

    const hasDropoffFlightNumber = record.DROPOFF_FLIGHT_NUMBER != null && String(record.DROPOFF_FLIGHT_NUMBER).trim() !== '';
    if (Number(record.HAS_DROPOFF) === 1 && hasDropoffFlightNumber) {
      const dropoffDate = record.CHECK_OUT_DATE ? new Date(record.CHECK_OUT_DATE) : null;
      if (dropoffDate && !isNaN(dropoffDate.getTime())) dropoffDate.setHours(0, 0, 0, 0);
      if (matchesDropoffDateFilter(dropoffDate)) {
        dropoffTable.row.add([
          buildCheckbox(record.BOOKING_ID, 'dropoff'),
          record.NAME || '',
          formatDisplayDate(dropoffDate),
          record.DROPOFF_FLIGHT_NUMBER || '',
          record.PASSENGER_COUNT != null ? record.PASSENGER_COUNT : '',
          buildActions(record.BOOKING_ID, 'dropoff')
        ]);
      }
    }
  });

  pickupTable.draw();
  dropoffTable.draw();

  $('#pickupSelectAll').prop('checked', false).prop('indeterminate', false);
  $('#dropoffSelectAll').prop('checked', false).prop('indeterminate', false);
  updatePrintSelectedButtonVisibility();
}

function getActivePickupDropTableMeta() {
  const isDropoff = $('#dropoffTableWrap').is(':visible');
  return {
    tableId: isDropoff ? 'dropoffTable' : 'pickupTable'
  };
}

function getSelectedPickupDropRows(tableId) {
  return $('#' + tableId + ' tbody .pd-row-check:checked')
    .map(function () {
      return { id: this.value, type: $(this).data('type') };
    })
    .get();
}

function syncPickupDropSelectAllState(tableId, selectAllId) {
  const $checks = $('#' + tableId + ' tbody .pd-row-check');
  const $selectAll = $('#' + selectAllId);
  if (!$checks.length) {
    $selectAll.prop('checked', false).prop('indeterminate', false);
    return;
  }

  const checkedCount = $checks.filter(':checked').length;
  $selectAll.prop('checked', checkedCount === $checks.length);
  $selectAll.prop('indeterminate', checkedCount > 0 && checkedCount < $checks.length);
}

function updatePrintSelectedButtonVisibility() {
  const $btn = $('#printSelectedPickupDropBtn');
  if (!$btn.length) return;
  const { tableId } = getActivePickupDropTableMeta();
  const hasSelection = getSelectedPickupDropRows(tableId).length > 0;
  $btn.toggle(hasSelection);
}

function printSelectedPickupDrop(vehicleId, driverName) {
  const { tableId } = getActivePickupDropTableMeta();
  const selected = getSelectedPickupDropRows(tableId);
  if (!selected.length) {
    Swal.fire('No selection', 'Please select at least one record to print.', 'info');
    return;
  }

  const printType = selected[0].type === 'dropoff' ? 'dropoff' : 'pickup';
  const ids = selected.map(function (item) { return item.id; }).join(',');
  const printUrl = buildPickupDropBulkPrintUrl(ids, printType, vehicleId, driverName);
  loadPickupDropPrintPage(printUrl);
}

function buildPickupDropBulkPrintUrl(ids, printType, vehicleId, driverName) {
  const params = new URLSearchParams({
    ids: ids,
    embed: '1',
    type: printType
  });

  if (vehicleId) {
    params.set('vehicleId', vehicleId);
  }
  if (driverName) {
    params.set('driverName', driverName);
  }

  return '/pickup-drop/print/bulk?' + params.toString();
}

function openPickupDropPrintModal() {
  const { tableId } = getActivePickupDropTableMeta();
  const selected = getSelectedPickupDropRows(tableId);
  if (!selected.length) {
    Swal.fire('No selection', 'Please select at least one record to print.', 'info');
    return;
  }

  const printType = selected[0].type === 'dropoff' ? 'dropoff' : 'pickup';
  const ids = selected.map(function (item) { return item.id; }).join(',');
  pendingBulkPrint = { ids: ids, printType: printType };

  loadPickupDropVehicles(function () {
    populatePickupDropVehicleSelect();
    $('#pdPrintDriverName').val('');

    const modalEl = document.getElementById('pickupDropPrintModal');
    if (!modalEl) {
      printSelectedPickupDrop();
      return;
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    setTimeout(function () {
      $('#pdPrintVehicle').trigger('focus');
    }, 200);
  });
}

function confirmPickupDropPrint() {
  const vehicleId = $('#pdPrintVehicle').val();
  const driverName = $('#pdPrintDriverName').val().trim();

  if (!vehicleId) {
    Swal.fire('Required', 'Please select a vehicle.', 'warning');
    return;
  }

  if (!driverName) {
    Swal.fire('Required', 'Please enter the driver name.', 'warning');
    return;
  }

  if (!pendingBulkPrint) {
    return;
  }

  const modalEl = document.getElementById('pickupDropPrintModal');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  printSelectedPickupDrop(vehicleId, driverName);
  pendingBulkPrint = null;
}

function loadPickupDropVehicles(callback) {
  if (Array.isArray(pickupDropVehicleList)) {
    callback(pickupDropVehicleList);
    return;
  }

  $.ajax({
    url: '/vehicle/api/vehicles',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      pickupDropVehicleList = (response.success && Array.isArray(response.data)) ? response.data : [];
      callback(pickupDropVehicleList);
    },
    error: function () {
      pickupDropVehicleList = [];
      Swal.fire('Error', 'Failed to load vehicles', 'error');
      callback(pickupDropVehicleList);
    }
  });
}

function populatePickupDropVehicleSelect() {
  const $select = $('#pdPrintVehicle');
  const currentValue = $select.val();
  $select.empty();
  $select.append('<option value="">Select vehicle</option>');

  if (!pickupDropVehicleList || !pickupDropVehicleList.length) {
    $select.append('<option value="" disabled>No vehicles available</option>');
    return;
  }

  pickupDropVehicleList.forEach(function (vehicle) {
    const modelName = vehicle.MODEL_NAME || 'Unnamed vehicle';
    const plateNumber = vehicle.PLATE_NUMBER ? ' (' + vehicle.PLATE_NUMBER + ')' : '';
    $('<option></option>')
      .val(vehicle.IDNo)
      .text(modelName + plateNumber)
      .appendTo($select);
  });

  if (currentValue && $select.find('option[value="' + currentValue + '"]').length) {
    $select.val(currentValue);
  }
}

function loadPickupDropPrintPage(printUrl, onComplete) {
  const existingFrame = document.getElementById('pickupDropPrintFrame');
  if (existingFrame) {
    existingFrame.remove();
  }

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
            if (typeof onComplete === 'function') {
              onComplete();
            }
          }, 1000);
        }, 150);
      };

      const logoImgs = frameDoc.querySelectorAll('.print-logo img');
      if (logoImgs.length) {
        let loaded = 0;
        const checkAllLoaded = function () {
          loaded += 1;
          if (loaded >= logoImgs.length) {
            setTimeout(runPrint, 200);
          }
        };

        logoImgs.forEach(function (img) {
          if (img.complete) {
            checkAllLoaded();
          } else {
            img.onload = checkAllLoaded;
            img.onerror = checkAllLoaded;
          }
        });
      } else {
        setTimeout(runPrint, 300);
      }
    })
    .catch(function () {
      Swal.fire('Error', 'Failed to load print page', 'error');
      if (typeof onComplete === 'function') {
        onComplete();
      }
    });
}

function printPickupDrop(bookingId, type, onComplete) {
  if (!pickupDropRecords[bookingId]) {
    Swal.fire('Error', 'Record not found', 'error');
    if (typeof onComplete === 'function') onComplete();
    return;
  }

  const printType = type === 'dropoff' ? 'dropoff' : 'pickup';
  const record = pickupDropRecords[bookingId];
  const flightNo = printType === 'dropoff' ? record.DROPOFF_FLIGHT_NUMBER : record.FLIGHT_NUMBER;

  if (!flightNo || String(flightNo).trim() === '') {
    Swal.fire('Error', printType === 'dropoff' ? 'No drop-off flight number set' : 'No pick-up flight number set', 'error');
    if (typeof onComplete === 'function') onComplete();
    return;
  }

  const printUrl = '/pickup-drop/print/' + bookingId + '?embed=1&type=' + printType;
  loadPickupDropPrintPage(printUrl, onComplete);
}

function reloadPickupDropData() {
  $.ajax({
    url: '/pickup-drop/api/records',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      pickupDropRecords = {};
      pickupDropAllRecords = (response.success && Array.isArray(response.data)) ? response.data : [];

      pickupDropAllRecords.forEach(function (record) {
        pickupDropRecords[record.BOOKING_ID] = record;
      });

      renderPickupDropTables();
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
      if (record.PICKUP_DATE) {
        const pickupDateObj = new Date(record.PICKUP_DATE);
        $('#editPickupDate').val(isNaN(pickupDateObj.getTime()) ? '' : pickupDateObj.toISOString().slice(0, 10));
      } else {
        $('#editPickupDate').val('');
      }
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
      pickupDate: $('#editPickupDate').val(),
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
