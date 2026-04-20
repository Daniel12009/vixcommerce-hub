import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!url || !key) {
  console.error("Missing credentials");
  Deno.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('ml_questions_history')
    .select('*')
    .order('date_created', { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    return;
  }

  if (data && data.length) {
    console.log("Found question: " + data[0].text);
    const { error: updErr } = await supabase.from('ml_questions_history')
      .update({ status: 'UNANSWERED' })
      .eq('id', data[0].id);
      
    if (updErr) {
       console.error(updErr);
    } else {
       console.log("Restored 'UNANSWERED' for id: " + data[0].id);
    }
  } else {
    console.log("No questions found.");
  }
}

run();
