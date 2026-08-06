import { useEffect, useMemo, useState } from 'react';
import { FiDownload, FiEye, FiFile, FiImage, FiTrash2, FiUpload } from 'react-icons/fi';
import Button from './ui/Button.jsx';
import Modal from './ui/Modal.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  deleteDocument,
  downloadDocument,
  getPublicDocumentUrl,
  listDocuments,
  uploadDocument,
} from '../services/supabaseDocumentStorage.js';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_LABELS = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.ms-powerpoint': 'PPT',
  'text/plain': 'TXT',
};

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getDocumentLabel(file) {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) return 'IMG';
  return DOCUMENT_LABELS[file.mimetype] || file.name.split('.').pop().toUpperCase() || 'FILE';
}

function getFileDisplayName(file) {
  return file?.name?.split('/').pop() || 'Document';
}

function DocumentIcon({ file, className = 'h-10 w-10' }) {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    return <FiImage className={`${className} text-teal-500`} />;
  }
  return <FiFile className={`${className} text-slate-400`} />;
}

function UploadProgress({ file, progress }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <DocumentIcon file={file} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{file.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-200"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{Math.round(progress)}%</span>
    </div>
  );
}

export default function FileUpload() {
  const { showToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadFiles = async () => {
    try {
      const data = await listDocuments();
      setFiles(data);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to load documents.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;

    const newUploads = selectedFiles.map((file) => ({
      file,
      progress: 0,
      id: crypto.randomUUID(),
    }));
    setUploading((current) => [...current, ...newUploads]);

    for (const upload of newUploads) {
      try {
        await uploadDocument(upload.file, 'uploads', (event) => {
          const percent = (event.loaded / event.total) * 100;
          setUploading((current) =>
            current.map((item) => (item.id === upload.id ? { ...item, progress: percent } : item)),
          );
        });
        showToast(`Uploaded ${upload.file.name}.`, 'success');
      } catch (error) {
        console.error(error);
        showToast(error.message || `Failed to upload ${upload.file.name}.`, 'error');
      } finally {
        setUploading((current) => current.filter((item) => item.id !== upload.id));
      }
    }

    await loadFiles();
    event.target.value = '';
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.name);
      setFiles((current) => current.filter((file) => file.name !== deleteTarget.name));
      showToast('Document deleted.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to delete document.', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleDownload = async (file) => {
    try {
      const blob = await downloadDocument(file.name);
      if (!blob) {
        showToast('Document storage is not connected.', 'warning');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name.split('/').pop();
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Unable to download document.', 'error');
    }
  };

  const handlePreview = (file) => {
    setPreviewFile(file);
  };

  const isImage = (file) => IMAGE_MIME_TYPES.includes(file.mimetype);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aTime = new Date(a.created_at || a.updated_at || 0).getTime();
      const bTime = new Date(b.created_at || b.updated_at || 0).getTime();
      return bTime - aTime;
    });
  }, [files]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-normal text-slate-950 dark:text-white">Document Storage</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Upload, preview, and manage files in your Supabase Storage documents bucket.
          </p>
        </div>
        <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-slate-950">
          <FiUpload />
          <span>Upload</span>
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      {uploading.length > 0 ? (
        <div className="space-y-3">
          {uploading.map((upload) => (
            <UploadProgress key={upload.id} file={upload.file} progress={upload.progress} />
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
          ))}
        </div>
      ) : sortedFiles.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          message="Upload files using the Upload button above. They will be stored in your Supabase Storage documents bucket."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">File</th>
                <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Size</th>
                <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Type</th>
                <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Uploaded</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
                <tr key={file.name} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <DocumentIcon file={file} />
                      <span className="block min-w-0 truncate font-medium text-slate-900 dark:text-white">
                        {file.name.split('/').pop()}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatFileSize(file.metadata?.size)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{getDocumentLabel(file)}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {isImage(file) ? (
                        <button
                          aria-label="Preview"
                          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-200"
                          type="button"
                          onClick={() => handlePreview(file)}
                        >
                          <FiEye />
                        </button>
                      ) : null}
                      <a
                        aria-label="Download"
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-200"
                        href={getPublicDocumentUrl(file.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          handleDownload(file);
                        }}
                      >
                        <FiDownload />
                      </a>
                      <button
                        aria-label="Delete"
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 dark:text-slate-300 dark:hover:bg-rose-900/30 dark:hover:text-rose-300"
                        type="button"
                        onClick={() => setDeleteTarget(file)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(previewFile)}
        title={previewFile ? previewFile.name.split('/').pop() : ''}
        maxWidth="max-w-4xl"
        onClose={() => setPreviewFile(null)}
        footer={<Button onClick={() => setPreviewFile(null)}>Close</Button>}
      >
        {previewFile ? (
          <div className="flex justify-center">
            <img
              alt={previewFile.name}
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
              src={getPublicDocumentUrl(previewFile.name)}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete document?"
        description={`This will permanently remove ${getFileDisplayName(deleteTarget)} from Supabase Storage.`}
        maxWidth="max-w-md"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
