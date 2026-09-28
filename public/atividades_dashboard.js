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
// - Nada aparece antes de começar: se a data de início
//   ainda não chegou (ex.: tarefa de 01/10 no dia 28/09),
//   fica fora do painel — vale pra qualquer frequência.
// - Diária: some quando concluída; se não for feita,
//   continua aparecendo nos dias seguintes (atrasada).
// - Semanal/Mensal: é recorrente — aparece TODO dia
//   dentro do prazo (ou só nos dias marcados, se a
//   pessoa escolheu dias específicos da semana).
//   Marcar como feita só vale para hoje: a conclusão
//   fica em atividades_conclusoes_dia, então amanhã a
//   tarefa volta a pedir ação de novo, até vencer o
//   prazo — igual ao Controle de Atividades.
// - Atrasada (prazo vencido) NUNCA desaparece sozinha:
//   a pessoa demorou, mas fez — o check conclui a
//   atividade de verdade (inclusive recorrente que já
//   passou do prazo, que antes ficava escondida).
// ============================================

const APH_TABELA_CONCLUSOES = 'atividades_conclusoes_dia';

// Última lista renderizada no painel e todas as atividades do usuário
// (usadas pra saber se a atividade é atrasada e pra fechar as cópias
// geradas pela prorrogação automática ao concluir a original).
let aphCacheListaHoje = [];
let aphCacheMinhasAtividades = [];

function aphHojeISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}

// Datas podem chegar como "2026-10-01" ou com hora junto
// ("2026-10-01T00:00:00+00:00"). Trabalhar sempre com os 10 primeiros
// caracteres evita erro de ordem na comparação de texto (ex.: hoje
// "2026-09-28" x início "2026-10-01T...").
function aphDataISO(valor) {
    return valor ? String(valor).slice(0, 10) : '';
}

