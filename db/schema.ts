import { bigint, boolean, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Mirrors supabase/migrations/0003_alerts.sql exactly (kept alongside during
// the Netlify Database migration; the Supabase SQL files are no longer applied
// anywhere but document the original schema this was ported from).
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull(),
    symbol: text('symbol').notNull(),
    conditionType: text('condition_type').notNull(),
    // null only for the macd_* conditions, which carry no threshold
    threshold: numeric('threshold'),
    active: boolean('active').notNull().default(true),
    triggered: boolean('triggered').notNull().default(false),
    triggeredAt: timestamp('triggered_at', { withTimezone: true, mode: 'string' }),
    autoReset: boolean('auto_reset').notNull().default(false),
    // previous close the cron last saw, so price_crosses can detect a crossing
    // across two separate cron runs. Null until the first evaluation.
    lastPrice: numeric('last_price'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('alerts_active_idx').on(table.active)],
)

// Mirrors supabase/migrations/0001_tax.sql.
export const taxIncomeEntries = pgTable(
  'tax_income_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receivedOn: date('received_on', { mode: 'string' }).notNull(),
    source: text('source').notNull(),
    amountPhp: numeric('amount_php', { precision: 14, scale: 2 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('tax_income_entries_received_on_idx').on(table.receivedOn)],
)

export const taxFilings = pgTable(
  'tax_filings',
  {
    taxYear: integer('tax_year').notNull(),
    period: text('period').notNull(),
    filedOn: date('filed_on', { mode: 'string' }).notNull(),
    amountPaidPhp: numeric('amount_paid_php', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.taxYear, table.period] })],
)

// Mirrors supabase/migrations/0002_webauthn.sql. No user_id column: the
// dashboard has one owner, so every row here is theirs.
export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    credentialId: text('credential_id').primaryKey(),
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: text('transports').array().notNull().default([]),
    deviceLabel: text('device_label').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [index('webauthn_credentials_last_used_idx').on(table.lastUsedAt)],
)
