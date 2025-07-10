import api from './api';
import { UploadItem } from '@/types/upload';

export const uploadService = {
  // Get all uploads
  getUploads: async (): Promise<UploadItem[]> => {
    const response = await api.get('/uploads');
    return response.data;
  },

  // Grant access to an advertiser
  grantAccess: async (uploadId: number, advertiserId: number, expiresAt: Date): Promise<void> => {
    await api.post(`/uploads/${uploadId}/access`, {
      advertiserId,
      expiresAt: expiresAt.toISOString(),
    });
  },

  // Update upload status
  updateStatus: async (uploadId: number, status: 'approved' | 'rejected'): Promise<void> => {
    await api.patch(`/uploads/${uploadId}/status`, { status });
  },

  // Download file
  downloadFile: async (uploadId: number, filename?: string): Promise<void> => {
    const response = await api.get(`/uploads/${uploadId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `file_${uploadId}`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // Upload file
  uploadFile: async (formData: FormData): Promise<void> => {
    await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Datei löschen
  deleteUpload: async (uploadId: number): Promise<void> => {
    await api.delete(`/uploads/${uploadId}`);
  },
}; 