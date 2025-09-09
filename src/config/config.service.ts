import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private configService: ConfigService) {
    this.validateEnvironment();
  }

  // Kakao API Configuration
  get kakaoRestApiKey(): string {
    return this.configService.get<string>('KAKAO_REST_API_KEY') || '';
  }

  // Naver API Configuration
  get naverClientId(): string {
    return this.configService.get<string>('NAVER_CLIENT_ID') || '';
  }

  get naverClientSecret(): string {
    return this.configService.get<string>('NAVER_CLIENT_SECRET') || '';
  }

  // AWS Configuration
  get awsRegion(): string {
    return this.configService.get<string>('AWS_REGION') || 'us-east-1';
  }

  get awsAccessKeyId(): string {
    return this.configService.get<string>('AWS_ACCESS_KEY_ID') || '';
  }

  get awsSecretAccessKey(): string {
    return this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '';
  }

  // Application Configuration
  get port(): number {
    return this.configService.get<number>('PORT') || 3000;
  }

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV') || 'development';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  // Environment validation
  private validateEnvironment(): void {
    const requiredVars = [
      'KAKAO_REST_API_KEY',
      'NAVER_CLIENT_ID', 
      'NAVER_CLIENT_SECRET'
    ];

    const optionalVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY'
    ];

    this.logger.log('Environment Variable Status:');
    this.logger.log('============================');

    // Check required variables
    const missingRequired: string[] = [];
    for (const varName of requiredVars) {
      const value = this.configService.get<string>(varName);
      if (!value) {
        missingRequired.push(varName);
        this.logger.error(`❌ ${varName}: MISSING (Required)`);
      } else {
        // Log partial value for security
        const maskedValue = this.maskSensitiveValue(value);
        this.logger.log(`✅ ${varName}: ${maskedValue}`);
      }
    }

    // Check optional variables
    for (const varName of optionalVars) {
      const value = this.configService.get<string>(varName);
      if (!value) {
        this.logger.warn(`⚠️ ${varName}: MISSING (Optional)`);
      } else {
        const maskedValue = this.maskSensitiveValue(value);
        this.logger.log(`✅ ${varName}: ${maskedValue}`);
      }
    }

    // Application settings
    this.logger.log(`📍 PORT: ${this.port}`);
    this.logger.log(`🏷️ NODE_ENV: ${this.nodeEnv}`);
    this.logger.log('============================');

    // Warn about missing required variables
    if (missingRequired.length > 0) {
      this.logger.error(
        `Missing required environment variables: ${missingRequired.join(', ')}`
      );
      this.logger.error(
        'Please check your .env file and ensure all required variables are set.'
      );
    }

    // Success message
    if (missingRequired.length === 0) {
      this.logger.log('✨ All required environment variables are configured!');
    }
  }

  // Utility method to get all environment variables for debugging
  getAllEnvVars(): Record<string, any> {
    return {
      kakao: {
        restApiKey: this.maskSensitiveValue(this.kakaoRestApiKey),
      },
      naver: {
        clientId: this.maskSensitiveValue(this.naverClientId),
        clientSecret: this.maskSensitiveValue(this.naverClientSecret),
      },
      aws: {
        region: this.awsRegion,
        accessKeyId: this.maskSensitiveValue(this.awsAccessKeyId),
        secretAccessKey: this.maskSensitiveValue(this.awsSecretAccessKey),
      },
      app: {
        port: this.port,
        nodeEnv: this.nodeEnv,
        isDevelopment: this.isDevelopment,
        isProduction: this.isProduction,
      },
    };
  }

  // Mask sensitive values for logging
  private maskSensitiveValue(value: string): string {
    if (!value) return 'undefined';
    if (value.length <= 8) return '*'.repeat(value.length);
    return value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4);
  }
}