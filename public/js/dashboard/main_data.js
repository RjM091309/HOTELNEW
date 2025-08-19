

// --- Smooth Data Reload Function ---
function reloadDashboardData() {
    PMSCore.debugLog('Reloading dashboard data...');
    
    // Show loading indicator
    const loadingOverlay = $('<div class="loading-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;"><div class="spinner-border text-light" role="status"><span class="visually-hidden">Loading...</span></div></div>');
    $('body').append(loadingOverlay);
    
    // Reload dashboard data via AJAX
    $.ajax({
        url: '/dashboard',
        type: 'GET',
        success: function(response) {
            // Parse the response and update only the necessary parts
            const parser = new DOMParser();
            const doc = parser.parseFromString(response, 'text/html');
            
            // Update tab contents
            $('.tab-content').each(function() {
                const tabId = $(this).attr('id');
                const newContent = doc.querySelector(`#${tabId}`);
                if (newContent) {
                    $(this).html($(newContent).html());
                }
            });
            
            // Update counts and stats if they exist
            const newCounts = doc.querySelectorAll('[data-count]');
            newCounts.forEach(function(element) {
                const countId = element.getAttribute('data-count');
                const existingElement = document.querySelector(`[data-count="${countId}"]`);
                if (existingElement) {
                    existingElement.textContent = element.textContent;
                }
            });
            
            // Reinitialize event listeners
            initializeTabs();
            
            // Remove loading overlay
            loadingOverlay.fadeOut(300, function() {
                $(this).remove();
            });
            
            PMSCore.debugLog('Dashboard data reloaded successfully');
            
            // Show success toast
            PMSCore.showSuccess('Data Updated!', 'Dashboard data has been refreshed successfully.', {
                hideAfter: 3000
            });
        },
        error: function(xhr, status, error) {
            PMSCore.handleError(error, 'dashboard data reload');
            
            // Remove loading overlay
            loadingOverlay.fadeOut(300, function() {
                $(this).remove();
            });
            
            // Show error toast
            PMSCore.showError('Reload Failed!', 'Failed to reload dashboard data. Please refresh the page manually.', {
                hideAfter: 4000
            });
        }
    });
}



// --- Tab Switching and Tab Order ---
function initializeTabs() {
    // Ensure chat sidebar functionality is preserved
    
    // Check if chat sidebar toggle exists and is working
    const chatSidebarToggle = document.querySelector('.dropdown-quick-sidebar-toggler a');
    if (chatSidebarToggle) {
        // Ensure the original click handler is not overridden
        chatSidebarToggle.addEventListener('click', function(e) {
            // Let the original handler work
        });
    }
    
    var tabBar = document.querySelector("#tabBar");
    
    if (!tabBar) {
        return;
    }
    
    var tabs = tabBar.querySelectorAll(".tabs_three");
    
    if (tabs.length === 0) {
        return;
    }
    
    var activeTabKey = "activeTab";
    function getUserId() {
        let userId = document.body.dataset.userId;
        if (!userId || userId === "") {
            return null;
        }
        return userId;
    }
    function showTabContent(target) {
        document.querySelectorAll(".tab-content").forEach(content => {
            content.style.display = "none";
            content.classList.remove("active-tab");
        });
        let activeContent = document.getElementById(target);
        if (activeContent) {
            activeContent.style.display = "block";
            activeContent.classList.add("active-tab");
        }
    }
    function setActiveTab(target) {
        tabs.forEach(tab => tab.classList.remove("is-active"));
        let selectedTab = tabBar.querySelector(`[data-target="${target}"]`);
        if (selectedTab) {
            selectedTab.classList.add("is-active");
            localStorage.setItem(activeTabKey, target);
            showTabContent(target);
        }
    }
    function restoreActiveTab() {
        let savedTab = localStorage.getItem(activeTabKey);
        if (savedTab && tabBar.querySelector(`[data-target="${savedTab}"]`)) {
            setActiveTab(savedTab);
        } else {
            let firstTab = tabs[0];
            if (firstTab) {
                let firstTabTarget = firstTab.getAttribute("data-target");
                setActiveTab(firstTabTarget);
            }
        }
    }
    // Original click handlers for tabs
    tabs.forEach(tab => {
        tab.addEventListener("click", function () {
            setActiveTab(this.getAttribute("data-target"));
        });
    });
    restoreActiveTab();
    function saveTabOrder() {
        let userId = getUserId();
        if (!userId) {
            return;
        }
        let tabs = Array.from(tabBar.children).map(tab => tab.getAttribute("data-target"));
        fetch('/auth/save-tab-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, tabOrder: tabs })
        });
    }
    function loadTabOrder() {
        let userId = getUserId();
        if (!userId) {
            return;
        }
        fetch(`/auth/get-tab-order?userId=${userId}`)
            .then(response => response.json())
            .then(data => {
                if (data.tabOrder && data.tabOrder.length > 0) {
                    let savedOrder = data.tabOrder;
                    let currentTabs = Array.from(tabBar.children);
                    savedOrder.forEach(target => {
                        let tab = currentTabs.find(tab => tab.getAttribute("data-target") === target);
                        if (tab) tabBar.appendChild(tab);
                    });
                    restoreActiveTab();
                }
            });
    }
    loadTabOrder();
    
    // Initialize Sortable only if it's available
    if (typeof Sortable !== 'undefined') {
        new Sortable(tabBar, {
            animation: 250,
            swapThreshold: 0.5,
            chosenClass: "sortable-chosen",
            dragClass: "sortable-drag",
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
            forceFallback: true,
            fallbackOnBody: true,
            removeCloneOnHide: true,
            ghostClass: "sortable-ghost",
            fallbackTolerance: 3,
            fallbackOffset: { x: -10, y: -10 },
            onEnd: function () {
                saveTabOrder();
            }
        });
    }
}

// Call initializeTabs when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTabs);
} else {
    initializeTabs();
}

