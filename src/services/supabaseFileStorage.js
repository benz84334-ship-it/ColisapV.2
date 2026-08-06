function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected image file.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export async function uploadMemberPhoto(file) {
  if (!file) return '';
  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose an image file for the member photo.');
  }
  return toDataUrl(file);
}
