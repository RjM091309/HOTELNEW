// Billing Data Scripts
// Extracted from dashboard.ejs

function showBilling(bookingID) {
    if (window.showBilling) return window.showBilling(bookingID);
    console.error('Global showBilling is not available');
}
