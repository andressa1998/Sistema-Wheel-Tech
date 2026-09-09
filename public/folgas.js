// ============================================
// SISTEMA DE CALENDÁRIO DE FOLGAS
// ============================================

let folgas = [];
let currentSolicitacaoId = null;
let calendario = null;
let fullCalendarLoaded = false;

// ===== VARIÁVEIS PARA ESCALA DE SÁBADOS =====
// Lista fixa de colaboradores (atualizada com os nomes da imagem)
const COLABORADORES_FIXOS = [
    'Arthur',
    'Bruna',
    'Thalyta',
    'Leticia',
    'Suelen',
    'Mirella'
];
let escalaMensal = {};          // { "2025-06-07": ["Elaine", "Arthur"], ... }
let mesAnoAtual = null;         // { ano, mes }

// ============================================
// FUNÇÕES DE CARREGAMENTO DO FULLCALENDAR
// ============================================

function carregarFullCalendar(callback) {
    if (typeof FullCalendar !== 'undefined') {
        callback();
        return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/main.min.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js';
    script.onload = callback;
    script.onerror = () => {
        console.error('Erro ao carregar FullCalendar');
        showToast('Erro ao carregar calendário', 'error');
    };
    document.head.appendChild(script);
}

function initCalendario() {
    const calendarEl = document.getElementById('folgasCalendario');
    if (!calendarEl) return;
    
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
            if (info.event.extendedProps?.origem === 'agenda') {
                abrirDetalhesAgenda(String(info.event.id).replace('agenda-', ''));
            } else if (currentUser && currentUser.role === 'Administrador') {
                showToast(`Folga de ${info.event.title}`, 'info');
            }
        }
    });
    calendario.render();
    fullCalendarLoaded = true;
}

// ============================================
// ABRIR SISTEMA DE FOLGAS (ATUALIZADO)
// ============================================

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
        painelPendentes.classList.toggle('hidden', currentUser.role !== 'Administrador');
    }
    
    // Carregar FullCalendar e dados
    carregarFullCalendar(() => {
        if (!calendario) initCalendario();
        carregarFolgas();
        carregarAgendaSemanal();
    });

    // ===== INICIALIZAR ESCALA DE SÁBADOS =====
    const inputMes = document.getElementById('escalaMesAno');
    if (inputMes) {
        const hoje = new Date();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const ano = hoje.getFullYear();
        inputMes.value = `${ano}-${mes}`;
    }

    // Configurar evento de mudança de mês
    if (inputMes) {
        inputMes.addEventListener('change', carregarEscalaMensal);
    }

    // Carregar a escala do mês atual
    carregarEscalaMensal();

    // Se não for admin, desabilitar edição (checkboxes readonly)
    if (currentUser.role !== 'Administrador') {
        document.querySelectorAll('#escalaSabadosCard .btn-success, #escalaSabadosCard .btn-primary')
            .forEach(el => el.style.display = 'none');
    }
};

// ============================================
// FUNÇÕES DE FOLGAS (CRUD)
// ============================================

async function carregarFolgas() {
    try {
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
            
            const [year, month, day] = f.data_inicio.split('-');
            const dataLocal = new Date(year, month - 1, day);
            
            return {
                id: f.id,
                title: `${f.user_name} - ${tipoDisplay}`,
                start: dataLocal,
                end: dataLocal,
                color: cor,
                extendedProps: f
            };
        });
    
    calendario.removeAllEvents();
    calendario.addEventSource(eventos);
}

