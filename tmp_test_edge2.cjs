const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const extract = (key) => {
  const match = env.match(new RegExp(key + '=(.*)'));
  return match ? match[1].trim().replace(/^\"|\"$/g, '') : null;
};
const url = extract('VITE_SUPABASE_URL');
const key = extract('VITE_SUPABASE_ANON_KEY');

fetch('https://mbxpkqhjapmhehdngfaj.supabase.co/functions/v1/mercado-livre', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    action: 'get_questions',
    status: 'UNANSWERED'
  })
}).then(r => r.json().then(data => {
  if (data.questions && data.questions.length > 0) {
     console.log('Keys of Q:', Object.keys(data.questions[0]));
     console.log('seller_id value:', data.questions[0].seller_id);
     console.log('account_id value:', data.questions[0].account_id);
  }
})).catch(console.error);
