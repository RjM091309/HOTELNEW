$(document).ready(function () {
    // Check for highlight parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const highlightGroupId = urlParams.get('highlight');
    
    // Build initial URL with highlight parameter if present
    let initialUrl = '/booking/group_booking_data?filter=all';
    if (highlightGroupId && String(highlightGroupId) !== '0' && String(highlightGroupId) !== '') {
        initialUrl += `&groupId=${highlightGroupId}`;
    }
    
    let groupTable = $('#group_booking_tbl').DataTable({
        ajax: {
            url: initialUrl,
            type: 'GET',
            dataSrc: function (json) {
                return json.map(item => {
                    return {
                        GroupID: item.group_id,
                        GroupName: item.GROUP_NAME,
                        ContactNo: item.CONTACT_NO,
                        NumberOfRooms: item.NUMBER_OF_ROOMS,
                        Remarks: item.REMARKS || '',
                        RemarksCount: item.remarks_count,
                        RoomNumbers: item.room_numbers || 'N/A',
                        TotalBookings: item.total_bookings,
                        Channel: item.BOOKING_CHANNEL,
                        Status: item.STATUS_OVERVIEW,
                        TotalPayment: item.TOTAL_PAYMENT,
                        TotalPaid: item.TOTAL_PAID,
                        PaymentStatus: item.PAYMENT_STATUS,
                        CreatedBy: item.ENCODED_BY_NAME || 'System',
                        EditedBy: item.EDITED_BY_NAME || null
                    };
                });
            },
        },
        columns: [
            {
                title: '#',
                data: null,
                orderable: false,
                render: function (data, type, row, meta) {
                    // Show descending numbering per current page (e.g., 9..1)
                    var api = new $.fn.dataTable.Api(meta.settings);
                    var info = api.page.info();
                    return meta.settings._iDisplayStart + meta.row + 1;
                }
            },
            {
                data: 'GroupName',
                title: 'GROUP NAME',
                render: function (data, type, row) {
                    return `
                        <a href="#" data-bs-toggle="modal" data-bs-target="#groupBookingModal"
                           onclick="viewGroupBooking(${row.GroupID})">
                           ${data}
                        </a>`;
                }
            },
            { data: 'ContactNo', title: 'CONTACT NUMBER' },
            { data: 'NumberOfRooms', title: 'TOTAL ROOMS' },
            { data: 'RoomNumbers', title: 'ROOM NUMBERS' },
            {
                data: 'TotalPayment',
                title: 'TOTAL PAYMENT',
                render: function (data) {
                    return parseFloat(data).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            },
            {
                data: null,
                title: 'TOTAL BALANCE',
                render: function (data, type, row) {
                    const totalPayment = parseFloat(row.TotalPayment) || 0;
                    const totalPaidRaw = parseFloat(row.TotalPaid) || 0;
                    const appliedPaid = Math.min(totalPaidRaw, totalPayment);
                    const balance = Math.max(0, totalPayment - appliedPaid);
                    
                    // Format the balance as currency (matching single booking table)
                    const formattedBalance = balance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    
                    // Add color coding for balance (matching single booking table)
                    if (balance > 0) {
                        return `<span style="color: #d9534f; font-weight: bold;">₱${formattedBalance}</span>`;
                    } else if (balance < 0) {
                        return `<span style="color: #5cb85c; font-weight: bold;">₱${formattedBalance}</span>`;
                    } else {
                        return `<span>₱${formattedBalance}</span>`;
                    }
                }
            },
            {
                data: 'PaymentStatus',
                title: 'PAYMENT STATUS',
                type: 'string',
                render: function (data, type, row) {
                    // For sorting and filtering, return the raw normalized data
                    if (type === 'sort' || type === 'type' || type === 'filter') {
                        return data; // Already normalized in dataSrc
                    }
                    // For display, return the styled HTML (matching single booking table)
                    const labelClass = data === 'paid' ? 'label-success' : 'label-danger';
                    const displayText = data === 'paid' ? 'PAID' : 'UNPAID';
                    return `<div style="text-align: center;"><span class="label label-sm ${labelClass}">${displayText}</span></div>`;
                }
            },
          
            { data: 'Channel', title: 'BOOKING CHANNEL' },
            {
                data: 'Status',
                title: 'BOOKING STATUS',
                visible: true, // Make the column visible
                render: function (data) {
                    let labelClass = "label-secondary";
                    if (data === "ALL CHECK-IN") labelClass = "label-success";
                    else if (data === "ALL CHECK-OUT") labelClass = "label-warning";
                    else if (data === "ALL CANCELLED") labelClass = "label-danger";
                    else if (data === "PARTIAL CHECK-OUT") labelClass = "label-primary";
                    else if (data === "ALL PENDING") labelClass = "label-info";
                    else if (data.includes("PENDING & CHECK-IN")) labelClass = "label-dark";
                    else if (data.includes("PENDING & CHECK-OUT")) labelClass = "label-light";
                    else if (data.includes("CANCELLED")) labelClass = "label-danger";

                    return `<div style="text-align: center;"><span class="label label-sm ${labelClass}">${data}</span></div>`;
                }
            },
            {
                data: 'CreatedBy',
                title: 'CREATED BY',
                className: 'text-center',
                render: function (data, type, row) {
                    const createdBy = data || 'System';
                    const editedBy = row.EditedBy;
                    
                    // If group booking was edited, show "CREATOR | EDITOR"
                    if (editedBy && editedBy !== 'System') {
                        return `${createdBy} | ${editedBy}`;
                    }
                    // Otherwise, just show creator
                    return createdBy;
                }
            },
            {
                title: 'ACTION',
                orderable: false,
                render: function (data, type, row) {
                    const buttonId = `billing_btn_${row.GroupID}`;
                    const remarksBtnId = `group_remarks_btn_${row.GroupID}`;

                    // Async: check payment status (no UI change here currently)
                    $.ajax({
                        url: `/booking/check_group_payment_status/${row.GroupID}`,
                        method: 'GET',
                        error: function(err) { console.error('Error checking payment status:', err); }
                    });

                    // Deterministic color: green only if there are actual rows in remarks table or non-empty gb.REMARKS
                    const hasAny = (row.RemarksCount && row.RemarksCount > 0) || (row.Remarks && String(row.Remarks).trim() !== '');
                    const baseRemarksColor = hasAny ? 'rgba(39, 164, 176, 0.3)' : 'rgba(149, 165, 166, 0.28)';

                    // Check if group booking can be cancelled (all bookings are pending)
                    // Since group status is determined by individual booking statuses
                    const canCancel = row.Status === 'ALL PENDING';
                    const isCancelled = row.Status && row.Status.includes('CANCELLED');

                    // Disable "Join Group" when group is checked-out or cancelled
                    const isAllCheckout = row.Status && row.Status.includes('CHECK-OUT');
                    const disableJoin = isAllCheckout || isCancelled;
                    
                    let cancelButton = '';
                    if (canCancel) {
                        cancelButton = `
                            <button class="label label-sm label-danger ms-1" onclick="openGroupCancelBookingModal(${row.GroupID})" title="Cancel Group Booking" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px;">
                                <i class="fa fa-times"></i>
                            </button>`;
                    } else if (isCancelled) {
                        cancelButton = `
                            <button class="label label-sm label-danger ms-1" title="Cancelled" style="width: 30px; height: 30px;  padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px; opacity: 0.6; cursor: not-allowed;">
                                <i class="fa fa-ban"></i>
                            </button>`;
                    }

                    // Join group button: disabled when group is checked-out or cancelled
                    const joinGroupButton = disableJoin
                        ? `
                            <button class="label label-sm label-info ms-1" title="Join Group not allowed for checked-out or cancelled bookings" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px; background-color: #17a2b8 !important; border-color: #17a2b8 !important; opacity: 0.6; cursor: not-allowed;">
                                <i class="fa fa-user-plus"></i>
                            </button>`
                        : `
                            <button class="label label-sm label-info ms-1" onclick="joinExistingGroup(${row.GroupID})" title="Join Group (Add booking to this group)" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px; background-color: #17a2b8 !important; border-color: #17a2b8 !important;">
                                <i class="fa fa-user-plus"></i>
                            </button>`;

                    return `
                        <div style="text-align: center;">
                            <button id="${buttonId}" class="label label-sm label-billing" onclick="viewGroupBilling(${row.GroupID})" title="Billing" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px;">
                                <i class="fa fa-credit-card"></i>
                            </button>
                            <button class="label label-sm label-warning ms-1" onclick="editGroupBooking(${row.GroupID})" title="Edit Group Booking" style="width: 30px; height: 30px;  padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px;">
                                <i class="fa fa-edit"></i>
                            </button>
                            ${joinGroupButton}
                            <button id="${remarksBtnId}" class="label label-sm label-success ms-1" onclick="openGroupRemarksModal(${row.GroupID})" title="Remarks" style="width: 30px; height: 30px;  padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px; background-color: ${baseRemarksColor} !important; border-color: ${baseRemarksColor} !important;">
                                <i class="fa fa-comment-dots"></i>
                            </button>
                            <button class="label label-sm label-download ms-1" onclick="downloadGroupVoucher(${row.GroupID})" title="Download Voucher" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; margin: 0 2px; font-size: 12px;">
                                <i class="fa fa-download"></i>
                            </button>
                            ${cancelButton}
                        </div>`;
                }
            }
        ],
        language: {
            emptyTable: "No group bookings available."
        },
        columnDefs: [
            {
                targets: 0, // # column
                width: '40px',
                className: 'text-center'
            },
            {
                targets: 1, // GROUP NAME
                width: '100px'
            },
            {
                targets: 2, // CONTACT NUMBER
                width: '100px',
                className: 'text-center'
            },
            {
                targets: 3, // TOTAL ROOMS
                width: '80px',
                className: 'text-center'
            },
            {
                targets: 4, // ROOM NUMBERS
                width: '170px'
            },
            {
                targets: 5, // TOTAL PAYMENT
                width: '100px',
                className: 'text-right'
            },
            {
                targets: 6, // TOTAL BALANCE
                width: '100px',
                className: 'text-right'
            },
            {
                targets: 7, // PAYMENT STATUS
                width: '100px',
                className: 'text-center'
            },
            {
                targets: 8, // BOOKING CHANNEL
                width: '100px',
                className: 'text-center'
            },
            {
                targets: 9, // BOOKING STATUS
                width: '120px',
                className: 'text-center'
            },
            {
                targets: 10, // CREATED BY
                width: '100px',
                className: 'text-center'
            },
            {
                targets: 11, // ACTION
                width: '100px',
                className: 'text-center'
            }
        ]
    });
    
    // Handle custom tab clicks (Single/Group)
    $('.tab-item').on('click', function(e) {
        e.preventDefault();
        
        // Remove active class from all tabs
        $('.tab-item').removeClass('is-active');
        // Add active class to clicked tab
        $(this).addClass('is-active');
        
        // Get the href attribute
        let href = $(this).attr('href');
        
        // If it's a link to another page, navigate to it
        if (href && href !== '#') {
            window.location.href = href;
        }
    });
    
    // Note: Filter button clicks are handled in group_booking.ejs to have access to dateRangePicker
    // This handler is kept for backward compatibility but should not conflict
    // The main handler in group_booking.ejs clears dateRangePicker and includes scope parameter
    
    // When a group booking tab is clicked, update the DataTable AJAX URL accordingly.
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        // e.target's href is something like "#groupToday"
        let href = $(e.target).attr('href');
        // Remove the '#' and convert to lowercase, e.g., "grouptoday"
        let filter = href.replace('#', '').toLowerCase();
        
        // Build URL with highlight parameter if present
        let url = `/booking/group_booking_data?filter=${filter}`;
        if (highlightGroupId && String(highlightGroupId) !== '0' && String(highlightGroupId) !== '') {
            url += `&groupId=${highlightGroupId}`;
        }
        
        groupTable.ajax.url(url).load();
    });
});

