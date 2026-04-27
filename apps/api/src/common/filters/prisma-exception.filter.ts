import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@crm/shared';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // PrismaClientValidationError: campo inválido ou ausente na query (erro de código, não de infra)
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(`Prisma validation error: ${exception.message}`);
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Erro de validação na consulta ao banco de dados. Verifique os campos enviados.',
        error: 'Database Validation Error',
      });
    }

    // PrismaClientKnownRequestError: erros com código específico (P2002, P2025, etc.)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const code = exception.code;

      // P2002: violação de constraint unique (ex: phone duplicado)
      if (code === 'P2002') {
        const fields = (exception.meta?.target as string[])?.join(', ') ?? 'campo';
        this.logger.warn(`Unique constraint violation [${fields}]: ${exception.message}`);
        return response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: `Já existe um registro com este valor para: ${fields}.`,
          error: 'Conflict',
          code,
        });
      }

      // P2025: registro não encontrado (ex: update/delete de ID inexistente)
      if (code === 'P2025') {
        this.logger.warn(`Record not found: ${exception.message}`);
        return response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado.',
          error: 'Not Found',
          code,
        });
      }

      // P2003: foreign key constraint (relação inválida)
      if (code === 'P2003') {
        this.logger.warn(`Foreign key constraint failed: ${exception.message}`);
        return response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referência inválida: o registro relacionado não existe.',
          error: 'Foreign Key Constraint',
          code,
        });
      }

      // Outros erros conhecidos do Prisma → 400
      this.logger.error(`Prisma known error [${code}]: ${exception.message}`);
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Erro no banco de dados (${code}).`,
        error: 'Database Error',
        code,
      });
    }

    // PrismaClientInitializationError / PrismaClientRustPanicError / PrismaClientUnknownRequestError
    // → problemas de infraestrutura (conexão, crash)
    this.logger.error(`Erro de infraestrutura Prisma: ${exception.message}`);
    return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'O banco de dados está temporariamente indisponível. O sistema irá reconectar automaticamente.',
      error: 'Database Connection Error',
    });
  }
}
