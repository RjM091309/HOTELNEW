$(document).ready(function () {
    // Kapag binuksan ang modal, i-load ang dropdown options
    $('#modal-booking-details').on('shown.bs.modal', function () {
        getServices();
        loadGuestDetails(); 
        loadBookingDetails();
        calculateTotalCost();
    });
});

// Function para i-load ang services mula sa backend gamit ang AJAX
function getServices() {
    $.ajax({
        url: '/booking/extra_service_dropdown', // Endpoint ng backend
        method: 'GET',
        dataType: 'json',
        success: function (services) {

            // I-clear ang laman ng dropdown
            const serviceSelect = $('#extra-service-select');
            serviceSelect.empty();
            serviceSelect.append('<option value="" selected disabled>Select a service</option>');

            // Kung walang services, maglagay ng "No services available"
            if (services.length === 0) {
                serviceSelect.append('<option value="" disabled>No services available</option>');
            } else {
                // Idagdag ang bawat service sa dropdown
                services.forEach(service => {
                    const option = `<option value='${JSON.stringify({
                        SERVICE_ID: service.IDNo, // Ensure SERVICE_ID is passed
                        SERVICE_NAME: service.SERVICE_NAME,
                        SERVICE_COST: service.SERVICE_COST
                    })}'>${service.SERVICE_NAME}</option>`;
                    serviceSelect.append(option);
                });
            }
        },
        error: function (xhr, status, error) {
            console.error('Error sa pag-fetch ng services:', error);
            alert('Hindi ma-load ang mga serbisyo. Subukan ulit.');
        }
    });
}

// Declare at the top
let addedServices = []; // Array to store added services

// Function to add a service and save it immediately
function addService() {
    const serviceSelect = $('#extra-service-select');
    const selectedService = serviceSelect.val(); // Get the selected service
    const quantityInput = $('#service-quantity').val(); // Get the quantity
    const bookingId = $('#bookingID').val(); // Get the booking ID from the hidden input

    if (selectedService) {
        const service = JSON.parse(selectedService); // Parse the selected service data
        const quantity = parseInt(quantityInput, 10); // Convert quantity to an integer

        // Check if the service already exists in the addedServices array
        const existingService = addedServices.find(s => s.SERVICE_ID === service.SERVICE_ID);
        if (existingService) {
            // Update the quantity of the existing service in memory
            existingService.QUANTITY += quantity;
            existingService.SERVICE_COST = service.SERVICE_COST;
        } else {
            // Add the new service to the local array
            addedServices.push({
                SERVICE_ID: service.SERVICE_ID,
                SERVICE_NAME: service.SERVICE_NAME,
                SERVICE_COST: service.SERVICE_COST,
                QUANTITY: quantity
            });
        }

        // Save the updated services to the backend
        saveServices(bookingId);

        // Refresh the list
        updateAddedServicesList();

        // Recalculate the grand total
        calculateTotalCost();

        // Reset dropdown and quantity input
        serviceSelect.val('');
        $('#service-quantity').val('1');
    } else {
        alert('Please select a service before adding!');
    }
}

// Function to save services to the backend
function saveServices(bookingId) {
    // Ensure there are services to save
    if (addedServices.length === 0) {
        alert('No services added to save!');
        return;
    }

    // Prepare the data to be sent to the backend
    const servicesData = addedServices.map(service => ({
        SERVICE_ID: service.SERVICE_ID, // Replace with your service ID field
        QUANTITY: service.QUANTITY,    // Quantity of the service
        TOTAL_COST: service.SERVICE_COST * service.QUANTITY // Total cost for the service
    }));

    // Send the data via AJAX
    $.ajax({
        url: '/booking/save-booking-services', // Backend endpoint
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            bookingId: bookingId, // Booking ID
            services: servicesData // Services data
        }),
        success: function (response) {
            console.log('Services saved successfully:', response);
            alert('Services have been saved successfully!');
        },
        error: function (xhr, status, error) {
            console.error('Error saving services:', error);
            alert('Failed to save services. Please try again.');
        }
    });
}

function loadGuestDetails() {
    const bookingId = $('#bookingID').val(); // Get the booking ID from the hidden input

    if (!bookingId) {
        console.error('Booking ID is missing.');
        return;
    }

    $.ajax({
        url: `/booking/get-booking-services/${bookingId}`, // Fetch services for the booking ID
        method: 'GET',
        dataType: 'json',
        success: function (services) {

            // Add fetched services to addedServices only if they don't already exist
            services.forEach(service => {
                if (!addedServices.some(s => s.SERVICE_ID === service.SERVICE_ID)) {
                    addedServices.push({
                        SERVICE_ID: service.SERVICE_ID,
                        SERVICE_NAME: service.SERVICE_NAME,
                        SERVICE_COST: service.TOTAL_COST / service.QTY, // Calculate unit cost
                        QUANTITY: service.QTY
                    });
                }
            });

            // Refresh the displayed list
            updateAddedServicesList();
        },
        error: function (xhr, status, error) {
            console.error('Error fetching saved services:', error);
            alert('Failed to load saved services. Please try again.');
        }
    });
}

