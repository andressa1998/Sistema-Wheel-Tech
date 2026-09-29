// ============================================================
// MÓDULO: FULL - GERENCIAMENTO → PLANOS FULL
// ============================================================
// Monta um plano de envio para o FULL a partir de um período:
//
// 1) REPOSIÇÃO: todas as vendas FULL do período (operações
//    SALE_CONFIRMATION do ML), somadas por anúncio/variação, com
//    SKU, MLB e inventory_id. A quantidade sugerida é o que vendeu.
//
// 2) NOVOS ITENS:
//    - todos os MLBs criados no período;
//    - produtos que vendem no LOCAL (fora do FULL) com pelo menos
//      N vendas somadas no período e estoque interno para montar
//      pelo menos M unidades do anúncio (kits contam pelo SKU —
//      mesma conta da coluna "Depósito" do Full - Gerenciamento).
//      N e M são configuráveis (padrão 2 e 5).
//
// Anúncios finalizados ficam de fora. O plano é salvo na tabela
// `full_planos` e exportado em Excel para enviar ao ML.
//
// Usa as funções internas do gerenciamento_anuncios.js expostas em
// window.GAInterno (mesmo token, mesmo limitador de requisições).
//
// SQL da tabela (rodar uma vez no Supabase):
//
// create table if not exists public.full_planos (
//     id bigserial primary key,
//     nome text not null,
//     periodo_inicio date not null,
//     periodo_fim date not null,
//     status text not null default 'rascunho',
//     parametros jsonb,
//     itens jsonb,
//     novos_itens jsonb,
//     total_unidades integer,
//     criado_em timestamptz not null default now(),
//     criado_por text,
//     atualizado_em timestamptz
// );
// create index if not exists full_planos_criado_idx
//     on public.full_planos (criado_em desc);
// notify pgrst, 'reload schema';
// ============================================================

