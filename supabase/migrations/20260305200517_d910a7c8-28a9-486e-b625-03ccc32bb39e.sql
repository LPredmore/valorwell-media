-- One-time data fix: touch all incomplete rows so the auto_promote_incomplete trigger re-evaluates them.
-- Rows that qualify will be promoted to 'unscheduled'; genuinely incomplete rows stay as-is.
UPDATE social_content SET updated_at = now() WHERE status = 'incomplete';