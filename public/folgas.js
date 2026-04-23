// ============================================
// SISTEMA DE CALENDÁRIO DE FOLGAS
// ============================================

let folgas = [];
let currentSolicitacaoId = null;
let calendario = null;
let fullCalendarLoaded = false;

// Função para carregar o FullCalendar dinamicamente
function carregarFullCalendar(callback) {
    if (typeof FullCalendar !== 'undefined') {
        callback();
        return;
    }
    
    // Carregar CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/main.min.css';
    document.head.appendChild(link);
    
    // Carregar JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js';
    script.onload = callback;
    script.onerror = () => {
        console.error('Erro ao carregar FullCalendar');
        showToast('Erro ao carregar calendário', 'error');
    };
    document.head.appendChild(script);
}

// Inicializar calendário
function initCalendario() {
    const calendarEl = document.getElementById('folgasCalendario');
    if (!calendarEl) return;
    
    // Limpar conteúdo anterior
    calendarEl.innerHTML = '';
    
    calendario = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        timeZone: 'local',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek'
        },
        buttonText: {
            today: 'hoje',
            month: 'mês',
            week: 'semana',
            day: 'dia'
        },
        events: [],
        eventClick: function(info) {
            if (currentUser && currentUser.role === 'Administrador') {
                showToast(`Folga de ${info.event.title}`, 'info');
            }
        }
    });
    calendario.render();
    fullCalendarLoaded = true;
}

// Função para abrir o sistema
window.abrirSistemaFolgas = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    const folgasSystem = document.getElementById('folgasSystem');
    if (folgasSystem) folgasSystem.classList.remove('hidden');
    
    // Atualizar dados do usuário na aba
    document.getElementById('folgasUserAvatar').textContent = currentUser.avatar || currentUser.name.charAt(0).toUpperCase();
    document.getElementById('folgasUserName').textContent = currentUser.name;
    document.getElementById('folgasUserRole').textContent = currentUser.role;
    
    // Mostrar painel de pendentes apenas para admin
    const painelPendentes = document.getElementById('painelPendentes');
    if (painelPendentes) {
        if (currentUser.role === 'Administrador') {
            painelPendentes.classList.remove('hidden');
        } else {
            painelPendentes.classList.add('hidden');
        }
    }
    
    // Carregar FullCalendar e dados
    carregarFullCalendar(() => {
        if (!calendario) {
            initCalendario();
        }
        carregarFolgas();
    });
};

async function carregarFolgas() {
    try {
        // Tenta obter o cliente de diferentes formas
        const client = supabaseClient || window.supabaseClient;
        if (!client) {
            showToast('Erro de conexão com o banco de dados', 'error');
            return;
        }
        
        const { data, error } = await client
            .from('folgas')
            .select('*')
            .order('data_inicio', { ascending: true });
        
        if (error) throw error;
        
        folgas = data || [];
        atualizarCalendario();
        
        if (currentUser && currentUser.role === 'Administrador') {
            carregarSolicitacoesPendentes();
        }
        
    } catch (error) {
        console.error('Erro ao carregar folgas:', error);
        showToast('Erro ao carregar folgas: ' + error.message, 'error');
    }
}

// Atualizar eventos no calendário
function atualizarCalendario() {
    if (!calendario) return;
    
    const eventos = folgas
        .filter(f => f.status === 'aprovado')
        .map(f => {
            let tipoDisplay = '';
            switch (f.tipo) {
                case 'dia_inteiro': tipoDisplay = 'Dia inteiro'; break;
                case 'manha': tipoDisplay = 'Manhã'; break;
                case 'tarde': tipoDisplay = 'Tarde'; break;
                default: tipoDisplay = f.tipo;
            }
            
            let cor = '#28a745';
            if (f.tipo === 'manha') cor = '#ffc107';
            if (f.tipo === 'tarde') cor = '#17a2b8';
            
            // 🔧 Converte a string "YYYY-MM-DD" para Date no fuso local
            const [year, month, day] = f.data_inicio.split('-');
            const dataLocal = new Date(year, month - 1, day); // sem UTC
            
            return {
                id: f.id,
                title: `${f.user_name} - ${tipoDisplay}`,
                start: dataLocal,
                end: dataLocal,       // ou null se for apenas um dia
                color: cor,
                extendedProps: f
            };
        });
    
    calendario.removeAllEvents();
    calendario.addEventSource(eventos);
}

