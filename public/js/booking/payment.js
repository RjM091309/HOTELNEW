$(document).ready(function () {
    // Initialize enhanced payment modal functionality
    initializePaymentModal();
    
    // Legacy support for old dropdown-based payment method selection
    $('#paymentMethod').on('change', function () {
        const selectedMethod = $(this).val();
        const paymentDetails = $('#paymentDetails');

        paymentDetails.empty(); // Clear previous payment details

        if (selectedMethod === 'credit_card') {
            paymentDetails.html(`
                <div class="mb-3">
                    <label for="cardNumber" class="form-label">Card Number</label>
                    <input type="text" class="form-control" id="cardNumber" placeholder="1234 5678 9012 3456" required>
                </div>
                <div class="mb-3">
                    <label for="cardExpiry" class="form-label">Expiry Date</label>
                    <input type="text" class="form-control" id="cardExpiry" placeholder="MM/YY" required>
                </div>
                <div class="mb-3">
                    <label for="cardCVV" class="form-label">CVV</label>
                    <input type="text" class="form-control" id="cardCVV" placeholder="123" required>
                </div>
            `);
        } else if (selectedMethod === 'paypal') {
            paymentDetails.html(`
                <div class="mb-3">
                    <label for="paypalEmail" class="form-label">PayPal Email</label>
                    <input type="email" class="form-control" id="paypalEmail" placeholder="example@paypal.com" required>
                </div>
            `);
        } else if (selectedMethod === 'cash') {
            paymentDetails.html(`
                <p class="text-success">Cash payment selected.</p>
            `);
        }
    });
});

