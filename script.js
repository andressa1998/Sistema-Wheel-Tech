// ============================================
// SISTEMA OS FOTOGRAFIA - VERSÃO COMPLETA
// ============================================

// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = window.SUPABASE_URL || 'https://nvlmtinpcayrpkhulefs.supabase.co';
const SUPABASE_KEY = window.SUPABASE_KEY || 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
const osFormContainer = document.getElementById('osFormContainer');
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
    { username: 'elaine', password: '180998', name: 'Elaine', avatar: 'E' },
    { username: 'arthur', password: '040869', name: 'Arthur', avatar: 'A' },
    { username: 'laura', password: '123456', name: 'Laura', avatar: 'L' },
    { username: 'ronald', password: '210188', name: 'Ronald', avatar: 'R' },
    { username: 'bruna', password: '270194', name: 'Bruna', avatar: 'B' }
];

// ============================================
// FUNÇÃO DE LOGIN
// ============================================
loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showToast('Por favor, preencha usuário e senha!', 'warning');
        return;
    }
    
    const foundUser = SYSTEM_USERS.find(user => {
        return user.username === username && user.password === password;
    });
    
    if (foundUser) {
        currentUser = foundUser;
        userName.textContent = foundUser.name;
        userAvatar.textContent = foundUser.avatar;
        userRole.textContent = 'Usuário';
        welcomeMessage.textContent = `Bem-vindo(a), ${foundUser.name}!`;
        createdByInput.value = foundUser.name;
        
        loginScreen.classList.add('hidden');
        mainSystem.classList.remove('hidden');
        
        showToast(`✅ Bem-vindo(a), ${foundUser.name}!`, 'success');
        testSupabaseConnection();
        
    } else {
        showToast('❌ Usuário ou senha incorretos', 'error');
        document.getElementById('password').value = '';
    }
});

// ============================================
// FUNÇÃO DE LOGOUT
// ============================================
logoutBtn.addEventListener('click', function() {
    currentUser = null;
    mainSystem.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.reset();
    showToast('👋 Até logo!', 'info');
});

