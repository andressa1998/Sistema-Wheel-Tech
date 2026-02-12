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
    INITIAL_CODE: 'TG-698db26e53001500018e9324-415176739', // SEU CÓDIGO ATUAL
    USER_ID: '415176739',
    WORKER_URL: 'https://purple-bonus-3b1c.andmiotto1998.workers.dev' // ADICIONE ESTA LINHA
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
async function fetchMLSalesViaWorker(token, limit = 50) {
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
        // 1. TENTAR CARREGAR DO SUPABASE PRIMEIRO
        const { data: tokenDB, error } = await supabaseClient
            .from('mercadolivre_tokens')
            .select('*')
            .eq('user_id', ML_CONFIG.USER_ID)
            .single();
        
        if (tokenDB && tokenDB.refresh_token) {
            console.log('📦 Token carregado do Supabase');
            
            // Verificar se ainda é válido
            const expiresIn = tokenDB.expires_at - Date.now();
            
            if (expiresIn > 300000) { // > 5 minutos
                console.log(`✅ Token válido por mais ${Math.round(expiresIn/60000)} minutos`);
                
                // Atualizar localStorage
                localStorage.setItem('ml_access_token', tokenDB.access_token);
                localStorage.setItem('ml_refresh_token', tokenDB.refresh_token);
                localStorage.setItem('ml_token_expiry', tokenDB.expires_at.toString());
                
                mlTokenStatus = {
                    access_token: tokenDB.access_token,
                    refresh_token: tokenDB.refresh_token,
                    expires_at: tokenDB.expires_at,
                    is_valid: true,
                    last_update: new Date().toISOString()
                };
                
                updateTokenStatusUI();
                return tokenDB.access_token;
            }
            
            // Token expirado, tenta renovar
            if (expiresIn > 0 || expiresIn <= 300000) {
                console.log('🔄 Token próximo de expirar, renovando...');
                const newToken = await renewTokenWithRefreshToken(tokenDB.refresh_token);
                if (newToken) {
                    return newToken;
                }
            }
        }
        
        // 2. Fallback para localStorage
        const accessToken = localStorage.getItem('ml_access_token');
        const refreshToken = localStorage.getItem('ml_refresh_token');
        const tokenExpiry = localStorage.getItem('ml_token_expiry');
        
        if (accessToken && refreshToken && tokenExpiry) {
            const expiresIn = parseInt(tokenExpiry) - Date.now();
            if (expiresIn > 300000) {
                console.log(`✅ Token localStorage válido por mais ${Math.round(expiresIn/60000)} minutos`);
                return accessToken;
            }
        }
        
        // 3. Se não tem token válido, obter NOVO
        console.log('🔄 Nenhum token válido encontrado, obtendo novo...');
        return await getNewTokenWithCode();
        
    } catch (error) {
        console.error('❌ Erro no autoManageMLToken:', error);
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

// ml_token_manager.js - Substitua a função buscarVendasML
// ml_token_manager.js - Função buscarVendasML MODIFICADA
async function buscarVendasML(limit = 50) {
    try {
        console.log('🛒 Buscando vendas do Mercado Livre com detalhes...');
        
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) {
            console.error('❌ Token de acesso não disponível');
            return {
                success: false,
                error: 'Token de acesso não disponível',
                vendas: []
            };
        }
        
        // Buscar vendas pagas
        const agora = new Date();
        const trintaDiasAtras = new Date(agora);
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        
        const dataFormatada = trintaDiasAtras.toISOString().split('.')[0] + '-00:00';
        
        // URL para buscar ordens pagas
        const urlML = `https://api.mercadolibre.com/orders/search?seller=${ML_CONFIG.USER_ID}&sort=date_desc&order.status=paid&order.date_created.from=${dataFormatada}&limit=${limit}`;
        
        console.log('📡 URL da API:', urlML);
        
        const encodedUrl = encodeURIComponent(urlML);
        const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
        
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro na resposta do proxy:', response.status, errorText);
            return {
                success: false,
                error: `Erro ${response.status}: ${errorText}`,
                vendas: []
            };
        }
        
        const result = await response.json();
        
        console.log('📊 Resposta da API:', {
            total: result.paging?.total || 0,
            resultsCount: result.results?.length || 0
        });
        
        if (!result.results || result.results.length === 0) {
            return {
                success: true,
                vendas: [],
                total: 0
            };
        }
        
        // Processar vendas COM DETALHES COMPLETOS e ESTOQUE
        const vendasProcessadas = await processarVendasComDetalhesESTOQUE(result.results, tokenData.access_token);
        
        console.log(`✅ ${vendasProcessadas.length} vendas processadas do ML com detalhes de estoque e envio`);
        
        return {
            success: true,
            vendas: vendasProcessadas,
            total: result.paging?.total || vendasProcessadas.length,
            paging: result.paging || {}
        };
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas ML:', error);
        return {
            success: false,
            error: error.message,
            vendas: []
        };
    }
}

