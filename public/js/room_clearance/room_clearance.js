let clearanceTable = null;
let currentClearanceId = null;

// Wait for both DOM and jQuery to be ready
function initializeApp() {
	if (typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') {
		setTimeout(initializeApp, 100);
		return;
	}
	
	initTable();
	loadClearanceData();
	bindEvents();
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApp);
} else {
	initializeApp();
}

function initTable() {
	if (typeof $.fn.DataTable === 'undefined') return;
	clearanceTable = $('#room_clearance_tbl').DataTable({
		data: [],
		responsive: true,
		pageLength: 25,
		order: [[5, 'desc']],
		columnDefs: [{ targets: [6], orderable: false }],
		language: {
			search: 'Search clearances:',
			
		}
	});
}

function loadClearanceData() {
	$.ajax({
		url: '/room_clearance/data',
		type: 'GET',
		dataType: 'json',
		success: function(res) {
			if (res.success) populateTable(res.rows || []);
		}
	});
}

function populateTable(rows) {
	if (!clearanceTable) return;
	clearanceTable.clear();
	rows.forEach(r => {
		const rowData = [
			r.ROOM_NUMBER || '',
			r.CUSTOMER_NAME || '',
			formatDate(r.CHECK_OUT_DATE),
			r.ASSIGNED_TO_NAME || '',
			badge(r.status || r.STATUS),
			formatDate(r.created_at || r.ENCODED_DT),
			actions(r.id || r.IDNo, r.PHOTOS)
		];
		const row = clearanceTable.row.add(rowData);
		row.node().setAttribute('data-id', (r.id || r.IDNo));
	});
	clearanceTable.draw();
}

function badge(status) {
	switch ((status || '').toLowerCase()) {
		case 'clear': return '<span class="badge badge-success">Clear</span>';
		case 'issue': return '<span class="badge badge-danger">Issue</span>';
		default: return '<span class="badge badge-warning">Assigned</span>';
	}
}

function actions(id, photos) {
	let photoButtons = '';
	if (photos) {
		try {
			const photoArray = JSON.parse(photos);
			if (photoArray && photoArray.length > 0) {
				photoButtons = `
					<button class="btn btn-tbl-view btn-xs" onclick="viewPhotos('${id}', '${photos}')" title="View Photos">
						<i class="fa fa-image"></i> (${photoArray.length})
					</button>
				`;
			}
		} catch (e) {
			console.error('Error parsing photos:', e);
		}
	}

	return `
		<div class="text-center">
			${photoButtons}
			<button class="btn btn-tbl-edit btn-xs" onclick="editClearance('${id}')"><i class="fa fa-pencil"></i></button>
			<a href="#" class="btn btn-tbl-delete btn-xs rc-delete" data-id="${id}"><i class="fa fa-trash-o"></i></a>
		</div>
	`;
}

function bindEvents() {
	// Delete
	document.addEventListener('click', function(e) {
		if (e.target.closest('.rc-delete')) {
			e.preventDefault();
			const id = e.target.closest('.rc-delete').getAttribute('data-id');
			confirmDelete(id);
		}
	});

	// Export
	const exportBtn = document.getElementById('exportClearance');
	if (exportBtn) exportBtn.addEventListener('click', exportToExcel);

	// Modal show: preload selects
	$('#new-clearance-modal').on('shown.bs.modal', function() {
		console.log('New clearance modal shown, loading dropdowns...');
		setTimeout(() => {
			loadCheckoutBookings('#nc-booking');
			loadBellmen('#nc-assigned-to');
		}, 100);
	});
	$('#edit-clearance-modal').on('shown.bs.modal', function() {
		console.log('Edit clearance modal shown, loading dropdowns...');
		setTimeout(() => {
			loadAllCheckoutBookings('#ec-booking');
			loadBellmen('#ec-assigned-to');
		}, 100);
	});

	// Form submit
	document.getElementById('new-clearance-form')?.addEventListener('submit', submitNew);
	document.getElementById('edit-clearance-form')?.addEventListener('submit', submitEdit);

	// Status change handlers for conditional fields
	document.getElementById('nc-status')?.addEventListener('change', function() {
		toggleIssueFields(this.value === 'issue', 'issue-fields');
	});
	document.getElementById('ec-status')?.addEventListener('change', function() {
		toggleIssueFields(this.value === 'issue', 'edit-issue-fields');
	});
}

