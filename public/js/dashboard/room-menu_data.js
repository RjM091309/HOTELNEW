// Room Menu Data Scripts
// Extracted from dashboard.ejs

let selectedCard = null; // Store the currently selected card
let addedServicesMap = {}; // Store added services for each room

// Make functions globally accessible for onclick events
window.addService = function(bookingId) {
    if (typeof addServiceLocal === 'function') {
        return addServiceLocal(bookingId);
    } else {
        console.error('❌ addServiceLocal function not found!');
        return false;
    }
};

// Also make other functions globally accessible
window.calculateBalance = calculateBalance;
window.calculateTotalCost = calculateTotalCost;
window.updateAddedServicesList = updateAddedServicesList;
window.saveServices = saveServices;
window.removeService = removeService;
window.loadServices = loadServices;
window.loadExistingServicesForModal = loadExistingServicesForModal;
window.loadBookingDetails = loadBookingDetails;
window.loadGuestDetails = loadGuestDetails;
window.loadTransferHistory = loadTransferHistory;
window.showBilling = showBilling;
window.openExtendModal = openExtendModal;
window.triggerTransferFromMenu = triggerTransferFromMenu;
window.openRoomMenuModal = openRoomMenuModal;
window.createDynamicRoomModal = createDynamicRoomModal;

// Add a function to refresh services when payment status changes
window.refreshServicesList = function(bookingId) {
    loadExistingServicesForModal(bookingId);
};

// Toast helpers using PMSCore when available, with safe fallbacks
function notifyToast(type, heading, message, options = {}) {
    try {
        if (typeof PMSCore !== 'undefined' && PMSCore.showToast) {
            PMSCore.showToast(type, heading, message, options);
            return;
        }
        if (typeof $ !== 'undefined' && typeof $.toast === 'function') {
            $.toast({
                heading: heading,
                text: message,
                position: (options && options.position) || 'top-right',
                loaderBg: '#0c2a42',
                icon: type === 'danger' ? 'error' : type,
                hideAfter: (options && options.hideAfter) || 5000,
                stack: (options && options.stack) || 6
            });
            return;
        }
        if (typeof Swal !== 'undefined' && Swal.fire) {
            Swal.fire({ icon: type === 'danger' ? 'error' : type, title: heading, text: message });
            return;
        }
        console[type === 'error' || type === 'danger' ? 'error' : 'log'](`${heading}: ${message}`);
    } catch (e) {
        console.error('Toast error:', e);
    }
}

function toastSuccess(heading, message, options = {}) { notifyToast('success', heading, message, options); }
function toastError(heading, message, options = {}) { notifyToast('error', heading, message, options); }
function toastWarning(heading, message, options = {}) { notifyToast('warning', heading, message, options); }
function toastInfo(heading, message, options = {}) { notifyToast('info', heading, message, options); }

// Function to open the Room Menu Modal and store the selected room card
/**
* Opens the full "Room Menu" modal if it exists,
* otherwise creates a dynamic modal with room details.
*
* @param {string|number} bookingId
* @param {FullCalendar.EventApi} [event]  – the clicked calendar event
*/
function openRoomMenuModal(bookingId, event) {
  // Always use the original modal structure, but get data from different sources
  if (event && event.extendedProps) {
    // Calendar context - extract data from event
    createDynamicRoomModalFromEvent(bookingId, event);
  } else {
    // Dashboard context - use existing logic
    createDynamicRoomModal(bookingId, event, { isFromCalendar: false });
  }
}

// Function to create a dynamic room modal from calendar event data using original modal structure
function createDynamicRoomModalFromEvent(bookingId, event) {
  
  
  // Extract data from the calendar event
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const roomId = event.getResources()[0]?.id || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  
  // Extract dates from event
  const checkInDate = event.start;
  const checkOutDate = event.end;
  
  // Calculate days from check-in and check-out dates
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);
  const daysDiff = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  
  // Initialize services map for this booking
  if (!addedServicesMap[bookingId]) {
    addedServicesMap[bookingId] = [];
  }
  
  // Instead of creating duplicate HTML, call the original modal function
  // but pass the calendar event data as parameters
  createDynamicRoomModal(bookingId, event, {
    roomNumber,
    roomId,
    guestName,
    checkInDate,
    checkOutDate,
    daysDiff,
    isFromCalendar: true
  });
}

// Function to create a dynamic room modal
function createDynamicRoomModal(bookingId, event, options) {
  let roomNumber, roomId, guestName, checkInDate, checkOutDate, daysDiff, roomType, customerType, customerLevel, totalCost, lateCheckout;
  
  // Check if data is coming from calendar event
  if (options && options.isFromCalendar) {
    // Use calendar event data
    roomNumber = options.roomNumber;
    roomId = options.roomId;
    guestName = options.guestName;
    checkInDate = options.checkInDate;
    checkOutDate = options.checkOutDate;
    daysDiff = options.daysDiff;
    roomType = 'Standard Room';
    customerType = 'Day/s';
    customerLevel = '';
    totalCost = '₱0.00';
    lateCheckout = '0';
  } else {
    // Find the room card to get booking data using the BookingID (dashboard context)
    const roomCard = document.querySelector(`[data-booking-id="${bookingId}"]`);
    if (!roomCard) {
      console.error("No room card found for booking ID:", bookingId);
      return;
    }

    // Extract data from the room card
    roomNumber = roomCard.getAttribute('data-room-number');
    roomId = roomCard.getAttribute('data-idno'); // This is the actual ROOM_ID
        const extractedBookingId = roomCard.getAttribute('data-booking-id');
    checkInDate = roomCard.getAttribute('data-checkin');
    checkOutDate = roomCard.getAttribute('data-checkout');
    lateCheckout = roomCard.getAttribute('data-late-checkout');
    customerType = roomCard.getAttribute('data-customer-type') || 'Day/s';
    customerLevel = roomCard.getAttribute('data-customer-level') || '';

    // Get guest info from the card content - improved data extraction
    const cardBody = roomCard.querySelector('.card-body');
    const roomTypeElement = cardBody.querySelector('p');
    const guestNameElement = cardBody.querySelector('.d-flex.align-items-center.justify-content-between p');
    const totalCostElement = cardBody.querySelector('.d-flex.align-items-center.justify-content-between:last-child p');

    roomType = roomTypeElement ? roomTypeElement.textContent : 'Standard Room';
    guestName = guestNameElement ? guestNameElement.textContent : 'N/A';
    totalCost = totalCostElement ? totalCostElement.textContent : '₱0.00';

    // Calculate days from check-in and check-out dates
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    daysDiff = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  }

  // Initialize services map for this booking
  if (!addedServicesMap[bookingId]) {
    addedServicesMap[bookingId] = [];
  }

  // Create modal HTML
  const modalHTML = `
<div class="modal fade" id="dynamicRoomModal_${bookingId}" tabindex="-1" aria-labelledby="dynamicRoomModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
    <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content" style="
    background-color: #ffffff;
    border: 4px solid transparent;
    border-image: linear-gradient(135deg, #ffffff 0%, #ffffff 100%);
    border-image-slice: 1;
">

            <!-- Modal Header -->
            <div class="modal-header py-2" style="background: linear-gradient(135deg, #ffffff 0%, #ffffff 100%); border-bottom: 1px solid #eeeeee;">
                <h6 class="modal-title mb-0" style="color: #495057;">
                    <strong>Room</strong>
                    <span style="font-size: 1.5rem; color: #495057;">${roomNumber}</span> | 
                    <span style="font-size: 1.5rem; color: #495057;">walk-in</span>
                </h6>
                
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-primary" onclick="triggerTransferFromMenu('${roomId}')">
                        <i class="fas fa-exchange-alt"></i> Transfer
                    </button>
                    
                    ${lateCheckout === '1' ? 
                        '<button class="btn btn-sm btn-secondary" disabled>Late Check-Out Applied</button>' :
                        '<button class="btn btn-sm btn-secondary" onclick="openLateCheckoutModal(\'' + roomId + '\', \'' + checkOutDate + '\', \'' + bookingId + '\')">Late Check-Out</button>'
                    }
                    
                    <button class="btn btn-sm btn-success" 
                            id="btnExtend" 
                            onclick="openExtendModal('${roomId}', '${checkOutDate}', '${bookingId}')">
                        <i class="fas fa-plus-circle"></i> Extend
                    </button>
                </div>
            </div>
            
            <!-- Modal Body -->
            <div class="modal-body p-3" style="background-color: #ffffff; color: #495057;">
                <!-- Hidden booking ID -->
                <input type="hidden" id="bookingID-${bookingId}" value="${bookingId}">
                
                <!-- Transfer History Section (will be populated dynamically) -->
                <div id="transfer-history-${bookingId}" style="display: none;">
                    <div id="timeline">
                        <h6 class="mb-2">Transfer History</h6>
                        <ol id="timeline-list-${bookingId}">
                            <!-- Transfer history will be populated here -->
                        </ol>
                    </div>
                </div>
                
                <!-- Room Reservation Details -->
                <div class="card shadow-sm mb-3" style="background-color: #ffffff; border: 1px solid #dee2e6;">
                    <div class="card-header py-2" style="background-color: #ffffff; border-bottom: 1px solid #dee2e6; color: #495057;">
                        <h6 class="mb-0">Room Reservation Details</h6>
                    </div>
                    <div class="card-body p-2" style="background-color: #ffffff;">
                        <div class="row">
                            <!-- Left Column - Guest Information -->
                            <div class="col-md-6">
                                <div class="info-section mb-2">
                                    <h6 class="text-primary mb-2" style="border-bottom: 2px solid #007bff; padding-bottom: 4px;">
                                        <i class="fas fa-user me-1"></i>Guest Info
                                    </h6>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Guest Name</label>
                                        <div class="info-value">${guestName}</div>
                                    </div>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Contact No</label>
                                        <div class="info-value">-</div>
                                    </div>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Guest Type</label>
                                        <div class="info-value" id="guest-type-${bookingId}">${customerType || 'Day/s'}</div>
                                    </div>
                                    <div class="info-item">
                                        <label class="text-muted small mb-0">Guest Level</label>
                                        <div class="info-value" id="guest-level-${bookingId}">${customerLevel || 'Standard'}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Right Column - Room Information -->
                            <div class="col-md-6">
                                <div class="info-section mb-2">
                                    <h6 class="text-success mb-2" style="border-bottom: 2px solid #28a745; padding-bottom: 4px;">
                                        <i class="fas fa-bed me-1"></i>Room Info
                                    </h6>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Room Type</label>
                                        <div class="info-value" id="room-type-${bookingId}">${roomType}</div>
                                    </div>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Room Rate</label>
                                        <div class="info-value" id="room-rate-${bookingId}">₱3,500.00</div>
                                    </div>
                                    <div class="info-item mb-1">
                                        <label class="text-muted small mb-0">Day/s</label>
                                        <div class="info-value" id="total-days-${bookingId}">${daysDiff}</div>
                                    </div>
                                    <div class="info-item">
                                        <label class="text-muted small mb-0">Room Cost</label>
                                        <div class="info-value" id="total-room-cost-${bookingId}">
                                            ${totalCost} 
                                            <span class="badge bg-success ms-1">Paid</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Extra Services Section -->
                        <div class="extra-services-section mb-2" style="background: #ffffff !important; border-radius: 6px; padding: 10px; border: 1px solid #e9ecef; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <h6 class="text-warning mb-2" style="border-bottom: 2px solid #ffc107; padding-bottom: 4px;">
                                <i class="fas fa-plus-circle me-1"></i>Extra Services
                            </h6>
                            <div class="d-flex align-items-center mb-2">
                                <select id="extra-service-select-${bookingId}" class="form-select form-select-sm me-2" style="max-width: 180px;">
                                    <option value="">Select a service</option>
                                </select>
                                <input type="number" id="service-quantity-${bookingId}" class="form-control form-select-sm me-2" min="1" value="1" style="width: 60px;">
                                <input type="number" id="service-cost-${bookingId}" class="form-control form-select-sm me-2" min="0" step="1" placeholder="Cost" style="width: 80px; display: none;">
                                <div class="form-check me-2">
                                    <input class="form-check-input" type="checkbox" id="custom-cost-checkbox-${bookingId}" onchange="window.toggleCustomCost('${bookingId}')">
                                    <label class="form-check-label" for="custom-cost-checkbox-${bookingId}">Manual Cost</label>
                                </div>
                                <button type="button" class="btn btn-sm btn-success" onclick="window.addService('${bookingId}')">
                                    <i class="fas fa-plus me-1"></i>Add
                                </button>
                            </div>
                            <div id="added-services-list-${bookingId}">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                        
                        <!-- Summary Section -->
                        <div class="summary-section">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="summary-item">
                                        <label class="text-muted small mb-0">Grand Total</label>
                                        <div class="summary-value" id="grand-total-${bookingId}">${totalCost}</div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="summary-item">
                                        <label class="text-muted small mb-0">Balance</label>
                                        <div class="summary-value" id="Balance-${bookingId}">₱0.00</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Reservation Fee Row (Conditional) -->
                            <div class="row" id="reservation-fee-row-${bookingId}" style="display: none;">
                                <div class="col-md-6">
                                    <div class="summary-item">
                                        <label class="text-muted small mb-0" style="color: #28a745;">Reservation Fee (Paid)</label>
                                        <div class="summary-value" id="reservation-fee-${bookingId}" style="color: #28a745;">₱0.00</div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <!-- Empty column for alignment -->
                                </div>
                            </div>
                            
                            <!-- Discount Row (Conditional) -->
                            <div class="row" id="discount-row-${bookingId}" style="display: none;">
                                <div class="col-md-6">
                                    <div class="summary-item">
                                        <label class="text-muted small mb-0" style="color: #28a745;">Discount Applied</label>
                                        <div class="summary-value" id="discount-amount-${bookingId}" style="color: #dc3545;">₱0.00</div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <!-- Empty column for alignment -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Modal Footer -->
            <div class="modal-footer py-2" style="background: linear-gradient(135deg, #ffffff 0%, #ffffff 100%); border-top: 1px solid #495057;">
                <button type="button" class="btn btn-primary" onclick="showBilling('${bookingId}')">Billing</button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>
`;
// Remove any existing dynamic modal
const existingModal = document.getElementById(`dynamicRoomModal_${bookingId}`);
if (existingModal) {
    existingModal.remove();
}

// Ensure the modal HTML is properly formatted
if (!modalHTML || typeof modalHTML !== 'string') {
    console.error('Invalid modal HTML generated');
    return;
}

// Add modal to body
document.body.insertAdjacentHTML('beforeend', modalHTML);

// Debug: Log the modal creation


// Show the modal
const modal = document.getElementById(`dynamicRoomModal_${bookingId}`);
if (!modal) {
    console.error(`Modal element not found: dynamicRoomModal_${bookingId}`);
    return;
}

// Add specific light theme styles for this modal
const modalStyle = document.createElement('style');
modalStyle.id = `modal-light-theme-${bookingId}`;
modalStyle.textContent = `
    /* Light theme overrides for modal ${bookingId} */
    #dynamicRoomModal_${bookingId} .form-control:hover,
    #dynamicRoomModal_${bookingId} .form-select:hover {
        background-color: #ffffff !important;
        border-color: #80bdff !important;
        color: #495057 !important;
    }
    
    #dynamicRoomModal_${bookingId} .form-control:focus,
    #dynamicRoomModal_${bookingId} .form-select:focus {
        background-color: #ffffff !important;
        border-color: #80bdff !important;
        color: #495057 !important;
        box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25) !important;
    }
    
    #dynamicRoomModal_${bookingId} .btn:hover {
        opacity: 0.9 !important;
    }
    
    #dynamicRoomModal_${bookingId} .card:hover {
        box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075) !important;
    }
    
    /* New layout styles */
    #dynamicRoomModal_${bookingId} .info-section {
        background: #ffffff;
        border-radius: 6px;
        padding: 10px;
        border: 1px solid #e9ecef;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    #dynamicRoomModal_${bookingId} .info-section h6 {
        font-weight: 600;
        margin-bottom: 10px;
        font-size: 0.9rem;
    }
    
    #dynamicRoomModal_${bookingId} .info-item {
        padding: 4px 0;
        border-bottom: 1px solid #f1f3f4;
    }
    
    #dynamicRoomModal_${bookingId} .info-item:last-child {
        border-bottom: none;
    }
    
    #dynamicRoomModal_${bookingId} .info-item label {
        font-weight: 500;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        font-size: 0.7rem;
    }
    
    #dynamicRoomModal_${bookingId} .info-value {
        font-weight: 600;
        color: #495057;
        font-size: 0.9rem;
        margin-top: 1px;
    }
    
   
    
    #dynamicRoomModal_${bookingId} .extra-services-section {
        background: #ffffff !important;
        border-radius: 6px;
        padding: 10px;
        border: 1px solid #e9ecef;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    
    #dynamicRoomModal_${bookingId} .extra-services-section h6 {
        font-weight: 600;
        margin-bottom: 10px;
        font-size: 0.9rem;
    }
  
    
    #dynamicRoomModal_${bookingId} .summary-item {
        padding: 4px 0;
        text-align: center;
    }
    
    #dynamicRoomModal_${bookingId} .summary-item label {
        font-weight: 500;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        font-size: 0.7rem;
    }
    
    #dynamicRoomModal_${bookingId} .summary-value {
        font-weight: 700;
        color: #495057;
        font-size: 1rem;
        margin-top: 1px;
    }
    
    /* Reservation Fee and Discount Row Styling */
    #dynamicRoomModal_${bookingId} #reservation-fee-row-${bookingId},
    #dynamicRoomModal_${bookingId} #discount-row-${bookingId} {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #e9ecef;
    }
    
    #dynamicRoomModal_${bookingId} #reservation-fee-row-${bookingId} .summary-item label,
    #dynamicRoomModal_${bookingId} #discount-row-${bookingId} .summary-item label {
        font-weight: 600;
        font-size: 0.8rem;
    }
    
    #dynamicRoomModal_${bookingId} #reservation-fee-row-${bookingId} .summary-value,
    #dynamicRoomModal_${bookingId} #discount-row-${bookingId} .summary-value {
        font-weight: 700;
        font-size: 0.9rem;
    }
    
    #dynamicRoomModal_${bookingId} .form-control,
    #dynamicRoomModal_${bookingId} .form-select {
        border: 1px solid #ced4da;
        border-radius: 6px;
        transition: all 0.2s ease;
    }
    
    /* Custom Cost Input Styling */
    #dynamicRoomModal_${bookingId} #service-cost-${bookingId} {
        transition: all 0.3s ease;
    }
    
    #dynamicRoomModal_${bookingId} #service-cost-${bookingId}:focus {
        border-color: #28a745;
        box-shadow: 0 0 0 0.2rem rgba(40, 167, 69, 0.25);
    }
    
    #dynamicRoomModal_${bookingId} .form-check-input:checked {
        background-color: #28a745;
        border-color: #28a745;
    }
    
    #dynamicRoomModal_${bookingId} .form-check-label {
        font-size: 0.8rem;
        color: #6c757d;
        font-weight: 500;
    }
    
    #dynamicRoomModal_${bookingId} .form-control:focus,
    #dynamicRoomModal_${bookingId} .form-select:focus {
        border-color: #80bdff;
        box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
    }
    
    #dynamicRoomModal_${bookingId} .btn {
        border-radius: 6px;
        font-weight: 500;
        transition: all 0.2s ease;
    }
    
    #dynamicRoomModal_${bookingId} .badge {
        font-size: 0.75rem;
        padding: 4px 8px;
        border-radius: 12px;
    }
`;

document.head.appendChild(modalStyle);

// Check if Bootstrap is available
if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
    console.error('Bootstrap Modal is not available');
    return;
}

