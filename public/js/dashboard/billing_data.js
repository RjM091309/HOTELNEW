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

			// Populate totals
			const subTotal = parseFloat(data.subTotal);
			const discount = parseFloat(data.discountAmount) || 0;
			const total = subTotal - discount;

			// Handle Reservation Fee Display
			if (data.reservationFee && parseFloat(data.reservationFee) > 0) {
				const reservationFeeRow = document.getElementById('reservationFeeRow');
				const reservationFeeElement = document.getElementById('billingReservationFeeAmount');
				if (reservationFeeRow && reservationFeeElement) {
					reservationFeeRow.style.display = 'block';
					reservationFeeElement.textContent = `₱${parseFloat(data.reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
				}
			} else {
				const reservationFeeRow = document.getElementById('reservationFeeRow');
				if (reservationFeeRow) {
					reservationFeeRow.style.display = 'none';
				}
			}

			// Handle Discount Display
			if (data.discountAmount && parseFloat(data.discountAmount) > 0) {
				const discountRow = document.getElementById('discountRow');
				const discountElement = document.getElementById('billingDiscountAmount');
				if (discountRow && discountElement) {
					discountRow.style.display = 'block';
					discountElement.textContent = `₱${parseFloat(data.discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
				}
			} else {
				const discountRow = document.getElementById('discountRow');
				if (discountRow) {
					discountRow.style.display = 'none';
				}
			}

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

			// Populate modal fields dynamically
			document.getElementById('billingReceiptId').textContent = data.bookingId || 'N/A';
			document.getElementById('customerName').textContent = data.customerName || 'N/A';
			// document.getElementById('customerAddress').textContent = data.address || 'N/A';
			document.getElementById('invoiceDate').textContent = data.invoiceDate || 'N/A';
			document.getElementById('confNumber').textContent = data.confNumber || 'N/A';
			document.getElementById('totalPaid').textContent = totalPaid.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			document.getElementById('balanceAmount').textContent = totalUnpaid.toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			document.getElementById('totalPayment').textContent = (totalPaid + totalUnpaid).toLocaleString(undefined, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			// Determine if ALL items are paid
			const allPaid = data.items.every(item => item.status === 'paid');

			if (allPaid) {
				$('#paidImageContainer').show();
				$('#proceedToPaymentButton').prop('disabled', true).text('Payment Completed');
			} else {
				$('#paidImageContainer').hide();
				$('#proceedToPaymentButton').prop('disabled', false).text('Proceed to Payment');
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
