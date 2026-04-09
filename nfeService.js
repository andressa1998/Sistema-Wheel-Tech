const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');

class NFEService {
    constructor(ambiente = 'homologacao') {
        this.ambiente = ambiente;
        this.urls = {
            homologacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl',
            producao: 'https://nfe.fazenda.gov.br/nfeautorizacao4/NFeAutorizacao4.asmx'
        };
    }

    async sendNFe(xmlAssinado) {
        const privateKeyPath = path.join(__dirname, 'chave_privada.pem');
        const certPath = path.join(__dirname, 'certificado.pem');
        
        if (!fs.existsSync(privateKeyPath) || !fs.existsSync(certPath)) {
            throw new Error('Arquivos PEM não encontrados');
        }
        
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
        const certificate = fs.readFileSync(certPath, 'utf8').trim();
        
        // Remove declaration e compacta o XML da NF-e
        const cleanXml = xmlAssinado
            .replace(/<\?xml.*?\?>/, '')
            .replace(/>\s+</g, '><')
            .trim();
        
        const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
      ${cleanXml}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`.replace(/>\s+</g, '><').trim();
        
        const url = this.urls[this.ambiente];
        console.log('🌐 URL da SEFAZ (Autorização):', url);
        
        const agent = new https.Agent({
            cert: certificate,
            key: privateKey,
            rejectUnauthorized: false
        });
        
        try {
            const response = await axios.post(url, soapBody, {
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeDadosMsg'
                },
                httpsAgent: agent,
                timeout: 30000
            });
            
            console.log('📨 Status HTTP:', response.status);
            console.log('📨 Corpo da resposta (primeiros 1000):', response.data?.substring(0, 1000));
            
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
            const result = parser.parse(response.data);
            
            const retorno = result?.['soap12:Envelope']?.['soap12:Body']?.['nfeResultMsg']?.['retEnviNFe']
                         || result?.retEnviNFe
                         || result;
            return retorno;
        } catch (error) {
            console.error('❌ Erro na comunicação:', error.message);
            if (error.response) {
                console.error('Resposta de erro da SEFAZ:', error.response.data);
            }
            throw new Error(`Erro na comunicação com SEFAZ: ${error.message}`);
        }
    }
}

module.exports = NFEService;