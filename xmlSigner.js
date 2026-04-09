const forge = require('node-forge');
const { DOMParser, XMLSerializer } = require('xmldom');

function assinarXml(xml, privateKeyPem, certificatePem) {
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const cert = forge.pki.certificateFromPem(certificatePem);

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const nfeRoot = doc.documentElement;
    if (!nfeRoot) throw new Error('Elemento NFe não encontrado');

    const infNFe = nfeRoot.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('Elemento infNFe não encontrado');

    const idAttr = infNFe.getAttribute('Id');
    if (!idAttr) throw new Error('Atributo Id não encontrado em infNFe');

    // Clona o infNFe e canonicaliza (sem a assinatura)
    const infNFeClone = infNFe.cloneNode(true);
    const canonXml = canonicalizeXml(infNFeClone);
    const digest = forge.md.sha1.create().update(canonXml, 'utf8').digest();
    const digestBase64 = forge.util.encode64(digest.getBytes());

    // SignedInfo com os algoritmos corretos (SHA-1 e RSA-SHA1)
    const signedInfoXml = `
        <SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
            <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
            <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
            <Reference URI="#${idAttr}">
                <Transforms>
                    <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                    <Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
                </Transforms>
                <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                <DigestValue>${digestBase64}</DigestValue>
            </Reference>
        </SignedInfo>
    `.replace(/\s*\n\s*/g, ' ').trim();

    const signedInfoCanon = canonicalizeXmlString(signedInfoXml);
    // Assinatura usando RSA-SHA1
    const signatureBytes = privateKey.sign(forge.md.sha1.create().update(signedInfoCanon, 'utf8'), 'RSASSA-PKCS1-V1_5');
    const signatureBase64 = forge.util.encode64(signatureBytes);

    // Monta o elemento Signature
    const signatureElem = doc.createElementNS('http://www.w3.org/2000/09/xmldsig#', 'Signature');

    const signedInfoDom = new DOMParser().parseFromString(signedInfoXml, 'application/xml').documentElement;
    signatureElem.appendChild(signedInfoDom);

    const sigValueElem = doc.createElement('SignatureValue');
    sigValueElem.textContent = signatureBase64;
    signatureElem.appendChild(sigValueElem);

    const keyInfoElem = doc.createElement('KeyInfo');
    const x509DataElem = doc.createElement('X509Data');
    const x509CertElem = doc.createElement('X509Certificate');
    const certBase64 = certificatePem
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s/g, '');
    x509CertElem.textContent = certBase64;
    x509DataElem.appendChild(x509CertElem);
    keyInfoElem.appendChild(x509DataElem);
    signatureElem.appendChild(keyInfoElem);

    nfeRoot.appendChild(signatureElem);

    return new XMLSerializer().serializeToString(doc);
}

function canonicalizeXml(node) {
    const serializer = new XMLSerializer();
    let str = serializer.serializeToString(node);
    str = str.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><');
    return str;
}

function canonicalizeXmlString(xmlString) {
    return xmlString.replace(/\s*\n\s*/g, ' ').replace(/>\s+</g, '><');
}

module.exports = { assinarXml };