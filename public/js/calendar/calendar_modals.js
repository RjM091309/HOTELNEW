// =============================================================================
// CALENDAR MODALS MODULE
// =============================================================================

// This module contains modal functions for the calendar system

// =============================================================================
// MODAL FUNCTIONS
// =============================================================================

// Function to show event info from calendar (fallback)
function showEventInfoModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';

  // FullCalendar uses exclusive end → subtract one day
  const ciDate = new Date(event.start);
  const coDate = new Date(event.end);
  coDate.setDate(coDate.getDate() - 1);

  const checkIn = ciDate.toLocaleDateString();
  const checkOut = coDate.toLocaleDateString();

  // Determine event status and title based on event properties
  let statusTitle = '';
  let statusIcon = 'info';
  
  if (event.extendedProps && event.extendedProps.bookingStatus) {
    const status = event.extendedProps.bookingStatus;
    
    switch (status) {
      case 'check-In':
        statusTitle = `Room ${roomNumber} - Checked In`;
        statusIcon = 'success';
        break;
      case 'check-Out':
        statusTitle = `Room ${roomNumber} - Checked Out`;
        statusIcon = 'info';
        break;
      case 'pending':
        statusTitle = `Room ${roomNumber} - Pending Reservation`;
        statusIcon = 'warning';
        break;
      case 'cancelled':
        statusTitle = `Room ${roomNumber} - Cancelled`;
        statusIcon = 'error';
        break;
      default:
        statusTitle = `Room ${roomNumber} - ${status}`;
        statusIcon = 'info';
    }
  } else {
    // Fallback if no status info
    statusTitle = `Room ${roomNumber}`;
    statusIcon = 'info';
  }

  Swal.fire({
    title: statusTitle,
    html:
      `Reserved by <b>${guestName}</b><br>` +
      `Check-in: <b>${checkIn}</b><br>` +
      `Check-out: <b>${checkOut}</b>`,
    icon: statusIcon,
    confirmButtonText: 'OK'
  }).then(() => {
    if (typeof window.glowCalendarScheduleBar === 'function') {
      window.glowCalendarScheduleBar(event.id);
    }
  });
}

