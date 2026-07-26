import { isSupabaseConfigured, supabase } from './supabaseClient.js';

export const MEMBER_PHOTOS_BUCKET = 'member-photos';

function assertStorageConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase Storage is not connected. Add your Supabase URL and publishable key first.');
  }
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

  if (error) throw new Error(`Unable to upload member photo: ${error.message}`);

  const { data } = supabase.storage.from(MEMBER_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
