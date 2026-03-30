const express = require('express');
const router = express.Router();
const { emitirNFe } = require('./nfeController');
const { listarNFe } = require('./nfeListController');

router.post('/emitir', emitirNFe);
router.get('/listar', listarNFe);

module.exports = router;
