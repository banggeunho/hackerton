import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Custom exception filter to handle validation errors
 * Provides consistent error response format for validation failures
 */
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Handle validation error responses
    if (
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;

      // If message is an array (validation errors), format them nicely
      if (Array.isArray(message)) {
        response.status(status).json({
          success: false,
          error: 'Validation failed',
          details: message,
          timestamp: new Date().toISOString(),
          statusCode: status,
        });
        return;
      }
    }

    // Default error response
    response.status(status).json({
      success: false,
      error:
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : 'Bad request',
      timestamp: new Date().toISOString(),
      statusCode: status,
    });
  }
}
