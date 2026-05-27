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
    }
  }
}
