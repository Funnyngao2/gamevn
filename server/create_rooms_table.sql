-- Among Us Web — Database Schema
-- Run this file once to set up all tables.
-- Compatible with MySQL 5.7+ / MariaDB 10.3+

CREATE DATABASE IF NOT EXISTS gameastro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gameastro;

-- ── Rooms ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_rooms (
  id            VARCHAR(16)  NOT NULL PRIMARY KEY,
  name          VARCHAR(40)  NOT NULL,
  host_id       VARCHAR(64)  NOT NULL,
  host_name     VARCHAR(20)  NOT NULL,
  max_players   TINYINT      NOT NULL DEFAULT 8,
  player_count  TINYINT      NOT NULL DEFAULT 0,
  status        ENUM('waiting','started','ended') NOT NULL DEFAULT 'waiting',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at      DATETIME     NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Room players ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS game_room_players (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id       VARCHAR(16)  NOT NULL,
  socket_id     VARCHAR(64)  NOT NULL,
  player_name   VARCHAR(20)  NOT NULL,
  color         VARCHAR(12)  NOT NULL DEFAULT 'red',
  is_host       TINYINT(1)   NOT NULL DEFAULT 0,
  role          ENUM('crewmate','impostor') NULL,
  tasks_done    SMALLINT     NOT NULL DEFAULT 0,
  status        ENUM('active','ghost','left') NOT NULL DEFAULT 'active',
  joined_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at       DATETIME     NULL,
  INDEX idx_room   (room_id),
  INDEX idx_socket (socket_id),
  CONSTRAINT fk_players_room
    FOREIGN KEY (room_id) REFERENCES game_rooms(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Room events (kills, votes, tasks, sabotage…) ──────────────────────────────
CREATE TABLE IF NOT EXISTS game_room_events (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id       VARCHAR(16)  NOT NULL,
  event_type    VARCHAR(32)  NOT NULL,
  actor_id      VARCHAR(64)  NULL,
  target_id     VARCHAR(64)  NULL,
  payload       JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_room_event (room_id, event_type),
  CONSTRAINT fk_events_room
    FOREIGN KEY (room_id) REFERENCES game_rooms(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Chat messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  channel       ENUM('lobby','room') NOT NULL DEFAULT 'lobby',
  room_id       VARCHAR(16)  NULL,
  sender_id     VARCHAR(64)  NOT NULL,
  sender_name   VARCHAR(20)  NOT NULL,
  sender_color  VARCHAR(12)  NOT NULL DEFAULT 'red',
  message       TEXT         NULL, -- Tăng dung lượng để chứa tin nhắn dài
  audio_data    MEDIUMTEXT   NULL, -- Thêm cột lưu Audio Base64 (hỗ trợ ~16MB)
  is_system     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_lobby_chat (channel, created_at),
  INDEX idx_room_chat  (room_id, channel, created_at),

  CONSTRAINT fk_chat_room
    FOREIGN KEY (room_id) REFERENCES game_rooms(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
