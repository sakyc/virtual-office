-- Old scheduled approvals retain their original windows. New approvals start on entry.
ALTER TABLE shared_demo_bookings
  ADD duration_minutes SMALLINT UNSIGNED NULL,
  ADD code_expires_at DATETIME NULL,
  ADD CONSTRAINT ck_shared_demo_duration CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 240),
  ADD CONSTRAINT ck_shared_demo_activation CHECK (duration_minutes IS NULL OR code_expires_at IS NOT NULL);
