// Add Booking Modal JavaScript
// This file contains all the functionality for the add booking modal

let flatpickrInstance = null;
let unavailableDates = [];

// Returns booking type used for seasonal price lookup.
// Agency booking with guest payer uses walk-in (regular) rate.
function getPriceBookingType() {
    const bookingRoute = $('#bookingRoute').val();
    if (bookingRoute === 'agency') {
        const agencyPayer = $('input[name="agencyPayer"]:checked').val();
        return agencyPayer === 'guest' ? 'walk-in' : 'agency';
    }
    return bookingRoute;
}
window.getPriceBookingType = getPriceBookingType;

function toggleAgencyFields(isAgency) {
    $('#agencySelectWrapper').toggle(isAgency);
    if (isAgency) {
        fetch('/booking/get-agency')
            .then(res => res.json())
            .then(data => {
                const agencySelect = $('#agencySelect');
                agencySelect.empty().append(`<option value="" disabled selected>Select Agency</option>`);
                data.forEach(a => {
                    agencySelect.append(`<option value="${a.IDNo}">${a.NAME}</option>`);
                });
            });
        $('input[name="agencyPayer"][value="agency"]').prop('checked', true);
        updateAgencyPayerHint();
    } else {
        $('#agencySelect').val('');
        $('input[name="agencyPayer"][value="agency"]').prop('checked', true);
        updateAgencyPayerHint();
    }
}

function refreshSeasonalPrice() {
    if (typeof window._updateSeasonalPrice === 'function') {
        window._updateSeasonalPrice();
    }
}

function updateAgencyPayerHint() {
    const payer = $('input[name="agencyPayer"]:checked').val();
    const hint = payer === 'guest' ? 'Regular Rate' : 'Agency Rate';
    $('#agencyPayerRateHint').text(hint);
}

