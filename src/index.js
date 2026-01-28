require('dotenv').config()
const express=require('express')
const multer=require('multer')
const crypto=require('crypto')
const path=require('path')

const db=require('./db')
const minio=require('./minio')
const {insertQR}=require('./qr')

const app=express()
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static(path.join(__dirname,'../ui')))

const upload=multer()

/* ===============================
   CREAR DOCUMENTO v1
================================ */
app.post('/documentos',upload.single('pdf'),async(req,res)=>{
 try{
  if(!req.file||req.file.mimetype!=='application/pdf')
   return res.status(400).send('PDF requerido')

  const nombre=req.body.nombre_documento
  if(!nombre) return res.status(400).send('Nombre requerido')

  const radicado=`RAD-${Date.now()}`
  const buffer=req.file.buffer
  const hash=crypto.createHash('sha256').update(buffer).digest('hex')

  let archivoId,minioKey

  const dup=await db.query(
   'SELECT id,minio_key FROM archivos WHERE hash_sha256=$1',
   [hash]
  )

  if(dup.rowCount){
   archivoId=dup.rows[0].id
   minioKey=dup.rows[0].minio_key
  }else{
   minioKey=`base/${hash}.pdf`
   await minio.putObject(process.env.MINIO_BUCKET,minioKey,buffer)

   const a=await db.query(
    'INSERT INTO archivos(hash_sha256,size_bytes,minio_key) VALUES($1,$2,$3) RETURNING id',
    [hash,buffer.length,minioKey]
   )
   archivoId=a.rows[0].id
  }

  const d=await db.query(
   'INSERT INTO documentos(radicado,nombre_documento,created_at) VALUES($1,$2,now()) RETURNING id',
   [radicado,nombre]
  )

  await db.query(
   'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,1)',
   [d.rows[0].id,archivoId]
  )

  await insertQR(buffer,radicado,`http://localhost:3000/verificar/${radicado}`)

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

  const {radicado}=req.params

  const doc=await db.query(
   'SELECT id FROM documentos WHERE radicado=$1',
   [radicado]
  )
  if(!doc.rowCount) return res.status(404).send('No existe')

  const documentoId=doc.rows[0].id

  const v=await db.query(
   'SELECT COALESCE(MAX(version),0)+1 n FROM documento_versiones WHERE documento_id=$1',
   [documentoId]
  )
  const version=v.rows[0].n

  const buffer=req.file.buffer
  const hash=crypto.createHash('sha256').update(buffer).digest('hex')

  let archivoId,minioKey

  const dup=await db.query(
   'SELECT id,minio_key FROM archivos WHERE hash_sha256=$1',
   [hash]
  )

  if(dup.rowCount){
   archivoId=dup.rows[0].id
   minioKey=dup.rows[0].minio_key
  }else{
   minioKey=`base/${hash}.pdf`
   await minio.putObject(process.env.MINIO_BUCKET,minioKey,buffer)

   const a=await db.query(
    'INSERT INTO archivos(hash_sha256,size_bytes,minio_key) VALUES($1,$2,$3) RETURNING id',
    [hash,buffer.length,minioKey]
   )
   archivoId=a.rows[0].id
  }

  await db.query(
   'INSERT INTO documento_versiones(documento_id,archivo_id,version) VALUES($1,$2,$3)',
   [documentoId,archivoId,version]
  )

  await insertQR(buffer,radicado,`http://localhost:3000/verificar/${radicado}`)

  res.json({radicado,version})
 }catch(e){
  console.error(e)
  res.status(500).send(e.message)
 }
})

/* ===============================
   HISTORIAL DE VERSIONES  ✅ NUEVO
================================ */
app.get('/documentos/:radicado/versiones',async(req,res)=>{
 try{
  const {radicado}=req.params

  const q=await db.query(`
   SELECT
   dv.version,
   dv.created_at,
   a.hash_sha256,
   a.minio_key,
   COUNT(*) OVER (PARTITION BY a.id) > 1 AS archivo_reutilizado
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   JOIN archivos a ON a.id=dv.archivo_id
   WHERE d.radicado=$1
   ORDER BY dv.version ASC
  `,[radicado])

  if(!q.rowCount) return res.sendStatus(404)

  res.json({
   radicado,
      versiones:q.rows.map(v=>({
      version:v.version,
      fecha:v.created_at,
      hash:v.hash_sha256,
      archivo_reutilizado:v.archivo_reutilizado,
      objeto_fisico:v.minio_key
      }))
  })
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
  ORDER BY dv.version DESC
  LIMIT 1
 `,[req.params.radicado])

 if(!q.rowCount) return res.sendStatus(404)

 const s=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].minio_key)
 res.setHeader("Content-Type","application/pdf")
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
  ORDER BY dv.version DESC
  LIMIT 1
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
  integridad:h.digest('hex')===q.rows[0].hash_sha256?'OK':'ERROR',
  descarga:`/documentos/${q.rows[0].radicado}/download`
 })
})

app.listen(process.env.PORT,()=>{
 console.log('API lista en puerto',process.env.PORT)
})

app.use('/ui',require('express').static('ui'))