# Especificação do Sistema — Crawler de Precatórios (TJSP)

**Versão:** 1.0 | **Data:** 14/03/2026 | **Scope:** `apps/crawler`

---

## 1. Visão Geral

O crawler é um sistema automatizado de coleta e enriquecimento de dados de **precatórios** do Tribunal de Justiça de São Paulo (TJSP). Seu objetivo é extrair a lista de precatórios pendentes de pagamento por entidade pública, enriquecer cada registro com dados dos sistemas eletrônicos do judiciário e sinalizar alertas de risco para fins de análise (**due diligence**).

**Casos de uso principais:**
- Auditoria e análise exploratória de carteiras de precatórios
- Due diligence para potencial compra/venda de créditos judiciais
- Monitoramento de situação processual de precatórios por entidade

---

## 2. Fontes de Dados Integradas

| Fonte | Tipo de acesso | Dados obtidos |
|-------|---------------|---------------|
| **Portal TJSP** (`tjsp.jus.br/cac`) | Web scraping via Puppeteer + POST autenticado | Lista de precatórios em PDF por entidade |
| **e-SAJ TJSP** (`esaj.tjsp.jus.br`) | HTTP com cookies (sessão capturada) | Partes, movimentações, incidentes, tags processuais |
| **DataJud CNJ** (`api-publica.datajud.cnj.jus.br`) | API REST pública | Classe, assuntos, órgão julgador, movimentos CNJ |

---

## 3. Entidades Suportadas

O sistema opera sobre ~200 entidades públicas do estado de São Paulo cadastradas em `apps/crawler/src/configs/entidades.ts`. Exemplos:
- Institutos de Previdência (CAMPREV, FUNPREV, FUNSERV…)
- Autarquias de saneamento (DAAE, DAE, DAEA…)
- Fazenda do Estado de São Paulo
- INSS
- Câmaras Municipais e Fundações

Cada entidade possui um `id` numérico que é o identificador utilizado para consulta no portal do TJSP.

---

## 4. Workflow Principal

```
┌─────────────────────────────────────────────────────────────┐
│  ENTRADA: ID da entidade pública (ex.: "174" = CAIUÁ)        │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  ETAPA 1 — Iniciar Sessão TJSP    │
          │  (iniciar-sessao-tjsp.ts)         │
          └─────────────────┬────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  ETAPA 2 — Download do PDF        │
          │  (executar-tjsp.ts)               │
          └─────────────────┬────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  ETAPA 3 — Extração de Texto      │
          │  (extrair-conteudo-pdf.ts)        │
          └─────────────────┬────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  ETAPA 4 — Parse do PDF           │
          │  (extrair-dados-precatorio.ts)    │
          └─────────────────┬────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  ETAPA 5 — Loop por precatório    │
          │  ┌──────────────────────────┐    │
          │  │  ESAJ → dados processuais│    │
          │  │  DataJud → metadados CNJ │    │
          │  │  Consolidação + Alertas  │    │
          │  └──────────────────────────┘    │
          └─────────────────┬────────────────┘
                            │
          ┌─────────────────▼────────────────┐
          │  SAÍDA — JSONs em tmp/resultados/ │
          └──────────────────────────────────┘
```

### Etapa 1 — Iniciar Sessão no TJSP
**Arquivo:** `services/tjsp/iniciar-sessao-tjsp.ts`

O portal TJSP é uma aplicação GeneXus (framework legado) que requer tokens de sessão dinâmicos. O sistema usa **Puppeteer** (browser headless) para:
1. Abrir a página de precatórios no Chrome headless
2. Interceptar o primeiro POST feito ao selecionar uma entidade
3. Capturar: URL de POST válida, headers (com cookies), body encodado da requisição
4. Extrair a lista completa de entidades do campo GXState (JSON embutido no HTML)
5. Fechar o browser

**Resultado:** Objeto `SessaoTJSP` com tokens prontos para reutilização.

**Regra importante:** A sessão capturada (cookies + GXState) deve ser usada imediatamente — não é persistível entre execuções.

---

### Etapa 2 — Download do PDF
**Arquivo:** `services/tjsp/executar-tjsp.ts`

Com a sessão ativa, faz um POST para o TJSP substituindo o ID da entidade no body. O portal pode retornar:

| Resposta do servidor | Tratamento |
|---------------------|-----------|
| PDF diretamente | Salva em `tmp/pdfs/entidade-{id}.pdf` |
| JSON com redirect (GxCommands) | Faz GET no redirect, baixa o arquivo |
| ZIP contendo um PDF | Extrai o PDF do ZIP e salva |
| Conteúdo inválido | Salva como `-debug.html`, lança erro |

**Regra de CAPTCHA:** O GXState enviado força `CAPTCHA1_Validationresult = "1"`, simulando que o captcha foi resolvido.

---

### Etapa 3 — Extração de Texto do PDF
**Arquivo:** `services/tjsp/extrair-conteudo-pdf.ts`

Usa `pdf-parse` para converter o PDF em texto plano para processamento posterior.

---

### Etapa 4 — Parse do PDF (Precatórios)
**Arquivo:** `services/tjsp/extrair-dados-precatorio.ts`

Aplica uma **expressão regular complexa** sobre o texto do PDF para extrair os campos de cada precatório listado.

**Formato esperado no PDF:**
```
{numero_processo_CNJ}
ALIMENTARES | OUTRAS ESPÉCIES
Ordem de Pagamento: ...
{número_ordem}
{ano_orçamento}
{numero_processo_DEPRE}
Suspenso? S|N
Data do Protocolo: {data}
Advogado(s):
{nome_advogado_1}
{nome_advogado_2}
```

**Campos extraídos por precatório:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `ordem` | number | Posição na fila de pagamento |
| `natureza` | string | `ALIMENTARES` ou `OUTRAS ESPÉCIES` |
| `anoOrcamento` | string | Ano do orçamento vinculado |
| `processoOriginal` | string | Nº do processo no formato CNJ |
| `processoDepre` | string | Nº do processo no DEPRE (TJSP) |
| `dataProtocolo` | string | Data de protocolo do precatório |
| `suspenso` | boolean | Se o precatório está suspenso |
| `advogados` | string[] | Lista de advogados cadastrados |

---

### Etapa 5 — Enriquecimento e Consolidação (Loop)
**Arquivo:** `workflow/workflow-executar-entidade-tjsp.ts`

Para cada precatório encontrado no PDF, o sistema executa **sequencialmente** (com delay de 2 segundos entre iterações):

#### 5a — Consulta no e-SAJ
**Arquivo:** `services/tjsp/extrair-dados-esaj.ts`

Busca os dados processuais completos pelo número CNJ. Processo de 2 fases:
1. GET em `cpopg/open.do` → captura `conversationId` (cookie de sessão)
2. GET em `cpopg/search.do` com parâmetros do processo → retorna HTML da consulta

Após cada consulta, salva o HTML cru em `tmp/esaj/`.

**Dados extraídos do e-SAJ:**

| Campo | Descrição |
|-------|-----------|
| Metadados do processo | Classe, assunto, foro, vara, juiz, valor da ação |
| Partes | Requerente/Requerido/Exequente/Executado + advogados de cada |
| Movimentações | Histórico com data, descrição e complemento |
| Incidentes | Processos relacionados/vinculados com links |
| Tags | `suspenso`, `extinto`, `tramitacao-prioritaria` |

**Mapeamento de partes:**
```
reqte   → requerente
reqdo   → requerido
exeqte  → exequente
exectdo → executado
```

#### 5b — Consulta no DataJud
**Arquivo:** `services/datajud/extrair-dados-datajud.ts`

Busca via API pública do CNJ pelo número do processo (somente dígitos).

**Dados obtidos:**
- Classe processual (código CNJ)
- Assuntos (lista de códigos CNJ)
- Órgão julgador
- Data de ajuizamento
- Movimentos (com código e timestamp)

**Movimentos com significado especial:**

| Código | Significado |
|--------|------------|
| `848` | Trânsito em julgado |
| `466` | Homologação |

---

## 5. Regras de Negócio — Consolidação e Due Diligence

**Arquivo:** `services/tjsp/consolidar-dados-extraidos-tjsp.ts`

### 5.1 Identificação do Credor

O nome do credor é extraído das partes do processo no e-SAJ, priorizando os tipos `requerente` ou `exequente`.

### 5.2 Status de Suspensão

Um precatório é marcado como `suspenso = true` se **qualquer uma** das condições abaixo for verdadeira:
- Campo `Suspenso? S` no PDF do TJSP
- Tag `suspenso` presente no e-SAJ

