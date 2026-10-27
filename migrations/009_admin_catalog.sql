-- Expand-only catalog administration. Never promotes an existing customer.
ALTER TABLE billing_plans ADD COLUMN is_public TINYINT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT ck_billing_plan_public CHECK (is_public IN (0,1));

CREATE TABLE platform_admins (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  approval_reference VARCHAR(191) NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  CONSTRAINT fk_platform_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_catalog_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  plan_code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan_version INT UNSIGNED NOT NULL,
  before_snapshot JSON NOT NULL,
  after_snapshot JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_catalog_audit_version (plan_code, plan_version),
  INDEX idx_catalog_audit_time (created_at, id),
  CONSTRAINT fk_catalog_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_catalog_audit_plan FOREIGN KEY (plan_code) REFERENCES billing_plans(code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
