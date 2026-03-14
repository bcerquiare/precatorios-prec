import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Browser } from '../../libs/browser.js';
import type { CheerioAPI } from 'cheerio';

const ESAJ_DIR = join(process.cwd(), 'tmp', 'esaj');
const ESAJ_BASE_URL = 'https://esaj.tjsp.jus.br';

// Formato CNJ: NNNNNNN-DD.AAAA.8.26.OOOO
const CNJ_REGEX = /^(\d{7}-\d{2}\.\d{4})\.8\.26\.(\d{4})$/;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface DadosProcessoESAJ {
  numeroProcesso: string;
  classeProcesso: string;
  assuntoProcesso: string;
  foroProcesso: string;
  varaProcesso: string;
  juizProcesso: string;
  valorAcaoProcesso: string;
  partes: { tipo: string; nome: string; advogados: string[] }[];
  movimentacoes: { data: string; descricao: string; complemento: string }[];
  incidentes: { dataRecebimento: string; classe: string; href: string }[];
  tags: ('suspenso' | 'extinto' | 'tramitacao-prioritaria')[];
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function limpar(v: string): string {
  return v.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function removerAcentos(v: string): string {
  return v.normalize('NFD').replace(/\p{M}/gu, '');
}

function parsearNumeroCNJ(processoOriginal: string): {
  numeroDigitoAnoUnificado: string;
  foroNumeroUnificado: string;
} {
  const match = CNJ_REGEX.exec(processoOriginal.trim());
  if (!match) {
    throw new Error(
      `Número de processo inválido: "${processoOriginal}". Formato esperado: NNNNNNN-DD.AAAA.8.26.OOOO`,
    );
  }
  return { numeroDigitoAnoUnificado: match[1], foroNumeroUnificado: match[2] };
}

function parsearDadosProcesso($: CheerioAPI): DadosProcessoESAJ {
  const texto = (selector: string) => limpar($(selector).first().text());
  const titulo = (selector: string) =>
    $(selector).first().attr('title') ?? texto(selector);

  // --- Partes ---
  const TIPO_PARTE_MAP: Record<string, DadosProcessoESAJ['partes'][number]['tipo']> = {
    reqte: 'requerente',
    reqdo: 'requerido',
    exeqte: 'exequente',
    exectdo: 'executado',
  };

  const partes: DadosProcessoESAJ['partes'] = [];
  $('#tablePartesPrincipais tr').each((_, tr) => {
    const tipoRaw = limpar($(tr).find('.tipoDeParticipacao').text());
    if (!tipoRaw) return;
    const tipoNormalizado = removerAcentos(tipoRaw).toLowerCase().replace(/[.:]/g, '').trim();
    const tipo = TIPO_PARTE_MAP[tipoNormalizado] ?? tipoRaw;
    const chunks = $(tr).find('.nomeParteEAdvogado').text().split(/Advogado(?:s)?:/);
    const nome = limpar(chunks[0]);
    const advogados = chunks.slice(1).map(limpar).filter(Boolean);
    partes.push({ tipo, nome, advogados });
  });

  // --- Movimentações (tabela completa) ---
  const movimentacoes: DadosProcessoESAJ['movimentacoes'] = [];
  $('#tabelaTodasMovimentacoes .containerMovimentacao').each((_, tr) => {
    const data = limpar($(tr).find('.dataMovimentacao').text());
    const descricaoEl = $(tr).find('.descricaoMovimentacao');
    const complemento = limpar(descricaoEl.find('span[style*="font-style"]').text());
    const clonado = descricaoEl.clone();
    clonado.find('span[style*="font-style"]').remove();
    const descricao = limpar(clonado.text());
    movimentacoes.push({ data, descricao, complemento });
  });

  // --- Tags ---
  const tags: any[] = [];
  $('#containerDadosPrincipaisProcesso .unj-tag').each((_, el) => {
    const tag = removerAcentos(limpar($(el).text()).toLowerCase()).replace(/ /g, '-');
    if (tag) tags.push(tag);
  });

  // --- Incidentes ---
  const incidentes: DadosProcessoESAJ['incidentes'] = [];
  $('a.incidente').each((_, a) => {
    const tr = $(a).closest('tr');
    const dataRecebimento = limpar(tr.find('td').first().text());
    const classe = limpar($(a).text());
    const href = $(a).attr('href') ?? '';
    incidentes.push({ dataRecebimento, classe, href });
  });

  return {
    numeroProcesso: texto('#numeroProcesso'),
    classeProcesso: titulo('#classeProcesso'),
    assuntoProcesso: titulo('#assuntoProcesso'),
    foroProcesso: titulo('#foroProcesso'),
    varaProcesso: titulo('#varaProcesso'),
    juizProcesso: titulo('#juizProcesso'),
    valorAcaoProcesso: texto('#valorAcaoProcesso'),
    partes,
    movimentacoes,
    incidentes,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Ponto de entrada
// ---------------------------------------------------------------------------

export async function extrairDadosDoESAJ(processoOriginal: string): Promise<DadosProcessoESAJ> {
  const { numeroDigitoAnoUnificado, foroNumeroUnificado } = parsearNumeroCNJ(processoOriginal);

  const browser = new Browser();

  try {
    // Fase 1: semente de sessão — captura cookies e conversationId
    const openResponse = await browser.get(`${ESAJ_BASE_URL}/cpopg/open.do`);
    const conversationId = (openResponse.$('input[name="conversationId"]').val() ?? '') as string;

    // Fase 2: busca o processo via search.do (GET, mesmo fluxo do formulário)
    const params = new URLSearchParams({
      conversationId,
      cbPesquisa: 'NUMPROC',
      'dadosConsulta.tipoNuProcesso': 'UNIFICADO',
      numeroDigitoAnoUnificado,
      foroNumeroUnificado,
      'dadosConsulta.valorConsultaNuUnificado': processoOriginal,
    });

    const response = await browser.get(`${ESAJ_BASE_URL}/cpopg/search.do?${params.toString()}`);

    const nomeArquivo = `entidade-esaj-${processoOriginal.replace(/[/\\:*?"<>|]/g, '_')}.html`;
    await mkdir(ESAJ_DIR, { recursive: true });
    await writeFile(join(ESAJ_DIR, nomeArquivo), response.html, 'utf-8');

    return parsearDadosProcesso(response.$);
  } finally {
    browser.dispose();
  }
}
