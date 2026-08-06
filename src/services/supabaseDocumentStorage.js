import { isSupabaseConfigured, supabase } from './supabaseClient.js';

export const DOCUMENTS_BUCKET = 'documents';

function assertStorageConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }
  return true;
}

function createStorageError(error) {
  const message = error?.message || '';
  if (/bucket not found/i.test(message)) {
    return new Error('Supabase Storage bucket "documents" was not found. Run supabase/schema.sql in the Supabase SQL Editor or create that public bucket in Storage.');
  }
  if (/row-level security|violates row-level security|not authorized|permission/i.test(message)) {
    return new Error('Supabase Storage policies are missing for "documents". Run supabase/schema.sql in the Supabase SQL Editor.');
  }
  return new Error(`Unable to upload document: ${message || 'Unknown storage error'}`);
}

function sanitizeFileName(name = 'document') {
  const safeName = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeName || 'document';
}

export async function uploadDocument(file, folder = 'uploads', onProgress) {
  if (!assertStorageConfigured()) return { path: '', publicUrl: '' };
  if (!file) return { path: '', publicUrl: '' };

  const extension = sanitizeFileName(file.name).split('.').pop() || 'bin';
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const uploadOptions = {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  };

  if (typeof onProgress === 'function') {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, file, { ...uploadOptions, onUploadProgress: onProgress });

    if (error) throw createStorageError(error);
    return { path, publicUrl: getPublicDocumentUrl(path) };
  }

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, uploadOptions);

  if (error) throw createStorageError(error);
  return { path, publicUrl: getPublicDocumentUrl(path) };
}

export function getPublicDocumentUrl(path) {
  if (!isSupabaseConfigured || !supabase) return '';
  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

export async function listDocuments(folder = '') {
  if (!assertStorageConfigured()) return [];
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(folder || undefined, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) throw createStorageError(error);
  return data || [];
}

export async function deleteDocument(path) {
  if (!assertStorageConfigured()) return true;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error) throw createStorageError(error);
  return true;
}

export async function downloadDocument(path) {
  if (!assertStorageConfigured()) return null;
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error) throw createStorageError(error);
  return data;
}