// Function to update the list of added services
function updateAddedServicesList() {
    const serviceList = $('#added-services-list');
    serviceList.empty(); // Clear the list

    // Check if there are services
    if (addedServices.length === 0) {
        serviceList.hide(); // Hide the list if no services
        return;
    }

    // Show the service list
    serviceList.show();

    // Add header row
    const headerRow = `
        <li class="list-group-item d-flex justify-content-between align-items-center text-center">
            <span style="flex: 1;"><strong>Service Name</strong></span>
            <span style="flex: 1;"><strong>Quantity</strong></span>
            <span style="flex: 1;"><strong>Total Cost</strong></span>
           <span style="flex: 1;"><strong>Action</strong></span>
        </li>`;
    serviceList.append(headerRow);

    // Add each service as a row
    addedServices.forEach((service, index) => {
        const totalCost = service.SERVICE_COST * service.QUANTITY;
        const listItem = `
            <li class="list-group-item d-flex justify-content-between align-items-center text-center">
                <span style="flex: 1;">${service.SERVICE_NAME}</span>
                <span style="flex: 1;">${service.QUANTITY}</span>
                <span style="flex: 1;">₱${totalCost.toFixed(2)}</span>
                <span style="flex: 1;">
                <button class="btn btn-danger btn-sm" onclick="removeService(${index})">
                    <i class="fa fa-times"></i> <!-- Remove icon -->
                </button>
                </span>
            </li>`;
        serviceList.append(listItem);
    });
}

// Function to remove a service from the list
function removeService(index) {
    const serviceToRemove = addedServices[index]; // Get the service being removed

    if (!serviceToRemove || !serviceToRemove.SERVICE_ID) {
        alert('Service not found.');
        return;
    }

    const bookingId = $('#bookingID').val(); // Get the booking ID from the hidden input

    // Send an AJAX request to update the ACTIVE field in the database
    $.ajax({
        url: '/booking/remove-service', // Backend endpoint for removing a service
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            bookingId: bookingId,
            serviceId: serviceToRemove.SERVICE_ID
        }),
        success: function (response) {
            console.log('Service removed successfully:', response);

            // Remove the service from the array and refresh the list
            addedServices.splice(index, 1); // Remove from the local array
            updateAddedServicesList();
            calculateTotalCost();
        },
        error: function (xhr, status, error) {
            console.error('Error removing service:', error);
            alert('Failed to remove the service. Please try again.');
        }
    });
}

function loadBookingDetails() {
    const bookingId = $('#bookingID').val(); // Get the booking ID from the hidden input

    if (!bookingId) {
        console.error('Booking ID is missing.');
        return;
    }

    $.ajax({
        url: `/booking/booking_details/${bookingId}`, // Use the new route
        method: 'GET',
        dataType: 'json',
        success: function (data) {

            if (data.ROOM_TYPE) {
                $('#room-type').text(data.ROOM_TYPE);
            }
            if (data.ROOM_RATE) {
                $('#room-rate').text(`₱${parseFloat(data.ROOM_RATE).toFixed(2)}`);
            }
            if (data.TOTAL_DAYS) {
                $('#total-days').text(data.TOTAL_DAYS);
            }
            if (data.ROOM_RATE && data.TOTAL_DAYS) {
                const totalRoomCost = data.ROOM_RATE * data.TOTAL_DAYS;
                $('#total-room-cost').text(`₱${totalRoomCost.toFixed(2)}`);
            }
              // Recalculate the total cost
              calculateTotalCost();
        },
        error: function (xhr, status, error) {
            console.error('Error fetching booking details:', error);
            alert('Failed to load booking details. Please try again.');
        }
    });
}

// Function to calculate the grand total
function calculateTotalCost() {
    // Fetch the Room Rate
    const roomRate = parseFloat($('#room-rate').text().replace('₱', '')) || 0;
    // Fetch the Total Days
    const totalDays = parseInt($('#total-days').text(), 10) || 0;
    // Calculate the total cost for the room
    const totalRoomCost = roomRate * totalDays;
    // Calculate the total cost for extra services
    const extraServicesCost = addedServices.reduce((sum, service) => {
        return sum + service.SERVICE_COST * service.QUANTITY;
    }, 0);
   
    // Calculate the grand total
    const grandTotal = totalRoomCost + extraServicesCost;

    // Update the Grand Total in the DOM
    $('#grand-total').text(`₱${grandTotal.toFixed(2)}`);
} 