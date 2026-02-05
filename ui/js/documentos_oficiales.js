// Esperar a que common.js cargue el usuario
window.addEventListener('user-loaded', (e) => {
  const user = e.detail;

  // Solo permitir acceso a usuarios con rol 'admin'
  if (user.rol !== 'admin') {
    alert('Acceso denegado. Solo administradores pueden ver esta página.');
    location.href = 'app.html';
    return;
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';

  cargarDocumentos();
});

function cargarDocumentos() {
  const token = localStorage.getItem('token');

  fetch('/documentos', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => {
      if (r.status === 401) location.href = 'login.html';
      return r.json();
    })
    .then(data => {
      const tbody = document.querySelector('#tabla tbody');
      tbody.innerHTML = '';
      data.forEach(d => {
        tbody.innerHTML += `
<tr>
<td>${d.radicado}</td>
<td>${d.nombre_documento}</td>
<td>${d.tipo_documental || ''}</td>
<td>${d.version}</td>
<td>${d.paginas || 0}</td>
<td>${new Date(d.created_at).toLocaleString()}</td>
<td>
 <a href="/documentos/${d.radicado}/download" target="_blank">PDF</a>
 <button onclick="eliminarDocumento('${d.radicado}')" class="btn-eliminar">Eliminar</button>
</td>
</tr>`;
      });
    });
}

function eliminarDocumento(radicado) {
  if (!confirm(`¿Estás seguro de eliminar el documento ${radicado}?\n\nEsta acción es IRREVERSIBLE y eliminará el documento y todos sus archivos.`)) {
    return;
  }

  const token = localStorage.getItem('token');

  fetch(`/documentos/${radicado}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        alert(res.message);
        cargarDocumentos(); // Recargar la tabla
      } else {
        alert('Error: ' + (res.error || 'No se pudo eliminar'));
      }
    })
    .catch(() => alert('Error al eliminar el documento'));
}
