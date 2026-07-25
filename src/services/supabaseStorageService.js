import { generateSeedData } from '../data/seedData.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';

export const DATA_KEYS = [
  'users', 'members', 'loans', 'collections', 'payments', 'reports', 'availments',
  'settings', 'activityLogs', 'notifications', 'dashboard',
];

async function ensureSupabaseSession() {
  if (!isSupabaseConfigured) return false;
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Supabase authentication failed: ${error.message}`);
  return true;
}

function assertSupabaseConfigured() {
  if (isSupabaseConfigured) return;
  if (import.meta.env.PROD) {
    throw new Error(
      'Supabase is not connected. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel project environment variables.',
    );
  }
}

export function freshDatabase() {
  const data = generateSeedData();
  return { ...data, reports: [] };
}

export async function loadDatabaseFromSupabase() {
  assertSupabaseConfigured();
  if (!isSupabaseConfigured) return freshDatabase();
  await ensureSupabaseSession();

  const { data: rows, error } = await supabase.from('app_data').select('key,value');
  if (error) throw new Error(`Unable to load Supabase data: ${error.message}`);

  if (!rows?.length) {
    const seeded = freshDatabase();
    await replaceSupabaseDatabase(seeded);
    return seeded;
  }

  const values = new Map(rows.map((row) => [row.key, row.value]));
  const seeded = freshDatabase();
  return DATA_KEYS.reduce((database, key) => {
    database[key] = values.has(key) ? values.get(key) : seeded[key];
    return database;
  }, {});
}

export async function saveSupabaseKey(key, value) {
  assertSupabaseConfigured();
  if (!isSupabaseConfigured) return;
  await ensureSupabaseSession();
  const { error } = await supabase
    .from('app_data')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Unable to save ${key} to Supabase: ${error.message}`);
}

export async function replaceSupabaseDatabase(database) {
  assertSupabaseConfigured();
  if (!isSupabaseConfigured) return;
  await ensureSupabaseSession();
  const rows = DATA_KEYS.map((key) => ({ key, value: database[key], updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('app_data').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(`Unable to save the database to Supabase: ${error.message}`);
}

export async function resetSupabaseDatabase() {
  const database = freshDatabase();
  await replaceSupabaseDatabase(database);
  return database;
}

export async function restoreSupabaseDatabase(payload) {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const source = parsed.data || parsed;
  const defaults = freshDatabase();
  const database = DATA_KEYS.reduce((result, key) => {
    result[key] = key in source ? source[key] : defaults[key];
    return result;
  }, {});
  await replaceSupabaseDatabase(database);
  return database;
}

export function subscribeToSupabaseDatabase(onChange) {
  if (!isSupabaseConfigured) return () => {};
  const channel = supabase
    .channel('app-data-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_data' },
      (payload) => {
        const row = payload.new;
        if (row?.key) onChange(row.key, row.value);
      },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
