CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_issuer VARCHAR(255) NOT NULL,
  external_subject VARCHAR(255) NOT NULL,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(150) NULL,
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uq_users_provider_subject (provider_issuer, external_subject),
  INDEX idx_users_email (email), INDEX idx_users_status_id (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE organizations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, slug VARCHAR(100) NOT NULL, name VARCHAR(150) NOT NULL,
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active', created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, deleted_at DATETIME NULL,
  UNIQUE KEY uq_organizations_slug (slug), INDEX idx_organizations_status_id (status, id),
  CONSTRAINT fk_organizations_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE organization_memberships (
  organization_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, role ENUM('owner') NOT NULL DEFAULT 'owner', created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME NULL, PRIMARY KEY (organization_id, user_id),
  INDEX idx_org_memberships_user (user_id, organization_id, revoked_at), INDEX idx_org_memberships_role (organization_id, role, revoked_at),
  CONSTRAINT fk_org_memberships_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_org_memberships_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspaces (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, organization_id BIGINT UNSIGNED NOT NULL, slug VARCHAR(100) NOT NULL, name VARCHAR(150) NOT NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active', created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, archived_at DATETIME NULL,
  UNIQUE KEY uq_workspaces_organization_slug (organization_id, slug), INDEX idx_workspaces_organization_status_id (organization_id, status, id),
  CONSTRAINT fk_workspaces_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_workspaces_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_memberships (
  workspace_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, role ENUM('admin','member','viewer') NOT NULL, created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, revoked_at DATETIME NULL, PRIMARY KEY (workspace_id, user_id),
  INDEX idx_workspace_memberships_user (user_id, workspace_id, revoked_at), INDEX idx_workspace_memberships_role (workspace_id, role, revoked_at),
  CONSTRAINT fk_workspace_memberships_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_workspace_memberships_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, token_hash BINARY(32) NOT NULL, active_workspace_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, idle_expires_at DATETIME NOT NULL, absolute_expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL, revoked_reason VARCHAR(100) NULL, ip_hash BINARY(32) NULL, user_agent_hash BINARY(32) NULL,
  UNIQUE KEY uq_sessions_token_hash (token_hash), INDEX idx_sessions_user_expiry (user_id, revoked_at, absolute_expires_at), INDEX idx_sessions_workspace (active_workspace_id, revoked_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_workspace FOREIGN KEY (active_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE clients ADD COLUMN organization_id BIGINT UNSIGNED NULL, ADD COLUMN workspace_id BIGINT UNSIGNED NULL, ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL, ADD COLUMN updated_by_user_id BIGINT UNSIGNED NULL, ADD INDEX idx_clients_workspace_name_id (workspace_id, name, id), ADD CONSTRAINT fk_clients_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_clients_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_clients_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL, ADD CONSTRAINT fk_clients_updater FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN organization_id BIGINT UNSIGNED NULL, ADD COLUMN workspace_id BIGINT UNSIGNED NULL, ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL, ADD INDEX idx_jobs_workspace_created_id (workspace_id, created_at, id), ADD INDEX idx_jobs_workspace_agent_id (workspace_id, agent_id, id), ADD CONSTRAINT fk_jobs_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_jobs_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_jobs_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN organization_id BIGINT UNSIGNED NULL, ADD COLUMN workspace_id BIGINT UNSIGNED NULL, ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL, ADD COLUMN updated_by_user_id BIGINT UNSIGNED NULL, ADD INDEX idx_items_workspace_board (workspace_id, deleted_at, status, agent_id, id), ADD INDEX idx_items_workspace_job (workspace_id, job_id), ADD INDEX idx_items_workspace_parent (workspace_id, parent_id), ADD CONSTRAINT fk_items_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_items_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_items_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL, ADD CONSTRAINT fk_items_updater FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE revisions ADD COLUMN organization_id BIGINT UNSIGNED NULL, ADD COLUMN workspace_id BIGINT UNSIGNED NULL, ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL, ADD INDEX idx_revisions_workspace_item_id (workspace_id, item_id, id), ADD CONSTRAINT fk_revisions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_revisions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT, ADD CONSTRAINT fk_revisions_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
