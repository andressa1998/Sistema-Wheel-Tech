// ============================================
// ML TOKEN MANAGER - VERSÃO FINAL CORRIGIDA
// ============================================
console.log('🔑 Sistema de Token ML para Cloudflare Worker inicializando...');

// ============================================
// CONFIGURAÇÕES
// ============================================
const WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
console.log('🔧 WORKER_URL:', WORKER_URL);
window.WORKER_URL = WORKER_URL;

const ML_CONFIG = {
    CLIENT_ID: '5767896809769647',
    CLIENT_SECRET: 'aHu0XHAHekqQC6gPtxeBgJDgM99jXd7A',
    REDIRECT_URI: 'https://purple-bonus-3b1c.andmiotto1998.workers.dev/callback',
    INITIAL_CODE: 'TG-698dc6a1c97d360001a048c2-415176739',
    USER_ID: '415176739',
    WORKER_URL: WORKER_URL
};

// ============================================
// ESTADO DO TOKEN
// ============================================
let mlTokenStatus = {
    access_token: null,
    refresh_token: null,
    expires_at: null,
    is_valid: false,
    last_update: null,
    user_info: null
};
window.mlTokenStatus = mlTokenStatus;

// ============================================
// FUNÇÕES DO WORKER
// ============================================
async function callWorker(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`${WORKER_URL}${endpoint}`, options);
        if (!response.ok) throw new Error(`Worker error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`❌ Erro ao chamar Worker ${endpoint}:`, error);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE TOKEN - API DIRETA
// ============================================
async function getTokenDiretoDaAPI() {
    try {
        console.log('🚀 Obtendo token DIRETAMENTE da API ML...');
        
        if (!ML_CONFIG.INITIAL_CODE || ML_CONFIG.INITIAL_CODE.includes('undefined')) {
            console.error('❌ Código inicial inválido');
            return null;
        }
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', ML_CONFIG.CLIENT_ID);
        params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
        params.append('code', ML_CONFIG.INITIAL_CODE);
        params.append('redirect_uri', ML_CONFIG.REDIRECT_URI);
        
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error('❌ Erro da API ML:', error);
            return null;
        }
        
        const data = await response.json();
        
        if (!data.access_token || !data.refresh_token) {
            console.error('❌ Token inválido:', data);
            return null;
        }
        
        console.log('✅ Token obtido com sucesso!');
        
        const expiresAt = Date.now() + (data.expires_in * 1000);
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
        scheduleTokenRenewal(data.expires_in * 1000);
        
        try { if (supabaseClient) await salvarTokenNoSupabase(data); } catch (e) {}
        
        return data.access_token;
        
    } catch (error) {
        console.error('❌ Erro ao obter token direto:', error);
        return null;
    }
}

async function renewTokenWithRefreshToken(refreshToken) {
    try {
        console.log('🔄 Renovando token com refresh token...');
        
        if (!refreshToken || refreshToken === 'undefined' || refreshToken.includes('undefined')) {
            console.error('❌ Refresh token inválido');
            return null;
        }
        
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', ML_CONFIG.CLIENT_ID);
        params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
        params.append('refresh_token', refreshToken);
        
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });
        
        if (!response.ok) {
            console.log('🔄 Renovação direta falhou, tentando Worker...');
            
            try {
                const workerData = await callWorker('/api/ml/refresh', 'POST', { refresh_token: refreshToken });
                if (workerData?.access_token) {
                    const expiresIn = workerData.expires_in || 21600;
                    const expiresAt = Date.now() + (expiresIn * 1000);
                    
                    localStorage.setItem('ml_access_token', workerData.access_token);
                    localStorage.setItem('ml_refresh_token', workerData.refresh_token || refreshToken);
                    localStorage.setItem('ml_token_expiry', expiresAt.toString());
                    
                    mlTokenStatus = {
                        access_token: workerData.access_token,
                        refresh_token: workerData.refresh_token || refreshToken,
                        expires_at: expiresAt,
                        is_valid: true,
                        last_update: new Date().toISOString(),
                        user_info: mlTokenStatus?.user_info || null
                    };
                    
                    updateTokenStatusUI();
                    scheduleTokenRenewal(expiresIn * 1000);
                    console.log('✅ Token renovado via Worker!');
                    return workerData.access_token;
                }
            } catch (workerError) {
                console.error('❌ Worker falhou:', workerError);
            }
            
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Erro na renovação:', errorData);
            return null;
        }
        
        const data = await response.json();
        
        if (!data.access_token) {
            console.error('❌ API retornou sem access_token');
            return null;
        }
        
        const expiresIn = data.expires_in || 21600;
        const expiresAt = Date.now() + (expiresIn * 1000);
        const novoRefreshToken = data.refresh_token || refreshToken;
        
        localStorage.setItem('ml_access_token', data.access_token);
        localStorage.setItem('ml_refresh_token', novoRefreshToken);
        localStorage.setItem('ml_token_expiry', expiresAt.toString());
        
        mlTokenStatus = {
            access_token: data.access_token,
            refresh_token: novoRefreshToken,
            expires_at: expiresAt,
            is_valid: true,
            last_update: new Date().toISOString(),
            user_info: mlTokenStatus?.user_info || null
        };
        
        updateTokenStatusUI();
        scheduleTokenRenewal(expiresIn * 1000);
        
        console.log('✅ Token renovado com sucesso!');
        return data.access_token;
        
    } catch (error) {
        console.error('❌ Erro na renovação:', error);
        return null;
    }
}

async function getNewTokenWithCode() {
    try {
        console.log('🔄 Obtendo novo token via Worker...');
        
        if (!ML_CONFIG.INITIAL_CODE || ML_CONFIG.INITIAL_CODE.includes('undefined')) {
            console.error('❌ Código inicial inválido');
            return await getTokenDiretoDaAPI();
        }
        
        const tokenData = await callWorker('/api/ml/token', 'POST', {
            code: ML_CONFIG.INITIAL_CODE
        });
        
        if (!tokenData?.access_token) {
            console.error('❌ Worker retornou sem access_token');
            return await getTokenDiretoDaAPI();
        }
        
        console.log('✅ Novo token obtido via Worker!');
        
        const expiresIn = tokenData.expires_in || 21600;
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
        return await getTokenDiretoDaAPI();
    }
}

// ============================================
// GERENCIAMENTO DE TOKEN
// ============================================
async function getValidToken() {
    console.log('🔑 Obtendo token válido...');
    
    try {
        if (mlTokenStatus?.access_token) {
            const expiresIn = (mlTokenStatus.expires_at || 0) - Date.now();
            if (expiresIn > 60000) {
                console.log(`✅ Token da memória válido por mais ${Math.round(expiresIn/60000)} minutos`);
                return {
                    access_token: mlTokenStatus.access_token,
                    refresh_token: mlTokenStatus.refresh_token,
                    expires_at: mlTokenStatus.expires_at
                };
            }
        }
        
        const accessToken = localStorage.getItem('ml_access_token');
        const refreshToken = localStorage.getItem('ml_refresh_token');
        const tokenExpiry = localStorage.getItem('ml_token_expiry');
        
        if (accessToken && refreshToken && tokenExpiry) {
            const expiresIn = parseInt(tokenExpiry) - Date.now();
            
            mlTokenStatus = {
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_at: parseInt(tokenExpiry),
                is_valid: true,
                last_update: new Date().toISOString(),
                user_info: mlTokenStatus?.user_info || null
            };
            
            if (expiresIn > 60000) {
                console.log(`✅ Token localStorage válido por mais ${Math.round(expiresIn/60000)} minutos`);
                return { access_token: accessToken, refresh_token: refreshToken, expires_at: parseInt(tokenExpiry) };
            }
            
            console.log('🔄 Token expirado, renovando...');
            const newToken = await renewTokenWithRefreshToken(refreshToken);
            if (newToken) {
                return {
                    access_token: newToken,
                    refresh_token: localStorage.getItem('ml_refresh_token'),
                    expires_at: parseInt(localStorage.getItem('ml_token_expiry') || '0')
                };
            }
        }
        
        console.log('🔄 Nenhum token válido, obtendo novo...');
        const token = await autoManageMLToken();
        if (token) {
            return {
                access_token: token,
                refresh_token: localStorage.getItem('ml_refresh_token'),
                expires_at: parseInt(localStorage.getItem('ml_token_expiry') || '0')
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro em getValidToken:', error);
        return null;
    }
}

async function autoManageMLToken() {
    console.log('🔄 Gerenciamento automático de token iniciado...');
    
    try {
        if (window.supabaseClient || supabaseClient) {
            try {
                const client = window.supabaseClient || supabaseClient;
                const { data } = await client
                    .from('mercadolivre_tokens')
                    .select('*')
                    .eq('user_id', ML_CONFIG.USER_ID);
                
                if (data?.[0]) {
                    const token = data[0];
                    const expiresIn = token.expires_at - Date.now();
                    
                    if (expiresIn > 300000) {
                        localStorage.setItem('ml_access_token', token.access_token);
                        localStorage.setItem('ml_refresh_token', token.refresh_token);
                        localStorage.setItem('ml_token_expiry', token.expires_at.toString());
                        
                        mlTokenStatus = {
                            access_token: token.access_token,
                            refresh_token: token.refresh_token,
                            expires_at: token.expires_at,
                            is_valid: true,
                            last_update: new Date().toISOString(),
                            user_info: null
                        };
                        
                        updateTokenStatusUI();
                        scheduleTokenRenewal(expiresIn);
                        return token.access_token;
                    }
                    
                    if (expiresIn > 0) {
                        console.log('🔄 Token próximo de expirar, renovando...');
                        return await renewTokenWithRefreshToken(token.refresh_token);
                    }
                }
            } catch (e) {
                console.warn('⚠️ Erro no Supabase:', e.message);
            }
        }
        
        const accessToken = localStorage.getItem('ml_access_token');
        const refreshToken = localStorage.getItem('ml_refresh_token');
        const tokenExpiry = localStorage.getItem('ml_token_expiry');
        
        if (accessToken && refreshToken && tokenExpiry) {
            const expiresIn = parseInt(tokenExpiry) - Date.now();
            
            if (expiresIn > 300000) {
                console.log(`✅ Token localStorage válido por mais ${Math.round(expiresIn/60000)} minutos`);
                
                mlTokenStatus = {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_at: parseInt(tokenExpiry),
                    is_valid: true,
                    last_update: new Date().toISOString(),
                    user_info: null
                };
                
                updateTokenStatusUI();
                scheduleTokenRenewal(expiresIn);
                return accessToken;
            }
            
            if (expiresIn > 0) {
                console.log('🔄 Token localStorage próximo de expirar, renovando...');
                return await renewTokenWithRefreshToken(refreshToken);
            }
        }
        
        console.log('🔄 Nenhum token válido, obtendo novo...');
        return await getTokenDiretoDaAPI();
        
    } catch (error) {
        console.error('❌ Erro no autoManageMLToken:', error);
        return null;
    }
}

function scheduleTokenRenewal(milliseconds) {
    const renewTime = milliseconds - 3600000;
    
    if (renewTime > 0) {
        console.log(`⏰ Agendando renovação em ${Math.round(renewTime/3600000)} horas`);
        
        setTimeout(async () => {
            console.log('⏰ Renovando token automaticamente...');
            const refreshToken = localStorage.getItem('ml_refresh_token');
            if (refreshToken) await renewTokenWithRefreshToken(refreshToken);
        }, renewTime);
    }
}

async function initializeMLAuth() {
    console.log('🔑 Inicializando autenticação Mercado Livre...');
    
    console.log('📦 Carregando token do localStorage');
    const accessToken = localStorage.getItem('ml_access_token');
    const refreshToken = localStorage.getItem('ml_refresh_token');
    const tokenExpiry = localStorage.getItem('ml_token_expiry');
    
    if (accessToken && refreshToken && tokenExpiry) {
        const expiresIn = parseInt(tokenExpiry) - Date.now();
        console.log(`⏰ Token expira em ${Math.round(expiresIn/60000)} minutos`);
        
        if (expiresIn < 3600000) {
            console.log('🔄 Token próximo de expirar, renovando ao iniciar...');
            const novoToken = await renewTokenWithRefreshToken(refreshToken);
            if (novoToken) {
                console.log('✅ Token renovado ao iniciar!');
                updateTokenStatusUI();
                return novoToken;
            }
        } else {
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
    }
    
    console.log('🔄 Nenhum token válido encontrado, obtendo novo...');
    return await getNewTokenWithCode();
}

// ============================================
// FUNÇÕES DE VENDAS
// ============================================
async function buscarVendasML(limit = 50) {
    try {
        console.log('🛒 Buscando vendas do Mercado Livre...');
        
        if (!mlTokenStatus?.access_token && localStorage.getItem('ml_access_token')) {
            console.log('🔄 Restaurando token do localStorage para memória...');
            mlTokenStatus = {
                access_token: localStorage.getItem('ml_access_token'),
                refresh_token: localStorage.getItem('ml_refresh_token'),
                expires_at: parseInt(localStorage.getItem('ml_token_expiry') || '0'),
                is_valid: true,
                last_update: new Date().toISOString(),
                user_info: mlTokenStatus?.user_info || null
            };
        }
        
        if (!mlTokenStatus?.access_token) {
            console.error('❌ mlTokenStatus sem access_token');
            const refreshToken = localStorage.getItem('ml_refresh_token');
            if (refreshToken) {
                console.log('🔄 Tentando renovar token...');
                const newToken = await renewTokenWithRefreshToken(refreshToken);
                if (!newToken) {
                    return { success: false, error: 'Token não disponível', vendas: [] };
                }
            } else {
                return { success: false, error: 'Token não disponível', vendas: [] };
            }
        }
        
        const accessToken = mlTokenStatus.access_token || localStorage.getItem('ml_access_token');
        if (!accessToken) {
            return { success: false, error: 'Token não disponível', vendas: [] };
        }
        
        console.log(`✅ Token obtido: ${accessToken.substring(0, 20)}...`);
        
        const limiteSeguro = Math.min(limit, 50);
        
        const agora = new Date();
        const trintaDiasAtras = new Date(agora);
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        
        const dataFormatada = trintaDiasAtras.toISOString();
        
        const urlML = `https://api.mercadolibre.com/orders/search?seller=${ML_CONFIG.USER_ID}&sort=date_desc&order.status=paid&order.date_created.from=${dataFormatada}&limit=${limiteSeguro}`;
        
        console.log('📡 URL da API:', urlML);
        
        const encodedUrl = encodeURIComponent(urlML);
        const proxyUrl = `${ML_CONFIG.WORKER_URL}/api/ml/proxy?url=${encodedUrl}&token=${encodeURIComponent(accessToken)}`;
        
        console.log('🔄 Chamando proxy...');
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro na resposta do proxy:', response.status, errorText);
            
            if (response.status === 401) {
                console.log('🔄 Token 401, tentando renovar...');
                const refreshToken = localStorage.getItem('ml_refresh_token');
                if (refreshToken) {
                    const newToken = await renewTokenWithRefreshToken(refreshToken);
                    if (newToken) {
                        console.log('✅ Token renovado, tentando novamente...');
                        return await buscarVendasML(limit);
                    }
                }
            }
            
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
        
        console.log('🔍 Processando detalhes de estoque e envio...');
        const vendasProcessadas = await processarVendasComDetalhesESTOQUE(
            result.results, 
            accessToken
        );
        
        console.log(`✅ ${vendasProcessadas.length} vendas processadas com detalhes`);
        
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

// ============================================
// FUNÇÃO CORRIGIDA - COM FLEX CORRETO
// ============================================
async function processarVendasComDetalhesESTOQUE(vendas, token) {
    const vendasComDetalhes = [];
    
    console.log(`🔍 Buscando SKU, ESTOQUE e ENVIO de ${vendas.length} vendas...`);
    
    for (const venda of vendas) {
        try {
            const orderUrl = `https://api.mercadolibre.com/orders/${venda.id}`;
            const orderProxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
            
            console.log(`🔄 Chamando worker para order: ${venda.id}`);
            const orderRes = await fetch(orderProxyUrl);
            
            if (!orderRes.ok) {
                console.warn(`⚠️ Erro ${orderRes.status} ao buscar order ${venda.id}`);
                vendasComDetalhes.push(processarVendaBasica(venda));
                continue;
            }
            
            const order = await orderRes.json();
            
            const primeiroItem = order.order_items?.[0] || {};
            const item = primeiroItem.item || {};
            
            let estoqueAnuncio = 0;
            let sku = item.seller_sku || item.seller_custom_field || 'SEM_SKU';
            
            if (item.id) {
                try {
                    const itemUrl = `https://api.mercadolibre.com/items/${item.id}`;
                    const itemProxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(token)}`;
                    
                    const itemRes = await fetch(itemProxyUrl);
                    
                    if (itemRes.ok) {
                        const itemData = await itemRes.json();
                        
                        if (item.variation_id && itemData.variations) {
                            const variacao = itemData.variations.find(v => String(v.id) === String(item.variation_id));
                            if (variacao) {
                                estoqueAnuncio = variacao.available_quantity || 0;
                                sku = variacao.seller_sku || sku;
                            }
                        } else {
                            estoqueAnuncio = itemData.available_quantity || 0;
                            sku = itemData.seller_sku || sku;
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao buscar item: ${e.message}`);
                }
            }
            
            // ===== 4. BUSCAR ENVIO - VIA WORKER (CORRIGIDO PARA FLEX) =====
            let tipoEnvio = 'N/I';
            if (order.shipping?.id) {
                try {
                    const shipUrl = `https://api.mercadolibre.com/shipments/${order.shipping.id}`;
                    const shipProxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                    
                    const shipRes = await fetch(shipProxyUrl);
                    
                    if (shipRes.ok) {
                        const shipData = await shipRes.json();
                        
                        // Log para debug
                        console.log('📦 Dados do envio:', {
                            id: order.shipping.id,
                            logistic_type: shipData.logistic_type,
                            substatus: shipData.substatus,
                            status: shipData.status
                        });
                        
                        if (shipData.logistic_type) {
                            const tipo = shipData.logistic_type.toLowerCase();
                            
                            // CORREÇÃO: Identificar FLEX corretamente
                            if (tipo === 'fulfillment' || tipo === 'fulfillment_me2') {
                                tipoEnvio = 'FULL';
                            } 
                            else if (tipo === 'drop_off' || tipo === 'xd_drop_off' || tipo === 'self_service') {
                                tipoEnvio = 'FLEX';  // TODOS esses são FLEX
                            } 
                            else if (tipo === 'cross_docking' || tipo === 'me2') {
                                tipoEnvio = 'MERCADO ENVIOS';
                            }
                            else {
                                // Se não identificou, verificar pelo substatus
                                if (shipData.substatus === 'fulfillment') {
                                    tipoEnvio = 'FULL';
                                } else if (shipData.substatus === 'drop_off') {
                                    tipoEnvio = 'FLEX';
                                } else {
                                    tipoEnvio = shipData.logistic_type.toUpperCase();
                                }
                            }
                            
                            console.log(`📦 Tipo de envio identificado: ${tipoEnvio} (logistic_type: ${tipo})`);
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao buscar envio: ${e.message}`);
                }
            }
            
            const idVenda = `ML${order.id}`.replace(/[^a-zA-Z0-9]/g, '');
            
            vendasComDetalhes.push({
                id: idVenda,
                id_venda_ml: idVenda,
                titulo: item.title || 'Sem título',
                cliente: order.buyer?.nickname || 'N/I',
                sku: sku,
                mlb_id: item.id || null,
                item_id: item.id || null,
                estoque_anuncio: estoqueAnuncio,
                quantidade: primeiroItem.quantity || 1,
                valor_total: order.paid_amount || order.total_amount || 0,
                data_venda: order.date_closed || order.date_created || new Date().toISOString(),
                created_at: order.date_closed || order.date_created || new Date().toISOString(),
                status_sistema: 'nova',
                tipo_envio: tipoEnvio,
                id_envio: order.shipping?.id || null,
                dados_completos: JSON.stringify(order)
            });
            
            console.log(`✅ Venda ${order.id}: SKU=${sku}, Estoque=${estoqueAnuncio}, Envio=${tipoEnvio}`);
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
        } catch (error) {
            console.error(`❌ Erro na venda ${venda.id}:`, error.message);
            vendasComDetalhes.push(processarVendaBasica(venda));
        }
    }
    
    return vendasComDetalhes;
}

function processarVendaBasica(venda) {
    return {
        id: `ML${venda.id || Date.now()}`,
        id_venda_ml: `ML${venda.id || Date.now()}`,
        titulo: venda.order_items?.[0]?.item?.title || 'Venda sem título',
        cliente: venda.buyer?.nickname || 'N/I',
        mlb_id: venda.mlb_id || venda.item_id || null,
        sku: 'SEM_SKU',
        estoque_anuncio: 0,
        estoque_fisico: 0,
        quantidade: venda.order_items?.[0]?.quantity || 1,
        valor_total: venda.total_amount || 0,
        data_venda: venda.date_created || new Date().toISOString(),
        created_at: venda.date_created || new Date().toISOString(),
        status_sistema: 'nova',
        tipo_envio: 'N/I',
        id_envio: null,
        dados_completos: JSON.stringify(venda)
    };
}

// ============================================
// SUPABASE
// ============================================
async function salvarTokenNoSupabase(tokenData) {
    try {
        if (!supabaseClient || !tokenData?.access_token) return false;
        
        await supabaseClient
            .from('mercadolivre_tokens')
            .upsert({
                user_id: ML_CONFIG.USER_ID,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || '',
                expires_at: Date.now() + ((tokenData.expires_in || 21600) * 1000),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        
        console.log('✅ Token salvo no Supabase');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao salvar token:', error);
        return false;
    }
}

// ============================================
// INTERFACE
// ============================================
function updateTokenStatusUI() {
    const el = document.getElementById('mlTokenStatus');
    const txt = document.getElementById('mlTokenText');
    if (!el || !txt) return;
    
    el.style.display = 'block';
    
    if (mlTokenStatus.is_valid && mlTokenStatus.expires_at) {
        const expiresIn = mlTokenStatus.expires_at - Date.now();
        
        if (expiresIn > 0) {
            const hours = Math.floor(expiresIn / 3600000);
            const mins = Math.floor((expiresIn % 3600000) / 60000);
            txt.innerHTML = `<i class="fas fa-check-circle"></i> Token ML: OK (${hours}h ${mins}m)`;
            el.className = hours < 1 ? 'token-expiring' : 'token-valid';
        } else {
            txt.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: EXPIRADO`;
            el.className = 'token-expired';
        }
    } else {
        txt.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Token ML: INICIALIZANDO...`;
    }
}

function showTokenError(msg) {
    const el = document.getElementById('mlTokenStatus');
    const txt = document.getElementById('mlTokenText');
    if (el && txt) {
        txt.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: ${msg}`;
        el.className = 'token-expired';
        el.style.display = 'block';
    }
}

// ============================================
// DEBUG
// ============================================
window.verificarTokenML = async function() {
    const token = await autoManageMLToken();
    if (!token) return alert('❌ Token não obtido');
    
    try {
        const res = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const user = await res.json();
            alert(`✅ Token OK!\nUsuário: ${user.nickname}`);
        } else {
            alert('❌ Token inválido');
        }
    } catch (e) {
        alert('❌ Erro: ' + e.message);
    }
};

window.testarConexaoVendas = async function() {
    const tokenData = await getValidToken();
    if (!tokenData?.access_token) return console.error('❌ Sem token');
    
    const testUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent('https://api.mercadolibre.com/users/me')}&token=${tokenData.access_token}`;
    const res = await fetch(testUrl);
    const data = await res.json();
    console.log('✅ Usuário:', data.nickname);
};

window.debugVendasDetalhes = async function() {
    const resultado = await buscarVendasML(5);
    console.log('Resultado:', resultado);
};

// ============================================
// EXPORTAÇÕES
// ============================================
window.WORKER_URL = WORKER_URL;
window.ML_CONFIG = ML_CONFIG;
window.mlTokenStatus = mlTokenStatus;
window.getValidToken = getValidToken;
window.renewTokenWithRefreshToken = renewTokenWithRefreshToken;
window.getTokenDiretoDaAPI = getTokenDiretoDaAPI;
window.getNewTokenWithCode = getNewTokenWithCode;
window.autoManageMLToken = autoManageMLToken;
window.initializeMLAuth = initializeMLAuth;
window.buscarVendasML = buscarVendasML;
window.processarVendasComDetalhesESTOQUE = processarVendasComDetalhesESTOQUE;
window.sincronizarVendasComSupabase = sincronizarVendasComSupabase;
window.updateTokenStatusUI = updateTokenStatusUI;

console.log('✅ ML Token Manager carregado e pronto!');

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeMLAuth, 1500);
    });
} else {
    setTimeout(initializeMLAuth, 1000);
}