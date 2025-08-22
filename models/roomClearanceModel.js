const { queryDatabasePromise } = require('../config/database');

// ========================================
// ROOM CLEARANCE MODEL
// ========================================

class RoomClearanceModel {

	// Get all room clearance records (only for checked-out bookings)
	static async getAllClearances() {
		const query = `
			SELECT 
				rc.IDNo AS id,
				rc.BOOKING_ID AS booking_id,
				rc.ROOM_ID AS room_id,
				rc.ASSIGNED_TO AS assigned_to,
				rc.CHECKLIST AS checklist,
				rc.PHOTOS AS photos,
				rc.NOTES AS notes,
				rc.PROPOSED_CHARGES AS proposed_charges,
				rc.STATUS AS status,
				rc.ENCODED_DT AS created_at,
				rc.EDITED_DT AS updated_at,
				b.CHECK_OUT_DATE,
				b.BOOKING_STATUS,
				r.ROOM_NUMBER,
				c.NAME AS CUSTOMER_NAME,
				u.FULLNAME AS ASSIGNED_TO_NAME
			FROM room_clearance rc
			LEFT JOIN booking b ON rc.BOOKING_ID = b.IDNo
			LEFT JOIN room r ON rc.ROOM_ID = r.IDNo
			LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
			LEFT JOIN user_info u ON rc.ASSIGNED_TO = u.IDNo
			WHERE rc.ACTIVE = 1
			  AND b.ACTIVE = 1
			  AND b.BOOKING_STATUS = 'check-Out'
			ORDER BY rc.EDITED_DT DESC, rc.ENCODED_DT DESC
		`;
		return await queryDatabasePromise(query);
	}

	// Get a single clearance by id
	static async getClearanceById(id) {
		const query = `
			SELECT 
				rc.IDNo AS id,
				rc.BOOKING_ID AS booking_id,
				rc.ROOM_ID AS room_id,
				rc.ASSIGNED_TO AS assigned_to,
				rc.CHECKLIST AS checklist,
				rc.PHOTOS AS photos,
				rc.NOTES AS notes,
				rc.PROPOSED_CHARGES AS proposed_charges,
				rc.STATUS AS status,
				rc.ENCODED_DT AS created_at,
				rc.EDITED_DT AS updated_at
			FROM room_clearance rc
			WHERE rc.IDNo = ? AND rc.ACTIVE = 1
		`;
		const rows = await queryDatabasePromise(query, [id]);
		return rows[0] || null;
	}

	// Add a clearance record
	static async addClearance(data) {
		const {
			booking_id,
			room_id,
			assigned_to,
			checklist = null,
			photos = null,
			notes = null,
			proposed_charges = null,
			status = 'assigned',
			encoded_by
		} = data;

		const query = `
			INSERT INTO room_clearance (
				BOOKING_ID, ROOM_ID, ASSIGNED_TO, CHECKLIST, PHOTOS, NOTES, PROPOSED_CHARGES, STATUS, ENCODED_BY, ENCODED_DT, ACTIVE
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
		`;
		const params = [
			booking_id,
			room_id,
			assigned_to,
			checklist,
			photos,
			notes,
			proposed_charges,
			status,
			encoded_by
		];

		const result = await queryDatabasePromise(query, params);
		return { success: true, id: result.insertId };
	}

	// Update an existing clearance record
	static async updateClearance(id, data) {
		const {
			booking_id,
			room_id,
			assigned_to,
			checklist = null,
			photos = null,
			notes = null,
			proposed_charges = null,
			status = 'assigned',
			edited_by
		} = data;

		const query = `
			UPDATE room_clearance
			SET BOOKING_ID = ?, ROOM_ID = ?, ASSIGNED_TO = ?, CHECKLIST = ?, PHOTOS = ?, NOTES = ?, PROPOSED_CHARGES = ?, STATUS = ?, EDITED_BY = ?, EDITED_DT = NOW()
			WHERE IDNo = ? AND ACTIVE = 1
		`;
		const params = [
			booking_id,
			room_id,
			assigned_to,
			checklist,
			photos,
			notes,
			proposed_charges,
			status,
			edited_by,
			id
		];

		const result = await queryDatabasePromise(query, params);
		if (result.affectedRows === 0) {
			return { success: false, notFound: true };
		}
		return { success: true };
	}

	// Soft delete a clearance record
	static async deleteClearance(id) {
		const query = 'UPDATE room_clearance SET ACTIVE = 0 WHERE IDNo = ?';
		const result = await queryDatabasePromise(query, [id]);
		if (result.affectedRows === 0) {
			return { success: false, notFound: true };
		}
		return { success: true };
	}

	// Helper: Get bookings that are checked-out and have no active clearance yet
	static async getCheckoutBookings() {
		const query = `
			SELECT 
				b.IDNo AS booking_id,
				b.ROOM_ID AS room_id,
				r.ROOM_NUMBER,
				c.NAME AS CUSTOMER_NAME,
				b.CHECK_OUT_DATE
			FROM booking b
			LEFT JOIN room r ON b.ROOM_ID = r.IDNo
			LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
			WHERE b.ACTIVE = 1
			  AND b.BOOKING_STATUS = 'check-Out'
			  AND NOT EXISTS (
				SELECT 1 FROM room_clearance rc WHERE rc.BOOKING_ID = b.IDNo AND rc.ACTIVE = 1
			  )
			ORDER BY b.CHECK_OUT_DATE DESC
		`;
		return await queryDatabasePromise(query);
	}

	// Helper: Get ALL checkout bookings (for editing existing clearances)
	static async getAllCheckoutBookings() {
		const query = `
			SELECT 
				b.IDNo AS booking_id,
				b.ROOM_ID AS room_id,
				r.ROOM_NUMBER,
				c.NAME AS CUSTOMER_NAME,
				b.CHECK_OUT_DATE
			FROM booking b
			LEFT JOIN room r ON b.ROOM_ID = r.IDNo
			LEFT JOIN customer c ON b.CUSTOMER_ID = c.IDNo
			WHERE b.ACTIVE = 1
			  AND b.BOOKING_STATUS = 'check-Out'
			ORDER BY b.CHECK_OUT_DATE DESC
		`;
		return await queryDatabasePromise(query);
	}
}

module.exports = RoomClearanceModel;


