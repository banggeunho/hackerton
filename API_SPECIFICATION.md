# Hackerton API Specification

**Version**: 1.0.0  
**Base URL**: `http://localhost:3000`  
**Content Type**: `application/json`

## Overview

The Hackerton API is a NestJS-based backend service that provides AI-powered place recommendations and chat capabilities using AWS Bedrock integration. The API follows RESTful principles and includes comprehensive validation, error handling, and documentation.

## Architecture

### Core Modules
- **BedrockModule**: AI chat capabilities using AWS Bedrock Claude models
- **LocationModule**: Geocoding and place recommendation services
- **ConfigModule**: Environment configuration management

### Design Principles
- RESTful API design with clear resource naming
- Comprehensive input validation using class-validator
- Structured error responses with custom exception handling
- OpenAPI/Swagger documentation integration
- Service-oriented architecture with dependency injection
- Type-safe DTOs with automatic serialization

## Authentication & Security

Currently, the API operates without authentication for development purposes. Future versions should implement:
- JWT-based authentication
- API key validation
- Rate limiting
- CORS configuration

## API Endpoints

### Bedrock (AI Chat) Module

#### POST /bedrock/chat

**Description**: Basic chat with AI model

**Request Body**:
```json
{
  "prompt": "string",         // Required: User question/message (1-10000 chars)
  "systemPrompt": "string"    // Optional: AI behavior context (max 5000 chars)
}
```

**Response** (200):
```json
{
  "success": true,
  "response": "string",       // AI model response
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:
- `400`: Validation error (empty prompt, too long, etc.)
- `500`: Internal server error or Bedrock service failure

---

#### POST /bedrock/chat-with-context

**Description**: Chat with AI model using additional context documents

**Request Body**:
```json
{
  "prompt": "string",         // Required: User question/message
  "systemPrompt": "string",   // Optional: AI behavior context
  "context": ["string"]       // Required: Array of context documents
}
```

**Response** (200):
```json
{
  "success": true,
  "response": "string",       // AI model response incorporating context
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:
- `400`: Validation error (empty context array, invalid types)
- `500`: Internal server error or Bedrock service failure

---

#### GET /bedrock/health

**Description**: Health check for Bedrock service

**Response** (200):
```json
{
  "status": "ok",
  "service": "Bedrock with LangChain",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Location Module

#### POST /location/recommend-places

**Description**: Get AI-powered place recommendations from multiple addresses

**Features**:
- Geocodes multiple addresses using Kakao/Naver APIs
- Calculates optimal center point
- Searches for places around the center
- Uses AI (AWS Bedrock) for intelligent recommendations
- Supports various place types and user preferences

**Request Body**:
```json
{
  "addresses": ["string"],    // Required: 1-20 addresses
  "placeType": "string",      // Optional: restaurant|cafe|shopping|entertainment|culture|park|accommodation
  "radiusMeters": 2000,       // Optional: 100-20000 meters (default: 2000)
  "maxResults": 10,           // Optional: 1-50 results (default: 10)
  "preferences": "string"     // Optional: Additional requirements (max 500 chars)
}
```

**Response** (200):
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "centerPoint": {
    "coordinates": {
      "lat": 37.5665,
      "lng": 126.978
    },
    "address": "서울특별시 강남구 역삼동 일대",
    "addressCount": 3
  },
  "recommendations": [
    {
      "name": "강남 맛집",
      "address": "서울특별시 강남구 역삼동 123-45",
      "coordinates": {
        "lat": 37.5665,
        "lng": 126.978
      },
      "category": "restaurant",
      "rating": 4.5,
      "distanceFromCenter": 850,
      "phone": "02-1234-5678",
      "url": "https://example.com",
      "recommendationReason": "중심 지점에서 가깝고 평점이 높은 가족 친화적인 레스토랑입니다.",
      "description": "맛있는 한식당으로 유명한 곳입니다.",
      "source": "naver",
      "roadAddress": "서울특별시 강남구 테헤란로 123"
    }
  ],
  "searchParams": {
    "placeType": "restaurant",
    "radiusMeters": 2000,
    "maxResults": 10,
    "preferences": "가족 친화적이고 주차가 가능한 곳"
  }
}
```

**Error Responses**:
- `400`: Invalid input (empty addresses, too many addresses, validation errors)
- `503`: External API service unavailable

---

#### POST /location/geocode

**Description**: Convert addresses to geographic coordinates

**Request Body**:
```json
{
  "addresses": ["string"]     // Required: Array of addresses to geocode
}
```

**Response** (200):
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "results": [
    {
      "originalAddress": "서울특별시 강남구 역삼동",
      "formattedAddress": "서울특별시 강남구 역삼동 123-45",
      "coordinates": {
        "lat": 37.5665,
        "lng": 126.978
      },
      "accuracy": "STREET_ADDRESS"
    }
  ]
}
```

**Error Responses**:
- `400`: Invalid addresses or validation error

---

#### POST /location/center-point

**Description**: Calculate center point from multiple addresses

**Request Body**:
```json
{
  "addresses": ["string"]     // Required: Array of addresses
}
```

**Response** (200):
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "centerPoint": {
    "coordinates": {
      "lat": 37.5665,
      "lng": 126.978
    },
    "address": "서울특별시 강남구 역삼동 일대",
    "addressCount": 3
  }
}
```