// --- General UI Event Listeners ---
document.querySelectorAll('.box-refresh').forEach(button => { button.addEventListener('click', () => { location.reload(); }); });
document.querySelectorAll('.t-collapse').forEach(button => { button.addEventListener('click', () => { const cardBody = button.closest('.card').querySelector('.card-body'); cardBody.classList.toggle('collapsed'); button.classList.toggle('fa-chevron-down'); button.classList.toggle('fa-chevron-up'); }); });
document.querySelectorAll('.t-close').forEach(button => { button.addEventListener('click', () => { const card = button.closest('.card'); card.style.display = 'none'; }); });

// --- Tab Content Switching for Booking Tabs ---
document.addEventListener('DOMContentLoaded', function () {
  const tabs = document.querySelectorAll('.mdl-tabs__tab');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach((tab) => {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      contents.forEach((content) => content.classList.remove('active-tab'));
      const target = tab.getAttribute('data-target');
      document.getElementById(target).classList.add('active-tab');
    });
  });
});

// --- Floor Filter and Sorting for Booking Tabs ---
document.addEventListener('DOMContentLoaded', () => {
  const floorFilter = document.getElementById('floor-filter');
  const filterAll = document.getElementById('filter-all');
  const filterNewest = document.getElementById('filter-newest'); // Newest link
  const activeTabSelector = '.tab-content.active-tab .scrollable-container';
  let isNewestActive = false; // State to track if "Newest" is active

  // Backup original order of cards to restore later
  const originalCardOrder = {};

  // Function to back up the initial order of cards
  function backupCardOrder() {
    document.querySelectorAll('.tab-content').forEach(tab => {
      const container = tab.querySelector('.scrollable-container');
      if (container) {
        originalCardOrder[tab.id] = Array.from(container.children); // Save original order
      }
    });
  }

  // Function to reset cards to their original order
  function resetToOriginalOrder() {
    const activeTab = document.querySelector(activeTabSelector);
    if (!activeTab) return;

    const container = activeTab.querySelector('.scrollable-container');
    if (container) {
      container.innerHTML = ''; // Clear container
      originalCardOrder[activeTab.id].forEach(card => container.appendChild(card)); // Restore original order
    }
  }

  // Function to filter room cards by floor
  function filterRooms(floor) {
    resetToOriginalOrder(); // Reset to original order
    const activeTab = document.querySelector(activeTabSelector);
    if (!activeTab) return;

    const cards = activeTab.querySelectorAll('.card[data-floor]');
    cards.forEach(card => {
      if (floor === 'all' || card.getAttribute('data-floor') === floor) {
        card.style.display = 'block'; // Show matching cards
      } else {
        card.style.display = 'none'; // Hide others
      }
    });
    isNewestActive = false; // Reset newest state
    PMSCore.debugLog('Rooms filtered', { floor, cardsCount: cards.length });
  }

  // Function to sort room cards by CHECK_IN_DATE
  function sortByNewest() {
    resetToOriginalOrder(); // Reset to original order
    const activeTab = document.querySelector(activeTabSelector);
    if (!activeTab) return;

    const container = activeTab;
    const cards = Array.from(activeTab.querySelectorAll('.card[data-checkin]'));

    const sortedCards = cards.sort((a, b) => {
      const dateA = new Date(a.getAttribute('data-checkin'));
      const dateB = new Date(b.getAttribute('data-checkin'));
      return dateB - dateA; // Sort by newest first
    });

    // Re-append sorted cards
    sortedCards.forEach(card => container.appendChild(card));

    isNewestActive = true; // Mark newest as active
  }

  // Event listener for "All Floors"
  filterAll.addEventListener('click', () => {
    filterRooms('all'); // Reset to all floors
    floorFilter.value = ''; // Reset dropdown
  });

  // Event listener for dropdown (Filter by Floor)
  floorFilter.addEventListener('change', () => {
    const selectedFloor = floorFilter.value;
    filterRooms(selectedFloor);
  });

  // Event listener for "Newest"
  filterNewest.addEventListener('click', () => {
    sortByNewest();
    floorFilter.value = ''; // Reset dropdown
  });

  // Tab switching logic to reapply "Newest" if active
  const tabLinks = document.querySelectorAll('.tabs_three');
  tabLinks.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();

      // Switch active tab
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active-tab'));
      document.querySelectorAll('.tabs_three').forEach(link => link.classList.remove('is-active'));

      const target = document.getElementById(tab.getAttribute('data-target'));
      if (target) {
        target.classList.add('active-tab');
        tab.classList.add('is-active');

        // Reapply "Newest" if active
        if (isNewestActive) {
          sortByNewest();
        }
      }
    });
  });

  // Backup card order on page load
  backupCardOrder();

  // Default: Show all floors on page load
  filterRooms('all');
});

