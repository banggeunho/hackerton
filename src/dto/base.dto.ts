import { ApiProperty } from '@nestjs/swagger';

/**
 * Base DTO class with common response fields
 */
export class BaseResponseDto {
  @ApiProperty({
    description: 'Indicates if the operation was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Timestamp of the response',
    example: '2024-01-01T12:00:00.000Z',
  })
  timestamp: string;
}

/**
 * Health check response DTO
 */
export class HealthCheckDto {
  @ApiProperty({
    description: 'Service status',
    example: 'ok',
  })
  status: string;

  @ApiProperty({
    description: 'Service name',
    example: 'Bedrock with LangChain',
  })
  service: string;

  @ApiProperty({
    description: 'Timestamp of the health check',
    example: '2024-01-01T12:00:00.000Z',
  })
  timestamp: string;
}
