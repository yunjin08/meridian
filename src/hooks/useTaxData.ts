import { useEffect } from 'react'
import { useTaxStore } from '@/store/taxStore'

/** Loads tax records once so the Overview banner has data before the Tax tab is visited. */
export function useTaxData() {
  const load = useTaxStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])
}
