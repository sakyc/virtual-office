CREATE TABLE billing_plans (
  code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL,
  monthly_price_idr BIGINT UNSIGNED NULL,
  included_credit_idr BIGINT UNSIGNED NULL,
  max_divisions SMALLINT UNSIGNED NULL,
  max_members SMALLINT UNSIGNED NULL,
  agents_per_division TINYINT UNSIGNED NOT NULL DEFAULT 4,
  whatsapp_enabled TINYINT UNSIGNED NOT NULL,
  quote_required TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_billing_plan_flags CHECK (agents_per_division = 4 AND whatsapp_enabled IN (0,1) AND quote_required IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_subscriptions (
  organization_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan_code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  plan_version INT UNSIGNED NOT NULL,
  status ENUM('active','past_due','suspended','cancelled') NOT NULL,
  monthly_price_idr BIGINT UNSIGNED NOT NULL,
  included_credit_idr BIGINT UNSIGNED NOT NULL,
  max_divisions SMALLINT UNSIGNED NOT NULL,
  max_members SMALLINT UNSIGNED NOT NULL,
  agents_per_division TINYINT UNSIGNED NOT NULL DEFAULT 4,
  whatsapp_enabled TINYINT UNSIGNED NOT NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  approval_reference VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_subscription_id (id),
  INDEX idx_billing_subscription_expiry (status, period_end),
  CONSTRAINT ck_billing_subscription_terms CHECK (period_end > period_start AND max_divisions BETWEEN 1 AND 8 AND max_members > 0 AND agents_per_division = 4 AND whatsapp_enabled IN (0,1)),
  CONSTRAINT fk_billing_subscription_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_subscription_plan FOREIGN KEY (plan_code) REFERENCES billing_plans(code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_wallets (
  organization_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_wallet_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_credit_grants (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  source ENUM('package','topup','adjustment') NOT NULL,
  reference_id VARCHAR(191) NOT NULL,
  original_idr BIGINT UNSIGNED NOT NULL,
  available_idr BIGINT UNSIGNED NOT NULL,
  reserved_idr BIGINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_grant_reference (organization_id, source, reference_id),
  INDEX idx_billing_grant_spend (organization_id, expires_at, created_at),
  CONSTRAINT ck_billing_grant_balance CHECK (original_idr > 0 AND available_idr <= original_idr AND reserved_idr <= original_idr - available_idr),
  CONSTRAINT ck_billing_grant_expiry CHECK ((source = 'package' AND expires_at IS NOT NULL) OR (source IN ('topup','adjustment') AND expires_at IS NULL)),
  CONSTRAINT fk_billing_grant_wallet FOREIGN KEY (organization_id) REFERENCES billing_wallets(organization_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_holds (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  amount_idr BIGINT UNSIGNED NOT NULL,
  settled_idr BIGINT UNSIGNED NULL,
  status ENUM('reserved','settled','released') NOT NULL DEFAULT 'reserved',
  allocations JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_billing_hold_org_status (organization_id, status, created_at),
  CONSTRAINT ck_billing_hold_amount CHECK (amount_idr > 0 AND (settled_idr IS NULL OR settled_idr <= amount_idr)),
  CONSTRAINT ck_billing_hold_state CHECK ((status = 'reserved' AND settled_idr IS NULL AND finished_at IS NULL) OR (status IN ('settled','released') AND settled_idr IS NOT NULL AND finished_at IS NOT NULL)),
  CONSTRAINT fk_billing_hold_wallet FOREIGN KEY (organization_id) REFERENCES billing_wallets(organization_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_ledger (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('subscription','credit','reserve','settle','release') NOT NULL,
  amount_idr BIGINT UNSIGNED NOT NULL,
  result JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_billing_ledger_idempotency (organization_id, idempotency_key),
  INDEX idx_billing_ledger_org_time (organization_id, created_at, id),
  CONSTRAINT fk_billing_ledger_wallet FOREIGN KEY (organization_id) REFERENCES billing_wallets(organization_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO billing_plans (code, version, name, monthly_price_idr, included_credit_idr, max_divisions, max_members, agents_per_division, whatsapp_enabled, quote_required) VALUES
('starter',1,'Starter',149000,50000,1,2,4,0,0),
('pro',1,'Pro',399000,150000,3,6,4,1,0),
('business',1,'Business',899000,350000,8,15,4,1,0),
('custom',1,'Custom',NULL,NULL,NULL,NULL,4,0,1);
