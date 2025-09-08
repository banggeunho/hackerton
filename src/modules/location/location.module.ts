import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './services/location.service';
import { PlacesService } from './services/places.service';
import { BedrockModule } from '../bedrock/bedrock.module';

@Module({
  controllers: [LocationController],
  providers: [LocationService, PlacesService],
  exports: [LocationService, PlacesService],
  imports: [BedrockModule],
})
export class LocationModule {}
