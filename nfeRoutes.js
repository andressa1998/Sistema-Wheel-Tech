const express = require('express');
const {
    emitirNFe,
    cancelarNFe,
    listarNFesEmitidas,
    listarTransportadoras,
    cadastrarTransportadora,
    emitirNFEAvulsa,
    consultarStatusNFE,
    sincronizarVendasML,
    listarVendasSemNFE,
    listarVendasComNFE,
    buscarXMLPorChave,
    cadastrarCliente,
    buscarClientePorId,
    atualizarCliente,
    testarEnvioXMLFixo,
    testarXmlRaw,
    testarEventoRaw,
    listarClientes   
} = require('./nfeController');

const router = express.Router();

// ===================== ROTAS PRINCIPAIS =====================
router.post('/emitir', emitirNFe);
router.post('/cancelar', cancelarNFe);
router.get('/listar-nfes', listarNFesEmitidas);
router.get('/transportadoras', listarTransportadoras);
router.post('/transportadoras', cadastrarTransportadora);
router.get('/clientes', listarClientes);
router.post('/clientes', cadastrarCliente);
router.get('/clientes/:id', buscarClientePorId);
router.put('/clientes/:id', atualizarCliente);
router.post('/emitir-avulsa', emitirNFEAvulsa);
router.post('/consultar-status', consultarStatusNFE);
router.post('/sync-vendas', sincronizarVendasML);
router.get('/vendas-sem-nfe', listarVendasSemNFE);
router.get('/vendas-com-nfe', listarVendasComNFE);
router.get('/buscar-xml', buscarXMLPorChave);


// ===================== ROTAS DE TESTE =====================
router.post('/testar-xml-fixo', testarEnvioXMLFixo);   // envia um XML pré-definido que já funcionou
router.post('/testar-xml-raw', testarXmlRaw); 
router.post('/testar-evento-raw', testarEventoRaw);         // recebe qualquer XML via body e envia para SEFAZ

module.exports = router;