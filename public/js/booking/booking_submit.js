$(document).ready(function () {
    $('#addbooking').off('submit').on('submit', function (e) {
      e.preventDefault();
      // Check if group booking checkbox is visible and checked
      var $groupCheckbox = $('#groupBookingCheckbox');
      var isGroupBooking = $groupCheckbox.length && $groupCheckbox.is(':visible') && $groupCheckbox.is(':checked');
  
      if (isGroupBooking) {
        // GROUP BOOKING LOGIC
        const selectedRooms = $('#selectedBlock').val();
        const selectedRoomPrice = $('#selectedRoomPrice').val();
        const qty = $('#diffindays').val();
        const daterange = $('#daterange').val();
        const groupName = $('#groupName').val();
        const groupContact = $('#groupContact').val();
        const numberOfRooms = $('#numberOfRooms').val();
        const paidAmount = $('#paidAmount').val();
        const paymentStatus = $('#paymentStatus').val();
        const bookingRoute = $('#bookingRoute').val();
        const guestType = $('#guestType').val();
        const guestLevel = $('#guestLevel').val();
        const checkInStatus = $('#checkInStatus').val();
        // Group-level services fields
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
        
        // Discount and fees for group booking
        const discountAmount = $('#includeDiscount').is(':checked') ? $('#discountAmount').val() : 0;
        const reservationFeeAmount = $('#includeReservationFee').is(':checked') ? $('#reservationFeeAmount').val() : 0;
        const lateCheckoutFee = $('#lateCheckoutFee').val();
  
        if (!selectedRooms || !daterange || !groupName || !groupContact || !numberOfRooms) {
          Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'Please fill all the required fields for group booking!',
          });
          return;
        }
  
        $.ajax({
          url: '/booking/add_group_booking',
          type: 'POST',
          data: {
            selectedRooms, selectedRoomPrice, qty, daterange, groupName, groupContact, numberOfRooms,
            paidAmount, paymentStatus, bookingRoute, guestType, guestLevel, checkInStatus,
            breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
            breakfastKidQty, breakfastKidPrice, breakfastKidId,
            pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice,
            discount: discountAmount, reservationFee: reservationFeeAmount, lateCheckoutFee
          },
          success: function (response) {
            $('#modal-addbooking').modal('hide');
            
            // Payment processing is now handled automatically in the backend
            // No need for separate payment processing calls
            
            // Auto-download group voucher if booking was successful
            if (response.success && response.groupBookingId) {
              // Create a form to trigger group voucher download
              const form = $('<form>', {
                method: 'POST',
                action: '/booking/generate-group-voucher',
                target: '_blank'
              });
              
              // Add group booking data to form
              form.append($('<input>', {
                type: 'hidden',
                name: 'groupBookingId',
                value: response.groupBookingId
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'voucherNo',
                value: response.confirmationNumber || $('#voucherNo').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'groupName',
                value: groupName
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'groupContact',
                value: groupContact
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
                name: 'roomSummary',
                value: selectedRooms ? selectedRooms.split(',').map(r => r.trim()).join(', ') : ''
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'total',
                value: $('#computedTotal').text()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'remarks',
                value: $('#bookingRemarks').val()
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastAdult',
                value: breakfastAdultQty
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'breakfastKid',
                value: breakfastKidQty
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
                name: 'reservationFee',
                value: $('#includeReservationFee').is(':checked') ? reservationFeeAmount : 0
              }));
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'discount',
                value: $('#includeDiscount').is(':checked') ? discountAmount : 0
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
              
              // Submit form to trigger download
              $('body').append(form);
              form.submit();
              form.remove();
            }
            
            setTimeout(function() {
              Swal.fire({
                title: 'Group Booking Successful!',
                text: 'The group booking has been added successfully. Voucher is downloading...',
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
      } else {
        // SINGLE BOOKING LOGIC
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
            bookingRoute, checkInStatus, bookingRemarks, agencyID, voucherNo,
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
                action: '/booking/generate-voucher',
                target: '_blank'
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
              
              form.append($('<input>', {
                type: 'hidden',
                name: 'total',
                value: $('#computedTotal').text()
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
  });

