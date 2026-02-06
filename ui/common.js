
(function () {
    const token = localStorage.getItem('token');
    if (!token) {
        location.href = 'login.html';
        return;
    }

    // Expose logout globally
    window.logout = function () {
        localStorage.removeItem('token');
        location.href = 'login.html';
    };

    fetch('/me', {
        headers: {
            Authorization: 'Bearer ' + token
        }
    })
        .then(r => {
            if (!r.ok) throw 0;
            return r.json();
        })
        .then(u => {
            // Inject header
            const header = document.createElement('div');
            header.id = 'global-header';
            header.innerHTML = `
                <span>Usuario: <b>${u.nombre}</b></span>
                <span>Dependencia: <b>${u.nombre_dependencia || 'General (Root)'}</b></span>
                <button onclick="location.href='app.html'" class="small-btn">Inicio</button>
                <button onclick="location.href='documentos.html'" class="small-btn">Documentos</button>
                ${u.rol === 'admin' ? `<button onclick="location.href='documentos_oficiales.html'" class="small-btn">Eliminar</button>` : ''}
                ${u.rol === 'root' ? `<button onclick="location.href='usuarios.html'" class="small-btn">Usuarios</button>` : ''}
                <button onclick="logout()" class="small-btn">Cerrar sesión</button>
            `;
            document.body.prepend(header);

            // Dispatch event for pages that need user info
            window.dispatchEvent(new CustomEvent('user-loaded', { detail: u }));
        })
        .catch(() => {
            localStorage.removeItem('token');
            location.href = 'login.html';
        });
})();
