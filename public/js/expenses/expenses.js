// ========================================
// EXPENSES MANAGEMENT SYSTEM
// Columns: Date of Expense | Company Name | Details of Expense | SI No. | Amount
//          | Encoded By | Encoded Date | Action
// ========================================

let currentExpenseId = null;
let expensesDataTable = null;
let newDateFp = null;
let editDateFp = null;

const COL_AMOUNT = 4;
const COL_ENCODED_DATE = 6;
const COL_ACTION = 7;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function () {
    initializeDataTable();
    loadExpensesData();
    initializeEventListeners();
    initDatePickers();
});

// flatpickr for the Date of Expense fields. Opens on click anywhere in the
// field (not just an icon), stores Y-m-d for the backend, shows "Sep 7, 2026".
function initDatePickers() {
    if (typeof flatpickr === 'undefined') return;

    const commonOpts = {
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        allowInput: false,
        disableMobile: true,
        monthSelectorType: 'static'
    };

    const newEl = document.getElementById('expenseDate');
    if (newEl && !newDateFp) newDateFp = flatpickr(newEl, commonOpts);

    const editEl = document.getElementById('edit-expense-date');
    if (editEl && !editDateFp) editDateFp = flatpickr(editEl, commonOpts);
}

// ========================================
// DATA LOADING
// ========================================

function loadExpensesData() {
    $.ajax({
        url: '/expenses/data',
        type: 'GET',
        dataType: 'json',
        success: function (data) {
            if (data.success) {
                populateTableWithData(data.expenses);
            } else {
                showError(data.message || 'Failed to load expenses data.');
            }
        },
        error: function () {
            showError('Failed to load expenses data.');
        }
    });
}

function buildRowData(expense) {
    return [
        formatDateOnly(expense.EXPENSE_DATE),
        escapeHtml(expense.COMPANY_NAME || '-'),
        escapeHtml(expense.Description || ''),
        escapeHtml(expense.ReceiptNo || '-'),
        formatNumber(expense.Amount),
        escapeHtml(expense.ENCODED_BY || ''),
        formatDateTime(expense.ENCODED_DT),
        createActionButtons(expense.IDNo)
    ];
}

function populateTableWithData(expenses) {
    if (!expensesDataTable) return;

    expensesDataTable.clear();

    expenses.forEach(expense => {
        const newRow = expensesDataTable.row.add(buildRowData(expense));
        newRow.node().setAttribute('data-id', expense.IDNo);
    });

    expensesDataTable.draw();
    updateGrandTotal();
}

// ========================================
// EVENT LISTENERS
// ========================================

function initializeEventListeners() {
    document.addEventListener('click', function (event) {
        if (event.target.closest('.delete-link')) {
            event.preventDefault();
            const expenseId = event.target.closest('.delete-link').getAttribute('data-id');
            confirmDeleteExpense(expenseId);
        }
    });

    const exportBtn = document.getElementById('exportToExcel');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }

    const newExpenseForm = document.getElementById('new-expense-form');
    if (newExpenseForm) {
        newExpenseForm.addEventListener('submit', handleNewExpenseSubmit);
    }

    const editExpenseForm = document.getElementById('edit-expense-form');
    if (editExpenseForm) {
        editExpenseForm.addEventListener('submit', handleEditExpenseSubmit);
    }

    $('#new-expense-modal').on('hidden.bs.modal', () => {
        document.getElementById('new-expense-form')?.reset();
        if (newDateFp) newDateFp.clear();
    });

    $('#edit-expense-modal').on('hidden.bs.modal', () => {
        document.getElementById('edit-expense-form')?.reset();
        if (editDateFp) editDateFp.clear();
        currentExpenseId = null;
    });

    $('#new-expense-modal').on('shown.bs.modal', function () {
        // Default the date to today when opening a fresh form
        if (newDateFp && !newDateFp.selectedDates.length) {
            newDateFp.setDate(new Date(), true);
        }
        upgradeMdl();
    });

    $('#edit-expense-modal').on('shown.bs.modal', function () {
        upgradeMdl();
        document.querySelectorAll('#edit-expense-modal .mdl-textfield').forEach(function (tf) {
            const input = tf.querySelector('.mdl-textfield__input');
            if (input && input.value) {
                tf.classList.add('is-dirty');
                tf.classList.remove('is-focused');
            }
        });
    });
}

