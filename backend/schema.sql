// backend/src/index.ts
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { parse } from 'csv-parse';
import pool from './db';
import fs from 'fs';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// Upload CSV file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const uploadResult = await pool.query(
      'INSERT INTO csv_uploads (filename, file_size, content_type, uploaded_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.file.originalname, req.file.size, req.file.mimetype, req.body.uploadedBy]
    );

    const uploadId = uploadResult.rows[0].id;
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const records: any[] = [];

    parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    })
      .on('data', (data) => records.push(data))
      .on('end', async () => {
        await pool.query(
          'INSERT INTO csv_data (upload_id, data) VALUES ($1, $2)',
          [uploadId, JSON.stringify(records)]
        );

        fs.unlinkSync(req.file.path);
        res.json({
          message: 'File uploaded successfully',
          uploadId,
          recordCount: records.length
        });
      });
  } catch (error) {
    res.status(500).json({ error: 'Error processing file' });
  }
});

// Get all uploads (for admin)
app.get('/api/uploads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, 
             COUNT(a.id) as advertiser_count
      FROM csv_uploads u
      LEFT JOIN advertiser_access a ON u.id = a.upload_id
      GROUP BY u.id
      ORDER BY u.upload_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching uploads' });
  }
});

// Grant access to advertiser
app.post('/api/access', async (req, res) => {
  const { uploadId, advertiserId, expiresAt } = req.body;
  try {
    await pool.query(
      'INSERT INTO advertiser_access (upload_id, advertiser_id, access_expires_at) VALUES ($1, $2, $3)',
      [uploadId, advertiserId, expiresAt]
    );
    res.json({ message: 'Access granted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error granting access' });
  }
});

// Get accessible uploads for advertiser
app.get('/api/advertiser/:id/uploads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.*, a.access_expires_at
      FROM csv_uploads u
      JOIN advertiser_access a ON u.id = a.upload_id
      WHERE a.advertiser_id = $1 AND a.is_active = true
      AND (a.access_expires_at IS NULL OR a.access_expires_at > NOW())
      ORDER BY u.upload_date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching uploads' });
  }
});

// Create tables for NBA Dashboard

// Advertisers table
pool.query(`
  CREATE TABLE IF NOT EXISTS advertisers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`);

// Uploads table
pool.query(`
  CREATE TABLE IF NOT EXISTS uploads (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    file_path VARCHAR(255) NOT NULL
  );
`);

// Upload access table
pool.query(`
  CREATE TABLE IF NOT EXISTS upload_access (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
    advertiser_id INTEGER REFERENCES advertisers(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(upload_id, advertiser_id)
  );
`);

// Insert some sample advertisers
pool.query(`
  INSERT INTO advertisers (name, email) VALUES
    ('Sample Advertiser 1', 'advertiser1@example.com'),
    ('Sample Advertiser 2', 'advertiser2@example.com')
  ON CONFLICT (email) DO NOTHING;
`);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});