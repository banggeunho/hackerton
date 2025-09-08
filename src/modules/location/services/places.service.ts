import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AllConfigType } from '../../../config';
import { BedrockService } from '../../bedrock/bedrock.service';
import { CoordinateDto, PlaceDto } from '../../../common/dto';
import { ExternalServiceException } from '../../../common/exceptions';
import {
  NaverSearchService,
  NaverLocalSearchItem,
} from './naver-search.service';

/**
 * Places service for searching and recommending places
 * Integrates with Kakao Local API, Naver Local Search API, and AI for intelligent recommendations
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly kakaoClient: AxiosInstance;

  constructor(
    private readonly bedrockService: BedrockService,
    private readonly naverSearchService: NaverSearchService,
    private configService: ConfigService<AllConfigType>,
  ) {
    const kakaoConfig = this.configService.get('kakao', { infer: true })!;

    this.kakaoClient = axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local/search',
      headers: {
        Authorization: `KakaoAK ${kakaoConfig.restApiKey}`,
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
   * Search places using Naver Local Search API
   */
  async searchPlacesWithNaver(
    coordinates: CoordinateDto,
    query: string,
    maxResults: number = 10,
  ): Promise<PlaceDto[]> {
    try {
      this.logger.debug(`Searching places with Naver Local API: ${query}`);

      // Search using the new NaverSearchService
      const response = await this.naverSearchService.searchLocal(
        query,
        Math.min(maxResults, 5), // Naver API limits to 5 results
        'random', // Sort by rating/comment for better results
      );

      if (!response.items || response.items.length === 0) {
        this.logger.debug('No results from Naver Local API');
        return [];
      }

      this.logger.debug(response.items);

      // Process and transform Naver results
      const processedResults =
        this.naverSearchService.processNaverResults(response);
      return processedResults.map((item: NaverLocalSearchItem) =>
        this.transformNaverPlace(item, coordinates),
      );
    } catch (error) {
      this.logger.warn(`Naver Local API search failed: ${error}`, error);
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
   * Get AI-powered place recommendations
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
            `   중심점으로부터 거리: ${place.distanceFromCenter ? Math.round(place.distanceFromCenter) + 'm' : 'N/A'}\n` +
            (place.phone ? `   전화번호: ${place.phone}\n` : '') +
            (place.description ? `   설명: ${place.description}\n` : ''),
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
      this.logger.debug(`System Prompt: ${systemPrompt}`);
      this.logger.debug(`User Prompt: ${userPrompt}`);

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
    naverPlace: NaverLocalSearchItem,
    centerCoordinates: CoordinateDto,
  ): PlaceDto {
    // Convert Naver coordinates to standard lat/lng format
    const coordinates: CoordinateDto =
      this.naverSearchService.convertNaverCoordinates(
        naverPlace.mapx,
        naverPlace.mapy,
      );

    const distance = this.calculateDistance(centerCoordinates, coordinates);

    return {
      name: naverPlace.title, // Already cleaned by processNaverResults
      address: naverPlace.address,
      roadAddress: naverPlace.roadAddress || undefined,
      coordinates,
      category: naverPlace.category,
      description: naverPlace.description || undefined,
      distanceFromCenter: Math.round(distance),
      phone: naverPlace.telephone || undefined,
      url: naverPlace.link || undefined,
      source: 'naver',
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
      roadAddress: kakaoPlace.road_address_name || undefined,
      coordinates,
      category: kakaoPlace.category_name,
      rating: kakaoPlace.rating ? parseFloat(kakaoPlace.rating) : undefined,
      distanceFromCenter: Math.round(distance),
      phone: kakaoPlace.phone || undefined,
      url: kakaoPlace.place_url || undefined,
      source: 'kakao',
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
   * Get comprehensive place recommendations
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

    this.logger.debug(naverPlaces)

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

    // Get AI recommendations
    const recommendedPlaces = await this.getAIRecommendations(
      allPlaces,
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
   * Search places using Naver Local Search API
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
