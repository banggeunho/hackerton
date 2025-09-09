# Architecture Implementation Guide
## Hackerton 3-Layered Architecture

**Version**: 1.0.0  
**Target**: Development Teams  
**Purpose**: Practical implementation guidelines for maintaining architectural integrity

---

## 🎯 Quick Reference Guide

### Layer Decision Matrix
| Task Type | Target Layer | Implementation Pattern |
|-----------|--------------|----------------------|
| HTTP endpoint creation | 📱 Presentation | Controller + DTO validation |
| Business rule implementation | 🏢 Business | Service method |
| External API integration | 💾 Data Access | Client service + error handling |
| Data validation | 📱 Presentation | DTO decorators |
| Business logic validation | 🏢 Business | Service-level checks |
| Response formatting | 📱 Presentation | Response DTOs |
| Database operations | 💾 Data Access | Repository pattern |

### Dependency Flow Rules
```
📱 Presentation ──→ 🏢 Business ──→ 💾 Data Access
    ↑                    ↑              ↑
    ❌ No upward dependencies allowed ❌
```

---

## 📱 Presentation Layer Implementation

### Controller Best Practices
```typescript
@ApiTags('resource-name')
@Controller('resource-name')
export class ResourceController {
  private readonly logger = new Logger(ResourceController.name);

  constructor(
    private readonly businessService: BusinessService,  // ✅ Only business layer dependencies
  ) {}

  @Post('action')
  @ApiOperation({ summary: 'Clear action description' })
  @ApiResponse({ status: 200, type: ResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  async performAction(@Body() request: RequestDto): Promise<ResponseDto> {
    const startTime = Date.now();
    
    try {
      // ✅ Input logging (presentation concern)
      this.logger.log(`Processing ${request.constructor.name}`);
      
      // ✅ Delegate to business layer immediately
      const result = await this.businessService.performBusinessAction(request);
      
      // ✅ Response transformation (presentation concern)
      const response = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
      
      const processingTime = Date.now() - startTime;
      this.logger.log(`Action completed in ${processingTime}ms`);
      
      return response;
    } catch (error) {
      // ✅ Let global filter handle errors
      throw error;
    }
  }
}
```

### DTO Design Patterns
```typescript
// Request DTO - comprehensive validation
export class CreateResourceRequestDto {
  @ApiProperty({
    description: 'Clear field description',
    example: 'realistic example',
    minLength: 1,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  name: string;

  @ApiPropertyOptional({
    description: 'Optional field with defaults',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @ApiProperty({
    description: 'Array of items',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Transform(({ value }) => 
    Array.isArray(value) 
      ? value.map(item => typeof item === 'string' ? item.trim() : item)
      : value
  )
  items: string[];
}

// Response DTO - clear structure
export class ResourceResponseDto extends BaseResponseDto {
  @ApiProperty({
    description: 'Resource data',
    type: ResourceDto,
  })
  @Type(() => ResourceDto)
  data: ResourceDto;

  @ApiProperty({
    description: 'Success flag',
    example: true,
  })
  declare success: true;
}
```

### Global Filter Configuration
```typescript
// main.ts setup
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ✅ Global validation pipe (presentation layer)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // Strip unknown properties
    forbidNonWhitelisted: true,   // Reject unknown properties
    transform: true,              // Auto-transform types
    disableErrorMessages: process.env.NODE_ENV === 'production',
  }));
  
  // ✅ Global exception filter (presentation layer)
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  await app.listen(3000);
}
```

---

## 🏢 Business Layer Implementation

