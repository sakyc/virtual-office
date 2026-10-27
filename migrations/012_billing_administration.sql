CREATE TABLE billing_model_tariffs (
  model VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL,
  tariff JSON NOT NULL,
  source_reference VARCHAR(500) NOT NULL,
  updated_by_user_id BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_model_tariff_actor FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT ck_model_tariff_version CHECK (version > 0),
  CONSTRAINT ck_model_tariff_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_operations_audit (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  model VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action ENUM('activate_subscription','update_tariff') NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  before_snapshot JSON NULL,
  after_snapshot JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_operation_request (actor_user_id,request_id),
  INDEX idx_billing_operation_time (created_at,id),
  INDEX idx_billing_operation_org (organization_id,created_at,id),
  CONSTRAINT fk_billing_operation_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_operation_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_operation_model FOREIGN KEY (model) REFERENCES billing_model_tariffs(model) ON DELETE RESTRICT,
  CONSTRAINT ck_billing_operation_scope CHECK ((action='activate_subscription' AND organization_id IS NOT NULL AND model IS NULL) OR (action='update_tariff' AND organization_id IS NULL AND model IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
