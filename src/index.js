require('dotenv').config()
const express=require('express')
const multer=require('multer')
const crypto=require('crypto')
const db=require('./db')
const minio=require('./minio')

const app=express()

app.use(express.json())
app.use(express.urlencoded({extended:true}))

const upload=multer()

app.post('/documentos',upload.single('pdf'),async(req,res)=>{
 try{
  if(!req.file) return res.status(400).send('PDF requerido')
  if(req.file.mimetype!=='application/pdf')
   return res.status(400).send('Archivo no es PDF')

  const nombre=req.body.nombre_documento
  if(!nombre||!nombre.trim())
   return res.status(400).send('Nombre del documento requerido')

  const hash=crypto.createHash('sha256').update(req.file.buffer).digest('hex')
  const radicado=`RAD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Date.now()}`
  const path=`${radicado}/v1.pdf`

  await minio.putObject(process.env.MINIO_BUCKET,path,req.file.buffer)

  const doc=await db.query(
   'INSERT INTO documentos(radicado,nombre,version_actual) VALUES($1,$2,1) RETURNING id',
   [radicado,nombre]
  )

  await db.query(
   'INSERT INTO documento_versiones(documento_id,version,hash,storage_path,peso) VALUES($1,1,$2,$3,$4)',
   [doc.rows[0].id,hash,path,req.file.size]
  )

  res.json({radicado})
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})

app.listen(process.env.PORT,()=>{
 console.log('API lista en puerto',process.env.PORT)
})


app.post('/documentos/:radicado/version',upload.single('pdf'),async(req,res)=>{
 try{
  if(!req.file) return res.status(400).send('PDF requerido')
  if(req.file.mimetype!=='application/pdf')
   return res.status(400).send('Archivo no es PDF')

  const {radicado}=req.params

  const docRes=await db.query(
   'SELECT id,version_actual FROM documentos WHERE radicado=$1',
   [radicado]
  )
  if(!docRes.rowCount) return res.status(404).send('Documento no existe')

  const documentoId=docRes.rows[0].id
  const nuevaVersion=docRes.rows[0].version_actual+1
  const path=`${radicado}/v${nuevaVersion}.pdf`

  const hash=crypto.createHash('sha256').update(req.file.buffer).digest('hex')

  await minio.putObject(process.env.MINIO_BUCKET,path,req.file.buffer)

  await db.query(
   'UPDATE documento_versiones SET es_actual=false WHERE documento_id=$1',
   [documentoId]
  )

  await db.query(
   'INSERT INTO documento_versiones(documento_id,version,hash,storage_path,peso,es_actual) VALUES($1,$2,$3,$4,$5,true)',
   [documentoId,nuevaVersion,hash,path,req.file.size]
  )

  await db.query(
   'UPDATE documentos SET version_actual=$1 WHERE id=$2',
   [nuevaVersion,documentoId]
  )

  res.json({radicado,version:nuevaVersion})
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})

app.get('/documentos/:radicado/download',async(req,res)=>{
 try{
  const {radicado}=req.params

  const q=await db.query(`
   SELECT dv.storage_path
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   WHERE d.radicado=$1 AND dv.es_actual=true
  `,[radicado])

  if(!q.rowCount) return res.status(404).send('Documento no encontrado')

  const stream=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].storage_path)
  res.setHeader('Content-Type','application/pdf')
  stream.pipe(res)
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})

app.get('/documentos/:radicado/version/:version/download',async(req,res)=>{
 try{
  const {radicado,version}=req.params

  const q=await db.query(`
   SELECT dv.storage_path
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   WHERE d.radicado=$1 AND dv.version=$2
  `,[radicado,version])

  if(!q.rowCount) return res.status(404).send('Versión no encontrada')

  const stream=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].storage_path)
  res.setHeader('Content-Type','application/pdf')
  stream.pipe(res)
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})


app.post('/documentos/:radicado/link',async(req,res)=>{
 try{
  const {radicado}=req.params
  const horas=Number(req.body?.horas)||24


  const q=await db.query(`
   SELECT d.id,dv.version,dv.storage_path,dv.hash
   FROM documentos d
   JOIN documento_versiones dv ON dv.documento_id=d.id
   WHERE d.radicado=$1 AND dv.es_actual=true
  `,[radicado])

  if(!q.rowCount) return res.status(404).send('Documento no encontrado')

  const token=crypto.randomBytes(32).toString('hex')
  const expires=new Date(Date.now()+horas*3600*1000)

  await db.query(
   'INSERT INTO documento_links(documento_id,version,token,expires_at,hash) VALUES($1,$2,$3,$4,$5)',
   [q.rows[0].id,q.rows[0].version,token,expires,q.rows[0].hash]
  )

  res.json({
   link:`http://localhost:3000/public/${token}`,
   expires_at:expires
  })
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})

app.get('/public/:token',async(req,res)=>{
 try{
  const {token}=req.params

  const q=await db.query(`
   SELECT dl.expires_at,dl.hash,dv.storage_path
   FROM documento_links dl
   JOIN documento_versiones dv
     ON dv.documento_id=dl.documento_id AND dv.version=dl.version
   WHERE dl.token=$1
  `,[token])

  if(!q.rowCount) return res.status(404).send('Link inválido')
  if(new Date(q.rows[0].expires_at)<new Date())
   return res.status(410).send('Link expirado')

  const stream=await minio.getObject(process.env.MINIO_BUCKET,q.rows[0].storage_path)
  const hasher=crypto.createHash('sha256')

  res.setHeader('Content-Type','application/pdf')

  stream.on('data',d=>hasher.update(d))
  stream.on('end',()=>{
   if(hasher.digest('hex')!==q.rows[0].hash)
    res.destroy(new Error('Integridad comprometida'))
  })

  stream.pipe(res)
 }catch(e){
  console.error(e)
  res.status(500).send('Error interno')
 }
})
