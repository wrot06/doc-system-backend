require('dotenv').config();
const db = require('./src/db');

async function inspectDoc() {
    try {
        const res = await db.query("SELECT * FROM documentos LIMIT 1");
        console.log('Documentos Columns:', res.fields.map(f => f.name));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspectDoc();
