// alerter.js
const { Pool } = require('pg');
const AWS = require('aws-sdk');

// 1) 配置 AWS SES
AWS.config.update({
    region: 'us-west-2',
    accessKeyId: 'AKIATWBJ2MK4IE2PMWFE',
    secretAccessKey: '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'
});
const ses = new AWS.SES({ apiVersion: '2010-12-01' });

// 2) 配置你的 Postgres 连接
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'weather_db',
    password: 'postgres',
    port: 5432,
});

async function checkAndAlert() {

    // 查询所有区域及对应用户邮箱
    const regions = await pool.query(
        `SELECT r.id AS region_id
          , u.email
          , r.name AS region_name
          , r.geom
       FROM regions r
       JOIN users u ON u.id = r.user_id`
    );

    for (let row of regions.rows) {
        // 在 fire_data 表里检验是否有火点落在该多边形内
        const fireInside = await pool.query(
            `SELECT COUNT(*)::int AS cnt
         FROM fire_data fd
        WHERE ST_Contains(r.geom, ST_SetSRID(ST_MakePoint(fd.lon, fd.lat),4326))
          AND r.id = $1`,
            [row.region_id]
        );

        if (fireInside.rows[0].cnt > 0) {
            // 构造邮件参数
            const params = {
                Source: 'kwang655@usc.edu',      // 必须是已在 SES 验证过的发信地址
                Destination: {
                    ToAddresses: [row.email],         // 直接发给该用户邮箱
                },
                Message: {
                    Subject: {
                        Data: `【野火风险警报】您关注的“${row.region_name}”区域有火点`,
                        Charset: 'UTF-8',
                    },
                    Body: {
                        Text: {
                            Data:
                                `您好，

我们检测到您在系统中定义的区域 “${row.region_name}” （ID: ${row.region_id}）内出现野火卫星观测点。
请立即关注该区域并采取必要的安全防范措施。

—— 云端野火监测平台`,
                            Charset: 'UTF-8',
                        }
                    }
                }
            };

            try {
                await ses.sendEmail(params).promise();
                console.log(`Alert email sent to ${row.email} for region ${row.region_name}`);
            } catch (err) {
                console.error(`Failed to send email to ${row.email}:`, err);
            }
        }
    }
}

// 每分钟检查一次
//setInterval(checkAndAlert, 60 * 1000);

// 也可以立刻运行一次
checkAndAlert().catch(console.error);
