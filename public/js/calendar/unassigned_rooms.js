let calendar;

var date = new Date();
var day = date.getDate();
var month = date.getMonth();
var year = date.getFullYear();

(this.$eventModal = $("#event-modal")),

$(document).ready(function () {
  initCalendar();

  // Side panel toggle
  $('.side-panel-trigger, .side-panel .overlay').click(function () {
    $('.side-panel').toggleClass('opened');
  });

  // Establish a Socket.IO connection
  const socket = io();

  // Listen for real-time booking updates
  socket.on('bookingUpdated', (data) => {
    calendar.refetchEvents(); // Refresh events to reflect real-time changes
  });
});

// Function to open side panel with unassigned rooms for a specific date
function openUnassignedRoomsPanel(date) {
  const formattedDate = new Date(date).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  // Open the side panel and show loading message
  $('.side-panel').toggleClass('opened');
  
  $('.side-panel .content').html(`<p>Loading Unassigned Room details...</p>`);

  // Fetch detailed Unassigned Room for the clicked date
  fetch(`/calendar/api/unassigned-rooms/details?date=${date}`)
    .then((response) => response.json())
    .then((data) => {

      if (!data.success || data.bookings.length === 0) {
        $('.side-panel .content').html(`
          <div style="margin-top: 50px;">
            <h3>Unassigned Rooms Lists - ${formattedDate}</h3>
            <p style="color: #fff;">No unassigned room reservations available for this date.</p>
          </div>
        `);
        return;
      }

      // Fetch available rooms for the dropdown
      populateAvailableRooms().then((rooms) => {
        // Render Unassigned Room details
        const reservationDetails = data.bookings
          .map((booking, index) => renderDirectReservationDetails(booking, index, rooms))
          .join("");

        $('.side-panel .content').html(`
          <div style="margin-top: 50px;">
            <h3>Unassigned Rooms Lists - ${formattedDate}</h3>
            ${reservationDetails}
          </div>
        `);
      });
    })
    .catch((err) => {
      console.error('Error fetching unassigned room reservation details:', err);
      $('.side-panel .content').html(`
        <div style="margin-top: 50px;">
          <h2>Unassigned Rooms Lists - ${date}</h2>
          <p>Error loading unassigned room reservation details.</p>
        </div>
      `);
    });
}