### Service Design Patterns
```typescript
@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    private readonly dataRepository: DataRepository,     // ✅ Data access dependency
    private readonly configService: ConfigService,      // ✅ Cross-cutting concern
    private readonly cacheService: CacheService,        // ✅ Infrastructure service
  ) {}

  async performBusinessAction(input: BusinessInput): Promise<BusinessResult> {
    // ✅ Input validation (business rules)
    this.validateBusinessRules(input);
    
    // ✅ Business logic workflow
    const processedData = await this.processBusinessLogic(input);
    
    // ✅ Data persistence (delegate to data layer)
    const result = await this.dataRepository.save(processedData);
    
    // ✅ Business event (optional)
    await this.publishBusinessEvent(result);
    
    return this.transformToBusinessResult(result);
  }

  private validateBusinessRules(input: BusinessInput): void {
    // ✅ Domain-specific validation
    if (input.amount <= 0) {
      throw new BusinessLogicException(
        'Amount must be positive',
        'INVALID_AMOUNT'
      );
    }
    
    if (input.items.length > 50) {
      throw new BusinessLogicException(
        'Maximum 50 items allowed',
        'TOO_MANY_ITEMS'
      );
    }
  }

  private async processBusinessLogic(input: BusinessInput): Promise<ProcessedData> {
    // ✅ Pure business logic - no external dependencies
    const calculations = this.performCalculations(input);
    const recommendations = await this.generateRecommendations(calculations);
    
    return {
      ...calculations,
      recommendations,
      processedAt: new Date(),
    };
  }

  private performCalculations(input: BusinessInput): CalculationResult {
    // ✅ Pure functions for business calculations
    return {
      total: input.items.reduce((sum, item) => sum + item.value, 0),
      average: input.items.length > 0 
        ? input.items.reduce((sum, item) => sum + item.value, 0) / input.items.length 
        : 0,
      weightedScore: this.calculateWeightedScore(input.items),
    };
  }
}
```

### Business Exception Handling
```typescript
// Custom business exceptions
export class BusinessLogicException extends BaseException {
  constructor(
    message: string,
    errorCode: string,
    details?: string[],
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, statusCode, 'BusinessLogicError', errorCode, details);
  }
}

export class DomainValidationException extends BusinessLogicException {
  constructor(field: string, value: any, constraint: string) {
    super(
      `Domain validation failed for ${field}`,
      'DOMAIN_VALIDATION_FAILED',
      [`Field: ${field}`, `Value: ${value}`, `Constraint: ${constraint}`],
    );
  }
}

// Usage in business services
private validateBusinessConstraints(data: BusinessData): void {
  if (data.endDate <= data.startDate) {
    throw new DomainValidationException(
      'endDate',
      data.endDate,
      'Must be after startDate'
    );
  }
}
```

### Domain Entity Patterns
```typescript
// Value objects for business logic
export class Coordinate {
  constructor(
    private readonly lat: number,
    private readonly lng: number,
  ) {
    this.validateCoordinates(lat, lng);
  }

  private validateCoordinates(lat: number, lng: number): void {
    if (lat < -90 || lat > 90) {
      throw new DomainValidationException('latitude', lat, 'Must be between -90 and 90');
    }
    if (lng < -180 || lng > 180) {
      throw new DomainValidationException('longitude', lng, 'Must be between -180 and 180');
    }
  }

  distanceTo(other: Coordinate): number {
    // ✅ Pure domain calculation
    const R = 6371000; // Earth radius in meters
    const φ1 = (this.lat * Math.PI) / 180;
    const φ2 = (other.lat * Math.PI) / 180;
    // ... haversine formula implementation
    return distance;
  }

  isWithinRadius(center: Coordinate, radiusMeters: number): boolean {
    return this.distanceTo(center) <= radiusMeters;
  }
}

// Domain entities with business logic
export class Location {
  constructor(
    private readonly coordinate: Coordinate,
    private readonly address: string,
    private readonly metadata?: LocationMetadata,
  ) {}

  findNearbyLocations(locations: Location[], radiusMeters: number): Location[] {
    return locations.filter(location => 
      this.coordinate.isWithinRadius(location.coordinate, radiusMeters)
    );
  }

  calculateCenterWith(otherLocations: Location[]): Coordinate {
    const allCoordinates = [this.coordinate, ...otherLocations.map(l => l.coordinate)];
    return Coordinate.calculateCenter(allCoordinates);
  }
}
```

---

## 💾 Data Access Layer Implementation

