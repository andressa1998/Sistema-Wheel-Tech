const fs = require('fs');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');

// Função para assinar XML com certificado PFX
function assinarXml(xmlPath, pfxPath, senha) {
    // 1. Ler XML
    const xml = fs.readFileSync(xmlPath, 'utf8');

    // 2. Ler certificado PFX
    const pfxBuffer = fs.readFileSync(pfxPath);
    const pfx = forge.pkcs12.pkcs12FromAsn1(
        forge.asn1.fromDer(pfxBuffer.toString('binary')),
        senha
    );

    // 3. Extrair chave privada
    const keyObj = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    const privateKeyPem = forge.pki.privateKeyToPem(keyObj.key);

    // 4. Criar assinatura
    const sig = new SignedXml();
    sig.addReference("//*[local-name(.)='infNFe']");
    sig.signingKey = privateKeyPem;
    sig.computeSignature(xml);

    // 5. Retornar XML assinado
    return sig.getSignedXml();
}

module.exports = { assinarXml };
