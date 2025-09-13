import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AllConfigType } from '../../../config';
import { BedrockService } from '../../bedrock/bedrock.service';
import { CoordinateDto, PlaceDto } from '../../../common/dto';
import { ExternalServiceException } from '../../../common/exceptions';
import {
  NaverLocalSearchItem,
  NaverSearchService,
} from './naver-search.service';
import { GoogleMapsService } from './google-maps.service';
import { LocationService } from './location.service';

/**
 * Places service implementing Steps 2-4 of the 4-step algorithm
 * - Step 2: Search places around center point using Google Places API (with Kakao fallback)
 * - Step 3: Calculate public transportation distances using Google Maps
 * - Step 4: Generate LLM-powered recommendations using AWS Bedrock
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly kakaoClient: AxiosInstance;

  constructor(
    private readonly bedrockService: BedrockService,
    private readonly naverSearchService: NaverSearchService,
    private readonly googleMapsService: GoogleMapsService,
    private readonly locationService: LocationService,
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
   * Step 2: Search places around center point using Google Places API
   */
  async searchPlacesAroundCenter(
    centerCoordinates: CoordinateDto,
    placeType: string,
    radiusMeters: number,
    maxResults: number,
  ): Promise<PlaceDto[]> {
    this.logger.debug(
      `Step 2: Searching ${placeType} places within ${radiusMeters}m using Google Places API`,
    );

    try {
      // Use Google Places API for comprehensive place search
      const googlePlaces = await this.googleMapsService.searchPlacesNearby(
        centerCoordinates,
        placeType,
        radiusMeters,
        maxResults,
      );

      // Convert Google Places data to internal PlaceDto format
      const places = googlePlaces.map((googlePlace) =>
        this.googleMapsService.convertToPlaceDto(
          googlePlace,
          centerCoordinates,
        ),
      );

      this.logger.debug(
        `Found ${places.length} places using Google Places API`,
      );
      return places;
    } catch (error) {
      this.logger.error(
        'Google Places search failed, falling back to Kakao',
        error,
      );
      // Fallback to Kakao API if Google fails
      return this.searchPlacesByCategory(
        centerCoordinates,
        placeType,
        radiusMeters,
        maxResults,
      );
    }
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
   * Step 4: Generate LLM-powered comprehensive recommendations
   */
  async generateAIRecommendations(
    places: PlaceDto[],
    centerCoordinates: CoordinateDto,
    originalAddresses: string[],
    placeType: string,
    preferences: string,
    maxResults: number,
  ): Promise<PlaceDto[]> {
    this.logger.debug(
      `Step 4: Generating AI recommendations for ${places.length} places`,
    );

    if (places.length === 0) {
      return [];
    }

    try {
      // Create comprehensive context for AI using Google Places rich data
      const placesContext = places
        .map((place, index) => {
          const transit = place.transportationAccessibility;
          let context = `${index + 1}. ${place.name}
   주소: ${place.address}
   카테고리: ${place.category || 'N/A'}
   평점: ${place.rating || 'N/A'} (${place.userRatingsTotal || 0}개 리뷰)
   중심점에서 거리: ${place.distanceFromCenter}m
   대중교통 평균 시간: ${transit?.averageTransitTime || 'N/A'}
   접근성 점수: ${transit?.accessibilityScore || 'N/A'}/10
   대중교통 계산 방식: ${transit?.calculationMethod === 'google_maps_api' ? 'Google Maps 실제 데이터' : '추정치'}`;

          // Add detailed transit times from each individual address
          if (transit?.fromAddresses && transit.fromAddresses.length > 0) {
            context += `
   📍 각 주소별 대중교통 시간:`;
            transit.fromAddresses.forEach((transitInfo, idx) => {
              context += `
      ${idx + 1}. ${transitInfo.origin} → ${transitInfo.transitTime} (${transitInfo.transitDistance})`;
              if (transitInfo.durationSeconds) {
                context += ` [실제: ${Math.round(transitInfo.durationSeconds / 60)}분]`;
              }
            });
          }

          // Add Google Places enhanced data
          if (place.businessStatus) {
            context += `\n   영업상태: ${place.businessStatus === 'OPERATIONAL' ? '영업중' : '영업 중단'}`;
          }

          if (place.priceLevel !== undefined) {
            const priceLabels = [
              '무료',
              '저렴함',
              '보통',
              '비싸다',
              '매우 비싸다',
            ];
            context += `\n   가격대: ${priceLabels[place.priceLevel] || '정보 없음'}`;
          }

          if (place.openingHours?.openNow !== undefined) {
            context += `\n   현재 운영: ${place.openingHours.openNow ? '영업중' : '영업시간 외'}`;
          }

          // Reviews are no longer included in the response

          if (place.photos && place.photos.length > 0) {
            context += `\n   사진: ${place.photos.length}개 이용가능`;
          }

          return context;
        })
        .join('\n\n');

      const systemPrompt = `당신은 구글 플레이스 데이터와 Google Maps 실제 대중교통 정보를 종합 분석하는 한국의 장소 추천 전문가입니다.
실제 대중교통 이동시간과 풍부한 장소 정보를 활용하여 사용자에게 최적의 장소를 추천하세요.

추천 분석 기준:
1. **각 주소별 실제 대중교통 접근성**: 입력된 모든 주소에서의 개별 이동시간과 전체 평균 접근성 점수
2. 장소 품질 (평점, 리뷰 수, 최근 리뷰 내용)
3. 운영 상태 (현재 영업 여부, 영업시간)
4. 가격 접근성 (가격대 정보)
5. 중심점으로부터의 거리와 편의성
6. 사용자 선호사항과의 부합도
7. 실제 이용객 후기 (리뷰 품질과 내용)

**핵심 분석 포인트**:
- '📍 각 주소별 대중교통 시간' 섹션을 중점적으로 분석하세요
- 모든 주소에서 균등하게 접근 가능한 곳을 우선 추천하세요
- 특정 주소에서만 접근이 어려운 곳은 해당 사유를 명시하세요
- 대중교통 계산 방식이 'Google Maps 실제 데이터'인 경우, 실제 버스/지하철 노선과 시간표를 반영한 정확한 이동시간이므로 더 높은 신뢰도로 평가하세요

구글 플레이스에서 제공하는 상세 정보와 각 주소별 실제 대중교통 이동시간을 종합하여 실용적이고 정확한 추천을 제공하세요.

응답은 JSON 배열 형식으로 해주세요:
[
  {
    "placeIndex": 번호,
    "aiRecommendationScore": 점수(1-10),
    "reason": "구글 플레이스 데이터와 접근성을 종합한 상세한 추천 이유"
  }
]

예시 응답:
[
  {
    "placeIndex": 1,
    "aiRecommendationScore": 9.2,
    "reason": "현재 영업중이며 대중교통 접근성이 우수함(평균 15분). 높은 평점(4.7/5, 1200개 리뷰)과 합리적인 가격대(보통)로 사용자 만족도가 높을 것으로 예상됨. 최근 리뷰에서 '음식이 맛있고 분위기가 좋다'는 긍정적 평가가 많음."
  },
  {
    "placeIndex": 3,
    "aiRecommendationScore": 8.8,
    "reason": "중심지에서 가까운 거리(850m)이지만 대중교통 시간이 다소 길어 접근성은 보통. 하지만 현재 영업중이고 저렴한 가격대, 우수한 평점(4.6/5, 800개 리뷰)으로 가성비가 뛰어남. 사진도 3개 이용가능하여 신뢰도가 높음."
  },
  {
    "placeIndex": 2,
    "aiRecommendationScore": 7.5,
    "reason": "평점은 높지만(4.5/5) 현재 영업시간 외여서 방문 불가. 대중교통 접근성은 우수하나 즉시 이용할 수 없어 추천 순위가 낮아짐. 향후 영업시간에 방문 고려 가능."
  }
]

최대 ${maxResults}개까지 추천하고 점수가 높은 순으로 정렬해주세요.`;

      const userPrompt = `**분석 요청**:
📍 입력받은 주소들: ${originalAddresses.map((addr, idx) => `${idx + 1}. ${addr}`).join(', ')}
🎯 중심 좌표: ${centerCoordinates.lat}, ${centerCoordinates.lng}
🏷️ 장소 유형: ${placeType}
💭 사용자 선호사항: ${preferences || '특별한 선호사항 없음'}

**중요**: 아래 장소들의 "📍 각 주소별 대중교통 시간" 정보를 통해 ${originalAddresses.length}개 주소에서 모두 접근하기 좋은 곳을 우선적으로 추천해주세요.

**분석할 장소들**:
${placesContext}

위 데이터를 종합적으로 분석하여 모든 입력 주소에서 접근하기 좋은 최적의 장소를 추천해주세요.`;

      this.logger.debug('Requesting AI recommendations with enhanced context');
      this.logger.debug(`System Prompt: ${systemPrompt}`);
      this.logger.debug(`User Prompt: ${userPrompt}`);

      const aiResponse = await this.bedrockService.generateResponse(
        userPrompt,
        systemPrompt,
      );
      const recommendations = this.parseAIRecommendations(aiResponse);

      // Apply AI recommendations
      const recommendedPlaces = recommendations
        .filter((rec) => rec.placeIndex > 0 && rec.placeIndex <= places.length)
        .map((rec) => ({
          ...places[rec.placeIndex - 1],
          aiRecommendationScore: rec.aiRecommendationScore,
          aiAnalysis: rec.reason,
        }))
        .slice(0, maxResults);

      this.logger.debug(
        `AI generated ${recommendedPlaces.length} recommendations`,
      );
      return recommendedPlaces;
    } catch (error) {
      this.logger.warn('AI recommendation failed, using simple ranking', error);
      // Fallback: sort by accessibility score and distance
      return places
        .sort((a, b) => {
          const scoreA = a.transportationAccessibility?.accessibilityScore || 5;
          const scoreB = b.transportationAccessibility?.accessibilityScore || 5;
          return scoreB - scoreA;
        })
        .slice(0, maxResults);
    }
  }

  /**
   * Get AI-powered place recommendations (deprecated - use generateAIRecommendations)
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
   * Parse AI recommendation response for new format
   */
  private parseAIRecommendations(aiResponse: string): Array<{
    placeIndex: number;
    aiRecommendationScore: number;
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
            (b.aiRecommendationScore || 0) - (a.aiRecommendationScore || 0),
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
   * Main method implementing the complete 4-step algorithm
   * (Steps 1 is handled by LocationService, this handles Steps 2-4)
   */
  async getPlaceRecommendations(
    centerCoordinates: CoordinateDto,
    originalAddresses: string[],
    placeType: string = 'restaurant',
    radiusMeters: number = 2000,
    maxResults: number = 10,
    preferences: string = '',
  ): Promise<PlaceDto[]> {
    this.logger.debug(`Starting 4-step place recommendation process`);

    // Step 2: Search places around center point using Kakao API
    const places = await this.searchPlacesAroundCenter(
      centerCoordinates,
      placeType,
      radiusMeters,
      maxResults * 2, // Get more places for better AI selection
    );

    if (places.length === 0) {
      this.logger.warn('No places found, returning empty results');
      return [];
    }

    // Step 3: Calculate public transportation distances (N×M matrix)
    const placesWithTransitData = await this.calculateTransitDistances(
      originalAddresses,
      places,
    );

    // Step 4: Generate LLM-powered recommendations
    const recommendations = await this.generateAIRecommendations(
      placesWithTransitData,
      centerCoordinates,
      originalAddresses,
      placeType,
      preferences,
      maxResults,
    );

    this.logger.debug(
      `Completed 4-step process with ${recommendations.length} recommendations`,
    );
    return recommendations;
  }

  /**
   * Step 3: Calculate public transportation distances (N×M matrix)
   */
  async calculateTransitDistances(
    originalAddresses: string[],
    places: PlaceDto[],
  ): Promise<PlaceDto[]> {
    this.logger.debug(
      `Step 3: Calculating transit distances for ${originalAddresses.length} addresses × ${places.length} places`,
    );

    if (!this.googleMapsService.isAvailable()) {
      this.logger.warn(
        'Google Maps service not available, skipping transit distance calculations',
      );
      return places;
    }

    try {
      // Convert addresses to coordinates using LocationService
      const geocodedAddresses = await Promise.all(
        originalAddresses.map(async (address) => {
          try {
            // Use the existing geocoding functionality from LocationService
            const results = await this.locationService.geocodeAddresses([
              address,
            ]);
            if (results && results.length > 0) {
              return results[0].coordinates;
            }
            // Fallback to default Seoul coordinates if geocoding fails
            return { lat: 37.5665, lng: 126.978 };
          } catch (error) {
            this.logger.warn(`Failed to geocode address: ${address}`, error);
            return { lat: 37.5665, lng: 126.978 };
          }
        }),
      );
      const originCoordinates = geocodedAddresses;

      // Calculate transit distances for each place
      const enhancedPlaces = await Promise.all(
        places.map(async (place) => {
          const transitData = await this.calculateTransitToPlace(
            originCoordinates,
            originalAddresses,
            place,
          );
          return {
            ...place,
            transportationAccessibility: transitData,
          };
        }),
      );

      return enhancedPlaces;
    } catch (error) {
      this.logger.warn(
        'Failed to calculate transit distances, continuing without them',
        error,
      );
      return places;
    }
  }

  /**
   * Calculate real transit information for a single place using Google Maps
   */
  private async calculateTransitToPlace(
    origins: CoordinateDto[],
    originalAddresses: string[],
    place: PlaceDto,
  ): Promise<any> {
    try {
      this.logger.debug(
        `Calculating real transit times from ${origins.length} origins to ${place.name}`,
      );

      // Calculate transit times using Google Maps API
      const transitResults = await Promise.all(
        origins.map(async (origin) => {
          try {
            const results = await this.googleMapsService.calculateTransitTime(
              origin,
              [place.coordinates],
            );
            return results[0]; // First (and only) result for this origin-destination pair
          } catch (error) {
            this.logger.warn(
              `Failed to calculate transit time from ${origin.lat},${origin.lng} to ${place.name}`,
              error,
            );
            return null;
          }
        }),
      );

      // Process results and create transit information
      const transitTimes = transitResults.map((result, index) => {
        if (result && result.durationSeconds > 0) {
          return {
            origin: originalAddresses[index],
            transitTime: result.durationText,
            transitDistance: result.distanceText,
            transitMode: '대중교통',
            durationSeconds: result.durationSeconds,
            distanceMeters: result.distanceMeters,
          };
        } else {
          // Fallback to simplified calculation if Google Maps fails
          const fallbackTime = Math.round(15 + Math.random() * 20);
          const fallbackDistance =
            Math.round(
              this.calculateDistance(origins[index], place.coordinates) / 100,
            ) / 10;
          return {
            origin: originalAddresses[index],
            transitTime: fallbackTime + '분',
            transitDistance: fallbackDistance + 'km',
            transitMode: '대중교통 (추정)',
            durationSeconds: fallbackTime * 60,
            distanceMeters: fallbackDistance * 1000,
          };
        }
      });

      // Calculate average transit time
      const averageSeconds =
        transitTimes.reduce((sum, t) => sum + t.durationSeconds, 0) /
        transitTimes.length;
      const averageMinutes = Math.round(averageSeconds / 60);

      // Calculate accessibility score based on transit time
      // Score: 10 for ≤15min, decreasing by 1 for every 5min increase
      const accessibilityScore = Math.min(
        10,
        Math.max(1, 10 - Math.floor((averageMinutes - 15) / 5)),
      );

      const transitInfo = {
        averageTransitTime: averageMinutes + '분',
        accessibilityScore,
        fromAddresses: transitTimes,
        calculationMethod: transitResults.some(
          (r) => r && r.durationSeconds > 0,
        )
          ? 'google_maps_api'
          : 'estimated',
      };

      this.logger.debug(
        `Transit calculation completed for ${place.name}: ${averageMinutes}분 (score: ${accessibilityScore})`,
      );

      return transitInfo;
    } catch (error) {
      this.logger.warn(
        `Failed to calculate transit for place ${place.name}`,
        error,
      );
      return null;
    }
  }

  /**
   * Enhance places with accurate Google Maps distance calculations
   */
  private async enhancePlacesWithGoogleMapsDistances(
    places: PlaceDto[],
    originCoordinates: CoordinateDto,
  ): Promise<PlaceDto[]> {
    if (!this.googleMapsService.isAvailable()) {
      this.logger.debug(
        'Google Maps service not available, using existing distance calculations',
      );
      return places;
    }

    if (places.length === 0) {
      return places;
    }

    try {
      this.logger.debug(
        `Enhancing ${places.length} places with Google Maps distances`,
      );

      // Extract coordinates from places
      const placeCoordinates = places.map((place) => place.coordinates);

      // Calculate distances using Google Maps
      const distanceResults =
        await this.googleMapsService.calculateDistanceBetweenCoordinates(
          originCoordinates,
          placeCoordinates,
        );

      console.log(distanceResults);

      // Update places with accurate distance information
      const enhancedPlaces = places.map((place, index) => {
        const distanceResult = distanceResults[index];
        if (distanceResult && distanceResult.distanceMeters > 0) {
          return {
            ...place,
            distanceFromCenter: distanceResult.distanceMeters,
            googleMapsDistance: {
              meters: distanceResult.distanceMeters,
              text: distanceResult.distanceText,
              durationSeconds: distanceResult.durationSeconds,
              durationText: distanceResult.durationText,
            },
          };
        }
        return place;
      });

      this.logger.debug(
        `Successfully enhanced ${enhancedPlaces.length} places with Google Maps distances`,
      );
      return enhancedPlaces;
    } catch (error) {
      this.logger.warn(
        'Failed to enhance places with Google Maps distances, using existing calculations',
        error,
      );
      return places; // Return original places if Google Maps calculation fails
    }
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