### Repository Pattern
```typescript
// Abstract repository interface (business layer defines contract)
export abstract class LocationRepository {
  abstract findByAddress(address: string): Promise<LocationData | null>;
  abstract save(location: LocationData): Promise<LocationData>;
  abstract findNearby(coordinate: Coordinate, radiusMeters: number): Promise<LocationData[]>;
}

// Concrete implementation (data access layer)
@Injectable()
export class ExternalLocationRepository implements LocationRepository {
  private readonly logger = new Logger(ExternalLocationRepository.name);

  constructor(
    private readonly kakaoClient: AxiosInstance,
    private readonly naverClient: AxiosInstance,
    private readonly cacheService: CacheService,
  ) {}

  async findByAddress(address: string): Promise<LocationData | null> {
    // ✅ Caching strategy (data access concern)
    const cacheKey = `location:${address}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for address: ${address}`);
      return cached;
    }

    try {
      // ✅ Primary external service
      const result = await this.geocodeWithKakao(address);
      await this.cacheService.set(cacheKey, result, 3600); // 1 hour TTL
      return result;
    } catch (kakaoError) {
      this.logger.warn(`Kakao failed, trying Naver: ${kakaoError.message}`);
      
      try {
        // ✅ Fallback external service
        const result = await this.geocodeWithNaver(address);
        await this.cacheService.set(cacheKey, result, 1800); // 30 min TTL for fallback
        return result;
      } catch (naverError) {
        this.logger.error(`All geocoding services failed for: ${address}`);
        throw new ExternalServiceException(
          'Geocoding Services',
          'All geocoding services are unavailable'
        );
      }
    }
  }

  private async geocodeWithKakao(address: string): Promise<LocationData> {
    // ✅ External API integration
    const response = await this.kakaoClient.get('/search/address.json', {
      params: { query: address, analyze_type: 'similar', size: 1 },
      timeout: 5000,
    });

    // ✅ Data transformation (external format → internal format)
    return this.transformKakaoResponse(response.data, address);
  }

  private transformKakaoResponse(data: any, originalAddress: string): LocationData {
    const documents = data?.documents;
    if (!documents || documents.length === 0) {
      throw new ExternalServiceException(
        'Kakao Maps API',
        `No results found for address: ${originalAddress}`
      );
    }

    const result = documents[0];
    return {
      originalAddress,
      formattedAddress: result.address_name || result.road_address?.address_name,
      coordinate: new Coordinate(parseFloat(result.y), parseFloat(result.x)),
      accuracy: result.road_address ? 'ROAD_ADDRESS' : 'LAND_LOT',
      source: 'kakao',
      retrievedAt: new Date(),
    };
  }
}
```

### External Client Configuration
```typescript
// Factory for external clients
@Injectable()
export class ExternalClientFactory {
  constructor(private readonly configService: ConfigService) {}

  createKakaoClient(): AxiosInstance {
    const config = this.configService.get('kakao');
    
    const client = axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local',
      timeout: 10000,
      headers: {
        'Authorization': `KakaoAK ${config.restApiKey}`,
        'User-Agent': 'hackerton-backend/1.0.0',
      },
    });

    // ✅ Request/response interceptors for logging and error handling
    client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Kakao API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Kakao API Request Error:', error);
        return Promise.reject(error);
      }
    );

    client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Kakao API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        const message = error.response?.data?.errorMessage || error.message;
        this.logger.error(`Kakao API Error: ${message}`);
        
        // ✅ Transform external errors to internal exceptions
        throw new ExternalServiceException('Kakao Maps API', message);
      }
    );

    return client;
  }
}
```

### Caching Strategy
```typescript
@Injectable()
export class LocationCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_SECONDS = 3600; // 1 hour

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  async set<T>(key: string, data: T, ttlSeconds: number = this.TTL_SECONDS): Promise<void> {
    const entry: CacheEntry = {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    };
    
    this.cache.set(key, entry);
  }

  async invalidate(pattern: string): Promise<void> {
    const keysToDelete = Array.from(this.cache.keys())
      .filter(key => key.includes(pattern));
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}
```

---

## 🔧 Module Configuration Patterns

### Feature Module Structure
```typescript
@Module({
  imports: [
    // ✅ External dependencies
    ConfigModule.forFeature(resourceConfig),
    CacheModule.register({
      ttl: 3600,
      max: 1000,
    }),
  ],
  controllers: [
    // 📱 Presentation Layer
    ResourceController,
  ],
  providers: [
    // 🏢 Business Layer
    ResourceService,
    ResourceBusinessLogic,
    
    // 💾 Data Access Layer  
    {
      provide: 'ResourceRepository',
      useClass: ExternalResourceRepository,
    },
    {
      provide: 'ExternalClient',
      useFactory: (factory: ExternalClientFactory) => factory.createClient(),
      inject: [ExternalClientFactory],
    },
    
    // Cross-cutting concerns
    ExternalClientFactory,
    ResourceCacheService,
  ],
  exports: [
    // ✅ Only export business services to other modules
    ResourceService,
  ],
})
export class ResourceModule {}
```