function loadCheckoutBookings(selectSel) {
	console.log('Loading checkout bookings for:', selectSel);
	$.get('/room_clearance/checkout-bookings', function(res) {
		console.log('Checkout bookings response:', res);
		if (!res.success) {
			console.error('Failed to load checkout bookings:', res.message);
			return;
		}
		const sel = document.querySelector(selectSel);
		if (!sel) {
			console.error('Select element not found:', selectSel);
			return;
		}
		sel.innerHTML = '<option value="">Select Checkout Booking</option>';
		(res.rows || []).forEach(b => {
			const opt = document.createElement('option');
			opt.value = b.booking_id; // Model returns b.IDNo AS booking_id
			opt.textContent = `${b.ROOM_NUMBER} • ${b.CUSTOMER_NAME || ''} • ${formatDate(b.CHECK_OUT_DATE)}`;
			opt.setAttribute('data-room', b.room_id);
			sel.appendChild(opt);
		});
		console.log('Loaded', (res.rows || []).length, 'checkout bookings');

	}).fail(function(xhr, status, error) {
		console.error('AJAX error loading checkout bookings:', error);
	});
}

function loadAllCheckoutBookings(selectSel) {
	console.log('Loading all checkout bookings for:', selectSel);
	$.get('/room_clearance/all-checkout-bookings', function(res) {
		console.log('All checkout bookings response:', res);
		if (!res.success) {
			console.error('Failed to load all checkout bookings:', res.message);
			return;
		}
		const sel = document.querySelector(selectSel);
		if (!sel) {
			console.error('Select element not found:', selectSel);
			return;
		}
		sel.innerHTML = '<option value="">Select Checkout Booking</option>';
		(res.rows || []).forEach(b => {
			const opt = document.createElement('option');
			opt.value = b.booking_id; // Model returns b.IDNo AS booking_id
			opt.textContent = `${b.ROOM_NUMBER} • ${b.CUSTOMER_NAME || ''} • ${formatDate(b.CHECK_OUT_DATE)}`;
			opt.setAttribute('data-room', b.room_id);
			sel.appendChild(opt);
		});
		console.log('Loaded', (res.rows || []).length, 'all checkout bookings');

	}).fail(function(xhr, status, error) {
		console.error('AJAX error loading all checkout bookings:', error);
	});
}

function loadBellmen(selectSel) {
	console.log('Loading bellmen for:', selectSel);
	$.get('/room_clearance/bellmen', function(res) {
		console.log('Bellmen response:', res);
		if (!res.success) {
			console.error('Failed to load bellmen:', res.message);
			return;
		}
		const sel = document.querySelector(selectSel);
		if (!sel) {
			console.error('Select element not found:', selectSel);
			return;
		}
		sel.innerHTML = '<option value="">Unassigned</option>';
		(res.users || []).forEach(u => {
			const opt = document.createElement('option');
			opt.value = u.IDno; // UserModel returns IDno (lowercase 'n')
			opt.textContent = u.FULLNAME;
			sel.appendChild(opt);
		});
		console.log('Loaded', (res.users || []).length, 'bellmen');
	}).fail(function(xhr, status, error) {
		console.error('AJAX error loading bellmen:', error);
	});
}

function toggleIssueFields(show, fieldId) {
	const fields = document.getElementById(fieldId);
	if (fields) {
		fields.style.display = show ? 'block' : 'none';
	}
}

function viewPhotos(id, photosJson) {
	try {
		const photos = JSON.parse(photosJson);
		if (!photos || photos.length === 0) {
			showError('No photos available');
			return;
		}

		let photoHtml = '<div class="row">';
		photos.forEach((photo, index) => {
			photoHtml += `
				<div class="col-md-4 mb-3">
					<img src="/uploads/room_clearance/${photo}" 
						 class="img-fluid rounded" 
						 style="max-height: 200px; width: 100%; object-fit: cover;"
						 alt="Photo ${index + 1}"
						 onclick="openPhotoModal('/uploads/room_clearance/${photo}')">
				</div>
			`;
		});
		photoHtml += '</div>';

		Swal.fire({
			title: `Room Clearance Photos (${photos.length})`,
			html: photoHtml,
			width: '80%',
			confirmButtonText: 'Close'
		});
	} catch (e) {
		console.error('Error viewing photos:', e);
		showError('Error loading photos');
	}
}

