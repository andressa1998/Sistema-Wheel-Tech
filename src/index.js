// ============================================
// BIBLIOTECAS
// ============================================
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from 'xmldom';
import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

// ============================================
// FUNÇÕES DE PROXY DO MERCADO LIVRE (JÁ EXISTENTES)
// ============================================
// Aqui você coloca o código do seu Worker que já estava em produção.
// Se você não tem esse código, acesse o Worker no dashboard do Cloudflare,
// copie o conteúdo e cole abaixo. Por enquanto, vou deixar um esqueleto.
async function handleProxy(request, env) {
    // Exemplo de proxy simples – substitua pelo código real
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
        return new Response('Missing url param', { status: 400 });
    }
    const token = url.searchParams.get('token');
    const response = await fetch(targetUrl, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    const data = await response.text();
    return new Response(data, {
        headers: { 'Content-Type': 'application/json' }
    });
}

// ============================================
// FUNÇÕES DE EMISSÃO DE NF-e
// ============================================

// Dados da empresa (substitua pelos seus)
const EMITENTE = {
    CNPJ: '12345678000199',
    xNome: 'WHEEL TECH COMERCIO DE ACESSORIOS LTDA',
    xFant: 'WHEEL TECH',
    enderEmit: {
        xLgr: 'RUA EXEMPLO',
        nro: '100',
        xBairro: 'CENTRO',
        cMun: '3550308',
        xMun: 'SÃO PAULO',
        UF: 'SP',
        CEP: '01000000',
        cPais: '1058',
        xPais: 'BRASIL'
    },
    IE: '123456789',
    CRT: '1'
};

function gerarChaveAcesso() {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 10);
    return (timestamp + random).slice(0, 44).padEnd(44, '0');
}

function gerarXmlNfe({ cliente, produto, vendaId }) {
    const agora = new Date().toISOString();
    const chaveAcesso = gerarChaveAcesso();
    const valorTotal = (produto.quantidade * produto.valorUnitario).toFixed(2);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${chaveAcesso}">
    <ide>
      <cUF>35</cUF>
      <cNF>${chaveAcesso.slice(-8)}</cNF>
      <natOp>Venda de mercadorias</natOp>
      <mod>55</mod>
      <serie>1</serie>
      <nNF>${vendaId ? vendaId.slice(-6) : '1'}</nNF>
      <dhEmi>${agora}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>3550308</cMunFG>
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
        <cMun>3550308</cMun>
        <xMun>${cliente.endereco.cidadeUF?.split('-')[0]?.trim() || 'SÃO PAULO'}</xMun>
        <UF>${cliente.endereco.cidadeUF?.split('-')[1]?.trim() || 'SP'}</UF>
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
        <vFCPUFDest>0.00</vFCPUFDest>
        <vICMSUFDest>0.00</vICMSUFDest>
        <vICMSUFRemet>0.00</vICMSUFRemet>
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
    <transp><modFrete>0</modFrete></transp>
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

async function handleNFe(request, env) {
    try {
        const body = await request.json();
        const { vendaId, cliente, produto } = body;

        if (!cliente || !produto) {
            return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400 });
        }

        const xml = gerarXmlNfe({ cliente, produto, vendaId });

        const pfxBase64 = env.NFE_CERTIFICADO_PFX_BASE64;
        const password = env.NFE_CERT_PASSWORD;
        if (!pfxBase64 || !password) {
            return new Response(JSON.stringify({ error: 'Certificado não configurado' }), { status: 500 });
        }

        const pfxBinary = Uint8Array.from(atob(pfxBase64), c => c.charCodeAt(0));
        const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxBinary), password);
        const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }).keys[0];
        const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

        const xmlAssinado = assinarXml(xml, privateKeyPem);

        const resposta = await enviarParaSefaz(xmlAssinado);

        const parser = new XMLParser({ ignoreAttributes: false });
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

// ============================================
// ROTEADOR PRINCIPAL
// ============================================
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === '/api/nfe/emitir' && request.method === 'POST') {
            return handleNFe(request, env);
        } else {
            // Rota padrão: proxy do Mercado Livre
            return handleProxy(request, env);
        }
    }
};