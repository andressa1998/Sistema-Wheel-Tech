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
    listarClientes,
    verificarVendedorML
} = require('./nfeController');


const router =
    express.Router();


// ===================== ROTAS PRINCIPAIS =====================

router.post(
    '/emitir',
    emitirNFe
);

router.post(
    '/cancelar',
    cancelarNFe
);

router.get(
    '/listar-nfes',
    listarNFesEmitidas
);

router.get(
    '/transportadoras',
    listarTransportadoras
);

router.post(
    '/transportadoras',
    cadastrarTransportadora
);

router.get(
    '/clientes',
    listarClientes
);

router.post(
    '/clientes',
    cadastrarCliente
);

router.get(
    '/clientes/:id',
    buscarClientePorId
);

router.put(
    '/clientes/:id',
    atualizarCliente
);

router.post(
    '/emitir-avulsa',
    emitirNFEAvulsa
);

router.post(
    '/consultar-status',
    consultarStatusNFE
);

router.post(
    '/sync-vendas',
    sincronizarVendasML
);

router.get(
    '/vendas-sem-nfe',
    listarVendasSemNFE
);

router.get(
    '/vendas-com-nfe',
    listarVendasComNFE
);

router.get(
    '/buscar-xml',
    buscarXMLPorChave
);


// =========================================================
// VERIFICAR SE CLIENTE POSSUI ANÚNCIOS PÚBLICOS
// =========================================================

router.get(
    '/verificar-vendedor-ml',
    verificarVendedorML
);


// ===================== ROTAS DE TESTE =====================

router.post(
    '/testar-xml-fixo',
    testarEnvioXMLFixo
);

router.post(
    '/testar-xml-raw',
    testarXmlRaw
);

router.post(
    '/testar-evento-raw',
    testarEventoRaw
);


module.exports = router;