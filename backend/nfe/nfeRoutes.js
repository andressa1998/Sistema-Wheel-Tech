const express = require('express');
const router = express.Router();
const supabaseClient = require('./supabaseClient');
const axios = require('axios');
const { gerarXmlNfe } = require('./xmlBuilder'); // função que você já tem para montar XML

// rota para emitir NF-e
router.post('/emitir', async (req, res) => {
    try {
        const { orderId } = req.body; // ID da venda

        // 1. Buscar dados da venda no Supabase
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', orderId)
            .single();

        if (error || !venda) {
            return res.status(404).json({ error: 'Venda não encontrada' });
        }

        // 2. Buscar dados fiscais do comprador no Mercado Livre
        const token = process.env.MELI_ACCESS_TOKEN; // coloque seu token no .env
        const orderResponse = await axios.get(
            `https://api.mercadolibre.com/orders/${orderId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const billingId = orderResponse.data.buyer.billing_info.id;

        const billingResponse = await axios.get(
            `https://api.mercadolibre.com/orders/billing-info/MLB/${billingId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const dadosCliente = billingResponse.data.buyer.billing_info;

        // 3. Montar os dados da NF-e
        const nfeData = {
            venda,
            cliente: dadosCliente,
        };

        // 4. Gerar XML da NF-e
        const xml = gerarXmlNfe(nfeData);

        // 5. Retornar XML para ser enviado ao Mercado Livre
        res.json({
            success: true,
            message: 'NF-e gerada com sucesso',
            xml
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
