import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LocationService } from './services/location.service';
import { PlacesService } from './services/places.service';
import { GoogleMapsService } from './services/google-maps.service';
import {
  ErrorResponseDto,
  PlaceRecommendationRequestDto,
  PlaceRecommendationResponseDto,
} from '../../common/dto';
import {
  BusinessLogicException,
  ExternalServiceException,
} from '../../common/exceptions';

@ApiTags('location')
@Controller('location')
export class LocationController {
  private readonly logger = new Logger(LocationController.name);

  constructor(
    private readonly locationService: LocationService,
    private readonly placesService: PlacesService,
    private readonly googleMapsService: GoogleMapsService,
  ) {}

  @Post('recommend-places')
  @ApiOperation({
    summary: 'Get AI-powered place recommendations from multiple addresses',
    description: `
    This endpoint takes multiple addresses, calculates their center point, and uses AI to recommend places.
    
    Features:
    - Geocodes multiple addresses using Kakao/Naver APIs
    - Calculates optimal center point
    - Searches for places around the center
    - Uses AI (AWS Bedrock) for intelligent recommendations
    - Supports various place types and user preferences
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved place recommendations',
    type: PlaceRecommendationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description: 'External API service unavailable',
    type: ErrorResponseDto,
  })
  async recommendPlaces(
    @Body() request: PlaceRecommendationRequestDto,
  ): Promise<PlaceRecommendationResponseDto> {
    const startTime = Date.now();
    this.logger.log(
      `Processing place recommendation request for ${request.addresses.length} addresses`,
    );

    try {
      // Validate input
      if (request.addresses.length === 0) {
        throw new BusinessLogicException(
          'At least one address is required',
          'EMPTY_ADDRESSES',
        );
      }

      if (request.addresses.length > 20) {
        throw new BusinessLogicException(
          'Maximum 20 addresses allowed per request',
          'TOO_MANY_ADDRESSES',
        );
      }

      // Set default values
      const placeType = request.placeType || 'restaurant';
      const radiusMeters = request.radiusMeters || 2000;
      const maxResults = request.maxResults || 10;
      const preferences = request.preferences || '';

      this.logger.debug(
        `Request parameters: type=${placeType}, radius=${radiusMeters}m, maxResults=${maxResults}`,
      );

      // Step 1: Convert addresses to coordinates and calculate center point
      this.logger.debug(
        'Step 1: Converting addresses to coordinates and calculating center point',
      );
      const centerPoint =
        await this.locationService.getCenterPointFromAddresses(
          request.addresses,
        );

      this.logger.debug(
        `Center point calculated: ${centerPoint.address} (${centerPoint.coordinates.lat}, ${centerPoint.coordinates.lng})`,
      );

      // Steps 2-4: Search places, calculate transit distances, and get AI recommendations
      this.logger.debug(
        'Steps 2-4: Searching places, calculating transit distances, and generating AI recommendations',
      );
      const recommendations = await this.placesService.getPlaceRecommendations(
        centerPoint.coordinates,
        request.addresses,
        placeType,
        radiusMeters,
        maxResults,
        preferences,
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Place recommendation completed: ${recommendations.length} places found in ${processingTime}ms`,
      );

      // Create distance matrix analysis summary
      const distanceMatrix = {
        analysisComplete: true,
        averageAccessibilityScore:
          recommendations.length > 0
            ? recommendations.reduce(
                (sum, place) =>
                  sum +
                  (place.transportationAccessibility?.accessibilityScore || 5),
                0,
              ) / recommendations.length
            : 0,
        bestAccessibilityLocation:
          recommendations.find(
            (place) => place.transportationAccessibility?.accessibilityScore,
          )?.name || 'N/A',
        transitAnalysisSummary: {
          totalCalculations: request.addresses.length * recommendations.length,
          averageTransitTime:
            recommendations.length > 0
              ? Math.round(
                  recommendations.reduce((sum, place) => {
                    const transitTime =
                      place.transportationAccessibility?.averageTransitTime;
                    return sum + (transitTime ? parseInt(transitTime) : 20);
                  }, 0) / recommendations.length,
                ) + '분'
              : 'N/A',
          optimalLocation: '중심지 근처',
        },
      };

      // Step 5: Return structured response with 4-step algorithm results
      return {
        success: true,
        timestamp: new Date().toISOString(),
        centerPoint,
        recommendations,
        distanceMatrix,
        searchParams: {
          placeType: placeType !== 'restaurant' ? placeType : undefined,
          radiusMeters,
          maxResults,
          preferences: preferences || undefined,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Place recommendation failed after ${processingTime}ms`,
        error,
      );

      // Re-throw custom exceptions for global handler
      if (
        error instanceof BusinessLogicException ||
        error instanceof ExternalServiceException
      ) {
        throw error;
      }

      // Handle unexpected errors
      throw new BusinessLogicException(
        'Failed to process place recommendation request',
        'PROCESSING_FAILED',
        [error instanceof Error ? error.message : 'Unknown error'],
      );
    }
  }

  @Post('geocode')
  @ApiOperation({
    summary: 'Geocode multiple addresses to coordinates',
    description:
      'Convert addresses to geographic coordinates using Kakao and Naver APIs with fallback mechanism.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully geocoded addresses',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        timestamp: { type: 'string', example: '2024-01-01T12:00:00.000Z' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              originalAddress: { type: 'string' },
              formattedAddress: { type: 'string' },
              coordinates: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                },
              },
              accuracy: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid addresses or validation error',
    type: ErrorResponseDto,
  })
  async geocodeAddresses(@Body() body: { addresses: string[] }) {
    this.logger.log(`Geocoding ${body.addresses.length} addresses`);

    try {
      if (!body.addresses || body.addresses.length === 0) {
        throw new BusinessLogicException(
          'At least one address is required',
          'EMPTY_ADDRESSES',
        );
      }

      const results = await this.locationService.geocodeAddresses(
        body.addresses,
      );

      return {
        success: true,
        timestamp: new Date().toISOString(),
        results,
      };
    } catch (error) {
      this.logger.error('Geocoding failed', error);

      if (
        error instanceof BusinessLogicException ||
        error instanceof ExternalServiceException
      ) {
        throw error;
      }

      throw new BusinessLogicException(
        'Failed to geocode addresses',
        'GEOCODING_FAILED',
        [error instanceof Error ? error.message : 'Unknown error'],
      );
    }
  }

  @Post('center-point')
  @ApiOperation({
    summary: 'Calculate center point from multiple addresses',
    description:
      'Find the geographic center point (centroid) from a list of addresses.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully calculated center point',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        timestamp: { type: 'string', example: '2024-01-01T12:00:00.000Z' },
        centerPoint: {
          type: 'object',
          properties: {
            coordinates: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            address: { type: 'string' },
            addressCount: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid addresses',
    type: ErrorResponseDto,
  })
  async getCenterPoint(@Body() body: { addresses: string[] }) {
    this.logger.log(
      `Calculating center point for ${body.addresses.length} addresses`,
    );

    try {
      if (!body.addresses || body.addresses.length === 0) {
        throw new BusinessLogicException(
          'At least one address is required',
          'EMPTY_ADDRESSES',
        );
      }

      const centerPoint =
        await this.locationService.getCenterPointFromAddresses(body.addresses);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        centerPoint,
      };
    } catch (error) {
      this.logger.error('Center point calculation failed', error);

      if (
        error instanceof BusinessLogicException ||
        error instanceof ExternalServiceException
      ) {
        throw error;
      }

      throw new BusinessLogicException(
        'Failed to calculate center point',
        'CENTER_POINT_FAILED',
        [error instanceof Error ? error.message : 'Unknown error'],
      );
    }
  }

  @Get('debug-distance')
  @ApiOperation({
    summary: 'Debug Google Maps Distance Matrix API',
    description: 'Test endpoint to debug distance calculations',
  })
  async debugDistance(
    @Query('originLat') originLat: string,
    @Query('originLng') originLng: string,
    @Query('destLat') destLat: string,
    @Query('destLng') destLng: string,
  ) {
    this.logger.log(
      `Debug distance calculation from (${originLat}, ${originLng}) to (${destLat}, ${destLng})`,
    );

    try {
      const origin = { lat: parseFloat(originLat), lng: parseFloat(originLng) };
      const destination = {
        lat: parseFloat(destLat),
        lng: parseFloat(destLng),
      };

      // Test API key availability
      const apiInfo = this.googleMapsService.getApiInfo();
      this.logger.debug(`Google Maps API Info:`, apiInfo);

      // Test distance calculation
      const distances =
        await this.googleMapsService.calculateDistanceBetweenCoordinates(
          origin,
          [destination],
        );

      return {
        success: true,
        timestamp: new Date().toISOString(),
        apiInfo,
        origin,
        destination,
        distances,
        debug: {
          originString: `${origin.lat},${origin.lng}`,
          destinationString: `${destination.lat},${destination.lng}`,
        },
      };
    } catch (error) {
      this.logger.error('Debug distance calculation failed', error);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
    }
  }
}
