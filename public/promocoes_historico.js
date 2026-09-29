// ============================================================
// MÓDULO: PROMOÇÕES EM LOTE — MLBs NOVOS (40 DIAS) E HISTÓRICO
// ============================================================
// 1) Busca no Mercado Livre todos os MLBs criados nos últimos
//    40 dias e salva a lista na tabela `mlbs_novos_ml`.
// 2) Mantém o histórico de MLBs ativos em promoções na tabela
//    `historico_promocoes_ml` (quando, qual MLB, promoção,
//    valor em promoção e valor original).
//
// O histórico é alimentado de duas formas:
//  - automaticamente, toda vez que o sistema ativa um MLB numa
//    promoção (ativação em massa ou agendada);
//  - pela sincronização, que lê no ML todos os itens com status
//    "started" das promoções do vendedor. MLBs que entraram
//    ganham registro novo e MLBs que saíram têm o registro
//    encerrado (encerrado_em).
//
// SQL das tabelas (rodar uma vez no Supabase):
//
// create table if not exists public.mlbs_novos_ml (
//     mlb text primary key,
//     titulo text,
//     preco numeric,
//     status text,
//     permalink text,
//     thumbnail text,
//     data_criacao timestamptz,
//     capturado_em timestamptz default now()
// );
// create index if not exists mlbs_novos_ml_data_criacao_idx
//     on public.mlbs_novos_ml (data_criacao desc);
//
// create table if not exists public.historico_promocoes_ml (
//     id bigserial primary key,
//     mlb text not null,
//     promotion_id text,
//     promotion_type text,
//     promotion_name text,
//     preco_promocao numeric,
//     preco_original numeric,
//     ativado_em timestamptz not null default now(),
//     encerrado_em timestamptz,
//     ultima_verificacao_em timestamptz default now(),
//     origem text,
//     registrado_por text
// );
// create index if not exists historico_promocoes_ml_mlb_idx
//     on public.historico_promocoes_ml (mlb);
// create index if not exists historico_promocoes_ml_abertos_idx
//     on public.historico_promocoes_ml (encerrado_em);
//
// -- Colunas adicionadas depois (motivo do encerramento e vendas):
// alter table public.historico_promocoes_ml
//     add column if not exists motivo_encerramento text,
//     add column if not exists vendas_unidades integer,
//     add column if not exists vendas_pedidos integer,
//     add column if not exists vendas_faturamento numeric,
//     add column if not exists vendas_calculadas_em timestamptz;
// notify pgrst, 'reload schema';
//
// Cada linha do histórico é UM período do MLB naquela promoção.
// Se o MLB sai e depois entra de novo, nasce outra linha — a
// coluna "Vez" da tela mostra se é a 1ª, 2ª, 3ª... entrada.
// As vendas de cada período (pedidos pagos entre ativado_em e
// encerrado_em) vêm da API de pedidos do ML.
// ============================================================

