require('dotenv').config()
const express=require('express')
const multer=require('multer')
const crypto=require('crypto')
const db=require('./db')
const minio=require('./minio')

const app=express()
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

