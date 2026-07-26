import { isSupabaseConfigured, supabase } from './supabaseClient.js';

export const MEMBER_PHOTOS_BUCKET = 'member-photos';

function assertStorageConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase Storage is not connected. Add your Supabase URL and publishable key first.');
  }
}

function createStorageError(error) {
  const message = error?.message || '';
  if (/bucket not found/i.test(message)) {
    return new Error('Supabase Storage bucket "member-photos" was not found. Run supabase/schema.sql in the Supabase SQL Editor or create that public bucket in Storage.');
  }
  if (/row-level security|violates row-level security|not authorized|permission/i.test(message)) {
    return new Error('Supabase Storage policies are missing for "member-photos". Run supabase/schema.sql in the Supabase SQL Editor.');
  }
  return new Error(`Unable to upload member photo: ${message || 'Unknown storage error'}`);
}

function sanitizeFileName(name = 'photo') {
  const safeName = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safeName || 'photo';
}

export async function uploadMemberPhoto(file, memberId = 'member') {
  assertStorageConfigured();
  if (!file) return '';
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose an image file for the member photo.');
  }

  const extension = sanitizeFileName(file.name).split('.').pop() || 'jpg';
  const path = `${sanitizeFileName(memberId)}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(MEMBER_PHOTOS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

  if (error) throw createStorageError(error);

  const { data } = supabase.storage.from(MEMBER_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
