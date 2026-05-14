require('dotenv').config();

const express = require('express');

const app = express();

const nfeRoutes = require('./nfeRoutes');

app.use(express.json({ limit: '50mb' }));

app.use('/nfe', nfeRoutes);

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});