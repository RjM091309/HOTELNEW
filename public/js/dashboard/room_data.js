// Room Data Scripts
// Extracted from dashboard.ejs

// --- Room Layout, Status, and Alarm Logic ---
let oldData = null;
let currentFilterStatus = "SHOW ALL";
const numericStatusLabels = { 
  1: "AVAILABLE", 
  2: "OCCUPIED", 
  3: "MAINTENANCE", 
  4: "CLEANING" 
};
const numericStatusStyles = { 
  1: { background: "#4CAF50", border: "1px solid #4CAF50" }, 
  2: { background: "#3598dc", border: "1px solid #3598dc" }, 
  3: { background: "#FF9800", border: "1px solid #FF9800" }, 
  4: { background: "#F44336", border: "1px solid #F44336" } 
};

function applyFilter(filterStatus, container) {
  if (!container) return;
  container.querySelectorAll('.room').forEach(room => {
    const roomStatus = room.getAttribute('data-status');
    if (filterStatus === "SHOW ALL" || roomStatus === filterStatus) {
      room.classList.remove('dimmed');
    } else {
      room.classList.add('dimmed');
    }
  });
}

function getCustomLayout(floor) {
  const base = floor * 100;
  const rangeAsc = (start, end) => { 
    const arr = []; 
    for(let i = start; i <= end; i++){ 
      arr.push(base + i); 
    } 
    return arr; 
  };
  const rangeDesc = (start, end) => { 
    const arr = []; 
    for(let i = start; i >= end; i--){ 
      arr.push(base + i); 
    } 
    return arr; 
  };
  return {
    row1: rangeDesc(16, 8),
    row2: rangeDesc(7, 1),
    row3: rangeAsc(17, 23),
    row4: rangeAsc(24, 31)
  };
}

function createRoomElement(room) {
  const numericStatus = parseInt(room.ROOM_STATUS, 10);
  const statusLabel = numericStatusLabels[numericStatus] || "UNKNOWN";
  const style = numericStatusStyles[numericStatus] || { background: "#000", border: "1px solid #000" };

  const roomEl = document.createElement('div');
  roomEl.classList.add('room');
  roomEl.setAttribute('data-status', statusLabel);
  roomEl.style.backgroundColor = style.background;
  roomEl.style.border = style.border;

  // ----- RENDER BED ICONS -----
  const bedCount = parseInt(room.ROOM_BED, 10) || 1;

  // create the flex wrapper for bed icons
  const bedContainer = document.createElement('div');
  bedContainer.classList.add('bed-icons');

  for (let i = 0; i < bedCount; i++) {
    const icon = document.createElement('ion-icon');
    
    // Set icon and color based on bed count
    if (bedCount === 1) {
      icon.setAttribute('name', 'bed');
      icon.style.color = 'white'; // Single bed - white
    } else {
      icon.setAttribute('name', 'bed-outline');
      icon.style.color = 'white'; // Multiple beds - white
    }
    
    // Make icons larger
    icon.style.fontSize = '18px';
    icon.style.width = '18px';
    icon.style.height = '18px';
    
    bedContainer.appendChild(icon);
  }

  // append the whole container onto the room
  roomEl.appendChild(bedContainer);

  // Room Number
  const roomNumber = document.createElement('span');
  roomNumber.classList.add('room-number');
  roomNumber.textContent = room.ROOM_NUMBER;
  roomEl.appendChild(roomNumber);

  // Status label
  const roomStatus = document.createElement('span');
  roomStatus.classList.add('room-status');
  roomStatus.textContent = statusLabel;
  roomEl.appendChild(roomStatus);

  return roomEl;
}

function renderFloorRooms(floor, rooms) {
  const container = document.getElementById(`floor-layout-${floor}`);
  if (!container) {
    console.warn(`Container for floor ${floor} not found`);
    return;
  }
  
  container.innerHTML = "";
  const layout = getCustomLayout(floor);
  const rowClasses = ["row1", "row2", "row3", "row4"];
  const layoutRows = [layout.row1, layout.row2, layout.row3, layout.row4];
  
  layoutRows.forEach((groupArray, index) => {
    const rowDiv = document.createElement('div');
    rowDiv.classList.add('rooms-row', rowClasses[index]);
    
    groupArray.forEach(rn => {
      const found = rooms.find(r => parseInt(r.ROOM_NUMBER) === parseInt(rn));
      if(found) {
        rowDiv.appendChild(createRoomElement(found));
      } else {
        // Create empty room placeholder
        const emptyRoom = document.createElement('div');
        emptyRoom.classList.add('room', 'empty-room');
        emptyRoom.style.backgroundColor = '#f0f0f0';
        emptyRoom.style.border = '1px solid #ddd';
        emptyRoom.style.color = '#999';
        
        const roomNumber = document.createElement('span');
        roomNumber.classList.add('room-number');
        roomNumber.textContent = rn;
        roomNumber.style.color = '#999';
        emptyRoom.appendChild(roomNumber);
        
        rowDiv.appendChild(emptyRoom);
      }
    });
    container.appendChild(rowDiv);
  });
}