function openPhotoModal(photoUrl) {
	Swal.fire({
		imageUrl: photoUrl,
		imageAlt: 'Room Clearance Photo',
		width: 'auto',
		confirmButtonText: 'Close'
	});
}

function submitNew(e) {
	e.preventDefault();
	const form = e.target;
	const bookingSel = form.querySelector('#nc-booking');
	
	if (!bookingSel.value) {
		return showError('Please select a checkout booking.');
	}

	// Create FormData for file uploads
	const formData = new FormData();
	formData.append('booking_id', bookingSel.value);
	formData.append('room_id', bookingSel.options[bookingSel.selectedIndex]?.getAttribute('data-room'));
	formData.append('assigned_to', form.assigned_to.value || '');
	formData.append('notes', form.notes.value || '');
	formData.append('status', form.status.value || 'assigned');
	formData.append('checklist', form.checklist?.value || '');
	formData.append('proposed_charges', form.proposed_charges?.value || '');

	// Handle multiple photo files
	const photoFiles = form.photos?.files;
	if (photoFiles && photoFiles.length > 0) {
		for (let i = 0; i < photoFiles.length; i++) {
			formData.append('photos', photoFiles[i]);
		}
	}

	$.ajax({
		url: '/room_clearance/add', 
		type: 'POST', 
		data: formData,
		processData: false,
		contentType: false,
		success: function(res) {
			if (res.success) {
				$('#new-clearance-modal').modal('hide');
				loadClearanceData();
				showSuccess('Clearance created successfully!');
			} else {
				showError(res.message || 'Operation failed.');
			}
		}, 
		error: function() { 
			showError('Something went wrong.'); 
		}
	});
}

function editClearance(id) {
	$.get(`/room_clearance/${id}`)
		.done(function(res) {
			if (!res.success) return showError(res.message || 'Not found');
			currentClearanceId = id;
			const c = res.clearance;
			
			// Debug: Log what's received from the API
			console.log('API response for clearance ID', id, ':', res);
			console.log('Clearance object:', c);
			console.log('proposed_charges field:', c.proposed_charges);
			console.log('proposed_charges type:', typeof c.proposed_charges);
			console.log('All keys in clearance object:', Object.keys(c));
			
			$('#ec-id').val(id);
			// Store all the data for prefill - model returns lowercase field names
			const prefillData = { 
				booking_id: c.booking_id, 
				assigned_to: c.assigned_to, 
				notes: c.notes, 
				status: c.status,
				checklist: c.checklist,
				proposed_charges: c.proposed_charges
			};
			
			console.log('Prefill data being stored:', prefillData);
			
			$('#edit-clearance-modal').data('prefill', prefillData);
			$('#edit-clearance-modal').modal('show');
		})
		.fail(function(xhr, status, error) {
			console.error('AJAX error:', xhr, status, error);
			showError('Failed to fetch clearance data: ' + error);
		});
}

$('#edit-clearance-modal').on('shown.bs.modal', function() {
	const pre = $('#edit-clearance-modal').data('prefill') || {};
	
	// Wait for dropdowns to be loaded before populating form fields
	setTimeout(() => {
		// Populate form fields
		console.log('Prefill data for form population:', pre);
		
		if (pre.booking_id) {
			$('#ec-booking').val(String(pre.booking_id));
		}
		if (pre.assigned_to) {
			$('#ec-assigned-to').val(String(pre.assigned_to));
		}
		$('#ec-notes').val(pre.notes || '');
		$('#ec-status').val(pre.status || 'assigned');
		
		// Populate text fields directly (no more JSON parsing needed)
		if (pre.checklist) {
			console.log('Setting checklist to:', pre.checklist);
			$('#ec-checklist').val(pre.checklist);
		} else {
			$('#ec-checklist').val('');
		}
		
		if (pre.proposed_charges) {
			console.log('Setting proposed_charges to:', pre.proposed_charges);
			$('#ec-proposed-charges').val(pre.proposed_charges);
		} else {
			$('#ec-proposed-charges').val('');
		}
		
		// Show/hide issue fields based on current status
		const shouldShowIssueFields = pre.status === 'issue';
		console.log('Should show issue fields:', shouldShowIssueFields);
		toggleIssueFields(shouldShowIssueFields, 'edit-issue-fields');
		
		// Debug: Check if the field was actually set
		setTimeout(() => {
			console.log('Final field values:');
			console.log('Proposed charges field value:', $('#ec-proposed-charges').val());
			console.log('Checklist field value:', $('#ec-checklist').val());
		}, 100);
	}, 500); // Wait 500ms for dropdowns to load
});

