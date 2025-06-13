import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db';
import path from 'path';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!require('fs').existsSync(uploadsDir)) {
    require('fs').mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.get('/api/uploads', async (req, res) => {
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
});

app.get('/api/advertisers', async (req, res) => {
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
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 