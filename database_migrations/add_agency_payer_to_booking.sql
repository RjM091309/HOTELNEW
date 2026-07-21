-- ========================================
-- ADD AGENCY_PAYER TO BOOKING TABLE
-- ========================================
-- Stores who pays for agency bookings: 'agency' or 'guest'

DELIMITER //

DROP PROCEDURE IF EXISTS `_add_agency_payer_column` //

CREATE PROCEDURE `_add_agency_payer_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking' AND COLUMN_NAME = 'AGENCY_PAYER'
  ) THEN
    ALTER TABLE `booking`
      ADD COLUMN `AGENCY_PAYER` VARCHAR(10) NULL DEFAULT NULL
      COMMENT 'Who pays for agency booking: agency or guest'
      AFTER `AGENCY_ID`;
  END IF;
END //

DELIMITER ;

CALL `_add_agency_payer_column`();

DROP PROCEDURE IF EXISTS `_add_agency_payer_column`;
