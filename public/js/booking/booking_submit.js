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
            paymentStatus, bookingRoute, guestType, guestLevel, checkInStatus,
            breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
            breakfastKidQty, breakfastKidPrice, breakfastKidId,
            pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice
          },
          success: function (response) {
            $('#modal-addbooking').modal('hide');
            setTimeout(function() {
              Swal.fire({
                title: 'Group Booking Successful!',
                text: 'The group booking has been added successfully.',
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
            paymentStatus, price: roomPrice, diffindays: qty, guestType, guestLevel, guestID: txtGuestID,
            bookingRoute, checkInStatus, bookingRemarks, agencyID, voucherNo,
            breakfastAdultQty, breakfastAdultPrice, breakfastAdultId,
            breakfastKidQty, breakfastKidPrice, breakfastKidId,
            pickupServiceId, pickupPrice, dropoffServiceId, dropoffPrice
          },
          success: function (response) {
            $('#modal-addbooking').modal('hide');
            setTimeout(function() {
              Swal.fire({
                title: 'Booking Successful!',
                text: 'Your booking has been added successfully.',
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