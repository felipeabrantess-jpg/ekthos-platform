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
      acolhimento_journey: {
        Row: {
          cancelled_reason: string | null
          church_id: string
          completed_at: string | null
          created_at: string
          current_touchpoint: string
          email_welcome_dispatched_at: string | null
          history: Json
          id: string
          n8n_welcome_dispatched_at: string | null
          next_touchpoint_at: string
          pastoral_notes: string | null
          person_id: string
          responses_received: Json
          started_at: string
          status: string
          touchpoints_sent: Json
          updated_at: string
          welcome_dispatched_at: string | null
        }
        Insert: {
          cancelled_reason?: string | null
          church_id: string
          completed_at?: string | null
          created_at?: string
          current_touchpoint?: string
          email_welcome_dispatched_at?: string | null
          history?: Json
          id?: string
          n8n_welcome_dispatched_at?: string | null
          next_touchpoint_at?: string
          pastoral_notes?: string | null
          person_id: string
          responses_received?: Json
          started_at?: string
          status?: string
          touchpoints_sent?: Json
          updated_at?: string
          welcome_dispatched_at?: string | null
        }
        Update: {
          cancelled_reason?: string | null
          church_id?: string
          completed_at?: string | null
          created_at?: string
          current_touchpoint?: string
          email_welcome_dispatched_at?: string | null
          history?: Json
          id?: string
          n8n_welcome_dispatched_at?: string | null
          next_touchpoint_at?: string
          pastoral_notes?: string | null
          person_id?: string
          responses_received?: Json
          started_at?: string
          status?: string
          touchpoints_sent?: Json
          updated_at?: string
          welcome_dispatched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acolhimento_journey_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_journey_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_journey_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          actor_email: string | null
          actor_roles: string[] | null
          admin_user_id: string
          after: Json | null
          before: Json | null
          church_id: string | null
          created_at: string
          error_msg: string | null
          id: string
          impersonated_church_id: string | null
          impersonation_session_id: string | null
          ip_address: unknown
          reason: string | null
          request_id: string | null
          resource: string | null
          resource_id: string | null
          source: string | null
          status: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_roles?: string[] | null
          admin_user_id: string
          after?: Json | null
          before?: Json | null
          church_id?: string | null
          created_at?: string
          error_msg?: string | null
          id?: string
          impersonated_church_id?: string | null
          impersonation_session_id?: string | null
          ip_address?: unknown
          reason?: string | null
          request_id?: string | null
          resource?: string | null
          resource_id?: string | null
          source?: string | null
          status?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_roles?: string[] | null
          admin_user_id?: string
          after?: Json | null
          before?: Json | null
          church_id?: string | null
          created_at?: string
          error_msg?: string | null
          id?: string
          impersonated_church_id?: string | null
          impersonation_session_id?: string | null
          ip_address?: unknown
          reason?: string | null
          request_id?: string | null
          resource?: string | null
          resource_id?: string | null
          source?: string | null
          status?: string | null
          user_agent?: string | null
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
          {
            foreignKeyName: "admin_events_impersonated_church_id_fkey"
            columns: ["impersonated_church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_events_impersonated_church_id_fkey"
            columns: ["impersonated_church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_events_impersonation_session_id_fkey"
            columns: ["impersonation_session_id"]
            isOneToOne: false
            referencedRelation: "impersonate_sessions"
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
      agent_channel_routing: {
        Row: {
          agent_slug: string
          channel_type: string
          context_type: string | null
        }
        Insert: {
          agent_slug: string
          channel_type: string
          context_type?: string | null
        }
        Update: {
          agent_slug?: string
          channel_type?: string
          context_type?: string | null
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
          archived: boolean | null
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
          archived?: boolean | null
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
          archived?: boolean | null
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
      agent_credit_alerts: {
        Row: {
          agent_scope: string
          church_id: string
          cycle_start: string
          threshold_100_at: string | null
          threshold_70_at: string | null
          threshold_90_at: string | null
        }
        Insert: {
          agent_scope: string
          church_id: string
          cycle_start: string
          threshold_100_at?: string | null
          threshold_70_at?: string | null
          threshold_90_at?: string | null
        }
        Update: {
          agent_scope?: string
          church_id?: string
          cycle_start?: string
          threshold_100_at?: string | null
          threshold_70_at?: string | null
          threshold_90_at?: string | null
        }
        Relationships: []
      }
      agent_credit_plans: {
        Row: {
          active: boolean | null
          applies_to: string[]
          created_at: string | null
          monthly_credits: number
          monthly_price_cents: number
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          applies_to: string[]
          created_at?: string | null
          monthly_credits: number
          monthly_price_cents: number
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          applies_to?: string[]
          created_at?: string | null
          monthly_credits?: number
          monthly_price_cents?: number
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      agent_credit_usage: {
        Row: {
          agent_slug: string
          church_id: string
          consumed_at: string | null
          credits_consumed: number
          description: string | null
          id: string
          operation_type: string
          related_entity_id: string | null
          source: string
        }
        Insert: {
          agent_slug: string
          church_id: string
          consumed_at?: string | null
          credits_consumed: number
          description?: string | null
          id?: string
          operation_type: string
          related_entity_id?: string | null
          source: string
        }
        Update: {
          agent_slug?: string
          church_id?: string
          consumed_at?: string | null
          credits_consumed?: number
          description?: string | null
          id?: string
          operation_type?: string
          related_entity_id?: string | null
          source?: string
        }
        Relationships: []
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
          status: string | null
          success: boolean | null
          trigger_type: string | null
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
          status?: string | null
          success?: boolean | null
          trigger_type?: string | null
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
          status?: string | null
          success?: boolean | null
          trigger_type?: string | null
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
      agent_grants: {
        Row: {
          active: boolean
          agent_slug: string
          church_id: string
          created_at: string
          ends_at: string | null
          grant_type: string
          granted_by: string
          id: string
          notes: string | null
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          agent_slug: string
          church_id: string
          created_at?: string
          ends_at?: string | null
          grant_type: string
          granted_by: string
          id?: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          agent_slug?: string
          church_id?: string
          created_at?: string
          ends_at?: string | null
          grant_type?: string
          granted_by?: string
          id?: string
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_grants_agent_slug_fkey"
            columns: ["agent_slug"]
            isOneToOne: false
            referencedRelation: "agents_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "agent_grants_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_grants_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_message_pending_approval: {
        Row: {
          agent_slug: string
          approved_at: string | null
          approved_by: string | null
          church_id: string
          conversation_id: string | null
          created_at: string
          draft_content: string
          draft_metadata: Json
          expires_at: string | null
          id: string
          rejected_reason: string | null
          status: string
        }
        Insert: {
          agent_slug: string
          approved_at?: string | null
          approved_by?: string | null
          church_id: string
          conversation_id?: string | null
          created_at?: string
          draft_content: string
          draft_metadata?: Json
          expires_at?: string | null
          id?: string
          rejected_reason?: string | null
          status?: string
        }
        Update: {
          agent_slug?: string
          approved_at?: string | null
          approved_by?: string | null
          church_id?: string
          conversation_id?: string | null
          created_at?: string
          draft_content?: string
          draft_metadata?: Json
          expires_at?: string | null
          id?: string
          rejected_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_message_pending_approval_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_message_pending_approval_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_message_pending_approval_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_messages: {
        Row: {
          agent_slug: string
          attempt_count: number
          church_id: string
          created_at: string | null
          id: string
          payload: Json
          resolved_at: string | null
          scheduled_for: string
          status: string | null
        }
        Insert: {
          agent_slug: string
          attempt_count?: number
          church_id: string
          created_at?: string | null
          id?: string
          payload: Json
          resolved_at?: string | null
          scheduled_for: string
          status?: string | null
        }
        Update: {
          agent_slug?: string
          attempt_count?: number
          church_id?: string
          created_at?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          scheduled_for?: string
          status?: string | null
        }
        Relationships: []
      }
      agent_prompt_templates: {
        Row: {
          active: boolean
          agent_slug: string
          base_prompt: string
          created_at: string
          id: string
          name: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          agent_slug: string
          base_prompt: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          agent_slug?: string
          base_prompt?: string
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      agents_catalog: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          cta_type: string | null
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
          status: string | null
          updated_at: string | null
          visible_in_vitrine: boolean | null
          without_me: string | null
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          cta_type?: string | null
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
          status?: string | null
          updated_at?: string | null
          visible_in_vitrine?: boolean | null
          without_me?: string | null
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          cta_type?: string | null
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
          status?: string | null
          updated_at?: string | null
          visible_in_vitrine?: boolean | null
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
      campaign_blast_sends: {
        Row: {
          blast_id: string
          church_id: string
          created_at: string | null
          error_msg: string | null
          id: string
          person_id: string | null
          person_name: string | null
          phone: string
          sent_at: string | null
          status: string
          zapi_message_id: string | null
        }
        Insert: {
          blast_id: string
          church_id: string
          created_at?: string | null
          error_msg?: string | null
          id?: string
          person_id?: string | null
          person_name?: string | null
          phone: string
          sent_at?: string | null
          status?: string
          zapi_message_id?: string | null
        }
        Update: {
          blast_id?: string
          church_id?: string
          created_at?: string | null
          error_msg?: string | null
          id?: string
          person_id?: string | null
          person_name?: string | null
          phone?: string
          sent_at?: string | null
          status?: string
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_blast_sends_blast_id_fkey"
            columns: ["blast_id"]
            isOneToOne: false
            referencedRelation: "campaign_blasts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_blasts: {
        Row: {
          batch_interval_seconds: number
          batch_size: number
          church_id: string
          created_at: string | null
          created_by: string | null
          failed_count: number | null
          id: string
          instance_id: string
          instance_token: string
          message_text: string | null
          sent_count: number | null
          status: string
          title: string
          total_recipients: number | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          batch_interval_seconds?: number
          batch_size?: number
          church_id: string
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          instance_id: string
          instance_token: string
          message_text?: string | null
          sent_count?: number | null
          status?: string
          title?: string
          total_recipients?: number | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          batch_interval_seconds?: number
          batch_size?: number
          church_id?: string
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          instance_id?: string
          instance_token?: string
          message_text?: string | null
          sent_count?: number | null
          status?: string
          title?: string
          total_recipients?: number | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
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
      channel_dispatch_queue: {
        Row: {
          attempt_count: number
          channel_id: string
          church_id: string
          content: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          message_id: string | null
          processed_at: string | null
          provider_response: Json | null
          scheduled_at: string
          status: string
          to_phone: string
        }
        Insert: {
          attempt_count?: number
          channel_id: string
          church_id: string
          content: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          message_id?: string | null
          processed_at?: string | null
          provider_response?: Json | null
          scheduled_at?: string
          status?: string
          to_phone: string
        }
        Update: {
          attempt_count?: number
          channel_id?: string
          church_id?: string
          content?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          message_id?: string | null
          processed_at?: string | null
          provider_response?: Json | null
          scheduled_at?: string
          status?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_dispatch_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "church_whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_dispatch_queue_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_dispatch_queue_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_dispatch_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_dispatch_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      church_agent_channel_routing: {
        Row: {
          agent_slug: string
          church_id: string
          context_type: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          agent_slug: string
          church_id: string
          context_type: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          agent_slug?: string
          church_id?: string
          context_type?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_agent_channel_routing_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_agent_channel_routing_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_agent_config: {
        Row: {
          active: boolean | null
          agent_name: string | null
          agent_slug: string
          approval_mode: string
          church_id: string
          church_name_short: string | null
          created_at: string | null
          custom_instructions: string | null
          custom_overrides: Json | null
          denomination: string | null
          emoji_usage: string | null
          escalation_config: Json | null
          first_contact_delay: string | null
          forbidden_topics: string[] | null
          formality: string | null
          health_score_threshold: number | null
          pastor_name: string | null
          pastoral_depth: string | null
          preferred_verses: string[] | null
          send_window: Json | null
          service_schedule: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          active?: boolean | null
          agent_name?: string | null
          agent_slug: string
          approval_mode?: string
          church_id: string
          church_name_short?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          custom_overrides?: Json | null
          denomination?: string | null
          emoji_usage?: string | null
          escalation_config?: Json | null
          first_contact_delay?: string | null
          forbidden_topics?: string[] | null
          formality?: string | null
          health_score_threshold?: number | null
          pastor_name?: string | null
          pastoral_depth?: string | null
          preferred_verses?: string[] | null
          send_window?: Json | null
          service_schedule?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          active?: boolean | null
          agent_name?: string | null
          agent_slug?: string
          approval_mode?: string
          church_id?: string
          church_name_short?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          custom_overrides?: Json | null
          denomination?: string | null
          emoji_usage?: string | null
          escalation_config?: Json | null
          first_contact_delay?: string | null
          forbidden_topics?: string[] | null
          formality?: string | null
          health_score_threshold?: number | null
          pastor_name?: string | null
          pastoral_depth?: string | null
          preferred_verses?: string[] | null
          send_window?: Json | null
          service_schedule?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      church_agent_config_history: {
        Row: {
          agent_slug: string
          change_reason: string | null
          changed_at: string | null
          changed_by: string | null
          church_id: string
          config_snapshot: Json
          id: string
        }
        Insert: {
          agent_slug: string
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          church_id: string
          config_snapshot: Json
          id?: string
        }
        Update: {
          agent_slug?: string
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          church_id?: string
          config_snapshot?: Json
          id?: string
        }
        Relationships: []
      }
      church_agent_credits: {
        Row: {
          agent_scope: string
          church_id: string
          cycle_credits: number
          cycle_end: string
          cycle_start: string
          expires_at: string | null
          topup_credits: number
          updated_at: string | null
        }
        Insert: {
          agent_scope: string
          church_id: string
          cycle_credits?: number
          cycle_end: string
          cycle_start: string
          expires_at?: string | null
          topup_credits?: number
          updated_at?: string | null
        }
        Update: {
          agent_scope?: string
          church_id?: string
          cycle_credits?: number
          cycle_end?: string
          cycle_start?: string
          expires_at?: string | null
          topup_credits?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_agent_credits_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_agent_credits_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_agent_subscriptions: {
        Row: {
          active: boolean | null
          church_id: string
          created_at: string | null
          current_cycle_end: string
          current_cycle_start: string
          id: string
          paused_by_quota: boolean | null
          paused_by_user: boolean | null
          plan_slug: string
          stripe_subscription_id: string | null
        }
        Insert: {
          active?: boolean | null
          church_id: string
          created_at?: string | null
          current_cycle_end: string
          current_cycle_start?: string
          id?: string
          paused_by_quota?: boolean | null
          paused_by_user?: boolean | null
          plan_slug: string
          stripe_subscription_id?: string | null
        }
        Update: {
          active?: boolean | null
          church_id?: string
          created_at?: string | null
          current_cycle_end?: string
          current_cycle_start?: string
          id?: string
          paused_by_quota?: boolean | null
          paused_by_user?: boolean | null
          plan_slug?: string
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_agent_subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_agent_subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_agent_subscriptions_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "agent_credit_plans"
            referencedColumns: ["slug"]
          },
        ]
      }
      church_channels: {
        Row: {
          agent_slugs: string[]
          church_id: string
          created_at: string
          display_name: string | null
          error_message: string | null
          id: string
          last_health_check: string | null
          last_provisioned_at: string | null
          metadata: Json
          phone_number: string | null
          provider: string
          provider_instance_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_slugs?: string[]
          church_id: string
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_health_check?: string | null
          last_provisioned_at?: string | null
          metadata?: Json
          phone_number?: string | null
          provider: string
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_slugs?: string[]
          church_id?: string
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          id?: string
          last_health_check?: string | null
          last_provisioned_at?: string | null
          metadata?: Json
          phone_number?: string | null
          provider?: string
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_channels_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_channels_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_courses: {
        Row: {
          active: boolean
          church_id: string
          created_at: string
          description: string | null
          end_date: string | null
          enrolled_count: number
          id: string
          image_url: string | null
          instructor: string | null
          is_public: boolean
          location: string | null
          max_capacity: number | null
          prerequisites: string | null
          price: number | null
          schedule_text: string | null
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          church_id: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          enrolled_count?: number
          id?: string
          image_url?: string | null
          instructor?: string | null
          is_public?: boolean
          location?: string | null
          max_capacity?: number | null
          prerequisites?: string | null
          price?: number | null
          schedule_text?: string | null
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          church_id?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          enrolled_count?: number
          id?: string
          image_url?: string | null
          instructor?: string | null
          is_public?: boolean
          location?: string | null
          max_capacity?: number | null
          prerequisites?: string | null
          price?: number | null
          schedule_text?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_courses_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          church_id:    string
          created_at:   string
          id:           string
          is_test:      boolean
          name:         string
          person_id:    string | null
          phone:        string
          request_text: string
          status:       string
          updated_at:   string
        }
        Insert: {
          church_id:    string
          created_at?:  string
          id?:          string
          is_test?:     boolean
          name:         string
          person_id?:   string | null
          phone:        string
          request_text: string
          status?:      string
          updated_at?:  string
        }
        Update: {
          church_id?:   string
          created_at?:  string
          id?:          string
          is_test?:     boolean
          name?:        string
          person_id?:   string | null
          phone?:       string
          request_text?: string
          status?:      string
          updated_at?:  string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_requests_person_id_fkey"
            columns: ["person_id"]
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
      church_followup_config: {
        Row: {
          agent_slug: string
          church_id: string
          created_at: string
          duration_days: number | null
          enabled_touchpoints: string[]
          escalation_conditions: Json
          followup_enabled: boolean
          id: string
          next_action_after_completion: string | null
          send_window_end: string | null
          send_window_start: string | null
          stop_conditions: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_slug: string
          church_id: string
          created_at?: string
          duration_days?: number | null
          enabled_touchpoints?: string[]
          escalation_conditions?: Json
          followup_enabled?: boolean
          id?: string
          next_action_after_completion?: string | null
          send_window_end?: string | null
          send_window_start?: string | null
          stop_conditions?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_slug?: string
          church_id?: string
          created_at?: string
          duration_days?: number | null
          enabled_touchpoints?: string[]
          escalation_conditions?: Json
          followup_enabled?: boolean
          id?: string
          next_action_after_completion?: string | null
          send_window_end?: string | null
          send_window_start?: string | null
          stop_conditions?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_followup_config_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_followup_config_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
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
      church_pastoral_profile: {
        Row: {
          algo_importante_comunidade: string | null
          church_id: string
          created_at: string
          estilo_comunicacao: string | null
          foco_pastoral_30_dias: string | null
          horarios_culto: string | null
          maior_desafio: string | null
          updated_at: string
        }
        Insert: {
          algo_importante_comunidade?: string | null
          church_id: string
          created_at?: string
          estilo_comunicacao?: string | null
          foco_pastoral_30_dias?: string | null
          horarios_culto?: string | null
          maior_desafio?: string | null
          updated_at?: string
        }
        Update: {
          algo_importante_comunidade?: string | null
          church_id?: string
          created_at?: string
          estilo_comunicacao?: string | null
          foco_pastoral_30_dias?: string | null
          horarios_culto?: string | null
          maior_desafio?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_pastoral_profile_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_pastoral_profile_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
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
          welcome_automation_enabled: boolean
          whatsapp_contact: string | null
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
          welcome_automation_enabled?: boolean
          whatsapp_contact?: string | null
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
          welcome_automation_enabled?: boolean
          whatsapp_contact?: string | null
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
      church_whatsapp_channels: {
        Row: {
          active: boolean | null
          channel_type: string
          church_id: string
          connected_by_user_id: string | null
          context_type: string | null
          created_at: string | null
          display_name: string | null
          error_message: string | null
          id: string
          instance_id: string | null
          last_health_check: string | null
          last_provisioned_at: string | null
          meta_access_token: string | null
          meta_phone_number_id: string | null
          meta_waba_id: string | null
          metadata: Json | null
          notes: string | null
          phone_number: string
          provider: string | null
          provider_label: string | null
          session_status: string
          status: string
          updated_at: string
          updated_by: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          active?: boolean | null
          channel_type: string
          church_id: string
          connected_by_user_id?: string | null
          context_type?: string | null
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          instance_id?: string | null
          last_health_check?: string | null
          last_provisioned_at?: string | null
          meta_access_token?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone_number: string
          provider?: string | null
          provider_label?: string | null
          session_status?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          active?: boolean | null
          channel_type?: string
          church_id?: string
          connected_by_user_id?: string | null
          context_type?: string | null
          created_at?: string | null
          display_name?: string | null
          error_message?: string | null
          id?: string
          instance_id?: string | null
          last_health_check?: string | null
          last_provisioned_at?: string | null
          meta_access_token?: string | null
          meta_phone_number_id?: string | null
          meta_waba_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone_number?: string
          provider?: string | null
          provider_label?: string | null
          session_status?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_whatsapp_channels_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_whatsapp_channels_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          address_full: string | null
          branding: Json | null
          city: string | null
          created_at: string
          deleted_at: string | null
          denomination: string | null
          enabled_modules: Json | null
          id: string
          is_active: boolean
          is_matrix: boolean
          is_test_church: boolean
          logo_url: string | null
          main_email: string | null
          main_phone: string | null
          name: string
          onboarding_completed_at: string | null
          onboarding_config: Json | null
          onboarding_step: string
          parent_church_id: string | null
          pastor_titular_can_be_quoted: boolean
          pastor_titular_email: string | null
          pastor_titular_name: string | null
          pastor_titular_phone: string | null
          primary_color: string | null
          region: string | null
          secondary_color: string | null
          slug: string
          social_media_handles: Json | null
          state: string | null
          status: string
          subscription_plan: string | null
          timezone: string
          uf: string | null
          updated_at: string
          vision_statement: string | null
          website_url: string | null
        }
        Insert: {
          address_full?: string | null
          branding?: Json | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          denomination?: string | null
          enabled_modules?: Json | null
          id?: string
          is_active?: boolean
          is_matrix?: boolean
          is_test_church?: boolean
          logo_url?: string | null
          main_email?: string | null
          main_phone?: string | null
          name: string
          onboarding_completed_at?: string | null
          onboarding_config?: Json | null
          onboarding_step?: string
          parent_church_id?: string | null
          pastor_titular_can_be_quoted?: boolean
          pastor_titular_email?: string | null
          pastor_titular_name?: string | null
          pastor_titular_phone?: string | null
          primary_color?: string | null
          region?: string | null
          secondary_color?: string | null
          slug: string
          social_media_handles?: Json | null
          state?: string | null
          status?: string
          subscription_plan?: string | null
          timezone?: string
          uf?: string | null
          updated_at?: string
          vision_statement?: string | null
          website_url?: string | null
        }
        Update: {
          address_full?: string | null
          branding?: Json | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          denomination?: string | null
          enabled_modules?: Json | null
          id?: string
          is_active?: boolean
          is_matrix?: boolean
          is_test_church?: boolean
          logo_url?: string | null
          main_email?: string | null
          main_phone?: string | null
          name?: string
          onboarding_completed_at?: string | null
          onboarding_config?: Json | null
          onboarding_step?: string
          parent_church_id?: string | null
          pastor_titular_can_be_quoted?: boolean
          pastor_titular_email?: string | null
          pastor_titular_name?: string | null
          pastor_titular_phone?: string | null
          primary_color?: string | null
          region?: string | null
          secondary_color?: string | null
          slug?: string
          social_media_handles?: Json | null
          state?: string | null
          status?: string
          subscription_plan?: string | null
          timezone?: string
          uf?: string | null
          updated_at?: string
          vision_statement?: string | null
          website_url?: string | null
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
      contractors: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          document_number: string
          document_type: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          person_type: string
          phone: string | null
          role_label: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          document_number: string
          document_type: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          person_type: string
          phone?: string | null
          role_label: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          document_number?: string
          document_type?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          person_type?: string
          phone?: string | null
          role_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_church_id_fkey"
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
      conversation_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_type: string
          church_id: string
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          message_preview: string | null
          metadata: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_type: string
          church_id: string
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          message_preview?: string | null
          metadata?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          church_id?: string
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message_preview?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          church_id: string
          content: string
          content_type: string
          conversation_id: string
          created_at: string
          direction: string
          error_detail: string | null
          id: string
          metadata: Json | null
          provider_message_id: string | null
          sender_id: string | null
          sender_type: string
          status: string
        }
        Insert: {
          church_id: string
          content: string
          content_type?: string
          conversation_id: string
          created_at?: string
          direction: string
          error_detail?: string | null
          id?: string
          metadata?: Json | null
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string
        }
        Update: {
          church_id?: string
          content?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error_detail?: string | null
          id?: string
          metadata?: Json | null
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_ownership_log: {
        Row: {
          actor_id: string | null
          actor_type: string
          conversation_id: string
          created_at: string
          from_ownership: string
          id: string
          reason: string | null
          to_ownership: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          conversation_id: string
          created_at?: string
          from_ownership: string
          id?: string
          reason?: string | null
          to_ownership: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          conversation_id?: string
          created_at?: string
          from_ownership?: string
          id?: string
          reason?: string | null
          to_ownership?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ownership_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_slug: string | null
          archived_at: string | null
          assigned_to: string | null
          channel_id: string
          channel_type: string
          church_id: string
          closed_at: string | null
          contact_phone: string
          created_at: string
          human_actor_id: string | null
          human_actor_name: string | null
          human_assumed_at: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          ownership: string
          person_id: string | null
          status: string
          tags: string[] | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          agent_slug?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          channel_id: string
          channel_type?: string
          church_id: string
          closed_at?: string | null
          contact_phone: string
          created_at?: string
          human_actor_id?: string | null
          human_actor_name?: string | null
          human_assumed_at?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          ownership?: string
          person_id?: string | null
          status?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          agent_slug?: string | null
          archived_at?: string | null
          assigned_to?: string | null
          channel_id?: string
          channel_type?: string
          church_id?: string
          closed_at?: string | null
          contact_phone?: string
          created_at?: string
          human_actor_id?: string | null
          human_actor_name?: string | null
          human_assumed_at?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          ownership?: string
          person_id?: string | null
          status?: string
          tags?: string[] | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "church_whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_person_id_fkey"
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
      course_enrollments: {
        Row: {
          church_id: string
          course_id: string
          email: string | null
          enrolled_at: string
          id: string
          name: string
          person_id: string | null
          phone: string
        }
        Insert: {
          church_id: string
          course_id: string
          email?: string | null
          enrolled_at?: string
          id?: string
          name: string
          person_id?: string | null
          phone: string
        }
        Update: {
          church_id?: string
          course_id?: string
          email?: string | null
          enrolled_at?: string
          id?: string
          name?: string
          person_id?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "church_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          active: boolean | null
          applies_to: string[]
          credits: number
          name: string
          price_cents: number
          slug: string
          sort_order: number | null
          stripe_price_id: string | null
          ttl_days: number | null
          visible_in_ui: boolean | null
        }
        Insert: {
          active?: boolean | null
          applies_to: string[]
          credits: number
          name: string
          price_cents: number
          slug: string
          sort_order?: number | null
          stripe_price_id?: string | null
          ttl_days?: number | null
          visible_in_ui?: boolean | null
        }
        Update: {
          active?: boolean | null
          applies_to?: string[]
          credits?: number
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number | null
          stripe_price_id?: string | null
          ttl_days?: number | null
          visible_in_ui?: boolean | null
        }
        Relationships: []
      }
      credit_topup_purchases: {
        Row: {
          church_id: string
          credits_purchased: number
          credits_remaining: number
          expires_at: string
          id: string
          package_slug: string
          purchase_price_cents: number
          purchased_at: string | null
          status: string | null
          stripe_invoice_id: string | null
        }
        Insert: {
          church_id: string
          credits_purchased: number
          credits_remaining: number
          expires_at: string
          id?: string
          package_slug: string
          purchase_price_cents: number
          purchased_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
        }
        Update: {
          church_id?: string
          credits_purchased?: number
          credits_remaining?: number
          expires_at?: string
          id?: string
          package_slug?: string
          purchase_price_cents?: number
          purchased_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_topup_purchases_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_topup_purchases_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_topup_purchases_package_slug_fkey"
            columns: ["package_slug"]
            isOneToOne: false
            referencedRelation: "credit_packages"
            referencedColumns: ["slug"]
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
          person_id: string | null
          score: number
        }
        Insert: {
          calculated_at?: string
          church_id: string
          components?: Json | null
          id?: string
          person_id?: string | null
          score?: number
        }
        Update: {
          calculated_at?: string
          church_id?: string
          components?: Json | null
          id?: string
          person_id?: string | null
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
          {
            foreignKeyName: "health_scores_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonate_sessions: {
        Row: {
          admin_user_id: string
          church_id: string
          ended_at: string | null
          ended_reason: string | null
          id: string
          last_action_at: string | null
          notes: string | null
          started_at: string
        }
        Insert: {
          admin_user_id: string
          church_id: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          last_action_at?: string | null
          notes?: string | null
          started_at?: string
        }
        Update: {
          admin_user_id?: string
          church_id?: string
          ended_at?: string | null
          ended_reason?: string | null
          id?: string
          last_action_at?: string | null
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
      internal_notifications: {
        Row: {
          agent_slug: string | null
          assigned_to: string | null
          church_id: string | null
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          notification_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subscription_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_slug?: string | null
          assigned_to?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          notification_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_slug?: string | null
          assigned_to?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          notification_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notifications_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscription_agents"
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
      message_outbox: {
        Row: {
          attempts: number
          body_template_id: string | null
          body_text: string
          channel: string
          church_id: string
          created_at: string
          delivered_at: string | null
          driver: string
          driver_message_id: string | null
          driver_response: Json
          error_message: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          person_id: string | null
          read_at: string | null
          sent_at: string | null
          source: string
          source_event: string | null
          source_ref_id: string | null
          status: string
          to_address: string
          updated_at: string
          variables: Json
        }
        Insert: {
          attempts?: number
          body_template_id?: string | null
          body_text: string
          channel: string
          church_id: string
          created_at?: string
          delivered_at?: string | null
          driver: string
          driver_message_id?: string | null
          driver_response?: Json
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          person_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          source: string
          source_event?: string | null
          source_ref_id?: string | null
          status?: string
          to_address: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          attempts?: number
          body_template_id?: string | null
          body_text?: string
          channel?: string
          church_id?: string
          created_at?: string
          delivered_at?: string | null
          driver?: string
          driver_message_id?: string | null
          driver_response?: Json
          error_message?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          person_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          source?: string
          source_event?: string | null
          source_ref_id?: string | null
          status?: string
          to_address?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_outbox_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_outbox_person_id_fkey"
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
      messaging_config: {
        Row: {
          channel: string
          church_id: string
          created_at: string
          driver: string
          driver_config: Json
          id: string
          is_active: boolean
          is_default: boolean
          updated_at: string
        }
        Insert: {
          channel: string
          church_id: string
          created_at?: string
          driver: string
          driver_config?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
        }
        Update: {
          channel?: string
          church_id?: string
          created_at?: string
          driver?: string
          driver_config?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_config_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_config_church_id_fkey"
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
            foreignKeyName: "ministries_leader_id_people_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          acolhimento_url: string | null
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
          acolhimento_url?: string | null
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
          acolhimento_url?: string | null
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
      pastoral_appointments: {
        Row: {
          appointment_type: string
          church_id: string
          created_at: string
          id: string
          notes: string | null
          pastor_id: string | null
          person_id: string
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_type: string
          church_id: string
          created_at?: string
          id?: string
          notes?: string | null
          pastor_id?: string | null
          person_id: string
          scheduled_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_type?: string
          church_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          pastor_id?: string | null
          person_id?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_appointments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_appointments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_appointments_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pastoral_appointments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          import_batch_id: string | null
          in_discipleship: boolean | null
          instagram_handle: string | null
          interested_in_cell: boolean | null
          invited_by: string | null
          is_bulk_import: boolean
          is_dizimista: boolean | null
          is_leader: boolean
          is_volunteer: boolean
          last_attendance_at: string | null
          last_contact_at: string | null
          last_name: string | null
          latitude: number | null
          lgpd_consent: boolean | null
          lgpd_consent_at: string | null
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
          pipeline_stage_id: string | null
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
          import_batch_id?: string | null
          in_discipleship?: boolean | null
          instagram_handle?: string | null
          interested_in_cell?: boolean | null
          invited_by?: string | null
          is_bulk_import?: boolean
          is_dizimista?: boolean | null
          is_leader?: boolean
          is_volunteer?: boolean
          last_attendance_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          latitude?: number | null
          lgpd_consent?: boolean | null
          lgpd_consent_at?: string | null
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
          pipeline_stage_id?: string | null
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
          import_batch_id?: string | null
          in_discipleship?: boolean | null
          instagram_handle?: string | null
          interested_in_cell?: boolean | null
          invited_by?: string | null
          is_bulk_import?: boolean
          is_dizimista?: boolean | null
          is_leader?: boolean
          is_volunteer?: boolean
          last_attendance_at?: string | null
          last_contact_at?: string | null
          last_name?: string | null
          latitude?: number | null
          lgpd_consent?: boolean | null
          lgpd_consent_at?: string | null
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
          pipeline_stage_id?: string | null
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
          {
            foreignKeyName: "people_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
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
          assigned_by: string | null
          church_id: string
          created_at: string
          id: string
          person_id: string
          tag_id: string
        }
        Insert: {
          assigned_by?: string | null
          church_id: string
          created_at?: string
          id?: string
          person_id: string
          tag_id: string
        }
        Update: {
          assigned_by?: string | null
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
          included_agent_slugs: Json
          included_agents: number
          max_agents: number | null
          max_members: number | null
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
          included_agent_slugs?: Json
          included_agents?: number
          max_agents?: number | null
          max_members?: number | null
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
          included_agent_slugs?: Json
          included_agents?: number
          max_agents?: number | null
          max_members?: number | null
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
          lgpd_consent: boolean | null
          lgpd_consent_at: string | null
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
          lgpd_consent?: boolean | null
          lgpd_consent_at?: string | null
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
          lgpd_consent?: boolean | null
          lgpd_consent_at?: string | null
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
      qr_codes: {
        Row: {
          church_id: string
          created_at: string
          id: string
          is_active: boolean
          scanned_count: number
          slug: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          scanned_count?: number
          slug: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          scanned_count?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      reengagement_journey: {
        Row: {
          cancelled_reason: string | null
          church_id: string
          completed_at: string | null
          created_at: string
          current_touchpoint: string
          id: string
          is_sensitive_case: boolean
          iteration: number
          next_touchpoint_at: string
          pastoral_notes: string | null
          person_id: string
          responses_received: Json
          started_at: string
          status: string
          stop_reason: string | null
          touchpoints_sent: Json
          updated_at: string
        }
        Insert: {
          cancelled_reason?: string | null
          church_id: string
          completed_at?: string | null
          created_at?: string
          current_touchpoint: string
          id?: string
          is_sensitive_case?: boolean
          iteration?: number
          next_touchpoint_at: string
          pastoral_notes?: string | null
          person_id: string
          responses_received?: Json
          started_at?: string
          status?: string
          stop_reason?: string | null
          touchpoints_sent?: Json
          updated_at?: string
        }
        Update: {
          cancelled_reason?: string | null
          church_id?: string
          completed_at?: string | null
          created_at?: string
          current_touchpoint?: string
          id?: string
          is_sensitive_case?: boolean
          iteration?: number
          next_touchpoint_at?: string
          pastoral_notes?: string | null
          person_id?: string
          responses_received?: Json
          started_at?: string
          status?: string
          stop_reason?: string | null
          touchpoints_sent?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reengagement_journey_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_journey_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reengagement_journey_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
          attendance_confirmed: boolean | null
          church_id: string
          confirmed_at: string | null
          confirmed_via: string | null
          created_at: string
          id: string
          notified_at: string | null
          reminder_d1_sent_at: string | null
          reminder_d3_sent_at: string | null
          responded_at: string | null
          role: string | null
          schedule_id: string
          status: string
          volunteer_id: string
        }
        Insert: {
          attendance_confirmed?: boolean | null
          church_id: string
          confirmed_at?: string | null
          confirmed_via?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          reminder_d1_sent_at?: string | null
          reminder_d3_sent_at?: string | null
          responded_at?: string | null
          role?: string | null
          schedule_id: string
          status?: string
          volunteer_id: string
        }
        Update: {
          attendance_confirmed?: boolean | null
          church_id?: string
          confirmed_at?: string | null
          confirmed_via?: string | null
          created_at?: string
          id?: string
          notified_at?: string | null
          reminder_d1_sent_at?: string | null
          reminder_d3_sent_at?: string | null
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
            referencedRelation: "volunteer_total_points"
            referencedColumns: ["volunteer_id"]
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
      service_schedule_availability: {
        Row: {
          blocked_date: string
          church_id: string
          created_at: string
          id: string
          reason: string | null
          volunteer_id: string
        }
        Insert: {
          blocked_date: string
          church_id: string
          created_at?: string
          id?: string
          reason?: string | null
          volunteer_id: string
        }
        Update: {
          blocked_date?: string
          church_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedule_availability_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_availability_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_availability_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteer_total_points"
            referencedColumns: ["volunteer_id"]
          },
          {
            foreignKeyName: "service_schedule_availability_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedule_swap_requests: {
        Row: {
          assignment_id: string
          church_id: string
          created_at: string
          id: string
          requester_note: string | null
          requester_volunteer_id: string
          resolved_at: string | null
          status: string
          target_volunteer_id: string | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          church_id: string
          created_at?: string
          id?: string
          requester_note?: string | null
          requester_volunteer_id: string
          resolved_at?: string | null
          status?: string
          target_volunteer_id?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          church_id?: string
          created_at?: string
          id?: string
          requester_note?: string | null
          requester_volunteer_id?: string
          resolved_at?: string | null
          status?: string
          target_volunteer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedule_swap_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "service_schedule_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_requester_volunteer_id_fkey"
            columns: ["requester_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteer_total_points"
            referencedColumns: ["volunteer_id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_requester_volunteer_id_fkey"
            columns: ["requester_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_target_volunteer_id_fkey"
            columns: ["target_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteer_total_points"
            referencedColumns: ["volunteer_id"]
          },
          {
            foreignKeyName: "service_schedule_swap_requests_target_volunteer_id_fkey"
            columns: ["target_volunteer_id"]
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
      stripe_coupons: {
        Row: {
          active: boolean | null
          amount_off: number | null
          applies_to_products: string[] | null
          archived_at: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          discount_target: string | null
          discount_type: string
          duration: string
          id: string
          last_synced_at: string | null
          livemode: boolean | null
          max_redemptions: number | null
          metadata: Json | null
          name: string
          percent_off: number | null
          promo_code: string | null
          purpose: string | null
          redeem_by: string | null
          stripe_promo_code_id: string | null
          times_redeemed: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          amount_off?: number | null
          applies_to_products?: string[] | null
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_target?: string | null
          discount_type: string
          duration: string
          id: string
          last_synced_at?: string | null
          livemode?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          name: string
          percent_off?: number | null
          promo_code?: string | null
          purpose?: string | null
          redeem_by?: string | null
          stripe_promo_code_id?: string | null
          times_redeemed?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          amount_off?: number | null
          applies_to_products?: string[] | null
          archived_at?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_target?: string | null
          discount_type?: string
          duration?: string
          id?: string
          last_synced_at?: string | null
          livemode?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          name?: string
          percent_off?: number | null
          promo_code?: string | null
          purpose?: string | null
          redeem_by?: string | null
          stripe_promo_code_id?: string | null
          times_redeemed?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      stripe_payment_links: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          key: string
          livemode: boolean | null
          metadata: Json | null
          nickname: string | null
          price_id: string
          updated_at: string | null
          url: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id: string
          key: string
          livemode?: boolean | null
          metadata?: Json | null
          nickname?: string | null
          price_id: string
          updated_at?: string | null
          url: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          key?: string
          livemode?: boolean | null
          metadata?: Json | null
          nickname?: string | null
          price_id?: string
          updated_at?: string | null
          url?: string
        }
        Relationships: []
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
          activation_status: string
          active: boolean
          agent_slug: string
          created_at: string
          credits_balance: number | null
          credits_total: number | null
          id: string
          metadata: Json | null
          package_type: string | null
          subscription_id: string
          updated_at: string | null
        }
        Insert: {
          activation_status?: string
          active?: boolean
          agent_slug: string
          created_at?: string
          credits_balance?: number | null
          credits_total?: number | null
          id?: string
          metadata?: Json | null
          package_type?: string | null
          subscription_id: string
          updated_at?: string | null
        }
        Update: {
          activation_status?: string
          active?: boolean
          agent_slug?: string
          created_at?: string
          credits_balance?: number | null
          credits_total?: number | null
          id?: string
          metadata?: Json | null
          package_type?: string | null
          subscription_id?: string
          updated_at?: string | null
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
          color: string
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          church_id: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          church_id?: string
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
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
      visitor_capture_rate_limits: {
        Row: {
          block_reason: string | null
          church_id: string | null
          id: string
          ip: string
          phone: string | null
          submitted_at: string
          user_agent: string | null
          was_blocked: boolean
        }
        Insert: {
          block_reason?: string | null
          church_id?: string | null
          id?: string
          ip: string
          phone?: string | null
          submitted_at?: string
          user_agent?: string | null
          was_blocked?: boolean
        }
        Update: {
          block_reason?: string | null
          church_id?: string | null
          id?: string
          ip?: string
          phone?: string | null
          submitted_at?: string
          user_agent?: string | null
          was_blocked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "visitor_capture_rate_limits_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_capture_rate_limits_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_points: {
        Row: {
          awarded_at: string
          church_id: string
          id: string
          metadata: Json | null
          points: number
          reason: string
          volunteer_id: string
        }
        Insert: {
          awarded_at?: string
          church_id: string
          id?: string
          metadata?: Json | null
          points?: number
          reason: string
          volunteer_id: string
        }
        Update: {
          awarded_at?: string
          church_id?: string
          id?: string
          metadata?: Json | null
          points?: number
          reason?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_points_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "admin_churches_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_points_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_points_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteer_total_points"
            referencedColumns: ["volunteer_id"]
          },
          {
            foreignKeyName: "volunteer_points_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
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
          max_services_per_month: number
          min_days_between_services: number
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
          max_services_per_month?: number
          min_days_between_services?: number
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
          max_services_per_month?: number
          min_days_between_services?: number
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
      church_agent_activity_last_30d: {
        Row: {
          agent_slug: string | null
          avg_duration_ms: number | null
          church_id: string | null
          error_count: number | null
          last_execution_at: string | null
          model: string | null
          rate_limited_count: number | null
          skipped_count: number | null
          success_count: number | null
          total_cache_creation_tokens: number | null
          total_cache_read_tokens: number | null
          total_executions: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
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
      volunteer_total_points: {
        Row: {
          church_id: string | null
          last_award_at: string | null
          person_name: string | null
          total_awards: number | null
          total_points: number | null
          volunteer_id: string | null
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
        ]
      }
    }
    Functions: {
      _is_ekthos_admin: { Args: never; Returns: boolean }
      activate_agent: { Args: { p_sa_id: string }; Returns: Json }
      activate_agent_internal: {
        Args: { p_agent_slug: string; p_church_id: string; p_source?: string }
        Returns: Json
      }
      admin_grant_agent: {
        Args: {
          p_agent_slug: string
          p_church_id: string
          p_duration_days?: number
          p_grant_type: string
          p_notes?: string
          p_stripe_payment_intent_id?: string
        }
        Returns: Json
      }
      admin_list_grantable_agents: {
        Args: { p_church_id: string }
        Returns: Json
      }
      admin_revoke_agent: {
        Args: { p_agent_slug: string; p_church_id: string }
        Returns: Json
      }
      apply_credit_topup: {
        Args: {
          p_church_id: string
          p_package_slug: string
          p_stripe_invoice_id?: string
        }
        Returns: Json
      }
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
      cancel_agent: { Args: { p_sa_id: string }; Returns: Json }
      capture_visitor_to_pipeline: {
        Args: { p_church_id: string; p_person_id: string }
        Returns: string
      }
      check_credit_thresholds: { Args: never; Returns: Json }
      church_has_access: { Args: { p_church_id: string }; Returns: boolean }
      count_remaining_admins: {
        Args: { p_exclude_id: string }
        Returns: number
      }
      create_default_pipeline_stages: {
        Args: { p_church_id: string }
        Returns: undefined
      }
      debit_agent_credits: {
        Args: {
          p_agent_slug: string
          p_church_id: string
          p_credits: number
          p_description?: string
          p_operation_type: string
          p_related_entity_id?: string
        }
        Returns: Json
      }
      generate_event_occurrences: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      get_agent_acolhimento_dashboard: {
        Args: { p_church_id: string }
        Returns: Json
      }
      get_agent_prompt_resolved: {
        Args: { p_agent_slug: string; p_church_id: string }
        Returns: {
          agent_slug: string
          base_prompt: string
          church_config: Json
          church_id: string
          custom_instructions: string
          has_custom_config: boolean
          resolved_prompt: string
          template_version: number
        }[]
      }
      get_agent_reengajamento_dashboard: {
        Args: { p_church_id: string }
        Returns: Json
      }
      get_church_agent_config: {
        Args: { p_agent_slug: string; p_church_id: string }
        Returns: {
          agent_slug: string
          church_id: string
          created_at: string
          custom_instructions: string
          denomination: string
          formality: string
          updated_at: string
          updated_by: string
        }[]
      }
      get_church_agent_full_config: {
        Args: { p_agent_slug: string; p_church_id: string }
        Returns: Json
      }
      get_church_consumo_summary: {
        Args: { p_church_id: string; p_period_days?: number }
        Returns: Json
      }
      get_church_onboarding_state: {
        Args: { p_church_id: string }
        Returns: Json
      }
      get_top_volunteers: {
        Args: { p_church_id: string; p_days_back?: number; p_limit?: number }
        Returns: {
          ministry_name: string
          person_name: string
          pontos: number
          total_servicos: number
          volunteer_id: string
        }[]
      }
      get_volunteer_attendance_stats: {
        Args: {
          p_church_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          ausentes: number
          cancelados: number
          confirmados: number
          ministry_name: string
          person_name: string
          taxa_presenca: number
          total_escalas: number
          volunteer_id: string
        }[]
      }
      get_volunteer_month_count: {
        Args: { p_month_start?: string; p_volunteer_id: string }
        Returns: number
      }
      get_volunteer_service_history: {
        Args: { p_limit?: number; p_volunteer_id: string }
        Returns: {
          attendance_confirmed: boolean
          confirmed_at: string
          event_date: string
          event_name: string
          role: string
          schedule_id: string
          status: string
        }[]
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
      has_ekthos_role: { Args: { p_role: string }; Returns: boolean }
      increment_blast_failed: {
        Args: { p_blast_id: string }
        Returns: undefined
      }
      increment_blast_sent: { Args: { p_blast_id: string }; Returns: undefined }
      increment_qr_scanned_count: {
        Args: { p_church_id: string }
        Returns: undefined
      }
      is_ekthos_admin: { Args: never; Returns: boolean }
      list_church_channels: {
        Args: { p_church_id: string }
        Returns: {
          agent_slugs: string[]
          display_name: string
          error_message: string
          id: string
          last_provisioned_at: string
          phone_number: string
          provider: string
          provider_instance_id: string
          status: string
          updated_at: string
        }[]
      }
      list_church_whatsapp_channels: {
        Args: { p_church_id: string }
        Returns: {
          display_name: string
          error_message: string
          id: string
          instance_id: string
          last_provisioned_at: string
          phone_number: string
          provider: string
          status: string
          updated_at: string
        }[]
      }
      list_pending_activations: {
        Args: never
        Returns: {
          activation_status: string
          agent_name: string
          agent_slug: string
          church_id: string
          church_name: string
          created_at: string
          credits_balance: number
          credits_total: number
          metadata: Json
          notification_id: string
          notification_status: string
          package_type: string
          sa_id: string
          subscription_id: string
        }[]
      }
      pause_agent: { Args: { p_sa_id: string }; Returns: Json }
      pause_agents_at_zero: { Args: never; Returns: Json }
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
      record_audit_event: {
        Args: {
          p_action: string
          p_actor_email?: string
          p_actor_roles?: string[]
          p_admin_user_id: string
          p_after?: Json
          p_before?: Json
          p_church_id: string
          p_error_msg?: string
          p_impersonated_church_id?: string
          p_impersonation_session_id?: string
          p_reason?: string
          p_request_id?: string
          p_resource?: string
          p_resource_id?: string
          p_source?: string
          p_status?: string
        }
        Returns: string
      }
      reengajamento_scan_disparar: { Args: never; Returns: undefined }
      renew_agent_credit_cycles: { Args: never; Returns: Json }
      reset_church_agent_config: {
        Args: { p_agent_slug: string; p_church_id: string }
        Returns: undefined
      }
      resolve_notification: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      start_agent_setup: {
        Args: { p_notes?: string; p_sa_id: string }
        Returns: Json
      }
      upsert_church_agent_config: {
        Args: {
          p_agent_slug: string
          p_church_id: string
          p_custom_instructions: string
        }
        Returns: Json
      }
      upsert_church_agent_config_admin: {
        Args: { p_agent_slug: string; p_church_id: string; p_data: Json }
        Returns: Json
      }
      upsert_church_cadastro_cristalino: {
        Args: {
          p_church_data: Json
          p_church_id: string
          p_contractor_data: Json
        }
        Returns: Json
      }
      upsert_church_channel: {
        Args: {
          p_agent_slugs: string[]
          p_channel_id?: string
          p_church_id: string
          p_display_name: string
          p_initial_status?: string
          p_phone_number: string
          p_provider: string
          p_provider_instance_id: string
        }
        Returns: {
          channel_id: string
          is_new: boolean
        }[]
      }
      upsert_church_followup_config_admin: {
        Args: { p_agent_slug: string; p_church_id: string; p_data: Json }
        Returns: Json
      }
      upsert_church_onboarding_pastoral: {
        Args: { p_church_id: string; p_pastoral_data: Json }
        Returns: Json
      }
      upsert_church_whatsapp_channel: {
        Args: {
          p_church_id: string
          p_display_name: string
          p_initial_status?: string
          p_instance_id: string
          p_phone_number: string
          p_provider: string
        }
        Returns: {
          channel_id: string
          is_new: boolean
        }[]
      }
      upsert_session_token: { Args: { p_church_id: string }; Returns: string }
      validate_session_token: { Args: { p_token: string }; Returns: boolean }
      volunteer_reengajamento_scan: {
        Args: { p_church_id?: string }
        Returns: Json
      }
    }
    Enums: {
      agent_pricing_tier:
        | "free"
        | "always_paid"
        | "eligible"
        | "coming_soon"
        | "premium"
        | "internal"
      app_role:
        | "admin"
        | "admin_departments"
        | "pastor_celulas"
        | "supervisor"
        | "cell_leader"
        | "secretary"
        | "treasurer"
        | "volunteer"
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
      agent_pricing_tier: [
        "free",
        "always_paid",
        "eligible",
        "coming_soon",
        "premium",
        "internal",
      ],
      app_role: [
        "admin",
        "admin_departments",
        "pastor_celulas",
        "supervisor",
        "cell_leader",
        "secretary",
        "treasurer",
        "volunteer",
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
