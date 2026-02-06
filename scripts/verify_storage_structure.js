require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const db = require('../src/db');
const minio = require('../src/minio');

const BASE_URL = 'http://localhost:3000';

async function run() {
    try {
        const RAND = Date.now();
        const USERNAME = `user_${RAND}`;
        const ACRO = `FLD${Math.floor(Math.random() * 1000)}`;

        console.log(`1. Setup Test Data (Acronym: ${ACRO}, User: ${USERNAME})...`);

        const depRes = await db.query(
            "INSERT INTO dependencias (nombre, acronimo, tipo, estado) VALUES ($1, $2, 'oficina', true) RETURNING id",
            [`Test Dep ${RAND}`, ACRO]
        );
        const depId = depRes.rows[0].id;

        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('123456', 10);
        const userRes = await db.query(
            "INSERT INTO usuarios (username, nombre, password_hash, rol, dependencia_id, activo) VALUES ($1, 'Folder User', $2, 'admin', $3, true) RETURNING id",
            [USERNAME, hash, depId]
        );
        const userId = userRes.rows[0].id;

        console.log('2. Login...');
        const authRes = await axios.post(`${BASE_URL}/auth/login`, { username: USERNAME, password: '123456' });
        const token = authRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        console.log('3. Upload Document 1 (Year 2025)...');
        const fname1 = `doc_${RAND}_1.pdf`;
        const pdfPath = path.join(__dirname, fname1);
        fs.writeFileSync(pdfPath, `%PDF-1.4\n% FolderTest\n%%EOF\n% ${Date.now()}`);

        const form = new FormData();
        form.append('files', fs.createReadStream(pdfPath));
        await axios.post(`${BASE_URL}/ingesta/batch`, form, { headers: { ...headers, ...form.getHeaders() } });

        const ingestaRes = await db.query("SELECT id FROM ingesta_documentos WHERE nombre_archivo=$1 ORDER BY id DESC LIMIT 1", [fname1]);
        const docId = ingestaRes.rows[0].id;

        console.log('4. Officialize (2025)...');
        const res1 = await axios.put(`${BASE_URL}/ingesta/${docId}`, {
            tipo_documental: 'OFICIO',
            descripcion: 'Folder Structure Test 2025',
            fecha_creacion_doc: '2025-05-20'
        }, { headers });

        const rad1 = res1.data.radicado;
        console.log('   Radicado 1:', rad1);

        console.log('5. Verify Storage Key 1...');
        const keyCheck1 = await db.query(
            "SELECT a.minio_key FROM documentos d JOIN documento_versiones dv ON dv.documento_id=d.id JOIN archivos a ON a.id=dv.archivo_id WHERE d.radicado=$1",
            [rad1]
        );
        const key1 = keyCheck1.rows[0].minio_key;
        console.log('   Key 1:', key1);

        if (!key1.includes(`${ACRO}/2025/`)) throw new Error('Key 1 format incorrect');
        await minio.getObject(process.env.MINIO_BUCKET, key1);
        console.log('   ✅ Object exists in MinIO');

        console.log('6. Upload SAME Content (Year 2026)...');
        const fname2 = `doc_${RAND}_2.pdf`;
        const pdfPath2 = path.join(__dirname, fname2);
        fs.copyFileSync(pdfPath, pdfPath2);

        const form2 = new FormData();
        form2.append('files', fs.createReadStream(pdfPath2));
        await axios.post(`${BASE_URL}/ingesta/batch`, form2, { headers: { ...headers, ...form2.getHeaders() } });

        const ingestaRes2 = await db.query("SELECT id, estado FROM ingesta_documentos WHERE nombre_archivo=$1 ORDER BY id DESC LIMIT 1", [fname2]);
        const docId2 = ingestaRes2.rows[0].id;

        // Assert DUPLICADO Status
        if (ingestaRes2.rows[0].estado !== 'DUPLICADO') {
            throw new Error(`Expected DUPLICADO status for 2nd upload, got ${ingestaRes2.rows[0].estado}`);
        }
        console.log('   ✅ 2nd Upload correctly marked as DUPLICADO');

        console.log('7. Officialize (2026)...');
        const res2 = await axios.put(`${BASE_URL}/ingesta/${docId2}`, {
            tipo_documental: 'OFICIO',
            descripcion: 'Folder Structure Test 2026',
            fecha_creacion_doc: '2026-02-06'
        }, { headers });

        const rad2 = res2.data.radicado;
        console.log('   Radicado 2:', rad2);

        console.log('8. Verify Storage Key 2...');
        const keyCheck2 = await db.query(
            "SELECT a.minio_key FROM documentos d JOIN documento_versiones dv ON dv.documento_id=d.id JOIN archivos a ON a.id=dv.archivo_id WHERE d.radicado=$1",
            [rad2]
        );
        const key2 = keyCheck2.rows[0].minio_key;
        console.log('   Key 2:', key2);

        if (!key2.includes(`${ACRO}/2026/`)) throw new Error('Key 2 format incorrect');
        if (key1 === key2) throw new Error('Keys should be different!');

        console.log('✅ Success: Different paths for same content.');

        // Cleanup (Since unique, we can theoretically leave it, but let's try to clean)
        console.log('Cleaning up...');
        await db.query("DELETE FROM ingesta_documentos WHERE usuario_id=$1", [userId]);
        await db.query("DELETE FROM documento_etiquetas WHERE documento_id IN (SELECT id FROM documentos WHERE usuario_id=$1)", [userId]);
        await db.query("DELETE FROM documento_versiones WHERE documento_id IN (SELECT id FROM documentos WHERE usuario_id=$1)", [userId]);
        await db.query("DELETE FROM documentos WHERE usuario_id=$1", [userId]);
        await db.query("DELETE FROM usuarios WHERE id=$1", [userId]);
        await db.query("DELETE FROM dependencias WHERE id=$1", [depId]);

        fs.unlinkSync(pdfPath);
        fs.unlinkSync(pdfPath2);

    } catch (e) {
        console.error(e);
        console.error('Data:', e.response?.data);
        process.exit(1);
    }
}
run();
