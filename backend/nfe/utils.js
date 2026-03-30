const forge = require('node-forge');
const fs = require('fs');

function loadPfx(password) {
    const pfx = fs.readFileSync('./certificado.pfx');
    const p12Asn1 = forge.asn1.fromDer(pfx.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    const keyObj = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }).keys[0];
    const certObj = p12.getBags({ bagType: forge.pki.oids.certBag }).certs[0];

    return {
        privateKey: forge.pki.privateKeyToPem(keyObj),
        certificate: forge.pki.certificateToPem(certObj)
    };
}

module.exports = { loadPfx };
