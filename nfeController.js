// nfeController.js - Emissão, Cancelamento, Listagem e Consulta de NF-e
const { gerarXmlNfe } = require('./xmlBuilder');
const { assinarXml } = require('./xmlSigner');
const NFEService = require('./nfeService');
const { loadCertificates } = require('./utils');
const supabase = require('./supabaseClient');
const { extrairProtocolo, extrairChaveAcesso } = require('./nfeUtils');

const fetch = require('node-fetch');
const FormData = require('form-data');

// ===================== Obter código IBGE =====================
async function obterCodigoMunicipio(nomeCidade, uf, cep = null) {
    console.log(`🔍 Buscando IBGE para: ${nomeCidade}/${uf}`);
    const { data: municipioData, error: dbError } = await supabase
        .from('municipios')
        .select('codigo_ibge')
        .ilike('nome', nomeCidade.trim())
        .eq('uf', uf)
        .maybeSingle();

    if (municipioData && !dbError) {
        console.log(`✅ IBGE encontrado no banco: ${municipioData.codigo_ibge}`);
        return String(municipioData.codigo_ibge);
    }

    if (cep) {
        try {
            const cepLimpo = cep.replace(/\D/g, '');
            console.log(`📡 Consultando BrasilAPI para CEP: ${cepLimpo}`);
            const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepLimpo}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.ibge_code) {
                    const ibge = String(data.ibge_code);
                    console.log(`✅ IBGE encontrado via CEP: ${ibge}`);
                    await supabase.from('municipios').upsert({
                        codigo_ibge: parseInt(ibge),
                        nome: data.city,
                        uf: data.state
                    }, { onConflict: 'codigo_ibge' });
                    return ibge;
                }
            }
        } catch (err) { console.warn('⚠️ Erro na consulta de CEP:', err.message); }
    }
    throw new Error(`IBGE não encontrado para ${nomeCidade}/${uf}`);
}

// ===================== Importar NF-e no ML =====================
async function importarNFEnoML(shipment_id, xml, token) {
    if (!shipment_id) return { ok: true };
    const url = `https://api.mercadolibre.com/shipments/${shipment_id}/invoice_data?siteId=MLB`;
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

async function anexarNotaFiscalAOPacote(pack_id, xml, token) {
    if (!pack_id) return true;
    const form = new FormData();
    const buffer = Buffer.from(xml, 'utf-8');
    form.append('fiscal_document', buffer, { filename: 'nfe.xml', contentType: 'application/xml' });
    try {
        const response = await fetch(`https://api.mercadolibre.com/packs/${pack_id}/fiscal_documents`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, ...form.getHeaders() },
            body: form
        });
        if (!response.ok) console.warn('Falha ao anexar NF-e ao pacote:', await response.text());
        return response.ok;
    } catch (error) {
        console.warn('Erro ao anexar NF-e (não crítico):', error.message);
        return false;
    }
}

