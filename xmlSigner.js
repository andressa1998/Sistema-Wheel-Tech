// xmlSigner.js
const { SignedXml } = require('xml-crypto');
const { DOMParser } = require('@xmldom/xmldom');
const crypto = require('crypto');

class SignedXmlNFe extends SignedXml {
    constructor(options) {
        super(options);
        this.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
        this.digestAlgorithm = "http://www.w3.org/2000/09/xmldsig#sha1";
    }

    findSignatureAlgorithm(name) {
        if (name === this.signatureAlgorithm) {
            return {
                getAlgorithmName: () => this.signatureAlgorithm,
                getSignature: (xml, signingKey) => {
                    const signer = crypto.createSign("RSA-SHA1");
                    signer.update(xml);
                    return signer.sign(signingKey);
                }
            };
        }
        return super.findSignatureAlgorithm(name);
    }

    findHashAlgorithm(name) {
        if (name === this.digestAlgorithm) {
            return {
                getAlgorithmName: () => this.digestAlgorithm,
                getHash: (xml) => {
                    const hash = crypto.createHash("sha1");
                    hash.update(xml);
                    return hash.digest();
                }
            };
        }
        return super.findHashAlgorithm(name);
    }
}

function assinarXml(xml, certData) {
    const idMatch = xml.match(/Id="([^"]+)"/);
    if (!idMatch) throw new Error("Id do infNFe não encontrado");
    const id = idMatch[1];

    const sig = new SignedXmlNFe({
        privateKey: certData.privateKey,
        canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    });

    sig.addReference({
        xpath: `//*[local-name(.)='infNFe' and @Id='${id}']`,
        transforms: [
            "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
            "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
        ],
        digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
        uri: `#${id}`
    });

    // Certificado público em Base64 puro
    let certPem = certData.cert.toString();
    certPem = certPem.replace(/-----BEGIN CERTIFICATE-----/g, "")
                     .replace(/-----END CERTIFICATE-----/g, "")
                     .replace(/\r?\n/g, "")
                     .trim();

    // Remove qualquer caractere fora do padrão Base64
    const certBase64 = certPem.replace(/[^A-Za-z0-9+/=]/g, "");

    sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

    sig.computeSignature(xml, {
        location: { reference: `//*[local-name(.)='infNFe' and @Id='${id}']`, action: "after" }
    });

    let signedXml = sig.getSignedXml();
    signedXml = signedXml.replace(/xmlns=""/g, "");
    signedXml = signedXml.replace(/[\x00-\x1F\x7F]/g, "");

    if (!signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"')) {
        signedXml = signedXml.replace("<Signature", '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
    }

    console.log("✅ Assinatura gerada com RSA-SHA1 + SHA1 (compatível com NF-e 4.00)");
    return signedXml;
}

function validarAssinatura(xml, certData) {
    const doc = new DOMParser().parseFromString(xml);
    const signatureNode = doc.getElementsByTagName("Signature")[0];
    if (!signatureNode) throw new Error("Nó <Signature> não encontrado");

    const sig = new SignedXmlNFe();
    sig.keyInfoProvider = { getKeyInfo: () => null, getKey: () => certData.cert };
    sig.loadSignature(signatureNode);

    const isValid = sig.checkSignature(xml);
    if (!isValid) console.error("❌ Assinatura inválida:", sig.validationErrors);
    else console.log("✅ Assinatura válida conforme certificado");
    return isValid;
}

module.exports = { assinarXml, validarAssinatura };