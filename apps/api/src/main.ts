import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { Server as SocketIOServer } from 'socket.io';
import { ChatGateway } from './gateway/chat.gateway';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar .env da raiz do projeto antes de qualquer coisa
const possiblePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];

for (const envPath of possiblePaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`[Bootstrap] Configuração carregada de: ${envPath}`);
    break;
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ?? 3005;
  const dbUrl = process.env.DATABASE_URL;

  logger.log('Iniciando Bootstrap...');
  logger.log(`DATABASE_URL carregada: ${dbUrl ? 'SIM (inicia com ' + dbUrl.substring(0, 20) + '...)' : 'NAO'}`);

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`API rodando em http://localhost:${port}`);

  // Manually attach Socket.IO to the HTTP server
  // (NestJS IoAdapter was not properly attaching it)
  const httpServer = app.getHttpServer();
  const chatGateway = app.get(ChatGateway);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
    addTrailingSlash: false,
    transports: ['polling', 'websocket'],
  });

  chatGateway.server = io;

  io.on('connection', (socket) => {
    chatGateway.handleConnection(socket);
    socket.on('disconnect', () => chatGateway.handleDisconnect(socket));
    socket.on('join_conversation', (conversationId) =>
      chatGateway.handleJoinConversation(conversationId, socket),
    );
    socket.on('leave_conversation', (conversationId) =>
      chatGateway.handleLeaveConversation(conversationId, socket),
    );
    socket.on('join_user', (userId) =>
      chatGateway.handleJoinUser(userId, socket),
    );
  });

  logger.log(`[SOCKET] Socket.IO attached to HTTP server on port ${port}, path /socket.io`);
}
void bootstrap();
