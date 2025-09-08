import { Injectable } from '@nestjs/common';
import { ChatBedrockConverse } from '@langchain/aws';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

@Injectable()
export class BedrockService {
  private chatModel: ChatBedrockConverse;

  constructor() {
    this.chatModel = new ChatBedrockConverse({
      model: 'anthropic.claude-3-sonnet-20240229-v1:0',
      region: 'ap-northeast-2',
      maxTokens: 1000,
      temperature: 0.7,
    });
  }

  async generateResponse(
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    try {
      const messages: BaseMessage[] = [];

      if (systemPrompt) {
        messages.push(new SystemMessage(systemPrompt));
      }

      messages.push(new HumanMessage(prompt));

      const response = await this.chatModel.invoke(messages);
      return response.content as string;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Bedrock API call failed: ${errorMessage}`);
    }
  }

  async generateWithContext(
    prompt: string,
    context: string[],
    systemPrompt?: string,
  ): Promise<string> {
    const contextString = context.join('\n\n');
    const enhancedPrompt = `Context:\n${contextString}\n\nQuery: ${prompt}`;

    return this.generateResponse(enhancedPrompt, systemPrompt);
  }

  async streamResponse(
    prompt: string,
    systemPrompt?: string,
  ): Promise<AsyncIterable<string>> {
    const messages: BaseMessage[] = [];

    if (systemPrompt) {
      messages.push(new SystemMessage(systemPrompt));
    }

    messages.push(new HumanMessage(prompt));

    const stream = await this.chatModel.stream(messages);

    return (async function* () {
      for await (const chunk of stream) {
        if (chunk.content) {
          yield chunk.content as string;
        }
      }
    })();
  }
}
