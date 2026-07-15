import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf8');

test('schema.sql defines the main cooperative tables and access policies', () => {
  const requiredStatements = [
    'create table if not exists public.profiles',
    'create table if not exists public.users',
    'create table if not exists public.members',
    'create table if not exists public.loans',
    'create table if not exists public.payments',
    'create table if not exists public.collections',
    'create table if not exists public.availments',
    'create table if not exists public.reports',
    'create table if not exists public.settings',
    'create table if not exists public.activity_logs',
    'create table if not exists public.notifications',
    'create table if not exists public.app_data',
    'create policy "authenticated users can read app data"',
    'create policy "allow authenticated read access to members"',
    'create policy "allow anon read access to members"',
  ];

  for (const statement of requiredStatements) {
    assert.match(schemaSql, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
