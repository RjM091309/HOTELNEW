require('dotenv').config();

const { queryDatabasePromise } = require('../config/database');

async function tableExists(tableName) {
  const rows = await queryDatabasePromise(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await queryDatabasePromise(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureTable(tableName, createSql) {
  if (await tableExists(tableName)) {
    return false;
  }

  await queryDatabasePromise(createSql);
  console.log(`✅ Created table: ${tableName}`);
  return true;
}

async function ensureColumn(tableName, columnName, definition, afterColumn = null) {
  if (await columnExists(tableName, columnName)) {
    return false;
  }

  let sql = `ALTER TABLE ${tableName} ADD COLUMN ${definition}`;
  if (afterColumn && await columnExists(tableName, afterColumn)) {
    sql += ` AFTER ${afterColumn}`;
  }

  await queryDatabasePromise(sql);
  console.log(`✅ Added column: ${tableName}.${columnName}`);
  return true;
}

async function runFlightScheduleMigrations() {
  await ensureTable('flight_schedule', `
    CREATE TABLE flight_schedule (
      IDNo INT NOT NULL AUTO_INCREMENT,
      FLIGHT_NUMBER VARCHAR(20) NOT NULL,
      CITY VARCHAR(100) NULL DEFAULT NULL,
      ARRIVAL VARCHAR(100) NOT NULL,
      DEPARTURE VARCHAR(100) NOT NULL,
      ENCODED_BY INT NULL DEFAULT NULL,
      ENCODED_DT DATETIME NULL DEFAULT NULL,
      EDITED_BY INT NULL DEFAULT NULL,
      EDITED_DT DATETIME NULL DEFAULT NULL,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (IDNo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await ensureColumn(
    'flight_schedule',
    'CITY',
    `CITY VARCHAR(100) NULL DEFAULT NULL COMMENT 'City the airline flies to/from'`,
    'FLIGHT_NUMBER'
  );
}

async function runPickupDropMigrations() {
  if (!(await tableExists('booking'))) {
    console.warn('⚠️ booking table not found, skipping pickup/drop column migrations');
    return;
  }

  await ensureColumn(
    'booking',
    'FLIGHT_NUMBER',
    `FLIGHT_NUMBER VARCHAR(20) NULL DEFAULT NULL COMMENT 'Flight number for airport pick-up (arrival)'`,
    'BED_COUNT'
  );

  await ensureColumn(
    'booking',
    'PASSENGER_COUNT',
    `PASSENGER_COUNT INT NULL DEFAULT NULL COMMENT 'Number of passengers for airport pick-up/drop-off'`,
    'FLIGHT_NUMBER'
  );

  await ensureColumn(
    'booking',
    'DROPOFF_FLIGHT_NUMBER',
    `DROPOFF_FLIGHT_NUMBER VARCHAR(20) NULL DEFAULT NULL COMMENT 'Departure flight number for airport drop-off'`,
    'FLIGHT_NUMBER'
  );

  await ensureColumn(
    'booking',
    'PICKUP_DROP_SPECIAL_NOTES',
    `PICKUP_DROP_SPECIAL_NOTES TEXT NULL DEFAULT NULL COMMENT 'Special notes for pick-up and drop-off printouts'`,
    'PASSENGER_COUNT'
  );

  // Superseded by PICKUP_DATE below - a direct date picker is simpler than inferring
  // the date from a time-of-day heuristic.
  if (await columnExists('booking', 'PICKUP_TIME')) {
    await queryDatabasePromise('ALTER TABLE booking DROP COLUMN PICKUP_TIME');
    console.log('✅ Dropped column: booking.PICKUP_TIME');
  }

  await ensureColumn(
    'booking',
    'PICKUP_DATE',
    `PICKUP_DATE DATE NULL DEFAULT NULL COMMENT 'Actual calendar date of airport pick-up, for arrivals after midnight that fall on the day after CHECK_IN_DATE'`,
    'DROPOFF_FLIGHT_NUMBER'
  );
}

async function runReceiptMigrations() {
  await ensureTable('receipt_settings', `
    CREATE TABLE receipt_settings (
      IDNo INT NOT NULL AUTO_INCREMENT,
      HOTEL_NAME VARCHAR(200) NOT NULL DEFAULT 'MAIN STAY HOTEL',
      RECEIPT_TITLE VARCHAR(100) NOT NULL DEFAULT 'Payment Receipt',
      ACKNOWLEDGMENT_TEXT VARCHAR(500) NOT NULL DEFAULT 'This receipt acknowledges that the payment described above has been received.',
      RECEIPT_PREFIX VARCHAR(20) NOT NULL DEFAULT 'RCP',
      SHOW_LOGO TINYINT(1) NOT NULL DEFAULT 1,
      ENCODED_BY INT NULL DEFAULT NULL,
      ENCODED_DT DATETIME NULL DEFAULT NULL,
      EDITED_BY INT NULL DEFAULT NULL,
      EDITED_DT DATETIME NULL DEFAULT NULL,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (IDNo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await ensureTable('payment_receipt', `
    CREATE TABLE payment_receipt (
      IDNo INT NOT NULL AUTO_INCREMENT,
      RECEIPT_NO VARCHAR(50) NOT NULL,
      ROOM_NO VARCHAR(50) NULL DEFAULT NULL,
      RECEIPT_DATE DATETIME NOT NULL,
      RECEIVED_FROM VARCHAR(200) NOT NULL,
      AMOUNT_PAID DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      PAYMENT_METHOD VARCHAR(50) NOT NULL DEFAULT 'cash',
      PAYMENT_METHOD_OTHER VARCHAR(100) NULL DEFAULT NULL,
      PURPOSE TEXT NULL DEFAULT NULL,
      RECEIVED_BY VARCHAR(200) NULL DEFAULT NULL,
      ENCODED_BY INT NULL DEFAULT NULL,
      ENCODED_DT DATETIME NULL DEFAULT NULL,
      EDITED_BY INT NULL DEFAULT NULL,
      EDITED_DT DATETIME NULL DEFAULT NULL,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (IDNo),
      KEY idx_payment_receipt_date (RECEIPT_DATE),
      KEY idx_payment_receipt_no (RECEIPT_NO)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await ensureColumn(
    'payment_receipt',
    'ROOM_NO',
    `ROOM_NO VARCHAR(50) NULL DEFAULT NULL COMMENT 'Guest room number for receipt'`,
    'RECEIPT_NO'
  );
}

async function runLongTermStayMigrations() {
  if (!(await tableExists('booking'))) {
    console.warn('⚠️ booking table not found, skipping long-term stay column migrations');
    return;
  }

  await ensureColumn(
    'booking',
    'IS_LONG_TERM_STAY',
    `IS_LONG_TERM_STAY TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Long-term stay booking - installment payments allowed'`,
    'REMARKS'
  );

  await ensureColumn(
    'booking',
    'ROOM_CHANGE_NOTE',
    `ROOM_CHANGE_NOTE VARCHAR(500) NULL DEFAULT NULL COMMENT 'Room change condition note for long-term stay (subject to inquiry)'`,
    'IS_LONG_TERM_STAY'
  );
}

async function indexExists(tableName, indexName) {
  const rows = await queryDatabasePromise(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureIndex(tableName, indexName, columnsSql) {
  if (await indexExists(tableName, indexName)) {
    return false;
  }

  await queryDatabasePromise(`CREATE INDEX ${indexName} ON ${tableName} (${columnsSql})`);
  console.log(`✅ Created index: ${tableName}.${indexName}`);
  return true;
}

async function runCalendarPerformanceMigrations() {
  if (!(await tableExists('booking'))) {
    console.warn('⚠️ booking table not found, skipping calendar performance index migrations');
    return;
  }

  await ensureIndex('booking', 'idx_booking_active_dates', 'ACTIVE, CHECK_IN_DATE, CHECK_OUT_DATE');
  await ensureIndex('booking', 'idx_booking_room_active_dates', 'ROOM_ID, ACTIVE, CHECK_IN_DATE, CHECK_OUT_DATE');

  if (await tableExists('payments')) {
    await ensureIndex('payments', 'idx_payments_booking_type', 'BOOKING_ID, PAYMENT_TYPE');
  }
}

async function runHoldPendingMigrations() {
  if (!(await tableExists('booking'))) {
    console.warn('⚠️ booking table not found, skipping hold pending column migration');
    return;
  }

  await ensureColumn(
    'booking',
    'HOLD_PENDING',
    `HOLD_PENDING TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Manually marked as Hold Pending - reserved with dates but no check-in/check-out processing yet'`,
    'CHECK_IN_STATUS'
  );
}

async function runChannexMigrations() {
  if (!(await tableExists('room_type'))) {
    console.warn('⚠️ room_type table not found, skipping Channex column migration');
    return;
  }

  await ensureColumn(
    'room_type',
    'CHANNEX_ROOM_TYPE_ID',
    `CHANNEX_ROOM_TYPE_ID VARCHAR(36) NULL DEFAULT NULL COMMENT 'Linked room_type.id on Channex, set after first sync'`,
    'BASE_PRICE'
  );
}

async function runChannelBookingIdMigrations() {
  if (await tableExists('group_booking')) {
    await ensureColumn(
      'group_booking',
      'CHANNEL_BOOKING_ID',
      `CHANNEL_BOOKING_ID VARCHAR(100) NULL DEFAULT NULL COMMENT 'External OTA / booking-channel reference ID'`,
      'REMARKS'
    );
  } else {
    console.warn('⚠️ group_booking table not found, skipping CHANNEL_BOOKING_ID migration');
  }

  if (await tableExists('booking')) {
    await ensureColumn(
      'booking',
      'CHANNEL_BOOKING_ID',
      `CHANNEL_BOOKING_ID VARCHAR(100) NULL DEFAULT NULL COMMENT 'External OTA / booking-channel reference ID'`,
      'BOOKING_CHANNEL'
    );
  } else {
    console.warn('⚠️ booking table not found, skipping CHANNEL_BOOKING_ID migration');
  }
}

async function runCheckInNotifierMigrations() {
  await queryDatabasePromise(`
    CREATE TABLE IF NOT EXISTS check_in_notifier_log (
      IDNo INT NOT NULL AUTO_INCREMENT,
      BOOKING_ID INT NOT NULL,
      NOTIFY_WINDOW VARCHAR(10) NOT NULL COMMENT '1day, 3day, 7day',
      REFERENCE_CHECKIN_DATE DATE NOT NULL,
      ENCODED_BY INT NULL DEFAULT NULL,
      ENCODED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (IDNo),
      UNIQUE KEY uq_booking_window_checkin (BOOKING_ID, NOTIFY_WINDOW, REFERENCE_CHECKIN_DATE),
      KEY idx_notifier_checkin_date (REFERENCE_CHECKIN_DATE)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  console.log('✅ Ensured table: check_in_notifier_log');
}

async function runActivityLogMigrations() {
  // Lean, staff-facing audit trail. Column order: when -> source -> action ->
  // booking -> summary -> amount -> outcome -> who -> before/after JSON.
  // Single source of truth for each column definition (no COMMENT clauses).
  const COLUMNS = {
    IDNo: 'BIGINT NOT NULL AUTO_INCREMENT',
    ENCODED_DT: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    MODULE: 'VARCHAR(50) NOT NULL',
    ACTION: 'VARCHAR(60) NOT NULL',
    BOOKING_ID: 'INT NULL DEFAULT NULL',
    DESCRIPTION: 'VARCHAR(500) NULL DEFAULT NULL',
    AMOUNT: 'DECIMAL(14,2) NULL DEFAULT NULL',
    STATUS: "VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'",
    ERROR_MESSAGE: 'VARCHAR(500) NULL DEFAULT NULL',
    USER_ID: 'INT NULL DEFAULT NULL',
    USER_NAME: 'VARCHAR(150) NULL DEFAULT NULL',
    OLD_DATA: 'LONGTEXT NULL DEFAULT NULL',
    NEW_DATA: 'LONGTEXT NULL DEFAULT NULL'
  };

  const CREATE_SQL = `
    CREATE TABLE activity_log (
      ${Object.entries(COLUMNS).map(([n, d]) => `${n} ${d}`).join(',\n      ')},
      PRIMARY KEY (IDNo),
      KEY idx_activity_dt (ENCODED_DT),
      KEY idx_activity_module (MODULE),
      KEY idx_activity_action (ACTION),
      KEY idx_activity_booking (BOOKING_ID),
      KEY idx_activity_user (USER_ID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `;

  // Create only if it does not exist yet.
  const created = await ensureTable('activity_log', CREATE_SQL);
  if (created) return;

  // ---- Evolve an existing table to the trimmed schema ----

  // Columns we keep (add if missing).
  await ensureColumn('activity_log', 'BOOKING_ID', `BOOKING_ID ${COLUMNS.BOOKING_ID}`, 'ACTION');
  await ensureColumn('activity_log', 'AMOUNT', `AMOUNT ${COLUMNS.AMOUNT}`, 'DESCRIPTION');

  // Columns we no longer keep.
  for (const col of ['ENTITY_TYPE', 'ENTITY_ID', 'IP_ADDRESS', 'HTTP_METHOD', 'ENDPOINT', 'USER_AGENT']) {
    if (await columnExists('activity_log', col)) {
      await queryDatabasePromise(`ALTER TABLE activity_log DROP COLUMN ${col}`);
      console.log(`✅ Dropped column: activity_log.${col}`);
    }
  }

  if (await indexExists('activity_log', 'idx_activity_entity')) {
    await queryDatabasePromise('DROP INDEX idx_activity_entity ON activity_log');
    console.log('✅ Dropped index: activity_log.idx_activity_entity');
  }
  await ensureIndex('activity_log', 'idx_activity_booking', 'BOOKING_ID');
  await ensureIndex('activity_log', 'idx_activity_user', 'USER_ID');

  // Strip any leftover column comments from earlier versions of this migration.
  const commented = await queryDatabasePromise(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'activity_log'
        AND COLUMN_COMMENT <> ''`
  );
  if (Number(commented[0]?.cnt || 0) > 0) {
    for (const [name, def] of Object.entries(COLUMNS)) {
      if (await columnExists('activity_log', name)) {
        await queryDatabasePromise(`ALTER TABLE activity_log MODIFY COLUMN ${name} ${def}`);
      }
    }
    console.log('✅ Removed column comments from activity_log');
  }
}

async function runRoomRatesMigrations() {
  const { seedRows } = require('../config/roomRates');

  // Fresh installs get the final shape directly: keyed by ROOM_TYPE_ID
  // (FK -> room_type.IDNo), no BED_TYPE column.
  await queryDatabasePromise(`
    CREATE TABLE IF NOT EXISTS room_rates (
      IDNo INT NOT NULL AUTO_INCREMENT,
      CATEGORY VARCHAR(40) NOT NULL,
      DAY_RANGE VARCHAR(10) NOT NULL,
      ROOM_TYPE_ID INT NULL DEFAULT NULL,
      BREAKFAST VARCHAR(10) NOT NULL,
      AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
      UPDATED_BY INT NULL DEFAULT NULL,
      UPDATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (IDNo),
      UNIQUE KEY uq_room_rate (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // Legacy per-type base price is unused; relax it so room-type INSERTs that
  // omit it don't fail.
  try {
    if (await tableExists('room_type') && await columnExists('room_type', 'BASE_PRICE')) {
      const [col] = await queryDatabasePromise(
        `SHOW COLUMNS FROM room_type WHERE Field = 'BASE_PRICE'`
      );
      if (col && String(col.Null).toUpperCase() === 'NO') {
        await queryDatabasePromise(
          `ALTER TABLE room_type MODIFY BASE_PRICE DECIMAL(10,2) NULL DEFAULT NULL`
        );
        console.log('✅ room_type.BASE_PRICE relaxed to NULL DEFAULT NULL (legacy, unused)');
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not relax room_type.BASE_PRICE:', e.message);
  }

  // ---- Migrate an existing BED_TYPE-keyed table to ROOM_TYPE_ID-keyed ----
  if (!(await columnExists('room_rates', 'ROOM_TYPE_ID'))) {
    await ensureColumn('room_rates', 'ROOM_TYPE_ID', 'ROOM_TYPE_ID INT NULL DEFAULT NULL', 'DAY_RANGE');
  }
  const hasBedType = await columnExists('room_rates', 'BED_TYPE');

  // Resolve which room_type is king / queen (match by name, fall back to the
  // ROOM_BED its rooms carry).
  let kingTypeId = null;
  let queenTypeId = null;
  if (await tableExists('room_type')) {
    const rt = await queryDatabasePromise(`SELECT IDNo, NAME FROM room_type WHERE ACTIVE = 1 ORDER BY IDNo`);
    for (const t of rt) {
      const n = String(t.NAME || '').toLowerCase();
      if (n.includes('queen') && queenTypeId == null) queenTypeId = t.IDNo;
      else if (n.includes('king') && kingTypeId == null) kingTypeId = t.IDNo;
    }
    if ((kingTypeId == null || queenTypeId == null)
        && await tableExists('room') && await columnExists('room', 'ROOM_BED')) {
      const byBed = await queryDatabasePromise(
        `SELECT ROOM_TYPE_ID,
                IF(SUM(ROOM_BED = 2) >= SUM(ROOM_BED = 1), 'queen', 'king') AS bt
           FROM room WHERE ACTIVE = 1 GROUP BY ROOM_TYPE_ID`
      );
      for (const b of byBed) {
        if (b.bt === 'queen' && queenTypeId == null) queenTypeId = b.ROOM_TYPE_ID;
        if (b.bt === 'king' && kingTypeId == null) kingTypeId = b.ROOM_TYPE_ID;
      }
    }
  }
  const slugToType = { king: kingTypeId, queen: queenTypeId };

  // Backfill ROOM_TYPE_ID from the old BED_TYPE values.
  if (hasBedType) {
    if (kingTypeId != null) {
      await queryDatabasePromise(
        `UPDATE room_rates SET ROOM_TYPE_ID = ? WHERE ROOM_TYPE_ID IS NULL AND BED_TYPE = 'king'`,
        [kingTypeId]
      );
    }
    if (queenTypeId != null) {
      await queryDatabasePromise(
        `UPDATE room_rates SET ROOM_TYPE_ID = ? WHERE ROOM_TYPE_ID IS NULL AND BED_TYPE = 'queen'`,
        [queenTypeId]
      );
    }
    // Drop rows that can't be mapped (blank / unknown BED_TYPE with no type) -
    // they are unusable once the table is keyed by ROOM_TYPE_ID.
    const junk = await queryDatabasePromise(
      `DELETE FROM room_rates
        WHERE ROOM_TYPE_ID IS NULL
          AND (BED_TYPE IS NULL OR BED_TYPE = '' OR BED_TYPE NOT IN ('king', 'queen'))`
    );
    if (junk.affectedRows) {
      console.log(`✅ Removed ${junk.affectedRows} unmappable room_rates row(s)`);
    }
  }

  // Seed missing cells from the printed rate sheet (INSERT IGNORE - never
  // overwrites edited amounts). Skipped for a slug with no matching room type.
  const seed = seedRows().filter((r) => slugToType[r.bedSlug] != null);
  if (seed.length) {
    const values = seed.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = [];
    seed.forEach((r) => params.push(r.category, r.dayRange, slugToType[r.bedSlug], r.breakfast, r.amount));
    await queryDatabasePromise(
      `INSERT IGNORE INTO room_rates (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST, AMOUNT)
       VALUES ${values}`,
      params
    );
  }
  console.log('✅ Ensured table + seed: room_rates (keyed by ROOM_TYPE_ID)');

  // Swap the unique key to include ROOM_TYPE_ID instead of BED_TYPE.
  try {
    if (await indexExists('room_rates', 'uq_room_rate')) {
      const idxCols = await queryDatabasePromise(
        `SELECT COLUMN_NAME FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_rates' AND INDEX_NAME = 'uq_room_rate'`
      );
      if (idxCols.map((c) => c.COLUMN_NAME).includes('BED_TYPE')) {
        await queryDatabasePromise(`ALTER TABLE room_rates DROP INDEX uq_room_rate`);
        await queryDatabasePromise(
          `ALTER TABLE room_rates ADD UNIQUE KEY uq_room_rate (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST)`
        );
        console.log('✅ room_rates unique key -> (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST)');
      }
    } else {
      await queryDatabasePromise(
        `ALTER TABLE room_rates ADD UNIQUE KEY uq_room_rate (CATEGORY, DAY_RANGE, ROOM_TYPE_ID, BREAKFAST)`
      );
    }
  } catch (e) {
    console.warn('⚠️ room_rates unique key swap:', e.message);
  }

  // FK room_rates.ROOM_TYPE_ID -> room_type.IDNo.
  try {
    const [fk] = await queryDatabasePromise(
      `SELECT COUNT(*) AS c FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'room_rates'
          AND COLUMN_NAME = 'ROOM_TYPE_ID' AND REFERENCED_TABLE_NAME = 'room_type'`
    );
    if ((!fk || !fk.c) && await tableExists('room_type')) {
      const [orphan] = await queryDatabasePromise(
        `SELECT COUNT(*) AS c FROM room_rates rr
           LEFT JOIN room_type rt ON rt.IDNo = rr.ROOM_TYPE_ID
          WHERE rr.ROOM_TYPE_ID IS NOT NULL AND rt.IDNo IS NULL`
      );
      if (orphan && orphan.c > 0) {
        console.warn(`⚠️ ${orphan.c} room_rates row(s) point at a missing room type - skipping FK`);
      } else {
        await queryDatabasePromise(
          `ALTER TABLE room_rates ADD CONSTRAINT fk_room_rates_room_type
             FOREIGN KEY (ROOM_TYPE_ID) REFERENCES room_type (IDNo)
             ON UPDATE CASCADE ON DELETE RESTRICT`
        );
        console.log('✅ Added FK room_rates.ROOM_TYPE_ID -> room_type.IDNo (fk_room_rates_room_type)');
      }
    }
  } catch (e) {
    console.warn('⚠️ room_rates FK:', e.message);
  }

  // Drop the now-unused BED_TYPE columns once every row is migrated.
  try {
    if (await columnExists('room_rates', 'BED_TYPE')) {
      const [nulls] = await queryDatabasePromise(
        `SELECT COUNT(*) AS c FROM room_rates WHERE ROOM_TYPE_ID IS NULL`
      );
      if (nulls && nulls.c > 0) {
        console.warn(`⚠️ ${nulls.c} room_rates row(s) still have NULL ROOM_TYPE_ID - keeping BED_TYPE`);
      } else {
        await queryDatabasePromise(`ALTER TABLE room_rates DROP COLUMN BED_TYPE`);
        console.log('✅ Dropped room_rates.BED_TYPE');
      }
    }
    if (await tableExists('room_type') && await columnExists('room_type', 'BED_TYPE')) {
      await queryDatabasePromise(`ALTER TABLE room_type DROP COLUMN BED_TYPE`);
      console.log('✅ Dropped room_type.BED_TYPE');
    }
  } catch (e) {
    console.warn('⚠️ dropping BED_TYPE columns:', e.message);
  }
}

// room.ROOM_TYPE_ID has always been a plain int with no constraint. Every row
// already points at a valid room_type (verified: 0 orphans, 0 NULLs), so add the
// missing FK so a room can never reference a deleted/typo'd room type. Room-type
// deletes are soft (ACTIVE = 0), so ON DELETE RESTRICT is safe and just blocks a
// hard delete of a type still in use.
async function runRoomTypeFkMigration() {
  if (!(await tableExists('room')) || !(await tableExists('room_type'))) {
    console.warn('⚠️ room / room_type table not found, skipping room->room_type FK migration');
    return;
  }

  try {
    const [existing] = await queryDatabasePromise(
      `SELECT COUNT(*) AS c
         FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'room'
          AND COLUMN_NAME = 'ROOM_TYPE_ID'
          AND REFERENCED_TABLE_NAME = 'room_type'`
    );
    if (existing && existing.c > 0) {
      return; // FK already in place
    }

    const [orphan] = await queryDatabasePromise(
      `SELECT COUNT(*) AS c
         FROM room r
         LEFT JOIN room_type rt ON rt.IDNo = r.ROOM_TYPE_ID
        WHERE r.ROOM_TYPE_ID IS NULL OR rt.IDNo IS NULL`
    );
    if (orphan && orphan.c > 0) {
      console.warn(`⚠️ ${orphan.c} room row(s) have an invalid ROOM_TYPE_ID - skipping room->room_type FK (fix the data first)`);
      return;
    }

    await queryDatabasePromise(
      `ALTER TABLE room
         ADD CONSTRAINT fk_room_room_type
         FOREIGN KEY (ROOM_TYPE_ID) REFERENCES room_type (IDNo)
         ON UPDATE CASCADE ON DELETE RESTRICT`
    );
    console.log('✅ Added FK room.ROOM_TYPE_ID -> room_type.IDNo (fk_room_room_type)');
  } catch (e) {
    console.warn('⚠️ Could not add room->room_type FK:', e.message);
  }
}

async function runCustomerNationalityMigration() {
  if (!(await tableExists('customer'))) {
    console.warn('⚠️ customer table not found, skipping NATIONALITY column migration');
    return;
  }
  await ensureColumn(
    'customer',
    'NATIONALITY',
    `NATIONALITY VARCHAR(60) NULL DEFAULT NULL`,
    'CONTACTNo'
  );
}

async function runBillingReceiptNoMigration() {
  if (!(await tableExists('billing'))) {
    console.warn('⚠️ billing table not found, skipping RECEIPT_NO column migration');
    return;
  }
  // Manual override of the printed receipt number, set from the Billing Receipt
  // ("Edit receipt no."). Separate from booking.CONFIRMATION_NUMBER, which stays
  // fully auto-generated/regenerated as before.
  await ensureColumn(
    'billing',
    'RECEIPT_NO',
    `RECEIPT_NO VARCHAR(255) NULL DEFAULT NULL`,
    'BOOKING_ID'
  );
}

async function runBookingActualTimesMigration() {
  if (!(await tableExists('booking'))) {
    console.warn('⚠️ booking table not found, skipping actual check-in/out timestamp migration');
    return;
  }

  await ensureColumn(
    'booking',
    'ACTUAL_CHECK_IN_DT',
    `ACTUAL_CHECK_IN_DT DATETIME NULL DEFAULT NULL`,
    'CHECK_IN_DATE'
  );
  await ensureColumn(
    'booking',
    'ACTUAL_CHECK_OUT_DT',
    `ACTUAL_CHECK_OUT_DT DATETIME NULL DEFAULT NULL`,
    'CHECK_OUT_DATE'
  );

  // Best-effort backfill - runs every startup but only touches rows that are
  // still NULL, so it stays cheap and idempotent.

  // Checkout: on checkout the system already overwrites CHECK_OUT_DATE with
  // NOW(), so a non-midnight time there is the real checkout timestamp.
  const outFill = await queryDatabasePromise(
    `UPDATE booking
        SET ACTUAL_CHECK_OUT_DT = CHECK_OUT_DATE
      WHERE BOOKING_STATUS = 'check-Out'
        AND ACTUAL_CHECK_OUT_DT IS NULL
        AND CHECK_OUT_DATE IS NOT NULL
        AND TIME(CHECK_OUT_DATE) <> '00:00:00'`
  );
  if (outFill.affectedRows) {
    console.log(`✅ Backfilled ACTUAL_CHECK_OUT_DT for ${outFill.affectedRows} booking(s)`);
  }

  // Check-in: only source is the audit trail (a real event timestamp).
  if (await tableExists('activity_log')) {
    const inFill = await queryDatabasePromise(
      `UPDATE booking b
          JOIN (
            SELECT BOOKING_ID, MAX(ENCODED_DT) AS dt
              FROM activity_log
             WHERE BOOKING_ID IS NOT NULL
               AND STATUS = 'SUCCESS'
               AND (ACTION LIKE 'CHECK_IN%' OR ACTION = 'MOVE_TO_OCCUPIED')
             GROUP BY BOOKING_ID
          ) al ON al.BOOKING_ID = b.IDNo
          SET b.ACTUAL_CHECK_IN_DT = al.dt
        WHERE b.ACTUAL_CHECK_IN_DT IS NULL`
    );
    if (inFill.affectedRows) {
      console.log(`✅ Backfilled ACTUAL_CHECK_IN_DT for ${inFill.affectedRows} booking(s)`);
    }
  }
}

async function runStartupMigrations() {
  console.log('🔄 Running startup database migrations...');

  await runActivityLogMigrations();
  await runCustomerNationalityMigration();
  await runBillingReceiptNoMigration();
  await runBookingActualTimesMigration();
  await runRoomRatesMigrations();
  await runRoomTypeFkMigration();
  await runFlightScheduleMigrations();
  await runPickupDropMigrations();
  await runReceiptMigrations();
  await runLongTermStayMigrations();
  await runHoldPendingMigrations();
  await runChannelBookingIdMigrations();
  await runCalendarPerformanceMigrations();
  await runChannexMigrations();
  await runCheckInNotifierMigrations();

  console.log('✅ Startup database migrations complete');
}

if (require.main === module) {
  runStartupMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Startup migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  runStartupMigrations,
  ensureTable,
  ensureColumn,
  tableExists,
  columnExists
};
