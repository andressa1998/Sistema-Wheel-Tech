const express = require('express');
const router = express.Router();
const supabaseClient = require('./supabaseClient');
const { gerarXmlNfe } = require('./xmlBuilder');
const { emitirNFe } = require('./nfeController');

console.log('✅ nfeRoutes.js carregado com sucesso!');

// Rota para gerar XML (usada pelo front-end)
router.post('/generate', async (req, res) => {
    try {
        const { cliente, produto, vendaId } = req.body;

        // Validação básica
        if (!cliente || !cliente.documento || !cliente.nome || !produto || !produto.descricao || !produto.quantidade || !produto.valorUnitario) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        // Gerar XML
        const xml = await gerarXmlNfe({ cliente, produto, vendaId });
        res.json({ success: true, xml });
    } catch (error) {
        console.error('Erro ao gerar XML:', error);
        res.status(500).json({ error: error.message });
    }
});

// Rota para listar vendas pendentes (opcional, pode ser chamada pelo front-end)
router.get('/pending', async (req, res) => {
    try {
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('id_venda_ml, cliente, valor_total, data_venda, sku, quantidade, produto_titulo')
            .or('nfe_emitida.is.null,nfe_emitida.eq.false')
            .order('data_venda', { ascending: false });

        if (error) throw error;
        res.json({ success: true, vendas: data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/emitir', emitirNFe);

module.exports = router;