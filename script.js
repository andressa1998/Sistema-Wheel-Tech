// ============================================
// SISTEMA OS FOTOGRAFIA - VERSÃO COMPLETA ATUALIZADA
// ============================================

// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = 'https://nvlmtinpcayrpkhulefs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
let supabaseClient = null;

// ===== VARIÁVEIS GLOBAIS =====
let currentUser = null;
let orders = [];
let orderCounter = 1;
let currentFilter = 'todos';
let editingOrderId = null;

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
    { username: 'bruna', password: '270194', name: 'Bruna', avatar: 'B', role: 'Assistente' }
];

// ===== FUNÇÃO DE TESTE (REMOVA DEPOIS) =====
function testeLoginRapido() {
    console.log('🧪 Teste rápido de login disponível');
    console.log('👥 Usuários disponíveis:', SYSTEM_USERS.map(u => u.username));
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');
    testeLoginRapido();
    
    // Verificar elementos DOM
    console.log('📋 Verificando elementos DOM:');
    console.log('- loginForm:', document.getElementById('loginForm') ? '✅ OK' : '❌ NÃO ENCONTRADO');
    console.log('- loginScreen:', document.getElementById('loginScreen') ? '✅ OK' : '❌ NÃO ENCONTRADO');
    console.log('- mainSystem:', document.getElementById('mainSystem') ? '✅ OK' : '❌ NÃO ENCONTRADO');
    console.log('- username input:', document.getElementById('username') ? '✅ OK' : '❌ NÃO ENCONTRADO');
    console.log('- password input:', document.getElementById('password') ? '✅ OK' : '❌ NÃO ENCONTRADO');
    
    generateOSCode();
    initSupabase();
    setupEventListeners();
    
    // Adicionar botão de teste (remova depois)
    adicionarBotaoTeste();
});

// ===== BOTÃO DE TESTE (REMOVA DEPOIS) =====
function adicionarBotaoTeste() {
    const testBtn = document.createElement('button');
    testBtn.textContent = '🧪 Teste Login Rápido';
    testBtn.style.position = 'fixed';
    testBtn.style.top = '10px';
    testBtn.style.right = '10px';
    testBtn.style.zIndex = '9999';
    testBtn.style.padding = '8px 12px';
    testBtn.style.background = '#4CAF50';
    testBtn.style.color = 'white';
    testBtn.style.border = 'none';
    testBtn.style.borderRadius = '4px';
    testBtn.style.cursor = 'pointer';
    testBtn.style.fontSize = '12px';
    
    testBtn.onclick = function() {
        console.log('🧪 Executando teste de login...');
        document.getElementById('username').value = 'elaine';
        document.getElementById('password').value = '180998';
        handleLogin({preventDefault: () => {}});
    };
    
    document.body.appendChild(testBtn);
}

// ============================================
// FUNÇÕES DE INICIALIZAÇÃO
// ============================================
function initSupabase() {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('✅ Supabase inicializado');
        } else {
            console.error('❌ Biblioteca Supabase não carregada');
        }
    } catch (error) {
        console.error('❌ Erro ao inicializar Supabase:', error);
    }
}

function setupEventListeners() {
    // Login
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log('✅ Listener de login adicionado');
    } else {
        console.error('❌ loginForm não encontrado para adicionar listener');
    }
    
    // Tecla Enter no campo de senha
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                console.log('Enter pressionado no campo de senha');
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
    
    // Tecla Escape fecha modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && completeModal && !completeModal.classList.contains('hidden')) {
            closeCompleteModal();
        }
    });
    
    // Foco no campo de usuário ao carregar
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        setTimeout(() => usernameInput.focus(), 100);
    }
}

