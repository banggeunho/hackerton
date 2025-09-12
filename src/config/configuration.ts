export interface AppConfig {
  port: number;
  nodeEnv: string;
}

export interface AwsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface KakaoConfig {
  restApiKey?: string;
}

export interface NaverConfig {
  clientId?: string;
  clientSecret?: string;
}

export interface GoogleConfig {
  mapsApiKey?: string;
}

export interface AllConfigType {
  app: AppConfig;
  aws: AwsConfig;
  kakao: KakaoConfig;
  naver: NaverConfig;
  google: GoogleConfig;
}

export default (): AllConfigType => ({
  app: {
    port: parseInt(process.env.PORT as string, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  aws: {
    region: process.env.AWS_REGION || 'ap-northeast-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  kakao: {
    restApiKey: process.env.KAKAO_REST_API_KEY,
  },
  naver: {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
  },
  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
});
