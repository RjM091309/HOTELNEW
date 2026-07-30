/**
 * Security Deposit section embedded inside the Payment Modal (#modal-payment).
 * Used by the dashboard "Today Check-out" toggle so staff handle the deposit
 * and the outstanding balance in a single modal instead of two separate popups.
 */
(function () {
    let state = { depositAmount: 0, unpaidBalance: 0 };

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

    function getSection() {
        return document.getElementById('pdepDepositSection');
    }

    function showError(message) {
        const el = document.getElementById('pdepErrorMsg');
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
        }
    }

    function hideError() {
        const el = document.getElementById('pdepErrorMsg');
        if (el) el.style.display = 'none';
    }

    function getSelectedAction() {
        const selected = document.querySelector('input[name="pdepAction"]:checked');
        return selected ? selected.value : 'full_refund';
    }

    function updateSelectedOption() {
        const section = getSection();
        if (!section) return;
        section.querySelectorAll('.pdep-option').forEach((opt) => opt.classList.remove('pdep-option-selected'));
        const checked = document.querySelector('input[name="pdepAction"]:checked');
        if (checked) {
            const parent = checked.closest('.pdep-option');
            if (parent) parent.classList.add('pdep-option-selected');
        }
    }

    // How much of the deposit action would apply to the outstanding balance,
    // for the currently selected radio (full refund / partial-deduct+checkbox / apply-to-balance).
    function computeAppliedToBalance(action) {
        if (state.unpaidBalance <= 0) return 0;
        if (action === 'apply_to_balance') {
            return Math.min(state.depositAmount, state.unpaidBalance);
        }
        if (action === 'partial_deduct') {
            const deductInput = document.getElementById('pdepDeductAmount');
            const applyRemainderChk = document.getElementById('pdepApplyRemainderToBalance');
            const deduction = parseAmountInput(deductInput?.value);
            const remainder = Math.max(0, state.depositAmount - deduction);
            const applyRemainder = !!(applyRemainderChk && applyRemainderChk.checked);
            return applyRemainder ? Math.min(remainder, state.unpaidBalance) : 0;
        }
        return 0; // full_refund - nothing applied to balance
    }

    // Reflect the currently selected deposit action in the Payment Summary card above
    // (Total Amount to Pay / Amount to Pay input), so staff see the reduced amount
    // to collect immediately instead of the original outstanding balance.
    function reflectAppliedToSummary() {
        const totalAmountEl = document.getElementById('paymentTotalAmount');
        const amountInput = document.getElementById('paymentAmountInput');
        const appliedToBalance = computeAppliedToBalance(getSelectedAction());
        const effectiveAmount = Math.max(0, state.unpaidBalance - appliedToBalance);

        if (totalAmountEl) {
            totalAmountEl.textContent = effectiveAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        }
        if (amountInput) {
            amountInput.value = effectiveAmount;
        }

        syncPaymentModalState(effectiveAmount);
    }

    function syncPaymentModalState(effectiveAmount) {
        const paymentModalEl = document.getElementById('modal-payment');
        const confirmBtn = document.getElementById('confirmPaymentButton');
        const confirmBtnText = confirmBtn?.querySelector('.btn-text');
        if (!paymentModalEl || !isVisible()) return;

        const amountToPay = typeof effectiveAmount === 'number'
            ? effectiveAmount
            : Math.max(0, state.unpaidBalance - computeAppliedToBalance(getSelectedAction()));
        const skipPayment = amountToPay <= 0;

        paymentModalEl.dataset.skipPaymentStep = skipPayment ? 'true' : 'false';
        $(paymentModalEl).find('.payment-amount-group, .payment-method-group, .payment-details-section').toggle(!skipPayment);

        if (confirmBtnText) {
            confirmBtnText.textContent = skipPayment ? 'Confirm & Check Out' : 'Confirm Payment';
        }

        if (!confirmBtn) return;

        if (skipPayment) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('btn-secondary');
            confirmBtn.classList.add('btn-success');
            return;
        }

        const amountInput = document.getElementById('paymentAmountInput');
        if (amountInput) {
            amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function updatePreviews() {
        const action = getSelectedAction();
        const partialWrap = document.getElementById('pdepPartialWrap');
        const deductInput = document.getElementById('pdepDeductAmount');
        const applyRemainderWrap = document.getElementById('pdepApplyRemainderWrap');
        const applyRemainderChk = document.getElementById('pdepApplyRemainderToBalance');
        const partialAppliedRow = document.getElementById('pdepPartialAppliedRow');
        const partialAppliedPreview = document.getElementById('pdepPartialAppliedPreview');
        const partialPreview = document.getElementById('pdepPartialRefundPreview');

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
        const appliedToBalance = computeAppliedToBalance(action);
        const cashRefund = Math.max(0, remainder - appliedToBalance);

        if (partialAppliedRow) {
            partialAppliedRow.style.display = action === 'partial_deduct' && appliedToBalance > 0 ? 'block' : 'none';
        }
        if (partialAppliedPreview) {
            partialAppliedPreview.textContent = formatCurrency(appliedToBalance);
        }
        if (partialPreview) {
            partialPreview.textContent = formatCurrency(
                action === 'partial_deduct' ? cashRefund : state.depositAmount
            );
        }

        reflectAppliedToSummary();
    }

    function setupAmountInput() {
        const deductInput = document.getElementById('pdepDeductAmount');
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

    function initListeners() {
        const section = getSection();
        if (!section || section.dataset.initialized) return;
        section.dataset.initialized = 'true';

        setupAmountInput();

        section.querySelectorAll('input[name="pdepAction"]').forEach((radio) => {
            radio.addEventListener('change', updatePreviews);
        });

        document.getElementById('pdepApplyRemainderToBalance')?.addEventListener('change', updatePreviews);
    }

    function resetForm() {
        hideError();
        const fullRadio = document.getElementById('pdepActionFull');
        if (fullRadio) fullRadio.checked = true;

        const deductInput = document.getElementById('pdepDeductAmount');
        const remarksInput = document.getElementById('pdepRemarks');
        const applyRemainderChk = document.getElementById('pdepApplyRemainderToBalance');
        if (deductInput) deductInput.value = '';
        if (remarksInput) remarksInput.value = '';
        if (applyRemainderChk) applyRemainderChk.checked = false;

        const partialWrap = document.getElementById('pdepPartialWrap');
        if (partialWrap) partialWrap.style.display = 'none';
    }

    /**
     * Show and populate the deposit section for a booking that has a held deposit.
     * @param {Object} options
     * @param {string|number} options.bookingId
     * @param {string} [options.roomNumber]
     * @param {Object} options.depositInfo - { amount }
     * @param {number} options.unpaidBalance
     */
    function configure({ bookingId, roomNumber, depositInfo, unpaidBalance }) {
        const section = getSection();
        if (!section) return;

        initListeners();
        state = { depositAmount: depositInfo.amount, unpaidBalance };
        resetForm();

        document.getElementById('pdepBookingId').value = bookingId;
        document.getElementById('pdepRoomInfo').textContent = roomNumber
            ? `Room ${roomNumber} — Process security deposit before checking out.`
            : 'Process security deposit before checking out.';
        document.getElementById('pdepDepositAmount').textContent = formatCurrency(depositInfo.amount);

        const applyOption = document.getElementById('pdepOptionApply');
        if (applyOption) applyOption.style.display = unpaidBalance > 0 ? 'flex' : 'none';

        updatePreviews();
        section.style.display = 'block';
        syncPaymentModalState(Math.max(0, unpaidBalance));
    }

    function hide() {
        const section = getSection();
        if (section) section.style.display = 'none';
    }

    function isVisible() {
        const section = getSection();
        return !!section && section.style.display !== 'none';
    }

    async function submit(bookingId) {
        hideError();
        const action = getSelectedAction();
        const remarks = document.getElementById('pdepRemarks')?.value || '';
        const deductAmount = parseAmountInput(document.getElementById('pdepDeductAmount')?.value);
        const applyRemainderToBalance = document.getElementById('pdepApplyRemainderToBalance')?.checked || false;

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
            if (!result.success) {
                showError(result.message || 'Failed to process security deposit.');
                return null;
            }
            return result;
        } catch (err) {
            showError('An error occurred while processing the security deposit.');
            return null;
        }
    }

    window.PaymentDepositSection = { configure, hide, isVisible, submit, reflectAppliedToSummary, syncPaymentModalState };
})();
