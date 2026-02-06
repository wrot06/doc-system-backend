const express = require('express');
const db = require('../db');
const router = express.Router();

function auth(req, res, next) {
    // Middleware duplicated for now or should be imported if exported from index
    // Assuming this route is mounted under a parent that provides auth or we use the same verify logic
    // For simplicity, let's assume index.js mounts this protected or we add the check
    // Actually, best practice is to pass the middleware, but let's replicate or assume protection
    // To match index.js style, let's re-implement basic check or rely on index.js passing user
    // NOTE: index.js mounts it, let's assume index.js protects it or we import the middleware?
    // index.js doesn't export auth. Let's add simple extraction or require it from a common place?
    // index.js doesn't share. Let's just replicate the token extraction for now to be safe.
    // Or better, let's export auth from index or a middleware file. 
    // Given the previous code, I'll assume this router is mounted at /etiquetas and I need to handle auth.

    // UPDATE: The user didn't move auth to a separate file in the provided context.
    const jwt = require('jsonwebtoken');
    const h = req.headers.authorization;
    if (!h) return res.sendStatus(401);
    try {
        const token = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
        req.user = { id: token.uid };
        next();
    } catch (e) {
        return res.sendStatus(401);
    }
}

// LIST TAGS
router.get('/', auth, async (req, res) => {
    try {
        const q = await db.query(
            "SELECT id, nombre, acronimo FROM etiquetas_usuario WHERE usuario_id=$1 AND estado=true ORDER BY nombre",
            [req.user.id]
        );
        res.json(q.rows);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// CREATE TAG
router.post('/', auth, async (req, res) => {
    try {
        const { nombre, acronimo } = req.body;
        if (!nombre || !acronimo) return res.status(400).send('Faltan datos');

        const q = await db.query(
            "INSERT INTO etiquetas_usuario(usuario_id, nombre, acronimo) VALUES($1, $2, $3) RETURNING id, nombre, acronimo",
            [req.user.id, nombre, acronimo]
        );
        res.json(q.rows[0]);
    } catch (e) {
        console.error(e);
        if (e.code === '23505') return res.status(409).send('Ya existe etiqueta con ese acrónimo');
        res.status(500).send(e.message);
    }
});

// DELETE TAG (Soft delete)
router.delete('/:id', auth, async (req, res) => {
    try {
        await db.query(
            "UPDATE etiquetas_usuario SET estado=false WHERE id=$1 AND usuario_id=$2",
            [req.params.id, req.user.id]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

module.exports = router;
