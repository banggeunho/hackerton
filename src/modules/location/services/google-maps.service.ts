import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  PlaceDetailsRequest,
  PlaceDetailsResponse,
  PlacesNearbyRequest,
  PlacesNearbyResponse,
  TransitMode,
  TransitRoutingPreference,
  TravelMode,
  UnitSystem,
} from '@googlemaps/google-maps-services-js';
import { AllConfigType } from '../../../config';
import { CoordinateDto, PlaceDto } from '../../../common/dto';
import { ExternalServiceException } from '../../../common/exceptions';
import { RoutesClient } from '@googlemaps/routing';
import { AddressValidationClient } from '@googlemaps/addressvalidation';
import { PlacesClient } from '@googlemaps/places';

/**
 * Interface for distance calculation result
 */
export interface DistanceResult {
  originAddress: string;
  destinationAddress: string;
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
}

/**
 * Enhanced Google Places data interface with comprehensive information
 */
export interface GooglePlaceData {
  placeId: string;
  name: string;
  vicinity: string;
  formattedAddress?: string;
  coordinates: CoordinateDto;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  businessStatus?: string;
  openingHours?: {
    openNow: boolean;
    weekdayText?: string[];
  };
  photos?: Array<{
    photoReference: string;
    height: number;
    width: number;
    url: string;
  }>;
  // Enhanced details from Place Details API
  phoneNumber?: string;
  website?: string;
  popularTimes?: Array<{
    dayOfWeek: number;
    hours: Array<{
      hour: number;
      popularity: number;
    }>;
  }>;
}

/**
 * Google Maps service for distance calculations, place search, and comprehensive place data
 * Uses Google Maps Distance Matrix API and Google Places API with enhanced place information
 */
