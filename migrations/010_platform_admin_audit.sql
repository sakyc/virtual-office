CREATE TABLE platform_admin_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  target_user_id BIGINT UNSIGNED NOT NULL,
  action ENUM('suspend','activate','revoke_sessions') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  before_snapshot JSON NOT NULL,
  after_snapshot JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_audit_time (created_at, id),
  INDEX idx_platform_audit_target (target_user_id, created_at, id),
  CONSTRAINT fk_platform_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_platform_audit_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
