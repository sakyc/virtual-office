ALTER TABLE jobs MODIFY COLUMN agent_id VARCHAR(64) NOT NULL,
  ADD COLUMN request_key CHAR(36) NULL,
  ADD UNIQUE KEY uq_jobs_workspace_request (workspace_id, created_by_user_id, request_key);
ALTER TABLE items MODIFY COLUMN agent_id VARCHAR(64) NOT NULL;
