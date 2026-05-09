# Finrok — Finance Application

## Tech Stack
- React 18 + Vite + TypeScript
- Tailwind CSS (design tokens Finrok)
- Supabase (PostgreSQL + Storage)
- TanStack Query (data fetching)
- Recharts (charts)
- React Router v6

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Setup Supabase
1. Buat project baru di supabase.com
2. Jalankan `finrok_schema.sql` di SQL Editor
3. Jalankan `supabase_rpc.sql` di SQL Editor

### 3. Environment variables
```bash
cp .env.example .env.local
# Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY dari Supabase dashboard
```

### 4. Run dev server
```bash
npm run dev
```

## Sprint Plan
- [x] Sprint 1: Project setup + DB schema + fondasi
- [x] Sprint 1: Dashboard + Quotations module
- [ ] Sprint 2: Invoice Generator + PDF renderer
- [ ] Sprint 3: Payment Tracking
- [ ] Sprint 4: Income & Forecast charts
- [ ] Sprint 5: Master Data CRUD
