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

function escapeBillingHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatBillingPaymentStatusLabel(isRefund, remarks) {
    const base = isRefund ? 'REFUND' : 'PAID';
    const remark = String(remarks || '').trim();
    if (!remark) return base;

    const normalizedRemark = remark.replace(/^paid\s+/i, '').trim();
    const suffix = (normalizedRemark || remark).toUpperCase();
    return `${base} - ${suffix}`;
}

function renderBillingPaymentBreakdown(paymentsArray) {
    const tbody = document.getElementById('billingPaymentBreakdownBody');
    const emptyEl = document.getElementById('billingPaymentBreakdownEmpty');
    const tableWrap = document.querySelector('.payment-breakdown-table-wrap');
    if (!tbody) return;

    tbody.innerHTML = '';

    const visiblePayments = (paymentsArray || [])
        .filter((payment) => payment.PAYMENT_TYPE !== 'discount' && payment.PAYMENT_TYPE !== 'security_deposit')
        .sort((a, b) => new Date(b.PAYMENT_DATE) - new Date(a.PAYMENT_DATE));

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
        const statusLabel = formatBillingPaymentStatusLabel(isRefund, payment.REMARKS);
        const methodLabel = formatBillingPaymentMethod(payment.PAYMENT_METHOD);
        const amountClass = isRefund ? 'payment-refund' : 'payment-received';
        const amountDisplay = isRefund
            ? `-${formatBillingMoney(Math.abs(amount))}`
            : formatBillingMoney(amount);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeBillingHtml(formatBillingPaymentDate(payment.PAYMENT_DATE))}</td>
            <td>${escapeBillingHtml(methodLabel)}</td>
            <td class="payment-status-cell">${escapeBillingHtml(statusLabel)}</td>
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

function getBillingPrintMaxHeightPx() {
    // A4 portrait with 3mm top/bottom @page margins → ~291mm printable height
    const printableHeightMm = 291;
    return printableHeightMm * (96 / 25.4);
}

function applyBillingPrintFitScale(printDocument) {
    const fitRoot = printDocument.querySelector('.billing-print-fit');
    const html = printDocument.documentElement;
    const body = printDocument.body;
    if (!fitRoot) return;

    const maxHeightPx = getBillingPrintMaxHeightPx();
    const minScale = 0.32;
    const maxScale = 1.15;

    function resetScale() {
        html.style.zoom = '1';
        body.style.zoom = '1';
        fitRoot.style.zoom = '1';
        fitRoot.style.transform = 'none';
        fitRoot.style.width = '100%';
        fitRoot.style.marginBottom = '0';
    }

    resetScale();

    const naturalHeight = fitRoot.scrollHeight;
    if (!naturalHeight) return;

    let scale = maxHeightPx / naturalHeight;
    scale = Math.min(maxScale, Math.max(minScale, scale));

    const probe = printDocument.createElement('div');
    probe.style.zoom = '0.5';
    const canUseZoom = probe.style.zoom === '0.5';

    if (canUseZoom) {
        for (let pass = 0; pass < 4; pass++) {
            html.style.zoom = String(scale);
            body.style.zoom = String(scale);

            const measured = html.scrollHeight;
            if (measured <= maxHeightPx + 2) break;

            scale = Math.max(minScale, scale * (maxHeightPx / measured));
        }

        // Belt-and-suspenders for Chrome print preview
        const dynamicPrintStyle = printDocument.getElementById('billingPrintZoomStyle');
        if (dynamicPrintStyle) {
            dynamicPrintStyle.textContent = `@media print { html, body { zoom: ${scale} !important; } }`;
        }
    } else {
        fitRoot.style.transform = `scale(${scale})`;
        fitRoot.style.transformOrigin = 'top left';
        fitRoot.style.width = `${100 / scale}%`;
        fitRoot.style.marginBottom = `${naturalHeight * (scale - 1)}px`;
    }

    html.style.margin = '0';
    html.style.padding = '0';
    body.style.margin = '0';
    body.style.padding = '0';

    const scaledHeight = Math.min(Math.ceil(html.scrollHeight), maxHeightPx);
    html.style.height = `${scaledHeight}px`;
    html.style.maxHeight = `${maxHeightPx}px`;
    html.style.overflow = 'hidden';
    body.style.height = `${scaledHeight}px`;
    body.style.maxHeight = `${maxHeightPx}px`;
    body.style.overflow = 'hidden';
}

