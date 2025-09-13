import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BaseResponseDto } from './base.dto';

/**
 * Geographic coordinates
 */
export class CoordinateDto {
  @ApiProperty({
    description: 'Latitude coordinate',
    example: 37.5665,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: 126.978,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng: number;
}

/**
 * Place recommendation request DTO
 */
export class PlaceRecommendationRequestDto {
  @ApiProperty({
    description: 'List of addresses to find center point from',
    example: ['고양시 덕양구 화정동', '수원시 장안구 율전동'],
    type: [String],
  })
  @IsArray({ message: 'Addresses must be an array' })
  @ArrayNotEmpty({ message: 'At least one address is required' })
  @IsString({ each: true, message: 'Each address must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          typeof item === 'string' ? item.trim() : item,
        )
      : value,
  )
  addresses: string[];

  @ApiPropertyOptional({
    description: 'Type of places to recommend',
    example: 'restaurant',
    enum: [
      'restaurant',
      'cafe',
      'shopping',
      'entertainment',
      'culture',
      'park',
      'accommodation',
    ],
  })
  @IsOptional()
  @IsEnum([
    'restaurant',
    'cafe',
    'shopping',
    'entertainment',
    'culture',
    'park',
    'accommodation',
  ])
  placeType?: string;

  @ApiPropertyOptional({
    description: 'Search radius in meters from center point',
    example: 2000,
    minimum: 100,
    maximum: 20000,
  })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(20000)
  @Type(() => Number)
  radiusMeters?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of recommendations to return',
    example: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  maxResults?: number;

  @ApiPropertyOptional({
    description: 'Additional preferences or requirements',
    example: '가족 친화적이고 주차가 가능한 곳',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  preferences?: string;
}

/**
 * Place information DTO
 */
export class PlaceDto {
  @ApiPropertyOptional({
    description: 'AI recommendation score from Step 4 (1-10)',
    example: 9.4,
    minimum: 1,
    maximum: 10,
  })
  aiRecommendationScore?: number;

  @ApiPropertyOptional({
    description: 'AI analysis and recommendation reasoning from Step 4',
    example:
      '대중교통 접근성이 우수하고, 두 지역에서 균등하게 접근 가능합니다.',
  })
  aiAnalysis?: string;

  @ApiProperty({
    description: 'Place name',
    example: '강남 맛집',
  })
  name: string;

  @ApiProperty({
    description: 'Place address',
    example: '서울특별시 강남구 역삼동 123-45',
  })
  address: string;

  @ApiProperty({
    description: 'Place coordinates',
    type: CoordinateDto,
  })
  @Type(() => CoordinateDto)
  coordinates: CoordinateDto;

  @ApiPropertyOptional({
    description: 'Place category',
    example: 'restaurant',
  })
  category?: string;

  @ApiPropertyOptional({
    description: 'Rating score',
    example: 4.5,
    minimum: 0,
    maximum: 5,
  })
  rating?: number;

  @ApiPropertyOptional({
    description: 'Distance from center point in meters',
    example: 850,
  })
  distanceFromCenter?: number;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '02-1234-5678',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Place URL or website',
    example: 'https://example.com',
  })
  url?: string;

  @ApiPropertyOptional({
    description: 'AI recommendation reason',
    example: '중심 지점에서 가깝고 평점이 높은 가족 친화적인 레스토랑입니다.',
  })
  recommendationReason?: string;

  @ApiPropertyOptional({
    description: 'Place description or additional information',
    example: '맛있는 한식당으로 유명한 곳입니다.',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Data source (kakao, naver, etc.)',
    example: 'naver',
  })
  source?: string;

  @ApiPropertyOptional({
    description: 'Road address (도로명 주소)',
    example: '서울특별시 강남구 테헤란로 123',
  })
  roadAddress?: string;

  @ApiPropertyOptional({
    description: 'Google Maps distance information with driving time',
    type: 'object',
    properties: {
      meters: { type: 'number', example: 1250 },
      text: { type: 'string', example: '1.3 km' },
      durationSeconds: { type: 'number', example: 180 },
      durationText: { type: 'string', example: '3분' },
    },
  })
  googleMapsDistance?: {
    meters: number;
    text: string;
    durationSeconds: number;
    durationText: string;
  };

  @ApiPropertyOptional({
    description: 'Public transportation accessibility data from Step 3',
    type: 'object',
    properties: {
      averageTransitTime: { type: 'string', example: '18분' },
      accessibilityScore: { type: 'number', example: 9.2 },
      fromAddresses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            origin: { type: 'string', example: '서울특별시 강남구 역삼동' },
            transitTime: { type: 'string', example: '15분' },
            transitDistance: { type: 'string', example: '3.2km' },
            transitMode: { type: 'string', example: '지하철 + 도보' },
          },
        },
      },
    },
  })
  transportationAccessibility?: {
    averageTransitTime: string;
    accessibilityScore: number;
    calculationMethod?: string;
    fromAddresses: Array<{
      origin: string;
      transitTime: string;
      transitDistance: string;
      transitMode: string;
      durationSeconds?: number;
      distanceMeters?: number;
    }>;
  };

  // Enhanced Google Places API data fields
  @ApiPropertyOptional({
    description: 'Google Place ID for detailed information',
    example: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  })
  googlePlaceId?: string;

  @ApiPropertyOptional({
    description: 'Business status from Google Places',
    example: 'OPERATIONAL',
  })
  businessStatus?: string;

  @ApiPropertyOptional({
    description: 'Price level (0-4) from Google Places',
    example: 2,
    minimum: 0,
    maximum: 4,
  })
  priceLevel?: number;

  @ApiPropertyOptional({
    description: 'Total number of user ratings',
    example: 1250,
  })
  userRatingsTotal?: number;

  @ApiPropertyOptional({
    description: 'Opening hours information',
    type: 'object',
    properties: {
      openNow: { type: 'boolean', example: true },
      weekdayText: {
        type: 'array',
        items: { type: 'string' },
        example: ['월요일: 09:00~21:00', '화요일: 09:00~21:00'],
      },
    },
  })
  openingHours?: {
    openNow: boolean;
    weekdayText?: string[];
  };

  @ApiPropertyOptional({
    description: 'Place photos from Google Places with usable URLs',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        photoReference: { type: 'string' },
        height: { type: 'number' },
        width: { type: 'number' },
        url: {
          type: 'string',
          example:
            'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=...&key=...',
        },
      },
    },
  })
  photos?: Array<{
    photoReference: string;
    height: number;
    width: number;
    url: string;
  }>;
}

