(() => {
    // Setup
    let employee_id;
    
    // Safety check for HRMSCore availability
    function ensureHRMSCore() {
        if (typeof HRMSCore === 'undefined') {
            console.warn('HRMSCore not available, using fallback methods');
            // Create a minimal fallback
            window.HRMSCore = {
                getCache: () => null,
                setCache: () => {},
                clearCache: () => {},
                debounce: (fn, delay) => setTimeout(fn, delay),
                success: (msg) => alert('Success: ' + msg),
                danger: (msg) => alert('Error: ' + msg),
                debugLog: (msg, data) => console.log(msg, data),
                handleError: (error, context) => console.error(context, error),
                validateResponse: (response) => response
            };
        }
    }
    
    // Use HRMSCore for submission handling
    
    // Use HRMSCore for caching and alerts
    function getCachedDataTableData(type) {
        ensureHRMSCore();
        return HRMSCore.getCache(type);
    }
    
    function setCachedDataTableData(type, data) {
        ensureHRMSCore();
        HRMSCore.setCache(type, data);
        console.log('DataTable data cached for:', type);
    }
    
    // Function now uses HRMSCore.clearCache directly
    
    // Debounced reload function using HRMSCore
    function debouncedReload(forceRefresh = false) {
        ensureHRMSCore();
        HRMSCore.debounce(() => {
            window.reloadData(forceRefresh);
        }, 200);
    }
    
    function setSubmitButtonState(disabled) {
      var submitButton = $('#updateAccessForm button[type="submit"]');
      if (disabled) {
        submitButton.prop('disabled', true).addClass('btn-primary-premium');
        submitButton.html('<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Updating...');
      } else {
        submitButton.prop('disabled', false).removeClass('btn-primary-premium').html('Update Access');
      }
    }
    
    // Wait for jQuery to be available
    function waitForJQuery(callback) {
        if (typeof jQuery !== 'undefined') {
            callback();
        } else {
            setTimeout(function() {
                waitForJQuery(callback);
            }, 100);
        }
    }
    
    waitForJQuery(function() {
        $(document).ready(function() {
            // Initialize DataTable
            if ($.fn.DataTable.isDataTable('#employeesTable')) {
                $('#employeesTable').DataTable().destroy();
            }
    
            const dataTable = $("#employeesTable").DataTable({
                columnDefs: [
                    { targets: [ 3, 4, 5, 6], className: "text-center" } 
                ],
                pageLength: 10,
                lengthMenu: [
                    [10, 15, 20, 25],
                    [10, 15, 20, 25],
                ],
                autoWidth: false,
                responsive: true,
                order: [[2, 'asc']], // Sort by employee name by default
                deferRender: true, // Optimize for large datasets
                processing: true // Show processing indicator
            });
    
            // Define reloadData function in global scope with enhanced caching
            window.reloadData = function(forceRefresh = false) {
                const empType = $('#emp_type_sel').val() || 'organic';
                const statusFilter = $('#status_filter_sel').val() || 'active';
                const category = $('#category').val() || '';
                const appStatus = $('#app_status').val() || '';
                
                // Create comprehensive cache key with all filters
                const cacheKey = `${empType}_${statusFilter}_${category}_${appStatus}`;
                
                // Check cache first (unless force refresh is requested)
                if (!forceRefresh) {
                    const cachedData = getCachedDataTableData(cacheKey);
                    if (cachedData) {
                        console.log('DataTable cache hit for employees:', cacheKey);
                        updateTableFromData(cachedData);
                        return;
                    }
                }
                
                // Determine the correct API endpoint based on status filter
                const apiUrl = statusFilter === 'inactive' ? '/api/employee/inactive/data' : '/api/employee/data';
                
                console.log('Fetching employee data from:', apiUrl, 'with filters:', { empType, statusFilter, category, appStatus });
                
                $.ajax({
                    url: apiUrl,
                    method: 'GET',
                    data: { 
                        type: empType,
                        category: category,
                        app_status: appStatus
                    },
                    success: function(data) {
                        if (data.success) {
                            // Cache the data (unless force refresh)
                            if (!forceRefresh) {
                                setCachedDataTableData(cacheKey, data);
                            }
                            
                            // Update table
                            updateTableFromData(data);
                        } else {
                            ensureHRMSCore();
                            HRMSCore.danger(data.message || 'Failed to load employee data');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error fetching data:', error);
                        ensureHRMSCore();
                        HRMSCore.danger('Failed to load employee data. Please try again.');
                    }
                });
            }
            
            // Optimized table update with batching
            function updateTableFromData(data) {
                dataTable.clear();
    
                if (data.employees && data.employees.length > 0) {
                    const allRows = [];
                    
                    data.employees.forEach(function(row, index) {
                        let name = '';
                        if(row.extension_name && row.extension_name.trim() !== '') {
                            name = row.last_name + " " + row.extension_name + ", " + row.first_name;
                        } else {
                            name = row.last_name + ", " + row.first_name;
                        }
    
                        const status = `<span class="bg-info-focus text-info-main px-16 py-4 rounded-pill fw-medium text-xs">${row.employment_status_name || 'N/A'}</span>`;
                        const privilege = `<span class="bg-primary-focus text-primary-main px-16 py-4 rounded-pill fw-medium text-xs">${row.access_level_name || 'N/A'}</span>`;
                        
                        let lockStatus = '';
                        if(row.lock == 1) {
                            lockStatus = `<span class="bg-danger-focus text-danger-main px-16 py-4 rounded-pill fw-medium text-xs">Locked</span>`;
                        } else {
                            lockStatus = `<span class="bg-success-focus text-success-main px-16 py-4 rounded-pill fw-medium text-xs">No</span>`;
                        }
    
                        let btn = `
                            <div class="dropdown">
                                <button class="btn px-18 py-11 text-primary-light" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    <iconify-icon icon="entypo:dots-three-vertical" class="menu-icon"></iconify-icon>
                                </button>
                                <ul class="dropdown-menu">
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="/users/view-profile/${row.profile_id}?tab=basic-info">View Profile</a></li>
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="userAccess('${row.profile_id}', '${name}', '${row.user_access}')">User Access</a></li>`;
                        
                        if(row.lock == 1) {
                            btn += `<li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="unlockEmployee('${row.profile_id}', '${name}')">Unlock</a></li>`;
                        } else {
                            btn += `<li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="lockEmployee('${row.profile_id}', '${name}')">Lock</a></li>`;
                        }
                        
                        // Add different actions based on account status
                        if(row.account_status == 1) {
                            btn += `
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="resetPassword('${row.profile_id}', '${name}')">Reset Password</a></li>
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="inactiveEmployee('${row.profile_id}', '${name}')">Mark Inactive</a></li>
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="deleteEmployee('${row.profile_id}', '${name}')">Delete</a></li>`;
                        } else {
                            btn += `
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="reactivateEmployee('${row.profile_id}', '${name}')">Reactivate</a></li>
                                    <li><a class="dropdown-item px-16 py-8 rounded text-secondary-light bg-hover-neutral-200 text-hover-neutral-900" href="javascript:void(0)" onclick="deleteEmployee('${row.profile_id}', '${name}')">Delete</a></li>`;
                        }
                        
                        btn += `
                                </ul>
                            </div>`;
    
                        const employeeWithImage = `
                            <div class="d-flex align-items-center">
                                <img alt="${name}" src="${row.id_photo ? '/uploads/' + row.id_photo : '/images/user.png'}" class="flex-shrink-0 me-12 radius-8" style="height: 40px;width: 40px;object-fit: cover;">
                                <div class="flex-grow-1">
                                    <h6 class="text-md mb-0 fw-medium">${name}</h6>
                                </div>
                            </div>`;
    
                        allRows.push([
                            employeeWithImage,
                            row.position_name || 'N/A',
                            row.department_name || 'N/A',
                            status,
                            privilege,
                            lockStatus,
                            btn
                        ]);
                    });
                    
                    // Batch add all rows at once
                    dataTable.rows.add(allRows).draw();
                } else {
                    dataTable.row.add(['<td colspan="7" class="text-center">No employees found</td>', '', '', '', '', '', '']).draw();
                }
    
                initializeTooltips();
            }
    
    
    
            // Initial load
            window.reloadData();
    
            // Initialize Select2 for employee type filter
            $('#emp_type_sel').select2({
                placeholder: 'Select Employee Type',
                width: '100%'
            });
    
            // Debounced filter change handlers
            $('#emp_type_sel, #status_filter_sel, #category, #app_status').on('change', function(){
                debouncedReload();
            });
    
            // Initialize Select2 for status filter
            $('#status_filter_sel').select2({
                placeholder: 'Select Status',
                width: '100%'
            });
    
            // Initialize Select2 for Category 
            $('#category').select2({
                placeholder: 'Select Category',
                width: '100%',
                dropdownParent: $('#modal-new-employee-data')
            });
    
            // Initialize Select2 for Appointment Status 
            $('#app_status').select2({
                placeholder: 'Select Appointment Status',
                width: '100%',
                dropdownParent: $('#modal-new-employee-data')
            });
    
                       // Initialize Select2 for Salary Grade
              $('#mon_salary_add').select2({
                 placeholder: 'Select Grade',
                 width: '100%',
                 dropdownParent: $('#modal-new-employee-data')
             });
    
              // Initialize Select2 for Step Level
              $('#salary_add').select2({
                 placeholder: 'Select Step',
                 width: '100%',
                 dropdownParent: $('#modal-new-employee-data')
             });
    
            // Initialize Select2 for User Access Level in the modal
            $('#user_access').select2({
                placeholder: 'Select User Access Level',
                width: '100%',
                dropdownParent: $('#userAccessModal')
            });
    
            // Update user access form
            $('#updateAccessForm').on('submit', function(e) {
                e.preventDefault();
                if (HRMSCore.getSubmitting()) return false;
                HRMSCore.setSubmitting(true);
                setSubmitButtonState(true);
                
                const formData = {
                    employee_id: $('#access_employee_id').val(),
                    user_access: $('#user_access').val()
                };
    
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/update-access',
                    data: JSON.stringify(formData),
                    contentType: 'application/json',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee access successfully updated!');
                            $('#userAccessModal').modal('hide');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to update access');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error updating access:', error);
                        HRMSCore.danger('Failed to update access. Please try again.');
                    },
                    complete: function() {
                        HRMSCore.setSubmitting(false);
                        setSubmitButtonState(false);
                    }
                });
            });
        });
    });
    
    function initializeTooltips() {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl, {
                trigger: 'hover',
                html: true
            });
        });
    }
    
    // Employee management functions
    function inactiveEmployee(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to mark this employee as inactive?')) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/inactive',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee marked as inactive!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to mark employee as inactive');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error marking employee as inactive:', error);
                        HRMSCore.danger('Failed to mark employee as inactive. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to mark this employee as inactive?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, mark as inactive'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/inactive',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee marked as inactive!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to mark employee as inactive');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error marking employee as inactive:', error);
                        HRMSCore.danger('Failed to mark employee as inactive. Please try again.');
                    }
                });
            }
        });
    }
    
    function deleteEmployee(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to delete this employee?')) {
                $.ajax({
                    method: 'DELETE',
                    url: '/api/employee/' + id,
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee deleted successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to delete employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error deleting employee:', error);
                        HRMSCore.danger('Failed to delete employee. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to delete this employee?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'DELETE',
                    url: '/api/employee/' + id,
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee deleted successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to delete employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error deleting employee:', error);
                        HRMSCore.danger('Failed to delete employee. Please try again.');
                    }
                });
            }
        });
    }
    
    function resetPassword(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to reset the password for this employee?')) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/reset-password',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Password reset successfully! New password: ' + response.data.new_password);
                        } else {
                            HRMSCore.danger(response.message || 'Failed to reset password');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error resetting password:', error);
                        HRMSCore.danger('Failed to reset password. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to reset the password for this employee?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, reset password'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/reset-password',
                    success: function(response) {
                        if (response.success) {
                            Swal.fire({
                                icon: 'success',
                                title: 'Password reset successfully!',
                                text: 'New password: ' + response.data.new_password,
                                showConfirmButton: true
                            });
                        } else {
                            HRMSCore.danger(response.message || 'Failed to reset password');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error resetting password:', error);
                        HRMSCore.danger('Failed to reset password. Please try again.');
                    }
                });
            }
        });
    }
    
    function userAccess(emp_id, emp_name, current_access) {
        waitForJQuery(function() {
            $('#access_employee_id').val(emp_id);
            $('#userAccessModalLabel').text('Update User Access - ' + emp_name);
            if (current_access) {
                $('#user_access').val(current_access).trigger('change');
            }
            $('#userAccessModal').modal('show');
        });
    }
    
    function lockEmployee(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to lock this employee?')) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/lock',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee locked successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to lock employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error locking employee:', error);
                        HRMSCore.danger('Failed to lock employee. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to lock this employee?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, lock'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/lock',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee locked successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to lock employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error locking employee:', error);
                        HRMSCore.danger('Failed to lock employee. Please try again.');
                    }
                });
            }
        });
    }
    
    function unlockEmployee(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to unlock this employee?')) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/unlock',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee unlocked successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to unlock employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error unlocking employee:', error);
                        HRMSCore.danger('Failed to unlock employee. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to unlock this employee?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, unlock'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/unlock',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee unlocked successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to unlock employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error unlocking employee:', error);
                        HRMSCore.danger('Failed to unlock employee. Please try again.');
                    }
                });
            }
        });
    }
    
    function reactivateEmployee(id, name) {
        if (typeof Swal === 'undefined') {
            if (confirm('Are you sure you want to reactivate this employee?')) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/reactivate',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee reactivated successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to reactivate employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error reactivating employee:', error);
                        HRMSCore.danger('Failed to reactivate employee. Please try again.');
                    }
                });
            }
            return;
        }
    
        Swal.fire({
            title: 'Are you sure you want to reactivate this employee?',
            text: name,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, reactivate'
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    method: 'POST',
                    url: '/api/employee/' + id + '/reactivate',
                    success: function(response) {
                        if (response.success) {
                            HRMSCore.success('Employee reactivated successfully!');
                            HRMSCore.clearCache(); // Clear cache before reloading
                            reloadData();
                        } else {
                            HRMSCore.danger(response.message || 'Failed to reactivate employee');
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error('Error reactivating employee:', error);
                        HRMSCore.danger('Failed to reactivate employee. Please try again.');
                    }
                });
            }
        });
    }
    
    $(document).ready(function () {
        // Initialize Flatpickr for date inputs
        function initializeFlatpickr() {
            $('.flatpickr-date').flatpickr({
                dateFormat: "Y-m-d",
                allowInput: true,
                clickOpens: true,
                disableMobile: false,
                locale: "en",
                maxDate: new Date(), // For DOB, you might want to set a reasonable max date
                onChange: function(selectedDates, dateStr, instance) {
                    // Trigger validation when date is selected
                    $(instance.input).trigger('blur');
                }
            });
        }
    
        // Cached department loading
        function loadDepartments() {
            ensureHRMSCore();
            const cached = HRMSCore.getCache('departments');
            if (cached) {
                populateDepartmentSelect(cached);
                return;
            }
    
            $.ajax({
                url: '/department/data',
                method: 'GET',
                success: function(data) {
                    HRMSCore.setCache('departments', data.departments);
                    populateDepartmentSelect(data.departments);
                },
                error: function(xhr, status, error) {
                    console.error('Error loading departments:', error);
                }
            });
        }
    
        function populateDepartmentSelect(departments) {
            const $departmentSelect = $('#department');
            $departmentSelect.empty();
            $departmentSelect.append('<option value="">Select Department</option>');
            
            departments.forEach(function(dept) {
                $departmentSelect.append('<option value="' + dept.department_id + '">' + dept.description + '</option>');
            });
            
            // Reinitialize Select2
            $departmentSelect.select2({
                placeholder: 'Select Department',
                width: '100%',
                dropdownParent: $('#modal-new-employee-data')
            });
        }
    
        // Cached position loading
        function loadPositions() {
            ensureHRMSCore();
            const cached = HRMSCore.getCache('positions');
            if (cached) {
                populatePositionSelect(cached);
                return;
            }
    
            $.ajax({
                url: '/position/data',
                method: 'GET',
                success: function(data) {
                    HRMSCore.setCache('positions', data.positions);
                    populatePositionSelect(data.positions);
                },
                error: function(xhr, status, error) {
                    console.error('Error loading positions:', error);
                }
            });
        }
    
        function populatePositionSelect(positions) {
            const $positionSelect = $('select[name="position"]');
            $positionSelect.empty();
            $positionSelect.append('<option value="">Select Position</option>');
            
            positions.forEach(function(pos) {
                $positionSelect.append('<option value="' + pos.position_id + '">' + pos.description + '</option>');
            });
            
            // Reinitialize Select2
            $positionSelect.select2({
                placeholder: 'Select Position',
                width: '100%',
                dropdownParent: $('#modal-new-employee-data')
            });
        }
    
        // Initialize wizard step move
        function initializeWizardStepMove() {
            const activeStep = $('.form-wizard-list .active');
            if (activeStep.length) {
                const innerWidth = activeStep.innerWidth();
                const position = activeStep.position();
                $('.form-wizard-step-move').css({
                    'left': position.left,
                    'width': innerWidth
                });
            }
        }
    
        // Update button visibility
        function updateButtonVisibility() {
            const currentStep = $('.wizard-fieldset.show');
            const isFirstStep = currentStep.attr('data-tab-content') === 'step1';
            const isLastStep = currentStep.attr('data-tab-content') === 'step5';
             
             // Close button logic (only show on first step)
             if (isFirstStep) {
                 $('.step1-close-btn').show();
                 $('.form-wizard-previous-btn').hide();
             } else {
                 $('.step1-close-btn').hide();
                 $('.form-wizard-previous-btn').show();
             }
             
             if (isFirstStep) {
                 $('.form-wizard-next-btn').show();
                 $('.form-wizard-submit').hide();
             } else if (isLastStep) {
                 $('.form-wizard-next-btn').hide();
                 $('.form-wizard-submit').show();
             } else {
                 $('.form-wizard-next-btn').show();
                 $('.form-wizard-submit').hide();
             }
         }
    
        // Initialize on page load
        initializeFlatpickr();
        initializeWizardStepMove();
        updateButtonVisibility();
        
        // Load Select2 data
        loadDepartments();
        loadPositions();
    
        let currentStep = 1;
        const totalSteps = $('.wizard-fieldset').length;
    
        // Function to render UI based on step number
        function showStep(step) {
            if (step < 1 || step > totalSteps) return;
            currentStep = step;
    
            // Fieldsets
            $('.wizard-fieldset').removeClass('show');
            $(`.wizard-fieldset[data-tab-content="step${step}"]`).addClass('show');
    
            // Step indicators (activated vs active)
            $('.form-wizard-list__item').each(function() {
                const num = parseInt($(this).data('attr').replace('step',''));
                $(this).removeClass('active activated');
                if (num < step)       $(this).addClass('activated');
                else if (num === step) $(this).addClass('active');
            });
    
            // Underline move
            const $active = $('.form-wizard-list__item.active');
            $('.form-wizard-step-move').css({
                left:  $active.position().left,
                width: $active.innerWidth()
            });
    
            // Button visibility
            $('.form-wizard-previous-btn').toggle(step > 1);
            $('.form-wizard-next-btn').toggle(step < totalSteps);
            $('.form-wizard-submit').toggle(step === totalSteps);
            
            // Populate confirmation details if step 5
            if (step === 5) {
                populateConfirmationDetails();
            }
        }
    
      // 3) Initial render
      showStep(1);
    
      // 4) Next button
      $('.form-wizard-next-btn').on('click', function() {
        // Validate current fieldset before proceeding
        if (!validateCurrentFieldset()) return;
        
        // If moving to step 5, populate confirmation details
        if (currentStep === 4) {
          populateConfirmationDetails();
        }
        
        showStep(currentStep + 1);
      });
    
        // Validation function for current fieldset
        function validateCurrentFieldset() {
            const currentFieldset = $(`.wizard-fieldset[data-tab-content="step${currentStep}"]`);
            let isValid = true;
            
            // Get all required fields in current step
            const requiredFields = currentFieldset.find('.form-control[required], .form-select[required]');
            
            requiredFields.each(function() {
                const field = $(this);
                const value = field.val();
                
                // Check if field is empty
                if (!value || value.trim() === '') {
                    field.parent().addClass('focus-input');
                    field.siblings('.wizard-form-error').show();
                    isValid = false;
                } else {
                    field.parent().addClass('focus-input');
                    field.siblings('.wizard-form-error').hide();
                }
            });
            
            // Additional validation for specific fields
            if (currentStep === 1) {
                // Validate email format if email field exists
                const emailField = currentFieldset.find('input[type="email"]');
                if (emailField.length && emailField.val()) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(emailField.val())) {
                        emailField.parent().addClass('focus-input');
                        emailField.siblings('.wizard-form-error').show().text('Please enter a valid email address');
                        isValid = false;
                    }
                }
            }
            
            if (!isValid) {
                // Show error message
                ensureHRMSCore();
                HRMSCore.danger('Please fill in all required fields correctly before proceeding.');
            }
            
            return isValid;
        }
    
      // 5) Back button
      $('.form-wizard-previous-btn').on('click', function() {
        showStep(currentStep - 1);
      });
    
      // 6) Submit button
      $('.form-wizard-submit').on('click', function() {
        // Submit the form
        submitEmployeeForm();
      });
    
      // Function to populate confirmation details
      function populateConfirmationDetails() {
        // Personal Information
        $('#confirm_first_name').text($('input[name="first_name"]').val() || '-');
        $('#confirm_middle_name').text($('input[name="middle_name"]').val() || '-');
        $('#confirm_last_name').text($('input[name="last_name"]').val() || '-');
        $('#confirm_ext_name').text($('input[name="ext_name"]').val() || '-');
        $('#confirm_dob').text($('input[name="dob"]').val() || '-');
        $('#confirm_gender').text($('input[name="gender"]:checked').val() || '-');
        
        // Emergency Contact
        $('#confirm_e_name').text($('input[name="e_name"]').val() || '-');
        $('#confirm_e_relationship').text($('input[name="e_relationship"]').val() || '-');
        $('#confirm_e_address').text($('input[name="e_address"]').val() || '-');
        $('#confirm_e_mobile_no').text($('input[name="e_mobile_no"]').val() || '-');
        
        // Employment Status
        var appStatusText = $('select[name="app_status"] option:selected').text();
        $('#confirm_app_status').text(appStatusText !== 'Select Appointment Status' ? appStatusText : '-');
        
        var deptText = $('select[name="department"] option:selected').text();
        $('#confirm_department').text(deptText !== 'Select Department' ? deptText : '-');
        
        var categoryText = $('select[name="category"] option:selected').text();
        $('#confirm_category').text(categoryText !== 'Select Category' ? categoryText : '-');
        
        var positionText = $('select[name="position"] option:selected').text();
        $('#confirm_position').text(positionText !== 'Select Position' ? positionText : '-');
        
        $('#confirm_id_no').text($('input[name="id_no"]').val() || '-');
        $('#confirm_date_hired').text($('input[name="date_hired"]').val() || '-');
        
        // Salary Information
        var salaryGradeText = $('select[name="salary_grade"] option:selected').text();
        $('#confirm_salary_grade').text(salaryGradeText !== 'Select Grade' ? salaryGradeText : '-');
        
        var stepLevelText = $('select[name="step_level"] option:selected').text();
        $('#confirm_step_level').text(stepLevelText !== 'Select Step' ? stepLevelText : '-');
        
        var salaryAmount = $('input[name="salary_amount"]').val();
        $('#confirm_salary_amount').text(salaryAmount || '-');
      }
    
        // Form submission function based on form wizard fields
        function submitEmployeeForm() {
            // Validate required fields before submission
            const firstName = $('input[name="first_name"]').val();
            const lastName = $('input[name="last_name"]').val();
            const dateHired = $('input[name="date_hired"]').val();
            const employmentStatus = $('select[name="app_status"]').val();
            
            if (!firstName || !lastName || !dateHired || !employmentStatus) {
                ensureHRMSCore();
                HRMSCore.danger('Please fill in all required fields: First Name, Last Name, Date Hired, and Employment Status');
                return;
            }
            
            // Disable submit button to prevent double submission
            const submitBtn = $('.form-wizard-submit');
            const originalText = submitBtn.text();
            submitBtn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...');
            
            // Collect form data from the form wizard fields for /api/employee endpoint
            const formData = {
                // Step 1: Personal Information
                first_name: $('input[name="first_name"]').val(),
                middle_name: $('input[name="middle_name"]').val(),
                last_name: $('input[name="last_name"]').val(),
                extension_name: $('input[name="ext_name"]').val(),
                birthdate: formatDate($('input[name="dob"]').val()),
                sex: $('input[name="gender"]:checked').val() === 'male' ? 'M' : $('input[name="gender"]:checked').val() === 'female' ? 'F' : null,
                
                // Step 2: Emergency Contact
                e_name: $('input[name="e_name"]').val(),
                e_relationship: $('input[name="e_relationship"]').val(),
                e_address: $('input[name="e_address"]').val(),
                e_mobile_no: $('input[name="e_mobile_no"]').val(),
                
                // Step 3: Employment Status
                employment_status: $('select[name="app_status"]').val(),
                department: $('select[name="department"]').val(),
                position: $('select[name="position"]').val(),
                id_no: $('input[name="id_no"]').val(),
                date_hired: formatDate($('input[name="date_hired"]').val()),
                
                // Step 4: Salary Information
                salary_grade: $('select[name="salary_grade"]').val(),
                salary_step: $('select[name="step_level"]').val(),
                
                // Additional required fields
                username: generateUsername($('input[name="first_name"]').val(), $('input[name="last_name"]').val()),
                email: generateEmail($('input[name="first_name"]').val(), $('input[name="last_name"]').val()),
                mobile_no: $('input[name="e_mobile_no"]').val(),
                level: 5,
                user_access: 2,
                account_status: 1
            };
    
            // Generate email from first and last name
            function generateEmail(firstName, lastName) {
                if (!firstName || !lastName) return '';
                const email = (firstName.toLowerCase() + '.' + lastName.toLowerCase() + '@company.com').replace(/[^a-z0-9]/g, '');
                return email;
            }
    
            // Generate username from first and last name
            function generateUsername(firstName, lastName) {
                if (!firstName || !lastName) return '';
                const username = (firstName.toLowerCase() + '.' + lastName.toLowerCase()).replace(/[^a-z0-9]/g, '');
                return username;
            }
            
            // Format date for backend (YYYY-MM-DD)
            function formatDate(dateString) {
                if (!dateString) return null;
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString; // Return original if invalid
                return date.toISOString().split('T')[0]; // YYYY-MM-DD format
            }
    
            // Debug: Log the form data being sent
            console.log('Form data being sent:', formData);
            console.log('Required fields validation:');
            console.log('- firstName:', firstName);
            console.log('- lastName:', lastName);
            console.log('- dateHired:', dateHired);
            console.log('- employmentStatus:', employmentStatus);
    
        // Send AJAX request
        $.ajax({
          url: '/api/employee/',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(formData),
          success: function(response) {
            ensureHRMSCore();
            if (response.success) {
              // Show success message
              HRMSCore.success('Employee created successfully!');
              
              // Close modal
              $('#modal-new-employee-data').modal('hide');
              
              // Clear form
              $('#add_new_employee')[0].reset();
              
              // Reset wizard to first step
              showStep(1);
              
              // Force clear cache and reload data immediately
              HRMSCore.clearCache();
              
              // Force reload data without cache
              setTimeout(function() {
                if (typeof window.reloadData === 'function') {
                  window.reloadData(true); // Force refresh
                } else {
                  // Fallback to page reload if reloadData is not available
                  location.reload();
                }
              }, 500);
            } else {
              HRMSCore.danger(response.message || 'Failed to create employee');
            }
          },
          error: function(xhr, status, error) {
            console.error('Error creating employee:', error);
            console.error('Response status:', xhr.status);
            console.error('Response text:', xhr.responseText);
            try {
              const response = JSON.parse(xhr.responseText);
              console.error('Response data:', response);
              ensureHRMSCore();
              HRMSCore.danger(response.message || 'Failed to create employee. Please try again.');
            } catch (e) {
              ensureHRMSCore();
              HRMSCore.danger('Failed to create employee. Please try again.');
            }
          },
          complete: function() {
            // Re-enable submit button
            submitBtn.prop('disabled', false).text(originalText);
          }
        });
      }
        
        
        // Focus on input field check empty or not
        $('.form-control').on('focus', function () {
            const tmpThis = $(this).val();
            if (tmpThis == '') {
                $(this).parent().addClass('focus-input');
            } else if (tmpThis != '') {
                $(this).parent().addClass('focus-input');
            }
        }).on('blur', function () {
            const tmpThis = $(this).val();
            if (tmpThis == '') {
                $(this).parent().removeClass('focus-input');
                $(this).siblings('.wizard-form-error').show();
            } else if (tmpThis != '') {
                $(this).parent().addClass('focus-input');
                $(this).siblings('.wizard-form-error').hide();
            }
        });
    
        // Refresh data when modal is shown
        $('#modal-new-employee-data').on('shown.bs.modal', function () {
            loadDepartments();
            loadPositions();
        });
    
        // Clear cache when modal is closed
        $('#modal-new-employee-data').on('hidden.bs.modal', function () {
            ensureHRMSCore();
            HRMSCore.clearCache();
        });
    
        setTimeout(function() {
            const shown = $('.wizard-fieldset.show');
            if (shown.length > 1) {
                // Remove .show from all except the last one
                shown.not(':last').removeClass('show');
            }
        }, 10);
    });
    
    // Expose functions globally for onclick handlers
    window.userAccess = userAccess;
    window.lockEmployee = lockEmployee;
    window.unlockEmployee = unlockEmployee;
    window.resetPassword = resetPassword;
    window.inactiveEmployee = inactiveEmployee;
    window.deleteEmployee = deleteEmployee;
    window.reactivateEmployee = reactivateEmployee;
    ensureHRMSCore();
    window.clearDataTableCache = HRMSCore.clearCache;
    })();