function printDiv(divId) {
    const printRoot = document.getElementById(divId);
    if (!printRoot) return;

    const origin = window.location.origin;
    const clone = printRoot.cloneNode(true);

    clone.querySelectorAll('button, .btn-close, .billing-actions').forEach((el) => el.remove());

    clone.querySelectorAll('.payment-summary, .payment-breakdown-table-wrap').forEach((el) => {
        el.style.overflow = 'visible';
        el.style.maxHeight = 'none';
    });

    clone.querySelectorAll('.payment-received-by').forEach((el) => el.remove());

    ['reservationFeeRow', 'discountRow', 'refundAmountRow', 'totalPaidBeforeRefundRow'].forEach((id) => {
        const row = clone.querySelector(`#${id}`);
        if (!row) return;
        if (row.style.display === 'none') {
            row.remove();
            return;
        }
        const val = row.querySelector('.summary-value');
        const raw = (val?.textContent || '').trim();
        if (!raw || raw === '0.00' || raw === '0') row.remove();
    });

    const paymentCount = clone.querySelectorAll('#billingPaymentBreakdownBody tr').length;
    const itemCount = clone.querySelectorAll('.billing-table tbody tr').length;
    const rowCount = paymentCount + itemCount;
    let densityClass = '';
    if (rowCount > 14) densityClass = 'billing-print-dense';
    else if (rowCount > 10) densityClass = 'billing-print-compact';

    const thankYouMessage = document.createElement('p');
    thankYouMessage.className = 'billing-print-thank-you';
    thankYouMessage.textContent = 'Thank you for choosing Main Stay Hotel. We look forward to welcoming you again!';
    clone.appendChild(thankYouMessage);

    clone.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
            img.src = new URL(src, origin + '/').href;
        }
        if (img.classList.contains('hotel-logo')) {
            img.removeAttribute('style');
        }
    });

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        alert('Please allow pop-ups to print the receipt.');
        return;
    }

    const printStyles = `
        @page { size: A4 portrait; margin: 3mm; }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: white;
            color: black;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 10pt;
            line-height: 1.2;
        }
        .billing-print-fit {
            width: 100%;
            padding: 2mm 3mm;
        }
        .billing-print-compact {
            font-size: 9pt;
            line-height: 1.15;
        }
        .billing-print-compact .billing-table { font-size: 7.5pt; }
        .billing-print-compact .payment-breakdown-table { font-size: 7pt; }
        .billing-print-compact .summary-row { font-size: 8pt !important; }
        .billing-print-dense {
            font-size: 8pt;
            line-height: 1.1;
        }
        .billing-print-dense .billing-title { font-size: 13pt !important; }
        .billing-print-dense .billing-table { font-size: 6.5pt; margin: 3px 0 !important; }
        .billing-print-dense .billing-table th,
        .billing-print-dense .billing-table td { padding: 2px 3px !important; }
        .billing-print-dense .payment-breakdown-table { font-size: 6.5pt; }
        .billing-print-dense .payment-breakdown-table tbody td { padding: 1px 2px !important; }
        .billing-print-dense .payment-summary { padding: 4px 6px !important; }
        .billing-print-dense .summary-row { font-size: 7.5pt !important; padding: 1px 0 !important; }
        .billing-print-dense .billing-print-thank-you { font-size: 7.5pt !important; margin-top: 3px !important; }
        .modal-header, .billing-actions, .btn-close, .paid-image-overlay { display: none !important; }
        .billing-header {
            border-bottom: 1px solid #333;
            margin-bottom: 4px !important;
            padding-bottom: 3px !important;
            text-align: center;
        }
        .billing-divider { display: none !important; }
        .billing-title {
            font-size: 16pt !important;
            font-weight: bold;
            text-align: center;
            margin: 0 0 4px 0 !important;
        }
        .billing-title i { font-size: 14pt !important; margin-right: 6px !important; }
        .receipt-number { font-size: 13pt !important; margin-left: 8px !important; }
        .row { display: flex; flex-wrap: nowrap; gap: 8px; margin: 0 !important; }
        .col-md-6 { flex: 1 1 48%; min-width: 0; box-sizing: border-box; padding: 0 !important; }
        .col-md-12, .white-box, .modal-body { padding: 0 !important; margin: 0 !important; }
        .hotel-logo-container { text-align: left; margin-bottom: 3px !important; }
        .hotel-logo {
            max-width: 140px !important;
            max-height: 52px !important;
            width: auto !important;
            height: auto !important;
            object-fit: contain;
            display: block;
            margin: 0;
        }
        .hotel-info-section, .customer-info-section {
            padding: 5px 7px !important;
            margin-bottom: 4px !important;
            border: 1px solid #333;
            min-height: unset !important;
        }
        .hotel-address p, .customer-details p, .invoice-date p, .invoice-date .date-value, .customer-header h4 {
            font-size: 8.5pt !important;
            margin: 1px 0 !important;
            line-height: 1.2 !important;
        }
        .customer-header h4 { margin: 0 0 3px 0 !important; display: flex !important; flex-wrap: wrap !important; align-items: baseline !important; gap: 4px !important; }
        .customer-header .customer-name { font-size: 9.5pt !important; font-weight: bold; margin: 0 !important; padding: 2px 6px !important; }
        .bill-to-room { font-size: 9.5pt !important; font-weight: bold; margin: 0 !important; }
        .billing-receipt-container { background: white; color: black; padding: 0 !important; }
        .billing-content { margin-bottom: 4px !important; }
        .billing-table-section { margin: 3px 0 !important; }
        .billing-summary-section { margin: 4px 0 !important; padding: 0 !important; border: none !important; }
        .payment-notes .note-item {
            margin-bottom: 3px !important;
            font-size: 9pt !important;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .payment-notes .note-item span { font-size: 9pt !important; }
        .payment-notes .note-item i { font-size: 8.5pt !important; }
        .payment-summary {
            border: 1px solid #333;
            padding: 7px 9px !important;
            background: #f8f8f8;
            overflow: visible !important;
            min-height: unset !important;
        }
        .payment-breakdown-table-wrap {
            overflow: visible !important;
            max-height: none !important;
        }
        .payment-breakdown-block {
            margin-bottom: 4px !important;
            padding-bottom: 3px !important;
            border-bottom: 1px solid #333;
        }
        .payment-breakdown-title { font-weight: bold; font-size: 9pt !important; margin-bottom: 3px !important; }
        .payment-breakdown-table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
        .payment-breakdown-table thead th {
            font-weight: bold;
            padding: 2px 3px !important;
            border-bottom: 1px solid #333;
            text-align: left;
        }
        .payment-breakdown-table thead th.text-end { text-align: right; }
        .payment-breakdown-table tbody td {
            padding: 2px 3px !important;
            vertical-align: top;
            border-bottom: 1px solid #ddd;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            line-height: 1.1 !important;
        }
        .payment-breakdown-table tbody tr:last-child td { border-bottom: none; }
        .payment-breakdown-table .text-end { text-align: right; white-space: nowrap; }
        .payment-received-by { display: block; font-size: 7pt !important; color: #555; margin-top: 1px !important; }
        .payment-breakdown-empty { font-size: 8.5pt !important; color: #666; font-style: italic; }
        .summary-row {
            display: flex !important;
            justify-content: space-between;
            align-items: center;
            padding: 3px 0 !important;
            font-size: 9pt !important;
            line-height: 1.2 !important;
            gap: 8px;
            visibility: visible !important;
            opacity: 1 !important;
        }
        .summary-row.total-row {
            margin-top: 5px !important;
            padding: 5px 0 3px 0 !important;
            font-weight: bold;
            font-size: 10pt !important;
            border-top: 1px solid #333;
        }
        #paidAmountRow,
        #totalPayment,
        #balanceAmount,
        .summary-value.total-amount,
        .summary-value.paid-amount,
        .summary-value.balance-amount {
            visibility: visible !important;
            opacity: 1 !important;
        }
        .summary-label { font-weight: 600; flex: 1 1 auto; }
        .summary-value {
            font-weight: bold;
            flex: 0 0 auto;
            text-align: right;
            min-width: 72px;
            padding-right: 2px;
        }
        .billing-print-thank-you {
            text-align: center;
            font-size: 9pt !important;
            font-weight: bold;
            margin: 6px 0 0 0 !important;
            line-height: 1.25;
        }
        img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .billing-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            margin: 6px 0 !important;
            font-size: 8.5pt;
        }
        .billing-table th, .billing-table td {
            padding: 4px 5px !important;
            border: 1px solid #333;
            vertical-align: middle;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
        }
        .billing-table thead th.col-index, .billing-table tbody td.col-index,
        .billing-table thead th.col-date, .billing-table tbody td.col-date { text-align: center; }
        .billing-table thead th.col-desc, .billing-table tbody td.col-desc { text-align: left; }
        .billing-table thead th.col-money, .billing-table tbody td.col-money {
            text-align: right;
            font-variant-numeric: tabular-nums;
            padding-right: 6px !important;
            padding-left: 4px !important;
        }
        .billing-table .col-w-index { width: 5%; }
        .billing-table .col-w-date { width: 12%; }
        .billing-table .col-w-desc { width: 33%; }
        .billing-table .col-w-money { width: 14%; }
        .billing-total-row td { font-weight: bold; }
        .billing-total-row td.col-total-label { white-space: nowrap; }
        .billing-total-row td.col-total-amount {
            white-space: nowrap;
            padding-right: 8px !important;
            padding-left: 4px !important;
        }
        .billing-total-row td.col-total-label {
            padding-right: 6px !important;
            padding-left: 6px !important;
        }
        @media print {
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                max-height: 291mm !important;
                overflow: hidden !important;
            }
            .billing-print-fit {
                overflow: visible !important;
            }
            .payment-summary,
            .payment-breakdown-table-wrap {
                overflow: visible !important;
                max-height: none !important;
            }
            .summary-row {
                display: flex !important;
                break-inside: auto !important;
                page-break-inside: auto !important;
            }
        }
    `;

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Billing Receipt</title>
            <base href="${origin}/">
            <style>${printStyles}</style>
            <style id="billingPrintZoomStyle"></style>
        </head>
        <body><div class="billing-print-fit ${densityClass}">${clone.innerHTML}</div></body>
        </html>
    `);
    printWindow.document.close();

    waitForImages(printWindow.document.body).then(() => {
        requestAnimationFrame(() => {
            applyBillingPrintFitScale(printWindow.document);
            requestAnimationFrame(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            });
        });
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
                    const isLateCheckout = item.serviceId === 72 ||
                                           item.SERVICE_ID === 72 ||
                                           serviceName.includes('late check');
                    
                    let paidTextClass = '';
                    if (isPaid) {
                        paidTextClass = 'text-success';
                    } else if (isPartial) {
                        paidTextClass = 'text-warning';
                    }
                    
                    let displaySubTotal = parseFloat(item.subTotal) || 0;
                    // For special services (Upgrade, Pick-up, Drop-off), display "-" instead of basePrice
                    let displayBasePrice = isSpecialService ? '-' : (parseFloat(item.basePrice) || 0);
                    // For special services (Upgrade, Pick-up, Drop-off), display "-" instead of qty
                    let displayQty = isSpecialService ? '-' : (item.qty || '-');

                    if (isLateCheckout) {
                        const feeAmount = Math.max(
                            parseFloat(item.subTotal) || 0,
                            parseFloat(item.basePrice) || 0
                        );
                        displaySubTotal = feeAmount;
                        displayBasePrice = feeAmount;
                        displayQty = '-';
                    }
                    
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
                    const basePriceCell = (isSpecialService && !isLateCheckout)
                        ? '-'
                        : formatBillingMoney(displayBasePrice);
                    const row = `
                    <tr>
                    <td class="col-index ${paidTextClass}">${rowIndex}</td>
                    <td class="col-date ${paidTextClass}">${new Date(item.date).toLocaleDateString()}</td>
                    <td class="col-desc ${paidTextClass}">${item.description}</td>
                    <td class="col-money ${paidTextClass}">${basePriceCell}</td>
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

                setText('billingRoomNumber', data.roomNumber || 'N/A');
                setText('customerName', data.customerName || 'N/A');
                setText('billingReceiptRoomNo', data.roomNumber ? `Room ${data.roomNumber}` : '');
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

