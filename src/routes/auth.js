const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')

const router = express.Router()

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password)
            return res.status(400).json({ error: 'Datos incompletos' })

        const q = await db.query(`
    SELECT
     u.id,
     u.username,
     u.password_hash,
     u.rol,
     u.activo,
     d.id AS dependencia_id,
     d.estado
    FROM usuarios u
    LEFT JOIN dependencias d ON d.id=u.dependencia_id
    WHERE LOWER(u.username)=LOWER($1)
   `, [username])

        if (!q.rowCount)
            return res.status(401).json({ error: 'Credenciales inválidas' })

        const u = q.rows[0]

        // Regla de Acceso: Root siempre entra. Otros requieren oficina.
        if (u.rol === 'root') {
            if (!u.activo) return res.status(403).json({ error: 'Usuario inactivo' })
        } else {
            if (!u.dependencia_id) return res.status(403).json({ error: 'Usuario sin oficina asignada' })
            if (!u.activo || !u.estado) return res.status(403).json({ error: 'Usuario o dependencia inactiva' })
        }

        const ok = await bcrypt.compare(password, u.password_hash)
        if (!ok)
            return res.status(401).json({ error: 'Credenciales inválidas' })

        const token = jwt.sign({
            uid: u.id,
            dependencia_id: u.dependencia_id,
            rol: u.rol
        }, process.env.JWT_SECRET, { expiresIn: '8h' })

        res.json({ token })

    } catch (e) {
        console.error(e)
        res.status(500).json({ error: 'Error interno' })
    }
})

module.exports = router
