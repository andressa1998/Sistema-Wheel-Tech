const express = require('express');

const router = express.Router();

const { emitirNFe } = require('./nfeController');

console.log('✅ nfeRoutes.js carregado com sucesso!');

router.post('/emitir', emitirNFe);

module.exports = router;