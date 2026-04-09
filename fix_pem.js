const fs = require('fs');

// Lê o arquivo certificado.pem (está todo em uma linha)
let content = fs.readFileSync('./certificado.pem', 'utf8');

// Remove qualquer caractere de nova linha existente
content = content.replace(/\r?\n/g, '');

// Extrai as partes usando regex (ignora espaços em branco)
const headerMatch = content.match(/-----BEGIN CERTIFICATE-----/);
const footerMatch = content.match(/-----END CERTIFICATE-----/);

if (!headerMatch || !footerMatch) {
    console.error('Marcadores não encontrados');
    process.exit(1);
}

// Pega o conteúdo entre os marcadores
const startIdx = headerMatch.index + headerMatch[0].length;
const endIdx = footerMatch.index;
let base64 = content.substring(startIdx, endIdx);

// Remove quaisquer espaços ou caracteres estranhos
base64 = base64.replace(/\s/g, '');

// Divide em linhas de 64 caracteres
const lines = [];
for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
}

// Monta o PEM correto
const correctedPem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;

// Salva
fs.writeFileSync('./certificado.pem', correctedPem);
console.log('✅ Certificado corrigido com sucesso!');

// Verifica as primeiras linhas
console.log('\n--- Primeiras 5 linhas do novo arquivo ---');
console.log(correctedPem.split('\n').slice(0, 5).join('\n'));