import { Body, Controller, Get, Post } from '@nestjs/common';
import { BedrockService } from './bedrock.service';

interface ChatRequest {
  prompt: string;
  systemPrompt?: string;
}

interface ChatWithContextRequest extends ChatRequest {
  context: string[];
}

@Controller('bedrock')
export class BedrockController {
  constructor(private readonly bedrockService: BedrockService) {}

  @Post('chat')
  async chat(@Body() request: ChatRequest) {
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('chat-with-context')
  async chatWithContext(@Body() request: ChatWithContextRequest) {
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      service: 'Bedrock with LangChain',
      timestamp: new Date().toISOString(),
    };
  }
}
