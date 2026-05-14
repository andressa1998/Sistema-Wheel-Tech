const fs = require('fs');
const forge = require('node-forge');

function loadPfx(caminho, senha) {

    const pfxBuffer = fs.readFileSync(caminho);

    const p12Asn1 = forge.asn1.fromDer(
        forge.util.createBuffer(
            pfxBuffer.toString('binary')
        )
    );

    const p12 = forge.pkcs12.pkcs12FromAsn1(
        p12Asn1,
        senha
    );

    let privateKey = null;
    let cert = null;

    const bags =
        p12.getBags({
            bagType: forge.pki.oids.pkcs8ShroudedKeyBag
        });

    const bag =
        bags[forge.pki.oids.pkcs8ShroudedKeyBag][0];

    privateKey =
        forge.pki.privateKeyToPem(bag.key);

    const certBags =
        p12.getBags({
            bagType: forge.pki.oids.certBag
        });

    cert =
        forge.pki.certificateToPem(
            certBags[forge.pki.oids.certBag][0].cert
        );

    return {
        privateKey,
        cert
    };
}

module.exports = {
    loadPfx
};