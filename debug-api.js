const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, {
      headers: {
        'Authorization': 'Bearer mock-dev-token'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function start() {
  try {
    console.log('Buscando instâncias...');
    const instances = await get('http://localhost:3005/whatsapp/instances');
    console.log('Resposta Bruta:', JSON.stringify(instances, null, 2));
  } catch (e) {
    console.error('Erro:', e.message);
  }
}

start();
