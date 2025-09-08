import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter, SecurityExceptionFilter } from './filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      // Automatically transform payloads to be objects typed according to their DTO classes
      transform: true,
      // Strip properties that do not have any decorators
      whitelist: true,
      // Throw an error if non-whitelisted properties are found
      forbidNonWhitelisted: true,
      // Detailed error messages for validation failures
      disableErrorMessages: false,
      // Transform and validate nested objects
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Configure global exception filters (order matters - most specific first)
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // In production, use security-focused filter for all exceptions
    app.useGlobalFilters(new SecurityExceptionFilter());
  } else {
    // In development, use comprehensive filter for better debugging
    app.useGlobalFilters(new GlobalExceptionFilter());
  }

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Hackerton API')
    .setDescription(
      'NestJS application with AWS Bedrock integration using LangChain',
    )
    .setVersion('1.0')
    .addTag('bedrock', 'AWS Bedrock AI service endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `Swagger documentation is available at: http://localhost:${port}/api`,
  );
}

void bootstrap();
