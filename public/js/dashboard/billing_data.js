// Billing Data Scripts
// Extracted from dashboard.ejs

function showBilling(bookingID) {
	// Set the BookingID in the hidden input
	const bookingInput = document.getElementById('hiddenBookingId');
	if (bookingInput) {
		bookingInput.value = bookingID;

	} else {
		console.error('BookingID input not found!');
		return;
	}

	// Fetch billing data via AJAX
	$.ajax({
		url: `/booking/get-billing/${bookingID}?_=${Date.now()}`,
		method: 'GET',
		cache: false, // ✅ prevent 304
		success: function (data) {
			// Populate table rows
			const tbody = document.querySelector('#modal-billing table tbody');
			tbody.innerHTML = ''; // Clear existing rows
			data.items.forEach((item, index) => {
				console.log(`🔎 Item ${index + 1} status:`, item.status); // ✅ Log status
				const isPaid = item.status === 'paid';
				const paidTextClass = isPaid ? 'text-success' : '';

				const row = `
				<tr>
				<td class="text-center ${paidTextClass}">${index + 1}</td>
				<td class="text-center ${paidTextClass}">${new Date(item.date).toLocaleDateString()}</td>
				<td class="text-center ${paidTextClass}">${item.description}</td>
				<td class="text-center ${paidTextClass}">${parseFloat(item.basePrice).toFixed(2)}</td>
				<td class="text-center ${paidTextClass}">${item.qty || '-'}</td>
				<td class="text-right ${paidTextClass}">${parseFloat(item.subTotal).toFixed(2)}</td>
									</tr>
				`;
				tbody.insertAdjacentHTML('beforeend', row);
			});

			// Populate totals with Reservation Fee and Discount
			const subTotal = parseFloat(data.subTotal);
			const reservationFee = parseFloat(data.reservationFee) || 0;
			const discountAmount = parseFloat(data.discountAmount) || 0;
			
			// Calculate total amount including reservation fee and discount
			const totalAmount = subTotal - reservationFee - discountAmount;

			// Handle Reservation Fee Display
			if (data.reservationFee && parseFloat(data.reservationFee) > 0) {
				const reservationFeeRow = document.getElementById('reservationFeeRow');
				const reservationFeeElement = document.getElementById('billingReservationFeeAmount');
				if (reservationFeeRow && reservationFeeElement) {
					reservationFeeRow.style.display = 'block';
					reservationFeeElement.textContent = parseFloat(data.reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 });
					// Align the amount to the right like Paid and Balance
					reservationFeeElement.style.textAlign = 'right';
					reservationFeeElement.style.display = 'inline-block';
					reservationFeeElement.style.width = 'auto';
					reservationFeeElement.style.float = 'right';
					reservationFeeElement.style.marginLeft = 'auto';
					console.log('✅ Reservation Fee displayed in billing:', data.reservationFee);
				} else {
					console.error('❌ Reservation Fee elements not found in billing modal');
				}
			} else {
				const reservationFeeRow = document.getElementById('reservationFeeRow');
				if (reservationFeeRow) {
					reservationFeeRow.style.display = 'none';
					console.log('✅ Reservation Fee hidden in billing (no fee)');
				}
			}

			// Handle Discount Display
			if (data.discountAmount && parseFloat(data.discountAmount) > 0) {
				const discountRow = document.getElementById('discountRow');
				const discountElement = document.getElementById('billingDiscountAmount');
				if (discountRow && discountElement) {
					discountRow.style.display = 'block';
					discountElement.textContent = parseFloat(data.discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 });
					// Align the amount to the right like Paid and Balance
					discountElement.style.textAlign = 'right';
					discountElement.style.display = 'inline-block';
					discountElement.style.width = 'auto';
					discountElement.style.float = 'right';
					discountElement.style.marginLeft = 'auto';
					console.log('✅ Discount displayed in billing:', data.discountAmount);
				} else {
					console.error('❌ Discount elements not found in billing modal');
				}
			} else {
				const discountRow = document.getElementById('discountRow');
				if (discountRow) {
					discountRow.style.display = 'none';
					console.log('✅ Discount hidden in billing (no discount)');
				}
			}

			// Calculate paid and unpaid amounts from items
			let totalPaid = 0;
			let totalUnpaid = 0;

			data.items.forEach(item => {
				const amount = parseFloat(item.subTotal) || 0;
				if (item.status === 'paid') {
					totalPaid += amount;
				} else {
					totalUnpaid += amount;
				}
			});
			
			// Add reservation fee to total amount (it's part of the total cost)
			// Note: Reservation fee is not part of individual item payments, it's a separate charge
			const totalWithReservationFee = totalAmount;
			
			// FIXED: Calculate actual paid amount considering reservation fee and discount
			// If all items are paid, the actual paid amount should be the net amount (after reservation fee and discount)
			let actualPaidAmount = totalPaid;
			
			// If all items are paid, adjust for reservation fee and discount
			const allItemsPaid = data.items.every(item => item.status === 'paid');
			if (allItemsPaid) {
				// When all items are paid, the actual paid amount is the net amount due
				actualPaidAmount = totalAmount; // This is already calculated as subTotal - reservationFee - discountAmount
			}
			
			// Calculate final balance including reservation fee and discount
			const finalBalance = totalWithReservationFee - actualPaidAmount;
			
			// Log calculations for debugging
			console.log('💰 Billing Calculations:', {
				subTotal: subTotal,
				reservationFee: reservationFee,
				discountAmount: discountAmount,
				totalAmount: totalAmount,
				totalPaid: totalPaid,
				actualPaidAmount: actualPaidAmount,
				finalBalance: finalBalance,
				allItemsPaid: allItemsPaid
			});

			// Populate modal fields dynamically
			document.getElementById('billingReceiptId').textContent = data.bookingId || 'N/A';
			document.getElementById('customerName').textContent = data.customerName || 'N/A';
			// document.getElementById('customerAddress').textContent = data.address || 'N/A';
			document.getElementById('invoiceDate').textContent = data.invoiceDate || 'N/A';
			document.getElementById('confNumber').textContent = data.confNumber || 'N/A';
			document.getElementById('totalPaid').textContent = actualPaidAmount.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			document.getElementById('balanceAmount').textContent = finalBalance.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			document.getElementById('totalPayment').textContent = totalWithReservationFee.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			// Determine if ALL items are paid (including reservation fee consideration)
			// Consider reservation fee as part of the total payment requirement
			const allPaid = allItemsPaid && (finalBalance <= 0);

			if (allPaid) {
				// Show paid image overlay in billing modal
				const paidImageOverlay = document.getElementById('paidImageOverlay');
				if (paidImageOverlay) {
					paidImageOverlay.style.display = 'block';
					paidImageOverlay.classList.add('show-paid-status');
				}
				
				// Update button text and disable it
				$('#proceedToPaymentButton').prop('disabled', true).text('Payment Completed');
				
				// Also update the button class to show it's completed
				$('#proceedToPaymentButton').removeClass('btn-payment').addClass('btn-success');
			} else {
				// Hide paid image overlay in billing modal
				const paidImageOverlay = document.getElementById('paidImageOverlay');
				if (paidImageOverlay) {
					paidImageOverlay.style.display = 'none';
					paidImageOverlay.classList.remove('show-paid-status');
				}
				
				// Update button text and enable it
				$('#proceedToPaymentButton').prop('disabled', false).text('Proceed to Payment');
				
				// Reset button class
				$('#proceedToPaymentButton').removeClass('btn-success').addClass('btn-payment');
			}

			// Show the modal
			$('#modal-billing').modal('show');
		},
		error: function (err) {
			console.error('Failed to fetch billing data:', err);
			alert('Failed to fetch billing data. Please try again.');
		}
	});
}
