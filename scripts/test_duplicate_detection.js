const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_URL = 'http://localhost:3000';
const TEST_PDF = path.join(__dirname, 'test.pdf');
const JWT_SECRET = process.env.JWT_SECRET || 'una_clave_larga_y_segura';

// Create a small test PDF if it doesn't exist
if (!fs.existsSync(TEST_PDF)) {
    const minimalPdf = Buffer.from(
        '%PDF-1.4\n' +
        '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n' +
        '2 0 obj <</Type/Pages/Count 1/Kids[3 0 R]>> endobj\n' +
        '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<<>>>> endobj\n' +
        'xref\n' +
        '0 4\n' +
        '0000000000 65535 f \n' +
        '0000000009 00000 n \n' +
        '0000000052 00000 n \n' +
        '0000000101 00000 n \n' +
        'trailer <</Size 4/Root 1 0 R>>\n' +
        'startxref\n' +
        '178\n' +
        '%%EOF'
    );
    fs.writeFileSync(TEST_PDF, minimalPdf);
}

async function runTest() {
    try {
        console.log('--- Generando token de prueba ---');
        const token = jwt.sign({ uid: 1 }, JWT_SECRET);
        const headers = { 'Authorization': `Bearer ${token}` };

        // 1. Limpiar ingestas previas para el test
        const { execSync } = require('child_process');
        console.log('--- Limpiando ingestas previas ---');
        execSync(`PGPASSWORD=sga123 psql -h localhost -U sga -d sga -c "DELETE FROM ingesta_documentos;"`);

        // 2. Subir el MISMO documento en dos batches diferentes
        console.log('--- Subiendo Batch A ---');
        const formA = new FormData();
        formA.append('files', fs.createReadStream(TEST_PDF), 'test.pdf');
        const uploadA = await axios.post(`${API_URL}/ingesta/batch`, formA, {
            headers: { ...headers, ...formA.getHeaders() }
        });
        const batchA = uploadA.data.batch_id;

        console.log('--- Subiendo Batch B ---');
        const formB = new FormData();
        formB.append('files', fs.createReadStream(TEST_PDF), 'test.pdf');
        const uploadB = await axios.post(`${API_URL}/ingesta/batch`, formB, {
            headers: { ...headers, ...formB.getHeaders() }
        });
        const batchB = uploadB.data.batch_id;

        console.log(`Batch A: ${batchA}, Batch B: ${batchB}`);

        // 3. Verificar que ambos ven el documento como NUEVO inicialmente
        // Nota: Si ya existía en archivos (oficializado previo), daría DUPLICADO. 
        // Para este test asumimos que es un archivo nuevo o que al menos se comporta igual en ambos.
        const resA1 = await axios.get(`${API_URL}/ingesta/batch/${batchA}`, { headers });
        const resB1 = await axios.get(`${API_URL}/ingesta/batch/${batchB}`, { headers });

        console.log(`Batch A Inicial: ${resA1.data[0].estado}`);
        console.log(`Batch B Inicial: ${resB1.data[0].estado}`);

        if (resA1.data[0].estado === 'DUPLICADO') {
            console.log('⚠️ El archivo ya era un duplicado oficial. El test de "desaparecer" seguirá siendo válido.');
        }

        // 4. Oficializar el documento en Batch A
        const ingestaIdA = resA1.data[0].id;
        console.log('--- Oficializando documento en Batch A ---');
        await axios.put(`${API_URL}/ingesta/${ingestaIdA}`, {
            tipo_documental: 'OFICIO',
            descripcion: 'Test cross-batch dynamic filter',
            fecha_creacion_doc: new Date().toISOString().split('T')[0],
            etiquetas: []
        }, { headers });
        console.log('Documento oficializado.');

        // 5. Verificar Batch B: El documento debe ahora aparecer como DUPLICADO dinámicamente
        const resB2 = await axios.get(`${API_URL}/ingesta/batch/${batchB}`, { headers });
        console.log(`Batch B después de oficializar A: ${resB2.data[0].estado}`);

        if (resB2.data[0].estado !== 'DUPLICADO') {
            throw new Error(`❌ TEST FALLIDO: Batch B debería mostrar DUPLICADO dinámicamente.`);
        }

        // 6. Verificar que con filtro ?estado=NUEVO, Batch B NO devuelve nada
        const resB3 = await axios.get(`${API_URL}/ingesta/batch/${batchB}?estado=NUEVO`, { headers });
        console.log(`Batch B con filtro ?estado=NUEVO: ${resB3.data.length} documentos encontrados`);

        if (resB3.data.length === 0) {
            console.log('✅ TEST PASADO: El documento desapareció de la lista de pendientes del Batch B.');
        } else {
            console.error('❌ TEST FALLIDO: El documento sigue apareciendo en Batch B como pendiente.');
        }

    } catch (e) {
        console.error('ERROR EN EL TEST:', e.response?.data || e.message);
    }
}

runTest();
