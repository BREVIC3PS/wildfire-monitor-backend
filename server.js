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

// 简单的 CORS 设置
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 根据 email 查用户，没有就创建
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

// 1) 注册用户（如果你前端有专门注册，这里也可以保留）
app.post('/api/users', async (req, res) => {
  const { email } = req.body;
  const result = await pool.query(
    'INSERT INTO users(email) VALUES($1) RETURNING id,email',
    [email]
  );
  res.json(result.rows[0]);
});

// 2) 创建新区域
app.post('/api/regions', async (req, res) => {
  const { email, name, geojson } = req.body;
  if (!email || !geojson) {
    return res.status(400).json({ error: '缺少 email 或 geojson' });
  }

  const userId = await findOrCreateUser(email);
  // 将 GeoJSON 对象转为字符串传给 ST_GeomFromGeoJSON
  const geojsonStr = JSON.stringify(geojson.geometry ?? geojson);

  const result = await pool.query(
    `INSERT INTO regions(user_id, name, geom)
     VALUES($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
     RETURNING id`,
    [userId, name, geojsonStr]
  );

  res.json({ regionId: result.rows[0].id });
  console.log(`→ 新建 Region ${result.rows[0].id} for user ${userId}`);
});

// 3) 查询某用户的所有区域
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

// 4) 更新（编辑）某个区域
app.put('/api/regions/:id', async (req, res) => {
  const regionId = req.params.id;
  const { email, name, geojson } = req.body;
  if (!email || !geojson) {
    return res.status(400).json({ error: '缺少 email 或 geojson' });
  }

  // 可选：验证 email 是否对应该 region 的 owner
  const geojsonStr = JSON.stringify(geojson.geometry ?? geojson);
  await pool.query(
    `UPDATE regions
     SET name    = $1,
         geom    = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
     WHERE id = $3`,
    [name, geojsonStr, regionId]
  );

  res.json({ regionId });
  console.log(`→ 更新 Region ${regionId}`);
});

// 5) 删除某个区域
app.delete('/api/regions/:id', async (req, res) => {
  const regionId = req.params.id;
  await pool.query(
    'DELETE FROM regions WHERE id = $1',
    [regionId]
  );
  res.json({ regionId });
  console.log(`→ 删除 Region ${regionId}`);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
