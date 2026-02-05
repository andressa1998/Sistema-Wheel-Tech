// ============================================
// SISTEMA AUTOMÁTICO DE TOKEN MERCADO LIVRE
// ============================================

// Verificar se já foi inicializado para evitar duplicação
if (!window.ML_AUTH_INITIALIZED) {
    
    // ===== CONFIGURAÇÕES DO MERCADO LIVRE =====
    const ML_CONFIG = {
        CLIENT_ID: '5767896809769647',
        CLIENT_SECRET: 'aHu0XHAHekqQC6gPtxeBgJDgM99jXd7A',
        REDIRECT_URI: 'https://homework-fees-saving-beliefs.trycloudflare.com/callback',
        USER_ID: '415176739',
        API_BASE_URL: 'https://api.mercadolibre.com',
        INITIAL_CODE: 'TG-6983743d4a2f3e0001a5fee0-415176739'
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

    // ===== FUNÇÃO PARA ATUALIZAR INTERFACE DO USUÁRIO =====
    function updateTokenStatusUI() {
        const tokenStatusElement = document.getElementById('mlTokenStatus');
        const tokenTextElement = document.getElementById('mlTokenText');
        
        if (!tokenStatusElement || !tokenTextElement) {
            console.warn('⚠️ Elementos de status do token não encontrados no DOM');
            return;
        }
        
        if (mlTokenStatus.is_valid && mlTokenStatus.expires_at) {
            const expiresIn = mlTokenStatus.expires_at - Date.now();
            
            if (expiresIn > 0) {
                const hoursLeft = Math.floor(expiresIn / 3600000);
                const minutesLeft = Math.floor((expiresIn % 3600000) / 60000);
                
                tokenTextElement.innerHTML = `<i class="fas fa-check-circle"></i> Token ML: OK (${hoursLeft}h ${minutesLeft}m)`;
                tokenStatusElement.className = 'token-valid';
                tokenStatusElement.style.display = 'block';
                
                // Se faltar menos de 1 hora, mostrar alerta
                if (hoursLeft < 1) {
                    tokenTextElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Token ML: EXPIRA EM ${minutesLeft} MIN`;
                    tokenStatusElement.className = 'token-expiring';
                }
            } else {
                tokenTextElement.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: EXPIRADO`;
                tokenStatusElement.className = 'token-expired';
                tokenStatusElement.style.display = 'block';
            }
        } else {
            tokenTextElement.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Token ML: CONFIGURANDO...`;
            tokenStatusElement.className = '';
            tokenStatusElement.style.display = 'block';
        }
    }

    // ===== FUNÇÃO PARA MOSTRAR ERRO =====
    function showTokenError(message = 'Erro de conexão') {
        const tokenStatusElement = document.getElementById('mlTokenStatus');
        const tokenTextElement = document.getElementById('mlTokenText');
        
        if (tokenStatusElement && tokenTextElement) {
            tokenTextElement.innerHTML = `<i class="fas fa-times-circle"></i> Token ML: ${message}`;
            tokenStatusElement.className = 'token-expired';
            tokenStatusElement.style.display = 'block';
        }
    }

    // ===== FUNÇÃO PARA OBTER NOVO TOKEN COM CÓDIGO INICIAL =====
    async function getNewTokenWithCode() {
        try {
            console.log('🔄 Obtendo novo token com código inicial...');
            
            // Primeiro, tentar usar o token fixo do seu arquivo
            const fixedToken = 'APP_USR-5767896809769647-020412-d53309f87cc3d8225a32bd4840d354aa-415176739';
            const fixedRefreshToken = 'TG-6983743d4a2f3e0001a5fee0-415176739';
            
            // Testar se o token fixo funciona
            const testResponse = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${fixedToken}`,
                    'Accept': 'application/json'
                }
            });
            
            if (testResponse.ok) {
                console.log('✅ Token fixo funcionando!');
                
                // Salvar token fixo
                const expiresAt = Date.now() + (6 * 60 * 60 * 1000); // 6 horas
                
                localStorage.setItem('ml_access_token', fixedToken);
                localStorage.setItem('ml_refresh_token', fixedRefreshToken);
                localStorage.setItem('ml_token_expiry', expiresAt.toString());
                localStorage.setItem('ml_user_id', ML_CONFIG.USER_ID);
                
                mlTokenStatus = {
                    access_token: fixedToken,
                    refresh_token: fixedRefreshToken,
                    expires_at: expiresAt,
                    is_valid: true,
                    last_update: new Date().toISOString(),
                    user_info: await testResponse.json()
                };
                
                updateTokenStatusUI();
                scheduleTokenRenewal(6 * 60 * 60 * 1000);
                
                return fixedToken;
            }
            
            // Se o token fixo não funcionar, tentar obter novo com código
            console.log('🔄 Token fixo não funcionou, tentando com código...');
            
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('client_id', ML_CONFIG.CLIENT_ID);
            params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
            params.append('code', ML_CONFIG.INITIAL_CODE);
            params.append('redirect_uri', ML_CONFIG.REDIRECT_URI);
            
            const response = await fetch(`${ML_CONFIG.API_BASE_URL}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params
            });
            
            if (response.ok) {
                const tokenData = await response.json();
                console.log('✅ Novo token obtido com código!');
                
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
            } else {
                console.error('❌ Erro ao obter token com código:', response.status);
                showTokenError('FALHA NA AUTENTICAÇÃO');
                return null;
            }
            
        } catch (error) {
            console.error('❌ Erro no getNewTokenWithCode:', error);
            showTokenError('ERRO DE REDE');
            return null;
        }
    }

    // ===== FUNÇÃO PARA RENOVAR TOKEN COM REFRESH_TOKEN =====
    async function renewTokenWithRefreshToken(refreshToken) {
        try {
            console.log('🔄 Renovando token com refresh_token...');
            
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('client_id', ML_CONFIG.CLIENT_ID);
            params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
            params.append('refresh_token', refreshToken);
            
            const response = await fetch(`${ML_CONFIG.API_BASE_URL}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: params
            });
            
            if (response.ok) {
                const tokenData = await response.json();
                console.log('✅ Token renovado com refresh_token!');
                
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
            } else {
                console.error('❌ Erro na renovação:', response.status);
                return null;
            }
            
        } catch (error) {
            console.error('❌ Erro no renewTokenWithRefreshToken:', error);
            return null;
        }
    }

    // ===== FUNÇÃO PARA AGENDAR RENOVAÇÃO AUTOMÁTICA =====
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

    // ===== FUNÇÃO PARA TESTAR CONEXÃO COM ML =====
    async function testMLConnection(token = null) {
        try {
            const accessToken = token || mlTokenStatus.access_token;
            
            if (!accessToken) {
                console.error('❌ Nenhum token disponível para teste');
                return false;
            }
            
            const response = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                console.log(`✅ Conexão ML bem-sucedida: ${userData.nickname}`);
                
                // Atualizar informações do usuário
                mlTokenStatus.user_info = userData;
                
                return true;
            } else {
                console.error('❌ Falha na conexão ML:', response.status);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Erro ao testar conexão ML:', error);
            return false;
        }
    }

    // ===== FUNÇÃO PARA INICIALIZAR AUTENTICAÇÃO =====
    async function initializeMLAuth() {
        console.log('🔑 Inicializando autenticação Mercado Livre...');
        
        // Mostrar elemento de status imediatamente
        const tokenStatusElement = document.getElementById('mlTokenStatus');
        if (tokenStatusElement) {
            tokenStatusElement.style.display = 'block';
        }
        
        updateTokenStatusUI();
        
        try {
            // Obter token automaticamente
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
                } else {
                    console.warn('⚠️ Token obtido mas conexão falhou');
                    return token;
                }
            } else {
                console.error('❌ Falha na autenticação ML automática');
                return null;
            }
            
        } catch (error) {
            console.error('❌ Erro na inicialização ML:', error);
            showTokenError('FALHA NA INICIALIZAÇÃO');
            return null;
        }
    }

    // ===== EXPORTAR FUNÇÕES PARA USO GLOBAL =====
    window.ML_CONFIG = ML_CONFIG;
    window.mlTokenStatus = mlTokenStatus;
    window.autoManageMLToken = autoManageMLToken;
    window.renewTokenWithRefreshToken = renewTokenWithRefreshToken;
    window.testMLConnection = testMLConnection;
    window.initializeMLAuth = initializeMLAuth;
    window.updateTokenStatusUI = updateTokenStatusUI;
    window.ML_AUTH_INITIALIZED = true;

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

} else {
    console.log('✅ Sistema de Token ML já está inicializado');
}

// ===== EVENT LISTENER PARA ATUALIZAÇÃO DO TOKEN =====
window.addEventListener('storage', function(event) {
    if (event.key === 'ml_access_token' || event.key === 'ml_token_expiry') {
        console.log('🔄 Token atualizado no localStorage, atualizando UI...');
        updateTokenStatusUI();
    }
});

// ===== BOTÃO DE TESTE (para desenvolvimento) =====
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar botão de teste se não existir
    if (!document.getElementById('testTokenBtn') && document.getElementById('userRole')) {
        const testBtn = document.createElement('button');
        testBtn.id = 'testTokenBtn';
        testBtn.className = 'btn btn-info btn-sm';
        testBtn.innerHTML = '<i class="fas fa-vial"></i> Testar Token';
        testBtn.style.marginLeft = '5px';
        testBtn.style.marginTop = '5px';
        testBtn.onclick = async function() {
            const token = await autoManageMLToken();
            if (token) {
                alert(`✅ Token funcionando!\n\n${token.substring(0, 50)}...`);
            } else {
                alert('❌ Token não funcionando!');
            }
        };
        
        const userRole = document.getElementById('userRole');
        if (userRole && userRole.parentNode) {
            userRole.parentNode.appendChild(testBtn);
        }
    }
});