// =============================================================================
// CALENDAR BOOKING DATA MODULE
// =============================================================================

// This module contains all booking-related functionality for the calendar
// Extracted from calendar_data.js for better modularity

// =============================================================================
// BOOKING DATA PROCESSING
// =============================================================================

function processBookingsData(bookingsData) {
  // Performance optimization: batch process dates
  const processedBookings = [];
  const batchSize = 50; // Process in batches for better performance
  
  for (let i = 0; i < bookingsData.length; i += batchSize) {
    const batch = bookingsData.slice(i, i + batchSize);
    
    const processedBatch = batch.map(booking => {
      // Create Date objects and set correct times
      const checkInDate = new Date(booking.CHECK_IN_DATE);
      const checkOutDate = new Date(booking.CHECK_OUT_DATE);
      
      // Set check-in time to 2 PM (14:00) - PM cell
      checkInDate.setHours(14, 0, 0, 0);
      
      // Set check-out time to 11 AM (11:00) - AM cell
      checkOutDate.setHours(11, 0, 0, 0);
      

      
      // Be tolerant of varying backend keys for statuses
      const bookingStatus = booking.BOOKING_STATUS
        ?? booking.booking_status
        ?? booking.status
        ?? 'pending';

      const checkInStatus = (booking.CHECK_IN_STATUS
        ?? booking.check_in_status
        ?? booking.checkInStatus
        ?? booking.checkin_status
        ?? booking.CHECKIN_STATUS
        ?? booking.CHECK_IN) ?? undefined;

      const checkOutStatus = (booking.CHECK_OUT_STATUS
        ?? booking.check_out_status
        ?? booking.checkOutStatus
        ?? booking.checkout_status
        ?? booking.CHECKOUT_STATUS
        ?? booking.CHECK_OUT
        ?? booking.CHECKOUT
        // Map DB's LATE_CHECKOUT (1=late, 0=regular) to our checkout status
        ?? booking.LATE_CHECKOUT) ?? undefined;

      return {
        id: String(booking.BookingID),
        resourceIds: [String(booking.ROOM_ID)],
        title: booking.CUSTOMER_NAME || 'No Name',
        start: checkInDate,
        end: checkOutDate,
        backgroundColor: getBookingColor({
          ...booking,
          BOOKING_STATUS: bookingStatus,
          CHECK_IN_STATUS: checkInStatus
        }),
        extendedProps: {
          totalCost: booking.TOTAL_COST,
          paymentStatus: booking.PAYMENT_STATUS,
          totalDays: booking.TOTAL_DAYS,
          bookingStatus: bookingStatus,
          checkInStatus: checkInStatus,    // 1 = regular (red), 0 = late (lemon)
          checkOutStatus: checkOutStatus   // 0 = regular (red), 1 = late (lemon)
        }
      };
    });
    
    processedBookings.push(...processedBatch);
    
    // Yield control to browser for better responsiveness (non-blocking)
    if (i + batchSize < bookingsData.length) {
      // Use requestIdleCallback if available, otherwise setTimeout
      if (window.requestIdleCallback) {
        // Wait for next idle period
        requestIdleCallback(() => {
          // Continue processing in next idle period
        });
      }
    }
  }
  
  return processedBookings;
}

