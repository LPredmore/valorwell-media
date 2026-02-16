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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      content_instructions: {
        Row: {
          created_at: string
          id: number
          instruction: string
          is_active: boolean
          scope: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: never
          instruction: string
          is_active?: boolean
          scope: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: never
          instruction?: string
          is_active?: boolean
          scope?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      creator_applications: {
        Row: {
          additional_info: string | null
          comfort_level: string | null
          created_at: string
          email: string
          first_name: string
          fundraising_goal: string | null
          id: string
          last_name: string
          motivation: string | null
          social_profiles: Json | null
          state: string
          status: string
          veteran_connection: string | null
          willing_to_share: boolean | null
        }
        Insert: {
          additional_info?: string | null
          comfort_level?: string | null
          created_at?: string
          email: string
          first_name: string
          fundraising_goal?: string | null
          id?: string
          last_name: string
          motivation?: string | null
          social_profiles?: Json | null
          state: string
          status?: string
          veteran_connection?: string | null
          willing_to_share?: boolean | null
        }
        Update: {
          additional_info?: string | null
          comfort_level?: string | null
          created_at?: string
          email?: string
          first_name?: string
          fundraising_goal?: string | null
          id?: string
          last_name?: string
          motivation?: string | null
          social_profiles?: Json | null
          state?: string
          status?: string
          veteran_connection?: string | null
          willing_to_share?: boolean | null
        }
        Relationships: []
      }
      donation_attribution: {
        Row: {
          created_at: string
          gbraid: string | null
          gclid: string | null
          token: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          wbraid: string | null
        }
        Insert: {
          created_at?: string
          gbraid?: string | null
          gclid?: string | null
          token: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Update: {
          created_at?: string
          gbraid?: string | null
          gclid?: string | null
          token?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          wbraid?: string | null
        }
        Relationships: []
      }
      givebutter_donations: {
        Row: {
          ads_exported_at: string | null
          ads_upload_error: string | null
          ads_upload_status: string
          ads_uploaded_at: string | null
          amount: number
          currency: string
          donated_at: string
          raw: Json
          token: string | null
          transaction_id: string
        }
        Insert: {
          ads_exported_at?: string | null
          ads_upload_error?: string | null
          ads_upload_status?: string
          ads_uploaded_at?: string | null
          amount: number
          currency?: string
          donated_at: string
          raw: Json
          token?: string | null
          transaction_id: string
        }
        Update: {
          ads_exported_at?: string | null
          ads_upload_error?: string | null
          ads_upload_status?: string
          ads_uploaded_at?: string | null
          amount?: number
          currency?: string
          donated_at?: string
          raw?: Json
          token?: string | null
          transaction_id?: string
        }
        Relationships: []
      }
      platform_instructions: {
        Row: {
          component: string
          created_at: string
          hashtag_max: number | null
          hashtag_min: number | null
          id: number
          instruction: string
          is_active: boolean
          platform: string
          preferred_aspect_ratio: string
          updated_at: string
          version: number
        }
        Insert: {
          component: string
          created_at?: string
          hashtag_max?: number | null
          hashtag_min?: number | null
          id?: number
          instruction: string
          is_active?: boolean
          platform: string
          preferred_aspect_ratio?: string
          updated_at?: string
          version?: number
        }
        Update: {
          component?: string
          created_at?: string
          hashtag_max?: number | null
          hashtag_min?: number | null
          id?: number
          instruction?: string
          is_active?: boolean
          platform?: string
          preferred_aspect_ratio?: string
          updated_at?: string
          version?: number
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
          playlist_id: number | null
          post_length: Database["public"]["Enums"]["video_length"] | null
          post_title: string | null
          posted_at: string | null
          scheduled_at: string | null
          scheduled_platforms: string[] | null
          status: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at: string
          user_id: string
          video_mime_type: string | null
          video_original_filename: string | null
          video_storage_path: string | null
          video_url: string | null
          youtube_desc: string | null
          youtube_title: string | null
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
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          status?: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at?: string
          user_id: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_title?: string | null
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
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          status?: Database["public"]["Enums"]["post_status"]
          topic?: string
          updated_at?: string
          user_id?: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_desc?: string | null
          youtube_title?: string | null
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
      site_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
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
          playlist_id: number | null
          post_length: Database["public"]["Enums"]["video_length"] | null
          post_title: string | null
          posted_at: string | null
          scheduled_at: string | null
          scheduled_platforms: string[] | null
          status: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at: string
          upload_at: string | null
          user_id: string
          video_mime_type: string | null
          video_original_filename: string | null
          video_size_bytes: number | null
          video_storage_path: string | null
          video_url: string | null
          youtube_comment: string | null
          youtube_comment_error_detail: string | null
          youtube_comment_id: string | null
          youtube_comment_posted_at: string | null
          youtube_comment_status: string | null
          youtube_desc: string | null
          youtube_error_detail: string | null
          youtube_status: string | null
          youtube_title: string | null
          youtube_uploaded_at: string | null
          youtube_video_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          linkedin_desc?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          status?: Database["public"]["Enums"]["post_status"]
          topic: string
          updated_at?: string
          upload_at?: string | null
          user_id: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_comment?: string | null
          youtube_comment_error_detail?: string | null
          youtube_comment_id?: string | null
          youtube_comment_posted_at?: string | null
          youtube_comment_status?: string | null
          youtube_desc?: string | null
          youtube_error_detail?: string | null
          youtube_status?: string | null
          youtube_title?: string | null
          youtube_uploaded_at?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          facebook_desc?: string | null
          id?: string
          ig_tiktok_desc?: string | null
          image?: string | null
          linkedin_desc?: string | null
          playlist_id?: number | null
          post_length?: Database["public"]["Enums"]["video_length"] | null
          post_title?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          scheduled_platforms?: string[] | null
          status?: Database["public"]["Enums"]["post_status"]
          topic?: string
          updated_at?: string
          upload_at?: string | null
          user_id?: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_comment?: string | null
          youtube_comment_error_detail?: string | null
          youtube_comment_id?: string | null
          youtube_comment_posted_at?: string | null
          youtube_comment_status?: string | null
          youtube_desc?: string | null
          youtube_error_detail?: string | null
          youtube_status?: string | null
          youtube_title?: string | null
          youtube_uploaded_at?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_content_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      support_session_inquiries: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          seeking_care: string
          service_type: string
          state: string
          status: string
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          seeking_care: string
          service_type?: string
          state: string
          status?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          seeking_care?: string
          service_type?: string
          state?: string
          status?: string
        }
        Relationships: []
      }
      therapist_applications: {
        Row: {
          created_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          license_type: string
          licensed_states: string[]
          motivation: string
          phone: string
          referral_source: string
          telehealth_experience: boolean
          weekly_hours: string
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          license_type: string
          licensed_states: string[]
          motivation: string
          phone: string
          referral_source: string
          telehealth_experience: boolean
          weekly_hours: string
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          license_type?: string
          licensed_states?: string[]
          motivation?: string
          phone?: string
          referral_source?: string
          telehealth_experience?: boolean
          weekly_hours?: string
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
          channel_id: string | null
          channel_title: string | null
          created_at: string
          google_email: string | null
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          channel_title?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          channel_title?: string | null
          created_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_cron_http_log: {
        Row: {
          created_at: string
          id: number
          request_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          request_id: number
        }
        Update: {
          created_at?: string
          id?: number
          request_id?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      kick_youtube_run_due: { Args: never; Returns: undefined }
      reset_stuck_youtube_uploads: {
        Args: { minutes_stuck?: number }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      post_status: "incomplete" | "unscheduled" | "scheduled" | "posted"
      video_length: "Short" | "Long"
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
      app_role: ["admin", "user"],
      post_status: ["incomplete", "unscheduled", "scheduled", "posted"],
      video_length: ["Short", "Long"],
    },
  },
} as const
