// nfeService.js
const axios = require('axios');
const https = require('https');

class NFEService {
    constructor(ambiente = 'producao') {
        this.ambiente = ambiente;
        if (ambiente === 'homologacao') {
            this.urlAutorizacao = 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4';
            this.urlEvento = 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4';
            this.urlConsulta = 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4';
        } else {
            this.urlAutorizacao = 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4';
            this.urlEvento = 'https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4';
            this.urlConsulta = 'https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4';
        }
    }

    /**
     * Envia uma NF-e para a SEFAZ (autorização).
     * @param {string} xmlAssinado - O XML da NF-e já assinado (contém a tag <NFe>).
     * @param {object} certData - Objeto com { privateKey, cert, ca }.
     * @returns {Promise<string>} - O XML de resposta da SEFAZ.
     */
    async sendNFe(xmlAssinado, certData) {
        // Remove a declaração XML do conteúdo (a SEFAZ não aceita dentro do <enviNFe>)
        const xmlLimpo = xmlAssinado.replace(/<\?xml[^?]*\?>/g, '').trim();

        // Monta o lote de envio (enviNFe) conforme manual da SEFAZ
        const idLote = Math.floor(Math.random() * 999999999999);
        const enviNFe = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
            <idLote>${idLote}</idLote>
            <indSinc>1</indSinc>
            ${xmlLimpo}
        </enviNFe>`;

        // Monta o envelope SOAP (versão 1.2 ou 1.1? Usaremos SOAP 1.1 para compatibilidade)
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
            ${enviNFe}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;

        // Cria o agente HTTPS com o certificado e chave
        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        console.log('📨 Enviando para SEFAZ URL:', this.urlAutorizacao);
        console.log('📄 Tamanho do envelope SOAP:', soapEnvelope.length);
        // Log apenas dos primeiros 500 caracteres para não poluir
        console.log('📄 Início do envelope:', soapEnvelope.substring(0, 500) + '...');

        try {
            const response = await axios.post(this.urlAutorizacao, soapEnvelope, {
                httpsAgent,
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeDadosMsg'
                },
                timeout: 60000,
                responseType: 'text'
            });

            console.log('✅ Resposta da SEFAZ (status):', response.status);
            console.log('📄 Resposta COMPLETA:', response.data || '(vazia)');

            if (!response.data || response.data.trim() === '') {
                throw new Error('Resposta vazia da SEFAZ – verifique a cadeia de certificados e a configuração TLS.');
            }

            // Extrai cStat e xMotivo para diagnóstico
            const cStat = response.data.match(/<cStat>(\d+)<\/cStat>/)?.[1] || 'N/A';
            const xMotivo = response.data.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'N/A';
            console.log(`📊 cStat=${cStat}, xMotivo=${xMotivo}`);

            return response.data;
        } catch (error) {
            console.error('❌ Erro no envio para SEFAZ:');
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Dados:', error.response.data || '(vazio)');
            } else if (error.request) {
                console.error('Sem resposta da SEFAZ (timeout ou erro de rede)');
            } else {
                console.error('Erro:', error.message);
            }
            throw error;
        }
    }

    /**
     * Envia evento de cancelamento (ou outro evento) para a SEFAZ.
     */
    async sendEvento(xmlAssinado, certData) {
        const xmlLimpo = xmlAssinado.replace(/<\?xml[^?]*\?>/g, '').trim();
        // Evento também deve ser envolto por <envEvento>, mas seu XML já deve conter
        // a estrutura correta. Aqui apenas montamos o SOAP.
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
            ${xmlLimpo}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;

        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        const response = await axios.post(this.urlEvento, soapEnvelope, {
            httpsAgent,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeDadosMsg'
            },
            timeout: 60000,
            responseType: 'text'
        });
        return response.data;
    }

    /**
     * Consulta o status de uma NF-e pela chave de acesso.
     */
    async consultarStatus(chaveAcesso, certData) {
        const tpAmb = this.ambiente === 'producao' ? '1' : '2';
        const xmlCons = `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
            <tpAmb>${tpAmb}</tpAmb>
            <xServ>CONSULTAR</xServ>
            <chNFe>${chaveAcesso}</chNFe>
        </consSitNFe>`;

        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
            ${xmlCons}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;

        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        const response = await axios.post(this.urlConsulta, soapEnvelope, {
            httpsAgent,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8'
            },
            timeout: 30000,
            responseType: 'text'
        });
        return response.data;
    }
}

module.exports = NFEService;