const bootstrapModal = new bootstrap.Modal(modal);
bootstrapModal.show();

// Load services and booking details after modal is shown
setTimeout(() => {
    loadServices(bookingId);
    loadExistingServicesForModal(bookingId);
    loadBookingDetails(bookingId);
    loadGuestDetails(bookingId);
    loadTransferHistory(bookingId, bookingId);
    
    // Initialize custom cost input state
    const customCostInput = document.getElementById(`service-cost-${bookingId}`);
    const customCostCheckbox = document.getElementById(`custom-cost-checkbox-${bookingId}`);
    if (customCostInput && customCostCheckbox) {
        customCostInput.style.display = 'none';
        customCostInput.disabled = true;
        customCostCheckbox.checked = false;
        // console.log(`✅ Custom cost input initialized for booking ${bookingId}`);
    }
        
        // Ensure grand total is calculated after all data is loaded
    setTimeout(() => {
        calculateTotalCost(bookingId);
        calculateBalance(bookingId, bookingId);
    }, 500);
}, 100);

// Clean up modal when hidden
if (modal) {
    modal.addEventListener('hidden.bs.modal', function () {
        // Remove the modal-specific styles
        const modalStyle = document.getElementById(`modal-light-theme-${bookingId}`);
        if (modalStyle) {
            modalStyle.remove();
        }
        modal.remove();
    });
}

} // End of createDynamicRoomModal function

// Function to show event info from calendar - REMOVED (duplicate with calendar_booking_data.js)
// Use window.showEventInfoModal from calendar module instead

// Function to trigger room transfer from Room Menu Modal
function triggerTransferFromMenu(roomId) {
    
    
    // Check if transfer modal exists
    const transferModal = document.getElementById("transferAvailableModal");
    if (!transferModal) {
        console.error("Transfer modal not found in DOM. Make sure the modal is included in the HTML.");
        return;
    }
    
    let currentRoom, checkInDate, checkOutDate, bookingId;
    
    // Try to find the room card first (dashboard context)
    const roomCard = document.querySelector(`[data-idno="${roomId}"]`);
    
    
    if (roomCard) {
        // Get room data from the card attributes (dashboard context)
        currentRoom = roomCard.getAttribute("data-idno");
        checkInDate = roomCard.getAttribute("data-checkin");
        checkOutDate = roomCard.getAttribute("data-checkout");
        bookingId = roomCard.getAttribute("data-booking-id");
        

    } else {
        // Try to get data from the currently open dynamic room modal (calendar context)
        const openModal = document.querySelector('.modal.show');
        if (openModal && openModal.id && openModal.id.startsWith('dynamicRoomModal_')) {
            const modalBookingId = openModal.id.replace('dynamicRoomModal_', '');
            const bookingIdInput = document.getElementById(`bookingID-${modalBookingId}`);
            
            if (bookingIdInput) {
                currentRoom = roomId;
                bookingId = modalBookingId;
                
                // Get dates from the hidden fields in the modal
                const checkinDateField = document.getElementById(`checkin-date-${modalBookingId}`);
                const checkoutDateField = document.getElementById(`checkout-date-${modalBookingId}`);
                
                if (checkinDateField && checkoutDateField) {
                    checkInDate = checkinDateField.value;
                    checkOutDate = checkoutDateField.value;
                } else {
                    // Fallback to current date if hidden fields not found
                    const today = new Date();
                    checkInDate = today.toISOString().split('T')[0];
                    checkOutDate = new Date(today.getTime() + (24 * 60 * 60 * 1000)).toISOString().split('T')[0];
                }
                
        
            } else {
                console.error("Could not find booking ID in modal");
                return;
            }
        } else {
            console.error("No room card found and no open modal found. Cannot proceed with transfer.");
            return;
        }
    }
    
    // Create a mock button object with the required data
    const mockButton = {
        closest: () => ({ 
            getAttribute: (attr) => {
                if (attr === 'data-idno') return currentRoom;
                if (attr === 'data-checkin') return checkInDate;
                if (attr === 'data-checkout') return checkOutDate;
                if (attr === 'data-booking-id') return bookingId;
                return null;
            }
        })
    };
    
    // Call the openTransferModal function directly
    if (typeof window.openTransferModal === 'function') {
        window.openTransferModal(mockButton);
    } else {
        console.error("openTransferModal function not found. Make sure the transfer modal is initialized.");
    }
}

