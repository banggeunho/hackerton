import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base exception class for custom application exceptions
 */
export abstract class BaseException extends HttpException {
  public readonly errorCode?: string;
  public readonly errorType: string;
  public readonly details?: string[];

  constructor(
    message: string,
    status: HttpStatus,
    errorType: string,
    errorCode?: string,
    details?: string[],
  ) {
    super(message, status);
    this.errorType = errorType;
    this.errorCode = errorCode;
    this.details = details;
  }
}
