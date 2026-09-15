// ================================================================
// CARROSSEL DO MENU PRINCIPAL - EDIÇÃO PELO FRONT-END
//
// O carrossel ("Nossos valores/missão/visão") na tela inicial do
// sistema era uma lista de slides fixa, escrita direto no HTML.
// Este arquivo:
//
// 1) Passa a carregar os slides de configuracoes_sistema (chave
//    CHAVE_CARROSSEL) e renderiza dinamicamente dentro do
//    .carousel-container já existente em index.html — se ainda não
//    houver nada salvo no banco, usa os slides originais como
//    padrão (SLIDES_PADRAO), então nada muda visualmente até
//    alguém editar.
//
// 2) Expõe window.abrirEditorCarrossel(), que abre um modal para
//    ver todos os slides, trocar a imagem de cada um, adicionar
//    novos, editar o texto e reordenar — tudo pela tela, sem mexer
//    em código. É ligado ao dropdown da engrenagem do topo
//    (usuarios_gestao.js -> preencherMenuEngrenagem).
// ================================================================

(function () {
    'use strict';

    const CHAVE_CARROSSEL = 'carrossel_menu_slides';
    const BUCKET_CARROSSEL = 'carrossel';
    const COR_PELICULA_PADRAO = '#002673';
    const DURACAO_PADRAO_SEGUNDOS = 6;

    // Os mesmos 16 slides que já estavam fixos no HTML — usados
    // como padrão enquanto ninguém salvar nada customizado.
    const SLIDES_PADRAO = [
        { kicker: 'Nossos valores', titulo: 'Sustentabilidade', texto: 'Ser sustentável em relações sociais, econômicas e ambientais', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Superação', texto: 'Superar necessidades e expectativa', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Integridade', texto: 'Integridade e transparência', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Desafios', texto: 'Auto desafio constante', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Comunicação', texto: 'Comunicação', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Equipe', texto: 'Trabalho em equipe', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Responsabilidaes', texto: 'Assumir responsabilidades', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Atenção', texto: 'Atenção no presente para construção do futuro', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Convivência', texto: 'Ambiente descontraido com integração', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Organização', texto: 'Organização e planejamento', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Dedicação', texto: 'Dedicação', imagem_url: null },
        { kicker: 'Nossos valores', titulo: 'Trabalho em equipe', texto: 'Pessoas que constroem resultados juntas e transformam desafios em movimento.', imagem_url: null },
        { kicker: 'Nossa missão', titulo: 'Comprometimento', texto: 'A Wheel Tech é comprometida em gerar qualidade de vida e lazer ás pessoas do mundo do cliclismo', imagem_url: null },
        { kicker: 'Nossa missão', titulo: 'Esforço', texto: 'Nos esforçamos em fazer isso de forma diferenciada, inovadora e sustentãvel. Tornando a bike e a vida leve e alegre.', imagem_url: null },
        { kicker: 'Nossa visão', titulo: 'Inovação', texto: 'Continuar sendo referência em soluções e produtos inovadores para o cliclismo', imagem_url: null },
        { kicker: 'Nossa visão', titulo: 'Expansão', texto: 'Expandindo os canais de atendimento e aumentando a conexão com os clientes e fornecedores.', imagem_url: null }
    ];

    let slidesAtuais = [];
    let slidesEmEdicao = [];
    let salvandoCarrossel = false;


    function esc(valor) {
        return String(valor ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function sb() {
        return window.supabaseClient || null;
    }

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, tipo);
        } else {
            console.log(`[${tipo}] ${msg}`);
        }
    }

    function clonarSlidesPadrao() {
        return SLIDES_PADRAO.map(s => ({ ...s }));
    }


    // ============================================================
    // CARREGAR / RENDERIZAR O CARROSSEL NA TELA INICIAL
    // ============================================================

    async function carregarSlidesCarrossel() {

        const cli = sb();

        if (!cli) {
            slidesAtuais = clonarSlidesPadrao();
            return slidesAtuais;
        }

        try {
            const { data, error } = await cli
                .from('configuracoes_sistema')
                .select('valor')
                .eq('chave', CHAVE_CARROSSEL)
                .maybeSingle();

            if (error) throw error;

            const valor = data?.valor;

            slidesAtuais = (Array.isArray(valor) && valor.length)
                ? valor.map(s => ({
                    kicker: s?.kicker || '',
                    titulo: s?.titulo || '',
                    texto: s?.texto || '',
                    imagem_url: s?.imagem_url || null,
                    pelicula_ativa: Boolean(s?.pelicula_ativa),
                    pelicula_cor: s?.pelicula_cor || COR_PELICULA_PADRAO,
                    duracao_segundos:
                        Number.isFinite(Number(s?.duracao_segundos)) && Number(s?.duracao_segundos) > 0
                            ? Number(s.duracao_segundos)
                            : DURACAO_PADRAO_SEGUNDOS
                }))
                : clonarSlidesPadrao();

        } catch (erro) {
            console.warn('⚠️ Erro carregando slides do carrossel, usando padrão:', erro);
            slidesAtuais = clonarSlidesPadrao();
        }

        return slidesAtuais;
    }

    // Converte uma cor hex (#RRGGBB) em rgba(...) com a transparência
    // pedida — usado para montar a película na cor escolhida por
    // quem está editando (o degradê tem os mesmos 4 pontos de
    // transparência que a película azul original).
    function hexParaRgba(hex, alpha) {

        let h = String(hex || COR_PELICULA_PADRAO).trim().replace('#', '');

        if (h.length === 3) {
            h = h.split('').map(c => c + c).join('');
        }

        const r = parseInt(h.substring(0, 2), 16) || 0;
        const g = parseInt(h.substring(2, 4), 16) || 0;
        const b = parseInt(h.substring(4, 6), 16) || 0;

        return `rgba(${r},${g},${b},${alpha})`;
    }

    function construirGradientePelicula(cor) {
        return (
            `linear-gradient(90deg, ${hexParaRgba(cor, .98)}, ` +
            `${hexParaRgba(cor, .89)} 48%, ` +
            `${hexParaRgba(cor, .3)} 74%, ` +
            `${hexParaRgba(cor, .18)})`
        );
    }

    function renderizarCarrosselNaTela() {

        const container = document.querySelector('.carousel-container.wt-values');
        if (!container) return;

        if (!slidesAtuais.length) return;

        container.innerHTML = `
            <div class="carousel-slides">
                ${slidesAtuais.map(slide => {

                    // Sem imagem própria: mantém o fundo padrão (CSS
                    // de #menuSystem .wt-values .carousel-slide, com a
                    // foto fixa da bicicleta). Com imagem própria E
                    // película ativada: o style inline sobrepõe o CSS
                    // e aplica a película na cor escolhida sobre a
                    // foto. Com imagem própria SEM película: mostra a
                    // foto pura, sem degradê por cima.
                    let estiloFundo = '';

                    if (slide.imagem_url && slide.pelicula_ativa) {

                        estiloFundo =
                            ` style="background: ${construirGradientePelicula(slide.pelicula_cor)}, ` +
                            `url('${esc(slide.imagem_url)}') right center/cover no-repeat;"`;

                    } else if (slide.imagem_url) {

                        estiloFundo =
                            ` style="background: url('${esc(slide.imagem_url)}') right center/cover no-repeat;"`;
                    }

                    const duracao =
                        Number(slide.duracao_segundos) > 0
                            ? Number(slide.duracao_segundos)
                            : DURACAO_PADRAO_SEGUNDOS;

                    return `
                        <div class="carousel-slide" data-duracao="${duracao}"${estiloFundo}>
                            ${slide.kicker ? `<span class="wt-value-kicker">${esc(slide.kicker)}</span>` : ''}
                            ${slide.titulo ? `<h2>${esc(slide.titulo)}</h2>` : ''}
                            ${slide.texto ? `<p>${esc(slide.texto)}</p>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
            <button class="carousel-btn prev" type="button">&#10094;</button>
            <button class="carousel-btn next" type="button">&#10095;</button>
            <div class="carousel-indicators"></div>
        `;

        if (typeof window.initCarousel === 'function') {
            window.initCarousel();
        }
    }

    async function iniciarCarrossel() {
        await carregarSlidesCarrossel();
        renderizarCarrosselNaTela();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciarCarrossel);
    } else {
        iniciarCarrossel();
    }


    // ============================================================
    // MODAL DE EDIÇÃO
    // ============================================================

    function criarModalEditorCarrosselSeNecessario() {

        if (document.getElementById('modalEditorCarrossel')) return;

        const overlay = document.createElement('div');
        overlay.id = 'modalEditorCarrossel';
        overlay.className = 'modal hidden';
        overlay.addEventListener('click', e => {
            if (e.target === overlay) window.fecharEditorCarrossel();
        });

        overlay.innerHTML = `
            <div class="modal-content" style="max-width:760px; max-height:88vh; overflow-y:auto;" onclick="event.stopPropagation()">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <h3 style="margin:0;"><i class="fas fa-images"></i> Editar carrossel</h3>
                    <button onclick="fecharEditorCarrossel()" style="background:none; border:none; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                </div>
                <p class="text-muted" style="font-size:13px; margin-top:0;">
                    Estes são os cartões que aparecem girando na tela inicial, para todo mundo que entra no sistema.
                </p>
                <div id="listaSlidesCarrossel"></div>
                <div style="margin-top:12px;">
                    <button type="button" class="btn btn-secondary" onclick="adicionarSlideCarrossel()">
                        <i class="fas fa-plus"></i> Adicionar slide
                    </button>
                </div>
                <div style="text-align:right; margin-top:18px; display:flex; gap:8px; justify-content:flex-end; border-top:1px solid #e9ecef; padding-top:14px;">
                    <button class="btn btn-secondary" onclick="fecharEditorCarrossel()">Cancelar</button>
                    <button id="btnSalvarCarrossel" class="btn btn-primary" onclick="salvarEditorCarrossel()">
                        <i class="fas fa-save"></i> Salvar carrossel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    function renderizarListaSlidesCarrossel() {

        const lista = document.getElementById('listaSlidesCarrossel');
        if (!lista) return;

        if (!slidesEmEdicao.length) {
            lista.innerHTML = `
                <div class="alert alert-warning" style="margin-top:10px;">
                    Nenhum slide. Clique em "Adicionar slide" abaixo.
                </div>
            `;
            return;
        }

        lista.innerHTML = slidesEmEdicao.map((slide, index) => {

            const imagemAtual = slide._previewUrl || slide.imagem_url || null;

            return `
                <div style="display:flex; gap:12px; padding:12px 0; border-bottom:1px solid #eee; align-items:flex-start;">

                    <div style="flex-shrink:0; width:90px;">
                        <div style="width:90px; height:70px; border-radius:6px; background:#f1f3f5; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:6px;">
                            ${imagemAtual
                                ? `<img src="${esc(imagemAtual)}" style="width:100%; height:100%; object-fit:cover;">`
                                : `<i class="fas fa-image" style="color:#adb5bd; font-size:22px;"></i>`
                            }
                        </div>

                        <button type="button" class="btn btn-sm btn-outline-secondary" style="width:100%; font-size:11px;"
                            onclick="document.getElementById('carrosselImgInput${index}').click()">
                            Trocar imagem
                        </button>

                        <input type="file" id="carrosselImgInput${index}" accept="image/png,image/jpeg,image/webp"
                            style="display:none;" onchange="selecionarImagemSlideCarrossel(${index}, this.files[0])">

                        ${imagemAtual ? `
                            <button type="button" class="btn btn-sm btn-outline-danger" style="width:100%; font-size:11px; margin-top:4px;"
                                onclick="removerImagemSlideCarrossel(${index})">
                                Remover foto
                            </button>
                        ` : ''}
                    </div>

                    <div style="flex:1; display:flex; flex-direction:column; gap:6px; min-width:0;">
                        <input type="text" class="form-control form-control-sm" placeholder="Categoria (ex.: Nossos valores)"
                            value="${esc(slide.kicker || '')}"
                            oninput="atualizarCampoSlideCarrossel(${index}, 'kicker', this.value)">

                        <input type="text" class="form-control form-control-sm" placeholder="Título"
                            value="${esc(slide.titulo || '')}"
                            oninput="atualizarCampoSlideCarrossel(${index}, 'titulo', this.value)">

                        <textarea class="form-control form-control-sm" rows="2" placeholder="Texto"
                            oninput="atualizarCampoSlideCarrossel(${index}, 'texto', this.value)">${esc(slide.texto || '')}</textarea>

                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; margin:2px 0 0;">
                            Ficar parado
                            <input type="number" class="form-control form-control-sm" min="1" max="60" step="1"
                                style="width:64px; display:inline-block;"
                                value="${esc(slide.duracao_segundos || DURACAO_PADRAO_SEGUNDOS)}"
                                oninput="atualizarCampoSlideCarrossel(${index}, 'duracao_segundos', Number(this.value))">
                            segundos
                        </label>

                        ${imagemAtual ? `
                            <label style="display:flex; align-items:center; gap:6px; font-size:12px; margin:2px 0 0;">
                                <input type="checkbox" ${slide.pelicula_ativa ? 'checked' : ''}
                                    onchange="alternarPeliculaSlideCarrossel(${index}, this.checked)">
                                Aplicar película colorida sobre a foto
                                ${slide.pelicula_ativa ? `
                                    <input type="color" value="${esc(slide.pelicula_cor || COR_PELICULA_PADRAO)}"
                                        style="width:32px; height:24px; padding:0; border:1px solid #ced4da; border-radius:4px; cursor:pointer;"
                                        onchange="atualizarCampoSlideCarrossel(${index}, 'pelicula_cor', this.value)">
                                ` : ''}
                            </label>
                        ` : ''}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <button type="button" class="btn btn-sm btn-light" title="Mover para cima"
                            onclick="moverSlideCarrossel(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-light" title="Mover para baixo"
                            onclick="moverSlideCarrossel(${index}, 1)" ${index === slidesEmEdicao.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-down"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger" title="Remover slide"
                            onclick="removerSlideCarrossel(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>

                </div>
            `;
        }).join('');
    }

    window.abrirEditorCarrossel = function () {

        criarModalEditorCarrosselSeNecessario();

        // Cópia de trabalho — só afeta o carrossel de verdade quando
        // clicar em "Salvar carrossel".
        slidesEmEdicao = slidesAtuais.map(s => ({ ...s }));

        renderizarListaSlidesCarrossel();

        document.getElementById('modalEditorCarrossel')?.classList.remove('hidden');
    };

    window.fecharEditorCarrossel = function () {
        document.getElementById('modalEditorCarrossel')?.classList.add('hidden');
        slidesEmEdicao = [];
    };

    window.atualizarCampoSlideCarrossel = function (index, campo, valor) {
        if (!slidesEmEdicao[index]) return;
        slidesEmEdicao[index][campo] = valor;
    };

    window.alternarPeliculaSlideCarrossel = function (index, ativa) {

        if (!slidesEmEdicao[index]) return;

        slidesEmEdicao[index].pelicula_ativa = Boolean(ativa);

        if (ativa && !slidesEmEdicao[index].pelicula_cor) {
            slidesEmEdicao[index].pelicula_cor = COR_PELICULA_PADRAO;
        }

        renderizarListaSlidesCarrossel();
    };

    window.moverSlideCarrossel = function (index, direcao) {

        const novoIndex = index + Number(direcao);
        if (novoIndex < 0 || novoIndex >= slidesEmEdicao.length) return;

        [slidesEmEdicao[index], slidesEmEdicao[novoIndex]] =
            [slidesEmEdicao[novoIndex], slidesEmEdicao[index]];

        renderizarListaSlidesCarrossel();
    };

    window.removerSlideCarrossel = function (index) {
        if (!slidesEmEdicao[index]) return;
        slidesEmEdicao.splice(index, 1);
        renderizarListaSlidesCarrossel();
    };

    window.adicionarSlideCarrossel = function () {
        slidesEmEdicao.push({
            kicker: '',
            titulo: '',
            texto: '',
            imagem_url: null,
            pelicula_ativa: false,
            pelicula_cor: COR_PELICULA_PADRAO,
            duracao_segundos: DURACAO_PADRAO_SEGUNDOS
        });
        renderizarListaSlidesCarrossel();
    };

    window.selecionarImagemSlideCarrossel = function (index, file) {

        if (!file || !slidesEmEdicao[index]) return;

        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
            toast('⚠️ Envie apenas imagens PNG, JPG ou WEBP.', 'warning');
            return;
        }

        if (file.size > 8 * 1024 * 1024) {
            toast('⚠️ Imagem muito grande (máximo 8 MB).', 'warning');
            return;
        }

        slidesEmEdicao[index]._arquivoPendente = file;
        slidesEmEdicao[index]._previewUrl = URL.createObjectURL(file);

        renderizarListaSlidesCarrossel();
    };

    window.removerImagemSlideCarrossel = function (index) {
        if (!slidesEmEdicao[index]) return;
        slidesEmEdicao[index].imagem_url = null;
        slidesEmEdicao[index]._arquivoPendente = null;
        slidesEmEdicao[index]._previewUrl = null;
        slidesEmEdicao[index].pelicula_ativa = false;
        renderizarListaSlidesCarrossel();
    };

    async function uploadImagemCarrossel(file) {

        const cli = sb();
        if (!cli) throw new Error('Supabase não conectado.');

        const extensao = (file.name.split('.').pop() || 'jpg').toLowerCase();

        const nome =
            `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extensao}`;

        const { error } = await cli.storage
            .from(BUCKET_CARROSSEL)
            .upload(nome, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });

        if (error) {
            throw new Error(
                `Erro ao enviar imagem: ${error.message}. ` +
                `Confirme se o bucket "${BUCKET_CARROSSEL}" existe no Supabase Storage e é público.`
            );
        }

        const { data } = cli.storage
            .from(BUCKET_CARROSSEL)
            .getPublicUrl(nome);

        if (!data?.publicUrl) {
            throw new Error('Não foi possível obter a URL da imagem enviada.');
        }

        return data.publicUrl;
    }

    window.salvarEditorCarrossel = async function () {

        if (salvandoCarrossel) return;

        const btn = document.getElementById('btnSalvarCarrossel');

        if (!slidesEmEdicao.some(s => (s.titulo || '').trim() || (s.texto || '').trim())) {
            toast('⚠️ Adicione pelo menos um slide com título ou texto.', 'warning');
            return;
        }

        salvandoCarrossel = true;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        try {

            // Envia as imagens novas (staged localmente) antes de gravar.
            for (const slide of slidesEmEdicao) {

                if (slide._arquivoPendente) {

                    const url = await uploadImagemCarrossel(slide._arquivoPendente);
                    slide.imagem_url = url;
                }
            }

            const slidesLimpos = slidesEmEdicao.map(s => ({
                kicker: (s.kicker || '').trim(),
                titulo: (s.titulo || '').trim(),
                texto: (s.texto || '').trim(),
                imagem_url: s.imagem_url || null,
                pelicula_ativa: Boolean(s.imagem_url) && Boolean(s.pelicula_ativa),
                pelicula_cor: s.pelicula_cor || COR_PELICULA_PADRAO,
                duracao_segundos:
                    Number.isFinite(Number(s.duracao_segundos)) && Number(s.duracao_segundos) > 0
                        ? Number(s.duracao_segundos)
                        : DURACAO_PADRAO_SEGUNDOS
            }));

            const cli = sb();
            if (!cli) throw new Error('Supabase não conectado.');

            const { error } = await cli
                .from('configuracoes_sistema')
                .upsert(
                    { chave: CHAVE_CARROSSEL, valor: slidesLimpos },
                    { onConflict: 'chave' }
                );

            if (error) throw error;

            slidesAtuais = slidesLimpos;

            renderizarCarrosselNaTela();

            toast('✅ Carrossel atualizado!', 'success');

            window.fecharEditorCarrossel();

        } catch (erro) {

            console.error('❌ Erro salvando carrossel:', erro);

            toast('❌ Erro ao salvar: ' + (erro.message || 'erro desconhecido'), 'error');

        } finally {

            salvandoCarrossel = false;

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Salvar carrossel';
            }
        }
    };

})();
