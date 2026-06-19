// xmlSigner.js - Assinatura usando xml-crypto com chave PKCS#8
const { SignedXml } = require('xml-crypto');
const forge = require('node-forge');

/**
 * Converte chave PKCS#1 (RSA) para PKCS#8 usando forge
 */
function convertToPkcs8(pem) {
    try {
        const privateKey = forge.pki.privateKeyFromPem(pem);
        const asn1 = forge.pki.privateKeyToAsn1(privateKey);
        return forge.pki.privateKeyToPem(asn1);
    } catch (err) {
        console.warn('⚠️ Conversão para PKCS#8 falhou, usando chave original:', err.message);
        return pem;
    }
}

function assinarXml(xml, certData) {
    // 1. Extrair Id do infNFe
    const idMatch = xml.match(/Id="([^"]+)"/);
    if (!idMatch) throw new Error('❌ Id do infNFe não encontrado');
    const id = idMatch[1];

    // 2. Preparar chave privada (garantir PKCS#8)
    let privateKeyPem = certData.privateKey;
    if (privateKeyPem.includes('RSA PRIVATE KEY')) {
        privateKeyPem = convertToPkcs8(privateKeyPem);
        console.log('🔄 Chave convertida para PKCS#8');
    } else {
        console.log('✅ Chave já está em PKCS#8');
    }

    // 3. Extrair e limpar certificado (base64 puro)
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

    // 4. Instanciar SignedXml corretamente
    const sig = new SignedXml({
        privateKey: privateKeyPem,
        canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
    });

    // 5. Adicionar referência ao infNFe
    sig.addReference({
        xpath: `//*[local-name(.)='infNFe' and @Id='${id}']`,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        uri: `#${id}`
    });

    // 6. Inserir certificado na tag KeyInfo
    sig.getKeyInfoContent = () =>
        `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

    // 7. Calcular assinatura
    sig.computeSignature(xml, {
        location: {
            reference: `//*[local-name(.)='infNFe' and @Id='${id}']`,
            action: 'after'
        }
    });

    // 8. Obter XML assinado
    let signedXml = sig.getSignedXml();

    // 9. Limpeza final
    signedXml = signedXml.replace(/xmlns=""/g, '');
    signedXml = signedXml.replace(/[\x00-\x1F\x7F]/g, '');

    // Garantir namespace na assinatura
    if (!signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"')) {
        signedXml = signedXml.replace('<Signature', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
    }

    // 10. Validar SignatureValue (base64)
    const sigValueMatch = signedXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    if (sigValueMatch) {
        const sigValue = sigValueMatch[1];
        if (!/^[A-Za-z0-9+/=]+$/.test(sigValue)) {
            console.error('❌ SignatureValue inválido:', sigValue.substring(0, 100));
            throw new Error('Assinatura gerada com caracteres inválidos (não base64).');
        }
        console.log('✅ SignatureValue válido (base64).');
    }

    console.log('✅ XML assinado com sucesso.');
    return signedXml;
}

function validarAssinatura(xml, certData) {
    console.log('🔍 Validação de assinatura não implementada.');
    return true;
}

module.exports = { assinarXml, validarAssinatura };