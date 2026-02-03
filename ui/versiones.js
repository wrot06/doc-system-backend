async function cargar(){
 const radicado=document.getElementById('radicado').value.trim()
 if(!radicado)return alert('Ingrese un radicado')

 const res=await fetch(`http://localhost:3000/documentos/${radicado}/versiones`)
 if(!res.ok)return alert('Radicado no encontrado')

 const data=await res.json()
 const tbody=document.getElementById('tabla')
 tbody.innerHTML=''

 data.versiones.forEach(v=>{
  const tr=document.createElement('tr')

  tr.innerHTML=`
   <td>${v.version}</td>
   <td>${new Date(v.fecha).toLocaleString()}</td>
   <td style="font-family:monospace">${v.hash}</td>
   <td class="${v.archivo_reutilizado?'yes':'no'}">
    ${v.archivo_reutilizado?'SI':'NO'}
   </td>
   <td style="font-family:monospace">${v.objeto_fisico}</td>
  `
  tbody.appendChild(tr)
 })
}