// Function to show booking details modal (calls openRoomMenuModal from room-menu_data.js)
function showBookingDetailsModal(bookingData, roomId, bookingId) {
  
  // Check if openRoomMenuModal function exists
  if (typeof window.openRoomMenuModal === 'function') {
    // Call the openRoomMenuModal function from room-menu_data.js
    window.openRoomMenuModal(bookingId);
  } else {
    console.error('openRoomMenuModal function not found. Make sure room-menu_data.js is loaded.');
    // Fallback to show basic event info
    Swal.fire({
      title: 'Booking Details',
      html: `
        <div class="text-left">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Room ID:</strong> ${roomId}</p>
          <p><strong>Guest:</strong> ${bookingData.CustomerName || 'N/A'}</p>
          <p><strong>Check-in:</strong> ${new Date(bookingData.CheckInDate).toLocaleDateString()}</p>
          <p><strong>Check-out:</strong> ${new Date(bookingData.CheckOutDate).toLocaleDateString()}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'OK'
    });
  }
}

// Function to show late check-in modal
function showLateCheckInModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // Use actual start/end dates (times already set to CI 2PM / CO 11AM)
  const ci = new Date(event.start);
  const co = new Date(event.end);

  const checkIn = ci.toLocaleDateString();
  const checkOut = co.toLocaleDateString();

  // Check if check-in date is today or in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day
  const checkInDateOnly = new Date(ci);
  checkInDateOnly.setHours(0, 0, 0, 0); // Reset time to start of day
  const canCheckIn = checkInDateOnly <= today;

  // Build composite status badges (CI/CO)
  const ciStatus = event.extendedProps?.checkInStatus; // 1 regular, 0 late
  const coStatus = event.extendedProps?.checkOutStatus; // 0 regular, 1 late
  const ciText = (ciStatus === 1 ? 'REGULAR CHECK-IN' : 'LATE CHECK-IN');
  const ciColor = (ciStatus === 1 ? '#e53935' : '#e0a316');
  const coText = (coStatus === 1 ? 'LATE CHECK-OUT' : 'REGULAR CHECK-OUT');
  const coColor = (coStatus === 1 ? '#e0a316' : '#e53935');

  // Prepare modal configuration based on check-in availability
  const modalConfig = {
    title: `Room ${roomNumber} - Pending Reservation`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: ${ciStatus === 0 ? '#e0a316' : '#e53935'}; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Reservation Details</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid #e0a316;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; text-align: center;">
                  <span style="background: transparent; border:2px solid ${ciColor}; color:${ciColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${ciText}</span>
                  <span style="background: transparent; border:2px solid ${coColor}; color:${coColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${coText}</span>
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        ${canCheckIn ?
          (ciStatus === 0 ?
            `<div style="text-align: center; padding: 15px; background: rgba(224, 163, 22, 0.15); border-radius: 8px; border: 1px solid rgba(224, 163, 22, 0.35);">
              <span style="color: #e0a316; font-size: 14px; font-weight: 600;">
                ⚠️ This guest has not checked in yet and is past the scheduled check-in time.
              </span>
            </div>` :
            `<div style="text-align: center; padding: 15px; background: rgba(224, 163, 22, 0.15); border-radius: 8px; border: 1px solid rgba(224, 163, 22, 0.35);">
              <span style="color: #e0a316; font-size: 14px; font-weight: 600;">
                📋 This reservation is Late Check-In confirmation and requires staff approval.
              </span>
            </div>`
          ) :
          `<div style="text-align: center; padding: 15px; background: rgba(108, 117, 125, 0.1); border-radius: 8px; border: 1px solid rgba(108, 117, 125, 0.35);">
            <span style="color: #6c757d; font-size: 14px; font-weight: 500;">
              📅 Check-in is not available yet. This reservation is for a future date.
            </span>
          </div>`
        }
      </div>
    `,
    icon: 'warning',
    showCancelButton: false,
    showDenyButton: false,
    showConfirmButton: false,
    background: '#2a3135',
    color: '#ffffff',
    width: '500px',
    footer: `
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        <button id="btn-view-details" class="swal2-styled" style="background-color: #28a745; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          General Info
        </button>
        <button id="btn-edit-details" class="swal2-styled" style="background-color: #007bff; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Edit Details
        </button>
        <button id="btn-close" class="swal2-styled" style="background-color: #6c757d; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Close
        </button>
      </div>
    `
  };

  // Add check-in button only if check-in is available
  if (canCheckIn) {
    modalConfig.footer = `
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        <button id="btn-view-details" class="swal2-styled" style="background-color: #28a745; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          General Info
        </button>
        <button id="btn-edit-details" class="swal2-styled" style="background-color: #007bff; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Edit Details
        </button>
        <!-- <button id="btn-checkin" class="swal2-styled" style="background-color: #b8a600; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Check-In Now
        </button> -->
        <button id="btn-close" class="swal2-styled" style="background-color: #6c757d; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Close
        </button>
      </div>
    `;
  }

  let skipScheduleBarGlow = false;

  Swal.fire(modalConfig).then(() => {
    if (!skipScheduleBarGlow && typeof window.glowCalendarScheduleBar === 'function') {
      window.glowCalendarScheduleBar(bookingId);
    }
  });

  // Add event listeners for custom buttons after modal is shown
  setTimeout(() => {
    // General Info button - opens dynamicRoomModal
    const viewDetailsBtn = document.getElementById('btn-view-details');
    if (viewDetailsBtn) {
      viewDetailsBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        if (typeof window.cleanupModalOverlays === 'function') {
          window.cleanupModalOverlays();
        }
        setTimeout(() => {
          // Open the dynamic room modal
          if (typeof openRoomMenuModal === 'function') {
            openRoomMenuModal(bookingId, event);
          } else {
            console.error('openRoomMenuModal function not found');
          }
        }, 100);
      });
    }

    // Edit Details button
    const editDetailsBtn = document.getElementById('btn-edit-details');
    if (editDetailsBtn) {
      editDetailsBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        editBookingFromCalendar(bookingId);
      });
    }

    // Close button
    const closeBtn = document.getElementById('btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        Swal.close();
      });
    }

    // Check-In button (only if available)
    const checkInBtn = document.getElementById('btn-checkin');
    if (checkInBtn && canCheckIn) {
      checkInBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        
        // Check if room is occupied or under cleaning before showing confirmation
        $.ajax({
          url: '/dashboard/booking/check_room_occupied',
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            BookingID: bookingId
          }),
          success: (response) => {
            if (response.success && response.isCleaning) {
              // Room is under cleaning, show error popup
              Swal.fire({
                title: "Cannot Check-In!",
                text: `Cannot check-in to Room ${roomNumber} because it is currently under cleaning. Please wait until cleaning is completed.`,
                icon: "error",
                confirmButtonColor: "#dc3545",
                confirmButtonText: "OK",
                allowOutsideClick: false,
                background: '#2a3135',
                color: '#ffffff'
              });
              return;
            }
            
            if (response.success && response.isOccupied) {
              // Room is occupied, show error popup
              Swal.fire({
                title: "Cannot Check-In!",
                html: `Cannot check-in to Room ${roomNumber} because it is still occupied.${response.data ? ` Currently checked in: <strong>${response.data.CustomerName || 'another guest'}</strong>.` : ''}`,
                icon: "error",
                confirmButtonColor: "#dc3545",
                confirmButtonText: "OK",
                allowOutsideClick: false,
                background: '#2a3135',
                color: '#ffffff'
              });
              return;
            }
            
            // Room is available — collect security deposit then check in
            proceedToDepositCheckIn(bookingId, roomNumber, event);
          },
          error: (xhr, status, error) => {
            PMSCore.handleError(error, 'Check room occupied AJAX error');
            PMSCore.showError('Error!', 'An error occurred while checking room status.');
          }
        });
      });
    }
  }, 100);
}

