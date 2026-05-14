const { create } = require('xmlbuilder2');

function gerarXmlNfe(dados) {

    const {
        nNF = 1,
        serie = 1,
        cNF = '00000001',
        cDV = '1',

        emitente = {},
        destinatario = {},
        produto = {}
    } = dados;

    // DATA/HORA NO PADRÃO ACEITO PELA NF-E
    const dhEmi = new Date()
        .toLocaleString('sv-SE', {
            timeZone: 'America/Sao_Paulo'
        })
        .replace(' ', 'T') + '-03:00';

    // ID DA NF-E
    const idNFe =
        `NFe4126053283026100012555001${String(nNF).padStart(9, '0')}1000000011`;

    const xml = create({ version: '1.0', encoding: 'UTF-8' })

        .ele('NFe', {
            xmlns: 'http://www.portalfiscal.inf.br/nfe'
        })

        .ele('infNFe', {
            versao: '4.00',
            Id: idNFe
        })

        // =========================
        // IDE
        // =========================

        .ele('ide')

        .ele('cUF').txt('41').up()
        .ele('cNF').txt(cNF).up()
        .ele('natOp').txt('VENDA').up()
        .ele('mod').txt('55').up()
        .ele('serie').txt(String(serie)).up()
        .ele('nNF').txt(String(nNF)).up()

        // CORRIGIDO
        .ele('dhEmi').txt(dhEmi).up()

        .ele('tpNF').txt('1').up()
        .ele('idDest').txt('1').up()
        .ele('cMunFG').txt('4101804').up()
        .ele('tpImp').txt('1').up()
        .ele('tpEmis').txt('1').up()
        .ele('cDV').txt(cDV).up()
        .ele('tpAmb').txt('2').up()
        .ele('finNFe').txt('1').up()
        .ele('indFinal').txt('1').up()
        .ele('indPres').txt('1').up()
        .ele('procEmi').txt('0').up()
        .ele('verProc').txt('1.0').up()

        .up()

        // =========================
        // EMITENTE
        // =========================

        .ele('emit')

        .ele('CNPJ')
        .txt(emitente.CNPJ || '32830261000125')
        .up()

        .ele('xNome')
        .txt(
            emitente.xNome ||
            'WHEEL TECH BICYCLING LTDA'
        )
        .up()

        .ele('xFant')
        .txt(
            emitente.xFant ||
            'WHEEL TECH'
        )
        .up()

        .ele('enderEmit')

        .ele('xLgr')
        .txt(
            emitente.xLgr ||
            'RUA LOURENCO JASIOCHA'
        )
        .up()

        .ele('nro')
        .txt(
            emitente.nro ||
            '1927'
        )
        .up()

        .ele('xBairro')
        .txt(
            emitente.xBairro ||
            'CENTRO'
        )
        .up()

        .ele('cMun')
        .txt('4101804')
        .up()

        .ele('xMun')
        .txt('ARAUCARIA')
        .up()

        .ele('UF')
        .txt('PR')
        .up()

        .ele('CEP')
        .txt('83702090')
        .up()

        .ele('cPais')
        .txt('1058')
        .up()

        .ele('xPais')
        .txt('BRASIL')
        .up()

        .up()

        .ele('IE')
        .txt(
            emitente.IE ||
            '9087859328'
        )
        .up()

        .ele('CRT')
        .txt('1')
        .up()

        .up()

        // =========================
        // DESTINATÁRIO
        // =========================

        .ele('dest')

        .ele('CPF')
        .txt(
            destinatario.CPF ||
            '47840605885'
        )
        .up()

        .ele('xNome')
        .txt(
            destinatario.xNome ||
            'Andressa Miotto'
        )
        .up()

        .ele('enderDest')

        .ele('xLgr')
        .txt(
            destinatario.xLgr ||
            'Rua Jardineira'
        )
        .up()

        .ele('nro')
        .txt(
            destinatario.nro ||
            '156'
        )
        .up()

        .ele('xBairro')
        .txt(
            destinatario.xBairro ||
            'Campina da Barra'
        )
        .up()

        .ele('cMun')
        .txt('4101804')
        .up()

        .ele('xMun')
        .txt('ARAUCARIA')
        .up()

        .ele('UF')
        .txt('PR')
        .up()

        .ele('CEP')
        .txt('83709310')
        .up()

        .ele('cPais')
        .txt('1058')
        .up()

        .ele('xPais')
        .txt('BRASIL')
        .up()

        .up()

        .ele('indIEDest')
        .txt('9')
        .up()

        .up()

        // =========================
        // PRODUTO
        // =========================

        .ele('det', {
            nItem: '1'
        })

        .ele('prod')

        .ele('cProd')
        .txt(
            produto.cProd ||
            '1'
        )
        .up()

        .ele('cEAN')
        .txt('SEM GTIN')
        .up()

        .ele('xProd')
        .txt(
            produto.xProd ||
            'BICICLETA'
        )
        .up()

        .ele('NCM')
        .txt(
            produto.NCM ||
            '87120010'
        )
        .up()

        .ele('CFOP')
        .txt(
            produto.CFOP ||
            '5102'
        )
        .up()

        .ele('uCom')
        .txt('UN')
        .up()

        .ele('qCom')
        .txt('1.0000')
        .up()

        .ele('vUnCom')
        .txt('150.00')
        .up()

        .ele('vProd')
        .txt('150.00')
        .up()

        .ele('cEANTrib')
        .txt('SEM GTIN')
        .up()

        .ele('uTrib')
        .txt('UN')
        .up()

        .ele('qTrib')
        .txt('1.0000')
        .up()

        .ele('vUnTrib')
        .txt('150.00')
        .up()

        .ele('indTot')
        .txt('1')
        .up()

        .up()

        // =========================
        // IMPOSTOS
        // =========================

        .ele('imposto')

        .ele('ICMS')

        .ele('ICMSSN102')

        .ele('orig')
        .txt('0')
        .up()

        .ele('CSOSN')
        .txt('102')
        .up()

        .up()
        .up()

        .ele('PIS')

        .ele('PISNT')

        .ele('CST')
        .txt('07')
        .up()

        .up()
        .up()

        .ele('COFINS')

        .ele('COFINSNT')

        .ele('CST')
        .txt('07')
        .up()

        .up()
        .up()

        .up()

        .up()

        // =========================
        // TOTAL
        // =========================

        .ele('total')

        .ele('ICMSTot')

        .ele('vBC').txt('0.00').up()
        .ele('vICMS').txt('0.00').up()
        .ele('vICMSDeson').txt('0.00').up()
        .ele('vFCP').txt('0.00').up()
        .ele('vBCST').txt('0.00').up()
        .ele('vST').txt('0.00').up()
        .ele('vFCPST').txt('0.00').up()
        .ele('vFCPSTRet').txt('0.00').up()
        .ele('vProd').txt('150.00').up()
        .ele('vFrete').txt('0.00').up()
        .ele('vSeg').txt('0.00').up()
        .ele('vDesc').txt('0.00').up()
        .ele('vII').txt('0.00').up()
        .ele('vIPI').txt('0.00').up()
        .ele('vIPIDevol').txt('0.00').up()
        .ele('vPIS').txt('0.00').up()
        .ele('vCOFINS').txt('0.00').up()
        .ele('vOutro').txt('0.00').up()
        .ele('vNF').txt('150.00').up()

        .up()
        .up()

        // =========================
        // TRANSPORTE
        // =========================

        .ele('transp')

        .ele('modFrete')
        .txt('9')
        .up()

        .up()

        // =========================
        // PAGAMENTO
        // =========================

        .ele('pag')

        .ele('detPag')

        .ele('tPag')
        .txt('01')
        .up()

        .ele('vPag')
        .txt('150.00')
        .up()

        .up()
        .up()

        .up()
        .up();

    return xml.end({
        prettyPrint: false
    });
}

module.exports = {
    gerarXmlNfe
};