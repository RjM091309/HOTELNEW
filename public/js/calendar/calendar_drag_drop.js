// =============================================================================
// CALENDAR DRAG AND DROP MODULE
// =============================================================================

// This module contains drag and drop functionality for the calendar system

// =============================================================================
// DRAG AND DROP EVENT HANDLERS
// =============================================================================

async function handleEventDrop(info) {
  
  // Mark this event as successfully dropped to prevent restoration
  info.event._wasDropped = true;
  
  // Get the new resource (room) and dates
  const newResource = info.newResource;
  const oldResource = info.oldResource;
  const newStart = info.event.start;
  const newEnd = info.event.end;
  const bookingId = info.event.id;
  
  // Check if this is a valid drop (either room change or date change)
  const isRoomChange = newResource && oldResource && newResource.id !== oldResource.id;
  const isDateChange = info.delta && (info.delta.days !== 0 || info.delta.milliseconds !== 0);
  
  // Get the target room (either new room or same room)
  let targetRoom = null;
  
  if (isRoomChange) {
    // Room changed - use new room
    targetRoom = newResource;
  } else if (isDateChange) {
    // Only date changed - use current resource from event
    targetRoom = info.event.getResources()[0];
  }
  
  if (!targetRoom) {
    info.revert();
    return;
  }
  
  // Auto-snap times to AM/PM cells based on check-in/check-out times
  // Set check-in time to 2 PM (14:00) - PM cell
  if (newStart) {
    newStart.setHours(14, 0, 0, 0);
  }
  
  // Set check-out time to 11 AM (11:00) - AM cell
  if (newEnd) {
    newEnd.setHours(11, 0, 0, 0);
  }
  
  // Check for overlapping events BEFORE showing confirmation
  if (targetRoom && targetRoom.id) {
    const overlappingEvents = await checkForOverlaps(newStart, newEnd, targetRoom.id, bookingId);
    if (overlappingEvents.length > 0) {
      // Strict rule: only checkout may overlap. Block move.
      Swal.fire({
        title: 'Overlap Not Allowed',
        html: `This change would overlap with:<br><br>
               <b>${overlappingEvents.map(e => e.title).join(', ')}</b><br><br>
               Only checkout schedules may overlap other events.`,
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => { info.revert(); });
      return;
    }
  }

  // Adjacency rule: prevent placing a late checkout right before a regular check-in
  try {
    const isLateCO = isLateCheckout(info.event);
    const isRegularCI = isRegularCheckIn(info.event);
    const isLateCI = isLateCheckIn(info.event);
    const newCheckoutDateStr = getDateString(newEnd);
    const newCheckinDateStr = getDateString(newStart);

    // Case 1: Late checkout cannot precede a Regular check-in next booking
    if (isLateCO && hasRegularCheckInStartingOn(newCheckoutDateStr, targetRoom.id, bookingId)) {
      Swal.fire({
        title: 'Not Allowed - Late Checkout Conflict',
        html: 'Late check-out cannot directly precede a booking with Regular Check-in on the same date in the same room. Only Late Check-in is allowed next.',
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => { 
        // Auto-set the checkOutStatus dropdown to Regular Check Out (0) when user clicks OK
        setCheckOutStatusDropdown(0);
        info.revert(); 
      });
      return;
    }

    // Case 2: Regular check-in cannot be dropped after a Late checkout ending same date
    if (isRegularCI && hasLateCheckoutEndingOn(newCheckinDateStr, targetRoom.id, bookingId)) {
      Swal.fire({
        title: 'Not Allowed - Regular Check-in Conflict',
        html: 'Regular Check-in cannot directly follow a Late Check-out on the same date in the same room. Only Late Check-in may follow.',
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => { 
        // Auto-set the checkInStatus dropdown to Late Check In (0) when user clicks OK
        setCheckInStatusDropdown(0);
        info.revert(); 
      });
      return;
    }
  } catch (e) {}
  
  // Determine what changed for the confirmation message
  let changeDescription = '';
  let confirmationTitle = '';
  
  if (isRoomChange && isDateChange) {
    confirmationTitle = 'Transfer & Update Booking?';
    changeDescription = `Transfer <b>${info.event.title}</b> from <b>${oldResource.title}</b> to <b>${targetRoom.title}</b> with new dates`;
  } else if (isRoomChange) {
    confirmationTitle = 'Transfer Room?';
    changeDescription = `Transfer <b>${info.event.title}</b> from <b>${oldResource.title}</b> to <b>${targetRoom.title}</b>`;
  } else if (isDateChange) {
    confirmationTitle = 'Update Booking Dates?';
    changeDescription = `Update dates for <b>${info.event.title}</b> in <b>${targetRoom.title}</b>`;
  }
  
  // Show confirmation dialog
  Swal.fire({
    title: confirmationTitle,
    html: `${changeDescription}<br>
           New dates: ${newStart.toLocaleDateString()} - ${newEnd.toLocaleDateString()}<br>
           Check-in: 2:00 PM | Check-out: 11:00 AM`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: isRoomChange ? 'Yes, Transfer' : 'Yes, Update',
    cancelButtonText: 'Cancel'
  }).then((result) => {
    if (result.isConfirmed) {
      proceedWithUpdate(info, newStart, newEnd, targetRoom, bookingId);
    } else {
      // Revert the drop if user cancels
      info.revert();
    }
  });
}

function handleEventDragStart(info) {
  
  try {
    // Store original event data to prevent duplication
    info.event._originalData = {
      start: new Date(info.event.start),
      end: new Date(info.event.end),
      resourceIds: Array.isArray(info.event.resourceIds) ? [...info.event.resourceIds] : []
    };
    
  } catch (error) {
    // Set safe defaults
    info.event._originalData = {
      start: new Date(info.event.start),
      end: new Date(info.event.end),
      resourceIds: []
    };
  }
  
  // ENHANCED DRAG VISUAL FEEDBACK
  // Make the dragged event fade out and float above everything
  info.el.style.opacity = '0.3';
  info.el.style.zIndex = '9999';
  info.el.style.pointerEvents = 'none';
  info.el.style.transform = 'scale(1.05)';
  info.el.style.transition = 'all 0.2s ease';
  info.el.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
  
  // Add a special class for dragged events
  info.el.classList.add('event-being-dragged');
  
  // Clear any existing drag preview elements
  clearDragPreviews();
}

function handleEventDragStop(info) {
  
  // RESTORE ORIGINAL STYLING
  info.el.style.opacity = '';
  info.el.style.zIndex = '';
  info.el.style.pointerEvents = '';
  info.el.style.transform = '';
  info.el.style.transition = '';
  info.el.style.boxShadow = '';
  
  // Remove the dragged class
  info.el.classList.remove('event-being-dragged');
  
  // Clear any drag preview elements that might have been created
  clearDragPreviews();
  
  // If the event wasn't actually dropped (just dragged and released), restore original data
  if (!info.event._wasDropped) {
    restoreOriginalEventData(info.event);
    
    // Clean up any duplicates that might have been created during the drag
    setTimeout(() => {
      removeDuplicateEvents();
    }, 100);
  }
}

// =============================================================================
// RESIZE EVENT HANDLERS (EXTEND CHECKOUT)
// =============================================================================

async function handleEventResize(info) {
  
  // Get the new end date (checkout date)
  const newEnd = info.event.end;
  const bookingId = info.event.id;
  
  // Get the room resource
  const roomResource = info.event.getResources()[0];
  if (!roomResource) {
    info.revert();
    return;
  }
  
  // Get original data from global map
  const eventId = info.event.id;
  const originalData = window.calendarOriginalData ? window.calendarOriginalData.get(eventId) : null;
  
  if (!originalData) {
    console.error('❌ No original data available for resize validation');
    info.revert();
    return;
  }
  
  const originalEnd = originalData.end;
  
  // Check if this is actually an extension (end date increased)
  const isExtension = newEnd > originalEnd;
  
  // Only allow extensions (increasing checkout date), not reductions
  if (!isExtension) {
    Swal.fire({
      title: '⚠️ Invalid Resize',
      text: 'You can only extend checkout dates, not reduce them.',
      icon: 'warning',
      confirmButtonText: 'OK'
    });
    info.revert();
    return;
  }
  
  // Auto-snap checkout time to 11 AM (11:00) - AM cell
  if (newEnd) {
    newEnd.setHours(11, 0, 0, 0);
  }
  
  // Check for overlapping events BEFORE showing confirmation
  const overlappingEvents = await checkForOverlaps(info.event.start, newEnd, roomResource.id, bookingId);
  if (overlappingEvents.length > 0) {
    // Show warning about overlaps
    Swal.fire({
      title: '⚠️ Overlapping Events Detected',
      html: `Extending this booking will overlap with existing events:<br><br>
             <b>${overlappingEvents.map(e => e.title).join(', ')}</b><br><br>
             Do you want to continue?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Continue',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        proceedWithResize(info, newEnd, roomResource, bookingId);
      } else {
        info.revert();
        return;
      }
    });
    return;
  }

  // Adjacency rule: if this event carries a late checkout and its new
  // start-of-day for checkout matches a neighbor with regular check-in,
  // block the action. We only restrict late checkout -> regular check-in adjacency.
  try {
    const isLateCO = isLateCheckout(info.event);
    const isRegularCI = isRegularCheckIn(info.event);
    const isLateCI = isLateCheckIn(info.event);
    const newCheckoutDateStr = getDateString(newEnd);
    const newCheckinDateStr = getDateString(info.event.start);
    if (isLateCO && hasRegularCheckInStartingOn(newCheckoutDateStr, roomResource.id, bookingId)) {
      Swal.fire({
        title: 'Not Allowed - Late Checkout Conflict',
        html: 'Late check-out cannot be adjacent to a booking with Regular Check-in on the same date. Only Late Check-in is allowed next.',
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => { 
        // Auto-set the checkOutStatus dropdown to Regular Check Out (0) when user clicks OK
        setCheckOutStatusDropdown(0);
        info.revert(); 
      });
      return;
    }

    // Also block placing a Regular check-in right after a Late checkout ending same date
    if (isRegularCI && hasLateCheckoutEndingOn(newCheckinDateStr, roomResource.id, bookingId)) {
      Swal.fire({
        title: 'Not Allowed - Regular Check-in Conflict',
        html: 'Regular Check-in cannot directly follow a Late Check-out on the same date in the same room. Only Late Check-in may follow.',
        icon: 'error',
        confirmButtonText: 'OK'
      }).then(() => { 
        // Auto-set the checkInStatus dropdown to Late Check In (0) when user clicks OK
        setCheckInStatusDropdown(0);
        info.revert(); 
      });
      return;
    }
  } catch (e) {}
  
  // Calculate the extension days (difference between new and original end)
  const originalEndDate = originalData.end;
  const extensionDays = Math.ceil((newEnd.getTime() - originalEndDate.getTime()) / (1000 * 3600 * 24));
  
  // Use the existing extend modal with pre-calculated days
  if (typeof openExtendModal === 'function') {
    // Store the resize info for later use (including revert function)
    window.pendingResizeInfo = {
      info: info,
      newEnd: newEnd,
      roomResource: roomResource,
      bookingId: bookingId,
      extensionDays: extensionDays,
      originalEnd: originalEndDate
    };
    
    // Open the extend modal with pre-filled days
    openExtendModal(roomResource.id, originalEndDate.toISOString(), bookingId);
    
    // Pre-fill the extension days input
    setTimeout(() => {
      const extensionDaysInput = document.getElementById(`extensionDays_${bookingId}`);
      if (extensionDaysInput) {
        extensionDaysInput.value = extensionDays;
        // Trigger the change event to check room availability
        extensionDaysInput.dispatchEvent(new Event('change'));
      }
    }, 100);
    
    // IMPORTANT: Don't call info.revert() here - let the modal handle it when cancelled
    // The event will stay visually resized until the user confirms or cancels
    
  } else {
    // Fallback to simple confirmation if extend modal not available
    Swal.fire({
      title: 'Extend Checkout Schedule?',
      html: `Extend <b>${info.event.title}</b> checkout in <b>${roomResource.title}</b><br><br>
             New checkout date: <b>${newEnd.toLocaleDateString()}</b><br>
             Extension: <b>${extensionDays} day${extensionDays > 1 ? 's' : ''}</b><br>
             Check-in: 2:00 PM | Check-out: 11:00 AM`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Extend',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        proceedWithResize(info, newEnd, roomResource, bookingId);
      } else {
        // Revert the resize if user cancels
        info.revert();
      }
    });
  }
}

function handleEventResizeStart(info) {
  
  try {
    // Store original event data in a way that FullCalendar won't interfere with
    const eventId = info.event.id;
    const originalData = {
      start: new Date(info.event.start),
      end: new Date(info.event.end),
      resourceIds: Array.isArray(info.event.resourceIds) ? [...info.event.resourceIds] : []
    };
    
    // Store in a global map to avoid FullCalendar interference
    if (!window.calendarOriginalData) {
      window.calendarOriginalData = new Map();
    }
    window.calendarOriginalData.set(eventId, originalData);
    
    // Also store on the event for backward compatibility
    info.event._originalData = originalData;
    
    // Verify the data was stored correctly
    if (originalData && originalData.end) {
      // Original data stored successfully
    } else {
      console.error('❌ Original data not stored correctly');
    }
    
  } catch (error) {
    console.error('❌ Error storing original data:', error);
    // Set safe defaults
    const safeData = {
      start: new Date(info.event.start),
      end: new Date(info.event.end),
      resourceIds: []
    };
    
    if (!window.calendarOriginalData) {
      window.calendarOriginalData = new Map();
    }
    window.calendarOriginalData.set(info.event.id, safeData);
    info.event._originalData = safeData;
  }
  
  // ENHANCED RESIZE VISUAL FEEDBACK
  // Make the resized event show resize indicator
  info.el.style.borderRight = '3px solid #4CAF50';
  info.el.style.borderRadius = '0 8px 8px 0';
  info.el.style.boxShadow = '0 4px 15px rgba(76, 175, 80, 0.3)';
  info.el.style.transition = 'all 0.2s ease';
  
  // Add a special class for resized events
  info.el.classList.add('event-being-resized');
  
  // Clear any existing resize preview elements
  clearResizePreviews();
}

function handleEventResizeStop(info) {
  
  // RESTORE ORIGINAL STYLING
  info.el.style.borderRight = '';
  info.el.style.borderRadius = '';
  info.el.style.boxShadow = '';
  info.el.style.transition = '';
  
  // Remove the resized class
  info.el.classList.remove('event-being-resized');
  
  // Clear any resize preview elements that might have been created
  clearResizePreviews();
  
  // IMPORTANT: Don't clear _originalData here - it's needed for the resize handler
  // The _originalData will be cleared after successful processing in proceedWithResize
  // or restored if the resize was cancelled
  
  // Don't try to detect resize here - FullCalendar hasn't updated the event yet
  // The resize detection will happen in handleEventResize where the event has the new end date
  
  // Don't restore original data yet - let the resize handler decide
  // The resize handler will either process the resize or restore the data if needed
}

// =============================================================================
// DRAG PREVIEW MANAGEMENT
// =============================================================================

function clearDragPreviews() {
  try {
    // Remove any FullCalendar drag preview elements
    const dragPreviews = document.querySelectorAll('.fc-event-dragging, .fc-event-selected, .fc-event-drag-preview');
    dragPreviews.forEach(preview => {
      if (preview !== document.activeElement) {
        preview.remove();
      }
    });
    
    // Remove any custom drag preview elements we might have created
    const customPreviews = document.querySelectorAll('[data-drag-preview="true"]');
    customPreviews.forEach(preview => preview.remove());
    
    // AGGRESSIVE CLEANUP: Remove any duplicate events that might have been created
    removeDuplicateEvents();
  } catch (error) {
  }
}

function clearResizePreviews() {
  try {
    // Remove any FullCalendar resize preview elements
    const resizePreviews = document.querySelectorAll('.fc-event-resizing, .fc-event-selected, .fc-event-resize-preview');
    resizePreviews.forEach(preview => {
      if (preview !== document.activeElement) {
        preview.remove();
      }
    });
    
    // Remove any custom resize preview elements we might have created
    const customPreviews = document.querySelectorAll('[data-resize-preview="true"]');
    customPreviews.forEach(preview => preview.remove());
    
    // AGGRESSIVE CLEANUP: Remove any duplicates that might have been created
    removeDuplicateEvents();
  } catch (error) {
    // Silent error handling
  }
}

function restoreOriginalEventData(event) {
  try {
    if (event._originalData) {
      
      // Restore original dates and resource
      event.start = event._originalData.start;
      event.end = event._originalData.end;
      
      // Safely restore resourceIds
      if (Array.isArray(event._originalData.resourceIds)) {
        event.resourceIds = [...event._originalData.resourceIds];
      } else {
        event.resourceIds = [];
      }
      
      // Clear the original data only if this is not a resize operation
      if (!event._isResizeOperation) {
        delete event._originalData;
      }
    }
  } catch (error) {
    console.error('❌ Error restoring original event data:', error);
  }
}

function removeDuplicateEvents() {
  try {
    const calendar = window.calendar;
    if (!calendar) return;
    
    const allEvents = calendar.getEvents();
    const eventGroups = {};
    const duplicatesToRemove = [];
    
    // Group events by title and find duplicates
    allEvents.forEach(event => {
      const key = `${event.title}_${event.start?.getTime()}_${event.end?.getTime()}`;
      if (!eventGroups[key]) {
        eventGroups[key] = [];
      }
      eventGroups[key].push(event);
    });
    
    // Find groups with more than one event (duplicates)
    Object.values(eventGroups).forEach(group => {
      if (group.length > 1) {
        // Keep the first event, mark others for removal
        const [keepEvent, ...duplicates] = group;
        duplicates.forEach(dup => {
          duplicatesToRemove.push(dup);
        });
      }
    });
    
    // Remove duplicate events
    duplicatesToRemove.forEach(dup => {
      try {
        dup.remove();
      } catch (error) {
      }
    });
    
    if (duplicatesToRemove.length > 0) {
    }
    
  } catch (error) {
  }
}

// =============================================================================
// FAST EVENT UPDATE SYSTEM
// =============================================================================

function updateSingleEvent(event, newStart, newEnd, newResource) {
  try {
    // Prevent duplicate updates by checking if event is already being updated
    if (event._isUpdating) {
      return;
    }
    
    // Mark event as being updated
    event._isUpdating = true;
    
    // Use FullCalendar APIs to update dates to avoid internal state desync
    try {
      if (typeof event.setDates === 'function') {
        event.setDates(newStart, newEnd, { allDay: false });
      } else {
        if (typeof event.setStart === 'function') event.setStart(newStart, { maintainDuration: false });
        if (typeof event.setEnd === 'function') event.setEnd(newEnd, { allowOpenEnded: false });
      }
    } catch (apiErr) {
      // Fallback for older versions
      event.start = newStart;
      event.end = newEnd;
    }
    
    // Update resource if changed
    if (newResource && event.getResources()[0]?.id !== newResource.id) {
      try {
        if (typeof event.setProp === 'function') {
          event.setProp('resourceIds', [newResource.id]);
        } else {
          // Last resort fallback
          event.resourceIds = [newResource.id];
        }
      } catch (resErr) {
        event.resourceIds = [newResource.id];
      }
    }
    
    // ULTRA-FAST: Update visual position without re-render
    const eventElement = window.eventElements[event.id];
    if (eventElement) {
      // Simple approach: just update the event element's data attributes
      eventElement.setAttribute('data-start', newStart.toISOString());
      eventElement.setAttribute('data-end', newEnd.toISOString());
      
      // Force a quick visual refresh by toggling a class
      eventElement.classList.add('event-updated');
      setTimeout(() => {
        eventElement.classList.remove('event-updated');
      }, 100);
    }

    // Update overlay class on harness depending on status
    try {
      const harness = (eventElement && eventElement.closest) ? eventElement.closest('.fc-timeline-event-harness') : null;
      if (harness) {
        if (isCheckoutEvent(event)) {
          harness.classList.add('fc-allow-overlay');
        } else {
          harness.classList.remove('fc-allow-overlay');
        }
      }
    } catch (e) {}
    
    // Update overlap detection for this specific event
    setTimeout(() => {
      if (event.view && event.view.calendar) {
        globalOverlapCheck(event.view.calendar);
      }
    }, 50);
    
    // Clear update flag after a delay
    setTimeout(() => {
      event._isUpdating = false;
    }, 100);
  } catch (error) {
    console.error('Error updating single event:', error);
    // Clear update flag on error
    if (event) event._isUpdating = false;
    // Fallback to full calendar reload if single update fails
    loadCalendarData();
  }
}

// =============================================================================
// AUTOMATIC CLEANUP
// =============================================================================

// Set up periodic cleanup to catch any duplicates that slip through
function setupPeriodicCleanup() {
  // Run cleanup every 5 seconds to catch any duplicates
  setInterval(() => {
    if (window.calendar) {
      removeDuplicateEvents();
    }
  }, 5000);
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.handleEventDrop = handleEventDrop;
window.handleEventDragStart = handleEventDragStart;
window.handleEventDragStop = handleEventDragStop;
window.handleEventResize = handleEventResize;
window.handleEventResizeStart = handleEventResizeStart;
window.handleEventResizeStop = handleEventResizeStop;
window.clearDragPreviews = clearDragPreviews;
window.clearResizePreviews = clearResizePreviews;
window.restoreOriginalEventData = restoreOriginalEventData;
window.removeDuplicateEvents = removeDuplicateEvents;
window.updateSingleEvent = updateSingleEvent;
window.setupPeriodicCleanup = setupPeriodicCleanup;
