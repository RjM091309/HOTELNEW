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
    const remarks = $('#groupRemarks').val();

    const breakfastAdultQty = $('#groupBreakfastAdultQty').val();
    const breakfastAdultPrice = $('#groupBreakfastAdultPrice').val();
    const breakfastAdultId = $('#groupBreakfastAdultId').val();
    const breakfastKidQty = $('#groupBreakfastKidQty').val();
    const breakfastKidPrice = $('#groupBreakfastKidPrice').val();
    const breakfastKidId = $('#groupBreakfastKidId').val();
    const pickupServiceId = $('#groupPickupServiceId').val();
    const pickupPrice = $('#groupPickupPrice').val();
    const dropoffServiceId = $('#groupDropoffServiceId').val();
    const dropoffPrice = $('#groupDropoffPrice').val();

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
      : { reservationFee: 0, discount: 0 };

    const reservationFee = parseFloat(state.reservationFee) || 0;
    const discount = parseFloat(state.discount) || 0;
    
    // Get agency ID if booking route is agency
    const agencyId = bookingRoute === 'agency' ? $('#groupAgencySelect').val() || null : null;

    const perRoomFees = [];
    const perRoomDiscounts = [];
    const selectedRoomIds = selectedRooms.split(',');

    // Set all per-room values to 0 since per-room adjustments are removed
    selectedRoomIds.forEach(() => {
      perRoomFees.push(0);
      perRoomDiscounts.push(0);
    });

    $.ajax({
      url: '/booking/add_group_booking',
      type: 'POST',
      data: {
        selectedRooms,
        selectedRoomPrice,
        qty,
        daterange,
        groupName,
        groupContact,
        numberOfRooms,
        paymentStatus,
        bookingRoute,
        agencyId,
        guestType,
        guestLevel,
        checkInStatus,
        checkOutStatus,
        remarks,
        breakfastAdultQty,
        breakfastAdultPrice,
        breakfastAdultId,
        breakfastKidQty,
        breakfastKidPrice,
        breakfastKidId,
        pickupServiceId,
        pickupPrice,
        dropoffServiceId,
        dropoffPrice,
        reservationFee,
        discount,
        perRoomReservationFees: perRoomFees,
        perRoomDiscounts
      },
      success: function (response) {
        $('#modal-add-group-booking').modal('hide');
        setTimeout(function () {
          const details = response && response.grandTotal !== undefined
            ? `Grand Total: ₱${Number(response.grandTotal || 0).toLocaleString()}\nReservation Fee: ₱${Number(response.reservationFee || 0).toLocaleString()}\nDiscount: ₱${Number(response.discount || 0).toLocaleString()}`
            : 'The group booking has been added successfully.';
          Swal.fire({
            title: 'Group Booking Successful!',
            text: details,
            icon: 'success',
            confirmButtonText: 'OK'
          }).then(() => window.location.reload());
        }, 300);
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


