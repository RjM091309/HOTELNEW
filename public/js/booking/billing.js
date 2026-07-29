function formatBillingMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BILLING_PAYMENT_TYPE_LABELS = {
    room: 'Room Payment',
    extended: 'Extension',
    service: 'Service',
    pickdrop: 'Pick-up/Drop-off',
    reservation_fee: 'Reservation Fee',
    discount: 'Discount',
    refund: 'Refund',
    cancellation_fee: 'Cancellation Fee',
    security_deposit: 'Security Deposit',
    security_deposit_refund: 'Security Deposit Refund'
};

const BILLING_PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    credit_card: 'Credit Card',
    credit: 'Credit',
    marker: 'Credit',
    check: 'Check',
    bank_transfer: 'Bank Transfer'
};

function formatBillingPaymentType(type) {
    const key = (type || '').toLowerCase();
    return BILLING_PAYMENT_TYPE_LABELS[key] || (type || '-');
}

function formatBillingPaymentMethod(method) {
    const key = (method || '').toLowerCase();
    return BILLING_PAYMENT_METHOD_LABELS[key] || (method || '-');
}

function formatBillingPaymentDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderBillingPaymentBreakdown(paymentsArray) {
    const tbody = document.getElementById('billingPaymentBreakdownBody');
    const emptyEl = document.getElementById('billingPaymentBreakdownEmpty');
    const tableWrap = document.querySelector('.payment-breakdown-table-wrap');
    if (!tbody) return;

    tbody.innerHTML = '';

    const visiblePayments = (paymentsArray || [])
        .filter((payment) => payment.PAYMENT_TYPE !== 'discount' && payment.PAYMENT_TYPE !== 'security_deposit')
        .sort((a, b) => new Date(a.PAYMENT_DATE) - new Date(b.PAYMENT_DATE));

    if (!visiblePayments.length) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (tableWrap) tableWrap.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (tableWrap) tableWrap.style.display = '';

    visiblePayments.forEach((payment) => {
        const amount = parseFloat(payment.AMOUNT_PAID) || 0;
        const isRefund = payment.PAYMENT_TYPE === 'refund' || amount < 0;
        const typeLabel = formatBillingPaymentType(payment.PAYMENT_TYPE);
        const remarks = (payment.REMARKS || '').trim();
        const description = remarks ? `${typeLabel} — ${remarks}` : typeLabel;
        const methodLabel = formatBillingPaymentMethod(payment.PAYMENT_METHOD);
        const receivedBy = (payment.NAME || '').trim();
        const amountClass = isRefund ? 'payment-refund' : 'payment-received';
        const amountDisplay = isRefund
            ? `-${formatBillingMoney(Math.abs(amount))}`
            : formatBillingMoney(amount);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatBillingPaymentDate(payment.PAYMENT_DATE)}</td>
            <td>${description}${receivedBy ? `<br><span class="payment-received-by">Received by ${receivedBy}</span>` : ''}</td>
            <td>${methodLabel}</td>
            <td class="text-end ${amountClass}">${amountDisplay}</td>
        `;
        tbody.appendChild(row);
    });
}

function waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    if (!images.length) return Promise.resolve();

    return Promise.all(images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        });
    }));
}

function embedHotelLogo(selector) {
    const logoImg = document.querySelector(selector);
    if (!logoImg || logoImg.dataset.embedded === '1') return;

    const logoPath = logoImg.getAttribute('src') || '/img/Logo-Black.png';
    const absoluteUrl = new URL(logoPath, window.location.origin + '/').href;
    const preload = new Image();

    preload.onload = function () {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = preload.naturalWidth;
            canvas.height = preload.naturalHeight;
            canvas.getContext('2d').drawImage(preload, 0, 0);
            logoImg.src = canvas.toDataURL('image/png');
            logoImg.dataset.embedded = '1';
        } catch (err) {
            logoImg.src = absoluteUrl;
        }
    };

    preload.onerror = function () {
        logoImg.src = absoluteUrl;
    };

    preload.src = absoluteUrl;
}

function printDiv(divId) {
    const printRoot = document.getElementById(divId);
    if (!printRoot) return;

    const origin = window.location.origin;
    const clone = printRoot.cloneNode(true);

    clone.querySelectorAll('button, .btn-close, .billing-actions').forEach((el) => el.remove());

    const thankYouMessage = document.createElement('p');
    thankYouMessage.textContent = 'Thank you for choosing Main Stay Hotel. We look forward to welcoming you again!';
    thankYouMessage.style.cssText = 'text-align:center;font-size:16px;font-weight:bold;margin-top:20px;';
    clone.appendChild(thankYouMessage);

    clone.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
            img.src = new URL(src, origin + '/').href;
        }
    });

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        alert('Please allow pop-ups to print the receipt.');
        return;
    }

    const printStyles = `
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: black; }
        .modal-header, .billing-actions, .btn-close, .paid-image-overlay { display: none !important; }
        .row { display: flex; flex-wrap: wrap; gap: 16px; }
        .col-md-6 { flex: 1 1 45%; min-width: 280px; box-sizing: border-box; }
        .hotel-logo-container { text-align: left; margin-bottom: 8px; }
        .hotel-logo { max-width: 180px; max-height: 80px; width: auto; height: auto; object-fit: contain; display: block; margin: 0; }
        .billing-receipt-container { background: white; color: black; padding: 20px; }
        .billing-title { font-size: 22px; font-weight: bold; text-align: center; margin-bottom: 16px; }
        .billing-summary-section { margin: 20px 0; padding: 15px; border: 1px solid #333; }
        .payment-notes .note-item { margin-bottom: 10px; font-size: 14px; display: flex; align-items: center; gap: 8px; }
        .payment-summary { border: 2px solid #333; padding: 15px; background: #f8f8f8; }
        .payment-breakdown-block { margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #333; }
        .payment-breakdown-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; }
        .payment-breakdown-table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
        .payment-breakdown-table thead th { font-weight: bold; padding: 5px 6px; border-bottom: 1px solid #333; text-align: left; }
        .payment-breakdown-table thead th.text-end { text-align: right; }
        .payment-breakdown-table tbody td { padding: 5px 6px; vertical-align: top; border-bottom: 1px solid #ddd; word-wrap: break-word; }
        .payment-breakdown-table tbody tr:last-child td { border-bottom: none; }
        .payment-breakdown-table .text-end { text-align: right; white-space: nowrap; }
        .payment-received-by { display: block; font-size: 10px; color: #555; margin-top: 3px; }
        .payment-breakdown-empty { font-size: 12px; color: #666; font-style: italic; }
        .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px; line-height: 1.25; gap: 16px; }
        .summary-row.total-row { margin-top: 8px; padding: 10px 0 4px 0; font-weight: bold; }
        .summary-label { font-weight: 600; flex: 1 1 auto; }
        .summary-value { font-weight: bold; flex: 0 0 auto; text-align: right; min-width: 88px; padding-right: 2px; }
        img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .billing-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 20px 0; }
        .billing-table th, .billing-table td { padding: 10px 8px; border: 1px solid #333; box-sizing: border-box; vertical-align: middle; }
        .billing-table thead th.col-index, .billing-table tbody td.col-index,
        .billing-table thead th.col-date, .billing-table tbody td.col-date { text-align: center; }
        .billing-table thead th.col-desc, .billing-table tbody td.col-desc { text-align: left; }
        .billing-table thead th.col-money, .billing-table tbody td.col-money { text-align: right; font-variant-numeric: tabular-nums; padding-right: 14px; padding-left: 6px; }
        .billing-table .col-w-index { width: 6%; }
        .billing-table .col-w-date { width: 13%; }
        .billing-table .col-w-desc { width: 34%; }
        .billing-table .col-w-money { width: 15%; }
        .billing-total-row td { font-weight: bold; }
        .billing-total-row td.col-total-label { white-space: nowrap; }
        .billing-total-row td.col-total-amount { white-space: nowrap; padding-right: 16px !important; padding-left: 6px !important; }
        .billing-total-row td.col-total-label { padding-right: 8px !important; padding-left: 8px !important; }
        .hotel-info-section, .customer-info-section { margin-bottom: 16px; }
        .customer-name, .invoice-date { font-size: 14px; }
    `;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Billing Receipt</title>
            <base href="${origin}/">
            <style>${printStyles}</style>
        </head>
        <body>${clone.innerHTML}</body>
        </html>
    `);
    printWindow.document.close();

    waitForImages(printWindow.document.body).then(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    });
}

window.printDiv = printDiv;
window.embedHotelLogo = embedHotelLogo;

function initBillingScript() {
    const modalBilling = document.getElementById('modal-billing');
    if (modalBilling) {
        embedHotelLogo('#modal-billing .hotel-logo');

        modalBilling.addEventListener('shown.bs.modal', function () {
            embedHotelLogo('#modal-billing .hotel-logo');

            const invoiceBtn = document.getElementById('generateInvoiceBtn');
            if (invoiceBtn) {
                const newInvoiceBtn = invoiceBtn.cloneNode(true);
                invoiceBtn.parentNode.replaceChild(newInvoiceBtn, invoiceBtn);

                newInvoiceBtn.addEventListener('click', function () {
                    const bookingId = document.getElementById('hiddenBookingId').value;
                    if (!bookingId) {
                        alert('Missing Booking ID!');
                        return;
                    }
                    window.open(`/booking/generate-invoice/${bookingId}`, '_blank');
                });
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBillingScript);
} else {
    initBillingScript();
}

// Unified Billing Loader used across pages (overrides other definitions)
// This ensures the same content and calculations everywhere
window.showBilling = async function (bookingID) {
    try {
        const bookingInput = document.getElementById('hiddenBookingId');
        if (bookingInput) {
            bookingInput.value = bookingID;
            bookingInput.dataset.roomNumber = '';
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
                    let subtotalDisplay = formatBillingMoney(displaySubTotal);
                    
                    // Include all items in total (including cancellation fee / penalty items)
                    totalSubtotal += displaySubTotal;
                    
                    rowIndex++;
                    const row = `
                    <tr>
                    <td class="col-index ${paidTextClass}">${rowIndex}</td>
                    <td class="col-date ${paidTextClass}">${new Date(item.date).toLocaleDateString()}</td>
                    <td class="col-desc ${paidTextClass}">${item.description}</td>
                    <td class="col-money ${paidTextClass}">${isSpecialService ? '-' : formatBillingMoney(displayBasePrice)}</td>
                    <td class="col-money ${paidTextClass}">${displayQty}</td>
                    <td class="col-money ${paidTextClass}">${subtotalDisplay}</td>
                    </tr>`;
                    tbody.insertAdjacentHTML('beforeend', row);
                });
                
                // Add total row at the bottom
                const totalRow = `
                    <tr class="billing-total-row">
                        <td colspan="4" class="col-total-spacer"></td>
                        <td class="col-money col-total-label"><strong>Total:</strong></td>
                        <td class="col-money col-total-amount"><strong>${formatBillingMoney(totalSubtotal)}</strong></td>
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
                renderBillingPaymentBreakdown(paymentsArray);

                const totalPaymentsMade = paymentsArray.reduce((sum, payment) => {
                    // Exclude reservation_fee, discount, and security_deposit from paid amount
                    if (payment.PAYMENT_TYPE === 'reservation_fee' || payment.PAYMENT_TYPE === 'discount' || payment.PAYMENT_TYPE === 'security_deposit') {
                        return sum;
                    }

                    return sum + parseFloat(payment.AMOUNT_PAID);
                }, 0);

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

                if (bookingInput) {
                    bookingInput.dataset.roomNumber = data.roomNumber || '';
                }

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
                    paidAmountLabel.textContent = isCancelled ? 'Total Paid (After Cancellation):' : 'Total Paid:';
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

                embedHotelLogo('#modal-billing .hotel-logo');
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