// Function to generate voucher number
function generateVoucherNo() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${yyyy}${mm}${dd}${rand}`;
}

// Function to toggle breakfast total display
function toggleBreakfastTotalDisplay() {
    const adultQty = parseInt($('#breakfastAdultQty').val()) || 0;
    const adultUnit = parseFloat($('#breakfastAdultPrice').val()) || 0;
    const adultTotal = adultQty * adultUnit;

    const kidQty = parseInt($('#breakfastKidQty').val()) || 0;
    const kidUnit = parseFloat($('#breakfastKidPrice').val()) || 0;
    const kidTotal = kidQty * kidUnit;

    // Always keep price inputs visible for manual editing
    // Only show total when BOTH qty AND price are entered
    if (adultQty > 0 && adultUnit > 0) {
        $('#breakfastAdultTotal')
            .css('display', 'block')
            .val(`${adultTotal.toFixed(2)}`);
    } else {
        $('#breakfastAdultTotal').css('display', 'none').val('');
    }

    if (kidQty > 0 && kidUnit > 0) {
        $('#breakfastKidTotal')
            .css('display', 'block')
            .val(`${kidTotal.toFixed(2)}`);
    } else {
        $('#breakfastKidTotal').css('display', 'none').val('');
    }
}

// Function to initialize or re-initialize flatpickr
function initializeFlatpickr() {
    if (flatpickrInstance) {
        flatpickrInstance.destroy();
    }

    flatpickrInstance = flatpickr("#daterange", {
        mode: "range",
        dateFormat: "M d, Y",
        minDate: "today",
        disable: unavailableDates.map(range => ({
            from: range.start,
            to: range.end
        })),
        onClose: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                var startDate = selectedDates[0];
                var endDate = selectedDates[1];
                var diffInTime = endDate.getTime() - startDate.getTime();
                var diffInDays = Math.round(diffInTime / (1000 * 3600 * 24));

                // Update the hidden input for diffindays
                $('#diffindays').val(diffInDays);

                // Update the visible input to show night count
                var formattedDateRange = dateStr + ' (' + diffInDays + ' night/s)';
                instance.input.value = formattedDateRange;

                // Also update base price calculation if needed
                computeTotal();
            }
        }
    });
}

// Function to display consecutive rooms
function displayConsecutiveRooms(blocks) {
    // Always show the containers and reset the list
    $('#consecutiveResultsContainer').show();
    $('#availableRoomsBlock').show();
    $('#consecutiveRoomsList').show().empty();

    if (blocks.length === 0) {
        $('#consecutiveRoomsList').html('<p class="text-danger">No consecutive rooms available for these dates.</p>');
    } else {
        let html = '<div class="room-list-container">';
        // Store the full block data for later use
        window._groupBlocks = blocks;
        blocks.forEach(function(block, idx) {
            let roomNumbers = block.map(r => r.ROOM_NUMBER).join(', ');
            let roomIds = block.map(r => r.IDNo).join(',');
            html += `
                <div class="room-option">
                    <label>
                        <input type="radio" name="selectedBlock" value="${roomIds}" data-block-idx="${idx}" class="room-selection">
                          <span class="room-numbers">${roomNumbers}</span>
                    </label>
                </div>
            `;
        });
        html += '</div>';
        $('#consecutiveRoomsList').html(html).show();

        // Event listener para sa pag-update ng selected values
        $('.room-selection').change(function () {
            let selectedBlockIndex = $(this).data('block-idx');
            let block = window._groupBlocks[selectedBlockIndex];
            if (block) {
                // Compute price for each room using seasonal logic
                const daterange = $('#daterange').val() || '';
                const [startDate] = daterange.split(' to ');
                const bookingType = getPriceBookingType();
                let computedPrices = [];
                block.forEach(room => {
                    // --- Seasonal price logic (same as single booking) ---
                    function getSeasonIdForDate(checkInDate, seasonalPrices) {
                        const checkIn = new Date(checkInDate);
                        const mmdd = (checkIn.getMonth() + 1).toString().padStart(2, '0') + checkIn.getDate().toString().padStart(2, '0');
                        for (const p of (room.SEASONAL_PRICES || [])) {
                            const start = new Date(p.startDate);
                            const end = new Date(p.endDate);
                            const startMMDD = (start.getMonth() + 1).toString().padStart(2, '0') + start.getDate().toString().padStart(2, '0');
                            const endMMDD = (end.getMonth() + 1).toString().padStart(2, '0') + end.getDate().toString().padStart(2, '0');
                            if ((startMMDD <= endMMDD && mmdd >= startMMDD && mmdd <= endMMDD) ||
                                (startMMDD > endMMDD && (mmdd >= startMMDD || mmdd <= endMMDD))) {
                                return p.seasonId;
                            }
                        }
                        return null;
                    }
                    const bedCount = parseInt(room.ROOM_BED);
                    const seasonId = getSeasonIdForDate(startDate, room.SEASONAL_PRICES);
                    const match = (room.SEASONAL_PRICES || []).find(p =>
                        parseInt(p.bedCount) === bedCount &&
                        p.bookingType === bookingType &&
                        parseInt(p.seasonId) === parseInt(seasonId)
                    );
                    let pricePerNight = match ? parseFloat(match.price) : parseFloat(room.FINAL_PRICE);
                    computedPrices.push(pricePerNight);
                });
                $('#selectedBlock').val(block.map(r => r.IDNo).join(','));
                $('#selectedRoomPrice').val(computedPrices.join(','));
                // --- FIX: Remove previous breakdown before adding new one ---
                $('.group-room-breakdown').remove();
                // Show breakdown
                let breakdownHtml = '<div class="group-room-breakdown"><b>Selected Room Price:</b><ul>';
                block.forEach((room, i) => {
                    breakdownHtml += `<li>Room ${room.ROOM_NUMBER}: ₱${computedPrices[i]?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}</li>`;
                });
                breakdownHtml += '</ul></div>';
                // Place it after the container for a consistent position
                $('#consecutiveResultsContainer').append(breakdownHtml);
                // Update total
                if (typeof computeGroupTotal === 'function') computeGroupTotal();
            }
        });
    }
}

// Function to calculate total price
function calculateTotalPrice() {
    // If manual price toggle is enabled, do not recalculate
    if ($('#manualPriceToggle').is(':checked')) return;

    let basePrice = parseFloat($('#baseprice').val()) || 0;
    let diffInDays = parseFloat($('#diffindays').val()) || 0;

    $('#price').val(basePrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }));
}

// Function to calculate late check-out fee
function calculateLateCheckoutFee() {
    const checkOutStatus = $('#checkOutStatus').val();
    
    // Only calculate if we have valid data
    if (!checkOutStatus) {
        $('#lateCheckoutFee').val(0);
        $('#lateCheckoutFeeDisplay').hide();
        return;
    }
    
    let lateCheckoutFee = 0;
    
    if (checkOutStatus == 1) { // Late Check Out
        lateCheckoutFee = 2000; // ₱2,000 fee for Late Check Out
        $('#lateCheckoutFeeDisplay').show();
    } else {
        // Regular Check Out - no fee
        $('#lateCheckoutFeeDisplay').hide();
    }
    
    $('#lateCheckoutFee').val(lateCheckoutFee);
    $('#lateCheckoutFeeInput').val(lateCheckoutFee);
    
    // Recalculate total to include late check-out fee
    computeTotal();
}

// Function to format paid amount to 2 decimal places
function formatPaidAmount(input) {
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2);
    // Sync with hidden field
    $('#paidAmountHidden').val(value.toFixed(2));
}

// Function to compute total booking cost dynamically
function computeTotal() {
    // Only update if NOT group booking
    if ($('#groupBookingCheckbox').is(':checked')) return;
    const roomRate = $('#manualPriceToggle').prop('checked')
        ? parseFloat($('#price').val()) || 0
        : parseFloat($('#baseprice').val()) || 0;

    const nights = parseInt($('#diffindays').val()) || 1;

    const adultQty = parseInt($('#breakfastAdultQty').val()) || 0;
    const adultPrice = parseFloat($('#breakfastAdultPrice').val()) || 0;
    const kidQty = parseInt($('#breakfastKidQty').val()) || 0;
    const kidPrice = parseFloat($('#breakfastKidPrice').val()) || 0;

    const pickupChecked = $('#includePickup').prop('checked');
    const dropoffChecked = $('#includeDropoff').prop('checked');

    const pickupPrice = pickupChecked ? parseFloat($('#pickupPrice').val()) || 0 : 0;
    const dropoffPrice = dropoffChecked ? parseFloat($('#dropoffPrice').val()) || 0 : 0;

    // Reservation Fee and Discount
    const reservationFeeChecked = $('#includeReservationFee').prop('checked');
    const reservationFeeAmount = reservationFeeChecked ? parseFloat($('#reservationFeeAmount').val()) || 0 : 0;
    
    // Senior/PWD Discount (percentage-based)
    const seniorPwdDiscountChecked = $('#includeSeniorPwdDiscount').prop('checked');
    let seniorPwdDiscountAmount = 0;
    
    // Get late check-out fee
    const lateCheckoutFee = parseFloat($('#lateCheckoutFee').val()) || 0;

    // Calculate room charges only (for Senior/PWD discount)
    const roomCharges = roomRate * nights;
    
    // Calculate subtotal (charges) - before discounts
    const subtotal = roomCharges + (adultQty * adultPrice) + (kidQty * kidPrice) + pickupPrice + dropoffPrice + lateCheckoutFee;
    
    // Calculate Senior/PWD discount (percentage of ROOM CHARGES ONLY, not services)
    if (seniorPwdDiscountChecked && roomCharges > 0) {
        let discountPercent = parseFloat($('#seniorPwdDiscountPercent').val()) || 20; // Default to 20%
        // Enforce maximum of 100%
        if (discountPercent > 100) {
            discountPercent = 100;
            $('#seniorPwdDiscountPercent').val(100);
        }
        if (discountPercent < 0) {
            discountPercent = 0;
            $('#seniorPwdDiscountPercent').val(0);
        }
        const discountDecimal = discountPercent / 100; // Convert percentage to decimal
        seniorPwdDiscountAmount = roomCharges * discountDecimal; // Apply only to room charges
        $('#seniorPwdDiscount').val(seniorPwdDiscountAmount.toFixed(2));
        $('#seniorPwdDiscountAmount').val('₱' + seniorPwdDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        $('#seniorPwdDiscountDisplay').show();
        
        // If Senior/PWD discount is 100%, automatically disable Additional Discount
        if (discountPercent >= 100) {
            $('#includeDiscount').prop('checked', false);
            $('#discountWrapper').hide();
            $('#discountAmount').val('0');
        }
    } else {
        $('#seniorPwdDiscount').val(0);
        $('#seniorPwdDiscountAmount').val('');
        $('#seniorPwdDiscountDisplay').hide();
    }
    
    const discountChecked = $('#includeDiscount').prop('checked');
    const discountAmount = discountChecked ? parseFloat($('#discountAmount').val()) || 0 : 0;
    
    // Calculate final balance (subtotal - senior/pwd discount - reservation fee - additional discount)
    let finalBalance = subtotal - seniorPwdDiscountAmount - reservationFeeAmount - discountAmount;
    
  // Get paid amount and validate it doesn't exceed total
  let paidAmount = parseFloat($('#paidAmount').val()) || 0;
  
  // Check if this is a direct reservation / unassigned-room scenario
  // (flag coming from navbar + case where subtotal is 0 / no room rate yet)
  const isDirectReservation = $('#directReservationFlag').val() === 'true' || subtotal === 0;
  
  // Ensure finalBalance is not negative
  if (finalBalance < 0) {
      finalBalance = 0;
  }
  
  // Prevent paid amount from exceeding total and ensure it's not negative
  if (!isDirectReservation) {
      if (paidAmount > finalBalance) {
          paidAmount = finalBalance;
          $('#paidAmount').val(paidAmount.toFixed(2));
          $('#paidAmountHidden').val(paidAmount.toFixed(2));
      }
      // Ensure paid amount is not negative
      if (paidAmount < 0) {
          paidAmount = 0;
          $('#paidAmount').val('0.00');
          $('#paidAmountHidden').val('0.00');
      }
  }
  
  // Update paid amount display
  $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
  
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
    
    // If this is a direct reservation with no charges yet, always treat as UNPAID
    // even if may paidAmount (considered as future credit when room is assigned).
    if (isDirectReservation && subtotal === 0) {
        paymentStatus = 'unpaid';
    }

    // Update payment status display
    $('#paymentStatus').val(paymentStatus);
    
    // Update payment status styling with CSS classes
    $('#paymentStatus').removeClass('status-paid status-partial status-unpaid');
    if (paymentStatus === 'paid') {
        $('#paymentStatus').addClass('status-paid');
    } else if (paymentStatus === 'partial') {
        $('#paymentStatus').addClass('status-partial');
    } else {
        $('#paymentStatus').addClass('status-unpaid');
    }
    
    // For direct reservations with no room/charges, show reservation fee as credit
    if (isDirectReservation && subtotal === 0) {
      // If no charges but has reservation fee, show it as credit
      if (reservationFeeAmount > 0) {
        $('#computedTotal').html('<b>0.00</b>');
        $('#creditAmount').html(reservationFeeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }));
        $('#creditDisplay').show();
        // Balance is same as total when total is 0
        $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        // Update paid amount display
        $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        return;
      }
    }
    
    // Show final balance and handle credit display
    if (finalBalance < 0) {
      // Show total as 0.00 and credit below
      $('#computedTotal').html('<b>0.00</b>');
      $('#creditAmount').html(Math.abs(finalBalance).toLocaleString(undefined, { minimumFractionDigits: 2 }));
      $('#creditDisplay').show();
      // Balance is same as total when total is negative
      $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      // Update paid amount display
      $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    } else {
      // Show normal total and hide credit
      $('#computedTotal').html('<b>' + finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      $('#creditDisplay').hide();
      // Show balance (total - paid amount)
      $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      // Update paid amount display
      $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    }
}

// Function to compute group total
function computeGroupTotal() {
    if (!$('#groupBookingCheckbox').is(':checked')) return;
    const pricesStr = $('#selectedRoomPrice').val();
    if (!pricesStr || !pricesStr.match(/[0-9]/)) {
        // If no room is selected, show 0.00
        $('#computedTotal').html('<b>0.00</b>');
        return;
    }
    const prices = pricesStr.split(',').map(p => {
        const n = parseFloat(p);
        return isNaN(n) ? 0 : n;
    });
    const nights = parseInt($('#diffindays').val()) || 1;
    const roomTotal = prices.reduce((a, b) => a + b, 0) * nights;
    // Add services
    const adultQty = parseInt($('#breakfastAdultQty').val()) || 0;
    const adultPrice = parseFloat($('#breakfastAdultPrice').val()) || 0;
    const kidQty = parseInt($('#breakfastKidQty').val()) || 0;
    const kidPrice = parseFloat($('#breakfastKidPrice').val()) || 0;
    const pickupPrice = $('#includePickup').is(':checked') ? (parseFloat($('#pickupPrice').val()) || 0) : 0;
    const dropoffPrice = $('#includeDropoff').is(':checked') ? (parseFloat($('#dropoffPrice').val()) || 0) : 0;
    
    // Reservation Fee and Discount for group booking
    const reservationFeeChecked = $('#includeReservationFee').prop('checked');
    const reservationFeeAmount = reservationFeeChecked ? parseFloat($('#reservationFeeAmount').val()) || 0 : 0;
    
    const discountChecked = $('#includeDiscount').prop('checked');
    const discountAmount = discountChecked ? parseFloat($('#discountAmount').val()) || 0 : 0;
    
    // Get late check-out fee
    const lateCheckoutFee = parseFloat($('#lateCheckoutFee').val()) || 0;
    
    // Calculate subtotal (charges)
    const subtotal = roomTotal + (adultQty * adultPrice) + (kidQty * kidPrice) + pickupPrice + dropoffPrice + lateCheckoutFee;
    
    // Calculate final balance
    let finalBalance = subtotal - reservationFeeAmount - discountAmount;
    
    // Get paid amount
    const paidAmount = parseFloat($('#paidAmount').val()) || 0;
    
    // Calculate balance (total - paid amount)
    const balance = finalBalance - paidAmount;
    
    // Determine payment status for group booking
    let paymentStatus;
    if (paidAmount <= 0) {
        paymentStatus = 'unpaid';
    } else if (paidAmount >= finalBalance) {
        paymentStatus = 'paid';
    } else {
        paymentStatus = 'partial';
    }
    
    // Update payment status display
    $('#paymentStatus').val(paymentStatus);
    
    // Update payment status styling with CSS classes
    $('#paymentStatus').removeClass('status-paid status-partial status-unpaid');
    if (paymentStatus === 'paid') {
        $('#paymentStatus').addClass('status-paid');
    } else if (paymentStatus === 'partial') {
        $('#paymentStatus').addClass('status-partial');
    } else {
        $('#paymentStatus').addClass('status-unpaid');
    }
    
    // Check if this is a direct reservation (no room selected or no room rate)
    const isDirectReservation = $('#directReservationFlag').val() === 'true' || subtotal === 0;
    
    if (isDirectReservation && subtotal === 0) {
      // If no charges but has reservation fee, show it as credit
      if (reservationFeeAmount > 0) {
        $('#computedTotal').html('<b>0.00</b>');
        $('#creditAmount').html(reservationFeeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }));
        $('#creditDisplay').show();
        // Balance is same as total when total is 0
        $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        // Update paid amount display
        $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        return;
      }
    }
    
    // Show final balance and handle credit display
    if (finalBalance < 0) {
      // Show total as 0.00 and credit below
      $('#computedTotal').html('<b>0.00</b>');
      $('#creditAmount').html(Math.abs(finalBalance).toLocaleString(undefined, { minimumFractionDigits: 2 }));
      $('#creditDisplay').show();
      // Balance is same as total when total is negative
      $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      // Update paid amount display
      $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    } else {
      // Show normal total and hide credit
      $('#computedTotal').html('<b>' + finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      $('#creditDisplay').hide();
      // Show balance (total - paid amount)
      $('#computedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
      // Update paid amount display
      $('#computedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    }
}

// Function to toggle voucher buttons - removed group voucher functionality
// function toggleVoucherButtons() {
//     if ($('#groupBookingCheckbox').is(':checked')) {
//         $('#btnGenerateVoucherPreview').hide();
//         $('#btnGenerateGroupVoucherPreview').show();
//     } else {
//         $('#btnGenerateVoucherPreview').show();
//         $('#btnGenerateGroupVoucherPreview').hide();
//     }
// }

// Function to search customer
function searchCustomer(query) {
    if (query.length === 0) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }

    fetch(`/booking/search-customer?query=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            const resultsDiv = document.getElementById('searchResults');
            if (data.length > 0) {
                resultsDiv.innerHTML = data.map(customer => 
                 `<div style="color: #000; padding: 10px; cursor: pointer;" onclick="selectCustomer('${customer.NAME}', '${customer.LEVEL}', '${customer.CUSTOMER_ID}', '${customer.CONTACT_NO}', '${customer.TYPE}')">
                        ${customer.NAME} (${customer.LEVEL})
                    </div>`).join('');
                resultsDiv.style.display = 'block';
            } else {
                resultsDiv.style.display = 'none'; // Hide the results div if no data
            }
        })
        .catch(error => console.error('Error fetching customers:', error));
}

