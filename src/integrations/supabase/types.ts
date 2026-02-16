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
      app_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attendance_marks: {
        Row: {
          accuracy: number | null
          block_reason: string | null
          blocked: boolean
          created_at: string
          distance_to_center: number | null
          id: string
          inside_geofence: boolean
          latitude: number | null
          longitude: number | null
          mark_type: string
          timestamp: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          block_reason?: string | null
          blocked?: boolean
          created_at?: string
          distance_to_center?: number | null
          id?: string
          inside_geofence?: boolean
          latitude?: number | null
          longitude?: number | null
          mark_type: string
          timestamp?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          block_reason?: string | null
          blocked?: boolean
          created_at?: string
          distance_to_center?: number | null
          id?: string
          inside_geofence?: boolean
          latitude?: number | null
          longitude?: number | null
          mark_type?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      department_schedules: {
        Row: {
          allow_early_checkin: boolean
          allow_late_checkout: boolean
          checkin_end_time: string
          checkin_start_time: string
          checkout_end_time: string | null
          checkout_start_time: string | null
          created_at: string
          department_id: string
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          allow_early_checkin?: boolean
          allow_late_checkout?: boolean
          checkin_end_time?: string
          checkin_start_time?: string
          checkout_end_time?: string | null
          checkout_start_time?: string | null
          created_at?: string
          department_id: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          allow_early_checkin?: boolean
          allow_late_checkout?: boolean
          checkin_end_time?: string
          checkin_start_time?: string
          checkout_end_time?: string | null
          checkout_start_time?: string | null
          created_at?: string
          department_id?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: true
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      geofence_config: {
        Row: {
          accuracy_threshold: number
          block_on_poor_accuracy: boolean
          center_lat: number
          center_lng: number
          id: string
          radius_meters: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accuracy_threshold?: number
          block_on_poor_accuracy?: boolean
          center_lat?: number
          center_lng?: number
          id?: string
          radius_meters?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accuracy_threshold?: number
          block_on_poor_accuracy?: boolean
          center_lat?: number
          center_lng?: number
          id?: string
          radius_meters?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string
          email: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          email: string
          full_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_requests: {
        Row: {
          created_at: string
          department_id: string
          end_date: string
          id: string
          reason: string | null
          requested_days: number
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          end_date: string
          id?: string
          reason?: string | null
          requested_days: number
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          requested_days?: number
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rest_schedule: {
        Row: {
          created_at: string
          days_of_week: number[]
          effective_from: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: number[]
          effective_from?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: number[]
          effective_from?: string
          id?: string
          notes?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_calendar: {
        Row: {
          created_at: string
          date: string
          department_id: string
          id: string
          is_workday: boolean
          late_tolerance_minutes: number
          notes: string | null
        }
        Insert: {
          created_at?: string
          date: string
          department_id: string
          id?: string
          is_workday?: boolean
          late_tolerance_minutes?: number
          notes?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          department_id?: string
          id?: string
          is_workday?: boolean
          late_tolerance_minutes?: number
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_calendar_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_vacation_request: {
        Args: { _request_id: string }
        Returns: {
          created_at: string
          department_id: string
          end_date: string
          id: string
          reason: string | null
          requested_days: number
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
      }
      get_vacation_accrual_rate: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_vacation_balance: {
        Args: { _user_id: string; _year?: number }
        Returns: {
          accrual_rate: number
          approved_days: number
          available_days: number
          earned_days: number
          pending_days: number
          worked_days: number
        }[]
      }
      get_user_department: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_global_manager: { Args: { _user_id: string }; Returns: boolean }
      is_head_of_department: {
        Args: { _dept_id: string; _user_id: string }
        Returns: boolean
      }
      request_vacation: {
        Args: { _end_date: string; _reason?: string; _start_date: string }
        Returns: {
          created_at: string
          department_id: string
          end_date: string
          id: string
          reason: string | null
          requested_days: number
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
      }
      review_vacation_request: {
        Args: { _decision: string; _request_id: string; _review_comment?: string }
        Returns: {
          created_at: string
          department_id: string
          end_date: string
          id: string
          reason: string | null
          requested_days: number
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
      }
      validate_attendance_mark: {
        Args: { _mark_type: string; _user_id: string }
        Returns: {
          allowed: boolean
          department_id: string
          reason: string
        }[]
      }
    }
    Enums: {
      app_role: "employee" | "department_head" | "global_manager"
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
      app_role: ["employee", "department_head", "global_manager"],
    },
  },
} as const
