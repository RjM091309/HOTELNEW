// Extend Data Scripts
// Extracted from dashboard.ejs

let globalRoomId = null;
let globalCurrentCheckoutDate = null;
let globalBookingId = null; // Store BookingID globally
let globalSelectedRoomId = null;

document.addEventListener("DOMContentLoaded", () => {
  const extendModal = new bootstrap.Modal(document.getElementById("extendStayModal"));
  const roomSelectionWrapper = document.getElementById("roomSelectionWrapper");
  const availableRoomsGrid = document.getElementById("availableRoomsGrid");

  window.openExtendModal = function (roomId, currentCheckoutDate, bookingId, roomNumber) {
    // Set global variables
    globalRoomId = roomId;
    globalCurrentCheckoutDate = currentCheckoutDate;
    globalBookingId = bookingId;

    const label = document.getElementById('extendStayModalLabel');
    if (label) {
      const display = roomNumber || 'N/A';
      label.innerHTML = `Room ${display}<span class="d-block mt-1" style="font-size: 0.95rem; font-weight: 600;">Extend Stay</span>`;
    }

    // Reset modal fields
    roomSelectionWrapper.style.display = "none";
    availableRoomsGrid.innerHTML = ""; // Clear any previous room buttons
    document.getElementById("extensionDays").value = "";

    // Listen for daysToExtend change
    document.getElementById("extensionDays").addEventListener("input", function () {
        const daysToExtend = this.value;

        if (daysToExtend) {
            fetch(`/dashboard/extend-check-room?roomId=${roomId}&checkoutDate=${currentCheckoutDate}&daysToExtend=${daysToExtend}`)
                .then((response) => response.json())
                .then((data) => {
                    roomSelectionWrapper.style.display = data.currentRoomAvailable ? "none" : "block";

                    if (!data.currentRoomAvailable) {
                        availableRoomsGrid.innerHTML = "";

                        // Group rooms by floor
                        const roomsByFloor = data.availableRooms.reduce((acc, room) => {
                            const floor = room.ROOM_FLOOR;
                            if (!acc[floor]) acc[floor] = [];
                            acc[floor].push(room);
                            return acc;
                        }, {});

                        // Create rows for each floor
                        Object.keys(roomsByFloor).forEach((floor) => {
                            // Create a floor container
                            const floorContainer = document.createElement("div");
                            floorContainer.className = "floor-container";
                            availableRoomsGrid.appendChild(floorContainer);

                            // Create a row for the rooms on this floor
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

                                roomCard.addEventListener("click", () => {
                                    document.querySelectorAll(".room-item").forEach((item) => {
                                        item.classList.remove("selected");
                                    });
                                    roomCard.classList.add("selected");
                                    globalSelectedRoomId = room.ROOM_ID; // Update selected room ID
                                });

                                floorRow.appendChild(roomCard);
                            });

                            availableRoomsGrid.appendChild(floorRow);
                        });
                    }
                })
                .catch((error) => console.error("Error checking room availability:", error));
        }
    });

    // Show the modal
    extendModal.show();
  };

  const confirmExtendButton = document.getElementById("confirmExtendButton");
  confirmExtendButton.addEventListener("click", () => {
    const daysToExtend = document.getElementById("extensionDays").value;
    const extensionCost = document.getElementById("extensionCost").value;
    const selectedRoomId =
      roomSelectionWrapper.style.display === "none" ? globalRoomId : globalSelectedRoomId;

    if (!daysToExtend || (roomSelectionWrapper.style.display === "block" && !selectedRoomId)) {
      Swal.fire({
        icon: "warning",
        title: "Incomplete Fields",
        text: "Please complete all required fields.",
      });
      return;
    }

    fetch("/dashboard/extend-stay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentRoomId: globalRoomId,
        newRoomId: selectedRoomId,
        daysToExtend,
        bookingId: globalBookingId,
        cost: extensionCost
      }),
    })
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          Swal.fire({
            icon: "success",
            title: "Stay Extended",
            text: "Stay successfully extended!",
          }).then(() => {
            location.reload();
          });
        } else {
          Swal.fire({
            icon: "error",
            title: "Extension Failed",
            text: result.message || "Error extending stay.",
          });
        }
      })
      .catch((error) => {
        console.error("Error extending stay:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "An unexpected error occurred while extending the stay.",
        });
      });
  });
}); 