# Colisap Monitoring System

React/Vite application for Barbaza MPC records, loans, collections, payments, reports, monitoring, and dormancy SMS alerts.

## Install

```bash
npm install
```

## Database Setup

1. Run [`supabase/schema.sql`](/C:/My app/my/supabase/schema.sql) in the Supabase SQL Editor.
2. Put all environment values in the root [`.env`](/C:/My app/my/.env).

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Start

```bash
npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm test
```
