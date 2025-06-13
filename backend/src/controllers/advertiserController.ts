import { Request, Response } from 'express';
import { pool } from '@/db';

// Get all advertisers
export const getAdvertisers = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, name, email
      FROM advertisers
      ORDER BY name ASC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching advertisers:', error);
    res.status(500).json({ error: 'Failed to fetch advertisers' });
  }
}; 