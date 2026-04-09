const { create } = require('xmlbuilder2');
const moment = require('moment-timezone');

const EMITENTE = {
    CNPJ: '32830261000125',
    xNome: 'WHEEL TECH BICYCLING LTDA',
    xFant: 'WHEEL TECH BICYCLING',
    enderEmit: {
        xLgr: 'RUA LOURENÇO JASIOCHA',
        nro: '1927',
        xBairro: 'CENTRO',
        cMun: '4101804',
        xMun: 'ARAUCÁRIA',
        UF: 'PR',
        CEP: '83702090',
        cPais: '1058',
        xPais: 'BRASIL'
    },
    IE: '9087859328',
    CRT: '1'
};

function calcularDigitoVerificador(chave) {
    let peso = 2;
    let soma = 0;
    for (let i = chave.length - 1; i >= 0; i--) {
        soma += parseInt(chave.charAt(i)) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return (resto === 0 || resto === 1) ? '0' : (11 - resto).toString();
}

function gerarChaveAcesso(emitenteCnpj, uf, dataEmissao, modelo, serie, nNF, tpEmis) {
    const cUF = (uf === 'PR' ? '41' : '35');
    const ano = dataEmissao.slice(2, 4);
    const mes = dataEmissao.slice(5, 7);
    const cnpj = emitenteCnpj.replace(/\D/g, '');
    const cNF = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    const nNFStr = nNF.toString().padStart(9, '0');
    const serieStr = serie.toString().padStart(3, '0');
    const tpEmisStr = tpEmis.toString();
    let chaveSemDV = cUF + ano + mes + cnpj + modelo + serieStr + nNFStr + tpEmisStr + cNF;
    const dv = calcularDigitoVerificador(chaveSemDV);
    return chaveSemDV + dv;
}

function gerarXmlNfe({ cliente, produto, vendaId }) {
    const now = moment().tz('America/Sao_Paulo');
    const dataEmissao = now.format('YYYY-MM-DD');
    const dataHoraEmi = now.format('YYYY-MM-DDTHH:mm:ssZ');
    const nNF = (parseInt(now.format('MMDDHHmmss')) % 1000000000).toString().padStart(9, '0');
    const chaveAcesso = gerarChaveAcesso(
        EMITENTE.CNPJ,
        'PR',
        dataEmissao,
        '55',
        '1',
        nNF,
        '1'
    );
    const valorTotal = (produto.quantidade * produto.valorUnitario).toFixed(2);
    const endereco = cliente.endereco || {};
    const logradouro = endereco.logradouro || 'NÃO INFORMADO';
    const numero = endereco.numero || 'S/N';
    const bairro = endereco.bairro || 'CENTRO';
    let cidade = 'ARAUCÁRIA';
    let uf = 'PR';
    if (endereco.cidadeUF && endereco.cidadeUF.includes('-')) {
        const partes = endereco.cidadeUF.split('-');
        cidade = partes[0].trim().toUpperCase();
        uf = partes[1].trim();
    }
    const cep = (endereco.cep || '').replace(/\D/g, '') || '83702909';
    let cMunCliente = '4101804';
    if (cidade.toUpperCase() === 'ARAUCÁRIA') cMunCliente = '4101804';

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
        .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' });

    const infNFe = doc.ele('infNFe', { versao: '4.00', Id: `NFe${chaveAcesso}` });

    // ide
    const ide = infNFe.ele('ide');
    ide.ele('cUF').txt('41').up();
    ide.ele('cNF').txt(chaveAcesso.slice(-8)).up();
    ide.ele('natOp').txt('Venda de mercadorias').up();
    ide.ele('mod').txt('55').up();
    ide.ele('serie').txt('1').up();
    ide.ele('nNF').txt(nNF).up();
    ide.ele('dhEmi').txt(dataHoraEmi).up();
    ide.ele('tpNF').txt('1').up();
    ide.ele('idDest').txt('1').up();
    ide.ele('cMunFG').txt(EMITENTE.enderEmit.cMun).up();
    ide.ele('tpImp').txt('1').up();
    ide.ele('tpEmis').txt('1').up();
    ide.ele('cDV').txt(chaveAcesso.slice(-1)).up();
    ide.ele('tpAmb').txt(process.env.NFE_AMBIENTE === 'producao' ? '1' : '2').up();
    ide.ele('finNFe').txt('1').up();
    ide.ele('indFinal').txt('1').up();
    ide.ele('indPres').txt('1').up();
    ide.ele('procEmi').txt('0').up();
    ide.ele('verProc').txt('1.0').up();

    // emit
    const emit = infNFe.ele('emit');
    emit.ele('CNPJ').txt(EMITENTE.CNPJ).up();
    emit.ele('xNome').txt(EMITENTE.xNome).up();
    emit.ele('xFant').txt(EMITENTE.xFant).up();
    const enderEmit = emit.ele('enderEmit');
    enderEmit.ele('xLgr').txt(EMITENTE.enderEmit.xLgr).up();
    enderEmit.ele('nro').txt(EMITENTE.enderEmit.nro).up();
    enderEmit.ele('xBairro').txt(EMITENTE.enderEmit.xBairro).up();
    enderEmit.ele('cMun').txt(EMITENTE.enderEmit.cMun).up();
    enderEmit.ele('xMun').txt(EMITENTE.enderEmit.xMun).up();
    enderEmit.ele('UF').txt(EMITENTE.enderEmit.UF).up();
    enderEmit.ele('CEP').txt(EMITENTE.enderEmit.CEP).up();
    enderEmit.ele('cPais').txt(EMITENTE.enderEmit.cPais).up();
    enderEmit.ele('xPais').txt(EMITENTE.enderEmit.xPais).up();
    emit.ele('IE').txt(EMITENTE.IE).up();
    emit.ele('CRT').txt(EMITENTE.CRT).up();

    // dest
    const dest = infNFe.ele('dest');
    const docType = cliente.documento.length === 14 ? 'CNPJ' : 'CPF';
    dest.ele(docType).txt(cliente.documento.replace(/\D/g, '')).up();
    dest.ele('xNome').txt(cliente.nome).up();
    const enderDest = dest.ele('enderDest');
    enderDest.ele('xLgr').txt(logradouro).up();
    enderDest.ele('nro').txt(numero).up();
    enderDest.ele('xBairro').txt(bairro).up();
    enderDest.ele('cMun').txt(cMunCliente).up();
    enderDest.ele('xMun').txt(cidade).up();
    enderDest.ele('UF').txt(uf).up();
    enderDest.ele('CEP').txt(cep).up();
    enderDest.ele('cPais').txt('1058').up();
    enderDest.ele('xPais').txt('BRASIL').up();
    dest.ele('indIEDest').txt('9').up();

    // det
    const det = infNFe.ele('det', { nItem: '1' });
    const prodElem = det.ele('prod');
    prodElem.ele('cProd').txt(vendaId || '1').up();
    prodElem.ele('cEAN').txt('SEM GTIN').up();
    prodElem.ele('xProd').txt(produto.descricao).up();
    prodElem.ele('NCM').txt(produto.ncm || '87149990').up();
    prodElem.ele('CFOP').txt(produto.cfop || '5102').up();
    prodElem.ele('uCom').txt('UN').up();
    prodElem.ele('qCom').txt(produto.quantidade).up();
    prodElem.ele('vUnCom').txt(produto.valorUnitario.toFixed(2)).up();
    prodElem.ele('vProd').txt(valorTotal).up();
    prodElem.ele('cEANTrib').txt('SEM GTIN').up();
    prodElem.ele('uTrib').txt('UN').up();
    prodElem.ele('qTrib').txt(produto.quantidade).up();
    prodElem.ele('vUnTrib').txt(produto.valorUnitario.toFixed(2)).up();
    prodElem.ele('indTot').txt('1').up();

    const imposto = det.ele('imposto');
    const icms = imposto.ele('ICMS');
    icms.ele('ICMSSN102')
        .ele('orig').txt('0').up()
        .ele('CSOSN').txt('102').up()
        .up();
    const pis = imposto.ele('PIS');
    pis.ele('PISNT').ele('CST').txt('07').up().up();
    const cofins = imposto.ele('COFINS');
    cofins.ele('COFINSNT').ele('CST').txt('07').up().up();

    // total
    const total = infNFe.ele('total');
    const icmsTot = total.ele('ICMSTot');
    const vBC = valorTotal;
    const vICMS = (parseFloat(valorTotal) * 0.18).toFixed(2);
    icmsTot.ele('vBC').txt(vBC).up();
    icmsTot.ele('vICMS').txt(vICMS).up();
    icmsTot.ele('vICMSDeson').txt('0.00').up();
    icmsTot.ele('vFCPUFDest').txt('0.00').up();
    icmsTot.ele('vICMSUFDest').txt('0.00').up();
    icmsTot.ele('vICMSUFRemet').txt('0.00').up();
    icmsTot.ele('vFCP').txt('0.00').up();
    icmsTot.ele('vBCST').txt('0.00').up();
    icmsTot.ele('vST').txt('0.00').up();
    icmsTot.ele('vFCPST').txt('0.00').up();
    icmsTot.ele('vFCPSTRet').txt('0.00').up();
    icmsTot.ele('vProd').txt(valorTotal).up();
    icmsTot.ele('vFrete').txt('0.00').up();
    icmsTot.ele('vSeg').txt('0.00').up();
    icmsTot.ele('vDesc').txt('0.00').up();
    icmsTot.ele('vII').txt('0.00').up();
    icmsTot.ele('vIPI').txt('0.00').up();
    icmsTot.ele('vIPIDevol').txt('0.00').up();
    icmsTot.ele('vPIS').txt('0.00').up();
    icmsTot.ele('vCOFINS').txt('0.00').up();
    icmsTot.ele('vOutro').txt('0.00').up();
    icmsTot.ele('vNF').txt(valorTotal).up();

    // transp
    const transp = infNFe.ele('transp');
    transp.ele('modFrete').txt('0').up();

    // cobr (opcional)
    const cobr = infNFe.ele('cobr');
    const fat = cobr.ele('fat');
    fat.ele('nFat').txt('1').up();
    fat.ele('vOrig').txt(valorTotal).up();
    fat.ele('vDesc').txt('0.00').up();
    fat.ele('vLiq').txt(valorTotal).up();

    // pag (obrigatório)
    const pag = infNFe.ele('pag');
    const detPag = pag.ele('detPag');
    detPag.ele('indPag').txt('0').up();
    detPag.ele('tPag').txt('01').up();
    detPag.ele('vPag').txt(valorTotal).up();

    // infAdic (opcional)
    const infAdic = infNFe.ele('infAdic');
    infAdic.ele('infCpl').txt('Teste de emissão em homologação').up();

    // Gera XML compactado (sem espaços extras)
    const xml = doc.end({ prettyPrint: false })
        .replace(/>\s+</g, '><')
        .replace(/^\s+|\s+$/g, '');
    return xml;
}

module.exports = { gerarXmlNfe };