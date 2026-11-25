ALTER TABLE "peopleos_work_calendars"
  ADD COLUMN IF NOT EXISTS "workday_weights_json" text NOT NULL
  DEFAULT '{"1":1,"2":1,"3":1,"4":1,"5":1}';
