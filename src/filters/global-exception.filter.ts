import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BaseException } from '../exceptions';
import { ErrorResponseDto } from '../dto/exception.dto';

/**
 * Global exception filter that catches all exceptions and formats them consistently
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.createErrorResponse(exception, request);

    // Log the error with appropriate level
    this.logException(exception, request, errorResponse);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private createErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponseDto {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const requestId = this.generateRequestId();

    // Handle custom BaseException
    if (exception instanceof BaseException) {
      return {
        success: false,
        errorType: exception.errorType,
        message: exception.message,
        details: exception.details,
        errorCode: exception.errorCode,
        statusCode: exception.getStatus(),
        timestamp,
        requestId,
        path,
      };
    }

    // Handle standard HTTP exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      return {
        success: false,
        errorType: this.getErrorTypeFromStatus(status),
        message: this.extractMessage(exceptionResponse),
        details: this.extractDetails(exceptionResponse),
        statusCode: status,
        timestamp,
        requestId,
        path,
      };
    }

    // Handle unexpected errors
    const isProduction = process.env.NODE_ENV === 'production';
    return {
      success: false,
      errorType: 'InternalServerError',
      message: isProduction
        ? 'An unexpected error occurred'
        : exception instanceof Error
          ? exception.message
          : 'Unknown error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp,
      requestId,
      path,
      ...(isProduction ? {} : { details: [this.getStackTrace(exception)] }),
    };
  }

  private extractMessage(exceptionResponse: unknown): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const response = exceptionResponse as Record<string, unknown>;

      if (typeof response.message === 'string') {
        return response.message;
      }

      if (Array.isArray(response.message)) {
        return 'Validation failed';
      }
    }

    return 'Bad request';
  }

  private extractDetails(exceptionResponse: unknown): string[] | undefined {
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const response = exceptionResponse as Record<string, unknown>;

      if (Array.isArray(response.message)) {
        return response.message.map(String);
      }
    }

    return undefined;
  }

  private getErrorTypeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'ValidationError';
      case HttpStatus.UNAUTHORIZED:
        return 'AuthenticationError';
      case HttpStatus.FORBIDDEN:
        return 'AuthorizationError';
      case HttpStatus.NOT_FOUND:
        return 'NotFoundError';
      case HttpStatus.CONFLICT:
        return 'ConflictError';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RateLimitError';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'InternalServerError';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'ExternalServiceError';
      default:
        return 'InternalServerError';
    }
  }

  private logException(
    exception: unknown,
    request: Request,
    errorResponse: ErrorResponseDto,
  ): void {
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'Unknown';

    const logContext = {
      method,
      url,
      ip,
      userAgent,
      requestId: errorResponse.requestId,
      errorType: errorResponse.errorType,
      statusCode: errorResponse.statusCode,
    };

    // Log validation and client errors as warnings
    if (errorResponse.statusCode < 500) {
      this.logger.warn(`Client Error: ${errorResponse.message}`, {
        ...logContext,
        details: errorResponse.details,
      });
    } else {
      // Log server errors with full stack trace
      const stackTrace = this.getStackTrace(exception);
      this.logger.error(`Server Error: ${errorResponse.message}`, {
        ...logContext,
        stackTrace,
      });
    }
  }

  private getStackTrace(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.stack || 'No stack trace available';
    }
    return String(exception);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
