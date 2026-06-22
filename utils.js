// utils.js
const forge = require('node-forge');

function loadCertificates() {
    const pfxBase64 = process.env.PFX_BASE64;
    const pfxPassword = process.env.PFX_PASSWORD;

    if (!pfxBase64 || !pfxPassword) {
        throw new Error('Certificado não configurado (PFX_BASE64 e PFX_PASSWORD)');
    }

    const cleanBase64 = pfxBase64.replace(/\s/g, '');
    console.log('📏 Tamanho Base64 (limpo):', cleanBase64.length);

    if (cleanBase64.length < 100) {
        throw new Error('Base64 do certificado parece estar incompleto ou vazio.');
    }

    const pfxBuffer = Buffer.from(cleanBase64, 'base64');
    console.log('📦 Tamanho PFX (bytes):', pfxBuffer.length);

    if (pfxBuffer.length < 100) {
        throw new Error('Buffer do certificado muito pequeno. Verifique o Base64.');
    }

    let p12Asn1;
    try {
        p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    } catch (err) {
        console.error('❌ Erro ao interpretar PFX:', err.message);
        throw new Error('PFX inválido. Verifique o Base64.');
    }

    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pfxPassword);

    // ----- EXTRAIR CHAVE PRIVADA -----
    let privateKeyPem = null;
    let keyType = '';

    // Tentar keyBag (PKCS#1)
    let bags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    if (bags[forge.pki.oids.keyBag] && bags[forge.pki.oids.keyBag].length > 0) {
        const key = bags[forge.pki.oids.keyBag][0].key;
        privateKeyPem = forge.pki.privateKeyToPem(key);
        keyType = 'PKCS#1/RSA';
        console.log('✅ Chave privada extraída (PKCS#1/RSA)');
    } else {
        // Tentar pkcs8ShroudedKeyBag (PKCS#8 criptografado)
        bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        if (bags[forge.pki.oids.pkcs8ShroudedKeyBag] && bags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
            const key = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
            privateKeyPem = forge.pki.privateKeyToPem(key);
            keyType = 'PKCS#8 Shrouded';
            console.log('✅ Chave privada extraída (PKCS#8 Shrouded)');
        } else {
            // Tentar pkcs8KeyBag (PKCS#8 sem criptografia)
            bags = p12.getBags({ bagType: forge.pki.oids.pkcs8KeyBag });
            if (bags[forge.pki.oids.pkcs8KeyBag] && bags[forge.pki.oids.pkcs8KeyBag].length > 0) {
                const key = bags[forge.pki.oids.pkcs8KeyBag][0].key;
                privateKeyPem = forge.pki.privateKeyToPem(key);
                keyType = 'PKCS#8';
                console.log('✅ Chave privada extraída (PKCS#8)');
            } else {
                throw new Error('Nenhuma chave privada encontrada no PFX');
            }
        }
    }

    console.log('📌 Formato da chave:', keyType);

    // ----- Certificado (primeiro) -----
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    if (!certBags[forge.pki.oids.certBag] || certBags[forge.pki.oids.certBag].length === 0) {
        throw new Error('Certificado não encontrado no PFX');
    }
    const cert = forge.pki.certificateToPem(certBags[forge.pki.oids.certBag][0].cert);

    // ----- Cadeia (todos os certificados, exceto o primeiro) -----
    let ca = null;
    if (certBags[forge.pki.oids.certBag].length > 1) {
        const caCerts = certBags[forge.pki.oids.certBag].slice(1);
        ca = caCerts.map(c => forge.pki.certificateToPem(c.cert)).join('');
        console.log(`✅ Extraídos ${caCerts.length} certificado(s) da cadeia.`);
    } else {
        console.warn('⚠️ Nenhum certificado da cadeia encontrado.');
    }

    console.log('🔑 Chave privada (primeiros 60 caracteres):', privateKeyPem.substring(0, 60));

    return { privateKey: privateKeyPem, cert, ca };
}

module.exports = { loadCertificates };