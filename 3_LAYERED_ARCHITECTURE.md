# 3-Layered Architecture Design
## Hackerton NestJS Backend System

**Version**: 1.0.0  
**Date**: 2024-09-09  
**Architecture Pattern**: 3-Layered Architecture with Domain-Driven Design

---

## 🏗️ Architecture Overview

The Hackerton backend implements a **clean 3-layered architecture** that separates concerns into distinct layers, each with specific responsibilities and clear boundaries. This design promotes maintainability, testability, and scalability while adhering to SOLID principles.

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│  (Controllers, DTOs, Filters, Guards, Interceptors)        │
├─────────────────────────────────────────────────────────────┤
│                     BUSINESS LAYER                          │
│       (Services, Domain Logic, Business Rules)             │
├─────────────────────────────────────────────────────────────┤
│                  DATA ACCESS LAYER                          │
│    (Repositories, External APIs, Data Sources)             │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Layer Definitions & Responsibilities

### Layer 1: Presentation Layer (Controllers & DTOs)
**Location**: `src/modules/*/controllers/`, `src/common/dto/`

**Core Responsibilities**:
- HTTP request/response handling
- Input validation and sanitization  
- Data transformation (serialization/deserialization)
- Authentication and authorization
- API documentation (OpenAPI/Swagger)
- Exception handling and error formatting

**Key Components**:
- **Controllers**: Route handlers and HTTP logic
- **DTOs**: Data transfer objects with validation
- **Filters**: Global exception handling
- **Guards**: Authentication/authorization
- **Interceptors**: Request/response transformation

**Current Implementation**:
```typescript
// Example: BedrockController (Presentation Layer)
@ApiTags('bedrock')
@Controller('bedrock')
export class BedrockController {
  constructor(private readonly bedrockService: BedrockService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI model' })
  async chat(@Body() request: ChatRequestDto): Promise<ChatResponseDto> {
    // Presentation layer: HTTP handling, validation, response formatting
    const { prompt, systemPrompt } = request;
    const response = await this.bedrockService.generateResponse(prompt, systemPrompt);
    
    return {
      success: true,
      response,
      timestamp: new Date().toISOString(),
    };
  }
}
```

### Layer 2: Business Layer (Services & Domain Logic)
**Location**: `src/modules/*/services/`, `src/modules/*/*.service.ts`

**Core Responsibilities**:
- Business logic implementation
- Domain rules enforcement
- Service orchestration
- Transaction management
- Business process workflows
- Domain-specific exception handling

**Key Components**:
- **Domain Services**: Core business logic
- **Application Services**: Use case orchestration  
- **Business Rules**: Domain constraints and validations
- **Domain Entities**: Business object models
- **Domain Events**: Business event handling

**Current Implementation**:
```typescript
// Example: LocationService (Business Layer)
@Injectable()
export class LocationService {
  constructor(private configService: ConfigService<AllConfigType>) {
    // Business layer: Service configuration and initialization
  }

  async getCenterPointFromAddresses(addresses: string[]): Promise<CenterPointDto> {
    // Business logic: Address processing, geocoding, center calculation
    const geocodingResults = await this.geocodeAddresses(addresses);
    const coordinates = geocodingResults.map(result => result.coordinates);
    const centerCoordinates = this.calculateCenterPoint(coordinates);
    const centerAddress = await this.reverseGeocode(centerCoordinates);
    
    return {
      coordinates: centerCoordinates,
      address: centerAddress,
      addressCount: addresses.length,
    };
  }

  calculateCenterPoint(coordinates: CoordinateDto[]): CoordinateDto {
    // Pure business logic: Mathematical calculation
    if (coordinates.length === 0) {
      throw new BusinessLogicException('No coordinates provided');
    }
    
    const totalLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
    const totalLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);
    
    return {
      lat: totalLat / coordinates.length,
      lng: totalLng / coordinates.length,
    };
  }
}
```

### Layer 3: Data Access Layer (External Services & Data Sources)
**Location**: `src/modules/*/repositories/`, `src/common/clients/`, external API integrations

**Core Responsibilities**:
- External API integration
- Database operations (when implemented)
- Data persistence and retrieval
- Caching mechanisms
- External service abstraction
- Data source configuration

**Key Components**:
- **Repositories**: Data access patterns
- **External Clients**: Third-party API integration
- **Data Mappers**: Entity-to-DTO conversion
- **Connection Managers**: Database/API connections
- **Cache Providers**: Performance optimization

