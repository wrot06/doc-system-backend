require('dotenv').config();
const db = require('../src/db');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const STORAGE_PATH = path.join(__dirname, '../download'); // Adjust as needed based on server config
// Actually server uses MINIO_BUCKET_TMP, but for now we assume local dev setup or minio mock?
// The previous test script worked, so environment is likely set up for it.

const BASE_URL = 'http://localhost:3000';

async function run() {
    let tagId = null;
    let userId = null;
    let token = null;
    let depId = null;

    try {
        console.log('1. Setting up test user and dependency...');
        // Cleanup first
        const oldUser = await db.query("SELECT id FROM usuarios WHERE username='tagtester'");
        if (oldUser.rowCount) {
            const oldId = oldUser.rows[0].id;
            await db.query("DELETE FROM ingesta_documentos WHERE usuario_id=$1", [oldId]);
            await db.query("DELETE FROM documentos WHERE usuario_id=$1", [oldId]); // Might be needed
            await db.query("DELETE FROM etiquetas_usuario WHERE usuario_id=$1", [oldId]);
            await db.query("DELETE FROM usuarios WHERE id=$1", [oldId]);
        }
        await db.query("DELETE FROM dependencias WHERE acronimo='TAGTEST'");

        // Create Dep
        const depRes = await db.query(
            "INSERT INTO dependencias (nombre, acronimo, tipo, estado) VALUES ('Tag Test Dep', 'TAGTEST', 'oficina', true) RETURNING id"
        );
        depId = depRes.rows[0].id;

        // Create User
        // We'll just update user 1 to use this dependency for simplicity, or create new.
        // Let's create new to be clean.
        const bcrypt = require('bcryptjs'); // Need this if we register, or manually insert
        const hash = await bcrypt.hash('123456', 10);
        const userRes = await db.query(
            "INSERT INTO usuarios (username, nombre, password_hash, rol, dependencia_id, activo) VALUES ('tagtester', 'Tag Tester', $1, 'admin', $2, true) RETURNING id",
            [hash, depId]
        );
        userId = userRes.rows[0].id;

        console.log('2. Logging in...');
        const authRes = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'tagtester',
            password: '123456'
        });
        token = authRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        console.log('3. Creating Tag...');
        const tagRes = await axios.post(`${BASE_URL}/etiquetas`, {
            nombre: 'Urgente',
            acronimo: 'URG'
        }, { headers });
        tagId = tagRes.data.id;
        console.log('   Tag created:', tagRes.data);

        console.log('4. Uploading One Document...');
        // Create dummy PDF with header
        const pdfPath = path.join(__dirname, 'test_tag.pdf');
        // Minimal valid PDF structure
        const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>
endobj
xref
0 4
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
223
%%EOF
% Randomizer: ${Date.now()}
`;
        fs.writeFileSync(pdfPath, pdfContent);

        const form = new FormData();
        form.append('files', fs.createReadStream(pdfPath));

        // Need to wait 1s for previous batch to clear? No.
        const uploadRes = await axios.post(`${BASE_URL}/ingesta/batch`, form, {
            headers: { ...headers, ...form.getHeaders() }
        });
        const docId = uploadRes.data.resultados[0].id; // Assuming response structure
        // Wait for DB to settle? usually instant. But upload endpoint returns before? 
        // review.html logic calls GET waiting for 'NUEVO'.
        // Let's correct: upload writes to minio and DB.
        // Actually, uploadRes might not have ID if it returns batch info.
        // Previous script output: "Ingesta ID: 580". 
        // Let's find the ID from DB.
        const ingestaRes = await db.query("SELECT id FROM ingesta_documentos WHERE nombre_archivo='test_tag.pdf' Order BY id DESC LIMIT 1");
        const realDocId = ingestaRes.rows[0].id;
        console.log('   Ingesta ID:', realDocId);

        console.log('5. Officializing with Date and Tag...');
        const today = new Date().toISOString().split('T')[0];

        await axios.put(`${BASE_URL}/ingesta/${realDocId}`, {
            tipo_documental: 'RESOLUCION',
            descripcion: 'Test with tags',
            fecha_creacion_doc: today,
            etiquetas: [tagId]
        }, { headers });
        console.log('   Officialized.');

        console.log('6. Verificar Datos...');
        const docCheck = await db.query(
            "SELECT * FROM documentos WHERE id=(SELECT max(id) FROM documentos)"
        );
        const finalDoc = docCheck.rows[0];
        // Check Date
        // Date from PG might be object or string
        const dbDate = new Date(finalDoc.fecha_creacion_doc).toISOString().split('T')[0];
        if (dbDate !== today) throw new Error(`Date mismatch: ${dbDate} vs ${today}`);
        console.log('   ✅ Date matches:', dbDate);

        // Check Tags
        const tagCheck = await db.query(
            "SELECT * FROM documento_etiquetas WHERE documento_id=$1 AND etiqueta_id=$2",
            [finalDoc.id, tagId]
        );
        if (tagCheck.rowCount !== 1) throw new Error('Tag relationship not found');
        console.log('   ✅ Tag linked.');

        console.log('7. Testing Future Date Validation...');
        // Create 2nd dummy PDF with UNIQUE content
        const pdfPath2 = path.join(__dirname, 'test_tag_2.pdf');
        fs.writeFileSync(pdfPath2, pdfContent + '\n% Second file');

        const form2 = new FormData();
        form2.append('files', fs.createReadStream(pdfPath2));
        await axios.post(`${BASE_URL}/ingesta/batch`, form2, { headers: { ...headers, ...form2.getHeaders() } });
        const ingestaRes2 = await db.query("SELECT id FROM ingesta_documentos WHERE nombre_archivo='test_tag_2.pdf' Order BY id DESC LIMIT 1");
        const docId2 = ingestaRes2.rows[0].id;

        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            await axios.put(`${BASE_URL}/ingesta/${docId2}`, {
                tipo_documental: 'RESOLUCION',
                descripcion: 'Future test',
                fecha_creacion_doc: tomorrowStr,
                etiquetas: []
            }, { headers });
            throw new Error('❌ Should have failed with future date');
        } catch (e) {
            if (e.response && e.response.status === 400) {
                console.log('   ✅ correctly rejected future date.');
            } else {
                throw e;
            }
        }

    } catch (e) {
        console.error('❌ FAILURE:', e.message);
        if (e.response) console.error('   Data:', e.response.data);
        process.exit(1);
    } finally {
        console.log('Cleaning up...');
        if (userId) await db.query("DELETE FROM usuarios WHERE id=$1", [userId]);
        if (depId) await db.query("DELETE FROM dependencias WHERE id=$1", [depId]);
        if (tagId) await db.query("DELETE FROM etiquetas_usuario WHERE id=$1", [tagId]); // cascade usually handles but explicit is nice
        // Clean docs? cascading from user delete set null? or no cascade.
        // It's a dev env, minor clutter is acceptable, or use transaction rollback.
        // Explicitly deleting setup data is good.
        process.exit(0);
    }
}

run();
