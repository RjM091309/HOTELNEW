$(document).ready(function () {
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
    // Get payment details
    const bookingId = $('#hiddenBookingId').val(); // Hidden input with the booking ID
    const paymentMethod = $('#paymentMethod').val(); // Dropdown for payment method

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

    // Send AJAX request
    $.ajax({
        url: '/booking/process-payment', // URL of the backend route
        type: 'POST',
        data: { bookingId: bookingId, paymentMethod: paymentMethod }, // URL-encoded data
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
}); 