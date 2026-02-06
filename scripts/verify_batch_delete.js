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
        const USERNAME = `deluser_${RAND}`;

        console.log('1. Setup Test Data...');
        const depRes = await db.query(
            "INSERT INTO dependencias (nombre, acronimo, tipo, estado) VALUES ($1, $2, 'oficina', true) RETURNING id",
            [`Test Del ${RAND}`, `DEL${Math.floor(RAND % 10000)}`]
        );
        const depId = depRes.rows[0].id;

        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('123456', 10);
        const userRes = await db.query(
            "INSERT INTO usuarios (username, nombre, password_hash, rol, dependencia_id, activo) VALUES ($1, 'Delete User', $2, 'admin', $3, true) RETURNING id",
            [USERNAME, hash, depId]
        );
        const userId = userRes.rows[0].id;

        console.log('2. Login...');
        const authRes = await axios.post(`${BASE_URL}/auth/login`, { username: USERNAME, password: '123456' });
        const token = authRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        console.log('3. Upload Batch...');
        const { PDFDocument } = require('pdf-lib');
        const doc = await PDFDocument.create();
        doc.addPage();
        const pdfBytes = await doc.save();

        const fname = `todel_${RAND}.pdf`;
        const pdfPath = path.join(__dirname, fname);
        fs.writeFileSync(pdfPath, pdfBytes);

        const form = new FormData();
        form.append('files', fs.createReadStream(pdfPath));
        const upRes = await axios.post(`${BASE_URL}/ingesta/batch`, form, { headers: { ...headers, ...form.getHeaders() } });
        const batchId = upRes.data.batch_id;
        console.log(`   Batch ID: ${batchId}`);

        console.log('4. Verify Existence...');
        const q = await db.query("SELECT * FROM ingesta_documentos WHERE batch_id=$1", [batchId]);
        if (q.rowCount === 0) throw new Error('Batch not found in DB');

        console.log('DB Row:', q.rows[0]);
        const key = q.rows[0].minio_tmp_key;
        await minio.getObject(process.env.MINIO_BUCKET_TMP, key);
        console.log('   ✅ Docs exist in DB and MinIO');

        console.log('5. Delete Batch...');
        await axios.delete(`${BASE_URL}/ingesta/batch/${batchId}`, { headers });
        console.log('   Delete request successful');

        console.log('6. Verify Deletion...');
        const qCheck = await db.query("SELECT * FROM ingesta_documentos WHERE batch_id=$1", [batchId]);
        if (qCheck.rowCount > 0) throw new Error('Rows still exist in DB');
        console.log('   ✅ Rows deleted from DB');

        try {
            await minio.statObject(process.env.MINIO_BUCKET_TMP, key);
            throw new Error('Object still exists in MinIO');
        } catch (e) {
            if (e.code !== 'NotFound' && e.code !== 'NoSuchKey') throw e;
            console.log('   ✅ Object deleted from MinIO');
        }

        // Cleanup user/dep
        await db.query("DELETE FROM usuarios WHERE id=$1", [userId]);
        await db.query("DELETE FROM dependencias WHERE id=$1", [depId]);
        fs.unlinkSync(pdfPath);

    } catch (e) {
        console.error(e);
        if (e.response) console.error('Response:', e.response.data);
        process.exit(1);
    }
}
run();
