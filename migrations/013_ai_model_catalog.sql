CREATE TABLE ai_models (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_model_id VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  lifecycle ENUM('active','deprecated','retired','unknown') NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  seed_tariff JSON NULL,
  seed_reference VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ai_model_provider (provider,provider_model_id),
  CONSTRAINT ck_ai_model_provider CHECK (provider = 'anthropic'),
  CONSTRAINT ck_ai_model_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
