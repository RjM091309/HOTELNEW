(function () {
  function escapeMaintenancePopupText(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureMaintenancePopupCss() {
    if (document.getElementById('maintenance-popup-css')) return;
    const style = document.createElement('style');
    style.id = 'maintenance-popup-css';
    style.textContent = `
    .maintenance-swal-popup {
      border-radius: 8px !important;
      padding: 0 !important;
      overflow: hidden;
      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
      border: 1px solid #dee2e6 !important;
    }
    .maintenance-swal-popup .swal2-title {
      display: none !important;
    }
    .maintenance-swal-popup .swal2-html-container {
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
    }
    .maintenance-swal-popup .swal2-actions {
      margin: 0 !important;
      padding: 0 16px 16px !important;
      gap: 8px !important;
      justify-content: flex-end !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .maintenance-swal-popup .swal2-styled.swal2-confirm {
      background: #212529 !important;
      border: 1px solid #212529 !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 6px 20px !important;
      box-shadow: none !important;
      min-width: 72px;
    }
    .maintenance-swal-popup .swal2-styled.swal2-confirm:hover {
      background: #343a40 !important;
      border-color: #343a40 !important;
    }
    .maintenance-swal-popup .swal2-styled.swal2-cancel {
      background: #ffffff !important;
      color: #495057 !important;
      border: 1px solid #ced4da !important;
      border-radius: 4px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 6px 20px !important;
      box-shadow: none !important;
      min-width: 72px;
    }
    .maintenance-swal-popup .swal2-styled.swal2-cancel:hover {
      background: #f8f9fa !important;
    }
    .maintenance-swal-body {
      padding: 14px 16px 12px;
      background: #ffffff;
      color: #495057;
    }
    .maintenance-swal-titlebar {
      background: linear-gradient(135deg, #212529 0%, #343a40 100%);
      color: #ffffff;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 15px;
      border-bottom: 1px solid #1a1d20;
    }
    .maintenance-swal-titlebar i {
      font-size: 14px;
      opacity: 0.95;
    }
    .maintenance-swal-summary {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 12px 14px;
      margin-bottom: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .maintenance-swal-field-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.45px;
      color: #6c757d;
      font-weight: 600;
      margin-bottom: 4px;
      text-align: center;
    }
    .maintenance-swal-room-no {
      font-size: 1.35rem;
      font-weight: 700;
      color: #212529;
      line-height: 1.2;
      margin-bottom: 12px;
      text-align: center;
    }
    .maintenance-swal-schedule-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex-wrap: nowrap;
      width: 100%;
    }
    .maintenance-swal-date-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      flex: 1 1 0;
      min-width: 0;
      max-width: 140px;
      background: #ffffff;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 7px 10px;
      font-size: 13px;
      font-weight: 600;
      color: #495057;
      text-align: center;
      white-space: nowrap;
    }
    .maintenance-swal-date-chip i {
      color: #6c757d;
      font-size: 11px;
    }
    .maintenance-swal-arrow {
      color: #adb5bd;
      font-size: 12px;
      font-weight: 700;
      flex: 0 0 auto;
      line-height: 1;
      padding-top: 1px;
    }
    .maintenance-swal-reason-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.35px;
      color: #6c757d;
      margin-bottom: 6px;
    }
    .maintenance-swal-reason-input {
      width: 100%;
      border: 1px solid #ced4da !important;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 13px;
      color: #495057 !important;
      background: #ffffff !important;
      resize: vertical;
      min-height: 72px;
      box-sizing: border-box;
      pointer-events: auto !important;
      cursor: text !important;
      caret-color: #212529 !important;
      -webkit-user-select: text !important;
      user-select: text !important;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .maintenance-swal-reason-input:focus {
      outline: none;
      border-color: #80bdff;
      box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.15);
    }
    .maintenance-swal-note {
      margin-top: 8px;
      font-size: 11px;
      color: #6c757d;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .maintenance-swal-note i {
      color: #212529;
    }
    .maintenance-swal-host {
      z-index: 1090 !important;
    }
    .maintenance-swal-host .swal2-popup {
      pointer-events: auto !important;
    }
    .maintenance-swal-host .swal2-html-container,
    .maintenance-swal-host .maintenance-swal-body,
    .maintenance-swal-host textarea {
      pointer-events: auto !important;
    }
  `;
    document.head.appendChild(style);
  }

  /**
   * Shows the Set Maintenance popup.
   * @returns {Promise<string|null>} reason text, or null if cancelled
   */
  async function showMaintenanceSchedulePopup({ roomNo, checkIn, checkOut, parentModalEl = null }) {
    if (typeof Swal === 'undefined') {
      const reason = prompt(`Room ${roomNo}\nSchedule: ${checkIn} - ${checkOut}\n\nEnter maintenance reason:`);
      if (reason === null) return null;
      return reason;
    }

    ensureMaintenancePopupCss();

    let parentModalInstance = null;

    const popupResult = await Swal.fire({
      title: 'Set Maintenance',
      width: 520,
      padding: 0,
      background: '#ffffff',
      returnFocus: false,
      stopKeydownPropagation: false,
      allowEnterKey: true,
      customClass: {
        popup: 'maintenance-swal-popup',
        container: 'maintenance-swal-host'
      },
      html: `
      <div class="maintenance-swal-titlebar">
        <i class="fas fa-tools"></i>
        <span>Set Maintenance</span>
      </div>
      <div class="maintenance-swal-body">
        <div class="maintenance-swal-summary">
          <div class="maintenance-swal-field-label">Room No.</div>
          <div class="maintenance-swal-room-no">${escapeMaintenancePopupText(roomNo)}</div>
          <div class="maintenance-swal-field-label">Schedule Duration</div>
          <div class="maintenance-swal-schedule-row">
            <span class="maintenance-swal-date-chip">
              <i class="fas fa-sign-in-alt"></i>${escapeMaintenancePopupText(checkIn)}
            </span>
            <span class="maintenance-swal-arrow">→</span>
            <span class="maintenance-swal-date-chip">
              <i class="fas fa-sign-out-alt"></i>${escapeMaintenancePopupText(checkOut)}
            </span>
          </div>
        </div>
        <label for="maintenance-reason-input" class="maintenance-swal-reason-label">Reason</label>
        <textarea id="maintenance-reason-input" class="maintenance-swal-reason-input" rows="3" placeholder="Optional..."></textarea>
        <div class="maintenance-swal-note">
          <i class="fas fa-info-circle"></i>
          <span>Room ${escapeMaintenancePopupText(roomNo)} under maintenance.</span>
        </div>
      </div>
    `,
      showCancelButton: true,
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusConfirm: false,
      didOpen: () => {
        if (parentModalEl && window.bootstrap?.Modal) {
          parentModalInstance = bootstrap.Modal.getInstance(parentModalEl);
          if (parentModalInstance?._focustrap?.deactivate) {
            parentModalInstance._focustrap.deactivate();
          }
        }

        const container = Swal.getContainer?.();
        if (container) {
          container.style.zIndex = '1090';
        }

        const input = document.getElementById('maintenance-reason-input');
        if (input) {
          input.removeAttribute('readonly');
          input.removeAttribute('disabled');
          input.style.pointerEvents = 'auto';
          input.style.backgroundColor = '#ffffff';
          input.style.color = '#495057';
          input.style.cursor = 'text';
          input.style.caretColor = '#212529';
          setTimeout(() => input.focus(), 50);
        }
      },
      willClose: () => {
        if (parentModalInstance?._focustrap?.activate) {
          parentModalInstance._focustrap.activate();
        }
      },
      preConfirm: () => document.getElementById('maintenance-reason-input')?.value?.trim() || ''
    });

    if (!popupResult.isConfirmed) return null;
    return popupResult.value || '';
  }

  window.showMaintenanceSchedulePopup = showMaintenanceSchedulePopup;
})();
