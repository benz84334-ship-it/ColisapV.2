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
    'create table if not exists public.branches',
    'create table if not exists public.loan_types',
    'create table if not exists public.payment_methods',
    'create table if not exists public.members',
    'create table if not exists public.member_beneficiaries',
    'create table if not exists public.share_capital_transactions',
    'create table if not exists public.loans',
    'create table if not exists public.payments',
    'create table if not exists public.collections',
    'create table if not exists public.availments',
    'create table if not exists public.reports',
    'create table if not exists public.settings',
    'create table if not exists public.activity_logs',
    'create table if not exists public.notifications',
    'create table if not exists public.app_data',
    'create or replace function public.allow_app_access',
    'receipt_number text not null unique',
    'collection_id text not null unique',
    'amount_due numeric(14,2) not null default 0',
    'monitoring_reference text unique',
    'application_status text not null default',
    'savings_account_no text',
    'transaction_type text not null default',
    "perform public.allow_app_access('members')",
    "perform public.allow_app_access('member_beneficiaries')",
    "perform public.allow_app_access('share_capital_transactions')",
    "perform public.allow_app_access('app_data')",
    'alter publication supabase_realtime add table public.app_data',
  ];

  for (const statement of requiredStatements) {
    assert.match(schemaSql, new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
