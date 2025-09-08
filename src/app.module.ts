import { Module } from '@nestjs/common';
import { BedrockModule } from './modules/bedrock/bedrock.module';
import { LocationModule } from './modules/location/location.module';

@Module({
  imports: [BedrockModule, LocationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