// NOVA FUNÇÃO: Buscar detalhes completos da venda + estoque + envio
async function processarVendasComDetalhesESTOQUE(vendas, token) {
    const vendasComDetalhes = [];
    
    console.log(`🔍 Buscando detalhes completos de ${vendas.length} vendas (estoque + envio)...`);
    
    for (const venda of vendas) {
        try {
            // 1. Buscar DETALHES COMPLETOS da ordem
            const urlDetalhes = `https://api.mercadolibre.com/orders/${venda.id}`;
            const encodedUrl = encodeURIComponent(urlDetalhes);
            const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(proxyUrl);
            const detalhes = await response.json();
            
            if (!response.ok) {
                console.warn(`⚠️ Não foi possível obter detalhes da venda ${venda.id}`);
                vendasComDetalhes.push(processarVendaBasica(venda));
                continue;
            }
            
            // 2. Buscar DETALHES DO ENVIO
            let dadosEnvio = null;
            let tipoEnvio = 'Não especificado';
            let idEnvio = null;
            
            if (detalhes.shipping?.id) {
                idEnvio = detalhes.shipping.id;
                try {
                    const urlEnvio = `https://api.mercadolibre.com/shipments/${idEnvio}`;
                    const encodedEnvioUrl = encodeURIComponent(urlEnvio);
                    const proxyEnvioUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedEnvioUrl}&token=${encodeURIComponent(token)}`;
                    
                    const envioResponse = await fetch(proxyEnvioUrl);
                    const envioData = await envioResponse.json();
                    
                    if (envioResponse.ok) {
                        dadosEnvio = envioData;
                        
                        // Identificar tipo de envio
                        if (envioData.logistic_type) {
                            tipoEnvio = envioData.logistic_type.toUpperCase();
                            
                            if (envioData.logistic_type === 'fulfillment') {
                                tipoEnvio = 'FULL';
                            } else if (envioData.logistic_type === 'drop_off') {
                                tipoEnvio = 'FLEX';
                            } else if (envioData.logistic_type === 'self_service') {
                                tipoEnvio = 'MERCADO ENVIOS';
                            }
                        }
                        
                        console.log(`📦 Venda ${venda.id} - Tipo Envio: ${tipoEnvio}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ Erro ao buscar envio ${idEnvio}:`, error);
                }
            }
            
            // 3. Buscar ESTOQUE DO PRODUTO (consultar item)
            let estoqueAnuncio = 0;
            let itemId = null;
            let variacaoId = null;
            let variacaoAtributos = [];
            let skuOriginal = null;
            
            if (detalhes.order_items && detalhes.order_items.length > 0) {
                const primeiroItem = detalhes.order_items[0];
                itemId = primeiroItem.item?.id;
                
                if (itemId) {
                    try {
                        // Buscar detalhes do item para pegar o estoque
                        const urlItem = `https://api.mercadolibre.com/items/${itemId}`;
                        const encodedItemUrl = encodeURIComponent(urlItem);
                        const proxyItemUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedItemUrl}&token=${encodeURIComponent(token)}`;
                        
                        const itemResponse = await fetch(proxyItemUrl);
                        const itemData = await itemResponse.json();
                        
                        if (itemResponse.ok) {
                            // Se tiver variação, pegar estoque da variação específica
                            if (primeiroItem.item?.variation_id) {
                                variacaoId = primeiroItem.item.variation_id;
                                
                                // Buscar detalhes da variação
                                if (itemData.variations) {
                                    const variacao = itemData.variations.find(v => v.id == variacaoId);
                                    if (variacao) {
                                        estoqueAnuncio = variacao.available_quantity || 0;
                                        skuOriginal = variacao.seller_sku || variacao.seller_custom_field;
                                        variacaoAtributos = variacao.attribute_combinations || [];
                                    }
                                }
                            } else {
                                // Produto sem variação
                                estoqueAnuncio = itemData.available_quantity || 0;
                                skuOriginal = itemData.seller_sku || itemData.seller_custom_field;
                            }
                            
                            console.log(`📦 Venda ${venda.id} - Item ${itemId} - Estoque: ${estoqueAnuncio} unidades`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Erro ao buscar estoque do item ${itemId}:`, error);
                    }
                }
            }
            
            // 4. Processar venda com TODOS os detalhes
            const vendaProcessada = processarVendaCompleta(
                venda, 
                detalhes, 
                tipoEnvio, 
                idEnvio, 
                estoqueAnuncio,
                itemId,
                variacaoId,
                variacaoAtributos,
                skuOriginal,
                dadosEnvio
            );
            
            vendasComDetalhes.push(vendaProcessada);
            
            // Delay para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error(`❌ Erro processar venda ${venda.id}:`, error);
            vendasComDetalhes.push(processarVendaBasica(venda));
        }
    }
    
    return vendasComDetalhes;
}

