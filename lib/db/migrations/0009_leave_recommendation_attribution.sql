-- Attribution for human leave recommendations.
ALTER TABLE "peopleos_leave_requests"
  ADD COLUMN IF NOT EXISTS "recommendation_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "recommendation_at" timestamptz;