// ==================== GROUP REMARKS MODAL ====================
function openGroupRemarksModal(groupId) {
    // Remove existing modal if any
    const existing = document.getElementById(`groupRemarksModal_${groupId}`);
    if (existing) existing.remove();

    const html = `
    <div class="modal fade" id="groupRemarksModal_${groupId}" tabindex="-1" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered" style="max-width: 700px;">
        <div class="modal-content">
          <style>
            /* Force readable colors for select and its selected value inside this modal */
            #groupRemarksModal_${groupId} .form-select,
            #groupRemarksModal_${groupId} .form-select option,
            #groupRemarksModal_${groupId} .form-select option:checked {
              color: #212529 !important;
              background-color: #ffffff !important;
            }
            #groupRemarksModal_${groupId} textarea.form-control {
              color: #212529 !important;
              background-color: #ffffff !important;
            }
          </style>
          <div class="modal-header py-2">
            <h6 class="mb-0"><i class="fas fa-sticky-note me-2"></i><strong>Group Remarks</strong></h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-3">
            <div class="card shadow-sm mb-3">
              <div class="card-header py-2"><h6 class="mb-0 text-primary"><i class="fas fa-plus-circle me-1"></i>Add New Remark</h6></div>
              <div class="card-body p-3">
                <form id="groupAddRemarkForm_${groupId}">
                  <div class="row">
                    <div class="col-md-12 mb-2">
                      <label class="form-label">Category</label>
                      <select class="form-select" id="groupRemarkCategory_${groupId}" required style="color:#212529;background-color:#ffffff;">
                        <option value="">Select Category</option>
                        <option value="Booking" style="color:#212529;">Booking</option>
                        <option value="Billing" style="color:#212529;">Billing</option>
                        
                        <option value="Memo" style="color:#212529;">Memo</option>
                        <option value="Discount" style="color:#212529;">Discount</option>
                        <option value="Service" style="color:#212529;">Service</option>
                      </select>
                    </div>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Remark/Note</label>
                    <textarea class="form-control" id="groupRemarkText_${groupId}" rows="3" placeholder="Enter your remark or note here..." required></textarea>
                  </div>
                  <div class="d-flex justify-content-end">
                    <button type="button" class="btn btn-secondary me-2" onclick="document.getElementById('groupRemarkText_${groupId}').value='';document.getElementById('groupRemarkCategory_${groupId}').value='';"><i class="fas fa-eraser me-1"></i>Clear</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>Add Remark</button>
                  </div>
                </form>
              </div>
            </div>
            <div class="card shadow-sm">
              <div class="card-header py-2"><h6 class="mb-0 text-success"><i class="fas fa-list me-1"></i>Existing Remarks</h6></div>
              <div class="card-body p-0">
                <div class="table-responsive">
                  <table class="table table-hover mb-0" id="groupRemarksTable_${groupId}">
                    <thead style="background-color: #6c757d; color: white;">
                      <tr>
                        <th style="width: 45%;">Remark</th>
                        <th style="width: 15%;">Category</th>
                        <th style="width: 15%;">User</th>
                        <th style="width: 15%;">Date</th>
                        <th style="width: 10%;">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="groupRemarksTableBody_${groupId}"></tbody>
                  </table>
                </div>
                <div id="groupNoRemarksMsg_${groupId}" class="text-center py-4 text-muted" style="display:none;">
                  <i class="fas fa-sticky-note fa-2x mb-2"></i>
                  <p class="mb-0">No remarks added yet.</p>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modal = new bootstrap.Modal(document.getElementById(`groupRemarksModal_${groupId}`));
    modal.show();

    // Load remarks
    loadGroupRemarks(groupId);

    // Submit handler
    document.getElementById(`groupAddRemarkForm_${groupId}`).addEventListener('submit', function(e){
        e.preventDefault();
        addGroupRemark(groupId);
    });
}

function loadGroupRemarks(groupId){
    fetch(`/booking/group_remarks/${groupId}`)
      .then(r=>r.json())
      .then(resp=>{
        const tbody = document.getElementById(`groupRemarksTableBody_${groupId}`);
        const empty = document.getElementById(`groupNoRemarksMsg_${groupId}`);
        tbody.innerHTML = '';
        const rows = (resp && resp.success && Array.isArray(resp.remarks)) ? resp.remarks : [];
        if (rows.length === 0){ empty.style.display='block'; return; } else { empty.style.display='none'; }
        rows.forEach(rm=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${(rm.REMARK_TEXT || '').replace(/\n/g,'<br>')}</td>
            <td>${rm.CATEGORY || ''}</td>
            <td>${rm.EDITDED_BY_NAME || rm.ENCODED_BY_NAME || ''}</td>
            <td><small>${rm.ENCODED_DT ? new Date(rm.ENCODED_DT).toLocaleDateString() : ''}<br>${rm.ENCODED_DT ? new Date(rm.ENCODED_DT).toLocaleTimeString() : ''}</small></td>
            <td>${rm.IDNo && rm.IDNo !== 0 ? `<i class="fas fa-trash text-danger" title="Delete Remark" style="cursor:pointer" onclick="deleteGroupRemark(${groupId}, ${rm.IDNo})"></i>` : ''}</td>`;
          tbody.appendChild(tr);
        });
      })
      .catch(err=>{ console.error('Error loading group remarks:', err); });
}

function addGroupRemark(groupId){
    const category = document.getElementById(`groupRemarkCategory_${groupId}`).value;
    const text = document.getElementById(`groupRemarkText_${groupId}`).value;
    if (!category || !text){ return; }
    fetch('/booking/group_remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, category, remarkText: text })
    }).then(r=>r.json()).then(resp=>{
        if (resp && resp.success){
            document.getElementById(`groupRemarkCategory_${groupId}`).value='';
            document.getElementById(`groupRemarkText_${groupId}`).value='';
            loadGroupRemarks(groupId);
            // Recolor button
            const btn = document.getElementById(`group_remarks_btn_${groupId}`);
            if (btn){ btn.style.backgroundColor = 'lightgreen'; btn.style.borderColor = 'lightgreen'; }
        } else {
            alert(resp.message || 'Failed to add remark');
        }
    }).catch(err=>{ console.error('Error adding remark:', err); });
}

function deleteGroupRemark(groupId, remarkId){
    if (!confirm('Are you sure you want to delete this remark?')) return;
    fetch(`/booking/remarks/${remarkId}`, { method: 'DELETE' })
      .then(r=>r.json()).then(resp=>{
        if (resp && resp.success){ loadGroupRemarks(groupId); }
      }).catch(err=>console.error('Error deleting remark:', err));
}

// Attach click event to set BookingID in modal for status change
$('#group_booking_tbl').on('click', 'span[data-bs-toggle="modal"]', function () {
    const bookingId = $(this).data('booking-id');
    $('#change_status').data('booking-id', bookingId);

    // If needed, handle logic here
});

