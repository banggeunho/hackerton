import { Module } from '@nestjs/common';
import { BedrockController } from './bedrock.controller';
import { BedrockService } from './bedrock.service';

@Module({
  controllers: [BedrockController],
  providers: [BedrockService],
  exports: [BedrockService],
})
export class BedrockModule {}
