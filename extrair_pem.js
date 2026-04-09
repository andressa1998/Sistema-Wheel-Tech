const forge = require('node-forge');
const fs = require('fs');

const password = 'Nfe428**'; // ⚠️ SUBSTITUA PELA SENHA DO SEU CERTIFICADO

const pfxBuffer = fs.readFileSync('./certificado.pfx');
const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));

try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    console.log('✅ PFX decodificado com sucesso');

    // Extrai a chave privada (tenta todos os tipos comuns)
    let privateKey = null;
    const bags = p12.getBags();
    for (const bagType in bags) {
        const items = bags[bagType];
        for (const item of items) {
            if (item.type === 'privateKey' || typeof item.sign === 'function') {
                privateKey = item;
                break;
            }
        }
        if (privateKey) break;
    }

    if (!privateKey) {
        throw new Error('Chave privada não encontrada. Verifique a senha e se o arquivo contém a chave.');
    }

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    fs.writeFileSync('./chave_privada.pem', privateKeyPem);
    console.log('✅ Chave privada salva em chave_privada.pem');

    // Extrai o certificado
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag });
    if (!certBag.certs || !certBag.certs[0]) {
        throw new Error('Certificado não encontrado');
    }
    const certificatePem = forge.pki.certificateToPem(certBag.certs[0]);
    fs.writeFileSync('./certificado.pem', certificatePem);
    console.log('✅ Certificado salvo em certificado.pem');

} catch (err) {
    console.error('❌ Erro:', err.message);
}