// Function to show pending reservation modal
function showPendingModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // Use actual start/end dates (times already set to CI 2PM / CO 11AM)
  const ciDate2 = new Date(event.start);
  const coDate2 = new Date(event.end);

  const checkIn = ciDate2.toLocaleDateString();
  const checkOut = coDate2.toLocaleDateString();

  // Check if check-in date is today or in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day
  const checkInDateOnly = new Date(ciDate2);
  checkInDateOnly.setHours(0, 0, 0, 0); // Reset time to start of day
  const canCheckIn = checkInDateOnly <= today;

  // Build composite status badges (CI/CO)
  const ciStatus2 = event.extendedProps?.checkInStatus; // 1 regular, 0 late
  const coStatus2 = event.extendedProps?.checkOutStatus; // 0 regular, 1 late
  const holdPendingRaw2 = event.extendedProps?.holdPending;
  const isHoldPending2 = holdPendingRaw2 === 1 || holdPendingRaw2 === '1' || holdPendingRaw2 === true;
  const ciText = (ciStatus2 === 1 ? 'REGULAR CHECK-IN' : 'LATE CHECK-IN');
  const ciColor = (ciStatus2 === 1 ? '#e53935' : '#e0a316');
  const coText = (coStatus2 === 1 ? 'LATE CHECK-OUT' : 'REGULAR CHECK-OUT');
  const coColor = (coStatus2 === 1 ? '#e0a316' : '#e53935');
  const accentColor = isHoldPending2 ? '#FF6D00' : (ciStatus2 === 0 ? '#e0a316' : '#e53935');

  // Prepare modal configuration based on check-in availability
  const modalConfig = {
    title: `Room ${roomNumber} - ${isHoldPending2 ? 'Hold Pending' : 'Pending Reservation'}`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: ${accentColor}; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Reservation Details</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid ${accentColor};">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; text-align: center;">
                  ${isHoldPending2
                    ? `<span style="background: transparent; border:2px solid #FF6D00; color:#FFB74D; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">HOLD PENDING</span>`
                    : `<span style="background: transparent; border:2px solid ${ciColor}; color:${ciColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${ciText}</span>
                  <span style="background: transparent; border:2px solid ${coColor}; color:${coColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${coText}</span>`
                  }
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${isHoldPending2 ? 'Start Date' : 'Check-in Date'}</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${isHoldPending2 ? 'End Date' : 'Check-out Date'}</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        ${isHoldPending2 ?
          `<div style="text-align: center; padding: 15px; background: rgba(255, 109, 0, 0.15); border-radius: 8px; border: 1px solid rgba(255, 109, 0, 0.45);">
            <span style="color: #FFB74D; font-size: 14px; font-weight: 500;">
              ⏸️ This reservation is on Hold Pending - no check-in/check-out processing yet.
            </span>
          </div>` :
          canCheckIn ?
          `<div style="text-align: center; padding: 15px; background: rgba(229, 57, 53, 0.1); border-radius: 8px; border: 1px solid rgba(229, 57, 53, 0.35);">
            <span style="color: #e53935; font-size: 14px; font-weight: 500;">
              📋 This reservation is Regular Check-In confirmation and requires staff approval.
            </span>
          </div>` :
          `<div style="text-align: center; padding: 15px; background: rgba(108, 117, 125, 0.1); border-radius: 8px; border: 1px solid rgba(108, 117, 125, 0.35);">
            <span style="color: #6c757d; font-size: 14px; font-weight: 500;">
              📅 Check-in is not available yet. This reservation is for a future date.
            </span>
          </div>`
        }
      </div>
    `,
    icon: 'info',
    showCancelButton: false,
    showDenyButton: false,
    showConfirmButton: false,
    background: '#2a3135',
    color: '#ffffff',
    width: '500px',
    footer: `
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        <button id="btn-view-details" class="swal2-styled" style="background-color: #28a745; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          General Info
        </button>
        <button id="btn-edit-details" class="swal2-styled" style="background-color: #007bff; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Edit Details
        </button>
        <button id="btn-close" class="swal2-styled" style="background-color: #6c757d; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Close
        </button>
      </div>
    `
  };

  // Add check-in button only if check-in is available
  if (canCheckIn) {
    modalConfig.footer = `
      <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
        <button id="btn-view-details" class="swal2-styled" style="background-color: #28a745; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          General Info
        </button>
        <button id="btn-edit-details" class="swal2-styled" style="background-color: #007bff; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Edit Details
        </button>
        <!-- <button id="btn-checkin" class="swal2-styled" style="background-color: #e53935; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Check-In Now
        </button> -->
        <button id="btn-close" class="swal2-styled" style="background-color: #6c757d; border: none; padding: 10px 20px; border-radius: 4px; color: white; cursor: pointer; font-weight: 500;">
          Close
        </button>
      </div>
    `;
  }

  let skipScheduleBarGlow = false;

  Swal.fire(modalConfig).then(() => {
    if (!skipScheduleBarGlow && typeof window.glowCalendarScheduleBar === 'function') {
      window.glowCalendarScheduleBar(bookingId);
    }
  });

  // Add event listeners for custom buttons after modal is shown
  setTimeout(() => {
    // General Info button - opens dynamicRoomModal
    const viewDetailsBtn = document.getElementById('btn-view-details');
    if (viewDetailsBtn) {
      viewDetailsBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        if (typeof window.cleanupModalOverlays === 'function') {
          window.cleanupModalOverlays();
        }
        setTimeout(() => {
          // Open the dynamic room modal
          if (typeof openRoomMenuModal === 'function') {
            openRoomMenuModal(bookingId, event);
          } else {
            console.error('openRoomMenuModal function not found');
          }
        }, 100);
      });
    }

    // Edit Details button
    const editDetailsBtn = document.getElementById('btn-edit-details');
    if (editDetailsBtn) {
      editDetailsBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        editBookingFromCalendar(bookingId);
      });
    }

    // Close button
    const closeBtn = document.getElementById('btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        Swal.close();
      });
    }

    // Check-In button (only if available)
    const checkInBtn = document.getElementById('btn-checkin');
    if (checkInBtn && canCheckIn) {
      checkInBtn.addEventListener('click', () => {
        skipScheduleBarGlow = true;
        Swal.close();
        
        // Check if room is occupied or under cleaning before showing confirmation
        $.ajax({
          url: '/dashboard/booking/check_room_occupied',
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            BookingID: bookingId
          }),
          success: (response) => {
            if (response.success && response.isCleaning) {
              // Room is under cleaning, show error popup
              Swal.fire({
                title: "Cannot Check-In!",
                text: `Cannot check-in to Room ${roomNumber} because it is currently under cleaning. Please wait until cleaning is completed.`,
                icon: "error",
                confirmButtonColor: "#dc3545",
                confirmButtonText: "OK",
                allowOutsideClick: false,
                background: '#2a3135',
                color: '#ffffff'
              });
              return;
            }
            
            if (response.success && response.isOccupied) {
              // Room is occupied, show error popup
              Swal.fire({
                title: "Cannot Check-In!",
                html: `Cannot check-in to Room ${roomNumber} because it is still occupied.${response.data ? ` Currently checked in: <strong>${response.data.CustomerName || 'another guest'}</strong>.` : ''}`,
                icon: "error",
                confirmButtonColor: "#dc3545",
                confirmButtonText: "OK",
                allowOutsideClick: false,
                background: '#2a3135',
                color: '#ffffff'
              });
              return;
            }
            
            // Room is available — collect security deposit then check in
            proceedToDepositCheckIn(bookingId, roomNumber, event);
          },
          error: (xhr, status, error) => {
            PMSCore.handleError(error, 'Check room occupied AJAX error');
            PMSCore.showError('Error!', 'An error occurred while checking room status.');
          }
        });
      });
    }
  }, 100);
}

// Function to show cancelled reservation modal
function showCancelledModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // FullCalendar uses exclusive end → subtract one day
  const ci = new Date(event.start);
  const co = new Date(event.end);
  co.setDate(co.getDate() - 1);

  const checkIn = ci.toLocaleDateString();
  const checkOut = co.toLocaleDateString();

  Swal.fire({
    title: `Room ${roomNumber} - Cancelled Reservation`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: #000000; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Cancelled Reservation</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid #000000;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="color: #ffffff; font-weight: 700; font-size: 16px; margin-top: 4px; text-transform: uppercase;">Cancelled</div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="text-align: center; padding: 15px; background: rgba(0, 0, 0, 0.15); border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.35);">
          <span style="color: #ffffff; font-size: 14px; font-weight: 500;">
            ❌ This reservation has been cancelled.
          </span>
        </div>
      </div>
    `,
    icon: 'error',
    cancelButtonText: 'Remove',
    confirmButtonText: 'Reopen Reservation',
    denyButtonText: 'Close',
    showDenyButton: true,
    reverseButtons: true, 
    showCancelButton: true,
    confirmButtonColor: '#000000',
    cancelButtonColor: '#dc3545',
    denyButtonColor: '#6c757d',
    background: '#2a3135',
    color: '#ffffff',
    width: '500px'
      }).then((result) => {
      const openedAction = result.isConfirmed || result.dismiss === Swal.DismissReason.cancel;
      if (!openedAction && typeof window.glowCalendarScheduleBar === 'function') {
        window.glowCalendarScheduleBar(bookingId);
      }

      if (result.isConfirmed) {
        // Reopen button clicked - show status selection first
        Swal.fire({
          title: 'Select New Status',
          text: 'Choose the new status for this reopened reservation:',
          icon: 'question',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: 'Regular Check-in',
          denyButtonText: 'Late Check-in',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#e53935', // Red for regular
          denyButtonColor: '#b8a600', // Dark lemon for late
          cancelButtonColor: '#6c757d',
          background: '#2a3135',
          color: '#ffffff'
        }).then((statusResult) => {
          if (statusResult.isConfirmed) {
            // User selected "Regular Check-in" - show confirmation
            Swal.fire({
              title: 'Reopen as Regular Check-in?',
              text: 'Are you sure you want to reopen this cancelled reservation as a regular check-in?',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Yes, Reopen as Regular Check-in',
              cancelButtonText: 'Cancel',
              confirmButtonColor: '#e53935',
              cancelButtonColor: '#6c757d'
            }).then((reopenResult) => {
              if (reopenResult.isConfirmed) {
                // Show loading state
                Swal.fire({
                  title: 'Reopening Reservation...',
                  text: 'Please wait while we reopen the cancelled reservation as regular check-in.',
                  allowOutsideClick: false,
                  didOpen: () => {
                    Swal.showLoading();
                  }
                });
                
                // Call API to reopen the cancelled reservation as pending
                reopenCancelledReservation(bookingId, event, 'pending');
              }
            });
          } else if (statusResult.isDenied) {
            // User selected "Late Check-in Modal" - show confirmation
            Swal.fire({
              title: 'Reopen as Late Check-in?',
              text: 'Are you sure you want to reopen this cancelled reservation as a late check-in?',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Yes, Reopen as Late Check-in',
              cancelButtonText: 'Cancel',
              confirmButtonColor: '#b8a600',
              cancelButtonColor: '#6c757d'
            }).then((reopenResult) => {
              if (reopenResult.isConfirmed) {
                // Show loading state
                Swal.fire({
                  title: 'Reopening Reservation...',
                  text: 'Please wait while we reopen the cancelled reservation as late check-in.',
                  allowOutsideClick: false,
                  didOpen: () => {
                    Swal.showLoading();
                  }
                });
                
                // Call API to reopen the cancelled reservation as late check-in
                reopenCancelledReservation(bookingId, event, 'late_check_in');
              }
            });
          }
          // Cancel button just closes the modal automatically
        });
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        // Remove button clicked
        Swal.fire({
          title: 'Remove Reservation?',
          text: 'Are you sure you want to permanently remove this cancelled reservation? This action cannot be undone.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Remove',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#6c757d'
        }).then((removeResult) => {
          if (removeResult.isConfirmed) {
            // Show loading state
            Swal.fire({
              title: 'Removing Reservation...',
              text: 'Please wait while we remove the reservation.',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            // Call API to remove the reservation
            removeCancelledReservation(bookingId, event);
          }
        });
      }
      // Close button (deny) just closes the modal automatically
    });
}

// =============================================================================
// BOOKING MODAL POPULATION
// =============================================================================

// Function to populate the booking modal with selected room and dates
function populateBookingModal(roomId, start, end) {

  // Format dates for the daterange input
  const startDate = new Date(start);
  const endDate = new Date(end); // The end date from FullCalendar is the exclusive checkout day
  
  const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const diffInTime = endDate.getTime() - startDate.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));
  
  // Display format: "Check-in to Check-out (Nights)"
  const daterangeValue = `${startFormatted} to ${endFormatted} (${diffInDays} night/s)`;
  $('#daterange').val(daterangeValue);
  $('#diffindays').val(diffInDays);
  
  // Get room details from calendar resources instead of AJAX call
  const resources = calendar.getResources();
  const selectedResource = resources.find(resource => resource.id === roomId);
  
  if (selectedResource) {
    // Extract floor from parent resource (floor)
    const parentResource = selectedResource.parent;
    
    let floorNumber = '3'; // Default fallback
    
    if (parentResource) {
      // Extract floor number from "Floor X" title
      const floorMatch = parentResource.title.match(/Floor (\d+)/);
      if (floorMatch) {
        floorNumber = floorMatch[1];
      }
    } else {
      // If no parent, try to extract floor from room number
      const roomNumber = selectedResource.title;
      const roomMatch = roomNumber.match(/^(\d{1})/); // Only first digit for floor
      if (roomMatch) {
        floorNumber = roomMatch[1];
      }
    }
    
    // Get room number from resource title
    const roomNumber = selectedResource.title;
    
    const floorDropdown = $('#addFloor');
    const roomDropdown = $('#addroom');

    // Clear and set the specific floor
    floorDropdown.empty().append(`<option value="${floorNumber}" selected>${floorNumber} Floor</option>`);

    // Clear and set the specific room
    roomDropdown.empty().append(`<option value="${roomId}" selected>${roomNumber}</option>`);
    
    // Set a flag before triggering the change event
    roomDropdown.data('is-calendar-action', true);

    // Now trigger the change event to populate other fields like price, etc.
    roomDropdown.trigger('change');
  } else {
    console.error("Room resource not found for ID:", roomId);
  }
}