function upgradeMdl() {
    setTimeout(() => {
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
        if (window.originalComponentHandler) {
            window.originalComponentHandler.upgradeElements(document.querySelectorAll('.mdl-textfield'));
        }
    }, 200);
}

// ========================================
// CRUD OPERATIONS
// ========================================

function confirmDeleteExpense(expenseId) {
    Swal.fire({
        title: 'Are you sure?',
        text: 'This action cannot be undone!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            deleteExpense(expenseId);
        }
    });
}

function deleteExpense(expenseId) {
    $.ajax({
        url: `/expenses/delete/${expenseId}`,
        type: 'DELETE',
        dataType: 'json',
        success: function (data) {
            if (data.message === 'Expense deleted successfully') {
                const row = expensesDataTable.row(`[data-id="${expenseId}"]`);
                if (row.length) {
                    row.remove().draw();
                    updateGrandTotal();
                }
                showSuccess('Expense deleted successfully!');
            } else {
                showError(data.error || 'Error deleting expense.');
            }
        },
        error: function () {
            showError('Something went wrong while deleting the expense.');
        }
    });
}

function editExpense(expenseId) {
    $.ajax({
        url: `/expenses/edit_expense?id=${expenseId}`,
        type: 'GET',
        dataType: 'json',
        success: function (data) {
            if (data.expense) {
                populateEditForm(data.expense);
                $('#edit-expense-modal').modal('show');
            } else {
                showError('Expense not found.');
            }
        },
        error: function () {
            showError('Failed to fetch expense details.');
        }
    });
}

function populateEditForm(expense) {
    document.getElementById('edit-expense-id').value = expense.IDNo;
    const isoDate = toDateInputValue(expense.EXPENSE_DATE);
    if (editDateFp) {
        editDateFp.setDate(isoDate || null, true);
    } else {
        document.getElementById('edit-expense-date').value = isoDate;
    }
    document.getElementById('edit-expense-company').value = expense.COMPANY_NAME || '';
    document.getElementById('edit-expense-sino').value = expense.ReceiptNo || '';
    document.getElementById('edit-expense-details').value = expense.Description || '';
    document.getElementById('edit-expense-amount').value = expense.Amount;

    currentExpenseId = expense.IDNo;
}

function collectFormData(prefix) {
    return {
        expenseDate: document.getElementById(prefix.date).value || null,
        companyName: document.getElementById(prefix.company).value.trim(),
        siNo: document.getElementById(prefix.sino).value.trim(),
        details: document.getElementById(prefix.details).value.trim(),
        amount: document.getElementById(prefix.amount).value
    };
}

function handleNewExpenseSubmit(event) {
    event.preventDefault();
    const expenseData = collectFormData({
        date: 'expenseDate', company: 'expenseCompany', sino: 'expenseSiNo',
        details: 'expenseDetails', amount: 'expenseAmount'
    });

    if (validateExpenseData(expenseData)) {
        submitExpense('/expenses/add', expenseData, 'Expense added successfully!');
    }
}

function handleEditExpenseSubmit(event) {
    event.preventDefault();
    const expenseData = collectFormData({
        date: 'edit-expense-date', company: 'edit-expense-company', sino: 'edit-expense-sino',
        details: 'edit-expense-details', amount: 'edit-expense-amount'
    });

    if (!currentExpenseId) {
        showError('No expense selected for editing.');
        return;
    }

    if (validateExpenseData(expenseData)) {
        submitExpense(`/expenses/edit_expense/${currentExpenseId}`, expenseData, 'Expense updated successfully!');
    }
}

function validateExpenseData(data) {
    if (!data.details || !data.amount) {
        showError('Please fill in the Details of Expense and Amount.');
        return false;
    }
    if (isNaN(data.amount) || parseFloat(data.amount) <= 0) {
        showError('Please enter a valid amount greater than 0.');
        return false;
    }
    return true;
}

