// ============================================
// SISTEMA OS FOTOGRAFIA - VERSÃO COMPLETA COM FOTOS
// ============================================

// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = 'https://nvlmtinpcayrpkhulefs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
let supabaseClient = null;

// ===== VARIÁVEIS PARA CONTROLE DE SESSÃO =====
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 24 horas em milissegundos
let sessionTimer = null;
let refreshTokenInterval = null;

function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    
    // Feedback visual
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner"></span> Verificando...';
        submitBtn.disabled = true;
    }
    
    // Validação
    if (!username || !password) {
        showToast('Por favor, preencha usuário e senha!', 'warning');
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
        passwordInput.focus();
        return;
    }

    // Elementos dos sistemas (já devem existir no HTML)
    const salesSystem = document.getElementById('salesSystem');
    const reembolsosSystem = document.getElementById('reembolsosSystem');
    const caixaSystem = document.getElementById('caixaSystem');
    const reviewsSystem = document.getElementById('reviewsSystem');
    const folgasSystem = document.getElementById('folgasSystem');
    const shippingSystem = document.getElementById('shippingSystem');
    const estoqueSystem = document.getElementById('estoqueSystem');
    
    // Verificar usuário
    const foundUser = SYSTEM_USERS.find(user => 
        user.username === username && user.password === password
    );
    
    setTimeout(() => {
        if (foundUser) {
            currentUser = foundUser;

            atualizarTodosAvatares();
            
            // SALVAR SESSÃO NO LOCALSTORAGE
            saveSessionToStorage();
            
            // INICIAR TIMER DE SESSÃO
            startSessionTimer();
            
            // Atualizar interface do usuário
            if (userName) userName.textContent = foundUser.name;
            if (userAvatar) userAvatar.textContent = foundUser.avatar;
            if (userRole) userRole.textContent = foundUser.role;
            if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a), ${foundUser.name}!`;
            if (createdByInput) createdByInput.value = foundUser.name;
            
            // Mostrar sistema, esconder login
            if (loginScreen) loginScreen.classList.add('hidden');
            const menuSystem = document.getElementById('menuSystem');
            if (menuSystem) menuSystem.classList.remove('hidden');
            
            showToast(`✅ Bem-vindo(a), ${foundUser.name}!`, 'success');
            
            // INICIALIZAR SISTEMA APÓS LOGIN
            setTimeout(() => {
                if (supabaseClient) {
                    testSupabaseConnection();
                } else {
                    updateCounters();
                    renderOrdersTable();
                    updateOSNotificationBell();
                }
                
                // Configurar botão de reembolsos (AGORA DENTRO DO LOGIN)
                const reembolsosBtn = document.getElementById('reembolsosBtn');
                if (reembolsosBtn) {
                    reembolsosBtn.onclick = function() {
                        abrirSistemaReembolsos();
                    };
                }
                
                // Configurar botão de logout (AGORA DENTRO DO LOGIN)
                if (logoutBtn) {
                    logoutBtn.onclick = handleLogout;
                }
                
            }, 500);
            
        } else {
            showToast('❌ Usuário ou senha incorretos', 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        // Restaurar botão
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    }, 300);
}

// Adicione no início do script.js, perto das outras variáveis globais
let salesSyncStatus = {
    isSyncing: false,
    lastSync: null,
    totalSynced: 0
};

// ===== VARIÁVEIS GLOBAIS =====
let currentUser = null;
let orders = [];
let orderCounter = 1;
let currentFilter = 'pendente';
let editingOrderId = null;
let currentOSForPrint = null;
let currentPrintStyle = 'detailed';
let emailsEnviados = new Set();

// ===== VARIÁVEIS PARA REEMBOLSOS =====
let reembolsos = [];
let currentReembolsoFilter = 'a_verificar';
let editingReembolsoId = null;
let notificacoes = [];

// ===== VARIÁVEIS PARA FOTOS =====
let selectedPhotos = [];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTOS_PER_OS = 10;

// ===== CONFIGURAÇÃO DE EMAIL =====
const EMAIL_CONFIG = {
    service: 'gmail', // ou seu serviço de email
    from: 'sistema@wheeltech.com',
    // Em produção, você usaria um serviço como SendGrid, Mailgun, etc.
};

// Mapeamento de usuários para emails
const USER_EMAILS = {
    'Elaine': 'elainecguidelli@gmail.com',
    'Arthur': 'arthur@wheeltech.com',
    'Laura': 'laura@empresa.com',
    'Ronald': 'ronald@empresa.com',
    'Bruna': 'bruna@wheeltech.com.br',
    'Andressa': 'andressasloboda99@erro',
    'Thalyta': 'thalyta@empresa.com',
    'AndressaMiotto': 'andmiotto1998@gmail.com',
    'Hosama': 'hosama@wheeltech.com'
};

// ===== VARIÁVEIS PARA NOTIFICAÇÕES DO SISTEMA =====
let systemNotifications = [];
let unreadNotifications = 0;


// ===== ELEMENTOS DOM =====
const loginScreen = document.getElementById('loginScreen');
const mainSystem = document.getElementById('mainSystem');
const loginForm = document.getElementById('loginForm');
const osCodeDisplay = document.getElementById('osCodeDisplay');
const osTableBody = document.getElementById('osTableBody');
const emptyMessage = document.getElementById('emptyMessage');
const userName = document.getElementById('userName');
const userAvatar = document.getElementById('userAvatar');
const userRole = document.getElementById('userRole');
const logoutBtn = document.getElementById('logoutBtn');
const testSupabaseBtn = document.getElementById('testSupabaseBtn');
const reloadBtn = document.getElementById('reloadBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');
const submitBtnText = document.getElementById('submitBtnText');
const completeModal = document.getElementById('completeModal');
const finalizarOSBtn = document.getElementById('finalizarOSBtn');
const completeOSId = document.getElementById('completeOSId');
const saveOSBtn = document.getElementById('saveOSBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const welcomeMessage = document.getElementById('welcomeMessage');
const myOrdersCount = document.getElementById('myOrdersCount');
const totalOrdersCount = document.getElementById('totalOrdersCount');
const createdByInput = document.getElementById('createdBy');

// ===== CONTADORES =====
const countPending = document.getElementById('countPending');
const countProgress = document.getElementById('countProgress');
const countCompleted = document.getElementById('countCompleted');
const countTotal = document.getElementById('countTotal');
const syncStatus = document.getElementById('syncStatus');

// ===== USUÁRIOS DO SISTEMA =====
const SYSTEM_USERS = [
    { username: 'elaine', password: '180998', name: 'Elaine', avatar: 'E', role: 'Fotógrafa' },
    { username: 'arthur', password: '040869', name: 'Arthur', avatar: 'A', role: 'Comercial' },
    { username: 'laura', password: '123456', name: 'Laura', avatar: 'L', role: 'Midia' },
    { username: 'ronald', password: '210188', name: 'Ronald', avatar: 'R', role: 'Administrador' },
    { username: 'bruna', password: '270194', name: 'Bruna', avatar: 'B', role: 'Assistente' },
    { username: 'andressa', password: '220922', name: 'Andressa', avatar: 'A', role: 'Assistente 2' },
    { username: 'thalyta', password: '300377', name: 'Thalyta', avatar: 'T', role: 'Assistente 3' },
    { username: 'hosama', password: '170999', name: 'Hosama', avatar: 'H', role: 'Administrador' },
    { username: 'andressamiotto', password: '241101', name: 'Andressa', avatar: 'A', role: 'Administrador' }
];

function contarCaracteres() {
    const campo = document.getElementById('productName');
    if (campo) {
        updateProductCounter(campo, 'productCounter');
    }
}

// ===== FUNÇÃO PARA INICIALIZAR BOTÕES DO HEADER =====
function setupHeaderButtons() {
    if (!currentUser) return;
    
    // Configurar botão de Vendas ML
    const vendasBtn = document.getElementById('vendasBtn');
    if (vendasBtn) {
        vendasBtn.onclick = function() {
            abrirSistemaVendas();
        };
    }

    // Configurar botão de Reembolsos
    const reembolsosBtn = document.getElementById('reembolsosBtn');
    if (reembolsosBtn) {
        reembolsosBtn.onclick = function() {
            abrirSistemaReembolsos();
        };
    }
    
    // Configurar botão de Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');
    
    // VERIFICAR SE HÁ SESSÃO SALVA
    const hasValidSession = loadSessionFromStorage();
    
    if (hasValidSession && currentUser) {
        // Usuário já logado - restaurar sessão
        console.log('✅ Restaurando sessão existente');
        
        // Atualizar interface do usuário
        if (userName) userName.textContent = currentUser.name;
        if (userAvatar) userAvatar.textContent = currentUser.avatar;
        if (userRole) userRole.textContent = currentUser.role;
        if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a) de volta, ${currentUser.name}!`;
        if (createdByInput) createdByInput.value = currentUser.name;
        
        // Mostrar sistema, esconder login
        if (loginScreen) loginScreen.classList.add('hidden');
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.remove('hidden');
        
        // Iniciar timer de sessão
        startSessionTimer();
        
        // Configurar detectores de atividade
        setupActivityDetectors();
        
        // Carregar dados
        setTimeout(() => {
            if (supabaseClient) {
                testSupabaseConnection();
            } else {
                updateCounters();
                renderOrdersTable();
                // NOVO: Destacar botão de pendentes após renderizar
                setTimeout(() => highlightActiveFilterButton(), 100);
            }
            
            // Configurar botões
            const reembolsosBtn = document.getElementById('reembolsosBtn');
            if (reembolsosBtn) {
                reembolsosBtn.onclick = function() {
                    abrirSistemaReembolsos();
                };
            }
            
            if (logoutBtn) {
                logoutBtn.onclick = handleLogout;
            }
            
        }, 500);
        
    } else {

        // Usuário não logado - mostrar tela de login
        console.log('👤 Nenhuma sessão ativa');
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (mainSystem) mainSystem.classList.add('hidden');
    }
    
    generateOSCode();
    initSupabase();
    setupEventListeners();
    setupPhotoUpload();
    
    // Adicionar evento de tecla ESC para fechar modais
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const printModal = document.getElementById('printModal');
            if (printModal && !printModal.classList.contains('hidden')) {
                closePrintModal();
            }
            const photoViewerModal = document.getElementById('photoViewerModal');
            if (photoViewerModal && !photoViewerModal.classList.contains('hidden')) {
                closePhotoViewer();
            }
            if (completeModal && !completeModal.classList.contains('hidden')) {
                closeCompleteModal();
            }
        }
        
        // Atalho Ctrl+P para imprimir
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentOSForPrint) {
                printOS();
            }
        }
    });
});

// ============================================
// FUNÇÕES DE INICIALIZAÇÃO
// ============================================
function initSupabase() {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabaseClient = supabaseClient;
            console.log('✅ Supabase inicializado');
        } else {
            console.error('❌ Biblioteca Supabase não carregada');
        }
    } catch (error) {
        console.error('❌ Erro ao inicializar Supabase:', error);
    }
}

function montarMensagemOS(os) {
    return `
Nova Ordem de Serviço criada

Número da OS: ${os.numero}
Cliente: ${os.cliente}
Equipamento: ${os.equipamento}
Responsável: ${os.responsavel}
Status: ${os.status}

Acesse o sistema para mais detalhes.
Sistema Wheel Tech
`;
}

// Função auxiliar para atualizar avatar em qualquer elemento
function atualizarAvatar(elementId, avatar) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = avatar;
}

// No login, após definir currentUser, atualize todos os avatares possíveis
function atualizarTodosAvatares() {
    if (!currentUser) return;
    const avatar = currentUser.avatar;
    atualizarAvatar('menuUserAvatar', avatar);
    atualizarAvatar('userAvatar', avatar);
    atualizarAvatar('caixaUserAvatar', avatar);
    atualizarAvatar('salesUserAvatar', avatar);
    atualizarAvatar('reembolsoUserAvatar', avatar);
    atualizarAvatar('reviewsUserAvatar', avatar);
    atualizarAvatar('folgasUserAvatar', avatar);
    atualizarAvatar('shippingUserAvatar', avatar);
    atualizarAvatar('estoqueUserAvatar', avatar);
    atualizarAvatar('estoqueGestaoAvatar', avatar);
}

// ============================================
// FUNÇÃO PARA ENVIAR NOTIFICAÇÕES POR EMAIL
// ============================================
async function enviarNotificacaoEmail(recipientName, subject, message, osData = null) {

    const recipientEmail = USER_EMAILS[recipientName];

    if (!recipientEmail) {
        console.warn(`Email não configurado para: ${recipientName}`);
        return false;
    }

    // CRIA IDENTIFICADOR ÚNICO DO EMAIL
    const emailId = `${recipientEmail}-${subject}`;

    if (emailsEnviados.has(emailId)) {
        console.warn("⚠️ Email duplicado bloqueado:", emailId);
        return false;
    }

    emailsEnviados.add(emailId);

    console.log("📧 Enviando email para:", recipientEmail);

    try {

        const response = await emailjs.send(
            "service_lqj60lq",
            "template_hq8vrdn",
            {
                to_email: recipientEmail,
                subject: subject,
                message: message
            },
            {
                publicKey: "GtDq2kuz4ng-u8gYR"
            }
        );

        console.log("✅ Email enviado:", response);

        showToast(`📧 Email enviado para ${recipientName}`, "success");

        return true;

    } catch (error) {

        console.error("❌ Erro EmailJS:", error);

        showToast("Erro ao enviar email", "error");

        return false;
    }
}

function generateEmailTemplate(message, osData) {
    // Template HTML básico para o email
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #8A2BE2; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                .os-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8A2BE2; }
                .btn { display: inline-block; background: #8A2BE2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
                .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 Sistema Wheel Tech</h1>
                    <p>Notificação de Ordem de Serviço</p>
                </div>
                <div class="content">
                    ${message}
                    ${osData ? `
                    <div class="os-info">
                        <h3>📋 Detalhes da OS</h3>
                        <p><strong>Código:</strong> ${osData.code}</p>
                        <p><strong>Produto:</strong> ${osData.productName}</p>
                        <p><strong>Criado por:</strong> ${osData.createdBy}</p>
                        <p><strong>Responsável:</strong> ${osData.responsibleName}</p>
                        <p><strong>Status:</strong> ${osData.status}</p>
                        ${osData.completionTime ? `<p><strong>Tempo de execução:</strong> ${osData.completionTime}</p>` : ''}
                    </div>
                    ` : ''}
                    <a href="${window.location.origin}" class="btn">Acessar Sistema</a>
                </div>
                <div class="footer">
                    <p>Esta é uma notificação automática do Sistema Wheel Tech</p>
                    <p>© ${new Date().getFullYear()} Wheel Tech - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============================================
// FUNÇÃO SUPER SIMPLES PARA CONTADOR
// ============================================

function updateProductCounter(input, counterId) {
    const counter = document.getElementById(counterId);
    if (!counter) return;
    
    const currentLength = input.value.length;
    const maxLength = 200;
    
    counter.textContent = `${currentLength}/${maxLength}`;
    
    // Muda a cor se estiver perto do limite
    if (currentLength > 180) {
        counter.style.color = '#dc3545';
        counter.style.fontWeight = 'bold';
    } else if (currentLength > 160) {
        counter.style.color = '#ffc107';
        counter.style.fontWeight = 'bold';
    } else {
        counter.style.color = '#6c757d';
        counter.style.fontWeight = 'normal';
    }
}

// ============================================
// FUNÇÕES DE CONTROLE DE SESSÃO
// ============================================

function saveSessionToStorage() {
    if (!currentUser) return;
    
    const sessionData = {
        user: currentUser,
        loginTime: Date.now(),
        expiresAt: Date.now() + SESSION_TIMEOUT
    };
    
    // Salvar no localStorage
    localStorage.setItem('wheeltech_session', JSON.stringify(sessionData));
    localStorage.setItem('wheeltech_user', JSON.stringify(currentUser));
    
    console.log('✅ Sessão salva no localStorage');
}

function loadSessionFromStorage() {
    try {
        const sessionData = localStorage.getItem('wheeltech_session');
        const userData = localStorage.getItem('wheeltech_user');
        
        if (!sessionData || !userData) {
            return false;
        }
        
        const session = JSON.parse(sessionData);
        const user = JSON.parse(userData);
        
        // Verificar se a sessão expirou
        const now = Date.now();
        if (now > session.expiresAt) {
            console.log('❌ Sessão expirada');
            clearSessionStorage();
            return false;
        }

        // Mostrar MENU, esconder login
        if (loginScreen) loginScreen.classList.add('hidden');
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.remove('hidden');
        
        // Restaurar usuário
        currentUser = user;
        
        // Calcular tempo restante
        const timeLeft = session.expiresAt - now;
        console.log(`🕒 Sessão válida por mais ${Math.round(timeLeft / 1000 / 60)} minutos`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao carregar sessão:', error);
        clearSessionStorage();
        return false;
    }
}

function clearSessionStorage() {
    localStorage.removeItem('wheeltech_session');
    localStorage.removeItem('wheeltech_user');
    localStorage.removeItem('wheeltech_orders');
    console.log('🧹 Sessão limpa do localStorage');
}

function startSessionTimer() {
    // Limpar timers anteriores
    if (sessionTimer) {
        clearTimeout(sessionTimer);
    }
    if (refreshTokenInterval) {
        clearInterval(refreshTokenInterval);
    }
    
    // Timer para logout automático após 24 horas
    sessionTimer = setTimeout(() => {
        showToast('⏰ Sua sessão expirou por inatividade', 'warning');
        handleLogout();
    }, SESSION_TIMEOUT);
    
    // Atualizar sessão a cada 30 minutos para manter ativa
    refreshTokenInterval = setInterval(() => {
        if (currentUser) {
            console.log('🔄 Atualizando sessão...');
            saveSessionToStorage();
            
            // Mostrar notificação a cada 4 horas
            const hoursOnline = Math.floor((Date.now() - JSON.parse(localStorage.getItem('wheeltech_session')).loginTime) / (1000 * 60 * 60));
            if (hoursOnline > 0 && hoursOnline % 4 === 0) {
                showToast(`⏰ Você está online há ${hoursOnline} horas`, 'info');
            }
        }
    }, 30 * 60 * 1000); // 30 minutos
    
    console.log('⏰ Timer de sessão iniciado (24 horas)');
}

function resetSessionTimer() {
    if (currentUser) {
        // Atualizar tempo de expiração
        const sessionData = {
            user: currentUser,
            loginTime: Date.now(),
            expiresAt: Date.now() + SESSION_TIMEOUT
        };
        
        localStorage.setItem('wheeltech_session', JSON.stringify(sessionData));
        
        // Reiniciar timer
        if (sessionTimer) {
            clearTimeout(sessionTimer);
        }
        
        sessionTimer = setTimeout(() => {
            showToast('⏰ Sua sessão expirou por inatividade', 'warning');
            handleLogout();
        }, SESSION_TIMEOUT);
        
        console.log('🔄 Timer de sessão reiniciado');
    }
}

// Detectar atividade do usuário para resetar timer
function setupActivityDetectors() {
    // Resetar timer em qualquer interação do usuário
    const events = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    
    events.forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) {
                resetSessionTimer();
            }
        }, { passive: true });
    });
    
    // Resetar timer quando a janela ganha foco
    window.addEventListener('focus', () => {
        if (currentUser) {
            resetSessionTimer();
        }
    });
    
    console.log('👀 Detectores de atividade configurados');
}

// ============================================
// FUNÇÃO SETUP EVENT LISTENERS (COMPLETA E ATUALIZADA)
// ============================================
function setupEventListeners() {
    // Login
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Tecla Enter no campo de senha
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }
    
    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Supabase
    if (testSupabaseBtn) {
        testSupabaseBtn.addEventListener('click', testSupabaseConnection);
    }
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', loadOrders);
    }
    
    // Formulário OS
    if (saveOSBtn) {
        saveOSBtn.addEventListener('click', saveOrder);
    }
    
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', clearForm);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', cancelEdit);
    }
    
    // Modal de finalização
    if (finalizarOSBtn) {
        finalizarOSBtn.addEventListener('click', completeOrder);
    }
    
    if (completeModal) {
        completeModal.addEventListener('click', function(e) {
            if (e.target === completeModal) closeCompleteModal();
        });
    }

    // Configurar botão de caixa
const caixaBtn = document.getElementById('caixaBtn');
if (caixaBtn) {
    caixaBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('💰 Botão Caixa clicado');
        window.abrirSistemaCaixa();
    });
}

// Configurar botão de reembolsos (já no header principal)
const reembolsosBtn = document.getElementById('reembolsosBtn');
if (reembolsosBtn) {
    reembolsosBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('💰 Botão Reembolsos clicado');
        window.abrirSistemaReembolsos();
    });
}

// Configurar botão de vendas
const vendasBtn = document.getElementById('vendasBtn');
if (vendasBtn) {
    vendasBtn.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('🛒 Botão Vendas clicado');
        window.abrirSistemaVendas();
    });
}
    
    // Event listener para mostrar/ocultar campos de anúncio
    const photoTypeSelect = document.getElementById('photoType');
    if (photoTypeSelect) {
        photoTypeSelect.addEventListener('change', toggleCamposAnuncio);
    }
    
    // NOVO: Event listener para campo "precisa de foto"
    const precisaFotoSelect = document.getElementById('precisaFoto');
    if (precisaFotoSelect) {
        precisaFotoSelect.addEventListener('change', function() {
            const photoType = document.getElementById('photoType').value;
            const precisaFoto = this.value;
            
            if ((photoType === 'criar_anuncio' || photoType === 'replicar_anuncio') && precisaFoto === 'sim') {
                // Mostrar aviso visual
                const responsibleSelect = document.getElementById('responsibleName');
                if (responsibleSelect) {
                    // Verificar se Elaine já está selecionada
                    if (responsibleSelect.value === 'Elaine') {
                        showToast('📸 Elaine já é a responsável selecionada', 'info');
                    } else {
                        showToast('📸 Elaine será adicionada como responsável junto com o selecionado', 'info');
                    }
                }
            }
            
            // NOVO: Destacar visualmente o campo de responsável quando precisa de foto
            const responsibleField = document.getElementById('responsibleName');
            if (responsibleField) {
                if (precisaFoto === 'sim' && (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio')) {
                    responsibleField.style.borderColor = '#e91e63';
                    responsibleField.style.boxShadow = '0 0 0 3px rgba(233, 30, 99, 0.15)';
                    responsibleField.style.transition = 'all 0.3s';
                    
                    // Adicionar tooltip visual
                    const tooltip = document.createElement('div');
                    tooltip.id = 'fotoTooltip';
                    tooltip.innerHTML = '<i class="fas fa-info-circle"></i> Elaine será adicionada automaticamente';
                    tooltip.style.cssText = 'font-size: 12px; color: #e91e63; margin-top: 5px; display: flex; align-items: center; gap: 5px;';
                    
                    // Verificar se o tooltip já existe
                    const existingTooltip = document.getElementById('fotoTooltip');
                    if (existingTooltip) existingTooltip.remove();
                    
                    responsibleField.parentNode.appendChild(tooltip);
                } else {
                    // Remover destaque
                    responsibleField.style.borderColor = '';
                    responsibleField.style.boxShadow = '';
                    
                    // Remover tooltip
                    const tooltip = document.getElementById('fotoTooltip');
                    if (tooltip) tooltip.remove();
                }
            }
        });
    }
    
    // Event listener para botão de adicionar foto por link
    const addPhotoLinkBtn = document.getElementById('addPhotoLinkBtn');
    if (addPhotoLinkBtn) {
        addPhotoLinkBtn.addEventListener('click', addPhotoFromLink);
    }
    
    // Event listener para tecla Enter no campo de link de foto
    const photoLinkInput = document.getElementById('photoLinkInput');
    if (photoLinkInput) {
        photoLinkInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addPhotoFromLink();
            }
        });
    }
    
    // Event listener para mudança no campo de responsável quando "precisa de foto" estiver ativo
    const responsibleSelect = document.getElementById('responsibleName');
    if (responsibleSelect) {
        responsibleSelect.addEventListener('change', function() {
            const photoType = document.getElementById('photoType').value;
            const precisaFoto = document.getElementById('precisaFoto')?.value;
            
            if (precisaFoto === 'sim' && (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio')) {
                // Atualizar mensagem baseada no responsável selecionado
                if (this.value === 'Elaine') {
                    showToast('📸 Elaine já é a responsável principal', 'info');
                } else if (this.value) {
                    showToast(`📸 Elaine será adicionada junto com ${this.value}`, 'info');
                }
            }
        });
    }
    
    // Foco no campo de usuário ao carregar
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        setTimeout(() => usernameInput.focus(), 100);
    }
    
    // Event listener para notificações
    const notificationBell = document.getElementById('notificationBell');
    if (notificationBell) {
        notificationBell.addEventListener('click', toggleNotificacoes);
    }
    
    // Event listener para fechar notificações ao clicar fora
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const bell = document.getElementById('notificationBell');
        
        if (dropdown && !dropdown.classList.contains('hidden') && 
            !dropdown.contains(e.target) && 
            !bell.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
    
    // Event listener para tecla ESC em modais
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // Fechar modal de print
            const printModal = document.getElementById('printModal');
            if (printModal && !printModal.classList.contains('hidden')) {
                closePrintModal();
            }
            
            // Fechar visualizador de fotos
            const photoViewerModal = document.getElementById('photoViewerModal');
            if (photoViewerModal && !photoViewerModal.classList.contains('hidden')) {
                closePhotoViewer();
            }
            
            // Fechar modal de finalização
            if (completeModal && !completeModal.classList.contains('hidden')) {
                closeCompleteModal();
            }
            
            // Fechar modal de visualização da OS
            const viewOSModal = document.getElementById('viewOSModal');
            if (viewOSModal && !viewOSModal.classList.contains('hidden')) {
                closeViewOSModal();
            }
            
            // Fechar modal de reembolso
            const reembolsoModal = document.getElementById('reembolsoModal');
            if (reembolsoModal && !reembolsoModal.classList.contains('hidden')) {
                closeReembolsoModal();
            }
            
            // Fechar dropdown de notificações
            const notificacoesDropdown = document.getElementById('notificacoesDropdown');
            if (notificacoesDropdown && !notificacoesDropdown.classList.contains('hidden')) {
                notificacoesDropdown.classList.add('hidden');
            }
        }
        
        // Atalho Ctrl+P para imprimir
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentOSForPrint) {
                printOS();
            }
        }
        
        // Atalho Ctrl+S para salvar (no formulário OS)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const activeElement = document.activeElement;
            
            // Verificar se estamos em um campo de texto do formulário OS
            const formElements = ['productName', 'skus', 'observations', 'descricaoAnuncio'];
            if (activeElement && formElements.includes(activeElement.id)) {
                saveOrder();
            }
        }
        
        // Atalho Ctrl+E para limpar formulário
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            if (!editingOrderId) {
                clearForm();
            }
        }
    });
    
    // Event listeners para modais de reembolso (se existirem)
    setupReembolsoEventListeners();
    
    // Configurar drag and drop para fotos
    setupPhotoUpload();
    
    // Inicializar botão de reembolsos
    inicializarBotaoReembolsos();
    
    // Configurar evento para botão de impressão na tabela
    document.addEventListener('click', function(e) {
        if (e.target.closest('[onclick*="openPrintModal"]')) {
            e.preventDefault();
            const onclickAttr = e.target.closest('[onclick*="openPrintModal"]').getAttribute('onclick');
            const match = onclickAttr.match(/openPrintModal\(([^)]+)\)/);
            if (match) {
                try {
                    const osData = JSON.parse(match[1].replace(/&quot;/g, '"'));
                    openPrintModal(osData);
                } catch (error) {
                    console.error('Erro ao processar dados da OS:', error);
                }
            }
        }
    });
    
    console.log('✅ Event listeners configurados com sucesso!');
}

