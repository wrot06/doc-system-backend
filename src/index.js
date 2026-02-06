require('dotenv').config()
const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const Busboy = require('busboy')

const db = require('./db')
const minio = require('./minio')
const { insertQR } = require('./qr')
const { getPageCount } = require('./pdf')
const pdf = require('./pdf')

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, '../ui'), {
   setHeaders: (res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
   }
}))

const upload = multer()

const authRoutes = require('./routes/auth')
app.use('/auth', authRoutes)
app.use('/etiquetas', require('./routes/etiquetas'))

/* ===============================
   MIDDLEWARE AUTH
================================ */
const jwt = require('jsonwebtoken')
function auth(req, res, next) {
   const h = req.headers.authorization
   if (!h) return res.sendStatus(401)
   try {
      const token = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET)
      req.user = { id: token.uid }
      next()
   } catch (e) {
      return res.sendStatus(401)
   }
}


/* ===============================
   UTILIDAD ARCHIVO (DEDUP)
================================ */

const { PDFDocument } = require('pdf-lib')
const { execSync } = require('child_process')

async function prepararPdfOficial(buffer, { radicado, tipo, descripcion }) {
   const pdf = await PDFDocument.load(buffer)

   pdf.setTitle(radicado)
   pdf.setSubject(descripcion)
   pdf.setKeywords([tipo, 'SGA'])
   pdf.setCreator('Sistema de Gestión Archivista')
   pdf.setProducer('SGA')

   const tmpIn = `/tmp/${radicado}.pdf`
   const tmpOut = `/tmp/${radicado}_PDFA.pdf`

   fs.writeFileSync(tmpIn, await pdf.save())

   execSync(
      `gs -dPDFA=2 -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
   -sOutputFile=${tmpOut} ${tmpIn}`
   )

   const finalBuffer = fs.readFileSync(tmpOut)
   const hash = crypto.createHash('sha256').update(finalBuffer).digest('hex')

   return { buffer: finalBuffer, hash }
}



/* ===============================
   UTILIDAD ARCHIVO (DEDUP)
================================ */
async function obtenerArchivo(buffer) {
   const hash = crypto.createHash('sha256').update(buffer).digest('hex')
   const dup = await db.query(
      'SELECT id,minio_key FROM archivos WHERE hash_sha256=$1', [hash]
   )
   if (dup.rowCount) return { id: dup.rows[0].id, hash }
   const key = `base/${hash}.pdf`
   await minio.putObject(process.env.MINIO_BUCKET, key, buffer)

   // Calcular páginas del PDF
   const tmpPath = `/tmp/${hash}.pdf`
   fs.writeFileSync(tmpPath, buffer)
   const paginas = await getPageCount(tmpPath)
   fs.unlinkSync(tmpPath)

   const r = await db.query(
      'INSERT INTO archivos(hash_sha256,size_bytes,minio_key,paginas) VALUES($1,$2,$3,$4) RETURNING id',
      [hash, buffer.length, key, paginas]
   )
   return { id: r.rows[0].id, hash, paginas }
}

