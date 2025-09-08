import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard error response structure
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'Success flag (always false for errors)',
    example: false,
  })
  success: false;

  @ApiProperty({
    description: 'Error type classification',
    example: 'ValidationError',
    enum: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      'ConflictError',
      'RateLimitError',
      'InternalServerError',
      'ExternalServiceError',
      'BusinessLogicError',
    ],
  })
  errorType: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'The requested resource was not found',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Additional error details or validation errors',
    example: [
      'Field "email" is required',
      'Field "password" must be at least 8 characters',
    ],
    type: [String],
  })
  details?: string[];

  @ApiPropertyOptional({
    description: 'Error code for programmatic handling',
    example: 'USER_NOT_FOUND',
  })
  errorCode?: string;

  @ApiProperty({
    description: 'HTTP status code',
    example: 404,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Request timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  timestamp: string;

  @ApiPropertyOptional({
    description: 'Request identifier for tracing',
    example: 'req_12345abcdef',
  })
  requestId?: string;

  @ApiPropertyOptional({
    description: 'API endpoint path that generated the error',
    example: '/api/users/123',
  })
  path?: string;
}
