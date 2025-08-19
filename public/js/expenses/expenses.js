// ========================================
// EXPENSES MANAGEMENT SYSTEM
// ========================================

let currentExpenseId = null;
let expensesDataTable = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    initializeDataTable();
    loadExpensesData();
    initializeEventListeners();
});

// ========================================
// DATA LOADING
// ========================================

function loadExpensesData() {
    $.ajax({
        url: '/expenses/data',
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            if (data.success) {
                populateTableWithData(data.expenses);
            } else {
                showError(data.message || 'Failed to load expenses data.');
            }
        },
        error: function() {
            showError('Failed to load expenses data.');
        }
    });
}

function populateTableWithData(expenses) {
    if (!expensesDataTable) return;
    
    expensesDataTable.clear();
    
    expenses.forEach(expense => {
        const rowData = [
            expense.Category,
            expense.ReceiptNo || '',
            expense.Description,
            formatNumber(expense.Amount),
            expense.ENCODED_BY,
            formatDate(expense.ENCODED_DT),
            createActionButtons(expense.IDNo)
        ];
        
        const newRow = expensesDataTable.row.add(rowData);
        newRow.node().setAttribute('data-id', expense.IDNo);
    });
    
    expensesDataTable.draw();
    updateGrandTotal();
}

// ========================================
// EVENT LISTENERS
// ========================================

function initializeEventListeners() {
    // Delete event delegation
    document.addEventListener('click', function(event) {
        if (event.target.closest('.delete-link')) {
            event.preventDefault();
            const expenseId = event.target.closest('.delete-link').getAttribute('data-id');
            confirmDeleteExpense(expenseId);
        }
    });
    
    // Export button
    const exportBtn = document.getElementById('exportToExcel');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
    
    // Form submissions
    const newExpenseForm = document.getElementById('new-expense-form');
    if (newExpenseForm) {
        newExpenseForm.addEventListener('submit', handleNewExpenseSubmit);
    }
    
    const editExpenseForm = document.getElementById('edit-expense-form');
    if (editExpenseForm) {
        editExpenseForm.addEventListener('submit', handleEditExpenseSubmit);
    }
    
    // Modal resets
    $('#new-expense-modal').on('hidden.bs.modal', () => {
        document.getElementById('new-expense-form')?.reset();
    });
    
    $('#edit-expense-modal').on('hidden.bs.modal', () => {
        document.getElementById('edit-expense-form')?.reset();
        currentExpenseId = null;
    });
}

// ========================================
// CRUD OPERATIONS
// ========================================

function confirmDeleteExpense(expenseId) {
    Swal.fire({
        title: 'Are you sure?',
        text: "This action cannot be undone!",
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
        success: function(data) {
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
        error: function() {
            showError('Something went wrong while deleting the expense.');
        }
    });
}

function editExpense(expenseId) {
    $.ajax({
        url: `/expenses/edit_expense?id=${expenseId}`,
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            if (data.expense) {
                populateEditForm(data.expense);
                $('#edit-expense-modal').modal('show');
            } else {
                showError('Expense not found.');
            }
        },
        error: function() {
            showError('Failed to fetch expense details.');
        }
    });
}

function populateEditForm(expense) {
    document.getElementById('edit-expense-id').value = expense.IDNo;
    document.getElementById('edit-expense-category').value = expense.Category;
    document.getElementById('edit-expense-receipt').value = expense.ReceiptNo || '';
    document.getElementById('edit-expense-description').value = expense.Description;
    document.getElementById('edit-expense-amount').value = expense.Amount;
    currentExpenseId = expense.IDNo;
}

function handleNewExpenseSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const expenseData = {
        category: formData.get('category'),
        receipt: formData.get('receipt'),
        description: formData.get('description'),
        amount: formData.get('amount')
    };
    
    if (validateExpenseData(expenseData)) {
        submitExpense('/expenses/add', expenseData, 'Adding Expense...', 'Expense added successfully!');
    }
}

function handleEditExpenseSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const expenseData = {
        category: formData.get('category'),
        receipt: formData.get('receipt'),
        description: formData.get('description'),
        amount: formData.get('amount')
    };
    
    if (!currentExpenseId) {
        showError('No expense selected for editing.');
        return;
    }
    
    if (validateExpenseData(expenseData)) {
        submitExpense(`/expenses/edit_expense/${currentExpenseId}`, expenseData, 'Updating Expense...', 'Expense updated successfully!');
    }
}