(function() {
    'use strict';

    const TABELA_MLBS_NOVOS = 'mlbs_novos_ml';
    const TABELA_HISTORICO = 'historico_promocoes_ml';
    const DIAS_MLBS_NOVOS = 40;
    const SELLER_ID = '415176739';

    // Atualização automática ao abrir a tela quando o último
    // registro for mais antigo que isso.
    const HORAS_AUTO_ATUALIZAR_MLBS = 12;
    const HORAS_AUTO_SINCRONIZAR_HISTORICO = 6;
    const HORAS_AUTO_CALCULAR_VENDAS = 2;

    let mlbsNovos = [];
    let historicoPromocoes = [];
    let buscandoMlbsNovos = false;
    let sincronizandoHistorico = false;
    let calculandoVendas = false;

    const MOTIVO_SAIU = 'saiu_da_promocao';
    const MOTIVO_MUDOU_VALOR = 'mudou_valor';
    const MOTIVO_DESATIVADO = 'desativado_pelo_sistema';
    const MOTIVO_REATIVADO = 'reativado_pelo_sistema';
    const COLUNAS_HISTORICO = 11;

    function log(msg, type = 'info', data = null) {
        const prefix = '📚 [PROMO-HISTÓRICO]';
        const fn = type === 'error' ? console.error : console.log;
        fn(`${prefix} ${new Date().toLocaleTimeString()} ${msg}`, data || '');
    }

    function toast(msg, tipo = 'info') {
        if (typeof window.showToast === 'function') window.showToast(msg, tipo);
    }

    function supabase() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
        return null;
    }

    function workerUrl() {
        return window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
    }

    function escaparHtml(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatarMoeda(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero <= 0) return '—';
        return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatarDataHora(valor) {
        if (!valor) return '—';
        const data = new Date(valor);
        if (!Number.isFinite(data.getTime())) return '—';
        return data.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function nomeUsuario() {
        return window.currentUser?.name || 'Sistema';
    }

    function dormir(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function obterToken() {
        const tokenData = await window.getValidToken?.();
        if (!tokenData?.access_token) throw new Error('Token do Mercado Livre não disponível');
        return tokenData.access_token;
    }

    // GET no ML via proxy, com retentativa em 429/5xx.
    async function mlGet(url, token, tentativas = 4) {
        const proxyUrl = `${workerUrl()}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        let ultimoErro = null;

        for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
            try {
                const response = await fetch(proxyUrl, { cache: 'no-store' });
                if (response.ok) return await response.json();

                ultimoErro = new Error(`HTTP ${response.status}`);
                if (response.status !== 429 && response.status < 500) throw ultimoErro;
            } catch (error) {
                ultimoErro = error;
                if (/^HTTP 4(?!29)/.test(error.message)) throw error;
            }
            await dormir(600 * tentativa);
        }
        throw ultimoErro || new Error('Falha ao consultar o Mercado Livre');
    }

    async function emLotes(lista, tamanho, fn) {
        for (let i = 0; i < lista.length; i += tamanho) {
            await fn(lista.slice(i, i + tamanho), i);
        }
    }

    // ============================================================
    // INTERFACE
    // ============================================================
    function htmlCardMlbsNovos() {
        return `
        <!-- MLBs CRIADOS NOS ÚLTIMOS 40 DIAS -->
        <div class="card mb-4" id="cardMlbsNovos">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-seedling"></i>
                    MLBs criados nos últimos ${DIAS_MLBS_NOVOS} dias
                    <span class="badge badge-primary" id="mlbsNovosContador">0</span>
                </h2>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <button class="btn btn-sm btn-primary" id="btnBuscarMlbsNovos" onclick="buscarMlbsNovosML()">
                        <i class="fas fa-cloud-download-alt"></i> Buscar no ML e salvar
                    </button>
                    <button class="btn btn-sm btn-outline-primary" onclick="usarMlbsNovosNoAgendamento()">
                        <i class="fas fa-share"></i> Usar no agendamento em massa
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="copiarMlbsNovos()">
                        <i class="fas fa-copy"></i> Copiar lista
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="exportarMlbsNovosExcel()">
                        <i class="fas fa-file-excel"></i> Exportar Excel
                    </button>
                </div>
            </div>
            <div class="card-body">
                <small class="text-muted d-block mb-2" id="mlbsNovosInfo">Carregando...</small>
                <div class="table-responsive" style="max-height:420px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead>
                            <tr>
                                <th>MLB</th>
                                <th>Título</th>
                                <th>Criado em</th>
                                <th style="text-align:right;">Preço</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="mlbsNovosBody">
                            <tr><td colspan="5" class="text-center text-muted py-4">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    function htmlCardHistorico() {
        return `
        <!-- HISTÓRICO DE MLBs EM PROMOÇÕES -->
        <div class="card mb-4" id="cardHistoricoPromocoes">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-history"></i>
                    Histórico de MLBs em promoções
                </h2>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <input
                        type="text"
                        id="historicoPromoBusca"
                        class="form-control form-control-sm"
                        placeholder="Filtrar MLB ou promoção"
                        style="max-width:200px;"
                        oninput="renderizarHistoricoPromocoes()"
                    >
                    <select
                        id="historicoPromoFiltroStatus"
                        class="form-control form-control-sm"
                        style="max-width:170px;"
                        onchange="renderizarHistoricoPromocoes()"
                    >
                        <option value="todos">Todos</option>
                        <option value="ativos">Ativos agora</option>
                        <option value="encerrados">Encerrados</option>
                        <option value="voltaram">Voltaram para a promoção</option>
                        <option value="com_vendas">Com vendas</option>
                    </select>
                    <button class="btn btn-sm btn-primary" id="btnSincronizarHistoricoPromo" onclick="sincronizarHistoricoPromocoes()">
                        <i class="fas fa-sync-alt"></i> Sincronizar com ML
                    </button>
                    <button class="btn btn-sm btn-outline-primary" id="btnVendasHistoricoPromo" onclick="calcularVendasHistoricoPromocoes()">
                        <i class="fas fa-shopping-cart"></i> Atualizar vendas
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="exportarHistoricoPromocoesExcel()">
                        <i class="fas fa-file-excel"></i> Exportar Excel
                    </button>
                </div>
            </div>
            <div class="card-body">
                <small class="text-muted d-block mb-2" id="historicoPromoInfo">Carregando...</small>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead>
                            <tr>
                                <th>MLB</th>
                                <th>Promoção</th>
                                <th style="text-align:center;">Vez</th>
                                <th style="text-align:right;">Valor em promoção</th>
                                <th style="text-align:right;">Valor original</th>
                                <th style="text-align:center;">Desconto</th>
                                <th>Ativado em</th>
                                <th>Encerrado em</th>
                                <th style="text-align:center;">Duração</th>
                                <th style="text-align:right;">Vendas no período</th>
                                <th>Origem</th>
                            </tr>
                        </thead>
                        <tbody id="historicoPromoBody">
                            <tr><td colspan="${COLUNAS_HISTORICO}" class="text-center text-muted py-4">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // Chamado pelo promocoes_manager.js ao abrir a tela.
    window.iniciarPromocoesHistorico = async function() {
        const alvoNovos = document.getElementById('bulkMlbsNovosArea');
        if (alvoNovos && !document.getElementById('cardMlbsNovos')) {
            alvoNovos.innerHTML = htmlCardMlbsNovos();
        }
        const alvoHistorico = document.getElementById('bulkHistoricoArea');
        if (alvoHistorico && !document.getElementById('cardHistoricoPromocoes')) {
            alvoHistorico.innerHTML = htmlCardHistorico();
        }

        await Promise.all([
            carregarMlbsNovos(),
            carregarHistoricoPromocoes()
        ]);

        // Atualizações automáticas em segundo plano, uma de cada vez
        // para não disputar o limite de requisições do ML.
        (async () => {
            if (precisaAtualizar(ultimaCapturaMlbsNovos(), HORAS_AUTO_ATUALIZAR_MLBS)) {
                await window.buscarMlbsNovosML({ silencioso: true });
            }
            if (precisaAtualizar(ultimaVerificacaoHistorico(), HORAS_AUTO_SINCRONIZAR_HISTORICO)) {
                // A sincronização já recalcula as vendas no final.
                await window.sincronizarHistoricoPromocoes({ silencioso: true });
            } else if (precisaAtualizar(ultimoCalculoVendas(), HORAS_AUTO_CALCULAR_VENDAS)) {
                await window.calcularVendasHistoricoPromocoes({ silencioso: true });
            }
        })().catch(error => log(`Atualização automática falhou: ${error.message}`, 'error'));
    };

    function precisaAtualizar(ultimaData, horas) {
        if (!ultimaData) return true;
        return Date.now() - new Date(ultimaData).getTime() > horas * 60 * 60 * 1000;
    }

    // ============================================================
    // 1) MLBs CRIADOS NOS ÚLTIMOS 40 DIAS
    // ============================================================
    function dataCorte() {
        return new Date(Date.now() - DIAS_MLBS_NOVOS * 24 * 60 * 60 * 1000);
    }

    function ultimaCapturaMlbsNovos() {
        return mlbsNovos.reduce((maior, item) =>
            !maior || item.capturado_em > maior ? item.capturado_em : maior, null);
    }

    async function carregarMlbsNovos() {
        const db = supabase();
        if (!db) return;

        const { data, error } = await db
            .from(TABELA_MLBS_NOVOS)
            .select('*')
            .gte('data_criacao', dataCorte().toISOString())
            .order('data_criacao', { ascending: false })
            .limit(5000);

        if (error) {
            log(`Erro ao carregar ${TABELA_MLBS_NOVOS}: ${error.message}`, 'error');
            definirTexto('mlbsNovosInfo', `Erro ao carregar a lista: ${error.message}`);
            mostrarErroTabela('mlbsNovosBody', 5, TABELA_MLBS_NOVOS, error);
            return;
        }

        mlbsNovos = data || [];
        renderizarMlbsNovos();
        window.promoListasExcluidasAtualizadas?.();
    }

    function tabelaNaoExiste(error) {
        return error?.code === 'PGRST205' || error?.code === '42P01' ||
            /could not find the table|does not exist/i.test(error?.message || '');
    }

    function mostrarErroTabela(bodyId, colunas, tabela, error) {
        const body = document.getElementById(bodyId);
        if (!body) return;
        const mensagem = tabelaNaoExiste(error)
            ? `A tabela <strong>${escaparHtml(tabela)}</strong> ainda não foi criada no Supabase. Rode o SQL que está no topo do arquivo promocoes_historico.js.`
            : `Erro ao carregar: ${escaparHtml(error?.message || 'desconhecido')}`;
        body.innerHTML = `<tr><td colspan="${colunas}" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> ${mensagem}</td></tr>`;
    }

    function definirTexto(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    function renderizarMlbsNovos() {
        const body = document.getElementById('mlbsNovosBody');
        definirTexto('mlbsNovosContador', String(mlbsNovos.length));

        const ultima = ultimaCapturaMlbsNovos();
        definirTexto(
            'mlbsNovosInfo',
            ultima
                ? `${mlbsNovos.length} MLB(s) criados desde ${formatarDataHora(dataCorte())}. Última busca no ML: ${formatarDataHora(ultima)}.`
                : 'Nenhuma busca salva ainda. Clique em "Buscar no ML e salvar".'
        );

        if (!body) return;

        if (!mlbsNovos.length) {
            body.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum MLB salvo nos últimos 40 dias.</td></tr>';
            return;
        }

        body.innerHTML = mlbsNovos.map(item => `
            <tr>
                <td>
                    ${item.permalink
                        ? `<a href="${escaparHtml(item.permalink)}" target="_blank" rel="noopener">${escaparHtml(item.mlb)}</a>`
                        : escaparHtml(item.mlb)}
                </td>
                <td>${escaparHtml(item.titulo || '')}</td>
                <td>${formatarDataHora(item.data_criacao)}</td>
                <td style="text-align:right;">${formatarMoeda(item.preco)}</td>
                <td>${escaparHtml(item.status || '')}</td>
            </tr>`).join('');
    }

    // Lê os detalhes (data de criação etc.) de uma lista de IDs.
    async function buscarDetalhesItens(ids, token, aoProgredir,
        atributos = 'id,title,price,status,date_created,permalink,thumbnail') {
        const itens = [];

        await emLotes(ids, 20, async (grupo, inicio) => {
            const url = `https://api.mercadolibre.com/items?ids=${grupo.join(',')}&attributes=${atributos}`;
            const data = await mlGet(url, token);
            for (const resposta of data || []) {
                if (resposta?.code === 200 && resposta.body) itens.push(resposta.body);
            }
            aoProgredir?.(Math.min(inicio + grupo.length, ids.length), ids.length);
            await dormir(80);
        });

        return itens;
    }

    // Caminho rápido: pede os anúncios do mais novo para o mais
    // antigo e para quando chega em anúncios mais velhos que o corte.
    // Retorna null se não der para confiar na ordenação/paginação,
    // aí o chamador usa a varredura completa.
    async function buscarIdsNovosOrdenados(token, corte, aoProgredir) {
        const encontrados = [];
        const LIMITE = 100;
        let dataAnterior = Infinity;

        for (let offset = 0; offset < 1000; offset += LIMITE) {
            const url = `https://api.mercadolibre.com/users/${SELLER_ID}/items/search?orders=start_time_desc&limit=${LIMITE}&offset=${offset}`;
            const data = await mlGet(url, token);
            const ids = Array.isArray(data?.results) ? data.results : [];
            if (!ids.length) return encontrados;

            const detalhes = await buscarDetalhesItens(ids, token);
            // Mantém a ordem devolvida pela busca para validar a ordenação.
            const porId = new Map(detalhes.map(item => [item.id, item]));
            let algumNovo = false;

            for (const id of ids) {
                const item = porId.get(id);
                if (!item?.date_created) continue;
                const criadoEm = new Date(item.date_created).getTime();

                // Tolerância de 1 dia: start_time e date_created podem
                // divergir um pouco (anúncios republicados, por exemplo).
                if (criadoEm > dataAnterior + 24 * 60 * 60 * 1000) {
                    log('Ordenação por data não confiável, usando varredura completa', 'warning');
                    return null;
                }
                dataAnterior = Math.min(dataAnterior, criadoEm);

                if (criadoEm >= corte.getTime()) {
                    encontrados.push(item);
                    algumNovo = true;
                }
            }

            aoProgredir?.(`Lendo anúncios mais recentes... ${encontrados.length} encontrados`);

            if (!algumNovo || ids.length < LIMITE) return encontrados;
        }

        // Mais de 1000 anúncios no período: o offset do ML não passa disso.
        return null;
    }

    // Caminho completo: varre todos os anúncios (scan) e filtra pela data.
    async function buscarIdsNovosVarredura(token, corte, aoProgredir) {
        const ids = [];
        const vistos = new Set();
        let scrollId = null;

        for (let volta = 0; volta < 10000; volta++) {
            let url = `https://api.mercadolibre.com/users/${SELLER_ID}/items/search?search_type=scan&limit=100`;
            if (scrollId) url += `&scroll_id=${encodeURIComponent(scrollId)}`;

            const data = await mlGet(url, token);
            const resultados = Array.isArray(data?.results) ? data.results : [];
            let adicionados = 0;

            for (const id of resultados) {
                if (!vistos.has(id)) {
                    vistos.add(id);
                    ids.push(id);
                    adicionados++;
                }
            }

            aoProgredir?.(`Localizando anúncios... ${ids.length}`);
            scrollId = data?.scroll_id || scrollId;
            if (!resultados.length || !scrollId || !adicionados) break;
        }

        const detalhes = await buscarDetalhesItens(ids, token, (feitos, total) =>
            aoProgredir?.(`Lendo datas de criação... ${feitos}/${total}`));

        return detalhes.filter(item =>
            item.date_created && new Date(item.date_created).getTime() >= corte.getTime());
    }

    window.buscarMlbsNovosML = async function(opcoes = {}) {
        const { silencioso = false } = opcoes;
        if (buscandoMlbsNovos) return;

        const db = supabase();
        if (!db) {
            toast('❌ Supabase não conectado', 'error');
            return;
        }

        const botao = document.getElementById('btnBuscarMlbsNovos');
        const textoBotao = botao?.innerHTML;
        buscandoMlbsNovos = true;
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
        }

        const aoProgredir = texto => definirTexto('mlbsNovosInfo', texto);

        try {
            const token = await obterToken();
            const corte = dataCorte();

            let itens = await buscarIdsNovosOrdenados(token, corte, aoProgredir);
            if (itens === null) {
                itens = await buscarIdsNovosVarredura(token, corte, aoProgredir);
            }

            const agora = new Date().toISOString();
            const registros = itens.map(item => ({
                mlb: item.id,
                titulo: item.title || null,
                preco: Number(item.price) || null,
                status: item.status || null,
                permalink: item.permalink || null,
                thumbnail: item.thumbnail || null,
                data_criacao: item.date_created,
                capturado_em: agora
            }));

            aoProgredir(`Salvando ${registros.length} MLB(s)...`);
            await emLotes(registros, 500, async lote => {
                const { error } = await db.from(TABELA_MLBS_NOVOS).upsert(lote, { onConflict: 'mlb' });
                if (error) throw error;
            });

            await carregarMlbsNovos();
            log(`${registros.length} MLBs criados nos últimos ${DIAS_MLBS_NOVOS} dias salvos`, 'info');
            if (!silencioso) toast(`✅ ${registros.length} MLB(s) dos últimos ${DIAS_MLBS_NOVOS} dias salvos`, 'success');
        } catch (error) {
            log(`Erro ao buscar MLBs novos: ${error.message}`, 'error');
            definirTexto('mlbsNovosInfo', `Erro ao buscar: ${error.message}`);
            if (!silencioso) toast(`❌ Erro ao buscar MLBs: ${error.message}`, 'error');
        } finally {
            buscandoMlbsNovos = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = textoBotao;
            }
        }
    };

    window.usarMlbsNovosNoAgendamento = function() {
        const campo = document.getElementById('agendaMassaListaMlbs');
        if (!campo) return;
        if (!mlbsNovos.length) {
            toast('⚠️ Nenhum MLB na lista', 'warning');
            return;
        }
        campo.value = mlbsNovos.map(item => item.mlb).join('\n');
        window.abrirAbaPromocoesLote?.('principal');
        campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(`📋 ${mlbsNovos.length} MLB(s) colados em "Agendar lista de MLBs"`, 'info');
    };

    window.copiarMlbsNovos = async function() {
        if (!mlbsNovos.length) {
            toast('⚠️ Nenhum MLB na lista', 'warning');
            return;
        }
        try {
            await navigator.clipboard.writeText(mlbsNovos.map(item => item.mlb).join('\n'));
            toast(`📋 ${mlbsNovos.length} MLB(s) copiados`, 'success');
        } catch {
            toast('❌ Não foi possível copiar', 'error');
        }
    };

    window.exportarMlbsNovosExcel = function() {
        exportarExcel(
            mlbsNovos.map(item => ({
                MLB: item.mlb,
                Título: item.titulo || '',
                'Criado em': formatarDataHora(item.data_criacao),
                Preço: Number(item.preco) || 0,
                Status: item.status || '',
                Link: item.permalink || ''
            })),
            'MLBs novos',
            `mlbs_criados_${DIAS_MLBS_NOVOS}_dias`
        );
    };

    // ============================================================
    // 2) HISTÓRICO DE MLBs EM PROMOÇÕES
    // ============================================================
    // Cálculo de vendas mais antigo entre os períodos ainda ativos
    // (null se algum ainda não foi calculado).
    function ultimoCalculoVendas() {
        const ativos = historicoPromocoes.filter(item => !item.encerrado_em || !item.vendas_calculadas_em);
        if (!ativos.length) return new Date().toISOString();
        if (ativos.some(item => !item.vendas_calculadas_em)) return null;
        return ativos.reduce((menor, item) =>
            item.vendas_calculadas_em < menor ? item.vendas_calculadas_em : menor, ativos[0].vendas_calculadas_em);
    }

    function ultimaVerificacaoHistorico() {
        return historicoPromocoes.reduce((maior, item) =>
            !maior || (item.ultima_verificacao_em || '') > maior ? item.ultima_verificacao_em : maior, null);
    }

    async function carregarHistoricoPromocoes() {
        const db = supabase();
        if (!db) return;

        const { data, error } = await db
            .from(TABELA_HISTORICO)
            .select('*')
            .order('ativado_em', { ascending: false })
            .limit(5000);

        if (error) {
            log(`Erro ao carregar ${TABELA_HISTORICO}: ${error.message}`, 'error');
            definirTexto('historicoPromoInfo', `Erro ao carregar o histórico: ${error.message}`);
            mostrarErroTabela('historicoPromoBody', COLUNAS_HISTORICO, TABELA_HISTORICO, error);
            return;
        }

        historicoPromocoes = data || [];
        numerarEntradas(historicoPromocoes);
        window.renderizarHistoricoPromocoes();
    }

    // Numera as entradas de cada MLB em cada promoção (1ª vez, 2ª vez...).
    // Troca de valor sem sair da promoção continua sendo a mesma entrada.
    function numerarEntradas(lista) {
        const grupos = new Map();
        for (const item of lista) {
            const chave = `${item.mlb}|${item.promotion_id}`;
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(item);
        }

        for (const itens of grupos.values()) {
            itens.sort((a, b) => new Date(a.ativado_em) - new Date(b.ativado_em));
            let vez = 0;
            let anterior = null;
            for (const item of itens) {
                const continuacao = anterior &&
                    [MOTIVO_MUDOU_VALOR, MOTIVO_REATIVADO].includes(anterior.motivo_encerramento);
                if (!continuacao) vez++;
                item._vez = vez;
                item._continuacao = Boolean(continuacao);
                anterior = item;
            }
        }
    }

    function formatarDuracao(item) {
        const inicio = new Date(item.ativado_em).getTime();
        const fim = item.encerrado_em ? new Date(item.encerrado_em).getTime() : Date.now();
        if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return '—';
        const horas = (fim - inicio) / 3600000;
        if (horas < 24) return `${Math.max(1, Math.round(horas))}h`;
        const dias = Math.floor(horas / 24);
        const resto = Math.round(horas - dias * 24);
        return resto ? `${dias}d ${resto}h` : `${dias}d`;
    }

    function historicoFiltrado() {
        const busca = (document.getElementById('historicoPromoBusca')?.value || '').trim().toUpperCase();
        const status = document.getElementById('historicoPromoFiltroStatus')?.value || 'todos';

        return historicoPromocoes.filter(item => {
            if (status === 'ativos' && item.encerrado_em) return false;
            if (status === 'encerrados' && !item.encerrado_em) return false;
            if (status === 'voltaram' && !(item._vez > 1)) return false;
            if (status === 'com_vendas' && !(Number(item.vendas_unidades) > 0)) return false;
            if (!busca) return true;
            return String(item.mlb || '').toUpperCase().includes(busca) ||
                String(item.promotion_name || '').toUpperCase().includes(busca) ||
                String(item.promotion_id || '').toUpperCase().includes(busca);
        });
    }

    function percentualDesconto(item) {
        const promo = Number(item.preco_promocao);
        const original = Number(item.preco_original);
        if (!(promo > 0) || !(original > 0) || promo >= original) return null;
        return ((original - promo) / original) * 100;
    }

    const ROTULOS_ORIGEM = {
        sincronizacao: 'Sincronização ML',
        ativacao_em_massa: 'Ativação em massa',
        ativacao_regras: 'Ativação em massa por regras',
        agendamento: 'Agendamento'
    };

    const ROTULOS_MOTIVO = {
        [MOTIVO_SAIU]: 'Saiu da promoção',
        [MOTIVO_MUDOU_VALOR]: 'Mudou o valor',
        [MOTIVO_DESATIVADO]: 'Desativado pelo sistema',
        [MOTIVO_REATIVADO]: 'Reativado com novo valor'
    };

    function rotuloVez(item) {
        if (!item._vez) return '—';
        if (item._continuacao) return `${item._vez}ª <small class="text-muted">(novo valor)</small>`;
        return item._vez > 1
            ? `<span class="badge badge-warning">${item._vez}ª vez — voltou</span>`
            : '1ª';
    }

    function htmlVendas(item) {
        if (!item.vendas_calculadas_em) return '<span class="text-muted">—</span>';
        const unidades = Number(item.vendas_unidades) || 0;
        const pedidos = Number(item.vendas_pedidos) || 0;
        if (!unidades) return '<span class="text-muted">0</span>';
        return `<strong>${unidades} un.</strong>` +
            `<br><small class="text-muted">${pedidos} pedido(s) • ${formatarMoeda(item.vendas_faturamento)}</small>`;
    }

    window.renderizarHistoricoPromocoes = function() {
        const body = document.getElementById('historicoPromoBody');
        const lista = historicoFiltrado();
        const ativos = historicoPromocoes.filter(item => !item.encerrado_em).length;
        const ultima = ultimaVerificacaoHistorico();

        const voltaram = new Set(
            historicoPromocoes.filter(item => item._vez > 1).map(item => `${item.mlb}|${item.promotion_id}`)
        ).size;

        if (!sincronizandoHistorico && !calculandoVendas) {
            definirTexto(
                'historicoPromoInfo',
                `${historicoPromocoes.length} registro(s) • ${ativos} ativo(s) agora • ` +
                `${voltaram} MLB(s) que voltaram para a mesma promoção • ` +
                `Última sincronização: ${ultima ? formatarDataHora(ultima) : 'nunca'}`
            );
        }

        if (!body) return;

        if (!lista.length) {
            body.innerHTML = `<tr><td colspan="${COLUNAS_HISTORICO}" class="text-center text-muted py-4">Nenhum registro.</td></tr>`;
            return;
        }

        body.innerHTML = lista.map(item => {
            const desconto = percentualDesconto(item);
            return `
            <tr>
                <td><strong>${escaparHtml(item.mlb)}</strong></td>
                <td>
                    ${escaparHtml(item.promotion_name || item.promotion_id || '—')}
                    <br><small class="text-muted">${escaparHtml(item.promotion_type || '')}</small>
                </td>
                <td style="text-align:center;">${rotuloVez(item)}</td>
                <td style="text-align:right; font-weight:600;">${formatarMoeda(item.preco_promocao)}</td>
                <td style="text-align:right;">${formatarMoeda(item.preco_original)}</td>
                <td style="text-align:center;">${desconto === null ? '—' : `${desconto.toFixed(1)}%`}</td>
                <td>${formatarDataHora(item.ativado_em)}</td>
                <td>
                    ${item.encerrado_em
                        ? `${formatarDataHora(item.encerrado_em)}` +
                          (item.motivo_encerramento
                              ? `<br><small class="text-muted">${escaparHtml(ROTULOS_MOTIVO[item.motivo_encerramento] || item.motivo_encerramento)}</small>`
                              : '')
                        : '<span class="badge badge-success">Ativo</span>'}
                </td>
                <td style="text-align:center;">${formatarDuracao(item)}</td>
                <td style="text-align:right;">${htmlVendas(item)}</td>
                <td>
                    ${escaparHtml(ROTULOS_ORIGEM[item.origem] || item.origem || '')}
                    ${item.registrado_por ? `<br><small class="text-muted">${escaparHtml(item.registrado_por)}</small>` : ''}
                </td>
            </tr>`;
        }).join('');
    };

    // Registra uma ativação feita pelo próprio sistema.
    // Chamado pelo promocoes_manager.js depois de uma ativação com sucesso.
    window.registrarAtivacaoHistoricoPromocao = async function(dados) {
        const db = supabase();
        if (!db || !dados?.mlb) return;

        try {
            const agora = new Date().toISOString();

            // Se já havia um registro aberto do mesmo MLB nessa promoção,
            // encerra para o novo valor virar uma nova linha do histórico.
            await db
                .from(TABELA_HISTORICO)
                .update({ encerrado_em: agora, motivo_encerramento: MOTIVO_REATIVADO, vendas_calculadas_em: null })
                .eq('mlb', dados.mlb)
                .eq('promotion_id', String(dados.promotionId))
                .is('encerrado_em', null);

            const { error } = await db.from(TABELA_HISTORICO).insert({
                mlb: dados.mlb,
                promotion_id: String(dados.promotionId),
                promotion_type: dados.promotionType || null,
                promotion_name: dados.promotionName || null,
                preco_promocao: Number(dados.precoPromocao) || null,
                preco_original: Number(dados.precoOriginal) || null,
                ativado_em: agora,
                ultima_verificacao_em: agora,
                origem: dados.origem || null,
                registrado_por: nomeUsuario()
            });

            if (error) throw error;
        } catch (error) {
            log(`Não foi possível registrar ${dados.mlb} no histórico: ${error.message}`, 'error');
        }
    };

    // Encerra o registro aberto quando o sistema desativa um MLB.
    window.encerrarHistoricoPromocao = async function(mlb, promotionId) {
        const db = supabase();
        if (!db || !mlb) return;

        const { error } = await db
            .from(TABELA_HISTORICO)
            .update({ encerrado_em: new Date().toISOString(), motivo_encerramento: MOTIVO_DESATIVADO, vendas_calculadas_em: null })
            .eq('mlb', mlb)
            .eq('promotion_id', String(promotionId))
            .is('encerrado_em', null);

        if (error) log(`Não foi possível encerrar ${mlb} no histórico: ${error.message}`, 'error');
    };

    // Lê todos os itens de uma promoção com um status (paginado).
    async function buscarItensPromocao(promocao, status, token) {
        const itens = [];
        let searchAfter = null;

        for (let pagina = 0; pagina < 2000; pagina++) {
            const params = new URLSearchParams({
                promotion_type: promocao.type,
                app_version: 'v2',
                status,
                limit: '50'
            });
            if (searchAfter) params.set('search_after', searchAfter);

            const url = `https://api.mercadolibre.com/seller-promotions/promotions/${encodeURIComponent(promocao.id)}/items?${params}`;
            const data = await mlGet(url, token);

            for (const item of data?.results || []) {
                const id = item.id || item.item_id;
                if (id) itens.push({ ...item, id });
            }

            searchAfter = data?.paging?.searchAfter || null;
            if (!searchAfter || !(data?.results || []).length) break;
        }

        return itens;
    }

    window.sincronizarHistoricoPromocoes = async function(opcoes = {}) {
        const { silencioso = false } = opcoes;
        if (sincronizandoHistorico) return;

        const db = supabase();
        if (!db) {
            toast('❌ Supabase não conectado', 'error');
            return;
        }

        const botao = document.getElementById('btnSincronizarHistoricoPromo');
        const textoBotao = botao?.innerHTML;
        sincronizandoHistorico = true;
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        }

        try {
            const token = await obterToken();

            const dadosPromocoes = await mlGet(
                `https://api.mercadolibre.com/seller-promotions/users/${SELLER_ID}?app_version=v2`,
                token
            );
            const todasDoVendedor = (dadosPromocoes?.results || []).filter(p => p.id);
            const promocoes = todasDoVendedor.filter(p => p.status === 'started');
            // Promoções que existem mas já não estão rodando: tudo nelas encerrou.
            const promocoesParadas = new Set(
                todasDoVendedor.filter(p => p.status !== 'started').map(p => String(p.id))
            );

            // chave "MLB|promotion_id" -> item ativo no ML
            const ativosML = new Map();
            // Itens programados (pending) não são encerrados na sincronização,
            // porque a ativação do sistema pode ficar pendente no ML por um tempo.
            const pendentesML = new Set();
            const promocoesLidas = new Set();
            let falhas = 0;

            for (let i = 0; i < promocoes.length; i++) {
                const promocao = promocoes[i];
                definirTexto(
                    'historicoPromoInfo',
                    `Sincronizando promoção ${i + 1}/${promocoes.length}: ${promocao.name || promocao.id}...`
                );

                try {
                    const [ativos, pendentes] = await Promise.all([
                        buscarItensPromocao(promocao, 'started', token),
                        buscarItensPromocao(promocao, 'pending', token)
                    ]);

                    for (const item of ativos) {
                        ativosML.set(`${item.id}|${promocao.id}`, { item, promocao });
                    }
                    for (const item of pendentes) {
                        pendentesML.add(`${item.id}|${promocao.id}`);
                    }
                    promocoesLidas.add(String(promocao.id));
                } catch (error) {
                    falhas++;
                    log(`Falha ao ler a promoção ${promocao.id}: ${error.message}`, 'error');
                }
            }

            // Registros abertos no banco
            const abertos = [];
            for (let desde = 0; ; desde += 1000) {
                const { data, error } = await db
                    .from(TABELA_HISTORICO)
                    .select('id, mlb, promotion_id, preco_promocao')
                    .is('encerrado_em', null)
                    .range(desde, desde + 999);
                if (error) throw error;
                abertos.push(...(data || []));
                if (!data || data.length < 1000) break;
            }

            const agora = new Date().toISOString();
            const idsConfirmados = [];
            const idsEncerrar = [];
            const idsMudouValor = [];
            const chavesComRegistro = new Set();
            // Registros de promoções que não aparecem na lista do vendedor
            // (ex.: "Nova proposta para ganhar exposição!" / PRICE_DISCOUNT):
            // conferidos direto no anúncio.
            const conferirNoItem = [];

            for (const registro of abertos) {
                const chave = `${registro.mlb}|${registro.promotion_id}`;
                const promoId = String(registro.promotion_id);
                const ativo = ativosML.get(chave);

                if (!ativo && !promocoesLidas.has(promoId) && !promocoesParadas.has(promoId)) {
                    conferirNoItem.push(registro);
                    continue;
                }

                if (ativo) {
                    const precoAtual = Number(ativo.item.price) || 0;
                    const precoSalvo = Number(registro.preco_promocao) || 0;

                    // Mudou o valor em promoção: encerra o registro antigo
                    // e deixa o novo valor entrar como uma nova linha.
                    if (precoAtual > 0 && Math.abs(precoAtual - precoSalvo) >= 0.01) {
                        idsMudouValor.push(registro.id);
                    } else {
                        idsConfirmados.push(registro.id);
                        chavesComRegistro.add(chave);
                    }
                } else if (pendentesML.has(chave)) {
                    chavesComRegistro.add(chave);
                } else {
                    // Aqui a promoção foi lida com sucesso (ou já parou),
                    // então o MLB realmente saiu dela.
                    idsEncerrar.push(registro.id);
                }
            }

            for (let i = 0; i < conferirNoItem.length; i++) {
                const registro = conferirNoItem[i];
                definirTexto('historicoPromoInfo', `Conferindo anúncios ${i + 1}/${conferirNoItem.length}...`);
                try {
                    const promocoesItem = await mlGet(
                        `https://api.mercadolibre.com/seller-promotions/items/${encodeURIComponent(registro.mlb)}?app_version=v2`,
                        token
                    );
                    const promoId = String(registro.promotion_id);
                    const aindaAtiva = (Array.isArray(promocoesItem) ? promocoesItem : []).some(p =>
                        ['started', 'pending'].includes(p?.status) &&
                        (String(p.id || '') === promoId || String(p.type || '') === promoId)
                    );
                    if (aindaAtiva) idsConfirmados.push(registro.id);
                    else idsEncerrar.push(registro.id);
                } catch (error) {
                    falhas++;
                    log(`Falha ao conferir ${registro.mlb}: ${error.message}`, 'error');
                }
            }

            // Último encerramento de cada MLB+promoção que vai ganhar linha nova.
            // Numa volta para a promoção, o start_date do ML pode ser o início
            // da promoção (anterior à saída), então a nova entrada nunca
            // começa antes do fim da anterior.
            const chavesNovas = [...ativosML.keys()].filter(chave => !chavesComRegistro.has(chave));
            const ultimoEncerramento = new Map();
            const mlbsNovosRegistros = [...new Set(chavesNovas.map(chave => chave.split('|')[0]))];
            await emLotes(mlbsNovosRegistros, 200, async lote => {
                const { data, error } = await db
                    .from(TABELA_HISTORICO)
                    .select('mlb, promotion_id, encerrado_em')
                    .in('mlb', lote)
                    .not('encerrado_em', 'is', null);
                if (error) throw error;
                for (const registro of data || []) {
                    const chave = `${registro.mlb}|${registro.promotion_id}`;
                    if (!ultimoEncerramento.has(chave) || registro.encerrado_em > ultimoEncerramento.get(chave)) {
                        ultimoEncerramento.set(chave, registro.encerrado_em);
                    }
                }
            });
            // Os que mudaram de valor agora também contam como encerrados agora.
            for (const registro of abertos) {
                if (idsMudouValor.includes(registro.id)) {
                    ultimoEncerramento.set(`${registro.mlb}|${registro.promotion_id}`, agora);
                }
            }

            const novos = [];
            for (const chave of chavesNovas) {
                const { item, promocao } = ativosML.get(chave);
                let ativadoEm = agora;
                const inicioML = item.start_date ? new Date(item.start_date) : null;
                if (inicioML && Number.isFinite(inicioML.getTime()) && inicioML.toISOString() < agora) {
                    ativadoEm = inicioML.toISOString();
                }
                const fimAnterior = ultimoEncerramento.get(chave);
                if (fimAnterior && new Date(fimAnterior) > new Date(ativadoEm)) {
                    ativadoEm = new Date(fimAnterior).toISOString();
                }

                novos.push({
                    mlb: item.id,
                    promotion_id: String(promocao.id),
                    promotion_type: promocao.type || null,
                    promotion_name: promocao.name || null,
                    preco_promocao: Number(item.price) || null,
                    preco_original: Number(item.original_price) || null,
                    ativado_em: ativadoEm,
                    ultima_verificacao_em: agora,
                    origem: 'sincronizacao',
                    registrado_por: nomeUsuario()
                });
            }

            definirTexto('historicoPromoInfo', 'Salvando histórico...');

            await emLotes(idsConfirmados, 200, async lote => {
                const { error } = await db.from(TABELA_HISTORICO)
                    .update({ ultima_verificacao_em: agora })
                    .in('id', lote);
                if (error) throw error;
            });

            for (const [ids, motivo] of [[idsEncerrar, MOTIVO_SAIU], [idsMudouValor, MOTIVO_MUDOU_VALOR]]) {
                await emLotes(ids, 200, async lote => {
                    const { error } = await db.from(TABELA_HISTORICO)
                        // vendas_calculadas_em = null: recalcula as vendas até o fim do período.
                        .update({ encerrado_em: agora, ultima_verificacao_em: agora, motivo_encerramento: motivo, vendas_calculadas_em: null })
                        .in('id', lote);
                    if (error) throw error;
                });
            }

            await emLotes(novos, 500, async lote => {
                const { error } = await db.from(TABELA_HISTORICO).insert(lote);
                if (error) throw error;
            });

            sincronizandoHistorico = false;
            await carregarHistoricoPromocoes();
            await window.calcularVendasHistoricoPromocoes({ silencioso: true });

            const resumo =
                `${ativosML.size} MLB(s) ativos em ${promocoes.length} promoções • ` +
                `${novos.length} novo(s) no histórico • ${idsEncerrar.length} saíram • ` +
                `${idsMudouValor.length} mudaram de valor`;
            log(resumo, 'info');

            if (falhas) {
                toast(`⚠️ Sincronizado com ${falhas} falha(s) de leitura — esses registros foram mantidos como estavam`, 'warning');
            } else if (!silencioso) {
                toast(`✅ ${resumo}`, 'success');
            }
        } catch (error) {
            log(`Erro na sincronização: ${error.message}`, 'error');
            definirTexto('historicoPromoInfo', `Erro ao sincronizar: ${error.message}`);
            if (!silencioso) toast(`❌ Erro ao sincronizar: ${error.message}`, 'error');
        } finally {
            sincronizandoHistorico = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = textoBotao;
            }
        }
    };

    // ============================================================
    // VENDAS DE CADA PERÍODO EM PROMOÇÃO
    // ============================================================
    // Lê os pedidos pagos do vendedor no intervalo e soma, para cada
    // linha do histórico, o que aquele MLB vendeu entre ativado_em e
    // encerrado_em (ou agora, se ainda está ativo). O cálculo é sempre
    // refeito do zero para o período, então rodar duas vezes não duplica.
    const DIAS_MAXIMOS_VENDAS = 365;
    const DIAS_POR_JANELA_PEDIDOS = 5;

    async function buscarPedidosPagos(inicio, fim, token, aoProgredir) {
        const pedidos = new Map();
        const passo = DIAS_POR_JANELA_PEDIDOS * 24 * 60 * 60 * 1000;
        const totalJanelas = Math.max(1, Math.ceil((fim - inicio) / passo));
        let janela = 0;

        for (let de = inicio.getTime(); de < fim.getTime(); de += passo) {
            janela++;
            const ate = Math.min(de + passo, fim.getTime());
            let offset = 0;
            let total = Infinity;

            while (offset < total && offset < 10000) {
                const params = new URLSearchParams({
                    seller: SELLER_ID,
                    'order.status': 'paid',
                    'order.date_created.from': new Date(de).toISOString(),
                    'order.date_created.to': new Date(ate).toISOString(),
                    sort: 'date_asc',
                    limit: '50',
                    offset: String(offset)
                });
                const data = await mlGet(`https://api.mercadolibre.com/orders/search?${params}`, token);
                const resultados = data?.results || [];
                total = Number(data?.paging?.total) || 0;

                for (const pedido of resultados) {
                    if (pedido?.id) pedidos.set(pedido.id, pedido);
                }

                if (!resultados.length) break;
                offset += resultados.length;
            }

            aoProgredir?.(`Lendo pedidos do ML... período ${janela}/${totalJanelas} • ${pedidos.size} pedidos`);
        }

        return [...pedidos.values()];
    }

    window.calcularVendasHistoricoPromocoes = async function(opcoes = {}) {
        const { silencioso = false } = opcoes;
        if (calculandoVendas) return;

        const db = supabase();
        if (!db) return;

        const botao = document.getElementById('btnVendasHistoricoPromo');
        const textoBotao = botao?.innerHTML;
        calculandoVendas = true;
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
        }

        const aoProgredir = texto => definirTexto('historicoPromoInfo', texto);

        try {
            // Linhas que precisam de cálculo: ainda ativas (as vendas mudam)
            // ou encerradas que ainda não tiveram o cálculo final.
            const pendentes = [];
            for (let desde = 0; ; desde += 1000) {
                const { data, error } = await db
                    .from(TABELA_HISTORICO)
                    .select('id, mlb, ativado_em, encerrado_em')
                    .or('encerrado_em.is.null,vendas_calculadas_em.is.null')
                    .range(desde, desde + 999);
                if (error) throw error;
                pendentes.push(...(data || []));
                if (!data || data.length < 1000) break;
            }

            if (!pendentes.length) {
                if (!silencioso) toast('✅ Vendas já estão atualizadas', 'success');
                return;
            }

            const agora = new Date();
            const limiteAntigo = new Date(agora.getTime() - DIAS_MAXIMOS_VENDAS * 24 * 60 * 60 * 1000);
            const inicioMaisAntigo = pendentes.reduce((menor, registro) => {
                const data = new Date(registro.ativado_em);
                return data < menor ? data : menor;
            }, agora);
            const inicio = inicioMaisAntigo < limiteAntigo ? limiteAntigo : inicioMaisAntigo;

            const token = await obterToken();
            const pedidos = await buscarPedidosPagos(inicio, agora, token, aoProgredir);

            // MLB -> vendas desse MLB (um registro por item de pedido)
            const vendasPorMlb = new Map();
            for (const pedido of pedidos) {
                const dataPedido = new Date(pedido.date_created).getTime();
                for (const linha of pedido.order_items || []) {
                    const mlb = linha?.item?.id;
                    if (!mlb) continue;
                    if (!vendasPorMlb.has(mlb)) vendasPorMlb.set(mlb, []);
                    vendasPorMlb.get(mlb).push({
                        pedidoId: pedido.id,
                        data: dataPedido,
                        quantidade: Number(linha.quantity) || 0,
                        valor: (Number(linha.unit_price) || 0) * (Number(linha.quantity) || 0)
                    });
                }
            }

            const calculadoEm = agora.toISOString();
            const atualizacoes = pendentes.map(registro => {
                const de = new Date(registro.ativado_em).getTime();
                const ate = registro.encerrado_em ? new Date(registro.encerrado_em).getTime() : agora.getTime();
                const vendas = (vendasPorMlb.get(registro.mlb) || []).filter(v => v.data >= de && v.data < ate);

                return {
                    id: registro.id,
                    mlb: registro.mlb,
                    vendas_unidades: vendas.reduce((soma, v) => soma + v.quantidade, 0),
                    vendas_pedidos: new Set(vendas.map(v => v.pedidoId)).size,
                    vendas_faturamento: Number(vendas.reduce((soma, v) => soma + v.valor, 0).toFixed(2)),
                    vendas_calculadas_em: calculadoEm
                };
            });

            aoProgredir(`Salvando vendas de ${atualizacoes.length} período(s)...`);
            await emLotes(atualizacoes, 500, async lote => {
                const { error } = await db.from(TABELA_HISTORICO).upsert(lote, { onConflict: 'id' });
                if (error) throw error;
            });

            calculandoVendas = false;
            await carregarHistoricoPromocoes();

            const comVendas = atualizacoes.filter(a => a.vendas_unidades > 0).length;
            log(`Vendas calculadas: ${atualizacoes.length} períodos, ${comVendas} com vendas, ${pedidos.length} pedidos lidos`, 'info');
            if (!silencioso) toast(`✅ Vendas atualizadas em ${atualizacoes.length} período(s)`, 'success');
        } catch (error) {
            log(`Erro ao calcular vendas: ${error.message}`, 'error');
            definirTexto('historicoPromoInfo', `Erro ao calcular vendas: ${error.message}`);
            if (!silencioso) toast(`❌ Erro ao calcular vendas: ${error.message}`, 'error');
        } finally {
            calculandoVendas = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = textoBotao;
            }
        }
    };

    window.exportarHistoricoPromocoesExcel = function() {
        exportarExcel(
            historicoFiltrado().map(item => {
                const desconto = percentualDesconto(item);
                return {
                    MLB: item.mlb,
                    Promoção: item.promotion_name || '',
                    'ID promoção': item.promotion_id || '',
                    Tipo: item.promotion_type || '',
                    'Valor em promoção': Number(item.preco_promocao) || 0,
                    'Valor original': Number(item.preco_original) || 0,
                    'Desconto %': desconto === null ? '' : Number(desconto.toFixed(1)),
                    'Ativado em': formatarDataHora(item.ativado_em),
                    'Encerrado em': item.encerrado_em ? formatarDataHora(item.encerrado_em) : 'Ativo',
                    'Motivo do encerramento': ROTULOS_MOTIVO[item.motivo_encerramento] || item.motivo_encerramento || '',
                    Vez: item._vez || '',
                    Duração: formatarDuracao(item),
                    'Vendas (unidades)': item.vendas_calculadas_em ? Number(item.vendas_unidades) || 0 : '',
                    'Vendas (pedidos)': item.vendas_calculadas_em ? Number(item.vendas_pedidos) || 0 : '',
                    'Faturamento no período': item.vendas_calculadas_em ? Number(item.vendas_faturamento) || 0 : '',
                    Origem: ROTULOS_ORIGEM[item.origem] || item.origem || '',
                    'Registrado por': item.registrado_por || ''
                };
            }),
            'Histórico promoções',
            'historico_promocoes'
        );
    };

    function exportarExcel(linhas, nomeAba, prefixoArquivo) {
        if (!linhas.length) {
            toast('⚠️ Nada para exportar', 'warning');
            return;
        }
        if (typeof XLSX === 'undefined') {
            toast('❌ Biblioteca de Excel não carregada', 'error');
            return;
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nomeAba);
        XLSX.writeFile(wb, `${prefixoArquivo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    // Compartilhado com o promocoes_regras_lote.js.
    window.obterMlbsNovosPromocoes = () => mlbsNovos.slice();
    window.PromoML = {
        SELLER_ID,
        mlGet,
        obterToken,
        emLotes,
        dormir,
        buscarDetalhesItens,
        buscarItensPromocao,
        buscarPedidosPagos,
        supabase,
        escaparHtml,
        formatarMoeda,
        formatarDataHora,
        exportarExcel,
        toast
    };
})();