// FUNÇÃO: Processar venda com dados completos
function processarVendaCompleta(venda, detalhes, tipoEnvio, idEnvio, estoqueAnuncio, itemId, variacaoId, variacaoAtributos, skuOriginal, dadosEnvio) {
    try {
        // Extrair SKU
        let sku = 'SEM_SKU';
        if (detalhes.order_items && detalhes.order_items.length > 0) {
            const primeiroItem = detalhes.order_items[0];
            sku = primeiroItem.item?.seller_custom_field || 
                  primeiroItem.item?.seller_sku || 
                  skuOriginal || 
                  'SEM_SKU';
        }
        
        // Extrair título e quantidades
        const primeiroItem = detalhes.order_items?.[0] || {};
        const titulo = primeiroItem.item?.title || 'Venda sem título';
        const quantidade = detalhes.order_items?.reduce((total, item) => total + (item.quantity || 0), 0) || 1;
        const valorTotal = detalhes.paid_amount || detalhes.total_amount || 0;
        const valorUnitario = quantidade > 0 ? valorTotal / quantidade : 0;
        
        // Extrair cliente
        let cliente = 'Cliente não identificado';
        if (detalhes.buyer?.nickname) {
            cliente = detalhes.buyer.nickname;
        } else if (detalhes.buyer?.id) {
            cliente = `Cliente ID: ${detalhes.buyer.id}`;
        }
        
        // Processar ID da venda
        let idVenda = venda.id?.toString() || '';
        idVenda = idVenda.replace(/[^a-zA-Z0-9]/g, '');
        if (!idVenda || idVenda.length < 5) {
            idVenda = `ML${Date.now()}${Math.floor(Math.random() * 10000)}`;
        }
        if (!idVenda.startsWith('ML')) {
            idVenda = `ML${idVenda}`;
        }
        
        console.log(`✅ Venda ${idVenda} processada:`, {
            sku: sku,
            tipoEnvio: tipoEnvio,
            estoqueAnuncio: estoqueAnuncio,
            quantidade: quantidade
        });
        
        return {
            // Dados básicos
            id: idVenda,
            id_venda_ml: idVenda,
            title: titulo,
            titulo: titulo,
            buyer: { nickname: cliente },
            cliente: cliente,
            
            // SKU e estoque
            sku: sku,
            sku_original: skuOriginal || sku,
            codigo: sku,
            item_id: itemId,
            variacao_id: variacaoId,
            variacao_atributos: variacaoAtributos,
            estoque_anuncio: estoqueAnuncio, // NOVO: Estoque atual do anúncio
            estoque_fisico: 0, // NOVO: Para o usuário preencher
            
            // Quantidades e valores
            quantity: quantidade,
            quantidade: quantidade,
            unit_price: valorUnitario,
            preco_unitario: valorUnitario,
            total_amount: valorTotal,
            valor_total: valorTotal,
            
            // Datas
            date_created: detalhes.date_closed || detalhes.date_created || new Date().toISOString(),
            data_venda: detalhes.date_closed || detalhes.date_created || new Date().toISOString(),
            created_at: detalhes.date_closed || detalhes.date_created || new Date().toISOString(),
            
            // Status
            status: detalhes.status || 'paid',
            status_ml: detalhes.status || 'paid',
            status_sistema: 'nova',
            
            // Envio - NOVO
            tipo_envio: tipoEnvio,
            id_envio: idEnvio,
            dados_envio: dadosEnvio,
            shipping: detalhes.shipping || {},
            informacoes_envio: JSON.stringify({
                tipo: tipoEnvio,
                id: idEnvio,
                dados: dadosEnvio
            }),
            
            // Links
            permalink: null,
            link: null,
            
            // Dados completos
            order_items: detalhes.order_items || [],
            payments: detalhes.payments || [],
            informacoes_pagamento: JSON.stringify(detalhes.payments || {}),
            dados_completos: JSON.stringify(detalhes),
            
            // Metadados
            ultima_verificacao_estoque: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ Erro ao processar venda completa:', error);
        return processarVendaBasica(venda);
    }
}

// FUNÇÃO FALLBACK: Processamento básico
function processarVendaBasica(venda) {
    try {
        const idVenda = venda.id?.toString()?.replace(/[^a-zA-Z0-9]/g, '') || `ML${Date.now()}`;
        const finalId = idVenda.startsWith('ML') ? idVenda : `ML${idVenda}`;
        
        return {
            id: finalId,
            id_venda_ml: finalId,
            title: venda.title || 'Venda sem título',
            titulo: venda.title || 'Venda sem título',
            cliente: venda.buyer?.nickname || 'Cliente não identificado',
            sku: 'SEM_SKU',
            codigo: 'SEM_SKU',
            quantidade: venda.quantity || 1,
            valor_total: venda.total_amount || 0,
            data_venda: venda.date_created || new Date().toISOString(),
            created_at: venda.date_created || new Date().toISOString(),
            status_ml: venda.status || 'paid',
            status_sistema: 'nova',
            tipo_envio: 'Não disponível',
            estoque_anuncio: 0,
            estoque_fisico: 0,
            informacoes_envio: '{}',
            informacoes_pagamento: '{}',
            dados_completos: JSON.stringify(venda || {})
        };
    } catch (error) {
        return {
            id: `ML${Date.now()}`,
            id_venda_ml: `ML${Date.now()}`,
            titulo: 'Erro ao processar venda',
            cliente: 'Erro',
            sku: 'ERRO',
            quantidade: 0,
            valor_total: 0,
            data_venda: new Date().toISOString(),
            created_at: new Date().toISOString(),
            status_sistema: 'nova',
            tipo_envio: 'Erro',
            estoque_anuncio: 0,
            estoque_fisico: 0
        };
    }
}

// Adicione esta função para debug
async function testarConexaoVendas() {
    try {
        console.log('🧪 Testando conexão para vendas...');
        
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) {
            console.error('❌ Sem token');
            return false;
        }
        
        // Testar endpoint direto
        const testUrl = 'https://api.mercadolibre.com/users/me';
        const encodedUrl = encodeURIComponent(testUrl);
        const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
        
        const response = await fetch(proxyUrl);
        const userData = await response.json();
        
        if (userData.id) {
            console.log('✅ Usuário conectado:', userData.nickname);
            
            // Testar endpoint de orders
            const agora = new Date();
            const trintaDiasAtras = new Date(agora);
            trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 1); // Apenas 1 dia para teste
            
            const dataFormatada = trintaDiasAtras.toISOString().split('.')[0] + '-00:00';
            const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${userData.id}&sort=date_desc&order.status=paid&order.date_created.from=${dataFormatada}&limit=5`;
            
            console.log('📡 Testando orders URL:', ordersUrl);
            
            const encodedOrdersUrl = encodeURIComponent(ordersUrl);
            const ordersProxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedOrdersUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
            
            const ordersResponse = await fetch(ordersProxyUrl);
            const ordersData = await ordersResponse.json();
            
            console.log('📊 Resultado orders:', {
                success: ordersResponse.ok,
                total: ordersData.paging?.total || 0,
                results: ordersData.results?.length || 0
            });
            
            return ordersResponse.ok;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        return false;
    }
}

// Exporte para usar no console
window.testarConexaoVendas = testarConexaoVendas;

// Função para buscar detalhes das vendas
async function buscarDetalhesVendas(vendas, token) {
    const vendasComDetalhes = [];
    
    console.log(`🔍 Buscando detalhes de ${vendas.length} vendas...`);
    
    for (const venda of vendas) {
        try {
            // URL para buscar detalhes da ordem
            const urlDetalhes = `https://api.mercadolibre.com/orders/${venda.id}`;
            const encodedUrl = encodeURIComponent(urlDetalhes);
            
            const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(proxyUrl);
            const detalhes = await response.json();
            
            if (response.ok && detalhes) {
                vendasComDetalhes.push({
                    ...venda,
                    full_details: detalhes
                });
                console.log(`✅ Detalhes da venda ${venda.id} obtidos`);
            } else {
                vendasComDetalhes.push(venda);
                console.warn(`⚠️ Não foi possível obter detalhes da venda ${venda.id}`);
            }
            
            // Aguardar um pouco para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error(`❌ Erro buscar detalhes venda ${venda.id}:`, error);
            vendasComDetalhes.push(venda);
        }
    }
    
    return vendasComDetalhes;
}