function submitExpense(url, expenseData, successMessage) {
    $.ajax({
        url: url,
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify(expenseData),
        success: function (data) {
            if (data.success) {
                if (data.expense) {
                    if (url.includes('/add')) {
                        addExpenseToTable(data.expense);
                    } else {
                        updateExpenseInTable(data.expense);
                    }
                }
                $(url.includes('/add') ? '#new-expense-modal' : '#edit-expense-modal').modal('hide');
                showSuccess(successMessage);
            } else {
                showError(data.message || 'Operation failed.');
            }
        },
        error: function () {
            showError('Something went wrong.');
        }
    });
}

// ========================================
// DATATABLE OPERATIONS
// ========================================

function addExpenseToTable(expense) {
    if (!expensesDataTable) return;
    const newRow = expensesDataTable.row.add(buildRowData(expense)).draw();
    newRow.node().setAttribute('data-id', expense.IDNo);
    updateGrandTotal();
}

function updateExpenseInTable(expense) {
    if (!expensesDataTable) return;

    const rows = expensesDataTable.rows().nodes();
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-id') === expense.IDNo.toString()) {
            rowIndex = i;
            break;
        }
    }

    if (rowIndex !== -1) {
        expensesDataTable.row(rowIndex).data(buildRowData(expense)).draw();
        updateGrandTotal();
    }
}

function createActionButtons(expenseId) {
    return `
        <div style="text-align: center;">
            <span class="label label-sm label-warning ms-1" onclick="editExpense('${expenseId}')" title="Edit Expense" style="cursor:pointer; margin:0 2px; display:inline-block;">
                <i class="fa fa-pencil"></i>
            </span>
            <span class="label label-sm label-danger ms-1 delete-link" data-id="${expenseId}" title="Delete Expense" style="cursor:pointer; margin:0 2px; display:inline-block;">
                <i class="fa fa-trash-o"></i>
            </span>
        </div>
    `;
}

function updateGrandTotal() {
    if (!expensesDataTable) return;

    let grandTotal = 0;
    expensesDataTable.rows().every(function () {
        const amountCell = this.data()[COL_AMOUNT];
        if (amountCell) {
            const amount = parseFloat(String(amountCell).replace(/,/g, ''));
            if (!isNaN(amount)) grandTotal += amount;
        }
    });

    const totalCell = document.getElementById('expenses-grand-total');
    if (totalCell) {
        totalCell.textContent = formatNumber(grandTotal);
    }
}

// ========================================
// EXPORT FUNCTIONALITY
// ========================================

// Blank ledger rows to leave between a month's data and its total row.
const MONTH_BLOCK_MIN_ROWS = 18;

const XL_HEADERS = ['Date of Expense', 'Company Name', 'Details of Expense', 'SI No.', 'Amount', 'Encoded By', 'Encoded Date'];
const XL_COL_WIDTHS = [16, 22, 34, 22, 14, 14, 22];
const XL_YELLOW = 'FFFFFF00';
const XL_ORANGE = 'FFF8CBAD';

function exportToExcel() {
    if (typeof ExcelJS === 'undefined') {
        showError('Excel library not loaded. Please refresh and try again.');
        return;
    }

    $.ajax({
        url: '/expenses/data',
        type: 'GET',
        dataType: 'json',
        success: function (res) {
            if (!res.success) {
                showError(res.message || 'Failed to load expenses for export.');
                return;
            }
            buildExpensesWorkbook(res.expenses || []);
        },
        error: function () {
            showError('Failed to load expenses for export.');
        }
    });
}

function monthKey(dateStr) {
    const d = dateStr ? new Date(dateStr) : null;
    if (!d || isNaN(d)) return { key: 'zzzz-undated', label: 'NO DATE' };
    return {
        key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
    };
}

