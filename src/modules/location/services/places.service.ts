import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AllConfigType } from '../../../config';
import { BedrockService } from '../../bedrock/bedrock.service';
import { CoordinateDto, PlaceDto } from '../../../common/dto';
import { ExternalServiceException } from '../../../common/exceptions';

/**
 * Places service for searching and recommending places
 * Integrates with Kakao Local API and AI for intelligent recommendations
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly kakaoClient: AxiosInstance;
  private readonly kakaoDirectionsClient: AxiosInstance;
  private readonly naverClient: AxiosInstance;

  constructor(
    private readonly bedrockService: BedrockService,
    private configService: ConfigService<AllConfigType>,
  ) {
    const kakaoConfig = this.configService.get('kakao', { infer: true })!;
    const naverConfig = this.configService.get('naver', { infer: true })!;

    this.kakaoClient = axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local/search',
      headers: {
        Authorization: `KakaoAK ${kakaoConfig.restApiKey}`,
      },
      timeout: 15000,
    });

    // Separate client for Directions API
    this.kakaoDirectionsClient = axios.create({
      baseURL: 'https://apis-navi.kakaomobility.com',
      headers: {
        Authorization: `KakaoAK ${kakaoConfig.restApiKey}`,
      },
      timeout: 10000,
    });

    this.naverClient = axios.create({
      baseURL: 'https://naveropenapi.apigw.ntruss.com/map-place/v1',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': naverConfig.clientId,
        'X-NCP-APIGW-API-KEY': naverConfig.clientSecret,
      },
      timeout: 15000,
    });
  }

  /**
   * Search places by category around coordinates
   */
  async searchPlacesByCategory(
    coordinates: CoordinateDto,
    category: string,
    radiusMeters: number = 2000,
    maxResults: number = 15,
  ): Promise<PlaceDto[]> {
    try {
      this.logger.debug(
        `Searching places: category=${category}, radius=${radiusMeters}m`,
      );

      // Map place type to Kakao category codes
      const categoryCode = this.mapPlaceTypeToKakaoCategory(category);

      const response = await this.kakaoClient.get('/category.json', {
        params: {
          category_group_code: categoryCode,
          x: coordinates.lng,
          y: coordinates.lat,
          radius: Math.min(radiusMeters, 20000), // Kakao API max radius
          size: Math.min(maxResults, 15), // Kakao API max size per request
          sort: 'distance', // Sort by distance from center
        },
      });

      const documents = response.data?.documents || [];

      return documents.map((place: any) =>
        this.transformKakaoPlace(place, coordinates),
      );
    } catch (error) {
      this.logger.error(`Kakao place search failed`, error);
      throw new ExternalServiceException(
        'Kakao Local API',
        error instanceof Error ? error.message : 'Place search failed',
      );
    }
  }

  /**
   * Search places using Naver Maps API
   */
  async searchPlacesWithNaver(
    coordinates: CoordinateDto,
    query: string,
    maxResults: number = 10,
  ): Promise<PlaceDto[]> {
    try {
      this.logger.debug(`Searching places with Naver Maps: ${query}`);

      const response = await this.naverClient.get('/search', {
        params: {
          query: query,
          coordinate: `${coordinates.lng},${coordinates.lat}`,
          format: 'json',
          count: Math.min(maxResults, 20),
        },
      });

      const places = response.data?.places || [];

      return places.map((place: any) =>
        this.transformNaverPlace(place, coordinates),
      );
    } catch (error) {
      this.logger.warn(`Naver Maps search failed: ${error.message}`, error);
      return []; // Return empty array instead of throwing to allow fallback
    }
  }

  /**
   * Search places by keyword around coordinates (Kakao)
   */
  async searchPlacesByKeyword(
    coordinates: CoordinateDto,
    keyword: string,
    radiusMeters: number = 2000,
    maxResults: number = 15,
  ): Promise<PlaceDto[]> {
    try {
      this.logger.debug(`Searching places by keyword: ${keyword}`);

      const response = await this.kakaoClient.get('/keyword.json', {
        params: {
          query: keyword,
          x: coordinates.lng,
          y: coordinates.lat,
          radius: Math.min(radiusMeters, 20000),
          size: Math.min(maxResults, 15),
          sort: 'distance',
        },
      });

      const documents = response.data?.documents || [];

      return documents.map((place: any) =>
        this.transformKakaoPlace(place, coordinates),
      );
    } catch (error) {
      this.logger.error(`Kakao keyword search failed`, error);
      throw new ExternalServiceException(
        'Kakao Local API',
        error instanceof Error ? error.message : 'Keyword search failed',
      );
    }
  }

  /**
   * Get AI-powered place recommendations with travel information
   */
  async getAIRecommendationsWithTravelInfo(
    places: PlaceDto[],
    placeType: string = 'restaurant',
    preferences: string = '',
    maxResults: number = 10,
  ): Promise<PlaceDto[]> {
    try {
      if (places.length === 0) {
        return [];
      }

      // Create enhanced context for AI recommendation including travel info
      const placesContext = places
        .map(
          (place, index) =>
            `${index + 1}. ${place.name}
` +
            `   주소: ${place.address}
` +
            `   카테고리: ${place.category || 'N/A'}
` +
            `   평점: ${place.rating || 'N/A'}
` +
            `   중심점으로부터 거리: ${place.distanceFromCenter ? Math.round(place.distanceFromCenter) + 'm' : 'N/A'}
` +
            (place.travelInfo
              ? `   자동차 이동시간: ${place.travelInfo.drivingTime ? Math.round(place.travelInfo.drivingTime / 60) + '분' : 'N/A'}
` +
                `   도보 이동시간: ${place.travelInfo.walkingTime ? Math.round(place.travelInfo.walkingTime / 60) + '분' : 'N/A'}
` +
                `   자동차 이동거리: ${place.travelInfo.drivingDistance ? Math.round((place.travelInfo.drivingDistance / 1000) * 10) / 10 + 'km' : 'N/A'}
`
              : '') +
            (place.phone
              ? `   전화번호: ${place.phone}
`
              : ''),
        )
        .join('\n');

      const systemPrompt = `당신은 한국의 장소 추천 전문가입니다. 
주어진 장소들 중에서 사용자의 요구사항에 가장 적합한 곳들을 ${maxResults}개까지 추천해주세요.

추천 기준:
- 사용자 선호도와의 일치도
- 접근성 (중심점으로부터의 거리 및 이동시간)
- 평점 및 품질
- 장소 유형과의 적합성
- 교통 편의성 (자동차/도보 이동시간 고려)

특별히 이동시간을 고려하여 추천해주세요:
- 자동차 이용 시 15분 이내가 가장 좋음
- 도보 이용 시 10분 이내가 가장 좋음
- 이동시간이 길더라도 평점이나 특별한 이유가 있다면 추천 가능

응답 형식은 JSON 배열로 해주세요:
[
  {
    "placeIndex": 장소번호(1부터시작),
    "recommendationScore": 추천점수(1-10),
    "reason": "추천 이유를 한국어로 설명 (이동시간 포함)"
  }
]

최대 ${maxResults}개까지만 추천하고, 추천점수가 높은 순으로 정렬해주세요.`;

      const userPrompt = `장소 유형: ${placeType}
사용자 선호사항: ${preferences || '특별한 선호사항 없음'}

검색된 장소 목록 (이동시간 정보 포함):
${placesContext}

위 장소들 중에서 이동시간을 고려하여 추천해주세요.`;

      this.logger.debug('Requesting AI recommendations with travel info');

      const aiResponse = await this.bedrockService.generateResponse(
        userPrompt,
        systemPrompt,
      );

      // Parse AI response
      const recommendations = this.parseAIRecommendations(aiResponse);

      // Apply recommendations to places
      const recommendedPlaces = recommendations
        .filter((rec) => rec.placeIndex > 0 && rec.placeIndex <= places.length)
        .map((rec) => {
          const place = { ...places[rec.placeIndex - 1] };
          place.recommendationReason = rec.reason;
          return place;
        })
        .slice(0, maxResults);

      this.logger.debug(
        `AI recommended ${recommendedPlaces.length} places with travel info`,
      );
      return recommendedPlaces;
    } catch (error) {
      this.logger.warn(
        'AI recommendation with travel info failed, falling back to basic recommendations',
        error,
      );
      // Fallback to basic AI recommendations
      return this.getAIRecommendations(
        places,
        placeType,
        preferences,
        maxResults,
      );
    }
  }

  /**
   * Get AI-powered place recommendations (fallback method)
   */
  async getAIRecommendations(
    places: PlaceDto[],
    placeType: string = 'restaurant',
    preferences: string = '',
    maxResults: number = 10,
  ): Promise<PlaceDto[]> {
    try {
      if (places.length === 0) {
        return [];
      }

      // Create context for AI recommendation
      const placesContext = places
        .map(
          (place, index) =>
            `${index + 1}. ${place.name}\n` +
            `   주소: ${place.address}\n` +
            `   카테고리: ${place.category || 'N/A'}\n` +
            `   평점: ${place.rating || 'N/A'}\n` +
            `   중심점으로부터 거리: ${place.distanceFromCenter ? Math.round(place.distanceFromCenter) + 'm' : 'N/A'}\n`,
        )
        .join('\n');

      const systemPrompt = `당신은 한국의 장소 추천 전문가입니다. 
주어진 장소들 중에서 사용자의 요구사항에 가장 적합한 곳들을 ${maxResults}개까지 추천해주세요.

추천 기준:
- 사용자 선호도와의 일치도
- 접근성 (중심점으로부터의 거리)
- 평점 및 품질
- 장소 유형과의 적합성

응답 형식은 JSON 배열로 해주세요:
[
  {
    "placeIndex": 장소번호(1부터시작),
    "recommendationScore": 추천점수(1-10),
    "reason": "추천 이유를 한국어로 설명"
  }
]

최대 ${maxResults}개까지만 추천하고, 추천점수가 높은 순으로 정렬해주세요.`;

      const userPrompt = `장소 유형: ${placeType}
사용자 선호사항: ${preferences || '특별한 선호사항 없음'}

검색된 장소 목록:
${placesContext}

위 장소들 중에서 추천해주세요.`;

      this.logger.debug('Requesting AI recommendations');

      const aiResponse = await this.bedrockService.generateResponse(
        userPrompt,
        systemPrompt,
      );

      // Parse AI response
      const recommendations = this.parseAIRecommendations(aiResponse);

      // Apply recommendations to places
      const recommendedPlaces = recommendations
        .filter((rec) => rec.placeIndex > 0 && rec.placeIndex <= places.length)
        .map((rec) => {
          const place = { ...places[rec.placeIndex - 1] };
          place.recommendationReason = rec.reason;
          return place;
        })
        .slice(0, maxResults);

      this.logger.debug(`AI recommended ${recommendedPlaces.length} places`);
      return recommendedPlaces;
    } catch (error) {
      this.logger.warn(
        'AI recommendation failed, returning original places',
        error,
      );
      // Return original places as fallback
      return places.slice(0, maxResults);
    }
  }

  /**
   * Map place type to Kakao category code
   */
  private mapPlaceTypeToKakaoCategory(placeType: string): string {
    const categoryMap: Record<string, string> = {
      restaurant: 'FD6', // 음식점
      cafe: 'CE7', // 카페
      shopping: 'MT1', // 대형마트
      entertainment: 'AT4', // 관광명소
      culture: 'CT1', // 문화시설
      park: 'AT4', // 관광명소 (공원 포함)
      accommodation: 'AD5', // 숙박
    };

    return categoryMap[placeType] || 'FD6'; // Default to restaurants
  }

  /**
   * Transform Naver place data to internal format
   */
  private transformNaverPlace(
    naverPlace: any,
    centerCoordinates: CoordinateDto,
  ): PlaceDto {
    const coordinates: CoordinateDto = {
      lat: parseFloat(naverPlace.y || naverPlace.lat),
      lng: parseFloat(naverPlace.x || naverPlace.lng),
    };

    const distance = this.calculateDistance(centerCoordinates, coordinates);

    return {
      name: naverPlace.name || naverPlace.title?.replace(/<[^>]*>/g, ''), // Remove HTML tags
      address: naverPlace.address || naverPlace.roadAddress,
      coordinates,
      category: naverPlace.category,
      rating: naverPlace.rating ? parseFloat(naverPlace.rating) : undefined,
      distanceFromCenter: Math.round(distance),
      phone: naverPlace.telephone || naverPlace.phone || undefined,
      url: naverPlace.link || naverPlace.homePageUrl || undefined,
    };
  }

  /**
   * Transform Kakao place data to internal format
   */
  private transformKakaoPlace(
    kakaoPlace: any,
    centerCoordinates: CoordinateDto,
  ): PlaceDto {
    const coordinates: CoordinateDto = {
      lat: parseFloat(kakaoPlace.y),
      lng: parseFloat(kakaoPlace.x),
    };

    const distance = this.calculateDistance(centerCoordinates, coordinates);

    return {
      name: kakaoPlace.place_name,
      address: kakaoPlace.address_name || kakaoPlace.road_address_name,
      coordinates,
      category: kakaoPlace.category_name,
      rating: kakaoPlace.rating ? parseFloat(kakaoPlace.rating) : undefined,
      distanceFromCenter: Math.round(distance),
      phone: kakaoPlace.phone || undefined,
      url: kakaoPlace.place_url || undefined,
    };
  }

  /**
   * Parse AI recommendation response
   */
  private parseAIRecommendations(aiResponse: string): Array<{
    placeIndex: number;
    recommendationScore: number;
    reason: string;
  }> {
    try {
      // Extract JSON from response
      const jsonMatch = aiResponse.match(/\[([\s\S]*?)\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }

      const recommendations = JSON.parse(jsonMatch[0]);

      return recommendations
        .filter(
          (rec: any) =>
            typeof rec.placeIndex === 'number' &&
            typeof rec.reason === 'string',
        )
        .sort(
          (a: any, b: any) =>
            (b.recommendationScore || 0) - (a.recommendationScore || 0),
        );
    } catch (error) {
      this.logger.warn(
        'Failed to parse AI recommendations, using fallback',
        error,
      );
      return [];
    }
  }

  /**
   * Get travel time and distance using Kakao Directions API
   */
  async getTravelInfo(
    origin: CoordinateDto,
    destination: CoordinateDto,
  ): Promise<{
    drivingTime?: number;
    drivingDistance?: number;
    walkingTime?: number;
    walkingDistance?: number;
  }> {
    try {
      const travelInfo: any = {};

      // Get driving directions
      try {
        const drivingResponse = await this.kakaoDirectionsClient.get(
          '/v1/directions',
          {
            params: {
              origin: `${origin.lng},${origin.lat}`,
              destination: `${destination.lng},${destination.lat}`,
              priority: 'RECOMMEND', // 추천 경로
            },
          },
        );

        const route = drivingResponse.data?.routes?.[0];
        if (route) {
          travelInfo.drivingTime = route.summary?.duration; // seconds
          travelInfo.drivingDistance = route.summary?.distance; // meters
        }
      } catch {
        this.logger.debug(
          'Driving directions failed, using fallback calculation',
        );
        // Fallback: estimate based on straight-line distance
        const straightDistance = this.calculateDistance(origin, destination);
        travelInfo.drivingDistance = Math.round(straightDistance * 1.3); // 30% increase for roads
        travelInfo.drivingTime = Math.round(travelInfo.drivingDistance / 15); // ~15m/s average speed
      }

      // Get walking directions using Kakao Maps Walking API
      try {
        const walkingResponse = await this.kakaoDirectionsClient.get(
          '/v1/waypoints/directions',
          {
            params: {
              origin: `${origin.lng},${origin.lat}`,
              destination: `${destination.lng},${destination.lat}`,
              waypoints: '',
              priority: 'RECOMMEND',
              car_fuel: 'GASOLINE',
              car_hipass: false,
              alternatives: false,
              road_details: false,
            },
          },
        );

        const walkingRoute = walkingResponse.data?.routes?.[0];
        if (walkingRoute) {
          // Walking is typically 1/4 the speed of driving, adjust accordingly
          travelInfo.walkingTime = Math.round(
            (walkingRoute.summary?.duration || 0) * 4,
          );
          travelInfo.walkingDistance = walkingRoute.summary?.distance;
        }
      } catch {
        this.logger.debug(
          'Walking directions failed, using fallback calculation',
        );
        // Fallback: estimate walking time based on straight-line distance
        const straightDistance = this.calculateDistance(origin, destination);
        travelInfo.walkingDistance = Math.round(straightDistance * 1.2); // 20% increase for pedestrian paths
        travelInfo.walkingTime = Math.round(travelInfo.walkingDistance / 1.4); // ~1.4m/s walking speed
      }

      return travelInfo;
    } catch (error) {
      this.logger.warn('Failed to get travel info', error);
      // Return fallback calculations
      const straightDistance = this.calculateDistance(origin, destination);
      return {
        drivingDistance: Math.round(straightDistance * 1.3),
        drivingTime: Math.round((straightDistance * 1.3) / 15),
        walkingDistance: Math.round(straightDistance * 1.2),
        walkingTime: Math.round((straightDistance * 1.2) / 1.4),
      };
    }
  }

  /**
   * Enhance places with travel information
   */
  async enhancePlacesWithTravelInfo(
    places: PlaceDto[],
    centerCoordinates: CoordinateDto,
  ): Promise<PlaceDto[]> {
    const enhancedPlaces = await Promise.all(
      places.map(async (place) => {
        try {
          const travelInfo = await this.getTravelInfo(
            centerCoordinates,
            place.coordinates,
          );

          return {
            ...place,
            travelInfo: {
              ...travelInfo,
              // Add human-readable format for better AI processing
              drivingTimeFormatted: travelInfo.drivingTime
                ? `${Math.round(travelInfo.drivingTime / 60)}분`
                : undefined,
              walkingTimeFormatted: travelInfo.walkingTime
                ? `${Math.round(travelInfo.walkingTime / 60)}분`
                : undefined,
            },
          };
        } catch (error) {
          this.logger.warn(
            `Failed to get travel info for ${place.name}`,
            error,
          );
          return place; // Return original place if travel info fails
        }
      }),
    );

    return enhancedPlaces;
  }

  /**
   * Calculate distance between two coordinates in meters
   */
  private calculateDistance(
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
   * Get comprehensive place recommendations with travel information
   */
  async getPlaceRecommendations(
    coordinates: CoordinateDto,
    placeType: string = 'restaurant',
    radiusMeters: number = 2000,
    maxResults: number = 10,
    preferences: string = '',
  ): Promise<PlaceDto[]> {
    let allPlaces: PlaceDto[] = [];

    // Search using both Kakao and Naver for richer data
    const [kakaoPlaces, naverPlaces] = await Promise.all([
      this.searchWithKakao(coordinates, placeType, preferences, radiusMeters),
      this.searchWithNaver(coordinates, placeType, preferences),
    ]);

    // Merge and deduplicate places from both sources
    allPlaces = this.mergePlaceSources(kakaoPlaces, naverPlaces);

    // If no places found, try broader search
    if (allPlaces.length === 0) {
      this.logger.warn(
        'No places found with specific criteria, trying broader search',
      );
      allPlaces = await this.searchPlacesByKeyword(
        coordinates,
        placeType || '맛집',
        radiusMeters * 2, // Expand radius
        15,
      );
    }

    // Enhance places with travel information
    const placesWithTravelInfo = await this.enhancePlacesWithTravelInfo(
      allPlaces,
      coordinates,
    );

    // Get AI recommendations with enriched data
    const recommendedPlaces = await this.getAIRecommendationsWithTravelInfo(
      placesWithTravelInfo,
      placeType,
      preferences,
      maxResults,
    );

    return recommendedPlaces;
  }

  /**
   * Search places using Kakao APIs
   */
  private async searchWithKakao(
    coordinates: CoordinateDto,
    placeType: string,
    preferences: string,
    radiusMeters: number,
  ): Promise<PlaceDto[]> {
    const places: PlaceDto[] = [];

    // Search by category
    if (placeType && placeType !== 'all') {
      const categoryPlaces = await this.searchPlacesByCategory(
        coordinates,
        placeType,
        radiusMeters,
        15,
      );
      places.push(...categoryPlaces);
    }

    // Additional keyword search if preferences are provided
    if (preferences.trim()) {
      const keywordPlaces = await this.searchPlacesByKeyword(
        coordinates,
        preferences,
        radiusMeters,
        10,
      );
      places.push(...keywordPlaces);
    }

    return places;
  }

  /**
   * Search places using Naver Maps API
   */
  private async searchWithNaver(
    coordinates: CoordinateDto,
    placeType: string,
    preferences: string,
  ): Promise<PlaceDto[]> {
    const searchQuery = preferences.trim() || placeType || '맛집';
    return await this.searchPlacesWithNaver(coordinates, searchQuery, 10);
  }

  /**
   * Merge places from different sources and deduplicate
   */
  private mergePlaceSources(
    kakaoPlaces: PlaceDto[],
    naverPlaces: PlaceDto[],
  ): PlaceDto[] {
    const allPlaces: PlaceDto[] = [...kakaoPlaces];

    // Add Naver places that don't already exist
    naverPlaces.forEach((naverPlace) => {
      const exists = allPlaces.some((existing) => {
        // Check for similar names and close proximity
        const nameMatch =
          this.calculateSimilarity(existing.name, naverPlace.name) > 0.7;
        const distanceMatch =
          this.calculateDistance(existing.coordinates, naverPlace.coordinates) <
          100; // Within 100m

        return nameMatch && distanceMatch;
      });

      if (!exists) {
        allPlaces.push(naverPlace);
      }
    });

    return allPlaces;
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.getEditDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate edit distance between two strings
   */
  private getEditDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }
}