function getBookingColor(booking) {
  switch (booking.BOOKING_STATUS) {
    case 'check-In': return 'green';
    case 'check-Out': return '#B3B3B3';
    case 'pending': 
      // Distinguish between pending and late check-in based on CHECK_IN_STATUS
      if (booking.CHECK_IN_STATUS === 0) {
        return '#fff700'; // Late check-in = lemon
      } else {
        return '#e53935'; // Regular check-in = red
      }
    case 'cancelled': return '#000000';
    default: return 'pink';
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function handleEventClick(info) {
  const event = info.event;
  const status = event.extendedProps.bookingStatus;
  const bookingId = event.id;  // should match your BookingID



  // getResources() is on the EventApi, not on `info`
  const resources = event.getResources();
  const room = resources.length ? resources[0] : null;
  const roomId = room?.id;
  if (!roomId) {
    return;
  }

  // Route to appropriate modal based on status
  switch (status) {
    case 'check-In':
      // Open room menu modal for active check-ins
      window.openRoomMenuModal(bookingId, event);
      break;
      
    case 'check-Out':
      // Open checkout backtrack modal for completed check-outs
      window.openCheckoutBacktrackModal(bookingId, event);
      break;
      
    case 'pending':
      // Check if this is a late check-in (orange) or regular pending (blue)
      const eventColor = event.backgroundColor;
      if (eventColor === '#fff700') {
        showLateCheckInModal(event);
      } else {
        showPendingModal(event);
      }
      break;
      
    case 'cancelled':
      // Show cancelled reservation modal
      showCancelledModal(event);
      break;
      
    default:
      // For any other status, show appropriate modal
      if (status === 'late check-in' || status === 'late_check_in' || status === 'late_checkin') {
        showLateCheckInModal(event);
      } else {
        // Check if we can determine status from event color or other properties
        const eventColor = event.backgroundColor;
        
        if (eventColor === '#fff700') {
          showLateCheckInModal(event);
        } else if (eventColor === 'red' || eventColor === '#e53935') {
          showPendingModal(event);
        } else if (eventColor === '#000000') {
          showCancelledModal(event);
        } else {
          // Fallback to event info modal
          showEventInfoModal(event);
        }
      }
      break;
  }
}

// Creates a left/right split color based on check-in/out statuses
function applyCompositeStatusStyles(event, el) {
  try {
    const bookingStatus = event.extendedProps?.bookingStatus;

    // Colors
    const red = '#e53935';      // regular
    const lemon = '#fff700';    // late
    const green = '#43a047';    // occupied

    let checkInStatusRaw = event.extendedProps?.checkInStatus;   // expected: 1 regular, 0 late
    let checkOutStatusRaw = event.extendedProps?.checkOutStatus; // expected: 0 regular, 1 late

    if (checkInStatusRaw === undefined && checkOutStatusRaw === undefined) {
      el.removeAttribute('data-composite');
      el.style.background = '';
      return;
    }

    // Normalizers to handle differing encodings from backend/UI
    const inferFromColor = () => (event.backgroundColor === '#fff700' ? 'late' : 'regular');
    const normalizeCheckIn = (v) => {
      if (v === undefined || v === null || v === '') return inferFromColor();
      if (v === 1 || v === '1' || String(v).toLowerCase() === 'regular') return 'regular';
      if (v === 0 || v === '0' || String(v).toLowerCase().includes('late')) return 'late';
      return inferFromColor();
    };
    const normalizeCheckOut = (v) => {
      if (v === undefined || v === null || v === '') return inferFromColor();
      // Some systems store CO: 1 = late, 0 = regular. Others invert.
      const s = String(v).toLowerCase();
      if (v === 1 || v === '1' || s.includes('late')) return 'late';
      if (v === 0 || v === '0' || s.includes('regular')) return 'regular';
      return inferFromColor();
    };

    const ciNorm = normalizeCheckIn(checkInStatusRaw);
    let coNorm = normalizeCheckOut(checkOutStatusRaw);
    if (checkOutStatusRaw === undefined || checkOutStatusRaw === null || checkOutStatusRaw === '') {
      // If checkout status is absent, default to Regular (red) to avoid all-lemon bars
      // This aligns with typical default checkout behavior unless explicitly marked late
      coNorm = 'regular';
    }

    // Decide behavior by booking status
    if (bookingStatus === 'pending') {
      // Determine each side for pending
      const leftColor = ciNorm === 'regular' ? red : lemon;    // left half = check-in
      const rightColor = coNorm === 'late' ? lemon : red;      // right half = check-out
      el.setAttribute('data-composite', 'true');
      el.style.background = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;
      el.style.color = '#fff';
      return;
    }

    if (bookingStatus === 'check-In') {
      // Occupied: keep left green, right reflects checkout status
      const leftColor = green;
      const rightColor = coNorm === 'late' ? lemon : red;
      el.setAttribute('data-composite', 'true');
      el.style.background = `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)`;
      el.style.color = '#fff';
      return;
    }

    // Default: no composite, keep original color
    el.removeAttribute('data-composite');
    el.style.background = '';
    if (event.backgroundColor) {
      el.style.backgroundColor = event.backgroundColor;
    }
  } catch (e) {
    // ignore
  }
}

function handleEventDidMount(info) {
  // TOOLTIPS COMPLETELY REMOVED - No more tooltip setup
  
  // Overlap detection
  const assignedResources = info.event.getResources();
  const assignedResourceId = assignedResources.length && assignedResources[0] ? assignedResources[0].id : undefined;

  const eventStartDate = getDateString(info.event.start);
  const eventEndDate = getDateString(info.event.end);

  const sameRoomEvents = info.view.calendar.getEvents().filter(e => {
    const eResources = e.getResources();
    const eResourceId = eResources.length && eResources[0] ? eResources[0].id : undefined;
    return String(assignedResourceId) === String(eResourceId) && info.event.id !== e.id;
  });

  const overlappingEvents = sameRoomEvents.filter(e => {
    const eStartDate = getDateString(e.start);
    const eEndDate = getDateString(e.end);
    return (eventStartDate <= eEndDate && eventEndDate >= eStartDate);
  });

  if (overlappingEvents.length > 0) {
    info.el.classList.add("overlapping-event");
  } else {
    info.el.classList.remove("overlapping-event");
  }

  window.eventElements[info.event.id] = info.el;

  // Apply composite check-in/check-out status colors (left = check-in, right = check-out)
  try {
    applyCompositeStatusStyles(info.event, info.el);
  } catch (e) {
    // ignore style errors
  }

  // Improve title readability with a top-aligned parallelogram chip overlay
  try {
    // Hide/remove FullCalendar's default title to avoid duplicates
    const defaultTitle = info.el.querySelector('.fc-event-title, .fc-event-title-container');
    if (defaultTitle) {
      defaultTitle.textContent = '';
      defaultTitle.style.display = 'none';
    }

    const existing = info.el.querySelector('.event-title-chip');
    if (!existing) {
      const chip = document.createElement('div');
      chip.className = 'event-title-chip';
      const span = document.createElement('span');
      span.textContent = info.event.title || '';
      chip.appendChild(span);
      info.el.appendChild(chip);
    } else {
      const span = existing.querySelector('span') || document.createElement('span');
      span.textContent = info.event.title || '';
      if (!existing.contains(span)) existing.appendChild(span);
    }
  } catch (e) {
    // silent
  }
}

function handleDatesSet(info) {
  globalOverlapCheck(info.view.calendar);
  
  // Hide "12am" and "12pm" slot labels
  setTimeout(() => {
    $('a.fc-timeline-slot-cushion.fc-scrollgrid-sync-inner').filter(function() {
      return $(this).text() === '12am' || $(this).text() === '12pm';
    }).hide();
  }, 0);
}

// =============================================================================
// DRAG AND DROP EVENT HANDLERS
// =============================================================================

// =============================================================================
// RESIZE EVENT HANDLERS (EXTEND CHECKOUT)
// =============================================================================

function handleEventResize(info) {
  console.log('🎯 Resize HANDLER for event:', info.event.title);
  
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
  
  console.log('🔍 Extension validation:', {
    newEnd: newEnd.toISOString(),
    originalEnd: originalEnd.toISOString(),
    isExtension: isExtension
  });
  
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
  const overlappingEvents = checkForOverlaps(info.event.start, newEnd, roomResource.id, bookingId);
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
  
  // Calculate the extension days (difference between new and original end)
  const originalEndDate = originalData.end;
  const extensionDays = Math.ceil((newEnd.getTime() - originalEndDate.getTime()) / (1000 * 3600 * 24));
  
  // Use the existing extend modal with pre-calculated days
  if (typeof openExtendModal === 'function') {
    // Store the resize info for later use
    window.pendingResizeInfo = {
      info: info,
      newEnd: newEnd,
      roomResource: roomResource,
      bookingId: bookingId,
      extensionDays: extensionDays
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
  console.log('🎯 Resize START for event:', info.event.title);
  
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
    
    console.log('✅ Original data stored:', originalData);
    console.log('✅ Data stored in global map for event:', eventId);
    
    // Verify the data was stored correctly
    if (originalData && originalData.end) {
      console.log('✅ Original end date verified:', originalData.end.toISOString());
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
  console.log('Event resize stopped:', info.event.title);
  console.log('🔍 Resize stop data:', {
    _wasResized: info.event._wasResized,
    _originalData: info.event._originalData,
    end: info.event.end
  });
  
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
  console.log('🔄 Resize stop completed, waiting for resize handler');
  
  // Don't restore original data yet - let the resize handler decide
  // The resize handler will either process the resize or restore the data if needed
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
    checkIn: formatMySQLDateTime(info.event.start), // 2:00 PM
    checkOut: formatMySQLDateTime(newEnd),  // 11:00 AM
    isExtended: true, // Flag to indicate this is an extension
    originalCheckOut: formatMySQLDateTime(originalEnd), // Original checkout date for tracking
    extensionDate: formatMySQLDateTime(new Date()) // When the extension was made
  };
  
  console.log('🚀 Calendar resize sending data:', updateData);
  
  // Debug: Log the data being sent
  console.log('🚀 Calendar resize sending data:', updateData);
  
  // Make AJAX call to update booking in database
  fetch('/calendar/api/update-booking', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updateData)
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
        console.log('✅ Global map cleaned up for booking:', bookingId);
      }
      
      console.log('✅ Resize processing completed, all data cleared');
      
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
      } else {
        console.log('⚠️ Socket not available - dashboard refresh will happen on next page load');
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
    } else {
      // Close the loading modal first
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Extension Failed',
        text: data.message || 'Failed to extend checkout. Please try again.',
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
        console.log('✅ Global map cleaned up for failed booking:', bookingId);
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
      text: 'An error occurred while extending the checkout. Please try again.',
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
      console.log('✅ Global map cleaned up for failed event:', info.event.id);
    }
    
    if (info.event._originalData) {
      restoreOriginalEventData(info.event);
    }
  });
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

function handleEventDrop(info) {
  
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
    const overlappingEvents = checkForOverlaps(newStart, newEnd, targetRoom.id, bookingId);
    if (overlappingEvents.length > 0) {
      
      // Show warning about overlaps
      Swal.fire({
        title: '⚠️ Overlapping Events Detected',
        html: `This booking will overlap with existing events:<br><br>
               <b>${overlappingEvents.map(e => e.title).join(', ')}</b><br><br>
               Do you want to continue?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, Continue',
        cancelButtonText: 'Cancel'
      }).then((result) => {
        if (result.isConfirmed) {
          proceedWithUpdate(info, newStart, newEnd, targetRoom, bookingId);
        } else {
          info.revert();
        }
      });
      return;
    }
  } else {
  }
  
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
  console.log('Event drag stopped:', info.event.title);
  
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
    console.log('🔄 Restoring original event data - no drop occurred');
    restoreOriginalEventData(info.event);
    
    // Clean up any duplicates that might have been created during the drag
    setTimeout(() => {
      removeDuplicateEvents();
    }, 100);
  }
}

// =============================================================================
// MODAL FUNCTIONS
// =============================================================================

// Function to show event info from calendar (fallback)
function showEventInfoModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';

  // FullCalendar uses exclusive end → subtract one day
  const ciDate = new Date(event.start);
  const coDate = new Date(event.end);
  coDate.setDate(coDate.getDate() - 1);

  const checkIn = ciDate.toLocaleDateString();
  const checkOut = coDate.toLocaleDateString();

  // Determine event status and title based on event properties
  let statusTitle = '';
  let statusIcon = 'info';
  
  if (event.extendedProps && event.extendedProps.bookingStatus) {
    const status = event.extendedProps.bookingStatus;
    
    switch (status) {
      case 'check-In':
        statusTitle = `Room ${roomNumber} - Checked In`;
        statusIcon = 'success';
        break;
      case 'check-Out':
        statusTitle = `Room ${roomNumber} - Checked Out`;
        statusIcon = 'info';
        break;
      case 'pending':
        statusTitle = `Room ${roomNumber} - Pending Reservation`;
        statusIcon = 'warning';
        break;
      case 'cancelled':
        statusTitle = `Room ${roomNumber} - Cancelled`;
        statusIcon = 'error';
        break;
      default:
        statusTitle = `Room ${roomNumber} - ${status}`;
        statusIcon = 'info';
    }
  } else {
    // Fallback if no status info
    statusTitle = `Room ${roomNumber}`;
    statusIcon = 'info';
  }

  Swal.fire({
    title: statusTitle,
    html:
      `Reserved by <b>${guestName}</b><br>` +
      `Check-in: <b>${checkIn}</b><br>` +
      `Check-out: <b>${checkOut}</b>`,
    icon: statusIcon,
    confirmButtonText: 'OK'
  });
}

// Function to show booking details modal (calls openRoomMenuModal from room-menu_data.js)
function showBookingDetailsModal(bookingData, roomId, bookingId) {
  console.log('showBookingDetailsModal called with:', { bookingData, roomId, bookingId });
  
  // Check if openRoomMenuModal function exists
  if (typeof window.openRoomMenuModal === 'function') {
    // Call the openRoomMenuModal function from room-menu_data.js
    window.openRoomMenuModal(bookingId);
  } else {
    console.error('openRoomMenuModal function not found. Make sure room-menu_data.js is loaded.');
    // Fallback to show basic event info
    Swal.fire({
      title: 'Booking Details',
      html: `
        <div class="text-left">
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Room ID:</strong> ${roomId}</p>
          <p><strong>Guest:</strong> ${bookingData.CustomerName || 'N/A'}</p>
          <p><strong>Check-in:</strong> ${new Date(bookingData.CheckInDate).toLocaleDateString()}</p>
          <p><strong>Check-out:</strong> ${new Date(bookingData.CheckOutDate).toLocaleDateString()}</p>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'OK'
    });
  }
}

// Function to show late check-in modal
function showLateCheckInModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // FullCalendar uses exclusive end → subtract one day
  const ci = new Date(event.start);
  const co = new Date(event.end);
  co.setDate(co.getDate() - 1);

  const checkIn = ci.toLocaleDateString();
  const checkOut = co.toLocaleDateString();

  // Build composite status badges (CI/CO)
  const ciStatus = event.extendedProps?.checkInStatus; // 1 regular, 0 late
  const coStatus = event.extendedProps?.checkOutStatus; // 0 regular, 1 late
  const ciText = (ciStatus === 1 ? 'REGULAR CHECK-IN' : 'LATE CHECK-IN');
  const ciColor = (ciStatus === 1 ? '#e53935' : '#fff700');
  const coText = (coStatus === 1 ? 'LATE CHECK-OUT' : 'REGULAR CHECK-OUT');
  const coColor = (coStatus === 1 ? '#fff700' : '#e53935');

  Swal.fire({
    title: `Room ${roomNumber} - Pending Reservation`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: ${ciStatus === 0 ? '#fff700' : '#e53935'}; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Reservation Details</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid #fff700;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; text-align: center;">
                  <span style="background: transparent; border:2px solid ${ciColor}; color:${ciColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${ciText}</span>
                  <span style="background: transparent; border:2px solid ${coColor}; color:${coColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${coText}</span>
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        ${ciStatus === 0 ? `<div style="text-align: center; padding: 15px; background: rgba(255, 244, 79, 0.15); border-radius: 8px; border: 1px solid rgba(255, 244, 79, 0.35);"><span style=\"color: #fff700; font-size: 14px; font-weight: 600;\">⚠️ This guest has not checked in yet and is past the scheduled check-in time.</span></div>` : ''}
      </div>
    `,
    icon: 'warning',
    confirmButtonText: 'Check-In Now',
    cancelButtonText: 'Cancel',
    showCancelButton: true,
    confirmButtonColor: '#b8a600', // Darker lemon for contrast
    cancelButtonColor: '#6c757d',
    background: '#2a3135',
    color: '#ffffff',
    width: '500px'
  }).then((result) => {
    if (result.isConfirmed) {
      // Show confirmation dialog
      Swal.fire({
        title: 'Confirm Check-In',
        text: 'Are you sure you want to check-in this guest?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Check-In',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#28a745', // Green for check-in
        cancelButtonColor: '#6c757d',
        background: '#2a3135',
        color: '#ffffff'
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          // Process the check-in
          checkInReservation(bookingId, event);
        }
      });
    }
  });
}

// Function to show pending reservation modal
function showPendingModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // FullCalendar uses exclusive end → subtract one day
  const ciDate2 = new Date(event.start);
  const coDate2 = new Date(event.end);
  coDate2.setDate(coDate2.getDate() - 1);

  const checkIn = ciDate2.toLocaleDateString();
  const checkOut = coDate2.toLocaleDateString();

  // Build composite status badges (CI/CO)
  const ciStatus2 = event.extendedProps?.checkInStatus; // 1 regular, 0 late
  const coStatus2 = event.extendedProps?.checkOutStatus; // 0 regular, 1 late
  const ciText = (ciStatus2 === 1 ? 'REGULAR CHECK-IN' : 'LATE CHECK-IN');
  const ciColor = (ciStatus2 === 1 ? '#e53935' : '#fff700');
  const coText = (coStatus2 === 1 ? 'LATE CHECK-OUT' : 'REGULAR CHECK-OUT');
  const coColor = (coStatus2 === 1 ? '#fff700' : '#e53935');

  Swal.fire({
    title: `Room ${roomNumber} - Pending Reservation`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: ${ciStatus2 === 0 ? '#fff700' : '#e53935'}; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Reservation Details</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid #e53935;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: center; text-align: center;">
                  <span style="background: transparent; border:2px solid ${ciColor}; color:${ciColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${ciText}</span>
                  <span style="background: transparent; border:2px solid ${coColor}; color:${coColor}; font-weight:800; font-size:12px; padding:2px 6px; border-radius:6px;">${coText}</span>
                </div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="text-align: center; padding: 15px; background: rgba(229, 57, 53, 0.1); border-radius: 8px; border: 1px solid rgba(229, 57, 53, 0.35);">
          <span style="color: #e53935; font-size: 14px; font-weight: 500;">
            📋 This reservation is Regular Check-In confirmation and requires staff approval.
          </span>
        </div>
      </div>
    `,
    icon: 'info',
    confirmButtonText: 'Check-In Now',
    cancelButtonText: 'Cancel',
    showCancelButton: true,
    confirmButtonColor: '#e53935', // Red for regular check-in
    cancelButtonColor: '#6c757d',
    background: '#2a3135',
    color: '#ffffff',
    width: '500px'
  }).then((result) => {
    if (result.isConfirmed) {
      // Show confirmation dialog
      Swal.fire({
        title: 'Confirm Check-In',
        text: 'Are you sure you want to check-in this guest?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Check-In',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#28a745', // Green for check-in
        cancelButtonColor: '#6c757d',
        background: '#2a3135',
        color: '#ffffff'
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          // Process the check-in
          checkInReservation(bookingId, event);
        }
      });
    }
  });
}