async function getTokenWithInitialCode() {
    try {
        console.log('🔑 Usando código inicial:', ML_CONFIG.INITIAL_CODE.substring(0, 20) + '...');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', ML_CONFIG.CLIENT_ID);
        params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
        params.append('code', ML_CONFIG.INITIAL_CODE);
        params.append('redirect_uri', ML_CONFIG.REDIRECT_URI);
        
        console.log('📤 Enviando requisição para:', `${ML_CONFIG.API_BASE_URL}/oauth/token`);
        console.log('Parâmetros:', {
            grant_type: 'authorization_code',
            client_id: ML_CONFIG.CLIENT_ID.substring(0, 10) + '...',
            code_length: ML_CONFIG.INITIAL_CODE.length,
            redirect_uri: ML_CONFIG.REDIRECT_URI
        });
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });
        
        console.log('📥 Resposta recebida. Status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Token obtido com sucesso!');
            console.log('Access Token (primeiros 30 chars):', data.access_token.substring(0, 30) + '...');
            console.log('Refresh Token (primeiros 30 chars):', data.refresh_token.substring(0, 30) + '...');
            console.log('Expira em:', data.expires_in, 'segundos');
            console.log('Escopos:', data.scope);
            
            return data;
        } else {
            const errorText = await response.text();
            console.error('❌ Erro na resposta:', response.status, response.statusText);
            console.error('Detalhes do erro:', errorText);
            
            // Tenta parsear como JSON se possível
            try {
                const errorJson = JSON.parse(errorText);
                console.error('Erro JSON:', errorJson);
            } catch (e) {
                console.error('Erro não é JSON');
            }
            
            return null;
        }
        
    } catch (error) {
        console.error('❌ Erro ao obter token com código inicial:', error);
        console.error('Detalhes:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        return null;
    }
}

