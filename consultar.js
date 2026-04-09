const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

async function consultarNFe(chaveAcesso) {
    const url = 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4?wsdl';
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">
      <consSitNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
        <tpAmb>2</tpAmb>
        <xServ>CONSULTAR</xServ>
        <chNFe>${chaveAcesso}</chNFe>
      </consSitNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`.replace(/>\s+</g, '><').trim();

    const privateKeyPath = path.join(__dirname, 'chave_privada.pem');
    const certPath = path.join(__dirname, 'certificado.pem');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
    const certificate = fs.readFileSync(certPath, 'utf8').trim();

    const agent = new https.Agent({
        cert: certificate,
        key: privateKey,
        rejectUnauthorized: false
    });

    try {
        const response = await axios.post(url, soapBody, {
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8',
                'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeDadosMsg'
            },
            httpsAgent: agent,
            timeout: 30000
        });
        console.log('Resposta:', response.data);
        const matchStat = response.data.match(/<cStat>(\d+)<\/cStat>/);
        const matchMotivo = response.data.match(/<xMotivo>([^<]+)<\/xMotivo>/);
        console.log('cStat:', matchStat ? matchStat[1] : 'não encontrado');
        console.log('xMotivo:', matchMotivo ? matchMotivo[1] : 'não encontrado');
    } catch (error) {
        console.error('Erro:', error.message);
    }
}

const chave = '41260432830261000125550014071438531246898474'; // substitua pela última chave gerada
consultarNFe(chave);