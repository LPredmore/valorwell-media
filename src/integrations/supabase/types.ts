export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      content_ideas: {
        Row: {
          avatar: string | null
          category: string | null
          created_at: string
          id: number
          length: Database["public"]["Enums"]["video_length"] | null
          planned_date: string | null
          playlist_id: number | null
          topic: string | null
          user_id: string
        }
        Insert: {
          avatar?: string | null
          category?: string | null
          created_at?: string
          id?: number
          length?: Database["public"]["Enums"]["video_length"] | null
          planned_date?: string | null
          playlist_id?: number | null
          topic?: string | null
          user_id: string
        }
        Update: {
          avatar?: string | null
          category?: string | null
          created_at?: string
          id?: number
          length?: Database["public"]["Enums"]["video_length"] | null
          planned_date?: string | null
          playlist_id?: number | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      content_instruction_defaults: {
        Row: {
          instruction: string
          scope: string
          updated_at: string
        }
        Insert: {
          instruction: string
          scope: string
          updated_at?: string
        }
        Update: {
          instruction?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_connections: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          account_email: string | null
          account_name: string | null
          connected_at: string
          member_urn: string | null
          refresh_token_encrypted: string
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          account_email?: string | null
          account_name?: string | null
          connected_at?: string
          member_urn?: string | null
          refresh_token_encrypted: string
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          account_email?: string | null
          account_name?: string | null
          connected_at?: string
          member_urn?: string | null
          refresh_token_encrypted?: string
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      playlists: {
        Row: {
          created_at: string
          id: number
          playlist_title: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          playlist_title?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          playlist_title?: string | null
        }
        Relationships: []
      }
      posted_content: {
        Row: {
          created_at: string
          error: string | null
          facebook_desc: string | null
          id: string
          ig_tiktok_desc: string | null
          image: string | null
          image_url: string | null
          linkedin_desc: string | null
          linkedin_native_error_detail: string | null
          linkedin_native_post_urn: string | null
          linkedin_native_status: string | null
          linkedin_via: string | null
          parent_content_id: string | null
          planned_date: string | null
          playlist_id: number | null
          post_length: Database["public"]["Enums"]["video_length"] | null
          post_title: string | null
          posted_at: string | null
          reddit_native_error_detail: string | null
          reddit_native_post_id: string | null
          reddit_native_status: string | null
          reddit_subreddit: string | null
          reddit_via: string | null
          scheduled_at: string | null
          scheduled_platforms: string[] | null
          source_content_id: string | null
          status: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at: string
          upload_post_request_id: string | null
          upload_post_results: Json | null
          upload_post_status: string | null
          user_id: string
          video_mime_type: string | null
          video_original_filename: string | null
          video_storage_path: string | null
          video_url: string | null
          youtube_desc: string | null
          youtube_native_error_detail: string | null
          youtube_native_status: string | null
          youtube_native_uploaded_at: string | null
          youtube_native_video_id: string | null
          youtube_title: string | null
          youtube_via: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          image_url?: string | null
          linkedin_desc?: string | null
          linkedin_native_error_detail?: string | null
          linkedin_native_post_urn?: string | null
          linkedin_native_status?: string | null
          linkedin_via?: string | null
          parent_content_id?: string | null
          planned_date?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          reddit_native_error_detail?: string | null
          reddit_native_post_id?: string | null
          reddit_native_status?: string | null
          reddit_subreddit?: string | null
          reddit_via?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          source_content_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at?: string
          upload_post_request_id?: string | null
          upload_post_results?: Json | null
          upload_post_status?: string | null
          user_id: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_native_error_detail?: string | null
          youtube_native_status?: string | null
          youtube_native_uploaded_at?: string | null
          youtube_native_video_id?: string | null
          youtube_title?: string | null
          youtube_via?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          image_url?: string | null
          linkedin_desc?: string | null
          linkedin_native_error_detail?: string | null
          linkedin_native_post_urn?: string | null
          linkedin_native_status?: string | null
          linkedin_via?: string | null
          parent_content_id?: string | null
          planned_date?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          reddit_native_error_detail?: string | null
          reddit_native_post_id?: string | null
          reddit_native_status?: string | null
          reddit_subreddit?: string | null
          reddit_via?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          source_content_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic?: string
          updated_at?: string
          upload_post_request_id?: string | null
          upload_post_results?: Json | null
          upload_post_status?: string | null
          user_id?: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_native_error_detail?: string | null
          youtube_native_status?: string | null
          youtube_native_uploaded_at?: string | null
          youtube_native_video_id?: string | null
          youtube_title?: string | null
          youtube_via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posted_content_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          onboarding_completed: boolean
          password: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          onboarding_completed?: boolean
          password?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          onboarding_completed?: boolean
          password?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reddit_connections: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          connected_at: string
          default_subreddit: string | null
          reddit_username: string | null
          refresh_token_encrypted: string
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          default_subreddit?: string | null
          reddit_username?: string | null
          refresh_token_encrypted: string
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          default_subreddit?: string | null
          reddit_username?: string | null
          refresh_token_encrypted?: string
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_content: {
        Row: {
          created_at: string
          error: string | null
          facebook_desc: string | null
          id: string
          ig_tiktok_desc: string | null
          image: string | null
          linkedin_desc: string | null
          linkedin_native_error_detail: string | null
          linkedin_native_post_urn: string | null
          linkedin_native_status: string | null
          linkedin_via: string | null
          parent_content_id: string | null
          planned_date: string | null
          playlist_id: number | null
          post_length: Database["public"]["Enums"]["video_length"] | null
          post_title: string | null
          posted_at: string | null
          reddit_native_error_detail: string | null
          reddit_native_post_id: string | null
          reddit_native_status: string | null
          reddit_subreddit: string | null
          reddit_via: string | null
          scheduled_at: string | null
          scheduled_platforms: string[] | null
          script: string | null
          status: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at: string
          upload_post_request_id: string | null
          upload_post_results: Json | null
          upload_post_status: string | null
          user_id: string
          video_mime_type: string | null
          video_original_filename: string | null
          video_size_bytes: number | null
          video_storage_path: string | null
          video_url: string | null
          youtube_desc: string | null
          youtube_native_error_detail: string | null
          youtube_native_status: string | null
          youtube_native_uploaded_at: string | null
          youtube_native_video_id: string | null
          youtube_via: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          linkedin_desc?: string | null
          linkedin_native_error_detail?: string | null
          linkedin_native_post_urn?: string | null
          linkedin_native_status?: string | null
          linkedin_via?: string | null
          parent_content_id?: string | null
          planned_date?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          reddit_native_error_detail?: string | null
          reddit_native_post_id?: string | null
          reddit_native_status?: string | null
          reddit_subreddit?: string | null
          reddit_via?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          script?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at?: string
          upload_post_request_id?: string | null
          upload_post_results?: Json | null
          upload_post_status?: string | null
          user_id: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_native_error_detail?: string | null
          youtube_native_status?: string | null
          youtube_native_uploaded_at?: string | null
          youtube_native_video_id?: string | null
          youtube_via?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          linkedin_desc?: string | null
          linkedin_native_error_detail?: string | null
          linkedin_native_post_urn?: string | null
          linkedin_native_status?: string | null
          linkedin_via?: string | null
          parent_content_id?: string | null
          planned_date?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          reddit_native_error_detail?: string | null
          reddit_native_post_id?: string | null
          reddit_native_status?: string | null
          reddit_subreddit?: string | null
          reddit_via?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          script?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          topic?: string
          updated_at?: string
          upload_post_request_id?: string | null
          upload_post_results?: Json | null
          upload_post_status?: string | null
          user_id?: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_native_error_detail?: string | null
          youtube_native_status?: string | null
          youtube_native_uploaded_at?: string | null
          youtube_native_video_id?: string | null
          youtube_via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_content_parent_content_id_fkey"
            columns: ["parent_content_id"]
            isOneToOne: false
            referencedRelation: "social_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_content_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      upload_post_profiles: {
        Row: {
          connected_platforms: Json
          created_at: string
          last_synced_at: string | null
          provisioning_error: string | null
          provisioning_status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          connected_platforms?: Json
          created_at?: string
          last_synced_at?: string | null
          provisioning_error?: string | null
          provisioning_status?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          connected_platforms?: Json
          created_at?: string
          last_synced_at?: string | null
          provisioning_error?: string | null
          provisioning_status?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_content_instructions: {
        Row: {
          instruction: string
          is_active: boolean
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          instruction: string
          is_active?: boolean
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          instruction?: string
          is_active?: boolean
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_knowledge_files: {
        Row: {
          created_at: string
          error: string | null
          extracted_text: string | null
          file_name: string
          id: string
          is_active: boolean
          mime_type: string
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          file_name: string
          id?: string
          is_active?: boolean
          mime_type: string
          size_bytes?: number
          status?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          file_name?: string
          id?: string
          is_active?: boolean
          mime_type?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      youtube_connections: {
        Row: {
          access_token: string | null
          access_token_expires_at: string | null
          channel_handle: string | null
          channel_id: string | null
          channel_title: string | null
          connected_at: string
          google_account_email: string | null
          refresh_token_encrypted: string
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_handle?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string
          google_account_email?: string | null
          refresh_token_encrypted: string
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          access_token_expires_at?: string | null
          channel_handle?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string
          google_account_email?: string | null
          refresh_token_encrypted?: string
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      linkedin_connections_public: {
        Row: {
          account_email: string | null
          account_name: string | null
          connected_at: string | null
          member_urn: string | null
          scopes: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_email?: string | null
          account_name?: string | null
          connected_at?: string | null
          member_urn?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_email?: string | null
          account_name?: string | null
          connected_at?: string | null
          member_urn?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reddit_connections_public: {
        Row: {
          connected_at: string | null
          default_subreddit: string | null
          reddit_username: string | null
          scopes: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          default_subreddit?: string | null
          reddit_username?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          default_subreddit?: string | null
          reddit_username?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      youtube_connections_public: {
        Row: {
          channel_handle: string | null
          channel_id: string | null
          channel_title: string | null
          connected_at: string | null
          google_account_email: string | null
          scopes: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          channel_handle?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string | null
          google_account_email?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          channel_handle?: string | null
          channel_id?: string | null
          channel_title?: string | null
          connected_at?: string | null
          google_account_email?: string | null
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "influencer"
      post_status:
        | "incomplete"
        | "unscheduled"
        | "scheduled"
        | "posted"
        | "scripted"
      video_length: "Short" | "Long" | "Both"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "influencer"],
      post_status: [
        "incomplete",
        "unscheduled",
        "scheduled",
        "posted",
        "scripted",
      ],
      video_length: ["Short", "Long", "Both"],
    },
  },
} as const