// ===================== Emissão de NF-e =====================
async function emitirNFe(req, res) {
    console.log('📨 Requisição recebida:', req.method, req.url);
    console.log('📦 Body recebido:', JSON.stringify(req.body, null, 2));
    
    try {
        const dados = req.body;
        const { venda_id, cliente, produtos, cfop, natureza_operacao, modalidade_frete, access_token, shipment_id, pack_id } = dados;

        // ========== VALIDAÇÕES INICIAIS ==========
        if (!cliente) throw new Error('Dados do cliente não fornecidos');
        console.log('👤 Dados do cliente:', cliente);

        const SELLER_UF = 'PR';
        const buyerUF = cliente.uf?.toUpperCase() || '';
        if (!buyerUF) throw new Error('UF do cliente não informada');
        
        if (buyerUF === SELLER_UF && cfop !== '5102')
            throw new Error(`Venda dentro do estado (${buyerUF}) exige CFOP 5102.`);
        if (buyerUF !== SELLER_UF && cfop !== '6108')
            throw new Error(`Venda fora do estado (${buyerUF}) exige CFOP 6108.`);

        // ========== TRATAMENTO DO DOCUMENTO ==========
        let documento = cliente.documento || '';
        let tipoDoc = documento.includes('CNPJ') ? 'CNPJ' : 'CPF';
        let numeroDoc = documento.replace(/\D/g, '');
        
        // ========== ENDEREÇO DO DESTINATÁRIO ==========
        // Mapeamento flexível dos campos (aceita nomes alternativos)
        const logradouro = cliente.endereco || cliente.logradouro || cliente.address || '';
        const numero = cliente.numero || cliente.number || 'S/N';
        const bairro = cliente.bairro || cliente.neighborhood || '';
        const cidade = cliente.cidade || cliente.city || '';
        const uf = cliente.uf || cliente.state || '';
        const cep = (cliente.cep || cliente.postal_code || '').replace(/\D/g, '');
        
        if (!logradouro) console.warn('⚠️ Logradouro não informado');
        if (!cidade) throw new Error('Cidade do cliente não informada');
        if (!cep) console.warn('⚠️ CEP não informado');

        const destinatario = {
            CPF: tipoDoc === 'CPF' ? numeroDoc : undefined,
            CNPJ: tipoDoc === 'CNPJ' ? numeroDoc : undefined,
            xNome: cliente.nome || cliente.name || '',
            xLgr: logradouro,
            nro: numero,
            xBairro: bairro,
            xMun: cidade,
            UF: uf,
            CEP: cep
        };
        
        // Validação mínima
        if (!destinatario.xNome) throw new Error('Nome do cliente não informado');
        
        // Busca código IBGE
        destinatario.cMun = await obterCodigoMunicipio(cidade, uf, cep);
        console.log(`🏙️ Município IBGE: ${destinatario.cMun}`);

        // ========== CONTROLE SEQUENCIAL DA NF ==========
        const serie = 1;
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

        // ========== GERAÇÃO DO XML ==========
        const xml = gerarXmlNfe({
            nNF, 
            serie, 
            destinatario, 
            produtos, 
            cfop,
            natOp: natureza_operacao || 'VENDA',
            modFrete: modalidade_frete || '9',
            valor_total: produtos.reduce((sum, p) => sum + (p.quantidade * p.valor_unitario), 0)
        });

        console.log('📄 XML gerado (sem assinatura):', xml.substring(0, 500) + '...');

        // ========== ASSINATURA ==========
        const certData = loadCertificates();
        const xmlAssinado = assinarXml(xml, { privateKey: certData.privateKey, cert: certData.cert });

        // ========== ENVIO PARA SEFAZ ==========
        const nfeService = new NFEService('homologacao');
        const respostaSefaz = await nfeService.sendNFe(xmlAssinado, certData);
        const protocolo = await extrairProtocolo(respostaSefaz);
        const chaveAcesso = extrairChaveAcesso(xmlAssinado);
        
        if (!protocolo) throw new Error('SEFAZ não retornou protocolo');
        console.log('✅ NF-e autorizada. Protocolo:', protocolo);

        // ========== INTEGRAÇÃO MERCADO LIVRE ==========
        let mlResponse = { ok: true };
        if (shipment_id) {
            mlResponse = await importarNFEnoML(shipment_id, xmlAssinado, access_token);
            if (!mlResponse.ok) console.warn('Importação no ML falhou, mas NF-e emitida com sucesso.');
        }
        if (pack_id) await anexarNotaFiscalAOPacote(pack_id, xmlAssinado, access_token);

        // ========== ATUALIZAÇÃO DO BANCO ==========
        await supabase
            .from('vendas_ml')
            .update({
                nfe_emitida: true,
                nfe_chave: chaveAcesso,
                nfe_protocolo: protocolo,
                data_emissao: new Date().toISOString(),
                nfe_xml_url: mlResponse.xml_url || null,
                nfe_ultimo_evento_seq: 0
            })
            .eq('id_venda_ml', venda_id);

        res.json({ success: true, protocolo, chaveAcesso });
        
    } catch (error) {
        console.error('❌ Erro na emissão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== Consultar situação da NF-e na SEFAZ =====================
async function consultarStatusNFE(req, res) {
    try {
        const { chaveAcesso } = req.body;
        if (!chaveAcesso) throw new Error('Chave de acesso é obrigatória');

        const chaveNumerica = chaveAcesso.replace(/\D/g, '');
        if (chaveNumerica.length !== 44) throw new Error('Chave deve ter 44 dígitos');

        const certData = loadCertificates();
        const nfeService = new NFEService('producao');
        const resposta = await nfeService.consultarStatus(chaveNumerica, certData);

        const cStatMatch = resposta.match(/<cStat>(\d+)<\/cStat>/);
        const xMotivoMatch = resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/);
        const cStat = cStatMatch ? cStatMatch[1] : '999';
        const motivo = xMotivoMatch ? xMotivoMatch[1] : 'Desconhecido';

        res.json({ success: true, cStat, motivo, resposta: resposta.substring(0, 500) });
    } catch (error) {
        console.error('Erro na consulta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== Cancelamento de NF-e =====================
async function cancelarNFe(req, res) {
    console.log('📨 Requisição de cancelamento recebida:', req.body);
    try {
        const { venda_id, chaveAcesso, justificativa } = req.body;
        if (!venda_id || !chaveAcesso) {
            throw new Error('venda_id e chaveAcesso são obrigatórios');
        }

        const { data: venda, error: vendaError } = await supabase
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', venda_id)
            .single();

        if (vendaError || !venda || !venda.nfe_emitida) {
            throw new Error('Venda não encontrada ou NF-e não emitida');
        }
        if (venda.nfe_cancelada) {
            throw new Error('Esta NF-e já foi cancelada');
        }
        if (!venda.nfe_protocolo) {
            throw new Error('Protocolo da NF-e não encontrado no banco');
        }

        const dataEmissao = new Date(venda.data_emissao);
        const agora = new Date();
        const diffHoras = (agora - dataEmissao) / (1000 * 60 * 60);
        if (diffHoras > 24) {
            throw new Error(`Cancelamento não permitido: NF-e emitida há ${diffHoras.toFixed(1)} horas (limite 24h).`);
        }

        const chaveNumerica = chaveAcesso.replace(/\D/g, '');
        if (chaveNumerica.length !== 44) {
            throw new Error(`Chave de acesso inválida: ${chaveNumerica.length} dígitos (deveria ser 44)`);
        }

        let ultimoSeq = venda.nfe_ultimo_evento_seq || 0;
        let nSeqEvento = ultimoSeq + 1;
        if (nSeqEvento < 1) nSeqEvento = 1;
        const nSeqEventoStr = nSeqEvento.toString();

        const xmlEvento = montarXmlCancelamentoCorrigido({
            chaveAcesso: chaveNumerica,
            protocolo: venda.nfe_protocolo,
            justificativa: justificativa || 'Cancelamento solicitado pelo usuário',
            tpAmb: '1', // produção
            nSeqEvento: nSeqEventoStr
        });

        console.log('📄 XML do cancelamento:\n', xmlEvento);

        const certData = loadCertificates();
        const xmlAssinado = assinarXmlEvento(xmlEvento, certData);
        console.log('✅ XML do evento assinado');

        const nfeService = new NFEService('producao');
        const respostaSefaz = await nfeService.sendEvento(xmlAssinado, certData);
        console.log('📄 Resposta SEFAZ (evento):\n', respostaSefaz);

        const resultado = extrairResultadoCancelamento(respostaSefaz);
        console.log('📊 Resultado extraído:', resultado);

        await supabase
            .from('vendas_ml')
            .update({ nfe_ultimo_evento_seq: nSeqEvento })
            .eq('id_venda_ml', venda_id);

        if (!resultado.cancelado) {
            if (resultado.cStat === '128') {
                const consulta = await nfeService.consultarStatus(chaveNumerica, certData);
                const cStatConsulta = consulta.match(/<cStat>(\d+)<\/cStat>/)?.[1];
                if (cStatConsulta === '100') {
                    throw new Error('NF-e ainda está ativa. O lote de evento foi rejeitado por duplicidade. Tente novamente com outro número de sequência.');
                } else if (cStatConsulta === '101' || cStatConsulta === '135') {
                    console.log('✅ NF-e está cancelada na SEFAZ! Atualizando banco...');
                    await supabase
                        .from('vendas_ml')
                        .update({
                            nfe_cancelada: true,
                            nfe_cancelamento_protocolo: 'CONSULTA_AUTOMATICA',
                            nfe_cancelamento_justificativa: justificativa || 'Cancelamento detectado via consulta',
                            nfe_cancelamento_data: new Date().toISOString()
                        })
                        .eq('id_venda_ml', venda_id);
                    return res.json({ success: true, protocoloCancelamento: 'CONSULTA_AUTOMATICA', message: 'NF-e já cancelada na SEFAZ. Banco atualizado.' });
                } else {
                    throw new Error(`SEFAZ rejeitou cancelamento: ${resultado.motivo} (cStat=${resultado.cStat})`);
                }
            }
            throw new Error(`SEFAZ rejeitou cancelamento: ${resultado.motivo} (cStat=${resultado.cStat})`);
        }

        await supabase
            .from('vendas_ml')
            .update({
                nfe_cancelada: true,
                nfe_cancelamento_protocolo: resultado.protocolo,
                nfe_cancelamento_justificativa: justificativa,
                nfe_cancelamento_data: new Date().toISOString()
            })
            .eq('id_venda_ml', venda_id);

        res.json({ success: true, protocoloCancelamento: resultado.protocolo });
    } catch (error) {
        console.error('❌ Erro no cancelamento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== Listar NF-e emitidas =====================
async function listarNotas(req, res) {
    try {
        const { data, error } = await supabase
            .from('vendas_ml')
            .select('id_venda_ml, nfe_chave, nfe_protocolo, data_emissao, nfe_cancelada, nfe_cancelamento_data')
            .eq('nfe_emitida', true)
            .order('data_emissao', { ascending: false });

        if (error) throw error;
        res.json({ success: true, notas: data });
    } catch (error) {
        console.error('Erro ao listar notas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== XML de cancelamento =====================
function montarXmlCancelamentoCorrigido({ chaveAcesso, protocolo, justificativa, tpAmb = '1', nSeqEvento }) {
    const now = new Date();
    const dhEvento = now.toISOString().replace(/\.\d{3}Z$/, '-03:00');
    const tpEvento = '110111';
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 100);
    let idLote = timestamp + randomSuffix;
    if (idLote.toString().length > 15) {
        idLote = Math.floor(Math.random() * 999999999999999);
    }
    const id = `ID${chaveAcesso}${tpEvento}${nSeqEvento}`;

    console.log('📌 idLote:', idLote);
    console.log('📌 nSeqEvento:', nSeqEvento);
    console.log('📌 Id evento:', id, 'comprimento:', id.length);

    return `<?xml version="1.0" encoding="UTF-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <idLote>${idLote}</idLote>
    <evento versao="1.00">
        <infEvento Id="${id}">
            <cOrgao>41</cOrgao>
            <tpAmb>${tpAmb}</tpAmb>
            <CNPJ>32830261000125</CNPJ>
            <chNFe>${chaveAcesso}</chNFe>
            <dhEvento>${dhEvento}</dhEvento>
            <tpEvento>${tpEvento}</tpEvento>
            <nSeqEvento>${nSeqEvento}</nSeqEvento>
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

// ===================== Assinatura de evento =====================
function assinarXmlEvento(xml, certData) {
    const { SignedXml } = require('xml-crypto');
    const sig = new SignedXml();
    sig.privateKey = certData.privateKey;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    sig.addReference({
        xpath: "//*[local-name(.)='infEvento']",
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        uri: ''
    });

    sig.getKeyInfoContent = function () {
        const cert = certData.cert
            .replace('-----BEGIN CERTIFICATE-----', '')
            .replace('-----END CERTIFICATE-----', '')
            .replace(/\r/g, '')
            .replace(/\n/g, '');
        return `<X509Data><X509Certificate>${cert}</X509Certificate></X509Data>`;
    };

    sig.computeSignature(xml, {
        location: { reference: "//*[local-name(.)='infEvento']", action: 'after' }
    });

    let signedXml = sig.getSignedXml();
    signedXml = signedXml.replace('<Signature>', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    signedXml = signedXml.replace(/xmlns=""/g, '');
    return signedXml;
}

// ===================== Extrair resultado do cancelamento =====================
function extrairResultadoCancelamento(respostaXml) {
    let cStatMatch = respostaXml.match(/<cStat[^>]*>(\d+)<\/cStat>/);
    let xMotivoMatch = respostaXml.match(/<xMotivo[^>]*>([^<]+)<\/xMotivo>/);
    let nProtMatch = respostaXml.match(/<nProt[^>]*>(\d+)<\/nProt>/);
    
    const cStat = cStatMatch ? cStatMatch[1] : '999';
    const motivo = xMotivoMatch ? xMotivoMatch[1] : 'Erro desconhecido';
    const protocolo = nProtMatch ? nProtMatch[1] : null;
    
    const cancelado = (cStat === '135' || cStat === '136');
    
    return { cancelado, cStat, motivo, protocolo };
}

module.exports = { emitirNFe, cancelarNFe, listarNotas, consultarStatusNFE };