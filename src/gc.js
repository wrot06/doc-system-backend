require('dotenv').config()
const {Client}=require('minio')
const db=require('./db')

const minio=new Client({
 endPoint:process.env.MINIO_ENDPOINT,
 port:+process.env.MINIO_PORT,
 useSSL:false,
 accessKey:process.env.MINIO_ACCESS,
 secretKey:process.env.MINIO_SECRET
})

async function runGC(){
 // 1. paths usados en BD
 const q=await db.query(
  'SELECT DISTINCT storage_path FROM documento_versiones'
 )
 const used=new Set(q.rows.map(r=>r.storage_path))

 // 2. listar objetos en MinIO
 const objects=[]
 const stream=minio.listObjectsV2(process.env.MINIO_BUCKET,'',true)
 for await (const obj of stream) objects.push(obj.name)

 // 3. borrar huérfanos
 for(const name of objects){
  if(!used.has(name)){
   await minio.removeObject(process.env.MINIO_BUCKET,name)
   console.log('BORRADO:',name)
  }
 }
 console.log('GC terminado')
 process.exit(0)
}

runGC().catch(e=>{
 console.error(e)
 process.exit(1)
})