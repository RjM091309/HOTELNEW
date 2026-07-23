let flightScheduleTable;
let addArrivalPicker;
let addDeparturePicker;
let editArrivalPicker;
let editDeparturePicker;

const flightDateTimeOptions = {
  enableTime: true,
  dateFormat: 'M d, Y h:i K',
  time_24hr: false,
  allowInput: false,
  disableMobile: true
};

$(document).ready(function () {
  initializeFlightDateTimePickers();
  initializeFlightScheduleTable();
  setupFlightScheduleHandlers();
});

function initializeFlightDateTimePickers() {
  if (typeof flatpickr === 'undefined') return;

  addArrivalPicker = flatpickr('#addArrival', flightDateTimeOptions);
  addDeparturePicker = flatpickr('#addDeparture', flightDateTimeOptions);
  editArrivalPicker = flatpickr('#editArrival', flightDateTimeOptions);
  editDeparturePicker = flatpickr('#editDeparture', flightDateTimeOptions);
}

function clearAddFlightPickers() {
  addArrivalPicker?.clear();
  addDeparturePicker?.clear();
}

function setEditFlightPickers(arrival, departure) {
  if (arrival) {
    editArrivalPicker?.setDate(arrival, true);
  } else {
    editArrivalPicker?.clear();
  }

  if (departure) {
    editDeparturePicker?.setDate(departure, true);
  } else {
    editDeparturePicker?.clear();
  }
}

function initializeFlightScheduleTable() {
  if ($.fn.DataTable.isDataTable('#flightScheduleTable')) {
    $('#flightScheduleTable').DataTable().destroy();
  }

  flightScheduleTable = $('#flightScheduleTable').DataTable({
    columnDefs: [
      { targets: 3, className: 'text-center', orderable: false, searchable: false, width: '15%' }
    ],
    pageLength: 10,
    lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
    searching: true,
    ordering: true,
    autoWidth: false,
    responsive: true,
    language: { search: 'Search:' }
  });

  reloadFlightScheduleData();
}

function setupFlightScheduleHandlers() {
  $('#addFlightScheduleBtn').on('click', function () {
    $('#addFlightScheduleForm')[0].reset();
    clearAddFlightPickers();
    $('#addFlightScheduleModal').modal('show');
  });

  $('#addFlightScheduleForm').on('submit', function (e) {
    e.preventDefault();
    createFlightSchedule();
  });

  $('#editFlightScheduleForm').on('submit', function (e) {
    e.preventDefault();
    updateFlightSchedule();
  });
}

function reloadFlightScheduleData() {
  $.ajax({
    url: '/flight-schedule/api/flights',
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      flightScheduleTable.clear();

      if (!response.success || !response.data || response.data.length === 0) {
        flightScheduleTable.draw();
        return;
      }

      response.data.forEach(function (flight) {
        const actions = `
          <button type="button" class="btn btn-tbl-edit btn-xs" onclick="openEditFlightScheduleModal('${flight.IDNo}')" title="Edit">
            <i class="fa fa-pencil"></i>
          </button>
          <button type="button" class="btn btn-tbl-delete btn-xs" onclick="deleteFlightSchedule('${flight.IDNo}')" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        `;

        flightScheduleTable.row.add([
          flight.FLIGHT_NUMBER || '',
          flight.ARRIVAL || '',
          flight.DEPARTURE || '',
          actions
        ]);
      });

      flightScheduleTable.draw();
    },
    error: function () {
      Swal.fire('Error', 'Failed to load flight schedules', 'error');
    }
  });
}

function createFlightSchedule() {
  $.ajax({
    url: '/flight-schedule/api/flights/create',
    method: 'POST',
    data: {
      flightNumber: $('#addFlightNumber').val(),
      arrival: $('#addArrival').val(),
      departure: $('#addDeparture').val()
    },
    success: function (response) {
      if (response.success) {
        $('#addFlightScheduleModal').modal('hide');
        Swal.fire('Saved!', response.message, 'success');
        reloadFlightScheduleData();
      } else {
        Swal.fire('Error', response.message || 'Failed to save flight', 'error');
      }
    },
    error: function (xhr) {
      Swal.fire('Error', xhr.responseJSON?.message || 'Failed to save flight', 'error');
    }
  });
}

function openEditFlightScheduleModal(id) {
  $.ajax({
    url: '/flight-schedule/api/flights/' + id,
    method: 'GET',
    dataType: 'json',
    success: function (response) {
      if (!response.success || !response.data) {
        Swal.fire('Error', response.message || 'Flight not found', 'error');
        return;
      }

      const flight = response.data;
      $('#editFlightScheduleId').val(flight.IDNo);
      $('#editFlightNumber').val(flight.FLIGHT_NUMBER || '');
      setEditFlightPickers(flight.ARRIVAL || '', flight.DEPARTURE || '');
      $('#editFlightScheduleModal').modal('show');
    },
    error: function () {
      Swal.fire('Error', 'Failed to load flight details', 'error');
    }
  });
}

function updateFlightSchedule() {
  $.ajax({
    url: '/flight-schedule/api/flights/update',
    method: 'POST',
    data: {
      id: $('#editFlightScheduleId').val(),
      flightNumber: $('#editFlightNumber').val(),
      arrival: $('#editArrival').val(),
      departure: $('#editDeparture').val()
    },
    success: function (response) {
      if (response.success) {
        $('#editFlightScheduleModal').modal('hide');
        Swal.fire('Updated!', response.message, 'success');
        reloadFlightScheduleData();
      } else {
        Swal.fire('Error', response.message || 'Failed to update flight', 'error');
      }
    },
    error: function (xhr) {
      Swal.fire('Error', xhr.responseJSON?.message || 'Failed to update flight', 'error');
    }
  });
}

function deleteFlightSchedule(id) {
  Swal.fire({
    title: 'Delete flight?',
    text: 'This flight schedule will be removed.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, delete'
  }).then(function (result) {
    if (!result.isConfirmed) return;

    $.ajax({
      url: '/flight-schedule/api/flights/' + id,
      method: 'DELETE',
      success: function (response) {
        if (response.success) {
          Swal.fire('Deleted!', response.message, 'success');
          reloadFlightScheduleData();
        } else {
          Swal.fire('Error', response.message || 'Failed to delete flight', 'error');
        }
      },
      error: function (xhr) {
        Swal.fire('Error', xhr.responseJSON?.message || 'Failed to delete flight', 'error');
      }
    });
  });
}
