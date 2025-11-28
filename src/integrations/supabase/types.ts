export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      devices: {
        Row: {
          id: string
          ble_mac: string | null
          label: string | null
          owner_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ble_mac?: string | null
          label?: string | null
          owner_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ble_mac?: string | null
          label?: string | null
          owner_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      missions: {
        Row: {
          id: string
          user_id: string | null
          device_id: string | null
          name: string
          description: string | null
          is_active: boolean
          is_paused: boolean
          started_at: string
          finished_at: string | null
          paused_at: string | null
          resumed_at: string | null
          total_paused_duration_ms: number | null
          duration_ms: number | null
          last_synced_at: string | null
          sync_status: 'pending' | 'synced' | 'error'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          device_id?: string | null
          name: string
          description?: string | null
          is_active?: boolean
          is_paused?: boolean
          started_at?: string
          finished_at?: string | null
          paused_at?: string | null
          resumed_at?: string | null
          total_paused_duration_ms?: number | null
          duration_ms?: number | null
          last_synced_at?: string | null
          sync_status?: 'pending' | 'synced' | 'error'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          device_id?: string | null
          name?: string
          description?: string | null
          is_active?: boolean
          is_paused?: boolean
          started_at?: string
          finished_at?: string | null
          paused_at?: string | null
          resumed_at?: string | null
          total_paused_duration_ms?: number | null
          duration_ms?: number | null
          last_synced_at?: string | null
          sync_status?: 'pending' | 'synced' | 'error'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      photos: {
        Row: {
          id: string
          user_id: string | null
          mission_id: string | null
          device_id: string | null
          filename: string
          file_path: string
          file_size: number | null
          width: number | null
          height: number | null
          hash: string | null
          capture_at: string
          synced_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          mission_id?: string | null
          device_id?: string | null
          filename: string
          file_path: string
          file_size?: number | null
          width?: number | null
          height?: number | null
          hash?: string | null
          capture_at: string
          synced_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          mission_id?: string | null
          device_id?: string | null
          filename?: string
          file_path?: string
          file_size?: number | null
          width?: number | null
          height?: number | null
          hash?: string | null
          capture_at?: string
          synced_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      telemetry_readings: {
        Row: {
          id: string
          user_id: string | null
          mission_id: string | null
          device_id: string | null
          captured_at: string
          temperature_c: number | null
          humidity_pct: number | null
          battery_v: number | null
          rover_state: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          mission_id?: string | null
          device_id?: string | null
          captured_at: string
          temperature_c?: number | null
          humidity_pct?: number | null
          battery_v?: number | null
          rover_state?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          mission_id?: string | null
          device_id?: string | null
          captured_at?: string
          temperature_c?: number | null
          humidity_pct?: number | null
          battery_v?: number | null
          rover_state?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_readings_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_readings_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_readings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
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
