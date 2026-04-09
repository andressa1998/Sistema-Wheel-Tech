const p12pem = require('p12-pem');
const fs = require('fs');

const pfxPath = './certificado.pfx';
const password = 'Nfe428**'; // use a senha correta

p12pem(pfxPath, password, (err, pem) => {
    if (err) {
        console.error('❌ Erro ao converter PFX:', err);
        return;
    }
    fs.writeFileSync('./chave_privada.pem', pem.key);
    fs.writeFileSync('./certificado.pem', pem.cert);
    console.log('✅ PEMs gerados: chave_privada.pem e certificado.pem');
});