**Error Responses**:
- `400`: Invalid addresses

## Data Models

### Base Response Structure
All API responses extend the base structure:

```json
{
  "success": boolean,         // Indicates operation success
  "timestamp": "string"       // ISO 8601 timestamp
}
```

### Coordinate System
All coordinates use WGS84 decimal degrees:

```json
{
  "lat": number,             // Latitude (-90 to 90)
  "lng": number              // Longitude (-180 to 180)
}
```

### Error Response Format
All error responses follow this structure:

```json
{
  "success": false,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Detailed error description",
  "errorCode": "BUSINESS_ERROR_CODE",
  "details": ["Additional error details"]
}
```

## Error Handling

### Business Logic Exceptions
- **EMPTY_ADDRESSES**: No addresses provided
- **TOO_MANY_ADDRESSES**: More than 20 addresses in request
- **PROCESSING_FAILED**: General processing failure
- **GEOCODING_FAILED**: Address geocoding failure
- **CENTER_POINT_FAILED**: Center point calculation failure

### External Service Exceptions
- **Bedrock Service**: AWS Bedrock API failures
- **Geocoding Services**: Kakao/Naver API failures

### Validation Errors
- String length validation
- Number range validation
- Array size validation
- Data type validation

## Rate Limiting & Performance

### Current Limitations
- **Address Count**: Maximum 20 addresses per request
- **Search Radius**: 100m to 20km
- **Results**: Maximum 50 places per request
- **Text Length**: Prompts max 10,000 chars, context max 5,000 chars

### Performance Considerations
- Geocoding operations are cached
- AI responses use streaming when possible
- Parallel processing for multiple address geocoding
- Request logging for performance monitoring

## Environment Configuration

Required environment variables:

```env
# AWS Bedrock Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Kakao API (for geocoding)
KAKAO_API_KEY=your_kakao_api_key

# Naver API (for places search)
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret

# Application Configuration
PORT=3000
NODE_ENV=development
```

## Usage Examples

### Chat Example
```bash
curl -X POST http://localhost:3000/bedrock/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "systemPrompt": "You are a helpful science teacher"
  }'
```

### Place Recommendation Example
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "서울특별시 강남구 역삼동",
      "서울특별시 서초구 서초동"
    ],
    "placeType": "restaurant",
    "radiusMeters": 1500,
    "maxResults": 5,
    "preferences": "가족 식사하기 좋은 곳"
  }'
```

## Future Enhancements

### Security & Authentication
- JWT authentication implementation
- API key management
- Rate limiting by user/IP
- Request validation middleware

### Features
- Real-time place availability
- User preferences persistence
- Place review aggregation
- Multi-language support

### Performance
- Redis caching layer
- Database integration
- Response compression
- CDN integration

### Monitoring
- Request/response logging
- Performance metrics
- Error tracking
- Health monitoring dashboard

## Development Guidelines

### Adding New Endpoints
1. Create DTOs in `src/common/dto/`
2. Implement controller with proper decorators
3. Add service layer with business logic
4. Include comprehensive error handling
5. Add OpenAPI documentation
6. Write unit and integration tests

### Validation Rules
- Use class-validator decorators
- Transform input data appropriately
- Provide clear error messages
- Validate business rules in services

### Error Handling Pattern
```typescript
try {
  // Business logic
} catch (error) {
  if (error instanceof CustomException) {
    throw error; // Re-throw custom exceptions
  }
  // Transform unexpected errors
  throw new BusinessLogicException('Operation failed', 'ERROR_CODE');
}
```

This API specification provides a comprehensive foundation for the Hackerton backend service, with clear documentation for current capabilities and guidance for future development.