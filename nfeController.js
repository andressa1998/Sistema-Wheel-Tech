// nfeController.js - Emissão, Cancelamento, Listagem, Consulta, Avulsa, Sincronização ML
const { gerarXmlNfe } = require('./xmlBuilder');
const { assinarXml } = require('./xmlSigner');
const NFEService = require('./nfeService');
const { loadCertificates } = require('./utils');
const supabase = require('./supabaseClient');
const { extrairProtocolo, extrairChaveAcesso } = require('./nfeUtils');
const fs = require('fs');
const path = require('path');

const DEFAULT_IBGE = '4101804'; // Araucária/PR (fallback)

// ===== TOKENS CSRT DO AMBIENTE =====
const CSRT_TOKEN_HOMOLOGACAO = process.env.CSRT_TOKEN_HOMOLOGACAO || '16UBATD6FDRUDYK2NV5P21NVB1I08UOYC220';
const CSRT_TOKEN_PRODUCAO = process.env.CSRT_TOKEN_PRODUCAO || 'DM3JSLGIU2Z957T83B2P85CB8YG0C8D3JZUG';
const AMBIENTE = process.env.NFE_AMBIENTE || 'homologacao';

// ===================== OBTER CÓDIGO IBGE =====================
async function obterCodigoMunicipio(nomeCidade, uf, cep = null) {
    try {
        const { data, error } = await supabase
            .from('municipios')
            .select('codigo_ibge')
            .ilike('nome', nomeCidade.trim())
            .eq('uf', uf)
            .maybeSingle();
        if (data && !error && data.codigo_ibge) {
            return String(data.codigo_ibge);
        }

        if (cep) {
            const fetch = require('node-fetch');
            const cepLimpo = cep.replace(/\D/g, '');
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepLimpo}`);
            if (response.ok) {
                const json = await response.json();
                if (json.ibge_code) {
                    const ibge = String(json.ibge_code);
                    await supabase.from('municipios').upsert({
                        codigo_ibge: parseInt(ibge),
                        nome: json.city,
                        uf: json.state
                    }, { onConflict: 'codigo_ibge' });
                    return ibge;
                }
            }
        }

        console.warn(`⚠️ IBGE não encontrado para ${nomeCidade}/${uf}, usando padrão ${DEFAULT_IBGE}`);
        return DEFAULT_IBGE;
    } catch (error) {
        console.error('❌ Erro ao obter IBGE:', error);
        return DEFAULT_IBGE;
    }
}

// ===================== IMPORTAR NF-e NO ML =====================
async function importarNFEnoML(shipment_id, xml, token) {
    if (!shipment_id) return { ok: true };
    const url = `https://api.mercadolibre.com/shipments/${shipment_id}/invoice_data?siteId=MLB`;
    const fetch = require('node-fetch');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/xml' },
            body: xml
        });
        if (!response.ok) {
            const text = await response.text();
            console.warn(`❌ ML retornou erro ${response.status}: ${text.substring(0, 200)}`);
            return { ok: false };
        }
        return { ok: true, xml_url: response.headers.get('location') };
    } catch (error) {
        console.warn('Erro ao importar NF-e no ML (não crítico):', error.message);
        return { ok: false };
    }
}

