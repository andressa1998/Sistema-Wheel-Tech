const axios = require('axios');
const { loadPfx } = require('./utils');
const { XMLParser } = require('fast-xml-parser');

class NFEService {
    constructor(ambiente = 'homologacao') {
        this.ambiente = ambiente; // 'homologacao' ou 'producao'
        this.uf = 'SP'; // Ajuste conforme sua UF

        // URLs dos WebServices SEFAZ (Autorização da NF-e)
        this.urls = {
            homologacao: {
                SP: 'https://homologacao.nfe.fazenda.pr.gov.br/ws/nfeautorizacao4.asmx'
                // Adicione outras UFs conforme necessário
            },
            producao: {
                SP: 'https://nfe.fazenda.pr.gov.br/ws/nfeautorizacao4.asmx'
            }
        };
    }

    async sendNFe(xmlAssinado, password) {
        // Carrega certificado (se precisar para autenticação mTLS)
        const { privateKey, certificate } = loadPfx(password);

        const url = this.urls[this.ambiente][this.uf];
        const soapBody = this.buildSoapEnvelope(xmlAssinado);

        try {
            const response = await axios.post(url, soapBody, {
                headers: {
                    'Content-Type': 'application/soap+xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(soapBody)
                },
                httpsAgent: new (require('https').Agent)({
                    cert: certificate,
                    key: privateKey,
                    rejectUnauthorized: false // em homologação pode ser necessário
                })
            });

            const parser = new XMLParser({ ignoreAttributes: false });
            const result = parser.parse(response.data);

            // Extrai protocolo de autorização
            const retorno = result['soap:Envelope']?.['soap:Body']?.['nfeResultMsg'];
            return retorno || result;
        } catch (error) {
            throw new Error(`Erro na comunicação com SEFAZ: ${error.message}`);
        }
    }

    buildSoapEnvelope(xml) {
        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
   <soap:Header/>
   <soap:Body>
      <nfe:nfeDadosMsg>
         ${xml}
      </nfe:nfeDadosMsg>
   </soap:Body>
</soap:Envelope>`;
    }
}

module.exports = NFEService;
