import got from 'got';

const DATAJUD_URL =
  'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search';

const DATAJUD_HEADERS = {
  Authorization:
    'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface DadosDataJud {
  numeroProcesso: string;
  classe: { codigo: number; nome: string };
  assuntos: { codigo: number; nome: string }[];
  orgaoJulgador: { codigo: number; nome: string };
  dataAjuizamento: string;
  nivelSigilo: number;
  movimentos: { codigo: number; nome: string; dataHora: string }[];
}

interface DataJudRawResponse {
  hits: {
    hits: {
      _id: string;
      _source: DadosDataJud;
    }[];
  };
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function mapearDados(source: DadosDataJud): DadosDataJud {
  return {
    numeroProcesso: source.numeroProcesso,
    classe: source.classe,
    assuntos: source.assuntos,
    orgaoJulgador: source.orgaoJulgador,
    dataAjuizamento: source.dataAjuizamento,
    nivelSigilo: source.nivelSigilo,
    movimentos: source.movimentos,
  };
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export async function extrairDadosDataJud(
  numeroProcesso: string,
): Promise<DadosDataJud[]> {
  const numeroProcessoSanitizado = numeroProcesso.replace(/[^\d]/g, '');

  const response = await got.post(DATAJUD_URL, {
    headers: DATAJUD_HEADERS,
    json: {
      query: {
        match: {
          numeroProcesso: numeroProcessoSanitizado,
        },
      },
    },
    responseType: 'json',
  });

  const body = response.body as DataJudRawResponse;

  return body.hits.hits.map((hit) => mapearDados(hit._source));
}
