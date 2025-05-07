// alerter.js
const { Pool } = require('pg');
const AWS = require('aws-sdk');

// ——— 1) AWS SES 配置 ———
AWS.config.update({
  region: 'us-west-2',
  accessKeyId: AKIATWBJ2MK4IE2PMWFE,      // 推荐改用环境变量
  secretAccessKey: Yy817+MwyrZJ62NxH8lvSWaCNwJM4k5pHi52gs2S
});
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

// ——— 2) Postgres 连接 ———
// weather_db: 存 regions & users
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'weather_db',
  password: 'postgres',
  port: 5432,
});

// fire_db: 存 regional_fire_risk
const firePool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fire_db',
  password: 'postgres',
  port: 5432,
});

async function checkAndAlert() {
  // 1. 先读出所有用户的 regions（取 WKT）
  const regionsRes = await pool.query(`
    SELECT
      r.id         AS region_id,
      u.email      AS user_email,
      r.name       AS region_name,
      ST_AsText(r.geom) AS wkt
    FROM regions r
    JOIN users u ON u.id = r.user_id
  `);

  for (let { region_id, user_email, region_name, wkt } of regionsRes.rows) {
    // 2. 在 fire_db 中查询：概率 ≥ 0.7 且落在该多边形内部
    const fireRes = await firePool.query(
      `
      SELECT id, timestamp, latitude, longitude, probability
      FROM regional_fire_risk
      WHERE probability >= 0.7
        AND ST_Contains(
              ST_GeomFromText($1, 4326),
              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            )
      LIMIT 1  -- 只需要知道是否存在
      `,
      [wkt]
    );

    if (fireRes.rows.length > 0) {
      // 3. 构造并发送 SES 预警邮件
      const params = {
        Source: 'kwang655@usc.edu',
        Destination: { ToAddresses: [user_email] },
        Message: {
          Subject: {
            Data: `【野火风险警报】您关注的“${region_name}”区域有高风险火点`,
            Charset: 'UTF-8'
          },
          Body: {
            Text: {
              Data: `
您好，

我们检测到在您定义的区域 “${region_name}” （ID: ${region_id}）内出现了
概率 ≥ 70% 的火灾预测点。请立即关注该区域并采取必要的安全防范措施。

—— 云端野火监测平台
              `.trim(),
              Charset: 'UTF-8'
            }
          }
        }
      };

      try {
        await ses.sendEmail(params).promise();
        console.log(`Alert sent to ${user_email} for region ${region_name}`);
      } catch (err) {
        console.error(`Failed to send alert to ${user_email}:`, err);
      }
    }
  }
}

// 每分钟运行一次，也可以改成你需要的频率
setInterval(() => {
  checkAndAlert().catch(console.error);
}, 60 * 1000);

// 启动时立即执行一次
checkAndAlert().catch(console.error);