**Current Implementation**:
```typescript
// Example: External API Integration (Data Access Layer)
@Injectable()
export class LocationService {
  private readonly kakaoClient: AxiosInstance;
  private readonly naverClient: AxiosInstance;

  async geocodeAddressKakao(address: string): Promise<GeocodingResultDto> {
    // Data access: External API call to Kakao Maps
    const response = await this.kakaoClient.get('/search/address.json', {
      params: { query: address, analyze_type: 'similar', size: 1 }
    });

    // Data mapping: Transform external API response to internal DTO
    const documents = response.data?.documents;
    if (!documents || documents.length === 0) {
      throw new BusinessLogicException(`Address not found: ${address}`);
    }

    const result = documents[0];
    return {
      originalAddress: address,
      formattedAddress: result.address_name,
      coordinates: { lat: parseFloat(result.y), lng: parseFloat(result.x) },
      accuracy: result.road_address ? 'ROAD_ADDRESS' : 'LAND_LOT',
    };
  }
}
```

## 📊 Layer Interaction Matrix

| From Layer → To Layer | Allowed | Pattern | Example |
|----------------------|---------|---------|---------|
| **Presentation → Business** | ✅ | Direct injection | Controller → Service |
| **Business → Data Access** | ✅ | Repository pattern | Service → External API |
| **Presentation → Data Access** | ❌ | **FORBIDDEN** | Controller should not directly access data |
| **Business → Presentation** | ❌ | **FORBIDDEN** | Service should not know about HTTP |
| **Data Access → Business** | ❌ | **FORBIDDEN** | Repository should not contain business logic |

### ✅ Correct Interaction Patterns
```typescript
// ✅ CORRECT: Controller → Service → External API
@Controller('location')
export class LocationController {
  constructor(private locationService: LocationService) {} // ✅ Inject business layer
  
  async recommendPlaces(@Body() request: PlaceRecommendationRequestDto) {
    return await this.locationService.getRecommendations(request); // ✅ Delegate to business
  }
}

@Injectable()
export class LocationService {
  constructor(private kakaoClient: AxiosInstance) {} // ✅ Inject data access
  
  async getRecommendations(request: PlaceRecommendationRequestDto) {
    const geocoded = await this.geocodeAddresses(request.addresses); // ✅ Use data access
    return this.calculateRecommendations(geocoded); // ✅ Business logic
  }
}
```

### ❌ Incorrect Interaction Patterns
```typescript
// ❌ WRONG: Controller directly accessing external APIs
@Controller('location')
export class LocationController {
  constructor(private kakaoClient: AxiosInstance) {} // ❌ Skip business layer
  
  async recommendPlaces(@Body() request: PlaceRecommendationRequestDto) {
    const response = await this.kakaoClient.get('/api/places'); // ❌ Data access in controller
    return { places: response.data }; // ❌ No business logic
  }
}
```

## 🔧 Implementation Guidelines

### Dependency Injection Patterns
```typescript
// Correct DI pattern for each layer
export class PresentationComponent {
  constructor(
    private readonly businessService: BusinessService,     // ✅ Business layer only
    private readonly logger: Logger,                       // ✅ Cross-cutting concern
  ) {}
}

export class BusinessService {
  constructor(
    private readonly dataRepository: DataRepository,       // ✅ Data layer only  
    private readonly configService: ConfigService,        // ✅ Cross-cutting concern
    private readonly logger: Logger,                       // ✅ Cross-cutting concern
  ) {}
}

export class DataRepository {
  constructor(
    private readonly httpClient: AxiosInstance,           // ✅ External client
    private readonly configService: ConfigService,       // ✅ Cross-cutting concern
    private readonly cacheService: CacheService,         // ✅ Cross-cutting concern
  ) {}
}
```

### Exception Handling Strategy
```typescript
// Layer-specific exception handling
export class BaseException extends HttpException {
  constructor(message: string, status: HttpStatus, errorType: string) {
    super(message, status);
    this.errorType = errorType;
  }
}

// Business layer exceptions
export class BusinessLogicException extends BaseException {
  constructor(message: string, errorCode: string, details?: string[]) {
    super(message, HttpStatus.BAD_REQUEST, 'BusinessLogicError');
  }
}

// Data layer exceptions  
export class ExternalServiceException extends BaseException {
  constructor(service: string, message: string) {
    super(`External service error: ${service} - ${message}`, 
          HttpStatus.SERVICE_UNAVAILABLE, 'ExternalServiceError');
  }
}
```

