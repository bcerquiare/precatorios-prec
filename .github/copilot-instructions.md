# Guia Elo - Mottive Stack

## Agent Skills

Este projeto adota **Agent Skills** como padrão. Skills ficam em `.github/skills/` e DEVEM seguir as regras abaixo.

### Antes de Criar uma Skill

Defina 2-3 use cases concretos antes de escrever qualquer código:

```
Use Case: [Nome]
Trigger: O que o usuário diz (ex: "criar endpoint de usuários")
Steps: 1. [Ação] → 2. [Ação] → ...
Result: O que é entregue ao final
```

Isso garante que a skill resolve problemas reais e que o `description` terá trigger phrases naturais.

### Estrutura e Nomenclatura

```
nome-da-skill/
├── SKILL.md          # OBRIGATÓRIO — instruções principais
├── scripts/          # Opcional — código executável
├── references/       # Opcional — documentação extra sob demanda
└── assets/           # Opcional — templates, ícones, fontes
```

**Regras:**
- Arquivo DEVE ser exatamente `SKILL.md` (case-sensitive) — ❌ NUNCA `skill.md`, `SKILL.MD`, `Skill.md`
- ❌ NUNCA incluir `README.md` dentro de uma skill
- Pastas SEMPRE `kebab-case` — ❌ NUNCA espaços, underscores ou maiúsculas
- Nome da pasta DEVE coincidir com o campo `name` do frontmatter

### Frontmatter YAML na criação da skill

O frontmatter é a **parte mais importante** — determina quando a LLM carrega a skill.

```yaml
---
name: nome-da-skill
description: O que faz + o que cobre + Use quando...
---
```

| Campo | Obrigatório | Regras |
|-------|-------------|--------|
| `name` | ✅ SIM | `kebab-case`, idêntico ao nome da pasta |
| `description` | ✅ SIM | Máx 1024 chars. Formato abaixo. |

Opcionais: `license`, `compatibility` (1-500 chars), `metadata` (pares chave-valor).

**Segurança:** ❌ PROIBIDO `<` ou `>` no frontmatter — ❌ PROIBIDO "claude"/"anthropic" no `name`

### Padrão para `description`

Formato: **`[O que faz] + [O que cobre] + Use [quando]`**

- Começar com verbo: `Ensina como...`, `Explica como...`, `Documenta...`, `Guia passo a passo...`
- Listar **capabilities concretas**, não conceitos abstratos
- Incluir **trigger phrases** que o usuário diria
- Quando houver skills com escopo similar, incluir **negative triggers**: `NÃO use para [cenário que pertence a outra skill]`
- ❌ Não incluir paths de pasta (ficam no corpo)

```yaml
# ❌ Ruim — vago, sem triggers
description: Camada de lógica de negócio pura.

# ❌ Ruim — sem trigger de quando usar
description: Cria documentação sofisticada de múltiplas páginas.

# ✅ Bom — específico, lista o que cobre, tem trigger
description: Ensina como criar um Service do zero: estrutura da classe, acesso ao banco (this.db()), composição com outros services (this.service()) e logging com execution_id. Use ao implementar qualquer regra de negócio.

# ✅ Bom — inclui trigger phrases
description: Guia passo a passo para criar um endpoint HTTP completo: cria o Message (contrato Zod), o Service (lógica), o Handler (orquestração + transação) e registra no router. Use ao adicionar qualquer nova operação na API.
```

### Corpo do SKILL.md

**Tamanho máximo:** SKILL.md DEVE ter no máximo ~200 linhas. Se ultrapassar, mover conteúdo extenso para `references/`.

#### Tipos de Skill

Escolher a estrutura conforme o tipo:

**Skill de Workflow** (ex: `criar-endpoint-api`, `criar-worker-job`):
1. `# Nome da Skill`
2. `## Step 1: [Ação]` → `## Step 2: [Ação]` → ... — instruções sequenciais com validação entre steps
3. `## Exemplos` — cenários com Trigger → Ações (lista sem código) → Resultado
4. `## Troubleshooting` — apenas erros de runtime (causa + solução)

**Skill de Referência/Padrão** (ex: `angular-forms`, `angular-basics`, `banco-dados`):
1. `# Nome da Skill`
2. `## Regras` — constraints rápidos em bullet points (o que fazer e NÃO fazer)
3. `## [Seções temáticas]` — resumo conciso de cada conceito (1-3 linhas + atributos-chave)
4. `## Checklist` — quality gate com checkboxes
5. `## Exemplos` — cenários com Trigger → Ações (lista sem código) → Resultado
6. `## Troubleshooting` — apenas erros de runtime (causa + solução)

#### Templates de Código → `references/`

- Blocos de código com mais de **15 linhas** DEVEM ir para `references/`. O SKILL.md referencia com: "Template completo em `references/nome.md`"
- O SKILL.md mantém apenas **regras**, **constraints** e **snippets curtos** (<15 linhas) como ilustração
- A LLM usa as regras para gerar código correto; quando precisa do template exato, lê o `references/`

#### Anti-duplicação

- Cada informação aparece em **UM único lugar**
- Se uma regra está em `## Regras`, ❌ NÃO repetir no `## Troubleshooting` (troubleshooting é para erros de runtime, não reafirmação de regras)
- Se um snippet está em `references/`, ❌ NÃO copiar nos `## Exemplos`

#### Exemplos Concisos

Formato obrigatório: **`Trigger → Ações (lista numerada sem código) → Resultado`**

Código nos exemplos é permitido APENAS se demonstra algo que NÃO existe nas regras ou em `references/` (caso raro).

#### Composabilidade de Código

- Ao criar skill que depende de outra, ❌ NÃO replicar informação da dependência
- Ex: `angular-forms` depende de `angular-basics` → NÃO re-explicar `Prefetched`, `PrefetchComponent` ou `standalone: true`
- Referenciar por nome: "leia a skill `angular-basics`"

Regras gerais: linguagem imperativa, incluir error handling, headers sem emojis (preferível), texto puro otimiza tokens.

### Composabilidade

- Skills DEVEM funcionar em conjunto — ❌ NUNCA assumir que é a única carregada
- Referenciar dependências por nome: "leia a skill `nomenclatura-propriedades` antes"
- Manter responsabilidade única por skill

### Validação Mínima

Após criar ou alterar uma skill, verificar:

1. **Triggering correto** — a skill carrega quando o usuário pede algo relevante
2. **Sem over-triggering** — NÃO carrega em queries não-relacionadas
3. **Happy path funciona** — seguir as instruções produz o resultado esperado
4. **Limite de ~200 linhas** — SKILL.md não ultrapassa; excesso vai para `references/`
5. **Sem duplicação** — nenhuma informação repetida entre skills ou entre seções

## Arquitetura
Aqui sera criado as regras de arquitetura do projeto, como por exemplo a estrutura de pastas, padrões de código, etc.
=> Ainda não temos
