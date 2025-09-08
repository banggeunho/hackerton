import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseResponseDto } from './base.dto';

/**
 * Basic chat request DTO
 */
export class ChatRequestDto {
  @ApiProperty({
    description: 'The prompt/question to send to the AI model',
    example: 'Hello, how are you?',
    minLength: 1,
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty({ message: 'Prompt cannot be empty' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  prompt: string;

  @ApiPropertyOptional({
    description: 'System prompt to set the AI behavior and context',
    example:
      'You are a helpful assistant that provides clear and concise answers.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  systemPrompt?: string;
}

/**
 * Chat with context request DTO
 */
export class ChatWithContextRequestDto extends ChatRequestDto {
  @ApiProperty({
    description: 'Array of context strings to provide additional information',
    example: ['Document content here...', 'Additional context...'],
    type: [String],
  })
  @IsArray({ message: 'Context must be an array' })
  @ArrayNotEmpty({ message: 'Context array cannot be empty' })
  @IsString({ each: true, message: 'Each context item must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  )
  context: string[];
}

/**
 * Chat response DTO
 */
export class ChatResponseDto extends BaseResponseDto {
  @ApiProperty({
    description: 'The AI model response',
    example:
      "Hello! I'm doing well, thank you for asking. How can I help you today?",
  })
  response: string;

  @ApiProperty({
    description: 'Success flag',
    example: true,
  })
  declare success: true;
}

/**
 * Chat error response DTO
 */
export class ChatErrorResponseDto extends BaseResponseDto {
  @ApiProperty({
    description: 'Error message',
    example: 'Failed to process the request',
  })
  error: string;

  @ApiProperty({
    description: 'Success flag (always false for errors)',
    example: false,
  })
  declare success: false;
}
