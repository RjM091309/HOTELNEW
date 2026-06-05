// =============================================================================
// CALENDAR VALIDATION MODULE
// =============================================================================

// This module contains validation and overlap detection for the calendar system

// =============================================================================
// OVERLAP DETECTION AND VALIDATION
// =============================================================================

async function checkForOverlaps(newStart, newEnd, roomId, excludeEventId) {
  try {
    // Use backend overlap detection for better performance
    const response = await fetch('/calendar/api/bookings/check-overlaps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        roomId: roomId,
        excludeEventId: excludeEventId,
        _csrf: getCSRFToken()
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.overlaps || [];
    }
  } catch (error) {
    console.error('Backend overlap check failed, falling back to frontend:', error);
  }

  // Fallback to frontend overlap detection
  const calendar = window.calendar;
  if (!calendar) return [];
  
  const allEvents = calendar.getEvents();
  const overlappingEvents = [];
  
  allEvents.forEach(event => {
    try {
      // Skip the event being moved
      if (event.id === excludeEventId) return;
      
      // Check if event is in the same room
      const eventResources = event.getResources();
      if (!eventResources || eventResources.length === 0) {
        return; // Skip events without resources
      }
      
      const eventRoomId = eventResources[0]?.id;
      if (!eventRoomId) {
        return; // Skip events with invalid resource IDs
      }
      
      if (eventRoomId === roomId) {
        // Check for date overlap
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        
        // Check if dates overlap (exclusive end dates)
        if (newStart < eventEnd && newEnd > eventStart) {
          // Only allow overlap if the existing event is checkout
          const existingIsCheckout = isCheckoutEvent(event);
          if (!existingIsCheckout) {
            overlappingEvents.push({
              id: event.id,
              title: event.title,
              start: eventStart,
              end: eventEnd
            });
          }
        }
      }
    } catch (error) {
      // Continue with other events
    }
  });
  
  return overlappingEvents;
}

