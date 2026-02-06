require('dotenv').config();
const db = require('./src/db');
async function checkStatus() {
    try {
        const res = await db.query("SELECT * FROM ingesta_documentos WHERE id=581");
        console.log('Doc 581:', res.rows[0]);
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
checkStatus();