### Module Organization Pattern
```typescript
// Feature module structure following 3-layer architecture
@Module({
  controllers: [LocationController],           // Presentation layer
  providers: [
    LocationService,                          // Business layer
    PlacesService,                           // Business layer  
    NaverSearchService,                      // Data access layer
    {
      provide: 'KakaoClient',                // Data access layer
      useFactory: createKakaoClient,
      inject: [ConfigService],
    },
  ],
  exports: [LocationService],                // Export business services
})
export class LocationModule {}
```

## 📋 Directory Structure

```
src/
├── main.ts                          # Application entry point
├── app.module.ts                    # Root module
├── 
├── common/                          # Cross-cutting concerns
│   ├── dto/                         # Shared DTOs (Presentation)
│   ├── exceptions/                  # Exception hierarchy
│   ├── filters/                     # Global filters (Presentation)
│   └── guards/                      # Authentication (Presentation)
├── 
├── config/                          # Configuration module
│   ├── config.service.ts            # Configuration business logic
│   └── configuration.ts             # Environment mapping
├── 
└── modules/                         # Feature modules
    ├── bedrock/                     # AI Chat module
    │   ├── bedrock.controller.ts    # 📱 Presentation Layer
    │   ├── bedrock.service.ts       # 🏢 Business Layer  
    │   └── bedrock.module.ts        # Module definition
    │
    └── location/                    # Location module
        ├── location.controller.ts   # 📱 Presentation Layer
        ├── services/                # 🏢 Business Layer
        │   ├── location.service.ts  # Core business logic
        │   ├── places.service.ts    # Place recommendation logic
        │   └── naver-search.service.ts # 💾 Data Access Layer
        └── location.module.ts       # Module definition
```

## 🔄 Data Flow Patterns

### Request Processing Flow
```
HTTP Request
     ↓
📱 Presentation Layer
├─ Controller receives request
├─ DTO validation & transformation  
├─ Authentication/authorization
     ↓
🏢 Business Layer  
├─ Service processes business logic
├─ Domain rules enforcement
├─ Business process orchestration
     ↓
💾 Data Access Layer
├─ External API calls
├─ Data transformation
├─ Error handling & retry logic
     ↓
Response flows back up through layers
     ↓
📱 Presentation Layer
├─ Response DTO transformation
├─ HTTP status code setting
├─ Error formatting
     ↓
HTTP Response
```

### Error Propagation Flow
```
💾 Data Access Layer Error
     ↓
🏢 Business Layer  
├─ Catch external service errors
├─ Transform to business exceptions
├─ Apply business error rules
     ↓
📱 Presentation Layer
├─ Global exception filter catches
├─ Transform to HTTP error response
├─ Apply consistent error format
     ↓
Client Error Response
```

## 🚀 Benefits of This Architecture

### ✅ Advantages

**1. Separation of Concerns**
- Each layer has single, well-defined responsibility
- Changes in one layer don't affect others
- Clear boundaries reduce complexity

**2. Testability**  
- Business logic isolated from HTTP and external dependencies
- Easy to unit test each layer independently
- Mock dependencies between layers

**3. Maintainability**
- Changes to external APIs only affect data access layer
- Business rule changes isolated to business layer
- UI changes only affect presentation layer

**4. Scalability**
- Layers can be optimized independently
- Easy to introduce caching, load balancing
- Support for microservices migration

**5. Code Reusability**
- Business services can support multiple presentation interfaces
- Data access logic shared across business services
- Domain models independent of delivery mechanism

### ⚠️ Trade-offs & Considerations

**1. Complexity**
- More files and abstractions than simple approaches
- Learning curve for developers unfamiliar with layered architecture
- Potential over-engineering for simple applications

**2. Performance**
- Additional abstraction layers may introduce latency
- More objects and method calls
- Network overhead if layers are distributed

**3. Development Time**
- More upfront design and structure required
- Additional interfaces and abstractions to maintain
- Testing strategy needs to cover layer interactions

## 🎯 Implementation Checklist

### ✅ Current Implementation Status

- **Presentation Layer**: ✅ Complete
  - Controllers with proper HTTP decorators
  - Comprehensive DTO validation
  - Global exception filter
  - Swagger/OpenAPI documentation

- **Business Layer**: ✅ Well-implemented
  - Service classes with business logic
  - Domain-specific exceptions
  - Business rule enforcement
  - Service orchestration patterns

- **Data Access Layer**: ✅ Functional
  - External API integration (Kakao, Naver, AWS Bedrock)
  - Error handling and fallback mechanisms
  - Configuration-based client setup

