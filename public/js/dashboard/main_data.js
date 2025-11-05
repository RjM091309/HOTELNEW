

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

    // CHECK-IN TOGGLE (REVERSIBLE)
    $(document).on('change', '.custom-toggle-checkin', function() {
        const $toggle = $(this);
        const bookingId = $toggle.attr('data-idno');
        
        // Read the NEW state (after user clicked)
        // User clicked OFF → ON means they want to check in (isChecked = true)
        // User clicked ON → OFF means they want to revert (isChecked = false)
        const isChecked = $toggle.is(':checked');
        
        // Immediately revert toggle to prevent flicker
        // We'll set it back after successful confirmation
        $toggle.prop('checked', !isChecked);
        const newStatus = isChecked ? 'check-In' : 'pending';
        const action = isChecked ? 'check in' : 'revert to pending';
        
        // Get the room number from the card header
        const roomNumber = $toggle.closest('.card').find('.card-head header').text().trim();

        // If checking in, first check if room is occupied
        if (isChecked) {
            // Check if room is occupied
            $.ajax({
                url: '/dashboard/booking/check_room_occupied',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    BookingID: bookingId
                }),
                success: (response) => {
                    if (response.success && response.isOccupied) {
                        // Room is occupied, show error popup
                        Swal.fire({
                            title: "Cannot Check In!",
                            text: `Cannot check in to Room ${roomNumber} because it is still occupied.${response.data ? ` Currently checked in: ${response.data.CustomerName || 'another guest'}.` : ''}`,
                            icon: "error",
                            confirmButtonColor: "#dc3545",
                            confirmButtonText: "OK",
                            allowOutsideClick: false
                        });
                        // Toggle already reverted at start, no need to change
                        return;
                    }
                    
                    // Room is available, proceed with check-in confirmation
                    proceedWithCheckInConfirmation($toggle, bookingId, roomNumber, newStatus, action, isChecked);
                },
                    error: (xhr, status, error) => {
                        PMSCore.handleError(error, 'Check room occupied AJAX error');
                        PMSCore.showError('Error!', 'An error occurred while checking room status.');
                        // Toggle already reverted at start, no need to change
                    }
            });
        } else {
            // Reverting to pending, proceed directly with confirmation
            proceedWithCheckInConfirmation($toggle, bookingId, roomNumber, newStatus, action, isChecked);
        }
    });

    // Helper function to proceed with check-in confirmation
    function proceedWithCheckInConfirmation($toggle, bookingId, roomNumber, newStatus, action, isChecked) {
        // Show SweetAlert2 confirmation
        Swal.fire({
            title: isChecked ? "Check In Guest?" : "Revert Check-In?",
            text: isChecked 
                ? `Are you sure you want to check in Room ${roomNumber}?`
                : `Are you sure you want to revert Room ${roomNumber} back to pending status?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: isChecked ? "#28a745" : "#ffc107",
            confirmButtonText: isChecked ? "Yes, check in!" : "Yes, revert!",
            cancelButtonText: "No, cancel",
            allowOutsideClick: false
        }).then((result) => {
            if (result.isConfirmed) {
                // Send AJAX request to update booking status
                $.ajax({
                    url: '/dashboard/booking/update_status',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        BookingID: bookingId,
                        status: newStatus
                    }),
                    success: (response) => {
                        try {
                            PMSCore.validateResponse(response);
                            
                            // Update toggle state after successful confirmation
                            $toggle.prop('checked', isChecked);
                            
                            const card = $toggle.closest('.card');
                            
                            if (isChecked) {
                                // Check-in: Move the card to the "Checked-In" tab if it exists
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
                            } else {
                                // Revert: Move the card back to the appropriate tab (pending/today check-in)
                                if (card.length) {
                                    const pendingTab = $('#today-check-in-content .scrollable-container, #pending-content .scrollable-container');
                                    if (pendingTab.length) {
                                        // Add smooth transition
                                        card.css({
                                            'transition': 'opacity 0.5s ease-out, transform 0.5s ease-out',
                                            'opacity': '0',
                                            'transform': 'scale(0.95)'
                                        });
                                        
                                        setTimeout(() => {
                                            // Move card back to pending/today check-in tab
                                            pendingTab.first().append(card);
                                            card.css({
                                                'opacity': '1',
                                                'transform': 'scale(1)'
                                            });
                                            PMSCore.debugLog('Card moved back to pending tab (SweetAlert)', { bookingId });
                                        }, 500);
                                    }
                                }
                                
                                // Show success toast
                                PMSCore.showSuccess('Status Reverted!', `Booking ID ${bookingId} has been reverted to pending status.`);
                            }
                            
                            // Update card's booking status attribute
                            card.attr('data-booking-status', newStatus);
                            
                            PMSCore.debugLog(`Status update successful (SweetAlert)`, { bookingId, status: newStatus, action });
                            
                            // Trigger Socket.IO event after all processing is complete
                            if (typeof dashboardSocket !== 'undefined') {
                                dashboardSocket.emit('dashboard-updated', {
                                    action: 'booking-status-updated',
                                    message: `Booking ${bookingId} ${action} successfully`,
                                    data: response.data
                                });
                            }
                        } catch (error) {
                            PMSCore.handleError(error, `${action} SweetAlert success handler`);
                            // Show error toast
                            PMSCore.showError(`${isChecked ? 'Check-In' : 'Revert'} Failed!`, response.message || `Failed to ${action} the booking.`);
                            // Toggle already reverted at start, no need to change
                        }
                    },
                    error: (xhr, status, error) => {
                        PMSCore.handleError(error, `${action} SweetAlert AJAX error`);
                        // Show error toast
                        PMSCore.showError('Error!', `An error occurred while ${action} the booking.`);
                        // Toggle already reverted at start, no need to change
                    }
                });
            } else {
                // User cancelled - toggle already reverted at start, no need to change
            }
        });
    }

    // CHECK-OUT TOGGLE (REVERSIBLE)
    $(document).on('change', '.custom-toggle-checkout', function() {
        const $toggle = $(this);
        const bookingId = $toggle.attr('data-idno');
        const isChecked = $toggle.is(':checked');
        const lateCheckOut = $toggle.attr('data-late-checkout');
        
        // Determine new status based on toggle state
        const newStatus = isChecked ? 'check-Out' : 'check-In';
        const action = isChecked ? 'check out' : 'revert to check-in';
        
        // Get the room number from the card header
        const roomNumber = $toggle.closest('.card').find('.card-head header').text().trim();
        const roomId = $toggle.closest('.card').attr('data-idno');

        if (isChecked) {
            // CHECK-OUT: First check for unpaid balance
            $.ajax({
                url: `/booking/unpaid_balance/${bookingId}`,
                type: 'GET',
                success: function(balanceData) {
                    const totalBalance = parseFloat(balanceData.total_unpaid_balance) || 0;
                    const formattedBalance = totalBalance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    
                    let confirmTitle = "Check Out Guest?";
                    let confirmText = `Are you sure you want to check out Room ${roomNumber}?`;
                    
                    // If there's an unpaid balance, show it in the popup
                    if (totalBalance > 0) {
                        confirmTitle = "⚠️ Outstanding Balance Alert";
                        confirmText = `Room ${roomNumber} has an outstanding balance of <strong style="color: #dc3545; font-size: 1.2em;">₱${formattedBalance}</strong>.<br><br>Are you sure you want to proceed with check-out?`;
                    }

                    // Show SweetAlert2 confirmation with balance info
                    Swal.fire({
                        title: confirmTitle,
                        html: confirmText,
                        icon: totalBalance > 0 ? "warning" : "question",
                        showCancelButton: true,
                        confirmButtonColor: "#dc3545",
                        confirmButtonText: "Yes, check out!",
                        cancelButtonText: "No, cancel",
                        allowOutsideClick: false
                    }).then((result) => {
                        if (result.isConfirmed) {
                            processCheckout($toggle, bookingId, newStatus, lateCheckOut, roomId, roomNumber);
                        } else {
                            $toggle.prop('checked', false);
                        }
                    });
                },
                error: function(xhr, status, error) {
                    console.error('Error fetching balance:', error);
                    PMSCore.showError('Error!', 'Unable to fetch balance information. Please try again.');
                    $toggle.prop('checked', false);
                }
            });
        } else {
            // REVERT TO CHECK-IN: Show confirmation
            Swal.fire({
                title: "Revert Check-Out?",
                text: `Are you sure you want to revert Room ${roomNumber} back to check-in status?`,
                icon: "question",
                showCancelButton: true,
                confirmButtonColor: "#ffc107",
                confirmButtonText: "Yes, revert!",
                cancelButtonText: "No, cancel",
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    processCheckoutRevert($toggle, bookingId, newStatus, roomId, roomNumber);
                } else {
                    $toggle.prop('checked', true);
                }
            });
        }
    });

    // Helper function for checkout process
    function processCheckout($toggle, bookingId, newStatus, lateCheckOut, roomId, roomNumber) {
        // Show loading state
        Swal.fire({
            title: "Checking Out...",
            text: "Please wait while we process the check-out.",
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

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
                Swal.close();
                
                try {
                    PMSCore.validateResponse(response);
                    
                    const card = $toggle.closest('.card');
                    
                    // Update card visual state but keep it in checkout tab
                    card.attr('data-booking-status', newStatus);
                    card.addClass('checked-out-card'); // Add class for styling if needed
                    
                    // Add visual indicator that checkout is complete
                    card.css({
                        'opacity': '0.8',
                        'border-left': '4px solid #28a745' // Green border to indicate completed checkout
                    });
                    
                    // Now update the room status to Cleaning
                    if (roomId) {
                        $.ajax({
                            url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                            type: 'PUT',
                            contentType: 'application/json',
                            data: JSON.stringify({ status: 4 }), // 4 = Cleaning
                            success: function(roomResponse) {
                                console.log('Room status updated to cleaning:', roomResponse);
                                
                                PMSCore.showSuccess('Check-Out Successful!', `Booking ID ${bookingId} has been checked out. Room ${roomNumber} is now in cleaning status.`);
                                
                                PMSCore.debugLog('Check-out successful', { bookingId, status: newStatus, lateCheckOut, roomId });
                                
                                // Trigger Socket.IO event
                                if (typeof dashboardSocket !== 'undefined') {
                                    dashboardSocket.emit('dashboard-updated', {
                                        action: 'booking-status-updated',
                                        message: `Booking ${bookingId} checked out successfully`,
                                        data: response.data
                                    });
                                }
                                
                                // Refresh dashboard data to reflect updated status
                                setTimeout(() => {
                                    reloadDashboardData();
                                }, 1000);
                            },
                            error: function(roomXhr, roomStatus, roomError) {
                                console.error('Failed to update room status:', roomError);
                                PMSCore.showWarning('Check-Out Partially Successful!', `Booking ${bookingId} checked out, but room status update failed.`);
                                // Still update the card status even if room status update failed
                                reloadDashboardData();
                            }
                        });
                    } else {
                        PMSCore.showSuccess('Check-Out Successful!', `Booking ID ${bookingId} has been checked out successfully.`);
                        // Refresh dashboard data
                        setTimeout(() => {
                            reloadDashboardData();
                        }, 1000);
                    }
                } catch (error) {
                    PMSCore.handleError(error, 'check-out success handler');
                    PMSCore.showError('Check-Out Failed!', response.message || 'Failed to check out the booking.');
                    $toggle.prop('checked', false);
                }
            },
            error: (xhr, status, error) => {
                Swal.close();
                PMSCore.handleError(error, 'check-out AJAX error');
                PMSCore.showError('Error!', 'An error occurred while checking out the booking.');
                $toggle.prop('checked', false);
            }
        });
    }

    // Helper function for checkout revert process
    function processCheckoutRevert($toggle, bookingId, newStatus, roomId, roomNumber) {
        // Show loading state
        Swal.fire({
            title: "Reverting...",
            text: "Please wait while we revert the check-out status.",
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Send AJAX request to update status back to check-In
        $.ajax({
            url: '/dashboard/booking/update_status',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                BookingID: bookingId,
                status: newStatus
            }),
            success: (response) => {
                Swal.close();
                
                try {
                    PMSCore.validateResponse(response);
                    
                    const card = $toggle.closest('.card');
                    
                    // Update room status back to Occupied
                    if (roomId) {
                        $.ajax({
                            url: `/dashboard/room_maintenance/updateStatus/${roomId}`,
                            type: 'PUT',
                            contentType: 'application/json',
                            data: JSON.stringify({ status: 2 }), // 2 = Occupied
                            success: function(roomResponse) {
                                console.log('Room status updated to occupied:', roomResponse);
                                
                                // Keep card in checkout tab, just update visual state
                                if (card.length) {
                                    // Remove checkout styling
                                    card.removeClass('checked-out-card');
                                    card.css({
                                        'opacity': '1',
                                        'border-left': '' // Remove green border
                                    });
                                    
                                    // Show toggles and elements again
                                    card.find('.custom-toggle-checkin, .custom-toggle-checkout').show();
                                    card.find('.badge').show();
                                    card.find('.progress').show();
                                    
                                    PMSCore.debugLog('Card status reverted in checkout tab', { bookingId });
                                }
                                
                                PMSCore.showSuccess('Status Reverted!', `Booking ID ${bookingId} has been reverted to check-in status.`);
                                card.attr('data-booking-status', newStatus);
                                
                                PMSCore.debugLog('Check-out revert successful', { bookingId, status: newStatus, roomId });
                                
                                // Trigger Socket.IO event
                                if (typeof dashboardSocket !== 'undefined') {
                                    dashboardSocket.emit('dashboard-updated', {
                                        action: 'booking-status-updated',
                                        message: `Booking ${bookingId} reverted to check-in successfully`,
                                        data: response.data
                                    });
                                }
                                
                                setTimeout(() => {
                                    reloadDashboardData();
                                }, 1000);
                            },
                            error: function(roomXhr, roomStatus, roomError) {
                                console.error('Failed to update room status:', roomError);
                                PMSCore.showWarning('Revert Partially Successful!', `Booking ${bookingId} reverted, but room status update failed.`);
                            }
                        });
                    } else {
                        PMSCore.showSuccess('Status Reverted!', `Booking ID ${bookingId} has been reverted to check-in status.`);
                        card.attr('data-booking-status', newStatus);
                    }
                } catch (error) {
                    PMSCore.handleError(error, 'check-out revert success handler');
                    PMSCore.showError('Revert Failed!', response.message || 'Failed to revert the booking status.');
                    $toggle.prop('checked', true);
                }
            },
            error: (xhr, status, error) => {
                Swal.close();
                PMSCore.handleError(error, 'check-out revert AJAX error');
                PMSCore.showError('Error!', 'An error occurred while reverting the booking status.');
                $toggle.prop('checked', true);
            }
        });
    }

    // CLEANING UPDATE
    $(document).on('click', '.cleaning-container', function() {
        const roomId = $(this).attr('data-room-id');
        const broomIcon = $(this).find('i');
        const isCurrentlyOn = broomIcon.hasClass('on');
        const card = $(this).closest('.card');
        
        // Get room number from the card header
        const roomNumber = card.find('.card-head header').text().trim();
        
        console.log('Cleaning container clicked:', {
            roomId: roomId,
            roomNumber: roomNumber,
            isCurrentlyOn: isCurrentlyOn,
            broomIconClasses: broomIcon.attr('class')
        });

        // If broom is ON (cleaning), clicking will move to available
        if (isCurrentlyOn) {
            // Show SweetAlert2 confirmation
            Swal.fire({
                title: "Move to Available Room?",
                text: `Are you sure you want to move room ${roomNumber} to Available Room tab?`,
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
                text: `Are you sure you want to mark room ${roomNumber} as Cleaning?`,
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
