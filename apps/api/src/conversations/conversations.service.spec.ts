import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: any;
  let chatGateway: any;

  beforeEach(async () => {
    prisma = {
      conversation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    chatGateway = {
      emitTransferRequest: jest.fn(),
      emitTransferResponse: jest.fn(),
      emitConversationsUpdate: jest.fn(),
      emitNewMessage: jest.fn(),
      server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChatGateway, useValue: chatGateway },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  describe('assign', () => {
    it('deve atribuir conversa ao usuario e desativar ai_mode', async () => {
      const mockConv = { id: 'conv-1', assigned_user_id: 'user-1', ai_mode: false };
      prisma.conversation.update.mockResolvedValue(mockConv);

      const result = await service.assign('conv-1', 'user-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { assigned_user_id: 'user-1', ai_mode: false },
      });
      expect(result).toEqual(mockConv);
    });
  });

  describe('close', () => {
    it('deve fechar a conversa com status FECHADO', async () => {
      const mockConv = { id: 'conv-1', status: 'FECHADO' };
      prisma.conversation.update.mockResolvedValue(mockConv);

      const result = await service.close('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'FECHADO' },
      });
      expect(result.status).toBe('FECHADO');
    });
  });

  describe('requestTransfer', () => {
    it('deve lançar ForbiddenException se conversa nao pertence ao solicitante', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        assigned_user_id: 'outro-user',
      });

      await expect(
        service.requestTransfer('conv-1', 'target-user', 'user-1', 'motivo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve transferir e emitir evento via gateway quando valido', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        assigned_user_id: 'user-1',
      });
      prisma.user.findUnique.mockResolvedValue({ name: 'Operador 1' });
      prisma.conversation.update.mockResolvedValue({
        id: 'conv-1',
        lead: { name: 'Cliente', phone: '11999' },
      });

      await service.requestTransfer('conv-1', 'target-user', 'user-1', 'motivo urgente');

      expect(chatGateway.emitTransferRequest).toHaveBeenCalledWith(
        'target-user',
        expect.objectContaining({
          conversationId: 'conv-1',
          fromUserId: 'user-1',
          fromUserName: 'Operador 1',
          reason: 'motivo urgente',
        }),
      );
      expect(chatGateway.emitConversationsUpdate).toHaveBeenCalled();
    });
  });

  describe('acceptTransfer', () => {
    it('deve aceitar transferencia e emitir resposta ao remetente', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        pending_transfer_from_id: 'from-user',
        lead: { name: 'Cliente' },
      });
      prisma.user.findUnique.mockResolvedValue({ name: 'Destino' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.acceptTransfer('conv-1', 'dest-user');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: expect.objectContaining({
          assigned_user_id: 'dest-user',
          ai_mode: false,
          pending_transfer_to_id: null,
        }),
      });
      expect(chatGateway.emitTransferResponse).toHaveBeenCalledWith(
        'from-user',
        expect.objectContaining({ accepted: true }),
      );
    });
  });

  describe('declineTransfer', () => {
    it('deve recusar transferencia e emitir resposta ao remetente', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        pending_transfer_from_id: 'from-user',
        lead: { name: 'Cliente', phone: '11999' },
      });
      prisma.conversation.update.mockResolvedValue({});

      await service.declineTransfer('conv-1', 'nao tenho disponibilidade');

      expect(chatGateway.emitTransferResponse).toHaveBeenCalledWith(
        'from-user',
        expect.objectContaining({
          accepted: false,
          reason: 'nao tenho disponibilidade',
        }),
      );
    });
  });
});