(function() {
    'use strict';

    const TABELA = 'full_planos';
    const DIAS_POR_JANELA_OPERACOES = 59; // limite da API: 60 dias por consulta
    const DIAS_POR_JANELA_PEDIDOS = 5;
    const TAMANHO_LOTE_INVENTORY = 40;

    const ROTULOS_STATUS = {
        rascunho: 'Rascunho',
        enviado: 'Enviado ao ML',
        concluido: 'Concluído'
    };

    const ROTULOS_MOTIVO = {
        criado: 'Criado no período',
        vende_local: 'Vende no local'
    };

    let planos = [];
    let erroTabela = null;
    let plano = null; // plano aberto no editor
    let gerando = false;

    const I = () => window.GAInterno;

    function toast(msg, tipo = 'info') {
        window.showToast?.(msg, tipo);
    }

    function esc(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatarData(valor) {
        if (!valor) return '—';
        const [ano, mes, dia] = String(valor).slice(0, 10).split('-');
        return dia ? `${dia}/${mes}/${ano}` : String(valor);
    }

    function formatarDataHora(valor) {
        if (!valor) return '—';
        const data = new Date(valor);
        if (!Number.isFinite(data.getTime())) return '—';
        return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    function hojeISO(deslocamentoDias = 0) {
        const d = new Date(Date.now() + deslocamentoDias * 86400000);
        return I().formatarDataApiFull(d);
    }

    function nomeUsuario() {
        return window.currentUser?.name || 'Sistema';
    }

    function progresso(texto) {
        const el = document.getElementById('fpProgresso');
        if (el) {
            el.textContent = texto || '';
            el.style.display = texto ? 'block' : 'none';
        }
    }

    function tabelaNaoExiste(error) {
        return error?.code === 'PGRST205' || error?.code === '42P01' ||
            /could not find the table|does not exist/i.test(error?.message || '');
    }

    // ============================================================
    // BUSCAS NO MERCADO LIVRE
    // ============================================================

    // Vendas FULL do período, somadas por inventory_id.
    async function vendasFullPorInventory(inventories, inicio, fim) {
        const soma = new Map();
        const vistas = new Set();

        const janelas = [];
        for (let de = new Date(`${inicio}T12:00:00`); de <= new Date(`${fim}T12:00:00`);) {
            const ate = new Date(Math.min(
                de.getTime() + (DIAS_POR_JANELA_OPERACOES - 1) * 86400000,
                new Date(`${fim}T12:00:00`).getTime()
            ));
            janelas.push([I().formatarDataApiFull(de), I().formatarDataApiFull(ate)]);
            de = new Date(ate.getTime() + 86400000);
        }

        const lotes = [];
        for (let i = 0; i < inventories.length; i += TAMANHO_LOTE_INVENTORY) {
            lotes.push(inventories.slice(i, i + TAMANHO_LOTE_INVENTORY));
        }

        const tarefas = [];
        for (const janela of janelas) for (const lote of lotes) tarefas.push({ janela, lote });

        let feitas = 0;
        let falhas = 0;

        await I().executarEmParaleloGA(tarefas, 3, async ({ janela, lote }) => {
            try {
                const operacoes = await I().buscarOperacoesVendaFull(lote, janela[0], janela[1]);
                for (const operacao of operacoes) {
                    // Janelas vizinhas podem devolver a mesma operação.
                    const id = String(operacao?.id || '');
                    if (id) {
                        if (vistas.has(id)) continue;
                        vistas.add(id);
                    }
                    const inventoryId = I().inventoryIdDaOperacaoFull(operacao);
                    if (!inventoryId) continue;
                    soma.set(inventoryId, (soma.get(inventoryId) || 0) + I().quantidadeVendidaOperacaoFull(operacao));
                }
            } catch (error) {
                falhas++;
                console.warn('⚠️ [Planos Full] Falha lendo vendas FULL:', janela, error);
            }
            feitas++;
            progresso(`Lendo vendas FULL do período... ${feitas}/${tarefas.length}`);
        });

        return { soma, falhas };
    }

    // Anúncios criados entre inicio e fim (mais novos primeiro).
    async function anunciosCriadosNoPeriodo(inicio, fim) {
        const seller = await I().getSellerId();
        const de = new Date(`${inicio}T00:00:00-03:00`).getTime();
        const ate = new Date(`${fim}T23:59:59-03:00`).getTime();
        const atributos = 'id,title,price,status,date_created,variations,attributes,seller_custom_field,seller_sku';
        const criados = [];

        for (let offset = 0; offset < 1000; offset += 100) {
            const busca = await I().mlComRetry(
                `/users/${seller}/items/search?orders=start_time_desc&limit=100&offset=${offset}`, 4);
            const ids = Array.isArray(busca?.results) ? busca.results : [];
            if (!ids.length) break;

            const grupos = [];
            for (let i = 0; i < ids.length; i += 20) grupos.push(ids.slice(i, i + 20));

            let algumNoPeriodoOuDepois = false;
            await I().executarEmParaleloGA(grupos, 4, async grupo => {
                const data = await I().mlComRetry(
                    `/items?ids=${grupo.join(',')}&include_attributes=all&attributes=${encodeURIComponent(atributos)}`, 4);
                for (const resposta of data || []) {
                    const item = resposta?.code === 200 ? resposta.body : null;
                    if (!item?.date_created) continue;
                    const criado = new Date(item.date_created).getTime();
                    if (criado >= de) algumNoPeriodoOuDepois = true;
                    if (criado >= de && criado <= ate) criados.push(item);
                }
            });

            progresso(`Procurando anúncios criados no período... ${criados.length} encontrado(s)`);
            // Página inteira mais antiga que o início: acabou.
            if (!algumNoPeriodoOuDepois || ids.length < 100) break;
        }

        return criados;
    }

    // Pedidos pagos do período (todos os canais), somados por MLB+variação.
    async function vendasPorAnuncio(inicio, fim) {
        const seller = await I().getSellerId();
        const de = new Date(`${inicio}T00:00:00-03:00`);
        const ate = new Date(`${fim}T23:59:59-03:00`);
        const passo = DIAS_POR_JANELA_PEDIDOS * 86400000;
        const vendas = new Map();
        const pedidosVistos = new Set();

        const janelas = [];
        for (let t = de.getTime(); t < ate.getTime(); t += passo) {
            janelas.push([new Date(t), new Date(Math.min(t + passo, ate.getTime()))]);
        }

        let feitas = 0;
        await I().executarEmParaleloGA(janelas, 3, async ([janelaDe, janelaAte]) => {
            let offset = 0;
            let total = Infinity;
            while (offset < total && offset < 10000) {
                const params = new URLSearchParams({
                    seller: String(seller),
                    'order.status': 'paid',
                    'order.date_created.from': janelaDe.toISOString(),
                    'order.date_created.to': janelaAte.toISOString(),
                    sort: 'date_asc',
                    limit: '50',
                    offset: String(offset)
                });
                const data = await I().mlComRetry(`/orders/search?${params}`, 4);
                const resultados = data?.results || [];
                total = Number(data?.paging?.total) || 0;

                for (const pedido of resultados) {
                    if (!pedido?.id || pedidosVistos.has(pedido.id)) continue;
                    pedidosVistos.add(pedido.id);
                    for (const linha of pedido.order_items || []) {
                        const mlb = linha?.item?.id;
                        if (!mlb) continue;
                        const variationId = linha.item.variation_id || null;
                        const chave = `${mlb}|${variationId || ''}`;
                        if (!vendas.has(chave)) {
                            vendas.set(chave, {
                                mlb,
                                variationId,
                                sku: linha.item.seller_sku || '',
                                titulo: linha.item.title || '',
                                unidades: 0
                            });
                        }
                        vendas.get(chave).unidades += Number(linha.quantity) || 0;
                    }
                }

                if (!resultados.length) break;
                offset += resultados.length;
            }
            feitas++;
            progresso(`Lendo vendas do período... ${feitas}/${janelas.length} • ${pedidosVistos.size} pedidos`);
        });

        return vendas;
    }

    function estoqueMontavel(sku, mlb) {
        const skuUsado = sku || I().skuInternoPorMlb(mlb);
        const valor = I().warehouseStock(skuUsado, mlb);
        return Number.isFinite(Number(valor)) ? Number(valor) : null;
    }

    // ============================================================
    // GERAR O PLANO
    // ============================================================
    async function gerarPlano(parametros) {
        const { inicio, fim, minVendasLocal, minEstoque } = parametros;
        const GA = I().GA;

        const rowsAtivas = (GA.rows || []).filter(row => String(row.status || '').toLowerCase() !== 'closed');
        if (!rowsAtivas.length) {
            throw new Error('A lista do Full - Gerenciamento está vazia. Clique em "Sincronizar Agora" antes de criar o plano.');
        }

        if (!GA.productBySku?.size) {
            progresso('Carregando estoque interno...');
            await I().loadInternalStock();
        }

        // ---------- 1) Reposição: vendas FULL ----------
        const rowsPorInventory = new Map();
        for (const row of rowsAtivas) {
            if (!row.inventoryId) continue;
            if (!rowsPorInventory.has(row.inventoryId)) rowsPorInventory.set(row.inventoryId, row);
        }

        const { soma, falhas } = await vendasFullPorInventory([...rowsPorInventory.keys()], inicio, fim);

        const itens = [];
        for (const [inventoryId, vendidos] of soma) {
            const row = rowsPorInventory.get(inventoryId);
            if (!row || !(vendidos > 0)) continue;
            itens.push({
                inventoryId,
                mlb: row.itemId,
                variationId: row.variationId || null,
                sku: row.sku || '',
                titulo: row.title || '',
                vendidos,
                estoqueFull: Number.isFinite(Number(row.full)) ? Number(row.full) : null,
                quantidade: vendidos
            });
        }
        itens.sort((a, b) => b.vendidos - a.vendidos);

        // ---------- 2) Novos itens ----------
        const mlbsNoFull = new Set(rowsAtivas.map(row => row.itemId));
        const novos = new Map(); // chave mlb|variação

        const criados = await anunciosCriadosNoPeriodo(inicio, fim);
        for (const item of criados) {
            if (String(item.status || '').toLowerCase() === 'closed') continue;
            const sku = I().extractSku(item) || I().skuInternoPorMlb(item.id);
            novos.set(`${item.id}|`, {
                mlb: item.id,
                variationId: null,
                sku,
                titulo: item.title || '',
                motivos: ['criado'],
                criadoEm: item.date_created,
                vendasLocal: 0,
                estoqueMontavel: estoqueMontavel(sku, item.id),
                jaNoFull: mlbsNoFull.has(item.id),
                quantidade: 0
            });
        }

        const vendas = await vendasPorAnuncio(inicio, fim);
        const vendasPorMlb = new Map();
        for (const venda of vendas.values()) {
            vendasPorMlb.set(venda.mlb, (vendasPorMlb.get(venda.mlb) || 0) + venda.unidades);
        }
        // Os criados no período mostram quanto venderam.
        for (const novo of novos.values()) novo.vendasLocal = vendasPorMlb.get(novo.mlb) || 0;

        for (const venda of vendas.values()) {
            // Quem já está no FULL entra pela reposição, não aqui.
            if (mlbsNoFull.has(venda.mlb)) continue;
            if (venda.unidades < minVendasLocal) continue;
            const estoque = estoqueMontavel(venda.sku, venda.mlb);
            if (!(estoque >= minEstoque)) continue;

            const chaveItem = `${venda.mlb}|`;
            const existente = novos.get(chaveItem);
            if (existente && !existente.variationId) {
                // Criado no período e também vende no local.
                if (!existente.motivos.includes('vende_local')) existente.motivos.push('vende_local');
                existente.estoqueMontavel = existente.estoqueMontavel ?? estoque;
                existente.quantidade = Math.max(existente.quantidade, venda.unidades);
                continue;
            }

            novos.set(`${venda.mlb}|${venda.variationId || ''}`, {
                mlb: venda.mlb,
                variationId: venda.variationId,
                sku: venda.sku || I().skuInternoPorMlb(venda.mlb),
                titulo: venda.titulo,
                motivos: ['vende_local'],
                criadoEm: null,
                vendasLocal: venda.unidades,
                estoqueMontavel: estoque,
                jaNoFull: false,
                quantidade: venda.unidades
            });
        }

        const novosItens = [...novos.values()].sort((a, b) =>
            b.vendasLocal - a.vendasLocal || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));

        if (falhas) toast(`⚠️ ${falhas} consulta(s) de vendas FULL falharam — confira as quantidades.`, 'warning');

        return { itens, novosItens };
    }

    // ============================================================
    // BANCO
    // ============================================================
    async function carregarPlanos() {
        const db = window.supabaseClient;
        if (!db) return;
        const { data, error } = await db
            .from(TABELA)
            .select('id, nome, periodo_inicio, periodo_fim, status, total_unidades, criado_em, criado_por, atualizado_em, itens, novos_itens')
            .order('criado_em', { ascending: false })
            .limit(100);
        erroTabela = error || null;
        planos = error ? [] : (data || []);
    }

    function totalUnidades(p) {
        return [...(p.itens || []), ...(p.novos_itens || [])]
            .reduce((s, item) => s + (Number(item.quantidade) || 0), 0);
    }

    async function salvarPlano() {
        const db = window.supabaseClient;
        if (!db || !plano) return;
        const registro = {
            nome: plano.nome,
            periodo_inicio: plano.periodo_inicio,
            periodo_fim: plano.periodo_fim,
            status: plano.status || 'rascunho',
            parametros: plano.parametros || null,
            itens: plano.itens || [],
            novos_itens: plano.novos_itens || [],
            total_unidades: totalUnidades(plano),
            atualizado_em: new Date().toISOString()
        };

        if (plano.id) {
            const { error } = await db.from(TABELA).update(registro).eq('id', plano.id);
            if (error) throw error;
        } else {
            const { data, error } = await db.from(TABELA)
                .insert({ ...registro, criado_por: nomeUsuario() })
                .select('id, criado_em, criado_por')
                .single();
            if (error) throw error;
            Object.assign(plano, data);
        }
    }

    // ============================================================
    // INTERFACE
    // ============================================================
    function garantirTela() {
        let tela = document.getElementById('fullPlanosTela');
        if (tela) return tela;
        tela = document.createElement('div');
        tela.id = 'fullPlanosTela';
        tela.style.cssText =
            'position:fixed; inset:0; z-index:2000; background:#f4f6fb; overflow:auto; padding:20px;';
        tela.innerHTML = `
            <div style="max-width:1400px; margin:0 auto;">
                <div class="card mb-4">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-truck-loading"></i> Planos Full</h2>
                        <button type="button" class="btn btn-secondary" onclick="fecharPlanosFullGA()">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                    <div id="fpProgresso" class="alert alert-info" style="display:none; margin:12px;"></div>
                </div>
                <div id="fpConteudo"></div>
            </div>`;
        document.body.appendChild(tela);
        return tela;
    }

    window.abrirPlanosFullGA = async function() {
        if (!window.GAInterno) {
            toast('❌ Full - Gerenciamento não carregado', 'error');
            return;
        }
        garantirTela().style.display = 'block';
        document.body.style.overflow = 'hidden';
        plano = null;
        await renderizarLista();
    };

    window.fecharPlanosFullGA = function() {
        if (plano && plano._alterado && !confirm('O plano tem alterações não salvas. Fechar mesmo assim?')) return;
        const tela = document.getElementById('fullPlanosTela');
        if (tela) tela.style.display = 'none';
        document.body.style.overflow = '';
    };

    async function renderizarLista() {
        const alvo = document.getElementById('fpConteudo');
        if (!alvo) return;
        alvo.innerHTML = '<div class="card"><div class="card-body text-center text-muted py-4">Carregando planos...</div></div>';
        await carregarPlanos();

        const linhas = erroTabela
            ? `<tr><td colspan="7" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle"></i> ${
                tabelaNaoExiste(erroTabela)
                    ? `A tabela <strong>${TABELA}</strong> ainda não foi criada no Supabase. Rode o SQL que está no topo do arquivo full_planos.js.`
                    : `Erro ao carregar: ${esc(erroTabela.message)}`
            }</td></tr>`
            : planos.length
                ? planos.map(p => `
                    <tr>
                        <td><strong>${esc(p.nome)}</strong></td>
                        <td>${formatarData(p.periodo_inicio)} a ${formatarData(p.periodo_fim)}</td>
                        <td style="text-align:center;">${(p.itens || []).length} + ${(p.novos_itens || []).length} novos</td>
                        <td style="text-align:center;">${Number(p.total_unidades) || 0}</td>
                        <td><span class="badge ${p.status === 'rascunho' ? 'badge-warning' : 'badge-success'}">${esc(ROTULOS_STATUS[p.status] || p.status)}</span></td>
                        <td>${formatarDataHora(p.criado_em)}<br><small class="text-muted">${esc(p.criado_por || '')}</small></td>
                        <td style="white-space:nowrap;">
                            <button type="button" class="btn btn-sm btn-primary" onclick="abrirPlanoFullGA(${Number(p.id)})"><i class="fas fa-folder-open"></i> Abrir</button>
                            <button type="button" class="btn btn-sm btn-outline-success" onclick="exportarPlanoFullGA(${Number(p.id)})" title="Excel para o ML"><i class="fas fa-file-excel"></i></button>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="excluirPlanoFullGA(${Number(p.id)})" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>`).join('')
                : '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum plano criado ainda.</td></tr>';

        alvo.innerHTML = `
            <div class="card mb-4">
                <div class="card-header"><h2 class="card-title"><i class="fas fa-plus-circle"></i> Novo plano</h2></div>
                <div class="card-body">
                    <div class="row align-items-end">
                        <div class="col-md-3">
                            <label>Nome do plano</label>
                            <input type="text" id="fpNome" class="form-control" value="Plano Full ${esc(formatarData(hojeISO()))}">
                        </div>
                        <div class="col-md-2">
                            <label>Vendas de</label>
                            <input type="date" id="fpInicio" class="form-control" value="${hojeISO(-30)}">
                        </div>
                        <div class="col-md-2">
                            <label>até</label>
                            <input type="date" id="fpFim" class="form-control" value="${hojeISO()}">
                        </div>
                        <div class="col-md-2">
                            <label title="Novos itens que vendem no local: mínimo de vendas somadas no período">Vendas locais mín.</label>
                            <input type="number" min="1" id="fpMinVendas" class="form-control" value="2">
                        </div>
                        <div class="col-md-1">
                            <label title="Estoque interno mínimo (ou kits que dá pra montar)">Estoque mín.</label>
                            <input type="number" min="0" id="fpMinEstoque" class="form-control" value="5">
                        </div>
                        <div class="col-md-2">
                            <button type="button" class="btn btn-success" style="width:100%;" id="fpBtnGerar" onclick="gerarPlanoFullGA()">
                                <i class="fas fa-magic"></i> Gerar plano
                            </button>
                        </div>
                    </div>
                    <small class="text-muted d-block mt-2">
                        Reposição = vendas FULL do período (SKU, MLB e quantidade somada).
                        Novos itens = MLBs criados no período + produtos que vendem no local com as vendas e o estoque mínimos
                        (o estoque conta os kits que dá pra montar pelo SKU). Anúncios finalizados ficam de fora.
                    </small>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h2 class="card-title"><i class="fas fa-list"></i> Planos criados</h2></div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Plano</th><th>Período</th><th style="text-align:center;">Itens</th>
                                <th style="text-align:center;">Unidades</th><th>Status</th><th>Criado</th><th></th>
                            </tr>
                        </thead>
                        <tbody>${linhas}</tbody>
                    </table>
                </div>
            </div>`;
    }

    window.gerarPlanoFullGA = async function() {
        if (gerando) return;
        const valor = id => document.getElementById(id)?.value || '';
        const parametros = {
            inicio: valor('fpInicio'),
            fim: valor('fpFim'),
            minVendasLocal: Math.max(1, Number(valor('fpMinVendas')) || 2),
            minEstoque: Math.max(0, Number(valor('fpMinEstoque')) || 0)
        };
        if (!parametros.inicio || !parametros.fim || parametros.inicio > parametros.fim) {
            toast('⚠️ Informe um período válido', 'warning');
            return;
        }

        gerando = true;
        const botao = document.getElementById('fpBtnGerar');
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        }

        try {
            const { itens, novosItens } = await gerarPlano(parametros);
            plano = {
                id: null,
                nome: valor('fpNome').trim() || `Plano Full ${formatarData(hojeISO())}`,
                periodo_inicio: parametros.inicio,
                periodo_fim: parametros.fim,
                status: 'rascunho',
                parametros,
                itens,
                novos_itens: novosItens,
                _alterado: true
            };
            progresso('');
            renderizarEditor();
            toast(`✅ Plano gerado: ${itens.length} item(ns) de reposição e ${novosItens.length} novo(s) item(ns). Revise e salve.`, 'success');
        } catch (error) {
            console.error('❌ [Planos Full]', error);
            progresso(`❌ ${error.message}`);
            toast(`❌ ${error.message}`, 'error');
        } finally {
            gerando = false;
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = '<i class="fas fa-magic"></i> Gerar plano';
            }
        }
    };

    window.abrirPlanoFullGA = function(id) {
        const encontrado = planos.find(p => Number(p.id) === Number(id));
        if (!encontrado) return;
        plano = JSON.parse(JSON.stringify(encontrado));
        plano.itens = plano.itens || [];
        plano.novos_itens = plano.novos_itens || [];
        renderizarEditor();
    };

    window.excluirPlanoFullGA = async function(id) {
        const encontrado = planos.find(p => Number(p.id) === Number(id));
        if (!encontrado || !confirm(`Excluir o plano "${encontrado.nome}"?`)) return;
        const { error } = await window.supabaseClient.from(TABELA).delete().eq('id', id);
        if (error) {
            toast(`❌ ${error.message}`, 'error');
            return;
        }
        toast('✅ Plano excluído', 'success');
        await renderizarLista();
    };

    function linhaItem(item, indice, lista) {
        const campoQtd = `
            <input type="number" min="0" class="form-control form-control-sm" style="width:90px; text-align:center;"
                value="${Number(item.quantidade) || 0}"
                onchange="alterarQuantidadePlanoFullGA('${lista}', ${indice}, this.value)">`;
        const remover = `
            <button type="button" class="btn btn-sm btn-outline-danger" title="Tirar do plano"
                onclick="removerItemPlanoFullGA('${lista}', ${indice})"><i class="fas fa-times"></i></button>`;
        const mlb = `<strong>${esc(item.mlb)}</strong>${item.variationId ? `<br><small class="text-muted">Var. ${esc(item.variationId)}</small>` : ''}`;

        if (lista === 'itens') {
            return `
                <tr>
                    <td>${mlb}</td>
                    <td>${esc(item.sku || '—')}</td>
                    <td>${esc(item.titulo)}</td>
                    <td><small>${esc(item.inventoryId || '—')}</small></td>
                    <td style="text-align:center;">${Number(item.vendidos) || 0}</td>
                    <td style="text-align:center;">${item.estoqueFull ?? '—'}</td>
                    <td style="text-align:center;">${campoQtd}</td>
                    <td>${remover}</td>
                </tr>`;
        }

        return `
            <tr>
                <td>${mlb}</td>
                <td>${esc(item.sku || '—')}</td>
                <td>${esc(item.titulo)}</td>
                <td>${(item.motivos || []).map(m => `<span class="badge badge-info" style="margin-right:4px;">${esc(ROTULOS_MOTIVO[m] || m)}</span>`).join('')}
                    ${item.jaNoFull ? '<br><small class="text-muted">já está no FULL</small>' : ''}</td>
                <td>${item.criadoEm ? formatarDataHora(item.criadoEm) : '—'}</td>
                <td style="text-align:center;">${Number(item.vendasLocal) || 0}</td>
                <td style="text-align:center;">${item.estoqueMontavel ?? '—'}</td>
                <td style="text-align:center;">${campoQtd}</td>
                <td>${remover}</td>
            </tr>`;
    }

    function renderizarEditor() {
        const alvo = document.getElementById('fpConteudo');
        if (!alvo || !plano) return;

        const totalRepos = plano.itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
        const totalNovos = plano.novos_itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

        alvo.innerHTML = `
            <div class="card mb-4">
                <div class="card-header">
                    <div>
                        <input type="text" class="form-control" style="font-weight:700; min-width:320px;"
                            value="${esc(plano.nome)}" onchange="alterarNomePlanoFullGA(this.value)">
                        <small class="text-muted">
                            Vendas de ${formatarData(plano.periodo_inicio)} a ${formatarData(plano.periodo_fim)}
                            • ${totalRepos + totalNovos} unidade(s) no plano
                            ${plano.id ? `• salvo por ${esc(plano.criado_por || '—')}` : '• <strong>ainda não salvo</strong>'}
                        </small>
                    </div>
                    <div class="d-flex flex-wrap align-items-center" style="gap:6px;">
                        <select class="form-control form-control-sm" style="width:160px;" onchange="alterarStatusPlanoFullGA(this.value)">
                            ${Object.entries(ROTULOS_STATUS).map(([v, r]) =>
                                `<option value="${v}" ${plano.status === v ? 'selected' : ''}>${r}</option>`).join('')}
                        </select>
                        <button type="button" class="btn btn-secondary" onclick="voltarListaPlanosFullGA()"><i class="fas fa-arrow-left"></i> Voltar</button>
                        <button type="button" class="btn btn-outline-success" onclick="exportarPlanoFullGA()"><i class="fas fa-file-excel"></i> Excel para o ML</button>
                        <button type="button" class="btn btn-success" onclick="salvarPlanoFullGA()"><i class="fas fa-save"></i> Salvar plano</button>
                    </div>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-redo"></i> Reposição — vendas FULL no período
                        <span class="badge badge-primary">${plano.itens.length}</span></h2>
                    <small class="text-muted">${totalRepos} unidade(s)</small>
                </div>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead><tr>
                            <th>MLB</th><th>SKU</th><th>Título</th><th>Inventory ID</th>
                            <th style="text-align:center;">Vendidos FULL</th><th style="text-align:center;">Estoque FULL hoje</th>
                            <th style="text-align:center;">Enviar</th><th></th>
                        </tr></thead>
                        <tbody>${plano.itens.length
                            ? plano.itens.map((item, i) => linhaItem(item, i, 'itens')).join('')
                            : '<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma venda FULL no período.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-star"></i> Novos itens
                        <span class="badge badge-primary">${plano.novos_itens.length}</span></h2>
                    <small class="text-muted">${totalNovos} unidade(s) •
                        vende no local: ≥ ${plano.parametros?.minVendasLocal ?? 2} vendas e estoque para ≥ ${plano.parametros?.minEstoque ?? 5}</small>
                </div>
                <div class="table-responsive" style="max-height:520px; overflow-y:auto;">
                    <table class="table table-striped table-hover table-sm">
                        <thead><tr>
                            <th>MLB</th><th>SKU</th><th>Título</th><th>Por que entrou</th><th>Criado em</th>
                            <th style="text-align:center;">Vendas no período</th><th style="text-align:center;">Estoque (unid./kits)</th>
                            <th style="text-align:center;">Enviar</th><th></th>
                        </tr></thead>
                        <tbody>${plano.novos_itens.length
                            ? plano.novos_itens.map((item, i) => linhaItem(item, i, 'novos_itens')).join('')
                            : '<tr><td colspan="9" class="text-center text-muted py-4">Nenhum novo item.</td></tr>'}</tbody>
                    </table>
                </div>
            </div>`;
    }

    window.alterarQuantidadePlanoFullGA = function(lista, indice, valor) {
        const item = plano?.[lista]?.[indice];
        if (!item) return;
        item.quantidade = Math.max(0, Math.round(Number(valor) || 0));
        plano._alterado = true;
        renderizarEditor();
    };

    window.removerItemPlanoFullGA = function(lista, indice) {
        if (!plano?.[lista]) return;
        plano[lista].splice(indice, 1);
        plano._alterado = true;
        renderizarEditor();
    };

    window.alterarNomePlanoFullGA = function(nome) {
        if (!plano) return;
        plano.nome = String(nome || '').trim() || plano.nome;
        plano._alterado = true;
    };

    window.alterarStatusPlanoFullGA = function(status) {
        if (!plano) return;
        plano.status = status;
        plano._alterado = true;
    };

    window.voltarListaPlanosFullGA = async function() {
        if (plano?._alterado && !confirm('O plano tem alterações não salvas. Voltar mesmo assim?')) return;
        plano = null;
        await renderizarLista();
    };

    window.salvarPlanoFullGA = async function() {
        try {
            await salvarPlano();
            plano._alterado = false;
            toast('✅ Plano salvo', 'success');
            renderizarEditor();
        } catch (error) {
            toast(tabelaNaoExiste(error)
                ? '❌ Crie a tabela full_planos no Supabase (SQL no topo do full_planos.js)'
                : `❌ Erro ao salvar: ${error.message}`, 'error');
        }
    };

    window.exportarPlanoFullGA = function(id) {
        const p = id ? planos.find(x => Number(x.id) === Number(id)) : plano;
        if (!p) return;
        if (typeof XLSX === 'undefined') {
            toast('❌ Biblioteca de Excel não carregada', 'error');
            return;
        }

        const envio = [
            ...(p.itens || []).map(item => ({ ...item, origem: 'Reposição' })),
            ...(p.novos_itens || []).map(item => ({ ...item, origem: 'Novo item' }))
        ].filter(item => Number(item.quantidade) > 0);

        if (!envio.length) {
            toast('⚠️ Nenhum item com quantidade para enviar', 'warning');
            return;
        }

        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(envio.map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            'Inventory ID': item.inventoryId || '',
            Título: item.titulo || '',
            Quantidade: Number(item.quantidade) || 0,
            Origem: item.origem
        }))), 'Envio Full');

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((p.itens || []).map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            'Inventory ID': item.inventoryId || '',
            Título: item.titulo || '',
            'Vendidos FULL no período': Number(item.vendidos) || 0,
            'Estoque FULL': item.estoqueFull ?? '',
            Enviar: Number(item.quantidade) || 0
        }))), 'Reposição');

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((p.novos_itens || []).map(item => ({
            SKU: item.sku || '',
            MLB: item.mlb,
            Variação: item.variationId || '',
            Título: item.titulo || '',
            'Por que entrou': (item.motivos || []).map(m => ROTULOS_MOTIVO[m] || m).join(' + '),
            'Criado em': item.criadoEm ? formatarDataHora(item.criadoEm) : '',
            'Vendas no período': Number(item.vendasLocal) || 0,
            'Estoque (unid./kits)': item.estoqueMontavel ?? '',
            'Já no FULL': item.jaNoFull ? 'Sim' : 'Não',
            Enviar: Number(item.quantidade) || 0
        }))), 'Novos itens');

        const nomeArquivo = String(p.nome || 'plano_full').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
        XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
    };
})();
