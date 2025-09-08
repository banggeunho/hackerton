# Global Exception Handling System

This directory contains the comprehensive exception handling system for the Hackerton API, providing consistent error responses, security-focused error management, and detailed logging.

## Architecture Overview

### Exception Filters (Order Matters)
1. **SecurityExceptionFilter** (Production) - Sanitizes errors to prevent information disclosure
2. **GlobalExceptionFilter** (Development) - Provides detailed error information for debugging
3. **ValidationExceptionFilter** (Deprecated) - Basic validation error handling

### Custom Exceptions
- **BaseException** - Abstract base class for all custom exceptions
- **BusinessLogicException** - Domain-specific validation errors
- **ResourceNotFoundException** - 404 errors with specific resource context
- **ResourceConflictException** - 409 conflict errors
- **ExternalServiceException** - External service failures (AWS Bedrock, etc.)
- **RateLimitException** - Rate limiting violations
- **AuthenticationException** - Authentication failures
- **AuthorizationException** - Authorization failures

## Features

### 🔒 Security-First Design
- **Information Disclosure Prevention**: Sensitive data automatically redacted in production
- **SQL Injection Detection**: Automatic detection and logging of SQL injection attempts
- **Request Tracking**: Secure request IDs for tracing without exposing system information
- **Header Analysis**: Monitoring of suspicious headers and potential threats

### 📊 Comprehensive Logging
- **Structured Logging**: Consistent log format across all exception types
- **Context Preservation**: Request details, user agents, IPs for security analysis
- **Environment Awareness**: Detailed logs in development, sanitized in production
- **Log Levels**: Appropriate log levels based on error severity (warn vs error)

### 🎯 Consistent API Responses
```typescript
{
  "success": false,
  "errorType": "ValidationError",
  "message": "The provided data is invalid",
  "details": ["Field 'email' is required", "Password must be at least 8 characters"],
  "errorCode": "VALIDATION_FAILED",
  "statusCode": 400,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1234567890_abcdef123",
  "path": "/api/users"
}
```

## Usage Examples

### Creating Custom Business Exceptions
```typescript
import { BusinessLogicException, ResourceNotFoundException } from '../exceptions';

// Throw business logic errors
throw new BusinessLogicException(
  'Cannot process payment for inactive account',
  'ACCOUNT_INACTIVE',
  ['Account status must be active', 'Payment processing unavailable']
);

// Throw resource not found errors
throw new ResourceNotFoundException('User', userId);
```

### External Service Integration
```typescript
import { ExternalServiceException } from '../exceptions';

try {
  const result = await externalAPI.call();
} catch (error) {
  throw new ExternalServiceException('PaymentGateway', error.message);
}
```

### Authentication & Authorization
```typescript
import { AuthenticationException, AuthorizationException } from '../exceptions';

// Authentication required
if (!token) {
  throw new AuthenticationException('Authentication token required');
}

// Insufficient permissions
if (!user.hasPermission('admin')) {
  throw new AuthorizationException('Admin permissions required');
}
```

## Configuration

### Environment-Based Behavior
The exception handling system automatically adapts based on `NODE_ENV`:

**Development Mode (`NODE_ENV !== 'production'`)**:
- Uses `GlobalExceptionFilter`
- Provides detailed error messages
- Includes stack traces
- Exposes internal error details for debugging

**Production Mode (`NODE_ENV === 'production'`)**:
- Uses `SecurityExceptionFilter`
- Sanitizes error messages
- Removes sensitive information
- Provides minimal error details to prevent information disclosure

### Security Features

#### Automatic Redaction
Sensitive patterns are automatically detected and redacted:
- Passwords, tokens, secrets, keys
- Database connection strings
- File paths and system information
- Credential information

#### SQL Injection Detection
The system automatically detects and logs potential SQL injection attempts:
```typescript
// These patterns trigger security alerts
'SELECT * FROM users WHERE id = 1; DROP TABLE users;--'
'UNION SELECT password FROM admin_users'
```

#### Header Analysis
Suspicious headers are monitored and logged:
- `x-forwarded-for` - Potential proxy abuse
- `x-real-ip` - IP spoofing attempts
- `x-originating-ip` - Source IP manipulation

## Integration with Controllers

### Before (Manual Error Handling)
```typescript
@Post('users')
async createUser(@Body() userData: CreateUserDto) {
  try {
    return await this.userService.create(userData);
  } catch (error) {
    if (error.code === 'DUPLICATE_EMAIL') {
      throw new HttpException('Email already exists', 409);
    }
    throw new HttpException('Internal server error', 500);
  }
}
```

### After (Global Exception Handling)
```typescript
@Post('users')
async createUser(@Body() userData: CreateUserDto) {
  // Service throws domain-specific exceptions
  // Global filter automatically formats and logs
  return await this.userService.create(userData);
}

// In service
async create(userData: CreateUserDto) {
  if (await this.userExists(userData.email)) {
    throw new ResourceConflictException(
      'User with this email already exists',
      'DUPLICATE_EMAIL'
    );
  }
  
  try {
    return await this.userRepository.save(userData);
  } catch (error) {
    throw new BusinessLogicException('Failed to create user');
  }
}
```

## API Documentation

### Swagger Integration
All exception types are automatically documented in Swagger with:
- Proper HTTP status codes
- Example error responses
- Error type classifications
- Response schemas

### Error Response Schema
```typescript
{
  success: false,           // Always false for errors
  errorType: string,        // Classified error type
  message: string,          // Human-readable message
  details?: string[],       // Additional error details
  errorCode?: string,       // Programmatic error code
  statusCode: number,       // HTTP status code
  timestamp: string,        // ISO timestamp
  requestId?: string,       // Request tracking ID
  path?: string            // API endpoint path
}
```

## Monitoring & Observability

### Log Structure
```json
{
  "level": "error",
  "message": "Server Error: External service unavailable",
  "method": "POST",
  "url": "/api/bedrock/chat",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "requestId": "req_1234567890_abcdef123",
  "errorType": "ExternalServiceError",
  "statusCode": 503,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "stackTrace": "Error: Service unavailable..."
}
```

### Security Event Monitoring
```json
{
  "level": "warn",
  "message": "SQL injection attempt detected in body",
  "source": "body",
  "pattern": "select.*from",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

This comprehensive exception handling system provides a robust, secure, and maintainable foundation for error management across your NestJS application.