// ===================== EMISSÃO DE NF-e =====================
async function emitirNFe(req, res) {
    console.log('📨 Requisição de emissão recebida');
    try {
        const dados = req.body;
        const { venda_id, cliente, produtos, cfop, natureza_operacao, modalidade_frete, transportadora_id } = dados;

        if (!cliente) throw new Error('Cliente não informado');
        if (!produtos || produtos.length === 0) throw new Error('Nenhum produto informado');

        const SELLER_UF = 'PR';
        let buyerUF = (cliente.uf || 'PR').toUpperCase();
        if (buyerUF === SELLER_UF && cfop !== '5102')
            throw new Error(`Venda dentro do estado (${buyerUF}) exige CFOP 5102.`);
        if (buyerUF !== SELLER_UF && cfop !== '6108')
            throw new Error(`Venda fora do estado (${buyerUF}) exige CFOP 6108.`);

        // ========== TRATAMENTO DO CPF/CNPJ ==========
        let documento = (cliente.documento || '').replace(/\D/g, '');
        if (!documento || (documento.length !== 11 && documento.length !== 14)) {
            console.warn('⚠️ Documento inválido, usando CPF genérico para homologação');
            documento = '99999999999';
        }
        let tipoDoc = (documento.length === 14) ? 'CNPJ' : 'CPF';

        // ========== DADOS DO DESTINATÁRIO ==========
        const logradouro = cliente.endereco || cliente.logradouro || 'NÃO INFORMADO';
        const numero = cliente.numero || 'S/N';
        const bairro = cliente.bairro || 'CENTRO';
        let cidade = cliente.cidade || 'ARAUCARIA';
        let uf = buyerUF;
        let cep = (cliente.cep || '83702090').replace(/\D/g, '');
        if (cep.length !== 8) cep = '83702090';

        let codigoIbge = DEFAULT_IBGE;
        try {
            codigoIbge = await obterCodigoMunicipio(cidade, uf, cep);
        } catch (err) {
            console.warn('Erro ao obter IBGE, usando padrão:', err.message);
        }

        const destinatario = {
            xNome: cliente.nome || 'Consumidor Final',
            xLgr: logradouro,
            nro: numero,
            xBairro: bairro,
            xMun: cidade,
            UF: uf,
            CEP: cep,
            cMun: codigoIbge
        };
        if (tipoDoc === 'CPF') {
            destinatario.CPF = documento;
        } else {
            destinatario.CNPJ = documento;
        }

        // ===== CORREÇÃO: FORÇAR NOME DO DESTINATÁRIO EM HOMOLOGAÇÃO =====
        if (AMBIENTE === 'homologacao') {
            destinatario.xNome = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
            console.log('🔁 Nome do destinatário ajustado para homologação.');
        }

        // ========== CONTROLE SEQUENCIAL DA NF ==========
        const serie = 3;
        let nNF = null;
        for (let i = 0; i < 5; i++) {
            try {
                const { data: controle } = await supabase
                    .from('controle_nfe')
                    .select('ultimo_numero')
                    .eq('serie', serie)
                    .maybeSingle();
                const proximo = (controle?.ultimo_numero || 50000) + 1;
                const { error } = await supabase
                    .from('controle_nfe')
                    .upsert({ serie, ultimo_numero: proximo }, { onConflict: 'serie' });
                if (!error) {
                    nNF = proximo;
                    console.log(`✅ Número NF alocado: ${nNF}`);
                    break;
                }
            } catch (err) { console.warn(err); }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!nNF) nNF = Math.floor(Math.random() * 900000000) + 100000000;

        // ========== GERAR XML (com CSRT dinâmico) ==========
        const tokenCSRT = AMBIENTE === 'producao' ? CSRT_TOKEN_PRODUCAO : CSRT_TOKEN_HOMOLOGACAO;
        const idCSRT = AMBIENTE === 'producao' ? '04' : '03';

        const xml = gerarXmlNfe({
            nNF,
            serie,
            tpAmb: AMBIENTE === 'producao' ? '1' : '2',
            destinatario,
            produtos,
            cfop,
            natOp: natureza_operacao || 'Venda',
            modFrete: modalidade_frete || '9',
            transportadora: null,
            volumes: { qVol: 0, pesoL: 0, pesoB: 0 },
            fatura: null,
            infAdic: null,
            respTec: {
                CNPJ: '32830261000125',
                xContato: 'WHEEL TECH BICYCLING LTDA',
                email: 'wheeltechbicycling@gmail.com.br',
                fone: '4131501230',
                tokenCSRT: tokenCSRT
            }
        });

        // ========== ASSINAR XML ==========
        const certData = loadCertificates();
        console.log('🔑 Certificado carregado?', !!certData.privateKey, !!certData.cert);
        const xmlAssinado = assinarXml(xml, { privateKey: certData.privateKey, cert: certData.cert });

        // ===== SALVAR XML PARA INSPEÇÃO =====
        const xmlPath = path.join(__dirname, 'xml_gerado', `nfe_${nNF}_${Date.now()}.xml`);
        const dir = path.dirname(xmlPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(xmlPath, xmlAssinado, 'utf8');
        console.log(`📁 XML salvo em: ${xmlPath}`);

        console.log('📄 XML ASSINADO (últimos 200 caracteres):', xmlAssinado.slice(-200));

        // ========== ENVIAR PARA SEFAZ ==========
        const nfeService = new NFEService(AMBIENTE);
        const respostaSefaz = await nfeService.sendNFe(xmlAssinado, certData);
        console.log('📨 RESPOSTA SEFAZ (COMPLETA):', respostaSefaz);

        // ========== EXTRAIR PROTOCOLO E CHAVE ==========
        const protocolo = extrairProtocolo(respostaSefaz);
        // Extrai a chave da resposta da SEFAZ (campo <chNFe>)
        const chaveMatch = respostaSefaz.match(/<chNFe>(\d+)<\/chNFe>/);
        let chaveAcesso;
        if (chaveMatch) {
            chaveAcesso = chaveMatch[1];
            console.log(`✅ Chave extraída da resposta SEFAZ: ${chaveAcesso}`);
        } else {
            // Fallback: extrair do XML assinado
            chaveAcesso = extrairChaveAcesso(xmlAssinado);
            console.log(`⚠️ Chave extraída do XML: ${chaveAcesso}`);
        }

        if (!protocolo) throw new Error('SEFAZ não retornou protocolo');
        console.log('✅ NF-e autorizada. Protocolo:', protocolo);

        // ========== SALVAR NF-e NO SUPABASE ==========
        const valorTotal = produtos.reduce((sum, p) => sum + (p.quantidade * p.valor_unitario), 0);

        const dadosInsert = {
            data_emissao: new Date().toISOString(),
            numero_nf: String(nNF),
            protocolo: protocolo,
            xml_assinado: xmlAssinado,
            chave_acesso: chaveAcesso,
            venda_id: venda_id || null
        };

        const { error: insertError } = await supabase
            .from('nfe_emitidas')
            .insert(dadosInsert);

        if (insertError) {
            console.error('❌ Erro ao salvar NF-e no Supabase:', insertError);
        } else {
            console.log('✅ NF-e salva no Supabase com sucesso.');
        }

        // ========== ATUALIZAR VENDA (se houver) ==========
        if (venda_id) {
            const { error: updateError } = await supabase
                .from('vendas_ml')
                .update({
                    nfe_emitida: true,
                    nfe_chave: chaveAcesso,
                    nfe_protocolo: protocolo,
                    data_emissao: new Date().toISOString()
                })
                .eq('id', venda_id);

            if (updateError) {
                console.error('⚠️ Erro ao atualizar venda:', updateError);
            } else {
                console.log('✅ Venda atualizada com a NF-e.');
            }
        }

        res.json({ success: true, protocolo, chaveAcesso });

    } catch (error) {
        console.error('❌ Erro na emissão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== CANCELAMENTO DE NF-e =====================
async function cancelarNFe(req, res) {
    console.log('📨 Requisição de cancelamento recebida');
    try {
        const { venda_id, chaveAcesso, justificativa } = req.body;
        let chave = chaveAcesso;
        if (!chave && venda_id) {
            const { data } = await supabase.from('vendas_ml').select('nfe_chave').eq('id', venda_id).single();
            if (!data?.nfe_chave) throw new Error('NF-e não encontrada para esta venda');
            chave = data.nfe_chave;
        }
        if (!chave) throw new Error('Chave de acesso não informada');
        const chaveNumerica = chave.replace(/\D/g, '');
        if (chaveNumerica.length !== 44) throw new Error('Chave inválida');

        // Busca o protocolo e último sequencial da NF-e – usando chave_acesso
        const { data: nfeData, error } = await supabase
            .from('nfe_emitidas')
            .select('ultimo_evento_seq, protocolo')
            .eq('chave_acesso', chaveNumerica)   // <-- corrigido
            .maybeSingle();

        if (error) {
            console.error('Erro ao buscar NF-e:', error);
            throw new Error('Erro ao consultar banco de dados');
        }

        if (!nfeData) throw new Error('NF-e não encontrada no banco');
        if (!nfeData.protocolo) throw new Error('NF-e sem protocolo de autorização');
        
        const tpEvento = "110111";
        const chNFe = chaveNumerica.length === 43 ? `${chaveNumerica}1` : chaveNumerica;
        const nSeqEvento = "01";
        const idEvento = `ID${tpEvento}${chNFe}${nSeqEvento}`;

        const xmlEvento = montarXmlCancelamento(
            chaveNumerica,
            nfeData.protocolo,
            justificativa || 'Cancelamento solicitado',
            nSeqEvento
        );

        const certData = loadCertificates();
        const xmlAssinado = assinarXmlEvento(xmlEvento, certData);
        const nfeService = new NFEService(AMBIENTE);
        console.log('📄 XML do evento ASSINADO (COMPLETO):\n', xmlAssinado);
        const resposta = await nfeService.sendEvento(xmlAssinado, certData);
        const resultado = extrairResultadoCancelamento(resposta);
        console.log(`📊 Resultado do cancelamento: cStat=${resultado.cStat}, motivo=${resultado.motivo}, protocolo=${resultado.protocolo}`);

        if (!resultado.cancelado && resultado.cStat !== '135' && resultado.cStat !== '136') {
        throw new Error(`SEFAZ rejeitou cancelamento: ${resultado.motivo} (cStat=${resultado.cStat})`);
        }

        // Atualiza NF-e – usando chave_acesso
        await supabase
            .from('nfe_emitidas')
            .update({
                cancelada: true,
                cancelamento_protocolo: resultado.protocolo,
                cancelamento_justificativa: justificativa,
                data_cancelamento: new Date().toISOString(),
                ultimo_evento_seq: nSeqEvento
            })
            .eq('chave_acesso', chaveNumerica);   // <-- corrigido

        if (venda_id) {
            await supabase
                .from('vendas_ml')
                .update({
                    nfe_cancelada: true,
                    nfe_cancelamento_protocolo: resultado.protocolo,
                    nfe_cancelamento_justificativa: justificativa,
                    nfe_cancelamento_data: new Date().toISOString(),
                    nfe_ultimo_evento_seq: nSeqEvento
                })
                .eq('id', venda_id);
        }

        res.json({ success: true, protocoloCancelamento: resultado.protocolo });
    } catch (error) {
        console.error('❌ Erro no cancelamento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

async function testarEventoRaw(req, res) {
    console.log('📨 [TESTE EVENTO] Enviando evento diretamente');
    try {
        let xml = req.body.xml || req.body;
        if (typeof xml === 'object') xml = xml.xml;
        if (!xml || typeof xml !== 'string') throw new Error('XML inválido');

        const certData = loadCertificates();
        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.sendEvento(xml, certData);
        const resultado = extrairResultadoCancelamento(resposta);
        res.json({ success: resultado.cancelado, ...resultado, resposta });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// ===================== LISTAR NF-ES EMITIDAS =====================
async function listarNFesEmitidas(req, res) {
    try {
        const { data, error } = await supabase
            .from('nfe_emitidas')
            .select('*')
            .order('data_emissao', { ascending: false });
        if (error) throw error;
        res.json({ success: true, notas: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== TRANSPORTADORAS =====================
async function listarTransportadoras(req, res) {
    try {
        const { data, error } = await supabase.from('transportadoras').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, transportadoras: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function cadastrarTransportadora(req, res) {
    try {
        const { nome, cnpj, ie, endereco, cidade, uf } = req.body;
        if (!nome || !cnpj) throw new Error('Nome e CNPJ obrigatórios');
        const { data, error } = await supabase.from('transportadoras').insert([{ nome, cnpj, ie, endereco, cidade, uf }]).select();
        if (error) throw error;
        res.json({ success: true, transportadora: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== CLIENTES =====================
async function listarClientes(req, res) {
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, clientes: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa(req, res) {
    try {
        const { cliente, produtos, cfop, natureza_operacao, modalidade_frete, transportadora_id } = req.body;
        if (!cliente || !produtos || !produtos.length) throw new Error('Dados incompletos');
        const dados = {
            venda_id: null,
            cliente,
            produtos,
            cfop,
            natureza_operacao: natureza_operacao || 'Venda',
            modalidade_frete: modalidade_frete || '9',
            transportadora_id
        };
        const emitResult = await new Promise((resolve, reject) => {
            emitirNFe({
                body: dados,
                json: resolve,
                status: (code) => ({ json: (obj) => reject({ status: code, ...obj }) })
            }, {
                json: resolve,
                status: (code) => ({ json: (obj) => reject({ status: code, ...obj }) })
            }).catch(reject);
        });
        res.json(emitResult);
    } catch (error) {
        console.error('Erro na emissão avulsa:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== CONSULTAR STATUS =====================
async function consultarStatusNFE(req, res) {
    try {
        const { chaveAcesso } = req.body;
        if (!chaveAcesso) throw new Error('Chave obrigatória');
        const certData = loadCertificates();
        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.consultarStatus(chaveAcesso.replace(/\D/g, ''), certData);
        const cStat = resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1] || '999';
        const xMotivo = resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'Desconhecido';
        res.json({ success: true, cStat, xMotivo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== VENDAS SEM NF-e (listagem) =====================
async function listarVendasSemNFE(req, res) {
    try {
        const { data, error } = await supabase
            .from('vendas_ml')
            .select('id, cliente, sku, valor_total, data_venda, dados_completos, meio_envio')
            .eq('nfe_emitida', false);
        if (error) throw error;
        if (!data) return res.json([]);
        const vendas = data.map(v => ({
            id: v.id,
            order_id: String(v.id),
            cliente_nome: v.cliente || 'Cliente',
            sku: v.sku,
            valor_total: v.valor_total,
            data_venda: v.data_venda,
            produtos: v.dados_completos,
            meio_envio: v.meio_envio
        }));
        res.json(vendas);
    } catch (error) {
        console.error('Erro listarVendasSemNFE:', error);
        res.status(500).json({ error: error.message });
    }
}

async function listarVendasComNFE(req, res) {
    try {
        const { data, error } = await supabase
            .from('vendas_ml')
            .select('*, nfe_emitidas(*)')
            .eq('nfe_emitida', true);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function buscarXMLPorChave(req, res) {
    const { chave } = req.query;
    if (!chave) return res.status(400).json({ error: 'Chave não informada' });
    try {
        const { data, error } = await supabase
            .from('nfe_emitidas')
            .select('xml')
            .eq('chave', chave)
            .single();
        if (error || !data) return res.status(404).json({ error: 'NF-e não encontrada' });
        res.json({ xml: data.xml });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// ===================== SINCRONIZAÇÃO (desabilitada no backend) =====================
async function sincronizarVendasML(req, res) {
    res.status(200).json({ success: false, message: 'Sincronize via frontend' });
}

// ===================== FUNÇÕES AUXILIARES (cancelamento) =====================
function montarXmlCancelamento(chaveAcesso, protocolo, justificativa, nSeqEvento) {
    // 1. Obtém o momento atual da máquina e subtrai 5 minutos de segurança
    const dataAlvo = new Date();
    dataAlvo.setMinutes(dataAlvo.getMinutes() - 5);

    // 2. Força a formatação exata no padrão da SEFAZ usando o fuso de Brasília (America/Sao_Paulo)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const partes = formatter.formatToParts(dataAlvo);
    const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));

    // Resultado esperado: YYYY-MM-DDTHH:mm:ss-03:00
    const dhEvento = `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}-03:00`;

    const nSeqEventoFormatado = String(nSeqEvento).padStart(2, '0');
    const id = `ID110111${chaveAcesso}${nSeqEventoFormatado}`;
    const nSeqEventoTag = String(parseInt(nSeqEvento, 10));

    return `<?xml version="1.0" encoding="UTF-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <idLote>${Math.floor(Math.random() * 999999999999999)}</idLote>
    <evento versao="1.00">
        <infEvento Id="${id}">
            <cOrgao>41</cOrgao>
            <tpAmb>${AMBIENTE === 'producao' ? '1' : '2'}</tpAmb>
            <CNPJ>32830261000125</CNPJ>
            <chNFe>${chaveAcesso}</chNFe>
            <dhEvento>${dhEvento}</dhEvento>
            <tpEvento>110111</tpEvento>
            <nSeqEvento>${nSeqEventoTag}</nSeqEvento>
            <verEvento>1.00</verEvento>
            <detEvento versao="1.00">
                <descEvento>Cancelamento</descEvento>
                <nProt>${protocolo}</nProt>
                <xJust>${justificativa.substring(0, 255)}</xJust>
            </detEvento>
        </infEvento>
    </evento>
</envEvento>`;
}

function assinarXmlEvento(xml, certData) {
    const { SignedXml } = require('xml-crypto');

    // 1. Extrair o Id do infEvento
    const idMatch = xml.match(/<infEvento[^>]*Id="([^"]+)"/);
    if (!idMatch) throw new Error('❌ Id do infEvento não encontrado para assinatura');
    const id = idMatch[1];
    console.log(`🔑 Assinando evento com Id: ${id}`);

    // 2. Limpar o XML (remove quebras e espaços extras)
    let xmlLimpo = xml
        .replace(/\r?\n/g, '')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // 3. Usar a chave privada diretamente (já é PKCS#8)
    const privateKeyPem = certData.privateKey;

    const sig = new SignedXml();
    sig.privateKey = privateKeyPem;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    // 4. Adicionar referência ao infEvento
    sig.addReference({
        xpath: `//*[local-name(.)='infEvento' and @Id='${id}']`,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        uri: `#${id}`
    });

    // 5. Inserir certificado na KeyInfo
    let certBase64 = certData.cert
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\r?\n/g, '')
        .trim();
    sig.getKeyInfoContent = () =>
        `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

    // 6. Calcular assinatura
    sig.computeSignature(xmlLimpo, {
        location: {
            reference: `//*[local-name(.)='infEvento' and @Id='${id}']`,
            action: 'after'
        }
    });

    let signedXml = sig.getSignedXml();

    // 7. Limpeza final
    signedXml = signedXml
        .replace(/xmlns=""/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '');

    if (!signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"')) {
        signedXml = signedXml.replace('<Signature', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
    }

    if (!signedXml.startsWith('<?xml')) {
        signedXml = '<?xml version="1.0" encoding="UTF-8"?>' + signedXml;
    }

    // Salvar o XML do evento assinado para inspeção (opcional)
    const eventPath = path.join(__dirname, 'xml_gerado', `evento_cancelamento_${Date.now()}.xml`);
    fs.writeFileSync(eventPath, signedXml, 'utf8');
    console.log(`📁 Evento assinado salvo em: ${eventPath}`);

    console.log('✅ Evento assinado com sucesso.');
    return signedXml;
}

function extrairResultadoCancelamento(respostaXml) {
    // Busca o retEvento (dentro do env:Body > nfeResultMsg > retEvento)
    const retEventoMatch = respostaXml.match(/<retEvento[^>]*>([\s\S]*?)<\/retEvento>/);
    if (!retEventoMatch) {
        // Se não encontrar retEvento, tenta buscar no envelope genérico (fallback)
        const cStat = respostaXml.match(/<cStat[^>]*>(\d+)<\/cStat>/)?.[1] || '999';
        const motivo = respostaXml.match(/<xMotivo[^>]*>([^<]+)<\/xMotivo>/)?.[1] || 'Erro desconhecido';
        const protocolo = respostaXml.match(/<nProt[^>]*>(\d+)<\/nProt>/)?.[1] || null;
        return { cancelado: (cStat === '135' || cStat === '136'), cStat, motivo, protocolo };
    }

    const retEvento = retEventoMatch[1];
    const cStat = retEvento.match(/<cStat[^>]*>(\d+)<\/cStat>/)?.[1] || '999';
    const motivo = retEvento.match(/<xMotivo[^>]*>([^<]+)<\/xMotivo>/)?.[1] || 'Erro desconhecido';
    const protocolo = retEvento.match(/<nProt[^>]*>(\d+)<\/nProt>/)?.[1] || null;

    // cStat 135 ou 136 indicam sucesso no cancelamento
    const cancelado = (cStat === '135' || cStat === '136');
    return { cancelado, cStat, motivo, protocolo };
}

// ===================== TESTE COM XML ENVIADO PELO USUÁRIO =====================
async function testarXmlRaw(req, res) {
    console.log('📨 [TESTE RAW] Recebendo XML para enviar à SEFAZ');
    try {
        let xml = req.body;
        if (typeof xml === 'object' && xml.xml) {
            xml = xml.xml;
        }
        if (typeof xml === 'object' && !xml.xml) {
            xml = req.body.toString();
        }
        if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
            return res.status(400).json({ error: 'XML não informado. Envie {"xml": "SEU_XML_AQUI"}' });
        }

        const certData = loadCertificates();
        const hasEnviNFe = /<enviNFe\s/.test(xml);

        let resposta;
        if (hasEnviNFe) {
            console.log('📄 XML já contém <enviNFe> – enviando diretamente.');
            const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${xml}</nfeDadosMsg></soap:Body></soap:Envelope>`;

            const axios = require('axios');
            const https = require('https');
            const httpsAgent = new https.Agent({
                cert: certData.cert,
                key: certData.privateKey,
                ca: certData.ca || undefined,
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.2'
            });
            const url = AMBIENTE === 'producao' ? 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4' : 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4';
            const response = await axios.post(url, soapEnvelope, {
                httpsAgent,
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeDadosMsg'
                },
                timeout: 60000,
                responseType: 'text'
            });
            resposta = response.data;
        } else {
            console.log('📄 XML sem <enviNFe> – utilizando NFEService padrão.');
            const nfeService = new NFEService(AMBIENTE);
            resposta = await nfeService.sendNFe(xml, certData);
        }

        const protocolo = extrairProtocolo(resposta);
        const cStat = resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1] || 'N/A';
        const xMotivo = resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'N/A';

        res.json({
            success: !!protocolo,
            protocolo: protocolo || null,
            cStat,
            xMotivo,
            respostaCompleta: resposta.substring(0, 2000)
        });
    } catch (error) {
        console.error('Erro no teste raw:', error);
        res.status(500).json({ error: error.message });
    }
}

// ===================== ROTA DE TESTE COM XML FIXO =====================
async function testarEnvioXMLFixo(req, res) {
    console.log('📨 [TESTE] Enviando XML conhecido (que já funcionou)');
    try {
        const xmlFixo = `<?xml version="1.0" encoding="UTF-8"?>
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>1</idLote>
    <indSinc>1</indSinc>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
        <infNFe versao="4.00" Id="NFe41260632830261000125550030000500101842455204">
            <ide>
                <cUF>41</cUF>
                <cNF>84245520</cNF>
                <natOp>Venda</natOp>
                <mod>55</mod>
                <serie>3</serie>
                <nNF>50010</nNF>
                <dhEmi>2026-06-19T09:14:19-03:00</dhEmi>
                <dhSaiEnt>2026-06-19T09:14:19-03:00</dhSaiEnt>
                <tpNF>1</tpNF>
                <idDest>1</idDest>
                <cMunFG>4101804</cMunFG>
                <tpImp>1</tpImp>
                <tpEmis>1</tpEmis>
                <cDV>4</cDV>
                <tpAmb>2</tpAmb>
                <finNFe>1</finNFe>
                <indFinal>1</indFinal>
                <indPres>9</indPres>
                <indIntermed>0</indIntermed>
                <procEmi>0</procEmi>
                <verProc>1.0</verProc>
            </ide>
            <emit>
                <CNPJ>32830261000125</CNPJ>
                <xNome>WHEEL TECH BICYCLING LTDA</xNome>
                <xFant>WHEEL TECH BICYCLING</xFant>
                <enderEmit>
                    <xLgr>RUA LOURENCO JASIOCHA</xLgr>
                    <nro>1927</nro>
                    <xBairro>CENTRO</xBairro>
                    <cMun>4101804</cMun>
                    <xMun>ARAUCARIA</xMun>
                    <UF>PR</UF>
                    <CEP>83702090</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                    <fone>4131501230</fone>
                </enderEmit>
                <IE>9087859328</IE>
                <CRT>1</CRT>
            </emit>
            <dest>
                <CPF>47840605885</CPF>
                <xNome>Andressa Miotto</xNome>
                <enderDest>
                    <xLgr>Rua Jardineira</xLgr>
                    <nro>156</nro>
                    <xBairro>Campina da Barra</xBairro>
                    <cMun>4101804</cMun>
                    <xMun>ARAUCARIA</xMun>
                    <UF>PR</UF>
                    <CEP>83709310</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                </enderDest>
                <indIEDest>9</indIEDest>
            </dest>
            <det nItem="1">
                <prod>
                    <cProd>MLB123456</cProd>
                    <cEAN>SEM GTIN</cEAN>
                    <xProd>Bicicleta Aro 29</xProd>
                    <NCM>87149990</NCM>
                    <CFOP>5102</CFOP>
                    <uCom>UN</uCom>
                    <qCom>1.0000</qCom>
                    <vUnCom>150.00000</vUnCom>
                    <vProd>150.00</vProd>
                    <cEANTrib>SEM GTIN</cEANTrib>
                    <uTrib>UN</uTrib>
                    <qTrib>1.0000</qTrib>
                    <vUnTrib>150.00000</vUnTrib>
                    <indTot>1</indTot>
                </prod>
                <imposto>
                    <ICMS>
                        <ICMSSN102>
                            <orig>0</orig>
                            <CSOSN>102</CSOSN>
                        </ICMSSN102>
                    </ICMS>
                    <PIS>
                        <PISNT>
                            <CST>07</CST>
                        </PISNT>
                    </PIS>
                    <COFINS>
                        <COFINSNT>
                            <CST>07</CST>
                        </COFINSNT>
                    </COFINS>
                </imposto>
            </det>
            <total>
                <ICMSTot>
                    <vBC>0.00</vBC>
                    <vICMS>0.00</vICMS>
                    <vICMSDeson>0.00</vICMSDeson>
                    <vFCP>0.00</vFCP>
                    <vBCST>0.00</vBCST>
                    <vST>0.00</vST>
                    <vFCPST>0.00</vFCPST>
                    <vFCPSTRet>0.00</vFCPSTRet>
                    <vProd>150.00</vProd>
                    <vFrete>0.00</vFrete>
                    <vSeg>0.00</vSeg>
                    <vDesc>0.00</vDesc>
                    <vII>0.00</vII>
                    <vIPI>0.00</vIPI>
                    <vIPIDevol>0.00</vIPIDevol>
                    <vPIS>0.00</vPIS>
                    <vCOFINS>0.00</vCOFINS>
                    <vOutro>0.00</vOutro>
                    <vTotTrib>0.00</vTotTrib>
                    <vNF>150.00</vNF>
                </ICMSTot>
            </total>
            <transp>
                <modFrete>9</modFrete>
            </transp>
            <pag>
                <detPag>
                    <tPag>01</tPag>
                    <vPag>150.00</vPag>
                </detPag>
            </pag>
            <infRespTec>
                <CNPJ>64555626000147</CNPJ>
                <xContato>MARIA ANTONIA MELO COSTA</xContato>
                <email>privacidade@iob.com.br</email>
                <fone>1930043303</fone>
                <idCSRT>01</idCSRT>
                <hashCSRT>z9ywwhAy7fsb/3QyV5mYiSRZnuA=</hashCSRT>
            </infRespTec>
        </infNFe>
    </NFe>
</enviNFe>`;

        const certData = loadCertificates();
        const { assinarXml: assinar } = require('./xmlSigner');
        const xmlAssinado = assinar(xmlFixo, certData);

        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.sendNFe(xmlAssinado, certData);
        const protocolo = extrairProtocolo(resposta);

        res.json({
            success: !!protocolo,
            protocolo: protocolo || null,
            cStat: resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1],
            xMotivo: resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1],
            respostaCompleta: resposta.substring(0, 1500)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}

// ===================== EXPORTAÇÃO =====================
module.exports = {
    emitirNFe,
    cancelarNFe,
    listarNFesEmitidas,
    listarTransportadoras,
    cadastrarTransportadora,
    listarClientes,
    emitirNFEAvulsa,
    consultarStatusNFE,
    sincronizarVendasML,
    listarVendasSemNFE,
    listarVendasComNFE,
    buscarXMLPorChave,
    testarEnvioXMLFixo,
    testarXmlRaw,
    testarEventoRaw
};