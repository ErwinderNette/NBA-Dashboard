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

  // Datei ersetzen
  replaceFile: async (uploadId: number, formData: FormData): Promise<void> => {
    await api.post(`/uploads/${uploadId}/replace`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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

  // Datei an Publisher zurückschicken
  returnToPublisher: async (uploadId: number): Promise<void> => {
    await api.post(`/uploads/${uploadId}/return-to-publisher`);
  },

  // Datei abschließen
  completeUpload: async (uploadId: number): Promise<void> => {
    await api.patch(`/uploads/${uploadId}/status`, { status: 'completed' });
  },

  // Datei-Inhalt lesen
  getFileContent: async (uploadId: number): Promise<{ data: string[][], filename: string }> => {
    const response = await api.get(`/uploads/${uploadId}/content`);
    return response.data;
  },

  // Datei-Inhalt speichern
  saveFileContent: async (uploadId: number, data: string[][]): Promise<void> => {
    await api.post(`/uploads/${uploadId}/content`, { data });
  },

  
    // Validation für Admin-Preview (mit Debug)
    validateUpload: async (uploadId: number): Promise<any> => {
      try {
        const response = await api.get(`/uploads/${uploadId}/validate`, {
          timeout: 120000, // 120s, weil API-Call groß sein kann
        });
        console.log("✅ validateUpload response", response.data);
        return response.data;
      } catch (err: any) {
        console.error("❌ validateUpload error", {
          message: err?.message,
          status: err?.response?.status,
          data: err?.response?.data,
          url: err?.config?.url,
          baseURL: err?.config?.baseURL,
        });
        throw err;
      }
    },
}; 