// Load services from database
function loadServices(bookingId) {
const serviceSelect = document.getElementById(`extra-service-select-${bookingId}`);
if (!serviceSelect) return;

fetch('/booking/get-services')
    .then(response => response.json())
    .then(services => {
        serviceSelect.innerHTML = '<option value="" style="background-color: #2a3135; color: #e0e0e0;">Select a service</option>';
        services.forEach(service => {
            const option = document.createElement('option');
            option.value = JSON.stringify({
                SERVICE_ID: service.IDNo,
                SERVICE_NAME: service.SERVICE_NAME,
                SERVICE_COST: service.SERVICE_COST
            });
            option.textContent = service.SERVICE_NAME;
            serviceSelect.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error fetching services:', error);
        toastError('Error', 'Failed to load services. Please try again.');
    });
}

// Load booking details
function loadBookingDetails(bookingId) {
const bookingIdInput = document.getElementById(`bookingID-${bookingId}`);
if (!bookingIdInput) {
    console.error('Booking ID input not found.');
    return;
}
const bookingIdValue = bookingIdInput.value;
if (!bookingIdValue) {
    console.error('Booking ID is missing.');
    return;
}



fetch(`/booking/booking_details/${bookingIdValue}`)
    .then(response => response.json())
    .then(data => {

        
        if (!data) {
            console.error('No booking data received.');
            return;
        }

        // Update Room Type
        if (data.ROOM_TYPE) {
            const roomTypeElement = document.getElementById(`room-type-${bookingId}`);
            if (roomTypeElement) roomTypeElement.textContent = data.ROOM_TYPE;
        }

        // Update Guest Type and Level - we'll fetch this separately
        // For now, show default values and fetch guest details
        const guestTypeElement = document.getElementById(`guest-type-${bookingId}`);
        const guestLevelElement = document.getElementById(`guest-level-${bookingId}`);
        
        if (guestTypeElement) guestTypeElement.textContent = 'Loading...';
        if (guestLevelElement) guestLevelElement.textContent = 'Loading...';
        
        // Fetch guest details if we have a customer ID
        if (data.CUSTOMER_ID) {
            loadGuestTypeAndLevel(data.CUSTOMER_ID, bookingId);
        } else {

            if (guestTypeElement) guestTypeElement.textContent = 'N/A';
            if (guestLevelElement) guestLevelElement.textContent = 'N/A';
        }

        // Debug: Log all available data fields


        // Update Room Rate
        let roomRate = parseFloat(data.ROOM_RATE) || 0;
        const roomRateElement = document.getElementById(`room-rate-${bookingId}`);
        if (roomRateElement) roomRateElement.textContent = `₱${roomRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        // Total Days: original + extended
        let totalDays = parseInt(data.TOTAL_DAYS, 10) || 0;
        let extendedDays = parseInt(data.EXTENDED_DAYS, 10) || 0;

        let extendedText = extendedDays > 0
            ? ` <span class="text-muted">(Extended ${extendedDays} day${extendedDays > 1 ? 's' : ''})</span>`
            : '';

        const totalDaysElement = document.getElementById(`total-days-${bookingId}`);
        if (totalDaysElement) totalDaysElement.innerHTML = `${totalDays}${extendedText}`;

        // Total Room Cost
        let totalRoomCost = parseFloat(data.TOTAL_ROOM_COST) || 0;
        let formattedTotalRoomCost = totalRoomCost.toLocaleString('en-US', { minimumFractionDigits: 2 });
        let roomCost = parseFloat(data.ROOM_COST) || 0;
        let formattedRoomCost = roomCost.toLocaleString('en-US', { minimumFractionDigits: 2 });
        


        // Total Paid
        let totalPaid = parseFloat(data.TOTAL_PAID) || 0;
        let formattedPaidAmount = totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 });

        // Payment Status Badge
        let paymentStatusElement = '';
        if (data.PAYMENT_STATUS === 'paid') {
            paymentStatusElement = `<span class="badge bg-success">Paid</span>`;
        } else if (data.PAYMENT_STATUS === 'partial_paid') {
            paymentStatusElement = `<span class="badge bg-warning">Partial Paid</span><br><small class="text-muted">Paid: ₱${formattedPaidAmount}</small>`;
        } else {
            paymentStatusElement = `<span class="badge bg-warning">Unpaid</span>`;
        }

        // Inject Total Room Cost and Payment Badge
        const totalRoomCostElement = document.getElementById(`total-room-cost-${bookingId}`);
        if (totalRoomCostElement) {
            totalRoomCostElement.innerHTML = `₱${formattedRoomCost} ${paymentStatusElement}`;
        }
        
        // Add hidden field for room cost calculation
        const hiddenRoomCostField = document.getElementById(`hidden-room-cost-${bookingId}`);
        if (hiddenRoomCostField) {
            hiddenRoomCostField.value = roomCost.toString();
        } else {
            // Create hidden field if it doesn't exist
            const hiddenField = document.createElement('input');
            hiddenField.type = 'hidden';
            hiddenField.id = `hidden-room-cost-${bookingId}`;
            hiddenField.value = roomCost.toString();
            document.body.appendChild(hiddenField);
        }
        
        // Update hidden total room cost field for total calculation
        const hiddenTotalRoomCostField = document.getElementById(`hidden-total-room-cost-${bookingId}`);
        if (hiddenTotalRoomCostField) {
            hiddenTotalRoomCostField.value = totalRoomCost.toString();
    
        }

        // Grand Total and Balance
        const grandTotalElement = document.getElementById(`grand-total-${bookingId}`);
        if (grandTotalElement) grandTotalElement.textContent = `₱${formattedTotalRoomCost}`;

        const balanceElement = document.getElementById(`Balance-${bookingId}`);
        if (balanceElement) {
            balanceElement.textContent = `₱${(totalRoomCost - totalPaid).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            balanceElement.style.color = (totalRoomCost - totalPaid) > 0 ? 'white' : 'green';
        }

        // Delay to ensure UI elements are ready, then calculate totals
        setTimeout(() => {
            calculateTotalCost(bookingId);
            calculateBalance(bookingId, bookingIdValue);
        }, 300);
    })
    .catch(error => {
        console.error('Error fetching booking details:', error);
        toastError('Error', 'Failed to load booking details. Please try again.');
    });
}

// Load guest type and level from customer table
function loadGuestTypeAndLevel(customerId, bookingId) {
    // Fetch customer details from the guest/customer table
    fetch(`/guest/api/guests/${customerId}`)
        .then(response => response.json())
        .then(response => {
            // Check if response has data property (like other guest API responses)
            const customerData = response.data || response;
            
            // Check if we have valid customer data
            if (!customerData || !customerData.IDNo) {
                const guestTypeElement = document.getElementById(`guest-type-${bookingId}`);
                const guestLevelElement = document.getElementById(`guest-level-${bookingId}`);
                
                if (guestTypeElement) guestTypeElement.textContent = 'N/A';
                if (guestLevelElement) guestLevelElement.textContent = 'N/A';
                return;
            }
            
            let guestType = 'N/A';
            let guestLevel = 'N/A';
            
            // Map guest type based on the values from guest-profile.ejs
            if (customerData.TYPE) {
                const typeValue = parseInt(customerData.TYPE);
                switch(typeValue) {
                    case 1: guestType = 'Golf'; break;
                    case 2: guestType = 'Group'; break;
                    case 3: guestType = 'Casino'; break;
                    case 4: guestType = 'Learning'; break;
                    case 5: guestType = 'Relaxing'; break;
                    case 6: guestType = 'Entertainment'; break;
                    case 7: guestType = 'Investment'; break;
                    default: guestType = 'N/A';
                }
            }
            
            // Map guest level based on the values from guest-profile.ejs
            if (customerData.LEVEL) {
                const levelValue = parseInt(customerData.LEVEL);
                switch(levelValue) {
                    case 1: guestLevel = 'VIP'; break;
                    case 2: guestLevel = 'Regular'; break;
                    case 3: guestLevel = 'New Guest'; break;
                    default: guestLevel = 'N/A';
                }
            }
            
            // Update the display elements
            const guestTypeElement = document.getElementById(`guest-type-${bookingId}`);
            const guestLevelElement = document.getElementById(`guest-level-${bookingId}`);
            
            if (guestTypeElement) {
                guestTypeElement.textContent = guestType;
            }
            
            if (guestLevelElement) {
                guestLevelElement.textContent = guestLevel;
            }
        })
        .catch(error => {
            // Set fallback values on error
            const guestTypeElement = document.getElementById(`guest-type-${bookingId}`);
            const guestLevelElement = document.getElementById(`guest-level-${bookingId}`);
            
            if (guestTypeElement) guestTypeElement.textContent = 'N/A';
            if (guestLevelElement) guestLevelElement.textContent = 'N/A';
        });
}

// Load guest details
function loadGuestDetails(bookingId) {
const bookingIdInput = document.getElementById(`bookingID-${bookingId}`);
if (!bookingIdInput) {
    console.error('Booking ID input not found.');
    return;
}
const bookingIdValue = bookingIdInput.value;
if (!bookingIdValue) {
    console.error('Booking ID is missing.');
    return;
}



fetch(`/booking/get-booking-services/${bookingIdValue}`)
    .then(response => response.json())
    .then(response => {
        // Handle new response format: { success: true, data: [...] }
        const services = response.data || response;
        
        // Add fetched services to addedServicesMap using the same bookingId
        if (!addedServicesMap[bookingId]) {
            addedServicesMap[bookingId] = [];
        }

        services.forEach(service => {
            // Validate service data before adding
            // Use correct database field names: QTY and TOTAL_COST
            const serviceCost = parseFloat(service.TOTAL_COST) || 0;
            const quantity = parseInt(service.QTY) || 0;
            
            // Only add services with valid cost and quantity
            if (serviceCost > 0 && quantity > 0 && !isNaN(serviceCost) && !isNaN(quantity)) {
                if (!addedServicesMap[bookingId].some(s => s.SERVICE_ID === service.SERVICE_ID)) {
                    addedServicesMap[bookingId].push({
                        SERVICE_ID: service.SERVICE_ID,
                        SERVICE_NAME: service.SERVICE_NAME,
                        SERVICE_COST: serviceCost,
                        QUANTITY: quantity,
                        STATUS: service.STATUS || "unpaid"
                    });

                }
            } else {

            }
        });

        // Refresh the displayed list using the same bookingId
        updateAddedServicesList(bookingId);
        
        // Recalculate totals after loading services
        calculateTotalCost(bookingId);
    })
    .catch(error => {
        console.error('Error fetching guest details:', error);
        toastError('Error', 'Failed to load guest details. Please try again.');
    });
}

// Load transfer history
// This function loads transfer logs from the dashboard endpoint
// Since both dashboard and calendar transfers use the same room_transfer_logs table,
// this should show all transfers regardless of how they were initiated
function loadTransferHistory(bookingId, currentBookingId) {
    if (!bookingId) {
        console.error('Booking ID is missing for transfer history.');
        return;
    }

    fetch(`/dashboard/transfer-logs/${bookingId}`)
        .then(response => response.json())
        .then(data => {
         
            console.log('📊 Transfer logs received:', data);
            
            const transferHistoryContainer = document.getElementById(`transfer-history-${bookingId}`);
            const timelineList = document.getElementById(`timeline-list-${bookingId}`);
            
            if (data.length > 0) {
                // Show transfer history section
                transferHistoryContainer.style.display = 'block';
                
                // Clear existing timeline
                timelineList.innerHTML = '';
                
                // Build a proper room progression timeline
                const roomProgression = [];
                
                // Add the original room (before any transfers)
                if (data.length > 0) {
                    // Get the first transfer's old room as the starting point
                    const firstTransfer = data[0];
                    roomProgression.push({
                        roomNumber: firstTransfer.OldRoomNumber,
                        date: firstTransfer.TRANSFER_DATE,
                        isCurrent: false,
                        description: 'Started in'
                    });
                }
                
                // Add each transfer destination
                data.forEach((log, index) => {
                    const isLast = index === data.length - 1;
                    roomProgression.push({
                        roomNumber: log.NewRoomNumber,
                        date: log.TRANSFER_DATE,
                        isCurrent: isLast,
                        description: isLast ? 'Currently occupied since' : 'Transferred to'
                    });
                });
                
                console.log('🏗️ Room progression built:', roomProgression);
                
                // Render the timeline with proper room progression
                roomProgression.forEach((room, index) => {
                    const li = document.createElement('li');
                    li.className = room.isCurrent ? 'current' : 'past';
                    
                    li.innerHTML = `
                        <span class="point">${room.roomNumber}</span>
                        <p class="transfer-date">
                            ${room.description}<br>
                            ${new Date(room.date).toLocaleString('en-US', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                            })}
                        </p>
                    `;
                    
                    timelineList.appendChild(li);
                });
            } else {
        
                // Hide transfer history section if no transfers
                transferHistoryContainer.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Error fetching transfer history:', error);
            // Hide transfer history section on error
            const transferHistoryContainer = document.getElementById(`transfer-history-${bookingId}`);
            if (transferHistoryContainer) {
                transferHistoryContainer.style.display = 'none';
            }
    });
}

// Update the added services list
function updateAddedServicesList(bookingId) {
const serviceList = document.getElementById(`added-services-list-${bookingId}`);
if (!serviceList) {
    console.log('Service list element not found for booking:', bookingId);
    return;
}

serviceList.innerHTML = '';

let roomServices = addedServicesMap[bookingId] || [];

if (roomServices.length === 0) {
    serviceList.style.display = 'none';
} else {
    serviceList.style.display = 'block';
    
    roomServices.forEach((service, index) => {
        // Validate and ensure proper numeric values
        const serviceCost = parseFloat(service.SERVICE_COST) || 0;
        const quantity = parseInt(service.QUANTITY) || 0;
        
        // Calculate total cost with validation
        const totalCost = serviceCost * quantity;
        
        // Check if calculation is valid
        const costDisplay = (isNaN(totalCost) || totalCost === 0)
            ? '<span class="badge bg-success">FREE</span>'
            : `₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        let statusDisplay;
        if (service.STATUS === 'unpaid') {
            statusDisplay = `<span class="badge bg-warning">UNPAID</span>`;
        } else if (service.STATUS === 'paid') {
            statusDisplay = `<span class="badge bg-success">PAID</span>`;
        } else {
            statusDisplay = `<span class="badge bg-secondary">${service.STATUS}</span>`;
        }

        const isDeletable = service.STATUS !== 'paid';
        const deleteButton = isDeletable
            ? `<button class="btn btn-sm" onclick="removeService(${index}, '${bookingId}')" title="Remove Order" style="background-color: #f96332; border: none; border-radius: 50%; width: 28px; height: 28px; padding: 0; color: #fff; box-shadow: 0px 2px 8px rgba(249, 99, 50, 0.3); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
                <i class="fa fa-trash-alt" style="font-size: 10px;"></i>
               </button>`
            : `<button class="btn btn-sm" disabled title="Paid item cannot be removed" style="background-color: #6c757d; border: none; border-radius: 50%; width: 28px; height: 28px; padding: 0; color: #fff; opacity: 0.6; cursor: not-allowed; display: flex; align-items: center; justify-content: center;">
                <i class="fa fa-trash-alt" style="font-size: 10px;"></i>
               </button>`;

        const serviceRow = document.createElement('div');
        serviceRow.className = 'service-item mb-1';
        serviceRow.style.cssText = 'background: #ffffff; color: #333333; border: 1px solid #e9ecef; border-radius: 6px; padding: 8px; transition: all 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
        
        // Add hover effect
        serviceRow.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        });
        serviceRow.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
        });
        
        serviceRow.innerHTML = `
            <div class="row align-items-center">
                <div class="col-4">
                    <div class="d-flex flex-column">
                        <span style="font-weight: 600; color: #495057; font-size: 0.9rem;">${service.SERVICE_NAME || 'Unknown Service'}</span>
                    </div>
                </div>
                <div class="col-2 text-center">
                    <span style="font-weight: 600; color: #333333; font-size: 0.9rem;">${quantity}</span>
                </div>
                <div class="col-2 text-center">
                    <span style="font-weight: 600; color: #28a745; font-size: 0.9rem;">${costDisplay}</span>
                </div>
                <div class="col-2 text-center">
                    ${statusDisplay}
                </div>
                <div class="col-2 text-center">
                    ${deleteButton}
                </div>
            </div>
        `;
        serviceList.appendChild(serviceRow);
    });
}

// Calculate total cost and balance
calculateTotalCost(bookingId);
const bookingIdInput = document.getElementById(`bookingID-${bookingId}`);
if (bookingIdInput) {
    const bookingIdValue = bookingIdInput.value;
    if (bookingIdValue) {
        calculateBalance(bookingId, bookingIdValue);
    } else {
        calculateBalance(bookingId, bookingId);
    }
} else {
    calculateBalance(bookingId, bookingId);
}
}

// Function to toggle custom cost input for services
function toggleCustomCost(bookingId) {
    const customCostCheckbox = document.getElementById(`custom-cost-checkbox-${bookingId}`);
    const serviceCostInput = document.getElementById(`service-cost-${bookingId}`);
    
    if (!customCostCheckbox || !serviceCostInput) {
        console.error(`❌ Custom cost elements not found for booking ${bookingId}`);
        return;
    }
    
    if (customCostCheckbox.checked) {
        serviceCostInput.style.display = 'block';
        serviceCostInput.disabled = false;
        serviceCostInput.focus();
        console.log(`✅ Manual cost enabled for booking ${bookingId}`);
    } else {
        serviceCostInput.style.display = 'none';
        serviceCostInput.disabled = true;
        serviceCostInput.value = '';
        console.log(`✅ Manual cost disabled for booking ${bookingId}`);
}
}

// Function to add extra services (local version)
function addServiceLocal(bookingId) {
    if (!bookingId) {
        console.error('❌ No bookingId provided to addServiceLocal');
        return;
    }
const serviceSelect = document.getElementById(`extra-service-select-${bookingId}`);
const selectedService = serviceSelect.value;
const quantityInput = document.getElementById(`service-quantity-${bookingId}`);
const customCostInput = document.getElementById(`service-cost-${bookingId}`);
const customCostCheckbox = document.getElementById(`custom-cost-checkbox-${bookingId}`);
const bookingIdInput = document.getElementById(`bookingID-${bookingId}`);

if (selectedService) {
    const service = JSON.parse(selectedService);
    const quantity = parseInt(quantityInput.value, 10);

    if (!addedServicesMap[bookingId]) {
        addedServicesMap[bookingId] = [];
    }

    let roomServices = addedServicesMap[bookingId];
    const existingUnpaid = roomServices.find(s => s.SERVICE_ID === service.SERVICE_ID && s.STATUS !== 'paid');
    
    // Determine the service cost based on checkboxes
    let serviceCost;
    if (customCostCheckbox && customCostCheckbox.checked && customCostInput) {
        const customCost = parseFloat(customCostInput.value);
        if (isNaN(customCost) || customCost < 0) {
            toastWarning('Validation', 'Please enter a valid custom cost!');
            return;
        }
        serviceCost = customCost;
        console.log('✅ Using custom cost:', serviceCost);
    } else {
        // Use default service cost from database
        serviceCost = parseFloat(service.SERVICE_COST);
        console.log('✅ Using default cost:', serviceCost);
    }
    
    if (existingUnpaid) {
        existingUnpaid.QUANTITY += quantity;
        existingUnpaid.SERVICE_COST = serviceCost;
    } else {
        roomServices.push({
            SERVICE_ID: service.SERVICE_ID,
            SERVICE_NAME: service.SERVICE_NAME,
            SERVICE_COST: serviceCost,
            QUANTITY: quantity,
            STATUS: "unpaid"
        });
    }

    // Refresh the list and recalc totals immediately for UI responsiveness
    updateAddedServicesList(bookingId);
    calculateTotalCost(bookingId);

    // Save the updated services to the backend and then update balance
    saveServices(bookingId, bookingId).then((result) => {
        // Update balance after successful save
    calculateBalance(bookingId, bookingId);
    }).catch((error) => {
        console.error('❌ Error saving services:', error);
        // Still update balance even if save fails, to show current state
        calculateBalance(bookingId, bookingId);
    });

    // Reset the dropdown and quantity
    serviceSelect.value = '';
    quantityInput.value = '1';
    customCostInput.value = '';
    customCostCheckbox.checked = false;
    customCostInput.style.display = 'none';
    customCostInput.disabled = true;

    // Show success message
    toastSuccess('Success', 'Service added successfully!');
} else {
    toastWarning('Validation', 'Please select a service before adding!');
}
}

// Save services to backend
function saveServices(bookingId, currentBookingId) {
return new Promise((resolve, reject) => {
let roomServices = addedServicesMap[bookingId];

if (!roomServices || roomServices.length === 0) {
    toastWarning('Info', 'No services added to save!');
        resolve();
    return;
}

// Group services by SERVICE_ID and STATUS to avoid duplication
const serviceMap = new Map();
const ignoredServiceIds = [-999, -101, -102];

roomServices.forEach(service => {
    if (service.STATUS === 'paid') return;
    if (ignoredServiceIds.includes(parseInt(service.SERVICE_ID))) return;

    // Validate service cost and quantity
    const serviceCost = parseFloat(service.SERVICE_COST) || 0;
    const quantity = parseInt(service.QUANTITY) || 0;
    
    // Skip invalid services
    if (isNaN(serviceCost) || isNaN(quantity) || serviceCost < 0 || quantity < 0) {
        console.warn('Invalid service data:', service);
        return;
    }

    const key = `${service.SERVICE_ID}-${service.STATUS}`;
    const totalCost = serviceCost * quantity;

    if (!serviceMap.has(key)) {
        serviceMap.set(key, {
            SERVICE_ID: service.SERVICE_ID,
            QUANTITY: quantity,
            TOTAL_COST: totalCost,
            CUSTOM_COST: serviceCost // Send the actual service cost (custom or default)
        });
    } else {
        const existing = serviceMap.get(key);
        existing.QUANTITY += quantity;
            // Recalculate TOTAL_COST based on the combined quantity and service cost
            existing.TOTAL_COST = existing.QUANTITY * serviceCost;
        // Keep the custom cost if it exists
        if (serviceCost !== existing.CUSTOM_COST) {
            existing.CUSTOM_COST = serviceCost;
        }
        serviceMap.set(key, existing);
    }
});

const servicesData = Array.from(serviceMap.values());

console.log('🚀 Sending services to backend:', servicesData);

if (servicesData.length === 0) {
    toastInfo('Info', 'No new unpaid services to save.');
        resolve();
    return;
}
fetch('/booking/save-booking-services', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        bookingId: bookingId,
        services: servicesData
    })
})
.then(response => response.json())
.then(data => {
    // Services saved successfully
        resolve(data);
})
.catch(error => {
        console.error('❌ Error saving services:', error);
    toastError('Error', 'Failed to save services. Please try again.');
        reject(error);
    });
});
}

// Remove service
function removeService(index, bookingId) {
let roomServices = addedServicesMap[bookingId];
const serviceToRemove = roomServices[index];
if (!serviceToRemove || !serviceToRemove.SERVICE_ID) {
    Swal.fire({
        icon: 'warning',
        title: 'Service not found.',
        confirmButtonText: 'OK'
    });
    return;
}

Swal.fire({
    title: 'Are you sure?',
    text: "Are you sure to remove this service?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, remove it!',
    cancelButtonText: 'Cancel'
}).then((result) => {
    if (result.isConfirmed) {
        const bookingIdInput = document.getElementById(`bookingID-${bookingId}`);
        const bookingIdValue = bookingIdInput ? bookingIdInput.value : null;
        const isExtension = serviceToRemove.SERVICE_NAME === 'Extended Day' || serviceToRemove.SERVICE_ID === -999;
        const isTransport = serviceToRemove.SERVICE_ID === -101 || serviceToRemove.SERVICE_ID === -102;

        fetch('/booking/remove-service', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookingId: bookingIdValue,
                serviceId: serviceToRemove.SERVICE_ID,
                isExtension: isExtension,
                isTransport: isTransport
            })
        })
        .then(response => response.json())
        .then(data => {
            roomServices.splice(index, 1);
            updateAddedServicesList(bookingId);
            calculateTotalCost(bookingId);
            calculateBalance(bookingId, bookingIdValue);
            toastSuccess('Removed', 'Service removed successfully!');
        })
        .catch(error => {
            console.error('Error removing service:', error);
            toastError('Error', 'Failed to remove the service. Please try again.');
        });
    }
});
}

// Calculate total cost
function calculateTotalCost(bookingId) {
    // Get room cost from the hidden field first, then fallback to display element
    let roomCost = 0;
    const hiddenRoomCostField = document.getElementById(`hidden-room-cost-${bookingId}`);
    
    if (hiddenRoomCostField && hiddenRoomCostField.value) {
        roomCost = parseFloat(hiddenRoomCostField.value) || 0;
    } else {
        // Fallback to extracting from display element
        const roomCostElement = document.getElementById(`total-room-cost-${bookingId}`);
        if (roomCostElement) {
            const roomCostText = roomCostElement.textContent;
            const roomCostMatch = roomCostText.match(/₱([\d,]+\.?\d*)/);
            if (roomCostMatch) {
                roomCost = parseFloat(roomCostMatch[1].replace(/,/g, '')) || 0;
            }
        }
    }
    
    // Get late checkout charge
    let lateCheckoutChargeText = document.getElementById(`late-checkout-charge-${bookingId}`)?.textContent || '0';
    let lateCheckoutCharge = (lateCheckoutChargeText !== "Free" && lateCheckoutChargeText !== "")
        ? parseFloat(lateCheckoutChargeText.replace('₱', '').replace(/,/g, '')) || 0
        : 0;

    // Compute total extra services cost with validation
    let roomServices = addedServicesMap[bookingId] || [];
    let extraServicesCost = roomServices.reduce((sum, service) => {
        if (service.SERVICE_ID === -999 || service.SERVICE_NAME === 'Extended Day') return sum;
        
        // Validate service cost and quantity
        const serviceCost = parseFloat(service.SERVICE_COST) || 0;
        const quantity = parseInt(service.QUANTITY) || 0;
        
        // Only add if both values are valid numbers
        if (!isNaN(serviceCost) && !isNaN(quantity)) {
            return sum + (serviceCost * quantity);
        }
        return sum;
    }, 0);

    // Ensure all values are valid numbers
    if (isNaN(roomCost)) roomCost = 0;
    if (isNaN(lateCheckoutCharge)) lateCheckoutCharge = 0;
    if (isNaN(extraServicesCost)) extraServicesCost = 0;

    // Compute final grand total
    let grandTotal = roomCost + extraServicesCost + lateCheckoutCharge;

    // Validate grand total
    if (isNaN(grandTotal)) grandTotal = 0;

    // Format grand total with currency format
    let formattedGrandTotal = grandTotal.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    // Update Grand Total Display
    const grandTotalElement = document.getElementById(`grand-total-${bookingId}`);
    if (grandTotalElement) {
        grandTotalElement.textContent = `₱${formattedGrandTotal}`;
    }
    
    // Debug logging

}

// Calculate balance
function calculateBalance(bookingId, currentBookingId) {
fetch(`/booking/unpaid_balance/${bookingId}`)
    .then(response => response.json())
    .then(data => {
        let totalUnpaid = data.total_unpaid_balance || 0;
        let reservationFee = data.reservation_fee || 0;
        let discountAmount = data.discount_amount || 0;

      

        // Handle Reservation Fee Display
        if (reservationFee > 0) {
            const reservationFeeRow = document.getElementById(`reservation-fee-row-${bookingId}`);
            const reservationFeeElement = document.getElementById(`reservation-fee-${bookingId}`);
            if (reservationFeeRow && reservationFeeElement) {
                reservationFeeRow.style.display = 'block';
                reservationFeeElement.innerHTML = `<span class="text-danger"><strong>-₱${parseFloat(reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>`;
                // console.log(`✅ Reservation Fee row displayed: -₱${parseFloat(reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            } else {
                console.error(`❌ Reservation Fee elements not found for booking ${bookingId}`);
            }
        } else {
            const reservationFeeRow = document.getElementById(`reservation-fee-row-${bookingId}`);
            if (reservationFeeRow) {
                reservationFeeRow.style.display = 'none';
                // console.log(`✅ Reservation Fee row hidden (no fee)`);
            }
        }
        
        // Also update billing modal elements if they exist
        const billingReservationFeeRow = document.getElementById('reservationFeeRow');
        const billingReservationFeeElement = document.getElementById('billingReservationFeeAmount');
        if (billingReservationFeeRow && billingReservationFeeElement) {
            if (reservationFee > 0) {
                billingReservationFeeRow.style.display = 'block';
                billingReservationFeeElement.textContent = `₱${parseFloat(reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                console.log(`✅ Reservation Fee displayed in billing modal: ${reservationFee}`);
            } else {
                billingReservationFeeRow.style.display = 'none';
            }
        }

        // Handle Discount Display
        if (discountAmount > 0) {
            const discountRow = document.getElementById(`discount-row-${bookingId}`);
            const discountAmountElement = document.getElementById(`discount-amount-${bookingId}`);
            if (discountRow && discountAmountElement) {
                discountRow.style.display = 'block';
                discountAmountElement.innerHTML = `<span class="text-danger"><strong>-₱${parseFloat(discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>`;
                // console.log(`✅ Discount row displayed: -₱${parseFloat(discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            } else {
                console.error(`❌ Discount elements not found for booking ${bookingId}`);
            }
        } else {
            const discountRow = document.getElementById(`discount-row-${bookingId}`);
            if (discountRow) {
                discountRow.style.display = 'none';
                // console.log(`✅ Discount row hidden (no discount)`);
            }
        }
        
        // Also update billing modal elements if they exist
        const billingDiscountRow = document.getElementById('discountRow');
        const billingDiscountElement = document.getElementById('billingDiscountAmount');
        if (billingDiscountRow && billingDiscountElement) {
            if (discountAmount > 0) {
                billingDiscountRow.style.display = 'block';
                billingDiscountElement.textContent = `₱${parseFloat(discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                console.log(`✅ Discount displayed in billing modal: ${discountAmount}`);
            } else {
                billingDiscountRow.style.display = 'none';
            }
        }

        // Format Balance with Comma Separator
        let formattedBalance = totalUnpaid.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // Display Balance in UI
        let balanceElement = document.getElementById(`Balance-${bookingId}`);
            
        if (balanceElement) {
            if (totalUnpaid > 0) {
                balanceElement.innerHTML = `<span class="text-danger"><strong>₱${formattedBalance}</strong></span>`;
            } else {
                balanceElement.innerHTML = `<span class="text-success"><strong>₱0.00</strong></span>`;
            }
            } else {
                console.error(`❌ Balance element not found: Balance-${bookingId}`);
        }
    })
    .catch(error => {
            console.error('❌ Error fetching balance:', error);
    });
}

// Function to show billing
function showBilling(bookingId) {
    // Open billing modal instead of redirecting
    const billingModal = document.getElementById('modal-billing');
    if (billingModal) {
        // Set the booking ID in the hidden field
        const hiddenBookingId = document.getElementById('hiddenBookingId');
        if (hiddenBookingId) {
            hiddenBookingId.value = bookingId;
        }
        
        // Update the receipt ID
        const receiptId = document.getElementById('billingReceiptId');
        if (receiptId) {
            receiptId.textContent = bookingId;
        }
        
        // Update the confirmation number
        const confNumber = document.getElementById('confNumber');
        if (confNumber) {
            confNumber.textContent = bookingId;
        }
        
        // Show the billing modal directly without closing the checkout modal
        const modal = new bootstrap.Modal(billingModal);
        modal.show();
        
        // Load billing data
        loadBillingData(bookingId);
    } else {
        console.error('Billing modal not found');
        // Fallback to redirect if modal not found
        window.open(`/booking/billing/${bookingId}`, '_blank');
    }
}

// Real working extend modal function
function openExtendModal(roomId, checkoutDate, bookingId) {
  // Create the extend modal HTML
  const modalHTML = `
    <div class="modal fade" id="extendStayModal_${bookingId}" tabindex="-1" aria-labelledby="extendStayModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="background-color: #ffffff;  border: 2px solid #055160; ">
          <div class="modal-header" style="background-color: #ffffff; border-bottom: 1px solid #dee2e6;">
            <h5 class="modal-title" id="extendStayModalLabel" style="color: #495057;">
              <i class="fas fa-calendar-plus me-2"></i>Extend Stay
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" style="background-color: #ffffff; color: #495057;">
            <div class="row mb-3">
              <div class="col-12">
                <div class="alert alert-info">
                  <i class="fas fa-info-circle me-2"></i>
                  <strong>Current Check-out:</strong> ${new Date(checkoutDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>
            </div>
            
            <div class="row mb-3">
              <div class="col-md-12 mb-3">
                <label for="extensionDays_${bookingId}" class="form-label" style="color: #495057;">
                  <i class="fas fa-calendar-day me-2"></i>Number of Days to Extend
                </label>
                <input type="number" id="extensionDays_${bookingId}" class="form-control" min="1" max="30" placeholder="Enter number of days" onchange="checkRoomAvailability('${roomId}', '${checkoutDate}', this.value, '${bookingId}')" style="background-color: #ffffff; border: 1px solid #ced4da; color: #495057;">
             
              </div>
              <div class="col-md-12">
                <label for="costPerDay_${bookingId}" class="form-label" style="color: #495057;">
                  <i class="fas fa-dollar-sign me-2"></i>Cost Per Day
                </label>
                <input type="number" id="costPerDay_${bookingId}" class="form-control" min="0" step="0.01" placeholder="Enter cost per day" onchange="calculateExtensionCost('${bookingId}')" style="background-color: #ffffff; border: 1px solid #ced4da; color: #495057;">
          
              </div>
            </div>
            
            <div id="roomSelectionWrapper_${bookingId}" style="display: none;">
              <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Room Change Required:</strong> The current room is not available for the selected extension period.
              </div>
              <div id="availableRoomsGrid_${bookingId}">
                <!-- Available rooms will be populated here -->
              </div>
            </div>
            
            <div id="extensionSummary_${bookingId}" style="display: none;">
              <div class="card" style="background-color: #ffffff; border: 1px solid #dee2e6;">
                <div class="card-body" style="background-color: #ffffff;">
                  <h6 class="card-title" style="color: #495057;">
                    <i class="fas fa-calculator me-2"></i>Extension Summary
                  </h6>
                  <div class="row">
                    <div class="col-6">
                      <small class="text-muted">New Check-out:</small>
                      <div id="newCheckoutDate_${bookingId}" class="fw-bold" style="color: #495057;"></div>
                    </div>
                    <div class="col-6">
                      <small class="text-muted">Total Days:</small>
                      <div id="totalExtensionDays_${bookingId}" class="fw-bold" style="color: #495057;"></div>
                    </div>
                  </div>
                  <div class="row mt-2">
                    <div class="col-6">
                      <small class="text-muted">Cost Per Day:</small>
                      <div id="costPerDayDisplay_${bookingId}" class="fw-bold" style="color: #495057;">₱0.00</div>
                    </div>
                    <div class="col-6">
                      <small class="text-muted">Total Extension Cost:</small>
                      <div id="totalExtensionCost_${bookingId}" class="fw-bold" style="color: #28a745;">₱0.00</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer" style="background-color: #ffffff; border-top: 1px solid #dee2e6;">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="confirmExtendButton_${bookingId}" onclick="confirmExtension('${roomId}', '${checkoutDate}', '${bookingId}')" disabled>
              <i class="fas fa-check me-2"></i>Confirm Extension
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Remove any existing modal
  const existingModal = document.getElementById(`extendStayModal_${bookingId}`);
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Show the modal
  const modal = new bootstrap.Modal(document.getElementById(`extendStayModal_${bookingId}`));
  modal.show();
  
  // Clean up when modal is hidden
  const modalElement = document.getElementById(`extendStayModal_${bookingId}`);
  modalElement.addEventListener('hidden.bs.modal', function() {
    modalElement.remove();
  });
}

// Function to calculate extension cost
function calculateExtensionCost(bookingId) {
  const daysToExtend = document.getElementById(`extensionDays_${bookingId}`).value;
  const costPerDay = document.getElementById(`costPerDay_${bookingId}`).value;
  
  if (daysToExtend && costPerDay) {
    const totalCost = parseFloat(daysToExtend) * parseFloat(costPerDay);
    
    // Update cost per day display
    const costPerDayDisplay = document.getElementById(`costPerDayDisplay_${bookingId}`);
    if (costPerDayDisplay) {
      costPerDayDisplay.textContent = `₱${parseFloat(costPerDay).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
    
    // Update total extension cost
    const totalExtensionCost = document.getElementById(`totalExtensionCost_${bookingId}`);
    if (totalExtensionCost) {
      totalExtensionCost.textContent = `₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
  }
}

// Function to check room availability for extension
function checkRoomAvailability(roomId, checkoutDate, daysToExtend, bookingId) {
  if (!daysToExtend) {
    document.getElementById(`roomSelectionWrapper_${bookingId}`).style.display = 'none';
    document.getElementById(`extensionSummary_${bookingId}`).style.display = 'none';
    document.getElementById(`confirmExtendButton_${bookingId}`).disabled = true;
    return;
  }
  
  // Calculate new checkout date
  const currentCheckout = new Date(checkoutDate);
  const newCheckout = new Date(currentCheckout);
  newCheckout.setDate(currentCheckout.getDate() + parseInt(daysToExtend));
  
  // Update summary
  document.getElementById(`newCheckoutDate_${bookingId}`).textContent = newCheckout.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  document.getElementById(`totalExtensionDays_${bookingId}`).textContent = `${daysToExtend} day${daysToExtend > 1 ? 's' : ''}`;
  document.getElementById(`extensionSummary_${bookingId}`).style.display = 'block';
  
  // Calculate extension cost if cost per day is set
  calculateExtensionCost(bookingId);
  
  // Check if current room is available for extension
  fetch(`/dashboard/extend-check-room?roomId=${roomId}&checkoutDate=${checkoutDate}&daysToExtend=${daysToExtend}`)
    .then(response => response.json())
    .then(data => {
      if (data.currentRoomAvailable) {
        // Current room is available
        document.getElementById(`roomSelectionWrapper_${bookingId}`).style.display = 'none';
        document.getElementById(`confirmExtendButton_${bookingId}`).disabled = false;
      } else {
        // Need to change rooms
        document.getElementById(`roomSelectionWrapper_${bookingId}`).style.display = 'block';
        renderAvailableRooms(data.availableRooms, bookingId);
        document.getElementById(`confirmExtendButton_${bookingId}`).disabled = true;
      }
    })
    .catch(error => {
      console.error('Error checking room availability:', error);
      Swal.fire({
        title: 'Error',
        text: 'Failed to check room availability. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    });
}

// Function to render available rooms for extension
function renderAvailableRooms(availableRooms, bookingId) {
  const grid = document.getElementById(`availableRoomsGrid_${bookingId}`);
  grid.innerHTML = '';
  
  if (!availableRooms || availableRooms.length === 0) {
    grid.innerHTML = '<p class="text-center text-muted">No available rooms for extension.</p>';
    return;
  }
  
  // Group rooms by floor
  const roomsByFloor = availableRooms.reduce((acc, room) => {
    const floor = room.ROOM_FLOOR;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {});
  
  // Create rows for each floor
  Object.keys(roomsByFloor).forEach((floor) => {
    const floorContainer = document.createElement("div");
    floorContainer.className = "floor-container mb-3";
    
    const floorRow = document.createElement("div");
    floorRow.className = "floor-row d-flex flex-wrap justify-content-center gap-2";
    
    roomsByFloor[floor].forEach((room) => {
      const roomCard = document.createElement("div");
      
      // Assign color class based on floor
      let colorClass = "";
      switch (parseInt(floor, 10)) {
        case 3: colorClass = "border-success"; break;
        case 4: colorClass = "border-primary"; break;
        case 5: colorClass = "border-danger"; break;
        case 6: colorClass = "border-warning"; break;
        default: colorClass = "border-secondary"; break;
      }
      
      roomCard.className = `room-item ${colorClass} p-2 border rounded text-center`;
      roomCard.style.cssText = "width: 80px; cursor: pointer; transition: all 0.2s ease;";
      roomCard.textContent = room.ROOM_NUMBER;
      roomCard.setAttribute("data-room-id", room.ROOM_ID);
      
      roomCard.addEventListener('click', () => {
        // Remove selection from all rooms
        document.querySelectorAll(`#availableRoomsGrid_${bookingId} .room-item`).forEach(item => {
          item.classList.remove('bg-primary', 'text-white');
        });
        // Highlight selected room
        roomCard.classList.add('bg-primary', 'text-white');
        // Store selected room ID
        window.selectedExtensionRoomId = room.ROOM_ID;
      });
      
      roomCard.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.05)';
      });
      
      roomCard.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
      });
      
      floorRow.appendChild(roomCard);
    });
    
    floorContainer.appendChild(floorRow);
    grid.appendChild(floorContainer);
  });
}

// Function to confirm extension
function confirmExtension(roomId, checkoutDate, bookingId) {
  const daysToExtend = document.getElementById(`extensionDays_${bookingId}`).value;
  const costPerDay = document.getElementById(`costPerDay_${bookingId}`).value;
  
  if (!daysToExtend) {
    Swal.fire({
      title: 'Validation Error',
      text: 'Please select the number of days to extend.',
      icon: 'warning',
      confirmButtonText: 'OK'
    });
    return;
  }
  
  if (!costPerDay || parseFloat(costPerDay) <= 0) {
    Swal.fire({
      title: 'Validation Error',
      text: 'Please enter a valid cost per day.',
      icon: 'warning',
      confirmButtonText: 'OK'
    });
    return;
  }
  
  // Check if room change is required
  const roomSelectionWrapper = document.getElementById(`roomSelectionWrapper_${bookingId}`);
  const isRoomChangeRequired = roomSelectionWrapper.style.display !== 'none';
  
  if (isRoomChangeRequired && !window.selectedExtensionRoomId) {
    Swal.fire({
      title: 'Room Selection Required',
      text: 'Please select a new room for the extension.',
      icon: 'warning',
      confirmButtonText: 'OK'
    });
    return;
  }
  
  // Calculate total cost for confirmation
  const totalCost = parseFloat(daysToExtend) * parseFloat(costPerDay);
  
  // Show confirmation dialog with cost details
  Swal.fire({
    title: 'Confirm Extension',
    html: `Are you sure you want to extend the stay by <strong>${daysToExtend} day${daysToExtend > 1 ? 's' : ''}</strong>?<br><br>
           <strong>Cost per day:</strong> ₱${parseFloat(costPerDay).toLocaleString('en-US', { minimumFractionDigits: 2 })}<br>
           <strong>Total extension cost:</strong> ₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes, Extend!',
    cancelButtonText: 'Cancel',
    reverseButtons: true
  }).then((result) => {
    if (result.isConfirmed) {
      // Process the extension
      processExtension(roomId, checkoutDate, daysToExtend, bookingId, window.selectedExtensionRoomId);
    }
  });
}

// Function to process the extension
function processExtension(roomId, checkoutDate, daysToExtend, bookingId, newRoomId = null) {
  const extensionData = {
    roomId: roomId,
    checkoutDate: checkoutDate,
    daysToExtend: parseInt(daysToExtend),
    bookingId: bookingId,
    newRoomId: newRoomId
  };
  
  fetch('/dashboard/extend-stay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(extensionData)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      Swal.fire({
        title: 'Extension Successful!',
        text: `Stay has been extended by ${daysToExtend} day${daysToExtend > 1 ? 's' : ''}.`,
        icon: 'success',
        confirmButtonText: 'OK'
      }).then(() => {
        // Close modal and refresh page
        const modal = bootstrap.Modal.getInstance(document.getElementById(`extendStayModal_${bookingId}`));
        if (modal) modal.hide();
        location.reload();
      });
    } else {
      Swal.fire({
        title: 'Extension Failed',
        text: result.message || 'An error occurred while processing the extension.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error processing extension:', error);
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while processing the extension.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Make functions globally available
window.addService = addService;
window.removeService = removeService;
window.saveServices = saveServices;
window.calculateTotalCost = calculateTotalCost;
window.calculateBalance = calculateBalance;
window.showBilling = showBilling;
window.openExtendModal = openExtendModal;
window.checkRoomAvailability = checkRoomAvailability;
window.renderAvailableRooms = renderAvailableRooms;
window.confirmExtension = confirmExtension;
window.processExtension = processExtension;
window.calculateExtensionCost = calculateExtensionCost;
window.openRoomMenuModal = openRoomMenuModal;
window.openCheckoutBacktrackModal = openCheckoutBacktrackModal;
window.toggleCustomCost = toggleCustomCost;

// Initialize transfer modal immediately
function initializeTransferModal() {
    // Add CSS styles for transfer modal z-index and light theme overrides
    if (!document.getElementById('transfer-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'transfer-modal-styles';
        style.textContent = `
            /* Global light theme overrides for all modals */
            .modal .table-hover > tbody > tr:hover > td,
            .modal .table-hover > tbody > tr:hover > th {
                background-color: #f8f9fa !important;
                color: #495057 !important;
            }
            
            .modal .form-control:hover,
            .modal .form-select:hover {
                background-color: #ffffff !important;
                border-color: #80bdff !important;
                color: #495057 !important;
            }
            
            .modal .form-control:focus,
            .modal .form-select:focus {
                background-color: #ffffff !important;
                border-color: #80bdff !important;
                color: #495057 !important;
                box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25) !important;
            }
            
            .modal .list-group-item:hover {
                background-color: #f8f9fa !important;
                color: #495057 !important;
                border-color: #dee2e6 !important;
            }
            
            .modal .btn:hover {
                opacity: 0.9 !important;
            }
            
            .modal .card:hover {
                box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075) !important;
            }
            
            /* Specific overrides for dynamic room modal */
            [id^="dynamicRoomModal_"] .table-hover > tbody > tr:hover > td,
            [id^="dynamicRoomModal_"] .table-hover > tbody > tr:hover > th {
                background-color: #f8f9fa !important;
                color: #495057 !important;
            }
            
            [id^="dynamicRoomModal_"] .form-control:hover,
            [id^="dynamicRoomModal_"] .form-select:hover {
                background-color: #ffffff !important;
                border-color: #80bdff !important;
                color: #495057 !important;
            }
            
            [id^="dynamicRoomModal_"] .form-control:focus,
            [id^="dynamicRoomModal_"] .form-select:focus {
                background-color: #ffffff !important;
                border-color: #80bdff !important;
                color: #495057 !important;
                box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25) !important;
            }
            
            [id^="dynamicRoomModal_"] .list-group-item:hover {
                background-color: #f8f9fa !important;
                color: #495057 !important;
                border-color: #dee2e6 !important;
            }
            
            [id^="dynamicRoomModal_"] .btn:hover {
                opacity: 0.9 !important;
            }
            
            [id^="dynamicRoomModal_"] .card:hover {
                box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075) !important;
            }
            
            /* Transfer modal specific styles */
            #transferAvailableModal {
                z-index: 1060 !important;
            }
            #transferAvailableModal .modal-backdrop {
                z-index: 1055 !important;
            }
            .modal-backdrop + .modal-backdrop {
                z-index: 1056 !important;
            }
            
            /* Override any oval button styling */
            .btn-oval {
                border-radius: 0.375rem !important;
            }
            
            /* Ensure buttons have standard border radius */
            .btn {
                border-radius: 0.375rem !important;
            }
            
            /* Remove any circular/oval shapes */
            .btn-oval::before,
            .btn-oval::after {
                display: none !important;
            }
            
            /* Transfer History Timeline Styles */
            #timeline {
                margin: 20px 0;
                padding: 20px;
                background: #ffffff;
                border-radius: 8px;
                margin-top: 10px;
                border: 1px solid #dee2e6;
            }
            
            #timeline h6 {
                color: #495057;
                margin-bottom: 15px;
                font-weight: bold;
                text-align: center;
            }
            
        
            
            /* Timeline Line Animation */
            @keyframes drawLine {
                from {
                    transform: scaleX(0);
                    transform-origin: left;
                    opacity: 1;
                }
                to {
                    transform: scaleX(1);
                    transform-origin: left;
                    opacity: 1;
                }
            }
            
            /* Timeline Line */
            #timeline ol {
                position: relative;
                display: block;
                width: 100%;
                max-width: 900px;
                margin-top: 50px;
                margin-bottom: 100px;
                height: 4px;
                background: #D3D3D3;
                opacity: 1;
                transform: scaleX(0);
                transform-origin: left;
                animation: drawLine 1.2s ease-out forwards;
            }
            
            #timeline ol::before,
            #timeline ol::after {
                content: "";
                position: absolute;
                top: -8px;
                display: block;
                width: 0;
                height: 0;
                border-radius: 10px;
                border: 10px solid #D3D3D3;
            }
            
            #timeline ol::before {
                left: -5px;
            }
            
            #timeline ol::after {
                right: -10px;
                border: 10px solid transparent;
                border-right: 0;
                border-left: 20px solid #D3D3D3;
                border-radius: 3px;
            }
            
            /* Ensures proper positioning of each list item */
            #timeline li {
                position: relative;
                display: inline-block;
                width: 150px;
                text-align: center;
                vertical-align: top;
                animation: fadeInScale 0.5s ease-out forwards;
                opacity: 0;
            }
            
            #timeline li:nth-child(1) { animation-delay: 0.3s; }
            #timeline li:nth-child(2) { animation-delay: 0.6s; }
            #timeline li:nth-child(3) { animation-delay: 0.9s; }
            #timeline li:nth-child(4) { animation-delay: 1.2s; }
            
            /* Centers the point within each list item */
            #timeline li .point {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                font-size: 14px;
                font-weight: bold;
                color: white;
                text-align: center;
                margin: 0 auto;
                top: -18px;
            }
            
            /* Past rooms styling - Yellow */
            #timeline li.past .point {
                background: #FFA500;
                border-color: #FFA500;
                color: white;
            }
            
            /* Most recent previous transfer - Dark Blue-Gray */
            #timeline li.previous-transfer .point {
                background: #41516C;
                border-color: #41516C;
                color: white;
            }
            
            /* Current room styling - Reddish-Pink */
            #timeline li.current .point {
                background: #E24A68;
                border-color: #E24A68;
                color: white;
            }
            
            /* Fixing alignment of the date text */
            #timeline li .transfer-date {
                position: absolute;
                bottom: -40px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 12px;
                color: #6c757d;
                text-align: center;
                width: 140px;
                white-space: nowrap;
                margin: 0;
                line-height: 1.2;
            }
            
            /* Timeline Fade-In and Scale */
            @keyframes fadeInScale {
                from {
                    opacity: 0;
                    transform: translateY(-10px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

               /* Search input styling for transfer modal */
            #transferAvailableModal #searchRoomInput {
                background-color: #ffffff !important;
                color: #495057 !important;
                border: 1px solid #ced4da !important;
            }

            #transferAvailableModal #searchRoomInput::placeholder {
                color: #6c757d;
            }
            
            /* Transfer Modal Room Grid Styling */
            #transferAvailableModal .rooms-grid {
                padding: 20px 0;
            }
            
            #transferAvailableModal .floor-header {
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }
            
            #transferAvailableModal .room-grid {
                margin-bottom: 30px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            
            #transferAvailableModal .room-container {
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            #transferAvailableModal .room-container:hover {
                transform: translateY(-3px) scale(1.05);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
            }
            
            #transferAvailableModal .room-button {
                transition: all 0.2s ease;
            }
            
            #transferAvailableModal .room-button:hover {
                color: #007bff !important;
            }
            
            /* Loading and error message styling */
            #transferAvailableModal .text-center.text-muted {
                color: #adb5bd !important;
                font-size: 16px;
                padding: 40px 20px;
            }
            
            #transferAvailableModal .text-center.text-danger {
                color: #dc3545 !important;
                font-size: 16px;
                padding: 40px 20px;
            }
        `;
        document.head.appendChild(style);
    }
    
    let modal = document.getElementById("transferAvailableModal");
    
    // If modal doesn't exist, create it dynamically
    if (!modal) {

        const modalHTML = `
            <div class="modal fade" id="transferAvailableModal" tabindex="-1" aria-labelledby="transferAvailableModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false" style="z-index: 1060;">
                <div class="modal-dialog modal-dialog-centered modal-xl">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #2a3135, #1f2528); border-bottom: 1px solid #495057;">
                            <h5 class="modal-title" id="transferAvailableModalLabel" style="color: #fff; font-weight: 600;">
                                <i class="fas fa-exchange-alt me-2"></i>Select Room for Transfer
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" style="background: #2a3135; color: #fff; padding: 25px;">
                            <div class="rooms-grid">
                                <!-- Rooms will be dynamically added here -->
                            </div>
                        </div>
                        <div class="modal-footer" style="background: #2a3135; border-top: 1px solid #495057; padding: 20px;">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" style="padding: 10px 25px; font-weight: 600;">
                                <i class="fas fa-times me-2"></i>Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById("transferAvailableModal");
    }
    
    const grid = modal.querySelector(".rooms-grid");

    // Create search container div
    const searchContainer = document.createElement("div");
    searchContainer.className = "search-container";
    searchContainer.style.cssText = "text-align: right; margin-bottom: 20px; padding: 15px; background: #495057; border-radius: 8px; border: 1px solid #6c757d;";

    // Create and style search input
    const searchInput = document.createElement("input");
    searchInput.id = "searchRoomInput";
    searchInput.className = "form-control form-control-sm";
    searchInput.placeholder = "Search Room #";
    searchInput.style.cssText = "width: 200px; display: inline-block; background: #ffffff; color: #495057; border: 1px solid #ced4da; border-radius: 6px; padding: 8px 12px;";

    // Add search input to container, then container to modal body
    searchContainer.appendChild(searchInput);
    const modalBody = modal.querySelector(".modal-body");
    modalBody.prepend(searchContainer);

    // ✅ Function to manually open the modal
    window.openTransferModal = function (button) {
        const card = button.closest(".card");
        const currentRoom = card.getAttribute("data-idno");
        const checkInDate = card.getAttribute("data-checkin");
        const checkOutDate = card.getAttribute("data-checkout");
        const bookingId = card.getAttribute("data-booking-id");

        // Reset modal content
        grid.innerHTML = '<p class="text-center text-muted">Loading available rooms...</p>';

        // Format the checkout date properly for MySQL DATETIME
        let formattedCheckOutDate = checkOutDate;
        if (checkOutDate) {
            try {
                const date = new Date(checkOutDate);
                if (!isNaN(date.getTime())) {
                    // Format as YYYY-MM-DD HH:MM:SS
                    formattedCheckOutDate = date.getFullYear() + '-' + 
                        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(date.getDate()).padStart(2, '0') + ' ' + 
                        String(date.getHours()).padStart(2, '0') + ':' + 
                        String(date.getMinutes()).padStart(2, '0') + ':' + 
                        String(date.getSeconds()).padStart(2, '0');
                }
            } catch (error) {
                console.error("Error formatting checkout date:", error);
            }
        }

        // Fetch available rooms for transfer
        fetch(`/dashboard/transfer-available-rooms?currentRoom=${currentRoom}&checkOutDate=${encodeURIComponent(formattedCheckOutDate)}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                // Check if data is an array
                if (!Array.isArray(data)) {
                    console.error("Invalid response format:", data);
                    grid.innerHTML = '<p class="text-center text-danger">Invalid response from server. Please try again.</p>';
                    return;
                }
                
                if (data.length === 0) {
                    grid.innerHTML = '<p class="text-center text-muted">No available rooms for transfer.</p>';
                } else {
                    renderRooms(data, bookingId, currentRoom, checkOutDate);
                }
            })
            .catch((error) => {
                console.error("Error fetching available rooms for transfer:", error);
                grid.innerHTML = '<p class="text-center text-danger">Failed to load rooms. Please try again.</p>';
            });

        // Open modal using Bootstrap's JS API with custom options
        const bootstrapModal = new bootstrap.Modal(modal, {
            backdrop: 'static',
            keyboard: false
        });
        
        // Ensure modal appears on top
        modal.style.zIndex = '1060';
        
        // Handle backdrop properly
        setTimeout(() => {
            const backdrops = document.querySelectorAll('.modal-backdrop');
            if (backdrops.length > 1) {
                // If there are multiple backdrops, ensure the latest one is on top
                backdrops[backdrops.length - 1].style.zIndex = '1055';
            }
        }, 100);
        
        bootstrapModal.show();
    };

    // ✅ Function to group and render rooms
    function renderRooms(rooms, bookingId, currentRoom) {
        grid.innerHTML = ""; // Clear the grid

        // Safety check to ensure rooms is an array
        if (!Array.isArray(rooms)) {
            console.error("renderRooms: rooms is not an array:", rooms);
            grid.innerHTML = '<p class="text-center text-danger">Invalid room data received. Please try again.</p>';
            return;
        }

        // Group rooms by floor
        const groupedRooms = groupRoomsByFloor(rooms);

        // Iterate through each floor and render rooms
        Object.keys(groupedRooms).forEach((floor) => {
            // Create floor header
            const floorHeader = document.createElement("div");
            floorHeader.className = "floor-header mb-3";
            floorHeader.style.cssText = "text-align: center; padding: 10px; background: #495057; border-radius: 8px; border: 1px solid #6c757d;";
            
            let floorColor = "";
            let floorName = "";
            switch(parseInt(floor)) {
                case 3: 
                    floorColor = "#4CAF50"; 
                    floorName = "3rd Floor";
                    break;
                case 4: 
                    floorColor = "#1e1bd6"; 
                    floorName = "4th Floor";
                    break;
                case 5: 
                    floorColor = "#df1818"; 
                    floorName = "5th Floor";
                    break;
                case 6: 
                    floorColor = "#8A2BE2"; 
                    floorName = "6th Floor";
                    break;
                default: 
                    floorColor = "#6c757d"; 
                    floorName = `${floor}th Floor`;
            }
            
            floorHeader.innerHTML = `
                <h6 style="color: #fff; margin: 0; font-weight: 600; display: flex; align-items: center; justify-content: center;">
                    <span style="width: 20px; height: 20px; background: ${floorColor}; border-radius: 50%; margin-right: 10px; display: inline-block;"></span>
                    ${floorName}
                </h6>
            `;
            grid.appendChild(floorHeader);

            const floorRow = document.createElement("div");
            floorRow.className = "room-grid mb-4";
            floorRow.style.cssText = "display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding: 12px; background: #343a40; border-radius: 8px; border: 1px solid #495057;";

            groupedRooms[floor].forEach((room) => {
                let roomStyle = ""; 
                let roomBackground = "#ffffff";

                // Apply top border color based on ROOM_FLOOR
                if (room.ROOM_FLOOR == 3) {
                    roomStyle = "border-top: 5px solid #4CAF50;";
                } else if (room.ROOM_FLOOR == 4) {
                    roomStyle = "border-top: 5px solid #1e1bd6;";
                } else if (room.ROOM_FLOOR == 5) {
                    roomStyle = "border-top: 5px solid #df1818;";
                } else if (room.ROOM_FLOOR == 6) {
                    roomStyle = "border-top: 5px solid #8A2BE2;";
                }

                if (room.OCCUPANT_CHECK_OUT_TODAY) {
                    roomBackground = '#CC9999';
                }

                const roomContainer = document.createElement("div");
                roomContainer.className = "room-container";
                roomContainer.style.cssText = `
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    width: 70px; 
                    height: 70px; 
                    border: 1px solid #dee2e6; 
                    border-radius: 6px; 
                    background-color: ${roomBackground}; 
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12); 
                    margin: 4px; 
                    position: relative; 
                    transition: all 0.3s ease;
                    cursor: pointer;
                    ${roomStyle}
                `;

                const roomButton = document.createElement("button");
                roomButton.className = "room-button";
                roomButton.textContent = `${room.ROOM_NUMBER}`;
                roomButton.style.cssText = "font-size: 14px; font-weight: bold; color: #333333; border: none; background: none; cursor: pointer; text-align: center; width: 100%; height: 100%; padding: 0; border-radius: 6px;";
                
                roomButton.addEventListener("click", () => {
                    handleRoomTransfer(bookingId, currentRoom, room.ROOM_ID, room.ROOM_NUMBER);
                });

                // Add hover effects
                roomContainer.addEventListener('mouseenter', function() {
                    this.style.transform = 'translateY(-3px) scale(1.05)';
                    this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.25)';
                });
                
                roomContainer.addEventListener('mouseleave', function() {
                    this.style.transform = 'translateY(0) scale(1)';
                    this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
                });

                roomContainer.appendChild(roomButton);
                floorRow.appendChild(roomContainer);
            });

            grid.appendChild(floorRow);
        });
    }

    // ✅ Function to group rooms by floor
    function groupRoomsByFloor(rooms) {
        // Safety check to ensure rooms is an array
        if (!Array.isArray(rooms)) {
            console.error("groupRoomsByFloor: rooms is not an array:", rooms);
            return {};
        }
        
        return rooms.reduce((acc, room) => {
            if (!acc[room.ROOM_FLOOR]) {
                acc[room.ROOM_FLOOR] = [];
            }
            acc[room.ROOM_FLOOR].push(room);
            return acc;
        }, {});
    }

    // ✅ Function to handle room transfer
    function handleRoomTransfer(bookingId, oldRoomId, newRoomId, newRoomNumber) {
        // const transferDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const now = new Date();
        const transferDate = now.getFullYear() + '-' + 
                           String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(now.getDate()).padStart(2, '0') + ' ' + 
                           String(now.getHours()).padStart(2, '0') + ':' + 
                           String(now.getMinutes()).padStart(2, '0') + ':' + 
                           String(now.getSeconds()).padStart(2, '0');
        


        Swal.fire({
            title: "Confirm Room Transfer",
            html: `Are you sure you want to transfer to Room<b style="font-weight: bold; color: red;"> ${newRoomNumber}</b>?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, Transfer!",
            cancelButtonText: "Cancel",
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                fetch("/dashboard/transfer-room", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        bookingId,
                        oldRoomId,
                        newRoomId,
                        transferDate,
                    }),
                })
                .then((response) => response.json())
                .then((data) => {
                    if (data.message) {
                        Swal.fire({
                            title: "Transfer Successful!",
                            text: "The room has been successfully transferred.",
                            icon: "success",
                            confirmButtonText: "OK"
                        }).then(() => {
                            location.reload();
                        });
                    } else {
                        Swal.fire({
                            title: "Error",
                            text: data.error,
                            icon: "error",
                            confirmButtonText: "OK"
                        });
                    }
                })
                .catch((error) => {
                    console.error("Error transferring room:", error);
                    Swal.fire({
                        title: "Error",
                        text: "Failed to transfer room. Please try again.",
                        icon: "error",
                        confirmButtonText: "OK"
                    });
                });
            }
        });
    }

    // ✅ Filter rooms by search input
    searchInput.addEventListener("input", () => {
        const searchQuery = searchInput.value.trim().toLowerCase();
        const allRooms = grid.querySelectorAll(".room-container");
        allRooms.forEach((roomContainer) => {
            const roomNumber = roomContainer.querySelector(".room-button").textContent.toLowerCase();
            roomContainer.style.display = roomNumber.includes(searchQuery) ? "flex" : "none";
        });
    });
}

