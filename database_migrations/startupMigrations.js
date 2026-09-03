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

  await queryDatabasePromise(`
    CREATE TABLE IF NOT EXISTS room_rates (
      IDNo INT NOT NULL AUTO_INCREMENT,
      CATEGORY VARCHAR(40) NOT NULL,
      DAY_RANGE VARCHAR(10) NOT NULL,
      BED_TYPE VARCHAR(10) NOT NULL,
      BREAKFAST VARCHAR(10) NOT NULL,
      AMOUNT DECIMAL(12,2) NOT NULL DEFAULT 0,
      UPDATED_BY INT NULL DEFAULT NULL,
      UPDATED_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (IDNo),
      UNIQUE KEY uq_room_rate (CATEGORY, DAY_RANGE, BED_TYPE, BREAKFAST)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  // Seed any missing cells from the printed rate sheet (safe to re-run: only
  // inserts rows that don't exist yet, never overwrites edited amounts).
  const rows = seedRows();
  const values = rows.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params = [];
  rows.forEach((r) => params.push(r.category, r.dayRange, r.bedType, r.breakfast, r.amount));

  await queryDatabasePromise(
    `INSERT IGNORE INTO room_rates (CATEGORY, DAY_RANGE, BED_TYPE, BREAKFAST, AMOUNT)
     VALUES ${values}`,
    params
  );
  console.log('✅ Ensured table + seed: room_rates');
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
  await runBookingActualTimesMigration();
  await runRoomRatesMigrations();
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