### 5.3 Outros Status Derivados

| Campo | Fonte | Condição |
|-------|-------|----------|
| `extinto` | e-SAJ | Tag `extinto` presente |
| `prioritario` | e-SAJ | Tag `tramitacao-prioritaria` presente |
| `teveTransitoEmJulgado` | DataJud | Movimento com código `848` |
| `homologado` | DataJud | Movimento com código `466` |

### 5.4 Alertas de Risco (Due Diligence)

O sistema analisa o **texto de todas as movimentações** do processo no e-SAJ e gera alertas automáticos:

| Alerta | Padrão detectado | Risco |
|--------|-----------------|-------|
| `Risco de Inventário` | Menção a *óbito*, *falecimento* ou *herdeiro* | Credor pode ter falecido; direitos em disputa em inventário |
| `Risco de Constrição Judicial` | Menção a *penhora*, *arresto* ou *bloqueio* | Crédito pode estar constrito por outra dívida |
| `Possível Crédito Já Vendido` | Menção a *cessão*, *substabelecimento* ou *habilitado* | O crédito pode já ter sido cedido a terceiro |

> **Nota:** Múltiplos alertas podem ser gerados para um mesmo processo. A lista é deduplicada.

### 5.5 Lista de Advogados

Unificação das listas:
- Advogados listados no PDF do TJSP
- Advogados vinculados às partes no e-SAJ

A lista final é deduplicada.

---

## 6. Modelo de Dados — Saída

### `PrecatorioConsolidado`

```
processoOriginal      — Número CNJ do processo (formato: NNNNNNN-DD.AAAA.D.DD.OOOO)
processoDepre         — Número do processo no sistema DEPRE/TJSP
ordem                 — Posição na fila de pagamento da entidade
anoOrcamento          — Ano orçamentário vinculado ao pagamento
natureza              — ALIMENTARES | OUTRAS ESPÉCIES
suspenso              — Se o pagamento está suspenso
encontrado_esaj       — Se o processo foi localizado no e-SAJ
encontrado_datajud    — Se o processo foi localizado no DataJud
nomeCredor            — Nome do credor principal (requerente/exequente)
valorAcao             — Valor da ação conforme e-SAJ
advogados[]           — Lista unificada de advogados
classeCodigoCnj       — Código CNJ da classe processual
assuntosCodigosCnj[]  — Códigos CNJ dos assuntos
dataAjuizamento       — Data de ajuizamento do processo original
extinto               — Se o processo foi extinto
prioritario           — Se tem tramitação prioritária
teveTransitoEmJulgado — Se o processo transitou em julgado (cód. 848)
homologado            — Se foi homologado (cód. 466)
alertasRisco[]        — Lista de alertas de due diligence
```

---

## 7. Arquivos de Saída

Após a execução para uma entidade (`{id}`), 3 arquivos JSON são gerados:

| Arquivo | Conteúdo |
|---------|----------|
| `tmp/resultados/{id}.json` | Lista de `PrecatorioConsolidado` (resultado consolidado) |
| `tmp/resultados/{id}-esaj.json` | Dados brutos extraídos do e-SAJ por processo |
| `tmp/resultados/{id}-datajud.json` | Dados brutos extraídos do DataJud por processo |

Arquivos intermediários:
- `tmp/esaj/entidade-esaj-{processo}.html` — HTML cru de cada consulta e-SAJ
- `tmp/pdfs/entidade-{id}.pdf` — PDF baixado do TJSP

---

## 8. Limitações e Comportamentos Conhecidos

| Situação | Comportamento |
|----------|---------------|
| Processo não encontrado no e-SAJ | `encontrado_esaj = false`, campos ESAJ ficam vazios |
| Processo não encontrado no DataJud | `encontrado_datajud = false`, campos DataJud ficam `null` |
| PDF vem compactado em ZIP | Sistema descompacta automaticamente |
| PDF inválido ou resposta não reconhecida | Arquivo debug salvo e erro lançado |
| Sessão TJSP expirada/não capturada | Erro fatal: `POST não interceptado` |
| Delay entre requisições | 2 segundos fixos entre cada precatório (proteção anti-bloqueio) |
| Execução atual | Entry point `main.ts` processa somente a entidade `id = "174"` (CAIUÁ) |

---

---

*Documento gerado por análise estática de código — 14/03/2026*
