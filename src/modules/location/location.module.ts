import { Module } from '@nestjs/common';
import { LocationController } from './location.controller';
import { LocationService } from './services/location.service';
import { PlacesService } from './services/places.service';
import { NaverSearchService } from './services/naver-search.service';
import { GoogleMapsService } from './services/google-maps.service';
import { BedrockModule } from '../bedrock/bedrock.module';

@Module({
  controllers: [LocationController],
  providers: [
    LocationService,
    PlacesService,
    NaverSearchService,
    GoogleMapsService,
  ],
  exports: [
    LocationService,
    PlacesService,
    NaverSearchService,
    GoogleMapsService,
  ],
  imports: [BedrockModule],
})
export class LocationModule {}
