/* Edit Group Booking as a pop-up over the Calendar.
   The edit form (views/booking/modal/edit_group_booking.ejs) is included in the calendar page; this file brings the functions that fill it
   (copied from group_booking_data.js, which belongs to the Group Booking page and starts that page's table - not needed here).
   editGroupBooking(groupId) opens the whole group like the reservation. */
(function () {
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Format currency helper function
function formatCurrency(value) {
    return `₱${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Populate Selected Room Prices breakdown (exposed for reuse)
// Mirrors the logic from the edit modal script to ensure availability here
function populateEditBreakdown(selectedRooms, computedPrices) {
  const container = $('#editGroupRoomBreakdown');
  container.empty();
  if (!selectedRooms || !selectedRooms.length) {
    $('#editGroupSummaryRoomLine').hide();
    return;
  }

  // Selected Room Prices + "Room Rate (N rooms x M nights)": the same rows as the Summary of Add Group Booking
  const mainNights = parseInt($('#editGroupNights').val(), 10) || 0;
  const individualNightsMap = {};   // roomNumber -> nights, when a room has its own dates
  $('.edit-individual-nights').each(function() {
    const roomNumber = $(this).data('room-number');
    const nights = parseInt($(this).val(), 10) || 0;
    if (roomNumber && nights > 0) {
      individualNightsMap[roomNumber] = nights;
    }
  });

  const peso = (n) => '\u20b1' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let html = '<div class="group-summary-subtitle">Selected Room Prices</div>';
  let roomTotal = 0;
  selectedRooms.forEach((room, idx) => {
    const price = computedPrices[idx] || 0;
    const roomNumber = room.ROOM_NUMBER || room.roomNumber;
    const nights = individualNightsMap[roomNumber] || mainNights;
    const total = nights > 0 ? price * nights : price;
    roomTotal += total;
    const own = individualNightsMap[roomNumber] ? ' (' + nights + ' nights, own dates)' : '';
    html += '<div class="group-summary-line group-room-breakdown-line"><span>Room ' + roomNumber + own + '</span><span>' + peso(price) + '/night' + (nights > 0 ? ' &middot; ' + peso(total) : '') + '</span></div>';
  });
  container.html(html);

  const n = selectedRooms.length;
  $('#editGroupSummaryRoomLabel').text('Room Rate (' + n + ' room' + (n === 1 ? '' : 's') + ' \u00d7 ' + mainNights + ' night' + (mainNights === 1 ? '' : 's') + ')');
  $('#editGroupSummaryRoomTotal').text(roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  $('#editGroupSummaryRoomLine').show();
}

function formatPaidAmount(input) {
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2);
}

// Compute total for edit group booking form
function computeEditGroupTotal() {
    if (typeof window.syncEditGroupLongTermRateDropdown === 'function') {
        window.syncEditGroupLongTermRateDropdown();
    }
    // Get main nights (for bookings without individual dates)
    const mainNights = parseInt($('#editGroupNights').val(), 10) || 0;
    const pricesRaw = $('#editGroupSelectedRoomPrices').val();
    const prices = pricesRaw ? pricesRaw.split(/[|,]/).map(p => parseFloat(p) || 0) : [];
    
    // Get individual booking dates and map to room numbers
    // Map: roomNumber -> nights
    const individualNightsMap = {};
    $('.edit-individual-nights').each(function() {
      const roomNumber = $(this).data('room-number');
      const nights = parseInt($(this).val(), 10) || 0;
      if (roomNumber && nights > 0) {
        individualNightsMap[roomNumber] = nights;
      }
    });
    
    // Get selected room IDs and map to room numbers
    const selectedRoomIds = $('#editGroupSelectedRooms').val();
    const selectedRoomIdsArray = selectedRoomIds ? selectedRoomIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
    
    // Create map: roomId -> roomNumber from bookings data (most reliable)
    const roomIdToNumberMap = {};
    if (window.editGroupBookingsData && window.editGroupBookingsData.length > 0) {
      window.editGroupBookingsData.forEach(b => {
        const roomId = b.ROOM_ID || b.roomId;
        const roomNumber = b.ROOM_NUMBER || b.roomNumber;
        if (roomId && roomNumber) {
          roomIdToNumberMap[roomId] = roomNumber;
        }
      });
    }
    
    // Fallback: Try to get room numbers from the breakdown HTML if bookings data not available
    if (Object.keys(roomIdToNumberMap).length === 0) {
      const breakdownHtml = $('#editGroupRoomBreakdown').html() || '';
      if (breakdownHtml) {
        const roomMatches = breakdownHtml.match(/Room\s+(\d+):/g);
        if (roomMatches) {
          roomMatches.forEach((match, idx) => {
            const roomNumMatch = match.match(/Room\s+(\d+)/);
            if (roomNumMatch && selectedRoomIdsArray[idx]) {
              roomIdToNumberMap[selectedRoomIdsArray[idx]] = roomNumMatch[1];
            }
          });
        }
      }
    }
    
    // Calculate room subtotal per room (using individual nights if available)
    let roomSubtotal = 0;
    prices.forEach((price, idx) => {
      const roomId = selectedRoomIdsArray[idx];
      const roomNumber = roomId ? roomIdToNumberMap[roomId] : null;
      
      // Use individual nights if available for this room, otherwise use main nights
      const nights = (roomNumber && individualNightsMap[roomNumber]) ? individualNightsMap[roomNumber] : mainNights;
      roomSubtotal += price * nights;
    });

    const adultQty = $('#editGroupIncludeBreakfast').is(':checked') ? (parseInt($('#editGroupBreakfastAdultQty').val(), 10) || 0) : 0;
    const adultPrice = parseFloat($('#editGroupBreakfastAdultPrice').val()) || 0;
    const kidQty = $('#editGroupIncludeBreakfast').is(':checked') ? (parseInt($('#editGroupBreakfastKidQty').val(), 10) || 0) : 0;
    const kidPrice = parseFloat($('#editGroupBreakfastKidPrice').val()) || 0;
    const breakfastIndividual = $('#editGroupBreakfastIndividual').is(':checked');

    const pickupPrice = $('#editGroupIncludePickup').is(':checked') ? parseFloat($('#editGroupPickupPrice').val()) || 0 : 0;
    const dropoffPrice = $('#editGroupIncludeDropoff').is(':checked') ? parseFloat($('#editGroupDropoffPrice').val()) || 0 : 0;

    // Get number of rooms for individual service calculations
    const selectedRooms = $('#editGroupSelectedRooms').val();
    const numRooms = selectedRooms ? selectedRooms.split(',').length : 1;

    const breakfastTotal = (adultQty * adultPrice) + (kidQty * kidPrice);
    let breakfastTotalWithIndividual = breakfastIndividual ? breakfastTotal * numRooms : breakfastTotal;
    // only the extras above 2 per room are charged (the 2 included are inside the room rate), like Add Group Booking
    if (typeof window.getEditGroupExtraBreakfast === 'function') breakfastTotalWithIndividual = window.getEditGroupExtraBreakfast().total;

    const servicesTotal = breakfastTotalWithIndividual + pickupPrice + dropoffPrice;

    // Get late check-out fee (PER ROOM - multiply by number of rooms)
    // Reuse numRooms variable already declared above
    const lateCheckoutFeePerRoom = parseFloat($('#editGroupLateCheckoutFee').val()) || 0;
    const lateCheckoutFeeTotal = lateCheckoutFeePerRoom * numRooms;

    // Calculate extra services total
    const groupBookingId = $('#editGroupBookingId').val();
    let extraServicesTotal = 0;
    if (groupBookingId && window.editGroupAddedServicesMap && window.editGroupAddedServicesMap[groupBookingId]) {
        window.editGroupAddedServicesMap[groupBookingId].forEach(service => {
            if (!service.HIDDEN_FOR_UI) {
                const serviceCost = parseFloat(service.SERVICE_COST) || 0;
                const quantity = parseInt(service.QUANTITY) || 0;
                extraServicesTotal += serviceCost * quantity;
            }
        });
    }

    // Check if individual billing is enabled (inverted logic)
    const isConsolidated = !$('#editGroupIndividualBilling').is(':checked');

    // Always calculate the full total in frontend for user visibility
    const subtotal = roomSubtotal + servicesTotal + lateCheckoutFeeTotal + extraServicesTotal;
    
    // Senior/PWD Discount - no longer staff-editable (read-only display only,
    // see editGroupSeniorPwdReadOnly in edit_group_booking.ejs). The gate is
    // now "does this booking already have one stored" (from the hidden
    // percent/room-count fields, only ever populated on initial load) instead
    // of a checkbox, so a discount already on the booking before this change
    // keeps applying/showing, but there's no way to newly add one here.
    const storedSeniorPwdPercent = parseFloat($('#editGroupSeniorPwdDiscountPercent').val()) || 0;
    const storedSeniorPwdRoomCount = parseInt($('#editGroupSeniorPwdRoomCount').val()) || 0;
    const hasStoredSeniorPwdDiscount = storedSeniorPwdPercent > 0 && storedSeniorPwdRoomCount > 0;
    let seniorPwdDiscountAmount = 0;

    // Get number of rooms (reuse existing variables if already declared)
    const editSelectedRooms = $('#editGroupSelectedRooms').val();
    const editNumRooms = editSelectedRooms ? editSelectedRooms.split(',').length : 1;

    // Update total rooms display
    $('#editGroupTotalRoomsDisplay').text(editNumRooms);

    // Calculate Senior/PWD discount (percentage of ROOM CHARGES ONLY, not services)
    if (hasStoredSeniorPwdDiscount && roomSubtotal > 0 && editNumRooms > 0) {
        const discountPercent = Math.min(100, Math.max(0, storedSeniorPwdPercent));
        const seniorPwdRoomCount = Math.min(Math.max(0, storedSeniorPwdRoomCount), editNumRooms);

        // Calculate discount only for Senior/PWD rooms
        // Since room prices can differ (1-bed vs 2-bed), we apply discount to the most expensive rooms first
        // Sort prices from highest to lowest and apply discount to top N rooms (where N = seniorPwdRoomCount)
        const sortedPrices = [...prices].sort((a, b) => b - a); // Sort descending (highest first)
        const seniorPwdPrices = sortedPrices.slice(0, seniorPwdRoomCount); // Get top N most expensive rooms
        const seniorPwdRoomChargesPerNight = seniorPwdPrices.reduce((sum, price) => sum + price, 0);
        const seniorPwdRoomCharges = seniorPwdRoomChargesPerNight * nights; // Total charges for Senior/PWD rooms
        const discountDecimal = discountPercent / 100; // Convert percentage to decimal
        seniorPwdDiscountAmount = seniorPwdRoomCharges * discountDecimal; // Apply only to Senior/PWD room charges

        $('#editGroupSeniorPwdDiscount').val(seniorPwdDiscountAmount.toFixed(2));
        $('#editGroupSeniorPwdDiscountAmount').val('₱' + seniorPwdDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        $('#editGroupSeniorPwdRoomCountDisplay').text(seniorPwdRoomCount);
        $('#editGroupSeniorPwdPercentDisplay').text(discountPercent);
        $('#editGroupSeniorPwdReadOnly').show();

        // If Senior/PWD discount is 100%, automatically disable Additional Discount
        if (discountPercent >= 100) {
            $('#editGroupIncludeDiscount').prop('checked', false);
            $('#editGroupDiscountWrapper').hide();
            $('#editGroupDiscount').val('0');
        }
    } else {
        $('#editGroupSeniorPwdDiscount').val(0);
        $('#editGroupSeniorPwdDiscountAmount').val('');
        $('#editGroupSeniorPwdReadOnly').hide();
    }
    
    const discount = $('#editGroupIncludeDiscount').prop('checked') ? (parseFloat($('#editGroupDiscount').val()) || 0) : 0;
    
    let finalBalance = subtotal - seniorPwdDiscountAmount - discount;
    
    // Ensure finalBalance is not negative
    if (finalBalance < 0) {
        finalBalance = 0;
    }

    // Get paid amount and validate it doesn't exceed total
    let paidAmount = parseFloat($('#editGroupPaidAmount').val()) || 0;
    
    // Prevent paid amount from exceeding total and ensure it's not negative
    if (paidAmount > finalBalance) {
        paidAmount = finalBalance;
        $('#editGroupPaidAmount').val(paidAmount.toFixed(2));
    }
    // Ensure paid amount is not negative
    if (paidAmount < 0) {
        paidAmount = 0;
        $('#editGroupPaidAmount').val('0.00');
    }
    
    // Calculate balance (total - paid amount)
    const balance = finalBalance - paidAmount;
    
    // Determine payment status
    let paymentStatus;
    if (paidAmount <= 0) {
        paymentStatus = 'unpaid';
    } else if (paidAmount >= finalBalance) {
        paymentStatus = 'paid';
    } else {
        paymentStatus = 'partial';
    }
    
    // Update payment status field
    $('#editGroupPaymentStatus').val(paymentStatus);
    
    // Update payment status styling with CSS classes
    $('#editGroupPaymentStatus').removeClass('status-paid status-partial status-unpaid');
    if (paymentStatus === 'paid') {
        $('#editGroupPaymentStatus').addClass('status-paid');
    } else if (paymentStatus === 'partial') {
        $('#editGroupPaymentStatus').addClass('status-partial');
    } else {
        $('#editGroupPaymentStatus').addClass('status-unpaid');
    }

    // Update paid amount display (format without currency symbol)
    $('#editGroupComputedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    
    // Update balance display (format without currency symbol)
    $('#editGroupComputedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');

    if (isConsolidated) {
        // Show consolidated total with indicator
        if (finalBalance < 0) {
            $('#editGroupComputedTotal').html(`<b class="text-warning">0.00 <small>(Master)</small></b>`);
        } else {
            $('#editGroupComputedTotal').html(`<b>${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <small class="text-info">(Master)</small></b>`);
        }
    } else {
        // Regular billing calculation
        if (finalBalance < 0) {
            $('#editGroupComputedTotal').html('<b class="text-warning">0.00</b>');
        } else {
            $('#editGroupComputedTotal').html('<b>' + finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        }
    }
}

// Edit Group Booking function
function editGroupBooking(groupBookingId) {
    // Fetch group booking details for editing
    fetch(`/booking/edit_group_booking/${groupBookingId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Set the booking ID first (this prevents modal reset from clearing it)
                $('#editGroupBookingId').val(data.booking.groupBookingId);

                // Ensure guest type and level dropdowns are loaded before populating form
                ensureGuestDataLoaded().then(() => {
                    populateEditGroupForm(data.booking);
                    $('#modal-edit-group-booking').modal('show');
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: data.message || 'Failed to fetch group booking details',
                    confirmButtonText: 'OK'
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'An error occurred while fetching group booking details',
                confirmButtonText: 'OK'
            });
        });
}

// Ensure guest type and level data is loaded
function ensureGuestDataLoaded() {
    return new Promise((resolve) => {
        // Check if guest type dropdown has options (excluding the disabled placeholder)
        const guestTypeSelect = $('#editGroupGuestType');
        const guestLevelSelect = $('#editGroupGuestLevel');

        if (guestTypeSelect.find('option').length > 1 && guestLevelSelect.find('option').length > 1) {
            // Data already loaded
            resolve();
            return;
        }

        // Load guest types if not already loaded
        if (guestTypeSelect.find('option').length <= 1) {
            $.ajax({
                url: '/booking/get_guest_types',
                method: 'GET',
                success: function(data) {
                    guestTypeSelect.empty();
                    guestTypeSelect.append('<option value="" disabled>Guest Type</option>');
                    (data || []).forEach(type => {
                        guestTypeSelect.append(`<option value="${type.IDNo}">${type.TYPE}</option>`);
                    });
                },
                error: function(err) {
                    console.error('Error fetching guest types:', err);
                    guestTypeSelect.html('<option value="" disabled>Error loading guest types</option>');
                }
            });
        }

        // Load guest levels if not already loaded
        if (guestLevelSelect.find('option').length <= 1) {
            $.ajax({
                url: '/booking/get_guest_level',
                method: 'GET',
                success: function(data) {
                    guestLevelSelect.empty();
                    guestLevelSelect.append('<option value="" disabled>Guest Level</option>');
                    (data || []).forEach(level => {
                        guestLevelSelect.append(`<option value="${level.IDNo}">${level.TYPE}</option>`);
                    });
                },
                error: function(err) {
                    console.error('Error fetching guest levels:', err);
                    guestLevelSelect.html('<option value="" disabled>Error loading guest levels</option>');
                }
            });
        }

        // Wait a bit for AJAX calls to complete, then resolve
        setTimeout(resolve, 300);
    });
}

// Store bookings data globally for total calculation
window.editGroupBookingsData = null;

// Function to populate edit group form
function populateEditGroupForm(booking) {
    // Store bookings data globally for total calculation
    window.editGroupBookingsData = booking.bookings || [];
    
    // Set hidden fields
    $('#editGroupBookingId').val(booking.groupBookingId);
    $('#editGroupSelectedRooms').val(booking.selectedRooms);
    $('#editGroupSelectedRoomPrices').val(booking.selectedRoomPrice);
    $('#editGroupNights').val(booking.qty);

    // Populate selected rooms for pre-selection in room search results
    if (booking.selectedRooms) {
        window.editGroupManualSelectedRooms = booking.selectedRooms.split(',').map(id => {
            const parsed = parseInt(id.trim());
            return isNaN(parsed) ? id.trim() : parsed; // Keep as string if not a number
        }).filter(id => id !== '');
    } else {
        window.editGroupManualSelectedRooms = [];
    }

    // Set form fields
    $('#editGroupDaterange').val(booking.daterange);
    $('#editGroupName').val(booking.groupName);
    if (window.ContactChannel) {
        window.ContactChannel.setFields('#editGroupContactChannel', '#editGroupContact', booking.groupContact);
    } else {
        $('#editGroupContact').val(booking.groupContact);
    }
    $('#editGroupNumberOfRooms').val(booking.numberOfRooms);
    $('#editGroupPaymentStatus').val(booking.paymentStatus);
    $('#editGroupBookingRoute').val(booking.bookingRoute);

    // Handle individual booking dates if they differ from main date range
    if (booking.bookings && booking.bookings.length > 0) {
        // Use moment to avoid timezone shifts (treat dates as local dates)
        const formatDate = (d) => moment(d).format('YYYY-MM-DD');
        const mainCheckInStr = formatDate(booking.bookings[0].CHECK_IN_DATE);
        const mainCheckOutStr = formatDate(booking.bookings[0].CHECK_OUT_DATE);
        const bookingsWithDifferentDates = [];
        
        // Check if any booking has different dates
        booking.bookings.forEach((b, index) => {
            const bookingCheckInStr = formatDate(b.CHECK_IN_DATE);
            const bookingCheckOutStr = formatDate(b.CHECK_OUT_DATE);
            
            if (index > 0 && (
                bookingCheckInStr !== mainCheckInStr ||
                bookingCheckOutStr !== mainCheckOutStr
            )) {
                bookingsWithDifferentDates.push({
                    bookingId: b.BOOKING_ID || b.bookingId,
                    roomNumber: b.ROOM_NUMBER || b.roomNumber,
                    checkIn: bookingCheckInStr,
                    checkOut: bookingCheckOutStr,
                    index: index
                });
            }
        });
        
        // Show individual dates section if there are different dates
        if (bookingsWithDifferentDates.length > 0) {
            displayIndividualBookingDates(bookingsWithDifferentDates);
        } else {
            $('#editGroupIndividualDatesSection').hide();
        }
    } else {
        $('#editGroupIndividualDatesSection').hide();
    }

    // Set bed requirements derived from selected rooms
    if (booking.bedRequirements) {
        $('#editGroupBed1Count').val(booking.bedRequirements.bed1 || 0);
        $('#editGroupBed2Count').val(booking.bedRequirements.bed2 || 0);
    }

    // Set guest type and level after ensuring dropdowns are loaded
    setTimeout(() => {
        // Ensure values are the correct type (string vs number)
        const guestTypeValue = String(booking.guestType || '');
        const guestLevelValue = String(booking.guestLevel || '');

        $('#editGroupGuestType').val(guestTypeValue);
        $('#editGroupGuestLevel').val(guestLevelValue);

        // Force trigger change events to update UI
        $('#editGroupGuestType').trigger('change');
        $('#editGroupGuestLevel').trigger('change');
    }, 200);

    $('#editGroupCheckInStatus').val(booking.checkInStatus);
    $('#editGroupCheckOutStatus').val(booking.checkOutStatus);

    // Set Hold Pending checkbox and hide/show Check-In/Check-Out Status accordingly
    const isHoldPending = booking.holdPending === 1 || booking.holdPending === '1' || booking.holdPending === true;
    $('#editGroupHoldPendingCheckbox').prop('checked', isHoldPending);
    if (typeof window.applyEditGroupHoldPendingUI === 'function') {
        window.applyEditGroupHoldPendingUI(isHoldPending);
    }

    $('#editGroupRemarks').val(booking.remarks);

    const isContractedRate = booking.isContractedRate === 1 || booking.isContractedRate === '1' || booking.isContractedRate === true;
    $('#editGroupIncludeContractedRate').prop('checked', isContractedRate);

    // Set late checkout fee
    const lateCheckoutFee = parseFloat(booking.lateCheckoutFee) || 0;
    $('#editGroupLateCheckoutFee').val(lateCheckoutFee);
    $('#editGroupLateCheckoutFeeInput').val(lateCheckoutFee);
    
    // Show/hide late checkout fee display based on checkOutStatus
    if (booking.checkOutStatus == 1 && lateCheckoutFee > 0) {
        $('#editGroupLateCheckoutFeeDisplay').show();
    } else {
        $('#editGroupLateCheckoutFeeDisplay').hide();
    }
    $('#editGroupAgencySelect').data('pending-agency-id', booking.agencyId || '');

    if (booking.bookingRoute === 'agency') {
        $('#editGroupAgencyWrapper').show();
        const payer = booking.agencyPayer || 'agency';
        $(`input[name="editGroupAgencyPayer"][value="${payer}"]`).prop('checked', true);
        $('#editGroupAgencyPayerRateHint').text(payer === 'guest' ? 'Regular Rate' : 'Agency Rate');
        if (typeof window.loadEditGroupAgencies === 'function') {
            window.loadEditGroupAgencies();
        }
    } else {
        $('#editGroupAgencyWrapper').hide();
    }

    if (booking.bookingRoute === 'booking-channel') {
        $('#editGroupChannelBookingIdWrapper').show();
        $('#editGroupChannelBookingId').val(booking.channelBookingId || '');
    } else {
        $('#editGroupChannelBookingIdWrapper').hide();
        $('#editGroupChannelBookingId').val('');
    }

    // ================= SENIOR/PWD DISCOUNT (EDIT) =================
    // No longer staff-editable (see editGroupSeniorPwdReadOnly) - if this
    // booking already has one stored from before that change, load it into
    // the hidden fields so it's preserved (read-only display, computed in
    // computeEditGroupTotal) instead of silently getting zeroed on save.
    const seniorPercent = parseFloat(booking.seniorPwdDiscountPercent) || 0;
    const seniorCountFromDb = parseInt(booking.seniorPwdRoomCount, 10) || 0;

    if (seniorPercent > 0 && seniorCountFromDb > 0) {
        $('#editGroupSeniorPwdDiscountPercent').val(seniorPercent);
        $('#editGroupSeniorPwdRoomCount').val(seniorCountFromDb);
    } else {
        $('#editGroupSeniorPwdReadOnly').hide();
        $('#editGroupSeniorPwdDiscountPercent').val(0);
        $('#editGroupSeniorPwdRoomCount').val(0);
        $('#editGroupSeniorPwdDiscountAmount').val('');
        $('#editGroupSeniorPwdDiscount').val('0');
    }

    // Initialize Paid Amount like single edit: prefer paidAmount, then totalPaid, else 0
    if (booking.paidAmount !== undefined && booking.paidAmount !== null && booking.paidAmount !== '') {
        const initPaid = parseFloat(booking.paidAmount) || 0;
        $('#editGroupPaidAmount').val(initPaid.toFixed(2));
    } else if (booking.totalPaid !== undefined && booking.totalPaid !== null && booking.totalPaid !== '') {
        const initPaid = parseFloat(booking.totalPaid) || 0;
        $('#editGroupPaidAmount').val(initPaid.toFixed(2));
    } else {
        // leave as default
    }
    
    // Trigger computation after setting paid amount and senior fields
    setTimeout(() => {
        computeEditGroupTotal();
    }, 100);

    // Set fees - explicitly handle checked/unchecked state
    if (parseFloat(booking.reservationFee) > 0) {
        $('#editGroupIncludeReservationFee').prop('checked', true);
        $('#editGroupReservationFeeWrapper').show();
        $('#editGroupReservationFee').val(booking.reservationFee);
    } else {
        $('#editGroupIncludeReservationFee').prop('checked', false);
        $('#editGroupReservationFeeWrapper').hide();
        $('#editGroupReservationFee').val('0');
    }

    // Additional discount:
    // If we have a Senior/PWD percentage stored, assume GROUP_DISCOUNT
    // came from Senior/PWD and default Additional Discount to 0.
    if (seniorPercent <= 0 && parseFloat(booking.discount) > 0) {
        $('#editGroupIncludeDiscount').prop('checked', true);
        $('#editGroupDiscountWrapper').show();
        $('#editGroupDiscount').val(booking.discount);
    } else {
        $('#editGroupIncludeDiscount').prop('checked', false);
        $('#editGroupDiscountWrapper').hide();
        $('#editGroupDiscount').val('0');
    }

    // Set individual billing (inverted logic: if consolidatedBilling is true, checkbox is unchecked)
    $('#editGroupIndividualBilling').prop('checked', booking.consolidatedBilling === false);

    // Set services - explicitly handle checked/unchecked state
    const hasBreakfast = parseInt(booking.breakfastAdultQty) > 0 || parseInt(booking.breakfastKidQty) > 0;
    if (hasBreakfast) {
        $('#editGroupIncludeBreakfast').prop('checked', true);
        $('#editGroupBreakfastFields').removeClass('d-none');
        
        // Set breakfast individual checkbox based on backend detection
        $('#editGroupBreakfastIndividual').prop('checked', booking.breakfastIndividual === true);
		$('#editGroupBreakfastAdultQty').val(booking.breakfastAdultQty);
		// Use unit price = TOTAL_COST / QTY when QTY > 0; otherwise leave as-is
		var _adultQty = parseFloat(booking.breakfastAdultQty) || 0;
		var _adultTotal = parseFloat(booking.breakfastAdultPrice) || 0;
		$('#editGroupBreakfastAdultPrice').val(_adultQty > 0 ? (_adultTotal / _adultQty).toFixed(2) : _adultTotal);
        $('#editGroupBreakfastAdultId').val(booking.breakfastAdultId);
		$('#editGroupBreakfastKidQty').val(booking.breakfastKidQty);
		var _kidQty = parseFloat(booking.breakfastKidQty) || 0;
		var _kidTotal = parseFloat(booking.breakfastKidPrice) || 0;
		$('#editGroupBreakfastKidPrice').val(_kidQty > 0 ? (_kidTotal / _kidQty).toFixed(2) : _kidTotal);
        $('#editGroupBreakfastKidId').val(booking.breakfastKidId);
    } else {
        $('#editGroupIncludeBreakfast').prop('checked', false);
        $('#editGroupBreakfastFields').addClass('d-none');
        $('#editGroupBreakfastAdultQty, #editGroupBreakfastKidQty').val('');
        // Set default service IDs when no breakfast is selected
        $('#editGroupBreakfastAdultId').val('74'); // Default breakfast adult service ID
        $('#editGroupBreakfastKidId').val('75'); // Default breakfast kid service ID
    }

    // the extra breakfast already saved on the group (above 2 per room): its prices and how many each room has
    if (typeof window.setEditGroupExtraBfState === 'function') {
        const ex = booking.breakfastExtras || {};
        const byRoom = {};
        (booking.bookings || []).forEach(function (b) {
            const rec = ex.byBooking && ex.byBooking[b.bookingId];
            byRoom[b.ROOM_ID || b.roomId] = rec ? { a: rec.a || 0, k: rec.k || 0 } : { a: 0, k: 0 };
        });
        window.setEditGroupExtraBfState(ex.adultPrice, ex.kidPrice, byRoom);
    }

    if (parseFloat(booking.pickupPrice) > 0) {
        $('#editGroupIncludePickup').prop('checked', true);
        $('#editGroupPickupWrapper').show();
        $('#editGroupPickupPrice').val(booking.pickupPrice);
        $('#editGroupPickupServiceId').val(booking.pickupServiceId);
    } else {
        $('#editGroupIncludePickup').prop('checked', false);
        $('#editGroupPickupWrapper').hide();
        $('#editGroupPickupPrice').val('');
        // Set default pickup service ID when no pickup is selected
        $('#editGroupPickupServiceId').val('76'); // Default pickup service ID
    }

    if (parseFloat(booking.dropoffPrice) > 0) {
        $('#editGroupIncludeDropoff').prop('checked', true);
        $('#editGroupDropoffWrapper').show();
        $('#editGroupDropoffPrice').val(booking.dropoffPrice);
        $('#editGroupDropoffServiceId').val(booking.dropoffServiceId);
    } else {
        $('#editGroupIncludeDropoff').prop('checked', false);
        $('#editGroupDropoffWrapper').hide();
        $('#editGroupDropoffPrice').val('');
        // Set default dropoff service ID when no dropoff is selected
        $('#editGroupDropoffServiceId').val('77'); // Default dropoff service ID
    }

    // Handle individual booking dates if they differ from main date range
    if (booking.bookings && booking.bookings.length > 0) {
        const mainCheckIn = new Date(booking.bookings[0].CHECK_IN_DATE);
        const mainCheckOut = new Date(booking.bookings[0].CHECK_OUT_DATE);
        const bookingsWithDifferentDates = [];
        
        // Check if any booking has different dates
        booking.bookings.forEach((b, index) => {
            const bookingCheckIn = new Date(b.CHECK_IN_DATE);
            const bookingCheckOut = new Date(b.CHECK_OUT_DATE);
            
            if (index > 0 && (
                bookingCheckIn.getTime() !== mainCheckIn.getTime() ||
                bookingCheckOut.getTime() !== mainCheckOut.getTime()
            )) {
                bookingsWithDifferentDates.push({
                    bookingId: b.BOOKING_ID || b.bookingId,
                    roomNumber: b.ROOM_NUMBER || b.roomNumber,
                    checkIn: b.CHECK_IN_DATE,
                    checkOut: b.CHECK_OUT_DATE,
                    index: index
                });
            }
        });
        
        // Show individual dates section if there are different dates
        if (bookingsWithDifferentDates.length > 0) {
            displayIndividualBookingDates(bookingsWithDifferentDates);
        } else {
            $('#editGroupIndividualDatesSection').hide();
        }
    } else {
        $('#editGroupIndividualDatesSection').hide();
    }

    // Load extra services for the group booking
    if (booking.groupBookingId) {
        if (typeof loadEditGroupExistingServices === 'function') {
            loadEditGroupExistingServices(booking.groupBookingId);
        }
    }

    // Auto-search for rooms after populating form data
    setTimeout(() => {
        if ($('#editGroupDaterange').val() && $('#editGroupNumberOfRooms').val() && 
            $('#editGroupBookingRoute').val() && $('#editGroupCheckInStatus').val() && 
            $('#editGroupCheckOutStatus').val()) {
            $('#editGroupSearchRooms').click();
        }
    }, 500);
}

// Function to display individual booking dates that differ from main date range
function displayIndividualBookingDates(bookingsWithDifferentDates) {
    const container = $('#editGroupIndividualDatesList');
    container.empty();
    
    const toDateStr = (d) => moment(d).format('YYYY-MM-DD');
    const diffNights = (inStr, outStr) => moment(outStr, 'YYYY-MM-DD').diff(moment(inStr, 'YYYY-MM-DD'), 'days');
    
    bookingsWithDifferentDates.forEach(booking => {
        const checkInStr = toDateStr(booking.checkIn);
        const checkOutStr = toDateStr(booking.checkOut);
        const nights = diffNights(checkInStr, checkOutStr);
        
        const dateRow = $(`
            <div class="mb-3" style="background-color: #1f262a; border-radius: 6px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08);">
                <div class="row align-items-center">
                    <div class="col-lg-3">
                        <label class="form-label mb-1" style="font-size: 12px; color: #9fe073; font-weight: 600;">
                            <i class="fa fa-door-open me-1"></i>Room ${booking.roomNumber}
                        </label>
                    </div>
                    <div class="col-lg-4">
                        <label class="form-label mb-1" style="font-size: 11px;">Check-In Date</label>
                        <input type="date" class="form-control edit-individual-checkin" 
                               data-booking-id="${booking.bookingId}" 
                               value="${checkInStr}" 
                               style="background-color: #41474c; color: #ffffff; border: 1px solid #41474c;">
                    </div>
                    <div class="col-lg-4">
                        <label class="form-label mb-1" style="font-size: 11px;">Check-Out Date</label>
                        <input type="date" class="form-control edit-individual-checkout" 
                               data-booking-id="${booking.bookingId}" 
                               value="${checkOutStr}" 
                               style="background-color: #41474c; color: #ffffff; border: 1px solid #41474c;">
                    </div>
                    <div class="col-lg-1">
                        <label class="form-label mb-1" style="font-size: 11px;">Nights</label>
                        <input type="text" class="form-control edit-individual-nights" 
                               data-booking-id="${booking.bookingId}" 
                               data-room-number="${booking.roomNumber}"
                               value="${nights}" 
                               readonly 
                               style="background-color: #2a3135; color: #6f9c40; font-weight: bold; text-align: center;">
                    </div>
                </div>
            </div>
        `);
        
        container.append(dateRow);
    });
    
    // Show the section
    $('#editGroupIndividualDatesSection').show();
    
    // Update nights when dates change and refresh breakdown/total
    // Use event delegation to handle dynamically added elements
    $(document).off('change', '.edit-individual-checkin, .edit-individual-checkout'); // Remove old handlers
    $(document).on('change', '.edit-individual-checkin, .edit-individual-checkout', function() {
        const bookingId = $(this).data('booking-id');
        const checkInInput = $(`.edit-individual-checkin[data-booking-id="${bookingId}"]`);
        const checkOutInput = $(`.edit-individual-checkout[data-booking-id="${bookingId}"]`);
        const nightsInput = $(`.edit-individual-nights[data-booking-id="${bookingId}"]`);
        
        const checkInStr = checkInInput.val();
        const checkOutStr = checkOutInput.val();
        
        if (checkInStr && checkOutStr) {
            const nights = diffNights(checkInStr, checkOutStr);
            nightsInput.val(nights);
        } else {
            nightsInput.val('0');
        }
        
        // Recompute totals and refresh room breakdown immediately
        computeEditGroupTotal();
        
        // Refresh breakdown using current bookings data + prices
        if (Array.isArray(window.editGroupBookingsData)) {
          const pricesRaw = $('#editGroupSelectedRoomPrices').val();
          const computedPrices = pricesRaw ? pricesRaw.split(/[|,]/).map(p => parseFloat(p) || 0) : [];
          populateEditBreakdown(window.editGroupBookingsData, computedPrices);
        }
    });

    (() => {
        // Only search if we have the required data
        const daterange = $('#editGroupDaterange').val();
        const numberOfRooms = $('#editGroupNumberOfRooms').val();
        const bookingRoute = $('#editGroupBookingRoute').val();

        if (daterange && numberOfRooms && bookingRoute) {
            // Trigger room search
            $('#editGroupSearchRooms').click();
            // Compute total after room search completes (with delay to allow AJAX to finish)
            setTimeout(() => {
                computeEditGroupTotal();
            }, 2000);
        } else {
            // If no room search, compute immediately
            computeEditGroupTotal();
        }
    }, 1000); // Increased delay to ensure form is fully populated
}

  window.editGroupBooking = editGroupBooking;
  window.computeEditGroupTotal = computeEditGroupTotal;
  window.populateEditGroupForm = populateEditGroupForm;
  window.ensureGuestDataLoaded = ensureGuestDataLoaded;
  window.displayIndividualBookingDates = displayIndividualBookingDates;
  window.formatPaidAmount = formatPaidAmount;
})();