@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly googleMapsClient: Client;
  private readonly routingClient: RoutesClient;
  private readonly addressValidationClient: AddressValidationClient;
  private readonly placesClient: PlacesClient;
  private readonly apiKey: string;

  constructor(private configService: ConfigService<AllConfigType>) {
    // Get Google Maps API key from configuration
    const googleConfig = this.configService.get('google', { infer: true });
    this.apiKey =
      googleConfig?.mapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '';

    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API key not configured. Distance calculations will be unavailable.',
      );
    }

    this.googleMapsClient = new Client({});
    this.routingClient = new RoutesClient({
      apiKey: this.apiKey,
    });
    this.addressValidationClient = new AddressValidationClient({});
    this.placesClient = new PlacesClient({});
  }

  /**
   * Calculate transit time and distance between coordinates using Google Maps Distance Matrix API
   * This method specifically focuses on public transportation (TRANSIT mode)
   */
  async calculateTransitTime(
    origin: CoordinateDto,
    destinations: CoordinateDto[],
  ): Promise<DistanceResult[]> {
    if (!this.apiKey) {
      throw new ExternalServiceException(
        'Google Maps API',
        'API key not configured',
      );
    }

    if (destinations.length === 0) {
      return [];
    }

    try {
      this.logger.debug(
        `Calculating transit times from (${origin.lat}, ${origin.lng}) to ${destinations.length} destinations using official library`,
      );

      // Convert destinations to lat,lng string format for Distance Matrix API
      const destinationStrings = destinations.map(
        (dest) => `${dest.lat},${dest.lng}`,
      );

      // Use official @googlemaps/google-maps-services-js library
      const response = await this.googleMapsClient.distancematrix({
        params: {
          origins: [`${origin.lat},${origin.lng}`],
          destinations: destinationStrings,
          mode: TravelMode.transit, // Public transportation
          units: UnitSystem.metric,
          language: 'ko',
          departure_time: Math.floor(Date.now() / 1000), // Use current timestamp
          transit_mode: [
            TransitMode.bus,
            TransitMode.subway,
            TransitMode.train,
          ],
          transit_routing_preference: TransitRoutingPreference.fewer_transfers,
          key: this.apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

      this.logger.debug(
        'Distance Matrix API response:',
        JSON.stringify(response.data, null, 2),
      );

      const matrixResults: DistanceResult[] = [];

      if (response.data.status === 'OK' && response.data.rows.length > 0) {
        const elements = response.data.rows[0].elements;

        elements.forEach((element: any, index: number) => {
          if (element.status === 'OK') {
            const durationSeconds = element.duration?.value || 0;
            const durationMinutes = Math.floor(durationSeconds / 60);

            matrixResults.push({
              originAddress: `${origin.lat},${origin.lng}`,
              destinationAddress: destinationStrings[index],
              distanceMeters: element.distance?.value || 0,
              distanceText: element.distance?.text || 'N/A',
              durationSeconds,
              durationText:
                durationMinutes > 0
                  ? `${durationMinutes}분`
                  : element.duration?.text || 'N/A',
            });
          } else {
            this.logger.warn(
              `Transit calculation failed for destination ${index}: ${element.status}`,
            );
            matrixResults.push({
              originAddress: `${origin.lat},${origin.lng}`,
              destinationAddress: destinationStrings[index],
              distanceMeters: 0,
              distanceText: 'N/A',
              durationSeconds: 0,
              durationText: 'N/A',
            });
          }
        });
      } else {
        this.logger.warn(
          `Distance Matrix API failed with status: ${response.data.status}`,
        );
      }

      this.logger.debug(
        `Transit time calculation completed for ${matrixResults.length} destinations`,
      );
      return matrixResults;
    } catch (error) {
      this.logger.error('Google Maps transit time calculation failed', error);

      // Return fallback results instead of throwing to prevent server crash
      const fallbackResults: DistanceResult[] = destinations.map((dest) => ({
        originAddress: `${origin.lat},${origin.lng}`,
        destinationAddress: `${dest.lat},${dest.lng}`,
        distanceMeters: 0,
        distanceText: 'N/A',
        durationSeconds: 0,
        durationText: 'N/A',
      }));

      this.logger.warn(
        `Returning ${fallbackResults.length} fallback transit results due to API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return fallbackResults;
    }
  }

  /**
   * Calculate distance between coordinates using Google Maps Distance Matrix API
   * This method uses coordinates instead of addresses for more accurate calculations
   */
  async calculateDistanceBetweenCoordinates(
    origin: CoordinateDto,
    destinations: CoordinateDto[],
  ): Promise<DistanceResult[]> {
    if (!this.apiKey) {
      throw new ExternalServiceException(
        'Google Maps API',
        'API key not configured',
      );
    }

    if (destinations.length === 0) {
      return [];
    }

    try {
      this.logger.debug(
        `Calculating driving distances from (${origin.lat}, ${origin.lng}) to ${destinations.length} destinations using Distance Matrix API`,
      );

      // Convert destinations to lat,lng string format for Distance Matrix API
      const destinationStrings = destinations.map(
        (dest) => `${dest.lat},${dest.lng}`,
      );

      // Use Distance Matrix API instead of Routes API for better reliability
      const response = await this.googleMapsClient.distancematrix({
        params: {
          origins: [`${origin.lat},${origin.lng}`],
          destinations: destinationStrings,
          mode: TravelMode.driving, // Use driving mode for general distance calculations
          units: UnitSystem.metric,
          language: 'ko',
          avoid: [], // No restrictions
          key: this.apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

      this.logger.debug(
        'Distance Matrix API (driving) response status:',
        response.data.status,
      );

      const matrixResults: DistanceResult[] = [];

      if (response.data.status === 'OK' && response.data.rows.length > 0) {
        const elements = response.data.rows[0].elements;

        elements.forEach((element: any, index: number) => {
          if (element.status === 'OK') {
            const durationSeconds = element.duration?.value || 0;
            const durationMinutes = Math.floor(durationSeconds / 60);

            matrixResults.push({
              originAddress: `${origin.lat},${origin.lng}`,
              destinationAddress: destinationStrings[index],
              distanceMeters: element.distance?.value || 0,
              distanceText: element.distance?.text || 'N/A',
              durationSeconds,
              durationText:
                durationMinutes > 0
                  ? `${durationMinutes}분`
                  : element.duration?.text || 'N/A',
            });
          } else {
            this.logger.warn(
              `Distance calculation failed for destination ${index}: ${element.status}`,
            );
            // Return fallback data instead of crashing
            matrixResults.push({
              originAddress: `${origin.lat},${origin.lng}`,
              destinationAddress: destinationStrings[index],
              distanceMeters: 0,
              distanceText: 'N/A',
              durationSeconds: 0,
              durationText: 'N/A',
            });
          }
        });
      } else {
        this.logger.warn(
          `Distance Matrix API failed with status: ${response.data.status}`,
        );

        // Return fallback results for all destinations to prevent crashes
        destinations.forEach((dest) => {
          matrixResults.push({
            originAddress: `${origin.lat},${origin.lng}`,
            destinationAddress: `${dest.lat},${dest.lng}`,
            distanceMeters: 0,
            distanceText: 'N/A',
            durationSeconds: 0,
            durationText: 'N/A',
          });
        });
      }

      this.logger.debug(
        `Distance calculation completed for ${matrixResults.length} destinations`,
      );
      return matrixResults;
    } catch (error) {
      this.logger.error(
        'Google Maps Distance Matrix API coordinate distance calculation failed',
        error,
      );

      // Return fallback results instead of throwing to prevent server crash
      const fallbackResults: DistanceResult[] = destinations.map((dest) => ({
        originAddress: `${origin.lat},${origin.lng}`,
        destinationAddress: `${dest.lat},${dest.lng}`,
        distanceMeters: 0,
        distanceText: 'N/A',
        durationSeconds: 0,
        durationText: 'N/A',
      }));

      this.logger.warn(
        `Returning ${fallbackResults.length} fallback distance results due to API error`,
      );
      return fallbackResults;
    }
  }

  /**
   * Parse Distance Matrix API response into structured format
   */
  private parseDistanceMatrixResponse(
    data: any,
    origins: string[],
    destinations: string[],
  ): DistanceResult[][] {
    const results: DistanceResult[][] = [];

    data.rows.forEach((row: any, originIndex: number) => {
      const rowResults: DistanceResult[] = [];

      row.elements.forEach((element: any, destIndex: number) => {
        const result: DistanceResult = {
          originAddress: origins[originIndex],
          destinationAddress: destinations[destIndex],
          distanceMeters: 0,
          distanceText: 'N/A',
          durationSeconds: 0,
          durationText: 'N/A',
        };

        if (element.status === 'OK') {
          result.distanceMeters = element.distance.value;
          result.distanceText = element.distance.text;
          result.durationSeconds = element.duration.value;
          result.durationText = element.duration.text;
        } else {
          this.logger.warn(
            `Distance calculation failed for ${origins[originIndex]} -> ${destinations[destIndex]}: ${element.status}`,
          );
        }

        rowResults.push(result);
      });

      results.push(rowResults);
    });

    return results;
  }

  /**
   * Search for places around coordinates using Google Places Nearby Search API
   */
  async searchPlacesNearby(
    coordinates: CoordinateDto,
    placeType: string,
    radiusMeters: number = 2000,
    maxResults: number = 20,
  ): Promise<GooglePlaceData[]> {
    if (!this.apiKey) {
      throw new ExternalServiceException(
        'Google Places API',
        'API key not configured',
      );
    }

    try {
      this.logger.debug(
        `Searching for ${placeType} places near (${coordinates.lat}, ${coordinates.lng}) within ${radiusMeters}m`,
      );

      const request: PlacesNearbyRequest = {
        params: {
          location: { lat: coordinates.lat, lng: coordinates.lng },
          radius: Math.min(radiusMeters, 50000), // Google Places API max radius
          type: this.mapPlaceTypeToGoogle(placeType),
          key: this.apiKey,
          language: 'ko' as any,
        },
      };

      const response: PlacesNearbyResponse =
        await this.googleMapsClient.placesNearby(request);

      this.logger.debug(
        `Google Places API found ${response.data.results.length} places`,
      );

      if (response.data.status !== 'OK') {
        this.logger.warn(`Google Places API warning: ${response.data.status}`);
      }

      // Transform and enhance places data
      const places = response.data.results
        .slice(0, maxResults)
        .map((place) => this.transformGooglePlace(place));

      // Get detailed information for top places
      const enhancedPlaces = await this.enhancePlacesWithDetails(
        places.slice(0, Math.min(10, maxResults)), // Limit detailed requests
      );

      return enhancedPlaces;
    } catch (error) {
      this.logger.error('Google Places search failed', error);
      throw new ExternalServiceException(
        'Google Places API',
        error instanceof Error ? error.message : 'Place search failed',
      );
    }
  }

  /**
   * Get detailed place information using Google Places Details API
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlaceData | null> {
    if (!this.apiKey) {
      return null;
    }

    try {
      const request: PlaceDetailsRequest = {
        params: {
          place_id: placeId,
          fields: [
            'place_id',
            'name',
            'vicinity',
            'formatted_address',
            'geometry',
            'rating',
            'user_ratings_total',
            'price_level',
            'types',
            'business_status',
            'opening_hours',
            'photos',
            'formatted_phone_number',
            'website',
          ],
          key: this.apiKey,
          language: 'ko' as any,
        },
      };

      const response: PlaceDetailsResponse =
        await this.googleMapsClient.placeDetails(request);

      if (response.data.status === 'OK' && response.data.result) {
        return this.transformDetailedGooglePlace(response.data.result);
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to get place details for ${placeId}`, error);
      return null;
    }
  }

  /**
   * Enhance places with detailed information
   */
  private async enhancePlacesWithDetails(
    places: GooglePlaceData[],
  ): Promise<GooglePlaceData[]> {
    const enhancedPlaces = await Promise.all(
      places.map(async (place) => {
        const detailedPlace = await this.getPlaceDetails(place.placeId);
        return detailedPlace || place;
      }),
    );

    return enhancedPlaces;
  }

  /**
   * Transform Google Places Nearby result to our format
   */
  private transformGooglePlace(googlePlace: any): GooglePlaceData {
    const coordinates: CoordinateDto = {
      lat: googlePlace.geometry.location.lat,
      lng: googlePlace.geometry.location.lng,
    };

    return {
      placeId: googlePlace.place_id,
      name: googlePlace.name,
      vicinity: googlePlace.vicinity || '',
      coordinates,
      rating: googlePlace.rating,
      userRatingsTotal: googlePlace.user_ratings_total,
      priceLevel: googlePlace.price_level,
      types: googlePlace.types || [],
      businessStatus: googlePlace.business_status,
      openingHours: googlePlace.opening_hours
        ? {
            openNow: googlePlace.opening_hours.open_now,
          }
        : undefined,
      photos: this.processPhotos(
        googlePlace.photos?.map((photo: any) => ({
          photoReference: photo.photo_reference,
          height: photo.height,
          width: photo.width,
        }))
      ),
    };
  }

  /**
   * Transform Google Places Details result to our enhanced format
   */
  private transformDetailedGooglePlace(googlePlace: any): GooglePlaceData {
    const coordinates: CoordinateDto = {
      lat: googlePlace.geometry.location.lat,
      lng: googlePlace.geometry.location.lng,
    };

    return {
      placeId: googlePlace.place_id,
      name: googlePlace.name,
      vicinity: googlePlace.vicinity || '',
      formattedAddress: googlePlace.formatted_address,
      coordinates,
      rating: googlePlace.rating,
      userRatingsTotal: googlePlace.user_ratings_total,
      priceLevel: googlePlace.price_level,
      types: googlePlace.types || [],
      businessStatus: googlePlace.business_status,
      openingHours: googlePlace.opening_hours
        ? {
            openNow: googlePlace.opening_hours.open_now,
            weekdayText: googlePlace.opening_hours.weekday_text,
          }
        : undefined,
      photos: this.processPhotos(
        googlePlace.photos?.slice(0, 3).map((photo: any) => ({
          photoReference: photo.photo_reference,
          height: photo.height,
          width: photo.width,
        }))
      ),
      phoneNumber: googlePlace.formatted_phone_number,
      website: googlePlace.website,
    };
  }

  /**
   * Map place type to Google Places API type
   */
  private mapPlaceTypeToGoogle(placeType: string): string {
    const typeMap: Record<string, string> = {
      restaurant: 'restaurant',
      cafe: 'cafe',
      shopping: 'shopping_mall',
      entertainment: 'amusement_park',
      culture: 'museum',
      park: 'park',
      accommodation: 'lodging',
      hospital: 'hospital',
      pharmacy: 'pharmacy',
      gas_station: 'gas_station',
      bank: 'bank',
      gym: 'gym',
    };

    return typeMap[placeType] || 'establishment';
  }

  /**
   * Convert Google Places data to internal PlaceDto format
   */
  convertToPlaceDto(
    googlePlace: GooglePlaceData,
    centerCoordinates: CoordinateDto,
  ): PlaceDto {
    const distance = this.calculateHaversineDistance(
      centerCoordinates,
      googlePlace.coordinates,
    );

    return {
      name: googlePlace.name,
      address: googlePlace.formattedAddress || googlePlace.vicinity,
      coordinates: googlePlace.coordinates,
      category: this.formatPlaceTypes(googlePlace.types),
      rating: googlePlace.rating,
      distanceFromCenter: Math.round(distance),
      phone: googlePlace.phoneNumber,
      url: googlePlace.website,
      source: 'google',
      // Enhanced Google Places data
      googlePlaceId: googlePlace.placeId,
      businessStatus: googlePlace.businessStatus,
      priceLevel: googlePlace.priceLevel,
      userRatingsTotal: googlePlace.userRatingsTotal,
      openingHours: googlePlace.openingHours,
      photos: googlePlace.photos,
    };
  }

  /**
   * Format Google Place types into readable category
   */
  private formatPlaceTypes(types: string[]): string {
    const primaryTypes = types.filter((type) =>
      [
        'restaurant',
        'cafe',
        'shopping_mall',
        'museum',
        'park',
        'lodging',
        'hospital',
        'pharmacy',
      ].includes(type),
    );

    return primaryTypes.length > 0
      ? primaryTypes[0].replace(/_/g, ' ')
      : types[0]?.replace(/_/g, ' ') || '기타';
  }

  /**
   * Calculate distance using Haversine formula
   */
  private calculateHaversineDistance(
    coord1: CoordinateDto,
    coord2: CoordinateDto,
  ): number {
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
   * Generate photo URL from Google Places photo reference
   * @param photoReference - Photo reference from Google Places API
   * @param maxWidth - Maximum width of the photo (default 400px)
   * @returns Full photo URL or null if no API key
   */
  generatePhotoUrl(photoReference: string, maxWidth: number = 400): string | null {
    if (!this.apiKey || !photoReference) {
      return null;
    }

    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.apiKey}`;
  }

  /**
   * Process photos array to include usable URLs
   */
  processPhotos(photos: Array<{ photoReference: string; height: number; width: number }> | undefined): Array<{
    photoReference: string;
    height: number;
    width: number;
    url: string;
  }> | undefined {
    if (!photos || photos.length === 0) {
      return undefined;
    }

    return photos.map((photo) => ({
      ...photo,
      url: this.generatePhotoUrl(photo.photoReference, Math.min(photo.width, 800)) || '',
    })).filter(photo => photo.url !== ''); // Filter out photos without valid URLs
  }

  /**
   * Check if Google Maps API is available
   */
  isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get API usage information
   */
  getApiInfo(): { hasApiKey: boolean; serviceName: string } {
    return {
      hasApiKey: !!this.apiKey,
      serviceName: 'Google Maps Distance Matrix API',
    };
  }
}
