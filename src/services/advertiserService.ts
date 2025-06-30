import api from './api';
import { Advertiser } from '@/types/upload';

export const advertiserService = {
  // Get all advertisers
  getAdvertisers: async (): Promise<Advertiser[]> => {
    const response = await api.get('/api/advertisers');
    return response.data;
  },
}; 