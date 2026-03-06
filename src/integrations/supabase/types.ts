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
      app_activity_events: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      app_bulk_send_logs: {
        Row: {
          body_html: string
          created_at: string
          created_by: string
          entity_type: string
          failed_count: number
          id: string
          recipient_count: number
          sent_count: number
          status: string
          subject: string
        }
        Insert: {
          body_html: string
          created_at?: string
          created_by: string
          entity_type: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_count?: number
          status?: string
          subject: string
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string
          entity_type?: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_count?: number
          status?: string
          subject?: string
        }
        Relationships: []
      }
      app_bulk_send_recipients: {
        Row: {
          bulk_send_id: string
          email: string | null
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          bulk_send_id: string
          email?: string | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          bulk_send_id?: string
          email?: string | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_bulk_send_recipients_bulk_send_id_fkey"
            columns: ["bulk_send_id"]
            isOneToOne: false
            referencedRelation: "app_bulk_send_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_bulk_sms_logs: {
        Row: {
          body_text: string
          created_at: string
          created_by: string
          entity_type: string
          failed_count: number
          id: string
          recipient_count: number
          sent_count: number
          status: string
        }
        Insert: {
          body_text: string
          created_at?: string
          created_by: string
          entity_type: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_count?: number
          status?: string
        }
        Update: {
          body_text?: string
          created_at?: string
          created_by?: string
          entity_type?: string
          failed_count?: number
          id?: string
          recipient_count?: number
          sent_count?: number
          status?: string
        }
        Relationships: []
      }
      app_bulk_sms_recipients: {
        Row: {
          bulk_sms_id: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          phone: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          bulk_sms_id: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          phone?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          bulk_sms_id?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          phone?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_bulk_sms_recipients_bulk_sms_id_fkey"
            columns: ["bulk_sms_id"]
            isOneToOne: false
            referencedRelation: "app_bulk_sms_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      app_campaign_enrollments: {
        Row: {
          campaign_id: string
          cancelled_at: string | null
          completed_at: string | null
          current_step_order: number
          enrolled_at: string
          entity_id: string
          entity_type: string
          id: string
          status: string
        }
        Insert: {
          campaign_id: string
          cancelled_at?: string | null
          completed_at?: string | null
          current_step_order?: number
          enrolled_at?: string
          entity_id: string
          entity_type: string
          id?: string
          status?: string
        }
        Update: {
          campaign_id?: string
          cancelled_at?: string | null
          completed_at?: string | null
          current_step_order?: number
          enrolled_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_campaign_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "app_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      app_campaign_step_logs: {
        Row: {
          channel: string
          created_at: string
          enrollment_id: string
          error_message: string | null
          executed_at: string | null
          id: string
          scheduled_for: string | null
          status: string
          step_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          enrollment_id: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scheduled_for?: string | null
          status?: string
          step_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          enrollment_id?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          scheduled_for?: string | null
          status?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_campaign_step_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "app_campaign_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_campaign_step_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "app_campaign_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      app_campaign_steps: {
        Row: {
          body_html: string | null
          body_text: string | null
          campaign_id: string
          channel: string
          created_at: string
          delay_days: number
          id: string
          signature_id: string | null
          step_order: number
          subject: string | null
          updated_at: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          campaign_id: string
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          signature_id?: string | null
          step_order?: number
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          campaign_id?: string
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          signature_id?: string | null
          step_order?: number
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "app_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      app_campaigns: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          name: string
          on_complete_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          entity_type: string
          id?: string
          is_active?: boolean
          name: string
          on_complete_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          on_complete_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_email_signatures: {
        Row: {
          body_html: string
          created_at: string
          created_by: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          created_by: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_helpscout_settings: {
        Row: {
          app_id: string | null
          app_secret: string | null
          created_at: string
          id: string
          is_active: boolean
          mailbox_id: string | null
          updated_at: string
        }
        Insert: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mailbox_id?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mailbox_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_kanban_config: {
        Row: {
          created_at: string
          entity_type: string
          id: string
          updated_at: string
          user_id: string
          visible_statuses: string[]
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: string
          updated_at?: string
          user_id: string
          visible_statuses?: string[]
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: string
          updated_at?: string
          user_id?: string
          visible_statuses?: string[]
        }
        Relationships: []
      }
      app_notes: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          is_pinned: boolean
          note_content: string
          note_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          id?: string
          is_pinned?: boolean
          note_content: string
          note_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_pinned?: boolean
          note_content?: string
          note_type?: string
          updated_at?: string
        }
        Relationships: []
      }
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
        }
        Relationships: []
      }
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
      current_competitors: {
        Row: {
          accepted_rules: boolean | null
          comp_link: string | null
          created_at: string
          division: string | null
          id: string
          influencer_id: string | null
          pref_name: string | null
        }
        Insert: {
          accepted_rules?: boolean | null
          comp_link?: string | null
          created_at?: string
          division?: string | null
          id?: string
          influencer_id?: string | null
          pref_name?: string | null
        }
        Update: {
          accepted_rules?: boolean | null
          comp_link?: string | null
          created_at?: string
          division?: string | null
          id?: string
          influencer_id?: string | null
          pref_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "current_competitors_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
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
      influencer_platforms: {
        Row: {
          approved_platform: boolean | null
          created_at: string
          follower_count: number | null
          handle: string | null
          id: number
          influencer_id: string
          platform_name: string | null
        }
        Insert: {
          approved_platform?: boolean | null
          created_at?: string
          follower_count?: number | null
          handle?: string | null
          id?: number
          influencer_id: string
          platform_name?: string | null
        }
        Update: {
          approved_platform?: boolean | null
          created_at?: string
          follower_count?: number | null
          handle?: string | null
          id?: number
          influencer_id?: string
          platform_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_platforms_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      influencers: {
        Row: {
          accepted_rules: boolean | null
          additional_info: string | null
          avatar_url: string | null
          comfort_level: string | null
          created_at: string
          email: string
          first_name: string
          fundraising_goal: string | null
          highest_follower_count: number | null
          highest_follower_platform: string | null
          id: string
          is_competing: boolean
          last_name: string
          motivation: string | null
          password: string | null
          past_competitions: Json[] | null
          personal_mission: string | null
          pref_name: string | null
          profile_complete: boolean | null
          state: string
          status: string
          user_id: string | null
          veteran_connection: string | null
          willing_to_share: boolean | null
        }
        Insert: {
          accepted_rules?: boolean | null
          additional_info?: string | null
          avatar_url?: string | null
          comfort_level?: string | null
          created_at?: string
          email: string
          first_name: string
          fundraising_goal?: string | null
          highest_follower_count?: number | null
          highest_follower_platform?: string | null
          id?: string
          is_competing?: boolean
          last_name: string
          motivation?: string | null
          password?: string | null
          past_competitions?: Json[] | null
          personal_mission?: string | null
          pref_name?: string | null
          profile_complete?: boolean | null
          state: string
          status?: string
          user_id?: string | null
          veteran_connection?: string | null
          willing_to_share?: boolean | null
        }
        Update: {
          accepted_rules?: boolean | null
          additional_info?: string | null
          avatar_url?: string | null
          comfort_level?: string | null
          created_at?: string
          email?: string
          first_name?: string
          fundraising_goal?: string | null
          highest_follower_count?: number | null
          highest_follower_platform?: string | null
          id?: string
          is_competing?: boolean
          last_name?: string
          motivation?: string | null
          password?: string | null
          past_competitions?: Json[] | null
          personal_mission?: string | null
          pref_name?: string | null
          profile_complete?: boolean | null
          state?: string
          status?: string
          user_id?: string | null
          veteran_connection?: string | null
          willing_to_share?: boolean | null
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
          source_content_id: string | null
          status: Database["public"]["Enums"]["post_status"]
          tiktok_error: string | null
          tiktok_job_id: string | null
          tiktok_status: string | null
          topic: string
          updated_at: string
          user_id: string
          video_mime_type: string | null
          video_original_filename: string | null
          video_storage_path: string | null
          video_url: string | null
          youtube_comment: string | null
          youtube_comment_error_detail: string | null
          youtube_comment_id: string | null
          youtube_comment_posted_at: string | null
          youtube_comment_status: string | null
          youtube_desc: string | null
          youtube_title: string | null
          youtube_video_id: string | null
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
          source_content_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tiktok_error?: string | null
          tiktok_job_id?: string | null
          tiktok_status?: string | null
          topic: string
          updated_at?: string
          user_id: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_comment?: string | null
          youtube_comment_error_detail?: string | null
          youtube_comment_id?: string | null
          youtube_comment_posted_at?: string | null
          youtube_comment_status?: string | null
          youtube_desc?: string | null
          youtube_title?: string | null
          youtube_video_id?: string | null
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
          source_content_id?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tiktok_error?: string | null
          tiktok_job_id?: string | null
          tiktok_status?: string | null
          topic?: string
          updated_at?: string
          user_id?: string
          video_mime_type?: string | null
          video_original_filename?: string | null
          video_storage_path?: string | null
          video_url?: string | null
          youtube_comment?: string | null
          youtube_comment_error_detail?: string | null
          youtube_comment_id?: string | null
          youtube_comment_posted_at?: string | null
          youtube_comment_status?: string | null
          youtube_desc?: string | null
          youtube_title?: string | null
          youtube_video_id?: string | null
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
          email: string
          id: string
          password: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          password?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          password?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_options: {
        Row: {
          id: number
          role: string | null
        }
        Insert: {
          id?: number
          role?: string | null
        }
        Update: {
          id?: number
          role?: string | null
        }
        Relationships: []
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
      sm_platforms: {
        Row: {
          has_icon: boolean
          id: number
          name: string
        }
        Insert: {
          has_icon?: boolean
          id?: number
          name: string
        }
        Update: {
          has_icon?: boolean
          id?: number
          name?: string
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
          script: string | null
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
          script?: string | null
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
          script?: string | null
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
          status: string
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
          status?: string
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
          status?: string
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
