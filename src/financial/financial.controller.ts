import { Controller, Get, Post, Query, UseGuards, Res, Header, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { FinancialService } from './financial.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole, DonationType } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import type { Response } from 'express';

@ApiTags('Financial')
@ApiBearerAuth('JWT-auth')
@Controller('financial')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary (Super Admin only)', description: 'Get financial summary with totals and breakdowns' })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'today', required: false, type: Boolean, description: 'Get today\'s donations only' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status (pending, completed, failed)' })
  @ApiResponse({ status: 200, description: 'Financial summary retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin access required' })
  async getSummary(
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('today') today?: string,
    @Query('status') status?: string,
  ) {
    const summary = await this.financialService.getFinancialSummary({
      type: type as DonationType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      today: today === 'true',
      status,
    });
    return buildAppResponse(summary, 'Financial summary retrieved', 200, '/api/financial/summary');
  }

  @Get('export/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename=donations.xlsx')
  @ApiOperation({ summary: 'Export donations to Excel (Super Admin only)', description: 'Download donation records as Excel file' })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'today', required: false, type: Boolean, description: 'Export today\'s donations only' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Excel file downloaded', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  async exportExcel(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('today') today?: string,
    @Query('status') status?: string,
  ) {
    const workbook = await this.financialService.exportToExcel({
      type: type as DonationType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      today: today === 'true',
      status,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  }

  @Post('export/excel/email')
  @ApiOperation({ summary: 'Export and email Excel report (Super Admin only)', description: 'Generate Excel report and send via email asynchronously' })
  @ApiBody({ schema: { example: { type: 'TITHE', today: true, recipientEmail: 'admin@church.com' } } })
  @ApiResponse({ status: 202, description: 'Export request accepted, will be sent via email' })
  async exportExcelToEmail(
    @Body() body: { type?: string; startDate?: string; endDate?: string; today?: boolean; status?: string; recipientEmail: string },
    @Req() req: any,
  ) {
    await this.financialService.requestExportToEmail(
      {
        type: body.type as DonationType,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        today: body.today,
        status: body.status,
      },
      'excel',
      body.recipientEmail || req.user.email,
      req.user.id,
    );

    return buildAppResponse(
      { message: 'Export request accepted. Report will be sent via email shortly.' },
      'Export request queued',
      202,
      '/api/financial/export/excel/email',
    );
  }

  @Post('export/pdf/email')
  @ApiOperation({ summary: 'Export and email PDF report (Super Admin only)', description: 'Generate PDF report and send via email asynchronously' })
  @ApiBody({ schema: { example: { type: 'OFFERING', today: true, recipientEmail: 'admin@church.com' } } })
  @ApiResponse({ status: 202, description: 'Export request accepted, will be sent via email' })
  async exportPDFToEmail(
    @Body() body: { type?: string; startDate?: string; endDate?: string; today?: boolean; status?: string; recipientEmail: string },
    @Req() req: any,
  ) {
    await this.financialService.requestExportToEmail(
      {
        type: body.type as DonationType,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        today: body.today,
        status: body.status,
      },
      'pdf',
      body.recipientEmail || req.user.email,
      req.user.id,
    );

    return buildAppResponse(
      { message: 'Export request accepted. Report will be sent via email shortly.' },
      'Export request queued',
      202,
      '/api/financial/export/pdf/email',
    );
  }

  @Get('export/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename=donations.pdf')
  @ApiOperation({ summary: 'Export donations to PDF (Super Admin only)', description: 'Download donation records as PDF file' })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'today', required: false, type: Boolean, description: 'Export today\'s donations only' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'PDF file downloaded', type: 'application/pdf' })
  async exportPDF(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('today') today?: string,
    @Query('status') status?: string,
  ) {
    const buffer = await this.financialService.exportToPDF({
      type: type as DonationType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      today: today === 'true',
      status,
    });

    res.send(buffer);
  }
}

