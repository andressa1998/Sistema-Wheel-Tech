const NFEService = require('./nfeService');

const { gerarXmlNfe } = require('./xmlBuilder');

const { assinarXml } = require('./xmlSigner');

const { loadPfx } = require('./certificate');

async function emitirNFe(req, res) {

    try {

        console.log('🚀 Emitindo NF-e...');

        const dados = req.body;

        const xml =
            gerarXmlNfe(dados);

        const pfxDetails =
            loadPfx(
                './certificado.pfx',
                'Nfe428**'
            );

        console.log({
            privateKey: !!pfxDetails.privateKey,
            cert: !!pfxDetails.cert
        });

        const xmlAssinado =
            assinarXml(
                xml,
                pfxDetails
            );

        const service =
            new NFEService('homologacao');

        const retorno =
    await service.sendNFe(
        xmlAssinado,
        pfxDetails
    );

        return res.json(retorno);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
}

module.exports = {
    emitirNFe
};