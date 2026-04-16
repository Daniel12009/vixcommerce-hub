-- Fix RLS for AI Bot tables to allow public read (like ml_accounts)
-- This is necessary until full authentication is implemented.

CREATE POLICY "Allow public read ml_bot_config" ON ml_bot_config FOR SELECT USING (true);
CREATE POLICY "Allow public read ml_questions_queue" ON ml_questions_queue FOR SELECT USING (true);
CREATE POLICY "Allow public read ml_answer_templates" ON ml_answer_templates FOR SELECT USING (true);

-- Also allow updates for anon if we want manual actions to work without auth
CREATE POLICY "Allow public update ml_questions_queue" ON ml_questions_queue FOR UPDATE USING (true);
CREATE POLICY "Allow public update ml_bot_config" ON ml_bot_config FOR UPDATE USING (true);
CREATE POLICY "Allow public insert ml_answer_templates" ON ml_answer_templates FOR INSERT WITH CHECK (true);