// Function to check-in a reservation
function checkInReservation(bookingId, event) {
  // Show loading modal
  Swal.fire({
    title: 'Processing Check-In...',
    text: 'Please wait while we process the guest check-in.',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  // Prepare data for API call
  const checkInData = {
    bookingId: bookingId,
    action: 'check-in'
  };
  
  // Make API call to check-in the reservation
  fetch('/calendar/api/check-in-reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(checkInData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal
      Swal.close();
      
      // Success - show notification
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Check-In Successful!', 'The guest has been successfully checked in and room marked as occupied.');
      } else {
        Swal.fire({
          title: 'Check-In Successful!',
          text: 'The guest has been successfully checked in and room marked as occupied.',
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Update the event status to check-In (green)
      updateEventStatusInstantly(event, 'check-In');
      
      // Update legend counts to reflect the status change
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      
      // Emit enhanced socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'guest-checked-in-occupied',
          message: `Guest checked in successfully and moved to occupied status`,
          data: {
            bookingId: bookingId,
            newStatus: 'check-In',
            isOccupied: data.isOccupied,
            roomId: data.roomId,
            roomStatus: data.roomStatus,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
      
      // Additional: Emit room status update event
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('room-status-updated', {
          action: 'room-occupied',
          message: `Room ${data.roomId} status updated to occupied`,
          data: {
            roomId: data.roomId,
            newStatus: data.roomStatus,
            timestamp: new Date().toISOString()
          }
        });
      }
      
    } else {
      // Close the loading modal
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Check-In Failed',
        text: data.message || 'Failed to check-in the guest. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    // Close the loading modal
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while processing the check-in. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
      });
  });
}

// Function to remove a cancelled reservation
function removeCancelledReservation(bookingId, event) {
  // Prepare data for API call
  const removeData = {
    bookingId: bookingId,
    action: 'remove',
    setActive: 0
  };
  
  // Make API call to remove the reservation
  fetch('/calendar/api/remove-reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(removeData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal
      Swal.close();
      
      // Success - show notification
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Reservation Removed!', 'The cancelled reservation has been permanently removed.');
      } else {
        Swal.fire({
          title: 'Reservation Removed!',
          text: 'The cancelled reservation has been permanently removed.',
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Remove the event from the calendar
      if (event && event.remove) {
        event.remove();
      }
      
      // Update legend counts to reflect the removal
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      
      // Update overlap detection
      if (event.view && event.view.calendar) {
        globalOverlapCheck(event.view.calendar);
      }
      
      // Emit socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'reservation-removed',
          message: `Reservation removed successfully`,
          data: {
            bookingId: bookingId,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
      
    } else {
      // Close the loading modal
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Remove Failed',
        text: data.message || 'Failed to remove the reservation. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    console.error('Error removing reservation:', error);
    
    // Close the loading modal
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while removing the reservation. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Function to reopen a cancelled reservation
function reopenCancelledReservation(bookingId, event, newStatus = 'pending') {
  // Prepare data for API call
  const reopenData = {
    bookingId: bookingId,
    action: 'reopen',
    newStatus: 'pending', // Always set to 'pending'
    checkInStatus: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
  };
  

  
  // Make API call to reopen the reservation
  fetch('/calendar/api/reopen-reservation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reopenData)
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Close the loading modal
      Swal.close();
      
      // Success - show notification based on selected status
      const statusText = newStatus === 'late_check_in' ? 'late check-in' : 'regular check-in';
      const statusDisplay = newStatus === 'late_check_in' ? 'Late Check-in' : 'Regular Check-in';
      
      if (typeof PMSCore !== 'undefined') {
        PMSCore.showSuccess('Reservation Reopened!', `The cancelled reservation has been successfully reopened and is now ${statusText}.`);
      } else {
        Swal.fire({
          title: 'Reservation Reopened!',
          text: `The cancelled reservation has been successfully reopened and is now ${statusText}.`,
          icon: 'success',
          confirmButtonText: 'OK'
        });
      }
      
      // Update the event object immediately after API success
      
      // Completely recreate extendedProps to ensure the update works
      const currentExtendedProps = event.extendedProps || {};
      event.extendedProps = {
        ...currentExtendedProps,
        bookingStatus: 'pending', // Always 'pending'
        checkInStatus: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
      };
      
      // Set background color based on check-in status
      const statusColor = newStatus === 'late_check_in' ? '#fff700' : '#e53935'; // Lemon for late, Red for regular
      event.backgroundColor = statusColor;
      
      // Update the event status in the calendar INSTANTLY (like drag & drop)
      // Pass the original newStatus to maintain the late_check_in vs regular logic
      updateEventStatusInstantly(event, newStatus);
      
      // Update legend counts to reflect the status change
      if (typeof updateLegendCounts === 'function') {
        updateLegendCounts();
      }
      
      // Emit socket event to update dashboard in real-time
      if (typeof dashboardSocket !== 'undefined' && dashboardSocket) {
        dashboardSocket.emit('dashboard-refresh', {
          action: 'reservation-reopened',
          message: `Reservation reopened successfully`,
          data: {
            bookingId: bookingId,
            newStatus: newStatus,
            timestamp: new Date().toISOString()
          }
        });
      }
      
      // Trigger dashboard refresh if available
      if (typeof window.reloadDashboardData === 'function') {
        window.reloadDashboardData();
      }
      
    } else {
      // Close the loading modal
      Swal.close();
      
      // Error from server
      Swal.fire({
        title: 'Reopen Failed',
        text: data.message || 'Failed to reopen the reservation. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
    }
  })
  .catch(error => {
    // Close the loading modal
    Swal.close();
    
    // Show error message
    Swal.fire({
      title: 'Error',
      text: 'An unexpected error occurred while reopening the reservation. Please try again.',
      icon: 'error',
      confirmButtonText: 'OK'
    });
  });
}

// Function to update event status in the calendar (INSTANT UPDATE VERSION)
function updateEventStatusInstantly(event, newStatus) {
  try {
    // Prevent duplicate updates
    if (event._isStatusUpdating) {
      return;
    }
    
    // Mark event as being updated
    event._isStatusUpdating = true;
    
    // Create a mock booking object to use with existing getBookingColor function
    const mockBooking = {
      BOOKING_STATUS: newStatus, // Use the actual newStatus (pending, check-In, etc.)
      CHECK_IN_STATUS: newStatus === 'late_check_in' ? 0 : 1 // 0 = late check-in, 1 = regular check-in
    };
    
    // Use existing getBookingColor function
    const newColor = getBookingColor(mockBooking);
    
    // PROPER FULLCALENDAR APPROACH: Use setExtendedProp and setProp methods
    try {
      // Update extended properties using FullCalendar's API
      event.setExtendedProp('bookingStatus', newStatus);
      event.setExtendedProp('checkInStatus', mockBooking.CHECK_IN_STATUS);
      
      // Update background color using FullCalendar's API
      event.setProp('backgroundColor', newColor);
      
    } catch (apiError) {
      // Alternative: Try to update the calendar event directly
      const calendar = getCalendar(event);
      if (calendar) {
        const calendarEvent = calendar.getEventById(event.id);
        if (calendarEvent) {
          try {
            calendarEvent.setExtendedProp('bookingStatus', newStatus);
            calendarEvent.setExtendedProp('checkInStatus', mockBooking.CHECK_IN_STATUS);
            calendarEvent.setProp('backgroundColor', newColor);
          } catch (calendarApiError) {
            // Silent fallback
          }
        }
      }
    }
    
    // ULTRA-FAST: Update visual styling instantly
    const eventElement = window.eventElements[event.id];
    if (eventElement) {
      // Update background color immediately
      eventElement.style.backgroundColor = newColor;
      
      // Add a visual update indicator
      eventElement.classList.add('status-updated');
      setTimeout(() => {
        eventElement.classList.remove('status-updated');
      }, 1000);
      
      // CRITICAL: Also update the event element's data attributes
      eventElement.setAttribute('data-status', newStatus);
      eventElement.setAttribute('data-booking-status', newStatus);

      // Re-apply composite styles if check-in/check-out extendedProps are present
      try {
        applyCompositeStatusStyles(event, eventElement);
      } catch (e) {}
    }
    
    // Force calendar to re-render to show the changes
    const calendar = getCalendar(event);
    if (calendar) {
      calendar.render();
    }
    
    // Update overlap detection for this specific event
    setTimeout(() => {
      if (calendar) {
        globalOverlapCheck(calendar);
      }
    }, 50);
    
    // Update legend counts to reflect the status change
    if (typeof updateLegendCounts === 'function') {
      updateLegendCounts();
    }
    
    // Clear update flag after a delay
    setTimeout(() => {
      event._isStatusUpdating = false;
    }, 100);
    

    
  } catch (error) {
    // Clear update flag on error
    if (event) event._isStatusUpdating = false;
  }
}

// Function to update event status in the calendar (ORIGINAL VERSION - kept for compatibility)
function updateEventStatus(event, newStatus) {
  try {
    // Update the event's extended properties
    if (event.extendedProps) {
      event.extendedProps.bookingStatus = newStatus;
    }
    
    // Create a mock booking object to use with existing getBookingColor function
    const mockBooking = {
      BOOKING_STATUS: newStatus,
      CHECK_IN_STATUS: newStatus === 'pending' ? 1 : 0 // Set appropriate check-in status
    };
    
    // Use existing getBookingColor function
    const newColor = getBookingColor(mockBooking);
    event.backgroundColor = newColor;
    
    // Update the event element styling
    const eventElement = window.eventElements[event.id];
    if (eventElement) {
      // Update background color
      eventElement.style.backgroundColor = newColor;
      
      // Add a visual update indicator
      eventElement.classList.add('status-updated');
      setTimeout(() => {
        eventElement.classList.remove('status-updated');
      }, 1000);
    }
    
    // Force calendar to re-render the event
    if (event.view && event.view.calendar) {
      event.view.calendar.render();
    }
    
    // Also update the event in the calendar's event source
    try {
      const calendar = event.view?.calendar || window.calendar;
      if (calendar) {
        // Get the current event from calendar
        const currentEvent = calendar.getEventById(event.id);
        if (currentEvent) {
          // Update the event's extended properties
          if (currentEvent.extendedProps) {
            currentEvent.extendedProps.bookingStatus = newStatus;
          }
          currentEvent.backgroundColor = newColor;
        }
      }
    } catch (calendarError) {
      // Silent fallback
    }
    
    // Add a verification function to the window for debugging
    window.verifyEventStatus = function(eventId) {
      const calendar = window.calendar;
      if (calendar) {
        const event = calendar.getEventById(eventId);
        if (event) {
          // Event found - status verification available
        }
      }
    };
    
    // Add a function to force update event status (for debugging)
    window.forceUpdateEventStatus = function(eventId, newStatus) {
      const calendar = window.calendar;
      if (calendar) {
        const event = calendar.getEventById(eventId);
        if (event) {
          if (event.extendedProps) {
            event.extendedProps.bookingStatus = newStatus;
          }
          
          // Update color
          const mockBooking = {
            BOOKING_STATUS: newStatus,
            CHECK_IN_STATUS: newStatus === 'pending' ? 1 : 0
          };
          const newColor = getBookingColor(mockBooking);
          event.backgroundColor = newColor;
          
          // Force calendar render
          calendar.render();
        }
      }
    };
    
  } catch (error) {
    // Silent error handling
  }
}

// Function to show cancelled reservation modal
function showCancelledModal(event) {
  const roomNumber = event.getResources()[0]?.title || 'N/A';
  const guestName = event.title || 'Unknown Guest';
  const bookingId = event.id;

  // FullCalendar uses exclusive end → subtract one day
  const ci = new Date(event.start);
  const co = new Date(event.end);
  co.setDate(co.getDate() - 1);

  const checkIn = ci.toLocaleDateString();
  const checkOut = co.toLocaleDateString();

  Swal.fire({
    title: `Room ${roomNumber} - Cancelled Reservation`,
    html: `
      <div class="text-left" style="padding: 20px 0;">
        <div style="margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 15px;">
            <div style="width: 8px; height: 8px; background-color: #000000; border-radius: 50%; margin-right: 12px;"></div>
            <span style="font-weight: 600; color: #ffffff; font-size: 16px;">Cancelled Reservation</span>
          </div>
          <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; border-left: 3px solid #000000;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Guest Name</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${guestName}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                <div style="color: #ffffff; font-weight: 700; font-size: 16px; margin-top: 4px; text-transform: uppercase;">Cancelled</div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1; margin-right: 15px;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-in Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkIn}</div>
              </div>
              <div style="flex: 1;">
                <span style="color: #cccccc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Check-out Date</span>
                <div style="color: #ffffff; font-weight: 600; font-size: 16px; margin-top: 4px;">${checkOut}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="text-align: center; padding: 15px; background: rgba(0, 0, 0, 0.15); border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.35);">
          <span style="color: #ffffff; font-size: 14px; font-weight: 500;">
            ❌ This reservation has been cancelled.
          </span>
        </div>
      </div>
    `,
    icon: 'error',
    cancelButtonText: 'Remove',
    confirmButtonText: 'Reopen Reservation',
    denyButtonText: 'Close',
    showDenyButton: true,
    reverseButtons: true, 
    showCancelButton: true,
    confirmButtonColor: '#000000',
    cancelButtonColor: '#dc3545',
    denyButtonColor: '#6c757d',
    background: '#2a3135',
    color: '#ffffff',
    width: '500px'
      }).then((result) => {
      if (result.isConfirmed) {
        // Reopen button clicked - show status selection first
        Swal.fire({
          title: 'Select New Status',
          text: 'Choose the new status for this reopened reservation:',
          icon: 'question',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: 'Regular Check-in',
          denyButtonText: 'Late Check-in',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#e53935', // Red for regular
          denyButtonColor: '#b8a600', // Dark lemon for late
          cancelButtonColor: '#6c757d',
          background: '#2a3135',
          color: '#ffffff'
        }).then((statusResult) => {
          if (statusResult.isConfirmed) {
            // User selected "Regular Check-in" - show confirmation
            Swal.fire({
              title: 'Reopen as Regular Check-in?',
              text: 'Are you sure you want to reopen this cancelled reservation as a regular check-in?',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Yes, Reopen as Regular Check-in',
              cancelButtonText: 'Cancel',
              confirmButtonColor: '#e53935',
              cancelButtonColor: '#6c757d'
            }).then((reopenResult) => {
              if (reopenResult.isConfirmed) {
                // Show loading state
                Swal.fire({
                  title: 'Reopening Reservation...',
                  text: 'Please wait while we reopen the cancelled reservation as regular check-in.',
                  allowOutsideClick: false,
                  didOpen: () => {
                    Swal.showLoading();
                  }
                });
                
                // Call API to reopen the cancelled reservation as pending
                reopenCancelledReservation(bookingId, event, 'pending');
              }
            });
          } else if (statusResult.isDenied) {
            // User selected "Late Check-in Modal" - show confirmation
            Swal.fire({
              title: 'Reopen as Late Check-in?',
              text: 'Are you sure you want to reopen this cancelled reservation as a late check-in?',
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Yes, Reopen as Late Check-in',
              cancelButtonText: 'Cancel',
              confirmButtonColor: '#b8a600',
              cancelButtonColor: '#6c757d'
            }).then((reopenResult) => {
              if (reopenResult.isConfirmed) {
                // Show loading state
                Swal.fire({
                  title: 'Reopening Reservation...',
                  text: 'Please wait while we reopen the cancelled reservation as late check-in.',
                  allowOutsideClick: false,
                  didOpen: () => {
                    Swal.showLoading();
                  }
                });
                
                // Call API to reopen the cancelled reservation as late check-in
                reopenCancelledReservation(bookingId, event, 'late_check_in');
              }
            });
          }
          // Cancel button just closes the modal automatically
        });
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        // Remove button clicked
        Swal.fire({
          title: 'Remove Reservation?',
          text: 'Are you sure you want to permanently remove this cancelled reservation? This action cannot be undone.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Remove',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#dc3545',
          cancelButtonColor: '#6c757d'
        }).then((removeResult) => {
          if (removeResult.isConfirmed) {
            // Show loading state
            Swal.fire({
              title: 'Removing Reservation...',
              text: 'Please wait while we remove the reservation.',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            // Call API to remove the reservation
            removeCancelledReservation(bookingId, event);
          }
        });
      }
      // Close button (deny) just closes the modal automatically
    });
}

// =============================================================================
// BOOKING MODAL POPULATION
// =============================================================================

// Function to populate the booking modal with selected room and dates
function populateBookingModal(roomId, start, end) {
  console.log("1. populateBookingModal called with:", { roomId, start, end });

  // Format dates for the daterange input
  const startDate = new Date(start);
  const endDate = new Date(end); // The end date from FullCalendar is the exclusive checkout day
  
  const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  const diffInTime = endDate.getTime() - startDate.getTime();
  const diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24));
  
  // Display format: "Check-in to Check-out (Nights)"
  const daterangeValue = `${startFormatted} to ${endFormatted} (${diffInDays} night/s)`;
  $('#daterange').val(daterangeValue);
  $('#diffindays').val(diffInDays);
  
  // Get room details from calendar resources instead of AJAX call
  const resources = calendar.getResources();
  const selectedResource = resources.find(resource => resource.id === roomId);
  
  if (selectedResource) {
    console.log("2. Found room details from calendar resources:", selectedResource);
    
    // Extract floor from parent resource (floor)
    const parentResource = selectedResource.parent;
    console.log("3. Parent resource:", parentResource);
    
    let floorNumber = '3'; // Default fallback
    
    if (parentResource) {
      // Extract floor number from "Floor X" title
      const floorMatch = parentResource.title.match(/Floor (\d+)/);
      if (floorMatch) {
        floorNumber = floorMatch[1];
      }
    } else {
      // If no parent, try to extract floor from room number
      const roomNumber = selectedResource.title;
      const roomMatch = roomNumber.match(/^(\d{1})/); // Only first digit for floor
      if (roomMatch) {
        floorNumber = roomMatch[1];
      }
    }
    
    console.log("4. Extracted floor number:", floorNumber);
    
    // Get room number from resource title
    const roomNumber = selectedResource.title;
    
    const floorDropdown = $('#addFloor');
    const roomDropdown = $('#addroom');

    // Clear and set the specific floor
    floorDropdown.empty().append(`<option value="${floorNumber}" selected>${floorNumber} Floor</option>`);

    // Clear and set the specific room
    roomDropdown.empty().append(`<option value="${roomId}" selected>${roomNumber}</option>`);
    
    // Set a flag before triggering the change event
    roomDropdown.data('is-calendar-action', true);

    // Now trigger the change event to populate other fields like price, etc.
    console.log("5. Triggering change event for the selected room.");
    roomDropdown.trigger('change');
  } else {
    console.error("Room resource not found for ID:", roomId);
  }
}

// =============================================================================
// MODAL EVENT HANDLERS
// =============================================================================

// Modal show handler
$(document).ready(function() {
  $('#modal-addbooking').on('shown.bs.modal', function () {
    const roomId = $(this).data('calendar-room-id');

    // Hide group booking elements when opening from the calendar
    $('#groupBookingCheckbox').parent().hide();
    $('#groupBookingFields').hide();

    if (roomId) {
      const start = $(this).data('calendar-start');
      const end = $(this).data('calendar-end');

      populateBookingModal(roomId, start, end);

      // Clean up the data attributes to prevent re-running
      $(this).removeData('calendar-room-id');
      $(this).removeData('calendar-start');
      $(this).removeData('calendar-end');
    }
  });

  // Also, reset the view when the modal is closed, so it shows up next time for the top bar
  $('#modal-addbooking').on('hidden.bs.modal', function () {
    $('#groupBookingCheckbox').parent().show();
    // Reset disabled fields in case the user closes the modal without booking
    $('#daterange').prop('disabled', false);
    $('#addFloor').prop('disabled', false);
    $('#addroom').prop('disabled', false);
  });
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Safe calendar access helper function
function getCalendar(event = null) {
  // Try to get calendar from event.view first, then fallback to global
  if (event && event.view && event.view.calendar) {
    return event.view.calendar;
  }
  // Fallback to global calendar
  return window.calendar;
}

// Date utility function (needed for overlap detection)
function getDateString(date) {
  return new Date(date).toISOString().split('T')[0];
}

// Format Date to MySQL DATETIME (YYYY-MM-DD HH:MM:SS) using local time
function formatMySQLDateTime(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

// Overlap detection function (needed for event handling)
function globalOverlapCheck(calendar) {
  const allEvents = calendar.getEvents();

  allEvents.forEach(event => {
    const assignedResources = event.getResources();
    const assignedResourceId = assignedResources.length && assignedResources[0] ? assignedResources[0].id : undefined;

    const eventStartDate = getDateString(event.start);
    const eventEndDate = getDateString(event.end);

    const sameRoomEvents = allEvents.filter(e => {
      const eResources = e.getResources();
      const eResourceId = eResources.length && eResources[0] ? eResources[0].id : undefined;
      return String(assignedResourceId) === String(eResourceId) && event.id !== e.id;
    });

    const overlappingEvents = sameRoomEvents.filter(e => {
      const eStartDate = getDateString(e.start);
      const eEndDate = getDateString(e.end);
      return (eventStartDate <= eEndDate && eventEndDate >= eStartDate);
    });

    const el = window.eventElements[event.id];
    if (el) {
      if (overlappingEvents.length > 0) {
        el.classList.add("overlapping-event");
      } else {
        el.classList.remove("overlapping-event");
      }
    }
  });
}

// =============================================================================
// FAST EVENT UPDATE SYSTEM
// =============================================================================

function updateSingleEvent(event, newStart, newEnd, newResource) {
  try {
    // Prevent duplicate updates by checking if event is already being updated
    if (event._isUpdating) {
      console.log('⚠️ Event update already in progress, skipping...');
      return;
    }
    
    // Mark event as being updated
    event._isUpdating = true;
    
    // ULTRA-FAST: Update event dates directly
    event.start = newStart;
    event.end = newEnd;
    
    // Update resource if changed
    if (newResource && event.getResources()[0]?.id !== newResource.id) {
      // Update resource ID directly
      event.resourceIds = [newResource.id];
      
      // Force calendar to re-render the event in the new room
      if (event.view && event.view.calendar) {
        event.view.calendar.render();
        console.log('✅ Event moved to new room:', newResource.title);
      } else {
        console.warn('⚠️ Calendar view not available for re-render');
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
      
      console.log('✅ Event data updated instantly');
    }
    
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
    
    console.log('✅ Event updated instantly without any calendar re-render');
  } catch (error) {
    console.error('Error updating single event:', error);
    // Clear update flag on error
    if (event) event._isUpdating = false;
    // Fallback to full calendar reload if single update fails
    console.log('🔄 Falling back to full calendar reload...');
    loadCalendarData();
  }
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

function restoreOriginalEventData(event) {
  try {
    if (event._originalData) {
      console.log('🔄 Restoring original event data for:', event.title);
      
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
        console.log('✅ Original data restored and cleared');
      } else {
        console.log('✅ Original data restored but preserved for resize processing');
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
// OVERLAP DETECTION AND VALIDATION
// =============================================================================

function checkForOverlaps(newStart, newEnd, roomId, excludeEventId) {
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
          overlappingEvents.push({
            id: event.id,
            title: event.title,
            start: eventStart,
            end: eventEnd
          });
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
  
  if (isRoomTransfer) {
    // This is a room transfer - use the proper transfer endpoint
    // This will log the transfer to room_transfer_logs table, which will then
    // be displayed in the timeline when openRoomMenuModal is called
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
        
        // Debug: Log the transfer data
        console.log('✅ Transfer successful:', {
          bookingId,
          oldRoomNumber,
          newRoomId,
          transferDate,
          response: data
        });
        
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
  } else {
    // This is just a date change (no room transfer) - use the original update logic
    // Prepare data for API call with full datetime including hours
    const updateData = {
      id: bookingId,
      room: targetRoom.title, // Room number
      checkIn: formatMySQLDateTime(newStart), // 2:00 PM
      checkOut: formatMySQLDateTime(newEnd)  // 11:00 AM
    };
    
    // Make AJAX call to update booking in database
    fetch('/calendar/api/update-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData)
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
        
        // Error from server
        Swal.fire({
          title: 'Update Failed',
          text: data.message || 'Failed to update booking. Please try again.',
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
        text: 'An error occurred while updating the booking. Please try again.',
        icon: 'error',
        confirmButtonText: 'OK'
      });
      
      // Revert the drop if update failed
      info.revert();
    });
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
// CUSTOM STYLES FOR DRAGGED EVENTS
// =============================================================================

function injectDragStyles() {
  // Check if styles are already injected
  if (document.getElementById('calendar-drag-styles')) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = 'calendar-drag-styles';
  style.textContent = `
    .event-being-dragged {
      opacity: 0.3 !important;
      z-index: 9999 !important;
      pointer-events: none !important;
      transform: scale(1.05) !important;
      transition: all 0.2s ease !important;
      box-shadow: 0 8px 25px rgba(0,0,0,0.3) !important;
      position: relative !important;
    }
    
    .event-being-dragged:hover {
      opacity: 0.4 !important;
      transform: scale(1.08) !important;
    }
    
    /* Ensure dragged events are always on top */
    .fc-event.event-being-dragged {
      z-index: 9999 !important;
    }
    
    /* Resize event styles */
    .event-being-resized {
      border-right: 3px solid #4CAF50 !important;
      border-radius: 0 8px 8px 0 !important;
      box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3) !important;
      transition: all 0.2s ease !important;
    }
    
    .event-being-resized:hover {
      border-right-color: #45a049 !important;
      box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4) !important;
    }
    
    /* Ensure resized events show resize handle */
    .fc-event.event-being-resized .fc-event-resizer {
      background-color: #4CAF50 !important;
      border-radius: 2px !important;
    }
    
    /* Control resize handles - only show right handle for checkout extension */
    .fc-event .fc-event-resizer-start {
      display: none !important; /* Hide left resize handle */
    }
    
    .fc-event .fc-event-resizer-end {
      display: block !important; /* Show only right resize handle */
      cursor: ew-resize !important;
    }

    /* Composite half color background via gradient retained on hover */
    .fc-event[data-composite="true"] {
      background-size: 100% 100% !important;
      background-repeat: no-repeat !important;
    }

    /* Title chip for better contrast (parallelogram) */
    .fc-event .event-title-chip {
      position: absolute;
      left: 8px;
      right: 8px;
      top: 0;
      transform: translateY(0) skewX(12deg);
      height: 16px;
      background: linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0.35));
      color: #fff;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-shadow: 0 1px 1px rgba(0,0,0,.5);
      line-height: 16px;
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
    }

    .fc-event .event-title-chip > span {
      display: inline-block;
      width: 100%;
      transform: skewX(-12deg);
    }

    /* Also hide default title container if any slips through */
    .fc-event .fc-event-title, .fc-event .fc-event-title-container { display: none !important; }
  `;
  
  document.head.appendChild(style);
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.processBookingsData = processBookingsData;
window.getBookingColor = getBookingColor;
window.applyCompositeStatusStyles = applyCompositeStatusStyles;
window.handleEventClick = handleEventClick;
window.handleEventDidMount = handleEventDidMount;
window.handleDatesSet = handleDatesSet;
window.handleEventDrop = handleEventDrop;
window.handleEventDragStart = handleEventDragStart;
window.handleEventDragStop = handleEventDragStop;
window.handleEventResize = handleEventResize;
window.handleEventResizeStart = handleEventResizeStart;
window.handleEventResizeStop = handleEventResizeStop;
window.showEventInfoModal = showEventInfoModal;
window.showLateCheckInModal = showLateCheckInModal;
window.showPendingModal = showPendingModal;
window.showCancelledModal = showCancelledModal;
window.showBookingDetailsModal = showBookingDetailsModal;
window.populateBookingModal = populateBookingModal;
window.globalOverlapCheck = globalOverlapCheck;
window.getDateString = getDateString;
window.updateSingleEvent = updateSingleEvent;
// Tooltip functionality removed
window.checkForOverlaps = checkForOverlaps;
window.proceedWithUpdate = proceedWithUpdate;
window.proceedWithResize = proceedWithResize;
window.clearDragPreviews = clearDragPreviews;
window.clearResizePreviews = clearResizePreviews;
window.restoreOriginalEventData = restoreOriginalEventData;
window.removeDuplicateEvents = removeDuplicateEvents;
window.setupPeriodicCleanup = setupPeriodicCleanup;
window.injectDragStyles = injectDragStyles;
window.reopenCancelledReservation = reopenCancelledReservation;
window.removeCancelledReservation = removeCancelledReservation;
window.checkInReservation = checkInReservation;
window.updateEventStatus = updateEventStatus;
window.updateEventStatusInstantly = updateEventStatusInstantly;
window.getCalendar = getCalendar;

