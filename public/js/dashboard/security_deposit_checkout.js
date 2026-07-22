/**
 * Security Deposit Checkout flow
 * Prompts staff to refund, deduct, or apply deposit to balance before checkout.
 */
(function () {
    let pendingCallbacks = { onComplete: null, onCancel: null };
    let modalInstance = null;
    let state = { depositAmount: 0, unpaidBalance: 0 };
    let depositStepResolved = false;

    function getModalEl() {
        return document.getElementById('securityDepositRefundModal');
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

    function formatCurrency(amount) {
        return '₱' + (parseFloat(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function showError(message) {
        const errorEl = document.getElementById('sdrErrorMsg');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    function hideError() {
        const errorEl = document.getElementById('sdrErrorMsg');
        if (errorEl) errorEl.style.display = 'none';
    }

    function setLoading(isLoading) {
        const btn = document.getElementById('sdrConfirmBtn');
        if (!btn) return;
        btn.disabled = isLoading;
        btn.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin me-1"></i>Processing...'
            : '<i class="fas fa-check me-1"></i>Confirm &amp; Continue Checkout';
    }

    function getSelectedAction() {
        const selected = document.querySelector('input[name="sdrAction"]:checked');
        return selected ? selected.value : 'full_refund';
    }

    function updateSelectedOption() {
        const modalEl = getModalEl();
        if (!modalEl) return;

        modalEl.querySelectorAll('.sdr-option').forEach((opt) => {
            opt.classList.remove('sdr-option-selected');
        });

        const checked = document.querySelector('input[name="sdrAction"]:checked');
        if (checked) {
            const parent = checked.closest('.sdr-option');
            if (parent) parent.classList.add('sdr-option-selected');
        }
    }

    function updatePreviews() {
        const action = getSelectedAction();
        const partialWrap = document.getElementById('sdrPartialWrap');
        const deductInput = document.getElementById('sdrDeductAmount');
        const applyRemainderWrap = document.getElementById('sdrApplyRemainderWrap');
        const applyRemainderChk = document.getElementById('sdrApplyRemainderToBalance');
        const partialAppliedRow = document.getElementById('sdrPartialAppliedRow');
        const partialAppliedPreview = document.getElementById('sdrPartialAppliedPreview');
        const partialPreview = document.getElementById('sdrPartialRefundPreview');

        if (partialWrap) {
            partialWrap.style.display = action === 'partial_deduct' ? 'block' : 'none';
        }

        if (applyRemainderWrap) {
            applyRemainderWrap.style.display =
                action === 'partial_deduct' && state.unpaidBalance > 0 ? 'block' : 'none';
        }

        updateSelectedOption();

        const deduction = parseAmountInput(deductInput?.value);
        const remainder = Math.max(0, state.depositAmount - deduction);
        const applyRemainder = !!(applyRemainderChk && applyRemainderChk.checked && state.unpaidBalance > 0);
        const appliedToBalance = applyRemainder ? Math.min(remainder, state.unpaidBalance) : 0;
        const cashRefund = Math.max(0, remainder - appliedToBalance);

        if (partialAppliedRow) {
            partialAppliedRow.style.display = applyRemainder && appliedToBalance > 0 ? 'block' : 'none';
        }
        if (partialAppliedPreview) {
            partialAppliedPreview.textContent = formatCurrency(appliedToBalance);
        }
        if (partialPreview) {
            partialPreview.textContent = formatCurrency(
                action === 'partial_deduct' ? cashRefund : state.depositAmount
            );
        }
    }

    function setupAmountInput() {
        const deductInput = document.getElementById('sdrDeductAmount');
        if (!deductInput || deductInput.dataset.formatted) return;
        deductInput.dataset.formatted = 'true';

        deductInput.addEventListener('input', function () {
            const cursorFromEnd = this.value.length - this.selectionStart;
            this.value = formatAmountInput(this.value);
            const newPos = Math.max(0, this.value.length - cursorFromEnd);
            this.setSelectionRange(newPos, newPos);
            updatePreviews();
        });

        deductInput.addEventListener('keypress', function (e) {
            const char = e.key;
            if (e.ctrlKey || e.metaKey || char.length !== 1) return;
            if (!/[\d.,]/.test(char)) e.preventDefault();
        });
    }

    async function fetchDepositInfo(bookingId) {
        const response = await fetch(`/dashboard/booking/security-deposit/${bookingId}`);
        const data = await response.json();
        if (data.success) return data.data;
        return { exists: false, amount: 0 };
    }

    async function fetchUnpaidBalance(bookingId) {
        const response = await fetch(`/booking/unpaid_balance/${bookingId}`);
        const data = await response.json();
        return parseFloat(data.total_unpaid_balance) || 0;
    }

    async function submitRefund(bookingId) {
        const action = getSelectedAction();
        const remarks = document.getElementById('sdrRemarks')?.value || '';
        const deductAmount = parseAmountInput(document.getElementById('sdrDeductAmount')?.value);
        const applyRemainderToBalance = document.getElementById('sdrApplyRemainderToBalance')?.checked || false;

        if (action === 'partial_deduct') {
            if (deductAmount <= 0) {
                showError('Please enter a deduction amount greater than 0.');
                return null;
            }
            if (deductAmount > state.depositAmount) {
                showError('Deduction cannot exceed the security deposit amount.');
                return null;
            }
        }

        setLoading(true);
        try {
            const response = await fetch('/dashboard/booking/refund-security-deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    BookingID: bookingId,
                    action,
                    deductAmount: action === 'partial_deduct' ? deductAmount : 0,
                    applyRemainderToBalance: action === 'partial_deduct' ? applyRemainderToBalance : false,
                    remarks
                })
            });
            const result = await response.json();
            setLoading(false);

            if (!result.success) {
                showError(result.message || 'Failed to process security deposit.');
                return null;
            }
            return result;
        } catch (err) {
            setLoading(false);
            showError('An error occurred while processing the security deposit.');
            return null;
        }
    }

    function resetForm() {
        hideError();
        const fullRadio = document.getElementById('sdrActionFull');
        if (fullRadio) fullRadio.checked = true;

        const deductInput = document.getElementById('sdrDeductAmount');
        const remarksInput = document.getElementById('sdrRemarks');
        const applyRemainderChk = document.getElementById('sdrApplyRemainderToBalance');
        if (deductInput) deductInput.value = '';
        if (remarksInput) remarksInput.value = '';
        if (applyRemainderChk) applyRemainderChk.checked = false;

        const partialWrap = document.getElementById('sdrPartialWrap');
        if (partialWrap) partialWrap.style.display = 'none';

        updatePreviews();
        updateSelectedOption();
    }

    function initModal() {
        const modalEl = getModalEl();
        if (!modalEl || modalEl.dataset.initialized) return;
        modalEl.dataset.initialized = 'true';

        setupAmountInput();

        document.querySelectorAll('input[name="sdrAction"]').forEach((radio) => {
            radio.addEventListener('change', updatePreviews);
        });

        document.getElementById('sdrApplyRemainderToBalance')?.addEventListener('change', updatePreviews);

        document.getElementById('sdrConfirmBtn')?.addEventListener('click', async function () {
            hideError();
            const bookingId = document.getElementById('sdrBookingId')?.value;
            const result = await submitRefund(bookingId);
            if (!result) return;

            depositStepResolved = true;
            modalInstance?.hide();
            if (typeof pendingCallbacks.onComplete === 'function') {
                pendingCallbacks.onComplete(result);
            }
            pendingCallbacks = { onComplete: null, onCancel: null };
        });

        modalEl.addEventListener('hidden.bs.modal', function () {
            if (depositStepResolved) {
                depositStepResolved = false;
                return;
            }
            if (pendingCallbacks.onCancel) {
                const onCancel = pendingCallbacks.onCancel;
                pendingCallbacks = { onComplete: null, onCancel: null };
                onCancel();
            }
        });
    }

    async function buildDepositQueue(bookingId, scope, fallbackRoomNumber) {
        const queue = [];
        let entries = [{ bookingId, roomNumber: fallbackRoomNumber || '' }];

        if (scope === 'group') {
            try {
                const response = await fetch(`/payments/group-breakdown/${bookingId}`);
                const data = await response.json();
                if (data.success && data.isGroup && Array.isArray(data.bookings) && data.bookings.length) {
                    entries = data.bookings.map((b) => ({
                        bookingId: b.BOOKING_ID || b.bookingId,
                        roomNumber: b.ROOM_NUMBER || b.roomNumber || ''
                    }));
                }
            } catch (err) {
                console.warn('Could not load group bookings for deposit checkout:', err);
            }
        }

        for (const entry of entries) {
            const depositInfo = await fetchDepositInfo(entry.bookingId);
            if (depositInfo.exists) {
                queue.push({
                    bookingId: entry.bookingId,
                    roomNumber: entry.roomNumber,
                    depositInfo
                });
            }
        }

        return queue;
    }

    function openDepositModal(bookingId, roomNumber, depositInfo, unpaidBalance, progressLabel) {
        return new Promise((resolve, reject) => {
            const modalEl = getModalEl();
            if (!modalEl) {
                resolve({ success: true, noDeposit: true });
                return;
            }

            initModal();
            depositStepResolved = false;
            pendingCallbacks = { onComplete: resolve, onCancel: reject };
            state = { depositAmount: depositInfo.amount, unpaidBalance };
            resetForm();

            document.getElementById('sdrBookingId').value = bookingId;
            const progressText = progressLabel ? ` (${progressLabel})` : '';
            document.getElementById('sdrRoomInfo').textContent = roomNumber
                ? `Room ${roomNumber}${progressText} — Process security deposit before checking out.`
                : `Process security deposit before checking out${progressText}.`;
            document.getElementById('sdrDepositAmount').textContent = formatCurrency(depositInfo.amount);

            const balanceInfo = document.getElementById('sdrBalanceInfo');
            const applyOption = document.querySelector('.sdr-apply-balance-option');
            if (unpaidBalance > 0) {
                balanceInfo.style.display = 'block';
                document.getElementById('sdrUnpaidBalance').textContent = formatCurrency(unpaidBalance);
                if (applyOption) applyOption.style.display = 'flex';
            } else {
                balanceInfo.style.display = 'none';
                if (applyOption) applyOption.style.display = 'none';
            }

            updatePreviews();
            modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
            modalInstance.show();
        });
    }

    /**
     * Begin security deposit checkout step. Skips modal if no held deposit.
     * @param {Object} options
     * @param {string|number} options.bookingId
     * @param {string} [options.roomNumber]
     * @param {string} [options.scope] - 'individual' or 'group'
     * @param {Function} options.onComplete - called with API result (includes remainingBalance)
     * @param {Function} options.onCancel - called when modal dismissed
     */
    async function begin(options) {
        const { bookingId, roomNumber, scope = 'individual', onComplete, onCancel } = options;

        const queue = await buildDepositQueue(bookingId, scope, roomNumber);
        const unpaidBalance = await fetchUnpaidBalance(bookingId);

        if (!queue.length) {
            if (typeof onComplete === 'function') {
                onComplete({
                    success: true,
                    noDeposit: true,
                    remainingBalance: unpaidBalance
                });
            }
            return;
        }

        if (!getModalEl()) {
            console.error('Security deposit refund modal not found on page.');
            if (typeof onComplete === 'function') {
                onComplete({ success: true, noDeposit: true, remainingBalance: unpaidBalance });
            }
            return;
        }

        try {
            let lastResult = null;
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                const itemBalance = await fetchUnpaidBalance(item.bookingId);
                const progressLabel = queue.length > 1 ? `${i + 1} of ${queue.length}` : '';
                lastResult = await openDepositModal(
                    item.bookingId,
                    item.roomNumber,
                    item.depositInfo,
                    itemBalance,
                    progressLabel
                );
            }

            const finalBalance = await fetchUnpaidBalance(bookingId);
            if (typeof onComplete === 'function') {
                onComplete({
                    ...(lastResult || {}),
                    remainingBalance: finalBalance,
                    processedCount: queue.length
                });
            }
        } catch (err) {
            if (typeof onCancel === 'function') onCancel();
        }
    }

    window.SecurityDepositCheckout = { begin };
})();
