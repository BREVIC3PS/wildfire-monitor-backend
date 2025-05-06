// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());

app.use(cors());

// 配置你的本地 Postgres
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'weather_db',
  password: 'postgres',
  port: 5432,
});

// CORS if needed
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 1) 创建用户（注册）
app.post('/api/users', async (req, res) => {
  const { email } = req.body;
  const result = await pool.query(
    'INSERT INTO users(email) VALUES($1) RETURNING id,email',
    [email]
  );
  res.json(result.rows[0]);
});

// 2) 前端上传区域：把 GeoJSON 多边形存进 regions
app.post('/api/regions', async (req, res) => {
  const { userId, name, geojson } = req.body;
  // 假设 geojson 是一个有效的 Feature 或 Polygon 对象
  const wkt = JSON.stringify(geojson.geometry ?? geojson); // 或直接存 JSON
  const result = await pool.query(
    `INSERT INTO regions(user_id, name, geom)
     VALUES($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3),4326))
     RETURNING id`,
    [userId, name, wkt]
  );
  res.json({ regionId: result.rows[0].id });
});

// 3) 获取某用户所有区域（可选，用于前端加载已保存的）
app.get('/api/users/:id/regions', async (req, res) => {
  const userId = req.params.id;
  const result = await pool.query(
    `SELECT id, name, ST_AsGeoJSON(geom)::json AS geojson
     FROM regions WHERE user_id=$1`,
    [userId]
  );
  res.json(result.rows.map(r => ({
    id: r.id,
    name: r.name,
    geojson: r.geojson
  })));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
