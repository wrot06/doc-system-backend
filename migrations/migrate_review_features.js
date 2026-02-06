require('dotenv').config();
const db = require('../src/db');

async function migrate() {
    try {
        console.log('Applying migrations...');

        // 1. Add fecha_creacion_doc to documentos
        await db.query(`
            ALTER TABLE documentos 
            ADD COLUMN IF NOT EXISTS fecha_creacion_doc DATE
        `);
        console.log(' - Added fecha_creacion_doc');

        // 2. Create etiquetas_usuario table
        await db.query(`
            CREATE TABLE IF NOT EXISTS etiquetas_usuario (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id),
                nombre TEXT NOT NULL,
                acronimo TEXT NOT NULL,
                estado BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT now(),
                UNIQUE(usuario_id, acronimo)
            )
        `);
        console.log(' - Created etiquetas_usuario');

        // 3. Create documento_etiquetas table
        await db.query(`
            CREATE TABLE IF NOT EXISTS documento_etiquetas (
                documento_id INT REFERENCES documentos(id) ON DELETE CASCADE,
                etiqueta_id INT REFERENCES etiquetas_usuario(id),
                created_at TIMESTAMP DEFAULT now(),
                PRIMARY KEY(documento_id, etiqueta_id)
            )
        `);
        console.log(' - Created documento_etiquetas');

        console.log('Migration complete.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
