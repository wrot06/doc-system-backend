const API="http://localhost:3000";

async function createDoc(){
 const f=document.getElementById("file").files[0];
 const t=document.getElementById("title").value;
 if(!f||!t)return alert("faltan datos");
 const fd=new FormData();
 fd.append("pdf",f);
 fd.append("nombre_documento",t);
 const r=await fetch(API+"/documentos",{method:"POST",body:fd});
 document.getElementById("out1").textContent=await r.text();
}

async function uploadVersion(){
 const f=document.getElementById("filev").files[0];
 const r=document.getElementById("radicado").value;
 if(!f||!r)return alert("faltan datos");
 const fd=new FormData();
 fd.append("pdf",f);
 const res=await fetch(API+"/documentos/"+r+"/version",{method:"POST",body:fd});
 document.getElementById("out2").textContent=await res.text();
}

async function getDoc(){
 const r=document.getElementById("radicadoQ").value;
 const res=await fetch(API+"/verificar/"+r);
 document.getElementById("out3").textContent=await res.text();
}

function verify(){
 const r=document.getElementById("radicadoV").value;
 if(!r)return alert("radicado requerido");
 document.getElementById("pdfFrame").src=API+"/documentos/"+r+"/download";
}