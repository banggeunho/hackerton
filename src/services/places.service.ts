import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { BedrockService } from '../bedrock.service';
import { CoordinateDto, PlaceDto } from '../dto';
import { ExternalServiceException } from '../exceptions';

/**
 * Places service for searching and recommending places
 * Integrates with Kakao Local API and AI for intelligent recommendations
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly kakaoClient: AxiosInstance;

  constructor(private readonly bedrockService: BedrockService) {
    this.kakaoClient = axios.create({
      baseURL: 'https://dapi.kakao.com/v2/local/search',
      headers: {
        Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
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
   * Search places by keyword around coordinates
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

    // Search by category
    if (placeType && placeType !== 'all') {
      const categoryPlaces = await this.searchPlacesByCategory(
        coordinates,
        placeType,
        radiusMeters,
        15, // Get more results for AI filtering
      );
      allPlaces.push(...categoryPlaces);
    }

    // Additional keyword search if preferences are provided
    if (preferences.trim()) {
      const keywordPlaces = await this.searchPlacesByKeyword(
        coordinates,
        preferences,
        radiusMeters,
        10,
      );
      // Merge and deduplicate
      keywordPlaces.forEach((place) => {
        const exists = allPlaces.some(
          (existing) =>
            existing.name === place.name && existing.address === place.address,
        );
        if (!exists) {
          allPlaces.push(place);
        }
      });
    }

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
}
