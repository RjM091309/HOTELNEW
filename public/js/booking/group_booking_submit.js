$(document).ready(function () {
  const form = $('#groupBookingForm');

  form.off('submit').on('submit', function (event) {
    event.preventDefault();

    const selectedRooms = $('#groupSelectedRooms').val();
    const selectedRoomPrice = $('#groupSelectedRoomPrices').val();
    const qty = $('#groupNights').val();
    const daterange = $('#groupDaterange').val();
    const groupName = $('#groupName').val();
    const groupContact = $('#groupContact').val();
    const numberOfRooms = $('#groupNumberOfRooms').val();
    const paymentStatus = $('#groupPaymentStatus').val();
    const bookingRoute = $('#groupBookingRoute').val();
    const guestType = $('#groupGuestType').val();
    const guestLevel = $('#groupGuestLevel').val();
    const checkOutStatus = $('#groupCheckOutStatus').val();
    const checkInStatus = $('#groupCheckInStatus').val();
    const holdPending = $('#groupHoldPendingCheckbox').is(':checked') ? 'true' : 'false';
    const remarks = $('#groupRemarks').val();
    const lateCheckoutFee = parseFloat($('#groupLateCheckoutFee').val()) || 0;

    const breakfastAdultQty = $('#groupBreakfastAdultQty').val();
    const breakfastAdultPrice = $('#groupBreakfastAdultPrice').val();
    const breakfastAdultId = $('#groupBreakfastAdultId').val();
    const breakfastKidQty = $('#groupBreakfastKidQty').val();
    const breakfastKidPrice = $('#groupBreakfastKidPrice').val();
    const breakfastKidId = $('#groupBreakfastKidId').val();
    const breakfastIndividual = $('#groupBreakfastIndividual').is(':checked');
    
    const pickupServiceId = $('#groupPickupServiceId').val();
    const pickupPrice = $('#groupPickupPrice').val();

    const dropoffServiceId = $('#groupDropoffServiceId').val();
    const dropoffPrice = $('#groupDropoffPrice').val();

    const includePickup = $('#groupIncludePickup').is(':checked');
    const includeDropoff = $('#groupIncludeDropoff').is(':checked');
    const flightNumber = $('#groupFlightNumber').val();
    const passengerCount = $('#groupPassengerCount').val();

    if (!daterange || !groupName || !groupContact || !numberOfRooms) {
      Swal.fire({
        icon: 'error',
        title: 'Incomplete Form',
        text: 'Please fill out all required fields before saving.',
      });
      return;
    }

    if (!selectedRooms) {
      Swal.fire({
        icon: 'warning',
        title: 'No Rooms Selected',
        text: 'Please select a room block for this group booking.',
      });
      return;
    }

    // Validate that number of rooms needed matches selected rooms count
    const selectedRoomsArray = selectedRooms.split(',').filter(Boolean);
    const selectedRoomsCount = selectedRoomsArray.length;
    const numberOfRoomsNeeded = parseInt(numberOfRooms, 10) || 0;

    if (selectedRoomsCount !== numberOfRoomsNeeded) {
      Swal.fire({
        icon: 'error',
        title: 'Room Count Mismatch',
        html: `Number of Rooms Needed (${numberOfRoomsNeeded}) does not match the number of selected rooms (${selectedRoomsCount}).<br><br>Please select exactly ${numberOfRoomsNeeded} room(s) or update the "Number of Rooms Needed" field.`,
        confirmButtonText: 'OK',
        width: '600px'
      });
      return;
    }

    if (!qty || parseInt(qty, 10) <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Stay Duration',
        text: 'Please select a valid check-in and check-out date range.',
      });
      return;
    }

    const state = typeof window.getGroupBookingState === 'function'
      ? window.getGroupBookingState()
      : { discount: 0 };

    const seniorPwdDiscount = $('#groupIncludeSeniorPwdDiscount').is(':checked') ? parseFloat($('#groupSeniorPwdDiscount').val()) || 0 : 0;
    const seniorPwdDiscountPercent = $('#groupIncludeSeniorPwdDiscount').is(':checked') ? parseFloat($('#groupSeniorPwdDiscountPercent').val()) || 20 : 0;
    const seniorPwdRoomCount = $('#groupIncludeSeniorPwdDiscount').is(':checked') ? parseInt($('#groupSeniorPwdRoomCount').val()) || 0 : 0;
    const discount = parseFloat(state.discount) || 0;
    const paidAmount = parseFloat($('#groupPaidAmount').val()) || 0;

    // Get individual billing flag (inverted logic - checked = individual, unchecked = consolidated)
    const individualBilling = $('#groupIndividualBilling').is(':checked');
    const consolidatedBilling = !individualBilling; // Inverted logic
    console.log('🔄 Frontend - Individual Billing Checkbox:', individualBilling ? 'CHECKED (Individual)' : 'UNCHECKED (Master/Consolidated)');

    // Get agency ID if booking route is agency
    const agencyId = bookingRoute === 'agency' ? $('#groupAgencySelect').val() || null : null;
    const agencyPayer = bookingRoute === 'agency'
      ? ($('input[name="groupAgencyPayer"]:checked').val() || 'agency')
      : null;
    
    // Validate agency selection if booking route is agency
    if (bookingRoute === 'agency' && (!agencyId || agencyId.trim() === '')) {
      Swal.fire({
        icon: 'error',
        title: 'Agency Required',
        text: 'Please select an agency for agency bookings.',
      });
      // Highlight the agency select field
      const agencyWrapper = $('#groupAgencySelectWrapper, #editGroupAgencySelectWrapper');
      if (agencyWrapper.length) {
        agencyWrapper.css('border', '2px solid #e53935');
        agencyWrapper.css('border-radius', '4px');
        setTimeout(() => {
          agencyWrapper.css('border', '');
        }, 3000);
      }
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

    // Compute per-room discounts for Senior/PWD when individual billing
    function computeSeniorPerRoomDiscounts(pricesRaw, nights, percent, roomCount) {
      const prices = pricesRaw
        ? pricesRaw.split(',').map(p => parseFloat(p) || 0)
        : [];
      const nNights = parseInt(nights, 10) || 0;
      const discountDecimal = (parseFloat(percent) || 0) / 100;
      const count = parseInt(roomCount, 10) || 0;

      // Base array aligned to room order
      const discounts = prices.map(() => 0);
      if (count <= 0 || discountDecimal <= 0 || nNights <= 0 || prices.length === 0) {
        return discounts;
      }

      // Sort by price desc keeping original index
      const sorted = prices
        .map((price, idx) => ({ price, idx }))
        .sort((a, b) => b.price - a.price);

      for (let i = 0; i < Math.min(count, sorted.length); i++) {
        const { price, idx } = sorted[i];
        const disc = price * nNights * discountDecimal;
        discounts[idx] = disc;
      }
      return discounts;
    }

    const perRoomDiscounts = computeSeniorPerRoomDiscounts(
      selectedRoomPrice,
      qty,
      seniorPwdDiscountPercent,
      seniorPwdRoomCount
    );

    // Check if joining existing group
    const existingGroupId = $('#groupBookingId').val();
    const isJoiningGroup = $('#groupJoinExistingGroup').val() === 'true' && existingGroupId;
    
    const ajaxData = {
      selectedRooms,
      selectedRoomPrice,
      qty,
      daterange,
      groupName,
      groupContact,
      numberOfRooms,
      paymentStatus,
      bookingRoute,
      guestType,
      guestLevel,
      checkInStatus,
      checkOutStatus,
      holdPending,
      remarks,
      agencyId,
      agencyPayer,
      breakfastAdultQty,
      breakfastAdultPrice,
      breakfastAdultId,
      breakfastKidQty,
      breakfastKidPrice,
      breakfastKidId,
      breakfastIndividual: breakfastIndividual ? 'on' : '',
      pickupServiceId,
      pickupPrice,
      dropoffServiceId,
      dropoffPrice,
      flightNumber,
      passengerCount,
      seniorPwdDiscount,
      seniorPwdDiscountPercent,
      seniorPwdRoomCount,
      paidAmount,
      discount,
      individualBilling: individualBilling ? 'on' : '', // Inverted logic
      perRoomDiscounts,
      lateCheckoutFee,
      existingGroupId: isJoiningGroup ? existingGroupId : null // Include existing group ID if joining
    };

    console.log('🔄 Frontend - Sending AJAX Data:', {
      consolidatedBilling: consolidatedBilling,
      consolidatedBillingType: typeof consolidatedBilling,
      consolidatedBillingValue: consolidatedBilling
    });

    $.ajax({
      url: '/booking/add_group_booking',
      type: 'POST',
      data: ajaxData,
      success: function (response) {
        window.__groupBookingSavedFromCalendar = true;
        if (typeof window.resetCalendarGroupSelection === 'function') {
          window.resetCalendarGroupSelection();
        }

        const modalEl = document.getElementById('modal-add-group-booking');
        if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
          const modalInstance = bootstrap.Modal.getInstance(modalEl);
          if (modalInstance) {
            modalInstance.hide();
          } else {
            $('#modal-add-group-booking').modal('hide');
          }
        } else {
          $('#modal-add-group-booking').modal('hide');
        }

        if (typeof window.refreshCalendarAfterBookingSave === 'function') {
          window.refreshCalendarAfterBookingSave();
        }
        
        // Prepare voucher data for auto-download
        const daterange = $('#groupDaterange').val() || '';
        const dateFrom = daterange.includes(' to ') ? daterange.split(' to ')[0] : '';
        const dateTo = daterange.includes(' to ') ? daterange.split(' to ')[1].split('(')[0].trim() : '';
        // Room numbers change too often to print reliably - show a count on the voucher, not the numbers
        const selectedRoomNumbers = ($('#groupSelectedRoomNumbers').val()||'').split(',').filter(Boolean);
        const roomNumbersForVoucher = selectedRoomNumbers.length > 0
          ? `${selectedRoomNumbers.length} Room${selectedRoomNumbers.length === 1 ? '' : 's'}`
          : 'No rooms selected';

        const totalText = $('#groupComputedTotal').text() || '0';
        const numericTotal = totalText.replace(/[^0-9.]/g, '').split(' ')[0] || '0';
        
        const paidText = $('#groupComputedPaidAmount').text() || '0';
        const numericPaid = paidText.replace(/[^0-9.]/g, '').split(' ')[0] || '0';
        
        const balanceText = $('#groupComputedBalance').text() || '0';
        const numericBalance = balanceText.replace(/[^0-9.]/g, '').split(' ')[0] || '0';

        // Calculate room charges
        const nights = parseInt($('#groupNights').val(), 10) || 0;
        const pricesRaw = $('#groupSelectedRoomPrices').val();
        const prices = pricesRaw ? pricesRaw.split(',').map(p => parseFloat(p) || 0) : [];
        const baseSubtotal = prices.reduce((sum, price) => sum + price, 0);
        const roomCharges = baseSubtotal * nights;
        
        // Calculate services total (exclude late checkout fee)
        const adultQty = $('#groupIncludeBreakfast').is(':checked') ? (parseInt($('#groupBreakfastAdultQty').val(), 10) || 0) : 0;
        const adultPrice = parseFloat($('#groupBreakfastAdultPrice').val()) || 0;
        const kidQty = $('#groupIncludeBreakfast').is(':checked') ? (parseInt($('#groupBreakfastKidQty').val(), 10) || 0) : 0;
        const kidPrice = parseFloat($('#groupBreakfastKidPrice').val()) || 0;
        const breakfastIndividual = $('#groupBreakfastIndividual').is(':checked');
        const selectedRooms = $('#groupSelectedRooms').val();
        const numRooms = selectedRooms ? selectedRooms.split(',').length : 1;
        const breakfastTotal = (adultQty * adultPrice) + (kidQty * kidPrice);
        const breakfastTotalWithIndividual = breakfastIndividual ? breakfastTotal * numRooms : breakfastTotal;
        const pickupPrice = $('#groupIncludePickup').is(':checked') ? parseFloat($('#groupPickupPrice').val()) || 0 : 0;
        const dropoffPrice = $('#groupIncludeDropoff').is(':checked') ? parseFloat($('#groupDropoffPrice').val()) || 0 : 0;
        // Exclude late checkout fee from servicesTotal as it's displayed separately
        const servicesTotal = breakfastTotalWithIndividual + pickupPrice + dropoffPrice;

        // Use confirmation number from response as voucher number
        // If no confirmation number in response, fallback to auto-generated
        let vno = response.confirmationNumber;
        if (!vno) {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const dd = String(now.getDate()).padStart(2, '0');
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          vno = `GV${yyyy}${mm}${dd}${hours}${minutes}`;
        }

        const bookingData = {
          voucherNo: vno,
          groupName: $('#groupName').val() || 'Group Booking',
          groupContact: $('#groupContact').val() || '',
          dateFrom: dateFrom,
          dateTo: dateTo,
          roomSummary: roomNumbersForVoucher || 'No rooms selected',
          breakfastAdult: $('#groupBreakfastAdultQty').val() || 0,
          breakfastKid: $('#groupBreakfastKidQty').val() || 0,
          breakfastAdultPrice: adultPrice,
          breakfastKidPrice: kidPrice,
          pickup: pickupPrice,
          dropoff: dropoffPrice,
          remarks: $('#groupRemarks').val() || '',
          total: numericTotal,
          paidAmount: numericPaid,
          balance: numericBalance,
          checkOutStatus: $('#groupCheckOutStatus').val() || 0,
          lateCheckoutFee: parseFloat($('#groupLateCheckoutFee').val()) || 0,
          discount: $('#groupIncludeDiscount').is(':checked') ? (parseFloat($('#groupDiscount').val()) || 0) : 0,
          reservationFee: 0,
          roomCharges: roomCharges.toFixed(2),
          servicesTotal: servicesTotal.toFixed(2)
        };

        // Create form to trigger voucher download
        const form = $('<form>', {
          method: 'POST',
          action: '/booking/generate-group-voucher?download=1',
          target: '_blank'
        });
        for (let key in bookingData) {
          form.append($('<input>', { type: 'hidden', name: key, value: bookingData[key] }));
        }
        $('body').append(form);
        form.submit();
        form.remove();

        const isConsolidated = consolidatedBilling;

        // Show the actual calculated amounts from backend response
        const grandTotal = parseFloat(response.grandTotal) || 0;
        const discount = parseFloat(response.discount) || 0;
        const paidAmount = parseFloat(response.paidAmount) || 0;

        // Calculate the breakdown consistently for both billing types
        // Backend formula: grandTotal = (roomCharges + services) - discount
        // So: subtotal = grandTotal + discount
        const subtotal = grandTotal + discount;

        const details = response && response.grandTotal !== undefined
          ? `Grand Total: ₱${grandTotal.toLocaleString()}\n\n` +
            `Breakdown:\n` +
            `• Discount: -₱${discount.toLocaleString()}\n` +
            `• Paid Amount: ₱${paidAmount.toLocaleString()}\n` +
            `• Balance: ₱${(grandTotal - paidAmount).toLocaleString()}\n\n` +
            `${isConsolidated ? '✅ Master Billing: All charges applied to main booking' : '✅ Individual Billing: Separate charges per room'}\n\n` +
            `✅ Voucher is downloading...`
          : `The group booking has been added successfully.\n\n${isConsolidated ? '✅ Master Billing: All charges applied to main booking' : '✅ Individual Billing: Separate charges per room'}\n\n` +
            `✅ Voucher is downloading...`;

        console.log('🔄 Success Message - Debug Values:', {
          rawResponse: response,
          grandTotal: grandTotal,
          discount: discount,
          paidAmount: paidAmount,
          isConsolidated: isConsolidated,
          calculatedSubtotal: subtotal
        });

        Swal.fire({
          title: 'Group Booking Successful!',
          text: details,
          icon: 'success',
          confirmButtonText: 'OK',
          timer: 2500,
          timerProgressBar: true
        });
      },
      error: function () {
        Swal.fire({
          title: 'Error',
          text: 'An error occurred while saving the group booking. Please try again.',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    });
  });
});


