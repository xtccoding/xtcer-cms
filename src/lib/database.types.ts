export interface Database {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string
          title: string
          content: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          content?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string | null
          created_at?: string
        }
      }
      deals: {
        Row: {
          id: string
          provider: string
          product: string
          price: string
          price_usd: number | null
          price_cny: number | null
          config: string | null
          bandwidth: string | null
          type: string
          target: string
          renewal_price: string | null
          url: string | null
          notes: string | null
          category: string
          region: string
          expiry: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider: string
          product: string
          price: string
          price_usd?: number | null
          price_cny?: number | null
          config?: string | null
          bandwidth?: string | null
          type?: string
          target?: string
          renewal_price?: string | null
          url?: string | null
          notes?: string | null
          category: string
          region?: string
          expiry?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider?: string
          product?: string
          price?: string
          price_usd?: number | null
          price_cny?: number | null
          config?: string | null
          bandwidth?: string | null
          type?: string
          target?: string
          renewal_price?: string | null
          url?: string | null
          notes?: string | null
          category?: string
          region?: string
          expiry?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      feeds: {
        Row: {
          id: string
          feed_type: string
          title: string
          url: string | null
          normalized_url: string | null
          source: string | null
          summary: string | null
          tags: string[] | null
          priority: string
          metadata: Record<string, any> | null
          url_hash: string | null
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          feed_type: string
          title: string
          url?: string | null
          normalized_url?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          priority?: string
          metadata?: Record<string, any> | null
          url_hash?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          feed_type?: string
          title?: string
          url?: string | null
          normalized_url?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          priority?: string
          metadata?: Record<string, any> | null
          url_hash?: string | null
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
