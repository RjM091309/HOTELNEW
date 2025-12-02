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
                
                // Get cancellation status early (needed in forEach loop)
                const isCancelled = !!data.isCancelled;
                // Get discount amount early (needed in forEach loop)
                const discountAmount = parseFloat(data.discountAmount) || 0;
                
                tbody.innerHTML = '';
                let rowIndex = 0;
                let discountAppliedToRoom = false; // Track if discount has been applied to a room item
                let totalSubtotal = 0; // Track total of all subtotals
                
                data.items.forEach((item, index) => {
                    const isPaid = item.status === 'paid';
                    const isPartial = item.status === 'partial';
                    const isPenalty = item.status === 'penalty';
                    const isRoom = (item.description || '').toLowerCase().includes('bedroom') || 
                                   (item.description || '').toLowerCase().includes('room') ||
                                   (item.description || '').toLowerCase().includes('room charge');
                    
                    // Check if service is Upgrade, Pick-up, or Drop-off (by description or serviceId)
                    const serviceName = (item.description || '').toLowerCase();
                    const isSpecialService = serviceName === 'upgrade' || 
                                            serviceName === 'pick-up' || 
                                            serviceName === 'drop-off' ||
                                            item.serviceId === 71 ||
                                            item.SERVICE_ID === 71;
                    
                    let paidTextClass = '';
                    if (isPaid) {
                        paidTextClass = 'text-success';
                    } else if (isPartial) {
                        paidTextClass = 'text-warning';
                    }
                    
                    let displaySubTotal = parseFloat(item.subTotal) || 0;
                    // For special services (Upgrade, Pick-up, Drop-off), display "-" instead of basePrice
                    const displayBasePrice = isSpecialService ? '-' : (parseFloat(item.basePrice) || 0);
                    // For special services (Upgrade, Pick-up, Drop-off), display "-" instead of qty
                    const displayQty = isSpecialService ? '-' : (item.qty || '-');
                    
                    // Apply discount to room subtotal if discount exists and hasn't been applied yet
                    if (isRoom && !isPenalty && discountAmount > 0 && !discountAppliedToRoom) {
                        displaySubTotal = Math.max(0, displaySubTotal);
                        discountAppliedToRoom = true; // Mark that discount has been applied
                    }
                    
                    // Check if item is a service or extension (not room, not penalty)
                    const isService = !isRoom && !isPenalty;
                    
                    // Subtotal display (always show numeric value even if cancelled)
                    let subtotalDisplay = displaySubTotal.toFixed(2);
                    
                    // Include all items in total (including cancellation fee / penalty items)
                    totalSubtotal += displaySubTotal;
                    
                    rowIndex++;
                    const row = `
                    <tr>
                    <td class="text-center ${paidTextClass}">${rowIndex}</td>
                    <td class="text-center ${paidTextClass}">${new Date(item.date).toLocaleDateString()}</td>
                    <td class="text-center ${paidTextClass}">${item.description}</td>
                    <td class="text-center ${paidTextClass}">${isSpecialService ? '-' : displayBasePrice.toFixed(2)}</td>
                    <td class="text-center ${paidTextClass}">${displayQty}</td>
                    <td class="text-right ${paidTextClass}">${subtotalDisplay}</td>
                    </tr>`;
                    tbody.insertAdjacentHTML('beforeend', row);
                });
                
                // Add total row at the bottom
                const totalRow = `
                    <tr style="background-color: #f8f9fa; font-weight: bold;">
                        <td colspan="4"></td>
                        <td class="text-right" style="padding: 12px; white-space: nowrap;"><strong>Total:</strong></td>
                        <td class="text-right" style="padding: 12px;"><strong>${totalSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>`;
                tbody.insertAdjacentHTML('beforeend', totalRow);

                const rawSubTotal = parseFloat(data.subTotal) || 0;
                const effectiveSubTotal = Number.isFinite(parseFloat(data.effectiveSubTotal))
                    ? parseFloat(data.effectiveSubTotal)
                    : rawSubTotal;
                const subTotal = rawSubTotal;
                const reservationFee = parseFloat(data.reservationFee) || 0;
                // discountAmount already parsed above (before forEach loop)
                const discountApplied = parseInt(data.discountApplied) || 0; // Default to 0 (not applied)
                const penaltyAmountValue = Number.isFinite(parseFloat(data.penaltyAmount)) ? parseFloat(data.penaltyAmount) : 0;

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
                const grossTotal = effectiveSubTotal;
                
                // Calculate net balance (after reservation fee and discount)
                const netBalance = grossTotal - reservationFee - discountAmount;
                
                // Calculate remaining balance after payments
                let balanceToShow = Math.max(0, netBalance - totalPaymentsMade);

                const setText = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = value;
                };

                setText('billingReceiptId', data.bookingId || 'N/A');
                setText('customerName', data.customerName || 'N/A');
                setText('invoiceDate', data.invoiceDate || 'N/A');
                setText('confNumber', data.confNumber || 'N/A');

                // Get refund information from billing data
                const refundAmount = Number.isFinite(parseFloat(data.refundAmount)) ? parseFloat(data.refundAmount) : 0;
                const totalPaidBeforeRefund = Number.isFinite(parseFloat(data.totalPaidBeforeRefund)) ? parseFloat(data.totalPaidBeforeRefund) : 0;
                const paidAmountAfterRefund = Number.isFinite(parseFloat(data.paidAmountAfterRefund)) ? parseFloat(data.paidAmountAfterRefund) : null;
                
                // Display refund information if booking is cancelled or refund exists
                const refundAmountRow = document.getElementById('refundAmountRow');
                const totalPaidBeforeRefundRow = document.getElementById('totalPaidBeforeRefundRow');
                const refundAmountElement = document.getElementById('refundAmount');
                const totalPaidBeforeRefundElement = document.getElementById('totalPaidBeforeRefund');
                const shouldShowRefundInfo = isCancelled || refundAmount > 0;
                
                if (refundAmountRow) {
                    refundAmountRow.style.display = shouldShowRefundInfo ? 'flex' : 'none';
                }
                if (totalPaidBeforeRefundRow) {
                    totalPaidBeforeRefundRow.style.display = shouldShowRefundInfo ? 'flex' : 'none';
                }
                if (shouldShowRefundInfo) {
                    if (refundAmountElement) {
                        refundAmountElement.textContent = refundAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                    if (totalPaidBeforeRefundElement) {
                        totalPaidBeforeRefundElement.textContent = totalPaidBeforeRefund.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    }
                }
                
                // Determine paid amount display values
                let paidAmountToShow = totalPaymentsMade;
                if (isCancelled) {
                    // For cancelled bookings, show the cancellation fee as paid amount
                    // If there's a refund, show the net amount after refund
                    if (refundAmount > 0) {
                        paidAmountToShow = Number.isFinite(paidAmountAfterRefund)
                            ? paidAmountAfterRefund
                            : Math.max(0, totalPaidBeforeRefund - refundAmount);
                    } else {
                        // No refund: show cancellation fee amount
                        // This represents what was paid or needs to be paid for cancellation
                        paidAmountToShow = penaltyAmountValue;
                    }
                    balanceToShow = 0;
                }
                
                const paidAmountLabel = document.getElementById('paidAmountLabel');
                if (paidAmountLabel) {
                    paidAmountLabel.textContent = isCancelled ? 'Paid Amount (After Cancellation):' : 'Paid Amount:';
                }
                
                // Display Paid Amount & Balance
                setText('totalPaid', paidAmountToShow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setText('balanceAmount', balanceToShow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                // Total Amount handling
                let totalAmount = grossTotal - reservationFee - discountAmount;
                if (isCancelled) {
                    // For cancelled bookings, total amount is just the cancellation fee
                    totalAmount = penaltyAmountValue;
                }
                setText('totalPayment', totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

                // Calculate Total Room Charges, Total Services, and Total Penalty
                let totalRoomCharges = 0;
                let totalServices = 0;
                let totalPenalty = 0;
                
                data.items.forEach(item => {
                    const amount = parseFloat(item.subTotal) || 0;
                    const description = (item.description || '').toLowerCase();
                    const isPenalty = item.status === 'penalty';
                    const isRoom = description.includes('room') || description.includes('bedroom') || description.includes('room charge');
                    
                    // Check if it's a penalty or cancellation fee
                    if (description.includes('penalty') || description.includes('cancellation fee') || isPenalty) {
                        totalPenalty += amount;
                    } else if (isRoom) {
                        totalRoomCharges += amount;
                    } else {
                        // Everything else is considered a service
                        totalServices += amount;
                    }
                });
                
                // If booking is cancelled, summary totals for rooms and services should be shown as 0.00
                if (isCancelled) {
                    totalRoomCharges = 0;
                    totalServices = 0;
                }
                
                // Apply discount to Total Room Charges (same as in table display)
                if (discountAmount > 0 && totalRoomCharges > 0) {
                    totalRoomCharges = Math.max(0, totalRoomCharges - discountAmount);
                }
                
                // Update Total Room Charges and Total Services
                setText('totalRoomCharges', totalRoomCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                setText('totalServices', totalServices.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                
                // Update Total Penalty (show/hide based on amount)
                const penaltyRow = document.getElementById('totalPenaltyRow');
                const penaltyElement = document.getElementById('totalPenalty');
                if (penaltyRow && penaltyElement) {
                    if (totalPenalty > 0) {
                        penaltyRow.style.display = 'flex';
                        penaltyElement.textContent = totalPenalty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    } else {
                        penaltyRow.style.display = 'none';
                    }
                }

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
                        // Update label text - always show "Discount:"
                        const labelEl = row.querySelector('.summary-label');
                        if (labelEl) {
                            labelEl.textContent = 'Discount:';
                        }
                    }
                })();

                // Check if fully paid: balance should be 0 or less
                // Penalty items can have status 'penalty' or 'paid', so we check balance instead of all items being 'paid'
                const allPaid = balanceToShow <= 0 && paidAmountToShow > 0;
                const paidImageOverlay = document.getElementById('paidImageOverlay');
                const proceedBtn = document.getElementById('proceedToPaymentButton');
                if (isCancelled) {
                    if (paidImageOverlay) {
                        paidImageOverlay.style.display = 'none';
                        paidImageOverlay.classList.remove('show-paid-status');
                    }
                    if (proceedBtn) {
                        proceedBtn.disabled = true;
                        proceedBtn.textContent = 'Booking Cancelled';
                        proceedBtn.classList.remove('btn-payment');
                        proceedBtn.classList.add('btn-secondary');
                    }
                } else if (allPaid) {
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