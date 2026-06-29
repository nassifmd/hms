-- ============================================================================
-- HMS - HOSPITAL MANAGEMENT SYSTEM
-- Migration: Add username column for login support
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Set usernames for existing users (based on email prefix or employee_id)
UPDATE users SET username = SPLIT_PART(email, '@', 1) WHERE username IS NULL;