// =============================================================================
// MODAL EVENT HANDLERS
// =============================================================================

// Modal show handler
$(document).ready(function() {
  $('#modal-addbooking').on('shown.bs.modal', function () {
    const roomId = $(this).data('calendar-room-id');

    // Hide group booking elements when opening from the calendar
    $('#groupBookingCheckbox').parent().hide();
    $('#groupBookingFields').hide();

    if (roomId) {
      const start = $(this).data('calendar-start');
      const end = $(this).data('calendar-end');
      const lateCheckout = $(this).data('calendar-late-checkout');

      populateBookingModal(roomId, start, end);

      // Explicitly set both cases (not just late) - otherwise a Regular
      // checkout can be left showing a stale "Late Check Out" carried over
      // from localStorage's sticky preference set by an earlier booking.
      if (typeof setCheckOutStatusDropdown === 'function') {
        setCheckOutStatusDropdown(lateCheckout ? '1' : '0');
      }

      // Clean up the data attributes to prevent re-running
      $(this).removeData('calendar-room-id');
      $(this).removeData('calendar-start');
      $(this).removeData('calendar-end');
      $(this).removeData('calendar-late-checkout');
    }
  });

  // Also, reset the view when the modal is closed, so it shows up next time for the top bar
  $('#modal-addbooking').on('hidden.bs.modal', function () {
    $('#groupBookingCheckbox').parent().show();
    // Reset disabled fields in case the user closes the modal without booking
    $('#daterange').prop('disabled', false);
    $('#addFloor').prop('disabled', false);
    $('#addroom').prop('disabled', false);
    if (typeof window.cleanupModalOverlays === 'function') {
      window.cleanupModalOverlays();
    }
  });
});

