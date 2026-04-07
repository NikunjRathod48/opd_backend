import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Prisma v7 with custom generator output does not export
 * PrismaClientKnownRequestError from the generated client.
 * Instead, we catch all errors and inspect the `code` property
 * which Prisma error objects always carry (e.g. "P2002").
 */
interface PrismaError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(err: unknown): err is PrismaError {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof (err as any).code === 'string' &&
    (err as any).code.startsWith('P')
  );
}

@Catch()
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (!isPrismaError(exception)) {
      throw exception; // re-throw — let AllExceptionFilter handle it
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode: number;
    let message: string;

    switch (exception.code) {
      // Unique constraint violation
      case 'P2002': {
        statusCode = HttpStatus.CONFLICT;
        const target =
          (exception.meta?.target as string[])?.join(', ') || 'field';
        message = `A record with this ${target} already exists`;
        break;
      }

      // Foreign key constraint violation
      case 'P2003': {
        statusCode = HttpStatus.BAD_REQUEST;
        const field =
          (exception.meta?.field_name as string) || 'reference';
        message = `Invalid reference: related record does not exist (${field})`;
        break;
      }

      // Record not found (update/delete on non-existent row)
      case 'P2025': {
        statusCode = HttpStatus.NOT_FOUND;
        message =
          (exception.meta?.cause as string) || 'Record not found';
        break;
      }

      // Required field missing
      case 'P2011': {
        statusCode = HttpStatus.BAD_REQUEST;
        const constraint =
          (exception.meta?.constraint as string) || 'field';
        message = `Missing required field: ${constraint}`;
        break;
      }

      // Value too long
      case 'P2000': {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Value too long for the field';
        break;
      }

      default: {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'A database error occurred';
        break;
      }
    }

    // Log for debugging — never expose to client
    console.error(
      `[PrismaError] ${exception.code} | ${exception.message.replace(/\n/g, ' ')}`,
    );

    response.status(statusCode).json({ statusCode, message });
  }
}
