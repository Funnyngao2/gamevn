-- ************************************************************
-- Among Us Web - Room Tables
-- Database: gameastro
-- Host: 127.0.0.1:3306
-- Charset: utf8mb3 (matches gameastro_2026-03-02_11-04-38.sql)
-- ************************************************************

USE `gameastro`;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
SET NAMES utf8mb3;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

-- ─────────────────────────────────────────────────────────────
-- Table: game_rooms
-- Lưu thông tin phòng chơi (tạo bởi nanoid trên server)
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS `game_rooms`;

CREATE TABLE `game_rooms` (
  `id`           varchar(21)  COLLATE utf8mb3_unicode_ci NOT NULL COMMENT 'nanoid - unique room id',
  `name`         varchar(40)  COLLATE utf8mb3_unicode_ci NOT NULL COMMENT 'Tên phòng',
  `host_id`      varchar(21)  COLLATE utf8mb3_unicode_ci NOT NULL COMMENT 'socket id của host',
  `host_name`    varchar(20)  COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT '' COMMENT 'Tên host',
  `max_players`  tinyint      NOT NULL DEFAULT 8 COMMENT '6 | 8 | 10',
  `player_count` tinyint      NOT NULL DEFAULT 0 COMMENT 'Số người hiện tại',
  `status`       enum('waiting','started','ended') COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT 'waiting',
  `password`     varchar(20)  COLLATE utf8mb3_unicode_ci DEFAULT NULL COMMENT 'NULL = phòng công khai',
  `colyseus_room_id` varchar(64) COLLATE utf8mb3_unicode_ci DEFAULT NULL COMMENT 'Colyseus room id nếu dùng',
  `created_at`   datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ended_at`     datetime     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
  COMMENT='Danh sách phòng game Among Us Web';

-- ─────────────────────────────────────────────────────────────
-- Table: game_room_players
-- Lưu danh sách người chơi trong từng phòng
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS `game_room_players`;

CREATE TABLE `game_room_players` (
  `id`         int          NOT NULL AUTO_INCREMENT,
  `room_id`    varchar(21)  COLLATE utf8mb3_unicode_ci NOT NULL,
  `socket_id`  varchar(64)  COLLATE utf8mb3_unicode_ci NOT NULL COMMENT 'socket.io / colyseus session id',
  `player_name` varchar(20) COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT 'Player',
  `color`      varchar(10)  COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT 'red'
                            COMMENT 'red|blue|green|orange|yellow|black|brown|pink|purple|white',
  `role`       enum('crewmate','impostor') COLLATE utf8mb3_unicode_ci DEFAULT NULL
                            COMMENT 'Gán khi game bắt đầu',
  `status`     enum('alive','ghost','left') COLLATE utf8mb3_unicode_ci NOT NULL DEFAULT 'alive',
  `tasks_done` tinyint      NOT NULL DEFAULT 0,
  `is_host`    tinyint(1)   NOT NULL DEFAULT 0,
  `is_ready`   tinyint(1)   NOT NULL DEFAULT 0,
  `joined_at`  datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at`    datetime     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_socket_id` (`socket_id`),
  CONSTRAINT `fk_room_players_room`
    FOREIGN KEY (`room_id`) REFERENCES `game_rooms` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
  COMMENT='Người chơi trong từng phòng';

-- ─────────────────────────────────────────────────────────────
-- Table: game_room_events  (log sự kiện: kill, vote, task...)
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS `game_room_events`;

CREATE TABLE `game_room_events` (
  `id`         int          NOT NULL AUTO_INCREMENT,
  `room_id`    varchar(21)  COLLATE utf8mb3_unicode_ci NOT NULL,
  `event_type` enum('kill','vote','eject','task_done','meeting','gameover','chat')
               COLLATE utf8mb3_unicode_ci NOT NULL,
  `actor_id`   varchar(64)  COLLATE utf8mb3_unicode_ci DEFAULT NULL COMMENT 'socket_id người thực hiện',
  `target_id`  varchar(64)  COLLATE utf8mb3_unicode_ci DEFAULT NULL COMMENT 'socket_id mục tiêu',
  `payload`    json         DEFAULT NULL COMMENT 'Dữ liệu thêm (winner, taskId, text...)',
  `created_at` datetime     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_event` (`room_id`, `event_type`),
  CONSTRAINT `fk_events_room`
    FOREIGN KEY (`room_id`) REFERENCES `game_rooms` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
  COMMENT='Log sự kiện trong trận đấu';

-- ─────────────────────────────────────────────────────────────
-- Restore settings
-- ─────────────────────────────────────────────────────────────

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
