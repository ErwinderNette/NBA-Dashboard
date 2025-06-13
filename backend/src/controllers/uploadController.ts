import { Request, Response } from 'express';
import { pool } from '@/db';

// Get all uploads
export const getUploads = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.filename,
        u.upload_date,
        u.file_size,
        u.content_type,
        u.uploaded_by,
        u.status,
        COUNT(DISTINCT a.id) as advertiser_count
      FROM uploads u
      LEFT JOIN upload_access a ON u.id = a.upload_id
      GROUP BY u.id
      ORDER BY u.upload_date DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching uploads:', error);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
};

// Grant access to an advertiser
export const grantAccess = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { advertiserId, expiresAt } = req.body;

  try {
    await pool.query(
      'INSERT INTO upload_access (upload_id, advertiser_id, expires_at) VALUES ($1, $2, $3)',
      [id, advertiserId, expiresAt]
    );

    // Update upload status to 'granted'
    await pool.query(
      'UPDATE uploads SET status = $1 WHERE id = $2',
      ['granted', id]
    );

    res.json({ message: 'Access granted successfully' });
  } catch (error) {
    console.error('Error granting access:', error);
    res.status(500).json({ error: 'Failed to grant access' });
  }
};

// Update upload status
export const updateStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      'UPDATE uploads SET status = $1 WHERE id = $2',
      [status, id]
    );

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

// Download file
export const downloadFile = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT filename, file_path FROM uploads WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const { filename, file_path } = result.rows[0];
    res.download(file_path, filename);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
}; 