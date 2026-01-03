-- ========================================
-- ADD GPS DEVICE ID TO VEHICLE TABLE
-- ========================================
-- This migration adds GPS tracker device ID to vehicle table
-- Run this SQL script to add GPS tracking capability to vehicles

-- Add GPS_DEVICE_ID column to vehicle table
ALTER TABLE `vehicle` 
ADD COLUMN `GPS_DEVICE_ID` VARCHAR(50) NULL DEFAULT NULL COMMENT 'GPS Tracker Device ID (IMEI) - Links vehicle to GPS tracker' 
AFTER `REMARKS`;

-- Add index for faster lookups
CREATE INDEX `idx_gps_device_id` ON `vehicle` (`GPS_DEVICE_ID`);

-- Optional: Add a view for vehicles with their latest GPS location
CREATE OR REPLACE VIEW `v_vehicles_with_location` AS
SELECT 
  v.IDNo,
  v.MODEL_NAME,
  v.VEHICLE_TYPE,
  v.COLOR,
  v.PLATE_NUMBER,
  v.FUEL_TYPE,
  v.REMARKS,
  v.VEHICLE_PHOTO,
  v.GPS_DEVICE_ID,
  v.ACTIVE,
  gl.latitude,
  gl.longitude,
  gl.speed,
  gl.heading,
  gl.timestamp as last_location_time,
  gl.battery,
  gl.created_at as last_location_created
FROM `vehicle` v
LEFT JOIN (
  SELECT 
    device_id,
    latitude,
    longitude,
    speed,
    heading,
    timestamp,
    battery,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY timestamp DESC, created_at DESC) as rn
  FROM `gps_locations`
) gl ON v.GPS_DEVICE_ID = gl.device_id AND gl.rn = 1
WHERE v.ACTIVE = 1;

