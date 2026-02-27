import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.task.findMany({
      include: {
        lead: true,
        assigned_user: true
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async create(data: { title: string; description?: string; lead_id?: string; due_at?: Date }) {
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        lead_id: data.lead_id,
        due_at: data.due_at ? new Date(data.due_at) : null,
        status: 'A_FAZER'
      }
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.task.update({
      where: { id },
      data: { status }
    });
  }
}
