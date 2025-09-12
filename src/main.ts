import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  GlobalExceptionFilter,
  SecurityExceptionFilter,
} from './common/filters';
import { AllConfigType } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get configuration service
  const configService = app.get(ConfigService<AllConfigType>);
  const appConfig = configService.get('app', { infer: true })!;

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
  const isProduction = appConfig.nodeEnv === 'production';

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
      'NestJS application with AWS Bedrock integration using LangChain and location-based AI recommendations',
    )
    .setVersion('1.0')
    .addTag('bedrock', 'AWS Bedrock AI service endpoints')
    .addTag(
      'location',
      'Location-based services with AI-powered place recommendations',
    )
    .addServer('http://localhost:3000', 'Development server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = appConfig.port;

  // Graceful shutdown handling for hot-reload
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing application...');
    await app.close();
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing application...');
    await app.close();
  });

  try {
    await app.listen(port);
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(
      `Swagger documentation is available at: http://localhost:${port}/api`,
    );
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Trying to gracefully restart...`,
      );
      // Force kill existing process and retry
      const { spawn } = require('child_process');
      spawn('lsof', ['-ti', `:${port}`], { stdio: 'pipe' }).stdout.on(
        'data',
        (pid) => {
          const processes = pid.toString().trim().split('\n');
          processes.forEach((p) => {
            if (p && p !== process.pid.toString()) {
              try {
                process.kill(parseInt(p), 'SIGKILL');
                console.log(`Killed process ${p} using port ${port}`);
              } catch (killError) {
                console.warn(`Could not kill process ${p}:`, killError.message);
              }
            }
          });

          // Retry after cleanup
          setTimeout(async () => {
            try {
              await app.listen(port);
              console.log(
                `Application restarted successfully on: http://localhost:${port}`,
              );
            } catch (retryError) {
              console.error('Failed to restart:', retryError);
              process.exit(1);
            }
          }, 1000);
        },
      );
    } else {
      console.error('Failed to start application:', error);
      process.exit(1);
    }
  }
}

void bootstrap();
