require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('../src/db');

async function run() {
    try {
        console.log('Dropping UNIQUE constraint on hash_sha256...');
        await db.query('ALTER TABLE archivos DROP CONSTRAINT IF EXISTS archivos_hash_sha256_key');

        // We still want an index for performance lookups, just not unique
        // Check if regular index exists, if not create it
        // Note: 'idx_archivos_hash' was seen in my inspection earlier, so likely we are good.
        // But to be safe/idempotent:
        await db.query('CREATE INDEX IF NOT EXISTS idx_archivos_hash ON archivos(hash_sha256)');

        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
