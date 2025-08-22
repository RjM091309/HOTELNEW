const RoomClearanceModel = require('../models/roomClearanceModel');
const UserModel = require('../models/userModels');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'public/uploads/room_clearance';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'clearance-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).array('photos', 10); // Allow up to 10 photos

const RoomClearanceController = {

	// Render landing page
	renderPage: async (req, res) => {
		try {
			const user = req.user || null;
			res.render('room_clearance/room_clearance', {
				title: 'Room Clearance',
				subTitle: 'Bellman Room Clearance',
				activePage: 'room_clearance',
				user
			});
		} catch (error) {
			console.error('Error rendering room clearance page:', error);
			res.status(500).send('Error loading room clearance page.');
		}
	},

	// Data for DataTable (existing clearance records)
	getData: async (req, res) => {
		try {
			const rows = await RoomClearanceModel.getAllClearances();
			res.json({ success: true, rows });
		} catch (error) {
			console.error('Error fetching room clearance data:', error);
			res.status(500).json({ success: false, message: 'Error retrieving room clearance data.' });
		}
	},

	// Bookings that are checked-out and not yet cleared
	getCheckoutBookings: async (req, res) => {
		try {
			const rows = await RoomClearanceModel.getCheckoutBookings();
			console.log('Found checkout bookings:', rows.length);
			res.json({ success: true, rows });
		} catch (error) {
			console.error('Error fetching checkout bookings:', error);
			res.status(500).json({ success: false, message: 'Error retrieving checkout bookings.' });
		}
	},

	// All checkout bookings (for editing existing clearances)
	getAllCheckoutBookings: async (req, res) => {
		try {
			const rows = await RoomClearanceModel.getAllCheckoutBookings();
			console.log('Found all checkout bookings:', rows.length);
			res.json({ success: true, rows });
		} catch (error) {
			console.error('Error fetching all checkout bookings:', error);
			res.status(500).json({ success: false, message: 'Error retrieving all checkout bookings.' });
		}
	},

	// Bellmen list (assignees)
	getBellmen: async (req, res) => {
		try {
			// For now, return all active users; client may filter. Could be extended to role-based.
			const users = await UserModel.getAllUsers();
			console.log('Found users:', users.length);
			res.json({ success: true, users });
		} catch (error) {
			console.error('Error fetching bellmen:', error);
			res.status(500).json({ success: false, message: 'Error retrieving users.' });
		}
	},



	// Create
	add: async (req, res) => {
		upload(req, res, async function (err) {
			if (err) {
				return res.status(400).json({
					success: false,
					message: 'File upload error: ' + err.message
				});
			}

			try {
				const {
					booking_id,
					room_id,
					assigned_to,
					checklist,
					notes,
					proposed_charges,
					status
				} = req.body;

				if (!booking_id || !room_id) {
					return res.json({ success: false, message: 'Booking and Room are required.' });
				}

				// Process uploaded photos
				let photoFilenames = [];
				if (req.files && req.files.length > 0) {
					photoFilenames = req.files.map(file => file.filename);
				}

				const encoded_by = req.user ? req.user.FULLNAME : 'Unknown User';
				const result = await RoomClearanceModel.addClearance({
					booking_id,
					room_id,
					assigned_to: assigned_to || null,
					checklist: checklist || null,
					photos: photoFilenames.length > 0 ? photoFilenames.join(',') : null,
					notes: notes || null,
					proposed_charges: proposed_charges || null,
					status: status || 'assigned',
					encoded_by
				});

				if (result.success) {
					const fresh = await RoomClearanceModel.getClearanceById(result.id);
					return res.json({ success: true, message: 'Clearance created successfully!', clearance: fresh });
				}
				return res.status(500).json({ success: false, message: 'Failed to create clearance.' });
			} catch (error) {
				console.error('Error adding room clearance:', error);
				res.status(500).json({ success: false, message: 'Error adding room clearance.' });
			}
		});
	},

	// Read single
	getById: async (req, res) => {
		try {
			const { id } = req.params;
			if (!id) return res.status(400).json({ success: false, message: 'ID is required' });
			const data = await RoomClearanceModel.getClearanceById(id);
			if (!data) return res.status(404).json({ success: false, message: 'Not found' });
			
			res.json({ success: true, clearance: data });
		} catch (error) {
			console.error('Error getting room clearance by id:', error);
			res.status(500).json({ success: false, message: 'Error retrieving clearance.' });
		}
	},

	// Update
	update: async (req, res) => {
		upload(req, res, async function (err) {
			if (err) {
				return res.status(400).json({
					success: false,
					message: 'File upload error: ' + err.message
				});
			}

			try {
				const { id } = req.params;
				const {
					booking_id,
					room_id,
					assigned_to,
					checklist,
					notes,
					proposed_charges,
					status
				} = req.body;

				if (!id) return res.status(400).json({ success: false, message: 'ID is required' });
				if (!booking_id || !room_id) {
					return res.json({ success: false, message: 'Booking and Room are required.' });
				}

				// Process uploaded photos
				let photoFilenames = [];
				if (req.files && req.files.length > 0) {
					photoFilenames = req.files.map(file => file.filename);
				}

				// If no new photos uploaded, get existing photos
				if (photoFilenames.length === 0) {
					const existingClearance = await RoomClearanceModel.getClearanceById(id);
					if (existingClearance && existingClearance.PHOTOS) {
						try {
							photoFilenames = JSON.parse(existingClearance.PHOTOS);
						} catch (e) {
							photoFilenames = [];
						}
					}
				}

				const edited_by = req.user ? req.user.FULLNAME : 'Unknown User';
				const result = await RoomClearanceModel.updateClearance(id, {
					booking_id,
					room_id,
					assigned_to: assigned_to || null,
					checklist: checklist || null,
					photos: photoFilenames.length > 0 ? photoFilenames.join(',') : null,
					notes: notes || null,
					proposed_charges: proposed_charges || null,
					status: status || 'assigned',
					edited_by
				});

				if (result.success) {
					const fresh = await RoomClearanceModel.getClearanceById(id);
					return res.json({ success: true, message: 'Clearance updated successfully!', clearance: fresh });
				}
				if (result.notFound) return res.status(404).json({ success: false, message: 'Not found or inactive.' });
				return res.status(500).json({ success: false, message: 'Failed to update clearance.' });
			} catch (error) {
				console.error('Error updating room clearance:', error);
				res.status(500).json({ success: false, message: 'Error updating room clearance.' });
			}
		});
	},

	// Delete (soft)
	delete: async (req, res) => {
		try {
			const { id } = req.params;
			const result = await RoomClearanceModel.deleteClearance(id);
			if (result.success) return res.status(200).json({ message: 'Clearance deleted successfully' });
			if (result.notFound) return res.status(404).json({ error: 'Clearance not found or already inactive' });
			return res.status(500).json({ error: 'Error deleting clearance' });
		} catch (error) {
			console.error('Error deleting room clearance:', error);
			res.status(500).json({ error: 'Error deleting clearance' });
		}
	}
};

module.exports = RoomClearanceController;


