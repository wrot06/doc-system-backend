import {Router} from 'express'
import {actualizarTratamiento} from '../controllers/ingesta.controller.js'

const router=Router()
router.put('/ingesta/:id',actualizarTratamiento)
export default router
