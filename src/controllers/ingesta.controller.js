// src/controllers/ingesta.controller.js
import fs from 'fs'
import path from 'path'
import {PDFDocument} from 'pdf-lib'
import crypto from 'crypto'
import db from '../db.js'

export async function actualizarTratamiento(req,res){
 const {id}=req.params
 const {tipo_documental,descripcion}=req.body
 if(!tipo_documental||!descripcion)
  return res.status(400).json({error:'Datos incompletos'})

 const doc=await db.query(
  `SELECT * FROM documentos WHERE id=$1 AND estado='NUEVO'`,
  [id]
 )
 if(!doc.rows.length)
  return res.status(404).json({error:'Documento no editable'})

 const d=doc.rows[0]
 const pdfPath=d.ruta_archivo

 // cargar PDF existente
 const pdfBytes=fs.readFileSync(pdfPath)
 const pdf=await PDFDocument.load(pdfBytes)

 // METADATOS ARCHIVÍSTICOS
 pdf.setTitle(d.nombre_archivo)
 pdf.setSubject(descripcion)
 pdf.setKeywords([tipo_documental,'SGA'])
 pdf.setProducer('Sistema de Gestión Archivista')
 pdf.setCreator('SGA')

 const out=await pdf.save()

 // hash nuevo (versionado)
 const hash=crypto.createHash('sha256').update(out).digest('hex')

 // ruta nueva versión
 const version=d.version+1
 const nuevaRuta=pdfPath.replace('.pdf',`_v${version}.pdf`)
 fs.writeFileSync(nuevaRuta,out)

 // BD: insertar versión
 await db.query(
  `INSERT INTO documentos_versiones
   (documento_id,version,sha256,ruta_archivo)
   VALUES ($1,$2,$3,$4)`,
  [id,version,hash,nuevaRuta]
 )

 // BD: actualizar documento
 await db.query(
  `UPDATE documentos
   SET tipo_documental=$1,
       descripcion=$2,
       version=$3,
       sha256=$4,
       ruta_archivo=$5,
       estado='TRATADO'
   WHERE id=$6`,
  [tipo_documental,descripcion,version,hash,nuevaRuta,id]
 )

 res.json({ok:true,version})
}
