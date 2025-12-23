import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessageType } from '@prisma/client';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async createMessage(data: {
    title: string;
    content: string;
    type: MessageType;
    authorId?: number;
    videoUrl?: string;
    audioUrl?: string;
    imageUrl?: string;
  }) {
    const message = await this.prisma.message.create({
      data: {
        ...data,
        isPublished: false,
      },
      include: { author: { include: { details: true } } },
    });

    return message;
  }

  async publishMessage(id: string) {
    const message = await this.prisma.message.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
      include: { author: { include: { details: true } } },
    });

    // Create event to notify subscribers
    await this.outboxService.createEvent({
      eventType: 'message.published',
      payload: {
        messageId: id,
        type: message.type,
        title: message.title,
        publishedAt: message.publishedAt?.toISOString(),
        timestamp: new Date().toISOString(),
      },
    });

    return message;
  }

  async getMessages(filters?: {
    type?: MessageType;
    isPublished?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      ...(filters?.type && { type: filters.type }),
      ...(filters?.isPublished !== undefined && { isPublished: filters.isPublished }),
    };

    return this.prisma.message.findMany({
      where,
      include: { author: { include: { details: true } } },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  }

  async getMessageById(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      include: { author: { include: { details: true } } },
    });
  }

  async updateMessage(id: string, data: Partial<{
    title: string;
    content: string;
    videoUrl: string;
    audioUrl: string;
    imageUrl: string;
  }>) {
    return this.prisma.message.update({
      where: { id },
      data,
      include: { author: { include: { details: true } } },
    });
  }

  async deleteMessage(id: string) {
    return this.prisma.message.delete({
      where: { id },
    });
  }
}