// ============================================
// FUNÇÃO DE LOGIN (ATUALIZADA)
// ============================================
function handleLogin(e) {
    console.log('🔐 Iniciando processo de login...');
    
    if (e && e.preventDefault) {
        e.preventDefault();
    }
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    if (!usernameInput || !passwordInput) {
        console.error('❌ Campos de login não encontrados');
        showToast('Erro no sistema de login', 'error');
        return;
    }
    
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    
    console.log(`📝 Dados inseridos - Usuário: "${username}", Senha: "${password ? '***' : 'vazia'}"`);
    
    // Feedback visual
    const submitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;
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
    
    console.log('🔍 Buscando usuário no sistema...');
    
    // Verificar usuário
    const foundUser = SYSTEM_USERS.find(user => {
        const match = user.username === username && user.password === password;
        if (match) console.log(`✅ Usuário correspondente encontrado: ${user.name}`);
        return match;
    });
    
    setTimeout(() => {
        if (foundUser) {
            console.log(`✅ Login bem-sucedido para: ${foundUser.name}`);
            currentUser = foundUser;
            
            // Atualizar interface do usuário
            if (userName) userName.textContent = foundUser.name;
            if (userAvatar) userAvatar.textContent = foundUser.avatar;
            if (userRole) userRole.textContent = foundUser.role;
            if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a), ${foundUser.name}!`;
            if (createdByInput) createdByInput.value = foundUser.name;
            
            // Mostrar sistema, esconder login
            if (loginScreen) loginScreen.classList.add('hidden');
            if (mainSystem) mainSystem.classList.remove('hidden');
            
            showToast(`✅ Bem-vindo(a), ${foundUser.name}!`, 'success');
            
            // Inicializar sistema após login
            setTimeout(() => {
                if (supabaseClient) {
                    testSupabaseConnection();
                } else {
                    updateCounters();
                    renderOrdersTable();
                }
            }, 500);
            
        } else {
            console.log('❌ Credenciais inválidas');
            showToast('❌ Usuário ou senha incorretos', 'error');
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        // Restaurar botão
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
    }, 300); // Pequeno delay para feedback visual
}

// ============================================
// FUNÇÃO DE LOGOUT
// ============================================
function handleLogout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        currentUser = null;
        orders = [];
        
        if (mainSystem) mainSystem.classList.add('hidden');
        if (loginScreen) loginScreen.classList.remove('hidden');
        
        if (loginForm) loginForm.reset();
        
        // Foco no usuário
        const usernameInput = document.getElementById('username');
        if (usernameInput) setTimeout(() => usernameInput.focus(), 100);
        
        showToast('👋 Até logo!', 'info');
    }
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
// FUNÇÃO CARREGAR ORDENS
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
                code: order.codigo || `OS-${order.id.toString().padStart(4, '0')}`,
                productName: order.produto_nome || 'Sem nome',
                responsibleName: order.responsavel || currentUser.name,
                urgency: order.urgencia || 'normal',
                osType: order.tipo_os || 'normal',
                status: order.status || 'pendente',
                photoType: order.tipo_foto || 'estudio',
                skus: order.skus || [],
                observations: order.observacoes || '',
                photosTaken: order.qtd_fotos || 0,
                editsMade: order.qtd_edicoes || 0,
                createdBy: order.criado_por || 'Sistema',
                createdAt: order.data_criacao ? 
                    new Date(order.data_criacao).toLocaleDateString('pt-BR') : 'N/D',
                updatedAt: order.ultima_atualizacao || order.data_criacao
            }));
            
            orderCounter = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id))) + 1 : 1;
            
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
// FUNÇÃO SALVAR OS
// ============================================
async function saveOrder() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    const productName = document.getElementById('productName')?.value.trim();
    const responsibleName = document.getElementById('responsibleName')?.value;
    
    if (!productName || !responsibleName) {
        showToast('⚠️ Preencha produto e responsável', 'warning');
        return;
    }
    
    const orderData = {
        id: editingOrderId || orderCounter,
        code: editingOrderId ? orders.find(o => o.id == editingOrderId)?.code : generateOSCode(),
        productName: productName,
        responsibleName: responsibleName,
        urgency: document.getElementById('urgency')?.value || 'normal',
        osType: document.getElementById('osType')?.value || 'normal',
        status: 'pendente',
        photoType: document.getElementById('photoType')?.value || 'estudio',
        skus: document.getElementById('skus')?.value.split(',').map(s => s.trim()).filter(s => s) || [],
        observations: document.getElementById('observations')?.value || '',
        photosTaken: 0,
        editsMade: 0,
        createdBy: currentUser.name,
        createdAt: new Date().toLocaleDateString('pt-BR'),
        updatedAt: new Date().toISOString()
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
            }
            
            updateCounters();
            renderOrdersTable();
            clearForm();
            
        } else {
            showToast('❌ Erro ao salvar: ' + result.error, 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro inesperado', 'error');
    } finally {
        if (saveOSBtn) {
            saveOSBtn.innerHTML = '<i class="fas fa-save"></i> <span id="submitBtnText">Salvar OS</span>';
            saveOSBtn.disabled = false;
        }
    }
}

// ============================================
// FUNÇÃO SALVAR NO SUPABASE
// ============================================
async function saveOrderToSupabase(order) {
    try {
        const orderData = {
            codigo: order.code,
            produto_nome: order.productName,
            responsavel: order.responsibleName,
            criado_por: order.createdBy,
            urgencia: order.urgency,
            tipo_os: order.osType,
            status: order.status,
            tipo_foto: order.photoType,
            observacoes: order.observations,
            skus: order.skus,
            qtd_fotos: order.photosTaken,
            qtd_edicoes: order.editsMade,
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
// FUNÇÕES DO FORMULÁRIO
// ============================================
function clearForm() {
    const productNameInput = document.getElementById('productName');
    const responsibleNameInput = document.getElementById('responsibleName');
    const urgencySelect = document.getElementById('urgency');
    const osTypeSelect = document.getElementById('osType');
    const photoTypeSelect = document.getElementById('photoType');
    const skusInput = document.getElementById('skus');
    const observationsInput = document.getElementById('observations');
    
    if (productNameInput) productNameInput.value = '';
    if (responsibleNameInput) responsibleNameInput.value = '';
    if (urgencySelect) urgencySelect.value = 'normal';
    if (osTypeSelect) osTypeSelect.value = 'normal';
    if (photoTypeSelect) photoTypeSelect.value = 'estudio';
    if (skusInput) skusInput.value = '';
    if (observationsInput) observationsInput.value = '';
    
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
// FUNÇÕES DE FILTRO E PERMISSÃO
// ============================================
function filterOrdersByUser(ordersList) {
    if (!currentUser) return [];
    
    return ordersList.filter(order => {
        const isResponsible = order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase());
        const isCreator = order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase());
        return isResponsible || isCreator;
    });
}

function checkOrderPermission(order) {
    if (!currentUser) return false;
    
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
    
    if (countPending) countPending.textContent = myPending;
    if (countProgress) countProgress.textContent = myProgress;
    if (countCompleted) countCompleted.textContent = myCompleted;
    if (countTotal) countTotal.textContent = myTotal;
    
    if (myOrdersCount) myOrdersCount.textContent = myTotal;
    if (totalOrdersCount) totalOrdersCount.textContent = orders.length;
    
    if (emptyMessage) {
        if (myTotal === 0) {
            emptyMessage.classList.remove('hidden');
            const tableResponsive = document.querySelector('.table-responsive');
            if (tableResponsive) tableResponsive.classList.add('hidden');
        } else {
            emptyMessage.classList.add('hidden');
            const tableResponsive = document.querySelector('.table-responsive');
            if (tableResponsive) tableResponsive.classList.remove('hidden');
        }
    }
}

// ============================================
// RENDERIZAR TABELA
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
    
    if (filteredOrders.length === 0) {
        osTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 40px;">
                    <i class="fas fa-user-lock fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma ordem disponível</h4>
                    <p style="color: #6c757d;">Você não tem permissão para visualizar ordens ou não há ordens com seu filtro atual.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    filteredOrders.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        const hasPermission = checkOrderPermission(order);
        
        // Estilo
        if (order.osType === 'devolucao') row.className = 'return-highlight';
        else if (order.urgency === 'alta') row.className = 'urgent-high';
        else if (order.urgency === 'normal') row.className = 'urgent-medium';
        else row.className = 'urgent-low';
        
        // Badges
        let permissionBadge = '';
        if (order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            permissionBadge = '<span class="badge badge-primary" style="margin-left: 5px;"><i class="fas fa-user-check"></i> Responsável</span>';
        } else if (order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            permissionBadge = '<span class="badge badge-info" style="margin-left: 5px;"><i class="fas fa-user-edit"></i> Criador</span>';
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
        
        // Botões
        let actionButtons = '';
        if (hasPermission) {
            if (order.status === 'pendente') {
                actionButtons = `<button class="btn btn-success btn-sm" onclick="startOrder('${order.id}')"><i class="fas fa-play"></i></button>`;
            } else if (order.status === 'andamento') {
                actionButtons = `<button class="btn btn-info btn-sm" onclick="openCompleteModal('${order.id}')"><i class="fas fa-flag-checkered"></i></button>`;
            }
            
            actionButtons += `<button class="btn btn-warning btn-sm" onclick="editOrder('${order.id}')"><i class="fas fa-edit"></i></button>`;
        }
        
        row.innerHTML = `
            <td>
                <strong>${order.code}</strong>
                ${permissionBadge}
                ${typeBadge}
            </td>
            <td>${order.productName}</td>
            <td>
                <div>${order.responsibleName}</div>
                <small><i class="fas fa-user-plus"></i> Criado por: ${order.createdBy || 'Sistema'}</small>
            </td>
            <td>${urgencyBadge}</td>
            <td>${statusBadge}</td>
            <td>${order.createdAt}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="viewOrder('${order.id}')"><i class="fas fa-eye"></i></button>
                    ${actionButtons}
                    ${hasPermission ? `<button class="btn btn-danger btn-sm" onclick="deleteOrderPrompt('${order.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        
        osTableBody.appendChild(row);
    });
}

// ============================================
// FUNÇÕES DE AÇÃO (GLOBAIS)
// ============================================
window.filterOS = function(filter) {
    currentFilter = filter;
    renderOrdersTable();
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
        const urgencySelect = document.getElementById('urgency');
        const osTypeSelect = document.getElementById('osType');
        const photoTypeSelect = document.getElementById('photoType');
        const skusInput = document.getElementById('skus');
        const observationsInput = document.getElementById('observations');
        
        if (productNameInput) productNameInput.value = order.productName;
        if (responsibleNameInput) responsibleNameInput.value = order.responsibleName;
        if (urgencySelect) urgencySelect.value = order.urgency;
        if (osTypeSelect) osTypeSelect.value = order.osType;
        if (photoTypeSelect) photoTypeSelect.value = order.photoType;
        if (skusInput) skusInput.value = order.skus.join(', ');
        if (observationsInput) observationsInput.value = order.observations;
        
        if (formTitle) formTitle.textContent = `Editando: ${order.code}`;
        if (submitBtnText) submitBtnText.textContent = 'Atualizar OS';
        if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');
        if (osCodeDisplay) osCodeDisplay.textContent = `Código: ${order.code}`;
        
        showToast(`✏️ Editando OS: ${order.code}`, 'info');
    } else {
        showToast('⚠️ Sem permissão para editar', 'warning');
    }
};

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
                    ultima_atualizacao: new Date().toISOString()
                })
                .eq('id', orderId);
        }
        
        order.status = 'concluida';
        order.photosTaken = photosTaken;
        order.editsMade = editsMade;
        
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
// FUNÇÃO DE IMPRESSÃO (SIMPLIFICADA)
// ============================================
window.printOrder = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (!order) {
        showToast('OS não encontrada', 'error');
        return;
    }
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html><head><title>OS ${order.code}</title>
        <style>body{font-family:Arial;padding:20px}</style></head>
        <body>
            <h1>Ordem de Serviço: ${order.code}</h1>
            <p><strong>Produto:</strong> ${order.productName}</p>
            <p><strong>Responsável:</strong> ${order.responsibleName}</p>
            <p><strong>Status:</strong> ${order.status}</p>
            <p><strong>Criado em:</strong> ${order.createdAt}</p>
            <button onclick="window.print();window.close()">Imprimir</button>
        </body></html>
    `);
    printWindow.document.close();
    
    showToast(`Preparando impressão`, 'info');
};

// ============================================
// FUNÇÃO PARA TESTE RÁPIDO (REMOVA DEPOIS)
// ============================================
window.testarLogin = function() {
    console.log('🧪 Executando teste de login...');
    document.getElementById('username').value = 'elaine';
    document.getElementById('password').value = '180998';
    handleLogin({preventDefault: () => {}});
};