import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './financeiro.dto';

@UseGuards(JwtAuthGuard)
@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly service: FinanceiroService) {}

  // ─── Transactions ──────────────────────────────────────

  @Get('transactions')
  findAllTransactions(
    @Query('type') type: string,
    @Query('category') category: string,
    @Query('status') status: string,
    @Query('legalCaseId') legalCaseId: string,
    @Query('leadId') leadId: string,
    @Query('lawyerId') lawyerId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Request() req: any,
  ) {
    return this.service.findAllTransactions({
      tenantId: req.user.tenant_id,
      type,
      category,
      status,
      legalCaseId,
      leadId,
      lawyerId,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('transactions')
  createTransaction(
    @Body() body: CreateTransactionDto,
    @Request() req: any,
  ) {
    return this.service.createTransaction({
      ...body,
      tenant_id: req.user.tenant_id,
    });
  }

  @Patch('transactions/:id')
  updateTransaction(
    @Param('id') id: string,
    @Body() body: UpdateTransactionDto,
    @Request() req: any,
  ) {
    return this.service.updateTransaction(id, body, req.user.tenant_id);
  }

  @Delete('transactions/:id')
  deleteTransaction(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.deleteTransaction(id, req.user.tenant_id);
  }

  // ─── Summary & Cash Flow ───────────────────────────────

  @Get('summary')
  getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req: any,
  ) {
    return this.service.getSummary(req.user.tenant_id, startDate, endDate);
  }

  @Get('cash-flow')
  getCashFlow(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('groupBy') groupBy: 'day' | 'week' | 'month',
    @Request() req: any,
  ) {
    return this.service.getCashFlow(
      req.user.tenant_id,
      startDate,
      endDate,
      groupBy || 'month',
    );
  }

  // ─── Categories ────────────────────────────────────────

  @Get('categories')
  findAllCategories(@Request() req: any) {
    return this.service.findAllCategories(req.user.tenant_id);
  }

  @Post('categories')
  createCategory(
    @Body() body: CreateCategoryDto,
    @Request() req: any,
  ) {
    return this.service.createCategory(body, req.user.tenant_id);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @Request() req: any,
  ) {
    return this.service.updateCategory(id, body, req.user.tenant_id);
  }

  @Delete('categories/:id')
  deleteCategory(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.service.deleteCategory(id, req.user.tenant_id);
  }
}
