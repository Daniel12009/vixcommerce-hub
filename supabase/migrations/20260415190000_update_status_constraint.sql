-- Migration to update ml_questions_queue status constraint
ALTER TABLE ml_questions_queue 
DROP CONSTRAINT IF EXISTS ml_questions_queue_status_check;

ALTER TABLE ml_questions_queue 
ADD CONSTRAINT ml_questions_queue_status_check 
CHECK (status IN ('pending', 'auto_answered', 'manually_answered', 'ignored', 'error', 'suggested'));
