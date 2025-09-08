import { Module } from '@nestjs/common';
import { ConfigModule } from './config';
import { BedrockModule } from './modules/bedrock/bedrock.module';
import { LocationModule } from './modules/location/location.module';

@Module({
  imports: [ConfigModule, BedrockModule, LocationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
