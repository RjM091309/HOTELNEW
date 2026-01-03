CREATE TABLE IF NOT EXISTS `gps_locations` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `device_id` VARCHAR(50) NOT NULL COMMENT 'GPS Tracker Device ID (IMEI)',
  `latitude` DECIMAL(10, 8) NOT NULL COMMENT 'Latitude coordinate',
  `longitude` DECIMAL(11, 8) NOT NULL COMMENT 'Longitude coordinate',
  `speed` DECIMAL(6, 2) DEFAULT NULL COMMENT 'Speed in km/h',
  `heading` DECIMAL(5, 2) DEFAULT NULL COMMENT 'Heading/Direction in degrees (0-360)',
  `timestamp` DATETIME NOT NULL COMMENT 'GPS timestamp from device',
  `battery` DECIMAL(5, 2) DEFAULT NULL COMMENT 'Battery level percentage',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Record creation timestamp',
  PRIMARY KEY (`id`),
  INDEX `idx_device_id` (`device_id`),
  INDEX `idx_timestamp` (`timestamp`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_device_timestamp` (`device_id`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='GPS Tracker Location Data';

CREATE OR REPLACE VIEW `v_latest_gps_locations` AS
SELECT 
  g1.*
FROM `gps_locations` g1
INNER JOIN (
  SELECT 
    device_id,
    MAX(timestamp) as max_timestamp,
    MAX(created_at) as max_created_at
  FROM `gps_locations`
  GROUP BY device_id
) g2 ON g1.device_id = g2.device_id 
  AND g1.timestamp = g2.max_timestamp
  AND g1.created_at = g2.max_created_at;

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
) gl ON v.GPS_DEVICE_ID COLLATE utf8mb4_unicode_ci = gl.device_id COLLATE utf8mb4_unicode_ci AND gl.rn = 1
WHERE v.ACTIVE = 1;

