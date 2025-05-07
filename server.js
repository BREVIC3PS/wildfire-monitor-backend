// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors());

// Configure your local Postgres
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'weather_db',
  password: 'postgres',
  port: 5432,
});

const pool2 = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fire_db',
  password: 'postgres',
  port: 5432,
});

// Simple CORS settings
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Find user by email, create if not found
async function findOrCreateUser(email) {
  const r1 = await pool.query(
    'SELECT id FROM users WHERE email=$1',
    [email]
  );
  if (r1.rows.length) {
    return r1.rows[0].id;
  } else {
    const r2 = await pool.query(
      'INSERT INTO users(email) VALUES($1) RETURNING id',
      [email]
    );
    return r2.rows[0].id;
  }
}

// 1) Register user (keep this if your frontend has dedicated registration)
app.post('/api/users', async (req, res) => {
  const { email } = req.body;
  const result = await pool.query(
    'INSERT INTO users(email) VALUES($1) RETURNING id,email',
    [email]
  );
  res.json(result.rows[0]);
});

// 2) Create a new region
app.post('/api/regions', async (req, res) => {
  const { email, name, geojson } = req.body;
  if (!email || !geojson) {
    return res.status(400).json({ error: 'Missing email or geojson' });
  }

  const userId = await findOrCreateUser(email);
  // Convert GeoJSON object to string for ST_GeomFromGeoJSON
  const geojsonStr = JSON.stringify(geojson.geometry ?? geojson);

  const result = await pool.query(
    `INSERT INTO regions(user_id, name, geom)
     VALUES($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
     RETURNING id`,
    [userId, name, geojsonStr]
  );

  res.json({ regionId: result.rows[0].id });
  console.log(`→ Created Region ${result.rows[0].id} for user ${userId}`);
});

// 3) Get all regions by email
app.get('/api/regions', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Missing email parameter' });
  }
  // Reuse helper: find or create user
  const userId = await findOrCreateUser(email);

  const result = await pool.query(
    `SELECT id, name, ST_AsGeoJSON(geom)::json AS geojson
       FROM regions
      WHERE user_id = $1`,
    [userId]
  );

  res.json(
    result.rows.map(r => ({
      id: r.id,
      name: r.name,
      geojson: r.geojson
    }))
  );
});

// 5) Delete a region
app.delete('/api/regions/:id', async (req, res) => {
  const regionId = parseInt(req.params.id, 10);
  const { email } = req.query;              // ?email=...
  if (!email) {
    return res.status(400).json({ error: 'Missing email parameter' });
  }
  if (Number.isNaN(regionId)) {
    return res.status(400).json({ error: 'Invalid region id' });
  }
  const userId = await findOrCreateUser(email);

  // Optional validation: ensure the region belongs to the current userId
  await pool.query(
    `DELETE FROM regions
     WHERE id = $1
       AND user_id = $2`,
    [regionId, userId]
  );

  console.log(`→ Deleted Region ${regionId} (User ${userId})`);
  res.json({ regionId });
});

// GET /api/regional_fire_risk?limit=5
app.get('/api/regional_fire_risk', async (req, res) => {
  // Read limit from query (default is 5)
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 5));

  const sql = `
    SELECT 
      id,
      timestamp,
      latitude,
      longitude,
      probability
    FROM regional_fire_risk
    ORDER BY probability DESC
    LIMIT $1
  `;

  try {
    const { rows } = await pool2.query(sql, [limit]);
    res.json(rows);
  } catch (err) {
    console.error('DB query failed:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