// =============================================================================
// BOOKING ACTION FUNCTIONS
// =============================================================================

// Function to edit booking from calendar (opens the edit booking modal)
function editBookingFromCalendar(bookingId) {
  
  if (typeof window.cleanupModalOverlays === 'function') {
    window.cleanupModalOverlays();
  }

  // Check if the edit booking modal exists
  if (typeof window.editBooking === 'function') {
    // Use the existing editBooking function from booking.ejs
    window.editBooking(bookingId);
  } else {
    // Fallback: Show a message that edit booking is not available
    Swal.fire({
      title: 'Edit Booking',
      text: 'Edit booking functionality is not available on this page. Please go to the Booking page to edit this reservation.',
      icon: 'info',
      confirmButtonText: 'OK',
      background: '#2a3135',
      color: '#ffffff'
    });
  }
}

// Open security deposit modal then check in guest
function proceedToDepositCheckIn(bookingId, roomNumber, event) {
  if (typeof SecurityDepositCheckIn === 'undefined') {
    PMSCore.showError('Error!', 'Security deposit module not loaded. Please refresh the page.');
    return;
  }

  SecurityDepositCheckIn.open({
    bookingId,
    roomNumber,
    onSuccess: (response) => handleCalendarCheckInSuccess(bookingId, event, response),
    onCancel: () => {}
  });
}