// ✅ Initialize Late Checkout Modal (Dynamic Creation)
function initializeLateCheckoutModal() {
    // Add CSS styles for late checkout modal z-index
    if (!document.getElementById('late-checkout-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'late-checkout-modal-styles';
        style.textContent = `
            #lateCheckoutModal {
                z-index: 1060 !important;
            }
            #lateCheckoutModal .modal-backdrop {
                z-index: 1055 !important;
            }
            .modal-backdrop + .modal-backdrop {
                z-index: 1056 !important;
            }
            
            /* Room grid styling for late checkout modal (same as transfer modal) */
            #lateCheckoutModal .rooms-grid {
                display: block;
                padding: 10px;
                
                border-radius: 12px;
            }

            #lateCheckoutModal .room-grid {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 10px;
                padding: 10px;
                margin-bottom: 1rem;
            }

            #lateCheckoutModal .room-container {
                display: flex;
                justify-content: center;
                align-items: center;
                width: 80px;
                height: 80px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background-color: #fff;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                margin: 5px;
                position: relative;
            }

            #lateCheckoutModal .room-container::before {
                content: "";
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 5px;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
                background-color: inherit;
            }

            #lateCheckoutModal .room-button {
                font-size: 16px;
                font-weight: bold;
                color: #333333;
                border: none;
                background: none;
                cursor: pointer;
                text-align: center;
                width: 100%;
                height: 100%;
                padding: 0;
            }

            #lateCheckoutModal .room-button:hover {
                background-color: #f0f8ff;
                border-radius: 8px;
            }

            /* Search input styling for late checkout modal */
            #lateCheckoutModal #searchLateCheckoutRoomInput {
                width: 150px;
                float: right;
                margin-bottom: 10px;
                background-color: #ffffff !important;
                color: #495057 !important;
                border: 1px solid #ced4da !important;
            }

            #lateCheckoutModal #searchLateCheckoutRoomInput::placeholder {
                color: #6c757d;
            }
        `;
        document.head.appendChild(style);
    }
    
    let modal = document.getElementById("lateCheckoutModal");
    
    // If modal doesn't exist, create it dynamically
    if (!modal) {

        const modalHTML = `
            <div class="modal fade" id="lateCheckoutModal" tabindex="-1" aria-labelledby="lateCheckoutModalLabel" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false" style="z-index: 1060;">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="lateCheckoutModalLabel">Late Check-Out</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p id="lateCheckoutMessage">Checking availability...</p>
                            <div id="lateCheckoutRoomSelection" style="display: none;">
                                <div id="lateCheckoutRoomSelectContainer" class="rooms-grid">
                                    <!-- Rooms will be dynamically added here -->
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmLateCheckoutButton">Confirm Late Check-Out</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        modal = document.getElementById("lateCheckoutModal");
    }
    
    const grid = modal.querySelector("#lateCheckoutRoomSelectContainer");

    // Create and style search input
    const searchInput = document.createElement("input");
    searchInput.id = "searchLateCheckoutRoomInput";
    searchInput.className = "form-control form-control-sm mb-3"; // Smaller input size
    searchInput.placeholder = "Search Room #";

    // Add search input directly to modal body
    const modalBody = modal.querySelector(".modal-body");
    modalBody.prepend(searchInput);

    // Add search functionality
    searchInput.addEventListener("input", function() {
        const searchTerm = this.value.toLowerCase();
        const roomContainers = grid.querySelectorAll(".room-container");
        
        roomContainers.forEach(container => {
            const roomNumber = container.querySelector(".room-button").textContent.toLowerCase();
            if (roomNumber.includes(searchTerm)) {
                container.style.display = "flex";
            } else {
                container.style.display = "none";
            }
        });
    });
    
    // ✅ Function to open late checkout modal
    window.openLateCheckoutModal = function(roomId, checkoutDate, bookingId) {
        window.globalLateCheckoutRoomId = roomId;
        window.globalLateCheckoutBookingId = bookingId;
        window.globalSelectedRoomId = null; // Reset selected room



        document.getElementById("lateCheckoutMessage").textContent = "Checking availability...";
        document.getElementById("lateCheckoutRoomSelection").style.display = "none";
        document.getElementById("lateCheckoutRoomSelectContainer").innerHTML = ""; // Clear previous rooms

        fetch(`/dashboard/late-check-room?roomId=${roomId}&checkoutDate=${checkoutDate}&currentBookingId=${bookingId}`)
            .then(response => response.json())
            .then(data => {
        

                if (!data.needRoomChange) {
                    
                    processLateCheckout(globalLateCheckoutRoomId, null, globalLateCheckoutBookingId);
                    return;
                }

                
                document.getElementById("lateCheckoutMessage").textContent = data.message;
                document.getElementById("lateCheckoutRoomSelection").style.display = "block";

                if (data.availableRooms.length === 0) {
                    document.getElementById("lateCheckoutRoomSelectContainer").innerHTML = '<p class="text-center text-muted">No available rooms</p>';
                } else {
                    // Group rooms by floor
                    const roomsByFloor = data.availableRooms.reduce((acc, room) => {
                        if (!acc[room.ROOM_FLOOR]) acc[room.ROOM_FLOOR] = [];
                        acc[room.ROOM_FLOOR].push(room);
                        return acc;
                    }, {});

                    // Create rows for each floor
                    Object.keys(roomsByFloor).forEach((floor) => {
                        const floorRow = document.createElement("div");
                        floorRow.className = "room-grid mb-4";

                        roomsByFloor[floor].forEach((room) => {
                            let roomStyle = ""; 

                            // Apply top border color based on ROOM_FLOOR
                            if (room.ROOM_FLOOR == 3) {
                                roomStyle = "border-top: 5px solid #4CAF50;";
                            } else if (room.ROOM_FLOOR == 4) {
                                roomStyle = "border-top: 5px solid #1e1bd6;";
                            } else if (room.ROOM_FLOOR == 5) {
                                roomStyle = "border-top: 5px solid #df1818;";
                            } else if (room.ROOM_FLOOR == 6) {
                                roomStyle = "border-top: 5px solid #8A2BE2;";
                            }

                            if (room.OCCUPANT_CHECK_OUT_TODAY) {
                                roomStyle = 'background-color: #CC9999';
                            }

                            const roomContainer = document.createElement("div");
                            roomContainer.className = "room-container";
                            roomContainer.style = roomStyle;

                            const roomButton = document.createElement("button");
                            roomButton.className = "room-button";
                            roomButton.textContent = `${room.ROOM_NUMBER}`;
                            roomButton.addEventListener("click", () => {
                                // Remove selection from all rooms but preserve floor colors
                                document.querySelectorAll(".room-container").forEach((container) => {
                                    // Get the original floor color styling
                                    const computedStyle = window.getComputedStyle(container);
                                    const topBorderColor = computedStyle.borderTopColor;
                                    
                                    // Reset to default border but keep floor color
                                    if (topBorderColor && topBorderColor !== 'rgba(0, 0, 0, 0)') {
                                        // If it has a floor color, preserve it
                                        container.style.border = `1px solid #ddd`;
                                        container.style.borderTop = `5px solid ${topBorderColor}`;
                                    } else {
                                        // If no floor color, just reset to default
                                        container.style.border = "1px solid #ddd";
                                    }
                                });
                                
                                // Highlight selected room with blue border but preserve floor color
                                const selectedTopBorder = window.getComputedStyle(roomContainer).borderTopColor;
                                if (selectedTopBorder && selectedTopBorder !== 'rgba(0, 0, 0, 0)') {
                                    roomContainer.style.border = "6px solid #007bff";
                                    roomContainer.style.borderTop = `10px solid ${selectedTopBorder}`;
                                } else {
                                    roomContainer.style.border = "6px solid #007bff";
                                }
                                
                                window.globalSelectedRoomId = room.ROOM_ID; // Update selected room ID
                            });

                            roomContainer.appendChild(roomButton);
                            floorRow.appendChild(roomContainer);
                        });

                        document.getElementById("lateCheckoutRoomSelectContainer").appendChild(floorRow);
                    });
                }

                // Open modal using Bootstrap's JS API with custom options
                const bootstrapModal = new bootstrap.Modal(modal, {
                    backdrop: 'static',
                    keyboard: false
                });
                
                // Ensure modal appears on top
                modal.style.zIndex = '1060';
                
                // Handle backdrop properly
                setTimeout(() => {
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    if (backdrops.length > 1) {
                        // If there are multiple backdrops, ensure the latest one is on top
                        backdrops[backdrops.length - 1].style.zIndex = '1055';
                    }
                }, 100);
                
                bootstrapModal.show();
            })
            .catch(error => console.error("🚨 Error checking late check-out:", error));
    };

    // ✅ Function to Process Late Check-Out
    window.processLateCheckout = function(currentRoomId, newRoomId, bookingId) {


        // 🔥 Show Swal Confirmation Prompt Before Processing
        Swal.fire({
            title: "Are you sure?",
            text: "Do you want to proceed with Late Check-Out?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, Confirm",
            cancelButtonText: "Cancel",
        }).then((result) => {
            if (result.isConfirmed) {
                // ✅ Only Proceed When User Clicks "Yes, Confirm"
                

                fetch("/dashboard/late-checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        currentRoomId: currentRoomId,
                        newRoomId: newRoomId, // Either null (same room) or a selected room ID
                        bookingId: bookingId,
                    }),
                })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {

                        Swal.fire({
                            icon: "success",
                            title: "Late Check-Out Confirmed",
                            text: "Your Late Check-Out has been successfully processed.",
                        }).then(() => location.reload());
                    } else {

                        Swal.fire({
                            icon: "error",
                            title: "Late Check-Out Failed",
                            text: result.message || "An error occurred while processing Late Check-Out.",
                        });
                    }
                })
                .catch(error => {
                    console.error("🚨 Error processing Late Check-Out:", error);
                    Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: "An unexpected error occurred while processing Late Check-Out.",
                    });
                });
            } else {
                // ❌ User clicked "Cancel" → Do nothing
                
            }
        });
    };

    // ✅ Confirm Button Click Event (Calls processLateCheckout)
    const confirmLateCheckoutButton = document.getElementById("confirmLateCheckoutButton");
    if (confirmLateCheckoutButton) {
        confirmLateCheckoutButton.addEventListener("click", () => {
            const selectedRoomId = window.globalSelectedRoomId;

            if (!selectedRoomId) {
                Swal.fire({
                    icon: "warning",
                    title: "No Room Selected",
                    text: "Please select a room before confirming Late Check-Out.",
                });
                return;
            }

            // ✅ Now this will only run AFTER the user confirms in Swal
            processLateCheckout(window.globalLateCheckoutRoomId, selectedRoomId, window.globalLateCheckoutBookingId);
        });
    }
}

