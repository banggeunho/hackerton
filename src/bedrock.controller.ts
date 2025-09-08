import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BedrockService } from './bedrock.service';
import {
  ChatRequestDto,
  ChatWithContextRequestDto,
  ChatResponseDto,
  HealthCheckDto,
  ErrorResponseDto,
} from './dto';
import { ExternalServiceException } from './exceptions';

@ApiTags('bedrock')
@Controller('bedrock')
export class BedrockController {
  constructor(private readonly bedrockService: BedrockService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI model' })
  @ApiResponse({
    status: 200,
    description: 'Successful chat response',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: ErrorResponseDto,
  })
  async chat(@Body() request: ChatRequestDto): Promise<ChatResponseDto> {
    const { prompt, systemPrompt } = request;

    try {
      const response = await this.bedrockService.generateResponse(
        prompt,
        systemPrompt,
      );

      return {
        success: true,
        response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Transform service errors into domain-specific exceptions
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new ExternalServiceException('Bedrock', errorMessage);
    }
  }

  @Post('chat-with-context')
  @ApiOperation({ summary: 'Chat with AI model using additional context' })
  @ApiResponse({
    status: 200,
    description: 'Successful chat with context response',
    type: ChatResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: ErrorResponseDto,
  })
  async chatWithContext(
    @Body() request: ChatWithContextRequestDto,
  ): Promise<ChatResponseDto> {
    const { prompt, context, systemPrompt } = request;

    try {
      const response = await this.bedrockService.generateWithContext(
        prompt,
        context,
        systemPrompt,
      );

      return {
        success: true,
        response,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Transform service errors into domain-specific exceptions
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new ExternalServiceException('Bedrock', errorMessage);
    }
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check for Bedrock service' })
  @ApiResponse({
    status: 200,
    description: 'Service health status',
    type: HealthCheckDto,
  })
  healthCheck(): HealthCheckDto {
    return {
      status: 'ok',
      service: 'Bedrock with LangChain',
      timestamp: new Date().toISOString(),
    };
  }
}
