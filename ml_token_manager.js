// ml_token_manager.js - VERSÃO COM WORKER CLOUDFLARE
console.log('🔑 Sistema de Token ML para Cloudflare Worker inicializando...');

// ml_token_manager.js - LINHA 7
const WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

// E garanta que esta função seja exportada
window.WORKER_URL = WORKER_URL;

// Configurações
const ML_CONFIG = {
    CLIENT_ID: '5767896809769647',
    CLIENT_SECRET: 'aHu0XHAHekqQC6gPtxeBgJDgM99jXd7A',
    REDIRECT_URI: 'https://homework-fees-saving-beliefs.trycloudflare.com/callback',
    INITIAL_CODE: 'TG-698b6032276d3c00011ce658-415176739', // SEU CÓDIGO ATUAL
    USER_ID: '415176739'
};

// ===== ESTADO DO TOKEN =====
let mlTokenStatus = {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    is_valid: false,
    last_update: null,
    user_info: null
};

// ===== FUNÇÕES PARA CHAMAR O WORKER =====

async function callWorker(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${WORKER_URL}${endpoint}`, options);
        
        if (!response.ok) {
            throw new Error(`Worker error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`❌ Erro ao chamar Worker ${endpoint}:`, error);
        throw error;
    }
}

// ===== FUNÇÃO PARA OBTER NOVO TOKEN =====
async function getNewTokenWithCode() {
    try {
        console.log('🔄 Obtendo novo token via Worker...');
        
        const tokenData = await callWorker('/api/ml/token', 'POST', {
            code: ML_CONFIG.INITIAL_CODE
        });
        
        console.log('✅ Novo token obtido via Worker!');
        console.log('Access Token:', tokenData.access_token?.substring(0, 30) + '...');
        console.log('Refresh Token:', tokenData.refresh_token?.substring(0, 30) + '...');
        console.log('Expira em:', tokenData.expires_in, 'segundos');
        
        // Salvar token
        const expiresIn = tokenData.expires_in || 21600; // 6 horas padrão
        const expiresAt = Date.now() + (expiresIn * 1000);
        
        localStorage.setItem('ml_access_token', tokenData.access_token);
        localStorage.setItem('ml_refresh_token', tokenData.refresh_token);
        localStorage.setItem('ml_token_expiry', expiresAt.toString());
        localStorage.setItem('ml_user_id', tokenData.user_id || ML_CONFIG.USER_ID);
        
        mlTokenStatus = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: expiresAt,
            is_valid: true,
            last_update: new Date().toISOString(),
            user_info: null
        };
        
        updateTokenStatusUI();
        scheduleTokenRenewal(expiresIn * 1000);
        
        return tokenData.access_token;
        
    } catch (error) {
        console.error('❌ Erro ao obter token via Worker:', error);
        showTokenError('FALHA NO WORKER');
        return null;
    }
}

// ===== FUNÇÃO PARA RENOVAR TOKEN =====
async function renewTokenWithRefreshToken(refreshToken) {
    try {
        console.log('🔄 Renovando token via Worker...');
        
        const tokenData = await callWorker('/api/ml/refresh', 'POST', {
            refresh_token: refreshToken
        });
        
        console.log('✅ Token renovado via Worker!');
        
        // Salvar novo token
        const expiresIn = tokenData.expires_in || 21600;
        const expiresAt = Date.now() + (expiresIn * 1000);
        
        localStorage.setItem('ml_access_token', tokenData.access_token);
        localStorage.setItem('ml_refresh_token', tokenData.refresh_token || refreshToken);
        localStorage.setItem('ml_token_expiry', expiresAt.toString());
        
        mlTokenStatus = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || refreshToken,
            expires_at: expiresAt,
            is_valid: true,
            last_update: new Date().toISOString(),
            user_info: mlTokenStatus.user_info
        };
        
        updateTokenStatusUI();
        scheduleTokenRenewal(expiresIn * 1000);
        
        return tokenData.access_token;
    } catch (error) {
        console.error('❌ Erro na renovação via Worker:', error);
        return null;
    }
}

// ===== FUNÇÃO PARA AGENDAR RENOVAÇÃO =====
function scheduleTokenRenewal(milliseconds) {
    // Renovar 1 hora antes de expirar
    const renewTime = milliseconds - 3600000;
    
    if (renewTime > 0) {
        console.log(`⏰ Agendando renovação em ${Math.round(renewTime/3600000)} horas`);
        
        setTimeout(async () => {
            console.log('⏰ Hora de renovar o token automaticamente...');
            const refreshToken = localStorage.getItem('ml_refresh_token');
            if (refreshToken) {
                await renewTokenWithRefreshToken(refreshToken);
            }
        }, renewTime);
    }
}

