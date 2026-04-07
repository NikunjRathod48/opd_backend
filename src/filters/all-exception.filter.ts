import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

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
export class AllExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode: number;
    let message: string;

    if (isPrismaError(exception)) {
      switch (exception.code) {
        case 'P2002':
          statusCode = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[])?.join(', ') || 'field';
          message = `A record with this ${target} already exists`;
          break;
        case 'P2003':
          statusCode = HttpStatus.BAD_REQUEST;
          const field = (exception.meta?.field_name as string) || 'reference';
          message = `Invalid reference: related record does not exist (${field})`;
          break;
        case 'P2025':
          statusCode = HttpStatus.NOT_FOUND;
          message = (exception.meta?.cause as string) || 'Record not found';
          break;
        case 'P2011':
          statusCode = HttpStatus.BAD_REQUEST;
          const constraint = (exception.meta?.constraint as string) || 'field';
          message = `Missing required field: ${constraint}`;
          break;
        case 'P2000':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Value too long for the field';
          break;
        default:
          statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'A database error occurred';
          break;
      }
      console.error(`[PrismaError] ${exception.code} | ${exception.message.replace(/\n/g, ' ')}`);
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      // NestJS validation pipe returns { message: string[] | string, ... }
      if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, any>;
        message =
          Array.isArray(body.message)
            ? body.message.join('; ')
            : body.message || exception.message;
      } else {
        message = typeof res === 'string' ? res : exception.message;
      }
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';

      // Log the real error for debugging
      console.error(
        `[UnhandledError] ${exception.name}: ${exception.message}`,
      );
      console.error(exception.stack);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';

      console.error('[UnknownError]', exception);
    }

    response.status(statusCode).json({ statusCode, message });
  }
}
