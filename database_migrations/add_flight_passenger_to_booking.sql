-- ========================================
-- ADD FLIGHT NUMBER / PASSENGER COUNT TO BOOKING TABLE
-- ========================================
-- Used for airport pick-up/drop-off (PUAP) verification: when Pick-up or
-- Drop-off is selected on a booking, staff must enter the flight number
-- and number of passengers.
--
-- MySQL does not support "ADD COLUMN IF NOT EXISTS" as a plain ALTER TABLE
-- clause, so this uses a throwaway procedure to check information_schema
-- first, making the migration safe to re-run.

DELIMITER //

DROP PROCEDURE IF EXISTS `_add_flight_passenger_columns` //

CREATE PROCEDURE `_add_flight_passenger_columns`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking' AND COLUMN_NAME = 'FLIGHT_NUMBER'
  ) THEN
    ALTER TABLE `booking`
      ADD COLUMN `FLIGHT_NUMBER` VARCHAR(20) NULL DEFAULT NULL COMMENT 'Flight number for airport pick-up/drop-off (PUAP)' AFTER `BED_COUNT`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking' AND COLUMN_NAME = 'PASSENGER_COUNT'
  ) THEN
    ALTER TABLE `booking`
      ADD COLUMN `PASSENGER_COUNT` INT NULL DEFAULT NULL COMMENT 'Number of passengers for airport pick-up/drop-off (PUAP)' AFTER `FLIGHT_NUMBER`;
  END IF;
END //

DELIMITER ;

CALL `_add_flight_passenger_columns`();

DROP PROCEDURE IF EXISTS `_add_flight_passenger_columns`;
