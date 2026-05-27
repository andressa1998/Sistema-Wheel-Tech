// nfeRoutes.js
const express = require('express');
const { emitirNFe, cancelarNFe, listarNotas } = require('./nfeController');

const router = express.Router();

console.log('✅ nfeRoutes.js carregado com sucesso!');

router.post('/emitir', emitirNFe);
router.post('/cancelar', cancelarNFe);
router.get('/listar', listarNotas);

module.exports = router;