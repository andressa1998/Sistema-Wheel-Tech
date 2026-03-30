const express = require('express');
const app = express(); // inicializa o app aqui
const nfeRoutes = require('./backend/nfe/nfeRoutes'); // importa as rotas


app.use(express.json());

// usa as rotas depois que o app já existe
app.use('/api/nfe', nfeRoutes);

// inicia o servidor
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});