// ============================================
// FUNÇÃO SALVAR OS
// ============================================
saveOSBtn.addEventListener('click', async function() {
    console.log('💾 SALVANDO OS...');
    
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    // Validação básica
    const productName = document.getElementById('productName').value.trim();
    const responsibleName = document.getElementById('responsibleName').value;
    
    if (!productName) {
        showToast('⚠️ Digite o nome do produto', 'warning');
        document.getElementById('productName').focus();
        return;
    }
    
    if (!responsibleName) {
        showToast('⚠️ Selecione o responsável', 'warning');
        document.getElementById('responsibleName').focus();
        return;
    }
    
    // Coleta dados
    const orderData = {
        id: editingOrderId || orderCounter,
        code: editingOrderId ? orders.find(o => o.id == editingOrderId).code : generateOSCode(),
        productName: productName,
        responsibleName: responsibleName,
        urgency: document.getElementById('urgency').value,
        osType: document.getElementById('osType').value,
        status: 'pendente',
        photoType: document.getElementById('photoType').value,
        skus: document.getElementById('skus').value.split(',').map(s => s.trim()).filter(s => s),
        observations: document.getElementById('observations').value,
        photosTaken: 0,
        editsMade: 0,
        createdBy: currentUser.name,
        createdAt: new Date().toLocaleDateString('pt-BR'),
        updatedAt: new Date().toISOString()
    };
    
    console.log('📦 Dados da OS:', orderData);
    
    // Desabilita botão
    saveOSBtn.innerHTML = '<span class="spinner"></span> Salvando...';
    saveOSBtn.disabled = true;
    
    try {
        // Salva no Supabase
        const result = await saveOrderToSupabase(orderData);
        
        if (result.success) {
            if (editingOrderId) {
                // Atualiza localmente
                const index = orders.findIndex(o => o.id == editingOrderId);
                if (index !== -1) {
                    orders[index] = orderData;
                }
                editingOrderId = null;
                showToast(`✅ OS "${orderData.productName}" atualizada`, 'success');
            } else {
                // Adiciona localmente
                orders.unshift(orderData);
                orderCounter++;
                showToast(`✅ OS "${orderData.productName}" criada`, 'success');
            }
            
            // Atualiza interface
            updateCounters();
            renderOrdersTable();
            clearForm();
            
        } else {
            showToast('❌ Erro ao salvar: ' + result.error, 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro inesperado ao salvar', 'error');
    } finally {
        // Restaura botão
        saveOSBtn.innerHTML = '<i class="fas fa-save"></i> <span id="submitBtnText">Salvar OS</span>';
        saveOSBtn.disabled = false;
    }
});

// ============================================
// FUNÇÃO SALVAR NO SUPABASE
// ============================================
async function saveOrderToSupabase(order) {
    console.log('📤 Enviando para Supabase...');
    
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
        
        console.log('📊 Dados para Supabase:', orderData);
        
        let result;
        
        if (editingOrderId) {
            // Atualizar
            const { data, error } = await supabase
                .from('ordens_servico')
                .update(orderData)
                .eq('id', editingOrderId)
                .select();
            
            if (error) throw error;
            result = { success: true, updated: true, data };
        } else {
            // Criar novo
            const { data, error } = await supabase
                .from('ordens_servico')
                .insert([orderData])
                .select();
            
            if (error) throw error;
            result = { success: true, updated: false, data };
        }
        
        console.log('✅ Sucesso no Supabase:', result);
        return result;
        
    } catch (error) {
        console.error('❌ Erro no Supabase:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// FUNÇÃO TESTAR CONEXÃO
// ============================================
async function testSupabaseConnection() {
    showToast('🔗 Testando conexão...', 'info');
    testSupabaseBtn.innerHTML = '<span class="spinner"></span> Testando...';
    testSupabaseBtn.disabled = true;
    
    try {
        // Teste simples
        const { data, error } = await supabase
            .from('ordens_servico')
            .select('id')
            .limit(1);
        
        if (error) throw error;
        
        showToast('✅ Conexão estabelecida!', 'success');
        syncStatus.textContent = 'Conectado';
        syncStatus.className = 'badge badge-success ml-2';
        
        // Carrega ordens
        await loadOrders();
        
    } catch (error) {
        console.error('❌ Erro de conexão:', error);
        showToast('❌ Falha na conexão: ' + error.message, 'error');
        syncStatus.textContent = 'Desconectado';
        syncStatus.className = 'badge badge-danger ml-2';
    } finally {
        testSupabaseBtn.innerHTML = '<i class="fas fa-database"></i> Testar Conexão';
        testSupabaseBtn.disabled = false;
    }
}

// ============================================
// FUNÇÃO CARREGAR ORDENS
// ============================================
async function loadOrders() {
    showToast('🔄 Carregando ordens...', 'info');
    reloadBtn.innerHTML = '<span class="spinner"></span> Carregando...';
    reloadBtn.disabled = true;
    
    try {
        const { data, error } = await supabase
            .from('ordens_servico')
            .select('*')
            .order('data_criacao', { ascending: false });
        
        if (error) throw error;
        
        console.log(`✅ ${data.length} ordens carregadas`);
        
        // Processa os dados
        orders = data.map(order => ({
            id: order.id,
            code: order.codigo || `OS-${order.id.toString().padStart(4, '0')}`,
            productName: order.produto_nome || 'Sem nome',
            responsibleName: order.responsavel || currentUser?.name || 'A definir',
            urgency: order.urgencia || 'normal',
            osType: order.tipo_os || 'normal',
            status: order.status || 'pendente',
            photoType: order.tipo_foto || 'estudio',
            skus: order.skus || [],
            observations: order.observacoes || '',
            photosTaken: order.qtd_fotos || 0,
            editsMade: order.qtd_edicoes || 0,
            createdBy: order.criado_por || 'Sistema',
            createdAt: order.data_criacao ? new Date(order.data_criacao).toLocaleDateString('pt-BR') : 'N/D',
            updatedAt: order.ultima_atualizacao || order.data_criacao
        }));
        
        // Atualiza contador
        orderCounter = orders.length > 0 ? Math.max(...orders.map(o => parseInt(o.id))) + 1 : 1;
        
        // Atualiza interface
        updateCounters();
        renderOrdersTable();
        
        showToast(`✅ ${orders.length} ordens carregadas`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao carregar:', error);
        showToast('❌ Erro ao carregar ordens', 'error');
    } finally {
        reloadBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Recarregar';
        reloadBtn.disabled = false;
    }
}

// ============================================
// FUNÇÃO LIMPAR FORMULÁRIO
// ============================================
clearFormBtn.addEventListener('click', clearForm);

function clearForm() {
    document.getElementById('productName').value = '';
    document.getElementById('responsibleName').value = '';
    document.getElementById('urgency').value = 'normal';
    document.getElementById('osType').value = 'normal';
    document.getElementById('photoType').value = 'estudio';
    document.getElementById('skus').value = '';
    document.getElementById('observations').value = '';
    
    editingOrderId = null;
    formTitle.textContent = 'Nova Ordem de Serviço';
    submitBtnText.textContent = 'Salvar OS';
    cancelEditBtn.classList.add('hidden');
    
    generateOSCode();
}

// ============================================
// FUNÇÃO GERAR CÓDIGO
// ============================================
function generateOSCode() {
    const timestamp = Date.now().toString().slice(-4);
    const code = `OS${orderCounter.toString().padStart(4, '0')}-${timestamp}`;
    osCodeDisplay.textContent = `Código: ${code}`;
    return code;
}

// ============================================
// FUNÇÃO FILTRAR ORDENS POR USUÁRIO
// ============================================
function filterOrdersByUser(ordersList) {
    if (!currentUser) return [];
    
    return ordersList.filter(order => {
        // Verifica se o usuário atual é:
        // 1. O responsável pela OS
        // 2. O criador da OS
        const isResponsible = order.responsibleName.toLowerCase() === currentUser.name.toLowerCase();
        const isCreator = order.createdBy.toLowerCase() === currentUser.name.toLowerCase();
        
        return isResponsible || isCreator;
    });
}

// ============================================
// FUNÇÃO VERIFICAR PERMISSÃO
// ============================================
function checkOrderPermission(order) {
    if (!currentUser) return false;
    
    const isResponsible = order.responsibleName.toLowerCase() === currentUser.name.toLowerCase();
    const isCreator = order.createdBy.toLowerCase() === currentUser.name.toLowerCase();
    
    return isResponsible || isCreator;
}

// ============================================
// FUNÇÃO ATUALIZAR CONTADORES
// ============================================
function updateCounters() {
    // Todas as ordens do sistema
    const pending = orders.filter(o => o.status === 'pendente').length;
    const progress = orders.filter(o => o.status === 'andamento').length;
    const completed = orders.filter(o => o.status === 'concluida').length;
    const total = orders.length;
    
    // Ordens do usuário atual
    const userOrders = filterOrdersByUser(orders);
    const myPending = userOrders.filter(o => o.status === 'pendente').length;
    const myProgress = userOrders.filter(o => o.status === 'andamento').length;
    const myCompleted = userOrders.filter(o => o.status === 'concluida').length;
    const myTotal = userOrders.length;
    
    // Atualiza contadores
    countPending.textContent = myPending;
    countProgress.textContent = myProgress;
    countCompleted.textContent = myCompleted;
    countTotal.textContent = myTotal;
    
    // Atualiza contadores gerais
    myOrdersCount.textContent = myTotal;
    totalOrdersCount.textContent = total;
    
    // Mostra/oculta mensagem de vazio
    if (myTotal === 0) {
        emptyMessage.classList.remove('hidden');
        document.querySelector('.table-responsive').classList.add('hidden');
    } else {
        emptyMessage.classList.add('hidden');
        document.querySelector('.table-responsive').classList.remove('hidden');
    }
}

// ============================================
// FUNÇÃO RENDERIZAR TABELA
// ============================================
function renderOrdersTable() {
    osTableBody.innerHTML = '';
    
    // Primeiro filtra por usuário
    let userOrders = filterOrdersByUser(orders);
    
    // Depois aplica o filtro de status
    let filteredOrders = currentFilter === 'todos' ? userOrders : 
                         userOrders.filter(order => order.status === currentFilter);
    
    if (filteredOrders.length === 0) {
        osTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 40px;">
                    <i class="fas fa-user-lock fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma ordem disponível</h4>
                    <p style="color: #6c757d;">Você não tem permissão para visualizar ordens ou não há ordens com seu filtro atual.</p>
                    <p style="color: #6c757d; font-size: 12px; margin-top: 10px;">
                        <i class="fas fa-info-circle"></i>
                        Você só vê ordens onde é <strong>responsável</strong> ou <strong>criador</strong>
                    </p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Ordena por data
    filteredOrders.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    
    // Renderiza
    filteredOrders.forEach(order => {
        const row = document.createElement('tr');
        
        // Verifica permissão para ações
        const hasPermission = checkOrderPermission(order);
        
        // Estilo por urgência e tipo
        if (order.osType === 'devolucao') {
            row.className = 'return-highlight';
        } else if (order.urgency === 'alta') {
            row.className = 'urgent-high';
        } else if (order.urgency === 'normal') {
            row.className = 'urgent-medium';
        } else {
            row.className = 'urgent-low';
        }
        
        // Adiciona indicador de permissão
        let permissionBadge = '';
        if (order.responsibleName.toLowerCase() === currentUser.name.toLowerCase()) {
            permissionBadge = '<span class="badge badge-primary" style="margin-left: 5px;"><i class="fas fa-user-check"></i> Responsável</span>';
        } else if (order.createdBy.toLowerCase() === currentUser.name.toLowerCase()) {
            permissionBadge = '<span class="badge badge-info" style="margin-left: 5px;"><i class="fas fa-user-edit"></i> Criador</span>';
        }
        
        // Badge do tipo
        let typeBadge = '';
        if (order.osType === 'devolucao') {
            typeBadge = '<span class="badge badge-danger" style="margin-left: 5px;"><i class="fas fa-exchange-alt"></i> Devolução</span>';
        }
        
        // Badge de urgência
        let urgencyBadge = '';
        if (order.urgency === 'alta') {
            urgencyBadge = '<span class="badge badge-danger">Alta</span>';
        } else if (order.urgency === 'normal') {
            urgencyBadge = '<span class="badge badge-warning">Normal</span>';
        } else {
            urgencyBadge = '<span class="badge badge-success">Baixa</span>';
        }
        
        // Badge de status
        let statusBadge = '';
        if (order.status === 'pendente') {
            statusBadge = '<span class="status-pending">Pendente</span>';
        } else if (order.status === 'andamento') {
            statusBadge = '<span class="status-progress">Em Andamento</span>';
        } else {
            statusBadge = '<span class="status-completed">Concluída</span>';
        }
        
        // Botões de ação (apenas se tiver permissão)
        let actionButtons = '';
        if (hasPermission) {
            if (order.status === 'pendente') {
                actionButtons = `<button class="btn btn-success btn-sm" onclick="startOrder('${order.id}')"><i class="fas fa-play"></i></button>`;
            } else if (order.status === 'andamento') {
                actionButtons = `<button class="btn btn-info btn-sm" onclick="openCompleteModal('${order.id}')"><i class="fas fa-flag-checkered"></i></button>`;
            }
            
            actionButtons += `
                <button class="btn btn-warning btn-sm" onclick="editOrder('${order.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteOrderPrompt('${order.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            actionButtons = '<span class="badge badge-secondary">Sem permissão</span>';
        }
        
        row.innerHTML = `
            <td>
                <strong>${order.code}</strong>
                ${permissionBadge}
                ${typeBadge}
            </td>
            <td>${order.productName}</td>
            <td>
                ${order.responsibleName}
                ${order.responsibleName.toLowerCase() === currentUser.name.toLowerCase() ? 
                  '<i class="fas fa-user-check" style="color: var(--primary); margin-left: 5px;"></i>' : ''}
            </td>
            <td>${urgencyBadge}</td>
            <td>${statusBadge}</td>
            <td>${order.createdAt}</td>
            <td>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="viewOrder('${order.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${actionButtons}
                </div>
            </td>
        `;
        
        osTableBody.appendChild(row);
    });
}

// ============================================
// FUNÇÕES DE AÇÃO
// ============================================
function filterOS(filter) {
    currentFilter = filter;
    renderOrdersTable();
}

function viewOrder(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order) {
        let message = `📋 Detalhes da OS:\n\n`;
        message += `🏷️ Código: ${order.code}\n`;
        message += `📦 Produto: ${order.productName}\n`;
        message += `👤 Responsável: ${order.responsibleName}\n`;
        message += `👤 Criado por: ${order.createdBy}\n`;
        message += `⚠️ Urgência: ${order.urgency}\n`;
        message += `📌 Tipo: ${order.osType}\n`;
        message += `📷 Tipo de Foto: ${order.photoType}\n`;
        message += `📊 Status: ${order.status}\n`;
        message += `📸 Fotos tiradas: ${order.photosTaken}\n`;
        message += `✏️ Edições realizadas: ${order.editsMade}\n`;
        message += `📅 Criado em: ${order.createdAt}\n`;
        
        if (order.skus && order.skus.length > 0) {
            message += `🏷️ SKUs: ${order.skus.join(', ')}\n`;
        }
        
        if (order.observations) {
            message += `📝 Observações: ${order.observations}\n`;
        }
        
        alert(message);
    }
}

function editOrder(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order)) {
        editingOrderId = orderId;
        
        document.getElementById('productName').value = order.productName;
        document.getElementById('responsibleName').value = order.responsibleName;
        document.getElementById('urgency').value = order.urgency;
        document.getElementById('osType').value = order.osType;
        document.getElementById('photoType').value = order.photoType;
        document.getElementById('skus').value = order.skus.join(', ');
        document.getElementById('observations').value = order.observations;
        
        formTitle.textContent = `Editando: ${order.code}`;
        submitBtnText.textContent = 'Atualizar OS';
        cancelEditBtn.classList.remove('hidden');
        osCodeDisplay.textContent = `Código: ${order.code}`;
        
        showToast(`✏️ Editando OS: ${order.code}`, 'info');
    } else {
        showToast('⚠️ Você não tem permissão para editar esta OS', 'warning');
    }
}

cancelEditBtn.addEventListener('click', function() {
    editingOrderId = null;
    formTitle.textContent = 'Nova Ordem de Serviço';
    submitBtnText.textContent = 'Salvar OS';
    cancelEditBtn.classList.add('hidden');
    clearForm();
    showToast('❌ Edição cancelada', 'info');
});

// ============================================
// FUNÇÕES DE STATUS
// ============================================
async function startOrder(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order) && confirm(`Iniciar a OS "${order.productName}"?`)) {
        try {
            const { error } = await supabase
                .from('ordens_servico')
                .update({ 
                    status: 'andamento',
                    ultima_atualizacao: new Date().toISOString()
                })
                .eq('id', orderId);
            
            if (error) throw error;
            
            order.status = 'andamento';
            updateCounters();
            renderOrdersTable();
            showToast(`✅ OS "${order.productName}" iniciada`, 'success');
        } catch (error) {
            showToast('❌ Erro ao iniciar OS', 'error');
        }
    } else if (!checkOrderPermission(order)) {
        showToast('⚠️ Você não tem permissão para iniciar esta OS', 'warning');
    }
}

function openCompleteModal(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order)) {
        completeOSId.value = orderId;
        document.getElementById('photosTaken').value = order.photosTaken || 0;
        document.getElementById('editsMade').value = order.editsMade || 0;
        completeModal.classList.remove('hidden');
    } else if (!checkOrderPermission(order)) {
        showToast('⚠️ Você não tem permissão para finalizar esta OS', 'warning');
    }
}

function closeCompleteModal() {
    completeModal.classList.add('hidden');
    document.getElementById('photosTaken').value = 0;
    document.getElementById('editsMade').value = 0;
}

finalizarOSBtn.addEventListener('click', async function() {
    const orderId = completeOSId.value;
    const order = orders.find(o => o.id == orderId);
    
    if (!order || !checkOrderPermission(order)) {
        showToast('⚠️ Você não tem permissão para finalizar esta OS', 'warning');
        return;
    }
    
    const photosTaken = parseInt(document.getElementById('photosTaken').value) || 0;
    const editsMade = parseInt(document.getElementById('editsMade').value) || 0;
    
    try {
        const { error } = await supabase
            .from('ordens_servico')
            .update({ 
                status: 'concluida',
                qtd_fotos: photosTaken,
                qtd_edicoes: editsMade,
                data_conclusao: new Date().toISOString(),
                ultima_atualizacao: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        order.status = 'concluida';
        order.photosTaken = photosTaken;
        order.editsMade = editsMade;
        
        updateCounters();
        renderOrdersTable();
        closeCompleteModal();
        showToast(`✅ OS finalizada`, 'success');
    } catch (error) {
        showToast('❌ Erro ao finalizar OS', 'error');
    }
});

async function deleteOrderPrompt(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order) && confirm(`Excluir a OS "${order.productName}"?`)) {
        try {
            const { error } = await supabase
                .from('ordens_servico')
                .delete()
                .eq('id', orderId);
            
            if (error) throw error;
            
            orders = orders.filter(o => o.id != orderId);
            updateCounters();
            renderOrdersTable();
            showToast(`🗑️ OS "${order.productName}" excluída`, 'success');
        } catch (error) {
            showToast('❌ Erro ao excluir OS', 'error');
        }
    } else if (!checkOrderPermission(order)) {
        showToast('⚠️ Você não tem permissão para excluir esta OS', 'warning');
    }
}

// ============================================
// FUNÇÃO DE NOTIFICAÇÃO
// ============================================
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                          type === 'error' ? 'exclamation-circle' : 
                          type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// EVENT LISTENERS
// ============================================
testSupabaseBtn.addEventListener('click', testSupabaseConnection);
reloadBtn.addEventListener('click', loadOrders);

completeModal.addEventListener('click', function(e) {
    if (e.target === completeModal) closeCompleteModal();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !completeModal.classList.contains('hidden')) {
        closeCompleteModal();
    }
});

// ============================================
// INICIALIZAÇÃO
// ============================================
console.log('🚀 Sistema OS Fotografia iniciado!');

// Gera código inicial
generateOSCode();