require('dotenv').config();
const db = require('../src/db');
const jwt = require('jsonwebtoken');
const { PDFDocument } = require('pdf-lib');

// Config param
const TEST_ACRONYM = 'TEST-DEP';
const API_URL = 'http://localhost:3000';

async function run() {
    let depId, userId, token;
    let batchId, ingestaId;

    try {
        console.log('0. Cleaning up previous test data...');
        await db.query("DELETE FROM usuarios WHERE username='test_user'");
        await db.query("DELETE FROM dependencias WHERE acronimo=$1", [TEST_ACRONYM]);

        console.log('1. Setting up test data...');
        // Create test dependency
        const d = await db.query(
            "INSERT INTO dependencias(nombre, tipo, estado, acronimo, created_at) VALUES('Test Dep', 'oficina', true, $1, now()) RETURNING id",
            [TEST_ACRONYM]
        );
        depId = d.rows[0].id;

        // Create test user
        const u = await db.query(
            "INSERT INTO usuarios(username, nombre, password_hash, rol, activo, dependencia_id, created_at) VALUES('test_user', 'Test User', 'hash', 'admin', true, $1, now()) RETURNING id",
            [depId]
        );
        userId = u.rows[0].id;

        // Create token (mock login)
        token = jwt.sign({
            uid: userId,
            dependencia_id: depId,
            rol: 'usuario'
        }, process.env.JWT_SECRET, { expiresIn: '1h' });


        console.log('2. Uploading file to Ingesta...');

        // Generate valid PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        page.drawText('Test content ' + Date.now());
        const pdfBytes = await pdfDoc.save();
        // Convert to buffer/string for body
        // Note: fetch body can be Buffer in Node

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

        // Construct body with Buffer
        // We need to concat buffers for multipart
        const pre = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
        const post = Buffer.from(`\r\n--${boundary}--\r\n`);

        const body = Buffer.concat([pre, Buffer.from(pdfBytes), post]);

        const uploadRes = await fetch(`${API_URL}/ingesta/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Authorization': `Bearer ${token}`
            },
            body: body
        });

        if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
        }

        const uploadData = await uploadRes.json();
        console.log('Upload response:', JSON.stringify(uploadData, null, 2));
        batchId = uploadData.batch_id;
        const filename = 'test.pdf'; // We sent this filename

        // Find the ingesta ID
        // Need to wait a tiny bit for async processing if any, though the INSERT happens in the request handler
        // But the previous implementation used fs streams which might be slightly different.
        // With text body, it should be instant.

        const ingRes = await db.query(
            "SELECT id FROM ingesta_documentos WHERE batch_id=$1 AND nombre_archivo=$2",
            [batchId, filename]
        );

        if (!ingRes.rowCount) throw new Error("Ingesta document not found in DB");

        ingestaId = ingRes.rows[0].id;
        console.log(`   Ingesta ID: ${ingestaId}`);

        // Debug DB state
        const ingDebug = await db.query("SELECT * FROM ingesta_documentos WHERE id=$1", [ingestaId]);
        console.log('   [DEBUG] Ingesta Record:', ingDebug.rows[0]);
        const depDebug = await db.query("SELECT * FROM dependencias WHERE id=$1", [ingDebug.rows[0].dependencia_id]);
        console.log('   [DEBUG] Dependencia Record:', depDebug.rows[0]);

        console.log('3. Officializing document...');
        const offRes = await fetch(`${API_URL}/ingesta/${ingestaId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tipo_documental: 'OFICIO',
                descripcion: 'Test Description'
            })
        });

        if (!offRes.ok) throw new Error(`Officialize failed: ${offRes.status} ${await offRes.text()}`);

        const offData = await offRes.json();
        const radicado = offData.radicado;
        console.log(`   Radicado generated: ${radicado}`);

        if (radicado.startsWith(`${TEST_ACRONYM}-`)) {
            console.log('✅ SUCCESS: Radicado starts with correct acronym.');
        } else {
            console.error('❌ FAILURE: Radicado does not match expected format.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ ERROR:', e.message);
        process.exit(1);
    } finally {
        console.log('4. Cleaning up...');
        try {
            if (userId) await db.query("DELETE FROM ingesta_documentos WHERE usuario_id=$1", [userId]);

            // Find docs created by this user
            if (userId) {
                const docs = await db.query("SELECT id FROM documentos WHERE usuario_id=$1", [userId]);
                for (const doc of docs.rows) {
                    await db.query("DELETE FROM documento_versiones WHERE documento_id=$1", [doc.id]);
                    await db.query("DELETE FROM documentos WHERE id=$1", [doc.id]);
                }

                await db.query("DELETE FROM usuarios WHERE id=$1", [userId]);
            }
            if (depId) await db.query("DELETE FROM dependencias WHERE id=$1", [depId]);
        } catch (cleanupErr) {
            console.error('Cleanup warning:', cleanupErr.message);
        }
    }
}

run();