function ensureActionPopupHelpers() {
    if (typeof window.closeAllActionPopups === 'function') return;

    window.closeAllActionPopups = function () {
        document.querySelectorAll('.voucher-action-menu').forEach(function (menu) {
            menu.classList.remove('show');
            menu.style.display = 'none';
            menu.hidden = true;
        });
    };

    window.toggleActionPopup = function (menuId, event) {
        if (event) event.stopPropagation();
        const menu = document.getElementById(menuId);
        if (!menu) return;

        const willShow = !menu.classList.contains('show');
        window.closeAllActionPopups();
        if (willShow) {
            menu.classList.add('show');
            menu.style.display = 'flex';
            menu.hidden = false;
        }
    };

    if (!window._actionPopupListenerAttached) {
        window._actionPopupListenerAttached = true;
        document.addEventListener('click', window.closeAllActionPopups);
    }
}

function printBillingReceipt() {
    if (typeof window.closeAllActionPopups === 'function') {
        window.closeAllActionPopups();
    }
    printDiv('printableArea');
}

async function sendBillingReceipt() {
    if (typeof window.closeAllActionPopups === 'function') {
        window.closeAllActionPopups();
    }

    const bookingInput = document.getElementById('hiddenBookingId');
    const bookingId = bookingInput ? bookingInput.value : '';
    let contact = '';

    if (bookingId) {
        const guestContactEl = document.getElementById('guest-contact-' + bookingId);
        if (guestContactEl) {
            contact = guestContactEl.textContent.trim();
        } else {
            try {
                const res = await fetch('/booking/booking_details/' + bookingId);
                if (res.ok) {
                    const data = await res.json();
                    contact = data.CONTACTNo || data.contactNumber || '';
                }
            } catch (error) {
                console.error('Failed to load contact for receipt send:', error);
            }
        }
    }

    if (typeof window.confirmSendDocument === 'function') {
        window.confirmSendDocument('Receipt', contact);
        return;
    }

    if (typeof Swal !== 'undefined') {
        Swal.fire('Send Receipt', contact ? 'Send receipt to ' + contact + '?' : 'No contact on file.', 'info');
    }
}

ensureActionPopupHelpers();
window.printBillingReceipt = printBillingReceipt;
window.sendBillingReceipt = sendBillingReceipt;