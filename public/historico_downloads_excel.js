/* ============================================================
   WHEEL TECH · Histórico de downloads de Excel
   ------------------------------------------------------------
   Não existe um único lugar central de onde toda exportação de
   Excel passa — cada aba tem sua própria função (exportarXxxExcel).
   Em vez de mexer em cada uma delas, este arquivo intercepta o
   XLSX.writeFile (o ponto onde TODAS elas realmente disparam o
   download) e registra ali: usuário, aba (detectada pela tela
   visível no momento) e data/hora.
   ============================================================ */
(function () {
    'use strict';

    const NOMES_TELA = {
        mainSystem: 'Menu Principal',
        salesSystem: 'Vendas ML',
        reembolsosSystem: 'Reembolsos',
        caixaSystem: 'Caixa / Conferência',
        precificacaoSystem: 'Precificação',
        feedbackSystem: 'Feedback',
        reviewsSystem: 'Avaliações',
        folgasSystem: 'Folgas',
        shippingSystem: 'Gerenciar Frete',
        perguntasSystem: 'Perguntas',
        nfeSystem: 'NF-e',
        entradasSystem: 'Entradas',
        fullSystem: 'Full',
        estoqueGestaoSystem: 'Gestão de Estoque',
        gerenciamentoAnunciosSystem: 'Gerenciamento de Anúncios',
        promocoesSystem: 'Promoções',
        chamadosSystem: 'Chamados',
        reclamacoesSystem: 'Reclamações',
        historicoAcessosScreen: 'Histórico de Acessos',
        metaRonaldSystem: 'Meta Ronald',
        devolucoesSystem: 'Devoluções',
        reclamacoesClientesSystem: 'Reclamações de Clientes',
        atividadesSystem: 'Controle de Atividades',
        projetosSystem: 'Projetos/Tarefas',
        patrimoniosSystem: 'Patrimônios WT',
        sugestoesSystem: 'Sugestões de Melhoria'
    };

    function elementoVisivel(el) {
        if (!el || el.classList.contains('hidden')) return false;
        const estilo = window.getComputedStyle(el);
        return estilo.display !== 'none' && estilo.visibility !== 'hidden';
    }

    function prettificarId(id) {
        const semSufixo = id.replace(/(System|Screen)$/, '');
        const comEspacos = semSufixo.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        return comEspacos.charAt(0).toUpperCase() + comEspacos.slice(1);
    }

    function detectarAbaAtual() {
        for (const id of Object.keys(NOMES_TELA)) {
            if (elementoVisivel(document.getElementById(id))) return NOMES_TELA[id];
        }
        // Fallback: qualquer outro container "...System"/"...Screen" visível
        // que não esteja no mapa acima (telas novas que ainda não foram
        // adicionadas na lista) — assim isso continua funcionando mesmo
        // se um módulo novo for criado depois sem mexer neste arquivo.
        const candidatos = document.querySelectorAll('[id$="System"], [id$="Screen"]');
        for (const el of candidatos) {
            if (elementoVisivel(el)) return prettificarId(el.id);
        }
        return 'Não identificada';
    }

    async function registrarDownloadExcel(nomeArquivo) {
        try {
            if (!window.supabaseClient) return;
            await window.supabaseClient.from('excel_export_history').insert([{
                usuario_username: (window.currentUser && window.currentUser.username) || null,
                usuario_nome: (window.currentUser && window.currentUser.name) || null,
                aba: detectarAbaAtual(),
                arquivo: nomeArquivo || null
            }]);
        } catch (e) {
            console.warn('[historico-downloads-excel] erro ao registrar:', e);
        }
    }

    function instalarInterceptacao() {
        if (typeof XLSX === 'undefined' || !XLSX.writeFile || XLSX.writeFile.__wtInterceptado) return false;
        const original = XLSX.writeFile;
        const patched = function (wb, filename, opts) {
            registrarDownloadExcel(filename);
            return original.call(this, wb, filename, opts);
        };
        patched.__wtInterceptado = true;
        XLSX.writeFile = patched;
        return true;
    }

    // XLSX pode carregar depois deste script (ordem de <script> na
    // página) — tenta algumas vezes até conseguir interceptar.
    let tentativas = 0;
    const timer = setInterval(() => {
        tentativas++;
        if (instalarInterceptacao() || tentativas > 40) clearInterval(timer);
    }, 500);

    // ---------- leitura pra tela de Histórico de Acessos ----------
    window.carregarHistoricoDownloadsExcel = async function (limite = 200) {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('excel_export_history')
            .select('*')
            .order('criado_em', { ascending: false })
            .limit(limite);
        if (error) {
            console.warn('[historico-downloads-excel] erro ao carregar:', error);
            return [];
        }
        return data || [];
    };
})();
