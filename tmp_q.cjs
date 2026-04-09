const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const extract = (key) => {
  const match = env.match(new RegExp(key + '=(.*)'));
  return match ? match[1].trim().replace(/^\"|\"$/g, '') : null;
};
const url = extract('VITE_SUPABASE_URL');
const key = extract('VITE_SUPABASE_ANON_KEY');

fetch(url + '/rest/v1/ml_questions_queue?select=*', {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
  }
}).then(r => r.json().then(data => console.log('STATUS:', r.status, 'COUNT:', data?.length))).catch(console.error);
