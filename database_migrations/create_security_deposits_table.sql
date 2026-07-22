-- ========================================
-- SECURITY DEPOSITS TABLE (separate from payments)
-- Deposits are refundable holds — NOT room/service payments.
-- ========================================

CREATE TABLE IF NOT EXISTS `security_deposits` (
  `IDNo` INT NOT NULL AUTO_INCREMENT,
  `BOOKING_ID` INT NOT NULL,
  `AMOUNT` DECIMAL(12, 2) NOT NULL,
  `PAYMENT_METHOD` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `STATUS` ENUM('held', 'refunded') NOT NULL DEFAULT 'held',
  `REMARKS` VARCHAR(255) NULL DEFAULT NULL,
  `ENCODED_BY` INT NULL DEFAULT NULL,
  `COLLECTED_AT` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `REFUNDED_AT` DATETIME NULL DEFAULT NULL,
  `REFUNDED_BY` INT NULL DEFAULT NULL,
  `DEDUCTION_AMOUNT` DECIMAL(12, 2) NULL DEFAULT NULL,
  `CASH_REFUND_AMOUNT` DECIMAL(12, 2) NULL DEFAULT NULL,
  `APPLIED_TO_BALANCE` DECIMAL(12, 2) NULL DEFAULT NULL,
  `ACTIVE` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`IDNo`),
  KEY `idx_security_deposits_booking` (`BOOKING_ID`),
  KEY `idx_security_deposits_status` (`STATUS`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Move any legacy rows that were stored in payments
INSERT INTO `security_deposits` (
  `BOOKING_ID`, `AMOUNT`, `PAYMENT_METHOD`, `STATUS`, `REMARKS`, `ENCODED_BY`, `COLLECTED_AT`, `ACTIVE`
)
SELECT
  p.`BOOKING_ID`,
  p.`AMOUNT_PAID`,
  COALESCE(p.`PAYMENT_METHOD`, 'cash'),
  'held',
  p.`REMARKS`,
  p.`ENCODED_BY`,
  COALESCE(p.`PAYMENT_DATE`, NOW()),
  1
FROM `payments` p
WHERE p.`PAYMENT_TYPE` = 'security_deposit'
  AND NOT EXISTS (
    SELECT 1 FROM `security_deposits` sd
    WHERE sd.`BOOKING_ID` = p.`BOOKING_ID`
      AND sd.`AMOUNT` = p.`AMOUNT_PAID`
      AND sd.`COLLECTED_AT` = COALESCE(p.`PAYMENT_DATE`, sd.`COLLECTED_AT`)
  );

-- Remove legacy deposit rows from payments (they are not room payments)
DELETE FROM `payments` WHERE `PAYMENT_TYPE` = 'security_deposit';
