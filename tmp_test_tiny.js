const token = 'b3d4e441346d2895c118c1a67753620ec15d1d68feb0452b6e8f8114bce94998';

async function testToken() {
  const params = new URLSearchParams({
    token: token,
    formato: 'json',
    situacao: 'A',
    pagina: '1',
  });

  const res = await fetch('https://api.tiny.com.br/api2/produtos.pesquisa.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testToken();
