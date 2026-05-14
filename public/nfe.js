// nfe.js – Rota /api/nfe/emitir (completa com transportadora e valor editável)

const { SignedXml } = require('xml-crypto');
const { DOMParser, XMLSerializer } = require('xmldom');
const forge = require('node-forge');

// Dados da empresa (substitua se necessário)
const EMITENTE = {
  CNPJ: '32830261000125',
  xNome: 'WHEEL TECH BICYCLING LTDA',
  xFant: 'WHEEL TECH BICYCLING',
  enderEmit: {
    xLgr: 'RUA LOURENÇO JASIOCHA',
    nro: '1927',
    xBairro: 'CENTRO',
    cMun: '4101804',
    xMun: 'ARAUCÁRIA',
    UF: 'PR',
    CEP: '83702090',
    cPais: '1058',
    xPais: 'BRASIL'
  },
  IE: '9087859328',
  CRT: '1'
};

function gerarChaveAcesso() {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 10);
  return (timestamp + random).slice(0, 44).padEnd(44, '0');
}

function gerarXmlNfe({ cliente, produto, vendaId, transportadora }) {
  const agora = new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00');
  const chaveAcesso = gerarChaveAcesso();
  const valorTotal = (produto.quantidade * produto.valorUnitario).toFixed(2);
  const cUF = '41';
  const cMunFG = '4101804';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${chaveAcesso}">
    <ide>
      <cUF>${cUF}</cUF>
      <cNF>${chaveAcesso.slice(-8)}</cNF>
      <natOp>VENDA</natOp>
      <mod>55</mod>
      <serie>1</serie>
      <nNF>${vendaId ? vendaId.slice(-6) : '1'}</nNF>
      <dhEmi>${agora}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>${cMunFG}</cMunFG>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${chaveAcesso.slice(-1)}</cDV>
      <tpAmb>2</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>1.0</verProc>
    </ide>
    <emit>
      <CNPJ>${EMITENTE.CNPJ}</CNPJ>
      <xNome>${EMITENTE.xNome}</xNome>
      <xFant>${EMITENTE.xFant}</xFant>
      <enderEmit>
        <xLgr>${EMITENTE.enderEmit.xLgr}</xLgr>
        <nro>${EMITENTE.enderEmit.nro}</nro>
        <xBairro>${EMITENTE.enderEmit.xBairro}</xBairro>
        <cMun>${EMITENTE.enderEmit.cMun}</cMun>
        <xMun>${EMITENTE.enderEmit.xMun}</xMun>
        <UF>${EMITENTE.enderEmit.UF}</UF>
        <CEP>${EMITENTE.enderEmit.CEP}</CEP>
        <cPais>${EMITENTE.enderEmit.cPais}</cPais>
        <xPais>${EMITENTE.enderEmit.xPais}</xPais>
      </enderEmit>
      <IE>${EMITENTE.IE}</IE>
      <CRT>${EMITENTE.CRT}</CRT>
    </emit>
    <dest>
      <${cliente.documento.length === 14 ? 'CNPJ' : 'CPF'}>${cliente.documento.replace(/\D/g, '')}</${cliente.documento.length === 14 ? 'CNPJ' : 'CPF'}>
      <xNome>${cliente.nome}</xNome>
      <enderDest>
        <xLgr>${cliente.endereco.logradouro || ''}</xLgr>
        <nro>${cliente.endereco.numero || ''}</nro>
        <xBairro>${cliente.endereco.bairro || ''}</xBairro>
        <cMun>${cMunFG}</cMun>
        <xMun>${cliente.endereco.cidadeUF?.split('-')[0]?.trim() || 'ARAUCARIA'}</xMun>
        <UF>${cliente.endereco.cidadeUF?.split('-')[1]?.trim() || 'PR'}</UF>
        <CEP>${(cliente.endereco.cep || '').replace(/\D/g, '')}</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderDest>
      <indIEDest>9</indIEDest>
    </dest>
    <det nItem="1">
      <prod>
        <cProd>${vendaId || '1'}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${produto.descricao}</xProd>
        <NCM>${produto.ncm || '99999999'}</NCM>
        <CFOP>${produto.cfop || '5102'}</CFOP>
        <uCom>UN</uCom>
        <qCom>${produto.quantidade}</qCom>
        <vUnCom>${produto.valorUnitario.toFixed(2)}</vUnCom>
        <vProd>${valorTotal}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>UN</uTrib>
        <qTrib>${produto.quantidade}</qTrib>
        <vUnTrib>${produto.valorUnitario.toFixed(2)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>
        <PIS><PISNT><CST>07</CST></PISNT></PIS>
        <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
      </imposto>
    </det>
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${valorTotal}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${valorTotal}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>0</modFrete>
      <transporta>
        <CNPJ>${transportadora.cnpj}</CNPJ>
        <xNome>${transportadora.nome}</xNome>
        <IE>${transportadora.ie || ''}</IE>
        <xEnder>${transportadora.endereco || ''}</xEnder>
        <xMun>${transportadora.cidade || ''}</xMun>
        <UF>${transportadora.uf || ''}</UF>
      </transporta>
    </transp>
    <pag>
      <detPag>
        <tPag>01</tPag>
        <vPag>${valorTotal}</vPag>
      </detPag>
    </pag>
  </infNFe>
</NFe>`;
  return xml;
}

function assinarXml(xml, privateKeyPem) {
  const signedXml = new SignedXml();
  signedXml.signingKey = privateKeyPem;
  signedXml.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"]
  });
  signedXml.computeSignature(xml);
  const signed = signedXml.getSignedXml();
  const doc = new DOMParser().parseFromString(signed, 'text/xml');
  const signature = doc.getElementsByTagName('Signature')[0];
  const infNFe = doc.getElementsByTagName('infNFe')[0];
  if (infNFe && signature) infNFe.appendChild(signature);
  return new XMLSerializer().serializeToString(doc);
}

async function enviarParaSefaz(xmlAssinado) {
  const url = 'https://homologacao.nfe.fazenda.pr.gov.br/ws/nfeautorizacao4.asmx';
  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
  <soap:Header/>
  <soap:Body>
    <nfe:nfeDadosMsg>${xmlAssinado}</nfe:nfeDadosMsg>
  </soap:Body>
</soap:Envelope>`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
    body: soap
  });
  return await response.text();
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 });
  }
  try {
    const { vendaId, cliente, produto, transportadora } = body;
    const body = await request.json();
    const { vendaId, cliente, produto, transportadora } = body;
    if (!cliente || !produto || !transportadora || !transportadora.cnpj) {
      return new Response(JSON.stringify({ error: 'Dados incompletos (cliente, produto e transportadora obrigatórios)' }), { status: 400 });
    }
    const xml = gerarXmlNfe({ cliente, produto, vendaId, transportadora });
    const pfxBase64 = env.NFE_CERTIFICADO_PFX_BASE64;
    const password = env.NFE_CERT_PASSWORD;
    if (!pfxBase64 || !password) {
      return new Response(JSON.stringify({ error: 'Certificado não configurado' }), { status: 500 });
    }
    const pfxBinary = Uint8Array.from(atob(pfxBase64), c => c.charCodeAt(0));
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxBinary), password);
    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }).keys[0];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag }).certs[0];
    const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);
    const certificatePem = forge.pki.certificateToPem(certBag.cert);
    const xmlAssinado = assinarXml(xml, privateKeyPem);
    const resposta = await enviarParaSefaz(xmlAssinado);
    const parser = new (require('fast-xml-parser').XMLParser)({ ignoreAttributes: false });
    const parsed = parser.parse(resposta);
    const protNFe = parsed?.['soap:Envelope']?.['soap:Body']?.['nfeResultMsg']?.['retEnviNFe']?.['protNFe'];
    const infProt = protNFe?.['infProt'];
    const protocolo = infProt?.['nProt'];
    const cStat = infProt?.['cStat'];
    const xMotivo = infProt?.['xMotivo'];
    if (!protocolo || cStat !== '100') {
      return new Response(JSON.stringify({ error: `SEFAZ: ${xMotivo} (cStat ${cStat})` }), { status: 400 });
    }
    return new Response(JSON.stringify({
      success: true,
      protocolo,
      xml: xmlAssinado
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}