function validateExpenseData(data) {
    if (!data.category || !data.description || !data.amount) {
        showError('Please fill in all required fields (Category, Description, Amount).');
        return false;
    }
    
    if (isNaN(data.amount) || parseFloat(data.amount) <= 0) {
        showError('Please enter a valid amount greater than 0.');
        return false;
    }
    
    return true;
}

function submitExpense(url, expenseData, loadingText, successMessage) {
    $.ajax({
        url: url,
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify(expenseData),
        success: function(data) {
            if (data.success) {
                if (data.expense) {
                    if (url.includes('add')) {
                        addExpenseToTable(data.expense);
                    } else {
                        updateExpenseInTable(data.expense);
                    }
                }
                
                $(url.includes('add') ? '#new-expense-modal' : '#edit-expense-modal').modal('hide');
                showSuccess(successMessage);
            } else {
                showError(data.message || 'Operation failed.');
            }
        },
        error: function() {
            showError('Something went wrong.');
        }
    });
}

// ========================================
// DATATABLE OPERATIONS
// ========================================

function addExpenseToTable(expense) {
    if (!expensesDataTable) return;
    
    const rowData = [
        expense.Category,
        expense.ReceiptNo || '',
        expense.Description,
        formatNumber(expense.Amount),
        expense.ENCODED_BY,
        formatDate(expense.ENCODED_DT),
        createActionButtons(expense.IDNo)
    ];
    
    const newRow = expensesDataTable.row.add(rowData).draw();
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
        const rowData = [
            expense.Category,
            expense.ReceiptNo || '',
            expense.Description,
            formatNumber(expense.Amount),
            expense.ENCODED_BY,
            formatDate(expense.ENCODED_DT),
            createActionButtons(expense.IDNo)
        ];
        
        expensesDataTable.row(rowIndex).data(rowData).draw();
        updateGrandTotal();
    }
}

function createActionButtons(expenseId) {
    return `
        <div class="text-center">
            <button class="btn btn-tbl-edit btn-xs" onclick="editExpense('${expenseId}')">
                <i class="fa fa-pencil"></i>
            </button>
            <a href="#" class="btn btn-tbl-delete btn-xs delete-link" data-id="${expenseId}">
                <i class="fa fa-trash-o"></i>
            </a>
        </div>
    `;
}

function updateGrandTotal() {
    if (!expensesDataTable) return;
    
    let grandTotal = 0;
    expensesDataTable.rows().every(function() {
        const amountCell = this.data()[3];
        if (amountCell) {
            const amount = parseFloat(amountCell.replace(/,/g, ''));
            if (!isNaN(amount)) {
                grandTotal += amount;
            }
        }
    });
    
    const totalCell = document.querySelector('#expenses_tbl tfoot td:nth-child(4)');
    if (totalCell) {
        totalCell.textContent = formatNumber(grandTotal);
    }
}

// ========================================
// EXPORT FUNCTIONALITY
// ========================================

function exportToExcel() {
    try {
        const table = document.getElementById('expenses_tbl');
        const tableClone = table.cloneNode(true);
        
        // Remove footer and action column
        const tfoot = tableClone.querySelector('tfoot');
        if (tfoot) tfoot.parentNode.removeChild(tfoot);
        
        const rows = tableClone.querySelectorAll('tr');
        rows.forEach(row => {
            if (row.children.length > 0) {
                row.removeChild(row.children[row.children.length - 1]);
            }
        });
        
        // Format amounts
        rows.forEach(row => {
            const amountCell = row.children[3];
            if (amountCell && !isNaN(amountCell.innerText.replace(/,/g, ''))) {
                const amount = parseFloat(amountCell.innerText.replace(/,/g, ''));
                amountCell.innerText = amount.toLocaleString('en-US');
            }
        });
        
        const worksheet = XLSX.utils.table_to_sheet(tableClone);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');
        
        const filename = `Expenses_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, filename);
        
        showSuccess(`Expenses exported to ${filename}`);
        
    } catch (error) {
        showError('Failed to export expenses to Excel.');
    }
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
            order: [[5, 'desc']],
            columnDefs: [{ targets: [6], orderable: false }],
            language: {
                search: "Search expenses:",
                lengthMenu: "Show _MENU_ expenses per page",
                info: "Showing _START_ to _END_ of _TOTAL_ expenses",
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

function formatNumber(num) {
    return Number(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).replace(',', '');
}

function showSuccess(message) {
    Swal.fire({
        title: 'Success!',
        text: message,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
}

function showError(message) {
    Swal.fire({
        title: 'Error!',
        text: message,
        icon: 'error'
    });
}

// ========================================
// GLOBAL EXPORTS
// ========================================

window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.exportToExcel = exportToExcel; 