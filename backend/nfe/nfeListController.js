const supabaseClient = require('./supabaseClient');

async function listarNFe(req, res) {
    try {
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select(`
                id_venda_ml,
                cliente,
                valor_total,
                data_venda,
                nfe_emitida,
                notas_fiscais (
                    protocolo,
                    status,
                    numero_nf,
                    chave
                )
            `)
            .order('data_venda', { ascending: false });

        if (error) {
            console.error(error);
            return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, vendas: data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}

module.exports = { listarNFe };