async function buildExpensesWorkbook(expenses) {
    try {
        // Group by calendar month, chronological
        const groups = {};
        expenses.forEach(e => {
            const mk = monthKey(e.EXPENSE_DATE);
            (groups[mk.key] = groups[mk.key] || { label: mk.label, rows: [] }).rows.push(e);
        });
        const orderedKeys = Object.keys(groups).sort();

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Expenses');
        ws.columns = XL_COL_WIDTHS.map(w => ({ width: w }));

        // Header row (yellow, bold)
        const header = ws.addRow(XL_HEADERS);
        header.font = { bold: true };
        header.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_YELLOW } };
            cell.border = thinBorderAll();
            cell.alignment = { vertical: 'middle' };
        });


        orderedKeys.forEach(key => {
            const group = groups[key];
            let monthTotal = 0;

            group.rows.forEach(e => {
                const amount = parseFloat(e.Amount) || 0;
                monthTotal += amount;
                const row = ws.addRow([
                    fmtDateCell(e.EXPENSE_DATE),
                    e.COMPANY_NAME || '',
                    e.Description || '',
                    e.ReceiptNo == null ? '' : String(e.ReceiptNo), // text, no scientific notation
                    amount,
                    e.ENCODED_BY || '',
                    fmtDateTimeCell(e.ENCODED_DT)
                ]);
                row.getCell(4).numFmt = '@';
                row.getCell(5).numFmt = '#,##0';
                row.eachCell({ includeEmpty: true }, cell => { cell.border = thinBorderAll(); });
            });

            // Blank ledger rows so each month reads as its own page
            const pad = Math.max(0, MONTH_BLOCK_MIN_ROWS - group.rows.length);
            for (let i = 0; i < pad; i++) {
                const blank = ws.addRow(['', '', '', '', '', '', '']);
                blank.eachCell({ includeEmpty: true }, cell => { cell.border = thinBorderAll(); });
            }

            // Month total row (orange, bold): MONTH | ... | GRAND TOTAL | total | ...
            const totalRow = ws.addRow([group.label, '', '', 'GRAND TOTAL', monthTotal, '', '']);
            totalRow.font = { bold: true };
            totalRow.getCell(5).numFmt = '#,##0';
            totalRow.getCell(4).alignment = { horizontal: 'right' };
            totalRow.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_ORANGE } };
                cell.border = thinBorderAll();
            });

        });

        const filename = `Expenses_${new Date().toISOString().split('T')[0]}.xlsx`;
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showSuccess(`Expenses exported to ${filename}`);
    } catch (error) {
        console.error('Excel export error:', error);
        showError('Failed to export expenses to Excel.');
    }
}

function thinBorderAll() {
    const s = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    return { top: s, left: s, bottom: s, right: s };
}

// "9/5/2026" style for the Date of Expense column
function fmtDateCell(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}

// "Sep 07 2026, 11:42 AM" style for the Encoded Date column
function fmtDateTimeCell(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

// ========================================
// DATATABLE INITIALIZATION
// ========================================

function initializeDataTable() {
    const table = document.getElementById('expenses_tbl');
    if (!table || typeof $.fn.DataTable === 'undefined') return;

    try {
        expensesDataTable = $('#expenses_tbl').DataTable({
            data: [],
            responsive: true,
            pageLength: 25,
            order: [[COL_ENCODED_DATE, 'desc']],
            columnDefs: [{ targets: [COL_ACTION], orderable: false }],
            drawCallback: function () {
                updateGrandTotal();
            },
            language: {
                search: 'Search expenses:',
                lengthMenu: 'Show _MENU_ expenses per page',
                info: 'Showing _START_ to _END_ of _TOTAL_ expenses',
                emptyTable: "No expenses found. Click 'Add Expense' to get started."
            }
        });
    } catch (error) {
        console.error('DataTable initialization error:', error);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// yyyy-mm-dd for <input type="date">
function toDateInputValue(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d)) return '';
    return d.toISOString().split('T')[0];
}

// "Jan 20, 2025" for the Date of Expense column
function formatDateOnly(dateString) {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d)) return '-';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

// "Jan 20 2025 03:58 PM" for the Encoded Date column
function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    return date.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(',', '');
}

function showSuccess(message) {
    Swal.fire({ title: 'Success!', text: message, icon: 'success', timer: 2000, showConfirmButton: false });
}

function showError(message) {
    Swal.fire({ title: 'Error!', text: message, icon: 'error' });
}

// ========================================
// GLOBAL EXPORTS
// ========================================

window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.exportToExcel = exportToExcel;