// Função para processar vendas com detalhes
function processarVendasComDetalhes(vendasComDetalhes) {
    if (!Array.isArray(vendasComDetalhes) || vendasComDetalhes.length === 0) {
        return [];
    }
    
    console.log(`🔄 Processando ${vendasComDetalhes.length} vendas com detalhes...`);
    
    return vendasComDetalhes.map(venda => {
        try {
            // Usar detalhes completos se disponível
            const detalhes = venda.full_details || venda;
            
            console.log('📋 Dados da venda:', {
                id: detalhes.id,
                type: typeof detalhes.id,
                hasId: !!detalhes.id
            });
            
            // Extrair SKU dos itens
            let sku = 'SEM_SKU';
            let titulo = 'Venda sem título';
            let quantidadeTotal = 0;
            let valorTotal = 0;
            
            if (detalhes.order_items && Array.isArray(detalhes.order_items)) {
                // Pegar dados do primeiro item
                const primeiroItem = detalhes.order_items[0];
                
                // SKU
                sku = primeiroItem.item?.seller_custom_field || 
                      primeiroItem.item?.seller_sku || 
                      'SEM_SKU';
                
                // Título
                titulo = primeiroItem.item?.title || 'Venda sem título';
                
                // Quantidade total
                quantidadeTotal = detalhes.order_items.reduce((total, item) => 
                    total + (item.quantity || 0), 0);
                
                // Valor total (usar paid_amount se disponível)
                valorTotal = detalhes.paid_amount || detalhes.total_amount || 0;
            } else if (detalhes.order_items) {
                // Tentar acessar diretamente se não for array
                sku = detalhes.order_items.item?.seller_custom_field || 'SEM_SKU';
                titulo = detalhes.order_items.item?.title || 'Venda sem título';
                quantidadeTotal = detalhes.order_items.quantity || 1;
                valorTotal = detalhes.total_amount || 0;
            }
            
            // Valor unitário
            const valorUnitario = quantidadeTotal > 0 ? valorTotal / quantidadeTotal : valorTotal;
            
            // Cliente
            let cliente = 'Cliente não identificado';
            if (detalhes.buyer?.nickname) {
                cliente = detalhes.buyer.nickname;
            } else if (detalhes.buyer?.id) {
                cliente = `Cliente ID: ${detalhes.buyer.id}`;
            }
            
            // Data da venda
            const dataVenda = detalhes.date_closed || detalhes.date_created || new Date().toISOString();
            
            // ID CORRIGIDO: Remover caracteres inválidos
            let idVenda = detalhes.id;
            if (!idVenda || typeof idVenda !== 'string') {
                // Se não tiver ID, usar timestamp sem caracteres especiais
                idVenda = `ML${Date.now()}${Math.floor(Math.random() * 1000)}`;
            } else {
                // Limpar ID: manter apenas números e letras
                idVenda = idVenda.toString().replace(/[^a-zA-Z0-9]/g, '');
            }
            
            // Se o ID ainda estiver vazio, criar um novo
            if (!idVenda || idVenda.length < 5) {
                idVenda = `ML${Date.now()}${Math.floor(Math.random() * 10000)}`;
            }
            
            // Garantir que comece com ML
            if (!idVenda.startsWith('ML')) {
                idVenda = `ML${idVenda}`;
            }
            
            const vendaProcessada = {
                id: idVenda,
                id_venda_ml: typeof idVenda === 'string' && idVenda.startsWith('ML') ? idVenda : `ML${idVenda}`,
                title: titulo,
                titulo: titulo,
                buyer: {
                    nickname: cliente
                },
                cliente: cliente,
                sku: sku,
                codigo: sku,
                quantity: quantidadeTotal,
                quantidade: quantidadeTotal,
                unit_price: valorUnitario,
                preco_unitario: valorUnitario,
                total_amount: valorTotal,
                valor_total: valorTotal,
                date_created: dataVenda,
                data_venda: dataVenda,
                created_at: dataVenda,
                status: detalhes.status || 'paid',
                status_ml: detalhes.status || 'paid',
                status_sistema: 'nova',
                permalink: null,
                link: null,
                order_items: detalhes.order_items || [],
                payments: detalhes.payments || [],
                shipping: detalhes.shipping || {},
                raw_data: detalhes // Salvar dados brutos para debug
            };
            
            console.log(`✅ Venda ${vendaProcessada.id} processada:`, {
                sku: vendaProcessada.sku,
                quantidade: vendaProcessada.quantidade,
                valor: vendaProcessada.valor_total,
                cliente: vendaProcessada.cliente
            });
            
            return vendaProcessada;
            
        } catch (error) {
            console.error('❌ Erro ao processar venda:', error);
            console.error('Dados da venda que causaram erro:', venda);
            return null;
        }
    }).filter(venda => venda !== null);
}