/**
 * Center point calculation result
 */
export class CenterPointDto {
  @ApiProperty({
    description: 'Calculated center coordinates',
    type: CoordinateDto,
  })
  @Type(() => CoordinateDto)
  coordinates: CoordinateDto;

  @ApiProperty({
    description: 'Center point address (approximate)',
    example: '서울특별시 강남구 역삼동 일대',
  })
  address: string;

  @ApiProperty({
    description: 'Number of input addresses used for calculation',
    example: 3,
  })
  addressCount: number;
}

/**
 * Place recommendation response DTO
 */
export class PlaceRecommendationResponseDto extends BaseResponseDto {
  @ApiProperty({
    description: 'Calculated center point from input addresses',
    type: CenterPointDto,
  })
  @Type(() => CenterPointDto)
  centerPoint: CenterPointDto;

  @ApiProperty({
    description: 'List of recommended places',
    type: [PlaceDto],
  })
  @Type(() => PlaceDto)
  recommendations: PlaceDto[];

  @ApiProperty({
    description: 'Search parameters used',
  })
  searchParams: {
    placeType?: string;
    radiusMeters: number;
    maxResults: number;
    preferences?: string;
  };

  @ApiPropertyOptional({
    description: 'Distance matrix analysis summary from Step 3',
    type: 'object',
    properties: {
      analysisComplete: { type: 'boolean', example: true },
      averageAccessibilityScore: { type: 'number', example: 8.7 },
      bestAccessibilityLocation: { type: 'string', example: '강남 맛집' },
      transitAnalysisSummary: {
        type: 'object',
        properties: {
          totalCalculations: { type: 'number', example: 20 },
          averageTransitTime: { type: 'string', example: '19.5분' },
          optimalLocation: { type: 'string', example: '중심지 근처' },
        },
      },
    },
  })
  distanceMatrix?: {
    analysisComplete: boolean;
    averageAccessibilityScore: number;
    bestAccessibilityLocation: string;
    transitAnalysisSummary: {
      totalCalculations: number;
      averageTransitTime: string;
      optimalLocation: string;
    };
  };

  @ApiProperty({
    description: 'Success flag',
    example: true,
  })
  declare success: true;
}

/**
 * Geocoding result DTO
 */
export class GeocodingResultDto {
  @ApiProperty({
    description: 'Original address input',
    example: '서울특별시 강남구 역삼동',
  })
  originalAddress: string;

  @ApiProperty({
    description: 'Formatted address from geocoding service',
    example: '서울특별시 강남구 역삼동 123-45',
  })
  formattedAddress: string;

  @ApiProperty({
    description: 'Geocoded coordinates',
    type: CoordinateDto,
  })
  @Type(() => CoordinateDto)
  coordinates: CoordinateDto;

  @ApiPropertyOptional({
    description: 'Geocoding accuracy level',
    example: 'STREET_ADDRESS',
  })
  accuracy?: string;
}
