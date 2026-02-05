require('dotenv').config();
const db = require('./src/db');

async function inspect() {
    try {
        const res = await db.query('SELECT * FROM usuarios LIMIT 1');
        console.log('Columns:', res.fields.map(f => f.name));
        console.log('Row:', res.rows[0]);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