function checkForStatusChanges(newData) {
  if (!oldData) return [];
  const changedRooms = [];
  for (let floor in newData.floors) {
    const newFloorRooms = newData.floors[floor];
    const oldFloorRooms = oldData.floors && oldData.floors[floor] ? oldData.floors[floor] : [];
    newFloorRooms.forEach(newRoom => {
      const oldRoom = oldFloorRooms.find(r => parseInt(r.ROOM_NUMBER) === parseInt(newRoom.ROOM_NUMBER));
      if (oldRoom && oldRoom.ROOM_STATUS !== newRoom.ROOM_STATUS) {
        changedRooms.push({ 
          floor: floor, 
          roomNumber: newRoom.ROOM_NUMBER, 
          oldStatus: oldRoom.ROOM_STATUS, 
          newStatus: newRoom.ROOM_STATUS 
        });
      }
    });
  }
  return changedRooms;
}

function triggerVisualAlarm(changedRooms) {
  const uniqueFloors = [...new Set(changedRooms.map(cr => cr.floor))];
  uniqueFloors.forEach(floor => {
    let suffix = "th";
    if (floor === "3") suffix = "rd";
    if (floor === "4") suffix = "th";
    if (floor === "5") suffix = "th";
    if (floor === "6") suffix = "th";
    const actualTarget = `${floor}${suffix}-floor-content`;
    const tabItem = document.querySelector(`.tab-item[data-target="${actualTarget}"]`);
    if (tabItem) {
      tabItem.classList.add('dot-alarm-tab');
    }
  });
  
  changedRooms.forEach(cr => {
    const floorLayout = document.getElementById(`floor-layout-${cr.floor}`);
    if (floorLayout) {
      const roomEl = Array.from(floorLayout.querySelectorAll('.room')).find(el => 
        parseInt(el.querySelector('.room-number')?.textContent) === parseInt(cr.roomNumber)
      );
      if (roomEl) {
        roomEl.classList.add('shadow-alarm');
      }
    }
  });
}

function handleDataUpdate(newData) {
  const changedRooms = checkForStatusChanges(newData);
  if (changedRooms.length > 0) {
    triggerVisualAlarm(changedRooms);
  }
  oldData = newData;
}

function fetchData() {
  fetch('/dashboard/room-monitoring')
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      if(data && data.floors) {
        if(data.floors['3']) renderFloorRooms(3, data.floors['3']);
        if(data.floors['4']) renderFloorRooms(4, data.floors['4']);
        if(data.floors['5']) renderFloorRooms(5, data.floors['5']);
        if(data.floors['6']) renderFloorRooms(6, data.floors['6']);
        handleDataUpdate(data);
      } else {
        console.warn('No floor data received');
      }
    })
    .catch(err => {
      console.error('Error fetching room data:', err);
      // Show error message to user
      const containers = document.querySelectorAll('[id^="floor-layout-"]');
      containers.forEach(container => {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Error loading room data. Please refresh the page.</div>';
      });
    });
}

// Auto-refresh functionality
let refreshInterval;

function startAutoRefresh() {
  // Refresh every 30 seconds
  refreshInterval = setInterval(fetchData, 30000);
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Check if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", function() {
    initializeRoomData();
  });
} else {
  initializeRoomData();
}

function initializeRoomData() {
  // Tab switching
  const tabs = document.querySelectorAll('.tab-item');
  const panels = document.querySelectorAll('.tab-panel');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      panels.forEach(p => p.classList.remove('is-active'));
      tab.classList.add('is-active');
      
      const target = tab.getAttribute('data-target');
      const panel = document.getElementById(target);
      if (panel) {
        panel.classList.add('is-active');
        applyFilter(currentFilterStatus, panel);
        
        // Remove alarm effects after 10 seconds
        setTimeout(() => {
          panel.querySelectorAll('.room.shadow-alarm').forEach(room => {
            room.classList.remove('shadow-alarm');
          });
        }, 10000);
      }
      
      if (tab.classList.contains('dot-alarm-tab')) {
        tab.classList.remove('dot-alarm-tab');
      }
    });
  });
  
  // Filter logic
  const legendItems = document.querySelectorAll('.legend-item');
  
  legendItems.forEach(item => {
    item.addEventListener('click', () => {
      currentFilterStatus = item.getAttribute('data-filter');
      const activePanel = document.querySelector('.tab-panel.is-active');
      applyFilter(currentFilterStatus, activePanel);
    });
  });
  
  // Initial data fetch
  fetchData();
  
  // Start auto-refresh
  startAutoRefresh();
  
  // Stop auto-refresh when page is not visible
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  });
  
  // Stop auto-refresh when leaving the page
  window.addEventListener('beforeunload', stopAutoRefresh);
}

// --- Cleaning Icon Click Event ---
document.addEventListener('DOMContentLoaded', function () {
    const cleaningIcons = document.querySelectorAll('.cleaning-container');
    cleaningIcons.forEach(icon => {
        icon.addEventListener('click', function () {
            const roomId = this.getAttribute('data-room-id');
            const isCurrentlyOn = this.querySelector('i').classList.contains('on');
            const newStatus = isCurrentlyOn ? 'Dirty' : 'Clean';
            
            if (!confirm(`Mark this room as ${newStatus}?`)) {
                return;
            }
            
            $.ajax({
                url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ status: newStatus }),
                success: function (response) {
                    alert(response.message);
                    const card = icon.closest('.card');
                    if (card) {
                        card.remove();
                    }
                    window.location.reload();
                },
                error: function (xhr, status, error) {
                    alert('An error occurred while updating the room status.');
                }
            });
        });
    });
}); 