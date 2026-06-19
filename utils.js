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

    // ----- EXTRAIR CHAVE PRIVADA (tenta todos os formatos) -----
    let privateKeyPem = null;
    let keyType = '';

    // 1. Tentar keyBag (PKCS#1)
    let bags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    if (bags[forge.pki.oids.keyBag] && bags[forge.pki.oids.keyBag].length > 0) {
        const key = bags[forge.pki.oids.keyBag][0].key;
        privateKeyPem = forge.pki.privateKeyToPem(key);
        keyType = 'PKCS#1/RSA';
        console.log('✅ Chave privada extraída (PKCS#1/RSA)');
    } else {
        // 2. Tentar pkcs8ShroudedKeyBag (PKCS#8 criptografado)
        bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        if (bags[forge.pki.oids.pkcs8ShroudedKeyBag] && bags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
            const key = bags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
            privateKeyPem = forge.pki.privateKeyToPem(key);
            keyType = 'PKCS#8 Shrouded';
            console.log('✅ Chave privada extraída (PKCS#8 Shrouded)');
        } else {
            // 3. Tentar pkcs8KeyBag (PKCS#8 sem criptografia)
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

    // ----- CONVERTER PARA PKCS#8 (se necessário) -----
    let privateKeyForSign = privateKeyPem;
    if (privateKeyPem.includes('RSA PRIVATE KEY')) {
        try {
            // Converte de PKCS#1 (RSA) para PKCS#8
            const rsaPrivateKey = forge.pki.privateKeyFromPem(privateKeyPem);
            const asn1 = forge.pki.privateKeyToAsn1(rsaPrivateKey);
            const pkcs8Pem = forge.pki.privateKeyToPem(asn1);
            // Verifica se a conversão foi bem-sucedida
            if (pkcs8Pem.includes('PRIVATE KEY') && !pkcs8Pem.includes('RSA PRIVATE KEY')) {
                privateKeyForSign = pkcs8Pem;
                console.log('🔄 Chave convertida para PKCS#8 (xml-crypto)');
            } else {
                console.warn('⚠️ Conversão para PKCS#8 falhou, usando chave original');
                privateKeyForSign = privateKeyPem;
            }
        } catch (err) {
            console.warn('⚠️ Falha ao converter para PKCS#8, usando original:', err.message);
            privateKeyForSign = privateKeyPem;
        }
    } else if (privateKeyPem.includes('PRIVATE KEY')) {
        console.log('✅ Chave já está em PKCS#8');
        privateKeyForSign = privateKeyPem;
    } else {
        console.warn('⚠️ Formato de chave desconhecido, mantendo original');
        privateKeyForSign = privateKeyPem;
    }

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

    // Log das primeiras linhas da chave (para diagnóstico)
    console.log('🔑 Chave privada (primeiros 60 caracteres):', privateKeyForSign.substring(0, 60));
    console.log('📌 Formato da chave:', privateKeyForSign.includes('RSA PRIVATE KEY') ? 'PKCS#1' : privateKeyForSign.includes('PRIVATE KEY') ? 'PKCS#8' : 'Desconhecido');

    return { privateKey: privateKeyForSign, cert, ca };
}

module.exports = { loadCertificates };