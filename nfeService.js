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

    compactarXml(xml) {
        return xml
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .replace(/<!--.*?-->/g, '')
            .trim();
    }

    async sendNFe(xmlAssinado, certData) {
        let xmlLimpo = xmlAssinado.replace(/<\?xml[^?]*\?>/g, '').trim();
        const hasEnviNFe = /<enviNFe\s/.test(xmlLimpo);

        let conteudoParaEnviar;
        if (hasEnviNFe) {
            conteudoParaEnviar = this.compactarXml(xmlLimpo);
            console.log('📄 XML já contém <enviNFe> – usando diretamente.');
        } else {
            // idLote válido: apenas números, até 15 dígitos
            const idLote = String(Date.now()).slice(-15);

            const enviNFe = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>${idLote}</idLote>
    <indSinc>1</indSinc>
    ${xmlLimpo}
</enviNFe>`;
            conteudoParaEnviar = this.compactarXml(enviNFe);
            console.log('📄 XML sem <enviNFe> – adicionado e compactado.');
        }

        // Envelope SOAP 1.1
        const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
            ${conteudoParaEnviar}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;

        const soapFinal = this.compactarXml(soapEnvelope);

        console.log('📨 Enviando para URL:', this.urlAutorizacao);
        console.log('📄 Tamanho do envelope compactado:', soapFinal.length);
        console.log('📄 Envelope compactado (primeiros 500 caracteres):', soapFinal.substring(0, 500) + '...');

        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        try {
            const response = await axios.post(this.urlAutorizacao, soapFinal, {
                httpsAgent,
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeDadosMsg'
                },
                timeout: 60000,
                responseType: 'text',
                validateStatus: () => true
            });

            console.log('✅ Status HTTP:', response.status);
            console.log('📋 Headers:', response.headers);
            console.log('📄 Resposta:', response.data || '(vazio)');

            if (!response.data || response.data.trim() === '') {
                throw new Error(`Resposta vazia (HTTP ${response.status}). Verifique o envelope.`);
            }

            const cStat = response.data.match(/<cStat>(\d+)<\/cStat>/)?.[1] || 'N/A';
            const xMotivo = response.data.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'N/A';
            console.log(`📊 cStat=${cStat}, xMotivo=${xMotivo}`);
            return response.data;
        } catch (error) {
            console.error('❌ Erro no envio:', error.message);
            throw error;
        }
    }

    async sendEvento(xmlAssinado, certData) {
        let xmlLimpo = xmlAssinado.replace(/<\?xml[^?]*\?>/g, '').trim();
        const hasEnvEvento = /<envEvento\s/.test(xmlLimpo);
        let conteudo;
        if (hasEnvEvento) {
            conteudo = this.compactarXml(xmlLimpo);
        } else {
            const idLote = String(Date.now()).slice(-15);
            const envEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <idLote>${idLote}</idLote>
    ${xmlLimpo}
</envEvento>`;
            conteudo = this.compactarXml(envEvento);
        }

        const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
            ${conteudo}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;
        const soapFinal = this.compactarXml(soapEnvelope);

        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        const response = await axios.post(this.urlEvento, soapFinal, {
            httpsAgent,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeDadosMsg'
            },
            timeout: 60000,
            responseType: 'text',
            validateStatus: () => true
        });
        return response.data;
    }

    async consultarStatus(chaveAcesso, certData) {
        const tpAmb = this.ambiente === 'producao' ? '1' : '2';
        const xmlCons = `<consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <tpAmb>${tpAmb}</tpAmb>
    <xServ>CONSULTAR</xServ>
    <chNFe>${chaveAcesso}</chNFe>
</consSitNFe>`;
        const conteudoCompactado = this.compactarXml(xmlCons);
        const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
            ${conteudoCompactado}
        </nfeDadosMsg>
    </soap:Body>
</soap:Envelope>`;
        const soapFinal = this.compactarXml(soapEnvelope);

        const httpsAgent = new https.Agent({
            cert: certData.cert,
            key: certData.privateKey,
            ca: certData.ca || undefined,
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.2'
        });

        const response = await axios.post(this.urlConsulta, soapFinal, {
            httpsAgent,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeDadosMsg'
            },
            timeout: 30000,
            responseType: 'text',
            validateStatus: () => true
        });
        return response.data;
    }
}

module.exports = NFEService;