// ===== FUNÇÃO PARA BUSCAR VENDAS AUTOMATICAMENTE =====
async function fetchMLSalesAuto() {
    console.log('🛒 Buscando vendas do Mercado Livre...');
    
    // 1. Obter token
    let token = localStorage.getItem('ml_access_token');
    
    if (!token) {
        console.log('🔑 Token não encontrado, obtendo novo...');
        token = await getMLTokenAutomatically();
    }
    
    if (!token) {
        console.error('❌ Não foi possível obter token do ML');
        return [];
    }
    
    // 2. Buscar vendas dos últimos 3 dias
    try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        const params = new URLSearchParams({
            seller: 'me',
            sort: 'date_desc',
            'order.status': 'paid',
            'order.date_created.from': threeDaysAgo.toISOString().split('T')[0],
            limit: '20'
        });
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/orders/search?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        
        if (response.status === 401) {
            // Token expirado, tentar renovar
            console.log('🔄 Token expirado, tentando renovar...');
            token = await getMLTokenAutomatically();
            
            if (token) {
                // Tentar novamente com novo token
                return await fetchMLSalesAuto();
            }
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Processar resultados
        if (data.results && data.results.length > 0) {
            console.log(`✅ ${data.results.length} vendas encontradas`);
            return processMLSales(data.results);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        return [];
    }
}

function processMLSales(sales) {
    return sales.map(sale => {
        const order = sale.order_items && sale.order_items.length > 0 ? sale.order_items[0] : {};
        
        return {
            id: sale.id,
            numero_venda: sale.external_reference || `ML-${sale.id}`,
            data_venda: new Date(sale.date_created).toLocaleString('pt-BR'),
            valor_total: sale.total_amount || 0,
            quantidade_itens: sale.order_items?.length || 0,
            comprador: sale.buyer?.nickname || 'Não informado',
            status: 'nova',
            verificada: false,
            
            // Detalhes do item principal
            item_titulo: order.item?.title || 'Produto não identificado',
            item_sku: order.item?.seller_custom_field || 'N/A',
            item_quantidade: order.quantity || 1,
            item_preco_unitario: order.unit_price || 0,
            
            // Informações adicionais
            metodo_pagamento: sale.payments?.[0]?.payment_type || 'Não informado',
            tags: sale.tags || []
        };
    });
}

// ===== FUNÇÃO PARA RENDERIZAR VENDAS NA TELA =====
function renderVendasML(vendas) {
    const salesTableBody = document.getElementById('salesTableBody');
    if (!salesTableBody) {
        console.error('❌ Tabela de vendas não encontrada');
        return;
    }
    
    salesTableBody.innerHTML = '';
    
    if (vendas.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px;">
                    <i class="fas fa-store-slash fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma venda encontrada</h4>
                    <p style="color: #6c757d;">Não há vendas recentes no Mercado Livre.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    vendas.forEach((venda, index) => {
        const row = document.createElement('tr');
        row.className = 'venda-item';
        
        // Status badge
        let statusBadge = '';
        if (venda.verificada) {
            statusBadge = '<span class="badge badge-success">Verificada</span>';
        } else if (venda.status === 'fraude') {
            statusBadge = '<span class="badge badge-danger">Fraude</span>';
        } else {
            statusBadge = '<span class="badge badge-warning">Nova</span>';
        }
        
        row.innerHTML = `
            <td><strong>${venda.numero_venda}</strong></td>
            <td>${venda.data_venda}</td>
            <td class="valor-cell">R$ ${parseFloat(venda.valor_total).toFixed(2)}</td>
            <td>${venda.comprador}</td>
            <td>${venda.quantidade_itens}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="verDetalhesVenda(${index})" title="Ver detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-success btn-sm" onclick="verificarVenda('${venda.id}')" title="Marcar como verificada">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="marcarComoFraude('${venda.id}')" title="Marcar como fraude">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        
        salesTableBody.appendChild(row);
    });
}

// ============================================
// FUNÇÃO PARA MOSTRAR/OCULTAR CAMPOS DE ANÚNCIO (MODIFICADA)
// ============================================
function toggleCamposAnuncio() {
    const photoType = document.getElementById('photoType').value;
    const camposAnuncio = document.getElementById('camposAnuncio');
    
    // Agora mostra os campos também para "Apenas edição"
    if (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio' || photoType === 'edicao') {
        camposAnuncio.classList.remove('hidden');
    } else {
        camposAnuncio.classList.add('hidden');
    }
    
    // Se for criar/replicar anúncio ou apenas edição, definir opções padrão
    if (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio' || photoType === 'edicao') {
        // Garantir que o campo "precisa de foto" esteja visível
        const precisaFotoSelect = document.getElementById('precisaFoto');
        if (precisaFotoSelect) {
            precisaFotoSelect.value = 'nao'; // Valor padrão
        }
    }
}

// ===== FUNÇÃO PARA ADICIONAR FOTO POR LINK =====
function addPhotoFromLink() {
    const photoLinkInput = document.getElementById('photoLinkInput');
    const link = photoLinkInput.value.trim();
    
    if (!link) {
        showToast('Por favor, insira um link válido', 'warning');
        return;
    }
    
    // Validar se é uma URL válida
    try {
        new URL(link);
    } catch (e) {
        showToast('Link inválido. Por favor, insira uma URL válida', 'error');
        return;
    }
    
    // Validar se é uma imagem
    if (!link.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i)) {
        showToast('Link deve ser de uma imagem (JPG, PNG, GIF, etc.)', 'warning');
        return;
    }
    
    if (selectedPhotos.length >= MAX_PHOTOS_PER_OS) {
        showToast(`Limite de ${MAX_PHOTOS_PER_OS} fotos atingido`, 'warning');
        return;
    }
    
    // Adicionar foto por link
    const photoData = {
        id: Date.now() + Math.random(),
        name: `Foto do link: ${link.substring(0, 30)}...`,
        type: 'image/url',
        size: 0,
        data: link, // Salva o link diretamente
        thumbnail: link,
        isLink: true // Marcar que é uma foto por link
    };
    
    selectedPhotos.push(photoData);
    updatePhotoPreviews();
    photoLinkInput.value = '';
    showToast('✅ Foto adicionada por link', 'success');
}

// Reenviar reembolso para verificação (do pendente para a verificar)
window.reenviarParaVerificacao = async function(id) {
    if (!confirm('Reenviar este reembolso para verificação?')) return;
    
    try {
        console.log('Reenviando reembolso ID:', id, 'para verificação');
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'a_verificar',
                verificado_por: null,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: false // Resetar notificação para admin
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Erro Supabase:', error);
            throw error;
        }
        
        console.log('Reembolso reenviado para verificação:', data);
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'a_verificar';
            reembolsos[index].verificado_por = null;
            reembolsos[index].notificado_admin = false;
        }
        
        showToast('↪️ Reembolso reenviado para verificação!', 'info');
        
        // Recarregar a tabela e voltar para aba "A Verificar"
        currentReembolsoFilter = 'a_verificar';
        updateReembolsoCounters();
        renderReembolsosTable();
        
    } catch (error) {
        console.error('❌ Erro ao reenviar reembolso:', error);
        showToast('❌ Erro ao reenviar reembolso: ' + error.message, 'error');
    }
};

// ===== FUNÇÕES PARA TOKEN ML AUTOMÁTICO =====

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
            const data = await response.json();
            console.log('✅ Token renovado com refresh_token!');
            return data;
        } else {
            console.error('❌ Erro na renovação:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao renovar token:', error);
        return null;
    }
}

// Adicione esta função em ml_token_manager.js
async function getValidToken() {
    try {
        console.log('🔑 Obtendo token válido...');
        
        const token = await autoManageMLToken();
        
        if (!token) {
            throw new Error('Não foi possível obter token válido');
        }
        
        return {
            access_token: token,
            expires_at: mlTokenStatus.expires_at,
            is_valid: true
        };
        
    } catch (error) {
        console.error('❌ Erro ao obter token válido:', error);
        return null;
    }
}

// Função para buscar vendas usando token automático
async function buscarVendasML(limit = 50) {
    console.log('🛒 Buscando vendas do Mercado Livre...');
    
    try {
        // 1. Obter token válido
        const token = await autoManageMLToken();
        
        if (!token) {
            throw new Error('Não foi possível obter token válido');
        }
        
        // 2. Buscar vendas DIRETAMENTE da API ML (fallback se Worker falhar)
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 30); // Últimos 30 dias
        
        const params = new URLSearchParams({
            seller: '415176739',
            sort: 'date_desc',
            'order.status': 'paid',
            limit: limit,
            offset: 0,
            'order.date_created.from': dataInicio.toISOString().split('T')[0]
        });
        
        let vendas = [];
        
        // Tentar via Worker primeiro
        try {
            const response = await fetch(
                `https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/proxy?url=https://api.mercadolibre.com/orders/search?${params}&token=${token}`
            );
            
            if (response.ok) {
                const data = await response.json();
                vendas = data.results || [];
                console.log(`✅ ${vendas.length} vendas encontradas via Worker`);
            } else {
                throw new Error('Worker falhou');
            }
        } catch (workerError) {
            console.log('🔄 Worker falhou, tentando direto...');
            
            // Fallback: chamada direta
            const directResponse = await fetch(
                `https://api.mercadolibre.com/orders/search?${params}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (directResponse.ok) {
                const data = await directResponse.json();
                vendas = data.results || [];
                console.log(`✅ ${vendas.length} vendas encontradas via API direta`);
            } else {
                throw new Error(`API direta falhou: ${directResponse.status}`);
            }
        }
        
        // 3. Processar resultados
        if (vendas.length > 0) {
            return processarVendasML(vendas);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        showToast('Erro ao buscar vendas: ' + error.message, 'error');
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
            item_sku: item.item?.seller_custom_field || 'N/A',
            item_quantidade: item.quantity || 1,
            item_preco_unitario: item.unit_price || 0,
            
            // Informações adicionais
            metodo_pagamento: venda.payments?.[0]?.payment_type || 'Não informado',
            tags: venda.tags || [],
            dados_completos: venda
        };
    });
}

// ============================================
// FUNÇÕES PARA REEMBOLSOS
// ============================================

// Função para carregar reembolsos
async function loadReembolsos() {
    if (!currentUser) return;
    
    try {
        if (!supabaseClient) {
            throw new Error('Supabase não conectado');
        }
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .select('*')
            .order('data_criacao', { ascending: false });
        
        if (error) throw error;
        
        reembolsos = (data || []).map(item => ({
            id: item.id,
            numero_venda: item.numero_venda,
            numero_operacao: item.numero_operacao,
            valor: item.valor,
            data_operacao: item.data_operacao,
            tipo: item.tipo || (item.tem_frete ? 'frete' : 'normal'),
            tem_frete: item.tem_frete || item.tipo === 'frete',
            observacoes: item.observacoes,
            criado_por: item.criado_por,
            status: item.status,
            verificado_por: item.verificado_por,
            data_criacao: item.data_criacao,
            data_atualizacao: item.data_atualizacao,
            notificado_admin: item.notificado_admin,
            notificado_usuario: item.notificado_usuario
        }));
        
        // Verificar se o usuário atual é admin
        const isAdmin = currentUser.role === 'Administrador';
        
        // Filtrar reembolsos se não for admin
        if (!isAdmin) {
            reembolsos = reembolsos.filter(reembolso => 
                reembolso.criado_por === currentUser.name || 
                currentUser.role === 'Administrador'
            );
        }
        
        updateReembolsoCounters();
        renderReembolsosTable();
        
        // Verificar notificações
        verificarNotificacoesReembolsos();
        
    } catch (error) {
        console.error('❌ Erro ao carregar reembolsos:', error);
        reembolsos = [];
        updateReembolsoCounters();
        renderReembolsosTable();
    }
}

// Atualizar contadores de reembolsos
// ============================================
// ATUALIZAR CONTADORES DE REEMBOLSOS (VERSÃO SUPER SEGURA)
// ============================================
function updateReembolsoCounters() {
    if (!currentUser) return;
    
    const aVerificar = reembolsos.filter(r => r.status === 'a_verificar').length;
    const reembolsados = reembolsos.filter(r => r.status === 'reembolsado').length;
    const pendentes = reembolsos.filter(r => r.status === 'pendente').length;
    const total = reembolsos.length;
    
    // Calcular total de valores reembolsados
    const totalValor = reembolsos
        .filter(r => r.status === 'reembolsado')
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);
    
    // Função segura para setar texto
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    // Função segura para setar display
    const setDisplay = (id, display) => {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
    };
    
    // Atualizar contadores principais
    setText('countVerificar', aVerificar);
    setText('countReembolsados', reembolsados);
    setText('countPendentes', pendentes);
    setText('totalReembolsos', totalValor.toFixed(2));
    
    setText('tabVerificar', aVerificar);
    setText('tabReembolsados', reembolsados);
    setText('tabPendentes', pendentes);
    setText('tabTodos', total);
    
    // Badges de notificação
    if (currentUser.role === 'Administrador' && aVerificar > 0) {
        setDisplay('badgeNovos', 'inline-block');
        setText('badgeNovos', aVerificar);
    } else {
        setDisplay('badgeNovos', 'none');
    }
    
    const pendentesUsuario = reembolsos.filter(r => 
        r.status === 'pendente' && r.criado_por === currentUser.name
    ).length;
    
    if (pendentesUsuario > 0) {
        setDisplay('badgePendentes', 'inline-block');
        setText('badgePendentes', pendentesUsuario);
    } else {
        setDisplay('badgePendentes', 'none');
    }
    
    // Notificação do sino
    const totalNotificacoes = aVerificar + pendentesUsuario;
    setText('reembolsoNotificationCount', totalNotificacoes);
    
    if (totalNotificacoes > 0) {
        setDisplay('reembolsoNotificationBell', 'block');
    } else {
        setDisplay('reembolsoNotificationBell', 'none');
    }
}

// Adicione esta função se não existir:
function setupReembolsoEventListeners() {
    // Event listener para o checkbox de frete (se ainda existir)
    const temFreteCheckbox = document.getElementById('temFrete');
    const freteContainer = document.getElementById('freteContainer');
    
    if (temFreteCheckbox && freteContainer) {
        temFreteCheckbox.addEventListener('change', function() {
            freteContainer.style.display = this.checked ? 'block' : 'none';
        });
    }
    
    // Event listener para data - setar data atual se vazia
    const dataReembolsoInput = document.getElementById('dataReembolso');
    if (dataReembolsoInput && !dataReembolsoInput.value) {
        dataReembolsoInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Fechar modal ao clicar fora
    const reembolsoModal = document.getElementById('reembolsoModal');
    if (reembolsoModal) {
        reembolsoModal.addEventListener('click', function(e) {
            if (e.target === reembolsoModal) {
                closeReembolsoModal();
            }
        });
    }
}

// Renderizar tabela de reembolsos
// ============================================
// RENDERIZAR TABELA DE REEMBOLSOS (VERSÃO SEGURA)
// ============================================
function renderReembolsosTable() {
    const tbody = document.getElementById('reembolsosTableBody');
    const emptyMsg = document.getElementById('reembolsosEmpty');
    
    if (!tbody) {
        console.error('❌ Elemento reembolsosTableBody não encontrado');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (reembolsos.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    
    if (emptyMsg) emptyMsg.classList.add('hidden');
    
    // Filtrar reembolsos baseado no filtro atual
    let filteredReembolsos = reembolsos;
    if (currentReembolsoFilter !== 'todos') {
        filteredReembolsos = reembolsos.filter(r => r.status === currentReembolsoFilter);
    }
    
    // Verificar se o usuário atual é admin
    const isAdmin = currentUser && currentUser.role === 'Administrador';
    
    filteredReembolsos.forEach(reembolso => {
        const row = document.createElement('tr');
        row.className = 'reembolso-item';
        
        // Formatar data
        const dataOp = new Date(reembolso.data_operacao);
        const dataFormatada = dataOp.toLocaleDateString('pt-BR');
        
        // Status
        let statusBadge = '';
        if (reembolso.status === 'a_verificar') {
            statusBadge = '<span class="status-a_verificar">A Verificar</span>';
        } else if (reembolso.status === 'reembolsado') {
            statusBadge = '<span class="status-reembolsado">Reembolsado</span>';
        } else {
            statusBadge = '<span class="status-pendente">Pendente</span>';
        }
        
        // FRETE:
        let tipoInfo = '';
        if (reembolso.tipo === 'frete') {
            tipoInfo = `
                <div style="margin-top: 5px;">
                    <span class="badge badge-warning" style="background: #ffc107; color: #212529;">
                        <i class="fas fa-shipping-fast"></i> Frete
                    </span>
                </div>
            `;
        } else if (reembolso.tipo === 'outro') {
            tipoInfo = `
                <div style="margin-top: 5px;">
                    <span class="badge badge-info">
                        <i class="fas fa-question-circle"></i> Outro
                    </span>
                </div>
            `;
        }
        
        // Ações
        let acoes = '';
        
        // Se for admin ou criador do reembolso
        if (isAdmin || reembolso.criado_por === currentUser?.name) {
            if (reembolso.status === 'a_verificar' && isAdmin) {
                acoes = `
                    <button class="btn btn-success btn-sm" onclick="aprovarReembolso(${reembolso.id})" title="Marcar como Reembolsado">
                        <i class="fas fa-check"></i> OK
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="rejeitarReembolso(${reembolso.id})" title="Marcar como Pendente">
                        <i class="fas fa-times"></i> Pendente
                    </button>
                `;
            }
            
            if (reembolso.status === 'pendente' && reembolso.criado_por === currentUser?.name) {
                acoes += `
                    <button class="btn btn-info btn-sm btn-reenviar" onclick="reenviarParaVerificacao(${reembolso.id})" title="Reenviar para Verificação">
                        <i class="fas fa-paper-plane"></i> Reenviar
                    </button>
                `;
            }
            
            acoes += `
                <button class="btn btn-warning btn-sm" onclick="editarReembolso(${reembolso.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
            `;
            
            if (isAdmin || reembolso.criado_por === currentUser?.name) {
                acoes += `
                    <button class="btn btn-danger btn-sm" onclick="excluirReembolso(${reembolso.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }
        } else {
            acoes = '<span class="text-muted">Sem permissão</span>';
        }
        
        row.innerHTML = `
            <td><strong>${reembolso.numero_venda}</strong></td>
            <td>${reembolso.numero_operacao}</td>
            <td class="valor-cell">R$ ${parseFloat(reembolso.valor).toFixed(2)}</td>
            <td>${dataFormatada}</td>
            <td>${tipoInfo}</td>
            <td>${statusBadge}</td>
            <td>${reembolso.criado_por}</td>
            <td>
                <div class="d-flex gap-2">
                    ${acoes}
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Calcular pendentes do usuário para os badges
    const pendentesUsuario = reembolsos.filter(r => 
        r.status === 'pendente' && r.criado_por === currentUser?.name
    ).length;
    
    const aVerificar = reembolsos.filter(r => r.status === 'a_verificar').length;
    
    // Atualizar badges de forma segura
    const badgeNovos = document.getElementById('badgeNovos');
    const badgePendentes = document.getElementById('badgePendentes');
    const reembolsoNotificationCount = document.getElementById('reembolsoNotificationCount');
    const reembolsoNotificationBell = document.getElementById('reembolsoNotificationBell');
    
    if (badgeNovos) {
        if (isAdmin && aVerificar > 0) {
            badgeNovos.style.display = 'inline-block';
            badgeNovos.textContent = aVerificar;
        } else {
            badgeNovos.style.display = 'none';
        }
    }
    
    if (badgePendentes) {
        if (pendentesUsuario > 0) {
            badgePendentes.style.display = 'inline-block';
            badgePendentes.textContent = pendentesUsuario;
        } else {
            badgePendentes.style.display = 'none';
        }
    }
    
    const totalNotificacoes = (isAdmin ? aVerificar : 0) + pendentesUsuario;
    
    if (reembolsoNotificationCount) {
        reembolsoNotificationCount.textContent = totalNotificacoes;
    }
    
    if (reembolsoNotificationBell) {
        reembolsoNotificationBell.style.display = totalNotificacoes > 0 ? 'block' : 'none';
    }
    
    if (emptyMsg) emptyMsg.classList.add('hidden');
}

// ===== FUNÇÃO PARA EDITAR REEMBOLSO =====
window.editarReembolso = async function(id) {
    const reembolso = reembolsos.find(r => r.id === id);
    if (!reembolso) {
        showToast('Reembolso não encontrado', 'error');
        return;
    }
    
    // Verificar permissão - apenas admin ou criador pode editar
    const isAdmin = currentUser.role === 'Administrador';
    if (!isAdmin && reembolso.criado_por !== currentUser.name) {
        showToast('Você não tem permissão para editar este reembolso', 'warning');
        return;
    }
    
    editingReembolsoId = id;
    
    // Preencher o formulário com os dados do reembolso
    document.getElementById('reembolsoModalTitle').textContent = 'Editar Reembolso';
    document.getElementById('reembolsoId').value = id;
    document.getElementById('numeroVenda').value = reembolso.numero_venda || '';
    document.getElementById('numeroOperacao').value = reembolso.numero_operacao || '';
    document.getElementById('valorReembolso').value = reembolso.valor || '';
    
    // Formatar data para o input date (YYYY-MM-DD)
    let dataOperacao = '';
    if (reembolso.data_operacao) {
        const data = new Date(reembolso.data_operacao);
        dataOperacao = data.toISOString().split('T')[0];
    } else {
        dataOperacao = new Date().toISOString().split('T')[0];
    }
    document.getElementById('dataReembolso').value = dataOperacao;
    
    // Definir tipo do reembolso
    document.getElementById('tipoReembolso').value = reembolso.tipo || 'normal';
    
    document.getElementById('observacoesReembolso').value = reembolso.observacoes || '';
    
    // Mostrar modal
    document.getElementById('reembolsoModal').classList.remove('hidden');
};

// Filtrar reembolsos
window.filtrarReembolsos = function(filter) {
    currentReembolsoFilter = filter;
    renderReembolsosTable();
    
    // Atualizar botões ativos
    document.querySelectorAll('#reembolsosSystem .btn-sm').forEach(btn => {
        btn.classList.remove('filtro-ativo');
    });
    
    const activeButton = document.querySelector(`#reembolsosSystem .btn-sm[onclick*="${filter}"]`);
    if (activeButton) {
        activeButton.classList.add('filtro-ativo');
    }
};

// ===== FUNÇÃO PARA EXCLUIR REEMBOLSO =====
window.excluirReembolso = async function(id) {
    const reembolso = reembolsos.find(r => r.id === id);
    if (!reembolso) {
        showToast('Reembolso não encontrado', 'error');
        return;
    }
    
    // Verificar permissão - apenas admin ou criador pode excluir
    const isAdmin = currentUser.role === 'Administrador';
    if (!isAdmin && reembolso.criado_por !== currentUser.name) {
        showToast('Você não tem permissão para excluir este reembolso', 'warning');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja excluir o reembolso da venda ${reembolso.numero_venda}?`)) {
        return;
    }
    
    try {
        if (!supabaseClient) {
            throw new Error('Conexão não disponível');
        }
        
        const { error } = await supabaseClient
            .from('reembolsos_ml')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        // Remover da lista local
        reembolsos = reembolsos.filter(r => r.id !== id);
        
        updateReembolsoCounters();
        renderReembolsosTable();
        
        showToast('🗑️ Reembolso excluído com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao excluir reembolso:', error);
        showToast('❌ Erro ao excluir reembolso: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA NOVO REEMBOLSO =====
window.novoReembolso = function() {
    editingReembolsoId = null;
    document.getElementById('reembolsoModalTitle').textContent = 'Novo Reembolso';
    document.getElementById('reembolsoId').value = '';
    document.getElementById('numeroVenda').value = '';
    document.getElementById('numeroOperacao').value = '';
    document.getElementById('valorReembolso').value = '';
    document.getElementById('dataReembolso').value = new Date().toISOString().split('T')[0];
    document.getElementById('tipoReembolso').value = 'normal'; // Valor padrão
    document.getElementById('observacoesReembolso').value = '';
    document.getElementById('reembolsoModal').classList.remove('hidden');
};

// Adicione esta função no arquivo script.js (pode ser na seção de funções para reembolsos):
window.reenviarParaVerificacao = async function(id) {
    if (!confirm('Reenviar este reembolso para verificação?\n\nO administrador será notificado para verificar novamente.')) return;
    
    try {
        if (!supabaseClient) {
            throw new Error('Conexão não disponível');
        }
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'a_verificar',
                verificado_por: null,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: false // Resetar notificação para admin
            })
            .eq('id', id)
            .select();
        
        if (error) throw error;
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'a_verificar';
            reembolsos[index].verificado_por = null;
            reembolsos[index].notificado_admin = false;
        }
        
        showToast('↪️ Reembolso reenviado para verificação!', 'success');
        
        // Recarregar a tabela
        updateReembolsoCounters();
        renderReembolsosTable();
        
        // Se for admin, mostrar notificação imediatamente
        if (currentUser.role === 'Administrador') {
            verificarNotificacoes();
        }
        
    } catch (error) {
        console.error('❌ Erro ao reenviar reembolso:', error);
        showToast('❌ Erro ao reenviar reembolso: ' + error.message, 'error');
    }
};

// Fechar modal de reembolso
window.closeReembolsoModal = function() {
    document.getElementById('reembolsoModal').classList.add('hidden');
};

// Salvar reembolso - VERSÃO CORRIGIDA
window.salvarReembolso = async function() {
    const numeroVenda = document.getElementById('numeroVenda').value.trim();
    const numeroOperacao = document.getElementById('numeroOperacao').value.trim();
    const valor = document.getElementById('valorReembolso').value;
    const dataOperacao = document.getElementById('dataReembolso').value;
    const tipoReembolso = document.getElementById('tipoReembolso').value; // NOVO CAMPO
    const observacoes = document.getElementById('observacoesReembolso').value.trim();
    const reembolsoId = document.getElementById('reembolsoId').value;
    
    // Validação
    if (!numeroVenda || !numeroOperacao || !valor || !dataOperacao) {
        showToast('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }
    
    const reembolsoData = {
        numero_venda: numeroVenda,
        numero_operacao: numeroOperacao,
        valor: parseFloat(valor),
        data_operacao: dataOperacao,
        tipo: tipoReembolso, // 'normal', 'frete' ou 'outro'
        tem_frete: tipoReembolso === 'frete', // Mantém compatibilidade
        observacoes: observacoes,
        criado_por: currentUser.name,
        status: 'a_verificar',
        notificado_admin: false,
        notificado_usuario: false
    };
    
    const btn = document.getElementById('salvarReembolsoBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;
    
    try {
        let result;
        
        if (editingReembolsoId) {
            // Atualizar reembolso existente
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .update(reembolsoData)
                .eq('id', editingReembolsoId)
                .select();
            
            if (error) throw error;
            result = { success: true, data };
        } else {
            // Criar novo reembolso
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .insert([reembolsoData])
                .select();
            
            if (error) throw error;
            result = { success: true, data };
        }
        
        if (result.success) {
            showToast(editingReembolsoId ? 'Reembolso atualizado!' : 'Reembolso criado!', 'success');
            closeReembolsoModal();
            await loadReembolsos();
        }

        if (!editingReembolsoId) {
            await notificarAndressaNovoReembolso(reembolsoData);
            const destinatario = 'Hosama';  // string literal, não variável
        }
    } catch (error) {
        console.error('❌ Erro ao salvar reembolso:', error);
        showToast('Erro ao salvar reembolso: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Aprovar reembolso (marcar como reembolsado) - VERSÃO CORRIGIDA
window.aprovarReembolso = async function(id) {
    if (!confirm('Marcar este reembolso como reembolsado?')) return;
    
    try {
        console.log('Aprovando reembolso ID:', id);
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'reembolsado',
                verificado_por: currentUser.name,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: true // Marcar como notificado
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Erro Supabase:', error);
            throw error;
        }
        
        console.log('Reembolso atualizado:', data);
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'reembolsado';
            reembolsos[index].verificado_por = currentUser.name;
            reembolsos[index].notificado_admin = true;
        }
        
        showToast('✅ Reembolso marcado como reembolsado!', 'success');
        
        // Recarregar a tabela
        updateReembolsoCounters();
        renderReembolsosTable();
        
    } catch (error) {
        console.error('❌ Erro ao aprovar reembolso:', error);
        showToast('❌ Erro ao aprovar reembolso: ' + error.message, 'error');
    }
};

// Rejeitar reembolso (marcar como pendente) - VERSÃO CORRIGIDA
window.rejeitarReembolso = async function(id) {
    if (!confirm('Marcar este reembolso como pendente?')) return;
    
    try {
        console.log('Rejeitando reembolso ID:', id);
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'pendente',
                verificado_por: currentUser.name,
                data_atualizacao: new Date().toISOString(),
                notificado_usuario: false // Resetar notificação para usuário
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Erro Supabase:', error);
            throw error;
        }
        
        console.log('Reembolso atualizado:', data);
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'pendente';
            reembolsos[index].verificado_por = currentUser.name;
            reembolsos[index].notificado_usuario = false;
        }
        
        showToast('⚠️ Reembolso marcado como pendente!', 'warning');
        
        // Recarregar a tabela
        updateReembolsoCounters();
        renderReembolsosTable();
        
    } catch (error) {
        console.error('❌ Erro ao rejeitar reembolso:', error);
        showToast('❌ Erro ao rejeitar reembolso: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA ATUALIZAR REEMBOLSOS =====
window.atualizarReembolsos = function() {
    loadReembolsos();
    showToast('🔄 Atualizando lista de reembolsos...', 'info');
};

// ============================================
// FUNÇÕES DE NOTIFICAÇÃO
// ============================================

// Verificar notificações
async function verificarNotificacoes() {
    if (!currentUser || !supabaseClient) return;
    
    try {
        // Para admin (ronald): verificar reembolsos "a_verificar" não notificados
        if (currentUser.role === 'Administrador') {
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .select('*')
                .eq('status', 'a_verificar')
                .eq('notificado_admin', false);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // Atualizar contador
                if (notificationCount) {
                    notificationCount.textContent = data.length;
                    notificationBell.style.display = 'block';
                }
                
                // Adicionar notificações
                notificacoes = data.map(item => ({
                    id: item.id,
                    type: 'novo_reembolso',
                    title: 'Novo Reembolso para Verificar',
                    message: `${item.criado_por} adicionou um novo reembolso: ${item.numero_venda}`,
                    date: new Date(item.data_criacao),
                    read: false
                }));
                
                updateNotificationsUI();
            }
        }
        
        // Para todos os usuários: verificar reembolsos "pendente" não notificados
        const { data: pendentes, error: errorPendentes } = await supabaseClient
            .from('reembolsos_ml')
            .select('*')
            .eq('status', 'pendente')
            .eq('notificado_usuario', false)
            .eq('criado_por', currentUser.name);
        
        if (errorPendentes) throw errorPendentes;
        
        if (pendentes && pendentes.length > 0) {
            pendentes.forEach(item => {
                notificacoes.push({
                    id: item.id,
                    type: 'reembolso_pendente',
                    title: 'Reembolso Pendente',
                    message: `Seu reembolso ${item.numero_venda} foi marcado como pendente`,
                    date: new Date(item.data_atualizacao),
                    read: false
                });
            });
            
            updateNotificationsUI();
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar notificações:', error);
    }
}

// Verificar notificações específicas para reembolsos
async function verificarNotificacoesReembolsos() {
    if (!currentUser) return;
    
    let count = 0;
    
    // Para admin: contar reembolsos a verificar
    if (currentUser.role === 'Administrador') {
        count += reembolsos.filter(r => r.status === 'a_verificar').length;
    }
    
    // Para todos: contar reembolsos pendentes próprios
    const pendentesProprios = reembolsos.filter(r => 
        r.status === 'pendente' && r.criado_por === currentUser.name
    ).length;
    
    count += pendentesProprios;
    
    // Atualizar badge
    if (reembolsoNotificationCount && count > 0) {
        reembolsoNotificationCount.textContent = count;
        reembolsoNotificationBell.style.display = 'block';
    } else if (reembolsoNotificationBell) {
        reembolsoNotificationBell.style.display = 'none';
    }
}

// Atualizar UI das notificações
function updateNotificationsUI() {
    const content = document.getElementById('notificacoesContent');
    if (!content) return;

    // OS não lidas
    const osNaoLidas = orders
        .filter(os => 
            os.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase()) &&
            os.user_notified === false
        )
        .map(os => ({
            id: os.id,
            type: 'nova_os',
            title: '📸 Nova OS atribuída',
            message: `${os.code} - ${os.productName}`,
            date: new Date(os.createdAt),
            read: false
        }));

    // Reembolsos não lidos (já existentes em notificacoes)
    const reembolsoNots = notificacoes.filter(n => !n.read).map(n => ({
        ...n,
        type: n.type === 'novo_reembolso' ? 'reembolso' : 'pendente'
    }));

    const todas = [...osNaoLidas, ...reembolsoNots].sort((a, b) => b.date - a.date);

    if (todas.length === 0) {
        content.innerHTML = `<div style="padding:20px; text-align:center; color:#6c757d;">Nenhuma notificação</div>`;
        return;
    }

    let html = '';
    todas.forEach((notif, index) => {
        const timeAgo = getTimeAgo(notif.date);
        const icon = notif.type === 'nova_os' ? 'fa-file-alt' : (notif.type === 'reembolso' ? 'fa-exchange-alt' : 'fa-exclamation-circle');
        const color = notif.type === 'nova_os' ? '#8A2BE2' : '#dc3545';

        html += `
            <div style="padding:15px; border-bottom:1px solid #e9ecef; cursor:pointer;" 
                 onclick="marcarNotificacaoComoLida('${notif.type}', ${notif.id})">
                <div style="display:flex; gap:10px;">
                    <div style="color:${color};">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;">${notif.title}</div>
                        <div style="font-size:13px; color:#6c757d;">${notif.message}</div>
                        <div style="font-size:11px; color:#adb5bd;">${timeAgo}</div>
                    </div>
                </div>
            </div>
        `;
    });
    content.innerHTML = html;
}

// Atualizar badge de notificação
function updateNotificationBadge() {
    const unreadCount = notificacoes.filter(n => !n.read).length;
    
    if (notificationCount) {
        notificationCount.textContent = unreadCount;
        if (unreadCount > 0) {
            notificationBell.style.display = 'block';
        } else {
            notificationBell.style.display = 'none';
        }
    }
    
    // Para reembolsos
    if (reembolsoNotificationCount) {
        reembolsoNotificationCount.textContent = unreadCount;
        if (unreadCount > 0) {
            reembolsoNotificationBell.style.display = 'block';
        } else {
            reembolsoNotificationBell.style.display = 'none';
        }
    }
}

// Marcar notificação como lida
window.marcarNotificacaoComoLida = async function(tipo, id) {
    if (tipo === 'nova_os') {
        // Marcar OS como lida
        try {
            if (!supabaseClient) return;
            await supabaseClient
                .from('ordens_service')
                .update({ user_notified: true })
                .eq('id', id);

            const os = orders.find(o => o.id == id);
            if (os) os.user_notified = true;

            updateOSNotificationBell();
            updateNotificationsUI();
        } catch (error) {
            console.error('Erro ao marcar OS como lida:', error);
        }
    } else {
        // Código existente para reembolsos
        const notif = notificacoes.find(n => n.id === id);
        if (notif) {
            notif.read = true;
            if (notif.type === 'novo_reembolso') {
                await supabaseClient.from('reembolsos_ml').update({ notificado_admin: true }).eq('id', id);
            } else if (notif.type === 'reembolso_pendente') {
                await supabaseClient.from('reembolsos_ml').update({ notificado_usuario: true }).eq('id', id);
            }
        }
        updateNotificationsUI();
    }
};

// Marcar todas como lidas
window.marcarTodasComoLidas = async function() {
    // Marcar todas como lidas localmente
    notificacoes.forEach(notif => notif.read = true);
    
    // Atualizar no banco de dados
    try {
        if (currentUser.role === 'Administrador') {
            await supabaseClient
                .from('reembolsos_ml')
                .update({ notificado_admin: true })
                .eq('status', 'a_verificar');
        }
        
        // Marcar notificações de pendentes como lidas
        await supabaseClient
            .from('reembolsos_ml')
            .update({ notificado_usuario: true })
            .eq('status', 'pendente')
            .eq('criado_por', currentUser.name);
        
    } catch (error) {
        console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
    
    updateNotificationsUI();
    showToast('Todas as notificações marcadas como lidas', 'success');
};

// Marcar todas como lidas (reembolsos)
window.marcarTodasComoLidasReembolso = function() {
    marcarTodasComoLidas();
};

// Alternar exibição de notificações
window.toggleNotificacoes = async function() {
    // Marcar OS como lidas ao abrir o dropdown
    await marcarOSComoLidas();

    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        // Atualiza outras notificações se necessário
        updateNotificationsUI();
    } else {
        dropdown.classList.add('hidden');
    }
};

// Função auxiliar para calcular tempo relativo
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'agora mesmo';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours} h`;
    if (diffDays < 7) return `há ${diffDays} d`;
    return date.toLocaleDateString('pt-BR');
}

// ============================================
// FUNÇÃO PARA NOTIFICAR ELAINE SOBRE FOTOS (ATUALIZADA)
// ============================================
async function notificarElaineSobreFotos(osData) {
    // Verificar se precisa de foto
    const precisaFoto = osData.precisaFoto === 'sim';
    
    if (precisaFoto) {
        const assunto = `📸 Nova OS precisa de fotos - ${osData.code}`;
        const mensagem = `
            Nova Ordem de Serviço criada que precisa de fotos:
            
            📋 OS: ${osData.code}
            📦 Produto: ${osData.productName}
            👤 Responsável: ${osData.responsibleName}
            💰 Valor do Anúncio: R$ ${osData.valorAnuncio || '0,00'}
            📝 Descrição: ${osData.descricaoAnuncio || 'Nenhuma'}
            
            Por favor, verifique o sistema para mais detalhes.
            
            Sistema Wheel Tech
        `;
        
        // Enviar notificação para Elaine
        await enviarNotificacaoEmail('elaine@empresa.com', assunto, mensagem, 'foto_os');
        
        // Também podemos enviar uma notificação no sistema
        showToast('📧 Notificação enviada para Elaine sobre necessidade de fotos', 'success');
    }
}

// ===== FUNÇÃO PARA NOTIFICAR ADMIN SOBRE NOVA OS =====
async function notificarAdminSobreNovaOS(osData) {
    const assunto = `🆕 Nova Ordem de Serviço criada - ${osData.code}`;
    const mensagem = `
        Nova Ordem de Serviço criada no sistema:
        
        📋 Código: ${osData.code}
        📦 Produto: ${osData.productName}
        👤 Criado por: ${osData.createdBy}
        👥 Responsável: ${osData.responsibleName}
        🚨 Urgência: ${osData.urgency}
        📷 Tipo: ${osData.photoType}
        
        ${osData.photoType === 'criar_anuncio' || osData.photoType === 'replicar_anuncio' ? `
        💰 Valor: R$ ${document.getElementById('valorAnuncio')?.value || '0,00'}
        📝 Descrição: ${document.getElementById('descricaoAnuncio')?.value.substring(0, 100)}...
        🔗 Link: ${document.getElementById('linkNovoAnuncio')?.value || 'Não informado'}
        ` : ''}
        
        Acesse o sistema para mais detalhes.
        
        Sistema Wheel Tech
    `;
    
    // Enviar para todos os administradores
    const admins = SYSTEM_USERS.filter(user => user.role === 'Administrador');
    
    for (const admin of admins) {
        // Agora passamos o NOME do admin, não o username
        await enviarNotificacaoEmail(admin.name, assunto, mensagem, 'nova_os');
    }
}

// ============================================
// FUNÇÕES DE RELATÓRIO DE REEMBOLSOS
// ============================================

// Abrir modal de relatório
window.openRelatorioReembolsos = function() {
    // Verificar se é admin
    if (currentUser.role !== 'Administrador') {
        showToast('Apenas o administrador pode acessar relatórios', 'warning');
        return;
    }
    
    // Configurar datas padrão (últimos 30 dias)
    const hoje = new Date();
    const umMesAtras = new Date();
    umMesAtras.setDate(hoje.getDate() - 30);
    
    document.getElementById('dataInicio').value = umMesAtras.toISOString().split('T')[0];
    document.getElementById('dataFim').value = hoje.toISOString().split('T')[0];
    document.getElementById('filtroMes').value = '';
    
    document.getElementById('relatorioModal').classList.remove('hidden');
};

// Fechar modal de relatório
window.closeRelatorioModal = function() {
    document.getElementById('relatorioModal').classList.add('hidden');
};

// Gerar relatório
window.gerarRelatorio = async function() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const filtroMes = document.getElementById('filtroMes').value;
    
    // Validar datas
    if (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
        showToast('Data início não pode ser maior que data fim', 'warning');
        return;
    }
    
    try {
        // Construir query baseada nos filtros
        let query = supabaseClient
            .from('reembolsos_ml')
            .select('*')
            .eq('status', 'reembolsado');
        
        // Aplicar filtro de data
        if (dataInicio) {
            query = query.gte('data_operacao', dataInicio);
        }
        if (dataFim) {
            query = query.lte('data_operacao', dataFim);
        }
        
        // Aplicar filtro de mês
        if (filtroMes) {
            // Para filtrar por mês, precisamos de uma lógica diferente
            // Aqui simplificamos pegando todos e filtrando depois
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Aplicar filtro de mês se necessário
        let filteredData = data || [];
        if (filtroMes) {
            filteredData = filteredData.filter(item => {
                const dataItem = new Date(item.data_operacao);
                return (dataItem.getMonth() + 1) === parseInt(filtroMes);
            });
        }
        
        // Calcular estatísticas
        const total = filteredData.reduce((sum, item) => sum + parseFloat(item.valor), 0);
        const quantidade = filteredData.length;
        const media = quantidade > 0 ? total / quantidade : 0;
        
        // Atualizar resumo
        document.getElementById('totalPeriodo').textContent = total.toFixed(2);
        document.getElementById('quantidadePeriodo').textContent = quantidade;
        document.getElementById('mediaPeriodo').textContent = media.toFixed(2);
        
        // Atualizar tabela
        const tbody = document.getElementById('relatorioTableBody');
        tbody.innerHTML = '';
        
        if (filteredData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center" style="padding: 20px;">
                        Nenhum dado encontrado para o período selecionado
                    </td>
                </tr>
            `;
        } else {
            filteredData.forEach(item => {
                const dataOp = new Date(item.data_operacao);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${item.numero_venda}</td>
                    <td>${dataOp.toLocaleDateString('pt-BR')}</td>
                    <td>R$ ${parseFloat(item.valor).toFixed(2)}</td>
                    <td>${item.tem_frete ? `R$ ${parseFloat(item.valor_frete || 0).toFixed(2)}` : '-'}</td>
                    <td><span class="status-reembolsado">Reembolsado</span></td>
                `;
                tbody.appendChild(row);
            });
        }
        
        // Gerar gráfico (simplificado)
        gerarGraficoReembolsos(filteredData);
        
        showToast('Relatório gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
};

// Gerar gráfico de reembolsos (simplificado)
function gerarGraficoReembolsos(data) {
    const container = document.getElementById('graficoContainer');
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-chart-bar fa-3x" style="color: #6c757d; opacity: 0.3;"></i>
                <p style="color: #6c757d; margin-top: 10px;">Sem dados para exibir</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por mês
    const meses = {};
    data.forEach(item => {
        const dataItem = new Date(item.data_operacao);
        const mesAno = `${dataItem.getMonth() + 1}/${dataItem.getFullYear()}`;
        
        if (!meses[mesAno]) {
            meses[mesAno] = 0;
        }
        meses[mesAno] += parseFloat(item.valor);
    });
    
    // Criar gráfico simples com HTML/CSS
    const maxValor = Math.max(...Object.values(meses));
    
    let html = '<div style="width: 100%;">';
    
    Object.entries(meses).forEach(([mes, valor]) => {
        const porcentagem = (valor / maxValor) * 100;
        html += `
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 12px; color: #495057;">${mes}</span>
                    <span style="font-size: 12px; color: #28a745; font-weight: 600;">R$ ${valor.toFixed(2)}</span>
                </div>
                <div style="height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden;">
                    <div style="height: 100%; width: ${porcentagem}%; background: linear-gradient(90deg, #28a745, #20c997); border-radius: 10px;"></div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Exportar relatório para Excel
window.exportarRelatorio = function() {
    const tbody = document.getElementById('relatorioTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    
    // Criar dados para Excel
    const dados = [];
    
    // Cabeçalho
    dados.push(['Venda', 'Data', 'Valor', 'Frete', 'Status']);
    
    // Dados
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            dados.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent
            ]);
        }
    });
    
    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reembolsos");
    
    // Gerar nome do arquivo
    const dataInicio = document.getElementById('dataInicio').value || 'inicio';
    const dataFim = document.getElementById('dataFim').value || 'fim';
    const filename = `reembolsos_${dataInicio}_a_${dataFim}.xlsx`;
    
    // Baixar arquivo
    XLSX.writeFile(wb, filename);
    
    showToast('Relatório exportado com sucesso!', 'success');
};

// Imprimir relatório
window.imprimirRelatorio = function() {
    const printWindow = window.open('', '_blank');
    
    const hoje = new Date().toLocaleDateString('pt-BR');
    const dataInicio = document.getElementById('dataInicio').value || '-';
    const dataFim = document.getElementById('dataFim').value || '-';
    const totalPeriodo = document.getElementById('totalPeriodo').textContent;
    const quantidadePeriodo = document.getElementById('quantidadePeriodo').textContent;
    const mediaPeriodo = document.getElementById('mediaPeriodo').textContent;
    
    // Pegar dados da tabela
    const tbody = document.getElementById('relatorioTableBody');
    let tabelaHTML = '';
    
    tbody.querySelectorAll('tr').forEach(row => {
        tabelaHTML += '<tr>';
        row.querySelectorAll('td').forEach(cell => {
            tabelaHTML += `<td>${cell.textContent}</td>`;
        });
        tabelaHTML += '</tr>';
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Reembolsos</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #8A2BE2; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                .resumo { display: flex; justify-content: space-between; margin: 20px 0; }
                .resumo-item { text-align: center; }
                .resumo-valor { font-size: 24px; font-weight: bold; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h1>Relatório de Reembolsos</h1>
            <div class="info">
                <p><strong>Período:</strong> ${dataInicio} a ${dataFim}</p>
                <p><strong>Gerado em:</strong> ${hoje}</p>
                <p><strong>Gerado por:</strong> ${currentUser.name}</p>
            </div>
            
            <div class="resumo">
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #28a745;">R$ ${totalPeriodo}</div>
                    <div>Total Reembolsado</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #17a2b8;">${quantidadePeriodo}</div>
                    <div>Quantidade</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #ffc107;">R$ ${mediaPeriodo}</div>
                    <div>Média por Reembolso</div>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Venda</th>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>Frete</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tabelaHTML}
                </tbody>
            </table>
            
            <div class="no-print" style="margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #8A2BE2; color: white; border: none; cursor: pointer;">
                    Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

// ============================================
// FUNÇÕES EXISTENTES DO SISTEMA OS
// ============================================

function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    
    // Feedback visual
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner"></span> Verificando...';
        submitBtn.disabled = true;
    }
    
    // Validação
    if (!username || !password) {
        showToast('Por favor, preencha usuário e senha!', 'warning');
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
        passwordInput.focus();
        return;
    }
    
    // Verificar usuário
    const foundUser = SYSTEM_USERS.find(user => 
        user.username === username && user.password === password
    );
    
    setTimeout(() => {
        if (foundUser) {
            currentUser = foundUser;

            atualizarTodosAvatares();
            
            // Atualizar interface do usuário
            if (userName) userName.textContent = foundUser.name;
            if (userAvatar) userAvatar.textContent = foundUser.avatar;
            if (userRole) userRole.textContent = foundUser.role;
            if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a), ${foundUser.name}!`;
            if (createdByInput) createdByInput.value = foundUser.name;
            
            // Mostrar sistema, esconder login
            if (loginScreen) loginScreen.classList.add('hidden');
            const menuSystem = document.getElementById('menuSystem');
            if (menuSystem) menuSystem.classList.remove('hidden');
            
            showToast(`✅ Bem-vindo(a), ${foundUser.name}!`, 'success');
            
            // INICIALIZAR SISTEMA APÓS LOGIN
            setTimeout(() => {
                if (supabaseClient) {
                    testSupabaseConnection();
                } else {
                    updateCounters();
                    renderOrdersTable();
                    updateOSNotificationBell();
                }
                
                // Configurar botão de reembolsos (AGORA DENTRO DO LOGIN)
                const reembolsosBtn = document.getElementById('reembolsosBtn');
                if (reembolsosBtn) {
                    reembolsosBtn.onclick = function() {
                        abrirSistemaReembolsos();
                    };
                }
                
                // Configurar botão de logout (AGORA DENTRO DO LOGIN)
                if (logoutBtn) {
                    logoutBtn.onclick = handleLogout;
                }
                
            }, 500);
            
        } else {
            showToast('❌ Usuário ou senha incorretos', 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        // Restaurar botão
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    }, 300);
}

// ============================================
// FUNÇÃO PARA ABRIR SISTEMA DE REEMBOLSOS
// ============================================
function abrirSistemaReembolsos() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    // Esconder sistema principal e mostrar sistema de reembolsos
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário na tela de reembolsos
    if (reembolsoUserName) reembolsoUserName.textContent = currentUser.name;
    if (reembolsoUserAvatar) reembolsoUserAvatar.textContent = currentUser.avatar;
    if (reembolsoUserRole) reembolsoUserRole.textContent = currentUser.role;
    
    // Mostrar/ocultar botão de relatório baseado no usuário
    const btnRelatorio = document.getElementById('btnRelatorio');
    if (btnRelatorio) {
        if (currentUser.role === 'Administrador') {
            btnRelatorio.classList.remove('hidden');
        } else {
            btnRelatorio.classList.add('hidden');
        }
    }
    
    // Carregar reembolsos
    loadReembolsos();
    showToast('Sistema de Reembolsos carregado', 'info');
}

// ============================================
// FUNÇÃO DE LOGOUT (ATUALIZADA)
// ============================================
function handleLogout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        // Limpar timers
        if (sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = null;
        }
        if (sessionWarningTimer) {
            clearTimeout(sessionWarningTimer);
            sessionWarningTimer = null;
        }
        if (refreshTokenInterval) {
            clearInterval(refreshTokenInterval);
            refreshTokenInterval = null;
        }
        
        isSessionExpiring = false;
        
        // Remover modal de aviso se existir
        const warningModal = document.getElementById('sessionWarningModal');
        if (warningModal) warningModal.remove();
        
        // Limpar localStorage
        clearSessionStorage();
        
        // Limpar variáveis globais
        currentUser = null;
        orders = [];
        selectedPhotos = [];

        // Limpar tokens do Mercado Livre
        clearMLTokenStorage();

        // Limpar tokens do Mercado Livre
        localStorage.removeItem('ml_access_token');
        localStorage.removeItem('ml_refresh_token');
        localStorage.removeItem('ml_token_expiry');
        localStorage.removeItem('ml_vendas');
        
        // Esconder sistemas
        if (mainSystem) mainSystem.classList.add('hidden');
        if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (folgasSystem) folgasSystem.classList.add('hidden');
        if (shippingSystem) shippingSystem.classList.add('hidden');
        if (estoqueSystem) estoqueSystem.classList.add('hidden');
        
        // Fechar modais abertos
        closeAllModals();
        
        // Limpar formulário de login
        if (loginForm) loginForm.reset();
        
        // Foco no usuário
        const usernameInput = document.getElementById('username');
        if (usernameInput) setTimeout(() => usernameInput.focus(), 100);
        
        showToast('👋 Até logo!', 'info');
    }
}

// Adicionar ao final do setupEventListeners
setInterval(() => {
    if (currentUser && document.getElementById('mlTokenStatusUI')) {
        updateMLTokenStatusUI();
    }
}, 60000); // Atualizar a cada minuto

function closeAllModals() {
    const modals = [
        'printModal',
        'photoViewerModal', 
        'completeModal',
        'viewOSModal',
        'reembolsoModal',
        'relatorioModal',
        'notificacoesDropdown',
        'notificacoesReembolsoDropdown'
    ];
    
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    });
}

