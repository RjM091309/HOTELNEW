/**
 * Prevent Bootstrap modals from stealing focus while a SweetAlert is open.
 */
function guardSwalFocusTrap() {
    const handler = (event) => {
        if (event.target.closest('.swal2-container')) {
            event.stopImmediatePropagation();
        }
    };
    document.addEventListener('focusin', handler, true);
    return () => document.removeEventListener('focusin', handler, true);
}

function bindNumericAmountInput(input) {
    const sanitizeValue = (raw) => {
        let value = String(raw || '').replace(/[^\d.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        if (parts.length === 2 && parts[1].length > 2) {
            value = parts[0] + '.' + parts[1].slice(0, 2);
        }
        return value;
    };

    input.addEventListener('keydown', (event) => {
        const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (allowedKeys.includes(event.key)) return;
        if (event.key === 'Enter') return;
        if (event.ctrlKey || event.metaKey) return;

        if (!/^\d$/.test(event.key)) {
            if (event.key === '.' && !input.value.includes('.')) return;
            event.preventDefault();
        }
    });

    input.addEventListener('input', () => {
        const sanitized = sanitizeValue(input.value);
        if (sanitized !== input.value) {
            input.value = sanitized;
        }
    });

    input.addEventListener('paste', (event) => {
        event.preventDefault();
        const pasted = (event.clipboardData || window.clipboardData).getData('text');
        input.value = sanitizeValue(pasted);
    });
}

/**
 * Prompt user to choose FREE or custom AMOUNT for late check-out fee.
 * Resolves with numeric fee (0 for free). Rejects if cancelled.
 */
window.promptLateCheckoutFee = function promptLateCheckoutFee(options = {}) {
    const defaultAmount = Number.isFinite(Number(options.defaultAmount))
        ? Number(options.defaultAmount)
        : 2000;

    return new Promise((resolve, reject) => {
        if (typeof Swal === 'undefined') {
            resolve(defaultAmount);
            return;
        }

        let removeFocusGuard = null;

        const finish = (fee) => {
            if (removeFocusGuard) removeFocusGuard();
            Swal.close();
            resolve(fee);
        };

        const cancel = () => {
            if (removeFocusGuard) removeFocusGuard();
            reject(new Error('cancelled'));
        };

        Swal.fire({
            title: 'Late Check-Out',
            html: `
                <p class="late-checkout-fee-intro">Select how to apply the late check-out charge:</p>
                <div class="late-checkout-fee-actions">
                    <button type="button" id="swalLateCheckoutFree" class="late-checkout-fee-btn">FREE</button>
                    <button type="button" id="swalLateCheckoutAmount" class="late-checkout-fee-btn">AMOUNT</button>
                </div>
                <div id="swalLateCheckoutAmountField" class="late-checkout-fee-field" style="display:none;">
                    <label for="swalLateCheckoutFeeInput">Late Checkout Fee</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        id="swalLateCheckoutFeeInput"
                        class="swal2-input late-checkout-fee-input"
                        autocomplete="off"
                        value="${defaultAmount}"
                    >
                    <div id="swalLateCheckoutFeeError" class="late-checkout-fee-error" style="display:none;"></div>
                </div>
                <button type="button" id="swalLateCheckoutApply" class="late-checkout-fee-btn late-checkout-fee-apply" style="display:none;">Apply Amount</button>
            `,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: 'Cancel',
            allowOutsideClick: false,
            focusConfirm: false,
            returnFocus: false,
            customClass: {
                popup: 'late-checkout-fee-swal',
                container: 'late-checkout-fee-swal-container',
                cancelButton: 'late-checkout-fee-cancel-btn'
            },
            didOpen: (popup) => {
                removeFocusGuard = guardSwalFocusTrap();

                const freeBtn = popup.querySelector('#swalLateCheckoutFree');
                const amountBtn = popup.querySelector('#swalLateCheckoutAmount');
                const amountField = popup.querySelector('#swalLateCheckoutAmountField');
                const amountInput = popup.querySelector('#swalLateCheckoutFeeInput');
                const applyBtn = popup.querySelector('#swalLateCheckoutApply');
                const errorEl = popup.querySelector('#swalLateCheckoutFeeError');

                bindNumericAmountInput(amountInput);

                const focusAmountInput = () => {
                    window.setTimeout(() => {
                        amountInput.focus();
                        const len = amountInput.value.length;
                        amountInput.setSelectionRange(len, len);
                    }, 0);
                };

                const parseFee = () => {
                    const raw = String(amountInput.value || '').trim().replace(/,/g, '');
                    if (!raw) return NaN;
                    return parseFloat(raw);
                };

                const showError = (message) => {
                    errorEl.textContent = message;
                    errorEl.style.display = 'block';
                    focusAmountInput();
                };

                const applyAmount = () => {
                    const fee = parseFee();
                    if (!Number.isFinite(fee) || fee < 0) {
                        showError('Please enter a valid amount.');
                        return;
                    }
                    finish(fee);
                };

                freeBtn.addEventListener('click', () => finish(0));

                amountBtn.addEventListener('click', () => {
                    amountField.style.display = 'block';
                    applyBtn.style.display = 'block';
                    freeBtn.style.display = 'none';
                    amountBtn.style.display = 'none';
                    focusAmountInput();
                });

                applyBtn.addEventListener('click', applyAmount);

                amountInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyAmount();
                    }
                });

                amountInput.addEventListener('input', () => {
                    if (errorEl.style.display === 'block') {
                        errorEl.style.display = 'none';
                        errorEl.textContent = '';
                    }
                });
            },
            willClose: () => {
                if (removeFocusGuard) removeFocusGuard();
            }
        }).then((result) => {
            if (result.dismiss) {
                cancel();
            }
        });
    });
};

