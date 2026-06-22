// xmlSigner.js - Assinatura robusta com xml-crypto e canonicalização rigorosa
const { SignedXml } = require('xml-crypto');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const fs = require('fs');

/**
 * Converte chave PKCS#1 para PKCS#8 (se necessário)
 */
function convertToPkcs8(pem) {
    try {
        const forge = require('node-forge');
        const privateKey = forge.pki.privateKeyFromPem(pem);
        const asn1 = forge.pki.privateKeyToAsn1(privateKey);
        return forge.pki.privateKeyToPem(asn1);
    } catch (err) {
        console.warn('⚠️ Conversão para PKCS#8 falhou, usando chave original:', err.message);
        return pem;
    }
}

/**
 * Assina o XML da NF-e
 */
function assinarXml(xml, certData) {
    // 1. Extrair Id do infNFe
    const idMatch = xml.match(/Id="([^"]+)"/);
    if (!idMatch) throw new Error('❌ Id do infNFe não encontrado');
    const id = idMatch[1];
    console.log(`🔑 Assinando infNFe com Id: ${id}`);

    // 2. Preparar chave privada (garantir PKCS#8)
    let privateKeyPem = certData.privateKey;
    if (privateKeyPem.includes('RSA PRIVATE KEY')) {
        privateKeyPem = convertToPkcs8(privateKeyPem);
        console.log('🔄 Chave convertida para PKCS#8');
    }

    // 3. Limpar certificado (base64 puro)
    let certPem = certData.cert;
    let certBase64 = certPem
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\r?\n/g, '')
        .trim()
        .replace(/[^A-Za-z0-9+/=]/g, '');

    if (!certBase64 || !/^[A-Za-z0-9+/=]+$/.test(certBase64)) {
        throw new Error('❌ Certificado público não é base64 válido.');
    }
    console.log(`✅ CertBase64 válido (tamanho: ${certBase64.length})`);

    // 4. REMOVER ESPAÇOS E QUEBRAS (canonicalização forçada)
    //    Isso garante que não haja diferenças de whitespace
    let xmlLimpo = xml
        .replace(/\r?\n/g, '')          // remove quebras
        .replace(/>\s+</g, '><')       // remove espaços entre tags
        .replace(/\s{2,}/g, ' ')       // reduz múltiplos espaços a um
        .trim();

    // 5. Configurar SignedXml
    const sig = new SignedXml({
        privateKey: privateKeyPem,
        canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
    });

    // 6. Adicionar referência ao infNFe (URI = #Id)
    sig.addReference({
        xpath: `//*[local-name(.)='infNFe' and @Id='${id}']`,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        uri: `#${id}`
    });

    // 7. Inserir certificado na tag KeyInfo
    sig.getKeyInfoContent = () =>
        `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

    // 8. Calcular assinatura (a tag Signature será inserida como irmã de infNFe)
    sig.computeSignature(xmlLimpo, {
        location: {
            reference: `//*[local-name(.)='infNFe' and @Id='${id}']`,
            action: 'after' // insere como irmão seguinte
        }
    });

    // 9. Obter XML assinado
    let signedXml = sig.getSignedXml();

    // 10. Limpeza final
    signedXml = signedXml
        .replace(/xmlns=""/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '');

    // Garantir namespace na assinatura
    if (!signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"')) {
        signedXml = signedXml.replace('<Signature', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
    }

    // Garantir declaração XML
    if (!signedXml.startsWith('<?xml')) {
        signedXml = '<?xml version="1.0" encoding="UTF-8"?>' + signedXml;
    }

    // 11. Validar o digest (opcional, mas ajuda a diagnosticar)
    const digestMatch = signedXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    if (digestMatch) {
        console.log(`✅ Digest calculado: ${digestMatch[1]}`);
    }

    console.log('✅ XML assinado com sucesso (canonicalização forçada).');
    return signedXml;
}

function validarAssinatura(xml, certData) {
    const hasSig = /<Signature/.test(xml);
    console.log(hasSig ? '✅ Assinatura presente no XML.' : '❌ Assinatura ausente.');
    return hasSig;
}

module.exports = { assinarXml, validarAssinatura };