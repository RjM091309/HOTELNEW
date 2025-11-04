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
      
      // Discount and fees
      const discountAmount = $('#includeDiscount').is(':checked') ? $('#discountAmount').val() : 0;
      const reservationFeeAmount = $('#includeReservationFee').is(':checked') ? $('#reservationFeeAmount').val() : 0;
      const lateCheckoutFee = $('#lateCheckoutFee').val();
      console.log('DEBUG Single Booking: lateCheckoutFee =', lateCheckoutFee, 'checkOutStatus =', $('#checkOutStatus').val());

      if (!roomId || !daterange || !fullname || !guestsCount || !paymentStatus || !roomPrice || !guestType || !guestLevel) {
        Swal.fire({
          icon: 'error',
          title: 'Oops...',
          text: 'Please fill all the required fields for booking!',
        });
        return;
      }
      
      $.ajax({
        url: '/booking/add_booking',
        type: 'POST',
        data: {
          room_id: roomId, fullname, number, address, daterange, maxOccupants: guestsCount,
          paidAmount, paymentStatus, price: roomPrice, diffindays: qty, guestType, guestLevel, guestID: txtGuestID,
          bookingRoute, checkInStatus, checkOutStatus, bookingRemarks, agencyID, voucherNo,
          breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
          breakfastKidQty, breakfastKidPrice, breakfastKidId,
          pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
          discount: discountAmount, reservationFee: reservationFeeAmount, lateCheckoutFee
        },
        success: function (response) {
            $('#modal-addbooking').modal('hide');
            
            // Payment processing is now handled automatically in the backend
            // No need for separate payment processing calls
            
            // Auto-download voucher if booking was successful
            if (response.success && response.bookingId) {
              // Create a form to trigger voucher download
              const form = $('<form>', {
                method: 'POST',
                action: '/booking/generate-voucher?download=1',
                target: '_self'
              });
              
              // Add booking data to form
              form.append($('<input>', {
                type: 'hidden',
                name: 'bookingId',
                value: response.bookingId
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'voucherNo',
                value: response.confirmationNumber || voucherNo
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'fullname',
                value: fullname
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'contactNumber',
                value: number
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'dateFrom',
                value: daterange.split(' to ')[0]
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'dateTo',
                value: daterange.split(' to ')[1].split('(')[0].trim()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'bedCount',
                value: $('#bedCount').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'roomNumber',
                value: $('#addroom option:selected').text()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'roomView',
                value: $('#room_type').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'roomType',
                value: $('#room_type_hidden').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'roomRate',
                value: $('#price').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastAdult',
                value: breakfastAdultQty
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastAdultPrice',
                value: breakfastAdultPrice
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastKid',
                value: breakfastKidQty
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastKidPrice',
                value: breakfastKidPrice
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'pickup',
                value: $('#includePickup').is(':checked') ? pickupPrice : 0
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'dropoff',
                value: $('#includeDropoff').is(':checked') ? dropoffPrice : 0
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'remarks',
                value: bookingRemarks
              }));
              
              // Add balance and paidAmount fields - remove commas first
              const computedTotalText = $('#computedTotal').text().replace(/,/g, '');
              const computedBalanceText = $('#computedBalance').text().trim().replace(/,/g, '');
              const computedPaidAmountText = $('#computedPaidAmount').text().trim().replace(/,/g, '');
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'total',
                value: computedTotalText
              }));
              
              // Calculate paidAmount value (remove commas)
              let paidAmountValue = (!computedPaidAmountText || computedPaidAmountText === '0.00') 
                ? (parseFloat((paidAmount || '0').toString().replace(/,/g, '')) || 0).toFixed(2)
                : parseFloat(computedPaidAmountText).toFixed(2);
              
              // Always recalculate balance from total and paidAmount to ensure accuracy
              const totalNum = parseFloat(computedTotalText.replace(/,/g, '')) || 0;
              const paidNum = parseFloat(paidAmountValue.replace(/,/g, '')) || 0;
              const balanceValue = Math.max(0, totalNum - paidNum).toFixed(2);
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'balance',
                value: balanceValue
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'paidAmount',
                value: paidAmountValue
              }));
              
              // Calculate room charges and services total for voucher
              const priceValue = $('#price').val();
              const roomRateStr = priceValue ? priceValue.toString().replace(/[,\s₱₹$]/g, '') : '0';
              const roomRate = parseFloat(roomRateStr) || 0;
              const nights = parseInt($('#diffindays').val()) || 1;
              const roomCharges = Math.round((roomRate * nights) * 100) / 100;
              
              const breakfastAdultQtyNum = parseInt(breakfastAdultQty) || 0;
              const breakfastAdultPriceNum = parseFloat(breakfastAdultPrice) || 0;
              const breakfastKidQtyNum = parseInt(breakfastKidQty) || 0;
              const breakfastKidPriceNum = parseFloat(breakfastKidPrice) || 0;
              const breakfastTotal = (breakfastAdultQtyNum * breakfastAdultPriceNum) + (breakfastKidQtyNum * breakfastKidPriceNum);
              const pickupNum = $('#includePickup').is(':checked') ? (parseFloat(pickupPrice) || 0) : 0;
              const dropoffNum = $('#includeDropoff').is(':checked') ? (parseFloat(dropoffPrice) || 0) : 0;
              // Exclude late checkout fee from servicesTotal as it's displayed separately
              const servicesTotal = parseFloat((breakfastTotal + pickupNum + dropoffNum).toFixed(2));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'roomCharges',
                value: roomCharges.toFixed(2)
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'servicesTotal',
                value: servicesTotal.toFixed(2)
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'checkInStatus',
                value: checkInStatus
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'checkOutStatus',
                value: $('#checkOutStatus').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'lateCheckoutFee',
                value: lateCheckoutFee
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'reservationFee',
                value: $('#includeReservationFee').is(':checked') ? reservationFeeAmount : 0
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'discount',
                value: $('#includeDiscount').is(':checked') ? discountAmount : 0
              }));
              
              // Submit form to trigger download
              $('body').append(form);
              form.submit();
              form.remove();
            }
            
            setTimeout(function() {
              Swal.fire({
                title: 'Booking Successful!',
                text: 'Your booking has been added successfully. Voucher is downloading...',
                icon: 'success',
                confirmButtonText: 'OK'
              }).then(() => window.location.reload());
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

