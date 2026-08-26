/**
 * One-off: mark past bookings as checked out so dashboard/calendar stay clean.
 * Does NOT overwrite CHECK_OUT_DATE (keeps scheduled/historical checkout date).
 * Does NOT alter billing/payments.
 *
 * Usage: node scripts/bulk_checkout_before_date.js [--apply] [YYYY-MM-DD]
 * Default cutoff: 2026-08-25 (exclusive) — checkouts before that date.
 */
require('dotenv').config();
const { queryDatabasePromise, pool } = require('../config/database');

const apply = process.argv.includes('--apply');
const cutoffArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const CUTOFF = cutoffArg || '2026-08-25';

async function main() {
  console.log(`Cutoff: CHECK_OUT_DATE < ${CUTOFF}`);
  console.log(`Mode: ${apply ? 'APPLY (will update DB)' : 'PREVIEW only'}`);

  const byStatus = await queryDatabasePromise(
    `SELECT BOOKING_STATUS AS status, COUNT(*) AS cnt
     FROM booking
     WHERE ACTIVE = 1
       AND (IS_CANCELLED = 0 OR IS_CANCELLED IS NULL)
       AND DATE(CHECK_OUT_DATE) < ?
     GROUP BY BOOKING_STATUS
     ORDER BY cnt DESC`,
    [CUTOFF]
  );
  console.log('\nAll active non-cancelled bookings with checkout before cutoff:');
  console.table(byStatus);

  const targets = await queryDatabasePromise(
    `SELECT IDNo, ROOM_ID, BOOKING_STATUS,
            DATE(CHECK_IN_DATE) AS check_in,
            DATE(CHECK_OUT_DATE) AS check_out
     FROM booking
     WHERE ACTIVE = 1
       AND (IS_CANCELLED = 0 OR IS_CANCELLED IS NULL)
       AND DATE(CHECK_OUT_DATE) < ?
       AND LOWER(BOOKING_STATUS) IN ('pending', 'check-in')
     ORDER BY CHECK_OUT_DATE ASC`,
    [CUTOFF]
  );

  console.log(`\nBookings to mark as check-Out: ${targets.length}`);
  if (targets.length) {
    console.log('First 15:');
    console.table(targets.slice(0, 15));
    console.log('Last 15:');
    console.table(targets.slice(-15));
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update.');
    return;
  }

  if (!targets.length) {
    console.log('Nothing to update.');
    return;
  }

  const ids = targets.map((r) => r.IDNo);
  const placeholders = ids.map(() => '?').join(',');

  // Keep historical CHECK_OUT_DATE; only flip status.
  const bookingResult = await queryDatabasePromise(
    `UPDATE booking
     SET BOOKING_STATUS = 'check-Out',
         EDITED_DT = NOW()
     WHERE IDNo IN (${placeholders})
       AND ACTIVE = 1
       AND LOWER(BOOKING_STATUS) IN ('pending', 'check-in')`,
    ids
  );
  console.log(`\nUpdated bookings: ${bookingResult.affectedRows}`);

  // Free rooms that no longer have an active pending/check-In booking.
  // Set to Available (1). Skip rooms still occupied by a later stay.
  const roomResult = await queryDatabasePromise(
    `UPDATE room r
     SET r.ROOM_STATUS = 1,
         r.ROOM_MAINTENANCE_STATUS = NULL
     WHERE r.IDNo IN (
       SELECT DISTINCT ROOM_ID FROM booking
       WHERE IDNo IN (${placeholders}) AND ROOM_ID IS NOT NULL AND ROOM_ID > 0
     )
     AND r.ROOM_STATUS <> 3
     AND NOT EXISTS (
       SELECT 1 FROM booking b2
       WHERE b2.ROOM_ID = r.IDNo
         AND b2.ACTIVE = 1
         AND (b2.IS_CANCELLED = 0 OR b2.IS_CANCELLED IS NULL)
         AND LOWER(b2.BOOKING_STATUS) IN ('pending', 'check-in')
     )`,
    ids
  );
  console.log(`Rooms set to Available: ${roomResult.affectedRows}`);

  const remaining = await queryDatabasePromise(
    `SELECT COUNT(*) AS cnt
     FROM booking
     WHERE ACTIVE = 1
       AND (IS_CANCELLED = 0 OR IS_CANCELLED IS NULL)
       AND DATE(CHECK_OUT_DATE) < ?
       AND LOWER(BOOKING_STATUS) IN ('pending', 'check-in')`,
    [CUTOFF]
  );
  console.log(`Remaining un-checked-out before cutoff: ${remaining[0].cnt}`);
}

main()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err);
    try { pool.end(); } catch (_) {}
    process.exit(1);
  });
