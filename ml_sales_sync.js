// ml_sales_sync_final_trabalhando.js
console.log('✅ Sistema de Vendas ML - PRONTO');

const SUPABASE_URL = 'https://nvlmtinpcayrpkhulefs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
const WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
const SELLER_ID = '415176739';

let supabaseClient = null;
let sincronizando = false;

// INICIALIZAR SUPABASE
async function inicializarSupabase() {
    if (supabaseClient) return supabaseClient;
    
    try {
        // Carregar biblioteca se necessário
        if (!window.supabase) {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }
        
        // Criar cliente
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });
        
        console.log('✅ Supabase inicializado');
        window.supabaseClient = supabaseClient;
        
        return supabaseClient;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar Supabase:', error);
        throw error;
    }
}

// SINCRONIZAR VENDAS
async function sincronizarVendasML() {
    if (sincronizando) {
        console.log('⏳ Sincronização já em andamento...');
        return;
    }
    
    sincronizando = true;
    console.log('🚀 INICIANDO SINCRONIZAÇÃO...');
    
    try {
        // 1. Inicializar Supabase
        const client = await inicializarSupabase();
        
        // 2. Verificar sessão
        const { data: { session }, error: authError } = await client.auth.getSession();
        if (authError || !session) {
            throw new Error('Usuário não autenticado! Faça login primeiro.');
        }
        
        console.log('✅ Usuário:', session.user.email);
        
        // 3. Token ML
        const token = localStorage.getItem('ml_access_token');
        if (!token) {
            throw new Error('Token ML não configurado!');
        }
        
        // 4. Buscar vendas
        const hoje = new Date();
        const diasAtras = new Date(hoje);
        diasAtras.setDate(diasAtras.getDate() - 15);
        const dataFormatada = diasAtras.toISOString().split('T')[0];
        
        const urlML = `https://api.mercadolibre.com/orders/search?seller=${SELLER_ID}&sort=date_desc&order.status=paid&order.date_created.from=${dataFormatada}T00:00:00.000-03:00&limit=50`;
        
        console.log('📡 Buscando vendas...');
        
        const workerURL = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(urlML)}&token=${token}`;
        const response = await fetch(workerURL);
        
        if (!response.ok) {
            throw new Error(`API retornou ${response.status}`);
        }
        
        const data = await response.json();
        const vendas = data.results || [];
        
        console.log(`✅ ${vendas.length} vendas encontradas`);
        
        if (vendas.length === 0) {
            console.log('📭 Nenhuma venda nova');
            return;
        }
        
        // 5. Salvar no Supabase
        let salvas = 0;
        
        for (const venda of vendas) {
            try {
                const item = venda.order_items?.[0]?.item || {};
                
                const dadosVenda = {
                    order_id: venda.id,
                    buyer_nickname: venda.buyer?.nickname || 'N/A',
                    total_amount: venda.total_amount,
                    status: venda.status,
                    date_created: venda.date_created,
                    date_closed: venda.date_closed,
                    sku: item.seller_custom_field || item.seller_sku || 'SEM_SKU',
                    produto_titulo: item.title || 'Produto sem título',
                    meio_envio: venda.shipping?.id ? 'Mercado Envios' : 'A combinar',
                    conferido: false,
                    estoque_fisico: null,
                    sincronizado_em: new Date().toISOString()
                };
                
                // Upsert
                const { error } = await client
                    .from('vendas_ml')
                    .upsert([dadosVenda], { onConflict: 'order_id' });
                
                if (error) {
                    console.log(`ℹ️ ${venda.id}: ${error.message}`);
                } else {
                    salvas++;
                    console.log(`✅ ${venda.id} salva`);
                }
                
            } catch (error) {
                console.error(`💥 Erro ${venda.id}:`, error);
            }
        }
        
        // 6. Resultado
        console.log(`🎉 ${salvas} vendas sincronizadas`);
        
        if (salvas > 0) {
            // Mostrar notificação
            const event = new CustomEvent('vendasSincronizadas', { 
                detail: { quantidade: salvas } 
            });
            document.dispatchEvent(event);
            
            // Recarregar dashboard
            if (typeof carregarVendasDashboard === 'function') {
                setTimeout(() => carregarVendasDashboard('pendentes'), 1000);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro sincronização:', error);
        alert(`❌ Erro: ${error.message}`);
    } finally {
        sincronizando = false;
    }
}

// BOTÃO NA INTERFACE
function adicionarBotaoSincronizacao() {
    const system = document.getElementById('salesSystem');
    if (!system) return;
    
    if (document.getElementById('btnSyncVendasFinal')) return;
    
    const header = system.querySelector('.card-header');
    if (header) {
        const btn = document.createElement('button');
        btn.id = 'btnSyncVendasFinal';
        btn.className = 'btn btn-success btn-sm ml-2';
        btn.innerHTML = '<i class="fas fa-sync"></i> Sincronizar Vendas';
        btn.onclick = sincronizarVendasML;
        header.appendChild(btn);
        console.log('✅ Botão adicionado');
    }
}

// INICIALIZAR
async function inicializarSistemaVendas() {
    console.log('🔧 Inicializando sistema de vendas...');
    
    try {
        await inicializarSupabase();
        adicionarBotaoSincronizacao();
        
        // Sincronizar automaticamente após 10 segundos
        setTimeout(() => {
            sincronizarVendasML();
        }, 10000);
        
        // Sincronizar a cada 5 minutos
        setInterval(() => {
            sincronizarVendasML();
        }, 5 * 60 * 1000);
        
        console.log('✅ Sistema de vendas inicializado');
        
    } catch (error) {
        console.error('❌ Erro inicialização:', error);
    }
}

// Exportar
window.sincronizarVendasML = sincronizarVendasML;
window.forcarSincronizacaoVendas = sincronizarVendasML;

// Iniciar quando carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(inicializarSistemaVendas, 3000);
    });
} else {
    setTimeout(inicializarSistemaVendas, 3000);
}

console.log('🛒 Sistema de vendas carregado. Digite sincronizarVendasML() para sincronizar.');