// Handle successful check-in from calendar (after deposit recorded)
function handleCalendarCheckInSuccess(bookingId, event, response) {
  if (typeof PMSCore !== 'undefined') {
    const depositMsg = response?.data?.securityDeposit
      ? ` Security deposit: ₱${parseFloat(response.data.securityDeposit).toLocaleString('en-US', { minimumFractionDigits: 2 })} recorded.`
      : '';
    PMSCore.showSuccess('Check-In Successful!', `The guest has been successfully checked in.${depositMsg}`);
  } else {
    Swal.fire({
      title: 'Check-In Successful!',
      text: 'The guest has been successfully checked in.',
      icon: 'success',
      confirmButtonText: 'OK'
    });
  }

  updateEventStatusInstantly(event, 'check-In');

  if (typeof updateLegendCounts === 'function') {
    updateLegendCounts();
  }

  if (typeof dashboardSocket !== 'undefined') {
    dashboardSocket.emit('dashboard-updated', {
      action: 'calendar-checkin',
      message: `Booking ${bookingId} checked in from calendar`,
      data: response?.data
    });
  }
}

// Function to check-in a reservation (legacy — redirects to deposit flow)
function checkInReservation(bookingId, event) {
  const roomNumber = event?.getResources?.()[0]?.title || 'N/A';
  proceedToDepositCheckIn(bookingId, roomNumber, event);
}

