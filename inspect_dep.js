require('dotenv').config();
const db = require('./src/db');

async function inspect() {
    try {
        const res = await db.query('SELECT * FROM dependencias LIMIT 1');
        console.log('Columns:', res.fields.map(f => f.name));
        if (res.rows.length > 0) {
            console.log('Row:', res.rows[0]);
        } else {
            console.log('No rows found');
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspect();
