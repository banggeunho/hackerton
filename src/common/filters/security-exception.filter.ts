import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/exception.dto';

/**
 * Security-focused exception filter to prevent information disclosure
 * This filter sanitizes error responses to avoid exposing sensitive information
 */
@Catch()
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  // Patterns that indicate potentially sensitive information
  private readonly sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /credential/i,
    /authorization/i,
    /database/i,
    /connection/i,
    /file system/i,
    /path/i,
    /directory/i,
  ];

  // SQL injection patterns
  private readonly sqlInjectionPatterns = [
    /select.*from/i,
    /insert.*into/i,
    /update.*set/i,
    /delete.*from/i,
    /union.*select/i,
    /drop.*table/i,
    /alter.*table/i,
  ];

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Check for security threats
    this.detectSecurityThreats(request);

    const errorResponse = this.createSecureErrorResponse(exception, request);

    // Log security events
    this.logSecurityEvent(exception, request, errorResponse);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private detectSecurityThreats(request: Request): void {
    const { query, body, params, headers } = request;

    // Check for SQL injection attempts
    this.checkSqlInjection(query, 'query');
    this.checkSqlInjection(body, 'body');
    this.checkSqlInjection(params, 'params');

    // Check for suspicious headers
    this.checkSuspiciousHeaders(headers);
  }

  private checkSqlInjection(data: unknown, source: string): void {
    if (!data) return;

    const dataString = JSON.stringify(data).toLowerCase();

    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(dataString)) {
        this.logger.error(`SQL injection attempt detected in ${source}`, {
          source,
          pattern: pattern.source,
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }
  }

  private checkSuspiciousHeaders(headers: Record<string, unknown>): void {
    const suspiciousHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'x-originating-ip',
    ];

    for (const header of suspiciousHeaders) {
      if (headers[header]) {
        this.logger.warn(`Suspicious header detected: ${header}`, {
          header,
          value: headers[header],
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private createSecureErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponseDto {
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    const requestId = this.generateSecureRequestId();

    // In production, provide minimal information
    if (isProduction) {
      return {
        success: false,
        errorType: 'InternalServerError',
        message: 'An error occurred while processing your request',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp,
        requestId,
      };
    }

    // In development, provide sanitized information
    let message = 'Unknown error';
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof Error) {
      message = this.sanitizeMessage(exception.message);

      // Try to extract status code from HTTP exceptions
      if (
        'getStatus' in exception &&
        typeof exception.getStatus === 'function'
      ) {
        statusCode = exception.getStatus();
      }
    }

    return {
      success: false,
      errorType: this.getSecureErrorType(statusCode),
      message,
      statusCode,
      timestamp,
      requestId,
      path: this.sanitizePath(request.url),
    };
  }

  private sanitizeMessage(message: string): string {
    let sanitized = message;

    // Remove potentially sensitive information
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Remove file paths and system information
    sanitized = sanitized.replace(/[A-Za-z]:\\[^\\s]+/g, '[PATH_REDACTED]');
    sanitized = sanitized.replace(/\/[^\\s]+/g, '[PATH_REDACTED]');

    // Remove potential database connection strings
    sanitized = sanitized.replace(
      /[a-zA-Z]+:\/\/[^\\s]+/g,
      '[CONNECTION_REDACTED]',
    );

    return sanitized;
  }

  private sanitizePath(path: string): string {
    // Remove query parameters that might contain sensitive data
    const [basePath] = path.split('?');

    // Replace potential IDs or sensitive parameters with placeholders
    return basePath.replace(/\/[0-9a-f-]{36}\//gi, '/[UUID]/');
  }

  private getSecureErrorType(statusCode: number): string {
    // Group similar error types to avoid information disclosure
    if (statusCode >= 400 && statusCode < 500) {
      return 'ClientError';
    }
    return 'ServerError';
  }

  private logSecurityEvent(
    exception: unknown,
    request: Request,
    errorResponse: ErrorResponseDto,
  ): void {
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'Unknown';

    const securityContext = {
      method,
      url: this.sanitizePath(url),
      ip,
      userAgent,
      requestId: errorResponse.requestId,
      statusCode: errorResponse.statusCode,
      timestamp: errorResponse.timestamp,
    };

    // Log all errors as potential security events
    if (errorResponse.statusCode >= 500) {
      this.logger.error('Security Event - Server Error', securityContext);
    } else {
      this.logger.warn('Security Event - Client Error', securityContext);
    }

    // Log the actual exception details in a separate, more detailed log for debugging
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug('Exception Details', {
        exception: exception instanceof Error ? exception.stack : exception,
        ...securityContext,
      });
    }
  }

  private generateSecureRequestId(): string {
    // Use crypto-strong random generation for request IDs
    const chars =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'req_';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
