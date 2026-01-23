const Minio=require('minio')
module.exports=new Minio.Client({
 endPoint:process.env.MINIO_ENDPOINT,
 port:+process.env.MINIO_PORT,
 useSSL:false,
 accessKey:process.env.MINIO_ACCESS,
 secretKey:process.env.MINIO_SECRET
})
