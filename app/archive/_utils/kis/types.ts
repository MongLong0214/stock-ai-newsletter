/**
 * 한국투자증권 OpenAPI 타입 정의
 */

/** Supabase Database 스키마 정의 */
export type Database = {
  public: {
    Tables: {
      kis_tokens: {
        Row: {
          id: string;
          access_token: string;
          expires_at: number;
          updated_at: string;
        };
        Insert: {
          id: string;
          access_token: string;
          expires_at: number;
          updated_at: string;
        };
        Update: {
          id?: string;
          access_token?: string;
          expires_at?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/** KIS 토큰 정보 */
export interface KisToken {
  access_token: string;
  expires_at: number; // Unix timestamp
}

/** KIS 주식 가격 정보 */
export interface KisStockPrice {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
}

/** KIS API 에러 응답 */
export interface KisErrorResponse {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
}

/** KIS 환경 설정 */
export interface KisConfig {
  KIS_BASE_URL: string;
  KIS_APP_KEY: string;
  KIS_APP_SECRET: string;
}

/** Supabase 테이블 타입 별칭 */
export type KisTokenRow = Database['public']['Tables']['kis_tokens']['Row'];
export type KisTokenInsert = Database['public']['Tables']['kis_tokens']['Insert'];