require('dotenv').config();
const db = require('./src/db');

async function checkIndex() {
    try {
        const res = await db.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'archivos'
        `);
        console.log('Indexes:', res.rows);
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
checkIndex();
