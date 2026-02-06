(function () {
    let dependencias = []; // Offices
    let sedes = []; // Sedes
    let campus = []; // Campus

    window.addEventListener('user-loaded', async (e) => {
        const u = e.detail;
        if (u.rol !== 'root') {
            alert('Acceso denegado. Solo root.');
            location.href = 'app.html';
            return;
        }

        await Promise.all([cargarCampus(), cargarSedes(), cargarDependencias()]);
        await cargarUsuarios();
    });

    async function cargarCampus() {
        try {
            const res = await fetch('/usuarios/campus', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (!res.ok) throw new Error('Error cargando campus');
            campus = await res.json();
        } catch (e) { console.error(e); }
    }

    async function cargarSedes() {
        try {
            const res = await fetch('/usuarios/sedes', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (!res.ok) throw new Error('Error cargando sedes');
            sedes = await res.json();
        } catch (e) {
            console.error(e);
            alert('Error al cargar lista de sedes');
        }
    }

    async function cargarDependencias() {
        try {
            const res = await fetch('/usuarios/dependencias', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (!res.ok) throw new Error('Error cargando dependencias');
            dependencias = await res.json();
        } catch (e) {
            console.error(e);
            alert('Error al cargar lista de oficinas');
        }
    }

    async function cargarUsuarios() {
        try {
            const res = await fetch('/usuarios', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            if (!res.ok) throw new Error('Error cargando usuarios');
            const usuarios = await res.json();
            renderTable(usuarios);
        } catch (e) {
            console.error(e);
            alert('Error al cargar usuarios');
        }
    }

    function renderTable(usuarios) {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        const currentUser = JSON.parse(atob(localStorage.getItem('token').split('.')[1]));

        usuarios.forEach(user => {
            const tr = document.createElement('tr');

            // Build Dependencia Dropdown
            let options = `<option value="">-- Sin Asignar --</option>`;
            dependencias.forEach(dep => {
                const selected = user.dependencia_id === dep.id ? 'selected' : '';
                options += `<option value="${dep.id}" ${selected}>${dep.nombre} (${dep.acronimo})</option>`;
            });

            // Rol Dropdown (disabled for self)
            const isSelf = user.id === currentUser.uid;
            const roles = ['consulta', 'operador', 'admin'];
            let roleOptions = '';
            roles.forEach(r => {
                const sel = user.rol === r ? 'selected' : '';
                roleOptions += `<option value="${r}" ${sel}>${r}</option>`;
            });
            const roleSelect = `<select onchange="cambiarRol(${user.id}, this.value)" ${isSelf ? 'disabled' : ''}>${roleOptions}</select>`;

            // Active Toggle
            const activeBtn = `<button onclick="toggleActivo(${user.id}, ${!user.activo})" style="color:${user.activo ? 'green' : 'red'}">${user.activo ? 'Activo' : 'Inactivo'}</button>`;

            const selectId = `dep-select-${user.id}`;

            tr.innerHTML = `
                <td style="padding:8px; border:1px solid #ccc;">${user.id}</td>
                <td style="padding:8px; border:1px solid #ccc;">${user.username}</td>
                <td style="padding:8px; border:1px solid #ccc;">${user.nombre}</td>
                <td style="padding:8px; border:1px solid #ccc;">${roleSelect}</td>
                <td style="padding:8px; border:1px solid #ccc;">${activeBtn}</td>
                <td style="padding:8px; border:1px solid #ccc;">${user.nombre_dependencia || '<span style="color:red">Sin Asignar</span>'}</td>
                <td style="padding:8px; border:1px solid #ccc;">
                    <select id="${selectId}" style="width:100%">
                        ${options}
                    </select>
                </td>
                <td style="padding:8px; border:1px solid #ccc;">
                    <button onclick="guardarUsuario(${user.id})">Guardar Oficina</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.toggleActivo = async function (id, nuevoEstado) {
        if (!confirm(`¿Marcar usuario como ${nuevoEstado ? 'ACTIVO' : 'INACTIVO'}?`)) return;
        try {
            await fetch(`/usuarios/${id}/activo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ activo: nuevoEstado })
            });
            cargarUsuarios();
        } catch (e) { alert(e.message) }
    };

    window.cambiarRol = async function (id, nuevoRol) {
        if (!confirm(`¿Cambiar rol a ${nuevoRol}?`)) { cargarUsuarios(); return; }
        try {
            const res = await fetch(`/usuarios/${id}/rol`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({ rol: nuevoRol })
            });
            if (!res.ok) {
                const d = await res.json();
                alert(d.error);
                cargarUsuarios();
            }
        } catch (e) { alert(e.message); cargarUsuarios(); }
    };

    window.guardarUsuario = async function (id) {
        const select = document.getElementById(`dep-select-${id}`);
        const dependencia_id = select.value;

        if (!confirm('¿Confirmar asignación de oficina?')) return;

        try {
            const res = await fetch(`/usuarios/${id}/dependencia`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ dependencia_id: dependencia_id || null })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al guardar');
            }

            alert('Asignación actualizada correctamente');
            cargarUsuarios();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };

    // Modal Helpers
    window.mostrarModalUsuario = () => {
        document.getElementById('modal-usuario').style.display = 'block';
        const s = document.getElementById('new-dep');
        s.innerHTML = '<option value="">-- Sin Oficina (Solo Root) --</option>';
        dependencias.forEach(d => s.innerHTML += `<option value="${d.id}">${d.nombre}</option>`);
    };

    window.mostrarModalOficina = () => {
        document.getElementById('modal-oficina').style.display = 'block';

        // Populate Campus
        const sCampus = document.getElementById('new-off-campus');
        sCampus.innerHTML = '<option value="">-- Seleccionar Extensión/Ciudad --</option>';
        campus.forEach(c => sCampus.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);

        // Reset Sede
        const sSede = document.getElementById('new-off-sede');
        sSede.innerHTML = '<option value="">-- Seleccionar Sede --</option>';
        sSede.disabled = true;

        // Populate Parent Options (All Offices)
        const sParent = document.getElementById('new-off-parent');
        sParent.innerHTML = '<option value="">-- Seleccionar Oficina Superior --</option>';
        dependencias.forEach(d => {
            sParent.innerHTML += `<option value="${d.id}">${d.nombre} (${d.acronimo})</option>`;
        });
    };

    window.filtrarSedesPorCampus = () => {
        const campusId = parseInt(document.getElementById('new-off-campus').value);
        const sSede = document.getElementById('new-off-sede');
        sSede.innerHTML = '<option value="">-- Seleccionar Sede --</option>';

        if (!campusId) {
            sSede.disabled = true;
            return;
        }
        sSede.disabled = false;

        const sedesFiltradas = sedes.filter(s => s.campus_id === campusId);
        sedesFiltradas.forEach(s => {
            sSede.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
        });
    };

    window.crearUsuario = async () => {
        const body = {
            username: document.getElementById('new-user').value,
            password: document.getElementById('new-pass').value,
            nombre: document.getElementById('new-name').value,
            rol: document.getElementById('new-rol').value,
            dependencia_id: document.getElementById('new-dep').value
        };
        try {
            const r = await fetch('/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(body)
            });
            if (r.ok) { alert('Usuario creado'); location.reload(); }
            else { const e = await r.json(); alert(e.error); }
        } catch (e) { alert(e.message) }
    };

    window.crearOficina = async () => {
        const sede = document.getElementById('new-off-sede').value;
        const parent = document.getElementById('new-off-parent').value;

        if (!sede || !parent) {
            alert('Debes seleccionar tanto la Sede como la Oficina Superior');
            return;
        }

        const body = {
            nombre: document.getElementById('new-off-name').value,
            acronimo: document.getElementById('new-off-acr').value,
            descripcion: document.getElementById('new-off-desc').value,
            parent_id: parent,
            sede_id: sede
        };
        try {
            const r = await fetch('/usuarios/dependencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(body)
            });
            if (r.ok) { alert('Oficina creada'); location.reload(); }
            else { const e = await r.json(); alert(e.error); }
        } catch (e) { alert(e.message) }
    };

    // Removed broken filtering function if not needed, kept filtering by campus
})();

