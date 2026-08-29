import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// `type`, not `interface`: TypeScript only grants the implicit index-signature
// compatibility that supabase-js's GenericTable constraint relies on
// (Row/Insert/Update extending Record<string, unknown>) to type aliases, not
// to interfaces. Declaring these as interfaces would collapse every query
// builder method (insert/update/upsert) down to `never`.
export type TaxEntryRow = {
  id: string
  received_on: string
  source: string
  amount_php: number | string   // numeric columns arrive as strings
  note: string | null
  created_at: string
  updated_at: string
}

export type TaxEntryInsert = {
  received_on: string
  source: string
  amount_php: number
  note: string | null
}

export type TaxFilingRow = {
  tax_year: number
  period: string
  filed_on: string
  amount_paid_php: number | string
  created_at: string
}

export type TaxFilingInsert = {
  tax_year: number
  period: string
  filed_on: string
  amount_paid_php: number
}

// Hand-written schema type so queries are typed without generating types.
export interface Database {
  public: {
    Tables: {
      tax_income_entries: {
        Row: TaxEntryRow
        Insert: TaxEntryInsert
        Update: Partial<TaxEntryInsert> & { updated_at?: string }
        Relationships: []
      }
      tax_filings: {
        Row: TaxFilingRow
        Insert: TaxFilingInsert
        Update: Partial<TaxFilingInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export function getSupabase(): SupabaseClient<Database> {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
