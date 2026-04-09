require('dotenv').config();
const express = require('express');
const nfeRoutes = require('./nfeRoutes'); // caminho relativo

const app = express();
const PORT = process.env.PORT || 3000;

console.log('nfeRoutes:', nfeRoutes);
console.log('Rotas registradas:', nfeRoutes.stack); // opcional

// Middleware para ler JSON
app.use(express.json());

// Usa as rotas da NF-e com prefixo /nfe
app.use('/nfe', nfeRoutes);

// Rota de teste
app.get('/', (req, res) => {
    res.json({ message: 'Servidor funcionando!' });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});