// --- Sort Button Functionality ---
document.addEventListener('DOMContentLoaded', () => {
  const sortButton = document.getElementById('sort-button');
  const activeTabSelector = '.tab-content.active-tab .scrollable-container';
  let sortState = 0; // Sorting state: 0 = Reset, 1 = Late Checkout, 2 = Check-in Status
  let originalCardOrder = {}; // Store original order of cards

  // Function to backup original order of cards
  function backupCardOrder() {
    document.querySelectorAll('.tab-content').forEach(tab => {
      const container = tab.querySelector('.scrollable-container');
      if (container) {
        originalCardOrder[tab.id] = Array.from(container.children); // Save original order
      }
    });
  }

  // Function to reset to original order
  function resetToOriginalOrder() {
    const activeTab = document.querySelector('.tab-content.active-tab');
    if (!activeTab) return;

    const container = activeTab.querySelector('.scrollable-container');
    if (container) {
      container.innerHTML = ''; // Clear container
      if (originalCardOrder[activeTab.id]) {
        originalCardOrder[activeTab.id].forEach(card => container.appendChild(card)); // Restore original order
      }
    }
    sortState = 0; // Reset sort state
    sortButton.innerText = 'Sort';
  }

  // Function to sort by Late Checkout (Priority-based sorting)
  function sortByLateCheckout() {
    resetToOriginalOrder();
    const activeTab = document.querySelector(activeTabSelector);
    if (!activeTab) return;

    const container = activeTab;
    const cards = Array.from(activeTab.querySelectorAll('.card[data-late-checkout][data-booking-status]'));

    if (cards.length === 0) return; // Avoid breaking if no cards are found

    const sortedCards = cards.sort((a, b) => {
      const statusA = a.getAttribute('data-booking-status');
      const statusB = b.getAttribute('data-booking-status');
      const lateA = parseInt(a.getAttribute('data-late-checkout')) || 0;
      const lateB = parseInt(b.getAttribute('data-late-checkout')) || 0;

      function getPriority(status, lateCheckout) {
        if (status === 'pending' && lateCheckout === 0) return 1;
        if (status === 'pending' && lateCheckout === 1) return 2;
        if (status === 'check-Out' && lateCheckout === 0) return 3;
        if (status === 'check-Out' && lateCheckout === 1) return 4;
        return 5; // Default priority for other statuses
      }

      return getPriority(statusB, lateA) - getPriority(statusA, lateB);
    });

    sortedCards.forEach(card => container.appendChild(card));
  }

  // Function to sort by Check-in Status (Priority-based sorting)
  function sortByCheckInStatus() {
    resetToOriginalOrder();
    const activeTab = document.querySelector(activeTabSelector);
    if (!activeTab) return;

    const container = activeTab;
    const cards = Array.from(activeTab.querySelectorAll('.card[data-checkin-status][data-booking-status]'));

    if (cards.length === 0) return; // Avoid breaking if no cards are found

    const sortedCards = cards.sort((a, b) => {
      const statusA = a.getAttribute('data-booking-status');
      const statusB = b.getAttribute('data-booking-status');
      const checkInA = parseInt(a.getAttribute('data-checkin-status')) || 0;
      const checkInB = parseInt(b.getAttribute('data-checkin-status')) || 0;

      function getPriority(status, checkInStatus) {
        if (status === 'pending' && checkInStatus === 1) return 1;
        if (status === 'pending' && checkInStatus === 0) return 2;
        if (status === 'check-In' && checkInStatus === 1) return 3;
        if (status === 'check-In' && checkInStatus === 0) return 4;
        return 5; // Default priority for other statuses
      }

      return getPriority(statusA, checkInA) - getPriority(statusB, checkInB);
    });

    sortedCards.forEach(card => container.appendChild(card));
  }

  // Function to toggle Sort button visibility
  function toggleSortButton() {
    const activeTab = document.querySelector('.tab-content.active-tab');

    if (activeTab && (activeTab.id === 'checked-in-content' || activeTab.id === 'checkout-content')) {
      sortButton.style.display = 'inline-block'; // Show button
    } else {
      sortButton.style.display = 'none'; // Hide button
    }
  }

  // Click event for sorting button (ONLY for "Checked-In" and "Checked-Out")
  sortButton.addEventListener('click', () => {
    const activeTab = document.querySelector('.tab-content.active-tab');

    if (!activeTab) return;

    // 🔹 If the active tab is "Checked-In", toggle between sorting by Check-in Status and Reset
    if (activeTab.id === 'checked-in-content') {
      if (sortState === 0) {
        sortByCheckInStatus();
        sortState = 1;
        sortButton.innerText = 'Sort';
      } else {
        resetToOriginalOrder();
      }
    }
    // 🔹 If the active tab is "Checked-Out", toggle between sorting by Late Checkout (Priority-based) and Reset
    else if (activeTab.id === 'checkout-content') {
      if (sortState === 0) {
        sortByLateCheckout();
        sortState = 1;
        sortButton.innerText = 'Sort';
      } else {
        resetToOriginalOrder();
      }
    }
  });

  // Listen for tab changes and show/hide Sort button accordingly
  // Removed duplicate event listener - already handled above

  // Backup original order when the page loads
  backupCardOrder();

  // Hide Sort button on page load (only shows if on Checked-In or Checked-Out tab)
  toggleSortButton();
});

// --- Move to Occupied Button ---
$(document).ready(function () {
  $("#moveToOccupiedBtn").click(function () {
      $.ajax({
          url: "/dashboard/check-move-to-occupied",
          type: "GET",
          success: function (response) {
              if (response.count === 0) {
                  // Show info toast for no guests
                  $.toast({
                      heading: 'No Guests Available',
                      text: 'There are no guests to move to occupied.',
                      position: 'top-right',
                      loaderBg: '#ff6849',
                      icon: 'info',
                      hideAfter: 3000,
                      stack: 6
                  });
              } else {
                  // Show SweetAlert2 confirmation
                  Swal.fire({
                      title: "Move to Occupied?",
                      text: `Are you sure you want to move ${response.count} checked-in guests to occupied status?`,
                      icon: "warning",
                      showCancelButton: true,
                      confirmButtonColor: "#DD6B55",
                      confirmButtonText: "Yes, move them!",
                      cancelButtonText: "No, cancel",
                      allowOutsideClick: false
                  }).then((result) => {
                      if (result.isConfirmed) {
                          // Show loading state
                          Swal.fire({
                              title: "Moving Guests...",
                              text: "Please wait while we move the guests to occupied status.",
                              allowOutsideClick: false,
                              didOpen: () => {
                                  Swal.showLoading();
                              }
                          });
                          
                          // Send move to occupied request
                          $.ajax({
                              url: "/dashboard/move-to-occupied",
                              type: "POST",
                              success: function (moveResponse) {
                                  // Close loading dialog
                                  Swal.close();
                                  
                                  // Show success toast
                                  PMSCore.showSuccess('Success!', `${response.count} guests have been moved to occupied status successfully.`, {
                                      hideAfter: 5000
                                  });

                                  // Smooth reload of dashboard data
                                  setTimeout(() => {
                                      reloadDashboardData();
                                  }, 1000);
                              },
                              error: function (xhr, status, error) {
                                  // Close loading dialog
                                  Swal.close();
                                  
                                  // Show error toast
                                  PMSCore.showError('Error!', 'Failed to move guests to occupied status. Please try again.', {
                                      hideAfter: 5000
                                  });
                              }
                          });
                      }
                  });
              }
          },
          error: function (xhr, status, error) {
              // Show error toast
              PMSCore.showError('Error!', 'Failed to check guest status. Please try again.', {
                  hideAfter: 5000
              });
          }
      });
  });
});



