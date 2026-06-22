const crypto = require('crypto');

// Use a chave do último XML que você gerou
const chave = '41260632830261000125550030000500931787285554';

// Defina os tokens como STRINGS (entre aspas)
const tokens = {
    homologacao_novo: { token: '16UBATD6FDRUDYK2NV5P21NVBI108UOYC220', id: '03' },
    producao_novo: { token: 'DM3JSLGIU2Z957T83B2P85CB8YG0C8D3JZUG', id: '04' },
    homologacao_antigo: { token: '6113X8ABJ336C6C9E7E4KCGS5N7ZH0H5O0DWII', id: '01' },
    producao_antigo: { token: 'XYRVN1YSRXG0429BCZRIT9MMZM9X7QZRU8QP', id: '02' }
};

console.log('🔑 Chave de acesso:', chave);
console.log('----------------------------------------');

for (const [nome, dados] of Object.entries(tokens)) {
    const token = dados.token; // Agora é string
    const h1 = crypto.createHash('sha1').update(token + chave).digest('base64');
    const h2 = crypto.createHash('sha1').update(chave + token).digest('base64');
    console.log(`📌 ${nome.toUpperCase()} (idCSRT=${dados.id})`);
    console.log(`   Token: ${token}`);
    console.log(`   Hash (token+chave): ${h1}`);
    console.log(`   Hash (chave+token): ${h2}`);
    console.log('----------------------------------------');
}