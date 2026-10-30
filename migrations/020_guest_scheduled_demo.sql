-- Keep existing authenticated bookings and their audit records intact.
ALTER TABLE shared_demo_bookings
  MODIFY applicant_id BIGINT UNSIGNED NULL,
  MODIFY requested_at DATETIME NULL,
  ADD guest_name VARCHAR(150) NULL,
  ADD guest_email VARCHAR(254) NULL,
  ADD guest_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY idx_shared_demo_guest (guest_token_hash,created_at),
  ADD KEY idx_shared_demo_phone (phone,send_window_at),
  ADD CONSTRAINT ck_shared_demo_guest_identity CHECK
    (applicant_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_email IS NOT NULL AND guest_token_hash IS NOT NULL));

ALTER TABLE shared_demo_audit MODIFY actor_user_id BIGINT UNSIGNED NULL;