### Configuration Management
```typescript
// Environment-specific configuration
export const databaseConfig = registerAs('database', () => ({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'hackerton',
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
}));

// Type-safe configuration access
@Injectable()
export class DatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private readonly dbConfig: ConfigType<typeof databaseConfig>,
  ) {}

  getConnectionOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      // ... other options
    };
  }
}
```

---

## 🧪 Testing Strategies by Layer

### Presentation Layer Tests
```typescript
describe('ResourceController', () => {
  let controller: ResourceController;
  let service: ResourceService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ResourceController],
      providers: [
        {
          provide: ResourceService,
          useValue: {
            processResource: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ResourceController>(ResourceController);
    service = module.get<ResourceService>(ResourceService);
  });

  describe('POST /resource', () => {
    it('should validate input and delegate to service', async () => {
      // Arrange
      const request: CreateResourceRequestDto = {
        name: 'Test Resource',
        items: ['item1', 'item2'],
      };
      const expectedResult = { id: '123', name: 'Test Resource' };
      
      jest.spyOn(service, 'processResource').mockResolvedValue(expectedResult);

      // Act
      const result = await controller.createResource(request);

      // Assert
      expect(service.processResource).toHaveBeenCalledWith(request);
      expect(result).toEqual({
        success: true,
        data: expectedResult,
        timestamp: expect.any(String),
      });
    });

    it('should handle validation errors', async () => {
      // Test validation error scenarios
    });
  });
});
```

### Business Layer Tests
```typescript
describe('ResourceService', () => {
  let service: ResourceService;
  let repository: jest.Mocked<ResourceRepository>;

  beforeEach(async () => {
    const mockRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByCondition: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ResourceService,
        {
          provide: 'ResourceRepository',
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ResourceService>(ResourceService);
    repository = module.get('ResourceRepository');
  });

  describe('processResource', () => {
    it('should apply business logic correctly', async () => {
      // Arrange
      const input = {
        items: [{ value: 10 }, { value: 20 }],
        factor: 2,
      };
      const expectedCalculation = { total: 30, weighted: 60 };

      repository.save.mockResolvedValue({ id: '123', ...expectedCalculation });

      // Act
      const result = await service.processResource(input);

      // Assert - Test business logic without external dependencies
      expect(result.calculations).toEqual(expectedCalculation);
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining(expectedCalculation)
      );
    });

    it('should enforce business rules', async () => {
      // Test business validation scenarios
      const invalidInput = { items: [], factor: -1 };

      await expect(service.processResource(invalidInput))
        .rejects
        .toThrow(BusinessLogicException);
    });
  });
});
```

### Data Access Layer Tests
```typescript
describe('ExternalResourceRepository', () => {
  let repository: ExternalResourceRepository;
  let mockClient: jest.Mocked<AxiosInstance>;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
    } as any;

    const mockCache = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        ExternalResourceRepository,
        { provide: 'ExternalClient', useValue: mockClient },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    repository = module.get<ExternalResourceRepository>(ExternalResourceRepository);
    cacheService = module.get(CacheService);
  });

  describe('findByAddress', () => {
    it('should return cached result if available', async () => {
      // Arrange
      const address = 'test address';
      const cachedResult = { address, coordinate: { lat: 1, lng: 2 } };
      
      cacheService.get.mockResolvedValue(cachedResult);

      // Act
      const result = await repository.findByAddress(address);

      // Assert
      expect(result).toEqual(cachedResult);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should handle external service failures', async () => {
      // Test fallback mechanisms and error handling
      cacheService.get.mockResolvedValue(null);
      mockClient.get.mockRejectedValue(new Error('Service unavailable'));

      await expect(repository.findByAddress('test'))
        .rejects
        .toThrow(ExternalServiceException);
    });
  });
});
```

---

