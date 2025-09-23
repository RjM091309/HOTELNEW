// Function to print only the content within the element with the given ID
function printDiv(divId) {
    const printContents = document.getElementById(divId);
    const originalContents = document.body.innerHTML;

    // Hide buttons before printing
    const buttons = printContents.querySelectorAll('button');
    buttons.forEach(button => button.style.display = 'none');

    // Add a "Thank You" message temporarily
    const thankYouMessage = document.createElement('p');
    thankYouMessage.textContent = "Thank you for choosing SKY HOTEL. We look forward to welcoming you again!";
    thankYouMessage.style.textAlign = "center";
    thankYouMessage.style.fontSize = "16px";
    thankYouMessage.style.fontWeight = "bold";
    thankYouMessage.style.marginTop = "20px";
    printContents.appendChild(thankYouMessage);

    // Print the modified content
    document.body.innerHTML = printContents.innerHTML;
    window.print();

    // Restore original content after printing
    document.body.innerHTML = originalContents;
    location.reload(); // Reload page to restore modal functionality
}

// Ensure the modal is reset properly when closed
document.getElementById('modal-billing').addEventListener('hidden.bs.modal', function () {
    const modalElement = document.getElementById('modal-billing');
    modalElement.innerHTML = modalElement.innerHTML; // Reset modal content
});

document.getElementById('proceedToPaymentButton').addEventListener('click', function () {
    // Get the Balance (not total) from the Billing Modal
    const totalPayment = document.getElementById('balanceAmount').textContent.trim();

    console.log('Balance for payment:', totalPayment);

    const paymentAmountField = document.getElementById('paymentAmount');
    if (totalPayment) {
        paymentAmountField.value = totalPayment;
    } else {
        paymentAmountField.value = "N/A";
    }

    const paymentModal = new bootstrap.Modal(document.getElementById('modal-payment'));
    paymentModal.show();
});

document.getElementById('generateInvoiceBtn').addEventListener('click', function () {
    const bookingId = document.getElementById('hiddenBookingId').value;

    if (!bookingId) {
        alert("Missing Booking ID!");
        return;
    }

    const url = `/booking/generate-invoice/${bookingId}`;
    window.open(url, '_blank');
}); 

// Unified Billing Loader used across pages (overrides other definitions)
// This ensures the same content and calculations everywhere
window.showBilling = function (bookingID) {
    try {
        const bookingInput = document.getElementById('hiddenBookingId');
        if (bookingInput) {
            bookingInput.value = bookingID;
        } else {
            console.error('BookingID input not found!');
            return;
        }

        $.ajax({
            url: `/booking/get-billing/${bookingID}?_=${Date.now()}`,
            method: 'GET',
            cache: false,
            success: function (data) {
                const tbody = document.querySelector('#modal-billing table tbody');
                if (!tbody) {
                    console.error('Billing table body not found');
                    return;
                }
                tbody.innerHTML = '';
                data.items.forEach((item, index) => {
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
                    </tr>`;
                    tbody.insertAdjacentHTML('beforeend', row);
                });

                const subTotal = parseFloat(data.subTotal);
                const reservationFee = parseFloat(data.reservationFee) || 0;
                const discountAmount = parseFloat(data.discountAmount) || 0;
                const totalAmount = subTotal - reservationFee - discountAmount;

                let totalPaid = 0;
                let totalUnpaid = 0;
                data.items.forEach(item => {
                    const amount = parseFloat(item.subTotal) || 0;
                    if (item.status === 'paid') totalPaid += amount; else totalUnpaid += amount;
                });

                // Paid Amount should reflect the sum of PAID items only
                const adjustedPaidAmount = totalPaid;
                const totalWithReservationFee = totalAmount;
                let finalBalance = totalWithReservationFee - adjustedPaidAmount;

                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value;
                };

                setText('billingReceiptId', data.bookingId || 'N/A');
                setText('customerName', data.customerName || 'N/A');
                setText('invoiceDate', data.invoiceDate || 'N/A');
                setText('confNumber', data.confNumber || 'N/A');
                setText('totalPaid', adjustedPaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setText('balanceAmount', finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                // Displayed Total Amount should be the sum of item subtotals (subtotal), not net of fees/discounts
                setText('totalPayment', subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

                // Reservation Fee UI
                (function(){
                    const row = document.getElementById('reservationFeeRow');
                    const amt = document.getElementById('billingReservationFeeAmount');
                    if (row && amt) {
                        if (reservationFee > 0) {
                            row.style.display = 'block';
                            amt.textContent = reservationFee.toLocaleString('en-US', { minimumFractionDigits: 2 });
                            amt.style.textAlign = 'right';
                            amt.style.display = 'inline-block';
                            amt.style.width = 'auto';
                            amt.style.float = 'right';
                            amt.style.marginLeft = 'auto';
                        } else {
                            row.style.display = 'none';
                        }
                    }
                })();

                // Discount UI
                (function(){
                    const row = document.getElementById('discountRow');
                    const amt = document.getElementById('billingDiscountAmount');
                    if (row && amt) {
                        if (discountAmount > 0) {
                            row.style.display = 'block';
                            amt.textContent = discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
                            amt.style.textAlign = 'right';
                            amt.style.display = 'inline-block';
                            amt.style.width = 'auto';
                            amt.style.float = 'right';
                            amt.style.marginLeft = 'auto';
                        } else {
                            row.style.display = 'none';
                        }
                        // Update label text based on discountApplied flag
                        const labelEl = row.querySelector('.summary-label');
                        if (labelEl) {
                            const applied = (typeof data.discountApplied !== 'undefined' ? parseInt(data.discountApplied, 10) : 1);
                            labelEl.textContent = applied === 0 ? 'Discount:' : 'Discount Applied:';
                        }
                    }
                })();

                const allPaid = data.items.every(item => item.status === 'paid') && (finalBalance <= 0);
                const paidImageOverlay = document.getElementById('paidImageOverlay');
                const proceedBtn = document.getElementById('proceedToPaymentButton');
                if (allPaid) {
                    if (paidImageOverlay) {
                        paidImageOverlay.style.display = 'block';
                        paidImageOverlay.classList.add('show-paid-status');
                    }
                    if (proceedBtn) {
                        proceedBtn.disabled = true;
                        proceedBtn.textContent = 'Payment Completed';
                        proceedBtn.classList.remove('btn-payment');
                        proceedBtn.classList.add('btn-success');
                    }
                } else {
                    if (paidImageOverlay) {
                        paidImageOverlay.style.display = 'none';
                        paidImageOverlay.classList.remove('show-paid-status');
                    }
                    if (proceedBtn) {
                        proceedBtn.disabled = false;
                        proceedBtn.textContent = 'Proceed to Payment';
                        proceedBtn.classList.remove('btn-success');
                        proceedBtn.classList.add('btn-payment');
                    }
                }

                // Finally, show the modal
                if (typeof $ !== 'undefined' && $.fn.modal) {
                    $('#modal-billing').modal('show');
                } else if (window.bootstrap && bootstrap.Modal) {
                    new bootstrap.Modal(document.getElementById('modal-billing')).show();
                } else {
                    document.getElementById('modal-billing').style.display = 'block';
                }
            },
            error: function (err) {
                console.error('Failed to fetch billing data:', err);
                alert('Failed to fetch billing data. Please try again.');
            }
        });
    } catch (e) {
        console.error('showBilling error:', e);
    }
};