// PRINT FUNCTION: Updated to use 'groupBillingModal' 
function printDiv(divId) {
    const printContents = document.getElementById(divId);
    const originalContents = document.body.innerHTML;

    // 1) Hide buttons before printing
    const buttons = printContents.querySelectorAll('button');
    buttons.forEach(button => button.style.display = 'none');
    
    // 2) Inject print-specific CSS for borderless or minimal margins (if desired)
    const style = document.createElement('style');
    style.setAttribute('media', 'print');
    style.textContent = `
      @page {
        size: A4;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100%;
        height: 100%;
      }
      .modal, .modal-dialog, .modal-content {
        position: static !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    // 3) Replace body content with the printable area
    document.body.innerHTML = printContents.innerHTML;

    // 4) Print
    window.print();

    // 5) Restore original content after printing
    document.body.innerHTML = originalContents;

    // (Optional) Remove the style tag if you don't want it to persist
    // document.head.removeChild(style);

    // 6) Reload page to restore modal functionality
    location.reload();
}

// Ensure the modal is reset properly when closed
document.getElementById('groupBillingModal').addEventListener('hidden.bs.modal', function () {
    const modalElement = document.getElementById('groupBillingModal');
    modalElement.innerHTML = modalElement.innerHTML; // Reset modal content
});

// Handle form submission for status change
$('#change_status').submit(function (e) {
    e.preventDefault();

    const status = $('#txtstatus').val();
    const bookingId = $(this).data('booking-id');

    $.ajax({
        url: '/booking/update_status',
        type: 'POST',
        data: { BookingID: bookingId, status: status },
        success: function (response) {
            if (response.success) {
                $('#group_booking_tbl').DataTable().ajax.reload();
                $('#modal-status').modal('hide');
                Swal.fire({
                    icon: 'success',
                    title: 'Status Updated',
                    text: 'The booking status has been updated successfully.',
                    confirmButtonText: 'OK'
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Failed to Update Status',
                    text: response.error || 'An error occurred while updating the status.',
                    confirmButtonText: 'Try Again'
                });
            }
        },
        error: function () {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'There was an issue connecting to the server. Please try again later.',
                confirmButtonText: 'OK'
            });
        }
    });
});

// VIEW SINGLE BOOKING FROM GROUP BOOKING
function viewSingleBooking(bookingId) {
    // Navigate to single booking page with highlight parameter
    window.open(`/booking?highlight=${bookingId}`, '_blank');
}

// SHOW GROUP BOOKING DETAILS MODAL
function viewGroupBooking(groupId) {
    $.ajax({
        url: `/booking/group_booking_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            let bookingTable = $('#groupBookingModal tbody');
            bookingTable.empty();

            if (data.bookingDetails && data.bookingDetails.length > 0) {
                data.bookingDetails.forEach(booking => {
                    let statusClass = "label-secondary";
                    if (booking.BOOKING_STATUS.toLowerCase() === "check-in") statusClass = "label-success";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "check-out") statusClass = "label-warning";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "pending") statusClass = "label-info";
                    else if (booking.BOOKING_STATUS.toLowerCase() === "cancelled") statusClass = "label-danger";

                    // Get booking_id (can be booking_id or bookingId depending on response)
                    const bookingId = booking.booking_id || booking.bookingId || booking.IDNo;
                    
                    let row = `
                        <tr>
                            <td>${booking.CUSTOMER_NAME || '-'}</td>
                            <td>${booking.ROOM_NUMBER}</td>
                            <td>${formatDate(booking.CHECK_IN_DATE)}</td>
                            <td>${formatDate(booking.CHECK_OUT_DATE)}</td>
                            <td><span class="label label-sm ${statusClass}">${booking.BOOKING_STATUS}</span></td>
                            <td>${parseFloat(booking.TOTAL_COST).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                            <td>${booking.SERVICES_AVAILED}</td>
                            <td class="text-center">
                                ${bookingId ? `
                                    <button class="btn btn-sm btn-primary" onclick="viewSingleBooking(${bookingId})" title="View Details" style="width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center;">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                ` : '-'}
                            </td>
                        </tr>`;
                    bookingTable.append(row);
                });
            } else {
                bookingTable.append(`<tr><td colspan="8" class="text-center">No individual bookings found.</td></tr>`);
            }

            // Fill summary table (separate table) if available
            if (data.summary) {
                const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const nRoom = parseFloat(data.summary.roomTotal || 0);
                const nServices = parseFloat(data.summary.servicesTotal || 0);
                const nExtensions = parseFloat(data.summary.extensionsTotal || 0);
                const nDiscount = parseFloat(data.summary.discount || 0);
                const nReservation = parseFloat(data.summary.reservationFee || 0);
                const nGrand = parseFloat(data.summary.grandTotal || 0);

                const summaryTbody = $('#groupBookingSummary tbody');
                summaryTbody.empty();

                const rows = [];
                rows.push(`<tr><td class="text-start">Rooms Total</td><td class="text-end">${fmt(nRoom)}</td></tr>`);
                if (nServices > 0) rows.push(`<tr><td class="text-start">Services Total</td><td class="text-end">${fmt(nServices)}</td></tr>`);
                if (nExtensions > 0) rows.push(`<tr><td class="text-start">Extensions Total</td><td class="text-end">${fmt(nExtensions)}</td></tr>`);
                if (nDiscount > 0) rows.push(`<tr><td class="text-start">Less: Discount</td><td class="text-end text-danger">-${fmt(nDiscount)}</td></tr>`);
                if (nReservation > 0) rows.push(`<tr><td class="text-start">Less: Reservation Fee</td><td class="text-end text-danger">-${fmt(nReservation)}</td></tr>`);

                summaryTbody.append(rows.join(''));
                $('#groupBookingSummaryGrand').html(`<b>${fmt(nGrand)}</b>`);
            }
            $('#groupBookingModal').modal('show');
        },
        error: function (error) {
            console.error("Error fetching group booking details:", error);
            alert("Failed to load group booking details.");
        }
    });
}

