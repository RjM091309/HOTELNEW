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

// Note: The proceedToPaymentButton event handler is now handled in billing.ejs
// This ensures proper Payment Summary Card updates

// Initialize invoice button event listener when modal is shown
document.addEventListener('DOMContentLoaded', function() {
    // Use event delegation or attach listener when modal is shown
    const modalBilling = document.getElementById('modal-billing');
    if (modalBilling) {
        // Attach listener when modal is shown
        modalBilling.addEventListener('shown.bs.modal', function() {
            const invoiceBtn = document.getElementById('generateInvoiceBtn');
            if (invoiceBtn) {
                // Remove any existing event listeners by cloning
                const newInvoiceBtn = invoiceBtn.cloneNode(true);
                invoiceBtn.parentNode.replaceChild(newInvoiceBtn, invoiceBtn);
                
                // Attach event listener to the new button
                newInvoiceBtn.addEventListener('click', function() {
                    const bookingId = document.getElementById('hiddenBookingId').value;

                    if (!bookingId) {
                        alert("Missing Booking ID!");
                        return;
                    }

                    const url = `/booking/generate-invoice/${bookingId}`;
                    window.open(url, '_blank');
                });
            }
        });
    }
}); 

// Unified Billing Loader used across pages (overrides other definitions)
// This ensures the same content and calculations everywhere
window.showBilling = async function (bookingID) {
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
            success: async function (data) {
                const tbody = document.querySelector('#modal-billing table tbody');
                if (!tbody) {
                    console.error('Billing table body not found');
                    return;
                }
                tbody.innerHTML = '';
                data.items.forEach((item, index) => {
                    const isPaid = item.status === 'paid';
                    const isPartial = item.status === 'partial';
                    let paidTextClass = '';
                    if (isPaid) {
                        paidTextClass = 'text-success';
                    } else if (isPartial) {
                        paidTextClass = 'text-warning';
                    }
                    
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
                const discountApplied = parseInt(data.discountApplied) || 0; // Default to 0 (not applied)

                // Calculate actual balance considering partial payments
                // Get total payments made from payments table
                const paymentsResponse = await fetch(`/payments/get-payments/${bookingID}?_=${Date.now()}`);
                const paymentsData = await paymentsResponse.json();
                
                // Extract payments array from response - handle both array and object responses
                const paymentsArray = (paymentsData && paymentsData.data) ? paymentsData.data : (Array.isArray(paymentsData) ? paymentsData : []);
                
                const totalPaymentsMade = paymentsArray.reduce((sum, payment) => {
                    console.log('Payment Record:', {
                        IDNo: payment.IDNo,
                        AMOUNT_PAID: payment.AMOUNT_PAID,
                        PAYMENT_TYPE: payment.PAYMENT_TYPE,
                        PAYMENT_DATE: payment.PAYMENT_DATE
                    });
                    
                    // Exclude reservation_fee and discount payments from paid amount
                    if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount') {
                        console.log('Excluding payment type:', payment.PAYMENT_TYPE);
                        return sum;
                    }
                    
                    return sum + parseFloat(payment.AMOUNT_PAID);
                }, 0);
                
                console.log('Total Payments Made:', totalPaymentsMade);

                // Calculate gross total (before reservation fee and discount)
                const grossTotal = subTotal;
                
                // Calculate net balance (after reservation fee and discount)
                const netBalance = grossTotal - reservationFee - discountAmount;
                
                // Calculate remaining balance after payments
                const remainingBalance = Math.max(0, netBalance - totalPaymentsMade);

                // Debug logging
                console.log('Billing Debug:', {
                    subTotal,
                    grossTotal,
                    reservationFee,
                    discountAmount,
                    netBalance,
                    totalPaymentsMade,
                    remainingBalance,
                    paymentsData
                });

                const balanceToShow = remainingBalance;

                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value;
                };

                setText('billingReceiptId', data.bookingId || 'N/A');
                setText('customerName', data.customerName || 'N/A');
                setText('invoiceDate', data.invoiceDate || 'N/A');
                setText('confNumber', data.confNumber || 'N/A');

                // Display Paid Amount - show actual payments made
                setText('totalPaid', totalPaymentsMade.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setText('balanceAmount', balanceToShow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                // GRAND TOTAL should be the subtotal (before discount)
                setText('totalPayment', subTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

                // Calculate Total Room Charges and Total Services
                let totalRoomCharges = 0;
                let totalServices = 0;
                
                data.items.forEach(item => {
                    const amount = parseFloat(item.subTotal) || 0;
                    const description = (item.description || '').toLowerCase();
                    
                    // Check if it's a room charge
                    if (description.includes('room') || description.includes('bedroom') || description.includes('room charge')) {
                        totalRoomCharges += amount;
                    } else {
                        // Everything else is considered a service
                        totalServices += amount;
                    }
                });
                
                // Update Total Room Charges and Total Services
                setText('totalRoomCharges', totalRoomCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setText('totalServices', totalServices.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

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

                const allPaid = data.items.every(item => item.status === 'paid') && (balanceToShow <= 0);
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