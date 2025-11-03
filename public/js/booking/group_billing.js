// Group Billing Modal JavaScript Functions

document.addEventListener('DOMContentLoaded', function() {
    // Set current date for generated date
    document.getElementById('generatedDate').textContent = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Initialize payment status
    updateGroupPaymentStatus();
    
    // Also check payment status after a short delay to ensure elements are loaded
    setTimeout(updateGroupPaymentStatus, 500);
    
    // Ensure proceed to payment button is properly initialized
    setTimeout(function() {
        const proceedButton = document.getElementById('groupProceedPaymentButton');
        const genInvoiceBtn = document.getElementById('generateGroupInvoiceBtn');
        if (proceedButton) {
            // Remove any existing event listeners
            proceedButton.replaceWith(proceedButton.cloneNode(true));
            
            // Get the new button reference
            const newProceedButton = document.getElementById('groupProceedPaymentButton');
            
            // Add event listener
            newProceedButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Get the Balance (not total) from the Group Billing Modal
                const totalPayment = document.getElementById('balanceAmount').textContent.trim();

                const paymentAmountField = document.getElementById('groupPaymentAmount');
                if (totalPayment) {
                    paymentAmountField.value = totalPayment;
                } else {
                    paymentAmountField.value = "N/A";
                }

                // Show payment modal WITHOUT closing billing modal
                const paymentModal = new bootstrap.Modal(document.getElementById('group_modal-payment'));
                paymentModal.show();
            });
        }
        if (genInvoiceBtn) {
            // Reset listeners
            genInvoiceBtn.replaceWith(genInvoiceBtn.cloneNode(true));
            const newBtn = document.getElementById('generateGroupInvoiceBtn');
            newBtn.addEventListener('click', function() {
                const modal = document.getElementById('groupBillingModal');
                const groupId = modal && modal.dataset ? modal.dataset.groupId : null;
                if (!groupId) {
                    alert('Missing Group ID!');
                    return;
                }
                const url = `/booking/generate-group-invoice/${groupId}`;
                window.open(url, '_blank');
            });
        }
    }, 1000);
});

// Function to update payment status and show/hide paid image
function updateGroupPaymentStatus() {
    const totalPaidElement = document.getElementById('totalPaid');
    const totalPaymentElement = document.getElementById('totalAmount');
    const balanceAmountElement = document.getElementById('balanceAmount');
    const paidImageOverlay = document.getElementById('paidImageOverlay');
    
    // Check if elements exist
    if (!totalPaidElement || !totalPaymentElement || !balanceAmountElement || !paidImageOverlay) {
        return;
    }
    
    // Parse amounts, handling both ₹ and ₱ currency symbols
    const totalPaid = parseFloat(totalPaidElement.textContent.replace(/[₹₱,]/g, '')) || 0;
    const totalPayment = parseFloat(totalPaymentElement.textContent.replace(/[₹₱,]/g, '')) || 0;
    const balanceAmount = parseFloat(balanceAmountElement.textContent.replace(/[₹₱,]/g, '')) || 0;
    
    // Check if payment is truly complete - improved logic
    const isPaymentComplete = (balanceAmount <= 0 && totalPaid > 0 && totalPayment > 0 && totalPaid >= totalPayment);
    
    if (isPaymentComplete) {
        // Show paid image only when payment is complete
        paidImageOverlay.style.display = 'block';
        paidImageOverlay.classList.add('show-paid-status');
    } else {
        // Hide paid image for unpaid or partial payments
        paidImageOverlay.style.display = 'none';
        paidImageOverlay.classList.remove('show-paid-status');
    }
}

// Function to be called when payment data is updated
function refreshGroupPaymentStatus() {
    updateGroupPaymentStatus();
}

// Function to manually check payment status (for debugging)
function checkGroupPaymentStatus() {
    updateGroupPaymentStatus();
}

// Function to force show paid image (for testing)
function forceShowGroupPaidImage() {
    const paidImageOverlay = document.getElementById('paidImageOverlay');
    if (paidImageOverlay) {
        paidImageOverlay.style.display = 'block';
        paidImageOverlay.classList.add('show-paid-status');
    }
}

// Enhanced print function for better layout
function printDiv(divId) {
    // Store current modal state
    const modal = document.getElementById('groupBillingModal');
    const originalZIndex = modal.style.zIndex;
    const originalPosition = modal.style.position;
    
    // Temporarily modify modal for printing
    modal.style.zIndex = '9999';
    modal.style.position = 'relative';
    
    // Get the printable content
    const printContents = document.getElementById(divId).innerHTML;
    const originalContents = document.body.innerHTML;
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Group Billing Receipt</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    background: white;
                    color: black;
                }
                .billing-receipt-container {
                    background: white !important;
                    color: black !important;
                    border: 2px solid black !important;
                    padding: 30px !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                }
                .billing-header {
                    text-align: center;
                    border-bottom: 3px solid black;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                }
                .billing-title {
                    font-size: 28px;
                    font-weight: bold;
                    margin: 0 0 20px 0;
                }
                .billing-divider {
                    height: 3px;
                    background: black;
                    margin: 25px auto;
                    width: 100%;
                }
                .hotel-info-section,
                .customer-info-section {
                    border: 2px solid black;
                    padding: 25px;
                    margin-bottom: 25px;
                    background: white;
                }
                .hotel-logo {
                    width: 80px;
                    height: 80px;
                    border: 3px solid black;
                }
                .hotel-name {
                    font-size: 24px;
                    font-weight: bold;
                    text-align: center;
                    margin: 15px 0;
                }
                .hotel-address p {
                    font-size: 14px;
                    margin: 8px 0;
                }
                .customer-name {
                    font-size: 16px;
                    font-weight: bold;
                    background: #f0f0f0;
                    border-left: 4px solid black;
                    padding: 10px;
                    margin-bottom: 15px;
                }
                .invoice-date {
                    background: #f8f8f8;
                    border: 2px solid black;
                    padding: 15px;
                }
                .billing-table {
                    width: 100%;
                    border: 3px solid black;
                    border-collapse: collapse;
                    margin: 30px 0;
                }
                .billing-table th {
                    background: #f0f0f0;
                    border: 2px solid black;
                    padding: 15px 10px;
                    font-size: 14px;
                    font-weight: bold;
                    text-align: center;
                }
                .billing-table td {
                    border: 1px solid black;
                    padding: 12px 10px;
                    font-size: 14px;
                    text-align: center;
                }
                .billing-summary-section {
                    border: 3px solid black;
                    padding: 30px;
                    margin: 30px 0;
                    background: white;
                }
                .payment-notes {
                    border: 2px solid black;
                    background: #f8f8f8;
                    padding: 20px;
                }
                .payment-summary {
                    border: 2px solid black;
                    background: #f8f8f8;
                    padding: 25px;
                    position: relative;
                }
                .paid-image-overlay {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    z-index: 100;
                }
                .paid-overlay-image {
                    width: 120px;
                    height: auto;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    padding: 10px 0;
                    border-bottom: 1px solid black;
                    font-size: 16px;
                    font-weight: bold;
                }
                .total-row {
                    border-top: 3px solid black;
                    padding-top: 25px;
                    margin-top: 25px;
                }
                .col-md-6 {
                    width: 100%;
                    margin-bottom: 20px;
                }
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 1cm;
                    }
                    body {
                        font-size: 12pt;
                    }
                }
            </style>
        </head>
        <body>
            ${printContents}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
    
    // Restore original modal state
    modal.style.zIndex = originalZIndex;
    modal.style.position = originalPosition;
}