// ml_token_manager.js - Adicione esta função
window.debugVendasRawData = async function() {
    try {
        console.log('=== DEBUG RAW DATA ===');
        
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) {
            console.error('❌ Sem token');
            return;
        }
        
        // Buscar dados brutos
        const agora = new Date();
        const trintaDiasAtras = new Date(agora);
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 1);
        
        const dataFormatada = trintaDiasAtras.toISOString().split('.')[0] + '-00:00';
        const urlML = `https://api.mercadolibre.com/orders/search?seller=${ML_CONFIG.USER_ID}&sort=date_desc&order.status=paid&order.date_created.from=${dataFormatada}&limit=2`;
        
        const encodedUrl = encodeURIComponent(urlML);
        const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
        
        console.log('🔗 Buscando dados brutos...');
        const response = await fetch(proxyUrl);
        const result = await response.json();
        
        console.log('📊 Resultado bruto:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.results && result.results.length > 0) {
            console.log('\n📦 Primeiro resultado detalhado:');
            const primeiro = result.results[0];
            console.log('ID:', primeiro.id, 'Tipo:', typeof primeiro.id);
            console.log('Estrutura:', Object.keys(primeiro));
            console.log('Order items:', primeiro.order_items);
            
            // Buscar detalhes completos
            const detalhesUrl = `https://api.mercadolibre.com/orders/${primeiro.id}`;
            const encodedDetalhesUrl = encodeURIComponent(detalhesUrl);
            const detalhesProxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedDetalhesUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
            
            const detalhesResponse = await fetch(detalhesProxyUrl);
            const detalhes = await detalhesResponse.json();
            
            console.log('\n🔍 Detalhes completos da ordem:');
            console.log(JSON.stringify(detalhes, null, 2));
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
};