// Formata string YYYY-MM-DD para DD/MM/YYYY sem fuso horário
function formatarDataLocal(dataStr) {
    if (!dataStr) return '-';
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

// Carregar solicitações pendentes (admin)
async function carregarSolicitacoesPendentes() {
    try {
        const { data, error } = await supabaseClient
            .from('folgas')
            .select('*')
            .eq('status', 'pendente')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const tbody = document.getElementById('solicitacoesBody');
        const contador = document.getElementById('contadorPendentes');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Nenhuma solicitação pendente.</td></tr>';
            if (contador) contador.textContent = '0';
            return;
        }
        
        if (contador) contador.textContent = data.length;
        
        let html = '';
        data.forEach(sol => {
            const dataFormatada = formatarDataLocal(sol.data_inicio);
            const solicitadoEm = new Date(sol.created_at).toLocaleString('pt-BR');
            const tipoDisplay = sol.tipo === 'dia_inteiro' ? 'Dia inteiro' : (sol.tipo === 'manha' ? 'Manhã' : 'Tarde');
            html += `
                <tr>
                    <td>${sol.user_name}</td>
                    <td>${dataFormatada}</td>
                    <td>${tipoDisplay}</td>
                    <td>${sol.motivo || '-'}</td>
                    <td>${solicitadoEm}</td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="abrirModalAprovacao('${sol.id}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="rejeitarSolicitacao('${sol.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Erro ao carregar pendentes:', error);
    }
}

// Abrir modal para nova folga
window.abrirModalNovaFolga = function() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('folgaData').value = hoje;
    document.getElementById('folgaTipo').value = 'dia_inteiro';
    document.getElementById('folgaMotivo').value = '';
    document.getElementById('modalNovaFolga').classList.remove('hidden');
};

window.fecharModalNovaFolga = function() {
    document.getElementById('modalNovaFolga').classList.add('hidden');
};

// Salvar nova solicitação
document.getElementById('formNovaFolga')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = document.getElementById('folgaData').value;
    const tipo = document.getElementById('folgaTipo').value;
    const motivo = document.getElementById('folgaMotivo').value;
    
    if (!data || !tipo) return;
    
    const novaFolga = {
        user_id: currentUser.username || currentUser.name,
        user_name: currentUser.name,
        data_inicio: data,
        data_fim: data,
        tipo: tipo,
        motivo: motivo || null,
        status: currentUser.role === 'Administrador' ? 'aprovado' : 'pendente',
        created_at: new Date().toISOString()
    };
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner"></span> Enviando...';
    submitBtn.disabled = true;
    
    try {
        const { data: result, error } = await supabaseClient
            .from('folgas')
            .insert([novaFolga])
            .select();
        
        if (error) {
            console.error('Erro detalhado:', error);
            throw new Error(error.message);
        }
        
        showToast('Solicitação enviada com sucesso!', 'success');
        fecharModalNovaFolga();
        carregarFolgas();
        
    } catch (error) {
        console.error('Erro ao salvar folga:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

// Modal de aprovação
window.abrirModalAprovacao = function(id) {
    currentSolicitacaoId = id;
    const sol = folgas.find(f => f.id === id);
    if (!sol) return;
    
    const detalhes = document.getElementById('detalhesSolicitacao');
    const tipoDisplay = sol.tipo === 'dia_inteiro' ? 'Dia inteiro' : (sol.tipo === 'manha' ? 'Manhã' : 'Tarde');
    detalhes.innerHTML = `
        <p><strong>Usuário:</strong> ${sol.user_name}</p>
        <p><strong>Data:</strong> ${formatarDataLocal(sol.data_inicio)}</p>
        <p><strong>Tipo:</strong> ${tipoDisplay}</p>
        <p><strong>Motivo:</strong> ${sol.motivo || '-'}</p>
    `;
    document.getElementById('modalAprovacao').classList.remove('hidden');
};

window.fecharModalAprovacao = function() {
    document.getElementById('modalAprovacao').classList.add('hidden');
    currentSolicitacaoId = null;
};

window.aprovarSolicitacao = async function() {
    if (!currentSolicitacaoId) return;
    
    try {
        const { error } = await supabaseClient
            .from('folgas')
            .update({ 
                status: 'aprovado',
                aprovado_por: currentUser.name,
                data_aprovacao: new Date().toISOString()
            })
            .eq('id', currentSolicitacaoId);
        
        if (error) throw error;
        
        showToast('Solicitação aprovada!', 'success');
        fecharModalAprovacao();
        carregarFolgas();
        
    } catch (error) {
        console.error('Erro ao aprovar:', error);
        showToast('Erro ao aprovar', 'error');
    }
};

window.rejeitarSolicitacao = async function(id) {
    const solId = id || currentSolicitacaoId;
    if (!solId) return;
    
    if (!confirm('Tem certeza que deseja rejeitar esta solicitação?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('folgas')
            .update({ 
                status: 'rejeitado',
                aprovado_por: currentUser.name,
                data_aprovacao: new Date().toISOString()
            })
            .eq('id', solId);
        
        if (error) throw error;
        
        showToast('Solicitação rejeitada', 'info');
        fecharModalAprovacao();
        carregarFolgas();
        
    } catch (error) {
        console.error('Erro ao rejeitar:', error);
        showToast('Erro ao rejeitar', 'error');
    }
};