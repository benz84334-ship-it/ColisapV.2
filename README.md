# Colisap Monitoring System

React/Vite application for Barbaza MPC records, loans, collections, payments, reports, and monitoring.

## Supabase Backend Setup

The app stores shared records in Supabase through the `public.app_data` table. Browser LocalStorage is only used for the login session.

1. Create or open your Supabase project.
2. Go to **SQL Editor** and run the full contents of `supabase/schema.sql`. This creates the shared data table and the public `member-photos` Storage bucket used for uploaded profile photos.
3. Go to **Authentication > Sign In / Providers** and enable anonymous sign-ins.
4. Copy `.env.example` to `.env` for local development.
5. Add your Supabase values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Older Supabase projects may use:

```env
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Vercel Setup

In the Vercel project, add these environment variables for **Production**, **Preview**, and **Development**:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Then redeploy the project. If these variables are missing in production, the app shows a backend connection message instead of silently using temporary sample data.

## Verify Supabase

After running the schema, check the SQL Editor with:

```sql
select key, updated_at
from public.app_data
order by key;
```

You should see keys such as `members`, `loans`, `payments`, `settings`, and `dashboard`.

## Scripts

```bash
npm run dev
npm run build
npm test
```
