/* ============================================================
   WHEEL TECH · VENDAS VENDEDORES
   ------------------------------------------------------------
   Vendas feitas direto pelos vendedores (balcão, WhatsApp,
   telefone) — fora do Mercado Livre.

   Fluxo:
     1. Cliente: puxa um cliente já cadastrado na NF-e
        (API /nfe/clientes) ou digita um cliente novo.
     2. Produtos: busca no estoque (produtos_estoque) digitando
        nome ou SKU.
     3. Valor: soma automática dos itens, com desconto opcional.
     4. Entrega: Correio, Cora ou Retirada. Correio/Cora usam os
        mesmos campos do envio por correio das Reclamações de
        Clientes (rastreio, embalagem, nome, data, frete).
     5. Finalizar:
          • "Só dar baixa"     → salva a venda e baixa o estoque.
          • "Emitir nota fiscal" → salva, baixa o estoque e abre
            a aba "Emitir Avulsa" da NF-e já preenchida com o
            cliente e os produtos (CFOP / Natureza / Transportadora
            continuam sendo conferidos lá, como em qualquer avulsa).

   A emissão avulsa NÃO baixa estoque de saída por conta própria
   (só a devolução mexe em estoque, ver emitirNFEAvulsa em
   nfe_manager.js), por isso a baixa é feita aqui nos dois casos.

   Segue o mesmo padrão de reclamacoes_clientes.js: tela e modais
   montados via JS (não em index.html).

   SQL da tabela (rodar uma vez no Supabase):

   create table if not exists public.vendas_vendedores (
       id bigserial primary key,
       vendedor text,
       vendedor_username text,
       cliente_nfe_id text,
       cliente_nome text not null,
       cliente_documento text,
       cliente_telefone text,
       cliente_email text,
       cliente_logradouro text,
       cliente_numero text,
       cliente_bairro text,
       cliente_cidade text,
       cliente_uf text,
       cliente_cep text,
       itens jsonb not null default '[]'::jsonb,
       valor_produtos numeric(12,2) not null default 0,
       desconto numeric(12,2) not null default 0,
       valor_total numeric(12,2) not null default 0,
       forma_entrega text not null,              -- correio | cora | retirada
       codigo_rastreio text,
       tipo_embalagem text,
       nome_destinatario text,
       data_postagem date,
       valor_frete numeric(12,2),
       tipo_finalizacao text not null,           -- nota_fiscal | baixa
       estoque_baixado boolean not null default false,
       status text not null default 'concluida', -- concluida | cancelada
       observacoes text,
       cancelado_por text,
       cancelado_em timestamptz,
       criado_em timestamptz not null default now(),
       atualizado_em timestamptz
   );
   create index if not exists vendas_vendedores_criado_em_idx
       on public.vendas_vendedores (criado_em desc);
   ============================================================ */
