require('dotenv').config();
const express = require('express');
const cors = require('cors');               // adicionado
const nfeRoutes = require('./nfeRoutes');

const app = express();

// Habilita CORS para o front-end (ajuste a origem se necessário)
app.use(cors({
    origin: ['http://127.0.0.1:5501', 'http://localhost:5501'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use('/nfe', nfeRoutes);

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});