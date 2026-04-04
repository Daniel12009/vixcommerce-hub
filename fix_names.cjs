const fs = require('fs');
const text = fs.readFileSync('.env', 'utf8');
const env = {};
text.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^\"|\"$/g, '').replace(/^\'|\'$/g, '');
});

async function run() {
  const url = env.VITE_SUPABASE_URL + '/rest/v1/ml_accounts';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  // 1. Update Decarion -> Decarion Torneiras
  let r = await fetch(url + '?nome=eq.Decarion', {
    method: 'PATCH',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ nome: 'Decarion Torneiras' })
  });
  console.log('Update Decarion:', await r.json());

  // 2. Update GS -> GS Torneiras
  let r2 = await fetch(url + '?nome=eq.GS', {
    method: 'PATCH',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ nome: 'GS Torneiras' })
  });
  console.log('Update GS:', await r2.json());
}
run();
