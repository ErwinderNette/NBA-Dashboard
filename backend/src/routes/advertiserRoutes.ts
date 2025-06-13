import express from 'express';
import { getAdvertisers } from '@/controllers/advertiserController';

const router = express.Router();

// GET /api/advertisers - Get all advertisers
router.get('/', getAdvertisers);

export default router; 