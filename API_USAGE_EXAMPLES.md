# API Usage Examples - Location-Based AI Recommendations

## Quick Start Examples

### 1. Get Place Recommendations (Main Feature)

**Request:**
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "서울특별시 강남구 역삼동",
      "서울특별시 서초구 서초동",
      "서울특별시 종로구 종로1가"
    ],
    "placeType": "restaurant",
    "radiusMeters": 2000,
    "maxResults": 5,
    "preferences": "가족 친화적이고 주차가 가능한 곳"
  }'
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "centerPoint": {
    "coordinates": { "lat": 37.5665, "lng": 126.9780 },
    "address": "서울특별시 중구 을지로3가 일대",
    "addressCount": 3
  },
  "recommendations": [
    {
      "name": "중심가 한식당",
      "address": "서울특별시 중구 을지로3가 123-45",
      "coordinates": { "lat": 37.5662, "lng": 126.9785 },
      "category": "음식점 > 한식",
      "rating": 4.5,
      "distanceFromCenter": 450,
      "phone": "02-1234-5678",
      "url": "https://place.map.kakao.com/12345",
      "recommendationReason": "중심 지점에서 가깝고 평점이 높으며 가족 단위 고객이 많이 방문하는 곳으로 주차 공간도 충분합니다."
    }
  ],
  "searchParams": {
    "placeType": "restaurant",
    "radiusMeters": 2000,
    "maxResults": 5,
    "preferences": "가족 친화적이고 주차가 가능한 곳"
  }
}
```

### 2. Calculate Center Point Only

**Request:**
```bash
curl -X POST http://localhost:3000/location/center-point \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "서울특별시 강남구 역삼동",
      "서울특별시 서초구 서초동"
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "centerPoint": {
    "coordinates": { "lat": 37.5532, "lng": 127.0074 },
    "address": "서울특별시 강남구 역삼동 일대",
    "addressCount": 2
  }
}
```

### 3. Geocode Addresses

**Request:**
```bash
curl -X POST http://localhost:3000/location/geocode \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": ["서울특별시 강남구 역삼동"]
  }'
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "results": [
    {
      "originalAddress": "서울특별시 강남구 역삼동",
      "formattedAddress": "서울특별시 강남구 역삼동 736-1",
      "coordinates": { "lat": 37.5009, "lng": 127.0374 },
      "accuracy": "ROAD_ADDRESS"
    }
  ]
}
```

## Place Types and Categories

| Place Type | Korean | Description | Example Preferences |
|------------|--------|-------------|-------------------|
| `restaurant` | 음식점 | Restaurants and food establishments | "가족 친화적", "한식", "주차 가능" |
| `cafe` | 카페 | Coffee shops and cafes | "조용한 분위기", "와이파이", "스터디 가능" |
| `shopping` | 쇼핑 | Shopping centers and stores | "대형매장", "브랜드 매장", "할인점" |
| `entertainment` | 엔터테인먼트 | Entertainment venues | "영화관", "노래방", "게임센터" |
| `culture` | 문화시설 | Cultural facilities | "박물관", "전시회", "공연장" |
| `park` | 공원 | Parks and recreational areas | "산책로", "운동시설", "아이놀이터" |
| `accommodation` | 숙박 | Hotels and lodging | "비즈니스호텔", "펜션", "게스트하우스" |

## Advanced Usage Examples

### Example 1: Cafe Recommendations with Study Preferences

**Request:**
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "서울대학교",
      "홍익대학교",
      "연세대학교"
    ],
    "placeType": "cafe",
    "radiusMeters": 3000,
    "maxResults": 8,
    "preferences": "조용하고 스터디하기 좋은 곳, 와이파이 잘 되는 곳"
  }'
```

### Example 2: Entertainment Near Multiple Subway Stations

**Request:**
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "강남역",
      "홍대입구역",
      "신촌역"
    ],
    "placeType": "entertainment",
    "radiusMeters": 1500,
    "maxResults": 10,
    "preferences": "젊은 사람들이 많이 가는 곳, 밤늦게까지 하는 곳"
  }'
```

### Example 3: Parks Near Residential Areas

**Request:**
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "서울특별시 마포구 상암동",
      "서울특별시 강서구 화곡동",
      "서울특별시 양천구 목동"
    ],
    "placeType": "park",
    "radiusMeters": 5000,
    "maxResults": 6,
    "preferences": "아이들과 함께 가기 좋은 곳, 운동시설이 있는 곳"
  }'
```

## Error Handling Examples

### Validation Error
```bash
curl -X POST http://localhost:3000/location/recommend-places \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [],
    "placeType": "restaurant"
  }'
```

**Error Response:**
```json
{
  "success": false,
  "errorType": "BusinessLogicError",
  "message": "At least one address is required",
  "errorCode": "EMPTY_ADDRESSES",
  "statusCode": 400,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1234567890_abcdef123"
}
```

### API Service Unavailable
```json
{
  "success": false,
  "errorType": "ExternalServiceError",
  "message": "External service 'Kakao Maps API' is currently unavailable",
  "details": ["Connection timeout after 10000ms"],
  "errorCode": "SERVICE_UNAVAILABLE",
  "statusCode": 503,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req_1234567890_abcdef123"
}
```

## JavaScript/TypeScript Integration

### Using with Fetch API
```typescript
interface PlaceRecommendationRequest {
  addresses: string[];
  placeType?: string;
  radiusMeters?: number;
  maxResults?: number;
  preferences?: string;
}

async function getPlaceRecommendations(request: PlaceRecommendationRequest) {
  try {
    const response = await fetch('http://localhost:3000/location/recommend-places', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get place recommendations:', error);
    throw error;
  }
}

// Usage
const recommendations = await getPlaceRecommendations({
  addresses: ['서울역', '강남역', '홍대입구역'],
  placeType: 'restaurant',
  radiusMeters: 2000,
  maxResults: 10,
  preferences: '분위기 좋고 데이트하기 좋은 곳'
});
```

### Using with Axios
```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

async function getPlaceRecommendations(addresses: string[], preferences?: string) {
  try {
    const response = await apiClient.post('/location/recommend-places', {
      addresses,
      placeType: 'restaurant',
      radiusMeters: 2000,
      maxResults: 10,
      preferences,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('API Error:', error.response?.data);
    } else {
      console.error('Unexpected error:', error);
    }
    throw error;
  }
}
```

## Production Configuration

### Environment Variables
```bash
# Required API Keys
KAKAO_REST_API_KEY=your_kakao_rest_api_key_here
NAVER_CLIENT_ID=your_naver_client_id_here  
NAVER_CLIENT_SECRET=your_naver_client_secret_here

# AWS Bedrock (for AI recommendations)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Application Settings
NODE_ENV=production
PORT=3000
```

### Rate Limiting Considerations
- **Kakao API**: 100,000 requests per day (free tier)
- **Naver API**: 25,000 requests per day (free tier)  
- **AWS Bedrock**: Pay-per-request based on model usage

### Performance Tips
1. **Batch Requests**: Process multiple addresses in a single request
2. **Caching**: Consider caching geocoding results for frequently used addresses
3. **Fallback Handling**: The system automatically falls back to Naver if Kakao fails
4. **Timeout Management**: Default timeouts are set to 10-15 seconds per external API call

## API Documentation

Interactive API documentation is available at:
- **Development**: http://localhost:3000/api
- **Production**: https://your-domain.com/api

The Swagger UI provides:
- Complete API schema documentation
- Interactive request/response testing
- Authentication examples
- Error response formats