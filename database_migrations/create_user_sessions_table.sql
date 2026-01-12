-- ========================================
-- USER SESSIONS TABLE
-- ========================================
-- This table stores active user sessions for 1-to-1 login restriction
-- Sessions persist across server restarts

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `user_id` INT(11) NOT NULL COMMENT 'User ID from user_info table',
  `token` TEXT NOT NULL COMMENT 'JWT token for this session',
  `token_hash` VARCHAR(255) NOT NULL COMMENT 'Hash of token for indexing',
  `socket_id` VARCHAR(100) NULL DEFAULT NULL COMMENT 'Socket.IO socket ID if connected',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Session creation timestamp',
  `last_activity` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last activity timestamp',
  `expires_at` DATETIME NOT NULL COMMENT 'Token expiration timestamp',
  `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Session active flag',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token_hash` (`token_hash`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_active` (`active`),
  INDEX `idx_expires_at` (`expires_at`),
  INDEX `idx_user_active` (`user_id`, `active`),
  FOREIGN KEY (`user_id`) REFERENCES `user_info`(`IDno`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Active User Sessions for 1-to-1 Login Restriction';