function proceedWithUpdate(info, newStart, newEnd, targetRoom, bookingId) {
  // Show loading state
  Swal.fire({
    title: 'Updating Booking...',
    text: 'Please wait while we update the booking.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Check if this is a room transfer (room change)
  const oldResource = info.oldResource;
  const newResource = info.newResource;
  const isRoomTransfer = oldResource && newResource && oldResource.id !== newResource.id;
  const isRoomChange = oldResource && newResource && oldResource.id !== newResource.id;
  const isDateChange = info.delta && (info.delta.days !== 0 || info.delta.milliseconds !== 0);
  
  if (isRoomTransfer) {
    // Check if both room AND dates changed
    const isRoomAndDateChange = isRoomChange && isDateChange;
    
    if (isRoomAndDateChange) {
      // Room transfer WITH date changes - use the calendar update-booking endpoint
      // which will handle both room transfer and date updates
      
      const updateData = {
        id: bookingId,
        room: targetRoom.title, // New room number
        checkIn: formatMySQLDateTime(newStart), // New check-in date (6:00 AM)
        checkOut: formatMySQLDateTime(newEnd),  // New check-out date (6:00 PM)
        isRoomTransfer: true,
        oldRoomNumber: oldResource.title, // For logging purposes
        newRoomId: newResource.id // For logging purposes
      };
      
      fetch('/calendar/api/update-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCSRFToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({
          ...updateData,
          _csrf: getCSRFToken()
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // Close the loading modal first
          Swal.close();
          
          // Success - show fast toast notification using pmsCore
          if (typeof PMSCore !== 'undefined') {
            PMSCore.showSuccess('Room Transfer & Dates Updated!', `Moved to ${targetRoom.title} with new dates - Calendar updated in real-time!`);
          } else {
            Swal.fire({
              title: 'Transfer & Update Successful!',
              text: `Event moved to ${targetRoom.title} with new dates - Calendar updated in real-time!`,
              icon: 'success',
              confirmButtonText: 'OK'
            });
          }
          
          // Update overlap detection immediately
          globalOverlapCheck(info.view.calendar);
          
          // FAST UPDATE: Only update the specific event instead of full calendar reload
          updateSingleEvent(info.event, newStart, newEnd, targetRoom);
          
          // Clean up any remaining drag artifacts
          clearDragPreviews();
          
          // AGGRESSIVE CLEANUP: Remove any duplicates that might have been created
          setTimeout(() => {
            removeDuplicateEvents();
          }, 100);
          
          // Clear the drop flag
          delete info.event._wasDropped;
          
        } else {
          // Close the loading modal first
          Swal.close();
          
          // Error from server - show detailed validation errors
          let errorMessage = data.message || 'Failed to transfer room and update dates. Please try again.';
          
          // Show specific validation errors if available
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            const errorDetails = data.errors.map(err => `• ${err.field}: ${err.message}`).join('\n');
            errorMessage = `${data.message}\n\nDetails:\n${errorDetails}`;
          }
          
          Swal.fire({
            title: 'Transfer & Update Failed',
            html: errorMessage.replace(/\n/g, '<br>'),
            icon: 'error',
            confirmButtonText: 'OK'
          });
          
          // Revert the drop if update failed
          info.revert();
        }
      })
      .catch(error => {
        console.error('Error transferring room and updating dates:', error);
        
        // Close the loading modal first
        Swal.close();
        
        // Show error message
        Swal.fire({
          title: 'Transfer & Update Failed',
          html: `Connection Error<br><br>Unable to connect to server. Please check your internet connection and try again.`,
          icon: 'error',
          confirmButtonText: 'OK'
        });
        
        // Revert the drop if transfer failed
        info.revert();
      });
      
    } else {
      // Only room transfer (no date change) - use the transfer-room endpoint
      
      const now = new Date();
      const transferDate = now.getFullYear() + '-' + 
                         String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(now.getDate()).padStart(2, '0') + ' ' + 
                         String(now.getHours()).padStart(2, '0') + ':' + 
                         String(now.getMinutes()).padStart(2, '0') + ':' + 
                         String(now.getSeconds()).padStart(2, '0');
      
      // Get the old room number and new room ID from the event's resources
      const oldRoomNumber = oldResource.title; // Room number (e.g., "301")
      const newRoomId = newResource.id; // Room ID (e.g., "123")
      
      // Use the calendar transfer endpoint
      fetch('/calendar/transfer-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: bookingId,
          oldRoomNumber: oldRoomNumber,
          newRoomId: newRoomId,
          transferDate: transferDate
        })
      })
    .then(response => response.json())
    .then(data => {
      if (data.message) {
        // Close the loading modal first
        Swal.close();
        
        // Success - show fast toast notification using pmsCore
        if (typeof PMSCore !== 'undefined') {
          PMSCore.showSuccess('Room Transfer Successful!', `Event moved to ${targetRoom.title} - Calendar updated in real-time!`);
        } else {
          Swal.fire({
            title: 'Transfer Successful!',
            text: `Event moved to ${targetRoom.title} - Calendar updated in real-time!`,
            icon: 'success',
            confirmButtonText: 'OK'
          });
        }
        
        // Update overlap detection immediately
        globalOverlapCheck(info.view.calendar);
        
        // FAST UPDATE: Only update the specific event instead of full calendar reload
        // This will move the event to the new room and update the calendar display
        updateSingleEvent(info.event, newStart, newEnd, targetRoom);
        
        // Clean up any remaining drag artifacts
        clearDragPreviews();
        
        // AGGRESSIVE CLEANUP: Remove any duplicates that might have been created
        setTimeout(() => {
          removeDuplicateEvents();
        }, 100);
        
        // Clear the drop flag
        delete info.event._wasDropped;
        
        // No need to reload page - calendar updates in real-time
        // The transfer is already logged and timeline will update when modal is opened
        // The event is now visible in the new room position
      } else {
        // Close the loading modal first
        Swal.close();
        
        // Error from server
        Swal.fire({
          title: 'Transfer Failed',
          text: data.error || 'Failed to transfer room. Please try again.',
          icon: 'error',
          confirmButtonText: 'OK'
        });
        
        // Revert the drop if transfer failed
        info.revert();
      }
    })
    .catch(error => {
      console.error('Error transferring room:', error);
      
      // Close the loading modal first
      Swal.close();
      
      // Show error message
      Swal.fire({
        title: 'Transfer Failed',
        text: 'An error occurred while transferring the room. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
      
      // Revert the drop if transfer failed
      info.revert();
    });
    }
  } else {
    // This is just a date change (no room transfer) - use the original update logic
    // Prepare data for API call with full datetime including hours
    const updateData = {
      id: bookingId,
      room: targetRoom.title, // Room number
      checkIn: formatMySQLDateTime(newStart), // 6:00 AM
      checkOut: formatMySQLDateTime(newEnd)  // 6:00 PM
    };
    
    // Make AJAX call to update booking in database
    fetch('/calendar/api/update-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken(),
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: JSON.stringify({
        ...updateData,
        _csrf: getCSRFToken()
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Close the loading modal first
        Swal.close();
        
        // Success - show fast toast notification using pmsCore
        if (typeof PMSCore !== 'undefined') {
          PMSCore.showSuccess('Booking Updated!', 'The booking has been successfully updated.');
        }
        
        // Update overlap detection immediately
        globalOverlapCheck(info.view.calendar);
        
        // FAST UPDATE: Only update the specific event instead of full calendar reload
        updateSingleEvent(info.event, newStart, newEnd, targetRoom);
        
        // Clean up any remaining drag artifacts
        clearDragPreviews();
        
        // AGGRESSIVE CLEANUP: Remove any duplicates that might have been created
        setTimeout(() => {
          removeDuplicateEvents();
        }, 100);
        
        // Clear the drop flag
        delete info.event._wasDropped;
      } else {
        // Close the loading modal first
        Swal.close();
        
        // Error from server - show detailed validation errors
        let errorMessage = data.message || 'Failed to update booking. Please try again.';
        
        // Show specific validation errors if available
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          const errorDetails = data.errors.map(err => `• ${err.field}: ${err.message}`).join('\n');
          errorMessage = `${data.message}\n\nDetails:\n${errorDetails}`;
        }
        
        Swal.fire({
          title: 'Update Failed',
          html: errorMessage.replace(/\n/g, '<br>'),
          icon: 'error',
          confirmButtonText: 'OK'
        });
        
        // Revert the drop if update failed
        info.revert();
      }
    })
    .catch(error => {
      console.error('Error updating booking:', error);
      
      // Close the loading modal first
      Swal.close();
      
      // Show error message
      Swal.fire({
        title: 'Update Failed',
        html: `Connection Error<br><br>Unable to connect to server. Please check your internet connection and try again.`,
        icon: 'error',
        confirmButtonText: 'OK'
      });
      
      // Revert the drop if update failed
      info.revert();
    });
  }
}

