// Late Checkout Data Scripts
// Extracted from dashboard.ejs

let globalLateCheckoutRoomId = null;
let globalLateCheckoutBookingId = null;
let selectedRoomId = null; // Track selected room

function openLateCheckoutModal(roomId, checkoutDate, bookingId) {
    globalLateCheckoutRoomId = roomId;
    globalLateCheckoutBookingId = bookingId;
    globalSelectedRoomId = null; // Reset selected room

    console.log(`🔍 Opening Late Check-Out Modal - Room ID: ${roomId}, Checkout Date: ${checkoutDate}, Booking ID: ${bookingId}`);

    document.getElementById("lateCheckoutMessage").textContent = "Checking availability...";
    document.getElementById("lateCheckoutRoomSelection").style.display = "none";
    document.getElementById("lateCheckoutRoomSelectContainer").innerHTML = ""; // Clear previous rooms

    fetch(`/dashboard/late-check-room?roomId=${roomId}&checkoutDate=${checkoutDate}&currentBookingId=${bookingId}`)
        .then(response => response.json())
        .then(data => {
            console.log("📌 Late Check-Out Response:", data);

            if (!data.needRoomChange) {
                console.log("✅ No need to change room, processing Late Check-Out...");
                processLateCheckout(globalLateCheckoutRoomId, null, globalLateCheckoutBookingId);
                return;
            }

            console.log("❌ Room change required, showing available rooms...");
            document.getElementById("lateCheckoutMessage").textContent = data.message;
            document.getElementById("lateCheckoutRoomSelection").style.display = "block";

            if (data.availableRooms.length === 0) {
                document.getElementById("lateCheckoutRoomSelectContainer").innerHTML = '<p>No available rooms</p>';
            } else {
                // Group rooms by floor
                const roomsByFloor = data.availableRooms.reduce((acc, room) => {
                    if (!acc[room.ROOM_FLOOR]) acc[room.ROOM_FLOOR] = [];
                    acc[room.ROOM_FLOOR].push(room);
                    return acc;
                }, {});

                // Create rows for each floor
                Object.keys(roomsByFloor).forEach((floor) => {
                    const floorContainer = document.createElement("div");
                    floorContainer.className = "floor-container";

                    const floorRow = document.createElement("div");
                    floorRow.className = "floor-row";

                    roomsByFloor[floor].forEach((room) => {
                        const roomCard = document.createElement("div");

                        // Assign color class dynamically based on floor
                        let colorClass = "";
                        switch (parseInt(floor, 10)) {
                            case 3:
                                colorClass = "green"; // Green for 3rd floor
                                break;
                            case 4:
                                colorClass = "blue"; // Blue for 4th floor
                                break;
                            case 5:
                                colorClass = "red"; // Red for 5th floor
                                break;
                            case 6:
                                colorClass = "purple"; // Purple for 6th floor
                                break;
                            default:
                                colorClass = "default"; // Default color for other floors
                        }

                        roomCard.className = `room-item ${colorClass}`;
                        roomCard.textContent = `${room.ROOM_NUMBER}`;
                        roomCard.setAttribute("data-room-id", room.ROOM_ID);

                        // Click event to select a room
                        roomCard.addEventListener("click", () => {
                            document.querySelectorAll(".room-item").forEach((item) => {
                                item.classList.remove("selected");
                            });
                            roomCard.classList.add("selected");
                            globalSelectedRoomId = room.ROOM_ID; // Update selected room ID
                        });

                        floorRow.appendChild(roomCard);
                    });

                    floorContainer.appendChild(floorRow);
                    document.getElementById("lateCheckoutRoomSelectContainer").appendChild(floorContainer);
                });
            }

            new bootstrap.Modal(document.getElementById("lateCheckoutModal")).show();
        })
        .catch(error => console.error("🚨 Error checking late check-out:", error));
}

// ✅ Function to Process Late Check-Out
// ✅ Function to Process Late Check-Out (With Correct Swal Timing)
function processLateCheckout(currentRoomId, newRoomId, bookingId) {
    console.log(`🔄 Processing Late Check-Out - Current Room ID: ${currentRoomId}, New Room ID: ${newRoomId}, Booking ID: ${bookingId}`);

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
            console.log("✅ User confirmed Late Check-Out. Sending request...");

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
                    console.log("✅ Late Check-Out Successfully Processed!");
                    Swal.fire({
                        icon: "success",
                        title: "Late Check-Out Confirmed",
                        text: "Your Late Check-Out has been successfully processed.",
                    }).then(() => location.reload());
                } else {
                    console.log("❌ Late Check-Out Failed:", result.message);
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
            console.log("❌ Late Check-Out Canceled by user.");
        }
    });
}

// ✅ Confirm Button Click Event (Calls processLateCheckout)
const confirmLateCheckoutButton = document.getElementById("confirmLateCheckoutButton");
if (confirmLateCheckoutButton) {
    confirmLateCheckoutButton.addEventListener("click", () => {
        const selectedRoomId = globalSelectedRoomId;

        if (!selectedRoomId) {
            Swal.fire({
                icon: "warning",
                title: "No Room Selected",
                text: "Please select a room before confirming Late Check-Out.",
            });
            return;
        }

        // ✅ Now this will only run AFTER the user confirms in Swal
        processLateCheckout(globalLateCheckoutRoomId, selectedRoomId, globalLateCheckoutBookingId);
    });
} 