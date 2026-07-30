/**
 * Security Deposit Check-In flow
 * Opens a modal to collect and record security deposit before checking in a guest.
 */
(function () {
    let pendingCallbacks = { onSuccess: null, onCancel: null };
    let modalInstance = null;

    function getModalEl() {
        return document.getElementById('securityDepositModal');
    }

    function parseAmountInput(value) {
        const cleaned = String(value || '').replace(/,/g, '').replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        const normalized = parts.length > 1
            ? parts[0] + '.' + parts.slice(1).join('').slice(0, 2)
            : parts[0];
        return parseFloat(normalized) || 0;
    }

    function formatAmountInput(value) {
        let cleaned = String(value || '').replace(/,/g, '').replace(/[^\d.]/g, '');
        const parts = cleaned.split('.');
        if (parts.length > 2) {
            cleaned = parts[0] + '.' + parts.slice(1).join('');
        }

        const [intPart = '', decPart] = cleaned.split('.');
        const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (decPart !== undefined) {
            return `${formattedInt}.${decPart.slice(0, 2)}`;
        }
        return formattedInt;
    }

    function setupAmountInput() {
        const modalEl = getModalEl();
        if (!modalEl) return;
        const amountInput = modalEl.querySelector('#sdDepositAmount');
        if (!amountInput || amountInput.dataset.formatted) return;
        amountInput.dataset.formatted = 'true';

        amountInput.addEventListener('input', function () {
            const cursorFromEnd = this.value.length - this.selectionStart;
            this.value = formatAmountInput(this.value);
            const newPos = Math.max(0, this.value.length - cursorFromEnd);
            this.setSelectionRange(newPos, newPos);
        });

        amountInput.addEventListener('keypress', function (e) {
            const char = e.key;
            if (e.ctrlKey || e.metaKey || char.length !== 1) return;
            if (!/[\d.,]/.test(char)) {
                e.preventDefault();
            }
        });

        amountInput.addEventListener('paste', function (e) {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData).getData('text');
            this.value = formatAmountInput(pasted);
        });
    }

    function formatCurrency(amount) {
        return '₱' + (parseFloat(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function showError(message) {
        const errorEl = document.getElementById('sdErrorMsg');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    function hideError() {
        const errorEl = document.getElementById('sdErrorMsg');
        if (errorEl) errorEl.style.display = 'none';
    }

    function setLoading(isLoading) {
        const btn = document.getElementById('sdConfirmBtn');
        if (!btn) return;
        btn.disabled = isLoading;
        btn.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin me-1"></i>Processing...'
            : '<i class="fas fa-check me-1"></i><span id="sdConfirmBtnText">' + (btn.dataset.label || 'Record Deposit & Check In') + '</span>';
    }

    function resetForm() {
        hideError();
        const modalEl = getModalEl();
        if (!modalEl) return;

        const amountInput = modalEl.querySelector('#sdDepositAmount');
        const remarksInput = modalEl.querySelector('#sdRemarks');
        const methodInput = modalEl.querySelector('#sdPaymentMethod');
        if (amountInput) amountInput.value = '';
        if (remarksInput) remarksInput.value = '';
        if (methodInput) methodInput.value = 'cash';
    }

    async function fetchExistingDeposit(bookingId) {
        const response = await fetch(`/dashboard/booking/security-deposit/${bookingId}`);
        const data = await response.json();
        if (data.success) return data.data;
        return { exists: false, amount: 0 };
    }

    async function submitCheckIn(bookingId, depositInfo) {
        const payload = { BookingID: bookingId };

        if (!depositInfo.exists) {
            const amount = parseAmountInput(document.getElementById('sdDepositAmount')?.value);
            const paymentMethod = document.getElementById('sdPaymentMethod')?.value || 'cash';
            const remarks = document.getElementById('sdRemarks')?.value || '';

            if (amount > 0) {
                payload.depositAmount = amount;
                payload.paymentMethod = paymentMethod;
                payload.remarks = remarks;
            }
        }

        setLoading(true);
        try {
            const response = await fetch('/dashboard/booking/check-in-with-deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            setLoading(false);

            if (!result.success) {
                showError(result.message || 'Failed to check in guest.');
                return null;
            }
            return result;
        } catch (err) {
            setLoading(false);
            showError('An error occurred while processing check-in.');
            return null;
        }
    }

    function initModal() {
        const modalEl = getModalEl();
        if (!modalEl || modalEl.dataset.initialized) return;
        modalEl.dataset.initialized = 'true';

        setupAmountInput();

        document.getElementById('sdConfirmBtn')?.addEventListener('click', async function () {
            hideError();
            const bookingId = document.getElementById('sdBookingId')?.value;
            const depositExists = this.dataset.depositExists === 'true';

            const result = await submitCheckIn(bookingId, { exists: depositExists });
            if (!result) return;

            modalInstance?.hide();
            if (typeof pendingCallbacks.onSuccess === 'function') {
                pendingCallbacks.onSuccess(result);
            }
            pendingCallbacks = { onSuccess: null, onCancel: null };
        });

        modalEl.addEventListener('hidden.bs.modal', function () {
            if (pendingCallbacks.onCancel) {
                const onCancel = pendingCallbacks.onCancel;
                pendingCallbacks = { onSuccess: null, onCancel: null };
                onCancel();
            }
        });
    }

    /**
     * Open security deposit check-in modal
     * @param {Object} options
     * @param {string|number} options.bookingId
     * @param {string} options.roomNumber
     * @param {Function} options.onSuccess - called with API response
     * @param {Function} options.onCancel - called when modal is dismissed
     */
    async function open(options) {
        const { bookingId, roomNumber, onSuccess, onCancel } = options;
        initModal();

        const modalEl = getModalEl();
        if (!modalEl) {
            console.error('Security deposit modal not found on page.');
            return;
        }

        pendingCallbacks = { onSuccess, onCancel };
        resetForm();

        document.getElementById('sdBookingId').value = bookingId;
        document.getElementById('sdRoomInfo').textContent =
            `Room ${roomNumber} — Collect security deposit before checking in the guest.`;

        const depositInfo = await fetchExistingDeposit(bookingId);
        const existingAlert = document.getElementById('sdExistingDepositAlert');
        const depositForm = document.getElementById('sdDepositForm');
        const confirmBtn = document.getElementById('sdConfirmBtn');

        if (depositInfo.exists) {
            existingAlert.style.display = 'block';
            document.getElementById('sdExistingAmount').textContent = formatCurrency(depositInfo.amount);
            depositForm.style.display = 'none';
            confirmBtn.dataset.depositExists = 'true';
            confirmBtn.dataset.label = 'Check In Guest';
            confirmBtn.innerHTML = '<i class="fas fa-check me-1"></i>Check In Guest';
        } else {
            existingAlert.style.display = 'none';
            depositForm.style.display = 'block';
            confirmBtn.dataset.depositExists = 'false';
            confirmBtn.dataset.label = 'Record Deposit & Check In';
            confirmBtn.innerHTML = '<i class="fas fa-check me-1"></i>Record Deposit & Check In';
        }

        modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        modalInstance.show();
    }

    window.SecurityDepositCheckIn = { open };
})();
