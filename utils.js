const fs = require('fs');
const path = require('path');

function loadCertificates() {
    const privateKeyPath = path.join(__dirname, 'chave_privada.pem');
    const certPath = path.join(__dirname, 'certificado.pem');
    const caPath = path.join(__dirname, 'cadeia_completa.pem');

    if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Chave privada não encontrada: ${privateKeyPath}`);
    }
    if (!fs.existsSync(certPath)) {
        throw new Error(`Certificado não encontrado: ${certPath}`);
    }
    if (!fs.existsSync(caPath)) {
        console.warn('⚠️ Arquivo cadeia_completa.pem não encontrado – a conexão TLS pode falhar');
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');
    const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : null;

    // Validação básica do formato PEM
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
        console.warn('⚠️ Chave privada pode estar em formato inválido');
    }
    if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
        console.warn('⚠️ Certificado pode estar em formato inválido');
    }

    return { privateKey, cert, ca };
}

module.exports = { loadCertificates };