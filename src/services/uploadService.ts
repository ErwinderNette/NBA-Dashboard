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
  downloadFile: async (uploadId: number): Promise<Blob> => {
    const response = await api.get(`/uploads/${uploadId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },
}; 