// Styles for readable input/caret inside SweetAlert (also above Bootstrap modals)
if (!document.getElementById('late-checkout-fee-styles')) {
    const style = document.createElement('style');
    style.id = 'late-checkout-fee-styles';
    style.textContent = `
        .late-checkout-fee-swal-container { z-index: 20000 !important; }
        .late-checkout-fee-swal { z-index: 20001 !important; }
        .late-checkout-fee-intro { margin-bottom: 14px; color: #333; }
        .late-checkout-fee-actions {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-bottom: 14px;
        }
        .late-checkout-fee-swal .late-checkout-fee-btn {
            background-color: #6f9c40 !important;
            background-image: none !important;
            border: 1px solid #6f9c40 !important;
            color: #ffffff !important;
            min-width: 120px;
            padding: 8px 20px;
            font-weight: 600;
            font-size: 14px;
            line-height: 1.4;
            border-radius: 4px;
            cursor: pointer;
            box-shadow: none !important;
        }
        .late-checkout-fee-swal .late-checkout-fee-btn:hover,
        .late-checkout-fee-swal .late-checkout-fee-btn:focus {
            background-color: #5a7a33 !important;
            background-image: none !important;
            border-color: #5a7a33 !important;
            color: #ffffff !important;
            outline: none;
        }
        .late-checkout-fee-swal .swal2-cancel.late-checkout-fee-cancel-btn {
            background-color: #6c757d !important;
            background-image: none !important;
            border: 1px solid #6c757d !important;
            color: #ffffff !important;
            box-shadow: none !important;
        }
        .late-checkout-fee-swal .swal2-cancel.late-checkout-fee-cancel-btn:hover,
        .late-checkout-fee-swal .swal2-cancel.late-checkout-fee-cancel-btn:focus {
            background-color: #5a6268 !important;
            background-image: none !important;
            border-color: #5a6268 !important;
            color: #ffffff !important;
        }
        .late-checkout-fee-field { text-align: left; margin-top: 4px; }
        .late-checkout-fee-field label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: #333;
        }
        .late-checkout-fee-input,
        .late-checkout-fee-swal .swal2-input {
            width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            color: #212529 !important;
            background-color: #ffffff !important;
            caret-color: #212529 !important;
            border: 1px solid #ced4da !important;
            border-radius: 4px !important;
            padding: 8px 10px !important;
            font-size: 16px !important;
            line-height: 1.4 !important;
            -webkit-text-fill-color: #212529 !important;
            -moz-appearance: textfield;
        }
        .late-checkout-fee-input::-webkit-outer-spin-button,
        .late-checkout-fee-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .late-checkout-fee-input:focus,
        .late-checkout-fee-swal .swal2-input:focus {
            outline: none !important;
            border-color: #6f9c40 !important;
            box-shadow: 0 0 0 0.2rem rgba(111, 156, 64, 0.25) !important;
        }
        .late-checkout-fee-error {
            color: #dc3545;
            font-size: 13px;
            margin-top: 6px;
        }
        .late-checkout-fee-apply {
            margin-top: 12px;
            width: 100%;
        }
    `;
    document.head.appendChild(style);
}
