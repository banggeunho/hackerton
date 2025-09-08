# DTO Implementation

This directory contains Data Transfer Object (DTO) classes that provide type-safe request/response validation for the Hackerton API.

## Features

- **Automatic Validation**: All DTOs use `class-validator` decorators for request validation
- **Type Safety**: Full TypeScript type safety with proper type declarations  
- **Swagger Integration**: Complete API documentation with `@nestjs/swagger` decorators
- **Input Sanitization**: Automatic trimming and transformation of string inputs
- **Custom Error Handling**: Structured validation error responses

## Usage

### Basic Chat Request

```typescript
POST /bedrock/chat
Content-Type: application/json

{
  "prompt": "Hello, how are you?",
  "systemPrompt": "You are a helpful assistant"
}
```

**Response:**
```typescript
{
  "success": true,
  "response": "Hello! I'm doing well, thank you for asking. How can I help you today?",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Chat with Context Request

```typescript
POST /bedrock/chat-with-context
Content-Type: application/json

{
  "prompt": "What is the main topic?",
  "context": [
    "Document content about AI technology...",
    "Additional context about machine learning..."
  ],
  "systemPrompt": "You are a technical analyst"
}
```

### Validation Examples

**Invalid Request (empty prompt):**
```typescript
POST /bedrock/chat
{
  "prompt": "",
  "systemPrompt": "test"
}
```

**Response:**
```typescript
{
  "success": false,
  "error": "Validation failed",
  "details": [
    "Prompt cannot be empty"
  ],
  "timestamp": "2024-01-01T12:00:00.000Z",
  "statusCode": 400
}
```

**Invalid Request (extra fields):**
```typescript
POST /bedrock/chat
{
  "prompt": "Hello",
  "invalidField": "this will be stripped",
  "systemPrompt": "test"
}
```
*The `invalidField` will be automatically removed due to `whitelist: true`*

## DTO Classes

### Base DTOs
- `BaseResponseDto`: Common response fields (success, timestamp)
- `ErrorResponseDto`: Error response structure
- `HealthCheckDto`: Health endpoint response

### Chat DTOs
- `ChatRequestDto`: Basic chat request validation
- `ChatWithContextRequestDto`: Chat request with context array
- `ChatResponseDto`: Successful chat response
- `ChatErrorResponseDto`: Chat error response

## Validation Features

### String Validation
- **Required fields**: `@IsNotEmpty()` prevents empty strings
- **Optional fields**: `@IsOptional()` allows undefined values
- **Length limits**: Configurable min/max length constraints
- **Auto-trimming**: Leading/trailing whitespace automatically removed

### Array Validation
- **Type checking**: `@IsArray()` ensures array input
- **Non-empty**: `@ArrayNotEmpty()` prevents empty arrays  
- **Element validation**: `@IsString({ each: true })` validates each array item
- **Element trimming**: Automatic trimming of string array elements

### Global Configuration
The application uses these global validation settings:

```typescript
new ValidationPipe({
  transform: true,              // Auto-transform to DTO classes
  whitelist: true,             // Strip unknown properties
  forbidNonWhitelisted: true,  // Reject unknown properties
  transformOptions: {
    enableImplicitConversion: true
  }
})
```

## API Documentation

Swagger documentation is available at `/api` when the application is running. The DTOs provide:

- Complete request/response schemas
- Example values for all fields
- Validation constraint documentation
- Error response format specifications

## Error Handling

The custom `ValidationExceptionFilter` provides consistent error responses:

```typescript
{
  "success": false,
  "error": "Validation failed",
  "details": ["Specific validation error messages"],
  "timestamp": "ISO timestamp",
  "statusCode": 400
}
```