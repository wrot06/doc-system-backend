const Minio=require('minio')

module.exports=new Minio.Client({
 endPoint:process.env.MINIO_ENDPOINT || "127.0.0.1",
 port:Number(process.env.MINIO_PORT || 9000),
 useSSL:false,
 accessKey:process.env.MINIO_ACCESS_KEY,
 secretKey:process.env.MINIO_SECRET_KEY,
 region:"us-east-1"
})