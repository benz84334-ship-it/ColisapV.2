import { uploadDocument } from './supabaseDocumentStorage.js';

export async function uploadFile(file, folder = 'uploads', options = {}) {
  if (!file) return { path: '', publicUrl: '' };

  return uploadDocument(file, folder, options.onProgress);
}
