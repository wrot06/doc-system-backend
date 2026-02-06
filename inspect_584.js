require('dotenv').config();
const db = require('./src/db');
async function checkStatus584() {
    try {
        const res = await db.query("SELECT * FROM ingesta_documentos WHERE id=584");
        console.log('Doc 584:', res.rows[0]);
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
}
checkStatus584();
