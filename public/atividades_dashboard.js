// ============================================
// PAINEL "MINHAS TAREFAS DE HOJE" — MENU INICIAL
// ============================================
// Não é um sistema novo: lê direto da tabela do
// módulo já existente "Controle de Atividades"
// (atividades_colaboradores / atividades.js), que
// já tem designação por admin, frequência diária/
// semanal/mensal e prorrogação automática de
// atrasadas. Este arquivo só decide o que mostrar
// HOJE no menu inicial e oferece o botão de marcar
// concluída direto por ali, sem duplicar o módulo.
//
// Regras de visibilidade (confirmadas com o usuário):
// - Diária: some quando concluída; se não for feita,
//   continua aparecendo nos dias seguintes (atrasada).
// - Semanal/Mensal: é recorrente — aparece TODO dia
//   dentro do prazo (ou só nos dias marcados, se a
//   pessoa escolheu dias específicos da semana).
//   Marcar como feita só vale para hoje: a conclusão
//   fica em atividades_conclusoes_dia, então amanhã a
//   tarefa volta a pedir ação de novo, até vencer o
//   prazo — igual ao Controle de Atividades.
// ============================================

const APH_TABELA_CONCLUSOES = 'atividades_conclusoes_dia';

function aphHojeISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}

function aphFormatarData(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function aphEhAdmin() {
    return (window.currentUser?.role || '').trim() === 'Administrador';
}

function aphEscapar(valor) {
    return String(valor ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function aphDiaDaSemanaIso(hojeISO) {
    const [y, m, d] = hojeISO.split('-').map(Number);
    return new Date(y, m - 1, d, 12).getDay();
}

function aphEhRecorrente(a) {
    return a.frequencia === 'semana' || a.frequencia === 'mes';
}

// "Concluída hoje": diária usa o status da própria linha; semanal/mensal
// usa o mapa de conclusões de hoje (carregado à parte, por dia).
function aphConcluidaHoje(a, conclusoesHojeIds) {
    return aphEhRecorrente(a) ? conclusoesHojeIds.has(a.id) : a.status === 'concluida';
}

function aphCalcularVisiveisHoje(atividadesDoUsuario, hojeISO, conclusoesHojeIds = new Set()) {
    return atividadesDoUsuario
        .filter(a => a.status !== 'prorrogada')
        .filter(a => {
            if (a.frequencia === 'dia') {
                return a.status === 'pendente' && a.data_fim <= hojeISO;
            }

            if (hojeISO < a.data_inicio || hojeISO > a.data_fim) {
                return false;
            }

            // semana com dias específicos: só aparece nos dias marcados
            if (a.frequencia === 'semana' && Array.isArray(a.dias_semana) && a.dias_semana.length) {
                return a.dias_semana.includes(aphDiaDaSemanaIso(hojeISO));
            }

            // semana toda / mes: aparece todo dia dentro do prazo
            return true;
        })
        .map(a => {
            const concluida = aphConcluidaHoje(a, conclusoesHojeIds);
            const atrasada = a.frequencia === 'dia'
                // diária: atrasada quando o prazo (o próprio dia) já passou
                ? a.status === 'pendente' && a.data_fim < hojeISO
                // semanal/mensal: avisa se não foi feita hoje e já passou do 1º dia do prazo
                : !concluida && hojeISO > a.data_inicio;

            return { ...a, concluida, atrasada };
        });
}
window._aphCalcularVisiveisHoje = aphCalcularVisiveisHoje;

async function aphCarregarConclusoesHoje(sb, atividades) {
    const ids = atividades.filter(aphEhRecorrente).map(a => a.id);
    const conjunto = new Set();
    if (!ids.length) return conjunto;

    try {
        const { data, error } = await sb
            .from(APH_TABELA_CONCLUSOES)
            .select('atividade_id')
            .eq('data', aphHojeISO())
            .in('atividade_id', ids);

        if (error) throw error;
        (data || []).forEach(row => conjunto.add(row.atividade_id));
    } catch (e) {
        console.warn('⚠️ Falha ao carregar conclusões de hoje:', e);
    }
    return conjunto;
}

async function aphCarregarPainelHoje() {
    const container = document.getElementById('wtTarefasPeriodicasHoje');
    if (!container) return;

    const sb = window.supabaseClient;
    if (!sb || !window.currentUser?.username) return;

    try {
        const username = String(window.currentUser.username || '').trim().toLowerCase();

        const { data, error } = await sb
            .from('atividades_colaboradores')
            .select('*')
            .eq('designado_para', username)
            .order('data_fim', { ascending: false });

        if (error) throw error;

        const hojeISO = aphHojeISO();
        const conclusoesHojeIds = await aphCarregarConclusoesHoje(sb, data || []);
        const visiveis = aphCalcularVisiveisHoje(data || [], hojeISO, conclusoesHojeIds);

        aphRenderizarLista(container, visiveis);
    } catch (e) {
        console.warn('⚠️ Falha ao carregar atividades do dia:', e);
        container.innerHTML = '<div class="wt-empty">Não foi possível carregar as tarefas.</div>';
    }
}
window.aphCarregarPainelHoje = aphCarregarPainelHoje;

// Sem tarefa nenhuma, a seção encolhe (não fica um card vazio
// grandão ocupando espaço à toa). Volta ao tamanho normal assim
// que tiver algo pra mostrar.
function aphAjustarTamanhoSecao(vazio) {
    const secao = document.getElementById('wtTarefasHojeSecao');
    if (secao) secao.style.minHeight = vazio ? '0' : '';
}

function aphRenderizarLista(container, atividades) {
    if (!atividades.length) {
        aphAjustarTamanhoSecao(true);
        container.innerHTML = '<div class="wt-empty" style="padding:6px 8px;">Nenhuma tarefa para hoje. 🎉</div>';
        return;
    }

    aphAjustarTamanhoSecao(false);
    const rotulos = { dia: 'Diária', semana: 'Semanal', mes: 'Mensal' };
    const cores = { dia: '#00ADEE', semana: '#8e44ad', mes: '#e67e22' };

    container.innerHTML = atividades.map(a => {
        const concluida = a.concluida;
        const recorrente = aphEhRecorrente(a);
        return `
            <div class="wt-atividade-hoje-item" data-id="${a.id}" style="
                display:flex; align-items:flex-start; gap:10px;
                padding:12px; border-radius:10px; margin-bottom:8px;
                background:${concluida ? '#f1f9f1' : (a.atrasada ? '#fff5f5' : '#f8f9fa')};
                border:1px solid ${concluida ? '#c3e6cb' : (a.atrasada ? '#f5c6cb' : '#e9ecef')};
            ">
                <button type="button"
                    title="${concluida ? (recorrente ? 'Feita hoje' : 'Concluída') : (recorrente ? 'Marcar como feita hoje' : 'Marcar como concluída')}"
                    ${concluida ? 'disabled' : `onclick="window.aphConcluirAtividade(${a.id}, ${a.agenda_evento_id ? a.agenda_evento_id : 'null'}, ${recorrente})"`}
                    style="
                        flex-shrink:0; width:26px; height:26px; border-radius:50%; margin-top:2px;
                        border:2px solid ${concluida ? '#28a745' : '#adb5bd'};
                        background:${concluida ? '#28a745' : 'white'}; color:white;
                        cursor:${concluida ? 'default' : 'pointer'}; display:flex;
                        align-items:center; justify-content:center; font-size:12px; padding:0;
                    ">
                    ${concluida ? '<i class="fas fa-check"></i>' : ''}
                </button>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <strong style="${concluida ? 'text-decoration:line-through; color:#6c757d;' : ''}">${aphEscapar(a.titulo)}</strong>
                        <span style="font-size:11px; font-weight:600; color:white; background:${cores[a.frequencia] || '#6c757d'}; padding:2px 8px; border-radius:10px;">${rotulos[a.frequencia] || a.frequencia}</span>
                        ${a.atrasada ? '<span style="font-size:11px; font-weight:600; color:#dc3545;"><i class="fas fa-triangle-exclamation"></i> Atrasada</span>' : ''}
                    </div>
                    ${a.descricao ? `<div style="font-size:13px; color:#6c757d; margin-top:2px;">${aphEscapar(a.descricao)}</div>` : ''}
                    <div style="font-size:11px; color:#adb5bd; margin-top:4px;">
                        ${a.frequencia === 'dia'
                            ? `Designada em ${aphFormatarData(a.data_fim)}`
                            : `De ${aphFormatarData(a.data_inicio)} até ${aphFormatarData(a.data_fim)}${recorrente ? ' • repete todo dia dentro do prazo' : ''}`}
                        ${a.designado_por ? ` • Designado por ${aphEscapar(a.designado_por)}` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.aphConcluirAtividade = async function(id, agendaEventoId, recorrente) {
    const sb = window.supabaseClient;
    if (!sb) return;

    try {
        if (recorrente) {
            // Semanal/mensal: só grava a conclusão de HOJE — a atividade
            // continua pendente o prazo inteiro, pra amanhã pedir de novo.
            const { error } = await sb.from(APH_TABELA_CONCLUSOES).upsert({
                atividade_id: id,
                data: aphHojeISO(),
                concluido_por: window.currentUser?.username || null,
                concluido_em: new Date().toISOString()
            }, { onConflict: 'atividade_id,data' });

            if (error) throw error;

        } else {
            const { error } = await sb.from('atividades_colaboradores').update({
                status: 'concluida',
                concluida_em: new Date().toISOString(),
                concluida_por: window.currentUser?.username || null,
                atualizado_em: new Date().toISOString()
            }).eq('id', id);

            if (error) throw error;

            if (agendaEventoId) {
                try {
                    await sb.from('agenda_eventos').delete().eq('id', agendaEventoId);
                    await sb.from('atividades_colaboradores').update({ agenda_evento_id: null }).eq('id', id);
                } catch (_) { /* mirror do calendário é best-effort */ }
            }
        }

        if (typeof showToast === 'function') showToast('✅ Atividade concluída!', 'success');
        aphCarregarPainelHoje();
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast('❌ Erro ao concluir atividade', 'error');
    }
};

function aphAtualizarBotaoAdmin() {
    const btn = document.getElementById('btnNovaTarefaPeriodica');
    if (btn) btn.style.display = aphEhAdmin() ? 'inline-flex' : 'none';
}

// ============================================
// INICIALIZAÇÃO — junto com o menu principal
// ============================================

(function iniciarPainelAtividadesHoje() {
    const tentarCarregar = () => {
        const menu = document.getElementById('menuSystem');
        if (menu && !menu.classList.contains('hidden')) {
            aphAtualizarBotaoAdmin();
            aphCarregarPainelHoje();
        }
    };

    const menu = document.getElementById('menuSystem');
    if (menu) {
        new MutationObserver(tentarCarregar).observe(menu, { attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener('load', () => setTimeout(tentarCarregar, 1300));
    window.setInterval(tentarCarregar, 60000);
})();
