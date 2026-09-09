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
      transform: translateY(-50%) !important;
      transform-style: flat !important;
      backface-visibility: visible !important;
    }

    .fc-event.has-pickup-service .event-title-chip {
      left: 24px;
    }

    /* Solid blue cap over the checkout (right) end of every Late Check-Out
       booking bar. Mounted on the un-skewed .fc-timeline-event-harness wrapper
       (not the skewed, overflow:hidden .fc-event) and skewed to match, so it
       fully covers the bar's slanted tip. The guest name is drawn on top of it
       by .event-name-overlay, so a wide cap no longer hides the name. */
    .fc-timeline-event-harness > .late-checkout-end-marker {
      position: absolute;
      right: -3px;
      top: 0;
      bottom: 0;
      width: 26px;
      background: #1A3FA0;   /* matches the late-check-out / BTB deep blue accent */
      pointer-events: none;
      z-index: 20;
      transform: none;
      transform-origin: right center;
    }

    /* Mirror on the START (check-in / left) edge for every Late Check-In bar,
       in orange. */
    .fc-timeline-event-harness > .late-checkin-start-marker {
      position: absolute;
      left: -3px;
      top: 0;
      bottom: 0;
      width: 26px;
      background: #FB8C00;   /* matches the late-check-in orange accent */
      pointer-events: none;
      z-index: 20;
      transform: none;
      transform-origin: left center;
    }

    /* The orange cap sits above the bar, hiding the pick-up plane that lives at
       left:9px. When both are present, slide the plane out past the cap. */
    .fc-event.has-late-checkin-start .pickup-service-indicator {
      left: 30px;
    }

    /* Fuchsia cap on the START (left) edge for every booking with a reservation
       fee paid (partial payment) - same shape as the orange late-check-in cap. */
    .fc-timeline-event-harness > .reservation-fee-start-marker {
      position: absolute;
      left: -3px;
      top: 0;
      bottom: 0;
      width: 26px;
      background: #D500F9;   /* electric fuchsia */
      pointer-events: none;
      z-index: 21;
      transform: none;
      transform-origin: left center;
    }

    /* When a bar has BOTH the orange Late Check-In cap and the Reservation Fee
       cap, share ONE cap slot split VERTICALLY: orange on the left half,
       fuchsia on the right half. */
    .fc-timeline-event-harness > .fc-event.has-late-checkin-start.has-reservation-fee-start ~ .late-checkin-start-marker {
      width: 13px;
    }
    .fc-timeline-event-harness > .fc-event.has-late-checkin-start.has-reservation-fee-start ~ .reservation-fee-start-marker {
      left: 10px;
      width: 13px;
    }

    .fc-event.has-reservation-fee-start .pickup-service-indicator {
      left: 30px;
    }

    /* Guest-name overlay: harness-level (un-skewed) layer drawn ABOVE the edge
       caps (z-index 20), so the name always reads in FRONT of the blue / orange
       cap. Replaces the in-bar .event-title-chip whenever a cap is present. */
    .fc-timeline-event-harness > .event-name-overlay {
      position: absolute;
      left: 6px;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      text-shadow:
        -1px -1px 0 rgba(0, 0, 0, 0.55), 1px -1px 0 rgba(0, 0, 0, 0.55),
        -1px 1px 0 rgba(0, 0, 0, 0.55), 1px 1px 0 rgba(0, 0, 0, 0.55),
        0 1px 3px rgba(0, 0, 0, 0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      z-index: 25;
    }

    .fc-event.has-name-overlay .event-title-chip {
      visibility: hidden;
    }

    /* Black cap on the check-in edge of every Early Check-In bar - left + width
       set in JS (vars on the .fc-event): extends LEFT past the bar edge to the
       day's first gridline and fills the WHOLE first day column ("double black"). */
    .fc-timeline-event-harness > .early-checkin-start-marker {
      position: absolute;
      left: var(--early-ci-cap-left, -3px);
      top: 0;
      bottom: 0;
      width: var(--early-ci-cap-w, 26px);
      background: #000;
      pointer-events: none;
      z-index: 20;
      transform: none;
      transform-origin: left center;
    }
    .fc-event.has-early-checkin-start .event-title-chip {
      /* keep the title clear of the part of the cap that covers the bar */
      padding-left: calc(var(--early-ci-cap-inset, 20px) + 4px);
    }
    .fc-event.has-early-checkin-start .pickup-service-indicator {
      left: calc(var(--early-ci-cap-inset, 20px) + 6px);
    }
    .fc-event.has-early-checkin-start.has-pickup-service .event-title-chip {
      left: 24px;
      padding-left: calc(var(--early-ci-cap-inset, 20px) + 20px);
    }

    /* When a legend filter dims the booking bar, dim its caps to match
       (the caps are harness siblings of .fc-event, so .legend-dimmed on the
       bar doesn't reach them on its own). */
    .fc-timeline-event-harness > .fc-event.legend-dimmed ~ .late-checkout-end-marker,
    .fc-timeline-event-harness > .fc-event.legend-dimmed ~ .late-checkin-start-marker,
    .fc-timeline-event-harness > .fc-event.legend-dimmed ~ .early-checkin-start-marker,
    .fc-timeline-event-harness > .fc-event.legend-dimmed ~ .reservation-fee-start-marker,
    .fc-timeline-event-harness > .fc-event.legend-dimmed ~ .event-name-overlay {
      opacity: 0.45 !important;
    }
  `;
  
  document.head.appendChild(style);
}

// =============================================================================
// EXPORT FUNCTIONS FOR USE IN OTHER MODULES
// =============================================================================

// Make functions globally available
window.injectDragStyles = injectDragStyles;