// --- Check-in/Check-out Toggle Functionality ---
document.addEventListener('DOMContentLoaded', function () {
    const toggles = document.querySelectorAll('.custom-toggle-checkin');

    toggles.forEach(toggle => {
        toggle.addEventListener('change', function () {
            // Prevent double submission
            if (PMSCore.getSubmitting()) {
                this.checked = false;
                return;
            }
            
            const bookingId = this.getAttribute('data-idno'); // Get the Booking ID from data attribute
            const newStatus = 'check-In'; // Only update to 'Check-In'

            // Confirm with the user (optional)
            if (!confirm('Are you sure you want to check in this booking?')) {
                this.checked = false; // Reset toggle
                return;
            }
            
            PMSCore.setSubmitting(true);

            // Send AJAX request to update check-in status
            $.ajax({
                url: '/dashboard/booking/update_status',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    BookingID: bookingId,
                    status: newStatus
                }),
                success: (response) => {
                    PMSCore.setSubmitting(false);
                    try {
                        PMSCore.validateResponse(response);
                        alert(`Booking ID ${bookingId} successfully checked in!`);
                        
                        // Move the card to the "Checked-In" tab if it exists
                        const card = this.closest('.card');
                        if (card) {
                            const checkedInTab = document.querySelector('#checked-in-content .scrollable-container');
                            if (checkedInTab) {
                                // Add smooth transition
                                card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                                card.style.opacity = '0';
                                card.style.transform = 'scale(0.95)';
                                
                                setTimeout(() => {
                                    // Move card to checked-in tab
                                    checkedInTab.appendChild(card);
                                    card.style.opacity = '1';
                                    card.style.transform = 'scale(1)';
                                    PMSCore.debugLog('Card moved to checked-in tab', { bookingId });
                                }, 500);
                            }
                        }
                        
                        this.disabled = true; // Disable the toggle after success
                        PMSCore.debugLog('Check-in successful', { bookingId, status: newStatus });
                    } catch (error) {
                        PMSCore.handleError(error, 'check-in success handler');
                        alert(response.message || 'Failed to check in.');
                        this.checked = false; // Reset toggle
                    }
                },
                error: (xhr, status, error) => {
                    PMSCore.setSubmitting(false);
                    PMSCore.handleError(error, 'check-in AJAX error');
                    alert('An error occurred while checking in the booking.');
                    this.checked = false; // Reset toggle
                }
            });
        });
    });
});

// CHECK-OUT TOGGLE
document.addEventListener('DOMContentLoaded', function () {
    const toggles = document.querySelectorAll('.custom-toggle-checkout');

    toggles.forEach(toggle => {
        toggle.addEventListener('change', function () {
            const bookingId = this.getAttribute('data-idno'); // Get the Booking ID from data attribute
            const newStatus = 'check-Out'; // Only update to 'Check-Out'
            const lateCheckOut = this.getAttribute('data-late-checkout');

            // Confirm with the user (optional)
            if (!confirm('Are you sure you want to check out this booking?')) {
                this.checked = false; // Reset toggle
                return;
            }

            // Send AJAX request to update check-out status
            $.ajax({
                url: '/dashboard/booking/update_status',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    BookingID: bookingId,
                    status: newStatus,
                    lateCheckOut: lateCheckOut || null
                }),
                success: (response) => {
                    try {
                        PMSCore.validateResponse(response);
                        alert(`Booking ID ${bookingId} successfully checked out!`);
                        
                        // Move the card to the cleaning tab
                        const card = this.closest('.card');
                        if (card) {
                            const cleaningTab = document.querySelector('#cleaning-content .scrollable-container');
                            if (cleaningTab) {
                                // Add smooth transition
                                card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
                                card.style.opacity = '0';
                                card.style.transform = 'scale(0.95)';
                                
                                setTimeout(() => {
                                    // Move card to cleaning tab
                                    cleaningTab.appendChild(card);
                                    card.style.opacity = '1';
                                    card.style.transform = 'scale(1)';
                                    
                                    // Update card attributes for cleaning tab
                                    const toggles = card.querySelectorAll('.custom-toggle-checkin, .custom-toggle-checkout');
                                    const badges = card.querySelectorAll('.badge');
                                    const progressBars = card.querySelectorAll('.progress');
                                    
                                    toggles.forEach(toggle => toggle.style.display = 'none');
                                    badges.forEach(badge => badge.style.display = 'none');
                                    progressBars.forEach(progress => progress.style.display = 'none');
                                    

                                    
                                    PMSCore.debugLog('Card moved to cleaning tab after checkout', { bookingId });
                                }, 500);
                            } else {
                                // Fallback: remove card if cleaning tab doesn't exist
                                setTimeout(() => {
                                    card.remove();
                                    PMSCore.debugLog('Card removed after checkout (no cleaning tab)', { bookingId });
                                }, 500);
                            }
                        }
                        
                        this.disabled = true; // Disable the toggle after success
                        PMSCore.debugLog('Check-out successful', { bookingId, status: newStatus, lateCheckOut });
                    } catch (error) {
                        PMSCore.handleError(error, 'check-out success handler');
                        alert(response.message || 'Failed to check out.');
                        this.checked = false; // Reset toggle
                    }
                },
                error: (xhr, status, error) => {
                    PMSCore.handleError(error, 'check-out AJAX error');
                    alert('An error occurred while checking out the booking.');
                    this.checked = false; // Reset toggle
                }
            });
        });
    });
});

