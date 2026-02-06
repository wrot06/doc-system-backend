require('dotenv').config();
const db = require('./src/db');

async function checkRoles() {
    try {
        const res = await db.query("SELECT DISTINCT rol FROM usuarios");
        console.log('Roles:', res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkRoles();
