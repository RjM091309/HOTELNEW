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

    // Get consolidated billing flag
    const consolidatedBilling = $('#groupConsolidatedBilling').is(':checked');
    console.log('🔄 Frontend - Consolidated Billing Checkbox:', consolidatedBilling ? 'CHECKED' : 'UNCHECKED');

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
      remarks,
      agencyId,
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
      consolidatedBilling: consolidatedBilling ? 'on' : '',
      perRoomReservationFees: perRoomFees,
      perRoomDiscounts
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
        $('#modal-add-group-booking').modal('hide');
        setTimeout(function () {
          const isConsolidated = consolidatedBilling;

          // Show the actual calculated amounts from backend response
          const grandTotal = parseFloat(response.grandTotal) || 0;
          const reservationFee = parseFloat(response.reservationFee) || 0;
          const discount = parseFloat(response.discount) || 0;

          const details = response && response.grandTotal !== undefined
            ? `Grand Total: ₱${grandTotal.toLocaleString()}\nReservation Fee: ₱${reservationFee.toLocaleString()}\nDiscount: ₱${discount.toLocaleString()}${isConsolidated ? '\n\n✅ Consolidated Billing: All charges applied to main booking' : ''}`
            : `The group booking has been added successfully.${isConsolidated ? '\n\n✅ Consolidated Billing: All charges applied to main booking' : ''}`;

          console.log('🔄 Success Message - Details:', {
            grandTotal: grandTotal,
            reservationFee: reservationFee,
            discount: discount,
            isConsolidated: isConsolidated
          });

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


