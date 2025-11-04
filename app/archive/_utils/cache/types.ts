/**
 * 주식 가격 캐시 타입 정의
 */

/** Supabase Database 스키마 정의 (stock_price_cache 테이블) */
export type StockPriceCacheDatabase = {
  public: {
    Tables: {
      stock_price_cache: {
        Row: {
          ticker: string;
          current_price: number;
          previous_close: number;
          change_rate: number;
          volume: number;
          timestamp: number;
          expires_at: number; // Unix timestamp
          updated_at: string; // ISO 8601 timestamp
        };
        Insert: {
          ticker: string;
          current_price: number;
          previous_close: number;
          change_rate: number;
          volume: number;
          timestamp: number;
          expires_at: number;
          updated_at: string;
        };
        Update: {
          ticker?: string;
          current_price?: number;
          previous_close?: number;
          change_rate?: number;
          volume?: number;
          timestamp?: number;
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

/** 주식 가격 캐시 데이터 */
export interface StockPriceCache {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  changeRate: number;
  volume: number;
  timestamp: number;
  expires_at: number; // Unix timestamp
}

/** Supabase 테이블 타입 별칭 */
export type StockPriceCacheRow = StockPriceCacheDatabase['public']['Tables']['stock_price_cache']['Row'];
export type StockPriceCacheInsert = StockPriceCacheDatabase['public']['Tables']['stock_price_cache']['Insert'];