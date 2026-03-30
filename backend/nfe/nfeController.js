const NFEService = require('./nfeService');
const { buildNFeXML } = require('./xmlBuilder');
const { loadPfx } = require('./utils');
const { SignedXml } = require('xml-crypto');
const fs = require('fs');
const { DOMParser } = require('xmldom');
const { XMLSerializer } = require('xmldom');
const { XMLBuilder, XMLParser } = require('fast-xml-parser');

async function emitirNFe(req, res) {
    try {
        const { venda, password } = req.body;
        if (!venda || !password) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        // 1. Construir XML não assinado
        const xml = await buildNFeXML(venda);

        // 2. Assinar XML com o certificado
        const { privateKey } = loadPfx(password);
        const xmlAssinado = assinarXML(xml, privateKey);

        // 3. Enviar para SEFAZ
        const nfeService = new NFEService('homologacao'); // ou 'producao'
        const resposta = await nfeService.sendNFe(xmlAssinado, password);

        // 4. Extrair protocolo
        const protocolo = resposta?.['retEnviNFe']?.['protNFe']?.['infProt']?.['nProt'] || null;
        const status = resposta?.['retEnviNFe']?.['cStat'] || null;

        // 5. Salvar no banco (exemplo usando Supabase)
        if (protocolo) {
            await supabaseClient
                .from('notas_fiscais')
                .insert({
                    chave: venda.chave,
                    numero_nf: venda.numero_nf,
                    protocolo: protocolo,
                    status: status,
                    xml_assinado: xmlAssinado,
                    created_at: new Date().toISOString()
                });
        }

        // 6. Retornar para o front-end
        res.json({ success: true, protocolo, resposta });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}


function assinarXML(xml, privateKey) {
    const { SignedXml } = require('xml-crypto');

    // Cria objeto de assinatura
    const signedXml = new SignedXml();

    // Define a chave privada extraída do certificado .pfx
    signedXml.signingKey = privateKey;

    // Referência ao nó infNFe (obrigatório na NF-e)
    signedXml.addReference({
        xpath: "//*[local-name(.)='infNFe']",
        digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
        transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"]
    });

    // Calcula a assinatura
    signedXml.computeSignature(xml);

    // Retorna o XML assinado pronto para envio
    return signedXml.getSignedXml();
}

module.exports = { emitirNFe };