import {Router} from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import {optimizeToPDFA} from "../services/pdf.service.js";
import {minio} from "../utils/minio.js";

const r=Router();
const upload=multer({dest:"tmp"});

r.post("/",upload.single("pdf"),async(req,res)=>{
 const input=req.file.path;
 const out=`tmp/${Date.now()}.pdf`;
 try{
  await optimizeToPDFA(input,out);
  await minio.fPutObject("documentos",path.basename(out),out);
  fs.unlinkSync(input);fs.unlinkSync(out);
  res.json({ok:true});
 }catch(e){
  res.status(500).json({error:"PDF no procesable"});
 }
});

export default r;