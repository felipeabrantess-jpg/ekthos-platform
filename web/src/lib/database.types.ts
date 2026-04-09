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
      agents_catalog: {
        Row: {
          active: boolean
          created_at: string
          features: Json
          full_description: string | null
          id: string
          name: string
          pain_solved: string | null
          price_cents: number
          pricing_tier: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description: string
          slug: string
          without_me: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          features?: Json
          full_description?: string | null
          id?: string
          name: string
          pain_solved?: string | null
          price_cents?: number
          pricing_tier?: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description: string
          slug: string
          without_me?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          features?: Json
          full_description?: string | null
          id?: string
          name?: string
          pain_solved?: string | null
          price_cents?: number
          pricing_tier?: Database["public"]["Enums"]["agent_pricing_tier"]
          short_description?: string
          slug?: string
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
          church_id: string | null
          created_at: string | null
          id: string
          leader_id: string | null
          meeting_date: string | null
          new_converts: number | null
          notes: string | null
          total_present: number | null
          visitors_count: number | null
        }
        Insert: {
          cell_id?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          leader_id?: string | null
          meeting_date?: string | null
          new_converts?: number | null
          notes?: string | null
          total_present?: number | null
          visitors_count?: number | null
        }
        Update: {
          cell_id?: string | null
          church_id?: string | null
          created_at?: string | null
          id?: string
          leader_id?: string | null
          meeting_date?: string | null
          new_converts?: number | null
          notes?: string | null
          total_present?: number | null
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
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_datetime: string | null
          event_type: string
          id: string
          is_public: boolean
          location: string | null
          recurrence: Json | null
          start_datetime: string
          title: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string
          id?: string
          is_public?: boolean
          location?: string | null
          recurrence?: Json | null
          start_datetime: string
          title: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_datetime?: string | null
          event_type?: string
          id?: string
          is_public?: boolean
          location?: string | null
          recurrence?: Json | null
          start_datetime?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      churches: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          subscription_plan: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          subscription_plan?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          subscription_plan?: string | null
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
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
      people: {
        Row: {
          address_complement: string | null
          available_days: string | null
          available_periods: string | null
          avatar_url: string | null
          baptism_date: string | null
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
          zip_code: string | null
        }
        Insert: {
          address_complement?: string | null
          available_days?: string | null
          available_periods?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
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
          zip_code?: string | null
        }
        Update: {
          address_complement?: string | null
          available_days?: string | null
          available_periods?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
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
          created_at: string
          days_until_followup: number
          id: string
          is_active: boolean
          name: string
          order_index: number
          pipeline_id: string | null
          sla_hours: number | null
          slug: string
        }
        Insert: {
          auto_followup?: boolean
          church_id: string
          created_at?: string
          days_until_followup?: number
          id?: string
          is_active?: boolean
          name: string
          order_index: number
          pipeline_id?: string | null
          sla_hours?: number | null
          slug: string
        }
        Update: {
          auto_followup?: boolean
          church_id?: string
          created_at?: string
          days_until_followup?: number
          id?: string
          is_active?: boolean
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
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          included_agents: number
          max_users: number
          name: string
          price_cents: number
          slug: string
          stripe_price_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          included_agents?: number
          max_users?: number
          name: string
          price_cents: number
          slug: string
          stripe_price_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          included_agents?: number
          max_users?: number
          name?: string
          price_cents?: number
          slug?: string
          stripe_price_id?: string | null
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
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
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
          cancel_at_period_end: boolean
          church_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          extra_agents: number
          extra_users: number
          id: string
          plan_slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          church_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          extra_agents?: number
          extra_users?: number
          id?: string
          plan_slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          church_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          extra_agents?: number
          extra_users?: number
          id?: string
          plan_slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string
          updated_at?: string
        }
        Relationships: [
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
      [_ in never]: never
    }
    Functions: {
      auth_can_all_people: { Args: never; Returns: boolean }
      auth_can_financial: { Args: never; Returns: boolean }
      auth_church_id: { Args: never; Returns: string }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      create_default_pipeline_stages: {
        Args: { p_church_id: string }
        Returns: undefined
      }
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