// Adicione esta função em ml_token_manager.js
window.debugVendasDetalhes = async function() {
    console.log('=== DEBUG DETALHES VENDAS ===');
    
    try {
        const resultado = await buscarVendasML(5);
        console.log('Resultado:', resultado);
        
        if (resultado.success && resultado.vendas.length > 0) {
            console.log('Primeira venda detalhada:', JSON.stringify(resultado.vendas[0], null, 2));
            console.log('Estrutura da primeira venda:');
            console.log('- ID:', resultado.vendas[0].id);
            console.log('- SKU:', resultado.vendas[0].sku);
            console.log('- Título:', resultado.vendas[0].title);
            console.log('- Cliente:', resultado.vendas[0].cliente);
            console.log('- Quantidade:', resultado.vendas[0].quantidade);
            console.log('- Valor:', resultado.vendas[0].valor_total);
            console.log('- Status:', resultado.vendas[0].status_sistema);
        }
    } catch (error) {
        console.error('Erro:', error);
    }
    
    console.log('=== FIM DEBUG ===');
};

// ml_token_manager.js - FUNÇÃO DE TESTE DIRETO
async function testarAPIOrdenar() {
    try {
        console.log('🧪 Testando API de Orders diretamente...');
        
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) {
            throw new Error('Token não disponível');
        }
        
        // Teste simples: buscar minha conta
        const testUrl = `https://api.mercadolibre.com/users/me`;
        const encodedUrl = encodeURIComponent(testUrl);
        
        const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
        
        console.log('📡 Testando conexão:', proxyUrl);
        
        const response = await fetch(proxyUrl);
        const userData = await response.json();
        
        if (userData.id) {
            console.log('✅ Usuário encontrado:', userData.nickname);
            
            // Agora testar buscar orders
            const agora = new Date();
            const trintaDiasAtras = new Date(agora);
            trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
            
            const params = new URLSearchParams({
                seller: userData.id,
                sort: 'date_desc',
                'order.status': 'paid',
                limit: '5',
                offset: '0'
            });
            
            const ordersUrl = `https://api.mercadolibre.com/orders/search?${params.toString()}`;
            const encodedOrdersUrl = encodeURIComponent(ordersUrl);
            
            const ordersProxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedOrdersUrl}&token=${encodeURIComponent(tokenData.access_token)}`;
            
            console.log('📦 Buscando pedidos:', ordersProxyUrl.substring(0, 100) + '...');
            
            const ordersResponse = await fetch(ordersProxyUrl);
            const ordersData = await ordersResponse.json();
            
            console.log('📊 Resultado do teste:', {
                success: ordersResponse.ok,
                total: ordersData.paging?.total || 0,
                results: ordersData.results?.length || 0,
                firstOrder: ordersData.results?.[0]?.id || 'Nenhuma'
            });
            
            if (ordersData.results && ordersData.results.length > 0) {
                // Mostrar detalhes da primeira order
                const primeiraOrder = ordersData.results[0];
                console.log('📋 Primeira order:', {
                    id: primeiraOrder.id,
                    status: primeiraOrder.status,
                    total_amount: primeiraOrder.total_amount,
                    date_created: primeiraOrder.date_created
                });
            }
            
            return {
                success: true,
                user: userData,
                orders: ordersData
            };
        }
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        return {
            success: false,
            error: error.message
        };
    }
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

// ADICIONE ESTA FUNÇÃO EM ml_token_manager.js
async function salvarTokenNoSupabase(tokenData) {
    try {
        console.log('💾 Salvando token no Supabase...');
        
        // Primeiro, verificar se a tabela existe
        const { data: tableCheck, error: tableError } = await supabaseClient
            .from('mercadolivre_tokens')
            .select('count', { count: 'exact', head: true });
        
        if (tableError && tableError.code === '42P01') {
            console.log('📦 Tabela mercadolivre_tokens não existe. Criando...');
            
            // Criar a tabela
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS mercadolivre_tokens (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT NOT NULL,
                    expires_at BIGINT NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `;
            
            const { error: createError } = await supabaseClient.rpc('exec_sql', { sql: createTableSQL });
            
            if (createError) {
                console.warn('⚠️ Não foi possível criar tabela via RPC:', createError);
                // Fallback: usar localStorage apenas
                return false;
            }
        }
        
        // Salvar/Atualizar token
        const { error } = await supabaseClient
            .from('mercadolivre_tokens')
            .upsert({
                user_id: ML_CONFIG.USER_ID,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_at: Date.now() + (tokenData.expires_in * 1000),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        
        if (error) {
            console.error('❌ Erro ao salvar token no Supabase:', error);
            return false;
        }
        
        console.log('✅ Token salvo no Supabase com sucesso!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao salvar token:', error);
        return false;
    }
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