// Try to initialize immediately
initializeTransferModal();
initializeLateCheckoutModal(); // Initialize late checkout modal immediately

// Also initialize when DOM is ready as backup
document.addEventListener("DOMContentLoaded", () => {
    // If not already initialized, try again
    if (typeof window.openTransferModal === 'undefined') {
        initializeTransferModal();
    }
    if (typeof window.openLateCheckoutModal === 'undefined') {
        initializeLateCheckoutModal();
    }
}); 

// Function to open checkout backtrack modal from calendar
function openCheckoutBacktrackModal(bookingId, event) {
    
    
    // Extract event data
    const roomNumber = event.getResources()[0]?.title || 'N/A';
    const guestName = event.title || 'Unknown Guest';
    const checkInDate = event.start;
    const checkOutDate = event.end;
    
    // Calculate days difference
    const daysDiff = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
    
    // Create modal HTML
    const modalHTML = `
       
        <div class="modal fade" id="checkoutBacktrackModal_${bookingId}" tabindex="-1" role="dialog" aria-labelledby="checkoutBacktrackModalLabel" aria-hidden="true" data-keyboard="false" data-bs-backdrop="static" style="z-index: 1060 !important;">
            <div class="modal-dialog modal-lg">
                <div class="modal-content" style="background-color: #ffffff; border: 4px solid #6c757d; border-radius: 8px;">
                    <div class="modal-header" style="background-color: #6c757d; border-bottom: 1px solid #6c757d;">
                        <h5 class="modal-title" id="checkoutBacktrackModalLabel_${bookingId}" style="color: #ffffff;">
                            <i class="fas fa-sign-out-alt me-2"></i>Checkout Backtrack - ${roomNumber}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" style="color: #ffffff;"></button>
                    </div>
                    <div class="modal-body" style="background-color: #ffffff; color: #495057;">
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card" style="background-color: #ffffff; border: 1px solid #dee2e6;">
                                    <div class="card-body" style="background-color: #ffffff;">
                                        <h6 class="card-title" style="color: #6c757d; border-bottom: 1px solid #dee2e6; padding-bottom: 8px; margin-bottom: 15px;">
                                            <i class="fas fa-user-circle me-2" style="color: #6c757d;"></i>Guest Information
                                        </h6>
                                        <div class="row">
                                            <div class="col-md-6">
                                                <div class="guest-info-item mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #2196F3; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-user" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">${guestName}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="guest-info-item mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #4CAF50; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-bed" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Room Number</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">${roomNumber}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="guest-info-item mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #FF9800; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-calendar-alt" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">${daysDiff} day${daysDiff !== 1 ? 's' : ''}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                               
                                            </div>
                                            <div class="col-md-6">
                                             <div class="guest-info-item mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #FFC107; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-sign-in-alt" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">${checkInDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="guest-info-item mb-3">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #F44336; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-sign-out-alt" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">${checkOutDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            
                                                <div class="guest-info-item">
                                                    <div class="d-flex align-items-center">
                                                        <div class="info-icon me-3" style="width: 32px; height: 32px; background-color: #9C27B0; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                                            <i class="fas fa-check-circle" style="color: white; font-size: 14px;"></i>
                                                        </div>
                                                        <div>
                                                            <small style="color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Status</small>
                                                            <div style="color: #495057; font-weight: 600; font-size: 16px;">Successfully checked out</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-12">
                                <div class="card" style="background-color: #ffffff; border: 1px solid #dee2e6;">
                                    <div class="card-body" style="background-color: #ffffff;">
                                        <h6 class="card-title" style="color: #6c757d; border-bottom: 1px solid #dee2e6; padding-bottom: 8px; margin-bottom: 15px;">Checkout Summary</h6>
                                        <div class="table-responsive">
                                            <table class="table table-borderless" style="color: #6c757d; background-color: transparent !important; border: none !important; font-size: 1rem; font-weight: 500;">
                                                <tbody style="background-color: transparent !important;">
                                                    <tr style="background-color: transparent !important; border: none !important;">
                                                        <td style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">Room Cost:</td>
                                                        <td class="text-end" style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">₱<span id="room-cost-${bookingId}">Loading...</span></td>
                                                    </tr>
                                                    <tr style="background-color: transparent !important; border: none !important;">
                                                        <td style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">Extra Services:</td>
                                                        <td class="text-end" style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">₱<span id="services-cost-${bookingId}">Loading...</span></td>
                                                    </tr>
                                                    <tr style="background-color: transparent !important; border: none !important;">
                                                        <td style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">Late Checkout:</td>
                                                        <td class="text-end" style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">₱<span id="late-checkout-${bookingId}">0.00</span></td>
                                                    </tr>
                                                    <tr class="border-top" style="border-color: #dee2e6 !important; background-color: transparent !important;">
                                                        <td style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">Total Amount:</td>
                                                        <td class="text-end" style="background-color: transparent !important; border: none !important; color: #6c757d; font-size: 1rem; font-weight: 500;">₱<span id="total-amount-${bookingId}">Loading...</span></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="background-color: #6c757d; border-top: 1px solid #6c757d;">
                       
                        <button type="button" class="btn btn-secondary" onclick="showBilling('${bookingId}')" >
                            <i class="fas fa-credit-card me-2"></i>Billing
                        </button>

                        <button type="button" class="btn btn-secondary" onclick="viewFullBookingDetails('${bookingId}')" >
                            <i class="fas fa-file-alt me-2"></i>View Full Details
                        </button>

                         <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" >
                            <i class="fas fa-times me-2"></i>Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById(`checkoutBacktrackModal_${bookingId}`);
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById(`checkoutBacktrackModal_${bookingId}`));
    modal.show();
    
    // Load checkout data
    loadCheckoutData(bookingId);
}

// Function to load checkout data
function loadCheckoutData(bookingId) {
    
    
    // Load booking details - use correct endpoint
    fetch(`/booking/booking_details/${bookingId}`)
        .then(response => {
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            
            
            // Update room cost - check different possible field names
            const roomCostElement = document.getElementById(`room-cost-${bookingId}`);
            if (roomCostElement) {
                const roomCost = data.total_room_cost || data.room_cost || data.ROOM_COST || data.totalRoomCost || 0;
        
                if (roomCost > 0) {
                    roomCostElement.textContent = parseFloat(roomCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else {
                    roomCostElement.textContent = '0.00';
                }
            }
            
            // Load services cost
            loadServicesCost(bookingId);
        })
        .catch(error => {
            console.error('Error loading checkout data:', error);
            // Set default values on error
            const roomCostElement = document.getElementById(`room-cost-${bookingId}`);
            if (roomCostElement) {
                roomCostElement.textContent = '0.00';
            }
            loadServicesCost(bookingId);
        });
}

// Function to load services cost
function loadServicesCost(bookingId) {
    fetch(`/booking/get-booking-services/${bookingId}`)
        .then(response => response.json())
        .then(response => {
            // Handle new response format: { success: true, data: [...] }
            const services = response.data || response;
            
            let totalServicesCost = 0;
            if (Array.isArray(services) && services.length > 0) {
                services.forEach(service => {
                    const cost = parseFloat(service.TOTAL_COST) || 0;
                    const quantity = parseInt(service.QTY) || 0;
                    if (!isNaN(cost) && !isNaN(quantity)) {
                        totalServicesCost += cost * quantity;
                    }
                });
            }
            
            // Update services cost
            const servicesCostElement = document.getElementById(`services-cost-${bookingId}`);
            if (servicesCostElement) {
                servicesCostElement.textContent = totalServicesCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            
            // Calculate and update total amount
            updateCheckoutTotal(bookingId);
        })
        .catch(error => {
            console.error('Error loading services cost:', error);
            // Set default values on error
            const servicesCostElement = document.getElementById(`services-cost-${bookingId}`);
            if (servicesCostElement) {
                servicesCostElement.textContent = '0.00';
            }
            updateCheckoutTotal(bookingId);
        });
}

// Function to update checkout total
function updateCheckoutTotal(bookingId) {
    // Get room cost with proper parsing
    const roomCostElement = document.getElementById(`room-cost-${bookingId}`);
    const roomCostText = roomCostElement?.textContent || '0.00';
    const roomCost = parseFloat(roomCostText.replace(/[₱,]/g, '')) || 0;
    
    // Get services cost with proper parsing
    const servicesCostElement = document.getElementById(`services-cost-${bookingId}`);
    const servicesCostText = servicesCostElement?.textContent || '0.00';
    const servicesCost = parseFloat(servicesCostText.replace(/[₱,]/g, '')) || 0;
    
    // Get late checkout with proper parsing
    const lateCheckoutElement = document.getElementById(`late-checkout-${bookingId}`);
    const lateCheckoutText = lateCheckoutElement?.textContent || '0.00';
    const lateCheckout = parseFloat(lateCheckoutText.replace(/[₱,]/g, '')) || 0;
    
    // Calculate total with validation
    const totalAmount = roomCost + servicesCost + lateCheckout;
    
    // Update total display
    const totalElement = document.getElementById(`total-amount-${bookingId}`);
    if (totalElement) {
        if (!isNaN(totalAmount) && totalAmount >= 0) {
            totalElement.textContent = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            totalElement.textContent = '0.00';
        }
    }
}

// Function to load billing data
function loadBillingData(bookingId) {
    console.log('Loading billing data for booking ID:', bookingId);
    
    // Use the same endpoint as the working showBilling function
    fetch(`/booking/get-billing/${bookingId}?_=${Date.now()}`)
        .then(response => response.json())
        .then(data => {
            console.log('Billing data loaded:', data);
            
            // Update customer name
            const customerNameElement = document.getElementById('customerName');
            if (customerNameElement && data.customerName) {
                customerNameElement.textContent = data.customerName;
                console.log('Customer name set to:', data.customerName);
            } else {
                customerNameElement.textContent = 'Guest';
                console.log('No customer name found, using default: Guest');
            }
            
            // Update confirmation number
            const confNumberElement = document.getElementById('confNumber');
            if (confNumberElement && data.confNumber) {
                confNumberElement.textContent = data.confNumber;
            }
            
            // Update invoice date
            const invoiceDateElement = document.getElementById('invoiceDate');
            if (invoiceDateElement && data.invoiceDate) {
                invoiceDateElement.textContent = data.invoiceDate;
            }
            
            // Update billing receipt ID
            const billingReceiptIdElement = document.getElementById('billingReceiptId');
            if (billingReceiptIdElement && data.bookingId) {
                billingReceiptIdElement.textContent = data.bookingId;
            }
            
            // Populate billing table with items
            const tableBody = document.querySelector('#modal-billing table tbody');
            if (tableBody && data.items && Array.isArray(data.items)) {
                tableBody.innerHTML = '';
                data.items.forEach((item, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="text-center">${index + 1}</td>
                        <td class="text-center">${new Date(item.date).toLocaleDateString()}</td>
                        <td class="text-center">${item.description}</td>
                        <td class="text-center">₱${parseFloat(item.basePrice).toFixed(2)}</td>
                        <td class="text-center">${item.qty || '-'}</td>
                        <td class="text-right">₱${parseFloat(item.subTotal).toFixed(2)}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            
            // Calculate and update totals with Reservation Fee and Discount
            if (data.items && Array.isArray(data.items)) {
                let totalPaid = 0;
                let totalUnpaid = 0;
                
                data.items.forEach(item => {
                    const amount = parseFloat(item.subTotal) || 0;
                    if (item.status === 'paid') {
                        totalPaid += amount;
                    } else {
                        totalUnpaid += amount;
                    }
                });
                
                // Calculate total amount including reservation fee and discount
                const subTotal = data.items.reduce((sum, item) => sum + item.subTotal, 0);
                const reservationFee = parseFloat(data.reservationFee) || 0;
                const discountAmount = parseFloat(data.discountAmount) || 0;
                const totalAmount = subTotal - reservationFee - discountAmount;
                
                // Calculate final balance including reservation fee and discount
                const finalBalance = totalAmount - totalPaid;
                
                // Update total paid
                const totalPaidElement = document.getElementById('totalPaid');
                if (totalPaidElement) {
                    totalPaidElement.textContent = `₱${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
                
                // Update balance
                const balanceElement = document.getElementById('balanceAmount');
                if (balanceElement) {
                    balanceElement.textContent = `₱${finalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
                
                // Update total payment
                const totalPaymentElement = document.getElementById('totalPayment');
                if (totalPaymentElement) {
                    totalPaymentElement.textContent = `₱${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
                
                // Show/hide paid image overlay based on payment status (including reservation fee consideration)
                const allItemsPaid = data.items.every(item => item.status === 'paid');
                const allPaid = allItemsPaid && (finalBalance <= 0);
                const paidImageOverlay = document.getElementById('paidImageOverlay');
                if (paidImageOverlay) {
                    if (allPaid && totalPaid > 0) {
                        paidImageOverlay.style.display = 'block';
                        paidImageOverlay.classList.add('show-paid-status');
                        console.log('Paid image overlay shown');
                    } else {
                        paidImageOverlay.style.display = 'none';
                        paidImageOverlay.classList.remove('show-paid-status');
                        console.log('Paid image overlay hidden');
                    }
                }
                
                // Update button state
                const proceedButton = document.getElementById('proceedToPaymentButton');
                if (proceedButton) {
                    if (allPaid && totalPaid > 0) {
                        proceedButton.disabled = true;
                        proceedButton.textContent = 'Payment Completed';
                        proceedButton.classList.remove('btn-payment');
                        proceedButton.classList.add('btn-success');
                    } else {
                        proceedButton.disabled = false;
                        proceedButton.textContent = 'Proceed to Payment';
                        proceedButton.classList.remove('btn-success');
                        proceedButton.classList.add('btn-payment');
                    }
                }
            }
            
            // Log all available fields for debugging
            console.log('Available data fields:', Object.keys(data));
            
            // Handle Reservation Fee Display
            if (data.reservationFee && parseFloat(data.reservationFee) > 0) {
                const reservationFeeRow = document.getElementById('reservationFeeRow');
                const reservationFeeElement = document.getElementById('billingReservationFee');
                if (reservationFeeRow && reservationFeeElement) {
                    reservationFeeRow.style.display = 'block';
                    reservationFeeElement.textContent = `₱${parseFloat(data.reservationFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    // Align the amount to the right like Paid and Balance
                    reservationFeeElement.style.textAlign = 'right';
                    console.log('✅ Reservation Fee displayed:', data.reservationFee);
                }
            } else {
                const reservationFeeRow = document.getElementById('reservationFeeRow');
                if (reservationFeeRow) {
                    reservationFeeRow.style.display = 'none';
                    console.log('✅ Reservation Fee hidden (no fee)');
                }
            }
            
            // Handle Discount Display
            if (data.discountAmount && parseFloat(data.discountAmount) > 0) {
                const discountRow = document.getElementById('discountRow');
                const discountElement = document.getElementById('billingDiscountAmount');
                if (discountRow && discountElement) {
                    discountRow.style.display = 'block';
                    discountElement.textContent = `₱${parseFloat(data.discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    // Align the amount to the right like Paid and Balance
                    discountElement.style.textAlign = 'right';
                    console.log('✅ Discount displayed:', data.discountAmount);
                }
            } else {
                const discountRow = document.getElementById('discountRow');
                if (discountRow) {
                    discountRow.style.display = 'none';
                    console.log('✅ Discount hidden (no discount)');
                }
            }
        })
        .catch(error => {
            console.error('Error loading billing data:', error);
            // Set default values if API fails
            const customerNameElement = document.getElementById('customerName');
            if (customerNameElement) customerNameElement.textContent = 'Guest';
        });
}

// Function to load billing services
function loadBillingServices(bookingId) {
    console.log('Loading billing services for booking ID:', bookingId);
    
    fetch(`/booking/get-booking-services/${bookingId}`)
        .then(response => response.json())
        .then(response => {
            // Handle new response format: { success: true, data: [...] }
            const services = response.data || response;
            console.log('Billing services loaded:', services);
            
            // Find the billing table tbody in the modal
            const tableBody = document.querySelector('#modal-billing table tbody');
            if (!tableBody) {
                console.error('Billing table tbody not found');
                return;
            }
            
            tableBody.innerHTML = '';
            
            if (Array.isArray(services) && services.length > 0) {
                services.forEach((service, index) => {
                    const cost = parseFloat(service.TOTAL_COST) || 0;
                    const quantity = parseInt(service.QTY) || 0;
                    const totalCost = cost * quantity;
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="text-center">${index + 1}</td>
                        <td class="text-center">${new Date().toLocaleDateString()}</td>
                        <td class="text-center">${service.SERVICE_NAME || 'Room Service'}</td>
                        <td class="text-center">₱${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td class="text-center">${quantity}</td>
                        <td class="text-right">₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    `;
                    tableBody.appendChild(row);
                });
            } else {
                // If no services, add a default room row
                const tableBody = document.querySelector('#modal-billing table tbody');
                if (tableBody) {
                    tableBody.innerHTML = `
                        <tr>
                            <td class="text-center">1</td>
                            <td class="text-center">${new Date().toLocaleDateString()}</td>
                            <td class="text-center">Room Accommodation</td>
                            <td class="text-center">₱0.00</td>
                            <td class="text-center">1</td>
                            <td class="text-right">₱0.00</td>
                        </tr>
                    `;
                }
            }
            
            // Update payment status
            updateBillingPaymentStatus(bookingId);
        })
        .catch(error => {
            console.error('Error loading billing services:', error);
            // Add default row if services fail to load
            const tableBody = document.querySelector('#modal-billing table tbody');
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td class="text-center">1</td>
                        <td class="text-center">${new Date().toLocaleDateString()}</td>
                        <td class="text-center">Room Accommodation</td>
                        <td class="text-center">₱0.00</td>
                        <td class="text-center">1</td>
                        <td class="text-right">₱0.00</td>
                    </tr>
                `;
            }
            updateBillingPaymentStatus(bookingId);
        });
}

// Function to update billing payment status
function updateBillingPaymentStatus(bookingId) {
    console.log('Updating billing payment status for booking ID:', bookingId);
    
    fetch(`/booking/unpaid_balance/${bookingId}`)
        .then(response => response.json())
        .then(data => {
            console.log('Payment status data loaded:', data);
            
            const totalPaid = data.total_paid || 0;
            const totalUnpaid = data.total_unpaid_balance || 0;
            
            // Update paid amount
            const totalPaidElement = document.getElementById('totalPaid');
            if (totalPaidElement) {
                totalPaidElement.textContent = `₱${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            }
            
            // Update balance
            const balanceElement = document.getElementById('balanceAmount');
            if (balanceElement) {
                balanceElement.textContent = `₱${totalUnpaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            }
            
            // Show/hide paid image overlay
            const paidImageOverlay = document.getElementById('paidImageOverlay');
            if (paidImageOverlay) {
                if (totalUnpaid <= 0 && totalPaid > 0) {
                    paidImageOverlay.style.display = 'block';
                    paidImageOverlay.classList.add('show-paid-status');
                    console.log('Paid image overlay shown');
                } else {
                    paidImageOverlay.style.display = 'none';
                    paidImageOverlay.classList.remove('show-paid-status');
                    console.log('Paid image overlay hidden');
                }
            } else {
                console.error('Paid image overlay element not found');
            }
            
            // Update button state
            const proceedButton = document.getElementById('proceedToPaymentButton');
            if (proceedButton) {
                if (totalUnpaid <= 0 && totalPaid > 0) {
                    proceedButton.disabled = true;
                    proceedButton.textContent = 'Payment Completed';
                    proceedButton.classList.remove('btn-payment');
                    proceedButton.classList.add('btn-success');
                } else {
                    proceedButton.disabled = false;
                    proceedButton.textContent = 'Proceed to Payment';
                    proceedButton.classList.remove('btn-success');
                    proceedButton.classList.add('btn-payment');
                }
            }
        })
        .catch(error => {
            console.error('Error updating payment status:', error);
            // Set default values if API fails
            const totalPaidElement = document.getElementById('totalPaid');
            const balanceElement = document.getElementById('balanceAmount');
            const totalPaymentElement = document.getElementById('totalPayment');
            
            if (totalPaidElement) totalPaidElement.textContent = '₱0.00';
            if (balanceElement) balanceElement.textContent = '₱0.00';
            if (totalPaymentElement) {
                const totalCost = parseFloat(totalPaymentElement.textContent.replace('₱', '').replace(',', '')) || 0;
                totalPaymentElement.textContent = `₱${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            }
        });
}

// Function to view full booking details (redirect to booking page)
function viewFullBookingDetails(bookingId) {
    window.open(`/booking?highlight=${bookingId}`, '_blank');
} 

// Function to load existing services from database for the dynamic modal
function loadExistingServicesForModal(bookingId) {
    fetch(`/booking/get-booking-services/${bookingId}`)
        .then(response => response.json())
        .then(response => {
            // Handle new response format: { success: true, data: [...] }
            const services = response.data || response;
            // Clear the existing services map for this booking
            addedServicesMap[bookingId] = [];
            
            // Add existing services to the map
            if (Array.isArray(services) && services.length > 0) {
                services.forEach(service => {
                    // Calculate unit cost from total cost and quantity
                    const totalCost = parseFloat(service.TOTAL_COST) || 0;
                    const quantity = parseInt(service.QTY) || 1;
                    const unitCost = quantity > 0 ? totalCost / quantity : 0;
                    
                    // Check if we can combine with existing service (same service, same status, same unit cost)
                    const existingService = addedServicesMap[bookingId].find(s => 
                        s.SERVICE_ID === service.SERVICE_ID && 
                        s.STATUS === service.STATUS &&
                        s.SERVICE_COST === unitCost
                    );
                    
                    if (existingService) {
                        // Combine quantities for identical services
                        existingService.QUANTITY += quantity;
                    } else {
                        // Add as new service entry
                        addedServicesMap[bookingId].push({
                            SERVICE_ID: service.SERVICE_ID,
                            SERVICE_NAME: service.SERVICE_NAME || 'Unknown Service',
                            SERVICE_COST: unitCost,
                            QUANTITY: quantity,
                            STATUS: service.STATUS || 'unpaid'
                        });
                    }
                });
            }
            
            // Update the services list display
            updateAddedServicesList(bookingId);
            
            // Recalculate totals
            calculateTotalCost(bookingId);
            calculateBalance(bookingId, bookingId);
        })
        .catch(error => {
            console.error('Error loading existing services for modal:', error);
        });
}

// Function to load services