// Function to remove a cancelled reservation
function removeCancelledReservation(bookingId, event) {
  // Prepare data for API call
  const removeData = {
    bookingId: bookingId,
    action: 'remove',
    setActive: 0
  };
  
  // Make API call to remove the reservation
  fetch('/calendar/api/remove-reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCSRFToken(),
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include',
    body: JSON.stringify({
      ...removeData,
      _csrf: getCSRFToken()
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal
      Swal.close();
      
      // Success - show notification
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Reservation Removed!', 'The cancelled reservation has been permanently removed.');
      } else {
        Swal.fire({
          title: 'Reservation Removed!',
          text: 'The cancelled reservation has been permanently removed.',
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Remove the event from the calendar
      if (event && event.remove) {
        event.remove();
      }
      
      // Update legend counts to reflect the removal
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      
      // Update overlap detection
      if (event.view && event.view.calendar) {
        globalOverlapCheck(event.view.calendar);
      }
      
      // Emit socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'reservation-removed',
          message: `Reservation removed successfully`,
          data: {
            bookingId: bookingId,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
      
    } else {
      // Close the loading modal
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Remove Failed',
        text: data.message || 'Failed to remove the reservation. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error removing reservation:', error);
    
    // Close the loading modal
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while removing the reservation. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Function to reopen a cancelled reservation
function reopenCancelledReservation(bookingId, event, newStatus = 'pending') {
  // Prepare data for API call
  const reopenData = {
    bookingId: bookingId,
    action: 'reopen',
    newStatus: 'pending', // Always set to 'pending'
    checkInStatus: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
  };
  
  // Make API call to reopen the reservation
  fetch('/calendar/api/reopen-reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCSRFToken(),
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include',
    body: JSON.stringify({
      ...reopenData,
      _csrf: getCSRFToken()
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal
      Swal.close();
      
      // Success - show notification based on selected status
      const statusText = newStatus === 'late_check_in' ? 'late check-in' : 'regular check-in';
      const statusDisplay = newStatus === 'late_check_in' ? 'Late Check-in' : 'Regular Check-in';
      
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Reservation Reopened!', `The cancelled reservation has been successfully reopened and is now ${statusText}.`);
      } else {
        Swal.fire({
          title: 'Reservation Reopened!',
          text: `The cancelled reservation has been successfully reopened and is now ${statusText}.`,
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Update the event object immediately after API success
      
      // Completely recreate extendedProps to ensure the update works
      const currentExtendedProps = event.extendedProps || {};
      event.extendedProps = {
        ...currentExtendedProps,
        bookingStatus: 'pending', // Always 'pending'
        checkInStatus: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
      };
      
      // Set background color based on check-in status
      const statusColor = newStatus === 'late_check_in' ? '#e0a316' : '#e53935'; // Amber for late, Red for regular
      event.backgroundColor = statusColor;
      
      // Update the event status in the calendar INSTANTLY (like drag & drop)
      // Pass the original newStatus to maintain the late_check_in vs regular logic
      updateEventStatusInstantly(event, newStatus);
      
      // Update legend counts to reflect the status change
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      
      // Emit socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'reservation-reopened',
          message: `Reservation reopened successfully`,
          data: {
            bookingId: bookingId,
            newStatus: newStatus,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
      
    } else {
      // Close the loading modal
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Reopen Failed',
        text: data.message || 'Failed to reopen the reservation. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    // Close the loading modal
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while reopening the reservation. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// =============================================================================
// DROPDOWN AUTO-SETTING FUNCTIONS
// =============================================================================

// Function to automatically set the checkOutStatus dropdown in add booking modal
function setCheckOutStatusDropdown(value) {
  try {
    // Always store the preference in localStorage for future bookings
    const prefCode = value === '0' ? 'R/O' : 'L/O';
    localStorage.setItem('bookingCheckoutPref', prefCode);
    
    // Check if the add booking modal is open
    const modal = document.getElementById('modal-addbooking');
    if (modal && modal.classList.contains('show')) {
      const checkOutDropdown = document.getElementById('checkOutStatus');
      if (checkOutDropdown) {
        checkOutDropdown.value = value;
        checkOutDropdown.dispatchEvent(new Event('change'));
        
        console.log(`Auto-set checkOutStatus to ${value === '0' ? 'Regular Check Out' : 'Late Check Out'}`);
      }
    } else {
      console.log(`Stored checkOutStatus preference: ${value === '0' ? 'Regular Check Out' : 'Late Check Out'} (will apply when modal opens)`);
    }
  } catch (error) {
    console.error('Error setting checkOutStatus dropdown:', error);
  }
}

// Function to automatically set the checkInStatus dropdown in add booking modal
function setCheckInStatusDropdown(value) {
  try {
    // Always store the preference in localStorage for future bookings
    const prefCode = value === '1' ? 'R/I' : 'L/I';
    localStorage.setItem('bookingCheckinPref', prefCode);
    
    // Check if the add booking modal is open
    const modal = document.getElementById('modal-addbooking');
    if (modal && modal.classList.contains('show')) {
      const checkInDropdown = document.getElementById('checkInStatus');
      if (checkInDropdown) {
        checkInDropdown.value = value;
        checkInDropdown.dispatchEvent(new Event('change'));
        
        console.log(`Auto-set checkInStatus to ${value === '1' ? 'Regular Check In' : 'Late Check In'}`);
      }
    } else {
      console.log(`Stored checkInStatus preference: ${value === '1' ? 'Regular Check In' : 'Late Check In'} (will apply when modal opens)`);
    }
  } catch (error) {
    console.error('Error setting checkInStatus dropdown:', error);
  }
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.showEventInfoModal = showEventInfoModal;
window.showLateCheckInModal = showLateCheckInModal;
window.showPendingModal = showPendingModal;
window.showCancelledModal = showCancelledModal;
window.showBookingDetailsModal = showBookingDetailsModal;
window.populateBookingModal = populateBookingModal;
window.editBookingFromCalendar = editBookingFromCalendar;
window.checkInReservation = checkInReservation;
window.removeCancelledReservation = removeCancelledReservation;
window.reopenCancelledReservation = reopenCancelledReservation;
window.setCheckOutStatusDropdown = setCheckOutStatusDropdown;
window.setCheckInStatusDropdown = setCheckInStatusDropdown;