### 🔄 Recommended Improvements

**1. Repository Pattern Enhancement**
```typescript
// Add abstract repository interfaces
export abstract class LocationRepository {
  abstract geocodeAddress(address: string): Promise<GeocodingResultDto>;
  abstract searchPlaces(criteria: SearchCriteria): Promise<PlaceDto[]>;
}

// Concrete implementations
export class KakaoLocationRepository implements LocationRepository {
  // Kakao-specific implementation
}

export class NaverLocationRepository implements LocationRepository {
  // Naver-specific implementation  
}
```

**2. Domain Entity Models**
```typescript
// Business layer domain entities
export class Location {
  constructor(
    private readonly coordinates: Coordinate,
    private readonly address: Address,
  ) {}
  
  calculateDistanceTo(other: Location): Distance {
    // Pure domain logic
  }
  
  isWithinRadius(center: Location, radius: Distance): boolean {
    // Business rule implementation
  }
}
```

**3. Use Case Services**
```typescript
// Application layer use cases
@Injectable()
export class GetPlaceRecommendationsUseCase {
  constructor(
    private locationRepository: LocationRepository,
    private placesRepository: PlacesRepository,
    private aiService: AIService,
  ) {}
  
  async execute(request: GetPlaceRecommendationsRequest): Promise<PlaceRecommendationsResponse> {
    // Orchestrate use case workflow
  }
}
```

## 📚 Best Practices & Patterns

### 1. Interface Segregation
```typescript
// Split large interfaces into smaller, focused ones
export interface GeocodingService {
  geocodeAddress(address: string): Promise<Coordinate>;
}

export interface ReverseGeocodingService {
  getAddressFromCoordinate(coordinate: Coordinate): Promise<string>;
}

export interface DistanceCalculationService {
  calculateDistance(from: Coordinate, to: Coordinate): Promise<number>;
}
```

### 2. Command Query Separation
```typescript
// Separate commands (mutations) from queries
export interface LocationQueryService {
  getCoordinates(address: string): Promise<Coordinate>;
  findPlaces(criteria: SearchCriteria): Promise<Place[]>;
}

export interface LocationCommandService {  
  cacheLocationData(location: Location): Promise<void>;
  invalidateCache(address: string): Promise<void>;
}
```

### 3. Factory Pattern for Layer Creation
```typescript
@Injectable()
export class ExternalClientFactory {
  createKakaoClient(): AxiosInstance {
    return axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local',
      headers: { Authorization: `KakaoAK ${this.apiKey}` },
    });
  }
  
  createNaverClient(): AxiosInstance {
    return axios.create({
      baseURL: 'https://naveropenapi.apigw.ntruss.com',
      headers: { 'X-NCP-APIGW-API-KEY-ID': this.clientId },
    });
  }
}
```

## 🔮 Future Enhancements

### 1. Database Integration
When adding persistent storage:
```typescript
// Data Access Layer: Database repositories
export class LocationEntity {
  id: string;
  address: string;
  coordinates: CoordinateEntity;
  createdAt: Date;
  updatedAt: Date;
}

export class LocationDatabaseRepository implements LocationRepository {
  constructor(
    @InjectRepository(LocationEntity)
    private locationRepository: Repository<LocationEntity>,
  ) {}
}
```

### 2. CQRS Pattern
For complex business logic:
```typescript
// Command side
export class CreateLocationCommand {
  constructor(public readonly address: string) {}
}

export class CreateLocationHandler {
  handle(command: CreateLocationCommand): Promise<void> {
    // Command handling logic
  }
}

// Query side  
export class FindLocationQuery {
  constructor(public readonly criteria: SearchCriteria) {}
}

export class FindLocationHandler {
  handle(query: FindLocationQuery): Promise<Location[]> {
    // Query handling logic
  }
}
```

### 3. Event-Driven Architecture
For scalable systems:
```typescript
// Domain events
export class LocationGeocodedEvent {
  constructor(
    public readonly locationId: string,
    public readonly coordinates: Coordinate,
  ) {}
}

// Event handlers
@EventHandler(LocationGeocodedEvent)
export class LocationGeocodedHandler {
  handle(event: LocationGeocodedEvent): Promise<void> {
    // Handle location geocoded event
  }
}
```

---

This 3-layered architecture provides a solid foundation for the Hackerton backend, ensuring maintainability, testability, and scalability while following industry best practices and NestJS patterns.