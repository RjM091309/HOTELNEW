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

async function runStartupMigrations() {
  console.log('🔄 Running startup database migrations...');

  await runFlightScheduleMigrations();
  await runPickupDropMigrations();
  await runReceiptMigrations();
  await runLongTermStayMigrations();
  await runHoldPendingMigrations();

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
