import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

/**
 * Business logic validation exception
 */
export class BusinessLogicException extends BaseException {
  constructor(message: string, errorCode?: string, details?: string[]) {
    super(
      message,
      HttpStatus.BAD_REQUEST,
      'BusinessLogicError',
      errorCode,
      details,
    );
  }
}

/**
 * Resource not found exception
 */
export class ResourceNotFoundException extends BaseException {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;

    super(message, HttpStatus.NOT_FOUND, 'NotFoundError', 'RESOURCE_NOT_FOUND');
  }
}

/**
 * Resource conflict exception (e.g., duplicate entries)
 */
export class ResourceConflictException extends BaseException {
  constructor(message: string, errorCode?: string) {
    super(message, HttpStatus.CONFLICT, 'ConflictError', errorCode);
  }
}

/**
 * External service unavailable exception
 */
export class ExternalServiceException extends BaseException {
  constructor(service: string, originalError?: string) {
    const message = `External service '${service}' is currently unavailable`;
    const details = originalError ? [originalError] : undefined;

    super(
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      'ExternalServiceError',
      'SERVICE_UNAVAILABLE',
      details,
    );
  }
}

/**
 * Rate limiting exception
 */
export class RateLimitException extends BaseException {
  constructor(limit: number, windowMs: number) {
    const message = `Rate limit exceeded. Maximum ${limit} requests per ${windowMs}ms`;

    super(
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      'RateLimitError',
      'RATE_LIMIT_EXCEEDED',
    );
  }
}

/**
 * Authentication required exception
 */
export class AuthenticationException extends BaseException {
  constructor(message = 'Authentication required') {
    super(
      message,
      HttpStatus.UNAUTHORIZED,
      'AuthenticationError',
      'AUTH_REQUIRED',
    );
  }
}

/**
 * Insufficient permissions exception
 */
export class AuthorizationException extends BaseException {
  constructor(message = 'Insufficient permissions to access this resource') {
    super(
      message,
      HttpStatus.FORBIDDEN,
      'AuthorizationError',
      'INSUFFICIENT_PERMISSIONS',
    );
  }
}
