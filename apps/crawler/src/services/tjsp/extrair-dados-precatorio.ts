export interface DadosPrecatorio {
  ordem: number;
  natureza: string;
  anoOrcamento: string;
  processoOriginal: string;
  processoDepre: string;
  dataProtocolo: string;
  suspenso: boolean;
  advogados: string[];
}

function limpar(valor: string): string {
  return valor.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function extrairDadosPrecatorioDoTextoPDF(textoPdf: string): DadosPrecatorio[] {
  const textoLimpo = textoPdf
    .replace(/-- \d+ of \d+ --\n?/g, '')
    .replace(/\n([a-záàâãéêíóôõúüç])/g, '$1');

  const regex =
    /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\n(ALIMENTARES|OUTRAS ESPÉCIES)\nOrdem de Pagamento:\nNatureza:\nNº Processo DEPRE:\nNº de autos: Ordem Orçamentária:\n(\d+)\n(\d+\/\d{4})\n(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\n(Suspenso\? [SN])\nData do Protocolo: ([\d\/ :.]+)\nAdvogado\(s\):\s*([\s\S]*?)(?=(?:\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\n(?:ALIMENTARES|OUTRAS ESPÉCIES)|$))/g;

  return [...textoLimpo.matchAll(regex)].map((match) => ({
    ordem: parseInt(match[3]),
    natureza: limpar(match[2]),
    anoOrcamento: limpar(match[4]),
    processoOriginal: limpar(match[1]),
    processoDepre: limpar(match[5]),
    dataProtocolo: limpar(match[7]),
    suspenso: match[6].trim().slice(-1).toUpperCase() === 'S',
    advogados: match[8]
      .trim()
      .split('\n')
      .map((nome) => nome.trim())
      .filter(Boolean),
  }));
}