function formatarDataLocal(dataStr) {
    if (!dataStr) return '-';
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

// ============================================
// SOLICITAÇÕES PENDENTES (ADMIN)
// ============================================

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

// ============================================
// MODAL NOVA FOLGA
// ============================================

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

// ============================================
// MODAL APROVAÇÃO
// ============================================

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

// ============================================
// ===== ESCALA DE SÁBADOS (MÓDULO VISUAL COLORIDO) =====
// ============================================

// 1. Listar sábados de um mês
function listarSabadosDoMes(ano, mes) {
    const datas = [];
    const primeiroDia = new Date(ano, mes - 1, 1);
    const ultimoDia = new Date(ano, mes, 0);
    const diaAtual = new Date(primeiroDia);

    while (diaAtual.getDay() !== 6) {
        diaAtual.setDate(diaAtual.getDate() + 1);
    }

    while (diaAtual <= ultimoDia) {
        datas.push(diaAtual.toISOString().split('T')[0]);
        diaAtual.setDate(diaAtual.getDate() + 7);
    }
    return datas;
}

// 2. Carregar escala mensal e renderizar tabela
async function carregarEscalaMensal() {
    const inputMes = document.getElementById('escalaMesAno');
    if (!inputMes || !inputMes.value) {
        showToast('Selecione um mês.', 'warning');
        return;
    }

    const [ano, mes] = inputMes.value.split('-').map(Number);
    mesAnoAtual = { ano, mes };

    const sabados = listarSabadosDoMes(ano, mes);
    if (sabados.length === 0) {
        document.getElementById('escalaSabadosContainer').innerHTML = 
            '<p class="text-muted">Nenhum sábado neste mês.</p>';
        return;
    }

    // Buscar escala salva no banco
    const { data, error } = await supabaseClient
        .from('escala_sabados')
        .select('data_sabado, colaborador')
        .in('data_sabado', sabados);

    if (error) throw error;

    // Montar objeto escalaMensal: { data: [colaborador1, colaborador2, ...] }
    escalaMensal = {};
    sabados.forEach(d => escalaMensal[d] = []);
    data.forEach(row => {
        if (escalaMensal[row.data_sabado]) {
            escalaMensal[row.data_sabado].push(row.colaborador);
        }
    });

    // Renderizar tabela
    renderizarTabelaEscala(sabados);
}

// 3. Renderizar tabela colorida
function renderizarTabelaEscala(sabados) {
    const container = document.getElementById('escalaSabadosContainer');
    if (!container) return;

    const isAdmin = currentUser.role === 'Administrador';

    // Início da tabela
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover" style="background: white;">
                <thead class="table-dark">
                    <tr>
                        <th style="background: #4B0082; color: white;">Sábado</th>
    `;
    COLABORADORES_FIXOS.forEach(col => {
        html += `<th class="text-center" style="background: #6A0DAD; color: white; font-weight: 600;">${col}</th>`;
    });
    html += `</tr></thead><tbody>`;

    // Linhas para cada sábado
    sabados.forEach((data, index) => {
        const dataFormatada = formatarDataLocal(data);
        const colaboradoresDoDia = escalaMensal[data] || [];
        // Fundo zebrado suave
        const bgRow = index % 2 === 0 ? '#f8f9fa' : '#ffffff';
        html += `<tr style="background-color: ${bgRow};">`;
        html += `<td><strong>${dataFormatada}</strong></td>`;

        COLABORADORES_FIXOS.forEach(col => {
            const marcado = colaboradoresDoDia.includes(col);
            // Cor de fundo da célula: verde claro se marcado
            const bgColor = marcado ? '#b7e4c7' : 'transparent';
            const borderColor = marcado ? '#2d6a4f' : '#dee2e6';
            
            if (isAdmin) {
                // Para admin: checkbox com fundo colorido
                html += `
                    <td class="text-center" style="background-color: ${bgColor}; border: 1px solid ${borderColor};">
                        <input type="checkbox" class="escala-checkbox" 
                               data-data="${data}" data-colaborador="${col}" 
                               ${marcado ? 'checked' : ''} 
                               style="transform: scale(1.2); cursor: pointer;" />
                    </td>
                `;
            } else {
                // Para visualização: círculo verde ou vazio
                const icon = marcado ? '✅' : '⬜';
                const corIcon = marcado ? '#2d6a4f' : '#ced4da';
                html += `
                    <td class="text-center" style="background-color: ${bgColor}; border: 1px solid ${borderColor}; font-size: 1.2rem;">
                        <span style="color: ${corIcon};">${icon}</span>
                    </td>
                `;
            }
        });
        html += '</tr>';
    });

    html += `</tbody></table></div>`;

    // Legenda e mensagem
    if (!isAdmin) {
        html += `
            <div class="mt-3 p-2 bg-light rounded">
                <p class="text-muted mb-0">
                    <i class="fas fa-info-circle"></i> 
                    <strong>Legenda:</strong> 
                    <span style="color: #2d6a4f;">✅</span> Colaborador escalado &nbsp;|&nbsp; 
                    <span style="color: #ced4da;">⬜</span> Não escalado
                </p>
            </div>
        `;
    } else {
        html += `
            <div class="mt-2 text-muted">
                <i class="fas fa-edit"></i> Marque/desmarque os colaboradores para cada sábado.
            </div>
        `;
    }

    container.innerHTML = html;
}

// 4. Salvar escala mensal (deleta e reinsere)
async function salvarEscalaMensal() {
    if (!mesAnoAtual) {
        showToast('Carregue um mês primeiro.', 'warning');
        return;
    }

    // Coletar todos os checkboxes
    const checkboxes = document.querySelectorAll('.escala-checkbox');
    const novosDados = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            novosDados.push({
                data_sabado: cb.dataset.data,
                colaborador: cb.dataset.colaborador
            });
        }
    });

    const sabados = listarSabadosDoMes(mesAnoAtual.ano, mesAnoAtual.mes);

    try {
        // Deletar registros existentes do mês
        const { error: delError } = await supabaseClient
            .from('escala_sabados')
            .delete()
            .in('data_sabado', sabados);
        if (delError) throw delError;

        // Inserir novos
        if (novosDados.length > 0) {
            const { error: insError } = await supabaseClient
                .from('escala_sabados')
                .insert(novosDados);
            if (insError) throw insError;
        }

        // Atualizar objeto local
        escalaMensal = {};
        sabados.forEach(d => escalaMensal[d] = []);
        novosDados.forEach(item => {
            if (escalaMensal[item.data_sabado]) {
                escalaMensal[item.data_sabado].push(item.colaborador);
            }
        });

        // Re-renderizar
        renderizarTabelaEscala(sabados);
        showToast('Escala salva com sucesso!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// 5. EXPOR FUNÇÕES PARA USO NO HTML
window.carregarEscalaMensal = carregarEscalaMensal;
window.salvarEscalaMensal = salvarEscalaMensal;

// ===== AGENDA SEMANAL: REUNIÕES, RECADOS E TAREFAS =====
let agendaEventos = [], agendaSemanaBase = new Date(), agendaEventoAtualId = null;
const AGENDA_TIPOS = { reuniao:'Reunião', tarefa:'Tarefa', recado:'Recado', evento:'Evento', feriado:'Feriado', outro:'Outro' };
const agendaEhAdmin = () => !!currentUser && currentUser.role === 'Administrador';
const agendaEscape = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const agendaDataISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function agendaInicioSemana(d=new Date()){ const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()), dia=x.getDay(); x.setDate(x.getDate()-(dia===0?6:dia-1)); return x; }
function agendaFimSemana(i){ const x=new Date(i); x.setDate(x.getDate()+5); return x; }

async function carregarAgendaSemanal(){
    const grid=document.getElementById('agendaSemanalGrid'); if(!grid)return;
    document.querySelectorAll('.agenda-admin-only').forEach(el=>el.classList.toggle('hidden',!agendaEhAdmin()));
    const ini=agendaInicioSemana(agendaSemanaBase), fim=agendaFimSemana(ini);
    try{
        const {data,error}=await supabaseClient.from('agenda_eventos').select('*').lte('data_inicio',agendaDataISO(fim)).gte('data_fim',agendaDataISO(ini)).order('data_inicio',{ascending:true}).order('hora_inicio',{ascending:true});
        if(error)throw error; agendaEventos=data||[]; renderizarAgendaSemanal(); atualizarCalendario();
    }catch(error){ console.error('Erro ao carregar agenda:',error); grid.innerHTML='<div class="agenda-empty">Não foi possível carregar a agenda. Execute primeiro o arquivo SQL enviado.</div>'; }
}
function renderizarAgendaSemanal(){
    const grid=document.getElementById('agendaSemanalGrid'), label=document.getElementById('agendaSemanaLabel'); if(!grid)return;
    const ini=agendaInicioSemana(agendaSemanaBase), fim=agendaFimSemana(ini), hoje=agendaDataISO(new Date()); if(label)label.textContent=`${ini.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}`;
    let html=''; for(let i=0;i<6;i++){ const d=new Date(ini); d.setDate(ini.getDate()+i); const iso=agendaDataISO(d), itens=agendaEventos.filter(e=>e.data_inicio<=iso&&(e.data_fim||e.data_inicio)>=iso);
        html+=`<section class="agenda-day ${iso===hoje?'today':''}"><div class="agenda-day-head">${d.toLocaleDateString('pt-BR',{weekday:'long'})}<span>${d.toLocaleDateString('pt-BR')}</span></div><div class="agenda-items">`;
        html+=itens.length?itens.map(e=>{ const hora=e.dia_inteiro?'Dia inteiro':([e.hora_inicio?.slice(0,5),e.hora_fim?.slice(0,5)].filter(Boolean).join(' às ')||'Sem horário'), extra=[hora,e.responsavel].filter(Boolean).join(' • '); return `<div class="agenda-item" style="--agenda-cor:${agendaEscape(e.cor||'#0875ee')};${e.destaque?'background:#fff8dc;':''}" onclick="abrirDetalhesAgenda('${e.id}')"><strong>${agendaEscape(e.titulo)}</strong><small>${agendaEscape(AGENDA_TIPOS[e.tipo]||e.tipo)} • ${agendaEscape(extra)}</small></div>`;}).join(''):'<div class="agenda-empty">Sem itens</div>'; html+='</div></section>';
    } grid.innerHTML=html;
}
window.mudarSemanaAgenda=d=>{agendaSemanaBase.setDate(agendaSemanaBase.getDate()+Number(d)*7);carregarAgendaSemanal();};
window.irSemanaAtualAgenda=()=>{agendaSemanaBase=new Date();carregarAgendaSemanal();};
window.abrirModalAgenda=function(ev=null){
    if(!agendaEhAdmin()){showToast('Somente administradores podem editar a agenda.','warning');return;} const x=ev||{}, hoje=agendaDataISO(new Date());
    const campos={agendaId:x.id||'',agendaTitulo:x.titulo||'',agendaTipo:x.tipo||'reuniao',agendaResponsavel:x.responsavel||'',agendaDataInicio:x.data_inicio||hoje,agendaDataFim:x.data_fim||x.data_inicio||hoje,agendaHoraInicio:x.hora_inicio?.slice(0,5)||'',agendaHoraFim:x.hora_fim?.slice(0,5)||'',agendaParticipantes:x.participantes||'',agendaDescricao:x.descricao||'',agendaCor:x.cor||'#0875ee'};
    Object.entries(campos).forEach(([id,v])=>document.getElementById(id).value=v); document.getElementById('agendaDiaInteiro').checked=!!x.dia_inteiro; document.getElementById('agendaDestaque').checked=!!x.destaque;
    document.getElementById('agendaModalTitulo').innerHTML=`<i class="fas fa-calendar-plus"></i> ${x.id?'Editar item da agenda':'Novo item da agenda'}`; document.getElementById('modalAgenda').classList.remove('hidden');
};
window.fecharModalAgenda=()=>document.getElementById('modalAgenda')?.classList.add('hidden');
document.getElementById('agendaDiaInteiro')?.addEventListener('change',e=>document.querySelectorAll('.agenda-time-field').forEach(el=>el.style.opacity=e.target.checked?'.45':'1'));
document.getElementById('formAgenda')?.addEventListener('submit',async e=>{
    e.preventDefault(); if(!agendaEhAdmin())return; const id=document.getElementById('agendaId').value, inicio=document.getElementById('agendaDataInicio').value, fim=document.getElementById('agendaDataFim').value||inicio;
    if(fim<inicio){showToast('A data final não pode ser anterior à inicial.','warning');return;} const inteiro=document.getElementById('agendaDiaInteiro').checked;
    const r={titulo:document.getElementById('agendaTitulo').value.trim(),tipo:document.getElementById('agendaTipo').value,responsavel:document.getElementById('agendaResponsavel').value.trim()||null,data_inicio:inicio,data_fim:fim,hora_inicio:inteiro?null:document.getElementById('agendaHoraInicio').value||null,hora_fim:inteiro?null:document.getElementById('agendaHoraFim').value||null,participantes:document.getElementById('agendaParticipantes').value.trim()||null,descricao:document.getElementById('agendaDescricao').value.trim()||null,cor:document.getElementById('agendaCor').value,dia_inteiro:inteiro,destaque:document.getElementById('agendaDestaque').checked,criado_por:currentUser.username||currentUser.name,atualizado_em:new Date().toISOString()};
    const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true; try{const q=id?supabaseClient.from('agenda_eventos').update(r).eq('id',id):supabaseClient.from('agenda_eventos').insert([{...r,criado_em:new Date().toISOString()}]);const {error}=await q;if(error)throw error;showToast(id?'Item atualizado!':'Item adicionado à agenda!','success');fecharModalAgenda();await carregarAgendaSemanal();window.carregarDashboardWheelTech?.();}catch(error){showToast('Erro ao salvar agenda: '+error.message,'error');}finally{btn.disabled=false;}
});
window.abrirDetalhesAgenda=function(id){agendaEventoAtualId=id;const e=agendaEventos.find(x=>String(x.id)===String(id));if(!e)return;const h=e.dia_inteiro?'Dia inteiro':([e.hora_inicio?.slice(0,5),e.hora_fim?.slice(0,5)].filter(Boolean).join(' às ')||'Sem horário');document.getElementById('agendaDetalhesConteudo').innerHTML=`<h3 style="color:${agendaEscape(e.cor||'#0875ee')}">${agendaEscape(e.titulo)}</h3><p><strong>Tipo:</strong> ${agendaEscape(AGENDA_TIPOS[e.tipo]||e.tipo)}</p><p><strong>Data:</strong> ${formatarDataLocal(e.data_inicio)}${e.data_fim!==e.data_inicio?' até '+formatarDataLocal(e.data_fim):''}</p><p><strong>Horário:</strong> ${agendaEscape(h)}</p><p><strong>Responsável:</strong> ${agendaEscape(e.responsavel||'-')}</p><p><strong>Participantes:</strong> ${agendaEscape(e.participantes||'-')}</p><p><strong>Descrição:</strong> ${agendaEscape(e.descricao||'-')}</p>`;document.getElementById('agendaDetalhesAcoes')?.classList.toggle('hidden',!agendaEhAdmin());document.getElementById('modalDetalhesAgenda').classList.remove('hidden');};
window.fecharDetalhesAgenda=()=>{document.getElementById('modalDetalhesAgenda')?.classList.add('hidden');agendaEventoAtualId=null;};
window.editarEventoAgendaAtual=()=>{const x=agendaEventos.find(e=>String(e.id)===String(agendaEventoAtualId));if(x){fecharDetalhesAgenda();abrirModalAgenda(x);}};
window.excluirEventoAgendaAtual=async()=>{if(!agendaEhAdmin()||!agendaEventoAtualId||!confirm('Excluir este item da agenda?'))return;const {error}=await supabaseClient.from('agenda_eventos').delete().eq('id',agendaEventoAtualId);if(error){showToast('Erro ao excluir: '+error.message,'error');return;}fecharDetalhesAgenda();showToast('Item excluído.','success');await carregarAgendaSemanal();window.carregarDashboardWheelTech?.();};

const atualizarCalendarioFolgas=atualizarCalendario;
atualizarCalendario=function(){atualizarCalendarioFolgas();if(!calendario)return;calendario.addEventSource(agendaEventos.map(e=>({id:`agenda-${e.id}`,title:`${AGENDA_TIPOS[e.tipo]||'Agenda'}: ${e.titulo}`,start:e.data_inicio+(e.hora_inicio&&!e.dia_inteiro?`T${e.hora_inicio}`:''),end:e.data_fim||e.data_inicio,allDay:!!e.dia_inteiro,color:e.cor||'#0875ee',extendedProps:{...e,origem:'agenda'}})));};
window.carregarAgendaSemanal=carregarAgendaSemanal;

// ============================================
// FIM DO ARQUIVO folgas.js
// ============================================
