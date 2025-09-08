import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BedrockController } from './bedrock.controller';
import { BedrockService } from './bedrock.service';
import { LocationController } from './location.controller';
import { LocationService, PlacesService } from './services';

@Module({
  imports: [],
  controllers: [AppController, BedrockController, LocationController],
  providers: [AppService, BedrockService, LocationService, PlacesService],
})
export class AppModule {}
