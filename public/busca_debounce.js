// =========================================================
// DEBOUNCE GLOBAL DOS CAMPOS DE BUSCA
//
// Quase todos os campos de busca do sistema re-renderizam a
// lista inteira a cada tecla (oninput="filtrar...()"). Com
// listas grandes isso trava a digitação.
//
// Aqui seguramos o evento "input" dos campos de busca (na fase
// de captura, antes de chegar no campo) e só repassamos depois
// que a pessoa para de digitar por ESPERA_MS. Enter e sair do
// campo repassam na hora. Nenhum módulo precisa ser alterado.
//
// Para um campo específico ficar de fora: data-sem-debounce
// =========================================================
(function () {
    const ESPERA_MS = 250;
    const PADRAO_BUSCA = /busca|buscar|search|pesquis|filtr|🔍/i;

    const pendentes = new Map(); // campo -> timer
    const repassados = new WeakSet(); // eventos que nós mesmos disparamos

    function ehCampoBusca(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        if (el.hasAttribute('data-sem-debounce')) return false;
        const tipo = (el.type || 'text').toLowerCase();
        if (tipo !== 'text' && tipo !== 'search') return false;
        if (tipo === 'search') return true;
        return PADRAO_BUSCA.test(el.id || '') ||
            PADRAO_BUSCA.test(el.name || '') ||
            PADRAO_BUSCA.test(el.placeholder || '') ||
            PADRAO_BUSCA.test(el.className || '');
    }

    function repassar(campo) {
        const timer = pendentes.get(campo);
        if (timer === undefined) return;
        clearTimeout(timer);
        pendentes.delete(campo);
        if (!campo.isConnected) return;
        const evento = new Event('input', { bubbles: true });
        repassados.add(evento);
        campo.dispatchEvent(evento);
    }

    window.addEventListener('input', (e) => {
        if (repassados.has(e)) return;
        const campo = e.target;
        if (!ehCampoBusca(campo)) return;
        e.stopImmediatePropagation();
        clearTimeout(pendentes.get(campo));
        pendentes.set(campo, setTimeout(() => repassar(campo), ESPERA_MS));
    }, true);

    // Enter: aplica o filtro antes de qualquer handler de Enter rodar
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && pendentes.has(e.target)) repassar(e.target);
    }, true);

    // Saiu do campo: não deixa filtro pela metade
    window.addEventListener('blur', (e) => {
        if (pendentes.has(e.target)) repassar(e.target);
    }, true);
})();
