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
    /* Group / long-term / booking-channel booking highlight border */
    .fc-event.group-booking,
    .fc-event.long-term-booking,
    .fc-event.booking-channel-booking {
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12) inset;
      height: 24px !important;
      min-height: 24px !important;
      margin-top: -4px !important;
    }
    
    .fc-v-event.group-booking,
    .fc-v-event.long-term-booking,
    .fc-v-event.booking-channel-booking {
      border: inherit !important;
    }
    
    .fc-event.group-booking[data-highlight-border-color],
    .fc-event.long-term-booking[data-highlight-border-color],
    .fc-event.booking-channel-booking[data-highlight-border-color] {
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1) inset, 0 0 6px rgba(0, 0, 0, 0.12);
    }

    .fc-event.group-booking.booking-channel-booking {
      box-shadow: inset 0 0 0 3px #D5A6BD, 0 0 0 1px rgba(0, 0, 0, 0.12) !important;
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
      display: none;
      cursor: ew-resize !important;
    }

    .fc-event:hover .fc-event-resizer-end,
    .fc-event.event-being-resized .fc-event-resizer-end {
      display: block !important;
    }

    /* Composite half color background via gradient retained on hover */
    .fc-event[data-composite="true"] {
      background-size: 100% 100% !important;
      background-repeat: no-repeat !important;
    }

    /* Title chip for better contrast and crisp text rendering.
       Text is upright thanks to calendar.css's ".fc-event > *" rule.
       clip-path is removed to prevent Chromium font rasterization blur. */
    .fc-event .event-title-chip {
      position: absolute;
      left: 8px;
      right: 8px;
      top: 0;
      height: 18px !important;
      background: transparent !important;
      color: inherit;
      padding: 0 4px !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      text-shadow: inherit;
      line-height: 18px !important;
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      clip-path: none !important;
      -webkit-clip-path: none !important;
      transform-style: flat !important;
      backface-visibility: visible !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      text-rendering: optimizeLegibility !important;
    }

    .fc-event .event-title-chip > span {
      display: inline-block;
      width: 100%;
      transform-style: flat !important;
      backface-visibility: visible !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
      text-rendering: optimizeLegibility !important;
    }

    /* Also hide default title container if any slips through */
    .fc-event .fc-event-title, .fc-event .fc-event-title-container { display: none !important; }

    .fc-event .pickup-service-indicator {
      position: absolute;
      left: 9px;
      top: 50%;
      font-size: 10px;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
      pointer-events: none;
      z-index: 26;
      line-height: 1;
      /* Counter the bar's skew(-18deg) so the car stays upright */
      transform: translateY(-50%) skew(18deg) !important;
      transform-style: flat !important;
      backface-visibility: visible !important;
    }

    .fc-event.has-pickup-service .event-title-chip {
      left: 24px;
    }
  `;
  
  document.head.appendChild(style);
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.injectDragStyles = injectDragStyles;
