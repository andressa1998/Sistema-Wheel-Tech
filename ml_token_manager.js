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
    INITIAL_CODE: 'TG-698b403832600700012ba9fc-415176739', // SEU CÓDIGO ATUAL
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
            
            // Token expirado
            console.log('🔄 Token expirado, tentando renovar...');
            const newToken = await renewTokenWithRefreshToken(refreshToken);
            if (newToken) {
                return newToken;
            }
        }
        
        // 2. Se não tem token válido, obter novo
        console.log('🔄 Nenhum token válido encontrado, obtendo novo...');
        return await getNewTokenWithCode();
        
    } catch (error) {
        console.error('❌ Erro no autoManageMLToken:', error);
        showTokenError('ERRO NO SISTEMA');
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