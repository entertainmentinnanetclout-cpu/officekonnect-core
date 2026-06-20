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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          metadata: Json
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: Database["public"]["Enums"]["billing_event_type"]
          id: string
          metadata: Json
          subscription_id: string
          workspace_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: Database["public"]["Enums"]["billing_event_type"]
          id?: string
          metadata?: Json
          subscription_id: string
          workspace_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: Database["public"]["Enums"]["billing_event_type"]
          id?: string
          metadata?: Json
          subscription_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          clicked: boolean
          contact_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          id: string
          message_id: string | null
          opened: boolean
          sent_at: string | null
        }
        Insert: {
          campaign_id: string
          clicked?: boolean
          contact_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          message_id?: string | null
          opened?: boolean
          sent_at?: string | null
        }
        Update: {
          campaign_id?: string
          clicked?: boolean
          contact_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          message_id?: string | null
          opened?: boolean
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_group_members: {
        Row: {
          contact_id: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_group_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string
          custom_fields: Json
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by: string
          custom_fields?: Json
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_provider: Database["public"]["Enums"]["push_provider"]
          push_token: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_provider: Database["public"]["Enums"]["push_provider"]
          push_token: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          push_provider?: Database["public"]["Enums"]["push_provider"]
          push_token?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_metadata: {
        Row: {
          checksum: string | null
          created_at: string
          document_id: string
          extracted_at: string | null
          extracted_fields: Json
          id: string
          language: string | null
          mime_type: string | null
          ocr_text: string | null
          page_count: number | null
          preview_urls: Json
          thumbnail_url: string | null
          updated_at: string
          word_count: number | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          document_id: string
          extracted_at?: string | null
          extracted_fields?: Json
          id?: string
          language?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          page_count?: number | null
          preview_urls?: Json
          thumbnail_url?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          document_id?: string
          extracted_at?: string | null
          extracted_fields?: Json
          id?: string
          language?: string | null
          mime_type?: string | null
          ocr_text?: string | null
          page_count?: number | null
          preview_urls?: Json
          thumbnail_url?: string | null
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_metadata_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          created_at: string
          document_id: string
          height: number
          id: string
          page_number: number
          signature_id: string
          width: number
          x_position: number
          y_position: number
        }
        Insert: {
          created_at?: string
          document_id: string
          height: number
          id?: string
          page_number: number
          signature_id: string
          width: number
          x_position: number
          y_position: number
        }
        Update: {
          created_at?: string
          document_id?: string
          height?: number
          id?: string
          page_number?: number
          signature_id?: string
          width?: number
          x_position?: number
          y_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "user_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          file_url: string
          id: string
          storage_path: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          file_url: string
          id?: string
          storage_path?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          file_url?: string
          id?: string
          storage_path?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string
          current_file_url: string | null
          description: string | null
          document_status: Database["public"]["Enums"]["document_status"]
          file_size: number | null
          file_type: string | null
          id: string
          original_file_url: string | null
          page_count: number | null
          storage_path: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_file_url?: string | null
          description?: string | null
          document_status?: Database["public"]["Enums"]["document_status"]
          file_size?: number | null
          file_type?: string | null
          id?: string
          original_file_url?: string | null
          page_count?: number | null
          storage_path?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_file_url?: string | null
          description?: string | null
          document_status?: Database["public"]["Enums"]["document_status"]
          file_size?: number | null
          file_type?: string | null
          id?: string
          original_file_url?: string | null
          page_count?: number | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          campaign_name: string
          campaign_status: Database["public"]["Enums"]["campaign_status"]
          created_at: string
          created_by: string
          emails_clicked: number
          emails_opened: number
          emails_sent: number
          id: string
          scheduled_for: string | null
          template_id: string | null
          total_recipients: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          campaign_name: string
          campaign_status?: Database["public"]["Enums"]["campaign_status"]
          created_at?: string
          created_by: string
          emails_clicked?: number
          emails_opened?: number
          emails_sent?: number
          id?: string
          scheduled_for?: string | null
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          campaign_name?: string
          campaign_status?: Database["public"]["Enums"]["campaign_status"]
          created_at?: string
          created_by?: string
          emails_clicked?: number
          emails_opened?: number
          emails_sent?: number
          id?: string
          scheduled_for?: string | null
          template_id?: string | null
          total_recipients?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string
          created_by: string
          html_body: string
          id: string
          merge_tags: Json
          name: string
          plain_body: string | null
          subject: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          html_body: string
          id?: string
          merge_tags?: Json
          name: string
          plain_body?: string | null
          subject: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          html_body?: string
          id?: string
          merge_tags?: Json
          name?: string
          plain_body?: string | null
          subject?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          error: Json | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["job_kind"]
          max_attempts: number
          output: Json | null
          priority: number
          provider: string | null
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: Json | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind: Database["public"]["Enums"]["job_kind"]
          max_attempts?: number
          output?: Json | null
          priority?: number
          provider?: string | null
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error?: Json | null
          finished_at?: string | null
          id?: string
          input?: Json
          kind?: Database["public"]["Enums"]["job_kind"]
          max_attempts?: number
          output?: Json | null
          priority?: number
          provider?: string | null
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      letterheads: {
        Row: {
          company_details: Json
          created_at: string
          created_by: string
          file_url: string | null
          footer_content: string | null
          header_content: string | null
          id: string
          logo_url: string | null
          name: string
          storage_path: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_details?: Json
          created_at?: string
          created_by: string
          file_url?: string | null
          footer_content?: string | null
          header_content?: string | null
          id?: string
          logo_url?: string | null
          name: string
          storage_path?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_details?: Json
          created_at?: string
          created_by?: string
          file_url?: string | null
          footer_content?: string | null
          header_content?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letterheads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          delivered_channels: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          title: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          delivered_channels?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          title: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          delivered_channels?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          title?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          features: Json
          max_campaigns_per_month: number
          max_contacts: number
          max_documents: number
          max_members: number
          max_signatures: number
          max_storage_mb: number
          max_voice_minutes_per_month: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at: string
        }
        Insert: {
          features?: Json
          max_campaigns_per_month: number
          max_contacts: number
          max_documents: number
          max_members: number
          max_signatures: number
          max_storage_mb: number
          max_voice_minutes_per_month: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
        }
        Update: {
          features?: Json
          max_campaigns_per_month?: number
          max_contacts?: number
          max_documents?: number
          max_members?: number
          max_signatures?: number
          max_storage_mb?: number
          max_voice_minutes_per_month?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          default_workspace_id: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          last_login: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          default_workspace_id?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          last_login?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          default_workspace_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          last_login?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          created_at: string
          expires_at: string | null
          id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          provider: string
          result: Json | null
          status: Database["public"]["Enums"]["transcription_status"]
          updated_at: string
          voice_note_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          provider?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["transcription_status"]
          updated_at?: string
          voice_note_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          provider?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["transcription_status"]
          updated_at?: string
          voice_note_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_voice_note_id_fkey"
            columns: ["voice_note_id"]
            isOneToOne: false
            referencedRelation: "voice_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_metrics: {
        Row: {
          campaigns_count: number
          contacts_count: number
          created_at: string
          documents_count: number
          id: string
          period_month: string
          signatures_count: number
          storage_mb: number
          updated_at: string
          voice_minutes: number
          workspace_id: string
        }
        Insert: {
          campaigns_count?: number
          contacts_count?: number
          created_at?: string
          documents_count?: number
          id?: string
          period_month?: string
          signatures_count?: number
          storage_mb?: number
          updated_at?: string
          voice_minutes?: number
          workspace_id: string
        }
        Update: {
          campaigns_count?: number
          contacts_count?: number
          created_at?: string
          documents_count?: number
          id?: string
          period_month?: string
          signatures_count?: number
          storage_mb?: number
          updated_at?: string
          voice_minutes?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token_secret_id: string | null
          account_email: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          metadata: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_secret_id: string | null
          scopes: string[]
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          access_token_secret_id?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token_secret_id?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          access_token_secret_id?: string | null
          account_email?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token_secret_id?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_signatures: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_default: boolean
          name: string
          signature_image_url: string
          storage_path: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_default?: boolean
          name: string
          signature_image_url: string
          storage_path?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_default?: boolean
          name?: string
          signature_image_url?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_signatures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_notes: {
        Row: {
          audio_url: string
          created_at: string
          created_by: string
          duration_seconds: number | null
          id: string
          storage_path: string | null
          title: string | null
          transcript: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          audio_url: string
          created_at?: string
          created_by: string
          duration_seconds?: number | null
          id?: string
          storage_path?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          audio_url?: string
          created_at?: string
          created_by?: string
          duration_seconds?: number | null
          id?: string
          storage_path?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_personal: boolean
          name: string
          owner_id: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_personal?: boolean
          name: string
          owner_id: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_personal?: boolean
          name?: string
          owner_id?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_jobs: {
        Args: {
          p_kinds?: Database["public"]["Enums"]["job_kind"][]
          p_limit?: number
        }
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          error: Json | null
          finished_at: string | null
          id: string
          input: Json
          kind: Database["public"]["Enums"]["job_kind"]
          max_attempts: number
          output: Json | null
          priority: number
          provider: string | null
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["workspace_role"]
          _workspace_id: string
        }
        Returns: boolean
      }
      is_campaign_member: { Args: { _campaign_id: string }; Returns: boolean }
      is_document_member: { Args: { _doc_id: string }; Returns: boolean }
      is_group_member: { Args: { _group_id: string }; Returns: boolean }
      is_voice_member: { Args: { _vn_id: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      billing_event_type:
        | "created"
        | "renewed"
        | "upgraded"
        | "downgraded"
        | "canceled"
        | "payment_succeeded"
        | "payment_failed"
        | "refunded"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "completed"
        | "failed"
      delivery_status:
        | "pending"
        | "sent"
        | "delivered"
        | "opened"
        | "clicked"
        | "bounced"
        | "failed"
        | "complained"
      device_platform: "ios" | "android" | "web" | "macos" | "windows" | "linux"
      document_status:
        | "draft"
        | "signed"
        | "converted"
        | "sent"
        | "archived"
        | "deleted"
      integration_provider:
        | "google_drive"
        | "dropbox"
        | "onedrive"
        | "stripe"
        | "brevo"
        | "openai"
        | "cloudconvert"
        | "adobe_pdf"
        | "slack"
        | "microsoft_graph"
      job_kind:
        | "document_convert"
        | "document_export"
        | "letterhead_generate"
        | "email_campaign_send"
        | "audio_transcribe"
        | "contact_import"
        | "contact_export"
        | "signature_apply"
      job_status: "queued" | "running" | "succeeded" | "failed" | "canceled"
      notification_kind:
        | "job_succeeded"
        | "job_failed"
        | "campaign_completed"
        | "transcription_ready"
        | "member_invited"
        | "quota_warning"
        | "document_shared"
        | "system"
      push_provider: "fcm" | "apns" | "web_push" | "expo"
      subscription_plan: "free" | "professional" | "business"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "expired"
      transcription_status: "pending" | "processing" | "completed" | "failed"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
      billing_event_type: [
        "created",
        "renewed",
        "upgraded",
        "downgraded",
        "canceled",
        "payment_succeeded",
        "payment_failed",
        "refunded",
      ],
      campaign_status: ["draft", "scheduled", "sending", "completed", "failed"],
      delivery_status: [
        "pending",
        "sent",
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "failed",
        "complained",
      ],
      device_platform: ["ios", "android", "web", "macos", "windows", "linux"],
      document_status: [
        "draft",
        "signed",
        "converted",
        "sent",
        "archived",
        "deleted",
      ],
      integration_provider: [
        "google_drive",
        "dropbox",
        "onedrive",
        "stripe",
        "brevo",
        "openai",
        "cloudconvert",
        "adobe_pdf",
        "slack",
        "microsoft_graph",
      ],
      job_kind: [
        "document_convert",
        "document_export",
        "letterhead_generate",
        "email_campaign_send",
        "audio_transcribe",
        "contact_import",
        "contact_export",
        "signature_apply",
      ],
      job_status: ["queued", "running", "succeeded", "failed", "canceled"],
      notification_kind: [
        "job_succeeded",
        "job_failed",
        "campaign_completed",
        "transcription_ready",
        "member_invited",
        "quota_warning",
        "document_shared",
        "system",
      ],
      push_provider: ["fcm", "apns", "web_push", "expo"],
      subscription_plan: ["free", "professional", "business"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "expired",
      ],
      transcription_status: ["pending", "processing", "completed", "failed"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
