require('dotenv').config()
const express=require('express')
const multer=require('multer')
const crypto=require('crypto')
const path=require('path')
const fs=require('fs')
const Busboy=require('busboy')

const db=require('./db')
const minio=require('./minio')
const {insertQR}=require('./qr')
const {getPageCount}=require('./pdf')
const pdf=require('./pdf')

const app=express()
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static(path.join(__dirname,'../ui'),{
 setHeaders:(res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8')
 }
}))

const upload=multer()



/* ===============================
   UTILIDAD ARCHIVO (DEDUP)
================================ */

const {PDFDocument}=require('pdf-lib')
const {execSync}=require('child_process')

async function prepararPdfOficial(buffer,{radicado,tipo,descripcion}){
 const pdf=await PDFDocument.load(buffer)

 pdf.setTitle(radicado)
 pdf.setSubject(descripcion)
 pdf.setKeywords([tipo,'SGA'])
 pdf.setCreator('Sistema de Gestión Archivista')
 pdf.setProducer('SGA')

 const tmpIn=`/tmp/${radicado}.pdf`
 const tmpOut=`/tmp/${radicado}_PDFA.pdf`

 fs.writeFileSync(tmpIn,await pdf.save())

 execSync(
  `gs -dPDFA=2 -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
   -sOutputFile=${tmpOut} ${tmpIn}`
 )

 const finalBuffer=fs.readFileSync(tmpOut)
 const hash=crypto.createHash('sha256').update(finalBuffer).digest('hex')

 return {buffer:finalBuffer,hash}
}



/* ===============================
   UTILIDAD ARCHIVO (DEDUP)
================================ */
async function obtenerArchivo(buffer){
 const hash=crypto.createHash('sha256').update(buffer).digest('hex')
 const dup=await db.query(
  'SELECT id,minio_key FROM archivos WHERE hash_sha256=$1',[hash]
 )
 if(dup.rowCount) return {id:dup.rows[0].id,hash}
 const key=`base/${hash}.pdf`
 await minio.putObject(process.env.MINIO_BUCKET,key,buffer)
 const r=await db.query(
  'INSERT INTO archivos(hash_sha256,size_bytes,minio_key) VALUES($1,$2,$3) RETURNING id',
  [hash,buffer.length,key]
 )
 return {id:r.rows[0].id,hash}
}

