const net = require('net');

const host = '69.62.93.186';
const port = 45432;

console.log(`Testando socket TCP em ${host}:${port}...`);

const socket = net.connect(port, host, () => {
  console.log('CONEXÃO TCP SUCESSO! O banco está acessível.');
  socket.destroy();
  process.exit(0);
});

socket.on('error', (err) => {
  console.error('FALHA NA CONEXÃO TCP:', err.message);
  process.exit(1);
});

socket.setTimeout(5000, () => {
  console.error('TIMEOUT: A VPS não respondeu na porta 45432.');
  socket.destroy();
  process.exit(1);
});
