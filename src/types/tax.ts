export type TaxPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL'

export interface TaxIncomeEntry {
  id: string
  receivedOn: string      // YYYY-MM-DD
  source: string
  amountPhp: number
  note: string | null
  createdAt: string       // ISO timestamp
  updatedAt: string
}

export interface TaxIncomeEntryInput {
  receivedOn: string
  source: string
  amountPhp: number
  note: string | null
}

export interface TaxFiling {
  taxYear: number
  period: TaxPeriod
  filedOn: string         // YYYY-MM-DD
  amountPaidPhp: number
}

export type TaxFilingInput = TaxFiling

export type TaxPeriodStatus = 'upcoming' | 'due_soon' | 'overdue' | 'filed'

export interface TaxPeriodSummary {
  taxYear: number
  period: TaxPeriod
  form: '1701Q' | '1701A'
  periodStart: string
  periodEnd: string
  deadline: string        // after weekend rollover
  grossPhp: number        // receipts inside the period (full year for ANNUAL)
  cumulativeGrossPhp: number
  taxablePhp: number
  cumulativeTaxPhp: number
  taxDuePhp: number       // this period's payment after crediting earlier quarters
  status: TaxPeriodStatus
  filing: TaxFiling | null
}