/* ===============================
   CREAR DOCUMENTO v1
================================ */
app.post('/documentos',upload.single('pdf'),async(req,res)=>{
 try{
  if(!req.file||req.file.mimetype!=='application/pdf')
   return res.status(400).send('PDF requerido')
  if(!req.body.nombre_documento)
   return res.status(400).send('Nombre requerido')

  const radicado=`RAD-${Date.now()}`
  const {id:archivoId}=await obtenerArchivo(req.file.buffer)

  const d=await db.query(
   'INSERT INTO documentos(radicado,nombre_documento,created_at) VALUES($1,$2,now()) RETURNING id',
   [radicado,req.body.nombre_documento]
  )

  await db.query(
   'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,1)',
   [d.rows[0].id,archivoId]
  )

  await insertQR(req.file.buffer,radicado,`http://localhost:3000/verificar/${radicado}`)
  res.json({radicado,version:1})
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   NUEVA VERSION
================================ */
app.post('/documentos/:radicado/version',upload.single('pdf'),async(req,res)=>{
 try{
  if(!req.file||req.file.mimetype!=='application/pdf')
   return res.status(400).send('PDF requerido')

  const doc=await db.query(
   'SELECT id FROM documentos WHERE radicado=$1',[req.params.radicado]
  )
  if(!doc.rowCount) return res.sendStatus(404)

  const v=await db.query(
   'SELECT COALESCE(MAX(version),0)+1 n FROM documento_versiones WHERE documento_id=$1',
   [doc.rows[0].id]
  )

  const {id:archivoId}=await obtenerArchivo(req.file.buffer)

  await db.query(
   'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,$3)',
   [doc.rows[0].id,archivoId,v.rows[0].n]
  )

  await insertQR(req.file.buffer,req.params.radicado,`http://localhost:3000/verificar/${req.params.radicado}`)
  res.json({radicado:req.params.radicado,version:v.rows[0].n})
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   HISTORIAL VERSIONES
================================ */
app.get('/documentos/:radicado/versiones',async(req,res)=>{
 try{
  const q=await db.query(`
   SELECT dv.version,dv.created_at,a.hash_sha256,a.minio_key,
   COUNT(*) OVER (PARTITION BY a.id)>1 reutilizado
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   JOIN archivos a ON a.id=dv.archivo_id
   WHERE d.radicado=$1
   ORDER BY dv.version
  `,[req.params.radicado])
  if(!q.rowCount) return res.sendStatus(404)
  res.json({radicado:req.params.radicado,versiones:q.rows})
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   DESCARGA VERSION ACTUAL
================================ */
app.get('/documentos/:radicado/download',async(req,res)=>{
 const q=await db.query(`
  SELECT a.minio_key
  FROM documentos d
  JOIN documento_versiones dv ON dv.documento_id=d.id
  JOIN archivos a ON a.id=dv.archivo_id
  WHERE d.radicado=$1
  ORDER BY dv.version DESC LIMIT 1
 `,[req.params.radicado])
 if(!q.rowCount) return res.sendStatus(404)
 const s=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].minio_key)
 res.setHeader('Content-Type','application/pdf')
 s.pipe(res)
})

/* ===============================
   VERIFICACION PUBLICA
================================ */
app.get('/verificar/:radicado',async(req,res)=>{
 const q=await db.query(`
  SELECT d.nombre_documento,d.radicado,d.created_at,
  dv.version,a.hash_sha256,a.minio_key
  FROM documentos d
  JOIN documento_versiones dv ON dv.documento_id=d.id
  JOIN archivos a ON a.id=dv.archivo_id
  WHERE d.radicado=$1
  ORDER BY dv.version DESC LIMIT 1
 `,[req.params.radicado])
 if(!q.rowCount) return res.json({valido:false})

 const stream=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].minio_key)
 const h=crypto.createHash('sha256')
 await new Promise((ok,fail)=>{
  stream.on('data',d=>h.update(d))
  stream.on('end',ok)
  stream.on('error',fail)
 })

 res.json({
  valido:true,
  radicado:q.rows[0].radicado,
  nombre:q.rows[0].nombre_documento,
  version:q.rows[0].version,
  integridad:h.digest('hex')===q.rows[0].hash_sha256?'OK':'ERROR'
 })
})

/* ===============================
   INGESTA MASIVA – PASO 1
================================ */
app.post('/ingesta/batch',async(req,res)=>{
 const bb=Busboy({headers:req.headers})
 const resultados=[]
 const tareas=[]
 const batchId=`ING-${Date.now()}`
 const usuarioId=1

 const u=await db.query(
  'SELECT dependencia_id FROM usuarios WHERE id=$1',[usuarioId]
 )
 const dependenciaId=u.rows[0].dependencia_id

 bb.on('file',(_,file,info)=>{   
   const nombreArchivo=Buffer .from(info.filename,'latin1') .toString('utf8')

  tareas.push(new Promise(ok=>{
   const hash=crypto.createHash('sha256')
   const tmp=`/tmp/${Date.now()}-${nombreArchivo}`
   const ws=fs.createWriteStream(tmp)
   file.on('data',d=>hash.update(d))
   file.pipe(ws)

   ws.on('close',async()=>{
   try{
   const sha256 = hash.digest('hex')
   const paginas = await getPageCount(tmp)

   // 1️⃣ PREGUNTAR PRIMERO
   const dup = await db.query(
   'SELECT 1 FROM archivos WHERE hash_sha256=$1 LIMIT 1',[sha256]
   )

   const estado = dup.rowCount ? 'DUPLICADO' : 'NUEVO'

   // 2️⃣ SOLO SI ES NUEVO, GUARDAR EN MINIO / ARCHIVOS
   if(estado === 'NUEVO'){
   await obtenerArchivo(fs.readFileSync(tmp))
   }

     await db.query(`
      INSERT INTO ingesta_documentos
      (batch_id,nombre_archivo,sha256,paginas,estado,usuario_id,dependencia_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)
     `,[batchId,nombreArchivo,sha256,paginas,estado,usuarioId,dependenciaId])

     resultados.push({archivo:nombreArchivo,sha256,paginas,estado})
    }catch(e){
     await db.query(`
      INSERT INTO ingesta_documentos
      (batch_id,nombre_archivo,estado,error,usuario_id,dependencia_id)
      VALUES($1,$2,'ERROR',$3,$4,$5)
     `,[batchId,nombreArchivo,e.message,usuarioId,dependenciaId])

     resultados.push({archivo:nombreArchivo,estado:'ERROR',error:e.message})
    }
    ok()
   })
  }))
 })

 bb.on('close',async()=>{
  await Promise.all(tareas)
  res.json({batch_id:batchId,resultados})
 })

 req.pipe(bb)
})

app.post('/ingesta/confirmar/:batch',async(req,res)=>{
 const client=await db.connect()
 try{
  await client.query('BEGIN')

  const q=await client.query(`
   SELECT *
   FROM ingesta_documentos
   WHERE batch_id=$1
   AND estado='NUEVO'
   AND tipo_documental IS NOT NULL
   AND descripcion IS NOT NULL
   FOR UPDATE
  `,[req.params.batch])

  if(!q.rowCount){
   await client.query('ROLLBACK')
   return res.status(409).send('Nada para confirmar')
  }

  const confirmados=[]

   for(const r of q.rows){

   const a=await client.query(
   'SELECT minio_key FROM archivos WHERE hash_sha256=$1',
   [r.sha256]
   )
   const stream=await minio.getObject(process.env.MINIO_BUCKET,a.rows[0].minio_key)
   const chunks=[]
   for await(const c of stream) chunks.push(c)
   const originalBuffer=Buffer.concat(chunks)

   const radicado=`RAD-${Date.now()}-${r.id}`

   const {buffer}=await prepararPdfOficial(originalBuffer,{
   radicado,
   tipo:r.tipo_documental,
   descripcion:r.descripcion
   })

   const arch=await obtenerArchivo(buffer)

   const d=await client.query(`
   INSERT INTO documentos
   (radicado,nombre_documento,usuario_id,dependencia_id,
      tipo_documental,descripcion,created_at)
   VALUES($1,$2,$3,$4,$5,$6,now())
   RETURNING id
   `,[
   radicado,
   r.nombre_archivo,
   r.usuario_id,
   r.dependencia_id,
   r.tipo_documental,
   r.descripcion
   ])

   await client.query(`
   INSERT INTO documento_versiones
   (documento_id,archivo_id,version,paginas)
   VALUES($1,$2,1,$3)
   `,[d.rows[0].id,arch.id,r.paginas])

   await client.query(
   'UPDATE ingesta_documentos SET estado=$1 WHERE id=$2',
   ['CONFIRMADO',r.id]
   )

   confirmados.push({id:r.id,radicado})
   }


  await client.query('COMMIT')
  res.json({batch:req.params.batch,confirmados})

 }catch(e){
  await client.query('ROLLBACK')
  console.error(e)
  res.status(500).send(e.message)
 }finally{
  client.release()
 }
})

/* ===============================
   LISTAR INGESTA POR BATCH (PASO 3 UI)
================================ */
app.get('/ingesta/batch/:batch',async(req,res)=>{
 try{
  const q=await db.query(`
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
   ORDER BY id
  `,[req.params.batch])

  if(!q.rowCount) return res.sendStatus(404)

  res.json(q.rows)
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   VISTA PREVIA PDF (INGESTA)
================================ */
app.get('/documentos/tmp/:id',async(req,res)=>{
 try{
  const q=await db.query(`
   SELECT sha256,estado
   FROM ingesta_documentos
   WHERE id=$1
  `,[req.params.id])

  if(!q.rowCount) return res.sendStatus(404)

  // 🔒 Regla: solo NUEVO tiene vista previa
  if(q.rows[0].estado!=='NUEVO' || !q.rows[0].sha256)
   return res.sendStatus(404)

  const a=await db.query(
   'SELECT minio_key FROM archivos WHERE hash_sha256=$1',
   [q.rows[0].sha256]
  )

  if(!a.rowCount) return res.sendStatus(404)

  const stream=await minio.getObject(
   process.env.MINIO_BUCKET,
   a.rows[0].minio_key
  )

  res.setHeader('Content-Type','application/pdf')
  res.setHeader('Content-Disposition','inline')
  stream.pipe(res)

 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   TRATAMIENTO ARCHIVÍSTICO (UI)
================================ */
app.put('/ingesta/:id',async(req,res)=>{
 try{
  const {tipo_documental,descripcion}=req.body
  if(!tipo_documental||!descripcion)
   return res.status(400).send('Datos incompletos')

  const q=await db.query(
   'SELECT * FROM ingesta_documentos WHERE id=$1 AND estado=$2',
   [req.params.id,'NUEVO']
  )
  if(!q.rowCount) return res.sendStatus(404)

  await db.query(`
   UPDATE ingesta_documentos
   SET tipo_documental=$1,
       descripcion=$2
   WHERE id=$3
  `,[tipo_documental,descripcion,req.params.id])

  res.json({ok:true})
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})


app.listen(process.env.PORT,()=>{
 console.log('API lista en puerto',process.env.PORT)
})
