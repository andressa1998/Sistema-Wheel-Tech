const supabaseClient = require('./supabaseClient'); // ajuste para o seu client

async function listarNFe(req, res) {
    try {
        // Consulta todas as vendas e junta com notas fiscais
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select(`
                id_venda_ml,
                cliente_nome,
                valor_total,
                data_venda,
                notas_fiscais (
                    protocolo,
                    status,
                    numero_nf,
                    chave
                )
            `);

        if (error) {
            console.error(error);
            return res.status(500).json({ error: error.message });
        }

        // Retorna vendas com status da NF-e
        res.json({ success: true, vendas: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { listarNFe };