// SHOW GROUP BILLING
function viewGroupBilling(groupId) {
    $.ajax({
        url: `/booking/group_billing_details/${groupId}`,
        type: 'GET',
        success: function (data) {
            // Expose groupId to the modal for actions (e.g., generate invoice)
            var modalEl = document.getElementById('groupBillingModal');
            if (modalEl) { modalEl.dataset.groupId = groupId; }
            if (!data || (data.roomBillingDetails.length === 0 && data.serviceBillingDetails.length === 0)) {
                alert("No billing records found for this group.");
                return;
            }

            $('#confNumber').text(`${data.invoiceNumber}`);
            $('#GroupName').text(data.GroupName);
            $('#invoiceDate').text(new Date().toLocaleDateString());

            let billingTable = $('#billingDetails');
            billingTable.empty();

            // Use backend-computed totals
            let totalAmount = Math.max(0, parseFloat(data.grandTotal || 0));
            let totalPaid = Math.max(0, parseFloat(data.totalPaid || 0));
            let rowNumber = 1;

            let allBillingData = [...data.roomBillingDetails, ...data.serviceBillingDetails];
            
            // Sort the data by room number and booking ID
            allBillingData.sort((a, b) => {
                return a.ROOM_NUMBER - b.ROOM_NUMBER || a.BOOKING_ID - b.BOOKING_ID;
            });

            // Get discount early (needed in forEach loop)
            const discount = parseFloat(data.discount || 0);
            
            let currentRoom = null;
            let roomTotal = 0;
            let discountAppliedToRoom = false; // Track if discount has been applied to a room item

            allBillingData.forEach((bill, index) => {
                let chargeAmount = parseFloat(bill.charges) || 0;
                let amount = chargeAmount * (bill.room_qty || bill.service_qty || 1);
                let paidIcon = (bill.PAYMENT_STATUS === 'paid' || bill.STATUS === 'paid') ? '✅' : '';
                
                // Check if this is a room charge
                const description = (bill.description || '').toLowerCase();
                const isRoom = description.includes('room') || description.includes('bedroom') || description.includes('room charge');
                
                // Apply discount to first room item if discount exists
                if (isRoom && discount > 0 && !discountAppliedToRoom) {
                    amount = Math.max(0, amount - discount);
                    discountAppliedToRoom = true; // Mark that discount has been applied
                }

                // Show room totals when room changes
                if (currentRoom !== bill.ROOM_NUMBER && currentRoom !== null) {
                    // Insert total row for previous room
                    let totalRow = `
                        <tr class="room-total">
                            <td colspan="5" class="text-right"><b>Total for Room - ${currentRoom}:</b></td>
                            <td class="text-right"><b>${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
                        </tr>`;
                    billingTable.append(totalRow);
                    roomTotal = 0;
                }

                currentRoom = bill.ROOM_NUMBER;
                roomTotal += amount;

                // Check if service is Pick-up, Drop-off, or Upgrade - show hyphen for QTY
                const serviceName = (bill.description || '').toLowerCase();
                const isSpecialService = serviceName === 'upgrade' || serviceName === 'pick-up' || serviceName === 'drop-off';
                const qtyDisplay = isSpecialService ? '-' : (bill.room_qty || bill.service_qty || 1);

                let row = `
                    <tr data-booking-id="${bill.BOOKING_ID}">
                        <td class="text-center">${rowNumber++}</td>
                        <td class="text-center">Room - ${bill.ROOM_NUMBER}</td>
                        <td class="text-center">${bill.description} ${paidIcon}</td>
                        <td class="text-center">${chargeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="text-center">${qtyDisplay}</td>
                        <td class="text-right">${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <input type="hidden" name="bookingId[]" value="${bill.BOOKING_ID}">
                    </tr>`;
                billingTable.append(row);

                // If last item, insert final total row
                if (index === allBillingData.length - 1) {
                    let totalRow = `
                        <tr class="room-total">
                            <td colspan="5" class="text-right"><b>Total for Room - ${currentRoom}:</b></td>
                            <td class="text-right"><b>${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></td>
                        </tr>`;
                    billingTable.append(totalRow);
                }
            });

            // Get reservation fee from data (discount already parsed above)
            const reservationFee = parseFloat(data.reservationFee || 0);
            
            // Use backend totals directly
            const finalTotal = totalAmount;
            const appliedPaidAmount = Math.min(totalPaid, finalTotal);
            const balance = Math.max(0, finalTotal - appliedPaidAmount);
            
            // Update display values
            $('#totalAmount').text(finalTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#totalPaid').text(appliedPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#balanceAmount').text(balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            
            // Update reservation fee and discount fields
            if (reservationFee > 0) {
                $('#billingReservationFeeAmount').text(reservationFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                $('#reservationFeeRow').show();
            } else {
                $('#billingReservationFeeAmount').text('0.00');
                $('#reservationFeeRow').hide();
            }
            
            if (discount > 0) {
                $('#billingDiscountAmount').text(discount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                $('#discountRow').show();
            } else {
                $('#billingDiscountAmount').text('0.00');
                $('#discountRow').hide();
            }

            // Calculate Total Room Charges, Total Services, and Total Penalty from items
            let calculatedRoomTotal = 0;
            let calculatedServicesTotal = 0;
            let calculatedPenaltyTotal = 0;
            
            allBillingData.forEach(bill => {
                const amount = parseFloat(bill.charges || bill.service_cost || 0) * parseFloat(bill.room_qty || bill.service_qty || 1);
                const description = (bill.description || '').toLowerCase();
                
                if (description.includes('penalty') || description.includes('cancellation fee')) {
                    calculatedPenaltyTotal += amount;
                } else if (description.includes('room') || description.includes('bedroom')) {
                    calculatedRoomTotal += amount;
                } else {
                    calculatedServicesTotal += amount;
                }
            });
            
            // Use calculated values or fallback to backend values
            let groupRoomTotal = calculatedRoomTotal > 0 ? calculatedRoomTotal : parseFloat(data.roomTotal || 0);
            const groupServicesTotal = calculatedServicesTotal > 0 ? calculatedServicesTotal : parseFloat(data.servicesTotal || 0);
            const groupPenaltyTotal = calculatedPenaltyTotal > 0 ? calculatedPenaltyTotal : parseFloat(data.penaltyTotal || 0) || 0;
            
            // Apply discount to Total Room Charges (same as in table display)
            if (discount > 0 && groupRoomTotal > 0) {
                groupRoomTotal = Math.max(0, groupRoomTotal - discount);
            }
            
            $('#totalRoomCharges').text(groupRoomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            $('#totalServices').text(groupServicesTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            
            // Update Total Penalty (show/hide based on amount)
            const penaltyRow = $('#totalPenaltyRow');
            const penaltyElement = $('#totalPenalty');
            if (penaltyRow.length && penaltyElement.length) {
                if (groupPenaltyTotal > 0) {
                    penaltyRow.show();
                    penaltyElement.text(groupPenaltyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                } else {
                    penaltyRow.hide();
                }
            }

            // Check if fully paid based on balance (not just PAYMENT_STATUS, since penalty items might have different status)
            const isFullyPaid = balance <= 0 && appliedPaidAmount > 0 && finalTotal > 0;
            const billingType = parseInt(data.billingType || 0); // 1 = Consolidated/Master, 0 = Individual
            const paymentBtn = $('#groupProceedPaymentButton');
            
            // Disable button if Individual Billing (BILLING_TYPE = 0) or if fully paid
            if (billingType === 0) {
                paymentBtn.prop('disabled', true)
                    .text('Individual Billing - Please pay individually.')
                    .attr('title', 'Individual billing requires payment through individual room menus');
            } else if (isFullyPaid) {
                paymentBtn.prop('disabled', true).text('Payment Completed');
            } else {
                paymentBtn.prop('disabled', false).text('Proceed to Payment');
            }

            // Show/hide paid image based on payment status
            updateGroupPaymentStatus();

            $('#groupBillingModal').modal('show');
        },
        error: function (error) {
            console.error("Error fetching billing details:", error);
            alert("Failed to load billing details.");
        }
    });
}

// SHOW GROUP PAYMENT
function openGroupPaymentModal() {
    let selectedBookingIDs = [];
    let totalBalance = parseFloat($('#balanceAmount').text().replace(/[₹$,]/g, '')) || 0;

    $('#billingDetails tr').each(function () {
        let bookingID = $(this).data('booking-id');
        if (bookingID) {
            selectedBookingIDs.push(bookingID);
        }
    });

    $('#bookingID').val(selectedBookingIDs.join(','));
    $('#groupPaymentAmount').val(totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    
    // Update the enhanced payment modal fields with consistent formatting
    $('#groupPaymentTotalAmount').text(totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    $('#groupPaymentAmountInput').val(totalBalance);
    $('#groupPaymentAmountDisplay').text(totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    
    // Show payment modal WITHOUT closing the billing modal
    $('#group_modal-payment').modal('show');
}

// CONFIRM PAYMENT BUTTON FUNCTION
$(document).on('click', '#groupConfirmPaymentButton', function () {
    let bookingIDs = $('#bookingID').val().split(',');
    let amountPaid = parseFloat($('#groupPaymentAmount').val().replace(/,/g, '')) || 0;
    let paymentMethod = $('#groupPaymentMethod').val();

    if (amountPaid <= 0) {
        Swal.fire('Invalid Amount', 'Please enter a valid amount to pay.', 'warning');
        return;
    }
    if (!paymentMethod) {
        Swal.fire('No Payment Method', 'Please select a payment method.', 'warning');
        return;
    }

    Swal.fire({
        title: 'Confirm Payment',
        text: `Are you sure you want to proceed with the payment of ₱${amountPaid.toLocaleString()}?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Pay Now!',
        cancelButtonText: 'Cancel'
    }).then((result) => {
        if (result.isConfirmed) {
            let paymentNotes = $('#paymentNotes').val() || '';
            let paymentData = {
                bookingIDs: bookingIDs,
                amountPaid: amountPaid,
                paymentMethod: paymentMethod,
                paymentNotes: paymentNotes
            };

            $.ajax({
                url: '/booking/group_payment',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(paymentData),
                success: function (response) {
                    Swal.fire('Payment Successful!', 'The payment has been processed successfully.', 'success')
                        .then(() => {
                            $('#group_modal-payment').modal('hide');
                            location.reload();
                        });
                },
                error: function (error) {
                    console.error("Payment Error:", error);
                    Swal.fire('Payment Failed', 'Payment failed. Please try again.', 'error');
                }
            });
        }
    });
});

// Single definition of formatDate
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// Format currency helper function
function formatCurrency(value) {
    return `₱${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Populate Selected Room Prices breakdown (exposed for reuse)
// Mirrors the logic from the edit modal script to ensure availability here
function populateEditBreakdown(selectedRooms, computedPrices) {
  const container = $('#editGroupRoomBreakdown');
  container.empty();
  if (!selectedRooms || !selectedRooms.length) {
    return;
  }

  const mainNights = parseInt($('#editGroupNights').val(), 10) || 0;

  // Map: roomNumber -> nights from individual date inputs
  const individualNightsMap = {};
  $('.edit-individual-nights').each(function() {
    const roomNumber = $(this).data('room-number');
    const nights = parseInt($(this).val(), 10) || 0;
    if (roomNumber && nights > 0) {
      individualNightsMap[roomNumber] = nights;
    }
  });

  let html = '<div class="group-room-breakdown"><b>Selected Room Prices:</b><ul>';
  selectedRooms.forEach((room, idx) => {
    const price = computedPrices[idx] || 0;
    const roomNumber = room.ROOM_NUMBER || room.roomNumber;

    // Use individual nights if available, otherwise use main nights
    const nights = individualNightsMap[roomNumber] || mainNights;
    const total = nights > 0 ? price * nights : price;

    // Add indicator if using individual nights
    const nightsLabel = individualNightsMap[roomNumber]
      ? ` (${nights} nights - different dates)`
      : ` (${nights} nights)`;

    html += `<li>Room ${roomNumber}: ₱${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per night ${nights > 0 ? `(₱${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total${nightsLabel})` : ''}</li>`;
  });
  html += '</ul></div>';
  container.html(html);
}

function formatPaidAmount(input) {
    const value = parseFloat(input.value) || 0;
    input.value = value.toFixed(2);
}

// Compute total for edit group booking form
function computeEditGroupTotal() {
    // Get main nights (for bookings without individual dates)
    const mainNights = parseInt($('#editGroupNights').val(), 10) || 0;
    const pricesRaw = $('#editGroupSelectedRoomPrices').val();
    const prices = pricesRaw ? pricesRaw.split(',').map(p => parseFloat(p) || 0) : [];
    
    // Get individual booking dates and map to room numbers
    // Map: roomNumber -> nights
    const individualNightsMap = {};
    $('.edit-individual-nights').each(function() {
      const roomNumber = $(this).data('room-number');
      const nights = parseInt($(this).val(), 10) || 0;
      if (roomNumber && nights > 0) {
        individualNightsMap[roomNumber] = nights;
      }
    });
    
    // Get selected room IDs and map to room numbers
    const selectedRoomIds = $('#editGroupSelectedRooms').val();
    const selectedRoomIdsArray = selectedRoomIds ? selectedRoomIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
    
    // Create map: roomId -> roomNumber from bookings data (most reliable)
    const roomIdToNumberMap = {};
    if (window.editGroupBookingsData && window.editGroupBookingsData.length > 0) {
      window.editGroupBookingsData.forEach(b => {
        const roomId = b.ROOM_ID || b.roomId;
        const roomNumber = b.ROOM_NUMBER || b.roomNumber;
        if (roomId && roomNumber) {
          roomIdToNumberMap[roomId] = roomNumber;
        }
      });
    }
    
    // Fallback: Try to get room numbers from the breakdown HTML if bookings data not available
    if (Object.keys(roomIdToNumberMap).length === 0) {
      const breakdownHtml = $('#editGroupRoomBreakdown').html() || '';
      if (breakdownHtml) {
        const roomMatches = breakdownHtml.match(/Room\s+(\d+):/g);
        if (roomMatches) {
          roomMatches.forEach((match, idx) => {
            const roomNumMatch = match.match(/Room\s+(\d+)/);
            if (roomNumMatch && selectedRoomIdsArray[idx]) {
              roomIdToNumberMap[selectedRoomIdsArray[idx]] = roomNumMatch[1];
            }
          });
        }
      }
    }
    
    // Calculate room subtotal per room (using individual nights if available)
    let roomSubtotal = 0;
    prices.forEach((price, idx) => {
      const roomId = selectedRoomIdsArray[idx];
      const roomNumber = roomId ? roomIdToNumberMap[roomId] : null;
      
      // Use individual nights if available for this room, otherwise use main nights
      const nights = (roomNumber && individualNightsMap[roomNumber]) ? individualNightsMap[roomNumber] : mainNights;
      roomSubtotal += price * nights;
    });

    const adultQty = $('#editGroupIncludeBreakfast').is(':checked') ? (parseInt($('#editGroupBreakfastAdultQty').val(), 10) || 0) : 0;
    const adultPrice = parseFloat($('#editGroupBreakfastAdultPrice').val()) || 0;
    const kidQty = $('#editGroupIncludeBreakfast').is(':checked') ? (parseInt($('#editGroupBreakfastKidQty').val(), 10) || 0) : 0;
    const kidPrice = parseFloat($('#editGroupBreakfastKidPrice').val()) || 0;
    const breakfastIndividual = $('#editGroupBreakfastIndividual').is(':checked');

    const pickupPrice = $('#editGroupIncludePickup').is(':checked') ? parseFloat($('#editGroupPickupPrice').val()) || 0 : 0;
    const dropoffPrice = $('#editGroupIncludeDropoff').is(':checked') ? parseFloat($('#editGroupDropoffPrice').val()) || 0 : 0;

    // Get number of rooms for individual service calculations
    const selectedRooms = $('#editGroupSelectedRooms').val();
    const numRooms = selectedRooms ? selectedRooms.split(',').length : 1;

    const breakfastTotal = (adultQty * adultPrice) + (kidQty * kidPrice);
    const breakfastTotalWithIndividual = breakfastIndividual ? breakfastTotal * numRooms : breakfastTotal;

    const servicesTotal = breakfastTotalWithIndividual + pickupPrice + dropoffPrice;

    // Get late check-out fee (PER ROOM - multiply by number of rooms)
    // Reuse numRooms variable already declared above
    const lateCheckoutFeePerRoom = parseFloat($('#editGroupLateCheckoutFee').val()) || 0;
    const lateCheckoutFeeTotal = lateCheckoutFeePerRoom * numRooms;

    // Calculate extra services total
    const groupBookingId = $('#editGroupBookingId').val();
    let extraServicesTotal = 0;
    if (groupBookingId && window.editGroupAddedServicesMap && window.editGroupAddedServicesMap[groupBookingId]) {
        window.editGroupAddedServicesMap[groupBookingId].forEach(service => {
            if (!service.HIDDEN_FOR_UI) {
                const serviceCost = parseFloat(service.SERVICE_COST) || 0;
                const quantity = parseInt(service.QUANTITY) || 0;
                extraServicesTotal += serviceCost * quantity;
            }
        });
    }

    // Check if individual billing is enabled (inverted logic)
    const isConsolidated = !$('#editGroupIndividualBilling').is(':checked');

    // Always calculate the full total in frontend for user visibility
    const subtotal = roomSubtotal + servicesTotal + lateCheckoutFeeTotal + extraServicesTotal;
    
    // Senior/PWD Discount (percentage-based)
    const seniorPwdDiscountChecked = $('#editGroupIncludeSeniorPwdDiscount').prop('checked');
    let seniorPwdDiscountAmount = 0;
    
    // Get number of rooms (reuse existing variables if already declared)
    const editSelectedRooms = $('#editGroupSelectedRooms').val();
    const editNumRooms = editSelectedRooms ? editSelectedRooms.split(',').length : 1;
    
    // Update total rooms display
    $('#editGroupTotalRoomsDisplay').text(editNumRooms);
    
    // Calculate Senior/PWD discount (percentage of ROOM CHARGES ONLY, not services)
    if (seniorPwdDiscountChecked && roomSubtotal > 0 && editNumRooms > 0) {
        let discountPercent = parseFloat($('#editGroupSeniorPwdDiscountPercent').val()) || 20; // Default to 20%
        let seniorPwdRoomCount = parseInt($('#editGroupSeniorPwdRoomCount').val()) || 0;
        
        // Enforce maximum of 100%
        if (discountPercent > 100) {
            discountPercent = 100;
            $('#editGroupSeniorPwdDiscountPercent').val(100);
        }
        if (discountPercent < 0) {
            discountPercent = 0;
            $('#editGroupSeniorPwdDiscountPercent').val(0);
        }
        
        // Ensure Senior/PWD room count doesn't exceed total rooms
        if (seniorPwdRoomCount > editNumRooms) {
            seniorPwdRoomCount = editNumRooms;
            $('#editGroupSeniorPwdRoomCount').val(editNumRooms);
        }
        if (seniorPwdRoomCount < 0) {
            seniorPwdRoomCount = 0;
            $('#editGroupSeniorPwdRoomCount').val(0);
        }
        
        // Calculate discount only for Senior/PWD rooms
        // Since room prices can differ (1-bed vs 2-bed), we apply discount to the most expensive rooms first
        // Sort prices from highest to lowest and apply discount to top N rooms (where N = seniorPwdRoomCount)
        const sortedPrices = [...prices].sort((a, b) => b - a); // Sort descending (highest first)
        const seniorPwdPrices = sortedPrices.slice(0, seniorPwdRoomCount); // Get top N most expensive rooms
        const seniorPwdRoomChargesPerNight = seniorPwdPrices.reduce((sum, price) => sum + price, 0);
        const seniorPwdRoomCharges = seniorPwdRoomChargesPerNight * nights; // Total charges for Senior/PWD rooms
        const discountDecimal = discountPercent / 100; // Convert percentage to decimal
        seniorPwdDiscountAmount = seniorPwdRoomCharges * discountDecimal; // Apply only to Senior/PWD room charges
        
        $('#editGroupSeniorPwdDiscount').val(seniorPwdDiscountAmount.toFixed(2));
        $('#editGroupSeniorPwdDiscountAmount').val('₱' + seniorPwdDiscountAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        $('#editGroupSeniorPwdDiscountDisplay').show();
        
        // If Senior/PWD discount is 100%, automatically disable Additional Discount
        if (discountPercent >= 100) {
            $('#editGroupIncludeDiscount').prop('checked', false);
            $('#editGroupDiscountWrapper').hide();
            $('#editGroupDiscount').val('0');
        }
    } else {
        $('#editGroupSeniorPwdDiscount').val(0);
        $('#editGroupSeniorPwdDiscountAmount').val('');
        $('#editGroupSeniorPwdDiscountDisplay').hide();
    }
    
    const discount = $('#editGroupIncludeDiscount').prop('checked') ? (parseFloat($('#editGroupDiscount').val()) || 0) : 0;
    
    let finalBalance = subtotal - seniorPwdDiscountAmount - discount;
    
    // Ensure finalBalance is not negative
    if (finalBalance < 0) {
        finalBalance = 0;
    }

    // Get paid amount and validate it doesn't exceed total
    let paidAmount = parseFloat($('#editGroupPaidAmount').val()) || 0;
    
    // Prevent paid amount from exceeding total and ensure it's not negative
    if (paidAmount > finalBalance) {
        paidAmount = finalBalance;
        $('#editGroupPaidAmount').val(paidAmount.toFixed(2));
    }
    // Ensure paid amount is not negative
    if (paidAmount < 0) {
        paidAmount = 0;
        $('#editGroupPaidAmount').val('0.00');
    }
    
    // Calculate balance (total - paid amount)
    const balance = finalBalance - paidAmount;
    
    // Determine payment status
    let paymentStatus;
    if (paidAmount <= 0) {
        paymentStatus = 'unpaid';
    } else if (paidAmount >= finalBalance) {
        paymentStatus = 'paid';
    } else {
        paymentStatus = 'partial';
    }
    
    // Update payment status field
    $('#editGroupPaymentStatus').val(paymentStatus);
    
    // Update payment status styling with CSS classes
    $('#editGroupPaymentStatus').removeClass('status-paid status-partial status-unpaid');
    if (paymentStatus === 'paid') {
        $('#editGroupPaymentStatus').addClass('status-paid');
    } else if (paymentStatus === 'partial') {
        $('#editGroupPaymentStatus').addClass('status-partial');
    } else {
        $('#editGroupPaymentStatus').addClass('status-unpaid');
    }

    // Update paid amount display (format without currency symbol)
    $('#editGroupComputedPaidAmount').html('<b>' + paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
    
    // Update balance display (format without currency symbol)
    $('#editGroupComputedBalance').html('<b>' + balance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');

    if (isConsolidated) {
        // Show consolidated total with indicator
        if (finalBalance < 0) {
            $('#editGroupComputedTotal').html(`<b class="text-warning">0.00 <small>(Master)</small></b>`);
        } else {
            $('#editGroupComputedTotal').html(`<b>${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <small class="text-info">(Master)</small></b>`);
        }
    } else {
        // Regular billing calculation
        if (finalBalance < 0) {
            $('#editGroupComputedTotal').html('<b class="text-warning">0.00</b>');
        } else {
            $('#editGroupComputedTotal').html('<b>' + finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</b>');
        }
    }
}

// Edit Group Booking function
function editGroupBooking(groupBookingId) {
    // Fetch group booking details for editing
    fetch(`/booking/edit_group_booking/${groupBookingId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Set the booking ID first (this prevents modal reset from clearing it)
                $('#editGroupBookingId').val(data.booking.groupBookingId);

                // Ensure guest type and level dropdowns are loaded before populating form
                ensureGuestDataLoaded().then(() => {
                    populateEditGroupForm(data.booking);
                    $('#modal-edit-group-booking').modal('show');
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error!',
                    text: data.message || 'Failed to fetch group booking details',
                    confirmButtonText: 'OK'
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error!',
                text: 'An error occurred while fetching group booking details',
                confirmButtonText: 'OK'
            });
        });
}

// Ensure guest type and level data is loaded
function ensureGuestDataLoaded() {
    return new Promise((resolve) => {
        // Check if guest type dropdown has options (excluding the disabled placeholder)
        const guestTypeSelect = $('#editGroupGuestType');
        const guestLevelSelect = $('#editGroupGuestLevel');

        if (guestTypeSelect.find('option').length > 1 && guestLevelSelect.find('option').length > 1) {
            // Data already loaded
            resolve();
            return;
        }

        // Load guest types if not already loaded
        if (guestTypeSelect.find('option').length <= 1) {
            $.ajax({
                url: '/booking/get_guest_types',
                method: 'GET',
                success: function(data) {
                    guestTypeSelect.empty();
                    guestTypeSelect.append('<option value="" disabled>Guest Type</option>');
                    (data || []).forEach(type => {
                        guestTypeSelect.append(`<option value="${type.IDNo}">${type.TYPE}</option>`);
                    });
                },
                error: function(err) {
                    console.error('Error fetching guest types:', err);
                    guestTypeSelect.html('<option value="" disabled>Error loading guest types</option>');
                }
            });
        }

        // Load guest levels if not already loaded
        if (guestLevelSelect.find('option').length <= 1) {
            $.ajax({
                url: '/booking/get_guest_level',
                method: 'GET',
                success: function(data) {
                    guestLevelSelect.empty();
                    guestLevelSelect.append('<option value="" disabled>Guest Level</option>');
                    (data || []).forEach(level => {
                        guestLevelSelect.append(`<option value="${level.IDNo}">${level.TYPE}</option>`);
                    });
                },
                error: function(err) {
                    console.error('Error fetching guest levels:', err);
                    guestLevelSelect.html('<option value="" disabled>Error loading guest levels</option>');
                }
            });
        }

        // Wait a bit for AJAX calls to complete, then resolve
        setTimeout(resolve, 300);
    });
}

// Store bookings data globally for total calculation
window.editGroupBookingsData = null;

// Function to populate edit group form
function populateEditGroupForm(booking) {
    // Store bookings data globally for total calculation
    window.editGroupBookingsData = booking.bookings || [];
    
    // Set hidden fields
    $('#editGroupBookingId').val(booking.groupBookingId);
    $('#editGroupSelectedRooms').val(booking.selectedRooms);
    $('#editGroupSelectedRoomPrices').val(booking.selectedRoomPrice);
    $('#editGroupNights').val(booking.qty);

    // Populate selected rooms for pre-selection in room search results
    if (booking.selectedRooms) {
        window.editGroupManualSelectedRooms = booking.selectedRooms.split(',').map(id => {
            const parsed = parseInt(id.trim());
            return isNaN(parsed) ? id.trim() : parsed; // Keep as string if not a number
        }).filter(id => id !== '');
    } else {
        window.editGroupManualSelectedRooms = [];
    }

    // Set form fields
    $('#editGroupDaterange').val(booking.daterange);
    $('#editGroupName').val(booking.groupName);
    $('#editGroupContact').val(booking.groupContact);
    $('#editGroupNumberOfRooms').val(booking.numberOfRooms);
    $('#editGroupPaymentStatus').val(booking.paymentStatus);
    $('#editGroupBookingRoute').val(booking.bookingRoute);

    // Handle individual booking dates if they differ from main date range
    if (booking.bookings && booking.bookings.length > 0) {
        // Use moment to avoid timezone shifts (treat dates as local dates)
        const formatDate = (d) => moment(d).format('YYYY-MM-DD');
        const mainCheckInStr = formatDate(booking.bookings[0].CHECK_IN_DATE);
        const mainCheckOutStr = formatDate(booking.bookings[0].CHECK_OUT_DATE);
        const bookingsWithDifferentDates = [];
        
        // Check if any booking has different dates
        booking.bookings.forEach((b, index) => {
            const bookingCheckInStr = formatDate(b.CHECK_IN_DATE);
            const bookingCheckOutStr = formatDate(b.CHECK_OUT_DATE);
            
            if (index > 0 && (
                bookingCheckInStr !== mainCheckInStr ||
                bookingCheckOutStr !== mainCheckOutStr
            )) {
                bookingsWithDifferentDates.push({
                    bookingId: b.BOOKING_ID || b.bookingId,
                    roomNumber: b.ROOM_NUMBER || b.roomNumber,
                    checkIn: bookingCheckInStr,
                    checkOut: bookingCheckOutStr,
                    index: index
                });
            }
        });
        
        // Show individual dates section if there are different dates
        if (bookingsWithDifferentDates.length > 0) {
            displayIndividualBookingDates(bookingsWithDifferentDates);
        } else {
            $('#editGroupIndividualDatesSection').hide();
        }
    } else {
        $('#editGroupIndividualDatesSection').hide();
    }

    // Set bed requirements derived from selected rooms
    if (booking.bedRequirements) {
        $('#editGroupBed1Count').val(booking.bedRequirements.bed1 || 0);
        $('#editGroupBed2Count').val(booking.bedRequirements.bed2 || 0);
    }

    // Set guest type and level after ensuring dropdowns are loaded
    setTimeout(() => {
        // Ensure values are the correct type (string vs number)
        const guestTypeValue = String(booking.guestType || '');
        const guestLevelValue = String(booking.guestLevel || '');

        $('#editGroupGuestType').val(guestTypeValue);
        $('#editGroupGuestLevel').val(guestLevelValue);

        // Force trigger change events to update UI
        $('#editGroupGuestType').trigger('change');
        $('#editGroupGuestLevel').trigger('change');
    }, 200);

    $('#editGroupCheckInStatus').val(booking.checkInStatus);
    $('#editGroupCheckOutStatus').val(booking.checkOutStatus);
    $('#editGroupRemarks').val(booking.remarks);
    
    // Set late checkout fee
    const lateCheckoutFee = parseFloat(booking.lateCheckoutFee) || 0;
    $('#editGroupLateCheckoutFee').val(lateCheckoutFee);
    $('#editGroupLateCheckoutFeeInput').val(lateCheckoutFee);
    
    // Show/hide late checkout fee display based on checkOutStatus
    if (booking.checkOutStatus == 1 && lateCheckoutFee > 0) {
        $('#editGroupLateCheckoutFeeDisplay').show();
    } else {
        $('#editGroupLateCheckoutFeeDisplay').hide();
    }
    $('#editGroupAgencySelect').val(booking.agencyId);

    // ================= SENIOR/PWD DISCOUNT (EDIT) =================
    // If there is a stored Senior/PWD discount percentage on the group,
    // enable the Senior/PWD section and prefill the percentage.
    const seniorPercent = parseFloat(booking.seniorPwdDiscountPercent) || 0;
    const seniorCountFromDb = parseInt(booking.seniorPwdRoomCount, 10) || 0;

    if (seniorPercent > 0) {
        $('#editGroupIncludeSeniorPwdDiscount').prop('checked', true);
        $('#editGroupSeniorPwdDiscountDisplay').show();
        $('#editGroupSeniorPwdDiscountPercent').val(seniorPercent);
        // Use stored room count; default to 1 if somehow 0
        $('#editGroupSeniorPwdRoomCount').val(seniorCountFromDb > 0 ? seniorCountFromDb : 1);
    } else {
        $('#editGroupIncludeSeniorPwdDiscount').prop('checked', false);
        $('#editGroupSeniorPwdDiscountDisplay').hide();
        $('#editGroupSeniorPwdDiscountPercent').val(20);
        $('#editGroupSeniorPwdDiscountAmount').val('');
        $('#editGroupSeniorPwdDiscount').val('0');
    }

    // Initialize Paid Amount like single edit: prefer paidAmount, then totalPaid, else 0
    if (booking.paidAmount !== undefined && booking.paidAmount !== null && booking.paidAmount !== '') {
        const initPaid = parseFloat(booking.paidAmount) || 0;
        $('#editGroupPaidAmount').val(initPaid.toFixed(2));
    } else if (booking.totalPaid !== undefined && booking.totalPaid !== null && booking.totalPaid !== '') {
        const initPaid = parseFloat(booking.totalPaid) || 0;
        $('#editGroupPaidAmount').val(initPaid.toFixed(2));
    } else {
        // leave as default
    }
    
    // Trigger computation after setting paid amount and senior fields
    setTimeout(() => {
        computeEditGroupTotal();
    }, 100);

    // Set fees - explicitly handle checked/unchecked state
    if (parseFloat(booking.reservationFee) > 0) {
        $('#editGroupIncludeReservationFee').prop('checked', true);
        $('#editGroupReservationFeeWrapper').show();
        $('#editGroupReservationFee').val(booking.reservationFee);
    } else {
        $('#editGroupIncludeReservationFee').prop('checked', false);
        $('#editGroupReservationFeeWrapper').hide();
        $('#editGroupReservationFee').val('0');
    }

    // Additional discount:
    // If we have a Senior/PWD percentage stored, assume GROUP_DISCOUNT
    // came from Senior/PWD and default Additional Discount to 0.
    if (seniorPercent <= 0 && parseFloat(booking.discount) > 0) {
        $('#editGroupIncludeDiscount').prop('checked', true);
        $('#editGroupDiscountWrapper').show();
        $('#editGroupDiscount').val(booking.discount);
    } else {
        $('#editGroupIncludeDiscount').prop('checked', false);
        $('#editGroupDiscountWrapper').hide();
        $('#editGroupDiscount').val('0');
    }

    // Set individual billing (inverted logic: if consolidatedBilling is true, checkbox is unchecked)
    $('#editGroupIndividualBilling').prop('checked', booking.consolidatedBilling === false);

    // Set services - explicitly handle checked/unchecked state
    const hasBreakfast = parseInt(booking.breakfastAdultQty) > 0 || parseInt(booking.breakfastKidQty) > 0;
    if (hasBreakfast) {
        $('#editGroupIncludeBreakfast').prop('checked', true);
        $('#editGroupBreakfastFields').removeClass('d-none');
        
        // Set breakfast individual checkbox based on backend detection
        $('#editGroupBreakfastIndividual').prop('checked', booking.breakfastIndividual === true);
		$('#editGroupBreakfastAdultQty').val(booking.breakfastAdultQty);
		// Use unit price = TOTAL_COST / QTY when QTY > 0; otherwise leave as-is
		var _adultQty = parseFloat(booking.breakfastAdultQty) || 0;
		var _adultTotal = parseFloat(booking.breakfastAdultPrice) || 0;
		$('#editGroupBreakfastAdultPrice').val(_adultQty > 0 ? (_adultTotal / _adultQty).toFixed(2) : _adultTotal);
        $('#editGroupBreakfastAdultId').val(booking.breakfastAdultId);
		$('#editGroupBreakfastKidQty').val(booking.breakfastKidQty);
		var _kidQty = parseFloat(booking.breakfastKidQty) || 0;
		var _kidTotal = parseFloat(booking.breakfastKidPrice) || 0;
		$('#editGroupBreakfastKidPrice').val(_kidQty > 0 ? (_kidTotal / _kidQty).toFixed(2) : _kidTotal);
        $('#editGroupBreakfastKidId').val(booking.breakfastKidId);
    } else {
        $('#editGroupIncludeBreakfast').prop('checked', false);
        $('#editGroupBreakfastFields').addClass('d-none');
        $('#editGroupBreakfastAdultQty, #editGroupBreakfastKidQty').val('');
        // Set default service IDs when no breakfast is selected
        $('#editGroupBreakfastAdultId').val('74'); // Default breakfast adult service ID
        $('#editGroupBreakfastKidId').val('75'); // Default breakfast kid service ID
    }

    if (parseFloat(booking.pickupPrice) > 0) {
        $('#editGroupIncludePickup').prop('checked', true);
        $('#editGroupPickupWrapper').show();
        $('#editGroupPickupPrice').val(booking.pickupPrice);
        $('#editGroupPickupServiceId').val(booking.pickupServiceId);
    } else {
        $('#editGroupIncludePickup').prop('checked', false);
        $('#editGroupPickupWrapper').hide();
        $('#editGroupPickupPrice').val('');
        // Set default pickup service ID when no pickup is selected
        $('#editGroupPickupServiceId').val('76'); // Default pickup service ID
    }

    if (parseFloat(booking.dropoffPrice) > 0) {
        $('#editGroupIncludeDropoff').prop('checked', true);
        $('#editGroupDropoffWrapper').show();
        $('#editGroupDropoffPrice').val(booking.dropoffPrice);
        $('#editGroupDropoffServiceId').val(booking.dropoffServiceId);
    } else {
        $('#editGroupIncludeDropoff').prop('checked', false);
        $('#editGroupDropoffWrapper').hide();
        $('#editGroupDropoffPrice').val('');
        // Set default dropoff service ID when no dropoff is selected
        $('#editGroupDropoffServiceId').val('77'); // Default dropoff service ID
    }

    // Show/hide agency wrapper based on booking route
    if (booking.bookingRoute === 'agency') {
        $('#editGroupAgencyWrapper').show();
    } else {
        $('#editGroupAgencyWrapper').hide();
    }

    // Handle individual booking dates if they differ from main date range
    if (booking.bookings && booking.bookings.length > 0) {
        const mainCheckIn = new Date(booking.bookings[0].CHECK_IN_DATE);
        const mainCheckOut = new Date(booking.bookings[0].CHECK_OUT_DATE);
        const bookingsWithDifferentDates = [];
        
        // Check if any booking has different dates
        booking.bookings.forEach((b, index) => {
            const bookingCheckIn = new Date(b.CHECK_IN_DATE);
            const bookingCheckOut = new Date(b.CHECK_OUT_DATE);
            
            if (index > 0 && (
                bookingCheckIn.getTime() !== mainCheckIn.getTime() ||
                bookingCheckOut.getTime() !== mainCheckOut.getTime()
            )) {
                bookingsWithDifferentDates.push({
                    bookingId: b.BOOKING_ID || b.bookingId,
                    roomNumber: b.ROOM_NUMBER || b.roomNumber,
                    checkIn: b.CHECK_IN_DATE,
                    checkOut: b.CHECK_OUT_DATE,
                    index: index
                });
            }
        });
        
        // Show individual dates section if there are different dates
        if (bookingsWithDifferentDates.length > 0) {
            displayIndividualBookingDates(bookingsWithDifferentDates);
        } else {
            $('#editGroupIndividualDatesSection').hide();
        }
    } else {
        $('#editGroupIndividualDatesSection').hide();
    }

    // Load extra services for the group booking
    if (booking.groupBookingId) {
        if (typeof loadEditGroupExistingServices === 'function') {
            loadEditGroupExistingServices(booking.groupBookingId);
        }
    }

    // Auto-search for rooms after populating form data
    setTimeout(() => {
        if ($('#editGroupDaterange').val() && $('#editGroupNumberOfRooms').val() && 
            $('#editGroupBookingRoute').val() && $('#editGroupCheckInStatus').val() && 
            $('#editGroupCheckOutStatus').val()) {
            $('#editGroupSearchRooms').click();
        }
    }, 500);
}

// Function to display individual booking dates that differ from main date range
function displayIndividualBookingDates(bookingsWithDifferentDates) {
    const container = $('#editGroupIndividualDatesList');
    container.empty();
    
    const toDateStr = (d) => moment(d).format('YYYY-MM-DD');
    const diffNights = (inStr, outStr) => moment(outStr, 'YYYY-MM-DD').diff(moment(inStr, 'YYYY-MM-DD'), 'days');
    
    bookingsWithDifferentDates.forEach(booking => {
        const checkInStr = toDateStr(booking.checkIn);
        const checkOutStr = toDateStr(booking.checkOut);
        const nights = diffNights(checkInStr, checkOutStr);
        
        const dateRow = $(`
            <div class="mb-3" style="background-color: #1f262a; border-radius: 6px; padding: 12px; border: 1px solid rgba(255, 255, 255, 0.08);">
                <div class="row align-items-center">
                    <div class="col-lg-3">
                        <label class="form-label mb-1" style="font-size: 12px; color: #9fe073; font-weight: 600;">
                            <i class="fa fa-door-open me-1"></i>Room ${booking.roomNumber}
                        </label>
                    </div>
                    <div class="col-lg-4">
                        <label class="form-label mb-1" style="font-size: 11px;">Check-In Date</label>
                        <input type="date" class="form-control edit-individual-checkin" 
                               data-booking-id="${booking.bookingId}" 
                               value="${checkInStr}" 
                               style="background-color: #41474c; color: #ffffff; border: 1px solid #41474c;">
                    </div>
                    <div class="col-lg-4">
                        <label class="form-label mb-1" style="font-size: 11px;">Check-Out Date</label>
                        <input type="date" class="form-control edit-individual-checkout" 
                               data-booking-id="${booking.bookingId}" 
                               value="${checkOutStr}" 
                               style="background-color: #41474c; color: #ffffff; border: 1px solid #41474c;">
                    </div>
                    <div class="col-lg-1">
                        <label class="form-label mb-1" style="font-size: 11px;">Nights</label>
                        <input type="text" class="form-control edit-individual-nights" 
                               data-booking-id="${booking.bookingId}" 
                               data-room-number="${booking.roomNumber}"
                               value="${nights}" 
                               readonly 
                               style="background-color: #2a3135; color: #6f9c40; font-weight: bold; text-align: center;">
                    </div>
                </div>
            </div>
        `);
        
        container.append(dateRow);
    });
    
    // Show the section
    $('#editGroupIndividualDatesSection').show();
    
    // Update nights when dates change and refresh breakdown/total
    // Use event delegation to handle dynamically added elements
    $(document).off('change', '.edit-individual-checkin, .edit-individual-checkout'); // Remove old handlers
    $(document).on('change', '.edit-individual-checkin, .edit-individual-checkout', function() {
        const bookingId = $(this).data('booking-id');
        const checkInInput = $(`.edit-individual-checkin[data-booking-id="${bookingId}"]`);
        const checkOutInput = $(`.edit-individual-checkout[data-booking-id="${bookingId}"]`);
        const nightsInput = $(`.edit-individual-nights[data-booking-id="${bookingId}"]`);
        
        const checkInStr = checkInInput.val();
        const checkOutStr = checkOutInput.val();
        
        if (checkInStr && checkOutStr) {
            const nights = diffNights(checkInStr, checkOutStr);
            nightsInput.val(nights);
        } else {
            nightsInput.val('0');
        }
        
        // Recompute totals and refresh room breakdown immediately
        computeEditGroupTotal();
        
        // Refresh breakdown using current bookings data + prices
        if (Array.isArray(window.editGroupBookingsData)) {
          const pricesRaw = $('#editGroupSelectedRoomPrices').val();
          const computedPrices = pricesRaw ? pricesRaw.split(',').map(p => parseFloat(p) || 0) : [];
          populateEditBreakdown(window.editGroupBookingsData, computedPrices);
        }
    });

    (() => {
        // Only search if we have the required data
        const daterange = $('#editGroupDaterange').val();
        const numberOfRooms = $('#editGroupNumberOfRooms').val();
        const bookingRoute = $('#editGroupBookingRoute').val();

        if (daterange && numberOfRooms && bookingRoute) {
            // Trigger room search
            $('#editGroupSearchRooms').click();
            // Compute total after room search completes (with delay to allow AJAX to finish)
            setTimeout(() => {
                computeEditGroupTotal();
            }, 2000);
        } else {
            // If no room search, compute immediately
            computeEditGroupTotal();
        }
    }, 1000); // Increased delay to ensure form is fully populated
}

// ==================== GROUP CANCEL BOOKING FUNCTIONALITY ====================

// OPEN GROUP CANCEL BOOKING MODAL
function openGroupCancelBookingModal(groupId) {
    // Set the group ID and show the cancel modal
    $('#cancelGroupBookingId').val(groupId);
    $('#groupCancelReason').val('');
    $('#groupManualRefund').val('');
    $('#groupManualOverrideToggle').prop('checked', false);
    $('#groupManualFields').hide();
    
    $('#modal-cancel-group-booking').modal('show');
}

// ==================== END OF GROUP CANCEL BOOKING FUNCTIONALITY ====================

// Function to download group voucher
function downloadGroupVoucher(groupId) {
    // Show loading indicator
    Swal.fire({
        title: 'Generating Voucher...',
        text: 'Please wait while we prepare your voucher.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // First, fetch the group voucher data
    $.ajax({
        url: `/booking/get-group-voucher-data/${groupId}`,
        method: 'GET',
        success: function (response) {
            if (response.success && response.data) {
                const data = response.data;
                
                // Use confirmation number from main booking as voucher number
                // If no confirmation number, fallback to auto-generated
                let vno = data.confirmationNumber;
                if (!vno) {
                    const now = new Date();
                    const yyyy = now.getFullYear();
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const dd = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    vno = `GV${yyyy}${mm}${dd}${hours}${minutes}`;
                }

                // Prepare voucher data
                const bookingData = {
                    voucherNo: vno,
                    groupName: data.groupName || 'Group Booking',
                    groupContact: data.groupContact || '',
                    dateFrom: data.dateFrom || '',
                    dateTo: data.dateTo || '',
                    roomSummary: data.roomSummary || 'No rooms selected',
                    breakfastAdult: data.breakfastAdult || 0,
                    breakfastKid: data.breakfastKid || 0,
                    pickup: data.pickup || 0,
                    dropoff: data.dropoff || 0,
                    remarks: data.remarks || '',
                    total: data.total || '0',
                    paidAmount: data.paidAmount || 0,
                    balance: data.balance || 0,
                    checkOutStatus: data.checkOutStatus || 0,
                    lateCheckoutFee: data.lateCheckoutFee || 0,
                    discount: data.discount || 0,
                    reservationFee: data.reservationFee || 0,
                    roomCharges: data.roomCharges !== undefined ? data.roomCharges.toFixed(2) : '0.00',
                    servicesTotal: data.servicesTotal !== undefined ? data.servicesTotal.toFixed(2) : '0.00'
                };

                // Create form to trigger voucher download
                const form = $('<form>', {
                    method: 'POST',
                    action: '/booking/generate-group-voucher?download=1',
                    target: '_self'
                });
                
                // Add booking data to form
                for (let key in bookingData) {
                    form.append($('<input>', {
                        type: 'hidden',
                        name: key,
                        value: bookingData[key]
                    }));
                }
                
                // Submit the form to trigger download
                $('body').append(form);
                form.submit();
                
                // Remove form and show success after a delay
                setTimeout(() => {
                    form.remove();
                    Swal.fire({
                        icon: 'success',
                        title: 'PDF Voucher Downloaded!',
                        text: 'Your group voucher has been downloaded as PDF automatically.',
                        confirmButtonText: 'OK'
                    });
                }, 1500);
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to fetch group voucher data.',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function () {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'An error occurred while fetching group voucher data.',
                confirmButtonText: 'OK'
            });
        }
    });
}

// JOIN EXISTING GROUP - Open add group booking modal with existing group info pre-filled
function joinExistingGroup(groupId) {
    // Fetch group booking details
    $.ajax({
        url: `/booking/get_group_info/${groupId}`,
        type: 'GET',
        success: function(response) {
            if (response.success && response.data) {
                const groupData = response.data;
                
                // Store group data for use after modal opens
                window.joinGroupData = {
                    groupId: groupId,
                    groupName: groupData.groupName || '',
                    groupContact: groupData.groupContact || ''
                };
                
                // Open the modal first - it will reset, then we'll set our values
                $('#modal-add-group-booking').modal('show');
                
                // Set values after modal is fully shown (using setTimeout to ensure modal reset is done)
                setTimeout(function() {
                    // Set hidden field to indicate this is a join operation
                    $('#groupBookingId').val(groupId);
                    $('#groupJoinExistingGroup').val('true');
                    
                    // Pre-fill group information (read-only or editable based on preference)
                    $('#groupName').val(groupData.groupName || '');
                    $('#groupContact').val(groupData.groupContact || '');
                    
                    // Make group name and contact read-only since they should match the existing group
                    $('#groupName').prop('readonly', true).css('background-color', '#2a3135');
                    $('#groupContact').prop('readonly', true).css('background-color', '#2a3135');
                    
                    // IMPROVEMENT #6: Disable billing type checkbox and show warning
                    const groupBillingType = groupData.billingType === 1 ? 'Master/Consolidated' : 'Individual';
                    const billingCheckbox = $('#groupIndividualBilling');
                    if (billingCheckbox.length) {
                        // Set checkbox to match group's billing type and disable it
                        billingCheckbox.prop('checked', groupData.billingType === 0); // 0 = Individual
                        billingCheckbox.prop('disabled', true);
                        billingCheckbox.closest('.form-check').css('opacity', '0.6');
                        
                        // Add tooltip or note
                        if (!billingCheckbox.closest('.form-check').find('.billing-type-note').length) {
                            billingCheckbox.closest('.form-check').append(
                                `<small class="text-muted d-block mt-1" style="font-size: 0.85em;">
                                    <i class="fa fa-info-circle"></i> Group uses ${groupBillingType} billing (cannot be changed)
                                </small>`
                            );
                        }
                    }
                    
                    // Update modal title to indicate joining
                    $('#modalAddGroupBookingLabel').text('Join Group - Add Booking to Existing Group');
                    
                // Show comprehensive info message (IMPROVEMENT #5)
                if (!$('#joinGroupInfo').length) {
                    const billingTypeText = groupData.billingType === 1 ? 'Master/Consolidated' : 'Individual';
                    const billingTypeIcon = groupData.billingType === 1 ? '📋' : '📝';
                    const dateRange = groupData.earliestCheckIn && groupData.latestCheckOut 
                        ? `${new Date(groupData.earliestCheckIn).toLocaleDateString()} - ${new Date(groupData.latestCheckOut).toLocaleDateString()}`
                        : 'Various dates';
                    
                    $('#groupBookingForm').prepend(`
                        <div id="joinGroupInfo" class="alert alert-info mb-3" style="background-color: rgba(23, 162, 184, 0.2); border: 1px solid #17a2b8; color: #17a2b8;">
                            <i class="fa fa-info-circle"></i> <strong>Joining Existing Group:</strong> ${groupData.groupName || 'Group'}<br>
                            <div style="margin-top: 10px; font-size: 0.9em;">
                                <strong>Group Details:</strong><br>
                                • Contact: ${groupData.groupContact || 'N/A'}<br>
                                • Billing Type: ${billingTypeIcon} ${billingTypeText}<br>
                                • Existing Rooms: ${groupData.numberOfRooms || 0} (${groupData.existingRooms || 'N/A'})<br>
                                • Existing Bookings: ${groupData.existingBookingCount || 0}<br>
                                • Date Range: ${dateRange}<br>
                                ${groupData.remarks ? `• Remarks: ${groupData.remarks}<br>` : ''}
                            </div>
                            <small style="display: block; margin-top: 10px; font-style: italic;">
                                <i class="fa fa-exclamation-triangle"></i> Your booking will use the group's billing type (${billingTypeText}) automatically. 
                                You can select different check-in/check-out dates.
                            </small>
                        </div>
                    `);
                }
                    
                    // Clear the stored data
                    window.joinGroupData = null;
                }, 300); // Wait for modal reset to complete
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: response.message || 'Failed to fetch group information.',
                    confirmButtonText: 'OK'
                });
            }
        },
        error: function(error) {
            console.error('Error fetching group info:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'An error occurred while fetching group information.',
                confirmButtonText: 'OK'
            });
        }
    });
} 