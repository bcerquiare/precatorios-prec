import { DadosDataJud } from '../datajud/extrair-dados-datajud';
import { DadosProcessoESAJ } from './extrair-dados-esaj';
import { DadosPrecatorio } from './extrair-dados-precatorio';

export interface PrecatorioConsolidado {
  // Identificação Principal
  processoOriginal: string;
  processoDepre: string;

  // Status na Fila (PDF)
  ordem: number;
  anoOrcamento: string;
  natureza: string;
  suspenso: boolean;

  // Disponibilidade das fontes
  encontrado_esaj: boolean;
  encontrado_datajud: boolean;

  // Dados Comerciais (e-SAJ)
  nomeCredor: string;
  valorAcao: string;
  advogados: string[];

  // Estrutura Legal (DataJud)
  classeCodigoCnj: number | null;
  assuntosCodigosCnj: number[];
  dataAjuizamento: string | null;

  // Status ESAJ (tags)
  extinto: boolean;
  prioritario: boolean;

  // Due Diligence / Risco
  teveTransitoEmJulgado: boolean;
  homologado: boolean;
  alertasRisco: string[];
}

const REGRAS_ALERTA: { regex: RegExp; alerta: string }[] = [
  { regex: /óbito|falecimento|herdeiro/i, alerta: 'Risco de Inventário' },
  { regex: /penhora|arresto|bloqueio/i, alerta: 'Risco de Constrição Judicial' },
  { regex: /cessão|substabelecimento|habilitado/i, alerta: 'Possível Crédito Já Vendido' },
];

export function consolidarDadosExtraidosTjsp({
  precatorio,
  esaj,
  datajud,
}: {
  precatorio: DadosPrecatorio;
  esaj: DadosProcessoESAJ | null;
  datajud: DadosDataJud | null;
}): PrecatorioConsolidado {
  const encontrado_esaj = esaj !== null;
  const encontrado_datajud = datajud !== null;
  const nomeCredor = esaj?.partes.find((p) => p.tipo === 'requerente' || p.tipo === 'exequente')?.nome ?? '';

  const advogadosEsaj = esaj?.partes.flatMap((p) => p.advogados) ?? [];
  const advogados = [...new Set([...precatorio.advogados, ...advogadosEsaj])];

  const esajTags = esaj?.tags ?? [];
  const extinto = esajTags.includes('extinto');
  const prioritario = esajTags.includes('tramitacao-prioritaria');
  const suspensoEsaj = esajTags.includes('suspenso');

  const teveTransitoEmJulgado = datajud?.movimentos.some((m) => m.codigo === 848) ?? false;
  const homologado = datajud?.movimentos.some((m) => m.codigo === 466) ?? false;

  const alertasRisco = [
    ...new Set(
      (esaj?.movimentacoes ?? []).flatMap((mov) => {
        const texto = `${mov.descricao} ${mov.complemento}`;
        return REGRAS_ALERTA.filter((r) => r.regex.test(texto)).map((r) => r.alerta);
      }),
    ),
  ];

  return {
    processoOriginal: precatorio.processoOriginal,
    processoDepre: precatorio.processoDepre,
    ordem: precatorio.ordem,
    anoOrcamento: precatorio.anoOrcamento,
    natureza: precatorio.natureza,
    suspenso: precatorio.suspenso || suspensoEsaj,
    encontrado_esaj,
    encontrado_datajud,
    nomeCredor,
    valorAcao: esaj?.valorAcaoProcesso ?? '',
    advogados,
    classeCodigoCnj: datajud?.classe.codigo ?? null,
    assuntosCodigosCnj: datajud?.assuntos.map((a) => a.codigo) ?? [],
    dataAjuizamento: datajud?.dataAjuizamento ?? null,
    extinto,
    prioritario,
    teveTransitoEmJulgado,
    homologado,
    alertasRisco,
  };
}
