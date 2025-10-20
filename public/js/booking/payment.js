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

    // Form validation
    function validatePaymentForm() {
        const amount = parseFloat(paymentAmountInput.value) || 0;
        const selectedMethod = document.querySelector('input[name="paymentMethod"]:checked');
        
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
        }
        
        paymentDetailsSection.innerHTML = detailsHTML;
        
        // Add input formatting for credit card
        if (method === 'credit_card') {
            addCreditCardFormatting();
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

    // Initialize form validation
    validatePaymentForm();
}

// Initialize a flag to determine if the Billing Modal should reopen
let shouldReopenBillingModal = true;

// Ensure cleanup after closing the Payment Modal
document.getElementById('modal-payment').addEventListener('hidden.bs.modal', function () {
    // Remove modal-open class and reset styles
    document.body.classList.remove('modal-open');
    document.body.style.paddingRight = '';

    // Remove any leftover backdrops
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach((backdrop) => backdrop.remove());

    // Reopen the Billing Modal only if payment was not successful
    if (shouldReopenBillingModal) {
        const billingModal = new bootstrap.Modal(document.getElementById('modal-billing'));
        billingModal.show();
    }
});

$('#confirmPaymentButton').on('click', function () {
    // Get payment details - support both old and new modal designs
    const bookingId = $('#hiddenBookingId').val() || $('#bookingID').val(); // Support both hidden input names
    const paymentAmount = $('#paymentAmount').val() || $('#paymentAmountInput').val(); // Support both amount inputs
    const paymentMethod = $('#paymentMethod').val(); // Hidden input from enhanced modal
    const paymentNotes = $('#paymentNotes').val() || ''; // Payment notes from enhanced modal

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
    const formattedAmount = numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Show confirmation dialog
    Swal.fire({
        title: 'Confirm Payment',
        text: `Are you sure you want to proceed with the payment of ₱${formattedAmount}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Pay Now!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            // Prepare payment data
            const paymentData = {
                bookingId: bookingId,
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
                    if (response.success) {
                        // Prevent reopening of the Billing Modal
                        shouldReopenBillingModal = false;

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
                    // Handle server or AJAX error
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