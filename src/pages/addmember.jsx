import { uploadFile as uploadStorageFile } from "../services/storageService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useState } from "react";

function AddMember() {
  const [uploading, setUploading] = useState(false);
  const { showToast } = useToast();

  async function handleUpload(file) {
    if (!file) return;
    try {
      setUploading(true);
      const result = await uploadStorageFile(file, 'member-upload', { memberId: 'member-upload' });
      if (!result?.publicUrl) {
        showToast('Supabase Storage is not connected. File was not uploaded.', 'warning');
        return;
      }
      showToast('File uploaded successfully.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2>Add Member</h2>

      <input
        disabled={uploading}
        type="file"
        onChange={(e) => handleUpload(e.target.files[0])}
      />
    </div>
  );
}

export default AddMember;
