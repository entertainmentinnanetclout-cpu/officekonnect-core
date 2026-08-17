export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: unknown;
          metadata: Json;
          user_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: {
          amount: number | null;
          created_at: string;
          currency: string | null;
          event_type: Database["public"]["Enums"]["billing_event_type"];
          id: string;
          metadata: Json;
          subscription_id: string;
          workspace_id: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          event_type: Database["public"]["Enums"]["billing_event_type"];
          id?: string;
          metadata?: Json;
          subscription_id: string;
          workspace_id: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          currency?: string | null;
          event_type?: Database["public"]["Enums"]["billing_event_type"];
          id?: string;
          metadata?: Json;
          subscription_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_events_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_recipients: {
        Row: {
          campaign_id: string;
          clicked: boolean;
          contact_id: string;
          created_at: string;
          delivery_status: Database["public"]["Enums"]["delivery_status"];
          id: string;
          message_id: string | null;
          opened: boolean;
          sent_at: string | null;
        };
        Insert: {
          campaign_id: string;
          clicked?: boolean;
          contact_id: string;
          created_at?: string;
          delivery_status?: Database["public"]["Enums"]["delivery_status"];
          id?: string;
          message_id?: string | null;
          opened?: boolean;
          sent_at?: string | null;
        };
        Update: {
          campaign_id?: string;
          clicked?: boolean;
          contact_id?: string;
          created_at?: string;
          delivery_status?: Database["public"]["Enums"]["delivery_status"];
          id?: string;
          message_id?: string | null;
          opened?: boolean;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey";
            columns: ["campaign_id"];
            isOneToOne: false;
            referencedRelation: "email_campaigns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_group_members: {
        Row: {
          contact_id: string;
          created_at: string;
          group_id: string;
          id: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          group_id: string;
          id?: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          group_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_group_members_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "contact_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_groups: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_groups_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          company: string | null;
          created_at: string;
          created_by: string;
          custom_fields: Json;
          email: string | null;
          first_name: string | null;
          id: string;
          last_name: string | null;
          phone: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          created_by: string;
          custom_fields?: Json;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          phone?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          created_by?: string;
          custom_fields?: Json;
          email?: string | null;
          first_name?: string | null;
          id?: string;
          last_name?: string | null;
          phone?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          app_version: string | null;
          created_at: string;
          device_name: string | null;
          id: string;
          is_active: boolean;
          last_seen_at: string;
          platform: Database["public"]["Enums"]["device_platform"];
          push_provider: Database["public"]["Enums"]["push_provider"];
          push_token: string;
          updated_at: string;
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string;
          platform: Database["public"]["Enums"]["device_platform"];
          push_provider: Database["public"]["Enums"]["push_provider"];
          push_token: string;
          updated_at?: string;
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          device_name?: string | null;
          id?: string;
          is_active?: boolean;
          last_seen_at?: string;
          platform?: Database["public"]["Enums"]["device_platform"];
          push_provider?: Database["public"]["Enums"]["push_provider"];
          push_token?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "devices_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_fields: {
        Row: {
          assigned_email: string | null;
          assigned_participant_id: string | null;
          created_at: string;
          created_by: string;
          default_value: string | null;
          document_id: string;
          field_type: string;
          h: number;
          id: string;
          label: string | null;
          page: number;
          properties: Json;
          required: boolean;
          updated_at: string;
          value: string | null;
          w: number;
          workspace_id: string;
          x: number;
          y: number;
        };
        Insert: {
          assigned_email?: string | null;
          assigned_participant_id?: string | null;
          created_at?: string;
          created_by: string;
          default_value?: string | null;
          document_id: string;
          field_type: string;
          h: number;
          id?: string;
          label?: string | null;
          page?: number;
          properties?: Json;
          required?: boolean;
          updated_at?: string;
          value?: string | null;
          w: number;
          workspace_id: string;
          x: number;
          y: number;
        };
        Update: {
          assigned_email?: string | null;
          assigned_participant_id?: string | null;
          created_at?: string;
          created_by?: string;
          default_value?: string | null;
          document_id?: string;
          field_type?: string;
          h?: number;
          id?: string;
          label?: string | null;
          page?: number;
          properties?: Json;
          required?: boolean;
          updated_at?: string;
          value?: string | null;
          w?: number;
          workspace_id?: string;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_fields_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_fields_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_metadata: {
        Row: {
          checksum: string | null;
          created_at: string;
          document_id: string;
          extracted_at: string | null;
          extracted_fields: Json;
          id: string;
          language: string | null;
          mime_type: string | null;
          ocr_text: string | null;
          page_count: number | null;
          preview_urls: Json;
          thumbnail_url: string | null;
          updated_at: string;
          word_count: number | null;
        };
        Insert: {
          checksum?: string | null;
          created_at?: string;
          document_id: string;
          extracted_at?: string | null;
          extracted_fields?: Json;
          id?: string;
          language?: string | null;
          mime_type?: string | null;
          ocr_text?: string | null;
          page_count?: number | null;
          preview_urls?: Json;
          thumbnail_url?: string | null;
          updated_at?: string;
          word_count?: number | null;
        };
        Update: {
          checksum?: string | null;
          created_at?: string;
          document_id?: string;
          extracted_at?: string | null;
          extracted_fields?: Json;
          id?: string;
          language?: string | null;
          mime_type?: string | null;
          ocr_text?: string | null;
          page_count?: number | null;
          preview_urls?: Json;
          thumbnail_url?: string | null;
          updated_at?: string;
          word_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_metadata_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_signatures: {
        Row: {
          created_at: string;
          document_id: string;
          height: number;
          id: string;
          page_number: number;
          signature_id: string;
          width: number;
          x_position: number;
          y_position: number;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          height: number;
          id?: string;
          page_number: number;
          signature_id: string;
          width: number;
          x_position: number;
          y_position: number;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          height?: number;
          id?: string;
          page_number?: number;
          signature_id?: string;
          width?: number;
          x_position?: number;
          y_position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_signatures_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_signatures_signature_id_fkey";
            columns: ["signature_id"];
            isOneToOne: false;
            referencedRelation: "user_signatures";
            referencedColumns: ["id"];
          },
        ];
      };
      document_templates: {
        Row: {
          category: string;
          content: Json;
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          is_archived: boolean;
          letterhead_id: string | null;
          name: string;
          template_kind: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          category?: string;
          content?: Json;
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          letterhead_id?: string | null;
          name: string;
          template_kind?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          category?: string;
          content?: Json;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          letterhead_id?: string | null;
          name?: string;
          template_kind?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_templates_letterhead_id_fkey";
            columns: ["letterhead_id"];
            isOneToOne: false;
            referencedRelation: "letterheads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          calculation_version: number | null;
          cell_count: number | null;
          change_summary: string | null;
          content: Json | null;
          created_at: string;
          created_by: string | null;
          document_id: string;
          file_url: string | null;
          formula_count: number | null;
          id: string;
          letterhead_id: string | null;
          sheet_count: number | null;
          storage_path: string | null;
          title: string | null;
          version_number: number;
          word_count: number | null;
        };
        Insert: {
          calculation_version?: number | null;
          cell_count?: number | null;
          change_summary?: string | null;
          content?: Json | null;
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          file_url?: string | null;
          formula_count?: number | null;
          id?: string;
          letterhead_id?: string | null;
          sheet_count?: number | null;
          storage_path?: string | null;
          title?: string | null;
          version_number: number;
          word_count?: number | null;
        };
        Update: {
          calculation_version?: number | null;
          cell_count?: number | null;
          change_summary?: string | null;
          content?: Json | null;
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          file_url?: string | null;
          formula_count?: number | null;
          id?: string;
          letterhead_id?: string | null;
          sheet_count?: number | null;
          storage_path?: string | null;
          title?: string | null;
          version_number?: number;
          word_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_letterhead_id_fkey";
            columns: ["letterhead_id"];
            isOneToOne: false;
            referencedRelation: "letterheads";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          calculation_version: number;
          cell_count: number;
          content: Json;
          created_at: string;
          created_by: string;
          current_file_url: string | null;
          description: string | null;
          document_kind: string;
          document_status: Database["public"]["Enums"]["document_status"];
          editor_version: number;
          file_size: number | null;
          file_type: string | null;
          formula_count: number;
          id: string;
          last_calculated_at: string | null;
          last_saved_by: string | null;
          letterhead_id: string | null;
          original_file_url: string | null;
          page_count: number | null;
          sheet_count: number;
          storage_path: string | null;
          template_id: string | null;
          title: string;
          updated_at: string;
          word_count: number;
          workspace_id: string;
        };
        Insert: {
          calculation_version?: number;
          cell_count?: number;
          content?: Json;
          created_at?: string;
          created_by: string;
          current_file_url?: string | null;
          description?: string | null;
          document_kind?: string;
          document_status?: Database["public"]["Enums"]["document_status"];
          editor_version?: number;
          file_size?: number | null;
          file_type?: string | null;
          formula_count?: number;
          id?: string;
          last_calculated_at?: string | null;
          last_saved_by?: string | null;
          letterhead_id?: string | null;
          original_file_url?: string | null;
          page_count?: number | null;
          sheet_count?: number;
          storage_path?: string | null;
          template_id?: string | null;
          title: string;
          updated_at?: string;
          word_count?: number;
          workspace_id: string;
        };
        Update: {
          calculation_version?: number;
          cell_count?: number;
          content?: Json;
          created_at?: string;
          created_by?: string;
          current_file_url?: string | null;
          description?: string | null;
          document_kind?: string;
          document_status?: Database["public"]["Enums"]["document_status"];
          editor_version?: number;
          file_size?: number | null;
          file_type?: string | null;
          formula_count?: number;
          id?: string;
          last_calculated_at?: string | null;
          last_saved_by?: string | null;
          letterhead_id?: string | null;
          original_file_url?: string | null;
          page_count?: number | null;
          sheet_count?: number;
          storage_path?: string | null;
          template_id?: string | null;
          title?: string;
          updated_at?: string;
          word_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_letterhead_id_fkey";
            columns: ["letterhead_id"];
            isOneToOne: false;
            referencedRelation: "letterheads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      email_campaigns: {
        Row: {
          campaign_name: string;
          campaign_status: Database["public"]["Enums"]["campaign_status"];
          created_at: string;
          created_by: string;
          emails_clicked: number;
          emails_opened: number;
          emails_sent: number;
          id: string;
          scheduled_for: string | null;
          template_id: string | null;
          total_recipients: number;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          campaign_name: string;
          campaign_status?: Database["public"]["Enums"]["campaign_status"];
          created_at?: string;
          created_by: string;
          emails_clicked?: number;
          emails_opened?: number;
          emails_sent?: number;
          id?: string;
          scheduled_for?: string | null;
          template_id?: string | null;
          total_recipients?: number;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          campaign_name?: string;
          campaign_status?: Database["public"]["Enums"]["campaign_status"];
          created_at?: string;
          created_by?: string;
          emails_clicked?: number;
          emails_opened?: number;
          emails_sent?: number;
          id?: string;
          scheduled_for?: string | null;
          template_id?: string | null;
          total_recipients?: number;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_campaigns_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_campaigns_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      email_templates: {
        Row: {
          created_at: string;
          created_by: string;
          html_body: string;
          id: string;
          merge_tags: Json;
          name: string;
          plain_body: string | null;
          subject: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          html_body: string;
          id?: string;
          merge_tags?: Json;
          name: string;
          plain_body?: string | null;
          subject: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          html_body?: string;
          id?: string;
          merge_tags?: Json;
          name?: string;
          plain_body?: string | null;
          subject?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          created_by: string | null;
          entity_id: string | null;
          entity_type: string | null;
          error: Json | null;
          finished_at: string | null;
          id: string;
          input: Json;
          kind: Database["public"]["Enums"]["job_kind"];
          max_attempts: number;
          output: Json | null;
          priority: number;
          provider: string | null;
          scheduled_for: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          kind: Database["public"]["Enums"]["job_kind"];
          max_attempts?: number;
          output?: Json | null;
          priority?: number;
          provider?: string | null;
          scheduled_for?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          created_by?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          error?: Json | null;
          finished_at?: string | null;
          id?: string;
          input?: Json;
          kind?: Database["public"]["Enums"]["job_kind"];
          max_attempts?: number;
          output?: Json | null;
          priority?: number;
          provider?: string | null;
          scheduled_for?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      letterheads: {
        Row: {
          company_details: Json;
          created_at: string;
          created_by: string;
          file_url: string | null;
          footer_content: string | null;
          header_content: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          storage_path: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          company_details?: Json;
          created_at?: string;
          created_by: string;
          file_url?: string | null;
          footer_content?: string | null;
          header_content?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          storage_path?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          company_details?: Json;
          created_at?: string;
          created_by?: string;
          file_url?: string | null;
          footer_content?: string | null;
          header_content?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          storage_path?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "letterheads_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          data: Json;
          delivered_channels: Json;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          title: string;
          user_id: string | null;
          workspace_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          delivered_channels?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          title: string;
          user_id?: string | null;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          delivered_channels?: Json;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          title?: string;
          user_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_limits: {
        Row: {
          features: Json;
          max_campaigns_per_month: number;
          max_contacts: number;
          max_documents: number;
          max_members: number;
          max_signatures: number;
          max_storage_mb: number;
          max_voice_minutes_per_month: number;
          plan: Database["public"]["Enums"]["subscription_plan"];
          updated_at: string;
        };
        Insert: {
          features?: Json;
          max_campaigns_per_month: number;
          max_contacts: number;
          max_documents: number;
          max_members: number;
          max_signatures: number;
          max_storage_mb: number;
          max_voice_minutes_per_month: number;
          plan: Database["public"]["Enums"]["subscription_plan"];
          updated_at?: string;
        };
        Update: {
          features?: Json;
          max_campaigns_per_month?: number;
          max_contacts?: number;
          max_documents?: number;
          max_members?: number;
          max_signatures?: number;
          max_storage_mb?: number;
          max_voice_minutes_per_month?: number;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          company_name: string | null;
          created_at: string;
          default_workspace_id: string | null;
          email: string;
          full_name: string | null;
          id: string;
          is_active: boolean;
          job_title: string | null;
          last_login: string | null;
          phone: string | null;
          preferences: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          default_workspace_id?: string | null;
          email: string;
          full_name?: string | null;
          id: string;
          is_active?: boolean;
          job_title?: string | null;
          last_login?: string | null;
          phone?: string | null;
          preferences?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          default_workspace_id?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          job_title?: string | null;
          last_login?: string | null;
          phone?: string | null;
          preferences?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey";
            columns: ["default_workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_certificates: {
        Row: {
          certificate_path: string;
          certificate_sha256: string;
          created_at: string;
          id: string;
          manifest: Json;
          request_id: string;
          workspace_id: string;
        };
        Insert: {
          certificate_path: string;
          certificate_sha256: string;
          created_at?: string;
          id?: string;
          manifest: Json;
          request_id: string;
          workspace_id: string;
        };
        Update: {
          certificate_path?: string;
          certificate_sha256?: string;
          created_at?: string;
          id?: string;
          manifest?: Json;
          request_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signing_certificates_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "signing_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_certificates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_hash: string | null;
          event_source: string;
          event_type: string;
          id: string;
          ip: string | null;
          metadata: Json;
          previous_event_hash: string | null;
          request_id: string;
          user_agent: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_hash?: string | null;
          event_source?: string;
          event_type: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          previous_event_hash?: string | null;
          request_id: string;
          user_agent?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_hash?: string | null;
          event_source?: string;
          event_type?: string;
          id?: string;
          ip?: string | null;
          metadata?: Json;
          previous_event_hash?: string | null;
          request_id?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signing_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "signing_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_fields: {
        Row: {
          completion_metadata: Json;
          created_at: string;
          field_key: string;
          h: number;
          id: string;
          label: string | null;
          page: number;
          participant_id: string;
          request_id: string;
          required: boolean;
          rotation: number;
          signature_storage_path: string | null;
          signed_at: string | null;
          signed_signature_id: string | null;
          type: Database["public"]["Enums"]["signing_field_type"];
          updated_at: string;
          validation: Json;
          value: string | null;
          value_hash: string | null;
          w: number;
          x: number;
          y: number;
        };
        Insert: {
          completion_metadata?: Json;
          created_at?: string;
          field_key?: string;
          h?: number;
          id?: string;
          label?: string | null;
          page?: number;
          participant_id: string;
          request_id: string;
          required?: boolean;
          rotation?: number;
          signature_storage_path?: string | null;
          signed_at?: string | null;
          signed_signature_id?: string | null;
          type?: Database["public"]["Enums"]["signing_field_type"];
          updated_at?: string;
          validation?: Json;
          value?: string | null;
          value_hash?: string | null;
          w?: number;
          x?: number;
          y?: number;
        };
        Update: {
          completion_metadata?: Json;
          created_at?: string;
          field_key?: string;
          h?: number;
          id?: string;
          label?: string | null;
          page?: number;
          participant_id?: string;
          request_id?: string;
          required?: boolean;
          rotation?: number;
          signature_storage_path?: string | null;
          signed_at?: string | null;
          signed_signature_id?: string | null;
          type?: Database["public"]["Enums"]["signing_field_type"];
          updated_at?: string;
          validation?: Json;
          value?: string | null;
          value_hash?: string | null;
          w?: number;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "signing_fields_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "signing_participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_fields_participant_request_fkey";
            columns: ["participant_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "signing_participants";
            referencedColumns: ["id", "request_id"];
          },
          {
            foreignKeyName: "signing_fields_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "signing_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_fields_signed_signature_id_fkey";
            columns: ["signed_signature_id"];
            isOneToOne: false;
            referencedRelation: "user_signatures";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_participants: {
        Row: {
          access_revoked_at: string | null;
          completed_at: string | null;
          completion_hash: string | null;
          consent_at: string | null;
          consent_text_version: string | null;
          created_at: string;
          decline_reason: string | null;
          declined_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          identity_metadata: Json;
          invited_at: string | null;
          last_access_at: string | null;
          last_notified_at: string | null;
          last_reminded_at: string | null;
          order_index: number;
          request_id: string;
          role: Database["public"]["Enums"]["signing_participant_role"];
          signed_at: string | null;
          status: Database["public"]["Enums"]["signing_participant_status"];
          token_version: number;
          updated_at: string;
          user_id: string | null;
          viewed_at: string | null;
        };
        Insert: {
          access_revoked_at?: string | null;
          completed_at?: string | null;
          completion_hash?: string | null;
          consent_at?: string | null;
          consent_text_version?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          declined_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          identity_metadata?: Json;
          invited_at?: string | null;
          last_access_at?: string | null;
          last_notified_at?: string | null;
          last_reminded_at?: string | null;
          order_index?: number;
          request_id: string;
          role?: Database["public"]["Enums"]["signing_participant_role"];
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["signing_participant_status"];
          token_version?: number;
          updated_at?: string;
          user_id?: string | null;
          viewed_at?: string | null;
        };
        Update: {
          access_revoked_at?: string | null;
          completed_at?: string | null;
          completion_hash?: string | null;
          consent_at?: string | null;
          consent_text_version?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          declined_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          identity_metadata?: Json;
          invited_at?: string | null;
          last_access_at?: string | null;
          last_notified_at?: string | null;
          last_reminded_at?: string | null;
          order_index?: number;
          request_id?: string;
          role?: Database["public"]["Enums"]["signing_participant_role"];
          signed_at?: string | null;
          status?: Database["public"]["Enums"]["signing_participant_status"];
          token_version?: number;
          updated_at?: string;
          user_id?: string | null;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signing_participants_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "signing_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_requests: {
        Row: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        Insert: {
          app_source?: string;
          audit_certificate_path?: string | null;
          audit_certificate_sha256?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_order_index?: number;
          document_id: string;
          expires_at?: string | null;
          fields_hash?: string | null;
          final_document_version_id?: string | null;
          final_export_path?: string | null;
          final_export_sha256?: string | null;
          finalization_error?: Json | null;
          finalization_status?: string;
          finalized_at?: string | null;
          id?: string;
          locked_at?: string | null;
          message?: string | null;
          participants_hash?: string | null;
          revision?: number;
          sender_id: string;
          sent_at?: string | null;
          signing_order?: string;
          source_document_version_id?: string | null;
          source_sha256?: string | null;
          status?: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          workspace_id: string;
        };
        Update: {
          app_source?: string;
          audit_certificate_path?: string | null;
          audit_certificate_sha256?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_order_index?: number;
          document_id?: string;
          expires_at?: string | null;
          fields_hash?: string | null;
          final_document_version_id?: string | null;
          final_export_path?: string | null;
          final_export_sha256?: string | null;
          finalization_error?: Json | null;
          finalization_status?: string;
          finalized_at?: string | null;
          id?: string;
          locked_at?: string | null;
          message?: string | null;
          participants_hash?: string | null;
          revision?: number;
          sender_id?: string;
          sent_at?: string | null;
          signing_order?: string;
          source_document_version_id?: string | null;
          source_sha256?: string | null;
          status?: Database["public"]["Enums"]["signing_request_status"];
          title?: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "signing_requests_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_requests_final_document_version_id_fkey";
            columns: ["final_document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_requests_source_document_version_id_fkey";
            columns: ["source_document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_requests_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      signing_tokens: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string;
          first_used_at: string | null;
          id: string;
          last_used_at: string | null;
          participant_id: string;
          purpose: string;
          request_id: string;
          revoked_at: string | null;
          rotated_from_id: string | null;
          token_hash: string;
          token_version: number;
          use_count: number;
          used_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          first_used_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          participant_id: string;
          purpose?: string;
          request_id: string;
          revoked_at?: string | null;
          rotated_from_id?: string | null;
          token_hash: string;
          token_version?: number;
          use_count?: number;
          used_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          first_used_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          participant_id?: string;
          purpose?: string;
          request_id?: string;
          revoked_at?: string | null;
          rotated_from_id?: string | null;
          token_hash?: string;
          token_version?: number;
          use_count?: number;
          used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "signing_tokens_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "signing_participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_tokens_participant_request_fkey";
            columns: ["participant_id", "request_id"];
            isOneToOne: false;
            referencedRelation: "signing_participants";
            referencedColumns: ["id", "request_id"];
          },
          {
            foreignKeyName: "signing_tokens_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "signing_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signing_tokens_rotated_from_id_fkey";
            columns: ["rotated_from_id"];
            isOneToOne: false;
            referencedRelation: "signing_tokens";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          billing_cycle: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          plan: Database["public"]["Enums"]["subscription_plan"];
          started_at: string;
          status: Database["public"]["Enums"]["subscription_status"];
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          billing_cycle?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          started_at?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          billing_cycle?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          started_at?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      transcription_jobs: {
        Row: {
          created_at: string;
          error: string | null;
          id: string;
          provider: string;
          result: Json | null;
          status: Database["public"]["Enums"]["transcription_status"];
          updated_at: string;
          voice_note_id: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          id?: string;
          provider?: string;
          result?: Json | null;
          status?: Database["public"]["Enums"]["transcription_status"];
          updated_at?: string;
          voice_note_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          id?: string;
          provider?: string;
          result?: Json | null;
          status?: Database["public"]["Enums"]["transcription_status"];
          updated_at?: string;
          voice_note_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_voice_note_id_fkey";
            columns: ["voice_note_id"];
            isOneToOne: false;
            referencedRelation: "voice_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_metrics: {
        Row: {
          campaigns_count: number;
          contacts_count: number;
          created_at: string;
          documents_count: number;
          id: string;
          period_month: string;
          signatures_count: number;
          storage_mb: number;
          updated_at: string;
          voice_minutes: number;
          workspace_id: string;
        };
        Insert: {
          campaigns_count?: number;
          contacts_count?: number;
          created_at?: string;
          documents_count?: number;
          id?: string;
          period_month?: string;
          signatures_count?: number;
          storage_mb?: number;
          updated_at?: string;
          voice_minutes?: number;
          workspace_id: string;
        };
        Update: {
          campaigns_count?: number;
          contacts_count?: number;
          created_at?: string;
          documents_count?: number;
          id?: string;
          period_month?: string;
          signatures_count?: number;
          storage_mb?: number;
          updated_at?: string;
          voice_minutes?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_metrics_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      user_integrations: {
        Row: {
          access_token_secret_id: string | null;
          account_email: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          metadata: Json;
          provider: Database["public"]["Enums"]["integration_provider"];
          refresh_token_secret_id: string | null;
          scopes: string[];
          updated_at: string;
          user_id: string;
          workspace_id: string | null;
        };
        Insert: {
          access_token_secret_id?: string | null;
          account_email?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          provider: Database["public"]["Enums"]["integration_provider"];
          refresh_token_secret_id?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id: string;
          workspace_id?: string | null;
        };
        Update: {
          access_token_secret_id?: string | null;
          account_email?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          metadata?: Json;
          provider?: Database["public"]["Enums"]["integration_provider"];
          refresh_token_secret_id?: string | null;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_integrations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_signatures: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          is_default: boolean;
          name: string;
          signature_image_url: string;
          storage_path: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          is_default?: boolean;
          name: string;
          signature_image_url: string;
          storage_path?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          signature_image_url?: string;
          storage_path?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_signatures_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_notes: {
        Row: {
          audio_url: string;
          created_at: string;
          created_by: string;
          duration_seconds: number | null;
          id: string;
          storage_path: string | null;
          title: string | null;
          transcript: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          audio_url: string;
          created_at?: string;
          created_by: string;
          duration_seconds?: number | null;
          id?: string;
          storage_path?: string | null;
          title?: string | null;
          transcript?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          audio_url?: string;
          created_at?: string;
          created_by?: string;
          duration_seconds?: number | null;
          id?: string;
          storage_path?: string | null;
          title?: string | null;
          transcript?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_notes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          is_resolved: boolean;
          parent_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          run_id: string;
          step_id: string | null;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          is_resolved?: boolean;
          parent_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          run_id: string;
          step_id?: string | null;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          is_resolved?: boolean;
          parent_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          run_id?: string;
          step_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "workflow_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_comments_parent_run_fkey";
            columns: ["parent_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_comments";
            referencedColumns: ["id", "run_id"];
          },
          {
            foreignKeyName: "workflow_comments_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_comments_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["run_id"];
          },
          {
            foreignKeyName: "workflow_comments_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_comments_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["step_id"];
          },
          {
            foreignKeyName: "workflow_comments_step_run_fkey";
            columns: ["step_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_steps";
            referencedColumns: ["id", "run_id"];
          },
        ];
      };
      workflow_decisions: {
        Row: {
          actor_id: string;
          assignment_id: string;
          comment: string | null;
          created_at: string;
          decision: string;
          id: string;
          run_id: string;
          step_id: string;
          workflow_revision: number;
        };
        Insert: {
          actor_id: string;
          assignment_id: string;
          comment?: string | null;
          created_at?: string;
          decision: string;
          id?: string;
          run_id: string;
          step_id: string;
          workflow_revision: number;
        };
        Update: {
          actor_id?: string;
          assignment_id?: string;
          comment?: string | null;
          created_at?: string;
          decision?: string;
          id?: string;
          run_id?: string;
          step_id?: string;
          workflow_revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_decisions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "workflow_step_assignees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_decisions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["assignment_id"];
          },
          {
            foreignKeyName: "workflow_decisions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_decisions_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["run_id"];
          },
          {
            foreignKeyName: "workflow_decisions_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_decisions_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["step_id"];
          },
        ];
      };
      workflow_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          data: Json;
          event_type: string;
          from_status: string | null;
          id: string;
          run_id: string;
          step_id: string | null;
          to_status: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          event_type: string;
          from_status?: string | null;
          id?: string;
          run_id: string;
          step_id?: string | null;
          to_status?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          event_type?: string;
          from_status?: string | null;
          id?: string;
          run_id?: string;
          step_id?: string | null;
          to_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_events_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["run_id"];
          },
          {
            foreignKeyName: "workflow_events_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_events_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["step_id"];
          },
        ];
      };
      workflow_runs: {
        Row: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          current_step_order: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at: string | null;
          id: string;
          metadata: Json;
          started_at: string;
          started_by: string;
          status: string;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          workflow_revision: number;
          workspace_id: string;
        };
        Insert: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_step_order?: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          started_at?: string;
          started_by: string;
          status?: string;
          template_id?: string | null;
          template_version?: number | null;
          title: string;
          updated_at?: string;
          workflow_revision?: number;
          workspace_id: string;
        };
        Update: {
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          current_step_order?: number;
          document_editor_version_at_submission?: number;
          document_id?: string;
          document_version_id?: string;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          started_at?: string;
          started_by?: string;
          status?: string;
          template_id?: string | null;
          template_version?: number | null;
          title?: string;
          updated_at?: string;
          workflow_revision?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_runs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_step_assignees: {
        Row: {
          assigned_by: string;
          created_at: string;
          decided_at: string | null;
          decision_comment: string | null;
          id: string;
          participant_role: string;
          status: string;
          step_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assigned_by: string;
          created_at?: string;
          decided_at?: string | null;
          decision_comment?: string | null;
          id?: string;
          participant_role: string;
          status?: string;
          step_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assigned_by?: string;
          created_at?: string;
          decided_at?: string | null;
          decision_comment?: string | null;
          id?: string;
          participant_role?: string;
          status?: string;
          step_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_step_assignees_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_step_assignees_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["step_id"];
          },
        ];
      };
      workflow_steps: {
        Row: {
          allow_changes: boolean;
          allow_reject: boolean;
          completed_at: string | null;
          created_at: string;
          description: string | null;
          due_at: string | null;
          id: string;
          metadata: Json;
          name: string;
          required_decisions: number;
          run_id: string;
          started_at: string | null;
          status: string;
          step_order: number;
          step_type: string;
          updated_at: string;
        };
        Insert: {
          allow_changes?: boolean;
          allow_reject?: boolean;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          name: string;
          required_decisions?: number;
          run_id: string;
          started_at?: string | null;
          status?: string;
          step_order: number;
          step_type: string;
          updated_at?: string;
        };
        Update: {
          allow_changes?: boolean;
          allow_reject?: boolean;
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          due_at?: string | null;
          id?: string;
          metadata?: Json;
          name?: string;
          required_decisions?: number;
          run_id?: string;
          started_at?: string | null;
          status?: string;
          step_order?: number;
          step_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "workflow_work_queue";
            referencedColumns: ["run_id"];
          },
        ];
      };
      workflow_template_steps: {
        Row: {
          allow_changes: boolean;
          allow_reject: boolean;
          assigned_user_id: string | null;
          assigned_workspace_role: Database["public"]["Enums"]["workspace_role"] | null;
          assignment_mode: string;
          created_at: string;
          description: string | null;
          due_in_hours: number | null;
          id: string;
          name: string;
          required_decisions: number;
          step_order: number;
          step_type: string;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          allow_changes?: boolean;
          allow_reject?: boolean;
          assigned_user_id?: string | null;
          assigned_workspace_role?: Database["public"]["Enums"]["workspace_role"] | null;
          assignment_mode: string;
          created_at?: string;
          description?: string | null;
          due_in_hours?: number | null;
          id?: string;
          name: string;
          required_decisions?: number;
          step_order: number;
          step_type: string;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          allow_changes?: boolean;
          allow_reject?: boolean;
          assigned_user_id?: string | null;
          assigned_workspace_role?: Database["public"]["Enums"]["workspace_role"] | null;
          assignment_mode?: string;
          created_at?: string;
          description?: string | null;
          due_in_hours?: number | null;
          id?: string;
          name?: string;
          required_decisions?: number;
          step_order?: number;
          step_type?: string;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_template_steps_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_templates: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          entity_type: string;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
          version: number;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          entity_type?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
          version?: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          entity_type?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_templates_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          joined_at: string;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          address: string | null;
          avatar_url: string | null;
          company_name: string | null;
          created_at: string;
          id: string;
          is_personal: boolean;
          logo_url: string | null;
          name: string;
          owner_id: string;
          plan: Database["public"]["Enums"]["subscription_plan"];
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          id?: string;
          is_personal?: boolean;
          logo_url?: string | null;
          name: string;
          owner_id: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          avatar_url?: string | null;
          company_name?: string | null;
          created_at?: string;
          id?: string;
          is_personal?: boolean;
          logo_url?: string | null;
          name?: string;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["subscription_plan"];
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      workflow_work_queue: {
        Row: {
          assignment_id: string | null;
          assignment_status: string | null;
          document_id: string | null;
          document_kind: string | null;
          document_title: string | null;
          document_version_id: string | null;
          due_at: string | null;
          participant_role: string | null;
          run_id: string | null;
          started_at: string | null;
          started_by: string | null;
          step_id: string | null;
          step_name: string | null;
          step_order: number | null;
          step_type: string | null;
          updated_at: string | null;
          workflow_revision: number | null;
          workflow_status: string | null;
          workflow_title: string | null;
          workspace_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_runs_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      cancel_document_workflow: {
        Args: { p_reason: string; p_run_id: string };
        Returns: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          current_step_order: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at: string | null;
          id: string;
          metadata: Json;
          started_at: string;
          started_by: string;
          status: string;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          workflow_revision: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_runs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_signing_request: {
        Args: { p_reason: string; p_request_id: string };
        Returns: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "signing_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_jobs: {
        Args: {
          p_kinds?: Database["public"]["Enums"]["job_kind"][];
          p_limit?: number;
        };
        Returns: {
          attempts: number;
          created_at: string;
          created_by: string | null;
          entity_id: string | null;
          entity_type: string | null;
          error: Json | null;
          finished_at: string | null;
          id: string;
          input: Json;
          kind: Database["public"]["Enums"]["job_kind"];
          max_attempts: number;
          output: Json | null;
          priority: number;
          provider: string | null;
          scheduled_for: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
          workspace_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      claim_signing_finalization: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      complete_external_signing_session: {
        Args: {
          p_consent_text_version: string;
          p_field_values: Json;
          p_ip_hash: string;
          p_session_hash: string;
          p_user_agent_hash: string;
        };
        Returns: Json;
      };
      complete_signing_finalization: {
        Args: {
          p_certificate_path: string;
          p_certificate_sha256: string;
          p_final_export_path: string;
          p_final_export_sha256: string;
          p_manifest: Json;
          p_request_id: string;
          p_source_sha256: string;
        };
        Returns: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "signing_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      complete_signing_participant: {
        Args: {
          p_consent_text_version: string;
          p_field_values: Json;
          p_participant_id: string;
        };
        Returns: Json;
      };
      decline_external_signing_session: {
        Args: { p_reason: string; p_session_hash: string };
        Returns: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "signing_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      decline_signing_participant: {
        Args: { p_participant_id: string; p_reason: string };
        Returns: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "signing_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      exchange_signing_token: {
        Args: {
          p_ip_hash: string;
          p_session_expires_at: string;
          p_session_hash: string;
          p_token_hash: string;
          p_user_agent_hash: string;
        };
        Returns: Json;
      };
      fail_signing_finalization: {
        Args: { p_error: Json; p_request_id: string };
        Returns: {
          app_source: string;
          audit_certificate_path: string | null;
          audit_certificate_sha256: string | null;
          completed_at: string | null;
          created_at: string;
          current_order_index: number;
          document_id: string;
          expires_at: string | null;
          fields_hash: string | null;
          final_document_version_id: string | null;
          final_export_path: string | null;
          final_export_sha256: string | null;
          finalization_error: Json | null;
          finalization_status: string;
          finalized_at: string | null;
          id: string;
          locked_at: string | null;
          message: string | null;
          participants_hash: string | null;
          revision: number;
          sender_id: string;
          sent_at: string | null;
          signing_order: string;
          source_document_version_id: string | null;
          source_sha256: string | null;
          status: Database["public"]["Enums"]["signing_request_status"];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "signing_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_signing_session_payload: {
        Args: { p_session_hash: string };
        Returns: Json;
      };
      mark_signing_participant_viewed: {
        Args: { p_participant_id: string };
        Returns: {
          access_revoked_at: string | null;
          completed_at: string | null;
          completion_hash: string | null;
          consent_at: string | null;
          consent_text_version: string | null;
          created_at: string;
          decline_reason: string | null;
          declined_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          identity_metadata: Json;
          invited_at: string | null;
          last_access_at: string | null;
          last_notified_at: string | null;
          last_reminded_at: string | null;
          order_index: number;
          request_id: string;
          role: Database["public"]["Enums"]["signing_participant_role"];
          signed_at: string | null;
          status: Database["public"]["Enums"]["signing_participant_status"];
          token_version: number;
          updated_at: string;
          user_id: string | null;
          viewed_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "signing_participants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reassign_workflow_assignment: {
        Args: {
          p_assignment_id: string;
          p_new_user_id: string;
          p_reason: string;
        };
        Returns: {
          assigned_by: string;
          created_at: string;
          decided_at: string | null;
          decision_comment: string | null;
          id: string;
          participant_role: string;
          status: string;
          step_id: string;
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_step_assignees";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_workflow_comment: {
        Args: { p_comment_id: string; p_resolved: boolean };
        Returns: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          is_resolved: boolean;
          parent_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          run_id: string;
          step_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_comments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      restore_structured_document_version: {
        Args: {
          p_document_id: string;
          p_expected_editor_version: number;
          p_version_id: string;
        };
        Returns: {
          calculation_version: number;
          cell_count: number;
          content: Json;
          created_at: string;
          created_by: string;
          current_file_url: string | null;
          description: string | null;
          document_kind: string;
          document_status: Database["public"]["Enums"]["document_status"];
          editor_version: number;
          file_size: number | null;
          file_type: string | null;
          formula_count: number;
          id: string;
          last_calculated_at: string | null;
          last_saved_by: string | null;
          letterhead_id: string | null;
          original_file_url: string | null;
          page_count: number | null;
          sheet_count: number;
          storage_path: string | null;
          template_id: string | null;
          title: string;
          updated_at: string;
          word_count: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "documents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resubmit_document_workflow: {
        Args: {
          p_comment?: string;
          p_expected_document_editor_version: number;
          p_run_id: string;
        };
        Returns: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          current_step_order: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at: string | null;
          id: string;
          metadata: Json;
          started_at: string;
          started_by: string;
          status: string;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          workflow_revision: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_runs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rotate_signing_invitation: {
        Args: { p_expires_at?: string; p_participant_id: string };
        Returns: Json;
      };
      save_structured_document: {
        Args: {
          p_cell_count?: number;
          p_change_summary?: string;
          p_content: Json;
          p_create_version?: boolean;
          p_document_id: string;
          p_expected_editor_version: number;
          p_formula_count?: number;
          p_sheet_count?: number;
          p_version_title?: string;
          p_word_count?: number;
        };
        Returns: {
          calculation_version: number;
          cell_count: number;
          content: Json;
          created_at: string;
          created_by: string;
          current_file_url: string | null;
          description: string | null;
          document_kind: string;
          document_status: Database["public"]["Enums"]["document_status"];
          editor_version: number;
          file_size: number | null;
          file_type: string | null;
          formula_count: number;
          id: string;
          last_calculated_at: string | null;
          last_saved_by: string | null;
          letterhead_id: string | null;
          original_file_url: string | null;
          page_count: number | null;
          sheet_count: number;
          storage_path: string | null;
          template_id: string | null;
          title: string;
          updated_at: string;
          word_count: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "documents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      send_signing_request: {
        Args: { p_expires_at?: string; p_request_id: string };
        Returns: Json;
      };
      start_document_workflow: {
        Args: {
          p_document_id: string;
          p_due_at?: string;
          p_template_id: string;
        };
        Returns: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          current_step_order: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at: string | null;
          id: string;
          metadata: Json;
          started_at: string;
          started_by: string;
          status: string;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          workflow_revision: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_runs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_workflow_decision: {
        Args: {
          p_assignment_id: string;
          p_comment?: string;
          p_decision: string;
        };
        Returns: {
          cancellation_reason: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          completed_at: string | null;
          created_at: string;
          current_step_order: number;
          document_editor_version_at_submission: number;
          document_id: string;
          document_version_id: string;
          due_at: string | null;
          id: string;
          metadata: Json;
          started_at: string;
          started_by: string;
          status: string;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          workflow_revision: number;
          workspace_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_runs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_workflow_comment: {
        Args: { p_body: string; p_comment_id: string };
        Returns: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          is_resolved: boolean;
          parent_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          run_id: string;
          step_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "workflow_comments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      app_role: "admin" | "user";
      billing_event_type:
        | "created"
        | "renewed"
        | "upgraded"
        | "downgraded"
        | "canceled"
        | "payment_succeeded"
        | "payment_failed"
        | "refunded";
      campaign_status: "draft" | "scheduled" | "sending" | "completed" | "failed";
      delivery_status:
        | "pending"
        | "sent"
        | "delivered"
        | "opened"
        | "clicked"
        | "bounced"
        | "failed"
        | "complained";
      device_platform: "ios" | "android" | "web" | "macos" | "windows" | "linux";
      document_status: "draft" | "signed" | "converted" | "sent" | "archived" | "deleted";
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
        | "microsoft_graph";
      job_kind:
        | "document_convert"
        | "document_export"
        | "letterhead_generate"
        | "email_campaign_send"
        | "audio_transcribe"
        | "contact_import"
        | "contact_export"
        | "signature_apply"
        | "signing_notify"
        | "signing_finalize";
      job_status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      notification_kind:
        | "job_succeeded"
        | "job_failed"
        | "campaign_completed"
        | "transcription_ready"
        | "member_invited"
        | "quota_warning"
        | "document_shared"
        | "system";
      push_provider: "fcm" | "apns" | "web_push" | "expo";
      signing_field_type: "signature" | "initial" | "text" | "date";
      signing_participant_role: "signer" | "approver" | "cc";
      signing_participant_status: "pending" | "viewed" | "signed" | "declined";
      signing_request_status:
        | "draft"
        | "sent"
        | "in_progress"
        | "completed"
        | "declined"
        | "cancelled";
      subscription_plan: "free" | "professional" | "business";
      subscription_status: "active" | "trialing" | "past_due" | "canceled" | "expired";
      transcription_status: "pending" | "processing" | "completed" | "failed";
      workspace_role: "owner" | "admin" | "member" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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
      document_status: ["draft", "signed", "converted", "sent", "archived", "deleted"],
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
        "signing_notify",
        "signing_finalize",
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
      signing_field_type: ["signature", "initial", "text", "date"],
      signing_participant_role: ["signer", "approver", "cc"],
      signing_participant_status: ["pending", "viewed", "signed", "declined"],
      signing_request_status: [
        "draft",
        "sent",
        "in_progress",
        "completed",
        "declined",
        "cancelled",
      ],
      subscription_plan: ["free", "professional", "business"],
      subscription_status: ["active", "trialing", "past_due", "canceled", "expired"],
      transcription_status: ["pending", "processing", "completed", "failed"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const;
