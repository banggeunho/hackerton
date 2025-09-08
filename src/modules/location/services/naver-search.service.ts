import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { AllConfigType } from '../../../config';

export interface NaverLocalSearchItem {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string; // longitude (경도)
  mapy: string; // latitude (위도)
}

export interface NaverLocalSearchResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: NaverLocalSearchItem[];
}

@Injectable()
export class NaverSearchService {
  private readonly logger = new Logger(NaverSearchService.name);
  private readonly baseUrl = 'https://openapi.naver.com/v1/search/local.json';
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private configService: ConfigService<AllConfigType>) {
    const naverConfig = this.configService.get('naver', { infer: true })!;
    this.clientId = naverConfig.clientId || '';
    this.clientSecret = naverConfig.clientSecret || '';
  }

  /**
   * Search for local places using Naver Local Search API
   * @param query Search query (장소명, 업체명, 주소 등)
   * @param display Number of results to display (1-5, default: 5)
   * @param start Start position (1-1000, default: 1)
   * @param sort Sort order ('random' | 'comment', default: 'random')
   */
  async searchLocal(
    query: string,
    display: number = 5,
    sort: 'random' | 'comment' = 'random',
  ): Promise<NaverLocalSearchResponse> {
    if (!this.clientId || !this.clientSecret) {
      this.logger.warn('Naver API credentials not configured');
      return {
        lastBuildDate: new Date().toISOString(),
        total: 0,
        start: 1,
        display: 0,
        items: [],
      };
    }

    try {
      this.logger.debug(`Searching Naver Local API with query: ${query}`);

      const response: AxiosResponse<NaverLocalSearchResponse> = await axios.get(
        this.baseUrl,
        {
          params: {
            query: query,
            display: display,
            sort,
          },
          headers: {
            'X-Naver-Client-Id': this.clientId,
            'X-Naver-Client-Secret': this.clientSecret,
          },
          timeout: 10000,
        },
      );

      this.logger.debug(
        `Naver Local Search returned ${response.data.items.length} results`,
      );

      return response.data;
    } catch (error) {
      this.logger.error('Naver Local Search API failed', error);

      // Return empty response instead of throwing to allow graceful fallback
      return {
        lastBuildDate: new Date().toISOString(),
        total: 0,
        start: 1,
        display: 0,
        items: [],
      };
    }
  }

  /**
   * Search for places by category near specific coordinates
   * @param category Category keyword (예: 맛집, 카페, 병원)
   * @param address Address or area name for localized search
   * @param display Number of results
   */
  async searchByCategory(
    category: string,
    address?: string,
    display: number = 5,
  ): Promise<NaverLocalSearchResponse> {
    const query = address ? `${address} ${category}` : category;
    return this.searchLocal(query, display, 'random'); // Sort by comment for category searches
  }

  /**
   * Search for specific place types around an address
   * @param placeType Place type (restaurant, cafe, hospital, etc.)
   * @param address Base address for search
   * @param display Number of results
   */
  async searchPlacesByType(
    placeType: string,
    address: string,
    display: number = 5,
  ): Promise<NaverLocalSearchResponse> {
    // Map English place types to Korean for better Naver search results
    const koreanPlaceTypes: { [key: string]: string } = {
      restaurant: '맛집',
      cafe: '카페',
      hospital: '병원',
      pharmacy: '약국',
      bank: '은행',
      gas_station: '주유소',
      parking: '주차장',
      hotel: '호텔',
      shopping: '쇼핑',
      beauty: '미용실',
      gym: '헬스장',
      school: '학교',
    };

    const koreanType = koreanPlaceTypes[placeType] || placeType;
    return this.searchByCategory(koreanType, address, display);
  }

  /**
   * Convert Naver coordinates to standard lat/lng format
   * Naver uses KATECH coordinates that need conversion to WGS84
   */
  convertNaverCoordinates(
    mapx: string,
    mapy: string,
  ): {
    lat: number;
    lng: number;
  } {
    // Naver coordinates are already in decimal degrees (WGS84)
    // but they're returned as strings with implied decimal places
    const lng = parseInt(mapx) / 10000000; // Remove 7 decimal places
    const lat = parseInt(mapy) / 10000000; // Remove 7 decimal places

    return { lat, lng };
  }

  /**
   * Clean HTML tags from Naver search results
   */
  private cleanHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Process Naver search results to clean format
   */
  processNaverResults(
    response: NaverLocalSearchResponse,
  ): NaverLocalSearchItem[] {
    return response.items.map((item) => ({
      ...item,
      title: this.cleanHtmlTags(item.title),
      description: this.cleanHtmlTags(item.description),
      category: this.cleanHtmlTags(item.category),
    }));
  }
}
