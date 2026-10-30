CREATE TABLE shared_demo_control (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  user_id BIGINT UNSIGNED NULL,
  CONSTRAINT ck_shared_demo_singleton CHECK (id=1),
  CONSTRAINT fk_shared_demo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO shared_demo_control(id) VALUES (1);

CREATE TABLE shared_demo_bookings (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  applicant_id BIGINT UNSIGNED NOT NULL,
  company VARCHAR(150) NOT NULL,
  needs VARCHAR(2000) NOT NULL,
  requested_at DATETIME NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status ENUM('verifying','pending','approved','active','ended','rejected') NOT NULL DEFAULT 'verifying',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  otp_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  otp_expires_at DATETIME NULL,
  otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verified_at DATETIME NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  code_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at DATETIME NULL,
  send_window_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sends SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  credit_idr BIGINT UNSIGNED NULL,
  organization_id BIGINT UNSIGNED NULL,
  workspace_id BIGINT UNSIGNED NULL,
  session_id BIGINT UNSIGNED NULL,
  entered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shared_demo_org (organization_id),
  UNIQUE KEY uq_shared_demo_workspace (workspace_id),
  UNIQUE KEY uq_shared_demo_session (session_id),
  KEY idx_shared_demo_applicant (applicant_id,created_at),
  KEY idx_shared_demo_schedule (status,starts_at,ends_at),
  CONSTRAINT ck_shared_demo_attempts CHECK (otp_attempts<=5 AND code_attempts<=5),
  CONSTRAINT ck_shared_demo_budget CHECK (credit_idr IS NULL OR credit_idr BETWEEN 100 AND 10000),
  CONSTRAINT ck_shared_demo_window CHECK ((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at>starts_at)),
  CONSTRAINT fk_shared_booking_applicant FOREIGN KEY (applicant_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shared_booking_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shared_booking_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shared_booking_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shared_demo_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  booking_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shared_demo_audit_time (created_at,id),
  CONSTRAINT fk_shared_audit_booking FOREIGN KEY (booking_id) REFERENCES shared_demo_bookings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shared_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
