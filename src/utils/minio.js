import {Client} from "minio";
export const minio=new Client({
 endPoint:"localhost",
 port:9000,
 useSSL:false,
 accessKey:process.env.MINIO_KEY,
 secretKey:process.env.MINIO_SECRET
});