(function () {
    'use strict';

    const CFG_VV = {
        tabela: 'vendas_vendedores',
        tabelaProdutos: 'produtos_estoque',
        admins: ['andressamiotto', 'ronald', 'leticia'],
        ncmPadrao: '87149990'
    };

    const ENTREGAS_VV = {
        correio: { texto: 'Correio', icone: 'fa-truck' },
        cora: { texto: 'Cora', icone: 'fa-shipping-fast' },
        retirada: { texto: 'Retirada', icone: 'fa-store' }
    };

    const FINALIZACAO_VV = {
        nota_fiscal: { texto: 'Nota fiscal', classe: 'vv-badge-nf' },
        baixa: { texto: 'Só baixa', classe: 'vv-badge-baixa' }
    };

    // ============================================================
    // HELPERS
    // ============================================================

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function norm(v) {
        return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }

    function soDigitos(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function moeda(v) {
        return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function arred(v) {
        return Math.round(Number(v || 0) * 100) / 100;
    }

    function fmtData(v) {
        if (!v) return '—';
        const d = new Date(v);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function fmtDataCurta(iso) {
        if (!iso) return '—';
        const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function valorInput(id) {
        return document.getElementById(id)?.value?.trim() || '';
    }

    function sb() { return window.supabaseClient || null; }

    function usuarioAtual() { return window.currentUser || null; }

    function ehAdmin() {
        const u = usuarioAtual();
        const username = String(u?.username || u?.login || '').toLowerCase();
        return CFG_VV.admins.includes(username) || String(u?.role || '').toLowerCase() === 'administrador';
    }

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') window.showToast(msg, tipo);
    }

    // Os envios por correio daqui aparecem no relatório "Envio de
    // correios" das Reclamações de Clientes (lido direto desta tabela).
    function invalidarRelatorioCorreioVV() {
        if (typeof window.invalidarRelatorioEnviosCorreioRC === 'function') window.invalidarRelatorioEnviosCorreioRC();
    }

    // ============================================================
    // ESTILO
    // ============================================================

    function instalarEstiloVV() {
        if (document.getElementById('vvEstilo')) return;
        const st = document.createElement('style');
        st.id = 'vvEstilo';
        st.textContent = `
            .vv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100050;display:flex;align-items:center;justify-content:center;}
            .vv-overlay.hidden-vv{display:none;}
            .vv-modal{background:#fff;width:95%;max-width:880px;max-height:92vh;overflow-y:auto;border-radius:12px;padding:22px;}
            .vv-modal-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px;}
            .vv-fechar{background:none;border:none;font-size:22px;cursor:pointer;}
            .vv-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;}
            .vv-badge-nf{background:#eaf2ff;color:#0d6efd;}
            .vv-badge-baixa{background:#eef2f7;color:#475569;}
            .vv-badge-cancelada{background:#fde8ea;color:#a61b29;}
            .vv-secao{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,23,42,.05);}
            .vv-secao-titulo{font-size:14px;font-weight:700;color:#1e293b;margin:0 0 12px;display:flex;align-items:center;gap:8px;}
            .vv-secao-titulo i{color:#94a3b8;}
            .vv-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
            .vv-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
            .vv-grid .full,.vv-grid-3 .full{grid-column:1/-1;}
            .vv-grid label,.vv-grid-3 label{display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;}
            .vv-pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
            .vv-pill{position:relative;cursor:pointer;margin:0;}
            .vv-pill input{position:absolute;opacity:0;inset:0;margin:0;width:100%;height:100%;cursor:pointer;}
            .vv-pill span{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:20px;border:1.5px solid #e2e8f0;background:#f8fafc;font-size:12.5px;font-weight:600;color:#64748b;transition:.15s;}
            .vv-pill:hover span{border-color:#cbd5e1;}
            .vv-pill input:checked + span{border-color:#0d6efd;background:#eaf2ff;color:#0d6efd;}
            .vv-subcard{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;}
            .vv-busca{position:relative;}
            .vv-resultados{position:absolute;left:0;right:0;top:100%;z-index:5;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 8px 20px rgba(15,23,42,.12);max-height:260px;overflow-y:auto;display:none;}
            .vv-resultado{padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;gap:10px;}
            .vv-resultado:hover{background:#f1f7ff;}
            .vv-resultado small{color:#64748b;}
            .vv-cliente-sel{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#e3f7e8;border:1px solid #b7e4c4;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:8px;}
            .vv-itens{width:100%;font-size:13px;border-collapse:collapse;margin-top:10px;}
            .vv-itens th{text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;color:#475569;font-size:12px;}
            .vv-itens td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
            .vv-itens input{max-width:110px;}
            .vv-estoque-baixo{color:#a61b29;font-weight:700;}
            .vv-totais{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}
            .vv-totais .vv-total-final{margin-left:auto;text-align:right;}
            .vv-totais .vv-total-final small{display:block;color:#64748b;font-size:11px;}
            .vv-totais .vv-total-final strong{font-size:22px;color:#0f172a;}
            .vv-acoes{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:6px;}
            .vv-det-linha{font-size:13px;margin-bottom:6px;}
            .vv-det-linha strong{color:#334155;}
            #vvTabela th{cursor:default;}
            @media (max-width:640px){.vv-grid,.vv-grid-3{grid-template-columns:1fr;}}
        `;
        document.head.appendChild(st);
    }

    // ============================================================
    // TELA PRINCIPAL
    // ============================================================

    function criarTelaVV() {
        if (document.getElementById('vendasVendedoresSystem')) return;

        const div = document.createElement('div');
        div.id = 'vendasVendedoresSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex;align-items:center;gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px;width:auto;">
                            <span>Vendas Vendedores</span>
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-4">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-hand-holding-usd"></i> Vendas feitas pelos vendedores</h2>
                        <div class="d-flex gap-2 align-items-center">
                            <span class="badge badge-info" id="vvContagem">0</span>
                            <button class="btn btn-primary" onclick="window.abrirNovaVendaVV()">
                                <i class="fas fa-plus"></i> Nova venda
                            </button>
                            <button class="btn btn-outline-success" onclick="window.exportarVendasVendedoresExcel()">
                                <i class="fas fa-file-excel"></i> Exportar Excel
                            </button>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2 align-items-center" style="padding:0 20px 15px;">
                        <button class="btn btn-sm btn-primary active" data-filtro-vv="todas" onclick="window.filtrarVendasVendedores('todas')">Todas</button>
                        <button class="btn btn-sm btn-outline-primary" data-filtro-vv="correio" onclick="window.filtrarVendasVendedores('correio')">Correio</button>
                        <button class="btn btn-sm btn-outline-primary" data-filtro-vv="cora" onclick="window.filtrarVendasVendedores('cora')">Cora</button>
                        <button class="btn btn-sm btn-outline-primary" data-filtro-vv="retirada" onclick="window.filtrarVendasVendedores('retirada')">Retirada</button>
                        <button class="btn btn-sm btn-outline-danger" data-filtro-vv="cancelada" onclick="window.filtrarVendasVendedores('cancelada')">Canceladas</button>
                        <div style="flex:1;min-width:200px;margin-left:auto;">
                            <input type="text" id="vvBusca" class="form-control form-control-sm" placeholder="🔍 Buscar por cliente, produto, SKU, rastreio ou vendedor..." oninput="window.filtrarVendasVendedores()">
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-striped" id="vvTabela">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Data</th>
                                    <th>Cliente</th>
                                    <th>Produtos</th>
                                    <th>Valor</th>
                                    <th>Entrega</th>
                                    <th>Finalização</th>
                                    <th>Vendedor</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="vvTabelaBody">
                                <tr><td colspan="9" class="text-center py-5">Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    function criarModaisVV() {
        if (!document.getElementById('vvModalNova')) {
            const overlay = document.createElement('div');
            overlay.id = 'vvModalNova';
            overlay.className = 'vv-overlay hidden-vv';
            overlay.innerHTML = `
                <div class="vv-modal">
                    <div class="vv-modal-topo">
                        <h3 style="margin:0;"><i class="fas fa-hand-holding-usd"></i> Nova venda</h3>
                        <button class="vv-fechar" onclick="window.fecharNovaVendaVV()">&times;</button>
                    </div>
                    <div id="vvFormCorpo"></div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) window.fecharNovaVendaVV(); });
        }

        if (!document.getElementById('vvModalDetalhes')) {
            const overlay = document.createElement('div');
            overlay.id = 'vvModalDetalhes';
            overlay.className = 'vv-overlay hidden-vv';
            overlay.innerHTML = `
                <div class="vv-modal" style="max-width:720px;">
                    <div class="vv-modal-topo">
                        <h3 style="margin:0;"><i class="fas fa-receipt"></i> Venda <span id="vvDetTitulo"></span></h3>
                        <button class="vv-fechar" onclick="window.fecharDetalhesVendaVV()">&times;</button>
                    </div>
                    <div id="vvDetCorpo"></div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.addEventListener('click', e => { if (e.target === overlay) window.fecharDetalhesVendaVV(); });
        }

        // fecha listas de busca ao clicar fora
        if (!window.__vvCliqueForaInstalado) {
            window.__vvCliqueForaInstalado = true;
            document.addEventListener('click', e => {
                ['vvClienteResultados', 'vvProdutoResultados'].forEach(id => {
                    const lista = document.getElementById(id);
                    if (lista && !lista.parentElement.contains(e.target)) lista.style.display = 'none';
                });
            });
        }
    }

    // ============================================================
    // ABRIR SISTEMA
    // ============================================================

    window.abrirSistemaVendasVendedores = async function () {
        if (!usuarioAtual()) {
            toast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        instalarEstiloVV();
        criarTelaVV();
        criarModaisVV();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('vendasVendedoresSystem');
        } else {
            document.getElementById('menuSystem')?.classList.add('hidden');
        }

        document.getElementById('vendasVendedoresSystem')?.classList.remove('hidden');

        await window.carregarVendasVendedores();
    };

    // ============================================================
    // LISTA DE VENDAS
    // ============================================================

    let vendasCacheVV = [];
    let filtroAtualVV = 'todas';

    window.carregarVendasVendedores = async function () {
        const cli = sb();
        const tbody = document.getElementById('vvTabelaBody');
        if (!cli || !tbody) return;

        try {
            const { data, error } = await cli
                .from(CFG_VV.tabela)
                .select('*')
                .order('criado_em', { ascending: false })
                .limit(1000);
            if (error) throw error;

            vendasCacheVV = data || [];
            renderizarVendasVV();

        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro ao carregar:', error);
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Erro ao carregar: ${esc(error.message)}<br><small>Se for a primeira vez, confira se a tabela <code>${CFG_VV.tabela}</code> já foi criada no Supabase (SQL no topo de vendas_vendedores.js).</small></td></tr>`;
        }
    };

    window.filtrarVendasVendedores = function (novoFiltro) {
        if (novoFiltro) {
            filtroAtualVV = novoFiltro;
            document.querySelectorAll('[data-filtro-vv]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filtroVv === novoFiltro);
            });
        }
        renderizarVendasVV();
    };

    function vendasFiltradasVV() {
        const busca = norm(document.getElementById('vvBusca')?.value);
        return vendasCacheVV.filter(v => {
            if (filtroAtualVV === 'cancelada') {
                if (v.status !== 'cancelada') return false;
            } else if (filtroAtualVV !== 'todas') {
                if (v.forma_entrega !== filtroAtualVV || v.status === 'cancelada') return false;
            }
            if (!busca) return true;
            const itens = Array.isArray(v.itens) ? v.itens : [];
            const texto = norm([
                v.id, v.cliente_nome, v.cliente_documento, v.codigo_rastreio, v.vendedor,
                ...itens.map(i => `${i.nome} ${i.sku}`)
            ].join(' '));
            return texto.includes(busca);
        });
    }

    function resumoItensVV(itens) {
        const lista = Array.isArray(itens) ? itens : [];
        if (!lista.length) return '—';
        const primeiro = `${esc(lista[0].nome)} <small style="color:#94a3b8;">x${Number(lista[0].quantidade || 0)}</small>`;
        return lista.length > 1 ? `${primeiro} <small style="color:#64748b;">+${lista.length - 1}</small>` : primeiro;
    }

    function renderizarVendasVV() {
        const tbody = document.getElementById('vvTabelaBody');
        if (!tbody) return;

        const lista = vendasFiltradasVV();
        const contagem = document.getElementById('vvContagem');
        if (contagem) contagem.textContent = lista.length;

        if (!lista.length) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5 text-muted">Nenhuma venda encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(v => {
            const entrega = ENTREGAS_VV[v.forma_entrega] || { texto: v.forma_entrega || '—', icone: 'fa-question' };
            const fin = v.status === 'cancelada'
                ? { texto: 'Cancelada', classe: 'vv-badge-cancelada' }
                : (FINALIZACAO_VV[v.tipo_finalizacao] || { texto: v.tipo_finalizacao || '—', classe: 'vv-badge-baixa' });
            return `
                <tr>
                    <td><code>${v.id}</code></td>
                    <td>${fmtData(v.criado_em)}</td>
                    <td>${esc(v.cliente_nome || '—')}${v.cliente_documento ? `<br><small style="color:#94a3b8;">${esc(v.cliente_documento)}</small>` : ''}</td>
                    <td>${resumoItensVV(v.itens)}</td>
                    <td><strong>${moeda(v.valor_total)}</strong></td>
                    <td><i class="fas ${entrega.icone}" style="color:#94a3b8;"></i> ${esc(entrega.texto)}${v.codigo_rastreio ? `<br><small><code>${esc(v.codigo_rastreio)}</code></small>` : ''}</td>
                    <td><span class="vv-badge ${fin.classe}">${esc(fin.texto)}</span></td>
                    <td>${esc(v.vendedor || '—')}</td>
                    <td><button class="btn btn-sm btn-outline-primary" onclick="window.abrirDetalhesVendaVV(${v.id})"><i class="fas fa-eye"></i></button></td>
                </tr>
            `;
        }).join('');
    }

    window.exportarVendasVendedoresExcel = function () {
        const lista = vendasFiltradasVV();
        if (!lista.length) {
            toast('Nenhuma venda para exportar', 'warning');
            return;
        }
        if (typeof XLSX === 'undefined') {
            toast('Biblioteca de Excel não carregada', 'error');
            return;
        }
        const dados = lista.map(v => ({
            'Venda': v.id,
            'Data': fmtData(v.criado_em),
            'Vendedor': v.vendedor || '',
            'Cliente': v.cliente_nome || '',
            'CPF/CNPJ': v.cliente_documento || '',
            'Telefone': v.cliente_telefone || '',
            'Produtos': (Array.isArray(v.itens) ? v.itens : []).map(i => `${i.sku} x${i.quantidade}`).join(' | '),
            'Valor produtos': Number(v.valor_produtos || 0),
            'Desconto': Number(v.desconto || 0),
            'Valor total': Number(v.valor_total || 0),
            'Entrega': (ENTREGAS_VV[v.forma_entrega] || {}).texto || v.forma_entrega || '',
            'Rastreio': v.codigo_rastreio || '',
            'Embalagem': v.tipo_embalagem || '',
            'Destinatário': v.nome_destinatario || '',
            'Data postagem': v.data_postagem ? fmtDataCurta(v.data_postagem) : '',
            'Frete': v.valor_frete ?? '',
            'Finalização': (FINALIZACAO_VV[v.tipo_finalizacao] || {}).texto || '',
            'Status': v.status === 'cancelada' ? 'Cancelada' : 'Concluída'
        }));
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
        XLSX.writeFile(wb, `vendas_vendedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ============================================================
    // DADOS DE APOIO: CLIENTES (NF-e) E PRODUTOS (ESTOQUE)
    // ============================================================

    let clientesNFeVV = null;
    let produtosVV = null;

    async function carregarClientesNFeVV(forcar) {
        if (clientesNFeVV && !forcar) return clientesNFeVV;
        try {
            const resp = await fetch(`${window.API_BASE_URL}/nfe/clientes`, {
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            clientesNFeVV = Array.isArray(data.clientes) ? data.clientes : [];
        } catch (error) {
            console.warn('⚠️ [Vendas Vendedores] Não deu pra carregar clientes da NF-e:', error);
            clientesNFeVV = [];
            toast('⚠️ Não foi possível carregar os clientes cadastrados — dá pra digitar um cliente novo.', 'warning');
        }
        return clientesNFeVV;
    }

    // Sempre lido do banco (não do cache produtosEstoque da Gestão de
    // Estoque): o vendedor precisa ver o saldo real na hora da venda.
    async function carregarProdutosVV() {
        const cli = sb();
        const todos = [];
        let inicio = 0;
        while (true) {
            const { data, error } = await cli
                .from(CFG_VV.tabelaProdutos)
                .select('id, sku, nome, preco, quantidade, dados_extra')
                .order('nome', { ascending: true })
                .range(inicio, inicio + 999);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < 1000) break;
            inicio += 1000;
        }
        produtosVV = todos.filter(p => !(p.dados_extra && p.dados_extra.inativo === true));
        return produtosVV;
    }

    // ============================================================
    // NOVA VENDA — FORMULÁRIO
    // ============================================================

    let clienteSelecionadoVV = null; // cliente vindo do cadastro da NF-e
    let modoClienteVV = 'cadastrado';
    let itensVV = [];
    let salvandoVV = false;

    window.abrirNovaVendaVV = async function () {
        criarModaisVV();
        clienteSelecionadoVV = null;
        modoClienteVV = 'cadastrado';
        itensVV = [];

        const overlay = document.getElementById('vvModalNova');
        const corpo = document.getElementById('vvFormCorpo');
        overlay.classList.remove('hidden-vv');
        corpo.innerHTML = `<div class="text-center py-4"><span class="spinner"></span> Carregando clientes e produtos...</div>`;

        try {
            await Promise.all([carregarClientesNFeVV(), carregarProdutosVV()]);
        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro carregando produtos:', error);
            corpo.innerHTML = `<div class="text-danger py-4">Erro ao carregar produtos: ${esc(error.message)}</div>`;
            return;
        }

        renderizarFormVV();
    };

    window.fecharNovaVendaVV = function () {
        if (salvandoVV) return;
        document.getElementById('vvModalNova')?.classList.add('hidden-vv');
    };

    function renderizarFormVV() {
        const corpo = document.getElementById('vvFormCorpo');
        if (!corpo) return;

        corpo.innerHTML = `
            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-user"></i> Cliente</h5>
                <div class="vv-pills">
                    <label class="vv-pill"><input type="radio" name="vvModoCliente" value="cadastrado" checked onchange="window.trocarModoClienteVV(this.value)"><span><i class="fas fa-search"></i> Puxar cliente cadastrado</span></label>
                    <label class="vv-pill"><input type="radio" name="vvModoCliente" value="novo" onchange="window.trocarModoClienteVV(this.value)"><span><i class="fas fa-user-plus"></i> Cliente novo</span></label>
                </div>

                <div id="vvClienteCadastrado">
                    <div class="vv-busca">
                        <input type="text" id="vvClienteBusca" class="form-control" autocomplete="off"
                               placeholder="Digite nome, CPF ou CNPJ do cliente..." oninput="window.buscarClienteVV(this.value)">
                        <div class="vv-resultados" id="vvClienteResultados"></div>
                    </div>
                    <div id="vvClienteSelecionado"></div>
                </div>

                <div id="vvClienteNovo" class="hidden">
                    <div class="vv-grid">
                        <div class="full"><label>Nome / Razão social *</label><input type="text" id="vvCliNome" class="form-control form-control-sm"></div>
                        <div><label>CPF / CNPJ <span style="font-weight:400;color:#94a3b8;">(obrigatório para nota fiscal)</span></label><input type="text" id="vvCliDocumento" class="form-control form-control-sm" inputmode="numeric"></div>
                        <div><label>Telefone</label><input type="text" id="vvCliTelefone" class="form-control form-control-sm"></div>
                        <div class="full"><label>E-mail</label><input type="email" id="vvCliEmail" class="form-control form-control-sm"></div>
                    </div>
                    <div class="vv-grid-3" style="margin-top:10px;">
                        <div><label>CEP</label><input type="text" id="vvCliCep" class="form-control form-control-sm" inputmode="numeric"></div>
                        <div class="full" style="grid-column:span 2;"><label>Logradouro</label><input type="text" id="vvCliLogradouro" class="form-control form-control-sm"></div>
                        <div><label>Número</label><input type="text" id="vvCliNumero" class="form-control form-control-sm"></div>
                        <div><label>Bairro</label><input type="text" id="vvCliBairro" class="form-control form-control-sm"></div>
                        <div><label>Cidade</label><input type="text" id="vvCliCidade" class="form-control form-control-sm"></div>
                        <div><label>UF</label><input type="text" id="vvCliUf" class="form-control form-control-sm" maxlength="2" style="text-transform:uppercase;"></div>
                    </div>
                    <small style="display:block;color:#94a3b8;font-size:11px;margin-top:8px;">Com CPF/CNPJ, o cliente também é salvo no cadastro de clientes da NF-e quando você emitir a nota.</small>
                </div>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-box-open"></i> Produtos</h5>
                <div class="vv-busca">
                    <input type="text" id="vvProdutoBusca" class="form-control" autocomplete="off"
                           placeholder="Digite o nome ou SKU do produto..." oninput="window.buscarProdutoVV(this.value)">
                    <div class="vv-resultados" id="vvProdutoResultados"></div>
                </div>
                <div id="vvItens"></div>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-coins"></i> Valor da venda</h5>
                <div class="vv-totais">
                    <div><label style="font-size:11px;font-weight:600;color:#64748b;">Produtos</label><div id="vvSubtotal" style="font-weight:700;">${moeda(0)}</div></div>
                    <div><label style="font-size:11px;font-weight:600;color:#64748b;display:block;">Desconto (R$)</label><input type="number" id="vvDesconto" class="form-control form-control-sm" step="0.01" min="0" placeholder="0,00" style="max-width:140px;" oninput="window.atualizarTotaisVV()"></div>
                    <div class="vv-total-final"><small>Total da venda</small><strong id="vvTotal">${moeda(0)}</strong></div>
                </div>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-shipping-fast"></i> Entrega</h5>
                <div class="vv-pills">
                    <label class="vv-pill"><input type="radio" name="vvEntrega" value="correio" checked onchange="window.trocarEntregaVV()"><span><i class="fas fa-truck"></i> Envio por correio</span></label>
                    <label class="vv-pill"><input type="radio" name="vvEntrega" value="cora" onchange="window.trocarEntregaVV()"><span><i class="fas fa-shipping-fast"></i> Envio por Cora</span></label>
                    <label class="vv-pill"><input type="radio" name="vvEntrega" value="retirada" onchange="window.trocarEntregaVV()"><span><i class="fas fa-store"></i> Retirada</span></label>
                </div>

                <div id="vvDadosEnvio" class="vv-subcard">
                    <div class="vv-grid">
                        <div>
                            <label>Código de rastreio</label>
                            <input type="text" id="vvEnvioRastreio" class="form-control form-control-sm" placeholder="AA123456789BR">
                        </div>
                        <div>
                            <label>Tipo de embalagem</label>
                            <input type="text" id="vvEnvioEmbalagem" class="form-control form-control-sm" placeholder="Ex: caixa pequena">
                        </div>
                        <div>
                            <label>Nome do cliente</label>
                            <input type="text" id="vvEnvioCliente" class="form-control form-control-sm" placeholder="Nome completo">
                        </div>
                        <div>
                            <label>Data de postagem</label>
                            <input type="date" id="vvEnvioData" class="form-control form-control-sm">
                        </div>
                        <div class="full">
                            <label>Valor do frete <span style="font-weight:400;color:#94a3b8;">(opcional — geralmente só se sabe no mês seguinte)</span></label>
                            <input type="number" id="vvEnvioFrete" class="form-control form-control-sm" step="0.01" min="0" placeholder="Preencher depois se ainda não souber">
                        </div>
                    </div>
                </div>

                <div id="vvDadosRetirada" class="vv-subcard hidden">
                    <small style="color:#64748b;"><i class="fas fa-info-circle"></i> O cliente retira na loja — não há dados de envio.</small>
                </div>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-sticky-note"></i> Observações</h5>
                <textarea id="vvObservacoes" class="form-control" rows="2" placeholder="Opcional"></textarea>
            </div>

            <div class="vv-acoes">
                <button type="button" class="btn btn-outline-secondary" onclick="window.fecharNovaVendaVV()">Cancelar</button>
                <button type="button" class="btn btn-secondary" id="vvBtnBaixa" onclick="window.finalizarVendaVV('baixa')">
                    <i class="fas fa-box"></i> Só dar baixa
                </button>
                <button type="button" class="btn btn-primary" id="vvBtnNF" onclick="window.finalizarVendaVV('nota_fiscal')">
                    <i class="fas fa-file-invoice"></i> Emitir nota fiscal
                </button>
            </div>
        `;

        renderizarItensVV();
    }

    window.trocarModoClienteVV = function (modo) {
        modoClienteVV = modo;
        document.getElementById('vvClienteCadastrado')?.classList.toggle('hidden', modo !== 'cadastrado');
        document.getElementById('vvClienteNovo')?.classList.toggle('hidden', modo !== 'novo');
        sincronizarNomeEnvioVV();
    };

    window.trocarEntregaVV = function () {
        const entrega = document.querySelector('input[name="vvEntrega"]:checked')?.value;
        document.getElementById('vvDadosEnvio')?.classList.toggle('hidden', entrega === 'retirada');
        document.getElementById('vvDadosRetirada')?.classList.toggle('hidden', entrega !== 'retirada');
    };

    // Preenche o "Nome do cliente" do envio com o cliente da venda,
    // só se o vendedor ainda não tiver digitado outro nome ali.
    function sincronizarNomeEnvioVV() {
        const campo = document.getElementById('vvEnvioCliente');
        if (!campo) return;
        const nome = modoClienteVV === 'cadastrado' ? (clienteSelecionadoVV?.nome || '') : valorInput('vvCliNome');
        if (!campo.value || campo.dataset.auto === '1') {
            campo.value = nome;
            campo.dataset.auto = '1';
        }
    }

    document.addEventListener('input', e => {
        if (e.target?.id === 'vvEnvioCliente') e.target.dataset.auto = '0';
        if (e.target?.id === 'vvCliNome') sincronizarNomeEnvioVV();
    });

    // ------------------------------------------------------------
    // Cliente cadastrado
    // ------------------------------------------------------------

    window.buscarClienteVV = function (texto) {
        const lista = document.getElementById('vvClienteResultados');
        if (!lista) return;
        const termo = norm(texto);
        const termoDigitos = soDigitos(texto);
        if (termo.length < 2) {
            lista.style.display = 'none';
            return;
        }

        const encontrados = (clientesNFeVV || []).filter(c =>
            norm(c.nome).includes(termo) ||
            (termoDigitos.length >= 3 && soDigitos(c.documento).includes(termoDigitos))
        ).slice(0, 30);

        lista.innerHTML = encontrados.length
            ? encontrados.map(c => `
                <div class="vv-resultado" onclick="window.selecionarClienteVV('${esc(c.id)}')">
                    <span><strong>${esc(c.nome)}</strong><br><small>${esc(c.documento || '')}</small></span>
                    <small>${esc(c.cidade || '')}${c.uf ? '/' + esc(c.uf) : ''}</small>
                </div>`).join('')
            : `<div class="vv-resultado" style="cursor:default;"><small>Nenhum cliente encontrado. Use "Cliente novo".</small></div>`;
        lista.style.display = 'block';
    };

    window.selecionarClienteVV = function (id) {
        const cliente = (clientesNFeVV || []).find(c => String(c.id) === String(id));
        if (!cliente) return;
        clienteSelecionadoVV = cliente;

        const busca = document.getElementById('vvClienteBusca');
        const lista = document.getElementById('vvClienteResultados');
        if (busca) busca.value = '';
        if (lista) lista.style.display = 'none';

        const endereco = [cliente.logradouro, cliente.numero, cliente.bairro, cliente.cidade && `${cliente.cidade}/${cliente.uf || ''}`]
            .filter(Boolean).join(', ');

        document.getElementById('vvClienteSelecionado').innerHTML = `
            <div class="vv-cliente-sel">
                <div>
                    <strong><i class="fas fa-check-circle"></i> ${esc(cliente.nome)}</strong>
                    <div style="color:#475569;margin-top:2px;">${esc(cliente.documento || '')}${endereco ? ' · ' + esc(endereco) : ''}</div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.limparClienteVV()">Trocar</button>
            </div>
        `;
        sincronizarNomeEnvioVV();
    };

    window.limparClienteVV = function () {
        clienteSelecionadoVV = null;
        const sel = document.getElementById('vvClienteSelecionado');
        if (sel) sel.innerHTML = '';
        document.getElementById('vvClienteBusca')?.focus();
        sincronizarNomeEnvioVV();
    };

    // ------------------------------------------------------------
    // Produtos
    // ------------------------------------------------------------

    window.buscarProdutoVV = function (texto) {
        const lista = document.getElementById('vvProdutoResultados');
        if (!lista) return;
        const termo = norm(texto);
        if (termo.length < 2) {
            lista.style.display = 'none';
            return;
        }

        // todas as palavras digitadas precisam aparecer (nome ou SKU)
        const palavras = termo.split(/\s+/).filter(Boolean);
        const encontrados = (produtosVV || []).filter(p => {
            const alvo = norm(`${p.nome} ${p.sku}`);
            return palavras.every(w => alvo.includes(w));
        }).slice(0, 40);

        lista.innerHTML = encontrados.length
            ? encontrados.map(p => `
                <div class="vv-resultado" onclick="window.adicionarProdutoVV(${p.id})">
                    <span><strong>${esc(p.nome)}</strong><br><small>${esc(p.sku || '')}</small></span>
                    <span style="text-align:right;white-space:nowrap;">${moeda(p.preco)}<br><small class="${Number(p.quantidade) <= 0 ? 'vv-estoque-baixo' : ''}">Estoque: ${Number(p.quantidade || 0)}</small></span>
                </div>`).join('')
            : `<div class="vv-resultado" style="cursor:default;"><small>Nenhum produto encontrado.</small></div>`;
        lista.style.display = 'block';
    };

    window.adicionarProdutoVV = function (produtoId) {
        const produto = (produtosVV || []).find(p => String(p.id) === String(produtoId));
        if (!produto) return;

        const existente = itensVV.find(i => String(i.produto_id) === String(produto.id));
        if (existente) {
            existente.quantidade += 1;
        } else {
            itensVV.push({
                produto_id: produto.id,
                sku: produto.sku || '',
                nome: produto.nome || 'Produto',
                quantidade: 1,
                valor_unitario: arred(produto.preco),
                estoque_atual: Number(produto.quantidade || 0)
            });
        }

        const busca = document.getElementById('vvProdutoBusca');
        const lista = document.getElementById('vvProdutoResultados');
        if (busca) { busca.value = ''; busca.focus(); }
        if (lista) lista.style.display = 'none';

        renderizarItensVV();
    };

    window.alterarItemVV = function (idx, campo, valor) {
        const item = itensVV[idx];
        if (!item) return;
        if (campo === 'quantidade') item.quantidade = Math.max(1, Math.floor(Number(valor) || 1));
        if (campo === 'valor_unitario') item.valor_unitario = Math.max(0, arred(valor));
        renderizarItensVV(true);
    };

    window.removerItemVV = function (idx) {
        itensVV.splice(idx, 1);
        renderizarItensVV();
    };

    // apenasValores: re-render sem recriar os inputs (para não perder o foco ao digitar)
    function renderizarItensVV(apenasValores) {
        const container = document.getElementById('vvItens');
        if (!container) return;

        if (apenasValores && container.querySelector('table')) {
            itensVV.forEach((item, idx) => {
                const sub = document.getElementById(`vvItemSub${idx}`);
                if (sub) sub.textContent = moeda(item.quantidade * item.valor_unitario);
                const est = document.getElementById(`vvItemEst${idx}`);
                if (est) est.classList.toggle('vv-estoque-baixo', item.quantidade > item.estoque_atual);
            });
            window.atualizarTotaisVV();
            return;
        }

        if (!itensVV.length) {
            container.innerHTML = '<small style="display:block;color:#94a3b8;margin-top:10px;">Nenhum produto adicionado ainda.</small>';
            window.atualizarTotaisVV();
            return;
        }

        container.innerHTML = `
            <table class="vv-itens">
                <thead>
                    <tr><th>Produto</th><th>Estoque</th><th>Qtd</th><th>Valor unit. (R$)</th><th>Subtotal</th><th></th></tr>
                </thead>
                <tbody>
                    ${itensVV.map((item, idx) => `
                        <tr>
                            <td><strong>${esc(item.nome)}</strong><br><small style="color:#94a3b8;">${esc(item.sku)}</small></td>
                            <td id="vvItemEst${idx}" class="${item.quantidade > item.estoque_atual ? 'vv-estoque-baixo' : ''}">${item.estoque_atual}</td>
                            <td><input type="number" class="form-control form-control-sm" min="1" step="1" value="${item.quantidade}" oninput="window.alterarItemVV(${idx}, 'quantidade', this.value)"></td>
                            <td><input type="number" class="form-control form-control-sm" min="0" step="0.01" value="${item.valor_unitario.toFixed(2)}" oninput="window.alterarItemVV(${idx}, 'valor_unitario', this.value)"></td>
                            <td id="vvItemSub${idx}">${moeda(item.quantidade * item.valor_unitario)}</td>
                            <td><button type="button" class="btn btn-sm btn-outline-danger" onclick="window.removerItemVV(${idx})"><i class="fas fa-trash"></i></button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        window.atualizarTotaisVV();
    }

    function calcularTotaisVV() {
        const subtotal = arred(itensVV.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));
        const desconto = Math.min(subtotal, Math.max(0, arred(valorInput('vvDesconto'))));
        return { subtotal, desconto, total: arred(subtotal - desconto) };
    }

    window.atualizarTotaisVV = function () {
        const { subtotal, total } = calcularTotaisVV();
        const elSub = document.getElementById('vvSubtotal');
        const elTot = document.getElementById('vvTotal');
        if (elSub) elSub.textContent = moeda(subtotal);
        if (elTot) elTot.textContent = moeda(total);
    };

    // ============================================================
    // FINALIZAR VENDA
    // ============================================================

    function lerClienteFormVV() {
        if (modoClienteVV === 'cadastrado') {
            const c = clienteSelecionadoVV;
            if (!c) return null;
            return {
                cliente_nfe_id: String(c.id),
                cliente_nome: c.nome || '',
                cliente_documento: soDigitos(c.documento) || null,
                cliente_telefone: c.telefone || null,
                cliente_email: c.email || null,
                cliente_logradouro: c.logradouro || c.endereco || null,
                cliente_numero: c.numero || null,
                cliente_bairro: c.bairro || null,
                cliente_cidade: c.cidade || null,
                cliente_uf: c.uf || null,
                cliente_cep: soDigitos(c.cep) || null
            };
        }
        const nome = valorInput('vvCliNome');
        if (!nome) return null;
        return {
            cliente_nfe_id: null,
            cliente_nome: nome,
            cliente_documento: soDigitos(valorInput('vvCliDocumento')) || null,
            cliente_telefone: valorInput('vvCliTelefone') || null,
            cliente_email: valorInput('vvCliEmail') || null,
            cliente_logradouro: valorInput('vvCliLogradouro') || null,
            cliente_numero: valorInput('vvCliNumero') || null,
            cliente_bairro: valorInput('vvCliBairro') || null,
            cliente_cidade: valorInput('vvCliCidade') || null,
            cliente_uf: valorInput('vvCliUf').toUpperCase() || null,
            cliente_cep: soDigitos(valorInput('vvCliCep')) || null
        };
    }

    // Cliente novo + nota fiscal: precisa existir no cadastro oficial
    // da NF-e (API externa). Usa salvarClienteNoBanco do nfe_manager.js,
    // que já evita duplicar pelo CPF/CNPJ.
    async function garantirClienteNFeVV(cliente) {
        if (cliente.cliente_nfe_id) return cliente.cliente_nfe_id;

        if (typeof salvarClienteNoBanco !== 'function') {
            throw new Error('Cadastro de clientes da NF-e não está disponível nesta tela.');
        }

        const resultado = await salvarClienteNoBanco({
            nome: cliente.cliente_nome,
            documento: cliente.cliente_documento,
            endereco: cliente.cliente_logradouro || '',
            numero: cliente.cliente_numero || 'S/N',
            bairro: cliente.cliente_bairro || '',
            cidade: cliente.cliente_cidade || '',
            uf: cliente.cliente_uf || '',
            cep: cliente.cliente_cep || ''
        });
        if (!resultado?.success) {
            throw new Error(resultado?.error || 'Não foi possível cadastrar o cliente na NF-e.');
        }

        const id = resultado.cliente?.id;
        if (id) return String(id);

        // a API nem sempre devolve o id no POST — procura pelo documento
        const lista = await carregarClientesNFeVV(true);
        const achado = lista.find(c => soDigitos(c.documento) === cliente.cliente_documento);
        return achado ? String(achado.id) : null;
    }

    window.finalizarVendaVV = async function (tipo) {
        if (salvandoVV) return;

        const cliente = lerClienteFormVV();
        if (!cliente) {
            toast(modoClienteVV === 'cadastrado' ? 'Selecione um cliente cadastrado (ou use "Cliente novo").' : 'Informe o nome do cliente.', 'warning');
            return;
        }
        if (!itensVV.length) {
            toast('Adicione pelo menos um produto.', 'warning');
            document.getElementById('vvProdutoBusca')?.focus();
            return;
        }

        if (tipo === 'nota_fiscal') {
            const doc = cliente.cliente_documento || '';
            if (doc.length !== 11 && doc.length !== 14) {
                toast('Para emitir nota fiscal, o cliente precisa de CPF (11 dígitos) ou CNPJ (14 dígitos).', 'warning');
                return;
            }
            if (!cliente.cliente_nfe_id && (!cliente.cliente_cidade || !cliente.cliente_uf)) {
                toast('Para emitir nota fiscal, preencha pelo menos cidade e UF do cliente.', 'warning');
                return;
            }
        }

        const entrega = document.querySelector('input[name="vvEntrega"]:checked')?.value || 'correio';
        const envio = entrega === 'retirada'
            ? { codigo_rastreio: null, tipo_embalagem: null, nome_destinatario: null, data_postagem: null, valor_frete: null }
            : {
                codigo_rastreio: valorInput('vvEnvioRastreio') || null,
                tipo_embalagem: valorInput('vvEnvioEmbalagem') || null,
                nome_destinatario: valorInput('vvEnvioCliente') || null,
                data_postagem: valorInput('vvEnvioData') || null,
                valor_frete: valorInput('vvEnvioFrete') ? arred(valorInput('vvEnvioFrete')) : null
            };

        const semEstoque = itensVV.filter(i => i.quantidade > i.estoque_atual);
        if (semEstoque.length) {
            const nomes = semEstoque.map(i => `• ${i.nome} (estoque ${i.estoque_atual}, venda ${i.quantidade})`).join('\n');
            if (!confirm(`Estes produtos têm menos estoque do que a quantidade vendida:\n\n${nomes}\n\nO estoque vai ficar negativo. Continuar mesmo assim?`)) return;
        }

        const { subtotal, desconto, total } = calcularTotaisVV();
        const u = usuarioAtual();

        salvandoVV = true;
        const btnBaixa = document.getElementById('vvBtnBaixa');
        const btnNF = document.getElementById('vvBtnNF');
        const btnAtivo = tipo === 'nota_fiscal' ? btnNF : btnBaixa;
        const textoOriginal = btnAtivo?.innerHTML;
        if (btnBaixa) btnBaixa.disabled = true;
        if (btnNF) btnNF.disabled = true;
        if (btnAtivo) btnAtivo.innerHTML = '<span class="spinner"></span> Salvando...';

        try {
            if (tipo === 'nota_fiscal') {
                cliente.cliente_nfe_id = await garantirClienteNFeVV(cliente);
            }

            const registro = {
                vendedor: u?.name || u?.username || null,
                vendedor_username: u?.username || null,
                ...cliente,
                itens: itensVV.map(i => ({
                    produto_id: i.produto_id,
                    sku: i.sku,
                    nome: i.nome,
                    quantidade: i.quantidade,
                    valor_unitario: i.valor_unitario
                })),
                valor_produtos: subtotal,
                desconto,
                valor_total: total,
                forma_entrega: entrega,
                ...envio,
                tipo_finalizacao: tipo,
                observacoes: valorInput('vvObservacoes') || null
            };

            const cli = sb();
            const { data: venda, error } = await cli
                .from(CFG_VV.tabela)
                .insert([registro])
                .select()
                .single();
            if (error) throw error;

            if (entrega === 'correio') invalidarRelatorioCorreioVV();

            const resultadoBaixa = await baixarEstoqueVendaVV(venda);

            salvandoVV = false;
            window.fecharNovaVendaVV();
            await window.carregarVendasVendedores();

            if (resultadoBaixa.erros.length) {
                toast(`⚠️ Venda #${venda.id} salva, mas alguns produtos não baixaram: ${resultadoBaixa.erros.join('; ')}`, 'warning');
            } else {
                toast(`✅ Venda #${venda.id} salva e estoque baixado.`, 'success');
            }

            if (tipo === 'nota_fiscal') {
                await abrirNFeAvulsaDaVendaVV(venda);
            }

        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro ao finalizar venda:', error);
            toast('❌ Erro ao salvar a venda: ' + error.message, 'error');
        } finally {
            salvandoVV = false;
            if (btnBaixa) btnBaixa.disabled = false;
            if (btnNF) btnNF.disabled = false;
            if (btnAtivo && textoOriginal) btnAtivo.innerHTML = textoOriginal;
        }
    };

    // ============================================================
    // ESTOQUE
    //
    // Mesmo padrão do resto do sistema: grava o novo saldo em
    // produtos_estoque, depois registra o histórico com
    // window.registrarMovimentacao (que lê o saldo real do banco), e
    // por fim sincroniza os anúncios do ML pela rotina da NF-e.
    // ============================================================

    async function movimentarEstoqueVV(venda, sentido) {
        const cli = sb();
        const itens = Array.isArray(venda.itens) ? venda.itens : [];
        const referencia = `VV-${venda.id}`;
        const sincronizar = [];
        const erros = [];

        for (const item of itens) {
            const qtd = Number(item.quantidade || 0);
            if (!item.produto_id || qtd <= 0) continue;
            try {
                const { data: produto, error: erroLer } = await cli
                    .from(CFG_VV.tabelaProdutos)
                    .select('id, sku, quantidade')
                    .eq('id', item.produto_id)
                    .maybeSingle();
                if (erroLer || !produto) throw erroLer || new Error('produto não encontrado');

                const novoSaldo = Number(produto.quantidade || 0) + (sentido === 'entrada' ? qtd : -qtd);
                const { error: erroUpd } = await cli
                    .from(CFG_VV.tabelaProdutos)
                    .update({ quantidade: novoSaldo, updated_at: new Date().toISOString() })
                    .eq('id', produto.id);
                if (erroUpd) throw erroUpd;

                if (typeof window.registrarMovimentacao === 'function') {
                    await window.registrarMovimentacao(
                        produto.id,
                        sentido,
                        qtd,
                        sentido === 'entrada' ? `${referencia}-CANCELADA` : referencia,
                        sentido === 'entrada' ? 'cancelamento_venda' : 'venda'
                    );
                }

                sincronizar.push({ produto_id: produto.id, sku: produto.sku, encontrado: true });
            } catch (error) {
                erros.push(`${item.sku || item.produto_id}: ${error.message}`);
            }
        }

        if (sincronizar.length && typeof sincronizarProdutosBaixadosNFE === 'function') {
            try {
                await sincronizarProdutosBaixadosNFE(sincronizar);
            } catch (error) {
                console.warn('⚠️ [Vendas Vendedores] Falha ao sincronizar anúncios:', error);
            }
        }

        if (sincronizar.length && typeof window.carregarProdutosEstoque === 'function') {
            window.carregarProdutosEstoque().catch(() => {});
        }

        return { movimentados: sincronizar.length, erros };
    }

    async function baixarEstoqueVendaVV(venda) {
        const resultado = await movimentarEstoqueVV(venda, 'saida');
        if (resultado.movimentados) {
            await sb().from(CFG_VV.tabela)
                .update({ estoque_baixado: true, atualizado_em: new Date().toISOString() })
                .eq('id', venda.id);
        }
        return resultado;
    }

    // ============================================================
    // NOTA FISCAL — abre a NF-e avulsa já preenchida
    // (mesmo caminho da devolução em nfe_manager.js)
    // ============================================================

    async function abrirNFeAvulsaDaVendaVV(venda) {
        if (typeof window.abrirSistemaNFE !== 'function' || typeof window.mostrarAbaNFE !== 'function') {
            toast('⚠️ Módulo de NF-e não disponível. Emita a nota pela aba Emissão NF-e → Emitir Avulsa.', 'warning');
            return;
        }

        try {
            await window.abrirSistemaNFE();
            await window.mostrarAbaNFE('avulsa');

            // cliente
            const clientes = Array.isArray(window._clientesAvulsaNFE) ? window._clientesAvulsaNFE : [];
            const cliente =
                clientes.find(c => String(c.id) === String(venda.cliente_nfe_id)) ||
                clientes.find(c => soDigitos(c.documento) === soDigitos(venda.cliente_documento));
            if (cliente && typeof window.selecionarClienteAvulsaNFE === 'function') {
                window.selecionarClienteAvulsaNFE(cliente.id);
            } else {
                toast('⚠️ Não achei o cliente no cadastro da NF-e — selecione manualmente antes de emitir.', 'warning');
            }

            // produtos — desconto distribuído proporcionalmente nos
            // valores unitários, para o total da nota bater com a venda
            const itens = Array.isArray(venda.itens) ? venda.itens : [];
            const subtotal = Number(venda.valor_produtos || 0);
            const fator = subtotal > 0 ? Number(venda.valor_total || 0) / subtotal : 1;
            const estoque = Array.isArray(window._produtosEstoqueAvulsaNFE) ? window._produtosEstoqueAvulsaNFE : [];

            const itensNF = [];
            for (const item of itens) {
                let ncm = CFG_VV.ncmPadrao;
                try {
                    if (typeof buscarNCMporSKU === 'function' && item.sku) {
                        ncm = (await buscarNCMporSKU(item.sku)) || ncm;
                    }
                } catch (_) { /* fica o NCM padrão */ }

                const produtoCadastro = estoque.find(p => String(p.id) === String(item.produto_id));
                itensNF.push({
                    produto_id: item.produto_id,
                    nome: item.nome,
                    sku: item.sku || 'SEM_SKU',
                    quantidade: Number(item.quantidade || 1),
                    valor_unitario: arred(Number(item.valor_unitario || 0) * fator),
                    ncm,
                    estoque_atual: Number(produtoCadastro?.quantidade || 0)
                });
            }

            window._itensAvulsaNFE = itensNF;
            if (typeof window.renderizarProdutosAvulsaNFE === 'function') window.renderizarProdutosAvulsaNFE();
            if (typeof window.atualizarProdutosJSONAvulsaNFE === 'function') window.atualizarProdutosJSONAvulsaNFE();

            // retirada = sem frete (9)
            if (venda.forma_entrega === 'retirada') {
                const modFrete = document.getElementById('avulsaModFrete');
                if (modFrete) modFrete.value = '9';
            }

            document.getElementById('abaAvulsa')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            toast(`🧾 NF-e da venda #${venda.id} preparada. Confira CFOP, Natureza e Transportadora e clique em Emitir NF-e.`, 'success');

        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro preparando NF-e:', error);
            toast('⚠️ Venda salva, mas não deu pra preparar a NF-e: ' + error.message, 'warning');
        }
    }

    // ============================================================
    // DETALHES / CANCELAMENTO
    // ============================================================

    window.abrirDetalhesVendaVV = function (id) {
        const v = vendasCacheVV.find(x => String(x.id) === String(id));
        if (!v) return;
        criarModaisVV();

        const entrega = ENTREGAS_VV[v.forma_entrega] || { texto: v.forma_entrega || '—', icone: 'fa-question' };
        const fin = FINALIZACAO_VV[v.tipo_finalizacao] || { texto: v.tipo_finalizacao || '—', classe: 'vv-badge-baixa' };
        const itens = Array.isArray(v.itens) ? v.itens : [];
        const endereco = [v.cliente_logradouro, v.cliente_numero, v.cliente_bairro, v.cliente_cidade && `${v.cliente_cidade}/${v.cliente_uf || ''}`, v.cliente_cep]
            .filter(Boolean).join(', ');
        const cancelada = v.status === 'cancelada';

        document.getElementById('vvDetTitulo').textContent = `#${v.id}`;
        document.getElementById('vvDetCorpo').innerHTML = `
            <div class="d-flex flex-wrap gap-2 mb-3">
                <span class="vv-badge ${fin.classe}">${esc(fin.texto)}</span>
                ${cancelada ? `<span class="vv-badge vv-badge-cancelada">Cancelada${v.cancelado_por ? ' por ' + esc(v.cancelado_por) : ''}</span>` : ''}
                <span style="font-size:12px;color:#64748b;">${fmtData(v.criado_em)} · ${esc(v.vendedor || '—')}</span>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-user"></i> Cliente</h5>
                <div class="vv-det-linha"><strong>${esc(v.cliente_nome)}</strong> ${v.cliente_documento ? '· ' + esc(v.cliente_documento) : ''}</div>
                ${v.cliente_telefone || v.cliente_email ? `<div class="vv-det-linha">${esc([v.cliente_telefone, v.cliente_email].filter(Boolean).join(' · '))}</div>` : ''}
                ${endereco ? `<div class="vv-det-linha" style="color:#64748b;">${esc(endereco)}</div>` : ''}
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas fa-box-open"></i> Produtos</h5>
                <table class="vv-itens">
                    <thead><tr><th>Produto</th><th>Qtd</th><th>Valor unit.</th><th>Subtotal</th></tr></thead>
                    <tbody>
                        ${itens.map(i => `
                            <tr>
                                <td>${esc(i.nome)}<br><small style="color:#94a3b8;">${esc(i.sku)}</small></td>
                                <td>${Number(i.quantidade || 0)}</td>
                                <td>${moeda(i.valor_unitario)}</td>
                                <td>${moeda(Number(i.quantidade || 0) * Number(i.valor_unitario || 0))}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
                <div style="text-align:right;margin-top:10px;font-size:13px;">
                    ${Number(v.desconto) > 0 ? `Produtos: ${moeda(v.valor_produtos)} · Desconto: −${moeda(v.desconto)}<br>` : ''}
                    <strong style="font-size:17px;">Total: ${moeda(v.valor_total)}</strong>
                </div>
            </div>

            <div class="vv-secao">
                <h5 class="vv-secao-titulo"><i class="fas ${entrega.icone}"></i> Entrega: ${esc(entrega.texto)}</h5>
                ${v.forma_entrega === 'retirada'
                    ? '<div class="vv-det-linha" style="color:#64748b;">Cliente retira na loja.</div>'
                    : !cancelada
                    ? `
                        <div class="vv-grid">
                            <div><label>Código de rastreio</label><input type="text" id="vvEdRastreio" class="form-control form-control-sm" value="${esc(v.codigo_rastreio || '')}" placeholder="AA123456789BR"></div>
                            <div><label>Tipo de embalagem</label><input type="text" id="vvEdEmbalagem" class="form-control form-control-sm" value="${esc(v.tipo_embalagem || '')}" placeholder="Ex: caixa pequena"></div>
                            <div><label>Nome do cliente</label><input type="text" id="vvEdCliente" class="form-control form-control-sm" value="${esc(v.nome_destinatario || '')}" placeholder="Nome completo"></div>
                            <div><label>Data de postagem</label><input type="date" id="vvEdData" class="form-control form-control-sm" value="${esc(v.data_postagem || '')}"></div>
                            <div class="full"><label>Valor do frete <span style="font-weight:400;color:#94a3b8;">(opcional — geralmente só se sabe no mês seguinte)</span></label><input type="number" id="vvEdFrete" class="form-control form-control-sm" step="0.01" min="0" value="${v.valor_frete ?? ''}" placeholder="Preencher depois se ainda não souber"></div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-2" style="gap:10px;">
                            <small style="color:#94a3b8;">${v.forma_entrega === 'correio' ? 'Entra no relatório "Envio de correios" das Reclamações de Clientes.' : ''}</small>
                            <button type="button" class="btn btn-sm btn-primary" onclick="window.salvarEnvioVendaVV(${v.id})"><i class="fas fa-save"></i> Salvar envio</button>
                        </div>
                    `
                    : `
                        <div class="vv-det-linha"><i class="fas fa-barcode" style="color:#94a3b8;"></i> ${esc(v.codigo_rastreio || 'rastreio não informado')}${v.tipo_embalagem ? ' · ' + esc(v.tipo_embalagem) : ''}</div>
                        <div class="vv-det-linha"><i class="fas fa-user" style="color:#94a3b8;"></i> ${esc(v.nome_destinatario || '—')} · <i class="fas fa-calendar" style="color:#94a3b8;"></i> ${v.data_postagem ? fmtDataCurta(v.data_postagem) : '—'} · ${v.valor_frete != null ? moeda(v.valor_frete) : 'frete a preencher depois'}</div>
                    `}
            </div>

            ${v.observacoes ? `<div class="vv-secao"><h5 class="vv-secao-titulo"><i class="fas fa-sticky-note"></i> Observações</h5><div class="vv-det-linha">${esc(v.observacoes).replace(/\n/g, '<br>')}</div></div>` : ''}

            <div class="vv-acoes">
                ${!cancelada && v.cliente_documento ? `<button class="btn btn-outline-primary" onclick="window.reabrirNFeVendaVV(${v.id})"><i class="fas fa-file-invoice"></i> Abrir NF-e desta venda</button>` : ''}
                ${!cancelada && ehAdmin() ? `<button class="btn btn-outline-danger" onclick="window.cancelarVendaVV(${v.id})"><i class="fas fa-ban"></i> Cancelar venda</button>` : ''}
            </div>
        `;
        document.getElementById('vvModalDetalhes').classList.remove('hidden-vv');
    };

    window.fecharDetalhesVendaVV = function () {
        document.getElementById('vvModalDetalhes')?.classList.add('hidden-vv');
    };

    window.salvarEnvioVendaVV = async function (id) {
        const v = vendasCacheVV.find(x => String(x.id) === String(id));
        if (!v) return;
        const frete = valorInput('vvEdFrete');
        try {
            const { error } = await sb().from(CFG_VV.tabela).update({
                codigo_rastreio: valorInput('vvEdRastreio') || null,
                tipo_embalagem: valorInput('vvEdEmbalagem') || null,
                nome_destinatario: valorInput('vvEdCliente') || null,
                data_postagem: valorInput('vvEdData') || null,
                valor_frete: frete ? arred(frete) : null,
                atualizado_em: new Date().toISOString()
            }).eq('id', v.id);
            if (error) throw error;

            if (v.forma_entrega === 'correio') invalidarRelatorioCorreioVV();
            toast('✅ Dados de envio salvos', 'success');
            await window.carregarVendasVendedores();
            window.abrirDetalhesVendaVV(v.id);
        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro ao salvar envio:', error);
            toast('❌ Erro ao salvar: ' + error.message, 'error');
        }
    };

    // Para quando a nota não foi emitida na hora (ex.: fechou a aba)
    // ou quando a venda foi só baixa e depois o cliente pediu nota.
    // NÃO baixa estoque de novo.
    window.reabrirNFeVendaVV = async function (id) {
        const v = vendasCacheVV.find(x => String(x.id) === String(id));
        if (!v) return;
        window.fecharDetalhesVendaVV();

        if (!v.cliente_nfe_id) {
            try {
                v.cliente_nfe_id = await garantirClienteNFeVV(v);
                if (v.cliente_nfe_id) {
                    await sb().from(CFG_VV.tabela).update({ cliente_nfe_id: v.cliente_nfe_id }).eq('id', v.id);
                }
            } catch (error) {
                toast('⚠️ ' + error.message, 'warning');
            }
        }
        await abrirNFeAvulsaDaVendaVV(v);
    };

    window.cancelarVendaVV = async function (id) {
        if (!ehAdmin()) return;
        const v = vendasCacheVV.find(x => String(x.id) === String(id));
        if (!v || v.status === 'cancelada') return;

        const devolver = v.estoque_baixado
            ? confirm(`Cancelar a venda #${v.id}?\n\nOK = cancelar e devolver os produtos ao estoque.\nCancelar = não fazer nada.`)
            : confirm(`Cancelar a venda #${v.id}?`);
        if (!devolver) return;

        try {
            let erros = [];
            if (v.estoque_baixado) {
                ({ erros } = await movimentarEstoqueVV(v, 'entrada'));
            }
            const u = usuarioAtual();
            const { error } = await sb().from(CFG_VV.tabela).update({
                status: 'cancelada',
                estoque_baixado: v.estoque_baixado ? erros.length > 0 : false,
                cancelado_por: u?.name || u?.username || null,
                cancelado_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString()
            }).eq('id', v.id);
            if (error) throw error;

            if (v.forma_entrega === 'correio') invalidarRelatorioCorreioVV();

            toast(erros.length
                ? `⚠️ Venda cancelada, mas alguns produtos não voltaram ao estoque: ${erros.join('; ')}`
                : `✅ Venda #${v.id} cancelada${v.estoque_baixado ? ' e estoque devolvido' : ''}.`,
                erros.length ? 'warning' : 'success');
            if (v.tipo_finalizacao === 'nota_fiscal') {
                toast('ℹ️ Se a NF-e já foi emitida, cancele a nota também pela aba Emissão NF-e.', 'info');
            }

            window.fecharDetalhesVendaVV();
            await window.carregarVendasVendedores();

        } catch (error) {
            console.error('❌ [Vendas Vendedores] Erro ao cancelar:', error);
            toast('❌ Erro ao cancelar: ' + error.message, 'error');
        }
    };
})();
