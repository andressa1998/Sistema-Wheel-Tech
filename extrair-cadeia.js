// extrair-cadeia.js
const forge = require('node-forge');
const fs = require('fs');

const pfxPath = './certificado.pfx';
const pfxPassword = 'Nfe428**'; // ⚠️ Use sua senha aqui!

try {
    const pfxBuffer = fs.readFileSync(pfxPath);
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pfxPassword);
    
    // 1. Coletar todos os certificados da cadeia (caBags)
    const caBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    let allCerts = [];
    for (const bag of caBags[forge.pki.oids.certBag]) {
        allCerts.push(bag.cert);
    }
    
    // 2. Identificar o certificado da AC (não deve ser o seu próprio certificado)
    const myCert = p12.getBags({ bagType: forge.pki.oids.certBag })?.[forge.pki.oids.certBag]?.[0]?.cert;
    let caCerts = [];
    for (const cert of allCerts) {
        if (!myCert || cert.serialNumber !== myCert.serialNumber) {
            caCerts.push(cert);
        }
    }
    
    // 3. Salvar todos os certificados da AC encontrados
    if (caCerts.length > 0) {
        let caPem = '';
        for (const cert of caCerts) {
            caPem += forge.pki.certificateToPem(cert);
        }
        fs.writeFileSync('./cadeia_completa.pem', caPem);
        console.log(`✅ Extraídos ${caCerts.length} certificados da AC em cadeia_completa.pem`);
    } else {
        console.warn('⚠️ Nenhum certificado da AC encontrado no PFX.');
        // Cria um arquivo vazio para não quebrar o código posterior
        fs.writeFileSync('./cadeia_completa.pem', '');
    }
} catch (err) {
    console.error('❌ Erro ao extrair cadeia:', err.message);
}