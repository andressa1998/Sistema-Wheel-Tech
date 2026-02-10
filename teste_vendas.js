// teste_vendas.js - Script para testar passo a passo
console.log('🧪 TESTE: Sistema de Vendas ML');

async function testarFluxoCompleto() {
    console.log('🔍 Iniciando teste passo a passo...');
    
    // 1. Testar token
    console.log('1. Testando token...');
    let token = null;
    
    if (window.autoManageMLToken) {
        try {
            token = await window.autoManageMLToken();
            console.log('✅ Token obtido:', token ? token.substring(0, 30) + '...' : 'NULO');
        } catch (error) {
            console.error('❌ Erro ao obter token:', error);
        }
    } else {
        console.error('❌ autoManageMLToken não encontrado');
        token = localStorage.getItem('ml_access_token');
        console.log('Token do localStorage:', token ? token.substring(0, 30) + '...' : 'NULO');
    }
    
    if (!token) {
        console.error('❌ Nenhum token disponível');
        return;
    }
    
    // 2. Testar Worker
    console.log('\n2. Testando Worker...');
    try {
        const testeWorker = await fetch('https://purple-bonus-3b1c.andmiotto1998.workers.dev/');
        const workerData = await testeWorker.json();
        console.log('✅ Worker online:', workerData);
    } catch (error) {
        console.error('❌ Worker offline:', error);
    }
    
    // 3. Testar API ML diretamente
    console.log('\n3. Testando API ML...');
    try {
        const response = await fetch('https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/proxy?url=' + 
            encodeURIComponent('https://api.mercadolibre.com/users/me') + 
            '&token=' + token);
        
        if (response.ok) {
            const userData = await response.json();
            console.log('✅ API ML funcionando! Usuário:', userData.nickname);
        } else {
            console.error('❌ Erro API ML:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro conexão API:', error);
    }
    
    // 4. Testar buscar vendas
    console.log('\n4. Testando busca de vendas...');
    try {
        const agora = new Date();
        const seteDiasAtras = new Date(agora);
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        
        const urlVendas = `https://api.mercadolibre.com/orders/search?seller=me&sort=date_desc&order.status=paid&order.date_created.from=${seteDiasAtras.toISOString().split('T')[0]}&limit=10`;
        
        console.log('URL de vendas:', urlVendas);
        
        const response = await fetch('https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/proxy?url=' + 
            encodeURIComponent(urlVendas) + 
            '&token=' + token);
        
        if (response.ok) {
            const vendas = await response.json();
            console.log('✅ Vendas encontradas:', vendas.results?.length || 0);
            
            if (vendas.results && vendas.results.length > 0) {
                console.log('📦 Primeira venda:', {
                    id: vendas.results[0].id,
                    total: vendas.results[0].total_amount,
                    comprador: vendas.results[0].buyer?.nickname,
                    itens: vendas.results[0].order_items?.length
                });
            }
        } else {
            console.error('❌ Erro buscar vendas:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro busca vendas:', error);
    }
    
    // 5. Testar Supabase
    console.log('\n5. Testando Supabase...');
    if (window.supabaseClient) {
        try {
            const { data, error } = await window.supabaseClient
                .from('vendas_ml')
                .select('count')
                .limit(1);
            
            if (error) {
                console.error('❌ Erro Supabase:', error);
            } else {
                console.log('✅ Supabase conectado');
            }
        } catch (error) {
            console.error('❌ Erro conexão Supabase:', error);
        }
    } else {
        console.error('❌ Supabase não disponível');
    }
}

// Executar teste após carregamento
setTimeout(() => {
    console.log('🚀 Executando teste...');
    testarFluxoCompleto();
}, 3000);

// Exportar para testar manualmente
window.testarVendasML = testarFluxoCompleto;