function initCalendar() {
  var calendarEl = $("#calendar").get(0);
  calendar = new FullCalendar.Calendar(calendarEl, {
    plugins: ['interaction', 'dayGrid'],
    header: {
      left: "prev,next today",
      center: "title",
      right: "",
    },
    events: fetchUnassignedRoomEvents,

    dateClick: function (info) {
      const date = info.dateStr;
      openUnassignedRoomsPanel(date);
    },

    eventClick: function (info) {
      // Prevent default behavior
      info.jsEvent.preventDefault();
      info.jsEvent.stopPropagation();
      
      // Get the date from the event
      const eventDate = info.event.start;
      let dateStr;
      
      // Handle different date formats
      if (eventDate instanceof Date) {
        // Format as YYYY-MM-DD
        const year = eventDate.getFullYear();
        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
        const day = String(eventDate.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else if (typeof eventDate === 'string') {
        // If it's already a string, use it directly
        dateStr = eventDate.split('T')[0]; // Remove time if present
      } else {
        // Fallback: try to convert
        dateStr = new Date(eventDate).toISOString().split('T')[0];
      }
      
      // Open the side panel with unassigned rooms for this date
      openUnassignedRoomsPanel(dateStr);
    },
  });

  calendar.render();
}

function fetchUnassignedRoomEvents(fetchInfo, successCallback, failureCallback) {
   fetch(`/calendar/api/unassigned-rooms?start=${fetchInfo.startStr}&end=${fetchInfo.endStr}`)
    .then((response) => {
      if (!response.ok) {
        console.error('Network error occurred:', response.statusText);
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then((data) => {

      const processedEvents = data.map((event) => {
        // Check if any of the reservations for this date are unassigned
        const hasUnassigned = event.extendedProps && event.extendedProps.hasUnassigned;
        
        return {
          id: event.id,
          start: event.start,
          title: event.title,
          allDay: true,
          backgroundColor: hasUnassigned ? '#16da43' : '#6c757d', // Gray for previously unassigned but now assigned, Green for currently unassigned
          borderColor: hasUnassigned ? '#16da43' : '#6c757d',
          extendedProps: event.extendedProps || {}
        };
      });

       successCallback(processedEvents);
    })
    .catch((err) => {
      console.error('Error fetching Unassigned Room events:', err);
      failureCallback(err);
    });
}

// Populate available rooms
async function populateAvailableRooms() {
  try {
    const response = await fetch('/calendar/api/available-rooms');
    if (!response.ok) throw new Error('Failed to fetch available rooms');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.rooms)) {
      throw new Error('Invalid room data received');
    }
    return data.rooms;
  } catch (error) {
    console.error('Error fetching available rooms:', error);
    return [];
  }
}

function renderDirectReservationDetails(booking, index, rooms) {
  // Add "Unassigned" option if the booking doesn't have a room
  const allRoomOptions = ['Unassigned', ...rooms];
  const roomOptions = allRoomOptions
    .map((room) => `<option value="${room}" ${room === booking.roomNumber ? 'selected' : ''}>${room}</option>`)
    .join("");

  return `
<div class="booking-item card-box panel-booking-item" data-id="${booking.id}" data-index="${index}" data-booking-id="${booking.bookingId}" data-check-in="${booking.checkInDate}" data-check-out="${booking.checkOutDate}" data-customer-name="${booking.customerName}" data-bed-count="${booking.bedCount || 1}">
  <div class="booking-item-details">
    <div class="details-row">
      <span class="data room-number room-title">
       #${index + 1} ${booking.roomNumber === 'Unassigned' ? 'Unassigned Room' : `Room ${booking.roomNumber}`} - ${booking.customerName} <span style="color: #6c757d; font-weight: normal;">(${booking.bedCount} Bed${(booking.bedCount) > 1 ? 's' : ''})</span>
      </span>
      <select class="edit-field room-number" style="display: none;">
        ${roomOptions}
      </select>
    </div>
    
    <div class="details-row details-bar">
      <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
        <div style="display: flex; align-items: center;">
          <i class="fa fa-sign-in-alt" style="color: #28a745; margin-right: 8px; font-size: 14px;"></i>
          <span class="data check-in" style="color: #28a745; font-weight: 600;">Check In: ${formatDateTime(booking.checkInDate)}</span>
          <input type="datetime-local" class="edit-field check-in" value="${toDateTimeLocal(booking.checkInDate)}" style="display: none;" />
        </div>
        <div style="display: flex; align-items: center;">
          <i class="fa fa-sign-out-alt" style="color: #dc3545; margin-right: 8px; font-size: 14px;"></i>
          <span class="data check-out" style="color: #dc3545; font-weight: 600;">Check Out: ${formatDateTime(booking.checkOutDate)}</span>
          <input type="datetime-local" class="edit-field check-out" value="${toDateTimeLocal(booking.checkOutDate)}" style="display: none;" />
        </div>
      </div>
      
      <!-- Assign Room Button - Only show if room is unassigned -->
      ${booking.roomNumber === 'Unassigned' ? `
      <button type="button" class="btn btn-success btn-sm assign-room-btn">
        <i class="fa fa-bed" style="margin-right: 6px;"></i> Assign Room
      </button>
      ` : ''}
    </div>
  </div>
</div>
`;
}

// Format date for display
function formatDateTime(dateString) {
  const date = new Date(dateString);

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function toDateTimeLocal(dateString) {
  const date = new Date(dateString);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

// Handle Edit button
$('.side-panel').on('click', '.edit-btn', function () {
  const container = $(this).closest('.booking-item');

  // Store original data
  const originalCheckIn = container.find('.edit-field.check-in').val();
  const originalCheckOut = container.find('.edit-field.check-out').val();
  
  container.data('original-room', container.find('.data.room-number').text());
  container.data('original-check-in', originalCheckIn);
  container.data('original-check-out', originalCheckOut);


  // Hide display labels and show editable fields
  container.find('.room-number, .check-in, .check-out').hide();
  container.find('.edit-field').show();

  // Show Save and Cancel buttons
  $(this).hide();
  container.find('.save-btn, .cancel-btn').show();
});

$('.side-panel').on('click', '.save-btn', function () {
  const container = $(this).closest('.booking-item');
  const bookingId = container.data('id');
  const index = container.data('index');

  const updatedData = {
    room: container.find('.edit-field.room-number').val(),
    checkIn: container.find('.edit-field.check-in').val(),
    checkOut: container.find('.edit-field.check-out').val(),
  };

  fetch('/calendar/update-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: bookingId, ...updatedData }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        const customerName = data.customerName || container.find('.data.room-number').text().split('-').pop().trim();
        container.find('.data.room-number').text(`#${index + 1} Room ${updatedData.room} - ${customerName}`).show();
        container.find('.data.check-in').html(`<strong>Check In:</strong> ${formatDateTime(updatedData.checkIn)}`).show();
        container.find('.data.check-out').html(`<strong>Check Out:</strong> ${formatDateTime(updatedData.checkOut)}`).show();

        // Reset visibility of controls
        container.find('.edit-field').hide();
        container.find('.save-btn, .cancel-btn').hide();
        container.find('.edit-btn').show();
      } else {
        alert('Failed to update Unassigned Room.');
      }
    })
    .catch((err) => {
      console.error('Error updating Unassigned Room:', err);
    });
});

$('.side-panel').on('click', '.cancel-btn', function () {
  const container = $(this).closest('.booking-item');

  // Restore original data from stored values
  const originalCheckIn = container.data('original-check-in');
  const originalCheckOut = container.data('original-check-out');

  container.find('.data.room-number').text(container.data('original-room')).show();
  container.find('.data.check-in').html(`<strong>Check In:</strong> ${formatDateTime(originalCheckIn)}`).show();
  container.find('.data.check-out').html(`<strong>Check Out:</strong> ${formatDateTime(originalCheckOut)}`).show();

  // Reset the input fields for future edits
  container.find('.edit-field.check-in').val(originalCheckIn);
  container.find('.edit-field.check-out').val(originalCheckOut);

  // Hide editing fields and reset buttons
  container.find('.edit-field').hide();
  container.find('.save-btn, .cancel-btn').hide();
  container.find('.edit-btn').show();
});

// Handle Assign Room button click
$('.side-panel').on('click', '.assign-room-btn', function () {
  const container = $(this).closest('.booking-item');
  const bookingId = container.data('booking-id');
  const checkInDate = container.data('check-in');
  const checkOutDate = container.data('check-out');
  const customerName = container.data('customer-name');
  const bedCount = container.data('bed-count');


  // Show available rooms for room assignment
  showAvailableRoomsForDirectReservation(bookingId, checkInDate, checkOutDate, customerName, bedCount);
});

// Function to show available rooms for direct reservations (copied from dashboard)
function showAvailableRoomsForDirectReservation(bookingId, checkInDate, checkOutDate, customerName, bedCount) {
  
  // Format dates for display
  const startDate = new Date(checkInDate);
  const endDate = new Date(checkOutDate);
  const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const diffInTime = endDate.getTime() - startDate.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));
  
  // Fetch available rooms for the specified date range and bed count
  fetch('/booking/available-rooms-bed-count', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate: checkInDate,
      endDate: checkOutDate,
      bedCount: bedCount
    }),
  })
  .then(response => response.json())
  .then(data => {
    if (data.success && data.rooms && data.rooms.length > 0) {
      // Generate room list HTML
      const roomListHTML = generateDirectReservationRoomListHTML(data.rooms, bookingId);
      
      // Show available rooms modal with proper styling
      Swal.fire({
        html: `
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h3 style="margin: 0; font-size: 18px;">Available Rooms</h3>
              <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">(${startFormatted} to ${endFormatted}) - ${bedCount} Bed${bedCount > 1 ? 's' : ''}</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div style="display: flex; gap: 15px; align-items: center;">
                <label style="margin: 0;"><input type="radio" name="directReservationRoomFilter" value="all" checked onchange="filterDirectReservationRooms()"> All</label>
                ${bedCount == 1 ? `
                  <label style="margin: 0;"><input type="radio" name="directReservationRoomFilter" value="1BC" onchange="filterDirectReservationRooms()"> 1BC</label>
                  <label style="margin: 0;"><input type="radio" name="directReservationRoomFilter" value="1BM" onchange="filterDirectReservationRooms()"> 1BM</label>
                ` : ''}
                ${bedCount == 2 ? `
                  <label style="margin: 0;"><input type="radio" name="directReservationRoomFilter" value="2BC" onchange="filterDirectReservationRooms()"> 2BC</label>
                  <label style="margin: 0;"><input type="radio" name="directReservationRoomFilter" value="2BM" onchange="filterDirectReservationRooms()"> 2BM</label>
                ` : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: bold; color: #666;">Available: <span id="directReservationRoomCount">${data.rooms.length}</span></span>
                <input type="text" id="directReservationRoomSearchInput" placeholder="Search Room" onkeyup="filterDirectReservationRooms()" style="width: 130px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px;" />
              </div>
            </div>
          </div>
          
          <div id="directReservationRoomList" style="max-height: 400px; overflow-y: auto;">
            ${roomListHTML}
          </div>
        `,
        width: '735px',
        showConfirmButton: false,
        showCloseButton: false,
        customClass: {
          container: 'direct-reservation-rooms-modal'
        },
        didOpen: () => {
          // Initialize the room list after modal opens
          filterDirectReservationRooms();
        }
      });
    } else {
      // No rooms available
      Swal.fire({
        title: 'No Available Rooms',
        html: `
          <p>No rooms with ${bedCount} bed${bedCount > 1 ? 's' : ''} are available for the selected dates:</p>
          <p><strong>${startFormatted} to ${endFormatted}</strong></p>
          <p>Please try different dates or contact management.</p>
        `,
        icon: 'warning',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error fetching available rooms:', error);
    Swal.fire({
      title: 'Error',
      text: 'Failed to fetch available rooms. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Function to generate room list HTML for direct reservations
function generateDirectReservationRoomListHTML(rooms, bookingId) {
  if (rooms.length === 0) {
    return '<p>No available rooms for the selected date range.</p>';
  }

  // Group rooms by floor
  const roomsByFloor = rooms.reduce((floors, room) => {
    if (!floors[room.ROOM_FLOOR]) {
      floors[room.ROOM_FLOOR] = [];
    }
    floors[room.ROOM_FLOOR].push(room);
    return floors;
  }, {});

  let html = '<div style="max-height: 400px; overflow-y: auto; background-color: #e2f0fa; padding: 5px; border-radius: 8px; box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);">';

  // Iterate through floors and create rows
  Object.keys(roomsByFloor).sort((a, b) => a - b).forEach(floor => {
    const floorRooms = roomsByFloor[floor];
    html += '<div class="room-row" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">';
    
    floorRooms.forEach(room => {
      let roomStyle = ""; // Define styles for each room dynamically

      // Assign styles based on the floor number
      if (floor == 3) {
        roomStyle = "color: #4CAF50; border-top: 3px solid #4CAF50;";
      } else if (floor == 4) {
        roomStyle = "color: #1e1bd6; border-top: 3px solid #1e1bd6;";
      } else if (floor == 5) {
        roomStyle = "color: #df1818; border-top: 3px solid #df1818;";
      } else if (floor == 6) {
        roomStyle = "color: #8A2BE2; border-top: 3px solid #8A2BE2;";
      }

      // Add room item with specific styles
      html += `<div class="room-item" 
        style="${roomStyle} position: relative; background-color: #ffffff; width: 70px; height: 60px; border-radius: 5px; padding: 10px; text-align: center; color: #000; box-sizing: border-box; cursor: pointer;"
        data-bed="${room.ROOM_BED}" 
        data-view="${room.ROOM_VIEW}" 
        data-category="${room.ROOM_BED}${room.ROOM_VIEW == 1 ? 'BC' : 'BM'}"
        onclick="assignRoomToDirectReservation('${bookingId}', '${room.IDNo}', '${room.ROOM_NUMBER}', '${room.ROOM_FLOOR}')">
        
        <div style="font-size: 1.5rem; font-weight: bold; color: #34495e;">${room.ROOM_NUMBER}</div>
        
        <!-- Folded corner effect -->
        <div style="position: absolute; bottom: 0; right: 0; width: 0; height: 0; border-left: 10px solid transparent; border-top: 10px solid #e2f0fa; transform: rotate(85deg); box-shadow: -2px 2px 3px rgba(0, 0, 0, 0.1);"></div>
      </div>`;
    });
    
    html += '</div><br>'; // Add spacing between floors
  });

  html += '</div>';
  return html;
}

// Function to filter direct reservation rooms
function filterDirectReservationRooms() {
  const input = document.getElementById('directReservationRoomSearchInput').value.toLowerCase();
  const selectedCategory = document.querySelector('input[name="directReservationRoomFilter"]:checked').value;
  const rooms = document.querySelectorAll('#directReservationRoomList .room-item');
  let visibleCount = 0;

  rooms.forEach(room => {
    const roomNumber = room.querySelector('div').textContent.toLowerCase();
    const category = room.getAttribute('data-category');

    const matchesSearch = roomNumber.includes(input);
    const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

    const shouldShow = matchesSearch && matchesCategory;
    room.style.display = shouldShow ? 'block' : 'none';

    if (shouldShow) visibleCount++;
  });

  // Update the count
  const countElement = document.getElementById('directReservationRoomCount');
  if (countElement) {
    countElement.textContent = visibleCount;
  }
}

// Function to assign room to direct reservation
function assignRoomToDirectReservation(bookingId, roomId, roomNumber, roomFloor) {
  
  // Get the original direct reservation details first
  fetch('/booking/get-direct-reservation-details', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId }),
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const bookingDetails = data.bookingDetails;
      
      // Close the Available Rooms modal first
      Swal.close();
      
      // Wait a bit for the modal to close, then open the room assignment modal
      setTimeout(() => {
        openAddBookingModalReadOnly(bookingDetails, roomId, roomNumber, roomFloor);
      }, 300);
    } else {
      console.error('Failed to get booking details:', data.message);
      Swal.fire({
        title: 'Error',
        text: 'Failed to get booking details. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error fetching booking details:', error);
    Swal.fire({
      title: 'Error',
      text: 'Failed to get booking details. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Function to add CONFIRM button for room assignment
function addConfirmButton(roomId, roomNumber, roomFloor, bookingId) {
  // Find the modal footer
  const modalFooter = document.querySelector('#modal-addbooking .modal-footer');
  if (modalFooter) {
    // Create CONFIRM button
    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'btn btn-success me-2';
            confirmButton.innerHTML = 'CONFIRM';
    confirmButton.style.fontWeight = 'bold';
    
    // Add click event listener
    confirmButton.addEventListener('click', function() {
      confirmRoomAssignment(roomId, roomNumber, roomFloor, bookingId);
    });
    
            // Insert CONFIRM button after the VOUCHER button
      const voucherButton = modalFooter.querySelector('#btnGenerateVoucherPreview');
      if (voucherButton) {
        voucherButton.parentNode.insertBefore(confirmButton, voucherButton.nextSibling);
      } else {
        // If no voucher button, add to the beginning
        modalFooter.insertBefore(confirmButton, modalFooter.firstChild);
      }
  }
}

// Function to confirm room assignment
function confirmRoomAssignment(roomId, roomNumber, roomFloor, bookingId) {
  // Get current values from the form
  const bookingRoute = document.querySelector('#bookingRoute')?.value || 'walk-in';
  const agencySelect = document.querySelector('#agencySelect');
  const agencyId = agencySelect && agencySelect.style.display !== 'none' ? agencySelect.value : null;
  const paymentStatus = document.querySelector('#paymentStatus')?.value || 'unpaid';
  const breakfastChecked = document.querySelector('#includeBreakfast')?.checked || false;
  const manualPriceChecked = document.querySelector('#manualPriceToggle')?.checked || false;
  const roomPrice = document.querySelector('#price')?.value || '0';
  const remarks = document.querySelector('#bookingRemarks')?.value || '';
  const paidAmount = document.querySelector('#paidAmountHidden')?.value || document.querySelector('#paidAmount')?.value || '0';
  
  // Show confirmation dialog
  Swal.fire({
    title: 'Confirm Room Assignment?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#28a745',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, Confirm',
    cancelButtonText: 'Cancel',
    width: '450px',
    customClass: {
      popup: 'swal-custom-popup',
      confirmButton: 'swal-confirm-btn',
      cancelButton: 'swal-cancel-btn'
    }
  }).then((result) => {
    if (result.isConfirmed) {
      // First, attempt to generate/print the voucher in a new tab
      try {
        // Build and submit a hidden form to download the voucher (no new tab)
        const daterangeVal = document.querySelector('#daterange')?.value || '';
        const dateFrom = daterangeVal.split(' to ')[0] || '';
        const dateToRaw = (daterangeVal.split(' to ')[1] || '');
        const dateTo = dateToRaw.includes('(') ? dateToRaw.split('(')[0].trim() : dateToRaw.trim();

        const agencyName = document.querySelector('#agencySelect option:checked')?.text || '';
        const guestName = document.querySelector('#txtFullNameAdd')?.value || '';
        const selectedRoomText = document.querySelector('#addroom option:checked')?.text || document.querySelector('#addroom')?.value || roomNumber;

        const bookingData = {
          voucherNo: document.querySelector('#voucherNo')?.value || '',
          fullname: (bookingRoute === 'agency') ? agencyName : guestName,
          contactNumber: document.querySelector('#txtNumber')?.value || '',
          dateFrom: dateFrom,
          dateTo: dateTo,
          bedCount: document.querySelector('#bedCount')?.value || '',
          roomNumber: selectedRoomText,
          roomView: document.querySelector('#room_type')?.value || '',
          roomType: document.querySelector('#room_type_hidden')?.value || '',
          roomRate: document.querySelector('#price')?.value || '0.00',
          breakfastAdult: document.querySelector('#breakfastAdultQty')?.value || '',
          breakfastAdultPrice: document.querySelector('#breakfastAdultPrice')?.value || '500.00',
          breakfastKid: document.querySelector('#breakfastKidQty')?.value || '',
          breakfastKidPrice: document.querySelector('#breakfastKidPrice')?.value || '350.00',
          pickup: (document.querySelector('#includePickup')?.checked ? (document.querySelector('#pickupPrice')?.value || 0) : 0),
          dropoff: (document.querySelector('#includeDropoff')?.checked ? (document.querySelector('#dropoffPrice')?.value || 0) : 0),
          remarks: remarks,
          total: document.querySelector('#computedTotal')?.textContent || '',
          checkInStatus: document.querySelector('#checkInStatus')?.value || '',
          reservationFee: (document.querySelector('#includeReservationFee')?.checked ? (document.querySelector('#reservationFeeAmount')?.value || 0) : 0),
          discount: (document.querySelector('#includeDiscount')?.checked ? (document.querySelector('#discountAmount')?.value || 0) : 0)
        };

        // Ensure a hidden iframe exists to keep download in the same page without opening a new tab
        let downloadFrame = document.querySelector('iframe[name="hiddenDownloadFrame"]');
        if (!downloadFrame) {
          downloadFrame = document.createElement('iframe');
          downloadFrame.name = 'hiddenDownloadFrame';
          downloadFrame.style.display = 'none';
          document.body.appendChild(downloadFrame);
        }

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/booking/generate-voucher?download=1';
        form.target = 'hiddenDownloadFrame';
        for (const [key, value] of Object.entries(bookingData)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        form.remove();
      } catch (e) {
        console.error('Voucher generation failed:', e);
      }

      // Proceed with room assignment after attempting to print voucher
      processRoomAssignment(roomId, roomNumber, roomFloor, bookingId, {
        bookingRoute,
        agencyId,
        paymentStatus,
        breakfastChecked,
        manualPriceChecked,
        roomPrice,
        remarks,
        paidAmount,
        breakfastAdultQty: document.querySelector('#breakfastAdultQty')?.value || '',
        breakfastKidQty: document.querySelector('#breakfastKidQty')?.value || '',
        breakfastAdultPrice: document.querySelector('#breakfastAdultPrice')?.value || '500.00',
        breakfastKidPrice: document.querySelector('#breakfastKidPrice')?.value || '350.00'
      });
    }
  });
}

// Function to process room assignment to direct reservation
function processRoomAssignment(roomId, roomNumber, roomFloor, bookingId, formData) {
  // Show loading state
  Swal.fire({
    title: 'Assigning Room...',
    text: 'Please wait while we process your request.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Make API call to assign room
  fetch('/booking/assign_room_to_direct_reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bookingId: bookingId,
      roomId: roomId,
      roomNumber: roomNumber,
      roomFloor: roomFloor,
      roomType: 'Standard', // You can modify this based on your needs
      roomPrice: formData.roomPrice,
      bookingRoute: formData.bookingRoute,
      paymentStatus: formData.paymentStatus,
      paidAmount: formData.paidAmount,
      breakfastChecked: formData.breakfastChecked,
      breakfastAdultQty: formData.breakfastAdultQty,
      breakfastAdultPrice: formData.breakfastAdultPrice,
      breakfastKidQty: formData.breakfastKidQty,
      breakfastKidPrice: formData.breakfastKidPrice
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Success - show confirmation and close modal
      Swal.fire({
        title: 'Room Assignment Successful!',
        icon: 'success',
        confirmButtonColor: '#28a745',
        confirmButtonText: 'OK'
      }).then(() => {
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.querySelector('#modal-addbooking'));
        if (modal) {
          modal.hide();
        }
        // Refresh the dashboard to show updated status
        location.reload();
      });
    } else {
      // Error
      Swal.fire({
        title: 'Room Assignment Failed',
        text: data.message || 'An error occurred while assigning the room.',
        icon: 'error',
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error assigning room:', error);
    Swal.fire({
      title: 'Room Assignment Failed',
      text: 'An error occurred while processing your request.',
      icon: 'error',
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'OK'
    });
  });
}



 // Function to highlight enabled fields with borders
 function highlightEnabledFields() {
    
  // List of field IDs that are enabled (not disabled)
  const enabledFieldIds = [
    'bookingRoute',           // Booking Resources
    'agencySelect',           // Select Agency (when shown)
    'paymentStatus',          // Payment Status
    'includeBreakfast',       // Breakfast checkbox
    'breakfastAdultQty',      // Breakfast Adult Quantity
    'breakfastKidQty',        // Breakfast Kids Quantity
    'manualPriceToggle',      // Enter Price Manually checkbox
    'bookingRemarks',         // Additional Remarks
    'paidAmount'              // Paid Amount
  ];
  
  // Add highlight styling to enabled fields
  enabledFieldIds.forEach(fieldId => {
    const field = document.querySelector(`#${fieldId}`);
    if (field && !field.disabled) {
      // Add highlight border
      field.style.border = '2px solid #28a745'; // Green border for enabled fields
      field.style.borderRadius = '4px';
      field.style.boxShadow = '0 0 5px rgba(40, 167, 69, 0.3)'; // Subtle green glow
      
    }
  });
  
  // Special handling for agency field (only highlight when visible)
  const agencyWrapper = document.querySelector('#agencySelectWrapper');
  if (agencyWrapper && agencyWrapper.style.display !== 'none') {
    const agencySelect = document.querySelector('#agencySelect');
    if (agencySelect && !agencySelect.disabled) {
      agencySelect.style.border = '2px solid #28a745';
      agencySelect.style.borderRadius = '4px';
      agencySelect.style.boxShadow = '0 0 5px rgba(40, 167, 69, 0.3)';
    }
  }
}

// Function to enable Breakfast functionality
function enableBreakfastFunctionality() {
  const breakfastCheckbox = document.querySelector('#includeBreakfast');
  const breakfastInputs = document.querySelector('#breakfastInputs');
  
  if (breakfastCheckbox) {
    // Enable the checkbox
    breakfastCheckbox.disabled = false;
    
    // Add event listener to show/hide breakfast inputs
    breakfastCheckbox.addEventListener('change', function() {
      if (this.checked) {
        if (breakfastInputs) {
          breakfastInputs.style.display = 'block';
        }
      } else {
        if (breakfastInputs) {
          breakfastInputs.style.display = 'none';
        }
      }
      // Recalculate total when breakfast changes
      if (typeof computeTotal === 'function') {
        computeTotal();
      }
    });
  }
  
  // Enable breakfast quantity and price fields
  const breakfastFields = ['#breakfastAdultQty', '#breakfastKidQty'];
  breakfastFields.forEach(selector => {
    const field = document.querySelector(selector);
    if (field) {
      field.disabled = false;
      // Add event listener to recalculate total
      field.addEventListener('input', function() {
        if (typeof computeTotal === 'function') {
          computeTotal();
        }
      });
    }
  });
}

// Function to fetch and populate pickup/dropoff services
function fetchBookingServices(bookingId) {
  fetch('/booking/get-booking-services', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookingId: bookingId })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success && data.services) {
      // Populate pickup service
      if (data.services.pickup) {
        const pickupCheckbox = document.querySelector('#includePickup');
        const pickupServiceId = document.querySelector('#pickupServiceId');
        const pickupPrice = document.querySelector('#pickupPrice');
        const pickupWrapper = document.querySelector('#pickupWrapper');
        
        if (pickupCheckbox) {
          pickupCheckbox.checked = true;
          pickupCheckbox.disabled = true; // Disable since it's read-only
        }
        if (pickupServiceId) {
          pickupServiceId.value = data.services.pickup.serviceId;
        }
        if (pickupPrice) {
          pickupPrice.value = data.services.pickup.totalCost;
        }
        if (pickupWrapper) {
          pickupWrapper.style.display = 'block'; // Show the price field
        }
      }
      
      // Populate dropoff service
      if (data.services.dropoff) {
        const dropoffCheckbox = document.querySelector('#includeDropoff');
        const dropoffServiceId = document.querySelector('#dropoffServiceId');
        const dropoffPrice = document.querySelector('#dropoffPrice');
        const dropoffWrapper = document.querySelector('#dropoffWrapper');
        
        if (dropoffCheckbox) {
          dropoffCheckbox.checked = true;
          dropoffCheckbox.disabled = true; // Disable since it's read-only
        }
        if (dropoffServiceId) {
          dropoffServiceId.value = data.services.dropoff.serviceId;
        }
        if (dropoffPrice) {
          dropoffPrice.value = data.services.dropoff.totalCost;
        }
        if (dropoffWrapper) {
          dropoffWrapper.style.display = 'block'; // Show the price field
        }
      }
      
      // Recalculate total after services are populated
      if (typeof computeTotal === 'function') {
        computeTotal();
      }
    }
  })
  .catch(error => {
    console.error('Error fetching booking services:', error);
  });
}

function openAddBookingModalReadOnly(bookingDetails, roomId, roomNumber, roomFloor) {
  // Get room details for the selected room
  $.ajax({
    url: '/booking/get-room-details',
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ roomId }),
    success: function(response) {
      if (response.success) {
        const roomDetails = response.roomDetails;
        
        // Open the Add Booking modal
        const addBookingModalElement = document.getElementById('modal-addbooking');
        if (addBookingModalElement) {
          // Show the modal
          const addBookingModal = new bootstrap.Modal(addBookingModalElement);
          addBookingModal.show();
          
          // Set modal title
          const modalTitle = addBookingModalElement.querySelector('.modal-title');
          if (modalTitle) {
            modalTitle.innerHTML = `Room Assignment - ${roomNumber}`;
          }
          
          // Pre-fill room details (read-only)
          const roomNumberField = addBookingModalElement.querySelector('#addroom');
          
          if (roomNumberField) {
            // Handle both input and select elements
            if (roomNumberField.tagName === 'SELECT') {
              // Clear existing options and add the room option
              roomNumberField.innerHTML = '';
              const roomOption = document.createElement('option');
              roomOption.value = roomId;
              roomOption.textContent = roomNumber;
              roomOption.selected = true;
              roomNumberField.appendChild(roomOption);
            } else {
              // For input elements, set value directly
              roomNumberField.value = roomNumber;
            }
            
            roomNumberField.disabled = true;
          }
          
          const floorField = addBookingModalElement.querySelector('#addFloor');
          if (floorField) {
            floorField.value = roomFloor;
            floorField.disabled = true;
          }
          
          const roomTypeField = addBookingModalElement.querySelector('#room_type');
          if (roomTypeField) {
            // Map numeric values to text descriptions
            let viewText = '';
            if (roomDetails.ROOM_VIEW == 1) {
              viewText = 'Condo View';
            } else if (roomDetails.ROOM_VIEW == 2) {
              viewText = 'Mountain View';
            } else {
              viewText = roomDetails.ROOM_VIEW || '';
            }
            
            roomTypeField.value = viewText;
            roomTypeField.disabled = true;
          }
          
          // Set the room_type_hidden field with the numeric room type
          const roomTypeHiddenField = addBookingModalElement.querySelector('#room_type_hidden');
          if (roomTypeHiddenField) {
            roomTypeHiddenField.value = roomDetails.ROOM_TYPE || '';
          }
          
          const bedCountField = addBookingModalElement.querySelector('#bedCount');
          if (bedCountField) {
            bedCountField.value = roomDetails.ROOM_BED || '';
            bedCountField.disabled = true;
          }
          
          const roomRateField = addBookingModalElement.querySelector('#price');
          if (roomRateField) {
            // Calculate seasonal price based on bed count, booking type, and season
            const seasonalPrices = roomDetails.SEASONAL_PRICES || [];
            const selectedBedCount = roomDetails.ROOM_BED || '';
            const selectedBookingType = 'walk-in'; // Default for direct reservations
            const checkInDate = new Date(bookingDetails.daterange.split(' to ')[0]);
            
            // Get season ID for the check-in date
            function getSeasonIdForDate(checkInDate, seasonalPrices) {
              const checkIn = new Date(checkInDate);
              const mmdd = (checkIn.getMonth() + 1).toString().padStart(2, '0') + checkIn.getDate().toString().padStart(2, '0');
              
              const seen = new Set();
              for (const p of seasonalPrices) {
                if (!p.startDate || !p.endDate || seen.has(p.seasonId)) continue;
                seen.add(p.seasonId);
                
                const start = new Date(p.startDate);
                const end = new Date(p.endDate);
                
                const startMMDD = (start.getMonth() + 1).toString().padStart(2, '0') + start.getDate().toString().padStart(2, '0');
                const endMMDD = (end.getMonth() + 1).toString().padStart(2, '0') + end.getDate().toString().padStart(2, '0');
                
                if (startMMDD <= endMMDD) {
                  if (mmdd >= startMMDD && mmdd <= endMMDD) return p.seasonId;
                } else {
                  if (mmdd >= startMMDD || mmdd <= endMMDD) return p.seasonId;
                }
              }
              return null;
            }
            
            // Find matching seasonal price
            const currentSeasonId = getSeasonIdForDate(checkInDate, seasonalPrices);
            const match = seasonalPrices.find(p =>
              parseInt(p.bedCount) === parseInt(selectedBedCount) &&
              p.bookingType === selectedBookingType &&
              parseInt(p.seasonId) === parseInt(currentSeasonId)
            );
            
            let pricePerNight = 0;
            if (match) {
              pricePerNight = parseFloat(match.price);
            } else {
              // Fallback to default room price
              pricePerNight = parseFloat(roomDetails.ROOM_PRICE) || 0;
            }
            
            roomRateField.value = pricePerNight.toFixed(2);
            roomRateField.disabled = true;
            
            // Set the baseprice hidden field with the calculated price
            const basePriceField = addBookingModalElement.querySelector('#baseprice');
            if (basePriceField) {
              basePriceField.value = pricePerNight.toFixed(2);
            }
            
            // Handle manual price toggle functionality
            const manualPriceToggle = addBookingModalElement.querySelector('#manualPriceToggle');
            if (manualPriceToggle) {
              // Enable the checkbox for user interaction
              manualPriceToggle.disabled = false;
              
              // Add event listener for manual price toggle
              manualPriceToggle.addEventListener('change', function() {
                if (this.checked) {
                  // Allow manual price entry
                  roomRateField.disabled = false;
                  roomRateField.readOnly = false;
                  roomRateField.style.backgroundColor = '#ffffff'; // White background for editing
                  roomRateField.style.color = '#000000'; // Black text for editing
                  
                  // Add input event listener to update baseprice when user types
                  roomRateField.addEventListener('input', function() {
                    if (basePriceField) {
                      basePriceField.value = this.value;
                    }
                    // Recalculate total when price changes
                    if (typeof computeTotal === 'function') {
                      computeTotal();
                    }
                  });
                } else {
                  // Lock price field and restore calculated price
                  roomRateField.disabled = true;
                  roomRateField.readOnly = true;
                  roomRateField.style.backgroundColor = '#f8f9fa'; // Light gray background for disabled
                  roomRateField.style.color = '#6c757d'; // Gray text for disabled
                  // Restore the calculated price based on CURRENT selected booking route
                  const currentBookingRoute = document.querySelector('#bookingRoute')?.value;
                  updateRoomPrice(roomDetails, bookingDetails, currentBookingRoute);
                  // Also update the baseprice field
                  if (basePriceField) {
                    basePriceField.value = roomRateField.value;
                  }
                  // Recalculate total when price is restored
                  if (typeof computeTotal === 'function') {
                    computeTotal();
                  }
                }
              });
            }
          }
          
          // Handle booking resources mapping
          let bookingRouteField = addBookingModalElement.querySelector('#bookingRoute');
          if (bookingRouteField) {
            // For direct reservations, show the original booking route
            // If it's 'direct-reservation', show as 'Walk-in' (default)
            const routeValue = bookingDetails.bookingRoute || '';
            if (routeValue === 'direct-reservation' || routeValue === 'walk-in') {
              bookingRouteField.value = 'walk-in';
            } else if (routeValue === 'agency') {
              bookingRouteField.value = 'agency';
            } else if (routeValue === 'booking-channel') {
              bookingRouteField.value = 'booking-channel';
            } else {
              // Default to walk-in
              bookingRouteField.value = 'walk-in';
            }
            // NOT disabled - user can change this
          }
          
          // Pre-fill booking details from direct reservation (read-only)
          const guestNameField = addBookingModalElement.querySelector('#txtFullNameAdd');
          if (guestNameField) {
            guestNameField.value = bookingDetails.fullname || '';
            guestNameField.disabled = true;
          }
          
          const contactField = addBookingModalElement.querySelector('#txtNumber');
          if (contactField) {
            contactField.value = bookingDetails.number || '';
            contactField.disabled = true;
          }
          
          const addressField = addBookingModalElement.querySelector('#txtAddress');
          if (addressField) {
            addressField.value = bookingDetails.address || '';
            addressField.disabled = true;
          }
          
          const dateRangeField = addBookingModalElement.querySelector('#daterange');
          if (dateRangeField) {
            // Format the date range to include nights
            const nights = bookingDetails.diffindays || 0;
            const dateRangeValue = `${bookingDetails.daterange || ''} (${nights} night/s)`;
            dateRangeField.value = dateRangeValue;
            dateRangeField.disabled = true;
          }
          
          const nightsField = addBookingModalElement.querySelector('#diffindays');
          if (nightsField) {
            nightsField.value = bookingDetails.diffindays || '';
            nightsField.disabled = true;
          }
          
          // Handle check-in status mapping
          const checkInStatusField = addBookingModalElement.querySelector('#checkInStatus');
          
          if (checkInStatusField) {
            // Set the value directly to the numeric checkInStatus from bookingDetails
            // The select element will automatically pick the option with this value
            checkInStatusField.value = bookingDetails.checkInStatus;
            checkInStatusField.disabled = true;
          }
          
          // Handle payment status mapping
          const paymentStatusField = addBookingModalElement.querySelector('#paymentStatus');
          if (paymentStatusField) {
            // Set the payment status value from bookingDetails
            paymentStatusField.value = bookingDetails.paymentStatus || 'unpaid';
            paymentStatusField.disabled = false; // Enable for user interaction
            
            // Add event listener to recalculate total when payment status changes
            paymentStatusField.addEventListener('change', function() {
              if (typeof computeTotal === 'function') {
                computeTotal();
              }
            });
          }
          
          // Handle paid amount - populate from booking details
          const paidAmountField = addBookingModalElement.querySelector('#paidAmount');
          const paidAmountHiddenField = addBookingModalElement.querySelector('#paidAmountHidden');
          if (paidAmountField && bookingDetails.paidAmount) {
            const paidAmount = parseFloat(bookingDetails.paidAmount) || 0;
            paidAmountField.value = paidAmount.toFixed(2);
            if (paidAmountHiddenField) {
              paidAmountHiddenField.value = paidAmount.toFixed(2);
            }
            // Recalculate total after setting paid amount
            if (typeof computeTotal === 'function') {
              setTimeout(() => {
                computeTotal();
              }, 100);
            }
          }
          
          // Handle booking remarks
          const remarksField = addBookingModalElement.querySelector('#bookingRemarks');
          if (remarksField) {
            remarksField.value = bookingDetails.bookingRemarks || '';
            remarksField.disabled = false; // Enable for user to add/modify remarks
          }
          
          // Handle Guest Type and Guest Level

          
          // Convert Guest Type and Guest Level to input text fields
          const guestTypeField = addBookingModalElement.querySelector('#guestType');
          if (guestTypeField) {
            // Convert select to input text
            const guestTypeInput = document.createElement('input');
            guestTypeInput.type = 'text';
            guestTypeInput.className = 'form-control';
            guestTypeInput.id = 'guestType';
            guestTypeInput.name = 'guestType';
            guestTypeInput.value = bookingDetails.guestType || '';
            guestTypeInput.disabled = true; // Keep disabled for read-only
            guestTypeInput.readOnly = true;
            
            // Replace the select with input
            guestTypeField.parentNode.replaceChild(guestTypeInput, guestTypeField);
          }
          
          const guestLevelField = addBookingModalElement.querySelector('#guestLevel');
          if (guestLevelField) {
            // Convert select to input text
            const guestLevelInput = document.createElement('input');
            guestLevelInput.type = 'text';
            guestLevelInput.className = 'form-control';
            guestLevelInput.id = 'guestLevel';
            guestLevelInput.name = 'guestLevel';
            guestLevelInput.value = bookingDetails.guestLevel || '';
            guestLevelInput.disabled = true; // Keep disabled for read-only
            guestLevelInput.readOnly = true;
            
            // Replace the select with input
            guestLevelField.parentNode.replaceChild(guestLevelInput, guestLevelField);
          }
          
          // Disable all other input fields
          const allInputs = addBookingModalElement.querySelectorAll('input, select, textarea');
          allInputs.forEach(input => {
            if (!input.id || !['addroom', 'addFloor', 'room_type', 'bedCount', 'price', 'txtFullNameAdd', 'txtNumber', 'txtAddress', 'daterange', 'diffindays', 'checkInStatus', 'paymentStatus', 'bookingRoute', 'agencySelect', 'manualPriceToggle', 'includeBreakfast', 'breakfastAdultQty', 'breakfastAdultPrice', 'breakfastKidQty', 'breakfastKidPrice', 'bookingRemarks', 'guestType', 'guestLevel', 'paidAmount'].includes(input.id)) {
              input.disabled = true;
            }
          });
          
                      // Explicitly enable the booking route field
          if (bookingRouteField) {
            bookingRouteField.disabled = false;
            
            // Add event listener to update price when booking route changes
            bookingRouteField.addEventListener('change', function() {
              updateRoomPrice(roomDetails, bookingDetails, this.value);
              handleAgencyFieldVisibility(this.value);
            });
            
            // Handle agency field visibility and population
            function handleAgencyFieldVisibility(selectedBookingType) {
              const agencyWrapper = addBookingModalElement.querySelector('#agencySelectWrapper');
              const agencySelect = addBookingModalElement.querySelector('#agencySelect');
              
              if (selectedBookingType === 'agency') {
                // Show agency field
                if (agencyWrapper) agencyWrapper.style.display = 'block';
                
                // Enable agency select field
                if (agencySelect) agencySelect.disabled = false;
                
                // Populate agency dropdown if not already populated
                if (agencySelect && agencySelect.options.length <= 1) {
                  populateAgencyDropdown(agencySelect);
                }
              } else {
                // Hide agency field
                if (agencyWrapper) agencyWrapper.style.display = 'none';
                
                // Disable agency select field when hidden
                if (agencySelect) agencySelect.disabled = true;
              }
            }
            
            // Populate agency dropdown with available agencies
            function populateAgencyDropdown(agencySelect) {
              // Fetch agencies from backend
              fetch('/booking/get-agencies')
                .then(response => response.json())
                .then(data => {
                  if (data.success && data.agencies) {
                    // Clear existing options except the first one
                    while (agencySelect.options.length > 1) {
                      agencySelect.remove(1);
                    }
                    
                    // Add agency options with matching dark theme style
                    data.agencies.forEach(agency => {
                      const option = document.createElement('option');
                      option.value = agency.IDNo;
                      option.textContent = agency.NAME; // Using NAME as per your database change
                      option.style.color = '#ffffff'; // White text for dropdown options
                      option.style.backgroundColor = '#495057'; // Dark background for options
                      agencySelect.appendChild(option);
                    });
                    
                    // Style the select element to match the dark theme
                    agencySelect.style.color = '#ffffff'; // White text for selected value
                    agencySelect.style.backgroundColor = '#495057'; // Dark background
                    agencySelect.style.border = '1px solid #6c757d'; // Light gray border
                  }
                })
                .catch(error => {
                  console.error('Error fetching agencies:', error);
                });
            }
            
            // Check initial state and show agency field if needed
            if (bookingRouteField.value === 'agency') {
              handleAgencyFieldVisibility('agency');
            }
          }
          
          // Function to update room price based on seasonal pricing
          function updateRoomPrice(roomDetails, bookingDetails, selectedBookingType) {
            const roomRateField = addBookingModalElement.querySelector('#price');
            if (!roomRateField) return;
            
            const seasonalPrices = roomDetails.SEASONAL_PRICES || [];
            const selectedBedCount = roomDetails.ROOM_BED || '';
            const checkInDate = new Date(bookingDetails.daterange.split(' to ')[0]);
            
            // Get season ID for the check-in date
            function getSeasonIdForDate(checkInDate, seasonalPrices) {
              const checkIn = new Date(checkInDate);
              const mmdd = (checkIn.getMonth() + 1).toString().padStart(2, '0') + checkIn.getDate().toString().padStart(2, '0');
              
              const seen = new Set();
              for (const p of seasonalPrices) {
                if (!p.startDate || !p.endDate || seen.has(p.seasonId)) continue;
                seen.add(p.seasonId);
                
                const start = new Date(p.startDate);
                const end = new Date(p.endDate);
                
                const startMMDD = (start.getMonth() + 1).toString().padStart(2, '0') + start.getDate().toString().padStart(2, '0');
                const endMMDD = (end.getMonth() + 1).toString().padStart(2, '0') + end.getDate().toString().padStart(2, '0');
                
                if (startMMDD <= endMMDD) {
                  if (mmdd >= startMMDD && mmdd <= endMMDD) return p.seasonId;
                } else {
                  if (mmdd >= startMMDD || mmdd <= endMMDD) return p.seasonId;
                }
              }
              return null;
            }
            
            // Find matching seasonal price
            const currentSeasonId = getSeasonIdForDate(checkInDate, seasonalPrices);
            const match = seasonalPrices.find(p =>
              parseInt(p.bedCount) === parseInt(selectedBedCount) &&
              p.bookingType === selectedBookingType &&
              parseInt(p.seasonId) === parseInt(currentSeasonId)
            );
            
            let pricePerNight = 0;
            if (match) {
              pricePerNight = parseFloat(match.price);
            } else {
              // Fallback to default room price
              pricePerNight = parseFloat(roomDetails.ROOM_PRICE) || 0;
            }
            
            roomRateField.value = pricePerNight.toFixed(2);
          }
          
          // Hide the save button and show only close button
          const saveButton = addBookingModalElement.querySelector('button[type="submit"]');
          if (saveButton) {
            saveButton.style.display = 'none';
          }
          

          
          // Add CONFIRM button for room assignment
          addConfirmButton(roomId, roomNumber, roomFloor, bookingDetails.bookingId);
          
          // Calculate the initial total after all fields are populated
          if (typeof computeTotal === 'function') {
            // Use setTimeout to ensure all DOM updates are complete
            setTimeout(() => {
              computeTotal();
            }, 100);
          }
          
          // Fetch and populate pickup/dropoff services
          fetchBookingServices(bookingDetails.bookingId);
          
          // Enable Breakfast functionality
          enableBreakfastFunctionality();
          
          // Handle Reservation Fee and Discount from Direct Reservation
          if (bookingDetails.reservationFee && parseFloat(bookingDetails.reservationFee) > 0) {
            const reservationFeeCheckbox = addBookingModalElement.querySelector('#includeReservationFee');
            const reservationFeeWrapper = addBookingModalElement.querySelector('#reservationFeeWrapper');
            const reservationFeeAmount = addBookingModalElement.querySelector('#reservationFeeAmount');
            
            if (reservationFeeCheckbox && reservationFeeWrapper && reservationFeeAmount) {
              reservationFeeCheckbox.checked = true;
              reservationFeeWrapper.style.display = 'block';
              reservationFeeAmount.value = parseFloat(bookingDetails.reservationFee).toFixed(2);
              reservationFeeAmount.disabled = true; // Keep disabled for read-only
            }
          }
          
          if (bookingDetails.discountAmount && parseFloat(bookingDetails.discountAmount) > 0) {
            const discountCheckbox = addBookingModalElement.querySelector('#includeDiscount');
            const discountWrapper = addBookingModalElement.querySelector('#discountWrapper');
            const discountAmount = addBookingModalElement.querySelector('#discountAmount');
            
            if (discountCheckbox && discountWrapper && discountAmount) {
              discountCheckbox.checked = true;
              discountWrapper.style.display = 'block';
              discountAmount.value = parseFloat(bookingDetails.discountAmount).toFixed(2);
              discountAmount.disabled = true; // Keep disabled for read-only
            }
          }
          
          // Add visual highlights to enabled fields
          highlightEnabledFields();
          
        } else {
          console.error('Modal element not found');
        }
      } else {
        console.error('Failed to get room details:', response.message);
      }
    },
    error: function(xhr, status, error) {
      console.error('Error fetching room details:', error);
    }
  });
}