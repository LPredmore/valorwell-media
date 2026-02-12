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
      content_jobs: {
        Row: {
          created_at: string
          error: string | null
          format: string
          id: string
          image_url_16x9: string | null
          image_url_9x16: string | null
          status: string
          topic: string
          updated_at: string
          user_id: string | null
          video_duration_seconds: number | null
          video_mime_type: string | null
          video_original_filename: string | null
          video_public_url: string | null
          video_storage_path: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          format?: string
          id?: string
          image_url_16x9?: string | null
          image_url_9x16?: string | null
          status?: string
          topic: string
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_public_url?: string | null
          video_storage_path?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          format?: string
          id?: string
          image_url_16x9?: string | null
          image_url_9x16?: string | null
          status?: string
          topic?: string
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_public_url?: string | null
          video_storage_path?: string | null
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
      image_instructions: {
        Row: {
          aspect_ratio: string
          created_at: string
          id: number
          instruction: string
          is_active: boolean
          updated_at: string
          version: number
        }
        Insert: {
          aspect_ratio: string
          created_at?: string
          id?: number
          instruction: string
          is_active?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          id?: number
          instruction?: string
          is_active?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      platform_instructions: {
        Row: {
          component: string
          created_at: string
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
      platform_outputs: {
        Row: {
          body: string | null
          created_at: string
          error: string | null
          hashtags: string[] | null
          id: string
          job_id: string
          platform: string
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          error?: string | null
          hashtags?: string[] | null
          id?: string
          job_id: string
          platform: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          error?: string | null
          hashtags?: string[] | null
          id?: string
          job_id?: string
          platform?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_outputs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "content_jobs"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
