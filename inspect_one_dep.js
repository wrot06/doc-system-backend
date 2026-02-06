require('dotenv').config();
const db = require('./src/db');

async function checkDep() {
    try {
        const res = await db.query("SELECT * FROM dependencias WHERE nombre ILIKE '%Postgrado%'");
        console.log('Rows found:', res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkDep();
