import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AllConfigType } from '../../../config';
import {
  CoordinateDto,
  GeocodingResultDto,
  CenterPointDto,
} from '../../../common/dto';
import {
  ExternalServiceException,
  BusinessLogicException,
} from '../../../common/exceptions';

/**
 * Location service for geocoding and geographic calculations
 * Integrates with Kakao Maps API for address-to-coordinate conversion
 */
@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly kakaoClient: AxiosInstance;
  private readonly naverClient: AxiosInstance;

  constructor(private configService: ConfigService<AllConfigType>) {
    const kakaoConfig = this.configService.get('kakao', { infer: true })!;
    const naverConfig = this.configService.get('naver', { infer: true })!;

    // Initialize Kakao Maps API client
    this.kakaoClient = axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local',
      headers: {
        Authorization: `KakaoAK ${kakaoConfig.restApiKey}`,
      },
      timeout: 10000,
    });

    // Initialize Naver Maps API client
    this.naverClient = axios.create({
      baseURL: 'https://naveropenapi.apigw.ntruss.com/map-geocode/v2',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': naverConfig.clientId,
        'X-NCP-APIGW-API-KEY': naverConfig.clientSecret,
      },
      timeout: 10000,
    });

    this.validateConfiguration();
  }

  /**
   * Validate that required API keys are configured
   */
  private validateConfiguration(): void {
    const kakaoConfig = this.configService.get('kakao', { infer: true })!;
    const naverConfig = this.configService.get('naver', { infer: true })!;

    if (!kakaoConfig.restApiKey) {
      this.logger.error(
        'KAKAO_REST_API_KEY environment variable is not configured',
      );
    }

    if (!naverConfig.clientId || !naverConfig.clientSecret) {
      this.logger.error(
        'NAVER_CLIENT_ID or NAVER_CLIENT_SECRET environment variables are not configured',
      );
    }
  }

  /**
   * Geocode address using Kakao Maps API
   */
  async geocodeAddressKakao(address: string): Promise<GeocodingResultDto> {
    try {
      this.logger.debug(`Geocoding address with Kakao: ${address}`);

      const response = await this.kakaoClient.get('/search/address.json', {
        params: {
          query: address,
          analyze_type: 'similar',
          size: 1,
        },
      });

      const documents = response.data?.documents;
      if (!documents || documents.length === 0) {
        throw new BusinessLogicException(
          `Address not found: ${address}`,
          'GEOCODING_FAILED',
          ['Address could not be geocoded with Kakao API'],
        );
      }

      const result = documents[0];
      const isRoadAddress = result.road_address !== null;
      const addressData = isRoadAddress ? result.road_address : result.address;

      return {
        originalAddress: address,
        formattedAddress: addressData.address_name || result.address_name,
        coordinates: {
          lat: parseFloat(result.y),
          lng: parseFloat(result.x),
        },
        accuracy: isRoadAddress ? 'ROAD_ADDRESS' : 'LAND_LOT',
      };
    } catch (error) {
      if (error instanceof BusinessLogicException) {
        throw error;
      }

      this.logger.error(
        `Kakao geocoding failed for address: ${address}`,
        error,
      );
      throw new ExternalServiceException(
        'Kakao Maps API',
        error instanceof Error ? error.message : 'Unknown geocoding error',
      );
    }
  }

  /**
   * Geocode address using Naver Maps API as fallback
   */
  async geocodeAddressNaver(address: string): Promise<GeocodingResultDto> {
    try {
      this.logger.debug(`Geocoding address with Naver: ${address}`);

      const response = await this.naverClient.get('/geocode', {
        params: {
          query: address,
          coordinate: 'latlng',
          count: 1,
        },
      });

      const addresses = response.data?.addresses;
      if (!addresses || addresses.length === 0) {
        throw new BusinessLogicException(
          `Address not found: ${address}`,
          'GEOCODING_FAILED',
          ['Address could not be geocoded with Naver API'],
        );
      }

      const result = addresses[0];

      return {
        originalAddress: address,
        formattedAddress: result.roadAddress || result.jibunAddress,
        coordinates: {
          lat: parseFloat(result.y),
          lng: parseFloat(result.x),
        },
        accuracy: result.roadAddress ? 'ROAD_ADDRESS' : 'LAND_LOT',
      };
    } catch (error) {
      if (error instanceof BusinessLogicException) {
        throw error;
      }

      this.logger.error(
        `Naver geocoding failed for address: ${address}`,
        error,
      );
      throw new ExternalServiceException(
        'Naver Maps API',
        error instanceof Error ? error.message : 'Unknown geocoding error',
      );
    }
  }

  /**
   * Geocode multiple addresses with fallback mechanism
   */
  async geocodeAddresses(addresses: string[]): Promise<GeocodingResultDto[]> {
    const results: GeocodingResultDto[] = [];

    for (const address of addresses) {
      try {
        // Try Kakao first (usually more accurate for Korean addresses)
        const result = await this.geocodeAddressKakao(address);
        results.push(result);
      } catch {
        this.logger.warn(`Kakao geocoding failed for ${address}, trying Naver`);

        try {
          // Fallback to Naver
          const result = await this.geocodeAddressNaver(address);
          results.push(result);
        } catch {
          this.logger.error(
            `All geocoding services failed for address: ${address}`,
          );
          throw new BusinessLogicException(
            `Unable to geocode address: ${address}`,
            'GEOCODING_ALL_FAILED',
            ['Both Kakao and Naver geocoding services failed'],
          );
        }
      }
    }

    return results;
  }

  /**
   * Calculate center point (centroid) from multiple coordinates
   */
  calculateCenterPoint(coordinates: CoordinateDto[]): CoordinateDto {
    if (coordinates.length === 0) {
      throw new BusinessLogicException(
        'No coordinates provided for center calculation',
        'INVALID_INPUT',
      );
    }

    if (coordinates.length === 1) {
      return coordinates[0];
    }

    // Calculate centroid using arithmetic mean
    const totalLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0);
    const totalLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0);

    return {
      lat: totalLat / coordinates.length,
      lng: totalLng / coordinates.length,
    };
  }

  /**
   * Calculate distance between two coordinates in meters (Haversine formula)
   */
  calculateDistance(coord1: CoordinateDto, coord2: CoordinateDto): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (coord1.lat * Math.PI) / 180;
    const φ2 = (coord2.lat * Math.PI) / 180;
    const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Reverse geocode coordinates to get address
   */
  async reverseGeocode(coordinates: CoordinateDto): Promise<string> {
    try {
      const response = await this.kakaoClient.get('/geo/coord2address.json', {
        params: {
          x: coordinates.lng,
          y: coordinates.lat,
          input_coord: 'WGS84',
        },
      });

      const documents = response.data?.documents;
      if (!documents || documents.length === 0) {
        return `위도 ${coordinates.lat.toFixed(4)}, 경도 ${coordinates.lng.toFixed(4)} 근처`;
      }

      const address = documents[0];
      return (
        address.road_address?.address_name ||
        address.address?.address_name ||
        `${address.address?.region_1depth_name} ${address.address?.region_2depth_name}`
      );
    } catch (error) {
      this.logger.warn(
        'Reverse geocoding failed, using coordinate format',
        error,
      );
      return `위도 ${coordinates.lat.toFixed(4)}, 경도 ${coordinates.lng.toFixed(4)} 근처`;
    }
  }

  /**
   * Get center point from addresses with reverse geocoding
   */
  async getCenterPointFromAddresses(
    addresses: string[],
  ): Promise<CenterPointDto> {
    // Geocode all addresses
    const geocodingResults = await this.geocodeAddresses(addresses);

    // Extract coordinates
    const coordinates = geocodingResults.map((result) => result.coordinates);

    // Calculate center point
    const centerCoordinates = this.calculateCenterPoint(coordinates);

    // Get readable address for center point
    const centerAddress = await this.reverseGeocode(centerCoordinates);

    return {
      coordinates: centerCoordinates,
      address: centerAddress,
      addressCount: addresses.length,
    };
  }
}
