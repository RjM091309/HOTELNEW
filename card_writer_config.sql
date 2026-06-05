-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jun 02, 2026 at 11:22 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `hotel`
--

-- --------------------------------------------------------

--
-- Table structure for table `card_writer_config`
--

CREATE TABLE `card_writer_config` (
  `id` int(11) NOT NULL,
  `device_seq` varchar(64) DEFAULT NULL,
  `platform_url` varchar(512) NOT NULL,
  `callback_url` varchar(512) DEFAULT NULL,
  `username` varchar(128) DEFAULT NULL,
  `password_hash` varchar(64) DEFAULT NULL,
  `last_token` varchar(512) DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `last_connection_message` text DEFAULT NULL,
  `last_connection_success` tinyint(1) DEFAULT NULL,
  `last_connection_at` datetime DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `card_writer_config`
--

INSERT INTO `card_writer_config` (`id`, `device_seq`, `platform_url`, `callback_url`, `username`, `password_hash`, `last_token`, `token_expires_at`, `last_connection_message`, `last_connection_success`, `last_connection_at`, `created_by`, `updated_by`, `created_at`, `updated_at`) VALUES
(1, 'MNR6326ACE6663', 'https://server.hxjiot.com/', NULL, '3core21', 'F5449E95E7F4AF9E8F6FCC84EA2FB56B', 'Y0IFV96ntTMVlfElMC6TGXUChPDyW0ZLN482g0qNfZt2suw9canjPM4jdOZLme5YzI0v7YkMYfn1iKYXgn61PFRT0jSV1efO', '2026-06-09 14:55:14', 'Connection successful', 1, '2026-06-02 14:55:14', 3, 3, '2026-06-02 06:54:40', '2026-06-02 06:55:14');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `card_writer_config`
--
ALTER TABLE `card_writer_config`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_card_writer_config_updated_at` (`updated_at`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `card_writer_config`
--
ALTER TABLE `card_writer_config`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