// Enhanced Payment Modal JavaScript
function initializePaymentModal() {
    // Payment method selection
    const paymentOptions = document.querySelectorAll('.payment-option');
    const paymentDetailsSection = document.getElementById('paymentDetails');
    const paymentAmountInput = document.getElementById('paymentAmountInput');
    const totalAmountDisplay = document.getElementById('paymentTotalAmount');
    const remainingBalanceDisplay = document.getElementById('remainingBalance');
    const balanceRow = document.getElementById('balanceRow');
    const confirmButton = document.getElementById('confirmPaymentButton');
    const paymentForm = document.getElementById('paymentForm');


    if (!paymentOptions.length) return; // Exit if enhanced modal not present

    // Payment method selection handler
    paymentOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all options
            paymentOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            this.classList.add('selected');
            
            // Check the radio button
            const radio = this.querySelector('input[type="radio"]');
            radio.checked = true;
            
            // Show payment method specific details
            showPaymentMethodDetails(radio.value);
            
            // Update form validation
            validatePaymentForm();

            // Sync hidden input expected by existing handler
            const hiddenMethodInput = document.getElementById('paymentMethod');
            if (hiddenMethodInput) hiddenMethodInput.value = radio.value;
        });
    });

    // Payment amount input handler
    if (paymentAmountInput) {
        paymentAmountInput.addEventListener('input', function() {
            const amount = parseFloat(this.value) || 0;
            const totalAmount = parseFloat(totalAmountDisplay.textContent.replace(/,/g, '')) || 0;

            // Validate: Amount cannot exceed total amount to pay (compare in whole
            // cents so pre-filled values with float rounding noise, e.g. 1234.9999999999998,
            // don't get flagged as "exceeding" a total displayed as 1235.00)
            if (Math.round(amount * 100) > Math.round(totalAmount * 100)) {
                // Reset to total amount if exceeded
                this.value = totalAmount;
                const adjustedAmount = totalAmount;
                
                // Show error message
                showPaymentStatus('error', `Amount cannot exceed ₱${totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
                
                // Update hidden field with adjusted amount
                const hiddenPaymentAmount = document.getElementById('paymentAmount');
                if (hiddenPaymentAmount) {
                    hiddenPaymentAmount.value = adjustedAmount;
                }
                
                // Hide balance row since amount equals total
                if (balanceRow) {
                    balanceRow.style.display = 'none';
                }
                
                // Validate form
                validatePaymentForm();
                return;
            }
            
            // Clear any previous error messages
            const statusContainer = document.getElementById('paymentStatusMessages');
            if (statusContainer) {
                statusContainer.innerHTML = '';
                statusContainer.style.display = 'none';
            }
            
            // Show/hide balance row
            if (amount < totalAmount) {
                const remaining = totalAmount - amount;
                if (remainingBalanceDisplay) {
                    remainingBalanceDisplay.textContent = remaining.toLocaleString('en-US', {minimumFractionDigits: 2});
                }
                if (balanceRow) {
                    balanceRow.style.display = 'flex';
                }
            } else {
                if (balanceRow) {
                    balanceRow.style.display = 'none';
                }
            }
            
            // Update hidden field
            const hiddenPaymentAmount = document.getElementById('paymentAmount');
            if (hiddenPaymentAmount) {
                hiddenPaymentAmount.value = amount;
            }
            
            // Validate form
            validatePaymentForm();
        });
    }

    // Form validation
    function validatePaymentForm() {
        const amount = parseFloat(paymentAmountInput.value) || 0;
        const totalAmount = parseFloat(totalAmountDisplay.textContent.replace(/,/g, '')) || 0;
        const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked');
        const paymentModalEl = document.getElementById('modal-payment');
        const skipPaymentStep = paymentModalEl && paymentModalEl.dataset.skipPaymentStep === 'true';
        const depositCheckout = window.PaymentDepositSection && window.PaymentDepositSection.isVisible();

        if (depositCheckout && skipPaymentStep && amount <= 0 && totalAmount <= 0) {
            confirmButton.disabled = false;
            confirmButton.classList.remove('btn-secondary');
            confirmButton.classList.add('btn-success');
            return;
        }

        // Check if amount exceeds total amount to pay (compare in whole cents - see
        // note in the input handler above; a strict float compare here silently
        // disabled the Confirm button for pre-filled amounts with rounding noise)
        if (Math.round(amount * 100) > Math.round(totalAmount * 100)) {
            confirmButton.disabled = true;
            confirmButton.classList.remove('btn-success');
            confirmButton.classList.add('btn-secondary');
            return;
        }
        
        // Credit payments require the name of whoever authorized them
        if (selectedMethod && selectedMethod.value === 'credit') {
            const approvedBy = document.getElementById('creditApprovedBy');
            if (!approvedBy || !approvedBy.value.trim()) {
                confirmButton.disabled = true;
                confirmButton.classList.remove('btn-success');
                confirmButton.classList.add('btn-secondary');
                return;
            }
        }

        if (amount > 0 && selectedMethod) {
            confirmButton.disabled = false;
            confirmButton.classList.remove('btn-secondary');
            confirmButton.classList.add('btn-success');
        } else {
            confirmButton.disabled = true;
            confirmButton.classList.remove('btn-success');
            confirmButton.classList.add('btn-secondary');
        }
    }

    // Show payment method specific details
    function showPaymentMethodDetails(method) {
        let detailsHTML = '';
        
        switch(method) {
            case 'cash':
                detailsHTML = `
                    <div class="payment-method-info">
                        <h6><i class="fa fa-money"></i> Cash Payment</h6>
                        <p class="text-muted">Please collect the cash amount and update the payment status.</p>
                        <div class="alert alert-info">
                            <i class="fa fa-info-circle"></i>
                            <strong>Note:</strong> Ensure you have sufficient cash available before confirming.
                        </div>
                    </div>
                `;
                break;
                
            case 'credit_card':
                detailsHTML = `
                    <div class="payment-method-info">
                        <h6><i class="fa fa-credit-card"></i> Credit Card Payment</h6>
                        <div class="row">
                            <div class="col-md-6">
                                <label for="cardNumber" class="form-label">Card Number</label>
                                <input type="text" class="form-control" id="cardNumber" placeholder="1234 5678 9012 3456" maxlength="19">
                            </div>
                            <div class="col-md-3">
                                <label for="expiryDate" class="form-label">Expiry</label>
                                <input type="text" class="form-control" id="expiryDate" placeholder="MM/YY" maxlength="5">
                            </div>
                            <div class="col-md-3">
                                <label for="cvv" class="form-label">CVV</label>
                                <input type="text" class="form-control" id="cvv" placeholder="123" maxlength="3">
                            </div>
                        </div>
                        <div class="mt-3">
                            <label for="cardholderName" class="form-label">Cardholder Name</label>
                            <input type="text" class="form-control" id="cardholderName" placeholder="John Doe">
                        </div>
                    </div>
                `;
                break;

            case 'credit':
                detailsHTML = `
                    <div class="payment-method-info">
                        <h6><i class="fa fa-flag"></i> Credit</h6>
                        <p class="text-muted">This booking will be checked out without collecting payment. Indicate who authorized it.</p>
                        <label for="creditApprovedBy" class="form-label">Approved By</label>
                        <input type="text" class="form-control" id="creditApprovedBy" placeholder="Name of person who authorized this">
                        <label for="creditRemarks" class="form-label mt-2">Remarks <span class="text-muted fw-normal">(optional)</span></label>
                        <input type="text" class="form-control" id="creditRemarks" placeholder="Additional remarks">
                        <div class="alert alert-warning mt-2">
                            <i class="fa fa-exclamation-triangle"></i>
                            <strong>Note:</strong> This marks the balance as settled without an actual payment. Use only with proper authorization.
                        </div>
                    </div>
                `;
                break;
        }

        paymentDetailsSection.innerHTML = detailsHTML;

        // Add input formatting for credit card
        if (method === 'credit_card') {
            addCreditCardFormatting();
        }

        // Re-validate as the approver name is typed in
        if (method === 'credit') {
            const approvedBy = document.getElementById('creditApprovedBy');
            if (approvedBy) {
                approvedBy.addEventListener('input', validatePaymentForm);
            }
        }

        // Credit has its own dedicated Remarks field, so hide the generic
        // Payment Notes box for that method to avoid two overlapping inputs.
        const notesGroup = document.querySelector('.payment-notes-group');
        if (notesGroup) {
            notesGroup.style.display = (method === 'credit') ? 'none' : '';
        }
    }

    // Credit card input formatting
    function addCreditCardFormatting() {
        const cardNumberInput = document.getElementById('cardNumber');
        const expiryInput = document.getElementById('expiryDate');
        const cvvInput = document.getElementById('cvv');
        
        if (cardNumberInput) {
            cardNumberInput.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
                let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
                e.target.value = formattedValue;
            });
        }
        
        if (expiryInput) {
            expiryInput.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 2) {
                    value = value.substring(0, 2) + '/' + value.substring(2, 4);
                }
                e.target.value = value;
            });
        }
        
        if (cvvInput) {
            cvvInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        }
    }

    // Reset payment form
    function resetPaymentForm() {
        paymentForm.reset();
        paymentOptions.forEach(opt => opt.classList.remove('selected'));
        paymentDetailsSection.innerHTML = '';
        document.getElementById('paymentStatusMessages').style.display = 'none';
        confirmButton.classList.remove('payment-success');
        balanceRow.style.display = 'none';
        const notesGroup = document.querySelector('.payment-notes-group');
        if (notesGroup) notesGroup.style.display = '';
    }

    // Initialize form validation
    validatePaymentForm();
}

// Helper functions for payment modal
function showLoadingState(show) {
    const confirmButton = document.getElementById('confirmPaymentButton');
    const btnText = confirmButton.querySelector('.btn-text');
    const btnLoading = confirmButton.querySelector('.btn-loading');
    
    if (show) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'flex';
        confirmButton.disabled = true;
    } else {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
        confirmButton.disabled = false;
    }
}

function showPaymentStatus(type, message) {
    const statusContainer = document.getElementById('paymentStatusMessages');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    statusContainer.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <i class="fa ${iconClass}"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    statusContainer.style.display = 'block';
}

// Function to manually update Payment Summary Card with breakdown
function updatePaymentSummaryCard(totalAmount, breakdown = {}) {
    console.log('updatePaymentSummaryCard called with:', { totalAmount, breakdown });
    
    const paymentTotalAmountElement = document.getElementById('paymentTotalAmount');
    const paymentAmountInputElement = document.getElementById('paymentAmountInput');
    
    // Update breakdown rows
    const roomNumberBadge = document.getElementById('paymentRoomNumberBadge');
    const roomNumberElement = document.getElementById('paymentRoomNumber');
    const roomRow = document.getElementById('roomRow');
    const roomAmount = document.getElementById('roomAmount');
    const extensionRow = document.getElementById('extensionRow');
    const extensionAmount = document.getElementById('extensionAmount');
    const serviceRow = document.getElementById('serviceRow');
    const serviceAmount = document.getElementById('serviceAmount');
    const reservationFeeRow = document.getElementById('paymentReservationFeeRow');
    const reservationFeeAmount = document.getElementById('paymentReservationFeeAmount');
    const discountRow = document.getElementById('paymentDiscountRow');
    const discountAmount = document.getElementById('paymentDiscountAmount');
    const amountPaidRow = document.getElementById('amountPaidRow');
    const amountPaidElement = document.getElementById('amountPaid');
    const subtotalRow = document.getElementById('subtotalRow');
    const subtotalElement = document.getElementById('subtotalAmount');
    
    // Show/hide and populate room number badge in the header
    if (breakdown.roomNumber) {
        if (roomNumberBadge) roomNumberBadge.style.display = 'block';
        if (roomNumberElement) roomNumberElement.textContent = breakdown.roomNumber;
    } else {
        if (roomNumberBadge) roomNumberBadge.style.display = 'none';
    }

    // Show/hide and populate room charges
    if (breakdown.roomAmount && breakdown.roomAmount > 0) {
        if (roomRow) roomRow.style.display = 'flex';
        if (roomAmount) roomAmount.textContent = breakdown.roomAmount.toLocaleString('en-US', {minimumFractionDigits: 2});
    } else {
        if (roomRow) roomRow.style.display = 'none';
    }
    
    // Show/hide and populate extensions
    if (breakdown.extensionAmount && breakdown.extensionAmount > 0) {
        if (extensionRow) extensionRow.style.display = 'flex';
        if (extensionAmount) extensionAmount.textContent = breakdown.extensionAmount.toLocaleString('en-US', {minimumFractionDigits: 2});
    } else {
        if (extensionRow) extensionRow.style.display = 'none';
    }
    
    // Show/hide and populate services
    if (breakdown.serviceAmount && breakdown.serviceAmount > 0) {
        if (serviceRow) serviceRow.style.display = 'flex';
        if (serviceAmount) serviceAmount.textContent = breakdown.serviceAmount.toLocaleString('en-US', {minimumFractionDigits: 2});
    } else {
        if (serviceRow) serviceRow.style.display = 'none';
    }
    
    // Show/hide and populate reservation fee
    if (breakdown.reservationFee && breakdown.reservationFee > 0) {
        if (reservationFeeRow) reservationFeeRow.style.display = 'flex';
        if (reservationFeeAmount) reservationFeeAmount.textContent = breakdown.reservationFee.toLocaleString('en-US', {minimumFractionDigits: 2});
        console.log('Reservation Fee shown:', breakdown.reservationFee);
    } else {
        if (reservationFeeRow) reservationFeeRow.style.display = 'none';
        console.log('Reservation Fee hidden:', breakdown.reservationFee);
    }
    
    // Show/hide and populate discount
    if (breakdown.discountAmount && breakdown.discountAmount > 0) {
        if (discountRow) discountRow.style.display = 'flex';
        if (discountAmount) discountAmount.textContent = breakdown.discountAmount.toLocaleString('en-US', {minimumFractionDigits: 2});
        console.log('Discount shown:', breakdown.discountAmount);
    } else {
        if (discountRow) discountRow.style.display = 'none';
        console.log('Discount hidden:', breakdown.discountAmount);
    }
    
    // Calculate and show subtotal
    const roomTotal = breakdown.roomAmount || 0;
    const extensionTotal = breakdown.extensionAmount || 0;
    const serviceTotal = breakdown.serviceAmount || 0;
    const reservationFeeTotal = breakdown.reservationFee || 0;
    const discountTotal = breakdown.discountAmount || 0;
    
    const subtotal = roomTotal + extensionTotal + serviceTotal - reservationFeeTotal - discountTotal;
    
    if (subtotal > 0) {
        if (subtotalRow) subtotalRow.style.display = 'flex';
        if (subtotalElement) subtotalElement.textContent = subtotal.toLocaleString('en-US', {minimumFractionDigits: 2});
        console.log('Subtotal shown:', subtotal);
    } else {
        if (subtotalRow) subtotalRow.style.display = 'none';
        console.log('Subtotal hidden:', subtotal);
    }
    
    // Show/hide and populate amount paid
    if (breakdown.amountPaid && breakdown.amountPaid > 0) {
        if (amountPaidRow) amountPaidRow.style.display = 'flex';
        if (amountPaidElement) amountPaidElement.textContent = breakdown.amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2});
        console.log('Amount Paid shown:', breakdown.amountPaid);
    } else {
        if (amountPaidRow) amountPaidRow.style.display = 'none';
        console.log('Amount Paid hidden:', breakdown.amountPaid);
    }
    
    // Update total amount to pay
    if (paymentTotalAmountElement) {
        const formattedAmount = totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2});
        paymentTotalAmountElement.textContent = formattedAmount;
    }
    
    // Update input field
    if (paymentAmountInputElement) {
        paymentAmountInputElement.value = totalAmount;
    }
}

// Initialize a flag to determine if the Billing Modal should reopen
let shouldReopenBillingModal = true;

// Optional hook: other flows (e.g. dashboard checkout-with-unpaid-balance) can set this
// to run custom logic after a successful payment instead of the default reload/reopen.
// While set, it also means the Payment Modal was NOT opened from the Billing Modal,
// so the Billing Modal should never be auto-reopened.
window.onPaymentConfirmed = window.onPaymentConfirmed || null;

// Ensure cleanup after closing the Payment Modal
document.getElementById('modal-payment').addEventListener('hidden.bs.modal', function () {
    // Remove modal-open class and reset styles
    document.body.classList.remove('modal-open');
    document.body.style.paddingRight = '';

    // Remove any leftover backdrops
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach((backdrop) => backdrop.remove());

    // Reset check-out-only state so it doesn't leak into the next, unrelated payment
    this.dataset.skipPaymentStep = 'false';
    $(this).find('.payment-amount-group, .payment-method-group, .payment-details-section').show();
    if (window.PaymentDepositSection) window.PaymentDepositSection.hide();
    const confirmBtn = this.querySelector('#confirmPaymentButton');
    if (confirmBtn) {
        confirmBtn.querySelector('.btn-text').textContent = 'Confirm Payment';
        // Back to the normal amount/method-gated default; validatePaymentForm() re-enables
        // it once the user fills in a valid amount + method for a regular payment.
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('btn-success');
        confirmBtn.classList.add('btn-secondary');
    }

    // Reopen the Billing Modal only if payment was not successful and no other flow
    // (e.g. dashboard checkout) is driving this Payment Modal
    if (shouldReopenBillingModal && !window.onPaymentConfirmed) {
        const billingModalEl = document.getElementById('modal-billing');
        if (billingModalEl) {
            const billingModal = new bootstrap.Modal(billingModalEl);
            billingModal.show();
        }
    }
});

$('#confirmPaymentButton').on('click', async function () {
    // Get payment details - support both old and new modal designs
    const bookingId = $('#hiddenBookingId').val() || $('#bookingID').val(); // Support both hidden input names
    let paymentAmount = $('#paymentAmount').val() || $('#paymentAmountInput').val(); // Support both amount inputs
    const paymentMethod = $('#paymentMethod').val(); // Hidden input from enhanced modal
    let paymentNotes = $('#paymentNotes').val() || ''; // Payment notes from enhanced modal

    // Dashboard check-out flow: process the held security deposit (if the section is
    // showing) before touching the payment fields below. When there's no outstanding
    // balance to collect, this also completes the check-out directly.
    if (window.PaymentDepositSection && window.PaymentDepositSection.isVisible()) {
        const depositResult = await window.PaymentDepositSection.submit(bookingId);
        if (!depositResult) {
            return; // validation/error already shown inside the deposit section
        }

        const paymentModalEl = document.getElementById('modal-payment');
        if (paymentModalEl && paymentModalEl.dataset.skipPaymentStep === 'true') {
            shouldReopenBillingModal = false;
            if (typeof window.onPaymentConfirmed === 'function') {
                const onConfirmed = window.onPaymentConfirmed;
                window.onPaymentConfirmed = null;
                $('.modal').modal('hide');
                $('.modal-backdrop').remove();
                onConfirmed(depositResult);
            }
            return;
        }

        // The deposit may have been applied to the balance - refresh the amount to
        // pay so the payment step below doesn't charge the stale, pre-deposit total.
        if (typeof depositResult.remainingBalance !== 'undefined') {
            const freshBalance = parseFloat(depositResult.remainingBalance) || 0;
            paymentAmount = freshBalance;
            const amountInput = document.getElementById('paymentAmountInput');
            if (amountInput) amountInput.value = freshBalance;
            if (typeof updatePaymentSummaryCard === 'function') {
                updatePaymentSummaryCard(freshBalance, {});
            } else {
                const totalAmountEl = document.getElementById('paymentTotalAmount');
                if (totalAmountEl) {
                    totalAmountEl.textContent = freshBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
                }
            }

            if (freshBalance <= 0) {
                shouldReopenBillingModal = false;
                if (typeof window.onPaymentConfirmed === 'function') {
                    const onConfirmed = window.onPaymentConfirmed;
                    window.onPaymentConfirmed = null;
                    $('.modal').modal('hide');
                    $('.modal-backdrop').remove();
                    onConfirmed(depositResult);
                }
                return;
            }
        }
    }

    // Credit payments must record who authorized them
    if (paymentMethod === 'credit') {
        const creditApprovedBy = $('#creditApprovedBy').val() ? $('#creditApprovedBy').val().trim() : '';
        if (!creditApprovedBy) {
            Swal.fire({
                title: 'Error!',
                text: 'Please indicate who approved this Credit payment.',
                icon: 'error',
                confirmButtonText: 'OK',
                backdrop: true,
            });
            return;
        }
        const creditRemarks = $('#creditRemarks').val() ? $('#creditRemarks').val().trim() : '';
        paymentNotes = `Credit approved by: ${creditApprovedBy}.` + (creditRemarks ? ` ${creditRemarks}` : '');
    }

    // Validate payment details
    if (!paymentMethod) {
        Swal.fire({
            title: 'Error!',
            text: 'Please select a payment method.',
            icon: 'error',
            confirmButtonText: 'OK',
            backdrop: true, // Ensures the modal has a proper backdrop
        });
        return;
    }

    if (!bookingId) {
        Swal.fire({
            title: 'Error!',
            text: 'Booking ID not found.',
            icon: 'error',
            confirmButtonText: 'OK',
            backdrop: true,
        });
        return;
    }

    // Clean and format payment amount for display
    const cleanAmount = paymentAmount ? paymentAmount.toString().replace(/[₹$,]/g, '') : '0';
    const numericAmount = parseFloat(cleanAmount) || 0;
    const paymentModalEl = document.getElementById('modal-payment');
    const skipPaymentStep = paymentModalEl && paymentModalEl.dataset.skipPaymentStep === 'true';

    if (skipPaymentStep && numericAmount <= 0) {
        shouldReopenBillingModal = false;
        if (typeof window.onPaymentConfirmed === 'function') {
            const onConfirmed = window.onPaymentConfirmed;
            window.onPaymentConfirmed = null;
            $('.modal').modal('hide');
            $('.modal-backdrop').remove();
            onConfirmed({ success: true });
        }
        return;
    }

    const formattedAmount = numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Show confirmation dialog
    Swal.fire({
        title: paymentMethod === 'credit' ? 'Confirm Credit' : 'Confirm Payment',
        text: paymentMethod === 'credit'
            ? `Are you sure you want to mark ₱${formattedAmount} as settled without collecting payment?`
            : `Are you sure you want to proceed with the payment of ₱${formattedAmount}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: paymentMethod === 'credit' ? 'Yes, Mark as Settled!' : 'Yes, Pay Now!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            // Show loading state
            showLoadingState(true);
            
            // Prepare payment data
            const paymentData = {
                bookingId: bookingId,
                paymentAmount: numericAmount,
                paymentMethod: paymentMethod,
                paymentNotes: paymentNotes
            };

            // Send AJAX request
            $.ajax({
                url: '/booking/process-payment', // URL of the backend route
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(paymentData), // Send as JSON
                success: function (response) {
                    showLoadingState(false);
                    
                    if (response.success) {
                        // Prevent reopening of the Billing Modal
                        shouldReopenBillingModal = false;

                        // If another flow (e.g. dashboard checkout) is waiting on this payment,
                        // hand control back to it instead of doing the default reload/reopen.
                        if (typeof window.onPaymentConfirmed === 'function') {
                            const onConfirmed = window.onPaymentConfirmed;
                            window.onPaymentConfirmed = null;

                            $('.modal').modal('hide');
                            $('.modal-backdrop').remove();

                            onConfirmed(response);
                            return;
                        }

                        // Hide all modals
                        $('.modal').modal('hide'); // Hides all open modals
                        $('.modal-backdrop').remove(); // Ensures no backdrops remain

                        // Show success SweetAlert
                        Swal.fire({
                            title: 'Success!',
                            text: response.message,
                            icon: 'success',
                            confirmButtonText: 'OK',
                            allowOutsideClick: false, // Prevent closing when clicking outside
                        }).then(() => {
                            // Reload the page after closing SweetAlert
                            location.reload();
                        });
                    } else {
                        // Handle payment failure
                        showPaymentStatus('error', response.message);
                        Swal.fire({
                            title: 'Payment Failed!',
                            text: response.message,
                            icon: 'error',
                            confirmButtonText: 'Try Again',
                            allowOutsideClick: false, // Prevent accidental dismissal
                        });
                    }
                },
                error: function () {
                    showLoadingState(false);
                    
                    // Handle server or AJAX error
                    showPaymentStatus('error', 'An error occurred while processing the payment.');
                    Swal.fire({
                        title: 'Error!',
                        text: 'An error occurred while processing the payment.',
                        icon: 'error',
                        confirmButtonText: 'OK',
                        allowOutsideClick: false, // Prevent accidental dismissal
                    });
                },
            });
        }
    });
}); 