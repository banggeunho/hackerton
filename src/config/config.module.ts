import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validationSchema } from './validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
