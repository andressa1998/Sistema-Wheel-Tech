// ============================================
// SISTEMA OS FOTOGRAFIA - VERSÃO COMPLETA COM FOTOS
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

// ===== VARIÁVEIS PARA FOTOS =====
let selectedPhotos = [];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTOS_PER_OS = 10;

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
    { username: 'thalyta', password: '300377', name: 'Thalyta', avatar: 'T', role: 'Assistente 3' }
];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');
    
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
                thumbnail: createThumbnail(e.target.result)
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
        
        photoElement.innerHTML = `
            <img src="${photo.thumbnail || photo.data}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer;"
                 onclick="removePhoto(${index})">
                ×
            </div>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 3px 5px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${photo.name}
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
        selectedPhotos = [];
        
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
                code: order.codigo || `OS-${order.id.toString().padStart(4, '0')}`,
                productName: order.produto_nome || 'Sem nome',
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
                dataConferencia: order.data_conferencia || null
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
// FUNÇÃO SALVAR OS (ATUALIZADA COM FOTOS)
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
        photos: selectedPhotos, // ← FOTOS ADICIONADAS AQUI
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

async function saveOrderToSupabase(order) {
    try {
        // Preparar fotos para salvar
        let fotosParaSalvar = [];
        if (order.photos && order.photos.length > 0) {
            fotosParaSalvar = order.photos.map(photo => ({
                name: photo.name,
                size: photo.size,
                type: photo.type,
                data: photo.data
            }));
        }
        
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
            fotos: fotosParaSalvar,
            qtd_fotos: order.photosTaken,
            qtd_edicoes: order.editsMade,
            // NOVOS CAMPOS PARA CONFERÊNCIA
            conferido: order.conferido || false,
            conferido_por: order.conferidoPor || null,
            data_conferencia: order.dataConferencia || null,
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

/// ============================================
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
    
    // Administrador tem permissão para TUDO
    if (currentUser.role === 'Administrador') {
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
}


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
        if (skusInput) skusInput.value = Array.isArray(order.skus) ? order.skus.join(', ') : order.skus;
        if (observationsInput) observationsInput.value = order.observations;
        
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
        
        photoElement.innerHTML = `
            <img src="${photo.data || photo.thumbnail}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 180px; object-fit: cover;"
                 onclick="viewFullPhoto(${index}, ${JSON.stringify(photos).replace(/"/g, '&quot;')})">
            <div style="padding: 10px; background: white;">
                <div style="font-size: 12px; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${photo.name}
                </div>
                <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                    ${formatFileSize(photo.size)}
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
                
                ${photosSection}
                
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
        const photoTypeMap = { 'estudio': 'Estúdio', 'bike': 'Na Bike', 'ambos': 'Ambos', 'Apenas edição': 'Apenas edição' };
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
        'ambos': 'Ambos'
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
                    
                    ${order.skus && order.skus.length > 0 ? `
                    <div class="info-item">
                        <div class="info-label">SKUs</div>
                        <div class="info-value">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${Array.isArray(order.skus) ? order.skus.map(sku => `
                                    <span style="background: #e9ecef; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                        ${sku}
                                    </span>
                                `).join('') : order.skus}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="info-item">
                        <div class="info-label">Tipo de Foto</div>
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
                                ${photo.name}
                            </div>
                            <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                                ${formatFileSize(photo.size)}
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
                <div>${formatFileSize(photo.size)} • Foto ${photoIndex + 1} de ${photos.length}</div>
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

console.log('✅ Script carregado com sucesso!');