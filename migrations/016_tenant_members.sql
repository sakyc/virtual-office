ALTER TABLE users ADD COLUMN whatsapp_number VARCHAR(16) NULL, ADD COLUMN whatsapp_verified_at DATETIME NULL;
ALTER TABLE workspace_memberships ADD COLUMN membership_version INT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE workspace_agents ADD UNIQUE KEY uq_workspace_agent_scope (id, organization_id, workspace_id);
CREATE TABLE workspace_member_divisions (
  organization_id BIGINT UNSIGNED NOT NULL,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  division_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (workspace_id, user_id, division_id),
  CONSTRAINT fk_member_division_membership FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_division_scope FOREIGN KEY (division_id, organization_id, workspace_id) REFERENCES workspace_divisions(id, organization_id, workspace_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_member_agents (
  organization_id BIGINT UNSIGNED NOT NULL,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  agent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (workspace_id, user_id, agent_id),
  INDEX idx_member_agent_scope (agent_id, organization_id, workspace_id),
  CONSTRAINT fk_member_agent_membership FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_agent_agent FOREIGN KEY (agent_id, organization_id, workspace_id) REFERENCES workspace_agents(id, organization_id, workspace_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_division_reviewers (
  division_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  workspace_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  updated_by_user_id BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviewer_division FOREIGN KEY (division_id, organization_id, workspace_id) REFERENCES workspace_divisions(id, organization_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reviewer_membership FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_reviewer_actor FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_invitations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  workspace_id BIGINT UNSIGNED NOT NULL,
  email_normalized VARCHAR(254) NOT NULL,
  role ENUM('admin','member','viewer') NOT NULL,
  assignments JSON NOT NULL,
  token_hash BINARY(32) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invitation_token (token_hash),
  INDEX idx_invitation_workspace (organization_id, workspace_id, expires_at),
  INDEX idx_invitation_email (workspace_id, email_normalized),
  CONSTRAINT fk_invitation_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invitation_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invitation_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workspace_member_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  workspace_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(40) NOT NULL,
  details JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_member_audit_scope (organization_id, workspace_id, id),
  CONSTRAINT fk_member_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  CONSTRAINT fk_member_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
