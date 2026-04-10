import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { buildErrorResponse, ErrorResponse } from './error_reponse.error';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { BaseError } from '../base_error.exception';
import type { Response } from 'express';

function messageFromHttpException(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) {
      return m.map(String).join(', ');
    }
    if (typeof m === 'string') {
      return m;
    }
  }
  return exception.message;
}

@Catch()
export class GlobalExceptionFilter<T> implements ExceptionFilter {
  catch(exception: T, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    let message: string;
    let status: number;

    if (exception instanceof HttpException) {
      message = messageFromHttpException(exception);
      status = exception.getStatus();
    } else if (exception instanceof BaseError) {
      message = exception.message;
      status = exception.getStatus();
    } else {
      message = 'Internal Server Error';
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const errorResponse = buildErrorResponse(status, message, request.url);

    const appResponse = buildAppResponse<ErrorResponse>(
      errorResponse,
      message,
      status,
      request.url,
    );

    response.status(status).json(appResponse);
  }
}
