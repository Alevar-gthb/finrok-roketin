import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CompanyFilterState {
  selectedCompanyId: string | null
  setSelectedCompanyId: (id: string | null) => void
}

export const useCompanyStore = create<CompanyFilterState>()(
  persist(
    (set) => ({
      selectedCompanyId: null, // null = semua company
      setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),
    }),
    { name: 'finrok-company-filter' }
  )
)