/* ===============================
   CREAR DOCUMENTO v1
================================ */
app.post('/documentos', upload.single('pdf'), async (req, res) => {
   try {
      if (!req.file || req.file.mimetype !== 'application/pdf')
         return res.status(400).send('PDF requerido')
      if (!req.body.nombre_documento)
         return res.status(400).send('Nombre requerido')

      const radicado = `RAD-${Date.now()}`
      const { id: archivoId } = await obtenerArchivo(req.file.buffer)

      const d = await db.query(
         'INSERT INTO documentos(radicado,nombre_documento,created_at) VALUES($1,$2,now()) RETURNING id',
         [radicado, req.body.nombre_documento]
      )

      await db.query(
         'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,1)',
         [d.rows[0].id, archivoId]
      )

      await insertQR(req.file.buffer, radicado, `http://localhost:3000/verificar/${radicado}`)
      res.json({ radicado, version: 1 })
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})

/* ===============================
   NUEVA VERSION
================================ */
app.post('/documentos/:radicado/version', upload.single('pdf'), async (req, res) => {
   try {
      if (!req.file || req.file.mimetype !== 'application/pdf')
         return res.status(400).send('PDF requerido')

      const doc = await db.query(
         'SELECT id FROM documentos WHERE radicado=$1', [req.params.radicado]
      )
      if (!doc.rowCount) return res.sendStatus(404)

      const v = await db.query(
         'SELECT COALESCE(MAX(version),0)+1 n FROM documento_versiones WHERE documento_id=$1',
         [doc.rows[0].id]
      )

      const { id: archivoId } = await obtenerArchivo(req.file.buffer)

      await db.query(
         'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,$3)',
         [doc.rows[0].id, archivoId, v.rows[0].n]
      )

      await insertQR(req.file.buffer, req.params.radicado, `http://localhost:3000/verificar/${req.params.radicado}`)
      res.json({ radicado: req.params.radicado, version: v.rows[0].n })
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})

/* ===============================
   HISTORIAL VERSIONES
================================ */
app.get('/documentos/:radicado/versiones', async (req, res) => {
   try {
      const q = await db.query(`
   SELECT dv.version,dv.created_at,a.hash_sha256,a.minio_key,
   COUNT(*) OVER (PARTITION BY a.id)>1 reutilizado
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   JOIN archivos a ON a.id=dv.archivo_id
   WHERE d.radicado=$1
   ORDER BY dv.version
  `, [req.params.radicado])
      if (!q.rowCount) return res.sendStatus(404)
      res.json({ radicado: req.params.radicado, versiones: q.rows })
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})

/* ===============================
   DESCARGA VERSION ACTUAL
================================ */
app.get('/documentos/:radicado/download', async (req, res) => {
   const q = await db.query(`
  SELECT a.minio_key
  FROM documentos d
  JOIN documento_versiones dv ON dv.documento_id=d.id
  JOIN archivos a ON a.id=dv.archivo_id
  WHERE d.radicado=$1
  ORDER BY dv.version DESC LIMIT 1
 `, [req.params.radicado])
   if (!q.rowCount) return res.sendStatus(404)
   const s = await minio.getObject(process.env.MINIO_BUCKET, q.rows[0].minio_key)
   res.setHeader('Content-Type', 'application/pdf')
   s.pipe(res)
})

/* ===============================
   VERIFICACION PUBLICA
================================ */
app.get('/verificar/:radicado', async (req, res) => {
   const q = await db.query(`
  SELECT d.nombre_documento,d.radicado,d.created_at,
  dv.version,a.hash_sha256,a.minio_key
  FROM documentos d
  JOIN documento_versiones dv ON dv.documento_id=d.id
  JOIN archivos a ON a.id=dv.archivo_id
  WHERE d.radicado=$1
  ORDER BY dv.version DESC LIMIT 1
 `, [req.params.radicado])
   if (!q.rowCount) return res.json({ valido: false })

   const stream = await minio.getObject(process.env.MINIO_BUCKET, q.rows[0].minio_key)
   const h = crypto.createHash('sha256')
   await new Promise((ok, fail) => {
      stream.on('data', d => h.update(d))
      stream.on('end', ok)
      stream.on('error', fail)
   })

   res.json({
      valido: true,
      radicado: q.rows[0].radicado,
      nombre: q.rows[0].nombre_documento,
      version: q.rows[0].version,
      integridad: h.digest('hex') === q.rows[0].hash_sha256 ? 'OK' : 'ERROR'
   })
})

/* ===============================
   TRATAMIENTO ARCHIVÍSTICO (PASO 2)
================================ */
app.put('/ingesta/:id', async (req, res) => {
   try {
      const id = Number(req.params.id)
      const { tipo_documental, descripcion, fecha_creacion_doc, etiquetas } = req.body
      if (!id || !tipo_documental || !descripcion)
         return res.status(400).send('Datos incompletos')

      // Validar fecha creacion
      if (fecha_creacion_doc) {
         const d = new Date()
         const hoyStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
         if (fecha_creacion_doc > hoyStr) {
            return res.status(400).send('La fecha de creación no puede ser una fecha futura')
         }
      } else {
         return res.status(400).send('Fecha de creación requerida')
      }

      const q = await db.query(`
   SELECT
   nombre_archivo,
   minio_tmp_key,
   estado,
   usuario_id,
   dependencia_id
   FROM ingesta_documentos
   WHERE id=$1
  `, [id])

      if (!q.rowCount)
         return res.status(404).send('Documento no existe')

      if (q.rows[0].estado !== 'NUEVO')
         return res.status(409).send('Documento no editable')

      const stream = await minio.getObject(
         process.env.MINIO_BUCKET_TMP,
         q.rows[0].minio_tmp_key
      )

      const chunks = []
      for await (const c of stream) chunks.push(c)
      const buffer = Buffer.concat(chunks)

      const { id: archivoId } = await obtenerArchivo(buffer)

      // 🔴 OBTENER ACRONIMO DEPENDENCIA
      console.log('Ingesta ID:', id, 'Dependencia ID:', q.rows[0].dependencia_id);
      const dep = await db.query(
         'SELECT acronimo FROM dependencias WHERE id=$1',
         [q.rows[0].dependencia_id]
      )

      let prefijo = 'RAD'
      if (dep.rowCount && dep.rows[0].acronimo) {
         prefijo = dep.rows[0].acronimo
      }
      console.log('Acronimo found:', dep.rows[0]?.acronimo, 'Prefijo:', prefijo);

      const radicado = `${prefijo}-${Date.now()}`

      const d = await db.query(`
   INSERT INTO documentos
   (radicado,nombre_documento,tipo_documental,descripcion,usuario_id,dependencia_id,created_at,fecha_creacion_doc)
   VALUES($1,$2,$3,$4,$5,$6,now(),$7)
   RETURNING id
   `, [
         radicado,
         q.rows[0].nombre_archivo,
         tipo_documental,
         descripcion,
         q.rows[0].usuario_id,
         q.rows[0].dependencia_id,
         fecha_creacion_doc
      ])

      // GUARDAR ETIQUETAS
      if (Array.isArray(etiquetas) && etiquetas.length > 0) {
         for (const etiquetaId of etiquetas) {
            await db.query(`
                INSERT INTO documento_etiquetas(documento_id, etiqueta_id)
                VALUES($1, $2) ON CONFLICT DO NOTHING
            `, [d.rows[0].id, etiquetaId]);
         }
      }


      await db.query(`
   INSERT INTO documento_versiones
   (documento_id,archivo_id,version)
   VALUES($1,$2,1)
  `, [d.rows[0].id, archivoId])

      await insertQR(
         buffer,
         radicado,
         `http://localhost:3000/verificar/${radicado}`
      )

      await db.query(`
   UPDATE ingesta_documentos
   SET estado='OFICIALIZADO'
   WHERE id=$1
  `, [id])

      res.json({ ok: true, radicado })
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})




/* ===============================
   LISTAR TODOS LOS BATCHES
================================ */
app.get('/ingesta/batches', async (req, res) => {
   try {
      const q = await db.query(`
         SELECT
            batch_id,
            COUNT(*) as total,
            COUNT(CASE WHEN estado='NUEVO' THEN 1 END) as pendientes,
            COUNT(CASE WHEN estado='OFICIALIZADO' THEN 1 END) as oficializados,
            COUNT(CASE WHEN estado='ERROR' THEN 1 END) as errores
         FROM ingesta_documentos
         GROUP BY batch_id
         ORDER BY batch_id DESC
      `)
      res.json(q.rows)
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})


/* ===============================
   ELIMIMAR BATCH INGESTA
================================ */

app.delete('/ingesta/batches/:batchId', async (req, res) => {
   const { batchId } = req.params
   try {
      // 1️⃣ verificar que el batch exista
      const existe = await db.query(
         'SELECT 1 FROM ingesta_documentos WHERE batch_id=$1',
         [batchId]
      )
      if (!existe.rowCount)
         return res.status(404).json({ error: 'Batch no existe' })

      // 2️⃣ obtener SOLO archivos temporales
      const q = await db.query(
         `SELECT minio_tmp_key
         FROM ingesta_documentos
         WHERE batch_id=$1
         AND minio_tmp_key IS NOT NULL`,
         [batchId]
      )

      // 3️⃣ borrar archivos temporales (bucket TMP)
      for (const r of q.rows) {
         try {
            await minio.removeObject(
               process.env.MINIO_BUCKET_TMP,
               r.minio_tmp_key
            )
         } catch { }
      }

      // 4️⃣ borrar SOLO la ingesta (no documentos oficiales)
      await db.query(
         'DELETE FROM ingesta_documentos WHERE batch_id=$1',
         [batchId]
      )

      res.json({
         message: 'Batch eliminado. Documentos oficializados conservados',
         batch_id: batchId
      })
   } catch (e) {
      console.error('DELETE BATCH ERROR:', e)
      res.status(500).json({ error: e.message })
   }
})



/* ===============================
   LISTAR INGESTA POR BATCH (PASO 3 UI)
================================ */
app.get('/ingesta/batch/:batch', async (req, res) => {
   try {
      const { estado } = req.query
      let sql = `
    SELECT
     id,
     nombre_archivo,
     sha256,
     paginas,
     estado,
     tipo_documental,
     descripcion
    FROM ingesta_documentos
    WHERE batch_id=$1
    AND sha256 NOT IN (SELECT hash_sha256 FROM archivos)
   `
      const params = [req.params.batch]

      if (estado) {
         sql += ' AND estado=$2'
         params.push(estado)
      }

      sql += ' ORDER BY id'

      const q = await db.query(sql, params)

      // Retornar array vacío en vez de 404 si es un filtro válido pero sin resultados
      // if (!q.rowCount) return res.sendStatus(404) 

      res.json(q.rows)
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})

/* ===============================
   VISTA PREVIA PDF (INGESTA) — CORRECTA
================================ */
app.get('/documentos/tmp/:id', async (req, res) => {
   try {
      const q = await db.query(`
   SELECT minio_tmp_key,estado
   FROM ingesta_documentos
   WHERE id=$1
  `, [Number(req.params.id)])

      if (!q.rowCount) return res.sendStatus(404)

      if (q.rows[0].estado !== 'NUEVO')
         return res.sendStatus(404)

      const stream = await minio.getObject(
         process.env.MINIO_BUCKET_TMP,
         q.rows[0].minio_tmp_key
      )

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline')
      stream.pipe(res)

   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})




/* ===============================
   VER DOCUMENTO ORIGINAL (DUPLICADO)
================================ */
app.get('/ingesta/tmp/:id', async (req, res) => {
   try {
      const q = await db.query(
         'SELECT minio_tmp_key FROM ingesta_documentos WHERE id=$1',
         [req.params.id]
      )
      if (!q.rowCount) return res.sendStatus(404)

      const stream = await minio.getObject(
         process.env.MINIO_BUCKET_TMP,
         q.rows[0].minio_tmp_key
      )

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline')
      stream.pipe(res)

   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})



/* ===============================
   LISTAR DOCUMENTOS OFICIALES
================================ */
app.get('/documentos', auth, async (req, res) => {
   try {
      const u = await db.query(
         'SELECT dependencia_id FROM usuarios WHERE id=$1',
         [req.user.id]
      )
      if (!u.rowCount) return res.sendStatus(401)

      const q = await db.query(`
      SELECT
        d.id,
        d.radicado,
        d.nombre_documento,
        d.tipo_documental,
        d.descripcion,
        d.created_at,
        dv.version,
        COALESCE(a.paginas, 0) as paginas
      FROM documentos d
      JOIN documento_versiones dv ON dv.documento_id=d.id
      JOIN archivos a ON a.id = dv.archivo_id
      WHERE dv.version=(
        SELECT MAX(version)
        FROM documento_versiones
        WHERE documento_id=d.id
      )
      AND d.usuario_id=$1
      AND d.dependencia_id=$2
      ORDER BY d.created_at DESC
    `, [req.user.id, u.rows[0].dependencia_id])

      res.json(q.rows)
   } catch (e) {
      console.error(e)
      res.status(500).send(e.message)
   }
})

/* ===============================
   ELIMINAR DOCUMENTO (SOLO ADMIN)
================================ */
app.delete('/documentos/:radicado', auth, async (req, res) => {
   try {
      // Verificar que el usuario es admin
      const u = await db.query(
         'SELECT rol FROM usuarios WHERE id=$1',
         [req.user.id]
      )
      if (!u.rowCount || u.rows[0].rol !== 'admin') {
         return res.status(403).json({ error: 'Solo administradores pueden eliminar documentos' })
      }

      const { radicado } = req.params

      // Obtener el documento y sus archivos
      const doc = await db.query(
         'SELECT id FROM documentos WHERE radicado=$1',
         [radicado]
      )
      if (!doc.rowCount) {
         return res.status(404).json({ error: 'Documento no encontrado' })
      }

      const docId = doc.rows[0].id

      // Obtener archivos asociados para eliminar de MinIO
      const archivos = await db.query(`
         SELECT DISTINCT a.id, a.minio_key
         FROM documento_versiones dv
         JOIN archivos a ON a.id = dv.archivo_id
         WHERE dv.documento_id = $1
      `, [docId])

      // Eliminar versiones del documento
      await db.query('DELETE FROM documento_versiones WHERE documento_id=$1', [docId])

      // Eliminar el documento
      await db.query('DELETE FROM documentos WHERE id=$1', [docId])

      // Eliminar archivos de MinIO y BD (solo si no están siendo usados por otros documentos)
      for (const archivo of archivos.rows) {
         const enUso = await db.query(
            'SELECT 1 FROM documento_versiones WHERE archivo_id=$1 LIMIT 1',
            [archivo.id]
         )
         if (!enUso.rowCount) {
            try {
               await minio.removeObject(process.env.MINIO_BUCKET, archivo.minio_key)
            } catch (e) {
               console.error('Error eliminando archivo de MinIO:', e.message)
            }
            await db.query('DELETE FROM archivos WHERE id=$1', [archivo.id])
         }
      }

      res.json({ ok: true, message: `Documento ${radicado} eliminado correctamente` })
   } catch (e) {
      console.error('DELETE DOCUMENTO ERROR:', e)
      res.status(500).json({ error: e.message })
   }
})


/* ===============================
   INGESTA MASIVA – PASO 1 (UPLOAD)
================================ */
app.post('/ingesta/batch', auth, async (req, res) => {
   const bb = Busboy({ headers: req.headers })
   const resultados = []
   const tareas = []
   const batchId = `ING-${Date.now()}`
   const usuarioId = req.user.id

   const u = await db.query(
      'SELECT dependencia_id FROM usuarios WHERE id=$1',
      [usuarioId]
   )
   const dependenciaId = u.rows[0].dependencia_id

   bb.on('file', (_, file, info) => {
      const nombreArchivo = Buffer
         .from(info.filename, 'latin1')
         .toString('utf8')

      tareas.push(new Promise(ok => {
         const hash = crypto.createHash('sha256')
         const tmp = `/tmp/${Date.now()}-${nombreArchivo}`
         const ws = fs.createWriteStream(tmp)

         file.on('data', d => hash.update(d))
         file.pipe(ws)

         ws.on('close', async () => {
            try {
               const sha256 = hash.digest('hex')
               const paginas = await getPageCount(tmp)

               // 🔴 DETECCIÓN DE DUPLICADO OFICIAL
               const dup = await db.query(
                  'SELECT id FROM archivos WHERE hash_sha256=$1',
                  [sha256]
               )

               const estado = dup.rowCount ? 'DUPLICADO' : 'NUEVO'

               const tmpKey = `ingesta/${batchId}/${Date.now()}-${nombreArchivo}`

               await minio.putObject(
                  process.env.MINIO_BUCKET_TMP,
                  tmpKey,
                  fs.readFileSync(tmp)
               )

               await db.query(`
      INSERT INTO ingesta_documentos
      (batch_id,nombre_archivo,sha256,paginas,estado,
       usuario_id,dependencia_id,minio_tmp_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     `, [
                  batchId,
                  nombreArchivo,
                  sha256,
                  paginas,
                  estado,
                  usuarioId,
                  dependenciaId,
                  tmpKey
               ])

               resultados.push({
                  archivo: nombreArchivo,
                  sha256,
                  paginas,
                  estado
               })
            } catch (e) {
               await db.query(`
      INSERT INTO ingesta_documentos
      (batch_id,nombre_archivo,estado,error,
       usuario_id,dependencia_id)
      VALUES($1,$2,'ERROR',$3,$4,$5)
     `, [batchId, nombreArchivo, e.message, usuarioId, dependenciaId])

               resultados.push({
                  archivo: nombreArchivo,
                  estado: 'ERROR',
                  error: e.message
               })
            }
            ok()
         })
      }))
   })

   bb.on('close', async () => {
      await Promise.all(tareas)
      res.json({ batch_id: batchId, resultados })
   })

   req.pipe(bb)
})



/* ===============================
   LOGIN Y OBTENER INFO USUARIO
================================ */
app.get('/me', async (req, res) => {
   const h = req.headers.authorization
   if (!h) return res.sendStatus(401)
   try {
      const token = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET)
      const q = await db.query(`
   SELECT
    u.nombre,
    u.rol,
    u.dependencia_id,
    d.nombre as nombre_dependencia
   FROM usuarios u
   JOIN dependencias d ON d.id=u.dependencia_id
   WHERE u.id=$1
  `, [token.uid])

      if (!q.rowCount) return res.sendStatus(401)
      res.json(q.rows[0])
   } catch (e) {
      console.error(e)
      res.sendStatus(401)
   }
})


app.listen(process.env.PORT, () => {
   console.log('API lista en puerto', process.env.PORT)
})
