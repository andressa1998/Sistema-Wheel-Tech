const express = require('express');
const cors = require('cors');
const nfeRoutes = require('./nfe/nfeRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rotas NF-e
app.use('/api/nfe', nfeRoutes);

app.listen(PORT, () => {
    console.log(`Backend rodando na porta ${PORT}`);
});