const express=require("express");
const router=express.Router();
const { listarDocumentosOficiales }=require("../controllers/documentosOficiales.controller");
const auth=require("../services/auth"); // o donde esté

router.get("/oficiales",auth,listarDocumentosOficiales);

module.exports=router;
