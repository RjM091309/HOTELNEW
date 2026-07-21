$(document).ready(function () {
    $('#addbooking').off('submit').on('submit', function (e) {
      e.preventDefault();
      
      // Show confirmation dialog before proceeding
      Swal.fire({
        title: 'Confirm Booking',
        text: 'Are you sure you want to save this booking?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Save Booking',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#6f9c40',
        cancelButtonColor: '#dc3545'
      }).then((result) => {
        // If user clicks cancel, don't proceed
        if (!result.isConfirmed) {
          return;
        }
        
        // Proceed with the booking
        processBooking();
      });
    });
    
    // Function to handle the actual booking processing
    function processBooking() {
      // SINGLE BOOKING LOGIC ONLY
      const roomId = $('#addroom').val();
      const daterange = $('#daterange').val();
      const fullname = $('#txtFullNameAdd').val();
      const number = $('#txtNumber').val();
      const address = $('#txtAddress').val();
      const guestsCount = $('#maxOccupants').val();
      const paidAmount = $('#paidAmount').val();
      const paymentStatus = $('#paymentStatus').val();
      const roomPrice = $('#baseprice').val();
      const qty = $('#diffindays').val();
      const guestType = $('#guestType').val();
      const guestLevel = $('#guestLevel').val();
      const txtGuestID = $('#guestID').val();
      const bookingRoute = $('#bookingRoute').val();
      const checkInStatus = $('#checkInStatus').val();
      const checkOutStatus = $('#checkOutStatus').val();
      const bookingRemarks = $('#bookingRemarks').val();
      const agencyID = $('#agencySelect').val();
      const agencyPayer = bookingRoute === 'agency'
        ? ($('input[name="agencyPayer"]:checked').val() || 'agency')
        : null;
      const voucherNo = $('#voucherNo').val();
      // Services/Transport
      const breakfastAdultQty = $('#breakfastAdultQty').val();
      const breakfastAdultPrice = $('#breakfastAdultPrice').val();
      const breakfastAdultId = $('#breakfastAdultId').val();
      const breakfastKidQty = $('#breakfastKidQty').val();
      const breakfastKidPrice = $('#breakfastKidPrice').val();
      const breakfastKidId = $('#breakfastKidId').val();
      const pickupServiceId = $('#pickupServiceId').val();
      const pickupPrice = $('#pickupPrice').val();
      const dropoffServiceId = $('#dropoffServiceId').val();
      const dropoffPrice = $('#dropoffPrice').val();
      const includePickup = $('#includePickup').is(':checked');
      const includeDropoff = $('#includeDropoff').is(':checked');
      const flightNumber = $('#flightNumber').val();
      const passengerCount = $('#passengerCount').val();

      // Discount and fees
      const seniorPwdDiscount = $('#includeSeniorPwdDiscount').is(':checked') ? parseFloat($('#seniorPwdDiscount').val()) || 0 : 0;
      const seniorPwdDiscountPercent = $('#includeSeniorPwdDiscount').is(':checked') ? parseFloat($('#seniorPwdDiscountPercent').val()) || 20 : 0;
      const discountAmount = $('#includeDiscount').is(':checked') ? $('#discountAmount').val() : 0;
      const reservationFeeAmount = $('#includeReservationFee').is(':checked') ? $('#reservationFeeAmount').val() : 0;
      const lateCheckoutFee = $('#lateCheckoutFee').val();
      console.log('DEBUG Single Booking: lateCheckoutFee =', lateCheckoutFee, 'checkOutStatus =', $('#checkOutStatus').val());

      // Validate agency selection if booking route is agency
      if (bookingRoute === 'agency' && (!agencyID || agencyID.trim() === '')) {
        Swal.fire({
          icon: 'error',
          title: 'Agency Required',
          text: 'Please select an agency for agency bookings.',
        });
        // Highlight the agency select field
        $('#agencySelectWrapper').css('border', '2px solid #e53935');
        $('#agencySelectWrapper').css('border-radius', '4px');
        setTimeout(() => {
          $('#agencySelectWrapper').css('border', '');
        }, 3000);
        return;
      }
      
      if (!roomId || !daterange || !fullname || !guestsCount || !paymentStatus || !roomPrice || !guestType || !guestLevel) {
        Swal.fire({
          icon: 'error',
          title: 'Oops...',
          text: 'Please fill all the required fields for booking!',
        });
        return;
      }

      if ((includePickup || includeDropoff) && (!flightNumber || !flightNumber.trim() || !passengerCount)) {
        Swal.fire({
          icon: 'error',
          title: 'Flight Info Required',
          text: 'Please enter the Flight Number and Number of Passengers for Pick-up/Drop-off.',
        });
        return;
      }

      $.ajax({
        url: '/booking/add_booking',
        type: 'POST',
        data: {
          room_id: roomId, fullname, number, address, daterange, maxOccupants: guestsCount,
          paidAmount, paymentStatus, price: roomPrice, diffindays: qty, guestType, guestLevel, guestID: txtGuestID,
          bookingRoute, checkInStatus, checkOutStatus, bookingRemarks, agencyID, agencyPayer, voucherNo,
          breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
          breakfastKidQty, breakfastKidPrice, breakfastKidId,
          pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
          flightNumber, passengerCount,
          discount: discountAmount, seniorPwdDiscount, seniorPwdDiscountPercent, reservationFee: reservationFeeAmount, lateCheckoutFee
        },
        success: function (response) {
            console.log('Booking response:', response);
            $('#modal-addbooking').modal('hide');
            
            // Payment processing is now handled automatically in the backend
            // No need for separate payment processing calls
            
            // Auto-download voucher if booking was successful
            // Trigger IMMEDIATELY before Swal to avoid blocking
            if (response.success && response.bookingId) {
              const bookingId = response.bookingId;
              const confirmationNumber = response.confirmationNumber;
              console.log('Triggering voucher download for bookingId:', bookingId, 'confirmationNumber:', confirmationNumber);
              
              try {
                console.log('Triggering voucher download for bookingId:', bookingId);
                
                // Use POST form (single download only)
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '/booking/generate-voucher?download=1';
                form.target = '_blank';
                form.style.display = 'none';
                
                const bookingIdInput = document.createElement('input');
                bookingIdInput.type = 'hidden';
                bookingIdInput.name = 'bookingId';
                bookingIdInput.value = bookingId;
                form.appendChild(bookingIdInput);
                
                document.body.appendChild(form);
                form.submit();
                
                setTimeout(() => {
                  if (form.parentNode) {
                    form.remove();
                  }
                }, 2000);
              } catch (error) {
                console.error('❌ Error in voucher download:', error);
                console.error('Error details:', error.message, error.stack);
              }
            } else {
              console.error('Booking response missing success or bookingId:', response);
            }
            
            // Check if check-in date is today and add to checked-in-content tab
            // Try socket first, but have fallback for direct add if socket not available
            if (response.success && response.bookingId) {
              const checkInDateStr = daterange.split(' to ')[0].trim();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              // Parse date from "MMM DD, YYYY" format
              let checkInDate;
              if (typeof moment !== 'undefined') {
                checkInDate = moment(checkInDateStr, 'MMM DD, YYYY').toDate();
              } else {
                // Fallback: try to parse manually
                const months = {
                  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                };
                const parts = checkInDateStr.split(' ');
                if (parts.length === 3) {
                  const month = months[parts[0]];
                  const day = parseInt(parts[1].replace(',', ''));
                  const year = parseInt(parts[2]);
                  checkInDate = new Date(year, month, day);
                } else {
                  checkInDate = new Date(checkInDateStr);
                }
              }
              
              // Reset time to compare dates only
              if (checkInDate && !isNaN(checkInDate.getTime())) {
                checkInDate.setHours(0, 0, 0, 0);
                
                // If check-in is today, add to checked-in-content tab
                if (checkInDate.getTime() === today.getTime()) {
                  // Check if socket is available and connected
                  const socketAvailable = typeof window.dashboardSocket !== 'undefined' && 
                                         window.dashboardSocket && 
                                         window.dashboardSocket.connected;
                  
                  // If socket is not available, do direct fetch as fallback
                  if (!socketAvailable) {
                    console.log('Socket not available, using direct fetch fallback');
                    fetch(`/booking/booking_details/${response.bookingId}`)
                      .then(res => res.json())
                      .then(bookingData => {
                        if (bookingData && bookingData.BookingID) {
                          if (typeof window.addBookingToCheckedInTab === 'function') {
                            window.addBookingToCheckedInTab(bookingData);
                          }
                        }
                      })
                      .catch(err => {
                        console.error('Error fetching booking details (fallback):', err);
                      });
                  } else {
                    // Socket is available - backend will emit socket event
                    // Just wait for socket to handle it
                    console.log('Socket available, waiting for socket event');
                  }
                }
              }
            }
            
            setTimeout(function() {
              Swal.fire({
                title: 'Booking Successful!',
                text: 'Your booking has been added successfully. Voucher is downloading...',
                icon: 'success',
                confirmButtonText: 'OK'
              }).then(() => {
                // Check if this is an unassigned room booking (roomId is empty, 0, or null)
                const isUnassignedRoom = !roomId || roomId === '' || roomId === '0' || roomId === 0;
                
                // Don't redirect if unassigned room or if we're on dashboard - socket/direct add will update it
                if (isUnassignedRoom) {
                  // For unassigned rooms, just stay on current page
                  return;
                }
                
                // If on calendar page, redirect to clean URL without query params
                if (window.location.pathname.includes('/calendar')) {
                  window.location.replace('/calendar');
                } else if (!window.location.pathname.includes('/dashboard')) {
                  window.location.reload();
                }
              });
            }, 400);
          },
          error: function (err) {
            Swal.fire({
              title: 'Error!',
              text: 'An error occurred. Please try again later.',
              icon: 'error',
              confirmButtonText: 'OK'
            });
          }
        });
      }
  });

