const url = "https://eksqrpaqsmxcufustkfh.supabase.co/functions/v1/tiny";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY; // Using from .env if available, or just hardcode if needed.

const fs = require('fs');
const envData = fs.readFileSync('.env', 'utf8');
const keyMatch = envData.match(/VITE_SUPABASE_PUBLISHABLE_KEY="(.*?)"/);
let apiKey = keyMatch ? keyMatch[1] : '';

// Also try SUPABASE_ANON_KEY if VITE one is missing
if (!apiKey) {
  const anonMatch = envData.match(/SUPABASE_ANON_KEY="(.*?)"/);
  apiKey = anonMatch ? anonMatch[1] : '';
}

async function test() {
  const reqBody = {
    action: 'sync_vendas_marketplace',
    plataforma: 'shopee',
    date_from: new Date(Date.now() - 7 * 86400000).toLocaleDateString('pt-BR'),
    date_to: new Date().toLocaleDateString('pt-BR'),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(reqBody)
  });

  const data = await res.json();
  console.log("RESPONSE:", JSON.stringify(data, null, 2));
}

test();
