const db=require("../db");

exports.listarDocumentosOficiales=async(req,res)=>{
  const { id, dependencia_id }=req.user;

  const q=`
    SELECT id,nombre_archivo,paginas,fecha_creacion
    FROM documentos
    WHERE estado='OFICIAL'
      AND usuario_id=$1
      AND dependencia_productora_id=$2
    ORDER BY fecha_creacion DESC
  `;

  const r=await db.query(q,[id,dependencia_id]);
  res.json(r.rows);
};
