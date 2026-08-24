-- Store external OTA / booking-channel reference ID on group bookings.
-- Safe to run more than once: adds the column only if it is missing.

DELIMITER //

DROP PROCEDURE IF EXISTS `_add_channel_booking_id_column` //

CREATE PROCEDURE `_add_channel_booking_id_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'group_booking'
      AND COLUMN_NAME = 'CHANNEL_BOOKING_ID'
  ) THEN
    ALTER TABLE `group_booking`
      ADD COLUMN `CHANNEL_BOOKING_ID` VARCHAR(100) NULL DEFAULT NULL
      COMMENT 'External OTA / booking-channel reference ID'
      AFTER `REMARKS`;
  END IF;
END //

DELIMITER ;

CALL `_add_channel_booking_id_column`();

DROP PROCEDURE IF EXISTS `_add_channel_booking_id_column`;