// Function to hide search results
function hideSearchResults() {
    setTimeout(() => {
        document.getElementById('searchResults').style.display = 'none';
    }, 200); // Delay to allow for clicks inside the search results
}

// Function to select customer
function selectCustomer(name, level, customerId, contactNo, guestType) {
    document.getElementById('txtFullNameAdd').value = name;
    document.getElementById('searchResults').style.display = 'none';

    // Set the Guest Level dropdown value based on the level of the selected customer
    const guestLevelDropdown = document.getElementById('guestLevel');
    for (let i = 0; i < guestLevelDropdown.options.length; i++) {
        if (guestLevelDropdown.options[i].text === level) {
            guestLevelDropdown.selectedIndex = i; // Set the selected option
            break;
        }
    }

    // Update the Guest Type dropdown value based on the type of the selected customer
    const guestTypeDropdown = document.getElementById('guestType');
    for (let i = 0; i < guestTypeDropdown.options.length; i++) {
        if (guestTypeDropdown.options[i].text === guestType) {
            guestTypeDropdown.selectedIndex = i; // Set the selected option
            break;
        }
    }

    // Set the Contact Number field
    document.getElementById('txtNumber').value = contactNo;

    // Store the Customer ID in the hidden input field
    document.getElementById('guestID').value = customerId;
}

