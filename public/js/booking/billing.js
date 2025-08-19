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