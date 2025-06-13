import express from 'express';
import { getUploads, grantAccess, updateStatus, downloadFile } from '@/controllers/uploadController';

const router = express.Router();

// GET /api/uploads - Get all uploads
router.get('/', getUploads);

// POST /api/uploads/:id/access - Grant access
router.post('/:id/access', grantAccess);

// PATCH /api/uploads/:id/status - Update status
router.patch('/:id/status', updateStatus);

// GET /api/uploads/:id/download - Download file
router.get('/:id/download', downloadFile as express.RequestHandler);

export default router; 