// Function to get pick and drop prices using shared utility
function getPickAndDropPrices() {
    getPickDropPrices()
        .then(data => {
            if (!Array.isArray(data)) return console.error("Invalid transport data:", data);

            const pickup = data.find(s => s.SERVICE_NAME.toLowerCase().includes('pick'));
            const dropoff = data.find(s => s.SERVICE_NAME.toLowerCase().includes('drop'));

            $('#includePickup').on('change', function () {
                if (this.checked && pickup) {
                    $('#pickupPrice').val(pickup.SERVICE_COST).show();
                    $('#pickupServiceId').val(pickup.IDNo); // ✅ Store SERVICE_ID
                } else {
                    $('#pickupPrice').val('').hide();
                    $('#pickupServiceId').val('');
                }
                computeTotal();
            });

            $('#includeDropoff').on('change', function () {
                if (this.checked && dropoff) {
                    $('#dropoffPrice').val(dropoff.SERVICE_COST).show();
                    $('#dropoffServiceId').val(dropoff.IDNo); // ✅ Store SERVICE_ID
                } else {
                    $('#dropoffPrice').val('').hide();
                    $('#dropoffServiceId').val('');
                }
                computeTotal();
            });
        })
        .catch(err => console.error('Error fetching transport prices:', err));
}

// Function to clear fields
function clearFields() {
    // Clear all the fields you want to reset
    $('#txtNumber').val(''); // Contact Number
    $('#txtFullNameAdd').val(''); // Name field
}