// ============================================
// FUNÇÃO TESTAR CONEXÃO SUPABASE
// ============================================
async function testSupabaseConnection() {
    showToast('🔗 Testando conexão...', 'info');
    if (testSupabaseBtn) {
        testSupabaseBtn.innerHTML = '<span class="spinner"></span> Testando...';
        testSupabaseBtn.disabled = true;
    }
    
    try {
        if (!supabaseClient) {
            initSupabase();
        }
        
        const { data, error } = await supabaseClient
            .from('ordens_service')
            .select('id')
            .limit(1);
        
        if (error) throw error;
        
        showToast('✅ Conexão estabelecida!', 'success');
        if (syncStatus) {
            syncStatus.textContent = 'Conectado';
            syncStatus.className = 'badge badge-success ml-2';
        }
        
        await loadOrders();
        
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        showToast('❌ Falha na conexão', 'error');
        if (syncStatus) {
            syncStatus.textContent = 'Desconectado';
            syncStatus.className = 'badge badge-danger ml-2';
        }
        
        updateCounters();
        renderOrdersTable();
    } finally {
        if (testSupabaseBtn) {
            testSupabaseBtn.innerHTML = '<i class="fas fa-database"></i> Testar Conexão';
            testSupabaseBtn.disabled = false;
        }
    }
}

// ============================================
// FUNÇÃO CARREGAR ORDENS (ATUALIZADA COM FOTOS)
// ============================================
async function loadOrders() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    showToast('🔄 Carregando ordens...', 'info');
    if (reloadBtn) {
        reloadBtn.innerHTML = '<span class="spinner"></span> Carregando...';
        reloadBtn.disabled = true;
    }
    
    try {
        if (!supabaseClient) {
            throw new Error('Supabase não conectado');
        }
        
        const { data, error } = await supabaseClient
            .from('ordens_service')
            .select('*')
            .order('data_criacao', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            orders = data.map(order => ({
                id: order.id,
                user_notified: order.user_notified || false,
                code: order.codigo || `OS-${order.id.toString().padStart(4, '0')}`,
                productName: order.produto_nome || 'Sem nome',
                linkAnuncio: order.link_anuncio || '',
                responsibleName: order.responsavel || currentUser.name,
                urgency: order.urgencia || 'normal',
                osType: order.tipo_os || 'normal',
                status: order.status || 'pendente',
                photoType: order.tipo_foto || 'estudio',
                skus: order.skus || [],
                observations: order.observacoes || '',
                photos: order.fotos || [],
                photosTaken: order.qtd_fotos || 0,
                editsMade: order.qtd_edicoes || 0,
                createdBy: order.criado_por || 'Sistema',
                createdAt: order.data_criacao,
                completionDate: order.data_conclusao,
                updatedAt: order.ultima_atualizacao || order.data_criacao,
                // NOVOS CAMPOS PARA CONFERÊNCIA
                conferido: order.conferido || false,
                conferidoPor: order.conferido_por || null,
                dataConferencia: order.data_conferencia || null,
                // NOVOS CAMPOS PARA ANÚNCIO
                valorAnuncio: order.valor_anuncio || 0,
                descricaoAnuncio: order.descricao_anuncio || '',
                linkNovoAnuncio: order.link_novo_anuncio || '',
                precisaFoto: order.precisa_foto || 'nao'
            }));
            
            orderCounter = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id))) + 1 : 1;
            
            updateOSNotificationBell();

            showToast(`✅ ${orders.length} ordens carregadas`, 'success');
        } else {
            orders = [];
            showToast('📭 Nenhuma ordem encontrada', 'info');
        }
        
        updateCounters();
        renderOrdersTable();
        
    } catch (error) {
        console.error('❌ Erro ao carregar ordens:', error);
        showToast('❌ Erro ao carregar ordens', 'error');
        
        orders = [];
        updateCounters();
        renderOrdersTable();
        
    } finally {
        if (reloadBtn) {
            reloadBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Recarregar';
            reloadBtn.disabled = false;
        }
    }
}

// ============================================
// FUNÇÃO SALVAR OS (CORRIGIDA - INCLUIR "APENAS EDIÇÃO")
// ============================================
async function saveOrder() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    const productName = document.getElementById('productName')?.value.trim();
    const responsibleName = document.getElementById('responsibleName')?.value;
    const linkAnuncio = document.getElementById('linkAnuncio')?.value.trim();
    const photoType = document.getElementById('photoType')?.value;
    
    if (!productName || !responsibleName) {
        showToast('⚠️ Preencha produto e responsável', 'warning');
        return;
    }
    
    // Coletar dados específicos para criar/replicar anúncio OU APENAS EDIÇÃO
    const valorAnuncio = document.getElementById('valorAnuncio')?.value || 0;
    const descricaoAnuncio = document.getElementById('descricaoAnuncio')?.value || '';
    const linkNovoAnuncio = document.getElementById('linkNovoAnuncio')?.value || '';
    const precisaFoto = document.getElementById('precisaFoto')?.value || 'nao';

    // VERIFICAR SE PRECISA DE FOTO E É CRIAR/REPLICAR ANÚNCIO OU APENAS EDIÇÃO
    let finalResponsibleName = responsibleName;
    
    // Lista de tipos que precisam mostrar os campos de anúncio
    const tiposComAnuncio = ['criar_anuncio', 'replicar_anuncio', 'edicao'];
    
    if (tiposComAnuncio.includes(photoType) && precisaFoto === 'sim') {
        // Adicionar Elaine como responsável junto com o responsável selecionado
        if (responsibleName && responsibleName !== 'Elaine') {
            finalResponsibleName = `${responsibleName} e Elaine`;
            showToast('📸 Elaine adicionada como responsável (precisa de foto)', 'info');
        } else if (responsibleName !== 'Elaine') {
            finalResponsibleName = 'Elaine';
            showToast('📸 Elaine definida como responsável (precisa de foto)', 'info');
        }
    }
    
    const orderData = {
        id: editingOrderId || orderCounter,
        code: editingOrderId ? orders.find(o => o.id == editingOrderId)?.code : generateOSCode(),
        productName: productName,
        responsibleName: finalResponsibleName,
        linkAnuncio: linkAnuncio || '',
        urgency: document.getElementById('urgency')?.value || 'normal',
        osType: document.getElementById('osType')?.value || 'normal',
        status: 'pendente',
        photoType: photoType,
        skus: document.getElementById('skus')?.value.split(',').map(s => s.trim()).filter(s => s) || [],
        observations: document.getElementById('observations')?.value || '',
        photos: selectedPhotos,
        photosTaken: 0,
        editsMade: 0,
        createdBy: currentUser.name,
        user_notified: (responsibleName !== currentUser.name) ? false : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // NOVOS CAMPOS
        valorAnuncio: parseFloat(valorAnuncio),
        descricaoAnuncio: descricaoAnuncio,
        linkNovoAnuncio: linkNovoAnuncio,
        precisaFoto: precisaFoto
    };
    
    if (saveOSBtn) {
        saveOSBtn.innerHTML = '<span class="spinner"></span> Salvando...';
        saveOSBtn.disabled = true;
    }
    
    try {
        let result;
        
        if (supabaseClient) {
            result = await saveOrderToSupabase(orderData);
        } else {
            result = { success: true, offline: true };
        }
        
        if (result.success) {
            if (editingOrderId) {
                const index = orders.findIndex(o => o.id == editingOrderId);
                if (index !== -1) orders[index] = orderData;
                editingOrderId = null;
                showToast(`✅ OS "${orderData.productName}" atualizada`, 'success');
            } else {
                orders.unshift(orderData);
                orderCounter++;
                showToast(`✅ OS "${orderData.productName}" criada`, 'success');

                // NOTIFICAR O RESPONSÁVEL (SE NÃO FOR O PRÓPRIO CRIADOR)
                if (responsibleName !== currentUser.name) {
                await notifyResponsibleNewOS(orderData, responsibleName);
                }
                
                // NOTIFICAR ADMIN SOBRE NOVA OS
                await notificarAdminSobreNovaOS(orderData);

                // NOTIFICAR ELAINE SE PRECISAR DE FOTOS (para qualquer tipo com anúncio)
                if (tiposComAnuncio.includes(photoType) && precisaFoto === 'sim') {
                    await notificarElaineSobreFotos(orderData);
                }
            }
            
            updateCounters();
            renderOrdersTable();
            clearForm();
            updateOSNotificationBell();
            
        } else {
            showToast('❌ Erro ao salvar: ' + result.error, 'error');
        }
        
    } finally {
        if (saveOSBtn) {
            saveOSBtn.innerHTML = '<i class="fas fa-save"></i> <span id="submitBtnText">Salvar OS</span>';
            saveOSBtn.disabled = false;
        }
    }
}

async function saveOrderToSupabase(order) {
    try {
        // Preparar fotos para salvar
        let fotosParaSalvar = [];
        if (order.photos && order.photos.length > 0) {
            fotosParaSalvar = order.photos.map(photo => ({
                name: photo.name,
                size: photo.size,
                type: photo.type,
                data: photo.data,
                isLink: photo.isLink || false
            }));
        }
        
        const orderData = {
            codigo: order.code,
            produto_nome: order.productName,
            responsavel: order.responsibleName,
            link_anuncio: order.linkAnuncio || '',
            criado_por: order.createdBy,
            urgencia: order.urgency,
            tipo_os: order.osType,
            status: order.status,
            tipo_foto: order.photoType,
            observacoes: order.observations,
            skus: order.skus,
            fotos: fotosParaSalvar,
            qtd_fotos: order.photosTaken,
            user_notified: order.user_notified !== undefined ? order.user_notified : false,
            qtd_edicoes: order.editsMade,
            // NOVOS CAMPOS PARA CONFERÊNCIA
            conferido: order.conferido || false,
            conferido_por: order.conferidoPor || null,
            data_conferencia: order.dataConferencia || null,
            // NOVOS CAMPOS PARA ANÚNCIO
            valor_anuncio: order.valorAnuncio || 0,
            descricao_anuncio: order.descricaoAnuncio || '',
            link_novo_anuncio: order.linkNovoAnuncio || '',
            precisa_foto: order.precisaFoto || 'nao',
            data_criacao: new Date().toISOString(),
            ultima_atualizacao: new Date().toISOString()
        };
        
        let result;
        
        if (editingOrderId) {
            const { data, error } = await supabaseClient
                .from('ordens_service')
                .update(orderData)
                .eq('id', editingOrderId)
                .select();
            
            if (error) throw error;
            result = { success: true, data };
        } else {
            const { data, error } = await supabaseClient
                .from('ordens_service')
                .insert([orderData])
                .select();
            
            if (error) throw error;
            result = { success: true, data };
            
            if (data && data[0]) {
                order.id = data[0].id;
            }
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Erro no Supabase:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// FUNÇÃO PARA CONFERIR OS
// ============================================
window.conferirOS = async function(orderId) {
    const order = orders.find(o => o.id == orderId);
    
    if (!order) {
        showToast('Ordem não encontrada', 'error');
        return;
    }
    
    // Verificar se a OS está concluída
    if (order.status !== 'concluida') {
        showToast('⚠️ Apenas OS concluídas podem ser conferidas', 'warning');
        return;
    }
    
    // Verificar se já foi conferida
    if (order.conferido) {
        showToast('⚠️ Esta OS já foi conferida', 'warning');
        return;
    }
    
    if (confirm(`Deseja marcar a OS "${order.productName}" como conferida?\n\nVocê não poderá desfazer esta ação.`)) {
        try {
            if (supabaseClient) {
                await supabaseClient.from('ordens_service')
                    .update({ 
                        conferido: true,
                        conferido_por: currentUser.name,
                        data_conferencia: new Date().toISOString(),
                        ultima_atualizacao: new Date().toISOString()
                    })
                    .eq('id', orderId);
            }
            
            order.conferido = true;
            order.conferidoPor = currentUser.name;
            order.dataConferencia = new Date().toISOString();
            
            updateCounters();
            renderOrdersTable();
            showToast(`✅ OS conferida por ${currentUser.name}`, 'success');
        } catch (error) {
            console.error('❌ Erro ao conferir OS:', error);
            showToast('❌ Erro ao conferir OS', 'error');
        }
    }
};

// ============================================
// FUNÇÕES DO FORMULÁRIO (ATUALIZADAS COM FOTOS)
// ============================================
function clearForm() {
    const productNameInput = document.getElementById('productName');
    const responsibleNameInput = document.getElementById('responsibleName');
    const linkAnuncioInput = document.getElementById('linkAnuncio');
    const urgencySelect = document.getElementById('urgency');
    const osTypeSelect = document.getElementById('osType');
    const photoTypeSelect = document.getElementById('photoType');
    const skusInput = document.getElementById('skus');
    const observationsInput = document.getElementById('observations');
    const valorAnuncioInput = document.getElementById('valorAnuncio');
    const descricaoAnuncioInput = document.getElementById('descricaoAnuncio');
    const linkNovoAnuncioInput = document.getElementById('linkNovoAnuncio');
    const precisaFotoSelect = document.getElementById('precisaFoto');
    const photoLinkInput = document.getElementById('photoLinkInput');
    
    if (productNameInput) { productNameInput.value = '';
    contarCaracteres();
    }
    if (responsibleNameInput) responsibleNameInput.value = '';
    if (linkAnuncioInput) linkAnuncioInput.value = '';
    if (urgencySelect) urgencySelect.value = 'normal';
    if (osTypeSelect) osTypeSelect.value = 'normal';
    if (photoTypeSelect) photoTypeSelect.value = 'estudio';
    if (skusInput) skusInput.value = '';
    if (observationsInput) observationsInput.value = '';
    if (valorAnuncioInput) valorAnuncioInput.value = '';
    if (descricaoAnuncioInput) descricaoAnuncioInput.value = '';
    if (linkNovoAnuncioInput) linkNovoAnuncioInput.value = '';
    if (precisaFotoSelect) precisaFotoSelect.value = 'nao';
    if (photoLinkInput) photoLinkInput.value = '';
    updateProductCounter(productNameInput, 'productCounter');
    
    // Ocultar campos de anúncio
    document.getElementById('camposAnuncio').classList.add('hidden');
    
    // Limpar fotos
    selectedPhotos = [];
    const previewArea = document.getElementById('photoPreviews');
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.style.display = 'none';
    }
    
    const uploadArea = document.getElementById('photoUploadArea');
    if (uploadArea) {
        uploadArea.querySelector('p:first-of-type').textContent = 'Clique ou arraste fotos aqui';
    }
    
    editingOrderId = null;
    if (formTitle) formTitle.textContent = 'Nova Ordem de Serviço';
    if (submitBtnText) submitBtnText.textContent = 'Salvar OS';
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    
    generateOSCode();
}

function cancelEdit() {
    editingOrderId = null;
    if (formTitle) formTitle.textContent = 'Nova Ordem de Serviço';
    if (submitBtnText) submitBtnText.textContent = 'Salvar OS';
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    clearForm();
    showToast('❌ Edição cancelada', 'info');
}

function generateOSCode() {
    const timestamp = Date.now().toString().slice(-4);
    const code = `OS${orderCounter.toString().padStart(4, '0')}-${timestamp}`;
    if (osCodeDisplay) osCodeDisplay.textContent = `Código: ${code}`;
    return code;
}

// ============================================
// FUNÇÕES DE FILTRO E PERMISSÃO (ATUALIZADO)
// ============================================
function filterOrdersByUser(ordersList) {
    if (!currentUser) return [];    
    
    // Administrador vê TODAS as ordens
    if (currentUser.role === 'Administrador') {
        return ordersList;
    }
    
    // Outros usuários só veem as ordens onde são responsáveis ou criadores
    return ordersList.filter(order => {
        const isResponsible = order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase());
        const isCreator = order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase());
        return isResponsible || isCreator;
    });
}

function checkOrderPermission(order) {
    if (!currentUser) return false;
    
    /// Administrador tem permissão para TUDO
    if (currentUser.role === 'Administrador') { // ALTERADO AQUI
        return true;
    }
    
    // Outros usuários só têm permissão se forem responsáveis ou criadores
    const isResponsible = order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase());
    const isCreator = order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase());
    return isResponsible || isCreator;
}

function updateCounters() {
    if (!currentUser) return;
    
    const userOrders = filterOrdersByUser(orders);
    const myPending = userOrders.filter(o => o.status === 'pendente').length;
    const myProgress = userOrders.filter(o => o.status === 'andamento').length;
    const myCompleted = userOrders.filter(o => o.status === 'concluida').length;
    const myTotal = userOrders.length;

    // Contar OS concluídas não conferidas (para destaque)
    const completedNotChecked = userOrders.filter(o => o.status === 'concluida' && !o.conferido).length;
    
    if (countPending) countPending.textContent = myPending;
    if (countProgress) countProgress.textContent = myProgress;
    if (countCompleted) {
        countCompleted.textContent = `${myCompleted}`;
        // Adicionar badge se houver OS não conferidas
        if (completedNotChecked > 0) {
            countCompleted.innerHTML = `${myCompleted} <span class="badge badge-warning" style="margin-left: 5px;">${completedNotChecked} não conferidas</span>`;
        }
    }
    if (countTotal) countTotal.textContent = myTotal;
    
    if (myOrdersCount) {
        // Se for administrador, mostrar "todas as ordens" em vez de "minhas ordens"
        if (currentUser.role === 'Administrador') {
            myOrdersCount.textContent = `${myTotal} (todas)`;
        } else {
            myOrdersCount.textContent = myTotal;
        }
    }
    
    if (totalOrdersCount) totalOrdersCount.textContent = orders.length;
    
    if (emptyMessage) {
        if (myTotal === 0) {
            emptyMessage.classList.remove('hidden');
            const tableResponsive = document.querySelector('.table-responsive');
            if (tableResponsive) tableResponsive.classList.add('hidden');
            
            if (currentUser.role === 'Administrador') {
                emptyMessage.innerHTML = `
                    <i class="fas fa-user-lock fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhuma ordem no sistema</h4>
                    <p style="color: #6c757d;">Não há ordens de serviço cadastradas no momento.</p>
                    <p style="color: #6c757d; font-size: 12px; margin-top: 10px;">
                        <i class="fas fa-info-circle"></i>
                        Como administrador, você vê todas as ordens do sistema.
                    </p>
                `;
            }
        } else {
            emptyMessage.classList.add('hidden');
            const tableResponsive = document.querySelector('.table-responsive');
            if (tableResponsive) tableResponsive.classList.remove('hidden');
        }
    }

    updateOSNotificationBell();   // <-- COLE AQUI
}