function submitEdit(e) {
	e.preventDefault();
	if (!currentClearanceId) return showError('No record selected.');
	const form = e.target;
	const bookingSel = form.querySelector('#ec-booking');
	
	if (!bookingSel.value) return showError('Please select a checkout booking.');
	
	// Create FormData for file uploads
	const formData = new FormData();
	formData.append('booking_id', bookingSel.value);
	formData.append('room_id', bookingSel.options[bookingSel.selectedIndex]?.getAttribute('data-room'));
	formData.append('assigned_to', form.assigned_to.value || '');
	formData.append('notes', form.notes.value || '');
	formData.append('status', form.status.value || 'assigned');
	formData.append('checklist', form.checklist?.value || '');
	formData.append('proposed_charges', form.proposed_charges?.value || '');

	// Handle multiple photo files
	const photoFiles = form.photos?.files;
	if (photoFiles && photoFiles.length > 0) {
		for (let i = 0; i < photoFiles.length; i++) {
			formData.append('photos', photoFiles[i]);
		}
	}

	$.ajax({
		url: `/room_clearance/edit/${currentClearanceId}`, 
		type: 'POST', 
		data: formData,
		processData: false,
		contentType: false,
		success: function(res) {
			if (res.success) {
				$('#edit-clearance-modal').modal('hide');
				loadClearanceData();
				showSuccess('Clearance updated successfully!');
			} else {
				showError(res.message || 'Update failed.');
			}
		}, 
		error: function() { 
			showError('Something went wrong.'); 
		}
	});
}

function confirmDelete(id) {
	Swal.fire({
		title: 'Are you sure?',
		text: 'This action cannot be undone!',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#3085d6',
		cancelButtonColor: '#d33',
		confirmButtonText: 'Yes, delete it!'
	}).then((result) => { if (result.isConfirmed) deleteClearance(id); });
}

function deleteClearance(id) {
	$.ajax({ url: `/room_clearance/delete/${id}`, type: 'DELETE', dataType: 'json', success: function(res) {
		if (res.message) { loadClearanceData(); showSuccess('Deleted successfully!'); }
		else { showError(res.error || 'Delete failed.'); }
	}, error: function() { showError('Something went wrong.'); } });
}

function exportToExcel() {
	try {
		const table = document.getElementById('room_clearance_tbl');
		const clone = table.cloneNode(true);
		const rows = clone.querySelectorAll('tr');
		rows.forEach(row => { if (row.children.length > 0) row.removeChild(row.children[row.children.length - 1]); });
		const sheet = XLSX.utils.table_to_sheet(clone);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, sheet, 'Room Clearance');
		const filename = `RoomClearance_${new Date().toISOString().split('T')[0]}.xlsx`;
		XLSX.writeFile(wb, filename);
		showSuccess(`Exported to ${filename}`);
	} catch (e) { showError('Failed to export.'); }
}

function formatDate(dateString) {
	if (!dateString) return '';
	const date = new Date(dateString);
	return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).replace(',', '');
}

function showSuccess(message) {
	Swal.fire({ title: 'Success!', text: message, icon: 'success', timer: 2000, showConfirmButton: false });
}

function showError(message) {
	Swal.fire({ title: 'Error!', text: message, icon: 'error' });
}

window.editClearance = editClearance;
window.viewPhotos = viewPhotos;
window.openPhotoModal = openPhotoModal;