// ===== FUNÇÃO PARA TESTAR CONEXÃO =====
async function testMLConnection(token = null) {
    try {
        const accessToken = token || mlTokenStatus.access_token;
        
        if (!accessToken) {
            console.error('❌ Nenhum token disponível para teste');
            return false;
        }
        
        // Usar o Worker como proxy para testar
        const userData = await callWorker(`/api/ml/proxy?url=https://api.mercadolibre.com/users/me&token=${accessToken}`);
        
        console.log(`✅ Conexão ML bem-sucedida: ${userData.nickname}`);
        
        // Atualizar informações do usuário
        mlTokenStatus.user_info = userData;
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao testar conexão ML:', error);
        return false;
    }
}

// ===== FUNÇÃO PARA BUSCAR VENDAS VIA WORKER =====
async function fetchMLSalesViaWorker(token, limit = 20) {
    try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        const url = `https://api.mercadolibre.com/orders/search?seller=${ML_CONFIG.USER_ID}&sort=date_desc&order.status=paid&order.date_created.from=${threeDaysAgo.toISOString().split('T')[0]}&limit=${limit}`;
        
        const salesData = await callWorker(`/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (salesData.results && salesData.results.length > 0) {
            console.log(`✅ ${salesData.results.length} vendas encontradas via Worker`);
            return salesData.results;
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas via Worker:', error);
        return [];
    }
}

// ===== FUNÇÃO PRINCIPAL PARA GERENCIAR TOKEN =====
// NO ml_token_manager.js - Substitua a função autoManageMLToken:

async function autoManageMLToken() {
  console.log('🔄 Gerenciamento automático de token iniciado...');
  
  try {
    // 1. Verificar se já tem token salvo
    const accessToken = localStorage.getItem('ml_access_token');
    const refreshToken = localStorage.getItem('ml_refresh_token');
    const tokenExpiry = localStorage.getItem('ml_token_expiry');
    
    if (accessToken && refreshToken && tokenExpiry) {
      const expiresIn = parseInt(tokenExpiry) - Date.now();
      
      if (expiresIn > 300000) { // > 5 minutos
        console.log(`✅ Token válido por mais ${Math.round(expiresIn/60000)} minutos`);
        
        mlTokenStatus = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: parseInt(tokenExpiry),
          is_valid: true,
          last_update: new Date().toISOString(),
          user_info: mlTokenStatus.user_info
        };
        
        updateTokenStatusUI();
        return accessToken;
      }
      
      if (expiresIn > 0) { // > 0 mas < 5 minutos
        console.log(`🔄 Token expira em ${Math.round(expiresIn/60000)} minutos, renovando...`);
        const newToken = await renewTokenWithRefreshToken(refreshToken);
        if (newToken) {
          return newToken;
        }
      }
    }
    
    // 2. Se não tem token válido, obter NOVO token DIRETO
    console.log('🔄 Nenhum token válido encontrado, obtendo novo DIRETAMENTE...');
    return await getTokenDiretoDaAPI();
    
  } catch (error) {
    console.error('❌ Erro no autoManageMLToken:', error);
    showTokenError('ERRO NO SISTEMA');
    return null;
  }
}

// ADICIONE esta função:
async function getTokenDiretoDaAPI() {
  try {
    console.log('🚀 Obtendo token DIRETAMENTE da API ML...');
    
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', ML_CONFIG.CLIENT_ID);
    params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
    params.append('code', ML_CONFIG.INITIAL_CODE);
    params.append('redirect_uri', ML_CONFIG.REDIRECT_URI);
    
    console.log('📤 Enviando para API ML diretamente...');
    
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'MercadoLivre-Browser-Client/1.0'
      },
      body: params
    });
    
    console.log('📥 Status direto:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro da API ML:', errorText);
      
      // Se der erro, tenta pelo Worker como fallback
      console.log('🔄 Tentando pelo Worker como fallback...');
      return await getNewTokenWithCode();
    }
    
    const data = await response.json();
    console.log('✅ Token obtido DIRETAMENTE!');
    
    // Salvar token
    const expiresIn = data.expires_in || 21600;
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    localStorage.setItem('ml_access_token', data.access_token);
    localStorage.setItem('ml_refresh_token', data.refresh_token);
    localStorage.setItem('ml_token_expiry', expiresAt.toString());
    localStorage.setItem('ml_user_id', data.user_id || ML_CONFIG.USER_ID);
    
    mlTokenStatus = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      is_valid: true,
      last_update: new Date().toISOString(),
      user_info: null
    };
    
    updateTokenStatusUI();
    scheduleTokenRenewal(expiresIn * 1000);
    
    return data.access_token;
    
  } catch (error) {
    console.error('❌ Erro ao obter token direto:', error);
    
    // Última tentativa: Worker
    console.log('🔄 Última tentativa: Worker...');
    return await getNewTokenWithCode();
  }
}

// MODIFIQUE renewTokenWithRefreshToken também:
async function renewTokenWithRefreshToken(refreshToken) {
  try {
    console.log('🔄 Renovando token DIRETAMENTE...');
    
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', ML_CONFIG.CLIENT_ID);
    params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
    params.append('refresh_token', refreshToken);
    
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'MercadoLivre-Browser-Client/1.0'
      },
      body: params
    });
    
    if (!response.ok) {
      console.log('🔄 Renovação direta falhou, tentando Worker...');
      // Fallback para Worker
      return await callWorker('/api/ml/refresh', 'POST', { refresh_token: refreshToken })
        .then(data => {
          if (data.access_token) {
            const expiresIn = data.expires_in || 21600;
            const expiresAt = Date.now() + (expiresIn * 1000);
            
            localStorage.setItem('ml_access_token', data.access_token);
            localStorage.setItem('ml_refresh_token', data.refresh_token || refreshToken);
            localStorage.setItem('ml_token_expiry', expiresAt.toString());
            
            mlTokenStatus.access_token = data.access_token;
            mlTokenStatus.refresh_token = data.refresh_token || refreshToken;
            mlTokenStatus.expires_at = expiresAt;
            mlTokenStatus.is_valid = true;
            mlTokenStatus.last_update = new Date().toISOString();
            
            updateTokenStatusUI();
            scheduleTokenRenewal(expiresIn * 1000);
            
            return data.access_token;
          }
          return null;
        })
        .catch(() => null);
    }
    
    const data = await response.json();
    
    // Salvar novo token
    const expiresIn = data.expires_in || 21600;
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    localStorage.setItem('ml_access_token', data.access_token);
    localStorage.setItem('ml_refresh_token', data.refresh_token || refreshToken);
    localStorage.setItem('ml_token_expiry', expiresAt.toString());
    
    mlTokenStatus = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: expiresAt,
      is_valid: true,
      last_update: new Date().toISOString(),
      user_info: mlTokenStatus.user_info
    };
    
    updateTokenStatusUI();
    scheduleTokenRenewal(expiresIn * 1000);
    
    return data.access_token;
  } catch (error) {
    console.error('❌ Erro na renovação direta:', error);
    return null;
  }
}

// ===== FUNÇÃO PARA ATUALIZAR INTERFACE =====
function updateTokenStatusUI() {
    const tokenStatusElement = document.getElementById('mlTokenStatus');
    const tokenTextElement = document.getElementById('mlTokenText');
    
    if (!tokenStatusElement || !tokenTextElement) {
        console.warn('⚠️ Elementos de status do token não encontrados');
        return;
    }
    
    // Sempre mostrar o elemento
    tokenStatusElement.style.display = 'block';
    
    if (mlTokenStatus.is_valid && mlTokenStatus.expires_at) {
        const expiresIn = mlTokenStatus.expires_at - Date.now();
        
        if (expiresIn > 0) {
            const hoursLeft = Math.floor(expiresIn / 3600000);
            const minutesLeft = Math.floor((expiresIn % 3600000) / 60000);
            
            tokenTextElement.innerHTML = `<i class="fas fa-check-circle"></i> Token ML: OK (${hoursLeft}h ${minutesLeft}m)`;
            tokenStatusElement.className = 'token-valid';
            
            // Se faltar menos de 1 hora, mostrar alerta
            if (hoursLeft < 1) {
                tokenTextElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Token ML: EXPIRA EM ${minutesLeft} MIN`;
                tokenStatusElement.className = 'token-expiring';
            }
        } else {
            tokenTextElement.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: EXPIRADO`;
            tokenStatusElement.className = 'token-expired';
        }
    } else {
        tokenTextElement.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Token ML: INICIALIZANDO...`;
        tokenStatusElement.className = '';
    }
}