// ============================================
// FUNÇÃO RENDER ORDERS TABLE (CORRIGIDA - MOSTRAR LINK NAS CONCLUÍDAS)
// ============================================
function renderOrdersTable() {
    if (!osTableBody) return;
    
    osTableBody.innerHTML = '';
    
    if (!currentUser) {
        if (emptyMessage) emptyMessage.classList.remove('hidden');
        const tableResponsive = document.querySelector('.table-responsive');
        if (tableResponsive) tableResponsive.classList.add('hidden');
        return;
    }
    
    let userOrders = filterOrdersByUser(orders);
    let filteredOrders = currentFilter === 'todos' ? userOrders : 
                         userOrders.filter(order => order.status === currentFilter);

    if (currentFilter === 'nao_conferidas') {
        filteredOrders = userOrders.filter(order => 
            order.status === 'concluida' && !order.conferido
        );
    }
    
    if (filteredOrders.length === 0) {
        osTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 40px;">
                    <i class="fas fa-user-lock fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma ordem disponível</h4>
                    ${currentUser.role === 'Administrador' ? 
                    '<p style="color: #6c757d;">Não há ordens no sistema com seu filtro atual.</p>' :
                    '<p style="color: #6c757d;">Você não tem permissão para visualizar ordens ou não há ordens com seu filtro atual.</p>'}
                </td>
            </tr>
        `;
        return;
    }
    
    // Ordenar: OS finalizadas não conferidas primeiro, depois por data
    filteredOrders.sort((a, b) => {
        // Primeiro: OS concluídas não conferidas
        const aIsCompletedNotChecked = a.status === 'concluida' && !a.conferido;
        const bIsCompletedNotChecked = b.status === 'concluida' && !b.conferido;
        
        if (aIsCompletedNotChecked && !bIsCompletedNotChecked) return -1;
        if (!aIsCompletedNotChecked && bIsCompletedNotChecked) return 1;
        
        // Depois: por data de atualização (mais recente primeiro)
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        const hasPermission = checkOrderPermission(order);
        const isAdmin = currentUser.role === 'Administrador';
        
        // ESTILO ESPECIAL PARA OS FINALIZADAS NÃO CONFERIDAS
        if (order.status === 'concluida' && !order.conferido) {
            row.className = 'urgent-high'; // Destaque vermelho
            row.style.animation = 'pulseReturn 2s infinite'; // Pulsação para chamar atenção
            row.style.backgroundColor = '#fff5f5'; // Fundo vermelho claro
        } else if (order.osType === 'devolucao') {
            row.className = 'return-highlight';
        } else if (order.urgency === 'alta') {
            row.className = 'urgent-high';
        } else if (order.urgency === 'normal') {
            row.className = 'urgent-medium';
        } else {
            row.className = 'urgent-low';
        }
        
        // Badge de Conferência
        let conferenciaBadge = '';
        if (order.status === 'concluida') {
            if (order.conferido) {
                conferenciaBadge = `
                    <span class="badge badge-success" style="margin-left: 5px;">
                        <i class="fas fa-check-double"></i> Conferido
                    </span>
                    ${order.conferidoPor ? `<small style="display: block; color: #28a745; margin-top: 2px;">
                        <i class="fas fa-user-check"></i> ${order.conferidoPor}
                    </small>` : ''}
                `;
            } else {
                conferenciaBadge = `
                    <span class="badge badge-warning" style="margin-left: 5px; animation: pulse 1.5s infinite;">
                        <i class="fas fa-exclamation-circle"></i> Aguardando conferência
                    </span>
                `;
            }
        }
        
        // LINK DO ANÚNCIO - AGORA APARECE PARA TODAS AS OS CONCLUÍDAS (NÃO APENAS NÃO CONFERIDAS)
       // LINKS DO ANÚNCIO - MOSTRA AMBOS SE EXISTIREM (APENAS PARA OS CONCLUÍDAS)
let linkAnuncioDisplay = '';
if (order.status === 'concluida') {
    const temLinkOriginal = order.linkAnuncio && order.linkAnuncio.trim() !== '';
    const temLinkNovo = order.linkNovoAnuncio && order.linkNovoAnuncio.trim() !== '';
    
    if (temLinkOriginal || temLinkNovo) {
        linkAnuncioDisplay = '<div style="margin-top: 12px;">';
        
        // Link Original (se existir)
        if (temLinkOriginal) {
            linkAnuncioDisplay += `
                <div style="margin-bottom: 8px; padding: 10px; background: #f0f7ff; border-radius: 6px; border-left: 4px solid #0066cc; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                        <i class="fas fa-link" style="color: #0066cc; font-size: 14px;"></i>
                        <span style="font-weight: 600; color: #0066cc; font-size: 12px;">LINK ORIGINAL DO ANÚNCIO</span>
                    </div>
                    <a href="${order.linkAnuncio}" target="_blank" rel="noopener noreferrer" 
                       style="color: #0066cc; text-decoration: none; font-size: 13px; word-break: break-all; display: block; padding: 5px 8px; background: white; border-radius: 4px; border: 1px solid #b8daff;">
                        <i class="fas fa-external-link-alt" style="margin-right: 5px; font-size: 11px;"></i>
                        ${order.linkAnuncio.length > 50 ? order.linkAnuncio.substring(0, 50) + '...' : order.linkAnuncio}
                    </a>
                </div>
            `;
        }
        
        // Link Novo (se existir)
        if (temLinkNovo) {
            linkAnuncioDisplay += `
                <div style="margin-bottom: ${temLinkOriginal ? '8px' : '0'}; padding: 10px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #28a745; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                        <i class="fas fa-link" style="color: #28a745; font-size: 14px;"></i>
                        <span style="font-weight: 600; color: #28a745; font-size: 12px;">LINK DO NOVO ANÚNCIO</span>
                    </div>
                    <a href="${order.linkNovoAnuncio}" target="_blank" rel="noopener noreferrer" 
                       style="color: #28a745; text-decoration: none; font-size: 13px; word-break: break-all; display: block; padding: 5px 8px; background: white; border-radius: 4px; border: 1px solid #c3e6cb;">
                        <i class="fas fa-external-link-alt" style="margin-right: 5px; font-size: 11px;"></i>
                        ${order.linkNovoAnuncio.length > 50 ? order.linkNovoAnuncio.substring(0, 50) + '...' : order.linkNovoAnuncio}
                    </a>
                    ${order.valorAnuncio ? `
                    <div style="margin-top: 6px; font-size: 12px; color: #28a745; font-weight: 600;">
                        <i class="fas fa-tag"></i> R$ ${parseFloat(order.valorAnuncio).toFixed(2)}
                    </div>
                    ` : ''}
                </div>
            `;
        }
        
        linkAnuncioDisplay += '</div>';
    }
}
        
        // Badges de permissão
        let permissionBadge = '';
        if (isAdmin) {
            permissionBadge = '<span class="badge badge-danger" style="margin-left: 5px;"><i class="fas fa-crown"></i> Admin</span>';
        } else if (order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            permissionBadge = '<span class="badge badge-primary" style="margin-left: 5px;"><i class="fas fa-user-check"></i> Responsável</span>';
        } else if (order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            permissionBadge = '<span class="badge badge-info" style="margin-left: 5px;"><i class="fas fa-user-edit"></i> Criador</span>';
        }
        
        // Badge de acesso admin
        let accessBadge = '';
        if (isAdmin) {
            const isDirectAccess = order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase()) || 
                                  order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase());
            if (!isDirectAccess) {
                accessBadge = '<span class="badge badge-secondary" style="margin-left: 5px;"><i class="fas fa-user-shield"></i> Acesso Admin</span>';
            }
        }
        
        let typeBadge = order.osType === 'devolucao' ? 
            '<span class="badge badge-danger" style="margin-left: 5px;"><i class="fas fa-exchange-alt"></i> Devolução</span>' : '';
        
        let urgencyBadge = '';
        if (order.urgency === 'alta') urgencyBadge = '<span class="badge badge-danger">Alta</span>';
        else if (order.urgency === 'normal') urgencyBadge = '<span class="badge badge-warning">Normal</span>';
        else urgencyBadge = '<span class="badge badge-success">Baixa</span>';
        
        let statusBadge = '';
        if (order.status === 'pendente') statusBadge = '<span class="status-pending">Pendente</span>';
        else if (order.status === 'andamento') statusBadge = '<span class="status-progress">Em Andamento</span>';
        else statusBadge = '<span class="status-completed">Concluída</span>';
        
        // Formatar data
        const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
        const formattedDate = createdDate.toLocaleDateString('pt-BR') + ' ' + 
                             createdDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
        
        // Botões
        let actionButtons = '';

        // Botão de VISUALIZAR
        if (hasPermission || isAdmin) {
            actionButtons += `<button class="btn btn-primary btn-sm" onclick="viewOrderDetails('${order.id}')" title="Visualizar OS">
                <i class="fas fa-eye"></i>
            </button>`;
        }

        // Botão para visualizar fotos (se houver fotos)
        if (order.photos && order.photos.length > 0) {
            if (hasPermission || isAdmin) {
                actionButtons += `<button class="btn btn-info btn-sm" onclick="viewOrderPhotos('${order.id}')" title="Ver Fotos">
                    <i class="fas fa-images"></i> ${order.photos.length}
                </button>`;
            }
        }

        // BOTÃO DE CONFERIR (apenas para OS concluídas não conferidas)
        if (order.status === 'concluida' && !order.conferido && (hasPermission || isAdmin)) {
            actionButtons += `<button class="btn btn-success btn-sm" onclick="conferirOS('${order.id}')" title="Marcar como Conferido">
                <i class="fas fa-check-double"></i>
            </button>`;
        }

        if (hasPermission || isAdmin) {
            if (order.status === 'pendente') {
                actionButtons += `<button class="btn btn-success btn-sm" onclick="startOrder('${order.id}')" title="Iniciar OS">
                    <i class="fas fa-play"></i>
                </button>`;
            } else if (order.status === 'andamento') {
                actionButtons += `<button class="btn btn-info btn-sm" onclick="openCompleteModal('${order.id}')" title="Finalizar OS">
                    <i class="fas fa-flag-checkered"></i>
                </button>`;
            }
            
            actionButtons += `<button class="btn btn-warning btn-sm" onclick="editOrder('${order.id}')" title="Editar OS">
                <i class="fas fa-edit"></i>
            </button>`;
        }

        // Botão de impressão
        actionButtons += `<button class="btn btn-primary btn-sm" onclick="openPrintModal(${JSON.stringify(order).replace(/"/g, '&quot;')})" title="Imprimir OS">
            <i class="fas fa-print"></i>
        </button>`;
        
        // Botão de excluir apenas para admin ou criador
        if (isAdmin || order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            actionButtons += `<button class="btn btn-danger btn-sm" onclick="deleteOrderPrompt('${order.id}')" title="Excluir OS">
                <i class="fas fa-trash"></i>
            </button>`;
        }
        
        row.innerHTML = `
            <td>
                <strong>${order.code}</strong>
                ${conferenciaBadge}
                ${permissionBadge}
                ${accessBadge}
                ${typeBadge}
                <!-- LINK VISÍVEL PARA TODAS AS OS CONCLUÍDAS -->
                ${linkAnuncioDisplay}
            </td>
            <td>${order.productName}</td>
            <td>
                <div>${order.responsibleName}</div>
                <small><i class="fas fa-user-plus"></i> Criado por: ${order.createdBy || 'Sistema'}</small>
                ${order.status === 'concluida' && order.conferidoPor ? `
                <small style="display: block; color: #28a745; margin-top: 2px;">
                    <i class="fas fa-user-check"></i> Conferido por: ${order.conferidoPor}
                </small>
                ` : ''}
            </td>
            <td>${urgencyBadge}</td>
            <td>${statusBadge}</td>
            <td>${formattedDate}</td>
            <td>
                <div class="d-flex gap-2">
                    ${actionButtons}
                </div>
            </td>
        `;
        
        osTableBody.appendChild(row);
    });

    updateOSNotificationBell();
}

// ============================================
// FUNÇÕES DE AÇÃO (GLOBAIS)
// ============================================
window.filterOS = function(filter) {
    currentFilter = filter;
    renderOrdersTable();
    highlightActiveFilterButton();
};

// Mostrar mensagem do filtro ativo
    const filterNames = {
        'pendente': 'Pendentes',
        'andamento': 'Em Andamento',
        'concluida': 'Concluídas',
        'nao_conferidas': 'Não Conferidas',
        'todos': 'Todas'
    };

window.viewOrder = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order) {
        alert(`📋 Detalhes da OS:\n\n🏷️ Código: ${order.code}\n📦 Produto: ${order.productName}\n👤 Responsável: ${order.responsibleName}\n📊 Status: ${order.status}`);
    }
};

window.editOrder = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order)) {
        editingOrderId = orderId;
        
        const productNameInput = document.getElementById('productName');
        const responsibleNameInput = document.getElementById('responsibleName');
        const linkAnuncioInput = document.getElementById('linkAnuncio');
        const urgencySelect = document.getElementById('urgency');
        const osTypeSelect = document.getElementById('osType');
        const photoTypeSelect = document.getElementById('photoType');
        const skusInput = document.getElementById('skus');
        const observationsInput = document.getElementById('observations');
        const valorAnuncioInput = document.getElementById('valorAnuncio');
        const descricaoAnuncioInput = document.getElementById('descricaoAnuncio');
        const linkNovoAnuncioInput = document.getElementById('linkNovoAnuncio');
        const precisaFotoSelect = document.getElementById('precisaFoto');
        updateProductCounter(productNameInput, 'productCounter');

        // LÓGICA PARA EXTRAIR O RESPONSÁVEL CORRETO
        let responsibleToShow = order.responsibleName;
        // Verificar se Elaine foi adicionada automaticamente
        if (order.responsibleName && order.responsibleName.includes(' e Elaine')) {
            // Extrair o nome original (remover " e Elaine")
            responsibleToShow = order.responsibleName.replace(' e Elaine', '').trim();
        } else if (order.responsibleName === 'Elaine' && order.precisaFoto === 'sim') {
            // Se for apenas Elaine por causa das fotos, mostrar como estava
            responsibleToShow = order.createdBy !== 'Elaine' ? order.createdBy : 'Elaine';
        }
        
        if (productNameInput) { productNameInput.value = order.productName;
            setTimeout(function() {
                contarCaracteres();
            }, 100);
        }
        if (responsibleNameInput) responsibleNameInput.value = order.responsibleName;
        if (linkAnuncioInput) linkAnuncioInput.value = order.linkAnuncio || '';
        if (urgencySelect) urgencySelect.value = order.urgency;
        if (osTypeSelect) osTypeSelect.value = order.osType;
        if (photoTypeSelect) photoTypeSelect.value = order.photoType;
        if (skusInput) skusInput.value = Array.isArray(order.skus) ? order.skus.join(', ') : order.skus;
        if (observationsInput) observationsInput.value = order.observations;
        if (valorAnuncioInput) valorAnuncioInput.value = order.valorAnuncio || '';
        if (descricaoAnuncioInput) descricaoAnuncioInput.value = order.descricaoAnuncio || '';
        if (linkNovoAnuncioInput) linkNovoAnuncioInput.value = order.linkNovoAnuncio || '';
        if (precisaFotoSelect) precisaFotoSelect.value = order.precisaFoto || 'nao';
        
        // Mostrar/ocultar campos de anúncio
        toggleCamposAnuncio();
        
        // Carregar fotos existentes
        selectedPhotos = order.photos || [];
        updatePhotoPreviews();
        
        if (formTitle) formTitle.textContent = `Editando: ${order.code}`;
        if (submitBtnText) submitBtnText.textContent = 'Atualizar OS';
        if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');
        if (osCodeDisplay) osCodeDisplay.textContent = `Código: ${order.code}`;
        
        showToast(`✏️ Editando OS: ${order.code}`, 'info');
    } else {
        showToast('⚠️ Sem permissão para editar', 'warning');
    }
};

window.viewOrderPhotos = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && order.photos && order.photos.length > 0) {
        openPhotoViewer(order.photos, order.productName);
    } else {
        showToast('Nenhuma foto disponível para esta OS', 'info');
    }
};

window.abrirSistemaOS = function() {
    if (!currentUser) {
        showToast('Faça login primeiro', 'warning');
        return;
    }
    // Esconder menu
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    // Esconder outros sistemas
    const sistemas = ['salesSystem', 'reembolsosSystem', 'caixaSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'estoqueGestaoSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    
    // Atualizar dados do usuário na interface OS
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.avatar;
    document.getElementById('userRole').textContent = currentUser.role;
    
    // Carregar ordens se necessário
    if (typeof loadOrders === 'function') loadOrders();
    showToast('Sistema de Ordem de Serviço', 'info');
};

// ============================================
// FUNÇÃO PARA VOLTAR AO FORMULÁRIO VAZIO (HOME)
// ============================================
window.voltarParaHome = function() {
    // Cancelar qualquer edição em andamento
    if (editingOrderId) {
        cancelEdit();
    } else {
        // Apenas limpar o formulário
        clearForm();
    }
    
    // Voltar para o filtro "pendente" (ou o padrão que você preferir)
    if (currentFilter !== 'pendente') {
        currentFilter = 'pendente';
        highlightActiveFilterButton();
        renderOrdersTable();
    }
    
    // Rolar suavemente para o topo do formulário
    const formSection = document.querySelector('.form-section');
    if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    showToast('🏠 Voltando ao início', 'info');
};

// ============================================
// FUNÇÕES PARA MANIPULAÇÃO DE FOTOS
// ============================================
function setupPhotoUpload() {
    const uploadArea = document.getElementById('photoUploadArea');
    const fileInput = document.getElementById('photoUploadInput');
    
    if (!uploadArea || !fileInput) return;
    
    // Clique na área de upload
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // Arrastar e soltar
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handlePhotoFiles(e.dataTransfer.files);
        }
    });
    
    // Mudança no input de arquivo
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePhotoFiles(e.target.files);
        }
    });
}

function handlePhotoFiles(files) {
    const previewArea = document.getElementById('photoPreviews');
    
    for (let file of files) {
        if (selectedPhotos.length >= MAX_PHOTOS_PER_OS) {
            showToast(`Limite de ${MAX_PHOTOS_PER_OS} fotos atingido`, 'warning');
            break;
        }
        
        if (!file.type.startsWith('image/')) {
            showToast('Apenas imagens são permitidas', 'error');
            continue;
        }
        
        if (file.size > MAX_PHOTO_SIZE) {
            showToast(`Arquivo muito grande (máx. 5MB): ${file.name}`, 'error');
            continue;
        }
        
        // Converter para base64
        const reader = new FileReader();
        reader.onload = (e) => {
            const photoData = {
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                thumbnail: createThumbnail(e.target.result),
                isLink: false
            };
            
            selectedPhotos.push(photoData);
            updatePhotoPreviews();
        };
        reader.readAsDataURL(file);
    }
    
    // Resetar input
    document.getElementById('photoUploadInput').value = '';
}

function createThumbnail(base64Data) {
    // Para simplificar, usamos a mesma imagem
    // Em produção, você pode criar um thumbnail menor aqui
    return base64Data;
}

function updatePhotoPreviews() {
    const previewArea = document.getElementById('photoPreviews');
    if (!previewArea) return;
    
    previewArea.innerHTML = '';
    
    selectedPhotos.forEach((photo, index) => {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-preview';
        
        // Ícone diferente para fotos por link
        const icon = photo.isLink ? 'fa-link' : 'fa-image';
        
        photoElement.innerHTML = `
            <img src="${photo.thumbnail || photo.data}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer;"
                 onclick="removePhoto(${index})">
                ×
            </div>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 3px 5px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fas ${icon}"></i> ${photo.name}
            </div>
        `;
        
        previewArea.appendChild(photoElement);
    });
    
    if (selectedPhotos.length > 0) {
        previewArea.style.display = 'flex';
        
        // Atualizar contador
        const uploadArea = document.getElementById('photoUploadArea');
        if (uploadArea) {
            const countText = `<span style="color: #8A2BE2; font-weight: bold;">${selectedPhotos.length}</span> foto(s) selecionada(s)`;
            uploadArea.querySelector('p:first-of-type').innerHTML = countText;
        }
    } else {
        previewArea.style.display = 'none';
    }
}

window.removePhoto = function(index) {
    selectedPhotos.splice(index, 1);
    updatePhotoPreviews();
};

function openPhotoViewer(photos, orderName) {
    const modal = document.getElementById('photoViewerModal');
    const gallery = document.getElementById('photoGallery');
    const title = document.getElementById('photoViewerTitle');
    
    if (!modal || !gallery) return;
    
    if (title) {
        title.textContent = `Fotos da OS: ${orderName}`;
    }
    
    gallery.innerHTML = '';
    
    photos.forEach((photo, index) => {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        
        // Ícone diferente para fotos por link
        const icon = photo.isLink ? 'fa-link' : 'fa-image';
        
        photoElement.innerHTML = `
            <img src="${photo.data || photo.thumbnail}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 180px; object-fit: cover;"
                 onclick="viewFullPhoto(${index}, ${JSON.stringify(photos).replace(/"/g, '&quot;')})">
            <div style="padding: 10px; background: white;">
                <div style="font-size: 12px; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <i class="fas ${icon}"></i> ${photo.name}
                </div>
                <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                    ${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)}
                </div>
            </div>
        `;
        
        gallery.appendChild(photoElement);
    });
    
    modal.classList.remove('hidden');
}

window.viewFullPhoto = function(index, photosData) {
    const photos = typeof photosData === 'string' ? JSON.parse(photosData) : photosData;
    const photo = photos[index];
    
    if (photo) {
        const viewer = window.open('');
        viewer.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${photo.name}</title>
                <style>
                    body { margin: 0; padding: 20px; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                    img { max-width: 100%; max-height: 90vh; object-fit: contain; }
                    .close-btn { position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; }
                </style>
            </head>
            <body>
                <button class="close-btn" onclick="window.close()">×</button>
                <img src="${photo.data}" alt="${photo.name}">
            </body>
            </html>
        `);
    }
};

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function closePhotoViewer() {
    document.getElementById('photoViewerModal').classList.add('hidden');
}

window.startOrder = async function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order) && confirm(`Iniciar "${order.productName}"?`)) {
        try {
            if (supabaseClient) {
                await supabaseClient.from('ordens_service')
                    .update({ status: 'andamento', ultima_atualizacao: new Date().toISOString() })
                    .eq('id', orderId);
            }
            
            order.status = 'andamento';
            updateCounters();
            renderOrdersTable();
            showToast(`✅ OS iniciada`, 'success');
        } catch (error) {
            showToast('❌ Erro ao iniciar', 'error');
        }
    }
};

window.openCompleteModal = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order)) {
        completeOSId.value = orderId;
        const photosTakenInput = document.getElementById('photosTaken');
        const editsMadeInput = document.getElementById('editsMade');
        if (photosTakenInput) photosTakenInput.value = order.photosTaken || 0;
        if (editsMadeInput) editsMadeInput.value = order.editsMade || 0;
        if (completeModal) completeModal.classList.remove('hidden');
    }
};

window.closeCompleteModal = function() {
    if (completeModal) completeModal.classList.add('hidden');
};

async function completeOrder() {
    const orderId = completeOSId.value;
    const order = orders.find(o => o.id == orderId);
    
    if (!order || !checkOrderPermission(order)) {
        showToast('⚠️ Sem permissão', 'warning');
        return;
    }
    
    const photosTakenInput = document.getElementById('photosTaken');
    const editsMadeInput = document.getElementById('editsMade');
    
    const photosTaken = photosTakenInput ? parseInt(photosTakenInput.value) || 0 : 0;
    const editsMade = editsMadeInput ? parseInt(editsMadeInput.value) || 0 : 0;
    
    try {
        if (supabaseClient) {
            await supabaseClient.from('ordens_service')
                .update({ 
                    status: 'concluida',
                    qtd_fotos: photosTaken,
                    qtd_edicoes: editsMade,
                    data_conclusao: new Date().toISOString(),
                    // Resetar conferência quando finalizar novamente
                    conferido: false,
                    conferido_por: null,
                    data_conferencia: null,
                    ultima_atualizacao: new Date().toISOString()
                })
                .eq('id', orderId);
        }
        
        order.status = 'concluida';
        order.photosTaken = photosTaken;
        order.editsMade = editsMade;
        order.completionDate = new Date().toISOString();
        // Resetar conferência
        order.conferido = false;
        order.conferidoPor = null;
        order.dataConferencia = null;
        
        updateCounters();
        renderOrdersTable();
        closeCompleteModal();
        showToast(`✅ OS finalizada`, 'success');
    } catch (error) {
        showToast('❌ Erro ao finalizar', 'error');
    }
}

window.deleteOrderPrompt = async function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order) && confirm(`Excluir "${order.productName}"?`)) {
        try {
            if (supabaseClient) {
                await supabaseClient.from('ordens_service')
                    .delete()
                    .eq('id', orderId);
            }
            
            orders = orders.filter(o => o.id != orderId);
            updateCounters();
            renderOrdersTable();
            showToast(`🗑️ OS excluída`, 'success');
        } catch (error) {
            showToast('❌ Erro ao excluir', 'error');
        }
    }
};

// ============================================
// FUNÇÕES DE IMPRESSÃO MELHORADAS (COM FOTOS)
// ============================================
window.openPrintModal = function(osData) {
    currentOSForPrint = osData;
    
    // Mapear valores para texto
    const statusMap = {
        'pendente': 'Pendente',
        'andamento': 'Em Andamento',
        'concluida': 'Concluída'
    };
    
    const urgencyMap = {
        'alta': 'Alta',
        'normal': 'Normal',
        'baixa': 'Baixa'
    };
    
    const photoTypeMap = {
        'estudio': 'Foto Estúdio',
        'bike': 'Foto Bike',
        'ambos': 'Ambos',
        'edicao': 'Apenas edição',
        'criar_anuncio': 'Criar anúncio',
        'replicar_anuncio': 'Replicar anúncio'
    };
    
    const osTypeMap = {
        'normal': 'Normal',
        'devolucao': 'Devolução',
        'urgente': 'Urgente'
    };
    
    const statusText = statusMap[osData.status] || osData.status;
    const urgencyText = urgencyMap[osData.urgency] || osData.urgency;
    const photoTypeText = photoTypeMap[osData.photoType] || osData.photoType;
    const osTypeText = osTypeMap[osData.osType] || osData.osType;
    const formattedDate = new Date(osData.createdAt).toLocaleString('pt-BR');
    
    // Gerar preview
    generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate);
    
    // Mostrar modal
    document.getElementById('printModal').classList.remove('hidden');
    
    // Adicionar listener para Ctrl+P
    document.addEventListener('keydown', handlePrintShortcut);
};

function generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate) {
    const previewContainer = document.getElementById('printPreviewContent');
    
    let statusBadgeClass = 'badge-pending';
    if (osData.status === 'andamento') statusBadgeClass = 'badge-progress';
    if (osData.status === 'concluida') statusBadgeClass = 'badge-completed';
    
    let urgencyBadgeClass = 'badge-normal';
    if (osData.urgency === 'alta') urgencyBadgeClass = 'badge-high';
    if (osData.urgency === 'baixa') urgencyBadgeClass = 'badge-low';
    
    // Seção de fotos se houver
    let photosSection = '';
    if (osData.photos && osData.photos.length > 0) {
        photosSection = `
            <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-images"></i>
                    </div>
                    <h3 class="card-title">Fotos de Referência (${osData.photos.length})</h3>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-top: 15px;">
                    ${osData.photos.map((photo, index) => `
                        <div style="text-align: center;">
                            <img src="${photo.data || photo.thumbnail}" 
                                 alt="${photo.name}"
                                 style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px; border: 1px solid #dee2e6;">
                            <div style="font-size: 10px; color: #6c757d; margin-top: 5px; overflow: hidden; text-overflow: ellipsis;">
                                ${photo.name}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Seção para criar/replicar anúncio
    let anuncioSection = '';
    if (osData.photoType === 'criar_anuncio' || osData.photoType === 'replicar_anuncio') {
        anuncioSection = `
            <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-ad"></i>
                    </div>
                    <h3 class="card-title">Detalhes do Anúncio</h3>
                </div>
                <div class="info-row">
                    <div class="info-label">Valor:</div>
                    <div class="info-value" style="font-weight: 700; color: #28a745;">
                        R$ ${parseFloat(osData.valorAnuncio || 0).toFixed(2)}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Precisa de foto:</div>
                    <div class="info-value">
                        ${osData.precisaFoto === 'sim' ? 
                        '<span class="badge badge-warning">Sim - Elaine notificada</span>' : 
                        '<span class="badge badge-success">Não</span>'}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Descrição:</div>
                    <div class="info-value">
                        ${osData.descricaoAnuncio || 'Nenhuma descrição fornecida'}
                    </div>
                </div>
                ${osData.linkNovoAnuncio ? `
                <div class="info-row">
                    <div class="info-label">Link do novo anúncio:</div>
                    <div class="info-value" style="word-break: break-all; font-size: 11pt;">
                        <a href="${osData.linkNovoAnuncio}" style="color: #8A2BE2; text-decoration: none;">
                            <i class="fas fa-link"></i> ${osData.linkNovoAnuncio}
                        </a>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    previewContainer.innerHTML = `
        <div class="print-preview ${currentPrintStyle === 'compact' ? 'compact-view' : ''}">
            <!-- Cabeçalho -->
            <div class="preview-header">
                <div class="header-gradient">
                    <h1 style="font-size: 42px; margin: 0 0 10px 0; font-weight: 800;">
                        <i class="fas fa-camera"></i> Sistema OS Fotografia
                    </h1>
                    <p style="font-size: 18px; opacity: 0.9; margin: 0 0 20px 0;">
                        Ordem de Serviço Profissional
                    </p>
                    <div class="os-code-preview">
                        OS-${osData.code}
                    </div>
                </div>
                
                <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: center; padding: 0 20px;">
                    <div style="text-align: left;">
                        <div style="font-size: 14px; color: #6c757d;">Emitido em</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            ${new Date().toLocaleString('pt-BR')}
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="font-size: 14px; color: #6c757d;">Tipo de Documento</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            Ordem de Serviço ${osData.osType === 'devolucao' ? '- Devolução' : ''}
                        </div>
                    </div>
                    
                    <div style="text-align: right;">
                        <div style="font-size: 14px; color: #6c757d;">Página</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            1 de 1
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Grid de Informações -->
            <div class="preview-grid">
                <!-- Card: Informações do Produto -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-box"></i>
                        </div>
                        <h3 class="card-title">Informações do Produto</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Produto:</div>
                        <div class="info-value" style="font-size: 18px; font-weight: 700; color: #8A2BE2;">
                            ${osData.productName}
                        </div>
                    </div>
                    
                    ${osData.linkAnuncio ? `
                    <div class="info-row">
                        <div class="info-label">Link do Anúncio:</div>
                        <div class="info-value" style="word-break: break-all; font-size: 11pt;">
                            <a href="${osData.linkAnuncio}" style="color: #8A2BE2; text-decoration: none;">
                                <i class="fas fa-link"></i> ${osData.linkAnuncio}
                            </a>
                        </div>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <div class="info-label">Serviço(s):</div>
                        <div class="info-value">
                            <i class="fas fa-camera" style="margin-right: 8px;"></i>
                            ${photoTypeText}
                        </div>
                    </div>
                </div>
                
                <!-- Card: Responsáveis -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3 class="card-title">Responsáveis</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Responsável:</div>
                        <div class="info-value" style="font-size: 16px; font-weight: 600;">
                            ${osData.responsibleName}
                            ${osData.osType === 'devolucao' ? 
                            '<span style="background: #dc3545; color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; margin-left: 10px;">DEVOLUÇÃO</span>' : ''}
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Criado por:</div>
                        <div class="info-value">
                            <i class="fas fa-user-edit" style="margin-right: 8px;"></i>
                            ${osData.createdBy}
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Data de Criação:</div>
                        <div class="info-value">
                            <i class="far fa-calendar-alt" style="margin-right: 8px;"></i>
                            ${formattedDate}
                        </div>
                    </div>
                </div>
                
                <!-- Card: Status e Prioridade -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-tasks"></i>
                        </div>
                        <h3 class="card-title">Status e Prioridade</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Status:</div>
                        <div class="info-value">
                            <span class="badge-preview ${statusBadgeClass}">
                                <i class="fas fa-circle" style="font-size: 8px; margin-right: 5px;"></i>
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Urgência:</div>
                        <div class="info-value">
                            <span class="badge-preview ${urgencyBadgeClass}">
                                <i class="fas fa-exclamation-triangle" style="margin-right: 5px;"></i>
                                ${urgencyText}
                            </span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Tipo de OS:</div>
                        <div class="info-value">
                            <i class="fas fa-file-alt" style="margin-right: 8px;"></i>
                            ${osTypeText}
                        </div>
                    </div>
                </div>
                
                ${photosSection}
                ${anuncioSection}
                
                <!-- Card: Observações -->
                <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-sticky-note"></i>
                        </div>
                        <h3 class="card-title">Observações e Detalhes</h3>
                    </div>
                    <div class="observations-box-preview">
                        ${osData.observations || 
                        '<div style="text-align: center; color: #adb5bd; padding: 20px;">' +
                        '<i class="fas fa-info-circle" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>' +
                        'Nenhuma observação registrada para esta ordem de serviço.' +
                        '</div>'}
                    </div>
                    
                    <!-- Detalhes de Conclusão (se aplicável) -->
                    ${osData.status === 'concluida' ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px dashed #dee2e6;">
                        <h4 style="color: #28a745; margin-bottom: 15px;">
                            <i class="fas fa-check-circle"></i> Detalhes da Conclusão
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Concluído em</div>
                                <div style="font-weight: 600; color: #495057;">
                                    ${new Date(osData.completionDate).toLocaleString('pt-BR')}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Fotos Tiradas</div>
                                <div style="font-weight: 600; color: #495057;">
                                    <i class="fas fa-camera-retro"></i> ${osData.photosTaken || '0'}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Edições Realizadas</div>
                                <div style="font-weight: 600; color: #495057;">
                                    <i class="fas fa-edit"></i> ${osData.editsMade || '0'}
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Rodapé -->
            <div class="footer-preview">
                <p style="margin: 5px 0;">
                    <strong>Documento válido somente para registro interno</strong>
                </p>
                <p style="margin: 5px 0; font-size: 11px;">
                    OS Code: ${osData.code} | ID: ${osData.id} | Emitido: ${formattedDate}
                    ${osData.completionDate ? `| Concluído: ${new Date(osData.completionDate).toLocaleString('pt-BR')}` : ''}
                </p>
                <p style="margin: 5px 0; font-size: 10px; color: #adb5bd;">
                    Documento gerado automaticamente pelo Sistema OS Fotografia - v2.0
                </p>
            </div>
            
            <!-- Watermark -->
            <div class="watermark">
                OS-${osData.code}
            </div>
        </div>
    `;
}

// Funções auxiliares para impressão
window.togglePrintStyle = function(style) {
    currentPrintStyle = style;
    if (currentOSForPrint) {
        const osData = currentOSForPrint;
        
        // Mapear valores (como na função principal)
        const statusMap = { 'pendente': 'Pendente', 'andamento': 'Em Andamento', 'concluida': 'Concluída' };
        const urgencyMap = { 'alta': 'Alta', 'normal': 'Normal', 'baixa': 'Baixa' };
        const photoTypeMap = { 'estudio': 'Estúdio', 'bike': 'Na Bike', 'ambos': 'Ambos', 'Apenas edição': 'Apenas edição', 'criar_anuncio': 'Criar anúncio', 'replicar_anuncio': 'Replicar anúncio' };
        const osTypeMap = { 'normal': 'Normal', 'devolucao': 'Devolução', 'urgente': 'Urgente' };
        
        const statusText = statusMap[osData.status] || osData.status;
        const urgencyText = urgencyMap[osData.urgency] || osData.urgency;
        const photoTypeText = photoTypeMap[osData.photoType] || osData.photoType;
        const osTypeText = osTypeMap[osData.osType] || osData.osType;
        const formattedDate = new Date(osData.createdAt).toLocaleString('pt-BR');
        
        generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate);
    }
};

// Atalho para impressão
function handlePrintShortcut(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printOS();
    }
}

window.closePrintModal = function() {
    document.getElementById('printModal').classList.add('hidden');
    currentOSForPrint = null;
    document.removeEventListener('keydown', handlePrintShortcut);
};

window.printOS = function() {
    // Criar uma janela de impressão com o conteúdo formatado
    const printContent = document.getElementById('printPreviewContent').innerHTML;
    
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ordem de Serviço - OS-${currentOSForPrint.code}</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                @media print {
                    @page {
                        margin: 20mm;
                        size: A4;
                    }
                    
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        color: #333;
                        font-size: 12pt;
                        line-height: 1.5;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    
                    .print-only {
                        display: block !important;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .page-break {
                        page-break-before: always;
                    }
                    
                    .avoid-break {
                        page-break-inside: avoid;
                    }
                    
                    /* Estilos específicos para impressão */
                    .print-header {
                        text-align: center;
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid #8A2BE2;
                    }
                    
                    .header-gradient {
                        background: linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%) !important;
                        color: white;
                        padding: 25px;
                        border-radius: 12px;
                        margin-bottom: 25px;
                        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.2);
                    }
                    
                    .os-code-preview {
                        font-size: 28px;
                        font-weight: 800;
                        letter-spacing: 2px;
                        background: rgba(255,255,255,0.15);
                        padding: 12px 25px;
                        border-radius: 10px;
                        display: inline-block;
                        margin: 15px 0;
                        border: 2px solid rgba(255,255,255,0.3);
                    }
                    
                    .preview-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin: 25px 0;
                    }
                    
                    .preview-card {
                        background: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                        padding: 15px;
                        page-break-inside: avoid;
                    }
                    
                    .card-header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 12px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #dee2e6;
                    }
                    
                    .card-icon {
                        width: 35px;
                        height: 35px;
                        background: #8A2BE2;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-right: 12px;
                        color: white;
                        font-size: 16px;
                    }
                    
                    .card-title {
                        font-size: 14px;
                        font-weight: 600;
                        color: #495057;
                        margin: 0;
                    }
                    
                    .info-row {
                        display: flex;
                        margin-bottom: 10px;
                        padding-bottom: 10px;
                        border-bottom: 1px dashed #dee2e6;
                    }
                    
                    .info-label {
                        font-weight: 600;
                        color: #6c757d;
                        width: 120px;
                        min-width: 120px;
                        font-size: 11pt;
                    }
                    
                    .info-value {
                        flex: 1;
                        color: #212529;
                        font-size: 11pt;
                    }
                    
                    .badge-preview {
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-weight: 600;
                        font-size: 11px;
                        display: inline-block;
                    }
                    
                    .observations-box-preview {
                        background: white;
                        border: 2px dashed #dee2e6;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 8px;
                        min-height: 80px;
                        font-style: italic;
                        color: #495057;
                        font-size: 11pt;
                    }
                    
                    .signature-section {
                        margin-top: 40px;
                        padding-top: 25px;
                        border-top: 3px solid #dee2e6;
                        page-break-inside: avoid;
                    }
                    
                    .signature-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 20px;
                        margin-top: 25px;
                    }
                    
                    .signature-box {
                        text-align: center;
                        padding: 15px;
                        border: 2px solid #e9ecef;
                        border-radius: 8px;
                        background: #f8f9fa;
                    }
                    
                    .signature-line {
                        width: 80%;
                        height: 1px;
                        background: #495057;
                        margin: 30px auto 10px;
                    }
                    
                    .signature-label {
                        font-size: 12px;
                        color: #6c757d;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-bottom: 8px;
                    }
                    
                    .signature-name {
                        font-size: 14px;
                        font-weight: 600;
                        color: #495057;
                        margin-top: 12px;
                    }
                    
                    .footer-preview {
                        margin-top: 40px;
                        text-align: center;
                        font-size: 10px;
                        color: #6c757d;
                        padding-top: 15px;
                        border-top: 1px solid #dee2e6;
                    }
                    
                    .watermark {
                        position: absolute;
                        bottom: 30mm;
                        right: 30mm;
                        opacity: 0.05;
                        font-size: 60px;
                        font-weight: 800;
                        color: #8A2BE2;
                        transform: rotate(-45deg);
                        pointer-events: none;
                        user-select: none;
                    }
                }
                
                /* Estilos para visualização na tela */
                @media screen {
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        margin: 20px;
                        color: #333;
                        background: #f5f5f5;
                    }
                    
                    .print-container {
                        background: white;
                        width: 210mm;
                        min-height: 297mm;
                        margin: 0 auto;
                        padding: 25mm;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                        border-radius: 3px;
                    }
                    
                    .print-controls {
                        text-align: center;
                        margin: 20px 0;
                        padding: 15px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    
                    .print-btn {
                        padding: 12px 30px;
                        background: #8A2BE2;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 0 10px;
                        transition: all 0.3s;
                    }
                    
                    .print-btn:hover {
                        background: #7a1bd2;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(138, 43, 226, 0.3);
                    }
                    
                    .close-btn {
                        background: #6c757d;
                    }
                    
                    .close-btn:hover {
                        background: #5a6268;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-controls no-print">
                <h2>Pronto para imprimir</h2>
                <p>Visualize como ficará a impressão antes de imprimir.</p>
                <button class="print-btn" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Documento
                </button>
                <button class="print-btn close-btn" onclick="window.close()">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
            
            <div class="print-container">
                ${printContent}
            </div>
            
            <script>
                // Auto-print quando a janela carregar
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                };
                
                // Fechar após impressão (opcional)
                window.onafterprint = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Fechar o modal de preview
    closePrintModal();
};

// ============================================
// FUNÇÃO DE NOTIFICAÇÃO
// ============================================
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    else if (type === 'error') icon = 'exclamation-circle';
    else if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Mostrar toast
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);
    
    // Remover depois de 4 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

// ============================================
// VARIÁVEIS PARA VISUALIZAÇÃO DA OS
// ============================================
let currentViewingOS = null;

// ============================================
// FUNÇÕES PARA VISUALIZAÇÃO DA OS
// ============================================
window.viewOrderDetails = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (!order) {
        showToast('Ordem não encontrada', 'error');
        return;
    }
    
    currentViewingOS = order;
    openViewOSModal(order);
};

function openViewOSModal(order) {
    // Atualizar cabeçalho
    document.getElementById('viewOSCode').textContent = order.code;
    
    // Atualizar contador de fotos
    const photoCount = order.photos ? order.photos.length : 0;
    document.getElementById('viewPhotosCount').textContent = photoCount;
    
    // Atualizar data de criação
    const createdDate = new Date(order.createdAt);
    document.getElementById('viewCreatedAt').textContent = createdDate.toLocaleString('pt-BR');
    
    // Carregar conteúdo inicial (aba de detalhes)
    switchViewOSTab('details');
    
    // Mostrar modal
    document.getElementById('viewOSModal').classList.remove('hidden');
}

function closeViewOSModal() {
    document.getElementById('viewOSModal').classList.add('hidden');
    currentViewingOS = null;
}

function switchViewOSTab(tabName) {
    // Atualizar botões das abas
    const tabButtons = document.querySelectorAll('#viewOSTabs .tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
        button.style.borderBottomColor = 'transparent';
        button.style.color = '#6c757d';
    });
    
    // Ativar botão atual
    const activeButton = document.querySelector(`#viewOSTabs button[onclick*="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        activeButton.style.borderBottomColor = '#8A2BE2';
        activeButton.style.color = '#8A2BE2';
    }
    
    // Carregar conteúdo da aba
    const contentContainer = document.getElementById('viewOSContent');
    
    switch(tabName) {
        case 'details':
            contentContainer.innerHTML = generateDetailsTab();
            break;
        case 'photos':
            contentContainer.innerHTML = generatePhotosTab();
            break;
        case 'timeline':
            contentContainer.innerHTML = generateTimelineTab();
            break;
    }
}

function generateDetailsTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    
    // Mapear valores para texto amigável
    const statusMap = {
        'pendente': { text: 'Pendente', class: 'status-pending-view' },
        'andamento': { text: 'Em Andamento', class: 'status-progress-view' },
        'concluida': { text: 'Concluída', class: 'status-completed-view' }
    };
    
    const urgencyMap = {
        'baixa': { text: 'Baixa', color: '#28a745' },
        'normal': { text: 'Normal', color: '#ffc107' },
        'alta': { text: 'Alta', color: '#dc3545' }
    };
    
    const photoTypeMap = {
        'estudio': 'Estúdio',
        'bike': 'Na Bike',
        'ambos': 'Ambos',
        'edicao': 'Apenas edição',
        'criar_anuncio': 'Criar anúncio',
        'replicar_anuncio': 'Replicar anúncio'
    };
    
    const osTypeMap = {
        'normal': 'Normal',
        'devolucao': 'Devolução'
    };
    
    const statusInfo = statusMap[order.status] || { text: order.status, class: '' };
    const urgencyInfo = urgencyMap[order.urgency] || { text: order.urgency, color: '#6c757d' };
    const photoTypeText = photoTypeMap[order.photoType] || order.photoType;
    const osTypeText = osTypeMap[order.osType] || order.osType;
    
    // Formatar datas
    const createdDate = new Date(order.createdAt);
    const formattedCreatedDate = createdDate.toLocaleDateString('pt-BR') + ' ' + 
                                createdDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    
    let completionDateText = 'Não concluída';
    if (order.completionDate) {
        const completionDate = new Date(order.completionDate);
        completionDateText = completionDate.toLocaleDateString('pt-BR') + ' ' + 
                           completionDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    }
    
    // Seção para criar/replicar anúncio
    let anuncioSection = '';
    if (order.photoType === 'criar_anuncio' || order.photoType === 'replicar_anuncio') {
        anuncioSection = `
            <div class="info-card" style="margin-top: 20px;">
                <h4><i class="fas fa-ad"></i> Detalhes do Anúncio</h4>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Valor do Anúncio</div>
                        <div class="info-value" style="font-weight: 700; color: #28a745;">
                            R$ ${parseFloat(order.valorAnuncio || 0).toFixed(2)}
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Precisa de foto?</div>
                        <div class="info-value">
                            ${order.precisaFoto === 'sim' ? 
                            '<span class="badge badge-warning">Sim - Elaine notificada</span>' : 
                            '<span class="badge badge-success">Não</span>'}
                        </div>
                    </div>
                </div>
                <div class="info-item" style="margin-top: 10px;">
                    <div class="info-label">Descrição</div>
                    <div class="info-value">
                        <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; margin-top: 5px;">
                            ${order.descricaoAnuncio || 'Nenhuma descrição fornecida'}
                        </div>
                    </div>
                </div>
                ${order.linkNovoAnuncio ? `
                <div class="info-item" style="margin-top: 10px;">
                    <div class="info-label">Link do Novo Anúncio</div>
                    <div class="info-value">
                        <a href="${order.linkNovoAnuncio}" target="_blank" rel="noopener noreferrer" 
                           style="color: #8A2BE2; text-decoration: none; display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-external-link-alt"></i>
                            Ver novo anúncio
                        </a>
                        <small style="display: block; color: #6c757d; margin-top: 5px; font-size: 12px; word-break: break-all;">
                            ${order.linkNovoAnuncio}
                        </small>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    return `
        <div class="tab-content active">
            <div class="info-grid">
                <!-- Informações do Produto -->
                <div class="info-card">
                    <h4><i class="fas fa-box"></i> Informações do Produto</h4>
                    <div class="info-item">
                        <div class="info-label">Produto</div>
                        <div class="info-value" style="font-size: 18px; font-weight: 700; color: #8A2BE2;">
                            ${order.productName}
                        </div>
                    </div>
                    
                    ${order.linkAnuncio ? `
                    <div class="info-item">
                        <div class="info-label">Link do Anúncio</div>
                        <div class="info-value">
                            <a href="${order.linkAnuncio}" target="_blank" rel="noopener noreferrer" 
                               style="color: #8A2BE2; text-decoration: none; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-external-link-alt"></i>
                                Ver anúncio
                            </a>
                            <small style="display: block; color: #6c757d; margin-top: 5px; font-size: 12px; word-break: break-all;">
                                ${order.linkAnuncio}
                            </small>
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="info-item">
                        <div class="info-label">Serviço(s)</div>
                        <div class="info-value">
                            <i class="fas fa-camera" style="margin-right: 8px;"></i>
                            ${photoTypeText}
                        </div>
                    </div>
                </div>
                
                <!-- Status e Prioridade -->
                <div class="info-card">
                    <h4><i class="fas fa-tasks"></i> Status e Prioridade</h4>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">
                            <span class="status-badge-view ${statusInfo.class}">
                                ${statusInfo.text}
                            </span>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Urgência</div>
                        <div class="info-value">
                            <span class="badge-view" style="background: ${urgencyInfo.color}; color: white;">
                                ${urgencyInfo.text}
                            </span>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Tipo de OS</div>
                        <div class="info-value">
                            <i class="fas fa-file-alt" style="margin-right: 8px;"></i>
                            ${osTypeText}
                            ${order.osType === 'devolucao' ? 
                            '<span style="background: #dc3545; color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; margin-left: 10px;">DEVOLUÇÃO</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Responsáveis -->
                <div class="info-card">
                    <h4><i class="fas fa-users"></i> Responsáveis</h4>
                    <div class="info-item">
                        <div class="info-label">Responsável</div>
                        <div class="info-value" style="font-size: 16px; font-weight: 600;">
                            ${order.responsibleName}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Criado por</div>
                        <div class="info-value">
                            <i class="fas fa-user-edit" style="margin-right: 8px;"></i>
                            ${order.createdBy}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Data de Criação</div>
                        <div class="info-value">
                            <i class="far fa-calendar-alt" style="margin-right: 8px;"></i>
                            ${formattedCreatedDate}
                        </div>
                    </div>
                </div>
                
                <!-- Datas -->
                <div class="info-card">
                    <h4><i class="fas fa-calendar-alt"></i> Datas</h4>
                    <div class="info-item">
                        <div class="info-label">Criado em</div>
                        <div class="info-value">
                            ${formattedCreatedDate}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Última atualização</div>
                        <div class="info-value">
                            ${new Date(order.updatedAt).toLocaleString('pt-BR')}
                        </div>
                    </div>
                    
                    ${order.status === 'concluida' ? `
                    <div class="info-item">
                        <div class="info-label">Concluído em</div>
                        <div class="info-value">
                            ${completionDateText}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Fotos tiradas</div>
                        <div class="info-value">
                            <i class="fas fa-camera-retro"></i> ${order.photosTaken || '0'}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <div class="info-label">Edições realizadas</div>
                        <div class="info-value">
                            <i class="fas fa-edit"></i> ${order.editsMade || '0'}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            ${anuncioSection}
            
            <!-- Observações -->
            <div class="info-card" style="margin-top: 20px;">
                <h4><i class="fas fa-sticky-note"></i> Observações</h4>
                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef; min-height: 100px;">
                    ${order.observations || 
                    '<div style="text-align: center; color: #adb5bd; padding: 20px;">' +
                    '<i class="fas fa-info-circle" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>' +
                    'Nenhuma observação registrada para esta ordem de serviço.' +
                    '</div>'}
                </div>
            </div>
        </div>
    `;
}

function generatePhotosTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    const photos = order.photos || [];
    
    if (photos.length === 0) {
        return `
            <div class="tab-content active">
                <div style="text-align: center; padding: 50px 20px;">
                    <i class="fas fa-images fa-4x" style="color: #e9ecef; margin-bottom: 20px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma foto anexada</h4>
                    <p style="color: #adb5bd;">Esta ordem de serviço não possui fotos de referência.</p>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="tab-content active">
            <div style="margin-bottom: 20px;">
                <p style="color: #6c757d; margin-bottom: 10px;">
                    <i class="fas fa-info-circle"></i>
                    ${photos.length} foto(s) de referência anexada(s)
                </p>
            </div>
            
            <div class="photo-gallery-view">
                ${photos.map((photo, index) => `
                    <div class="photo-card-view">
                        <img src="${photo.data || photo.thumbnail}" 
                             alt="${photo.name}"
                             style="width: 100%; height: 150px; object-fit: cover; cursor: pointer;"
                             onclick="viewPhotoInModal(${index})">
                        <div style="padding: 10px; background: white;">
                            <div style="font-size: 12px; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                <i class="fas ${photo.isLink ? 'fa-link' : 'fa-image'}"></i> ${photo.name}
                            </div>
                            <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                                ${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #6c757d; font-size: 14px;">
                    <i class="fas fa-lightbulb"></i>
                    <strong>Dica:</strong> Clique em qualquer foto para visualizá-la em tamanho maior.
                </p>
            </div>
        </div>
    `;
}

function generateTimelineTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    const timeline = [];
    
    // Evento: Criação
    timeline.push({
        date: order.createdAt,
        title: 'OS Criada',
        description: `Ordem de serviço criada por ${order.createdBy}`,
        icon: 'plus-circle',
        color: '#8A2BE2'
    });
    
    // Evento: Atualização (se diferente da criação)
    if (order.updatedAt && order.updatedAt !== order.createdAt) {
        timeline.push({
            date: order.updatedAt,
            title: 'OS Atualizada',
            description: 'Última atualização do sistema',
            icon: 'sync-alt',
            color: '#17a2b8'
        });
    }
    
    // Evento: Início (se em andamento ou concluída)
    if (order.status === 'andamento' || order.status === 'concluida') {
        timeline.push({
            date: order.updatedAt, // Usar updatedAt como proxy
            title: 'OS Iniciada',
            description: `Iniciada por ${order.responsibleName}`,
            icon: 'play-circle',
            color: '#28a745'
        });
    }
    
    // Evento: Conclusão (se concluída)
    if (order.status === 'concluida' && order.completionDate) {
        timeline.push({
            date: order.completionDate,
            title: 'OS Concluída',
            description: `Concluída com ${order.photosTaken || 0} fotos tiradas e ${order.editsMade || 0} edições`,
            icon: 'check-circle',
            color: '#28a745'
        });
    }
    
    // Ordenar por data (mais recente primeiro)
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return `
        <div class="tab-content active">
            <div class="info-card">
                <h4><i class="fas fa-history"></i> Histórico da OS</h4>
                
                ${timeline.length === 0 ? `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-history fa-3x" style="color: #e9ecef; margin-bottom: 15px;"></i>
                        <p style="color: #6c757d;">Nenhum evento registrado no histórico.</p>
                    </div>
                ` : `
                    <div class="timeline">
                        ${timeline.map((event, index) => {
                            const eventDate = new Date(event.date);
                            const formattedDate = eventDate.toLocaleDateString('pt-BR') + ' ' + 
                                                eventDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
                            
                            return `
                                <div class="timeline-item">
                                    <div class="timeline-date">
                                        <i class="far fa-clock"></i> ${formattedDate}
                                    </div>
                                    <div class="timeline-content">
                                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                            <i class="fas fa-${event.icon}" style="color: ${event.color};"></i>
                                            <strong style="color: #495057;">${event.title}</strong>
                                        </div>
                                        <p style="color: #6c757d; margin: 0; font-size: 14px;">
                                            ${event.description}
                                        </p>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

window.viewPhotoInModal = function(photoIndex) {
    if (!currentViewingOS || !currentViewingOS.photos) return;
    
    const photos = currentViewingOS.photos;
    const photo = photos[photoIndex];
    
    if (!photo) return;
    
    // Criar modal para visualização da foto
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.9);
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 30px; cursor: pointer; z-index: 10;">
                &times;
            </button>
            <img src="${photo.data || photo.thumbnail}" 
                 alt="${photo.name}"
                 style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 10px; font-size: 12px;">
                <div>${photo.name}</div>
                <div>${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)} • Foto ${photoIndex + 1} de ${photos.length}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar modal ao pressionar ESC
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    };
    document.addEventListener('keydown', closeOnEsc);
};

function printCurrentOS() {
    if (!currentViewingOS) return;
    
    // Usar a função de impressão existente
    openPrintModal(currentViewingOS);
}

function editCurrentOS() {
    if (!currentViewingOS) return;
    
    // Fechar modal de visualização
    closeViewOSModal();
    
    // Abrir edição
    setTimeout(() => {
        editOrder(currentViewingOS.id);
    }, 300);
}

// Adicionar listener para fechar modal ao clicar fora
document.getElementById('viewOSModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeViewOSModal();
    }
});

// ============================================
// INICIALIZAÇÃO DO BOTÃO DE REEMBOLSOS
// ============================================
function inicializarBotaoReembolsos() {
    const reembolsosBtn = document.getElementById('reembolsosBtn');
    if (reembolsosBtn) {
        reembolsosBtn.addEventListener('click', function() {
            abrirSistemaReembolsos();
        });
    }
}

// Chame esta função no DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');

    // INICIALIZAR EMAILJS
    if (window.emailjs) {
        emailjs.init({
            publicKey: "GtDq2kuz4ng-u8gYR"
        });
        console.log("✅ EmailJS inicializado");
    } else {
        console.error("❌ EmailJS não carregado");
    }

    console.log('🚀 Sistema OS Fotografia com Reembolsos iniciado!');
    
    generateOSCode();
    initSupabase();
    setupEventListeners();
    setupPhotoUpload();
    setupReembolsoEventListeners();
    inicializarBotaoReembolsos(); // ADICIONE ESTA LINHA

    if (currentUser) {
        setTimeout(() => {
            // Verificar status do token ML
            const tokenExpiry = localStorage.getItem('ml_token_expiry');
            if (tokenExpiry) {
                const expiresIn = parseInt(tokenExpiry) - Date.now();
                if (expiresIn < 3600000) { // Se faltar menos de 1 hora
                    console.log('🔄 Token ML prestes a expirar, renovando...');
                    getMLTokenAutomatically();
                }
            }
        }, 5000);
    }
});

