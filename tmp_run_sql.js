const SUPABASE_URL = 'https://mbxpkqhjapmhehdngfaj.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ieHBrcWhqYXBtaGVoZG5nZmFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkzMjg5NiwiZXhwIjoyMDg5NTA4ODk2fQ.Z5urVHTv5oLodyYnnXM_RBALEl8Ji_5ld-HNtLjxLjQ';
const sql = `
ALTER TABLE shopee_questions_queue ADD COLUMN IF NOT EXISTS buyer_name text;
DROP POLICY IF EXISTS auth_all ON shopee_questions_queue;
DROP POLICY IF EXISTS auth_all ON shopee_chat_queue;
CREATE POLICY shopee_questions_select ON shopee_questions_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY shopee_chat_select ON shopee_chat_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY shopee_questions_insert ON shopee_questions_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY shopee_questions_update ON shopee_questions_queue FOR UPDATE TO authenticated USING (true);
CREATE POLICY shopee_chat_insert ON shopee_chat_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY shopee_chat_update ON shopee_chat_queue FOR UPDATE TO authenticated USING (true);
`;

async function run() {
    const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql })
    });
    const d = await res.text();
    console.log(d);
}
run();
