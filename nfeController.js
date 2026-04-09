const fs = require('fs');
const { gerarXmlNfe } = require('./xmlBuilder');
const { assinarXml } = require('./xmlSigner');
const { loadPfx } = require('./utils');
const NFEService = require('./nfeService');

async function emitirNFe(req, res) {
    try {
        console.log('🚀 Iniciando emissão de NF-e...');

        // 1. Gerar XML não assinado
        const xmlNaoAssinado = gerarXmlNfe(req.body);
        fs.writeFileSync('./xml_nao_assinado.xml', xmlNaoAssinado);
        console.log('✅ XML não assinado gerado e salvo em xml_nao_assinado.xml');

        // 2. Carregar certificado e chave
        const { privateKey, certificate } = loadPfx();
        console.log('✅ Certificado e chave privada carregados');

        // 3. Assinar o XML
        const xmlAssinado = assinarXml(xmlNaoAssinado, privateKey, certificate);
        if (!xmlAssinado) throw new Error('Assinatura retornou undefined');
        fs.writeFileSync('./xml_assinado.xml', xmlAssinado);
        console.log('✅ XML assinado gerado e salvo em xml_assinado.xml');

        // 4. Enviar para a SEFAZ (ambiente de homologação ou produção)
        const ambiente = process.env.NFE_AMBIENTE || 'homologacao';
        const nfeService = new NFEService(ambiente);
        
        console.log(`📤 Enviando XML para SEFAZ (${ambiente})...`);
        const resultado = await nfeService.sendNFe(xmlAssinado);
        
        // 5. Processar a resposta da SEFAZ
        console.log('📦 Resposta completa da SEFAZ:', JSON.stringify(resultado, null, 2));
        
        // Extrai os campos principais (podem estar em diferentes níveis)
        const cStat = resultado?.cStat 
                   || resultado?.retEnviNFe?.cStat 
                   || resultado?.nfeResultMsg?.retEnviNFe?.cStat
                   || null;
        
        const xMotivo = resultado?.xMotivo 
                     || resultado?.retEnviNFe?.xMotivo 
                     || resultado?.nfeResultMsg?.retEnviNFe?.xMotivo
                     || 'Motivo não informado';
        
        const protocolo = resultado?.retEnviNFe?.protNFe?.nProt 
                       || resultado?.nProt 
                       || null;
        
        const chave = resultado?.retEnviNFe?.protNFe?.chNFe 
                   || resultado?.chNFe 
                   || null;
        
        // 6. Verificar autorização
        if (cStat === '100' || cStat === '104') {
            console.log(`✅ NF-e autorizada! Protocolo: ${protocolo}, Chave: ${chave}`);
            return res.json({
                success: true,
                protocolo,
                chave,
                cStat,
                xMotivo,
                xml: xmlAssinado
            });
        } else {
            console.error(`❌ NF-e rejeitada: cStat=${cStat}, xMotivo=${xMotivo}`);
            return res.status(422).json({
                success: false,
                error: `Nota rejeitada: ${xMotivo} (cStat=${cStat || 'desconhecido'})`,
                detalhes: resultado,
                xml: xmlAssinado
            });
        }
    } catch (err) {
        console.error('❌ Erro ao emitir NF-e:', err);
        return res.status(500).json({
            error: err.message,
            stack: err.stack
        });
    }
}

module.exports = { emitirNFe };