// ============================================
// FUNÇÃO PARA VOLTAR PARA SISTEMA OS
// ============================================
window.voltarParaMenu = function() {
    // Lista de todos os sistemas que podem estar abertos
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 
                      'estoqueGestaoSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    // Mostrar menu
    const menu = document.getElementById('menuSystem');
    if (menu) menu.classList.remove('hidden');
    showToast('Menu principal', 'info');
};

// Adicionar estilos CSS para o sistema de impressão
const printStyles = document.createElement('style');
printStyles.innerHTML = `
    .print-preview {
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #333;
    }
    
    .preview-header {
        text-align: center;
        margin-bottom: 40px;
        padding-bottom: 20px;
        border-bottom: 3px solid #8A2BE2;
        position: relative;
    }
    
    .header-gradient {
        background: linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%);
        color: white;
        padding: 25px;
        border-radius: 12px;
        margin-bottom: 25px;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.2);
    }
    
    .os-code-preview {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: 2px;
        background: rgba(255,255,255,0.15);
        padding: 15px 30px;
        border-radius: 10px;
        display: inline-block;
        margin: 15px 0;
        border: 2px solid rgba(255,255,255,0.3);
    }
    
    .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin: 30px 0;
    }
    
    .preview-card {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 10px;
        padding: 20px;
        transition: all 0.3s ease;
    }
    
    .card-header {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #dee2e6;
    }
    
    .card-icon {
        width: 40px;
        height: 40px;
        background: #8A2BE2;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 15px;
        color: white;
        font-size: 18px;
    }
    
    .card-title {
        font-size: 16px;
        font-weight: 600;
        color: #495057;
        margin: 0;
    }
    
    .info-row {
        display: flex;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px dashed #dee2e6;
    }
    
    .info-label {
        font-weight: 600;
        color: #6c757d;
        width: 140px;
        min-width: 140px;
    }
    
    .info-value {
        flex: 1;
        color: #212529;
    }
    
    .badge-preview {
        padding: 6px 15px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 13px;
        display: inline-block;
    }
    
    .badge-pending {
        background: linear-gradient(135deg, #ffc107, #ff9800);
        color: #856404;
    }
    
    .badge-progress {
        background: linear-gradient(135deg, #17a2b8, #138496);
        color: white;
    }
    
    .badge-completed {
        background: linear-gradient(135deg, #28a745, #218838);
        color: white;
    }
    
    .badge-high {
        background: linear-gradient(135deg, #dc3545, #c82333);
        color: white;
    }
    
    .badge-normal {
        background: linear-gradient(135deg, #28a745, #218838);
        color: white;
    }
    
    .badge-low {
        background: linear-gradient(135deg, #6c757d, #545b62);
        color: white;
    }
    
    .observations-box-preview {
        background: white;
        border: 2px dashed #dee2e6;
        padding: 20px;
        border-radius: 10px;
        margin-top: 10px;
        min-height: 100px;
        font-style: italic;
        color: #495057;
    }
    
    .signature-section {
        margin-top: 60px;
        padding-top: 30px;
        border-top: 3px solid #dee2e6;
        page-break-inside: avoid;
    }
    
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 30px;
        margin-top: 30px;
    }
    
    .signature-box {
        text-align: center;
        padding: 20px;
        border: 2px solid #e9ecef;
        border-radius: 10px;
        background: #f8f9fa;
    }
    
    .signature-line {
        width: 80%;
        height: 2px;
        background: #495057;
        margin: 40px auto 15px;
    }
    
    .signature-label {
        font-size: 14px;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
    }
    
    .signature-name {
        font-size: 16px;
        font-weight: 600;
        color: #495057;
        margin-top: 15px;
    }
    
    .footer-preview {
        margin-top: 50px;
        text-align: center;
        font-size: 12px;
        color: #6c757d;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
    }
    
    .watermark {
        position: absolute;
        bottom: 20mm;
        right: 20mm;
        opacity: 0.1;
        font-size: 80px;
        font-weight: 800;
        color: #8A2BE2;
        transform: rotate(-45deg);
        pointer-events: none;
        user-select: none;
    }
    
    /* Estilos para versão compacta */
    .compact-view .preview-grid {
        grid-template-columns: 1fr;
        gap: 15px;
    }
    
    .compact-view .preview-card {
        padding: 15px;
    }
    
    .compact-view .card-header {
        margin-bottom: 10px;
    }
    
    .compact-view .signature-grid {
        grid-template-columns: 1fr;
        gap: 20px;
    }

`;



document.head.appendChild(printStyles);

// ===== FUNÇÕES DE GERENCIAMENTO DE TOKEN =====

function saveMLTokenToStorage(tokenData) {
    try {
        localStorage.setItem('ml_token_data', JSON.stringify(tokenData));
        console.log('✅ Token ML salvo no localStorage');
        
        // Atualizar variáveis globais
        mlAccessToken = tokenData.access_token;
        mlTokenExpiresAt = tokenData.expires_at;
        
        // Atualizar status na interface
        updateMLTokenStatusUI();
        
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar token ML:', error);
        return false;
    }
}

function loadMLTokenFromStorage() {
    try {
        const tokenData = localStorage.getItem('ml_token_data');
        if (tokenData) {
            return JSON.parse(tokenData);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar token ML:', error);
    }
    return null;
}

function scheduleTokenRefresh() {
    if (mlTokenTimer) {
        clearTimeout(mlTokenTimer);
    }
    
    if (!mlTokenExpiresAt) {
        console.warn('⚠️ Não é possível agendar renovação - token não configurado');
        return;
    }
    
    const now = Date.now();
    const expiresIn = mlTokenExpiresAt - now;
    
    // Renovar 1 hora antes de expirar
    const refreshTime = expiresIn - 3600000;
    
    if (refreshTime > 0) {
        mlTokenTimer = setTimeout(() => {
            console.log('⏰ Token prestes a expirar, notificando usuário...');
            showTokenExpiryWarning();
        }, refreshTime);
        
        const hoursLeft = Math.round(refreshTime / 3600000);
        console.log(`⏰ Token será verificado em ${hoursLeft} horas`);
        
    } else {
        // Token está prestes a expirar
        showTokenExpiryWarning();
    }
}

function showTokenExpiryWarning() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.7);
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #ffc107;">
                    <i class="fas fa-exclamation-triangle"></i> Token ML Expirando
                </h3>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                    &times;
                </button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <p style="color: #6c757d;">
                    O seu token de acesso ao Mercado Livre está prestes a expirar.
                </p>
                
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 0; color: #856404;">
                        <i class="fas fa-info-circle"></i> 
                        Para continuar acessando as vendas, você precisa renovar o token.
                    </p>
                </div>
                
                <p style="color: #6c757d; font-size: 14px;">
                    O token atual expira em aproximadamente <strong>1 hora</strong>.
                </p>
            </div>
            
            <div class="d-flex justify-content-between">
                <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                    Lembrar mais tarde
                </button>
                <button class="btn btn-warning" onclick="renewMLToken()">
                    <i class="fas fa-sync-alt"></i> Renovar Token Agora
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

window.renewMLToken = async function() {
    // Fechar modal de aviso
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.remove());
    
    // Abrir modal para novo token
    await requestTokenFromUser();
};

function checkMLTokenStatus() {
    if (!mlAccessToken || !mlTokenExpiresAt) {
        return { valid: false, message: 'Token não configurado' };
    }
    
    const now = Date.now();
    const expiresIn = mlTokenExpiresAt - now;
    
    if (expiresIn <= 0) {
        return { valid: false, message: 'Token expirado' };
    }
    
    const hoursLeft = Math.round(expiresIn / 3600000);
    const minutesLeft = Math.round((expiresIn % 3600000) / 60000);
    
    return { 
        valid: true, 
        message: `Token válido por ${hoursLeft}h ${minutesLeft}m`,
        expiresIn: expiresIn,
        hoursLeft: hoursLeft,
        minutesLeft: minutesLeft
    };
}

