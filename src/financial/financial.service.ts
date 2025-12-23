import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DonationType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async exportToExcel(filters?: {
    type?: DonationType;
    startDate?: Date;
    endDate?: Date;
    today?: boolean;
    status?: string;
  }): Promise<ExcelJS.Workbook> {
    const where: any = {
      ...(filters?.status ? { status: filters.status } : { status: 'completed' }),
      ...(filters?.type && { type: filters.type }),
    };

    // Handle today filter
    if (filters?.today) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.createdAt = {
        gte: today,
        lt: tomorrow,
      };
    } else if (filters?.startDate && filters?.endDate) {
      where.createdAt = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    const donations = await this.prisma.donation.findMany({
      where,
      include: {
        user: {
          include: {
            details: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Donations');

    // Add headers
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Donor Name', key: 'donorName', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Recurring', key: 'recurring', width: 15 },
    ];

    // Add data
    donations.forEach((donation) => {
      worksheet.addRow({
        date: donation.createdAt.toISOString().split('T')[0],
        donorName: `${donation.user.details?.name || ''} ${donation.user.details?.lastName || ''}`.trim() || 'N/A',
        email: donation.user.email,
        type: donation.type,
        amount: Number(donation.amount),
        currency: donation.currency,
        status: donation.status,
        recurring: donation.isRecurring ? 'Yes' : 'No',
      });
    });

    // Add summary row
    const totalAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);
    worksheet.addRow({});
    worksheet.addRow({
      date: 'TOTAL',
      amount: totalAmount,
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    return workbook;
  }

  async exportToPDF(filters?: {
    type?: DonationType;
    startDate?: Date;
    endDate?: Date;
    today?: boolean;
    status?: string;
  }): Promise<Buffer> {
    const where: any = {
      ...(filters?.status ? { status: filters.status } : { status: 'completed' }),
      ...(filters?.type && { type: filters.type }),
    };

    // Handle today filter
    if (filters?.today) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.createdAt = {
        gte: today,
        lt: tomorrow,
      };
    } else if (filters?.startDate && filters?.endDate) {
      where.createdAt = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    const donations = await this.prisma.donation.findMany({
      where,
      include: {
        user: {
          include: {
            details: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('ABC Church - Financial Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      doc.fontSize(10);
      let y = doc.y;
      doc.text('Date', 50, y);
      doc.text('Donor', 120, y);
      doc.text('Type', 250, y);
      doc.text('Amount', 320, y);
      doc.text('Status', 400, y);

      // Draw line
      doc.moveTo(50, y + 15).lineTo(500, y + 15).stroke();
      y += 25;

      // Table rows
      donations.forEach((donation) => {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }

        const donorName = `${donation.user.details?.name || ''} ${donation.user.details?.lastName || ''}`.trim() || 'N/A';
        doc.text(donation.createdAt.toISOString().split('T')[0], 50, y);
        doc.text(donorName.substring(0, 30), 120, y);
        doc.text(donation.type, 250, y);
        doc.text(`$${Number(donation.amount).toFixed(2)}`, 320, y);
        doc.text(donation.status, 400, y);
        y += 20;
      });

      // Total
      const totalAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);
      doc.moveDown();
      doc.fontSize(12).text(`Total: $${totalAmount.toFixed(2)}`, { align: 'right' });

      doc.end();
    });
  }

  async getFinancialSummary(filters?: {
    type?: DonationType;
    startDate?: Date;
    endDate?: Date;
    today?: boolean;
    status?: string;
  }) {
    const where: any = {
      ...(filters?.status ? { status: filters.status } : { status: 'completed' }),
      ...(filters?.type && { type: filters.type }),
    };

    // Handle today filter
    if (filters?.today) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.createdAt = {
        gte: today,
        lt: tomorrow,
      };
    } else if (filters?.startDate && filters?.endDate) {
      where.createdAt = {
        gte: filters.startDate,
        lte: filters.endDate,
      };
    }

    const [total, byType, count, recent] = await Promise.all([
      this.prisma.donation.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.count({ where }),
      this.prisma.donation.findMany({
        where,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: { details: true },
          },
        },
      }),
    ]);

    return {
      totalAmount: Number(total._sum.amount || 0),
      totalCount: count,
      byType: byType.map((item) => ({
        type: item.type,
        amount: Number(item._sum.amount || 0),
        count: item._count,
      })),
      recentDonations: recent,
    };
  }

  async requestExportToEmail(
    filters: {
      type?: DonationType;
      startDate?: Date;
      endDate?: Date;
      today?: boolean;
      status?: string;
    },
    format: 'excel' | 'pdf',
    recipientEmail: string,
    requestedBy: number,
  ): Promise<void> {
    // Create async event for export
    await this.outboxService.createEvent({
      eventType: 'financial.export',
      payload: {
        format,
        filters,
        recipientEmail,
        requestedBy,
      },
    });
  }
}

