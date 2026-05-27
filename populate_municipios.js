// populate_municipios.js
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = 'https://nvlmtinpcayrpkhulefs.supabase.co';
const supabaseKey = 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
const supabase = createClient(supabaseUrl, supabaseKey);

async function populate() {
    console.log('📡 Buscando municípios do IBGE...');
    const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
    const data = await response.json();
    const municipios = data.map(m => ({
        codigo_ibge: parseInt(m.id),
        nome: m.nome,
        uf: m.microrregiao.mesorregiao.UF.sigla
    }));
    console.log(`✅ ${municipios.length} municípios encontrados. Inserindo no Supabase...`);

    const chunkSize = 100;
    for (let i = 0; i < municipios.length; i += chunkSize) {
        const chunk = municipios.slice(i, i + chunkSize);
        const { error } = await supabase.from('municipios').upsert(chunk, { onConflict: 'codigo_ibge' });
        if (error) console.error('Erro no lote:', error);
        else console.log(`Inseridos ${i + chunk.length}/${municipios.length}`);
    }
    console.log('✅ Tabela de municípios populada com sucesso!');
}

populate();