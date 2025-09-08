import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BedrockController } from './bedrock.controller';
import { BedrockService } from './bedrock.service';

@Module({
  imports: [],
  controllers: [AppController, BedrockController],
  providers: [AppService, BedrockService],
})
export class AppModule {}