function showTokenError(message) {
    const tokenStatusElement = document.getElementById('mlTokenStatus');
    const tokenTextElement = document.getElementById('mlTokenText');
    
    if (tokenStatusElement && tokenTextElement) {
        tokenTextElement.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: ${message}`;
        tokenStatusElement.className = 'token-expired';
        tokenStatusElement.style.display = 'block';
    }
}

// ===== INICIALIZAR =====
async function initializeMLAuth() {
    console.log('🔑 Inicializando autenticação Mercado Livre...');
    
    // Mostrar status imediatamente
    updateTokenStatusUI();
    
    try {
        const token = await autoManageMLToken();
        
        if (token) {
            // Testar conexão
            const connectionOK = await testMLConnection(token);
            
            if (connectionOK) {
                console.log('✅ Autenticação ML configurada com sucesso!');
                
                // Agendar verificação periódica (a cada 5 minutos)
                setInterval(() => {
                    autoManageMLToken();
                }, 5 * 60 * 1000);
                
                return token;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro na inicialização ML:', error);
        showTokenError('FALHA NA INICIALIZAÇÃO');
        return null;
    }
}

// Adicione no ml_token_manager.js
window.verificarTokenML = async function() {
  try {
    const token = await autoManageMLToken();
    if (!token) {
      console.error('❌ Não foi possível obter token');
      return;
    }
    
    console.log('✅ Token obtido:', token.substring(0, 30) + '...');
    
    // Testar conexão direta
    const response = await fetch('https://api.mercadolibre.com/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const userData = await response.json();
      console.log('✅ Conexão direta OK:', userData.nickname);
      alert(`✅ Token válido!\nUsuário: ${userData.nickname}\nToken: ${token.substring(0, 30)}...`);
    } else {
      console.error('❌ Token inválido:', response.status);
      alert('❌ Token inválido ou expirado');
    }
  } catch (error) {
    console.error('❌ Erro:', error);
    alert('❌ Erro: ' + error.message);
  }
};

// ============================================
// FUNÇÃO PARA BUSCAR VENDAS DO ML
// ============================================

async function buscarVendasML(limit = 50) {
    console.log('🛒 Buscando vendas do Mercado Livre...');
    
    try {
        // 1. Obter token válido
        const token = await autoManageMLToken();
        
        if (!token) {
            throw new Error('Não foi possível obter token válido');
        }
        
        // 2. Buscar vendas
        const response = await fetch(`https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/orders?token=${token}&limit=${limit}&seller=415176739`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // 3. Processar resultados
        if (data.results && data.results.length > 0) {
            console.log(`✅ ${data.results.length} vendas encontradas`);
            return processarVendasML(data.results);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        return [];
    }
}

function processarVendasML(vendas) {
    return vendas.map(venda => {
        const item = venda.order_items && venda.order_items.length > 0 ? venda.order_items[0] : {};
        
        return {
            id: venda.id,
            numero_venda: venda.external_reference || `ML-${venda.id}`,
            data_venda: new Date(venda.date_created).toLocaleString('pt-BR'),
            valor_total: venda.total_amount || 0,
            quantidade_itens: venda.order_items?.length || 0,
            comprador: venda.buyer?.nickname || 'Não informado',
            status: 'nova',
            verificada: false,
            
            // Detalhes do item principal
            item_titulo: item.item?.title || 'Produto não identificado',
            item_sku: item.item?.seller_custom_field || item.item?.seller_sku || 'N/A',
            item_quantidade: item.quantity || 1,
            item_preco_unitario: item.unit_price || 0,
            
            // Informações de envio
            meio_envio: venda.shipping?.id ? "Mercado Envios" : "A combinar",
            
            // Informações adicionais
            metodo_pagamento: venda.payments?.[0]?.payment_type || 'Não informado',
            tags: venda.tags || [],
            dados_completos: venda
        };
    });
}

// ============================================
// FUNÇÃO PARA SINCRONIZAR VENDAS COM SUPABASE
// ============================================

async function sincronizarVendasComSupabase() {
    console.log('🔄 Sincronizando vendas com Supabase...');
    
    try {
        // 1. Buscar vendas do ML
        const vendasML = await buscarVendasML(100);
        
        if (vendasML.length === 0) {
            console.log('📭 Nenhuma venda para sincronizar');
            return;
        }
        
        // 2. Para cada venda, salvar no Supabase
        for (const venda of vendasML) {
            try {
                const { data, error } = await supabaseClient
                    .from('vendas_ml')
                    .upsert({
                        order_id: venda.id,
                        numero_venda: venda.numero_venda,
                        data_venda: new Date(venda.data_venda),
                        valor_total: venda.valor_total,
                        comprador: venda.comprador,
                        item_titulo: venda.item_titulo,
                        item_sku: venda.item_sku,
                        item_quantidade: venda.item_quantidade,
                        meio_envio: venda.meio_envio,
                        status: 'nova',
                        verificada: false,
                        dados_completos: venda.dados_completos
                    }, { 
                        onConflict: 'order_id',
                        ignoreDuplicates: false 
                    });
                
                if (error) {
                    console.error(`❌ Erro ao salvar venda ${venda.id}:`, error);
                } else {
                    console.log(`✅ Venda ${venda.id} sincronizada`);
                }
            } catch (error) {
                console.error(`❌ Erro no processamento da venda ${venda.id}:`, error);
            }
        }
        
        console.log(`✅ Sincronização concluída: ${vendasML.length} vendas processadas`);
        showToast(`✅ ${vendasML.length} vendas sincronizadas`, 'success');
        
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        showToast('❌ Erro ao sincronizar vendas', 'error');
    }
}

// ============================================
// FUNÇÃO PARA RENOVAÇÃO AUTOMÁTICA (A CADA 6H)
// ============================================

function iniciarRenovacaoAutomatica() {
    console.log('⏰ Configurando renovação automática do token (6h)...');
    
    // Renovar token a cada 6 horas (21600000 ms)
    setInterval(async () => {
        console.log('🔄 Renovação automática do token iniciada...');
        try {
            const token = await autoManageMLToken();
            if (token) {
                console.log('✅ Token renovado automaticamente');
                updateMLTokenStatusUI(true, 'Renovado automaticamente');
            }
        } catch (error) {
            console.error('❌ Erro na renovação automática:', error);
            updateMLTokenStatusUI(false, 'Falha na renovação');
        }
    }, 21600000); // 6 horas
    
    // Sincronizar vendas a cada 30 minutos
    setInterval(() => {
        sincronizarVendasComSupabase();
    }, 1800000); // 30 minutos
}

// ============================================
// INICIALIZAÇÃO COMPLETA
// ============================================

async function inicializarSistemaCompletoML() {
    console.log('🚀 Inicializando sistema completo ML...');
    
    try {
        // 1. Inicializar autenticação
        const token = await initializeMLAuth();
        
        if (!token) {
            console.error('❌ Falha na inicialização da autenticação ML');
            return;
        }
        
        // 2. Testar conexão
        console.log('🔗 Testando conexão com ML...');
        const response = await fetch(`https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/test?token=${token}`);
        const testResult = await response.json();
        
        if (testResult.success) {
            console.log(`✅ Conectado ao ML como: ${testResult.user.nickname}`);
            showToast(`✅ Conectado ao ML como ${testResult.user.nickname}`, 'success');
        }
        
        // 3. Iniciar renovação automática
        iniciarRenovacaoAutomatica();
        
        // 4. Sincronizar vendas iniciais
        setTimeout(() => {
            sincronizarVendasComSupabase();
        }, 5000);
        
        console.log('✅ Sistema ML inicializado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na inicialização do sistema ML:', error);
    }
}

// Exportar funções
window.buscarVendasML = buscarVendasML;
window.sincronizarVendasComSupabase = sincronizarVendasComSupabase;
window.inicializarSistemaCompletoML = inicializarSistemaCompletoML;

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    // Esperar um pouco para tudo carregar
    setTimeout(() => {
        if (currentUser) {
            inicializarSistemaCompletoML();
        }
    }, 3000);
});

// ===== EXPORTAR FUNÇÕES =====
window.autoManageMLToken = autoManageMLToken;
window.renewTokenWithRefreshToken = renewTokenWithRefreshToken;
window.testMLConnection = testMLConnection;
window.initializeMLAuth = initializeMLAuth;
window.updateTokenStatusUI = updateTokenStatusUI;
window.fetchMLSalesViaWorker = fetchMLSalesViaWorker;
window.mlTokenStatus = mlTokenStatus;
window.testMLConnection = testMLConnection;

console.log('✅ Sistema de Token ML carregado e pronto!');

// ===== INICIALIZAR QUANDO O SISTEMA CARREGAR =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM carregado, inicializando ML Auth...');
        setTimeout(initializeMLAuth, 1500);
    });
} else {
    console.log('📄 DOM já carregado, inicializando ML Auth...');
    setTimeout(initializeMLAuth, 1000);
}