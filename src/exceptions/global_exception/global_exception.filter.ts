import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { buildErrorResponse, ErrorResponse } from './error_reponse.error';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { BaseError } from '../base_error.exception';

@Catch()
export class GlobalExceptionFilter<T> implements ExceptionFilter {
  catch(exception: T, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    let message: string;
    let status: number;
    
    if (exception instanceof HttpException) {
      message = exception.message;
      status = exception.getStatus();
    } 
    else if (exception instanceof BaseError) {
      message = exception.message;
      status = exception.getStatus();
    } else {
      message = 'Internal Server Error';
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const errorResponse = buildErrorResponse(status, message, request.url);
    
    const appResponse = buildAppResponse<ErrorResponse>
    (
      errorResponse,
      message,
      status,
      request.url
    );

    response.json(appResponse);
  }
}