// --- Cleaning Update Functionality ---
document.addEventListener('DOMContentLoaded', function () {
    // Select all cleaning containers
    const cleaningIcons = document.querySelectorAll('.cleaning-container');

    // Add click event listener to each broom icon
    cleaningIcons.forEach(icon => {
        icon.addEventListener('click', function () {
            const roomId = this.getAttribute('data-room-id'); // Get the Room ID from the data attribute
            const isCurrentlyOn = this.querySelector('i').classList.contains('on'); // Check if it's currently "on"
            const newStatus = isCurrentlyOn ? 'Dirty' : 'Clean'; // Toggle between 'Dirty' and 'Clean'

            console.log(`Room ID: ${roomId}`);
            console.log(`New Status to Update: ${newStatus}`);

            // Confirm with the user before updating
            if (!confirm(`Mark this room as ${newStatus}?`)) {
                return;
            }

            // Send AJAX request to update the room status
            $.ajax({
                                    url: `/dashboard/room_maintenance/updateStatus/${roomId}`, // Backend route
                type: 'PUT', // HTTP method
                contentType: 'application/json',
                data: JSON.stringify({ status: newStatus }), // Send the new status
                success: function (response) {
                    console.log('Server Response:', response); // Log the server response
                    alert(response.message);

                    // Remove the card from the DOM after a successful update
                    const card = icon.closest('.card');
                    if (card) {
                        card.remove();
                        console.log(`Room ${roomId} removed from the cleaning list.`);
                    }
                    
                    // Smooth reload of dashboard data
                    setTimeout(() => {
                        reloadDashboardData();
                    }, 1000);
                },
                error: function (xhr, status, error) {
                    console.error('AJAX Error:', error); // Log AJAX error
                    alert('An error occurred while updating the room status.');
                }
            });
        });
    });
});

// --- Expandable Content Toggle ---
document.addEventListener('DOMContentLoaded', () => {
  const toggles = document.querySelectorAll('.toggle-details');

  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const expandableContent = toggle.nextElementSibling;

      if (expandableContent.classList.contains('active')) {
        expandableContent.style.maxHeight = null; // Collapse
        expandableContent.classList.remove('active');
      } else {
        expandableContent.style.maxHeight = expandableContent.scrollHeight + 'px'; // Expand
        expandableContent.classList.add('active');
      }
    });
  });
});

// ========================================
// FILTER FUNCTIONALITY
// ========================================

$(document).ready(function() {
    // Initialize filter variables
    let sortState = 0;
    let isNewestActive = false;
    let originalCardOrder = {};
    
    // Backup original order of cards
    function backupCardOrder() {
        $('.tab-content').each(function() {
            const container = $(this).find('.scrollable-container');
            if (container.length) {
                originalCardOrder[$(this).attr('id')] = container.children().clone();
            }
        });
    }
    
    // Reset to original order
    function resetToOriginalOrder() {
        const activeTab = $('.tab-content.active-tab');
        if (!activeTab.length) return;
        
        const container = activeTab.find('.scrollable-container');
        if (container.length && originalCardOrder[activeTab.attr('id')]) {
            container.empty();
            originalCardOrder[activeTab.attr('id')].each(function() {
                container.append($(this).clone());
            });
        }
        sortState = 0;
        $('#sort-button').text('Sort');
    }
    
    // Filter rooms by floor
    function filterRooms(floor) {
        resetToOriginalOrder();
        const activeTab = $('.tab-content.active-tab .scrollable-container');
        if (!activeTab.length) return;
        
        activeTab.find('.card[data-floor]').each(function() {
            const cardFloor = $(this).attr('data-floor');
            if (floor === 'all' || cardFloor === floor) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
        isNewestActive = false;
    }
    
    // Sort by newest booking
    function sortByNewest() {
        resetToOriginalOrder();
        const activeTab = $('.tab-content.active-tab .scrollable-container');
        if (!activeTab.length) return;
        
        const cards = activeTab.find('.card[data-checkin]').toArray();
        cards.sort((a, b) => {
            const dateA = new Date($(a).attr('data-checkin'));
            const dateB = new Date($(b).attr('data-checkin'));
            return dateB - dateA;
        });
        
        activeTab.empty();
        cards.forEach(card => activeTab.append(card));
        isNewestActive = true;
    }
    
    // Sort by late checkout (for checkout tab)
    function sortByLateCheckout() {
        resetToOriginalOrder();
        const activeTab = $('.tab-content.active-tab .scrollable-container');
        if (!activeTab.length) return;
        
        const cards = activeTab.find('.card[data-late-checkout][data-booking-status]').toArray();
        if (cards.length === 0) return;
        
        cards.sort((a, b) => {
            const statusA = $(a).attr('data-booking-status');
            const statusB = $(b).attr('data-booking-status');
            const lateA = parseInt($(a).attr('data-late-checkout')) || 0;
            const lateB = parseInt($(b).attr('data-late-checkout')) || 0;
            
            function getPriority(status, lateCheckout) {
                if (status === 'pending' && lateCheckout === 0) return 1;
                if (status === 'pending' && lateCheckout === 1) return 2;
                if (status === 'check-Out' && lateCheckout === 0) return 3;
                if (status === 'check-Out' && lateCheckout === 1) return 4;
                return 5;
            }
            
            return getPriority(statusB, lateA) - getPriority(statusA, lateB);
        });
        
        activeTab.empty();
        cards.forEach(card => activeTab.append(card));
    }
    
    // Sort by check-in status (for check-in tab)
    function sortByCheckInStatus() {
        resetToOriginalOrder();
        const activeTab = $('.tab-content.active-tab .scrollable-container');
        if (!activeTab.length) return;
        
        const cards = activeTab.find('.card[data-checkin-status][data-booking-status]').toArray();
        if (cards.length === 0) return;
        
        cards.sort((a, b) => {
            const statusA = $(a).attr('data-booking-status');
            const statusB = $(b).attr('data-booking-status');
            const checkInA = parseInt($(a).attr('data-checkin-status')) || 0;
            const checkInB = parseInt($(b).attr('data-checkin-status')) || 0;
            
            function getPriority(status, checkInStatus) {
                if (status === 'pending' && checkInStatus === 1) return 1;
                if (status === 'pending' && checkInStatus === 0) return 2;
                if (status === 'check-In' && checkInStatus === 1) return 3;
                if (status === 'check-In' && checkInStatus === 0) return 4;
                return 5;
            }
            
            return getPriority(statusA, checkInA) - getPriority(statusB, checkInB);
        });
        
        activeTab.empty();
        cards.forEach(card => activeTab.append(card));
    }
    
    // Toggle button visibility based on active tab
    function toggleButtonVisibility() {
        const activeTab = $('.tab-content.active-tab');
        const activeTabId = activeTab.attr('id');
        
        // Move to Occupied button - only show on checked-in tab
        if (activeTabId === 'checked-in-content') {
            $('#moveToOccupiedBtn').show();
        } else {
            $('#moveToOccupiedBtn').hide();
        }
        
        // Sort button - only show on checked-in and checkout tabs
        if (activeTabId === 'checked-in-content' || activeTabId === 'checkout-content') {
            $('#sort-button').show();
        } else {
            $('#sort-button').hide();
        }
    }
    
    // Listen for tab clicks and update button visibility
    $('.tabs_three').on('click', function() {
        setTimeout(toggleButtonVisibility, 100);
    });
    

    
    $('#sort-button').click(function() {
        const activeTab = $('.tab-content.active-tab');
        const activeTabId = activeTab.attr('id');
        
        if (activeTabId === 'checked-in-content') {
            if (sortState === 0) {
                sortByCheckInStatus();
                sortState = 1;
                $(this).text('Sort');
            } else {
                resetToOriginalOrder();
            }
        } else if (activeTabId === 'checkout-content') {
            if (sortState === 0) {
                sortByLateCheckout();
                sortState = 1;
                $(this).text('Sort');
            } else {
                resetToOriginalOrder();
            }
        }
    });
    
    $('#filter-newest').click(function() {
        sortByNewest();
        $('.dropdown-container .dropdown-toggle').text('Select Floor');
    });
    
    $('#filter-all').click(function() {
        filterRooms('all');
        $('.dropdown-container .dropdown-toggle').text('Select Floor');
    });
    
    // Floor dropdown change event - SPECIFIC to floor filter only
    $('.dropdown-container .dropdown-toggle').change(function() {
        const selectedFloor = $(this).val();
        filterRooms(selectedFloor);
    });
    
    // Dropdown functionality - SPECIFIC to floor filter only
    $('.dropdown-container .dropdown-toggle').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const dropdownMenu = $(this).next('.dropdown-menu');
        
        // Toggle dropdown visibility
        if (dropdownMenu.hasClass('show')) {
            dropdownMenu.removeClass('show');
        } else {
            // Hide all other floor dropdowns first
            $('.dropdown-container .dropdown-menu').removeClass('show');
            
            // Show this dropdown
            dropdownMenu.addClass('show');
        }
    });
    
    // Close floor dropdown when clicking outside - SPECIFIC to floor filter only
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.dropdown-container .dropdown-toggle, .dropdown-container .dropdown-menu').length) {
            $('.dropdown-container .dropdown-menu').removeClass('show');
        }
    });
    
    // Handle floor option clicks
    $(document).on('click', '.floor-option', function(e) {
        e.preventDefault();
        const selectedFloor = $(this).attr('data-floor');
        filterRooms(selectedFloor);
        $('.dropdown-container .dropdown-toggle').text('Floor ' + selectedFloor);
    });
    
    // Tab click event to reapply filters
    // Removed duplicate event listener - already handled above
    
    // Initialize on page load
    backupCardOrder();
    toggleButtonVisibility();
    filterRooms('all');
});

