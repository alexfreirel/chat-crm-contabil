import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InboxesService {
  constructor(private prisma: PrismaService) {}

  private get inbox() {
    return (this.prisma as any).inbox;
  }

  private get instance() {
    return (this.prisma as any).instance;
  }

  async findAllOperators() {
    const [inboxes, sectors, allEligible] = await Promise.all([
      this.inbox.findMany({
        include: { users: { select: { id: true, name: true } } },
      }),
      (this.prisma as any).sector.findMany({
        include: { users: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      // Inclui TODOS os usuários que têm role de OPERADOR ou CONTADOR (multi-role)
      // Mesmo que não estejam vinculados a um inbox específico
      (this.prisma as any).user.findMany({
        where: { roles: { hasSome: ['OPERADOR', 'CONTADOR', 'ADMIN'] } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const inboxGroups = inboxes.map((inbox: any) => ({
      id: inbox.id,
      name: inbox.name,
      type: 'INBOX' as const,
      auto_route: false,
      users: inbox.users as { id: string; name: string }[],
    }));

    const sectorGroups = sectors.map((sector: any) => ({
      id: sector.id,
      name: sector.name,
      type: 'SECTOR' as const,
      auto_route: sector.auto_route ?? false,
      users: sector.users as { id: string; name: string }[],
    }));

    // Grupo "Todos" com usuários elegíveis que podem receber transferências
    const inboxUserIds = new Set(inboxes.flatMap((i: any) => (i.users || []).map((u: any) => u.id)));
    const sectorUserIds = new Set(sectors.flatMap((s: any) => (s.users || []).map((u: any) => u.id)));
    const ungroupedUsers = (allEligible as { id: string; name: string }[]).filter(
      u => !inboxUserIds.has(u.id) && !sectorUserIds.has(u.id),
    );

    const result = [...inboxGroups, ...sectorGroups];

    // Adicionar grupo "Equipe" com usuários que não estão em nenhum inbox/setor
    if (ungroupedUsers.length > 0) {
      result.push({
        id: '__team__',
        name: 'Equipe',
        type: 'SECTOR' as const,
        auto_route: false,
        users: ungroupedUsers,
      });
    }

    return result;
  }

  async findAll(tenantId?: string, userId?: string) {
    return this.inbox.findMany({
      where: { 
        tenant_id: tenantId,
        users: userId ? { some: { id: userId } } : undefined
      },
      include: {
        instances: true,
        users: { select: { id: true, name: true, email: true } },
        _count: {
          select: { users: true, conversations: true }
        }
      }
    });
  }

  async findOne(id: string) {
    const inbox = await this.inbox.findUnique({
      where: { id },
      include: {
        instances: true,
        users: { select: { id: true, name: true, email: true } }
      }
    });

    if (!inbox) throw new NotFoundException('Inbox não encontrada');
    return inbox;
  }

  async create(data: { name: string; tenant_id?: string }) {
    return this.inbox.create({
      data,
      include: {
        instances: true,
        users: { select: { id: true, name: true, email: true } },
        _count: {
          select: { users: true, conversations: true }
        }
      }
    });
  }

  async update(id: string, data: { name?: string }) {
    return this.inbox.update({
      where: { id },
      data
    });
  }

  async remove(id: string) {
    await (this.prisma as any).conversation.updateMany({
      where: { inbox_id: id },
      data: { inbox_id: null },
    });
    return this.inbox.delete({ where: { id } });
  }

  // --- Gestão de Usuários no Setor ---

  async addUser(inboxId: string, userId: string) {
    return this.inbox.update({
      where: { id: inboxId },
      data: {
        users: { connect: { id: userId } }
      }
    });
  }

  async removeUser(inboxId: string, userId: string) {
    return this.inbox.update({
      where: { id: inboxId },
      data: {
        users: { disconnect: { id: userId } }
      }
    });
  }

  // --- Gestão de Instâncias ---

  async addInstance(inboxId: string, instanceName: string, type: 'whatsapp' | 'instagram') {
    // Cria ou atualiza a instância e conecta ao setor (many-to-many)
    const instance = await this.instance.upsert({
      where: { name: instanceName },
      update: {
        type,
        inboxes: { connect: { id: inboxId } },
      },
      create: {
        name: instanceName,
        type,
        inboxes: { connect: { id: inboxId } },
      },
      include: { inboxes: true },
    });

    return instance;
  }

  async removeInstance(inboxId: string, instanceName: string) {
    return this.instance.update({
      where: { name: instanceName },
      data: { inboxes: { disconnect: { id: inboxId } } },
    });
  }

  async findByInstanceName(instanceName: string) {
    return this.instance.findUnique({
      where: { name: instanceName },
      include: { inboxes: true },
    });
  }

  /**
   * Round-robin: retorna o ID do próximo operador do inbox.
   * Usa $transaction para evitar double-assign em chamadas paralelas.
   * Retorna null se o inbox não tiver operadores cadastrados.
   *
   * @param onlineUserIds Se fornecido, filtra apenas operadores online.
   *                      Retorna null se nenhum operador online estiver no inbox.
   */
  async getNextAssignee(inboxId: string, onlineUserIds?: string[]): Promise<string | null> {
    return (this.prisma as any).$transaction(async (tx: any) => {
      const inbox = await tx.inbox.findUnique({
        where: { id: inboxId },
        include: { users: { select: { id: true }, orderBy: { id: 'asc' } } },
      });

      if (!inbox?.users?.length) return null;

      // Filtra por operadores online (se fornecido)
      let users: { id: string }[] = inbox.users;
      if (onlineUserIds) {
        users = users.filter((u: any) => onlineUserIds.includes(u.id));
        if (users.length === 0) return null; // Ninguém online neste inbox
      }

      // Round-robin sobre os operadores disponíveis
      const currentIdx = inbox.rr_pointer
        ? users.findIndex((u: any) => u.id === inbox.rr_pointer)
        : -1;
      const nextIdx = (currentIdx + 1) % users.length;
      const nextUser = users[nextIdx];

      await tx.inbox.update({
        where: { id: inboxId },
        data: { rr_pointer: nextUser.id },
      });

      return nextUser.id;
    });
  }
}