// Function to add booking to checked-in-content tab dynamically
// Make it globally available for socket events
window.addBookingToCheckedInTab = function(bookingData) {
  try {
    // Check if we're on the dashboard page
    const checkedInTab = document.querySelector('#checked-in-content .scrollable-container');
    if (!checkedInTab) {
      console.log('Checked-in tab not found - user may not be on dashboard page');
      return;
    }

    // Helper function to get floor color class
    function getFloorColorClass(floorNumber) {
      const colorMap = {
        1: 'card-topline-yellow',
        2: 'card-topline-gray', 
        3: 'card-topline-green',
        4: 'card-topline-blue',
        5: 'card-topline-red',
        6: 'card-topline-violet',
        7: 'card-topline-orange',
        8: 'card-topline-pink',
        9: 'card-topline-green2',
        10: 'card-topline-sky'
      };
      return colorMap[floorNumber] || '';
    }

    // Helper function to calculate card variables
    function calculateCardVariables(booking) {
      if (!booking.CHECK_IN_DATE || !booking.CHECK_OUT_DATE) {
        return null;
      }
      
      const checkInDate = new Date(booking.CHECK_IN_DATE);
      const checkOutDate = new Date(booking.CHECK_OUT_DATE);
      
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return null;
      }
      
      checkInDate.setHours(0, 0, 0, 0);
      checkOutDate.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const totalDays = Math.max(1, Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
      const isTodayCheckInDate = checkInDate.toDateString() === today.toDateString();
      const daysStayed = isTodayCheckInDate ? 1 : Math.min(Math.ceil((today - checkInDate) / (1000 * 60 * 60 * 24)), totalDays);
      const daysRemaining = totalDays - daysStayed;
      const maxBars = booking.IS_GROUP == 1 ? 10 : 8;
      const visibleBars = Math.min(totalDays, maxBars);
      const visibleStayed = Math.min(daysStayed, visibleBars);
      const visibleRemaining = visibleBars - visibleStayed;
      const extraDays = Math.max(0, daysRemaining - visibleRemaining);
      const cardClass = getFloorColorClass(booking.ROOM_FLOOR);
      
      return {
        checkInDate,
        checkOutDate,
        totalDays,
        daysStayed,
        daysRemaining,
        visibleBars,
        visibleStayed,
        visibleRemaining,
        extraDays,
        cardClass
      };
    }

    // Calculate variables
    const variables = calculateCardVariables(bookingData);
    if (!variables) {
      console.error('Failed to calculate card variables');
      return;
    }

    // Format dates
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    };

    // Helper function to escape HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    // Build booking card HTML
    const cardClass = variables.cardClass;
    const booking = bookingData;
    const isDirectReservation = booking.IS_DIRECT_RESERVATION == 1;
    const showToggle = !isDirectReservation;
    const bookingStatus = booking.BookingStatus || 'pending';
    const isCheckedIn = bookingStatus === 'check-In';
    
    // Map booking data to match dashboard format if needed
    const roomFloor = booking.ROOM_FLOOR || booking.room_floor || '';
    const roomNumber = booking.ROOM_NUMBER || booking.room_number || '';
    const roomType = booking.RoomType || booking.room_type || '';
    const customerName = booking.CustomerName || booking.customer_name || '';
    const checkInDate = booking.CHECK_IN_DATE || booking.check_in_date || '';
    const checkOutDate = booking.CHECK_OUT_DATE || booking.check_out_date || '';
    const roomId = booking.ROOM_ID || booking.room_id || '';
    const bedCount = booking.BED_COUNT || booking.bed_count || '';
    const totalCost = booking.TotalCost || booking.total_cost || 0;
    const customerType = booking.CUSTOMER_TYPE || booking.customer_type || '';
    const customerLevel = booking.CUSTOMER_LEVEL || booking.customer_level || '';
    const lateCheckout = booking.LATE_CHECKOUT || booking.late_checkout || 0;
    const checkInStatus = booking.CHECK_IN_STATUS || booking.check_in_status;
    const extended = booking.EXTENDED || booking.extended || 0;
    const transfer = booking.TRANSFER || booking.transfer || 0;
    const isGroup = booking.IS_GROUP || booking.is_group || 0;
    const remarks = booking.REMARKS || booking.remarks || '';
    const bookingChannel = booking.BOOKING_CHANNEL || booking.booking_channel || 'walk-in';
    const agencyPayer = booking.AGENCY_PAYER || booking.agency_payer || 'agency';
    
    const bookingId = booking.BookingID || booking.booking_id;
    let cardHTML = `<div class="card ${cardClass}" data-floor="${escapeHtml(String(roomFloor))}" data-checkin="${escapeHtml(String(checkInDate))}" data-checkout="${escapeHtml(String(checkOutDate))}" data-idno="${escapeHtml(String(roomId))}" data-room-number="${escapeHtml(String(roomNumber))}" data-booking-id="${bookingId}" data-late-checkout="${lateCheckout}" data-booking-status="${escapeHtml(bookingStatus)}" data-booking-channel="${escapeHtml(String(bookingChannel))}" data-agency-payer="${escapeHtml(String(agencyPayer))}" data-customer-type="${escapeHtml(String(customerType))}" data-customer-level="${escapeHtml(String(customerLevel))}">`;
    
    // Card header
    cardHTML += '<div class="card-head" style="text-align: center; display: flex; align-items: center; justify-content: space-between;">';
    if (showToggle) {
      cardHTML += `<label class="custom-switch input-in">
        <input type="checkbox" class="custom-toggle-checkin" data-idno="${bookingId}" data-late-checkout="${lateCheckout}" ${isCheckedIn ? 'checked' : ''}>
        <span class="custom-slider"></span>
      </label>`;
    }
    cardHTML += '<header style="flex-grow: 1; text-align: center;">';
    if (isDirectReservation) {
      cardHTML += `<span class="unfix-header" style="cursor: pointer;" onclick="showAvailableRoomsForDirectReservation('${bookingId}', '${escapeHtml(String(checkInDate))}', '${escapeHtml(String(checkOutDate))}', '${escapeHtml(customerName)}', '${escapeHtml(String(bedCount))}')">UNFIX</span>`;
    } else {
      cardHTML += `<span onclick="openRoomMenuModal('${bookingId}')" style="cursor: pointer; font-weight: bold;">${escapeHtml(roomNumber)}</span>`;
    }
    cardHTML += '</header>';
    if (isGroup == 1) {
      cardHTML += '<i class="material-icons" style="font-size: 20px; color: #555;">group</i>';
    }
    cardHTML += '</div>';

    // Card body
    cardHTML += '<div class="card-body">';
    if (isDirectReservation) {
      cardHTML += '<p style="color: #ff6b6b; font-weight: bold;"><i class="material-icons" style="font-size: 14px; vertical-align: middle;">warning</i> No Room Assigned</p>';
    }
    cardHTML += `<p>${escapeHtml(roomType)}</p>`;
    cardHTML += '<div class="d-flex align-items-center justify-content-between">';
    cardHTML += `<p class="mb-2" style="font-weight: normal;">${escapeHtml(customerName)}</p>`;
    if (transfer === 1) {
      cardHTML += '<span class="badge badge-success tr-button">T/R</span>';
    }
    cardHTML += '</div>';
    cardHTML += '<div class="d-flex align-items-center justify-content-between">';
    if (isDirectReservation) {
      cardHTML += `<p style="margin: 0;">${bedCount || 0} Bed${(bedCount && bedCount > 1) ? 's' : ''}</p>`;
    } else {
      cardHTML += `<p style="margin: 0;">${Number(totalCost).toLocaleString('en-US')}</p>`;
    }
    cardHTML += '<div>';
    if (lateCheckout === 1) {
      cardHTML += '<span class="badge badge-success">LCO</span>';
    }
    if (checkInStatus === 0) {
      cardHTML += '<span class="badge badge-success">LCI</span>';
    }
    if (extended === 1) {
      cardHTML += '<span class="badge badge-warning">EXT</span>';
    }
    cardHTML += '</div>';
    cardHTML += '</div>';

    // Dates
    cardHTML += '<hr class="section-divider">';
    cardHTML += '<div class="dates">';
    cardHTML += `<span>In: ${formatDate(variables.checkInDate)}</span>`;
    cardHTML += `<span>Out: ${formatDate(variables.checkOutDate)}</span>`;
    cardHTML += '</div>';

    // Progress bars
    cardHTML += '<div class="progress-bars-wrapper">';
    cardHTML += '<div class="progress-bars">';
    for (let i = 0; i < variables.visibleStayed; i++) {
      cardHTML += '<div class="bar orange">';
      if (i === 4 && variables.totalDays >= 5) {
        cardHTML += '<span style="color: white; font-size: 12px; display: block; text-align: center;">5</span>';
      }
      cardHTML += '</div>';
    }
    for (let i = 0; i < variables.visibleRemaining; i++) {
      cardHTML += '<div class="bar green"></div>';
    }
    cardHTML += '</div>';
    if (variables.extraDays > 0) {
      cardHTML += `<span class="extra-days">+${variables.extraDays}</span>`;
    }
    cardHTML += '</div>';

    // Remarks indicators
    cardHTML += '<div class="remarks-indicators-container">';
    const escapedRemarks = escapeHtml(remarks).replace(/"/g, '&quot;');
    cardHTML += `<div class="remarks-indicator remarks-special" data-type="S" title="SPECIAL" data-booking-id="${bookingId}" data-room-number="${escapeHtml(roomNumber)}" data-customer-name="${escapeHtml(customerName)}" data-remarks="${escapedRemarks}" onclick="openRemarksModalFromData(this)" style="cursor: pointer;"><span>S</span></div>`;
    cardHTML += `<div class="remarks-indicator remarks-complaint" data-type="C" title="COMPLAINT" data-booking-id="${bookingId}" onclick="openComplaintModal('${bookingId}')" style="cursor: pointer; position: relative; overflow: visible;"><span>C</span><span id="crComplaintCount_${bookingId}" class="cr-badge-count cr-badge-complaint" style="display:none;">0</span></div>`;
    cardHTML += `<div class="remarks-indicator remarks-request" data-type="R" title="REQUEST" data-booking-id="${bookingId}" onclick="openRequestModal('${bookingId}')" style="cursor: pointer; position: relative; overflow: visible;"><span>R</span><span id="crRequestCount_${bookingId}" class="cr-badge-count cr-badge-request" style="display:none;">0</span></div>`;
    cardHTML += `<div class="remarks-indicator remarks-memo" data-type="M" title="MEMO" data-booking-id="${bookingId}" data-room-number="${escapeHtml(roomNumber)}" data-customer-name="${escapeHtml(customerName)}" data-remarks="${escapedRemarks}" onclick="openRemarksModalFromData(this)" style="cursor: pointer;"><span>M</span></div>`;
    cardHTML += '</div>';

    cardHTML += '</div></div>';

    // Remove "no data" message if exists
    const noDataMessage = checkedInTab.querySelector('.no-data-message');
    if (noDataMessage) {
      noDataMessage.remove();
    }

    // Create card element
    const cardElement = document.createElement('div');
    cardElement.innerHTML = cardHTML;
    const card = cardElement.firstElementChild;

    // Add card to tab with animation
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    checkedInTab.insertBefore(card, checkedInTab.firstChild);
    
    // Animate in
    setTimeout(() => {
      card.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    }, 10);

    // Switch to checked-in tab
    const checkedInTabButton = document.querySelector('.mdl-tabs__tab[data-target="checked-in-content"]');
    if (checkedInTabButton) {
      // Remove active from all tabs
      document.querySelectorAll('.mdl-tabs__tab').forEach(tab => tab.classList.remove('is-active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active-tab'));
      
      // Activate checked-in tab
      checkedInTabButton.classList.add('is-active');
      document.getElementById('checked-in-content').classList.add('active-tab');
    }

    // Initialize event handlers for the new card
    setTimeout(() => {
      // Re-initialize check-in toggle
      const toggle = card.querySelector('.custom-toggle-checkin');
      if (toggle && typeof window !== 'undefined') {
        // The toggle event handler should be attached via event delegation in main_data.js
        // But we can trigger a custom event to ensure it's initialized
        if (typeof window.loadAllBookingCardComplaintCounts === 'function') {
          window.loadAllBookingCardComplaintCounts();
        }
      }
    }, 100);

    console.log('Booking card added to checked-in tab:', bookingId);
  } catch (error) {
    console.error('Error adding booking to checked-in tab:', error);
  }
};

