CREATE TABLE clients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  brief TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agent_id VARCHAR(30) NOT NULL,
  job_type VARCHAR(50) NOT NULL,
  client_id INT UNSIGNED NULL,
  parent_item_id INT UNSIGNED NULL,
  params JSON NOT NULL,
  status ENUM('generating','done','failed') NOT NULL DEFAULT 'generating',
  error VARCHAR(255) NULL,
  model VARCHAR(80) NULL,
  tokens_in INT UNSIGNED NULL,
  tokens_out INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  INDEX idx_jobs_agent (agent_id, id),
  CONSTRAINT fk_jobs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NULL,
  client_id INT UNSIGNED NULL,
  agent_id VARCHAR(30) NOT NULL,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  tag VARCHAR(120) NULL,
  content JSON NOT NULL,
  status ENUM('draft','revising','approved','rejected') NOT NULL DEFAULT 'draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  reject_reason VARCHAR(500) NULL,
  last_error VARCHAR(255) NULL,
  approved_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_items_board (deleted_at, status, agent_id),
  INDEX idx_items_type (type, status),
  INDEX idx_items_job (job_id),
  INDEX idx_items_parent (parent_id),
  CONSTRAINT fk_items_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_parent FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE revisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  title_before VARCHAR(255) NOT NULL,
  content_before JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rev_item (item_id, id),
  CONSTRAINT fk_rev_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
