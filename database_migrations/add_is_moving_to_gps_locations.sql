-- ========================================
-- ADD is_moving COLUMN TO gps_locations
-- ========================================
-- This migration adds is_moving column to track vehicle movement status
-- Calculated when saving to database for consistency

ALTER TABLE `gps_locations` 
ADD COLUMN `is_moving` TINYINT(1) DEFAULT 0 COMMENT 'Whether vehicle is moving (1=moving, 0=standby). Calculated based on speed > 3 km/h AND distance >= 30m' 
AFTER `gsm_signal`;

-- Create index for faster queries on is_moving status
CREATE INDEX `idx_is_moving` ON `gps_locations` (`is_moving`);

