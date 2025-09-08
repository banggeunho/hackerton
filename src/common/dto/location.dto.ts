import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
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
    example: [
      '서울특별시 강남구 역삼동',
      '서울특별시 서초구 서초동',
      '서울특별시 종로구 종로1가',
    ],
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
