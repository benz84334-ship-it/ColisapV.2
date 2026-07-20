import { createClient } from '@supabase/supabase-js';

const normalizeEnvValue = (value) => value?.trim().replace(/^["']|["']$/g, '');

const supabaseUrl = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
const supabaseKey = normalizeEnvValue(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
);

const hasPlaceholderValue = [supabaseUrl, supabaseKey].some((value) =>
  /your-project|your-publishable-key|your-anon-key/i.test(value || '')
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey && !hasPlaceholderValue);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
