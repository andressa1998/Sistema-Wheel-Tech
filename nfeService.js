const axios = require('axios');
const https = require('https');

class NFEService {

    constructor(ambiente = 'homologacao') {

        this.url =
            ambiente === 'producao'
                ? 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx'
                : 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx';
    }

    async sendNFe(xmlAssinado, certData) {

        try {

            console.log('📤 Enviando para:', this.url);

            const httpsAgent = new https.Agent({

                cert: certData.cert,
                key: certData.privateKey,

                rejectUnauthorized: false,

                secureProtocol: 'TLSv1_2_method'
            });

            // REMOVE HEADER XML
            let xmlLimpo = xmlAssinado
                .replace(/<\?xml.*?\?>/g, '')

                // REMOVE QUEBRAS
                .replace(/\r/g, '')
                .replace(/\n/g, '')
                .replace(/\t/g, '')

                // REMOVE ESPAÇOS ENTRE TAGS
                .replace(/>\s+</g, '><')

                .trim();

            // LOTE
            const enviNFe =
                `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>${xmlLimpo}</enviNFe>`;

            // SOAP
            const soapEnvelope =
                `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${enviNFe}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

            console.log('\n========== SOAP ==========\n');
            console.log(soapEnvelope);
            console.log('\n==========================\n');

            const response = await axios.post(
                this.url,
                soapEnvelope,
                {
                    httpsAgent,

                    headers: {
                        'Content-Type':
                            'application/soap+xml; charset=utf-8',

                        'Content-Length':
                            Buffer.byteLength(soapEnvelope)
                    },

                    timeout: 60000
                }
            );

            console.log('✅ STATUS:', response.status);

            return response.data;

        } catch (error) {

            console.error('❌ ERRO SEFAZ');

            if (error.response) {

                console.error(
                    'STATUS:',
                    error.response.status
                );

                console.error(
                    'RESPOSTA:',
                    error.response.data
                );
            }

            throw error;
        }
    }
}

module.exports = NFEService;