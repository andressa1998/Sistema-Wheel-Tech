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
let currentOSForPrint = null;
let currentPrintStyle = 'detailed';

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

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');
    
    generateOSCode();
    initSupabase();
    setupEventListeners();
    
    // Adicionar evento de tecla ESC para fechar modais
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const printModal = document.getElementById('printModal');
            if (printModal && !printModal.classList.contains('hidden')) {
                closePrintModal();
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
    
    // Foco no campo de usuário ao carregar
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        setTimeout(() => usernameInput.focus(), 100);
    }
}

// ============================================
// FUNÇÃO DE LOGIN
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
                createdAt: order.data_criacao,
                completionDate: order.data_conclusao,
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
        createdAt: new Date().toISOString(),
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
// RENDERIZAR TABELA (ATUALIZADA COM BOTÃO DE IMPRESSÃO)
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
        
        // Formatar data
        const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
        const formattedDate = createdDate.toLocaleDateString('pt-BR') + ' ' + 
                             createdDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
        
        // Botões
        let actionButtons = '';
        if (hasPermission) {
            if (order.status === 'pendente') {
                actionButtons = `<button class="btn btn-success btn-sm" onclick="startOrder('${order.id}')" title="Iniciar OS">
                    <i class="fas fa-play"></i>
                </button>`;
            } else if (order.status === 'andamento') {
                actionButtons = `<button class="btn btn-info btn-sm" onclick="openCompleteModal('${order.id}')" title="Finalizar OS">
                    <i class="fas fa-flag-checkered"></i>
                </button>`;
            }
            
            actionButtons += `<button class="btn btn-warning btn-sm" onclick="editOrder('${order.id}')" title="Editar OS">
                <i class="fas fa-edit"></i>
            </button>`;
        }
        
        // SEMPRE adicionar botão de impressão
        actionButtons += `<button class="btn btn-primary btn-sm" onclick="openPrintModal(${JSON.stringify(order).replace(/"/g, '&quot;')})" title="Imprimir OS">
            <i class="fas fa-print"></i>
        </button>`;
        
        // Botão de excluir apenas para admin ou criador
        if (currentUser.role === 'Administrador' || order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase())) {
            actionButtons += `<button class="btn btn-danger btn-sm" onclick="deleteOrderPrompt('${order.id}')" title="Excluir OS">
                <i class="fas fa-trash"></i>
            </button>`;
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
            <td>${formattedDate}</td>
            <td>
                <div class="d-flex gap-2">
                    ${actionButtons}
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
        order.completionDate = new Date().toISOString();
        
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
// FUNÇÕES DE IMPRESSÃO MELHORADAS
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
        'estudio': 'Estúdio',
        'bike': 'Na Bike',
        'ambos': 'Ambos'
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
                    ${osData.skus && osData.skus.length > 0 ? `
                    <div class="info-row">
                        <div class="info-label">SKUs:</div>
                        <div class="info-value">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${Array.isArray(osData.skus) ? osData.skus.map(sku => `
                                    <span style="background: #e9ecef; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                        ${sku}
                                    </span>
                                `).join('') : osData.skus}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <div class="info-label">Tipo de Foto:</div>
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
            
            <!-- Seção de Assinaturas -->
            <div class="signature-section">
                <h3 style="text-align: center; color: #495057; margin-bottom: 30px;">
                    <i class="fas fa-signature"></i> Aprovações e Assinaturas
                </h3>
                <div class="signature-grid">
                    <div class="signature-box">
                        <div class="signature-label">Responsável pela OS</div>
                        <div class="signature-line"></div>
                        <div class="signature-name">${osData.responsibleName}</div>
                        <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                            Data: ________________
                        </div>
                    </div>
                    
                    <div class="signature-box">
                        <div class="signature-label">Fotógrafo Responsável</div>
                        <div class="signature-line"></div>
                        <div class="signature-name" style="color: #6c757d; font-style: italic;">
                            ______________________________
                        </div>
                        <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                            Data: ________________
                        </div>
                    </div>
                    
                    <div class="signature-box">
                        <div class="signature-label">Cliente / Requisitante</div>
                        <div class="signature-line"></div>
                        <div class="signature-name" style="color: #6c757d; font-style: italic;">
                            ______________________________
                        </div>
                        <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                            Data: ________________
                        </div>
                    </div>
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
        const photoTypeMap = { 'estudio': 'Estúdio', 'bike': 'Na Bike', 'ambos': 'Ambos' };
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
// FUNÇÃO PARA TESTE RÁPIDO
// ============================================
window.testarLogin = function() {
    document.getElementById('username').value = 'elaine';
    document.getElementById('password').value = '180998';
    handleLogin({preventDefault: () => {}});
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
    
    .preview-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.08);
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
    
    .print-crop-marks {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
    }
    
    .crop-mark {
        position: absolute;
        width: 15px;
        height: 15px;
        border: 1px solid rgba(0,0,0,0.2);
    }
    
    .crop-mark.top-left {
        top: 10mm;
        left: 10mm;
        border-bottom: none;
        border-right: none;
    }
    
    .crop-mark.top-right {
        top: 10mm;
        right: 10mm;
        border-bottom: none;
        border-left: none;
    }
    
    .crop-mark.bottom-left {
        bottom: 10mm;
        left: 10mm;
        border-top: none;
        border-right: none;
    }
    
    .crop-mark.bottom-right {
        bottom: 10mm;
        right: 10mm;
        border-top: none;
        border-left: none;
    }
`;

document.head.appendChild(printStyles);

console.log('✅ Script carregado com sucesso!');