function aphFormatarData(iso) {
    const data = aphDataISO(iso);
    if (!data) return '';
    const [y, m, d] = data.split('-');
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

// Último dia em que a atividade recorrente pedia ação dentro do prazo.
// Com dias da semana marcados é o último dia marcado do período (mesma
// regra do Controle de Atividades); sem dias marcados é o próprio data_fim.
function aphUltimoDiaAplicavel(a) {
    const inicio = aphDataISO(a?.data_inicio);
    const fim = aphDataISO(a?.data_fim);
    if (!fim) return '';
    if (!inicio || !Array.isArray(a.dias_semana) || !a.dias_semana.length) return fim;

    const [ano, mes, dia] = fim.split('-').map(Number);
    let ultimo = '';

    for (const alvo of a.dias_semana) {
        const data = new Date(ano, mes - 1, dia, 12); // meio-dia evita fuso
        data.setDate(data.getDate() - ((data.getDay() - Number(alvo) + 7) % 7));
        const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
        if (iso >= inicio && iso > ultimo) ultimo = iso;
    }

    return ultimo || fim;
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
        // Comparações usam sempre data normalizada (sem hora junto).
        .map(a => ({
            ...a,
            data_inicio: aphDataISO(a.data_inicio),
            data_fim: aphDataISO(a.data_fim)
        }))
        .filter(a => {
            const recorrente = aphEhRecorrente(a);
            const prorrogada = a.status === 'prorrogada';

            // 1) Ainda não começou: NUNCA aparece antes da data de início.
            //    (ex.: atividade de 01/10 não aparece no painel em 28/09 —
            //    vale pra diária, semanal e mensal.)
            if (a.data_inicio && hojeISO < a.data_inicio) return false;

            // 2) Já concluída de verdade sai do painel (a recorrente segue
            //    "pendente" na linha e aparece marcada só no dia feito).
            if (a.status === 'concluida') return false;

            // 3) "Prorrogada" é histórico: a ocorrência viva da tarefa é a
            //    cópia mais recente (que aparece como pendente do dia).
            if (prorrogada) return false;

            if (recorrente) {
                // Dentro do prazo: aparece todo dia (ou só nos dias da
                // semana marcados). Passado o prazo: continua aparecendo
                // como atrasada, pra pessoa ainda poder marcar como feita.
                if (a.data_fim && hojeISO <= a.data_fim) {
                    if (a.frequencia === 'semana' && Array.isArray(a.dias_semana) && a.dias_semana.length) {
                        return a.dias_semana.includes(aphDiaDaSemanaIso(hojeISO));
                    }
                    return true;
                }
                return true;
            }

            // 4) Diária: aparece no dia marcado e continua aparecendo depois
            //    (atrasada) até ser concluída.
            return !a.data_fim || a.data_fim <= hojeISO;
        })
        .map(a => {
            const concluida = aphConcluidaHoje(a, conclusoesHojeIds);
            // Mesma regra do Controle de Atividades: atrasada = passou do
            // prazo sem conclusão. (Recorrente dentro do prazo não é
            // "atrasada" só porque ainda não foi feita hoje.)
            const prazoVencido = !!a.data_fim && a.data_fim < hojeISO;
            const atrasada = !concluida && prazoVencido;

            return { ...a, concluida, atrasada, prazoVencido };
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

        // Guarda as linhas do usuário (inclui as prorrogadas/cópias) pra
        // saber se a atividade é atrasada e pra fechar a cadeia ao concluir.
        aphCacheMinhasAtividades = data || [];

        const hojeISO = aphHojeISO();
        const conclusoesHojeIds = await aphCarregarConclusoesHoje(sb, aphCacheMinhasAtividades);
        const visiveis = aphCalcularVisiveisHoje(aphCacheMinhasAtividades, hojeISO, conclusoesHojeIds);

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
    aphCacheListaHoje = atividades || [];

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
        // Atrasada (prazo vencido) também aceita check: a pessoa demorou,
        // mas fez — e nesse caso o check conclui a atividade de vez.
        const rotuloBotao = concluida
            ? (recorrente ? 'Feita hoje' : 'Concluída')
            : (a.prazoVencido
                ? 'Marcar como feita (com atraso)'
                : (recorrente ? 'Marcar como feita hoje' : 'Marcar como concluída'));
        return `
            <div class="wt-atividade-hoje-item" data-id="${a.id}" style="
                display:flex; align-items:flex-start; gap:10px;
                padding:12px; border-radius:10px; margin-bottom:8px;
                background:${concluida ? '#f1f9f1' : (a.atrasada ? '#fff5f5' : '#f8f9fa')};
                border:1px solid ${concluida ? '#c3e6cb' : (a.atrasada ? '#f5c6cb' : '#e9ecef')};
            ">
                <button type="button"
                    title="${rotuloBotao}"
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
                    ${a.atrasada ? `<div style="font-size:11px; font-weight:600; color:#dc3545; margin-top:4px;">
                        <i class="fas fa-clock"></i> Prazo venceu em ${aphFormatarData(a.data_fim)} — ainda dá para marcar como feita.
                    </div>` : ''}
                    ${a.observacao ? `<div style="font-size:11px; color:#6f1d91; margin-top:4px;"><i class="fas fa-circle-info"></i> ${aphEscapar(a.observacao)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Uma atividade que já foi prorrogada automaticamente (virou uma cópia nova
// pra hoje) pode, mesmo assim, ser marcada como feita — a pessoa demorou,
// mas fez. Isso fecha também a cópia gerada pra hoje, senão ela fica
// pendente à toa depois que a original já foi concluída.
// (Mesma lógica do Controle de Atividades, só que usando as linhas que o
// painel já carregou do usuário.)
async function aphFecharProrrogacoesFilhas(sb, idOriginal) {
    const todas = aphCacheMinhasAtividades || [];
    const vistos = new Set();
    let atualId = idOriginal;

    while (atualId != null && !vistos.has(atualId)) {
        vistos.add(atualId);

        const filha = todas.find(a => String(a.prorrogada_de_id) === String(atualId));
        if (!filha) return;

        if (filha.status === 'pendente') {
            const carimbo = new Date().toISOString();
            await sb.from('atividades_colaboradores').update({
                status: 'concluida',
                concluida_em: carimbo,
                concluida_por: window.currentUser?.username || null,
                atualizado_em: carimbo
            }).eq('id', filha.id);

            if (filha.agenda_evento_id) {
                try {
                    await sb.from('agenda_eventos').delete().eq('id', filha.agenda_evento_id);
                    await sb.from('atividades_colaboradores').update({ agenda_evento_id: null }).eq('id', filha.id);
                } catch (_) { /* espelho do calendário é best-effort */ }
            }
            return;
        }

        // A cópia também já foi prorrogada de novo — segue a cadeia.
        atualId = filha.id;
    }
}

window.aphConcluirAtividade = async function(id, agendaEventoId, recorrente) {
    const sb = window.supabaseClient;
    if (!sb) return;

    const hoje = aphHojeISO();
    const atividade = aphCacheListaHoje.find(a => String(a.id) === String(id))
        || aphCacheMinhasAtividades.find(a => String(a.id) === String(id))
        || null;
    const fim = aphDataISO(atividade?.data_fim);
    const prazoVencido = !!fim && fim < hoje;

    // Recorrente dentro do prazo: só marca "feita hoje" (a atividade segue
    // pedindo ação amanhã). Diária ou recorrente com prazo VENCIDO: conclui
    // de vez — a pessoa demorou, mas fez a atividade.
    const fecharDeVez = !recorrente || prazoVencido;

    try {
        if (!fecharDeVez) {
            const { error } = await sb.from(APH_TABELA_CONCLUSOES).upsert({
                atividade_id: id,
                data: hoje,
                concluido_por: window.currentUser?.username || null,
                concluido_em: new Date().toISOString()
            }, { onConflict: 'atividade_id,data' });

            if (error) throw error;

            if (typeof showToast === 'function') {
                showToast('✅ Feita hoje! Amanhã volta a pedir de novo, até o prazo.', 'success');
            }

        } else {
            const carimbo = new Date().toISOString();

            const { error } = await sb.from('atividades_colaboradores').update({
                status: 'concluida',
                concluida_em: carimbo,
                concluida_por: window.currentUser?.username || null,
                atualizado_em: carimbo
            }).eq('id', id);

            if (error) throw error;

            // Recorrente fechada com atraso: deixa registrado que foi feita,
            // no último dia do prazo, pra prorrogação automática do Controle
            // de Atividades não criar uma cópia depois.
            if (recorrente && fim) {
                try {
                    await sb.from(APH_TABELA_CONCLUSOES).upsert({
                        atividade_id: id,
                        data: aphUltimoDiaAplicavel(atividade) || fim,
                        concluido_por: window.currentUser?.username || null,
                        concluido_em: carimbo
                    }, { onConflict: 'atividade_id,data' });
                } catch (e) {
                    console.warn('⚠️ Conclusão do prazo não registrada:', e);
                }
            }

            await aphFecharProrrogacoesFilhas(sb, id);

            if (agendaEventoId) {
                try {
                    await sb.from('agenda_eventos').delete().eq('id', agendaEventoId);
                    await sb.from('atividades_colaboradores').update({ agenda_evento_id: null }).eq('id', id);
                } catch (_) { /* mirror do calendário é best-effort */ }
            }

            if (typeof showToast === 'function') {
                showToast(prazoVencido ? '✅ Atividade concluída com atraso!' : '✅ Atividade concluída!', 'success');
            }
        }

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