## 📊 Code Quality Metrics

### Architecture Compliance Checks
```typescript
// Architecture test to enforce layer boundaries
describe('Architecture Compliance', () => {
  it('should not have controllers depending on data access layer', () => {
    // Use tools like dependency-cruiser or custom checks
    const controllers = getAllControllerFiles();
    const dataAccessImports = scanForDataAccessImports(controllers);
    
    expect(dataAccessImports).toHaveLength(0);
  });

  it('should not have data access layer depending on presentation layer', () => {
    const repositories = getAllRepositoryFiles();
    const presentationImports = scanForPresentationImports(repositories);
    
    expect(presentationImports).toHaveLength(0);
  });
});

// Dependency direction enforcement
function scanForDataAccessImports(files: string[]): string[] {
  return files.filter(file => {
    const content = readFileSync(file, 'utf8');
    return /import.*from.*repositories|clients|data/.test(content);
  });
}
```

### Performance Guidelines
```typescript
// Service performance monitoring
@Injectable()
export class PerformanceMonitoringService {
  private readonly metrics = new Map<string, OperationMetrics>();

  trackOperation<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
    const startTime = process.hrtime.bigint();
    
    return operation()
      .then(result => {
        this.recordMetrics(operationName, startTime, true);
        return result;
      })
      .catch(error => {
        this.recordMetrics(operationName, startTime, false);
        throw error;
      });
  }

  private recordMetrics(operation: string, startTime: bigint, success: boolean): void {
    const duration = Number(process.hrtime.bigint() - startTime) / 1_000_000; // ms
    
    const existing = this.metrics.get(operation) || {
      totalCalls: 0,
      successfulCalls: 0,
      totalDuration: 0,
      avgDuration: 0,
    };

    existing.totalCalls++;
    existing.totalDuration += duration;
    existing.avgDuration = existing.totalDuration / existing.totalCalls;
    
    if (success) {
      existing.successfulCalls++;
    }

    this.metrics.set(operation, existing);
  }
}
```

---

## 🚀 Deployment & Production Considerations

### Environment Configuration
```typescript
// Production-ready configuration validation
export const appConfig = registerAs('app', () => {
  const config = {
    port: parseInt(process.env.PORT, 10) || 3000,
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // External service configurations
    kakao: {
      apiKey: process.env.KAKAO_API_KEY,
      timeout: parseInt(process.env.KAKAO_TIMEOUT, 10) || 5000,
    },
    
    naver: {
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
      timeout: parseInt(process.env.NAVER_TIMEOUT, 10) || 5000,
    },
  };

  // Validate required configuration
  if (!config.kakao.apiKey) {
    throw new Error('KAKAO_API_KEY is required');
  }
  
  if (!config.naver.clientId || !config.naver.clientSecret) {
    throw new Error('Naver API credentials are required');
  }

  return config;
});
```

### Health Checks by Layer
```typescript
@Injectable()
export class HealthCheckService {
  constructor(
    private readonly businessService: BusinessService,
    private readonly dataRepository: DataRepository,
  ) {}

  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return {
      presentation: await this.checkPresentationLayer(),
      business: await this.checkBusinessLayer(), 
      dataAccess: await this.checkDataAccessLayer(),
    };
  }

  private async checkPresentationLayer(): Promise<LayerHealth> {
    // Check if controllers are responsive
    return { status: 'ok', details: 'Controllers operational' };
  }

  private async checkBusinessLayer(): Promise<LayerHealth> {
    try {
      // Test business logic with minimal input
      await this.businessService.healthCheck();
      return { status: 'ok', details: 'Business services operational' };
    } catch (error) {
      return { 
        status: 'error', 
        details: `Business layer error: ${error.message}` 
      };
    }
  }

  private async checkDataAccessLayer(): Promise<LayerHealth> {
    try {
      // Test external service connectivity
      await this.dataRepository.healthCheck();
      return { status: 'ok', details: 'External services accessible' };
    } catch (error) {
      return { 
        status: 'error', 
        details: `Data access error: ${error.message}` 
      };
    }
  }
}
```

---

This implementation guide provides practical patterns and examples for maintaining clean 3-layered architecture in the Hackerton backend system. Follow these patterns to ensure architectural consistency and maintainability.