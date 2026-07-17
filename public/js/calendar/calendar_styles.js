// =============================================================================
// CALENDAR STYLES MODULE
// =============================================================================

// This module contains styling and UI functions for the calendar system

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
    /* Group booking highlight border - allow dynamic colors via inline styles */
    .fc-event.group-booking {
      /* Border color will be set dynamically via inline style with !important */
      box-shadow: 0 0 0 1px rgba(33,150,243,0.25) inset;
      height: 24px !important;
      min-height: 24px !important;
      margin-top: -4px !important;
    }
    
    /* Override .fc-v-event border:none for group bookings */
    .fc-v-event.group-booking {
      border: inherit !important;
    }
    
    /* Dynamic group color box-shadow based on data attribute */
    .fc-event.group-booking[data-group-color] {
      box-shadow: 0 0 0 1px rgba(0,0,0,0.1) inset, 0 0 8px rgba(0,0,0,0.15);
    }

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
      background: transparent;
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

    /* Payment status indicator: solid strip that keeps the parallelogram's own
       skew (full / partial / unpaid) instead of an axis-aligned shape like a circle */
    /* transform: none overrides the ".fc-event > *" counter-skew so this strip
       stays parallel to the parallelogram's slanted edge, matching the event shape */
    .fc-event .payment-status-line {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 7px;
      box-shadow: 1px 0 3px rgba(0, 0, 0, 0.7);
      pointer-events: none;
      z-index: 25;
      transform: none !important;
    }
  `;
  
  document.head.appendChild(style);
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.injectDragStyles = injectDragStyles;
