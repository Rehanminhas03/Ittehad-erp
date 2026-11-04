-- An appointment booked from the call list has a time of day (HH:MM).
ALTER TABLE "service"."reminder_call" ADD COLUMN IF NOT EXISTS "appointment_time" TEXT;
