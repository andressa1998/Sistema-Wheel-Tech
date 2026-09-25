/* ============================================================
   WHEEL TECH · CATÁLOGO DE PRODUTOS
   ------------------------------------------------------------
   Gera um catálogo em PDF (só título + foto, sem preço) a partir
   de uma tabela local (catalogo_produtos) que guarda apenas a URL
   da foto principal do Mercado Livre — não a imagem em si, nem o
   preço. Sincroniza uma categoria por vez, sob demanda, pra não
   gastar requisição nenhuma com os ~3 mil produtos do estoque.
   ============================================================ */
(function () {
    'use strict';

    const CFG_CAT = {
        tabela: 'catalogo_produtos',
        bucket: 'catalogos'
    };

    function sb() { return window.supabaseClient || null; }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ============================================================
    // TOKEN / API MERCADO LIVRE
    // ============================================================

    const WORKER_URL_CAT = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

    async function tokenMLCatalogo() {
        if (typeof window.getValidToken === 'function') {
            const t = await window.getValidToken();
            return t?.access_token || null;
        }
        return localStorage.getItem('ml_access_token');
    }

    // Busca vários MLBs de uma vez (endpoint multiget do ML, até 20
    // por chamada) — é isso que evita gastar uma requisição por
    // produto. Devolve um Map mlb -> { pictures, title }.
    async function buscarItensMLEmLote(mlbs, token) {
        const mapa = new Map();
        const TAMANHO_LOTE = 20;

        for (let i = 0; i < mlbs.length; i += TAMANHO_LOTE) {
            const lote = mlbs.slice(i, i + TAMANHO_LOTE);
            if (!lote.length) continue;

            try {
                const url = `https://api.mercadolibre.com/items?ids=${lote.join(',')}`;
                const proxyUrl = `${WORKER_URL_CAT}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
                const resp = await fetch(proxyUrl, { cache: 'no-store' });

                if (!resp.ok) {
                    console.warn(`⚠️ [Catálogo] Lote ML falhou (${resp.status}):`, lote);
                    continue;
                }

                const dados = await resp.json();
                (Array.isArray(dados) ? dados : []).forEach(entrada => {
                    const item = entrada?.body;
                    if (entrada?.code === 200 && item?.id) {
                        mapa.set(String(item.id), item);
                    }
                });

            } catch (error) {
                console.warn('⚠️ [Catálogo] Erro no lote ML:', error);
            }

            // pequeno intervalo entre lotes pra não martelar a API
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        return mapa;
    }

    function primeiroMlbDoProduto(produto) {
        let m = produto.mlb_codes || (produto.dados_extra && produto.dados_extra.mlb_codes) || [];
        if (typeof m === 'string') m = m.split(',').map(s => s.trim()).filter(Boolean);
        if (!Array.isArray(m)) return null;
        const primeiro = m.map(String).find(Boolean);
        return primeiro || null;
    }

    // Chute inicial do "grupo" (subcategoria) do catálogo — só usado
    // em produto NOVO, nunca sobrescreve edição manual. Prioriza
    // marca+modelo (bate com "organizar por marca e modelo de bike"),
    // senão usa a subcategoria já cadastrada no produto, senão deixa
    // em branco pra preencher na tela de revisão.
    function sugerirSubcategoriaCat(produto) {
        const extra = produto.dados_extra || {};

        const marca = String(extra.marca || '').trim();
        const modelo = String(extra.modelo || '').trim();
        if (marca || modelo) {
            return [marca, modelo].filter(Boolean).join(' ');
        }

        const subcategoria = String(extra.subcategoria || '').trim();
        if (subcategoria) return subcategoria;

        return null;
    }

    // ============================================================
    // ESTILO
    // ============================================================

    function instalarEstiloCatalogo() {
        if (document.getElementById('catalogoEstilo')) return;
        const st = document.createElement('style');
        st.id = 'catalogoEstilo';
        st.textContent = `
            #catalogoOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100060;display:flex;align-items:center;justify-content:center;padding:15px;}
            #catalogoOverlay.hidden-cat{display:none;}
            #catalogoModal{background:#fff;width:min(1150px,97vw);max-height:94vh;overflow-y:auto;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);}
            .cat-head{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #dee2e6;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;}
            .cat-body{padding:18px 20px;}
            .cat-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;padding:12px;background:#f8f9fa;border:1px solid #e2e6ea;border-radius:8px;}
            .cat-toolbar select,.cat-toolbar input{border:1px solid #ced4da;border-radius:6px;padding:7px 10px;font-size:13px;}
            .cat-btn{border:0;border-radius:7px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
            .cat-btn:disabled{opacity:.55;cursor:default;}
            .cat-btn-primary{background:#0a58ca;color:#fff;}
            .cat-btn-success{background:#198754;color:#fff;}
            .cat-btn-outline{background:#fff;color:#495057;border:1px solid #ced4da;}
            .cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;}
            .cat-card{border:1px solid #e2e6ea;border-radius:9px;overflow:hidden;background:#fff;display:flex;flex-direction:column;}
            .cat-card.cat-inativo{opacity:.45;}
            .cat-card-img{height:130px;background:#f8f9fa;display:flex;align-items:center;justify-content:center;overflow:hidden;}
            .cat-card-img img{max-width:100%;max-height:100%;object-fit:contain;}
            .cat-card-corpo{padding:8px 10px;font-size:11px;}
            .cat-card-titulo{font-weight:700;font-size:11.5px;margin-bottom:6px;min-height:28px;line-height:1.3;}
            .cat-card-sku{color:#6c757d;font-size:10px;margin-bottom:6px;}
            .cat-card-sub{width:100%;border:1px solid #ced4da;border-radius:5px;padding:4px 6px;font-size:11px;margin-bottom:6px;}
            .cat-card-rodape{display:flex;justify-content:space-between;align-items:center;}
            .cat-vazio{text-align:center;color:#6c757d;padding:40px;}
            #catalogoPaginaOffscreen{position:fixed;left:-99999px;top:0;}
        `;
        document.head.appendChild(st);
    }

    // ============================================================
    // MODAL PRINCIPAL
    // ============================================================

    let categoriaAtualCat = '';
    let produtosCatalogoAtual = [];

    function criarModalCatalogo() {
        if (document.getElementById('catalogoOverlay')) return;

        const ov = document.createElement('div');
        ov.id = 'catalogoOverlay';
        ov.className = 'hidden-cat';
        ov.innerHTML = `
            <div id="catalogoModal">
                <div class="cat-head">
                    <div>
                        <div style="font-size:19px;font-weight:800;"><i class="fas fa-book-open"></i> Catálogo de Produtos</div>
                        <div style="font-size:11px;color:#6c757d;margin-top:2px;">Só título e foto — sem preço. Sincronize uma categoria por vez.</div>
                    </div>
                    <button type="button" onclick="window.fecharCatalogoProdutos()" style="border:0;background:transparent;font-size:25px;cursor:pointer;">&times;</button>
                </div>
                <div class="cat-body">
                    <div class="cat-toolbar">
                        <select id="catSelectCategoria"></select>
                        <button type="button" class="cat-btn cat-btn-primary" id="catBtnSincronizar" onclick="window.sincronizarFotosCatalogoML()">
                            <i class="fas fa-sync-alt"></i> Sincronizar fotos do Mercado Livre
                        </button>
                        <div style="flex:1;"></div>
                        <button type="button" class="cat-btn cat-btn-outline" onclick="window.marcarTodosCatalogo(true)">Marcar todos</button>
                        <button type="button" class="cat-btn cat-btn-outline" onclick="window.marcarTodosCatalogo(false)">Desmarcar todos</button>
                        <button type="button" class="cat-btn cat-btn-success" id="catBtnGerarPdf" onclick="window.gerarCatalogoPDF()">
                            <i class="fas fa-file-pdf"></i> Gerar catálogo (PDF)
                        </button>
                    </div>
                    <div id="catalogoLista"><div class="cat-vazio">Escolha uma categoria acima.</div></div>
                    <div id="catalogoLinkResultado" style="margin-top:14px;"></div>
                </div>
            </div>
        `;
        ov.addEventListener('click', e => { if (e.target === ov) window.fecharCatalogoProdutos(); });
        document.body.appendChild(ov);

        document.getElementById('catSelectCategoria')
            .addEventListener('change', e => {
                categoriaAtualCat = e.target.value;
                carregarListaCatalogo();
            });

        return ov;
    }

    async function popularSelectCategoriasCat() {
        const select = document.getElementById('catSelectCategoria');
        if (!select) return;

        const cli = sb();
        const categorias = new Set();

        // categorias reais em uso no estoque (inclui customizadas)
        try {
            let inicio = 0;
            while (true) {
                const { data, error } = await cli
                    .from('produtos_estoque')
                    .select('categoria')
                    .not('categoria', 'is', null)
                    .range(inicio, inicio + 999);
                if (error || !data || !data.length) break;
                data.forEach(r => { if (r.categoria) categorias.add(r.categoria); });
                if (data.length < 1000) break;
                inicio += 1000;
            }
        } catch (error) {
            console.warn('⚠️ [Catálogo] Erro lendo categorias:', error);
        }

        const lista = Array.from(categorias).sort((a, b) => a.localeCompare(b, 'pt-BR'));

        select.innerHTML =
            '<option value="">Selecione uma categoria...</option>' +
            lista.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

        if (categoriaAtualCat && lista.includes(categoriaAtualCat)) {
            select.value = categoriaAtualCat;
        }
    }

    window.abrirCatalogoProdutos = async function () {
        instalarEstiloCatalogo();
        const ov = criarModalCatalogo();
        (ov || document.getElementById('catalogoOverlay')).classList.remove('hidden-cat');
        await popularSelectCategoriasCat();
        if (categoriaAtualCat) await carregarListaCatalogo();
    };

    window.fecharCatalogoProdutos = function () {
        document.getElementById('catalogoOverlay')?.classList.add('hidden-cat');
    };

    // ============================================================
    // SINCRONIZAR FOTOS DO MERCADO LIVRE (por categoria)
    // ============================================================

    window.sincronizarFotosCatalogoML = async function () {
        const categoria = document.getElementById('catSelectCategoria')?.value;
        if (!categoria) {
            window.showToast?.('Escolha uma categoria primeiro.', 'warning');
            return;
        }

        const btn = document.getElementById('catBtnSincronizar');
        const iconeOriginal = btn?.innerHTML;
        if (btn) btn.disabled = true;

        try {
            const cli = sb();

            // 1) produtos da categoria (id, sku, nome, mlb_codes, dados_extra)
            const produtos = [];
            {
                let inicio = 0;
                while (true) {
                    const { data, error } = await cli
                        .from('produtos_estoque')
                        // "mlb_codes" NÃO é coluna própria — só existe
                        // dentro do jsonb dados_extra (confirmado ao vivo:
                        // selecionar mlb_codes direto dá erro 42703).
                        .select('sku, nome, categoria, dados_extra')
                        .eq('categoria', categoria)
                        .range(inicio, inicio + 999);
                    if (error) throw error;
                    produtos.push(...(data || []));
                    if (!data || data.length < 1000) break;
                    inicio += 1000;
                }
            }

            if (!produtos.length) {
                window.showToast?.('Nenhum produto nessa categoria.', 'info');
                return;
            }

            // Quem já está sincronizado antes (pra não sobrescrever um
            // "grupo" que o admin já editou manualmente na tela de revisão).
            const jaExistentes = new Set();
            {
                let inicio = 0;
                while (true) {
                    const { data, error } = await cli
                        .from(CFG_CAT.tabela)
                        .select('sku')
                        .eq('categoria', categoria)
                        .range(inicio, inicio + 999);
                    if (error) break;
                    (data || []).forEach(r => jaExistentes.add(r.sku));
                    if (!data || data.length < 1000) break;
                    inicio += 1000;
                }
            }

            // 2) monta lista de mlb -> produto (só quem tem mlb cadastrado)
            const mlbParaProduto = new Map();
            const semMlb = [];

            produtos.forEach(p => {
                const mlb = primeiroMlbDoProduto(p);
                if (mlb) mlbParaProduto.set(mlb, p);
                else semMlb.push(p);
            });

            if (btn) btn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Buscando fotos (0/${mlbParaProduto.size})...`;

            const token = await tokenMLCatalogo();
            if (!token) {
                window.showToast?.('❌ Token do Mercado Livre indisponível.', 'error');
                return;
            }

            const mlbs = Array.from(mlbParaProduto.keys());
            const itensML = await buscarItensMLEmLote(mlbs, token);

            if (btn) btn.innerHTML = `<i class="fas fa-sync-alt fa-spin"></i> Salvando ${mlbs.length} produto(s)...`;

            // 3) monta os registros pra upsert (título/categoria vêm do
            // NOSSO banco — só a foto vem do ML, exatamente pra gastar o
            // mínimo possível de requisição). Em produtos NOVOS, já chuta
            // um "grupo" a partir de marca/modelo/subcategoria do
            // cadastro, quando existir — em quem já estava sincronizado,
            // não mexe (o admin pode ter editado à mão).
            const agora = new Date().toISOString();
            const registrosNovos = [];
            const registrosExistentes = [];

            const montarRegistro = (produto, mlb, foto) => {
                const base = {
                    sku: produto.sku,
                    mlb: mlb || null,
                    titulo: produto.nome,
                    categoria: produto.categoria,
                    foto_url: foto || null,
                    ativo: !!foto,
                    atualizado_em: agora
                };

                if (jaExistentes.has(produto.sku)) {
                    registrosExistentes.push(base);
                } else {
                    registrosNovos.push({
                        ...base,
                        subcategoria: sugerirSubcategoriaCat(produto)
                    });
                }
            };

            mlbParaProduto.forEach((produto, mlb) => {
                const item = itensML.get(mlb);
                const foto = item?.pictures?.[0]?.secure_url || item?.pictures?.[0]?.url || null;
                montarRegistro(produto, mlb, foto);
            });

            // produtos sem mlb cadastrado entram desativados (sem foto
            // pra buscar) — assim aparecem na lista pra quem quiser
            // preencher o mlb_codes deles depois, mas não atrapalham o PDF.
            semMlb.forEach(produto => montarRegistro(produto, null, null));

            const TAMANHO_LOTE_GRAVACAO = 200;
            for (const grupo of [registrosNovos, registrosExistentes]) {
                for (let i = 0; i < grupo.length; i += TAMANHO_LOTE_GRAVACAO) {
                    const lote = grupo.slice(i, i + TAMANHO_LOTE_GRAVACAO);
                    if (!lote.length) continue;
                    const { error } = await cli
                        .from(CFG_CAT.tabela)
                        .upsert(lote, { onConflict: 'sku' });
                    if (error) throw error;
                }
            }

            const registros = [...registrosNovos, ...registrosExistentes];
            const comFoto = registros.filter(r => r.foto_url).length;

            window.showToast?.(
                `✅ ${registros.length} produto(s) sincronizado(s) — ${comFoto} com foto encontrada.`,
                'success'
            );

            await carregarListaCatalogo();

        } catch (error) {
            console.error('❌ [Catálogo] Erro sincronizando:', error);
            window.showToast?.('❌ Erro ao sincronizar: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = iconeOriginal;
            }
        }
    };

    // ============================================================
    // LISTA / REVISÃO
    // ============================================================

    async function carregarListaCatalogo() {
        const container = document.getElementById('catalogoLista');
        if (!container) return;

        if (!categoriaAtualCat) {
            container.innerHTML = '<div class="cat-vazio">Escolha uma categoria acima.</div>';
            produtosCatalogoAtual = [];
            return;
        }

        container.innerHTML = '<div class="cat-vazio"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

        const cli = sb();
        const { data, error } = await cli
            .from(CFG_CAT.tabela)
            .select('*')
            .eq('categoria', categoriaAtualCat)
            .order('subcategoria', { ascending: true, nullsFirst: false })
            .order('titulo', { ascending: true });

        if (error) {
            container.innerHTML = `<div class="cat-vazio">Erro ao carregar: ${esc(error.message)}</div>`;
            return;
        }

        produtosCatalogoAtual = data || [];
        renderizarListaCatalogo();
    }

    function renderizarListaCatalogo() {
        const container = document.getElementById('catalogoLista');
        if (!container) return;

        if (!produtosCatalogoAtual.length) {
            container.innerHTML = `
                <div class="cat-vazio">
                    Nenhum produto sincronizado ainda nessa categoria.<br>
                    Clique em "Sincronizar fotos do Mercado Livre" acima.
                </div>
            `;
            return;
        }

        const comFoto = produtosCatalogoAtual.filter(p => p.ativo && p.foto_url).length;

        container.innerHTML = `
            <div style="font-size:12px;color:#6c757d;margin-bottom:10px;">
                ${produtosCatalogoAtual.length} produto(s) nessa categoria — ${comFoto} ativo(s) com foto (esses entram no catálogo)
            </div>
            <div class="cat-grid">
                ${produtosCatalogoAtual.map(p => `
                    <div class="cat-card ${p.ativo ? '' : 'cat-inativo'}" data-catalogo-card="${p.id}">
                        <div class="cat-card-img">
                            ${p.foto_url ? `<img src="${esc(p.foto_url)}" loading="lazy" alt="">` : '<i class="fas fa-image" style="color:#ced4da;font-size:30px;"></i>'}
                        </div>
                        <div class="cat-card-corpo">
                            <div class="cat-card-titulo">${esc(p.titulo || p.sku)}</div>
                            <div class="cat-card-sku"><code>${esc(p.sku)}</code>${p.mlb ? ' · ' + esc(p.mlb) : ' · sem MLB'}</div>
                            <input
                                type="text"
                                class="cat-card-sub"
                                placeholder="Grupo (ex.: marca/modelo)"
                                value="${esc(p.subcategoria || '')}"
                                onchange="window.salvarSubcategoriaCatalogo(${p.id}, this.value)"
                            >
                            <div class="cat-card-rodape">
                                <label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;">
                                    <input type="checkbox" ${p.ativo ? 'checked' : ''} onchange="window.alternarAtivoCatalogo(${p.id}, this.checked)">
                                    No catálogo
                                </label>
                                ${!p.foto_url ? '<span style="color:#dc3545;font-size:10px;">sem foto</span>' : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    window.alternarAtivoCatalogo = async function (id, ativo) {
        const produto = produtosCatalogoAtual.find(p => p.id === id);
        if (produto) produto.ativo = ativo;

        await sb().from(CFG_CAT.tabela).update({ ativo }).eq('id', id);

        const card = document.querySelector(`[data-catalogo-card="${id}"]`);
        card?.classList.toggle('cat-inativo', !ativo);
    };

    window.salvarSubcategoriaCatalogo = async function (id, valor) {
        const produto = produtosCatalogoAtual.find(p => p.id === id);
        if (produto) produto.subcategoria = valor.trim() || null;

        await sb().from(CFG_CAT.tabela).update({ subcategoria: valor.trim() || null }).eq('id', id);
    };

    window.marcarTodosCatalogo = async function (ativo) {
        if (!produtosCatalogoAtual.length) return;

        const idsComFoto = produtosCatalogoAtual.filter(p => !ativo || p.foto_url).map(p => p.id);

        produtosCatalogoAtual.forEach(p => {
            if (idsComFoto.includes(p.id)) p.ativo = ativo;
        });

        renderizarListaCatalogo();

        await sb().from(CFG_CAT.tabela).update({ ativo }).in('id', idsComFoto);
    };

    // ============================================================
    // GERAÇÃO DO PDF
    // ============================================================

    const PRODUTOS_POR_PAGINA_CAT = 8; // 2 colunas x 4 linhas

    function agruparPorSubcategoria(produtos) {
        const grupos = new Map();
        produtos.forEach(p => {
            const chave = p.subcategoria || 'Outros';
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(p);
        });
        return Array.from(grupos.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    }

    function montarHtmlCabecalhoCat(categoria) {
        return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:22px 40px 14px;">
                <div style="font-size:9px;font-weight:800;color:#58595B;line-height:1.5;max-width:140px;">
                    QUALIDADE<br>PARA QUEM<br>VIVE O CICLISMO
                    <div style="width:34px;height:2px;background:#76B843;margin-top:6px;"></div>
                </div>
                <div style="text-align:center;">
                    <img src="logo.png" style="height:78px;">
                    <div style="font-size:13px;color:#6c757d;margin-top:2px;">Catálogo de Produtos</div>
                </div>
                <div style="font-size:9px;font-weight:800;color:#58595B;line-height:1.5;text-align:right;max-width:140px;">
                    MAIS<br>PEDALADAS<br>MAIS<br>HISTÓRIAS
                    <div style="width:34px;height:2px;background:#00ADEE;margin-top:6px;margin-left:auto;"></div>
                </div>
            </div>
            <div style="margin:0 40px 18px;background:#f1f3f5;border-radius:8px;padding:12px;text-align:center;">
                <span style="font-size:20px;font-weight:900;letter-spacing:2px;color:#58595B;">${esc((categoria || '').toUpperCase())}</span>
            </div>
        `;
    }

    function montarHtmlRodapeCat() {
        return `
            <div style="position:absolute;bottom:20px;left:40px;right:40px;text-align:center;">
                <div style="border-top:1px solid #dee2e6;padding-top:8px;font-size:10px;color:#adb5bd;letter-spacing:1px;">
                    Wheel Tech Bicycling
                </div>
            </div>
        `;
    }

    function montarPaginaOffscreen() {
        let pagina = document.getElementById('catalogoPaginaOffscreen');
        if (!pagina) {
            pagina = document.createElement('div');
            pagina.id = 'catalogoPaginaOffscreen';
            document.body.appendChild(pagina);
        }
        pagina.innerHTML = '';
        pagina.style.cssText = `
            position:fixed;left:-99999px;top:0;
            width:1240px;height:1754px;
            background:#fff;
            font-family:Arial,Helvetica,sans-serif;
            position:relative;
            overflow:hidden;
        `;
        return pagina;
    }

    function aplicarMarcaDaguaCat(pagina) {
        const marca = document.createElement('div');
        marca.style.cssText = `
            position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            pointer-events:none;z-index:0;
        `;
        marca.innerHTML = `
            <img src="logo.png" style="width:640px;opacity:.07;transform:rotate(-20deg);">
        `;
        pagina.appendChild(marca);
    }

    async function esperarImagensCarregarem(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        await Promise.all(imgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
                setTimeout(resolve, 6000);
            });
        }));
    }

    // Baixa a imagem e converte pra data:URL — html2canvas não
    // consegue "printar" imagem de outro domínio (CORS) sem isso,
    // e as fotos do Mercado Livre são todas em http2.mlstatic.com.
    async function paraDataUrlCat(url) {
        if (!url) return null;
        try {
            const resp = await fetch(url, { mode: 'cors' });
            const blob = await resp.blob();
            return await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            return null;
        }
    }

    function montarCardProdutoHtml(produto, fotoDataUrl) {
        return `
            <div style="border:1px solid #e2e6ea;border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column;">
                <div style="height:230px;background:#fafbfc;display:flex;align-items:center;justify-content:center;">
                    ${fotoDataUrl ? `<img src="${fotoDataUrl}" style="max-width:88%;max-height:88%;object-fit:contain;">` : ''}
                </div>
                <div style="background:#eef1f4;padding:14px 10px;text-align:center;">
                    <div style="font-size:14px;font-weight:800;color:#58595B;line-height:1.35;">
                        ${esc(produto.titulo || produto.sku)}
                    </div>
                </div>
            </div>
        `;
    }

    async function montarPaginaIndiceCat(grupos, mapaPaginaInicial) {
        const pagina = montarPaginaOffscreen();
        aplicarMarcaDaguaCat(pagina);

        const conteudo = document.createElement('div');
        conteudo.style.cssText = 'position:relative;z-index:1;';
        conteudo.innerHTML = `
            ${montarHtmlCabecalhoCat('Índice')}
            <div style="margin:10px 50px;">
                ${grupos.map(([nome], i) => `
                    <div style="display:flex;justify-content:space-between;padding:10px 4px;border-bottom:1px dashed #dee2e6;font-size:15px;">
                        <span style="font-weight:700;color:#58595B;">${esc(nome)}</span>
                        <span style="color:#6c757d;">página ${mapaPaginaInicial[i]}</span>
                    </div>
                `).join('')}
            </div>
            ${montarHtmlRodapeCat()}
        `;
        pagina.appendChild(conteudo);
        return pagina;
    }

    async function montarPaginaProdutosCat(categoria, nomeGrupo, produtosDaPagina) {
        const pagina = montarPaginaOffscreen();
        aplicarMarcaDaguaCat(pagina);

        const fotos = await Promise.all(
            produtosDaPagina.map(p => paraDataUrlCat(p.foto_url))
        );

        const conteudo = document.createElement('div');
        conteudo.style.cssText = 'position:relative;z-index:1;';
        conteudo.innerHTML = `
            ${montarHtmlCabecalhoCat(categoria)}
            <div style="margin:0 40px 8px;font-size:13px;font-weight:700;color:#6c757d;">${esc(nomeGrupo)}</div>
            <div style="margin:0 40px;display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
                ${produtosDaPagina.map((p, i) => montarCardProdutoHtml(p, fotos[i])).join('')}
            </div>
            ${montarHtmlRodapeCat()}
        `;
        pagina.appendChild(conteudo);
        return pagina;
    }

    window.gerarCatalogoPDF = async function () {
        if (!categoriaAtualCat) {
            window.showToast?.('Escolha uma categoria primeiro.', 'warning');
            return;
        }

        if (typeof window.html2canvas !== 'function' || !window.jspdf?.jsPDF) {
            window.showToast?.('❌ Bibliotecas de PDF não carregaram — recarregue a página.', 'error');
            return;
        }

        const btn = document.getElementById('catBtnGerarPdf');
        const iconeOriginal = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; }

        const resultadoDiv = document.getElementById('catalogoLinkResultado');
        if (resultadoDiv) resultadoDiv.innerHTML = '';

        try {
            const produtosValidos = produtosCatalogoAtual.filter(p => p.ativo && p.foto_url);

            if (!produtosValidos.length) {
                window.showToast?.('Nenhum produto ativo com foto nessa categoria.', 'warning');
                return;
            }

            const grupos = agruparPorSubcategoria(produtosValidos);

            // monta a divisão de páginas por grupo (cada grupo sempre
            // começa em página nova, pra bater com o índice)
            const paginasPorGrupo = grupos.map(([nome, lista]) => {
                const fatias = [];
                for (let i = 0; i < lista.length; i += PRODUTOS_POR_PAGINA_CAT) {
                    fatias.push(lista.slice(i, i + PRODUTOS_POR_PAGINA_CAT));
                }
                return { nome, fatias };
            });

            const temIndice = grupos.length > 1;
            let paginaAtual = temIndice ? 2 : 1;
            const paginaInicialPorGrupo = [];

            paginasPorGrupo.forEach(g => {
                paginaInicialPorGrupo.push(paginaAtual);
                paginaAtual += g.fatias.length;
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [1240, 1754], compress: true });

            async function imprimirPagina(elementoPagina, primeira) {
                document.body.appendChild(elementoPagina);
                await esperarImagensCarregarem(elementoPagina);
                const canvas = await window.html2canvas(elementoPagina, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/jpeg', 0.92);
                if (!primeira) pdf.addPage([1240, 1754], 'portrait');
                pdf.addImage(imgData, 'JPEG', 0, 0, 1240, 1754);
                elementoPagina.remove();
            }

            let primeira = true;

            if (temIndice) {
                const paginaIndice = await montarPaginaIndiceCat(grupos, paginaInicialPorGrupo);
                await imprimirPagina(paginaIndice, primeira);
                primeira = false;
            }

            for (const grupo of paginasPorGrupo) {
                for (let i = 0; i < grupo.fatias.length; i++) {
                    if (btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Montando "${grupo.nome}"...`;
                    const paginaProdutos = await montarPaginaProdutosCat(categoriaAtualCat, grupo.nome, grupo.fatias[i]);
                    await imprimirPagina(paginaProdutos, primeira);
                    primeira = false;
                }
            }

            const nomeArquivo = `catalogo-${categoriaAtualCat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;

            // 1) baixa localmente, sempre funciona
            pdf.save(nomeArquivo);

            // 2) tenta subir no storage pra gerar um link compartilhável
            try {
                const blobPdf = pdf.output('blob');
                const caminho = `${Date.now()}-${nomeArquivo}`;

                const { error: erroUpload } = await sb()
                    .storage
                    .from(CFG_CAT.bucket)
                    .upload(caminho, blobPdf, { contentType: 'application/pdf', upsert: true });

                if (erroUpload) throw erroUpload;

                const { data: urlPublica } = sb()
                    .storage
                    .from(CFG_CAT.bucket)
                    .getPublicUrl(caminho);

                if (resultadoDiv && urlPublica?.publicUrl) {
                    resultadoDiv.innerHTML = `
                        <div style="background:#e3f7e8;border:1px solid #b5e6c3;border-radius:8px;padding:12px 14px;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                            <span><i class="fas fa-link"></i> Link pra enviar pro cliente:
                                <a href="${esc(urlPublica.publicUrl)}" target="_blank" rel="noopener noreferrer">${esc(urlPublica.publicUrl)}</a>
                            </span>
                            <button type="button" class="cat-btn cat-btn-outline" onclick="navigator.clipboard.writeText('${esc(urlPublica.publicUrl)}');window.showToast?.('Link copiado!','success');">
                                <i class="fas fa-copy"></i> Copiar link
                            </button>
                        </div>
                    `;
                }

            } catch (erroStorage) {
                console.warn('⚠️ [Catálogo] Não deu pra gerar o link (PDF já foi baixado normalmente):', erroStorage);
                if (resultadoDiv) {
                    resultadoDiv.innerHTML = `
                        <div style="background:#fff6df;border:1px solid #f0c36d;border-radius:8px;padding:10px 14px;font-size:12px;color:#8b7a58;">
                            PDF baixado certinho. Não deu pra gerar o link compartilhável agora (${esc(erroStorage.message || 'erro no storage')}).
                        </div>
                    `;
                }
            }

            window.showToast?.('✅ Catálogo gerado!', 'success');

        } catch (error) {
            console.error('❌ [Catálogo] Erro gerando PDF:', error);
            window.showToast?.('❌ Erro ao gerar catálogo: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = iconeOriginal;
            }
        }
    };

})();
