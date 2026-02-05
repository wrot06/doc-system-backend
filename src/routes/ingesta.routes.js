import { Router } from 'express'
import db from '../db.js'
import minioClient from '../minio.js'

const router = Router()

router.get('/ingesta/batch/:batch', async (req,res)=>{
  const {batch}=req.params
  const result=await db.query(
    `SELECT id,nombre_archivo,estado,sha256,paginas,tipo_documental,descripcion
     FROM documentos
     WHERE batch_id=$1
     AND estado='NUEVO'
     AND es_oficial=FALSE
     ORDER BY id`,
    [batch]
  )
  res.json(result.rows)
})

router.delete('/batches/:batchId', async (req,res)=>{
  const {batchId}=req.params
  try{
    const docs=await db.query(
      `SELECT nombre_archivo FROM documentos WHERE batch_id=$1`,
      [batchId]
    )

    for(const d of docs.rows){
      try{
        await minioClient.removeObject(
          process.env.MINIO_BUCKET,
          d.nombre_archivo
        )
      }catch(e){
        console.warn('No existe en bucket:',d.nombre_archivo)
      }
    }

    await db.query(`DELETE FROM documentos WHERE batch_id=$1`,[batchId])
    await db.query(`DELETE FROM batches WHERE id=$1`,[batchId])

    res.json({message:'Batch eliminado correctamente'})
  }catch(e){
    console.error('ERROR ELIMINANDO BATCH:',e)
    res.status(500).json({error:e.message})
  }
})

export default router
