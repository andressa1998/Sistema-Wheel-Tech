const fs = require('fs');
const path = require('path');

function loadPfx() {
    const privateKeyPath = path.join(__dirname, 'chave_privada.pem');
    const certPath = path.join(__dirname, 'certificado.pem');

    if (!fs.existsSync(privateKeyPath) || !fs.existsSync(certPath)) {
        throw new Error(
            'Arquivos PEM não encontrados. Execute o script "converter_pfx.js" para gerá-los a partir do seu PFX.'
        );
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const certificate = fs.readFileSync(certPath, 'utf8');

    return { privateKey, certificate };
}

module.exports = { loadPfx };