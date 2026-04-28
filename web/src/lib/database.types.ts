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
      access_grants: {
        Row: {
          active: boolean
          affiliate_id: string | null
          campaign_id: string | null
          church_id: string
          converted_at: string | null
          converted_to_subscription_id: string | null
          converts_to_paid: boolean | null
          created_at: string
          ends_at: string | null
          grant_type: string
          granted_by: string | null
          granted_reason: string | null
          id: string
          notes: string | null
          plan_slug: string
          source: string
          starts_at: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliate_id?: string | null
          campaign_id?: string | null
          church_id: string
          converted_at?: string | null
          converted_to_subscription_id?: string | null
          converts_to_paid?: boolean | null
          created_at?: string
          ends_at?: string | null
          grant_type: string
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          notes?: string | null
          plan_slug: string
          source: string
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliate_id?: string | null
          campaign_id?: string | null
          church_id?: string
          converted_at?: string | null
          converted_to_subscription_id?: string | null
          converts_to_paid?: boolean | null
          created_at?: string
          ends_at?: string | null
          grant_type?: string
          granted_by?: string | null
          granted_reason?: string | null
          id?: string
          notes?: string | null
          plan_slug?: string
          source?: string
          starts_at?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_converted_to_subscription_id_fkey"
            columns: ["converted_to_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "access_grants_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_prices: {
        Row: {
          active: boolean
          created_at: string
          name: string
          price_cents: number
          slug: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          name: string
          price_cents: number
          slug: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          name?: string
          price_cents?: number
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      addons: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          name: string
          price_cents: number
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          name: string
          price_cents: number
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          name?: string
          price_cents?: number
          slug?: string
        }
        Relationships: []
      }
      admin_events: {
        Row: {
          action: string
          admin_user_id: string
          after: Json | null
          before: Json | null
          church_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          after?: Json | null
          before?: Json | null
          church_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          after?: Json | null
          before?: Json | null
          church_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_tasks: {
        Row: {
          assigned_to: string | null
          church_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          church_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          church_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_tasks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_tasks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_id: string | null
          approved_at: string | null
          approves_at: string
          base_amount_cents: number
          commission_amount_cents: number
          conversion_id: string | null
          created_at: string | null
          id: string
          paid_at: string | null
          paid_batch_id: string | null
          paid_method: string | null
          paid_reference: string | null
          reference_month: string
          status: string | null
        }
        Insert: {
          affiliate_id?: string | null
          approved_at?: string | null
          approves_at: string
          base_amount_cents: number
          commission_amount_cents: number
          conversion_id?: string | null
          created_at?: string | null
          id?: string
          paid_at?: string | null
          paid_batch_id?: string | null
          paid_method?: string | null
          paid_reference?: string | null
          reference_month: string
          status?: string | null
        }
        Update: {
          affiliate_id?: string | null
          approved_at?: string | null
          approves_at?: string
          base_amount_cents?: number
          commission_amount_cents?: number
          conversion_id?: string | null
          created_at?: string | null
          id?: string
          paid_at?: string | null
          paid_batch_id?: string | null
          paid_method?: string | null
          paid_reference?: string | null
          reference_month?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: false
            referencedRelation: "affiliate_conversions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_conversions: {
        Row: {
          affiliate_id: string | null
          church_id: string | null
          converted_at: string | null
          coupon_id: string | null
          id: string
          initial_amount_cents: number | null
          initial_plan: string | null
          matured_at: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          affiliate_id?: string | null
          church_id?: string | null
          converted_at?: string | null
          coupon_id?: string | null
          id?: string
          initial_amount_cents?: number | null
          initial_plan?: string | null
          matured_at?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          affiliate_id?: string | null
          church_id?: string | null
          converted_at?: string | null
          coupon_id?: string | null
          id?: string
          initial_amount_cents?: number | null
          initial_plan?: string | null
          matured_at?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "affiliate_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_coupons: {
        Row: {
          active: boolean | null
          affiliate_id: string | null
          applies_to_plans: string[] | null
          code: string
          commission_duration_months: number | null
          commission_kind: string
          commission_value: number
          created_at: string | null
          current_redemptions: number | null
          discount_duration_months: number | null
          discount_kind: string
          discount_value: number
          ends_at: string | null
          id: string
          max_redemptions: number | null
          starts_at: string | null
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
        }
        Insert: {
          active?: boolean | null
          affiliate_id?: string | null
          applies_to_plans?: string[] | null
          code: string
          commission_duration_months?: number | null
          commission_kind: string
          commission_value: number
          created_at?: string | null
          current_redemptions?: number | null
          discount_duration_months?: number | null
          discount_kind: string
          discount_value: number
          ends_at?: string | null
          id?: string
          max_redemptions?: number | null
          starts_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Update: {
          active?: boolean | null
          affiliate_id?: string | null
          applies_to_plans?: string[] | null
          code?: string
          commission_duration_months?: number | null
          commission_kind?: string
          commission_value?: number
          created_at?: string | null
          current_redemptions?: number | null
          discount_duration_months?: number | null
          discount_kind?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_redemptions?: number | null
          starts_at?: string | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_coupons_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payment_batches: {
        Row: {
          created_at: string | null
          csv_url: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          reference_month: string
          total_amount_cents: number
          total_commissions: number
        }
        Insert: {
          created_at?: string | null
          csv_url?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reference_month: string
          total_amount_cents: number
          total_commissions: number
        }
        Update: {
          created_at?: string | null
          csv_url?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          reference_month?: string
          total_amount_cents?: number
          total_commissions?: number
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          audience_size: number | null
          created_at: string | null
          created_by: string | null
          document: string | null
          email: string
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          pix_key: string
          pix_key_kind: string | null
          social_handle: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          audience_size?: number | null
          created_at?: string | null
          created_by?: string | null
          document?: string | null
          email: string
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          pix_key: string
          pix_key_kind?: string | null
          social_handle?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          audience_size?: number | null
          created_at?: string | null
          created_by?: string | null
          document?: string | null
          email?: string
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string
          pix_key_kind?: string | null
          social_handle?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_chat_sessions: {
        Row: {
          agent_slug: string
          archived: boolean
          church_id: string
          created_at: string
          id: string
          last_message_at: string
          title: string
          user_id: string
        }
        Insert: {
          agent_slug: string
          archived?: boolean
          church_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          user_id: string
        }
        Update: {
          agent_slug?: string
          archived?: boolean
          church_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chat_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chat_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          agent_slug: string
          church_id: string
          content: string
          created_at: string
          id: string
          role: string
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          agent_slug: string
          church_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          agent_slug?: string
          church_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_executions: {
        Row: {
          agent_slug: string
          batch_id: string | null
          batch_status: string | null
          cache_creation_tokens: number
          cache_read_tokens: number
          church_id: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          success: boolean | null
          user_id: string | null
        }
        Insert: {
          agent_slug: string
          batch_id?: string | null
          batch_status?: string | null
          cache_creation_tokens?: number
          cache_read_tokens?: number
          church_id: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          success?: boolean | null
          user_id?: string | null
        }
        Update: {
          agent_slug?: string
          batch_id?: string | null
          batch_status?: string | null
          cache_creation_tokens?: number
          cache_read_tokens?: number
          church_id?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          success?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_executions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_executions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      agents_catalog: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          features: Json
          full_description: string | null
          id: string
          model: string
          name: string
          pain_solved: string | null
          price_cents: number
          pricing_tier: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description: string
          slug: string
          sort_order: number | null
          updated_at: string | null
          without_me: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          features?: Json
          full_description?: string | null
          id?: string
          model?: string
          name: string
          pain_solved?: string | null
          price_cents?: number
          pricing_tier?: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description: string
          slug: string
          sort_order?: number | null
          updated_at?: string | null
          without_me?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          features?: Json
          full_description?: string | null
          id?: string
          model?: string
          name?: string
          pain_solved?: string | null
          price_cents?: number
          pricing_tier?: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
          without_me?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          church_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          model_used: string | null
          payload: Json
          tokens_used: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          church_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          model_used?: string | null
          payload?: Json
          tokens_used?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          church_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          model_used?: string | null
          payload?: Json
          tokens_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          action_taken: string | null
          automation_name: string
          church_id: string
          created_at: string
          error: string | null
          id: string
          payload: Json
          person_id: string | null
          result: string
          trigger_type: string
        }
        Insert: {
          action_taken?: string | null
          automation_name: string
          church_id: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          person_id?: string | null
          result?: string
          trigger_type: string
        }
        Update: {
          action_taken?: string | null
          automation_name?: string
          church_id?: string
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          person_id?: string | null
          result?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_attendance: {
        Row: {
          id: string
          meeting_id: string
          person_id: string
        }
        Insert: {
          id?: string
          meeting_id: string
          person_id: string
        }
        Update: {
          id?: string
          meeting_id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cell_attendance_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "cell_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_attendance_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_leader_assignments: {
        Row: {
          church_id: string
          created_at: string
          group_id: string
          user_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          group_id: string
          user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cell_leader_assignments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_leader_assignments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_leader_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_meetings: {
        Row: {
          church_id: string
          consolidated_count: number
          created_at: string
          group_id: string
          id: string
          meeting_date: string
          notes: string | null
          offering_amount: number | null
          theme: string | null
          visitors_count: number
        }
        Insert: {
          church_id: string
          consolidated_count?: number
          created_at?: string
          group_id: string
          id?: string
          meeting_date: string
          notes?: string | null
          offering_amount?: number | null
          theme?: string | null
          visitors_count?: number
        }
        Update: {
          church_id?: string
          consolidated_count?: number
          created_at?: string
          group_id?: string
          id?: string
          meeting_date?: string
          notes?: string | null
          offering_amount?: number | null
          theme?: string | null
          visitors_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "cell_meetings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_meetings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_meetings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_members: {
        Row: {
          church_id: string
          created_at: string
          group_id: string
          id: string
          person_id: string
          role: Database["public"]["Enums"]["cell_role"]
        }
        Insert: {
          church_id: string
          created_at?: string
          group_id: string
          id?: string
          person_id: string
          role?: Database["public"]["Enums"]["cell_role"]
        }
        Update: {
          church_id?: string
          created_at?: string
          group_id?: string
          id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["cell_role"]
        }
        Relationships: [
          {
            foreignKeyName: "cell_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_report_people: {
        Row: {
          became_convert: boolean | null
          first_time: boolean | null
          id: string
          person_id: string | null
          present: boolean | null
          report_id: string | null
        }
        Insert: {
          became_convert?: boolean | null
          first_time?: boolean | null
          id?: string
          person_id?: string | null
          present?: boolean | null
          report_id?: string | null
        }
        Update: {
          became_convert?: boolean | null
          first_time?: boolean | null
          id?: string
          person_id?: string | null
          present?: boolean | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cell_report_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_report_people_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "cell_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_reports: {
        Row: {
          cell_id: string | null
          challenges: string | null
          church_id: string | null
          created_at: string | null
          id: string
          leader_id: string | null
          meeting_date: string | null
          new_converts: number | null
          notes: string | null
          praise_reports: string | null
          prayer_requests: string | null
          reported_by: string | null
          status: string
          topic: string | null
          total_present: number | null
          updated_at: string
          visitors_count: number | null
        }
        Insert: {
          cell_id?: string | null
          challenges?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          leader_id?: string | null
          meeting_date?: string | null
          new_converts?: number | null
          notes?: string | null
          praise_reports?: string | null
          prayer_requests?: string | null
          reported_by?: string | null
          status?: string
          topic?: string | null
          total_present?: number | null
          updated_at?: string
          visitors_count?: number | null
        }
        Update: {
          cell_id?: string | null
          challenges?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          leader_id?: string | null
          meeting_date?: string | null
          new_converts?: number | null
          notes?: string | null
          praise_reports?: string | null
          prayer_requests?: string | null
          reported_by?: string | null
          status?: string
          topic?: string | null
          total_present?: number | null
          updated_at?: string
          visitors_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cell_reports_cell_id_fkey"
            columns: ["cell_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_reports_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_reports_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_reports_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      church_events: {
        Row: {
          active: boolean
          all_day: boolean
          church_id: string
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_datetime: string | null
          event_type: string
          id: string
          is_online: boolean
          is_public: boolean
          leader_id: string | null
          location: string | null
          ministry_id: string | null
          online_link: string | null
          recurrence: Json | null
          recurrence_count: number | null
          recurrence_day_of_week: number[] | null
          recurrence_end_type: string | null
          recurrence_interval: number | null
          recurrence_type: string | null
          recurrence_until: string | null
          scope: string
          start_datetime: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          all_day?: boolean
          church_id: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string
          id?: string
          is_online?: boolean
          is_public?: boolean
          leader_id?: string | null
          location?: string | null
          ministry_id?: string | null
          online_link?: string | null
          recurrence?: Json | null
          recurrence_count?: number | null
          recurrence_day_of_week?: number[] | null
          recurrence_end_type?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          recurrence_until?: string | null
          scope?: string
          start_datetime: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          all_day?: boolean
          church_id?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string
          id?: string
          is_online?: boolean
          is_public?: boolean
          leader_id?: string | null
          location?: string | null
          ministry_id?: string | null
          online_link?: string | null
          recurrence?: Json | null
          recurrence_count?: number | null
          recurrence_day_of_week?: number[] | null
          recurrence_end_type?: string | null
          recurrence_interval?: number | null
          recurrence_type?: string | null
          recurrence_until?: string | null
          scope?: string
          start_datetime?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_events_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_events_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      church_notes: {
        Row: {
          admin_user_id: string
          body: string
          church_id: string
          created_at: string
          id: string
          pinned: boolean
          updated_at: string
        }
        Insert: {
          admin_user_id: string
          body: string
          church_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Update: {
          admin_user_id?: string
          body?: string
          church_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_notes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_notes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_settings: {
        Row: {
          church_id: string
          created_at: string
          escalation_contacts: Json
          id: string
          labels: Json
          max_msg_per_hour: number
          modules_enabled: Json
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          out_of_hours_message: string
          support_hours: Json
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          escalation_contacts?: Json
          id?: string
          labels?: Json
          max_msg_per_hour?: number
          modules_enabled?: Json
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          out_of_hours_message?: string
          support_hours?: Json
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          escalation_contacts?: Json
          id?: string
          labels?: Json
          max_msg_per_hour?: number
          modules_enabled?: Json
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          out_of_hours_message?: string
          support_hours?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_settings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_settings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_sites: {
        Row: {
          address: string | null
          church_id: string
          city: string | null
          created_at: string
          id: string
          is_main: boolean
          name: string
          state: string | null
        }
        Insert: {
          address?: string | null
          church_id: string
          city?: string | null
          created_at?: string
          id?: string
          is_main?: boolean
          name: string
          state?: string | null
        }
        Update: {
          address?: string | null
          church_id?: string
          city?: string | null
          created_at?: string
          id?: string
          is_main?: boolean
          name?: string
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_sites_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_sites_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          branding: Json | null
          city: string | null
          created_at: string
          deleted_at: string | null
          enabled_modules: Json | null
          id: string
          is_active: boolean
          is_matrix: boolean
          logo_url: string | null
          name: string
          onboarding_config: Json | null
          parent_church_id: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          state: string | null
          status: string
          subscription_plan: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          enabled_modules?: Json | null
          id?: string
          is_active?: boolean
          is_matrix?: boolean
          logo_url?: string | null
          name: string
          onboarding_config?: Json | null
          parent_church_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          state?: string | null
          status?: string
          subscription_plan?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          enabled_modules?: Json | null
          id?: string
          is_active?: boolean
          is_matrix?: boolean
          logo_url?: string | null
          name?: string
          onboarding_config?: Json | null
          parent_church_id?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          state?: string | null
          status?: string
          subscription_plan?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "churches_parent_church_id_fkey"
            columns: ["parent_church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "churches_parent_church_id_fkey"
            columns: ["parent_church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          church_id: string
          church_name: string
          contacted_at: string | null
          context: string
          created_at: string
          email_error: string | null
          email_sent: boolean
          email_sent_at: string | null
          id: string
          notes: string | null
          origin_page: string | null
          pastor_email: string
          pastor_name: string
          plan_at_request: string
          status: string
          target_slug: string
          user_id: string
        }
        Insert: {
          church_id: string
          church_name: string
          contacted_at?: string | null
          context: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          notes?: string | null
          origin_page?: string | null
          pastor_email: string
          pastor_name: string
          plan_at_request: string
          status?: string
          target_slug: string
          user_id: string
        }
        Update: {
          church_id?: string
          church_name?: string
          contacted_at?: string | null
          context?: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          id?: string
          notes?: string | null
          origin_page?: string | null
          pastor_email?: string
          pastor_name?: string
          plan_at_request?: string
          status?: string
          target_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount: number
          category: string | null
          church_id: string
          contributed_at: string
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          person_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          church_id: string
          contributed_at?: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          person_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          church_id?: string
          contributed_at?: string
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          applied_by: string | null
          church_id: string | null
          coupon_id: string
          created_at: string
          discount_applied_cents: number
          email: string
          final_price_cents: number
          id: string
          ip_address: unknown
          original_price_cents: number
          plan_slug: string
          redeemed_at: string | null
          redemption_channel: string
          refunded_at: string | null
          rejection_reason: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_subscription_id: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          validated_at: string | null
        }
        Insert: {
          applied_by?: string | null
          church_id?: string | null
          coupon_id: string
          created_at?: string
          discount_applied_cents: number
          email: string
          final_price_cents: number
          id?: string
          ip_address?: unknown
          original_price_cents: number
          plan_slug: string
          redeemed_at?: string | null
          redemption_channel: string
          refunded_at?: string | null
          rejection_reason?: string | null
          status: string
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          validated_at?: string | null
        }
        Update: {
          applied_by?: string | null
          church_id?: string | null
          coupon_id?: string
          created_at?: string
          discount_applied_cents?: number
          email?: string
          final_price_cents?: number
          id?: string
          ip_address?: unknown
          original_price_cents?: number
          plan_slug?: string
          redeemed_at?: string | null
          redemption_channel?: string
          refunded_at?: string | null
          rejection_reason?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      coupon_sync_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          coupon_id: string
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          operation: string
          status: string
          stripe_response: Json | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          coupon_id: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          operation: string
          status?: string
          stripe_response?: Json | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          coupon_id?: string
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          operation?: string
          status?: string
          stripe_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_sync_jobs_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_validate_rate_limits: {
        Row: {
          attempted_at: string
          block_reason: string | null
          coupon_code: string
          email: string
          id: string
          ip_address: unknown
          user_agent: string | null
          was_blocked: boolean
        }
        Insert: {
          attempted_at?: string
          block_reason?: string | null
          coupon_code: string
          email: string
          id?: string
          ip_address: unknown
          user_agent?: string | null
          was_blocked?: boolean
        }
        Update: {
          attempted_at?: string
          block_reason?: string | null
          coupon_code?: string
          email?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          was_blocked?: boolean
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          affiliate_id: string | null
          campaign_id: string | null
          code: string
          commission_duration: string | null
          commission_type: string | null
          commission_value: number | null
          coupon_type: string
          created_at: string
          created_by: string | null
          default_utm_campaign: string | null
          default_utm_medium: string | null
          default_utm_source: string | null
          discount_type: string
          discount_value: number
          duration: string
          duration_in_months: number | null
          id: string
          max_per_customer: number
          max_redemptions: number | null
          plan_scope: string[]
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
          stripe_synced_at: string | null
          times_redeemed: number
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          affiliate_id?: string | null
          campaign_id?: string | null
          code: string
          commission_duration?: string | null
          commission_type?: string | null
          commission_value?: number | null
          coupon_type: string
          created_at?: string
          created_by?: string | null
          default_utm_campaign?: string | null
          default_utm_medium?: string | null
          default_utm_source?: string | null
          discount_type: string
          discount_value: number
          duration: string
          duration_in_months?: number | null
          id?: string
          max_per_customer?: number
          max_redemptions?: number | null
          plan_scope?: string[]
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          stripe_synced_at?: string | null
          times_redeemed?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          affiliate_id?: string | null
          campaign_id?: string | null
          code?: string
          commission_duration?: string | null
          commission_type?: string | null
          commission_value?: number | null
          coupon_type?: string
          created_at?: string
          created_by?: string | null
          default_utm_campaign?: string | null
          default_utm_medium?: string | null
          default_utm_source?: string | null
          discount_type?: string
          discount_value?: number
          duration?: string
          duration_in_months?: number | null
          id?: string
          max_per_customer?: number
          max_redemptions?: number | null
          plan_scope?: string[]
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
          stripe_synced_at?: string | null
          times_redeemed?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      discipleship_templates: {
        Row: {
          created_at: string
          description: string | null
          name: string
          slug: string
          stages: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          name: string
          slug: string
          stages?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          name?: string
          slug?: string
          stages?: Json
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: number
          campaign_id: string | null
          church_id: string
          confirmed_at: string | null
          created_at: string
          currency: string
          gateway: string | null
          gateway_transaction_id: string | null
          id: string
          notes: string | null
          payment_method: string | null
          person_id: string | null
          receipt_sent: boolean
          receipt_sent_at: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          campaign_id?: string | null
          church_id: string
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_transaction_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          person_id?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          campaign_id?: string | null
          church_id?: string
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          gateway?: string | null
          gateway_transaction_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          person_id?: string | null
          receipt_sent?: boolean
          receipt_sent_at?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "financial_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      event_occurrences: {
        Row: {
          cancel_reason: string | null
          church_id: string
          created_at: string
          end_datetime: string | null
          event_id: string
          id: string
          is_cancelled: boolean
          occurrence_date: string
          override_location: string | null
          override_title: string | null
          start_datetime: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          church_id: string
          created_at?: string
          end_datetime?: string | null
          event_id: string
          id?: string
          is_cancelled?: boolean
          occurrence_date: string
          override_location?: string | null
          override_title?: string | null
          start_datetime: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          church_id?: string
          created_at?: string
          end_datetime?: string | null
          event_id?: string
          id?: string
          is_cancelled?: boolean
          occurrence_date?: string
          override_location?: string | null
          override_title?: string | null
          start_datetime?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_occurrences_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_occurrences_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_occurrences_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "church_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_templates: {
        Row: {
          category: string | null
          church_id: string | null
          created_at: string | null
          day_of_week: string | null
          default_time: string | null
          id: string
          name: string
          responsible: string | null
          type: string | null
        }
        Insert: {
          category?: string | null
          church_id?: string | null
          created_at?: string | null
          day_of_week?: string | null
          default_time?: string | null
          id?: string
          name: string
          responsible?: string | null
          type?: string | null
        }
        Update: {
          category?: string | null
          church_id?: string | null
          created_at?: string | null
          day_of_week?: string | null
          default_time?: string | null
          id?: string
          name?: string
          responsible?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_campaigns: {
        Row: {
          church_id: string
          created_at: string
          description: string | null
          end_date: string | null
          goal_amount: number | null
          id: string
          is_active: boolean
          name: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          goal_amount?: number | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          goal_amount?: number | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_campaigns_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_campaigns_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          church_id: string
          co_leader_id: string | null
          created_at: string
          description: string | null
          id: string
          leader_id: string | null
          location: string | null
          meeting_day: string | null
          meeting_time: string | null
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          church_id: string
          co_leader_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          co_leader_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          location?: string | null
          meeting_day?: string | null
          meeting_time?: string | null
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_co_leader_id_fkey"
            columns: ["co_leader_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      health_scores: {
        Row: {
          calculated_at: string
          church_id: string
          components: Json | null
          id: string
          score: number
        }
        Insert: {
          calculated_at?: string
          church_id: string
          components?: Json | null
          id?: string
          score?: number
        }
        Update: {
          calculated_at?: string
          church_id?: string
          components?: Json | null
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_scores_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_scores_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonate_sessions: {
        Row: {
          admin_user_id: string
          church_id: string
          ended_at: string | null
          id: string
          notes: string | null
          started_at: string
        }
        Insert: {
          admin_user_id: string
          church_id: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
        }
        Update: {
          admin_user_id?: string
          church_id?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonate_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonate_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          active: boolean
          api_token: string
          church_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          api_token?: string
          church_id: string
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          active?: boolean
          api_token?: string
          church_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          agent: string | null
          church_id: string
          content: Json
          created_at: string
          direction: string
          external_id: string | null
          id: string
          model_used: string
          person_id: string | null
          tokens_used: number
          type: string
        }
        Insert: {
          agent?: string | null
          church_id: string
          content?: Json
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          model_used?: string
          person_id?: string | null
          tokens_used?: number
          type: string
        }
        Update: {
          agent?: string | null
          church_id?: string
          content?: Json
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          model_used?: string
          person_id?: string | null
          tokens_used?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          church_id: string
          created_at: string
          description: string | null
          hosted_invoice_url: string | null
          id: string
          paid_at: string | null
          pdf_url: string | null
          status: string
          stripe_invoice_id: string | null
        }
        Insert: {
          amount_cents?: number
          church_id: string
          created_at?: string
          description?: string | null
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          stripe_invoice_id?: string | null
        }
        Update: {
          amount_cents?: number
          church_id?: string
          created_at?: string
          description?: string | null
          hosted_invoice_url?: string | null
          id?: string
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          stripe_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_capture_rate_limits: {
        Row: {
          block_reason: string | null
          email: string
          id: string
          ip_address: unknown
          plan_interest: string
          submitted_at: string
          user_agent: string | null
          was_blocked: boolean
        }
        Insert: {
          block_reason?: string | null
          email: string
          id?: string
          ip_address: unknown
          plan_interest: string
          submitted_at?: string
          user_agent?: string | null
          was_blocked?: boolean
        }
        Update: {
          block_reason?: string | null
          email?: string
          id?: string
          ip_address?: unknown
          plan_interest?: string
          submitted_at?: string
          user_agent?: string | null
          was_blocked?: boolean
        }
        Relationships: []
      }
      leaders: {
        Row: {
          church_id: string
          created_at: string
          id: string
          is_active: boolean
          ministry_id: string | null
          person_id: string
          role: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          ministry_id?: string | null
          person_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          ministry_id?: string | null
          person_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaders_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaders_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaders_ministry_id_fk"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          church_name: string | null
          created_at: string
          email: string
          estimated_members: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          plan_interest: string
          status: string
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          assigned_to?: string | null
          church_name?: string | null
          created_at?: string
          email: string
          estimated_members?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          plan_interest: string
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          assigned_to?: string | null
          church_name?: string | null
          created_at?: string
          email?: string
          estimated_members?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          plan_interest?: string
          status?: string
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      member_profiles: {
        Row: {
          baptized: boolean | null
          church_id: string
          consolidation_school: boolean | null
          conversion_date: string | null
          created_at: string
          encounter_with_god: boolean | null
          id: string
          person_id: string
          previous_church: string | null
          updated_at: string
        }
        Insert: {
          baptized?: boolean | null
          church_id: string
          consolidation_school?: boolean | null
          conversion_date?: string | null
          created_at?: string
          encounter_with_god?: boolean | null
          id?: string
          person_id: string
          previous_church?: string | null
          updated_at?: string
        }
        Update: {
          baptized?: boolean | null
          church_id?: string
          consolidation_school?: boolean | null
          conversion_date?: string | null
          created_at?: string
          encounter_with_god?: boolean | null
          id?: string
          person_id?: string
          previous_church?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          church_id: string
          content: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          church_id: string
          content: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          church_id?: string
          content?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      ministries: {
        Row: {
          church_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          leader_id: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          leader_id?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministries_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministries_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministries_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "leaders"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_members: {
        Row: {
          church_id: string
          created_at: string
          id: string
          ministry_id: string
          person_id: string
          role: Database["public"]["Enums"]["ministry_role"]
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          ministry_id: string
          person_id: string
          role?: Database["public"]["Enums"]["ministry_role"]
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          ministry_id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["ministry_role"]
        }
        Relationships: [
          {
            foreignKeyName: "ministry_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_members_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_webhooks: {
        Row: {
          church_id: string
          created_at: string
          id: string
          is_active: boolean
          people_url: string | null
          pipeline_url: string | null
          secret_token: string | null
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          people_url?: string | null
          pipeline_url?: string | null
          secret_token?: string | null
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          people_url?: string | null
          pipeline_url?: string | null
          secret_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "n8n_webhooks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_webhooks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          automation_name: string | null
          body: string | null
          church_id: string
          created_at: string
          id: string
          link: string | null
          person_id: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          automation_name?: string | null
          body?: string | null
          church_id: string
          created_at?: string
          id?: string
          link?: string | null
          person_id?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          automation_name?: string | null
          body?: string | null
          church_id?: string
          created_at?: string
          id?: string
          link?: string | null
          person_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          answers: Json | null
          block_index: number
          church_id: string | null
          completed_at: string | null
          config_json: Json | null
          created_at: string
          id: string
          messages: Json
          plan_slug: string | null
          recommended_agents: string[] | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json | null
          block_index?: number
          church_id?: string | null
          completed_at?: string | null
          config_json?: Json | null
          created_at?: string
          id?: string
          messages?: Json
          plan_slug?: string | null
          recommended_agents?: string[] | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json | null
          block_index?: number
          church_id?: string | null
          completed_at?: string | null
          config_json?: Json | null
          created_at?: string
          id?: string
          messages?: Json
          plan_slug?: string | null
          recommended_agents?: string[] | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          church_id: string | null
          completed_at: string | null
          created_at: string
          error_msg: string | null
          id: string
          label: string
          session_id: string
          started_at: string | null
          status: string
          step_number: number
          updated_at: string
        }
        Insert: {
          church_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_msg?: string | null
          id?: string
          label: string
          session_id: string
          started_at?: string | null
          status?: string
          step_number: number
          updated_at?: string
        }
        Update: {
          church_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_msg?: string | null
          id?: string
          label?: string
          session_id?: string
          started_at?: string | null
          status?: string
          step_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_steps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_cabinet: {
        Row: {
          bio: string | null
          church_id: string
          created_at: string
          id: string
          is_active: boolean
          order_index: number
          person_id: string
          photo_url: string | null
          role: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          church_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          order_index?: number
          person_id: string
          photo_url?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          church_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          order_index?: number
          person_id?: string
          photo_url?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_cabinet_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_cabinet_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_cabinet_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      pastoral_goals: {
        Row: {
          baseline: number | null
          church_id: string
          created_at: string
          id: string
          metric: string
          period: string
          target: number
        }
        Insert: {
          baseline?: number | null
          church_id: string
          created_at?: string
          id?: string
          metric: string
          period?: string
          target: number
        }
        Update: {
          baseline?: number | null
          church_id?: string
          created_at?: string
          id?: string
          metric?: string
          period?: string
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_goals_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_goals_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_addons: {
        Row: {
          addon_slug: string
          addon_type: string
          charge_at: string
          charged_at: string | null
          church_id: string
          id: string
          notes: string | null
          price_cents: number
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          addon_slug: string
          addon_type: string
          charge_at: string
          charged_at?: string | null
          church_id: string
          id?: string
          notes?: string | null
          price_cents: number
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          addon_slug?: string
          addon_type?: string
          charge_at?: string
          charged_at?: string | null
          church_id?: string
          id?: string
          notes?: string | null
          price_cents?: number
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_addons_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_addons_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          address_complement: string | null
          available_days: string | null
          available_periods: string | null
          avatar_url: string | null
          baptism_date: string | null
          baptism_type: string | null
          baptized: boolean | null
          batismo_status: string | null
          birth_date: string | null
          calling: string | null
          celula_id: string | null
          children_count: number | null
          children_info: string | null
          church_id: string
          church_relationship:
            | Database["public"]["Enums"]["church_relationship"]
            | null
          church_role: string | null
          city: string | null
          como_conheceu: string | null
          consolidation_school: boolean | null
          conversion_date: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          encounter_with_god: boolean | null
          experiencia_lideranca: string | null
          first_name: string | null
          first_visit_date: string | null
          has_cell: boolean | null
          id: string
          in_discipleship: boolean | null
          instagram_handle: string | null
          interested_in_cell: boolean | null
          invited_by: string | null
          is_dizimista: boolean | null
          is_volunteer: boolean
          last_attendance_at: string | null
          last_contact_at: string | null
          last_name: string | null
          latitude: number | null
          lgpd_consent: boolean | null
          longitude: number | null
          marital_status: string | null
          membership_date: string | null
          membership_status: string | null
          ministry_interest: string[] | null
          name: string | null
          neighborhood: string | null
          network: string | null
          observacoes_pastorais: string | null
          optout: boolean
          optout_at: string | null
          origin_church_name: string | null
          origin_pastor_name: string | null
          person_stage: Database["public"]["Enums"]["person_stage"] | null
          phone: string | null
          phone_secondary: string | null
          previous_church: string | null
          reengagement_last_sent_at: string | null
          reengagement_status: string | null
          responsible_id: string | null
          serves_ministry: boolean | null
          skills_text: string | null
          source: string
          spouse_name: string | null
          state: string | null
          street: string | null
          street_number: string | null
          tags: string[]
          updated_at: string
          wedding_date: string | null
          zip_code: string | null
        }
        Insert: {
          address_complement?: string | null
          available_days?: string | null
          available_periods?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
          baptism_type?: string | null
          baptized?: boolean | null
          batismo_status?: string | null
          birth_date?: string | null
          calling?: string | null
          celula_id?: string | null
          children_count?: number | null
          children_info?: string | null
          church_id: string
          church_relationship?:
            | Database["public"]["Enums"]["church_relationship"]
            | null
          church_role?: string | null
          city?: string | null
          como_conheceu?: string | null
          consolidation_school?: boolean | null
          conversion_date?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          encounter_with_god?: boolean | null
          experiencia_lideranca?: string | null
          first_name?: string | null
          first_visit_date?: string | null
          has_cell?: boolean | null
          id?: string
          in_discipleship?: boolean | null
          instagram_handle?: string | null
          interested_in_cell?: boolean | null
          invited_by?: string | null
          is_dizimista?: boolean | null
          is_volunteer?: boolean
          last_attendance_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          latitude?: number | null
          lgpd_consent?: boolean | null
          longitude?: number | null
          marital_status?: string | null
          membership_date?: string | null
          membership_status?: string | null
          ministry_interest?: string[] | null
          name?: string | null
          neighborhood?: string | null
          network?: string | null
          observacoes_pastorais?: string | null
          optout?: boolean
          optout_at?: string | null
          origin_church_name?: string | null
          origin_pastor_name?: string | null
          person_stage?: Database["public"]["Enums"]["person_stage"] | null
          phone?: string | null
          phone_secondary?: string | null
          previous_church?: string | null
          reengagement_last_sent_at?: string | null
          reengagement_status?: string | null
          responsible_id?: string | null
          serves_ministry?: boolean | null
          skills_text?: string | null
          source?: string
          spouse_name?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          tags?: string[]
          updated_at?: string
          wedding_date?: string | null
          zip_code?: string | null
        }
        Update: {
          address_complement?: string | null
          available_days?: string | null
          available_periods?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
          baptism_type?: string | null
          baptized?: boolean | null
          batismo_status?: string | null
          birth_date?: string | null
          calling?: string | null
          celula_id?: string | null
          children_count?: number | null
          children_info?: string | null
          church_id?: string
          church_relationship?:
            | Database["public"]["Enums"]["church_relationship"]
            | null
          church_role?: string | null
          city?: string | null
          como_conheceu?: string | null
          consolidation_school?: boolean | null
          conversion_date?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          encounter_with_god?: boolean | null
          experiencia_lideranca?: string | null
          first_name?: string | null
          first_visit_date?: string | null
          has_cell?: boolean | null
          id?: string
          in_discipleship?: boolean | null
          instagram_handle?: string | null
          interested_in_cell?: boolean | null
          invited_by?: string | null
          is_dizimista?: boolean | null
          is_volunteer?: boolean
          last_attendance_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          latitude?: number | null
          lgpd_consent?: boolean | null
          longitude?: number | null
          marital_status?: string | null
          membership_date?: string | null
          membership_status?: string | null
          ministry_interest?: string[] | null
          name?: string | null
          neighborhood?: string | null
          network?: string | null
          observacoes_pastorais?: string | null
          optout?: boolean
          optout_at?: string | null
          origin_church_name?: string | null
          origin_pastor_name?: string | null
          person_stage?: Database["public"]["Enums"]["person_stage"] | null
          phone?: string | null
          phone_secondary?: string | null
          previous_church?: string | null
          reengagement_last_sent_at?: string | null
          reengagement_status?: string | null
          responsible_id?: string | null
          serves_ministry?: boolean | null
          skills_text?: string | null
          source?: string
          spouse_name?: string | null
          state?: string | null
          street?: string | null
          street_number?: string | null
          tags?: string[]
          updated_at?: string
          wedding_date?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_celula_id_fkey"
            columns: ["celula_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      person_events: {
        Row: {
          church_id: string
          created_at: string
          data: Json | null
          event_type: string
          id: string
          person_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          data?: Json | null
          event_type: string
          id?: string
          person_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          data?: Json | null
          event_type?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_pipeline: {
        Row: {
          church_id: string
          created_at: string
          entered_at: string
          id: string
          last_activity_at: string
          loss_reason: string | null
          notes: string | null
          person_id: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          entered_at?: string
          id?: string
          last_activity_at?: string
          loss_reason?: string | null
          notes?: string | null
          person_id: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          entered_at?: string
          id?: string
          last_activity_at?: string
          loss_reason?: string | null
          notes?: string | null
          person_id?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_pipeline_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pipeline_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pipeline_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_pipeline_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      person_roles: {
        Row: {
          church_id: string
          created_at: string
          id: string
          person_id: string
          role_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          person_id: string
          role_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          person_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_tags: {
        Row: {
          church_id: string
          created_at: string
          id: string
          person_id: string
          tag_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          person_id: string
          tag_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          person_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_history: {
        Row: {
          church_id: string
          from_stage_id: string | null
          id: string
          loss_reason: string | null
          moved_at: string
          moved_by: string | null
          notes: string | null
          person_id: string
          to_stage_id: string
        }
        Insert: {
          church_id: string
          from_stage_id?: string | null
          id?: string
          loss_reason?: string | null
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          person_id: string
          to_stage_id: string
        }
        Update: {
          church_id?: string
          from_stage_id?: string | null
          id?: string
          loss_reason?: string | null
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          person_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_history_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_history_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_history_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          auto_followup: boolean
          church_id: string
          color: string
          created_at: string
          days_until_followup: number
          description: string | null
          icon: string
          id: string
          is_active: boolean
          is_entry_point: boolean
          is_terminal: boolean
          name: string
          order_index: number
          pipeline_id: string | null
          sla_hours: number | null
          slug: string
        }
        Insert: {
          auto_followup?: boolean
          church_id: string
          color?: string
          created_at?: string
          days_until_followup?: number
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_entry_point?: boolean
          is_terminal?: boolean
          name: string
          order_index: number
          pipeline_id?: string | null
          sla_hours?: number | null
          slug: string
        }
        Update: {
          auto_followup?: boolean
          church_id?: string
          color?: string
          created_at?: string
          days_until_followup?: number
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_entry_point?: boolean
          is_terminal?: boolean
          name?: string
          order_index?: number
          pipeline_id?: string | null
          sla_hours?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          church_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          included_agents: number
          max_agents: number | null
          max_users: number
          name: string
          price_cents: number
          slug: string
          sort_order: number | null
          stripe_price_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          included_agents?: number
          max_agents?: number | null
          max_users?: number
          name: string
          price_cents: number
          slug: string
          sort_order?: number | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          included_agents?: number
          max_agents?: number | null
          max_users?: number
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number | null
          stripe_price_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          church_id: string
          created_at: string
          display_name: string | null
          id: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          church_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          church_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      service_schedule_assignments: {
        Row: {
          church_id: string
          created_at: string
          id: string
          notified_at: string | null
          responded_at: string | null
          role: string | null
          schedule_id: string
          status: string
          volunteer_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          notified_at?: string | null
          responded_at?: string | null
          role?: string | null
          schedule_id: string
          status?: string
          volunteer_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          notified_at?: string | null
          responded_at?: string | null
          role?: string | null
          schedule_id?: string
          status?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedule_assignments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_assignments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_assignments_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          event_date: string
          event_name: string
          event_time: string | null
          id: string
          ministry_id: string
          notes: string | null
          published_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          event_date: string
          event_name: string
          event_time?: string | null
          id?: string
          ministry_id: string
          notes?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          event_date?: string
          event_name?: string
          event_time?: string | null
          id?: string
          ministry_id?: string
          notes?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      session_tokens: {
        Row: {
          church_id: string
          created_at: string
          device_info: Json | null
          id: string
          last_active_at: string
          token: string
          user_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          device_info?: Json | null
          id?: string
          last_active_at?: string
          token?: string
          user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          device_info?: Json | null
          id?: string
          last_active_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_tokens_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_tokens_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_prices: {
        Row: {
          active: boolean
          amount_cents: number
          billing_interval: string
          created_at: string
          currency: string
          id: string
          kind: string
          nickname: string
          plan_slug: string
          stripe_price_id: string
          stripe_product_id: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          billing_interval?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          nickname: string
          plan_slug: string
          stripe_price_id: string
          stripe_product_id: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          billing_interval?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          nickname?: string
          plan_slug?: string
          stripe_price_id?: string
          stripe_product_id?: string
        }
        Relationships: []
      }
      subscription_agents: {
        Row: {
          active: boolean
          agent_slug: string
          created_at: string
          id: string
          subscription_id: string
        }
        Insert: {
          active?: boolean
          agent_slug: string
          created_at?: string
          id?: string
          subscription_id: string
        }
        Update: {
          active?: boolean
          agent_slug?: string
          created_at?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_agents_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "agents_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "subscription_agents_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          applied_coupon_id: string | null
          billing_origin: string
          cancel_at_period_end: boolean
          church_id: string
          created_at: string
          created_by: string | null
          current_period_end: string | null
          current_period_start: string | null
          custom_agent_price_cents: number | null
          custom_plan_price_cents: number | null
          custom_user_price_cents: number | null
          discount_cents: number | null
          effective_price_cents: number | null
          extra_agents: number
          extra_users: number
          id: string
          internal_notes: string | null
          plan_slug: string
          price_notes: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string
          updated_at: string
        }
        Insert: {
          applied_coupon_id?: string | null
          billing_origin: string
          cancel_at_period_end?: boolean
          church_id: string
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_agent_price_cents?: number | null
          custom_plan_price_cents?: number | null
          custom_user_price_cents?: number | null
          discount_cents?: number | null
          effective_price_cents?: number | null
          extra_agents?: number
          extra_users?: number
          id?: string
          internal_notes?: string | null
          plan_slug: string
          price_notes?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          updated_at?: string
        }
        Update: {
          applied_coupon_id?: string | null
          billing_origin?: string
          cancel_at_period_end?: boolean
          church_id?: string
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          custom_agent_price_cents?: number | null
          custom_plan_price_cents?: number | null
          custom_user_price_cents?: number | null
          discount_cents?: number | null
          effective_price_cents?: number | null
          extra_agents?: number
          extra_users?: number
          id?: string
          internal_notes?: string | null
          plan_slug?: string
          price_notes?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_subscriptions_coupon"
            columns: ["applied_coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      supervisor_areas: {
        Row: {
          church_id: string
          created_at: string
          group_id: string
          id: string
          supervisor_user_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          group_id: string
          id?: string
          supervisor_user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          group_id?: string
          id?: string
          supervisor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_areas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_areas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_areas_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          church_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          church_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          person_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          church_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          person_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          church_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          person_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          church_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          availability: Json
          church_id: string
          created_at: string
          id: string
          is_active: boolean
          joined_at: string
          ministry_id: string
          person_id: string
          role: string | null
          skills: string[]
          updated_at: string
        }
        Insert: {
          availability?: Json
          church_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          ministry_id: string
          person_id: string
          role?: string | null
          skills?: string[]
          updated_at?: string
        }
        Update: {
          availability?: Json
          church_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          ministry_id?: string
          person_id?: string
          role?: string | null
          skills?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_churches_overview: {
        Row: {
          agent_count: number | null
          city: string | null
          created_at: string | null
          current_period_end: string | null
          health_calculated_at: string | null
          health_score: number | null
          id: string | null
          last_activity: string | null
          logo_url: string | null
          name: string | null
          plan_slug: string | null
          state: string | null
          status: string | null
          subscription_status: string | null
          user_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["slug"]
          },
        ]
      }
    }
    Functions: {
      apply_discipleship_template: {
        Args: { p_church_id: string; p_template_slug: string }
        Returns: undefined
      }
      auth_can_all_people: { Args: never; Returns: boolean }
      auth_can_financial: { Args: never; Returns: boolean }
      auth_church_id: { Args: never; Returns: string }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      church_has_access: { Args: { p_church_id: string }; Returns: boolean }
      create_default_pipeline_stages: {
        Args: { p_church_id: string }
        Returns: undefined
      }
      generate_event_occurrences: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      grant_access: {
        Args: {
          p_affiliate_id?: string
          p_church_id: string
          p_converts_to_paid?: boolean
          p_ends_at?: string
          p_grant_type: string
          p_granted_by?: string
          p_granted_reason?: string
          p_notes?: string
          p_plan_slug: string
          p_source: string
          p_starts_at?: string
          p_subscription_id?: string
        }
        Returns: string
      }
      is_ekthos_admin: { Args: never; Returns: boolean }
      process_invoice_payment_failed: {
        Args: { p_payload: Json }
        Returns: Json
      }
      process_stripe_checkout_completed: {
        Args: { p_payload: Json }
        Returns: Json
      }
      process_subscription_deleted: { Args: { p_payload: Json }; Returns: Json }
      process_subscription_updated: { Args: { p_payload: Json }; Returns: Json }
      upsert_session_token: { Args: { p_church_id: string }; Returns: string }
      validate_session_token: { Args: { p_token: string }; Returns: boolean }
    }
    Enums: {
      agent_pricing_tier: "free" | "always_paid" | "eligible"
      app_role:
        | "admin"
        | "admin_departments"
        | "pastor_celulas"
        | "supervisor"
        | "cell_leader"
        | "secretary"
        | "treasurer"
      cell_role: "participante" | "lider" | "hospedeiro" | "aprendiz"
      church_relationship:
        | "visitante"
        | "frequentador"
        | "membro"
        | "transferido"
      ministry_role: "membro" | "lider" | "coordenador"
      person_stage:
        | "visitante"
        | "contato"
        | "frequentador"
        | "consolidado"
        | "discipulo"
        | "lider"
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
      agent_pricing_tier: ["free", "always_paid", "eligible"],
      app_role: [
        "admin",
        "admin_departments",
        "pastor_celulas",
        "supervisor",
        "cell_leader",
        "secretary",
        "treasurer",
      ],
      cell_role: ["participante", "lider", "hospedeiro", "aprendiz"],
      church_relationship: [
        "visitante",
        "frequentador",
        "membro",
        "transferido",
      ],
      ministry_role: ["membro", "lider", "coordenador"],
      person_stage: [
        "visitante",
        "contato",
        "frequentador",
        "consolidado",
        "discipulo",
        "lider",
      ],
    },
  },
} as const