function proceedWithResize(info, newEnd, roomResource, bookingId) {
  // Show loading state
  Swal.fire({
    title: 'Extending Checkout...',
    text: 'Please wait while we extend the checkout schedule.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Get original data from global map
  const eventId = info.event.id;
  const originalData = window.calendarOriginalData ? window.calendarOriginalData.get(eventId) : null;
  const originalEnd = originalData ? originalData.end : info.event.end;
  
  // Since this is a resize function, we know it's an extension
  const isExtended = true;
  
  // Prepare data for API call with full datetime including hours
  const updateData = {
    id: bookingId,
    room: roomResource.title, // Room number
    checkIn: formatMySQLDateTime(info.event.start), // 6:00 AM
    checkOut: formatMySQLDateTime(newEnd),  // 6:00 PM
    isExtended: true, // Flag to indicate this is an extension
    originalCheckOut: formatMySQLDateTime(originalEnd), // Original checkout date for tracking
    extensionDate: formatMySQLDateTime(new Date()) // When the extension was made
  };
  
  // Make AJAX call to update booking in database
  fetch('/calendar/api/update-booking', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCSRFToken(),
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include',
    body: JSON.stringify({
      ...updateData,
      _csrf: getCSRFToken()
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal first
      Swal.close();
      
      // Success - show fast toast notification using pmsCore
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Checkout Extended!', `Checkout schedule extended to ${newEnd.toLocaleDateString()}`);
      } else {
        Swal.fire({
          title: 'Checkout Extended!',
          text: `Checkout schedule extended to ${newEnd.toLocaleDateString()}. Please refresh the dashboard to see the updated Extended tab.`,
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Update overlap detection immediately
      globalOverlapCheck(info.view.calendar);
      
      // FAST UPDATE: Only update the specific event instead of full calendar reload
      updateSingleEvent(info.event, info.event.start, newEnd, roomResource);
      
      // Clean up any remaining resize artifacts
      clearResizePreviews();
      
      // AGGRESSIVE CLEANUP: Remove any duplicates that might have been created
      setTimeout(() => {
        removeDuplicateEvents();
      }, 100);
      
      // Clear the resize flag and original data after successful processing
      delete info.event._wasResized;
      delete info.event._isResizeOperation;
      delete info.event._originalData;
      
      // Clean up global map
      if (window.calendarOriginalData) {
        window.calendarOriginalData.delete(bookingId);
      }
      
      // Emit socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'booking-extended',
          message: `Booking extended successfully to ${newEnd.toLocaleDateString()}`,
          data: {
            bookingId: bookingId,
            roomId: roomResource.id,
            newCheckOut: newEnd.toISOString(),
            isExtended: isExtended,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
    } else {
      // Close the loading modal first
      Swal.close();
      
      // Error from server - show detailed validation errors
      let errorMessage = data.message || 'Failed to extend checkout. Please try again.';
      
      // Show specific validation errors if available
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        const errorDetails = data.errors.map(err => `• ${err.field}: ${err.message}`).join('\n');
        errorMessage = `${data.message}\n\nDetails:\n${errorDetails}`;
      }
      
      Swal.fire({
        title: 'Extension Failed',
        html: errorMessage.replace(/\n/g, '<br>'),
        icon: 'error',
        confirmButtonText: 'OK'
      });
      
      // Revert the resize if update failed
      info.revert();
      
      // Clear the resize flag and restore original data since it failed
      delete info.event._wasResized;
      delete info.event._isResizeOperation;
      
      // Clean up global map
      if (window.calendarOriginalData) {
        window.calendarOriginalData.delete(bookingId);
      }
      
      if (info.event._originalData) {
        restoreOriginalEventData(info.event);
      }
    }
  })
  .catch(error => {
    console.error('Error extending checkout:', error);
    
    // Close the loading modal first
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Extension Failed',
      html: `Connection Error<br><br>Unable to connect to server. Please check your internet connection and try again.`,
      icon: 'error',
      confirmButtonText: 'OK'
    });
    
    // Revert the resize if update failed
    info.revert();
    
    // Clear the resize flag and restore original data since it failed
    delete info.event._wasResized;
    delete info.event._isResizeOperation;
    
    // Clean up global map
    if (window.calendarOriginalData) {
      window.calendarOriginalData.delete(info.event.id);
    }
    
    if (info.event._originalData) {
      restoreOriginalEventData(info.event);
    }
  });
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.checkForOverlaps = checkForOverlaps;
window.proceedWithUpdate = proceedWithUpdate;
window.proceedWithResize = proceedWithResize;