// Document ready function
$(document).ready(function () {
    // Set voucher number
    $('#voucherNo').val(generateVoucherNo());

    // Initialize flatpickr
    initializeFlatpickr();

    // Event listeners for breakfast quantity and price changes
    $(document).on('input', '#breakfastAdultQty, #breakfastKidQty, #breakfastAdultPrice, #breakfastKidPrice', toggleBreakfastTotalDisplay);

    // Event listeners for service checkboxes
    $('#includePickup').on('change', function () {
        $('#pickupWrapper').toggle(this.checked);
    });

    $('#includeDropoff').on('change', function () {
        $('#dropoffWrapper').toggle(this.checked);
    });

    // Flight number / passenger count - required when either Pick-up or Drop-off is checked
    $('#includePickup, #includeDropoff').on('change', function () {
        const pickupChecked = $('#includePickup').is(':checked');
        const dropoffChecked = $('#includeDropoff').is(':checked');
        const needsFlightInfo = pickupChecked || dropoffChecked;
        $('#pickupDropoffFlightInfo').toggle(needsFlightInfo);
        $('#flightArrivalWrapper').toggle(pickupChecked);
        $('#flightDepartureWrapper').toggle(dropoffChecked);
        if (!needsFlightInfo) {
            $('#flightNumber').val('');
            $('#passengerCount').val('');
        }
        if (!pickupChecked) {
            $('#flightArrivalDisplay').val('');
        }
        if (!dropoffChecked) {
            $('#flightDepartureDisplay').val('');
        }
    });

    $('#includeBreakfast').on('change', function () {
        $('#breakfastInputs').toggle(this.checked);
    });

    // Reservation Fee and Discount handlers
    $('#includeReservationFee').on('change', function () {
        $('#reservationFeeWrapper').toggle(this.checked);
        if (!this.checked) {
            $('#reservationFeeAmount').val(''); // Clear amount when unchecked
        }
        computeTotal(); // Recalculate total
    });

    $('#includeSeniorPwdDiscount').on('change', function () {
        computeTotal();
    });

    // Recalculate when percentage changes
    $('#seniorPwdDiscountPercent').on('input change', function () {
        if ($('#includeSeniorPwdDiscount').prop('checked')) {
            computeTotal();
        }
    });

    $('#includeDiscount').on('change', function () {
        $('#discountWrapper').toggle(this.checked);
        if (!this.checked) {
            $('#discountAmount').val(''); // Clear amount when unchecked
        }
        computeTotal(); // Recalculate total
    });

    // Auto-disable reservation fee when payment status is "Paid"
    $('#paymentStatus').on('change', function() {
        const paymentStatus = $(this).val();
        const isDirectReservation = $('#directReservationFlag').val() === 'true';
        
        if (paymentStatus === 'paid') {
            // If paid, disable reservation fee (it's not needed)
            $('#includeReservationFee').prop('checked', false).prop('disabled', true);
            $('#reservationFeeWrapper').hide();
            $('#reservationFeeAmount').val('');
        } else if (paymentStatus === 'unpaid') {
            // If unpaid, enable reservation fee (for downpayment)
            $('#includeReservationFee').prop('disabled', false);
            
            // For direct reservations, reservation fee is required but NOT auto-checked
            if (isDirectReservation) {
                // Don't auto-check, just ensure it's available
                $('#includeReservationFee').prop('checked', false);
                $('#reservationFeeWrapper').hide();
                // Show required message
                $('#reservationFeeRequired').show();
            } else {
                // Hide required message for room selection
                $('#reservationFeeRequired').hide();
            }
        }
        computeTotal();
    });

    // Initial check for payment status (in case it's already "Paid" by default)
    function checkPaymentStatus() {
        const paymentStatus = $('#paymentStatus').val();
        const isDirectReservation = $('#directReservationFlag').val() === 'true';
        
        if (paymentStatus === 'paid') {
            // If paid, disable reservation fee (it's not needed)
            $('#includeReservationFee').prop('checked', false).prop('disabled', true);
            $('#reservationFeeWrapper').hide();
            $('#reservationFeeAmount').val('');
        } else if (paymentStatus === 'unpaid') {
            // If unpaid, enable reservation fee (for downpayment)
            $('#includeReservationFee').prop('disabled', false);
            
            // For direct reservations, reservation fee is required but NOT auto-checked
            if (isDirectReservation) {
                // Don't auto-check, just ensure it's available
                $('#includeReservationFee').prop('checked', false);
                $('#reservationFeeWrapper').hide();
                // Show required message
                $('#reservationFeeRequired').show();
            } else {
                // Hide required message for room selection
                $('#reservationFeeRequired').hide();
            }
        }
    }

    // Run initial check when page loads
    checkPaymentStatus();

    // Also check when modal opens (for dynamic content)
    $(document).on('shown.bs.modal', '#modal-addbooking', function() {
        checkPaymentStatus();
    });

    // Check when direct reservation flag changes
    $(document).on('change', '#directReservationFlag', function() {
        checkPaymentStatus();
    });

    // Add input event listeners for reservation fee, discount amounts, and paid amount
    $('#reservationFeeAmount, #discountAmount, #paidAmount').on('input', function() {
        computeTotal();
        // Sync hidden field when paid amount changes
        if ($(this).attr('id') === 'paidAmount') {
            const value = parseFloat($(this).val()) || 0;
            $('#paidAmountHidden').val(value.toFixed(2));
        }
    });

    // Booking route change handler
    $('#bookingRoute').on('change', function () {
        const isAgency = this.value === 'agency';
        toggleAgencyFields(isAgency);
        refreshSeasonalPrice();
    });

    $('input[name="agencyPayer"]').on('change', function () {
        updateAgencyPayerHint();
        refreshSeasonalPrice();
    });

    // Fetch breakfast prices using shared utility
    getBreakfastPrices()
        .then(serviceData => {
            if (!Array.isArray(serviceData)) throw new Error('Invalid response format');

            const adult = serviceData.find(s => s.SERVICE_NAME.includes('Adult'));
            const kid = serviceData.find(s => s.SERVICE_NAME.includes('Kids'));

            if (adult) {
                $('#breakfastAdultPrice').val(adult.SERVICE_COST);
                $('#breakfastAdultId').val(adult.IDNo);
            }
            if (kid) {
                $('#breakfastKidPrice').val(kid.SERVICE_COST);
                $('#breakfastKidId').val(kid.IDNo);
            }
        })
        .catch(err => console.error('Failed to load breakfast prices:', err));

    // Fetch and populate transport rates
    getPickAndDropPrices();

    // Use shared floor dropdown utility (prevents duplicate API calls)

    // Populate Floor Dropdown for Group Booking (Optional)
    populateFloorDropdownGeneric('#groupFloorSelect');

    // Toggle Group Booking Fields
    $('#groupBookingCheckbox').change(function(){
        if ($(this).is(':checked')) {
            $('#groupBookingFields').slideDown(); // Show group booking fields

            // Hide individual room selection fields
            $('#divaddFloor, #divaddroom, #divroom_type, #divprice, #divmaxOccupants, #divbedCount, #divtxtFullNameAdd, #divtxtNumber').hide();
            $('#txtFullNameAdd, #txtNumber').prop('required', false); 
            // Adjust layout of remaining fields for better alignment
            $('#divpaymentStatus, #divtxtCheckInStatus, #divselectBookingRoute, #divtxtGuestType, #divtxtGuestLevel')
                .removeClass('col-lg-3').addClass('col-lg-4'); // Widen remaining fields for better spacing

        } else {
            $('#groupBookingFields').slideUp();
            $('#consecutiveResultsContainer').hide(); // Hide consecutive results

            // Show individual booking fields again
            $('#divaddFloor, #divaddroom, #divroom_type, #divprice, #divbedCount, #divtxtFullNameAdd, #divtxtNumber').show();

            $('#divpaymentStatus, #divtxtCheckInStatus, #divselectBookingRoute, #divtxtGuestType, #divtxtGuestLevel')
                .removeClass('col-lg-4').addClass('col-lg-3'); // Reset to original size
        }
    });

    // Group Booking: Search Consecutive Rooms
    $('#btnSearchConsecutive').click(function(){
        var daterange = $('#daterange').val();
        if(!daterange){
            alert('Please select a date range.');
            return;
        }
        var parts = daterange.split(' to ');
        if(parts.length < 2){
            alert('Invalid date range.');
            return;
        }
        var startDate = parts[0].trim();
        var endDate = parts[1].split('(')[0].trim();
        var neededRooms = $('#numberOfRooms').val();
        if(!neededRooms){
            alert('Please enter the number of rooms needed.');
            return;
        }
        var floor = $('#groupFloorSelect').val() || '';

        $.ajax({
            url: '/booking/find_consecutive_rooms',
            type: 'POST',
            data: {
                startDate: startDate,
                endDate: endDate,
                neededRooms: neededRooms,
                floorNumber: floor
            },
            success: function(response){
                if(!response.success){
                    alert(response.message || 'No consecutive rooms found.');
                    return;
                }
                var blocks = response.data;
                displayConsecutiveRooms(blocks);
            },
            error: function(err){
                console.error('Error finding consecutive rooms:', err);
                alert('Error searching consecutive rooms. Check console for details.');
            }
        });
    });

    // Populate Floor Dropdown Single
    populateFloorDropdownGeneric('#addFloor', true);

    // Populate Rooms Dropdown Based on Selected Floor
    function getOrdinalSuffix(number) {
        const j = number % 10,
              k = number % 100;
        if (j === 1 && k !== 11) return `${number}st`;
        if (j === 2 && k !== 12) return `${number}nd`;
        if (j === 3 && k !== 13) return `${number}rd`;
        return `${number}th`;
    }

    function populateFloorDropdown(floors) {
        const floorDropdown = $('#addFloor');
        floorDropdown.empty();
        floorDropdown.append('<option value="" disabled selected>Select Floor</option>');

        floors.forEach(floor => {
            const ordinalFloor = getOrdinalSuffix(floor.floor_number); // Add ordinal suffix
            floorDropdown.append(`<option value="${floor.floor_number}">${ordinalFloor}</option>`);
        });
    }

    // Populate Room Dropdown Based on Selected Floor
    $('#addFloor').change(function () {
        const selectedFloor = $(this).val();
        // console.log('Selected Floor:', selectedFloor); // Debug log for floor value

        if (selectedFloor) {
            $.ajax({
                url: `/booking/get_rooms_by_floor?floor=${selectedFloor}`, // API endpoint
                method: 'GET',
                success: function (data) {
                    // console.log('Rooms returned from server:', data); // Debug log for room data
                    
                    const roomDropdown = $('#addroom');
                    roomDropdown.empty();
                    roomDropdown.append('<option value="" disabled selected>Select Room</option>');

                    if (data.length === 0) {
                        roomDropdown.append('<option value="">No Rooms Available</option>');
                    } else {
                        data.forEach(room => {
                            roomDropdown.append(
                                `<option value="${room.room_id}">${room.ROOM_NUMBER}</option>`
                            );
                        });
                    }
                },
                error: function (err) {
                    console.error('Error fetching rooms for floor:', err);
                }
            });
        }
    });

    // Floor data already populated above (line 702)

    // Manual price toggle
    $('#manualPriceToggle').change(function () {
        if ($(this).is(':checked')) {
            $('#price').prop('readonly', false); // allow user to type
        } else {
            $('#price').prop('readonly', true); // lock it again
            calculateTotalPrice(); // restore calculated price if unchecked
        }
    });

    // Handle Room Selection to Fetch Booked Dates and Populate Fields
    $('#addroom').change(function () {
        const roomId = $(this).val(); // Get selected Room ID
        const isCalendarAction = $(this).data('is-calendar-action');

        if (roomId) {
            // Fetch Room Details
            fetch('/booking/get-room-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId })
            })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    console.error('Failed to fetch room details:', data.message);
                    return;
                }

                const room = data.roomDetails;
                const seasonalPrices = room.SEASONAL_PRICES || [];

                const roomViewText = room.ROOM_VIEW === 1 ? 'Condo View' :
                      room.ROOM_VIEW === 2 ? 'Mountain View' : 'N/A';

                $('#room_type').val(roomViewText);
                $('#maxOccupants').val(room.ROOM_MAX);
                $('#bedCount').val(room.ROOM_BED);
                $('#amenities').val(room.AMENITIES);
                $('#room_type_hidden').val(room.ROOM_TYPE);
                

                const daterange = $('#daterange').val() || '';
                const [startDate] = daterange.split(' to ');

                // 🧠 Function to get season ID
                function getSeasonIdForDate(checkInDate, seasonalPrices) {
                    const checkIn = new Date(checkInDate);
                    const mmdd = (checkIn.getMonth() + 1).toString().padStart(2, '0') + checkIn.getDate().toString().padStart(2, '0');

                    for (const p of seasonalPrices) {
                        const start = new Date(p.startDate);
                        const end = new Date(p.endDate);

                        const startMMDD = (start.getMonth() + 1).toString().padStart(2, '0') + start.getDate().toString().padStart(2, '0');
                        const endMMDD = (end.getMonth() + 1).toString().padStart(2, '0') + end.getDate().toString().padStart(2, '0');

                        if ((startMMDD <= endMMDD && mmdd >= startMMDD && mmdd <= endMMDD) ||
                            (startMMDD > endMMDD && (mmdd >= startMMDD || mmdd <= endMMDD))) {
                            return p.seasonId;
                        }
                    }
                    return null;
                }

                function updateSeasonalPrice() {
                    const bedCount = parseInt(room.ROOM_BED);
                    const bookingType = getPriceBookingType();
                    const seasonId = getSeasonIdForDate(startDate, seasonalPrices);

                    const match = seasonalPrices.find(p =>
                        parseInt(p.bedCount) === bedCount &&
                        p.bookingType === bookingType &&
                        parseInt(p.seasonId) === parseInt(seasonId)
                    );

                    let pricePerNight = match ? parseFloat(match.price) : parseFloat(room.ROOM_PRICE);

                    $('#price')
                        .val(pricePerNight.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ","))
                        .data('base-price', pricePerNight);

                    $('#baseprice').val(pricePerNight.toFixed(2));

                    // Recompute total after setting price
                    computeTotal();

                    if (typeof calculateTotalPrice === 'function') {
                        calculateTotalPrice();
                    }
                }

                function handleAgencySelection() {
                    const isAgency = $('#bookingRoute').val() === 'agency';
                    toggleAgencyFields(isAgency);
                }

                window._updateSeasonalPrice = updateSeasonalPrice;
                updateSeasonalPrice();

                $('#bookingRoute').off('change').on('change', function() {
                    updateSeasonalPrice();
                    handleAgencySelection();
                });

                $('input[name="agencyPayer"]').off('change.priceUpdate').on('change.priceUpdate', updateSeasonalPrice);
            })
            .catch(err => {
                console.error('Error fetching room details:', err);
            });

            // Fetch Pending Bookings
            $.ajax({
                url: `/booking/get_pending_bookings?room_id=${roomId}`,
                method: 'GET',
                success: function (data) {
                    // console.log('Fetched unavailable dates:', data);
                    unavailableDates = data.map(booking => ({
                        start: booking.start_date,
                        end: booking.end_date
                    }));
                    // console.log('Processed unavailableDates:', unavailableDates);
                },
                error: function (err) {
                    console.error('Error fetching unavailable dates:', err);
                }
            });

            // Fetch Pending Bookings and Show in Modal if Available, BUT NOT if triggered from calendar
            if (!isCalendarAction) {
                $.ajax({
                    url: `/booking/get_pending_bookings?room_id=${roomId}`,
                    method: 'GET',
                    success: function (data) {
                        if (data.length > 0) {
                            let rows = '';
                            let unavailableDates = '';
                            let roomNumber = '';

                            data.forEach((booking, index) => {
                                const statusLabel = booking.status === 'pending' 
                                            ? `<span class="label label-info">Pending</span>` 
                                            : booking.status === 'check-In' 
                                            ? `<span class="label label-success">Check-in</span>` 
                                            : booking.status;

                                rows += `
                                    <tr style="background-color: #6c757d; color: #fff;">
                                        <td>${booking.name}</td>
                                        <td>${booking.start_date}</td>
                                        <td>${booking.end_date}</td>
                                       <td>${statusLabel}</td>
                                    </tr>
                                `;

                                unavailableDates += `${booking.start_date} to ${booking.end_date}`;
                                if (index < data.length - 1) {
                                    unavailableDates += ',<br>';
                                }
                                roomNumber = booking.ROOM_NUMBER;
                            });

                            // Show SweetAlert2 first
                            Swal.fire({
                                icon: 'info',
                                title: `Booked Dates for Room ${roomNumber}`,
                                html: `The following dates are booked for this room:<br>${unavailableDates}`,
                                confirmButtonText: 'OK',
                                backdrop: false
                            }).then(() => {
                                // After Swal is dismissed, show the modal
                                $('#pendingBookingsTableBody').html(rows);
                                $('#pendingBookingsModal').modal('show');
                            });
                        }
                    },
                    error: function (err) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Error!',
                            text: `Unable to fetch bookings: ${err.responseText || 'Unknown error'}`,
                            confirmButtonText: 'OK',
                            backdrop: false
                        });
                        console.error('Error fetching pending bookings:', err);
                    }
                });
            }

            // Clean up the flag after use
            if (isCalendarAction) {
                $(this).removeData('is-calendar-action');
            }

        } else {
            console.error('No room selected. Please select a room.');
        }
    });

    // Attach event listeners to recalculate price when values change
    document.getElementById('baseprice').addEventListener('input', calculateTotalPrice);
    document.getElementById('diffindays').addEventListener('input', calculateTotalPrice);

    $('#price').on('input', function () {
        if ($('#manualPriceToggle').is(':checked')) {
            // Remove commas then parse
            const manualPrice = parseFloat($(this).val().replace(/,/g, '')) || 0;
            $('#baseprice').val(manualPrice);
        }
    });

    // FOR GUEST TYPE using shared utility
    populateGuestTypesDropdown('#guestType', true, 'Guest Type');

    // FOR GUEST LEVEL using shared utility
    populateGuestLevelsDropdown('#guestLevel', true, 'Guest Level');

    // Add an event listener to reset the dropdowns when txtFullNameAdd changes
    document.getElementById('txtFullNameAdd').addEventListener('input', function() {
        // Clear the Customer ID and Contact Number fields
        document.getElementById('guestID').value = '';   // Clear the hidden Guest ID field
        document.getElementById('txtNumber').value = '';     // Clear the contact number field

        // Only reset dropdowns if the input field is completely cleared
        if (this.value.trim() === '') {
            // Reset to default selected values (not placeholder)
            // Find and select the default Guest Type (ID = 1)
            const guestTypeSelect = document.getElementById('guestType');
            for (let i = 0; i < guestTypeSelect.options.length; i++) {
                if (guestTypeSelect.options[i].value === '1') {
                    guestTypeSelect.selectedIndex = i;
                    break;
                }
            }
            
            // Find and select the default Guest Level (ID = 9)
            const guestLevelSelect = document.getElementById('guestLevel');
            for (let i = 0; i < guestLevelSelect.options.length; i++) {
                if (guestLevelSelect.options[i].value === '9') {
                    guestLevelSelect.selectedIndex = i;
                    break;
                }
            }
        }
    });

    // Prevent hiding if clicked inside search results
    document.getElementById('searchResults').addEventListener('mousedown', function (event) {
        event.preventDefault(); // Prevent blur event from firing
    });

    // Store the original parent of bookingRouteWrapper
    var $bookingRouteWrapper = $('#bookingRouteWrapper');
    var $singlePlaceholder = $('#bookingRouteSinglePlaceholder');
    var $groupPlaceholder = $('#bookingRouteGroupPlaceholder');
    var $agencySelectWrapper = $('#agencySelectWrapper');
    var $agencySinglePlaceholder = $('#agencySelectSinglePlaceholder');
    var $agencyGroupPlaceholder = $('#agencySelectGroupPlaceholder');

    function moveBookingRouteAndAgency() {
        if ($('#groupBookingCheckbox').is(':checked')) {
            $groupPlaceholder.append($bookingRouteWrapper);
            $agencyGroupPlaceholder.append($agencySelectWrapper);
        } else {
            $singlePlaceholder.append($bookingRouteWrapper);
            $agencySinglePlaceholder.append($agencySelectWrapper);
            $agencySelectWrapper.removeClass('col-lg-4 col-lg-3').addClass('col-lg-12');
        }
    }
    // Initial move on page load
    moveBookingRouteAndAgency();
    // Move on group booking checkbox change
    $('#groupBookingCheckbox').change(moveBookingRouteAndAgency);

    // Agency selection is now handled by the main bookingRoute change handler above

    // Clear fields when changing the floor
    $('#addFloor').change(function () {
        // Clear all relevant fields when floor is changed
        $('#addroom').val('').change(); // Reset the Room dropdown
        clearFields(); // Call function to clear other fields
    });

    // Clear fields when changing the room
    $('#addroom').change(function () {
        clearFields(); // Call function to clear fields
    });

    // Always recompute on any relevant change
    $(document).on('input change', 
        '#selectedRoomPrice, #diffindays, #breakfastAdultQty, #breakfastAdultPrice, #breakfastKidQty, #breakfastKidPrice, #pickupPrice, #dropoffPrice, #includePickup, #includeDropoff, input[name="selectedBlock"]',
        function () {
            if ($('#groupBookingCheckbox').is(':checked')) {
                computeGroupTotal();
            }
        }
    );

    // Calculate late check-out fee when check-out status changes
    $('#checkOutStatus').on('change', function() {
        calculateLateCheckoutFee();
    });

    // Calculate late check-out fee when modal opens
    $(document).on('shown.bs.modal', '#modal-addbooking', function() {
        // Calculate late check-out fee after modal is fully shown
        setTimeout(() => {
            calculateLateCheckoutFee();
        }, 100);
    });

    // Sync late checkout fee input with hidden field
    $(document).on('input', '#lateCheckoutFeeInput', function() {
        const value = parseFloat($(this).val()) || 0;
        $('#lateCheckoutFee').val(value);
        computeTotal();
    });

    // Bind events after DOM is fully loaded
    $(document).on('input change', `
        #baseprice, #price, #manualPriceToggle,
        #diffindays,
        #breakfastAdultQty, #breakfastAdultPrice,
        #breakfastKidQty, #breakfastKidPrice,
        #pickupPrice, #dropoffPrice,
        #includePickup, #includeDropoff
    `, function (e) {
        computeTotal();
    });

    // Explicitly bind for room change
    $('#addroom').on('change', function () {
        // console.log('🟡 Room selection changed — recomputing...');
        computeTotal();
    });
    $('#daterange').on('change', function () {
        computeTotal();
    });

    // Toggle voucher buttons - removed group voucher functionality
    // $('#groupBookingCheckbox').on('change', toggleVoucherButtons);
    // toggleVoucherButtons();

    // Voucher generation buttons
    $('#btnGenerateVoucherPreview').on('click', function () {
        // Determine if this is a direct reservation based on the flag
        const isDirectReservation = $('#directReservationFlag').val() === 'true';

        // Get the raw text values from the elements and remove commas
        let computedTotalRaw = $('#computedTotal').text().trim().replace(/,/g, '');
        let computedBalanceRaw = $('#computedBalance').text().trim().replace(/,/g, '');
        let computedPaidAmountRaw = $('#computedPaidAmount').text().trim().replace(/,/g, '');
        
        // Fallback: If values are empty, try to get from paidAmount field
        if (!computedPaidAmountRaw || computedPaidAmountRaw === '0.00') {
            const paidAmountValue = $('#paidAmount').val() || $('#paidAmountHidden').val() || '0';
            computedPaidAmountRaw = parseFloat(paidAmountValue.toString().replace(/,/g, '')).toFixed(2);
        }
        
        // If still empty or 0, use computed from total
        if (!computedTotalRaw || computedTotalRaw === '0.00') {
            // Try to compute total from form values
            const roomRate = parseFloat($('#price').val().toString().replace(/,/g, '')) || 0;
            const nights = parseInt($('#diffindays').val()) || 1;
            const subtotal = roomRate * nights;
            computedTotalRaw = subtotal.toFixed(2);
        }
        
        // Always recalculate balance from total and paidAmount to ensure accuracy
        const totalValue = parseFloat(computedTotalRaw.replace(/,/g, '')) || 0;
        const paidValue = parseFloat(computedPaidAmountRaw.replace(/,/g, '')) || 0;
        const balance = totalValue - paidValue;
        computedBalanceRaw = Math.max(0, balance).toFixed(2);

      // Calculate room charges and services
      const priceValue = $('#price').val();
      const roomRateStr = priceValue ? priceValue.toString().replace(/[,\s₱₹$]/g, '') : '0';
      const roomRate = parseFloat(roomRateStr) || 0;
      const nights = parseInt($('#diffindays').val()) || 1;
      const roomCharges = Math.round((roomRate * nights) * 100) / 100; // Round to 2 decimals
      
      // Debug logging
      console.log('Voucher Calculation Debug:', {
        priceValue: priceValue,
        roomRateStr: roomRateStr,
        roomRate: roomRate,
        nights: nights,
        roomCharges: roomCharges
      });
      
      const breakfastAdultQty = parseInt($('#breakfastAdultQty').val()) || 0;
      const breakfastAdultPrice = parseFloat($('#breakfastAdultPrice').val().toString().replace(/,/g, '')) || 0;
      const breakfastKidQty = parseInt($('#breakfastKidQty').val()) || 0;
      const breakfastKidPrice = parseFloat($('#breakfastKidPrice').val().toString().replace(/,/g, '')) || 0;
      const breakfastTotal = parseFloat(((breakfastAdultQty * breakfastAdultPrice) + (breakfastKidQty * breakfastKidPrice)).toFixed(2));
      
      const pickup = $('#includePickup').is(':checked') ? (parseFloat($('#pickupPrice').val().toString().replace(/,/g, '')) || 0) : 0;
      const dropoff = $('#includeDropoff').is(':checked') ? (parseFloat($('#dropoffPrice').val().toString().replace(/,/g, '')) || 0) : 0;
      const lateCheckoutFee = parseFloat($('#lateCheckoutFee').val().toString().replace(/,/g, '')) || 0;
      // Exclude late checkout fee from servicesTotal as it's displayed separately
      const servicesTotal = parseFloat((breakfastTotal + pickup + dropoff).toFixed(2));

      const bookingData = {
        voucherNo: $('#voucherNo').val(),
        fullname: $('#bookingRoute').val() === 'agency' 
          ? $('#agencySelect option:selected').text() 
          : $('#txtFullNameAdd').val(),
        contactNumber: $('#txtNumber').val(),
        dateFrom: $('#daterange').val().split(' to ')[0],
        dateTo: $('#daterange').val().split(' to ')[1].split('(')[0].trim(),
        bedCount: $('#bedCount').val(),
        roomNumber: isDirectReservation ? 'NO ROOM ASSIGNED' : $('#addroom option:selected').text(),
        roomView: isDirectReservation ? 'N/A' : $('#room_type').val(),
        roomType: isDirectReservation ? 'NO ROOM ASSIGNED' : $('#room_type_hidden').val(),
        roomRate: $('#price').val(),
        breakfastAdult: $('#breakfastAdultQty').val(),
        breakfastAdultPrice: $('#breakfastAdultPrice').val(),
        breakfastKid: $('#breakfastKidQty').val(),
        breakfastKidPrice: $('#breakfastKidPrice').val(),
        pickup: $('#includePickup').is(':checked') ? $('#pickupPrice').val() : 0,
        dropoff: $('#includeDropoff').is(':checked') ? $('#dropoffPrice').val() : 0,
        remarks: $('#bookingRemarks').val(),
        total: computedTotalRaw,
        balance: computedBalanceRaw,
        paidAmount: computedPaidAmountRaw,
        checkInStatus: $('#checkInStatus').val(),
        checkOutStatus: $('#checkOutStatus').val(),
        lateCheckoutFee: $('#lateCheckoutFee').val(),
        reservationFee: $('#includeReservationFee').is(':checked') ? $('#reservationFeeAmount').val() : 0,
        discount: $('#includeDiscount').is(':checked') ? $('#discountAmount').val() : 0,
        roomCharges: roomCharges.toFixed(2),
        servicesTotal: servicesTotal.toFixed(2),
        directReservationFlag: isDirectReservation ? 'true' : 'false',
      };
        
        const form = $('<form>', {
            method: 'POST',
            action: '/booking/generate-voucher',
            target: '_blank'
        });

        for (let key in bookingData) {
            form.append($('<input>', {
                type: 'hidden',
                name: key,
                value: bookingData[key]
            }));
        }

        $('body').append(form);
        form.submit();
        form.remove();
    });

    // Group voucher button removed - functionality commented out
    // $('#btnGenerateGroupVoucherPreview').on('click', function () {
    //     // Collect group booking data
    //     const groupName = $('#groupName').val();
    //     const groupContact = $('#groupContact').val();
    //     const daterange = $('#daterange').val();
    //     const dateFrom = daterange.split(' to ')[0];
    //     const dateTo = daterange.split(' to ')[1].split('(')[0].trim();
    //     const selectedRooms = $('#selectedBlock').val();
    //     const selectedRoomPrice = $('#selectedRoomPrice').val();
    //     const roomNumbers = selectedRooms ? selectedRooms.split(',').map(r => r.trim()) : [];
    //     const roomTypes = $('#room_type_hidden').val(); // You may want to collect all types if per room
    //     const total = $('#computedTotal').text();
    //     const remarks = $('#bookingRemarks').val();
    //     const voucherNo = $('#voucherNo').val();
    //     // Add breakfast/pickup/dropoff fields
    //     const breakfastAdult = $('#breakfastAdultQty').val();
    //     const breakfastKid = $('#breakfastKidQty').val();
    //     const pickup = $('#includePickup').is(':checked') ? $('#pickupPrice').val() : 0;
    //     const dropoff = $('#includeDropoff').is(':checked') ? $('#dropoffPrice').val() : 0;
    //     const reservationFee = $('#includeReservationFee').is(':checked') ? $('#reservationFeeAmount').val() : 0;
    //     const discount = $('#includeDiscount').is(':checked') ? $('#discountAmount').val() : 0;
    //     const checkOutStatus = $('#checkOutStatus').val();
    //     const lateCheckoutFee = $('#lateCheckoutFee').val();

    //     // Compose a summary string for room numbers/types
    //     let roomSummary = '';
    //     if (roomNumbers.length > 0) {
    //         roomSummary = roomNumbers.join(', ');
    //     }

    //     // Compose group voucher data
    //     const groupVoucherData = {
    //         voucherNo,
    //         groupName,
    //         groupContact,
    //         dateFrom,
    //         dateTo,
    //         roomSummary,
    //         total,
    //         remarks,
    //         breakfastAdult,
    //         breakfastKid,
    //         pickup,
    //         dropoff,
    //         reservationFee,
    //         discount,
    //         checkOutStatus,
    //         lateCheckoutFee
    //     };

    //     // Submit to backend
    //     const form = $('<form>', {
    //         method: 'POST',
    //         action: '/booking/generate-group-voucher',
    //         target: '_blank'
    //     });

    //     for (let key in groupVoucherData) {
    //         form.append($('<input>', {
    //             type: 'hidden',
    //             name: key,
    //             value: groupVoucherData[key]
    //         }));
    //     }

    //     $('body').append(form);
    //     form.submit();
    //     form.remove();
    // });

    // Event listener for selected block changes
    $(document).on('change', 'input[name="selectedBlock"]', function () {
        // Hide lang, wag i-empty!
        $('#availableRoomsBlock').hide();
        computeGroupTotal;
    });
});