// ===== TESTAR CONEXÃO COM ML =====
async function testMLConnection() {
    if (!mlAccessToken) {
        showToast('⚠️ Token ML não configurado', 'warning');
        return false;
    }
    
    try {
        showToast('🔗 Testando conexão com Mercado Livre...', 'info');
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${mlAccessToken}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('✅ Conexão ML bem-sucedida:', userData);
        showToast(`✅ Conectado ao ML como ${userData.nickname}`, 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro na conexão ML:', error);
        showToast('❌ Falha na conexão com Mercado Livre', 'error');
        return false;
    }
}

// ===== FUNÇÃO PARA TESTAR CONEXÃO COM ML =====
async function testMLConnection() {
    if (!mlAccessToken) {
        showToast('⚠️ Token ML não configurado', 'warning');
        return false;
    }
    
    try {
        showToast('🔗 Testando conexão com Mercado Livre...', 'info');
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${mlAccessToken}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('✅ Conexão ML bem-sucedida:', userData);
        showToast(`✅ Conectado ao ML como ${userData.nickname}`, 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro na conexão ML:', error);
        showToast('❌ Falha na conexão com Mercado Livre', 'error');
        return false;
    }
}

window.abrirSistemaVendas = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('🛒 Iniciando sistema de vendas ML...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    
    // Mostrar sistema de vendas
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) {
        showToast('❌ Sistema de vendas não encontrado', 'error');
        return;
    }
    
    salesSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    document.getElementById('salesUserName').textContent = currentUser.name;
    document.getElementById('salesUserAvatar').textContent = currentUser.avatar;
    document.getElementById('salesUserRole').textContent = currentUser.role;
    
    showToast('🔄 Carregando sistema de vendas...', 'info');
    
    try {
        // 1. Verificar conexão ML
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Falha na conexão com Mercado Livre', 'error');
            return;
        }
        
        // 2. Inicializar sistema de sincronização
        if (window.inicializarSistemaVendas) {
            await window.inicializarSistemaVendas();
        }
        
        // 3. Carregar dashboard
        if (window.carregarVendasDashboard) {
            await window.carregarVendasDashboard('hoje');
        }
        
        showToast('✅ Sistema de vendas carregado!', 'success');
        
    } catch (error) {
        console.error('Erro ao carregar sistema de vendas:', error);
        showToast('❌ Erro ao carregar vendas: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO SIMPLES PARA CONTADOR DE CARACTERES
// ============================================

// Adicione esta função no FINAL do seu arquivo script.js
function initContadorCaracteres() {
    console.log('Inicializando contador de caracteres...');
    
    // Aguardar o campo carregar
    setTimeout(() => {
        const campo = document.getElementById('productName');
        const contador = document.getElementById('contadorProduto');
        
        if (!campo || !contador) {
            console.log('Elementos não encontrados, tentando novamente...');
            setTimeout(initContadorCaracteres, 500);
            return;
        }
        
        console.log('Campo e contador encontrados!');
        
        // Função para atualizar o contador
        function atualizarContador() {
            const digitado = campo.value.length;
            const maximo = 200;
            
            contador.textContent = `${digitado}/${maximo}`;
            
            // Mudar cor conforme limite
            if (digitado >= maximo) {
                contador.style.color = '#dc3545';
                contador.style.fontWeight = 'bold';
            } else if (digitado >= 180) {
                contador.style.color = '#ffc107';
                contador.style.fontWeight = 'bold';
            } else {
                contador.style.color = '#6c757d';
                contador.style.fontWeight = 'normal';
            }
        }
        
        // Adicionar eventos
        campo.addEventListener('input', atualizarContador);
        campo.addEventListener('keyup', atualizarContador);
        campo.addEventListener('change', atualizarContador);
        
        // Atualizar valor inicial
        atualizarContador();
        
        // Sobrescrever clearForm globalmente (sem modificar a função original)
        const originalClearForm = window.clearForm;
        if (originalClearForm) {
            window.clearForm = function() {
                originalClearForm();
                setTimeout(atualizarContador, 100);
            };
        }
        
        // Sobrescrever editOrder globalmente (sem modificar a função original)
        const originalEditOrder = window.editOrder;
        if (originalEditOrder) {
            window.editOrder = function(orderId) {
                originalEditOrder(orderId);
                setTimeout(atualizarContador, 200);
            };
        }
        
        console.log('Contador de caracteres inicializado com sucesso!');
        
    }, 1000);
}

// ============================================
// CONFIGURAR BOTÃO DE VENDAS
// ============================================
function configurarBotaoVendas() {
    const vendasBtn = document.getElementById('vendasBtn');
    if (vendasBtn) {
        vendasBtn.addEventListener('click', function() {
            if (window.abrirSistemaVendas) {
                window.abrirSistemaVendas();
            } else {
                console.log('⏳ Aguardando carregamento do sistema de vendas...');
                setTimeout(() => {
                    if (window.abrirSistemaVendas) {
                        window.abrirSistemaVendas();
                    } else {
                        console.error('❌ abrirSistemaVendas não encontrado');
                    }
                }, 2000);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(configurarBotaoVendas, 1000);
});

async function sincronizarVendasML() {
    if (salesSyncStatus.isRunning) return;

    const sellerId = '415176739'; // Definido no topo da função
    const token = window.mlTokenStatus ? window.mlTokenStatus.access_token : null;

    if (!token) return;

    salesSyncStatus.isRunning = true;

    try {
        const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc`;
        const response = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        const data = await response.json();
        if (data.results) {
            for (const venda of data.results) {
                const item = venda.order_items[0].item;
                
                await window.supabaseClient.from('vendas_ml').upsert({
                    id: venda.id,
                    sku: item.seller_sku || "SEM SKU",
                    meio_envio: venda.shipping?.id ? "Mercado Envios" : "A combinar",
                    buyer_nickname: venda.buyer?.nickname,
                    total_amount: venda.total_amount,
                    status: venda.status,
                    date_created: venda.date_created
                });
            }
        }
    } catch (e) {
        console.error("Erro na sync automática:", e);
    } finally {
        salesSyncStatus.isRunning = false;
    }
}

// ============================================
// FUNÇÕES PARA NAVEGAÇÃO ENTRE SISTEMAS
// ============================================

// Função para abrir sistema de reembolsos
window.abrirSistemaReembolsos = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('💰 Iniciando sistema de reembolsos...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    if (reviewsSystem) reviewsSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    
    // Mostrar sistema de reembolsos
    const reembolsosSystem = document.getElementById('reembolsosSystem');
    if (!reembolsosSystem) {
        showToast('❌ Sistema de reembolsos não encontrado', 'error');
        return;
    }
    
    reembolsosSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const reembolsoUserName = document.getElementById('reembolsoUserName');
    const reembolsoUserAvatar = document.getElementById('reembolsoUserAvatar');
    const reembolsoUserRole = document.getElementById('reembolsoUserRole');
    
    if (reembolsoUserName) reembolsoUserName.textContent = currentUser.name;
    if (reembolsoUserAvatar) reembolsoUserAvatar.textContent = currentUser.avatar;
    if (reembolsoUserRole) reembolsoUserRole.textContent = currentUser.role;
    
    // Carregar reembolsos
    if (window.loadReembolsos) {
        loadReembolsos();
    }
    
    showToast('💰 Sistema de Reembolsos carregado', 'info');
};

// Função para abrir sistema de conferência de caixa
window.abrirSistemaCaixa = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('💰 Iniciando sistema de conferência de caixa...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    if (reviewsSystem) reviewsSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    
    // Mostrar sistema de caixa
    const caixaSystem = document.getElementById('caixaSystem');
    if (!caixaSystem) {
        showToast('❌ Sistema de caixa não encontrado', 'error');
        return;
    }
    
    caixaSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const caixaUserName = document.getElementById('caixaUserName');
    const caixaUserAvatar = document.getElementById('caixaUserAvatar');
    const caixaUserRole = document.getElementById('caixaUserRole');
    
    if (caixaUserName) caixaUserName.textContent = currentUser.name;
    if (caixaUserAvatar) caixaUserAvatar.textContent = currentUser.avatar;
    if (caixaUserRole) caixaUserRole.textContent = currentUser.role;
    
    // Carregar dados do caixa
    if (window.carregarCaixaDia) {
        carregarCaixaDia();
    }
    
    showToast('💰 Sistema de Conferência de Caixa carregado', 'info');
};

// Função para voltar ao sistema principal (OS)
window.voltarParaMenu = function() {
    // Lista de todos os sistemas que podem estar abertos
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 
                      'estoqueGestaoSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    // Mostrar menu
    const menu = document.getElementById('menuSystem');
    if (menu) menu.classList.remove('hidden');
    showToast('Menu principal', 'info');
};

// ============================================
// SISTEMA DE AVALIAÇÕES ML
// ============================================

// Elementos da aba de avaliações
const reviewsSystem = document.getElementById('reviewsSystem');
const reviewsBtn = document.getElementById('reviewsBtn');

// Função para abrir o sistema de avaliações
window.abrirSistemaReviews = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('⭐ Iniciando sistema de avaliações...');
    
    // Esconder outros sistemas
     if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (reviewsSystem) reviewsSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    
    // Mostrar sistema de avaliações
    if (reviewsSystem) reviewsSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    document.getElementById('reviewsUserName').textContent = currentUser.name;
    document.getElementById('reviewsUserAvatar').textContent = currentUser.avatar;
    document.getElementById('reviewsUserRole').textContent = currentUser.role;
    
    // Limpar campos anteriores
    document.getElementById('mlbInput').value = '';
    document.getElementById('reviewsResultCard').classList.add('hidden');
    
    showToast('⭐ Sistema de Avaliações carregado', 'info');
};

// Vincular evento do botão no cabeçalho
if (reviewsBtn) {
    reviewsBtn.addEventListener('click', abrirSistemaReviews);
}

// Função principal para buscar avaliações
window.buscarAvaliacoes = async function() {
    const mlbInput = document.getElementById('mlbInput').value.trim();
    if (!mlbInput) {
        showToast('Digite um MLB válido', 'warning');
        return;
    }
    
    // Se o MLB não começar com "MLB", adiciona automaticamente
    let itemId = mlbInput;
    if (!itemId.toUpperCase().startsWith('MLB')) {
        itemId = 'MLB' + itemId;
    }
    
    const btn = document.querySelector('button[onclick="buscarAvaliacoes()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Buscando...';
    btn.disabled = true;
    
    try {
        const resultado = await buscarReviewsML(itemId);
        if (resultado && resultado.success) {
            renderizarReviews(resultado.data);
        } else {
            showToast('Erro ao buscar avaliações: ' + (resultado?.error || 'Desconhecido'), 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao buscar avaliações:', error);
        showToast('Erro ao buscar avaliações: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Função que faz a chamada à API via proxy (igual às vendas)
async function buscarReviewsML(itemId) {
    try {
        const tokenData = await getValidToken(); // retorna { access_token, refresh_token, expires_at }
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token não disponível');
        }
        const token = tokenData.access_token;

        let allReviews = [];
        let offset = 0;
        const limit = 50; // máximo permitido pela API do ML (pode ser 50)
        let total = null;
        let firstResponse = null;

        while (total === null || offset < total) {
            const apiUrl = `https://api.mercadolibre.com/reviews/item/${itemId}?limit=${limit}&offset=${offset}`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (!firstResponse) {
                firstResponse = data; // guarda a primeira resposta para os resumos (rating_levels, rating_average)
                total = data.paging?.total || 0;
            }

            if (data.reviews && data.reviews.length > 0) {
                allReviews = allReviews.concat(data.reviews);
            }

            offset += limit;
        }

        // Monta o objeto final com os resumos da primeira página + todas as avaliações
        const resultadoFinal = {
            rating_average: firstResponse.rating_average,
            rating_levels: firstResponse.rating_levels,
            paging: {
                total: allReviews.length,
                offset: 0,
                limit: allReviews.length
            },
            reviews: allReviews
        };

        return { success: true, data: resultadoFinal };

    } catch (error) {
        console.error('❌ Erro em buscarReviewsML:', error);
        return { success: false, error: error.message };
    }
}

// Renderizar as avaliações na tela
function renderizarReviews(data) {
    const card = document.getElementById('reviewsResultCard');
    card.classList.remove('hidden');
    
    // Atualizar total de avaliações
    const totalReviews = data.reviews ? data.reviews.length : 0;
    document.getElementById('totalReviews').textContent = totalReviews + ' avaliações';
    
    // Resumo das estrelas
    const ratingAverage = data.rating_average || 0;
    const ratingLevels = data.rating_levels || {
        one_star: 0,
        two_star: 0,
        three_star: 0,
        four_star: 0,
        five_star: 0
    };
    
    let summaryHtml = `
        <div class="d-flex align-items-center mb-3">
            <h3 class="mb-0 mr-3">Média: ${ratingAverage.toFixed(1)} <i class="fas fa-star" style="color: #FFD700;"></i></h3>
        </div>
        <div class="row">
            <div class="col-md-6">
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 5 estrelas: ${ratingLevels.five_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 4 estrelas: ${ratingLevels.four_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 3 estrelas: ${ratingLevels.three_star}</div>
            </div>
            <div class="col-md-6">
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 2 estrelas: ${ratingLevels.two_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 1 estrela: ${ratingLevels.one_star}</div>
            </div>
        </div>
    `;
    document.getElementById('reviewsSummary').innerHTML = summaryHtml;

    // Ordenar avaliações da mais recente para a mais antiga
    if (data.reviews && data.reviews.length > 0) {
        data.reviews.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    }
    
    // Preencher tabela
    const tbody = document.getElementById('reviewsTableBody');
    tbody.innerHTML = '';
    
    if (!data.reviews || data.reviews.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5">
                    <i class="fas fa-star fa-3x mb-3" style="color: #5d666d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhuma avaliação encontrada</h4>
                    <p style="color: #6c757d;">Este anúncio ainda não possui avaliações.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    data.reviews.forEach(review => {
        const row = document.createElement('tr');
        
        // Formatar datas
        const dataCriacao = new Date(review.date_created).toLocaleDateString('pt-BR');
        const dataCompra = review.buying_date ? new Date(review.buying_date).toLocaleString('pt-BR') : 'Não informada';
        
        // Estrelas
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += i <= review.rate ? 
                '<i class="fas fa-star" style="color: #FFD700;"></i>' : 
                '<i class="far fa-star" style="color: #ddd;"></i>';
        }
        
        row.innerHTML = `
            <td>${dataCriacao}</td>
            <td>${starsHtml}</td>
            <td><strong>${review.title || 'Sem título'}</strong></td>
            <td>${review.content || ''}</td>
            <td>${dataCompra}</td>
        `;
        tbody.appendChild(row);
    });
}

window.abrirSistemaVendas = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('🛒 Iniciando sistema de vendas ML...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    
    // Mostrar sistema de vendas
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) {
        showToast('❌ Sistema de vendas não encontrado', 'error');
        return;
    }
    
    salesSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    document.getElementById('salesUserName').textContent = currentUser.name;
    document.getElementById('salesUserAvatar').textContent = currentUser.avatar;
    document.getElementById('salesUserRole').textContent = currentUser.role;
    
    showToast('🔄 Carregando sistema de vendas...', 'info');
    
    try {
        // 1. Verificar conexão ML
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Falha na conexão com Mercado Livre', 'error');
            return;
        }
        
        // 2. Inicializar sistema de vendas
        if (window.inicializarSistemaVendas) {
            await window.inicializarSistemaVendas();
        }
        
        // 3. Carregar dashboard
        if (window.carregarVendasDashboard) {
            await window.carregarVendasDashboard('hoje');
        }
        
        showToast('✅ Sistema de vendas carregado!', 'success');
        
    } catch (error) {
        console.error('Erro ao carregar sistema de vendas:', error);
        showToast('❌ Erro ao carregar vendas: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO ATUALIZAR VENDAS - VERSÃO FINAL 
// ============================================

window.atualizarVendas = async function() {
    const btn = document.querySelector('button[onclick="atualizarVendas()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auditando Logística e Estoque...';
    }
    
    try {
        const sellerId = '415176739';
        const token = window.mlTokenStatus?.access_token || localStorage.getItem('ml_access_token');
        if (!token) return alert('Sessão expirada. Recarregue a página.');

        const workerUrl = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        const mlUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=30`;
        const proxyUrl = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(mlUrl)}&token=${token}`;

        const response = await fetch(proxyUrl);
        const data = await response.json();
        const vendasResumo = data.results || [];

        for (const resumo of vendasResumo) {
            // 1. BUSCA DETALHADA DA ORDEM (Para não errar o meio de envio)
            const orderDetailUrl = `https://api.mercadolibre.com/orders/${resumo.id}`;
            const detailRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(orderDetailUrl)}&token=${token}`);
            const venda = await detailRes.json();

            let meio = "MERCADO ENVIOS";
            let estoqueReal = null;

            // 2. IDENTIFICAÇÃO DE LOGÍSTICA (Baseada no Shipment ID)
            const shipping = venda.shipping || {};
            const tags = (venda.tags || []).map(t => t.toLowerCase());
            
            // Consultamos o Shipment para ter certeza absoluta entre FULL e FLEX
            if (shipping.id) {
                const shipUrl = `https://api.mercadolibre.com/shipments/${shipping.id}`;
                const shipRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${token}`);
                const shipData = await shipRes.json();
                
                const logType = (shipData.logistic_type || "").toLowerCase();
                if (logType === 'fulfillment') meio = "FULL";
                else if (logType === 'self_service') meio = "FLEX";
                else if (logType === 'cross_docking') meio = "COLETA";
            } 
            // Fallback por tags se o shipment falhar
            else if (tags.includes('fulfillment')) meio = "FULL";
            else if (tags.includes('self_service')) meio = "FLEX";

            // 3. BUSCA DE ESTOQUE (Conforme o tipo de anúncio)
            const orderItem = venda.order_items?.[0] || {};
            const itemBase = orderItem.item || {};

            if (itemBase.id) {
                const itemUrl = `https://api.mercadolibre.com/items/${itemBase.id}`;
                const itemRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${token}`);
                const itemData = await itemRes.json();

                // Se for FULL, o estoque real costuma estar no inventory_id
                if (meio === "FULL" && itemData.inventory_id) {
                    const invUrl = `https://api.mercadolibre.com/inventories/${itemData.inventory_id}/stock`;
                    const invRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(invUrl)}&token=${token}`);
                    const invData = await invRes.json();
                    estoqueReal = invData.total?.available_quantity;
                } else {
                    // Estoque convencional (considerando variações)
                    if (itemBase.variation_id && itemData.variations) {
                        const v = itemData.variations.find(v => String(v.id) === String(itemBase.variation_id));
                        estoqueReal = v ? v.available_quantity : itemData.available_quantity;
                    } else {
                        estoqueReal = itemData.available_quantity;
                    }
                }
            }

            // 4. SALVAMENTO NO SUPABASE
            const dadosParaSalvar = {
                order_id: String(venda.id),
                buyer_nickname: venda.buyer?.nickname || 'N/A',
                total_amount: venda.total_amount,
                sku: itemBase.seller_sku || "SEM SKU",
                meio_envio: meio,
                produto_titulo: itemBase.title || "Sem título",
                estoque_restante: estoqueReal !== null ? Number(estoqueReal) : null,
                date_created: venda.date_created,
                last_updated: new Date().toISOString()
            };

            await supabaseClient.from('vendas_ml').upsert(dadosParaSalvar, { onConflict: 'order_id' });
        }

        alert('✅ Atualização concluída! Logística e Estoque auditados.');
        if (window.carregarVendasDashboard) await window.carregarVendasDashboard('hoje');

    } catch (err) {
        console.error('Erro geral na atualização:', err);
        alert('Erro ao atualizar. Verifique o console.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Atualizar Vendas'; }
    }
};

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Chamar depois de um tempo para garantir que tudo carregou
    setTimeout(initContadorCaracteres, 2000);
});

// ============================================
// BOTÃO PARA SINCRONIZAR VENDAS MANUALMENTE
// ============================================

window.forcarSincronizacaoVendas = async function() {
    const btn = document.querySelector('button[onclick="forcarSincronizacaoVendas()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Sincronizando...';
    }
    
    try {
        if (window.sincronizarVendasComSupabase) {
            await window.sincronizarVendasComSupabase();
        } else {
            showToast('❌ Função de sincronização não encontrada', 'error');
        }
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        showToast('❌ Erro ao sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Vendas ML';
        }
    }
};

// ============================================
// BOTÃO PARA ATUALIZAR LISTA DE VENDAS
// ============================================

window.atualizarVendas = async function() {
    showToast('🔄 Atualizando lista de vendas...', 'info');
    
    try {
        if (window.buscarVendasML) {
            const vendas = await window.buscarVendasML(50);
            console.log('Vendas atualizadas:', vendas.length);
            
            // Aqui você pode chamar a função que renderiza as vendas
            if (window.renderizarVendasML) {
                window.renderizarVendasML(vendas);
                showToast(`✅ ${vendas.length} vendas carregadas`, 'success');
            } else {
                showToast('⚠️ Função de renderização não encontrada', 'warning');
            }
        } else {
            showToast('❌ Função de busca não encontrada', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao atualizar vendas:', error);
        showToast('❌ Erro ao atualizar: ' + error.message, 'error');
    }
};

// Adicionar script de conferência de vendas
    const script = document.createElement('script');
    script.src = 'vendas_conferencia.js';
    document.body.appendChild(script);

    // ============================================
// FUNÇÕES DE SELEÇÃO MÚLTIPLA DE OS PARA IMPRESSÃO
// ============================================

// Variáveis para controle de seleção
let selectedOSForPrint = [];
let selectModeActive = false;

// ===== FUNÇÃO PARA ATIVAR MODO DE SELEÇÃO =====
window.ativarModoSelecaoOS = function() {
    selectModeActive = !selectModeActive;
    
    const selectBtn = document.getElementById('selectOSBtn');
    if (selectBtn) {
        if (selectModeActive) {
            selectBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar Seleção';
            selectBtn.classList.add('btn-danger');
            selectBtn.classList.remove('btn-success');
            
            // Adicionar coluna de checkbox na tabela
            adicionarColunaSelecao();
            
            // Mostrar barra de ações
            document.getElementById('selectedOSBar').classList.remove('hidden');
            
            showToast('✅ Modo de seleção ativado - Marque as OS que deseja imprimir', 'success');
        } else {
            cancelarModoSelecao();
        }
    }
};

// ===== FUNÇÃO PARA ADICIONAR COLUNA DE CHECKBOX =====
function adicionarColunaSelecao() {
    const table = document.getElementById('osTableBody');
    if (!table) return;
    
    // Limpar seleções anteriores
    selectedOSForPrint = [];
    atualizarContadorSelecionados();
    
    // Adicionar checkbox em cada linha
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, index) => {
        // Verificar se já não tem checkbox
        if (row.querySelector('.os-select-checkbox')) return;
        
        // Criar checkbox
        const checkboxCell = document.createElement('td');
        checkboxCell.style.width = '40px';
        checkboxCell.style.textAlign = 'center';
        checkboxCell.innerHTML = `
            <input type="checkbox" 
                   class="os-select-checkbox" 
                   data-os-index="${index}"
                   onchange="toggleOSSelection(this, ${index})"
                   style="width: 18px; height: 18px; cursor: pointer;">
        `;
        
        // Inserir no início da linha
        row.insertBefore(checkboxCell, row.firstChild);
    });
}

// ===== FUNÇÃO PARA ALTERNAR SELEÇÃO DE OS =====
window.toggleOSSelection = function(checkbox, index) {
    const row = checkbox.closest('tr');
    
    // Encontrar a OS correspondente
    let userOrders = filterOrdersByUser(orders);
    let filteredOrders = currentFilter === 'todos' ? userOrders : 
                         userOrders.filter(order => order.status === currentFilter);
    
    const os = filteredOrders[index];
    
    if (!os) return;
    
    if (checkbox.checked) {
        // Adicionar à seleção
        selectedOSForPrint.push(os);
        
        // Destacar linha
        row.style.backgroundColor = '#e8f0fe';
        row.style.borderLeft = '4px solid #8A2BE2';
    } else {
        // Remover da seleção
        selectedOSForPrint = selectedOSForPrint.filter(o => o.id !== os.id);
        
        // Remover destaque
        row.style.backgroundColor = '';
        row.style.borderLeft = '';
    }
    
    // Atualizar contador
    atualizarContadorSelecionados();
};

// ===== FUNÇÃO PARA ATUALIZAR CONTADOR DE SELEÇÃO =====
function atualizarContadorSelecionados() {
    const count = selectedOSForPrint.length;
    document.getElementById('selectedOSCount').textContent = count;
    
    // Habilitar/desabilitar botões
    const printSelectedBtn = document.getElementById('printSelectedOSBtn');
    if (printSelectedBtn) {
        printSelectedBtn.disabled = count === 0;
    }
}

// ===== FUNÇÃO PARA SELECIONAR TODAS AS OS =====
window.selecionarTodasOS = function() {
    const checkboxes = document.querySelectorAll('.os-select-checkbox');
    
    checkboxes.forEach((checkbox, index) => {
        if (!checkbox.checked) {
            checkbox.checked = true;
            
            // Disparar evento de seleção
            const event = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(event);
            
            // Chamar toggleOSSelection manualmente
            const row = checkbox.closest('tr');
            
            let userOrders = filterOrdersByUser(orders);
            let filteredOrders = currentFilter === 'todos' ? userOrders : 
                                 userOrders.filter(order => order.status === currentFilter);
            
            const os = filteredOrders[index];
            if (os && !selectedOSForPrint.find(o => o.id === os.id)) {
                selectedOSForPrint.push(os);
                
                // Destacar linha
                row.style.backgroundColor = '#e8f0fe';
                row.style.borderLeft = '4px solid #8A2BE2';
            }
        }
    });
    
    atualizarContadorSelecionados();
    showToast(`✅ ${selectedOSForPrint.length} OS selecionadas`, 'success');
};

// ===== FUNÇÃO PARA LIMPAR SELEÇÃO =====
window.limparSelecaoOS = function() {
    const checkboxes = document.querySelectorAll('.os-select-checkbox');
    
    checkboxes.forEach((checkbox, index) => {
        if (checkbox.checked) {
            checkbox.checked = false;
            
            // Remover destaque da linha
            const row = checkbox.closest('tr');
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        }
    });
    
    selectedOSForPrint = [];
    atualizarContadorSelecionados();
    showToast('🧹 Seleção limpa', 'info');
};

// ===== FUNÇÃO PARA CANCELAR MODO DE SELEÇÃO =====
function cancelarModoSelecao() {
    selectModeActive = false;
    
    // Resetar botão
    const selectBtn = document.getElementById('selectOSBtn');
    if (selectBtn) {
        selectBtn.innerHTML = '<i class="fas fa-check-double"></i> Selecionar OS';
        selectBtn.classList.remove('btn-danger');
        selectBtn.classList.add('btn-success');
    }
    
    // Remover coluna de checkbox
    const table = document.getElementById('osTableBody');
    if (table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const firstCell = row.querySelector('td:first-child');
            if (firstCell && firstCell.querySelector('.os-select-checkbox')) {
                row.removeChild(firstCell);
            }
            
            // Remover destaque
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        });
    }
    
    // Limpar seleção
    selectedOSForPrint = [];
    
    // Esconder barra de ações
    document.getElementById('selectedOSBar').classList.add('hidden');
    
    showToast('Modo de seleção desativado', 'info');
}

// ===== FUNÇÃO PARA IMPRIMIR OS SELECIONADAS =====
window.imprimirOSSelecionadas = function() {
    if (selectedOSForPrint.length === 0) {
        showToast('Nenhuma OS selecionada', 'warning');
        return;
    }
    
    // Abrir janela de impressão
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    
    // Gerar HTML para impressão
    const printHTML = gerarHTMLImpressaoMultipla(selectedOSForPrint);
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Fechar modo de seleção após impressão
    setTimeout(() => {
        if (selectModeActive) {
            cancelarModoSelecao();
        }
    }, 500);
};

// ===== FUNÇÃO PARA GERAR HTML DE IMPRESSÃO MÚLTIPLA EM FORMATO DE LISTA =====
function gerarHTMLImpressaoMultipla(oss) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const hora = new Date().toLocaleTimeString('pt-BR');
    
    // Ordenar OS por código/número
    const ossOrdenadas = [...oss].sort((a, b) => {
        const numA = parseInt(a.code?.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.code?.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    
    let listaHTML = '';
    let contador = 1;
    
    ossOrdenadas.forEach((os) => {
        // Extrair apenas os campos necessários
        const osNumber = os.code || `OS-${os.id}`;
        const numeroLimpo = osNumber.replace(/\D/g, ''); // Pega só os números
        
        // Usar o número sequencial da lista (1, 2, 3...) ou o número da OS
        const numeroExibicao = contador.toString().padStart(3, '0');
        
        const productName = os.productName || 'Produto não informado';
        const description = os.observations || 'Sem descrição';
        const sku = Array.isArray(os.skus) ? os.skus.join(', ') : (os.skus || 'N/A');
        
        listaHTML += `
            <div class="lista-item">
                <div class="item-numero">${numeroExibicao}</div>
                <div class="item-conteudo">
                    <div class="item-produto">${productName}</div>
                    <div class="item-descricao">${description}</div>
                    <div class="item-sku">SKU: ${sku}</div>
                </div>
                <div class="item-codigo">#${numeroLimpo}</div>
            </div>
        `;
        
        contador++;
    });
    
    return `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lista de OS para Impressão</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 1.5cm;
                    }
                    
                    body {
                        font-family: 'Courier New', monospace;
                        margin: 0;
                        padding: 0;
                        background: white;
                        color: black;
                        font-size: 11pt;
                        line-height: 1.3;
                    }
                    
                    .print-header {
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .print-header h1 {
                        font-size: 18pt;
                        margin: 0 0 5px 0;
                        font-weight: bold;
                    }
                    
                    .print-header p {
                        margin: 0;
                        font-size: 10pt;
                        color: #333;
                    }
                    
                    .lista-container {
                        width: 100%;
                    }
                    
                    .lista-item {
                        display: flex;
                        align-items: flex-start;
                        gap: 15px;
                        padding: 8px 0;
                        border-bottom: 1px dotted #ccc;
                        page-break-inside: avoid;
                    }
                    
                    .item-numero {
                        font-weight: bold;
                        font-size: 12pt;
                        min-width: 40px;
                        text-align: right;
                        color: #000;
                    }
                    
                    .item-conteudo {
                        flex: 1;
                    }
                    
                    .item-produto {
                        font-weight: bold;
                        font-size: 11pt;
                        margin-bottom: 2px;
                    }
                    
                    .item-descricao {
                        font-size: 10pt;
                        color: #444;
                        margin-bottom: 2px;
                        font-style: italic;
                    }
                    
                    .item-sku {
                        font-size: 9pt;
                        color: #666;
                        font-family: monospace;
                    }
                    
                    .item-codigo {
                        font-size: 9pt;
                        color: #888;
                        min-width: 60px;
                        text-align: right;
                        font-family: monospace;
                    }
                    
                    .print-footer {
                        margin-top: 30px;
                        padding-top: 15px;
                        border-top: 1px solid #ccc;
                        font-size: 8pt;
                        color: #666;
                        text-align: center;
                    }
                    
                    .total-badge {
                        display: inline-block;
                        background: #000;
                        color: white;
                        padding: 3px 10px;
                        border-radius: 20px;
                        font-size: 9pt;
                        margin-top: 10px;
                    }
                    
                    /* Estilo para primeira página */
                    .cover-info {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    
                    .cover-info h2 {
                        font-size: 24pt;
                        margin: 0;
                    }
                    
                    .cover-info .data {
                        font-size: 11pt;
                        color: #666;
                    }
                }
                
                @media screen {
                    body {
                        font-family: 'Courier New', monospace;
                        margin: 20px;
                        background: #f5f5f5;
                    }
                    
                    .print-container {
                        max-width: 210mm;
                        margin: 0 auto;
                        background: white;
                        padding: 20mm;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                        border-radius: 3px;
                    }
                    
                    .print-controls {
                        text-align: center;
                        margin: 20px 0;
                        padding: 15px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    
                    .print-btn {
                        padding: 12px 30px;
                        background: #8A2BE2;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 0 10px;
                        transition: all 0.3s;
                    }
                    
                    .print-btn:hover {
                        background: #7a1bd2;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(138, 43, 226, 0.3);
                    }
                    
                    .close-btn {
                        background: #6c757d;
                    }
                    
                    .close-btn:hover {
                        background: #5a6268;
                    }
                    
                    .lista-item {
                        display: flex;
                        align-items: flex-start;
                        gap: 15px;
                        padding: 10px;
                        border-bottom: 1px solid #eee;
                    }
                    
                    .lista-item:hover {
                        background: #f8f9fa;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-controls no-print">
                <h2>📋 Lista de OS para Impressão</h2>
                <p>${oss.length} OS selecionada(s) - Formato de lista</p>
                <button class="print-btn" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Lista
                </button>
                <button class="print-btn close-btn" onclick="window.close()">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
            
            <div class="print-container">
                <!-- Cabeçalho -->
                <div class="print-header">
                    <h1>📋 LISTA DE ORDENS DE SERVIÇO</h1>
                    <p>Data: ${hoje} | Hora: ${hora} | Emitido por: ${currentUser?.name || 'Sistema'}</p>
                    <div class="total-badge">Total: ${oss.length} OS</div>
                </div>
                
                <!-- Lista -->
                <div class="lista-container">
                    ${listaHTML}
                </div>
                
                <!-- Rodapé -->
                <div class="print-footer">
                    <p>Documento gerado automaticamente pelo Sistema Wheel Tech</p>
                    <p>Lista de OS - Página 1 de 1</p>
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                };
                
                window.onafterprint = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `;
}

// ============================================
// NOTIFICAÇÃO DE NOVA OS PARA O RESPONSÁVEL
// ============================================
async function notifyResponsibleNewOS(orderData, responsibleName) {
    if (responsibleName === currentUser.name) return;
    const assunto = `📸 Nova OS atribuída a você - ${orderData.code}`;
    const mensagem = `
    
    Olá ${responsibleName},

    Uma nova Ordem de Serviço foi atribuída a você.

    📄 Número da OS: ${orderData.code}
    👤 Criado por: ${orderData.createdBy || currentUser.name}
    🛠 Serviço: ${orderData.service || 'Não informado'}

    📝 Observação:
    ${orderData.observacao || 'Nenhuma observação'}

    🚨 Devolução urgente: ${orderData.devolucaoUrgente ? 'SIM - PRIORIDADE' : 'Não'}

    Acesse o sistema para visualizar todos os detalhes.

    Sistema Wheel Tech`; // sua mensagem
    await enviarNotificacaoEmail(responsibleName, assunto, mensagem);
}

// ============================================
// ATUALIZAR O SINO DE NOTIFICAÇÕES DA OS
// ============================================
function updateOSNotificationBell() {
    if (!currentUser) return;
    const userOS = filterOrdersByUser(orders);
    const unreadOS = userOS.filter(os =>
        os.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase()) &&
        os.user_notified === false
    ).length;

    const notificationBell = document.getElementById('notificationBell');
    const notificationCount = document.getElementById('notificationCount');
    if (notificationCount) {
        if (unreadOS > 0) {
            notificationCount.textContent = unreadOS;
            notificationBell.style.display = 'block';
        } else {
            notificationBell.style.display = 'none';
        }
    }
}

// ============================================
// MARCAR TODAS AS OS COMO LIDAS
// ============================================
async function marcarOSComoLidas() {
    if (!currentUser || !supabaseClient) return;

    const osParaMarcar = orders.filter(os =>
        os.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase()) &&
        os.user_notified === false
    );

    if (osParaMarcar.length === 0) return;

    const ids = osParaMarcar.map(os => os.id);
    try {
        const { error } = await supabaseClient
            .from('ordens_service')
            .update({ user_notified: true })
            .in('id', ids);

        if (error) throw error;

        osParaMarcar.forEach(os => os.user_notified = true);
        updateOSNotificationBell();
        showToast(`✅ Notificações marcadas como lidas`, 'success');
    } catch (error) {
        console.error('❌ Erro ao marcar OS como lidas:', error);
    }
}

// ============================================
// NOTIFICAR ANDRESSA SOBRE NOVO REEMBOLSO
// ============================================
async function notificarAndressaNovoReembolso(reembolsoData) {
    const destinatario = 'Hosama';
    const assunto = `💰 Novo reembolso para verificar - Venda ${reembolsoData.numero_venda}`;
    const mensagem = `
    Novo reembolso para verificar!
    Entre no sistema para mais detalhes.
    `; // sua mensagem
    await enviarNotificacaoEmail(destinatario, assunto, mensagem);
}

// ===== ADICIONAR BOTÕES NA INTERFACE =====
function adicionarBotoesSelecaoOS() {
    // Verificar se já existe
    if (document.getElementById('selectOSBtn')) return;
    
    // Encontrar o container dos botões de filtro
    const filterContainer = document.querySelector('.filter-group');
    if (!filterContainer) return;
    
    // Criar botão de seleção
    const selectBtn = document.createElement('button');
    selectBtn.id = 'selectOSBtn';
    selectBtn.className = 'btn btn-success';
    selectBtn.innerHTML = '<i class="fas fa-check-double"></i> Selecionar OS';
    selectBtn.onclick = window.ativarModoSelecaoOS;
    
    // Adicionar após os filtros
    filterContainer.parentNode.insertBefore(selectBtn, filterContainer.nextSibling);
    
    // Criar barra de ações para OS selecionadas
    const selectedBar = document.createElement('div');
    selectedBar.id = 'selectedOSBar';
    selectedBar.className = 'selected-os-bar hidden';
    selectedBar.innerHTML = `
        <div style="background: #f0f0f0; padding: 10px 20px; margin: 10px 0; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #8A2BE2;">
            <div>
                <i class="fas fa-check-circle" style="color: #8A2BE2;"></i>
                <strong id="selectedOSCount">0</strong> OS selecionada(s)
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-sm btn-info" onclick="selecionarTodasOS()">
                    <i class="fas fa-check-double"></i> Selecionar Todas
                </button>
                <button class="btn btn-sm btn-warning" onclick="limparSelecaoOS()">
                    <i class="fas fa-eraser"></i> Limpar
                </button>
                <button class="btn btn-sm btn-primary" id="printSelectedOSBtn" onclick="imprimirOSSelecionadas()" disabled>
                    <i class="fas fa-print"></i> Imprimir Selecionadas
                </button>
                <button class="btn btn-sm btn-danger" onclick="ativarModoSelecaoOS()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    // Inserir após a tabela
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
        tableContainer.parentNode.insertBefore(selectedBar, tableContainer.nextSibling);
    }
}

window.abrirSistemaFrete = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    // Esconder outras abas
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'reviewsSystem', 'folgasSystem', 'estoqueSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const shippingSystem = document.getElementById('shippingSystem');
    if (shippingSystem) shippingSystem.classList.remove('hidden');
    
    // Atualizar cabeçalho
    document.getElementById('shippingUserName').textContent = currentUser.name;
    document.getElementById('shippingUserAvatar').textContent = currentUser.avatar;
    document.getElementById('shippingUserRole').textContent = currentUser.role;
    
    // Verificar se o shippingManager já está disponível
    if (typeof window.shippingManager !== 'undefined' && window.shippingManager !== null) {
        if (typeof window.shippingManager.carregarAnalises === 'function') {
            window.shippingManager.carregarAnalises();
        } else {
            showToast('Módulo de fretes incompleto. Recarregue a página.', 'error');
        }
    } else {
        showToast('Módulo de fretes não carregado. Recarregue a página.', 'error');
        console.error('shippingManager não está definido. Verifique a ordem dos scripts.');
    }
};

// ===== INICIALIZAR QUANDO O DOM CARREGAR =====
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que tudo carregou
    setTimeout(() => {
        adicionarBotoesSelecaoOS();
    }, 2000);
});

// ===== CSS ADICIONAL PARA A BARRA DE SELEÇÃO =====
const selecaoStyles = document.createElement('style');
selecaoStyles.innerHTML = `
    .selected-os-bar {
        animation: slideDown 0.3s ease-out;
        margin-bottom: 20px;
    }
    
    .selected-os-bar.hidden {
        display: none;
    }
    
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    /* Estilo para linhas selecionadas */
    tr.selected-os-row {
        background-color: #e8f0fe !important;
        border-left: 4px solid #8A2BE2 !important;
    }
    
    /* Checkbox personalizado */
    .os-select-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #8A2BE2;
    }
    
    .os-select-checkbox:hover {
        transform: scale(1.1);
    }
    
    /* Botão de seleção */
    #selectOSBtn {
        margin-left: 15px;
        transition: all 0.3s;
    }
    
    #selectOSBtn.btn-success {
        background: linear-gradient(135deg, #28a745, #20c997);
    }
    
    #selectOSBtn.btn-danger {
        background: linear-gradient(135deg, #dc3545, #c82333);
    }
    
    /* Badge de contagem */
    .selection-badge {
        background: #8A2BE2;
        color: white;
        border-radius: 50%;
        padding: 2px 6px;
        font-size: 11px;
        margin-left: 5px;
    }
`;

document.head.appendChild(selecaoStyles);

async function abrirSistemaNFE() {
    if (!currentUser) {
        showToast('Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    // Esconder outros sistemas
    document.querySelectorAll('#mainSystem, #salesSystem, #reembolsosSystem, #caixaSystem, #reviewsSystem, #folgasSystem, #shippingSystem, #estoqueSystem').forEach(el => {
        if (el) el.classList.add('hidden');
    });

    const nfeSystem = document.getElementById('nfeSystem');
    if (!nfeSystem) {
        showToast('Sistema NF-e não encontrado', 'error');
        return;
    }

    nfeSystem.classList.remove('hidden');

    // Carregar lista de vendas que podem gerar NF-e (ex: vendas do ML com status 'paid' e que ainda não têm nota emitida)
    await carregarVendasParaNFE();

    // Atualizar informações do usuário
    document.getElementById('nfeUserAvatar').textContent = currentUser.avatar;
    document.getElementById('nfeUserName').textContent = currentUser.name;
    document.getElementById('nfeUserRole').textContent = currentUser.role;
}

async function carregarVendasParaNFE() {
    try {
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .is('nfe_emitida', null) // só as que ainda não tiveram NF-e emitida
            .order('created_at', { ascending: false });
        if (error) throw error;

        const tbody = document.getElementById('nfeVendasBody');
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma venda disponível para emissão</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(v => `
            <tr>
                <td>${v.id_venda_ml}</td>
                <td>${v.cliente || 'Não informado'}</td>
                <td>R$ ${(v.valor_total || 0).toFixed(2)}</td>
                <td>${new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="emitirNFEVenda('${v.id_venda_ml}')">
                        <i class="fas fa-file-invoice"></i> Emitir NF-e
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        showToast('Erro ao carregar vendas', 'error');
    }
}

async function emitirNFEVenda(vendaId) {
    // Buscar detalhes da venda
    const { data: venda, error } = await supabaseClient
        .from('vendas_ml')
        .select('*')
        .eq('id_venda_ml', vendaId)
        .single();
    if (error) {
        showToast('Erro ao buscar venda', 'error');
        return;
    }

    // Pedir senha do certificado
    const password = prompt('Digite a senha do certificado digital:');
    if (!password) return;

    // Preparar dados para envio ao backend
    const dadosNFE = {
        venda: venda,
        password: password
    };

    // Chamar backend
    try {
        const response = await fetch('http://localhost:3001/api/nfe/emitir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosNFE)
        });
        const result = await response.json();
        if (response.ok) {
            showToast('NF-e emitida com sucesso!', 'success');
            // Atualizar status da venda no banco
            await supabaseClient.from('vendas_ml').update({ nfe_emitida: true }).eq('id_venda_ml', vendaId);
            // Recarregar lista
            carregarVendasParaNFE();
        } else {
            showToast(`Erro: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Erro de comunicação: ${error.message}`, 'error');
    }
}

// Exportar funções
window.abrirSistemaNFE = abrirSistemaNFE;
window.emitirNFEVenda = emitirNFEVenda;

// ===== EXPORTAR FUNÇÕES PARA USO GLOBAL =====
window.testMLConnection = testMLConnection;
window.checkMLTokenStatus = checkMLTokenStatus;
window.initializeMLAuth = initializeMLAuth;
window.testMLConnection = testMLConnection;
window.abrirSistemaVendas = abrirSistemaVendas;
window.carregarVendasML = carregarVendasML;
window.verDetalhesVenda = verDetalhesVenda;
window.verificarVenda = verificarVenda;
window.desverificarVenda = desverificarVenda;
window.configurarVendas = configurarVendas;
window.fecharConfigVendas = fecharConfigVendas;
window.salvarConfigVendas = salvarConfigVendas;
window.exportarVendas = exportarVendas;
window.fecharDetalhesVenda = fecharDetalhesVenda;
window.imprimirDetalhesVenda = imprimirDetalhesVenda;
window.verificarVendaAtual = verificarVendaAtual;