// ========================================
// TOGGLE SWITCH FUNCTIONALITY
// ========================================

$(document).ready(function() {
    // Function to toggle "Move to Occupied" button visibility
    function toggleMoveToOccupiedButton() {
        const activeTab = $('.tab-content.active-tab');
        const moveToOccupiedBtn = $('#moveToOccupiedBtn');

        if (activeTab.length && activeTab.attr('id') === 'checked-in-content') {
            moveToOccupiedBtn.show(); // Show button only if Checked-In tab is active
        } else {
            moveToOccupiedBtn.hide(); // Hide button in other tabs
        }
    }

    // Ensure correct button visibility on page load
    const moveToOccupiedBtn = $('#moveToOccupiedBtn');
    moveToOccupiedBtn.hide(); // Hide the button by default

    // Small delay to allow tab activation detection
    setTimeout(() => {
        toggleMoveToOccupiedButton();
    }, 100);

    // Listen for tab clicks and update button visibility
    $('.tabs_three').on('click', function() {
        setTimeout(toggleMoveToOccupiedButton, 100);
    });

    // CHECK-IN TOGGLE
    $(document).on('change', '.custom-toggle-checkin', function() {
        const bookingId = $(this).attr('data-idno');
        const newStatus = 'check-In';

        // Show SweetAlert2 confirmation
        Swal.fire({
            title: "Check In Guest?",
            text: `Are you sure you want to check in booking ID ${bookingId}?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#28a745",
            confirmButtonText: "Yes, check in!",
            cancelButtonText: "No, cancel",
            allowOutsideClick: false
        }).then((result) => {
            if (result.isConfirmed) {
                // Show loading state
                Swal.fire({
                    title: "Checking In...",
                    text: "Please wait while we process the check-in.",
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                // Send AJAX request to update check-in status
                $.ajax({
                    url: '/dashboard/booking/update_status',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        BookingID: bookingId,
                        status: newStatus
                    }),
                    success: (response) => {
                        // Close loading dialog
                        Swal.close();
                        
                        try {
                            PMSCore.validateResponse(response);
                            
                            // Move the card to the "Checked-In" tab if it exists
                            const card = $(this).closest('.card');
                            if (card.length) {
                                const checkedInTab = $('#checked-in-content .scrollable-container');
                                if (checkedInTab.length) {
                                    // Add smooth transition
                                    card.css({
                                        'transition': 'opacity 0.5s ease-out, transform 0.5s ease-out',
                                        'opacity': '0',
                                        'transform': 'scale(0.95)'
                                    });
                                    
                                    setTimeout(() => {
                                        // Move card to checked-in tab
                                        checkedInTab.append(card);
                                        card.css({
                                            'opacity': '1',
                                            'transform': 'scale(1)'
                                        });
                                        PMSCore.debugLog('Card moved to checked-in tab (SweetAlert)', { bookingId });
                                    }, 500);
                                }
                            }
                            
                            // Show success toast
                            PMSCore.showSuccess('Check-In Successful!', `Booking ID ${bookingId} has been checked in successfully.`);
                            $(this).prop('disabled', true);
                            PMSCore.debugLog('Check-in successful (SweetAlert)', { bookingId, status: newStatus });
                            
                            // Trigger Socket.IO event after all processing is complete
                            if (typeof dashboardSocket !== 'undefined') {
                                dashboardSocket.emit('dashboard-updated', {
                                    action: 'booking-status-updated',
                                    message: `Booking ${bookingId} checked in successfully`,
                                    data: response.data
                                });
                            }
                        } catch (error) {
                            PMSCore.handleError(error, 'check-in SweetAlert success handler');
                            // Show error toast
                            PMSCore.showError('Check-In Failed!', response.message || 'Failed to check in the booking.');
                            $(this).prop('checked', false);
                        }
                    },
                    error: (xhr, status, error) => {
                        // Close loading dialog
                        Swal.close();
                        
                        PMSCore.handleError(error, 'check-in SweetAlert AJAX error');
                        // Show error toast
                        PMSCore.showError('Error!', 'An error occurred while checking in the booking.');
                        $(this).prop('checked', false);
                    }
                });
            } else {
                // User cancelled - reset toggle
                $(this).prop('checked', false);
            }
        });
    });

    // CHECK-OUT TOGGLE
    $(document).on('change', '.custom-toggle-checkout', function() {
        const bookingId = $(this).attr('data-idno');
        const newStatus = 'check-Out';
        const lateCheckOut = $(this).attr('data-late-checkout');

        // Show SweetAlert2 confirmation
        Swal.fire({
            title: "Check Out Guest?",
            text: `Are you sure you want to check out booking ID ${bookingId}?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#dc3545",
            confirmButtonText: "Yes, check out!",
            cancelButtonText: "No, cancel",
            allowOutsideClick: false
        }).then((result) => {
            if (result.isConfirmed) {
                // Show loading state
                Swal.fire({
                    title: "Checking Out...",
                    text: "Please wait while we process the check-out.",
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                // Get the room ID from the card
                const roomId = $(this).closest('.card').attr('data-idno');
                
                // Send AJAX request to update check-out status
                $.ajax({
                    url: '/dashboard/booking/update_status',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        BookingID: bookingId,
                        status: newStatus,
                        lateCheckOut: lateCheckOut || null
                    }),
                    success: (response) => {
                        // Close loading dialog
                        Swal.close();
                        
                        try {
                            PMSCore.validateResponse(response);
                            
                            // Remove card from checkout tab immediately after successful booking update
                            const card = $(this).closest('.card');
                            if (card.length) {
                                card.fadeOut(500, function() {
                                    $(this).remove();
                                    PMSCore.debugLog('Card removed from checkout tab after successful booking update', { bookingId });
                                });
                            }
                            
                            // Now update the room status to Cleaning
                            if (roomId) {
                                $.ajax({
                                    url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                                    type: 'PUT',
                                    contentType: 'application/json',
                                    data: JSON.stringify({ status: 4 }), // 4 = Cleaning
                                    success: function(roomResponse) {
                                        console.log('Room status updated to cleaning:', roomResponse);
                                        
                                        // Move the card to the cleaning tab with smooth animation
                                        const card = $(this).closest('.card');
                                        if (card.length) {
                                            const cleaningTab = $('#cleaning-content .scrollable-container');
                                            if (cleaningTab.length) {
                                                // Add smooth transition
                                                card.css({
                                                    'transition': 'opacity 0.5s ease-out, transform 0.5s ease-out',
                                                    'opacity': '0',
                                                    'transform': 'scale(0.95)'
                                                });
                                                
                                                setTimeout(() => {
                                                    // Move card to cleaning tab
                                                    cleaningTab.append(card);
                                                    card.css({
                                                        'opacity': '1',
                                                        'transform': 'scale(1)'
                                                    });
                                                    
                                                    // Update card attributes for cleaning tab
                                                    card.find('.custom-toggle-checkin, .custom-toggle-checkout').hide();
                                                    card.find('.badge').hide();
                                                    card.find('.progress').hide();
                                                    
                                                    PMSCore.debugLog('Card moved to cleaning tab after checkout (SweetAlert)', { bookingId });
                                                }, 500);
                                                
                                                // Remove card from checkout tab after successful move
                                                setTimeout(() => {
                                                    card.remove();
                                                    PMSCore.debugLog('Card removed from checkout tab', { bookingId });
                                                }, 1000);
                                            } else {
                                                // Fallback: remove card if cleaning tab doesn't exist
                                                setTimeout(() => {
                                                    card.remove();
                                                    PMSCore.debugLog('Card removed after checkout (no cleaning tab)', { bookingId });
                                                }, 500);
                                            }
                                        }
                                        
                                        // Show success toast
                                        PMSCore.showSuccess('Check-Out Successful!', `Booking ID ${bookingId} has been checked out and room ${roomId} moved to cleaning tab.`);
                                        $(this).prop('disabled', true);
                                        PMSCore.debugLog('Check-out successful (SweetAlert)', { bookingId, status: newStatus, lateCheckOut, roomId });
                                        
                                        // Trigger Socket.IO event after all processing is complete
                                        if (typeof dashboardSocket !== 'undefined') {
                                            dashboardSocket.emit('dashboard-updated', {
                                                action: 'booking-status-updated',
                                                message: `Booking ${bookingId} checked out successfully`,
                                                data: response.data
                                            });
                                        }
                                        
                                        // Smooth reload of dashboard data
                                        setTimeout(() => {
                                            reloadDashboardData();
                                        }, 1000);
                                    },
                                    error: function(roomXhr, roomStatus, roomError) {
                                        console.error('Failed to update room status:', roomError);
                                        // Still show success for booking update, but warn about room status
                                        PMSCore.showWarning('Check-Out Partially Successful!', `Booking ${bookingId} checked out, but room status update failed.`);
                                    }
                                });
                            } else {
                                // If no room ID, just show success for booking update
                                PMSCore.showSuccess('Check-Out Successful!', `Booking ID ${bookingId} has been checked out successfully.`);
                                $(this).prop('disabled', true);
                            }
                        } catch (error) {
                            PMSCore.handleError(error, 'check-out SweetAlert success handler');
                            // Show error toast
                            PMSCore.showError('Check-Out Failed!', response.message || 'Failed to check out the booking.');
                            $(this).prop('checked', false);
                        }
                    },
                    error: (xhr, status, error) => {
                        // Close loading dialog
                        Swal.close();
                        
                        PMSCore.handleError(error, 'check-out SweetAlert AJAX error');
                        // Show error toast
                        PMSCore.showError('Error!', 'An error occurred while checking out the booking.');
                        $(this).prop('checked', false);
                    }
                });
            } else {
                // User cancelled - reset toggle
                $(this).prop('checked', false);
            }
        });
    });

    // CLEANING UPDATE
    $(document).on('click', '.cleaning-container', function() {
        const roomId = $(this).attr('data-room-id');
        const broomIcon = $(this).find('i');
        const isCurrentlyOn = broomIcon.hasClass('on');
        const card = $(this).closest('.card');
        
        console.log('Cleaning container clicked:', {
            roomId: roomId,
            isCurrentlyOn: isCurrentlyOn,
            broomIconClasses: broomIcon.attr('class')
        });

        // If broom is ON (cleaning), clicking will move to available
        if (isCurrentlyOn) {
            // Show SweetAlert2 confirmation
            Swal.fire({
                title: "Move to Available Room?",
                text: `Are you sure you want to move room ${roomId} to Available Room tab?`,
                icon: "question",
                showCancelButton: true,
                confirmButtonColor: "#28a745",
                confirmButtonText: "Yes, move!",
                cancelButtonText: "No, cancel",
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    // Show loading state
                    Swal.fire({
                        title: "Moving Room...",
                        text: "Please wait while we move the room to Available Room tab.",
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    // Send AJAX request to update the room status to Available (1)
                    $.ajax({
                        url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                        type: 'PUT',
                        contentType: 'application/json',
                        data: JSON.stringify({ status: 1 }), // 1 = Available
                        success: function(response) {
                            console.log('AJAX success response:', response);
                            // Close loading dialog
                            Swal.close();
                            
                            // Show success toast
                            PMSCore.showSuccess('Room Moved!', `Room ${roomId} has been moved to Available Room tab successfully.`);

                            // Remove the card from the DOM after a successful update (like the working copy)
                            if (card.length) {
                                card.remove();
                                console.log(`Room ${roomId} removed from the cleaning list.`);
                            }
                            
                            // Trigger Socket.IO event after all processing is complete
                            if (typeof dashboardSocket !== 'undefined') {
                                dashboardSocket.emit('dashboard-updated', {
                                    action: 'room-status-updated',
                                    message: `Room ${roomId} moved to available`,
                                    data: response.data
                                });
                            }
                            
                            // Smooth reload of dashboard data
                            setTimeout(() => {
                                reloadDashboardData();
                            }, 1000);
                        },
                        error: function(xhr, status, error) {
                            // Close loading dialog
                            Swal.close();
                            
                            // Show error toast
                            PMSCore.showError('Error!', 'An error occurred while moving the room to Available Room tab.');
                        }
                    });
                }
            });
        } else {
            // If broom is OFF, clicking will mark as cleaning (this shouldn't happen in cleaning tab)
            // But keeping it for safety
            Swal.fire({
                title: "Mark as Cleaning?",
                text: `Are you sure you want to mark room ${roomId} as Cleaning?`,
                icon: "question",
                showCancelButton: true,
                confirmButtonColor: "#ffc107",
                confirmButtonText: "Yes, mark!",
                cancelButtonText: "No, cancel",
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    // Show loading state
                    Swal.fire({
                        title: "Updating Room...",
                        text: "Please wait while we update the room status.",
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    // Send AJAX request to update the room status to Cleaning (4)
                    $.ajax({
                        url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                        type: 'PUT',
                        contentType: 'application/json',
                        data: JSON.stringify({ status: 4 }), // 4 = Cleaning
                        success: function(response) {
                            // Close loading dialog
                            Swal.close();
                            
                            // Show success toast
                            PMSCore.showSuccess('Room Updated!', `Room ${roomId} has been marked as Cleaning successfully.`);

                            // Toggle the broom icon state
                            broomIcon.removeClass('off').addClass('on');
                            
                            // Trigger Socket.IO event after all processing is complete
                            if (typeof dashboardSocket !== 'undefined') {
                                dashboardSocket.emit('dashboard-updated', {
                                    action: 'room-status-updated',
                                    message: `Room ${roomId} marked as cleaning`,
                                    data: response.data
                                });
                            }
                            
                            // Smooth reload of dashboard data
                            setTimeout(() => {
                                reloadDashboardData();
                            }, 1000);
                        },
                        error: function(xhr, status, error) {
                            // Close loading dialog
                            Swal.close();
                            
                            // Show error toast
                            PMSCore.showError('Error!', 'An error occurred while updating the room status.');
                        }
                    });
                }
            });
        }
    });



    // TOGGLE DETAILS EXPAND/COLLAPSE
    $(document).on('click', '.toggle-details', function() {
        const expandableContent = $(this).next();
        
        if (expandableContent.hasClass('active')) {
            expandableContent.css('maxHeight', null);
            expandableContent.removeClass('active');
        } else {
            expandableContent.css('maxHeight', expandableContent[0].scrollHeight + 'px');
            expandableContent.addClass('active');
        }
    });
});
