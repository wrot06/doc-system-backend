require('dotenv').config();
const db = require('./src/db');

async function listDeps() {
    try {
        const res = await db.query("SELECT id, nombre, acronimo FROM dependencias");
        console.log('Dependencies:', res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

listDeps();
