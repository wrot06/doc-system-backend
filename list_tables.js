require('dotenv').config();
const db = require('./src/db');

async function listTables() {
    try {
        const res = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema='public'
        `);
        console.log('Tables:', res.rows.map(r => r.table_name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listTables();
