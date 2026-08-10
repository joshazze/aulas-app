# aulas-app

PWA pessoal pra gerenciar aulas particulares: alunos, agenda, pagamentos e estatísticas. Tudo fica no `localStorage` do dispositivo — sem servidor, sem login.

## Rodar

```bash
npm install
node scripts/gen-icons.mjs   # gera PNG dos ícones (uma vez)
npm run dev                  # http://127.0.0.1:5173/aulas-app/
```

## Build

```bash
npm run build
npm run preview
```

## Deploy

Push pra `main` aciona o workflow em `.github/workflows/deploy.yml`. URL: `https://<owner>.github.io/aulas-app/`.

Pra publicar manualmente em outra base path:

```bash
BASE_PATH=/qualquer/ npm run build
```

## Dados

- Tudo mora em `localStorage` (`aulas:data`) como JSON puro
- Sem servidor, sem analytics, sem sync
- "Apagar tudo" em Stats limpa o storage e recarrega

## Calendário

O app não escreve no calendário sozinho. Os botões de calendário (Sincronizar no Início, Calendário na barra de seleção e Calendário no modal de edição) copiam um **prompt** pro clipboard. Cola numa conversa com o Claude no Mac e ele escreve no calendário `Odin` via EventKit.

O prompt é autoexplicativo: leva a instrução junto dos dados. Cada linha é uma operação, `CRIAR`, `MOVER` ou `CANCELAR`, com o id da aula, o horário local e o nome do aluno. O evento no calendário guarda `aulas-app:<id>` nas notas, e é por essa marca que o Claude reencontra o evento depois. Sem marca, ele adota um evento que já exista no mesmo horário em vez de criar um gêmeo.

Duas coisas a saber:

- O app marca tudo como sincronizado assim que a cópia dá certo. Se você copiar e nunca colar, o app fica achando que o calendário está em dia. Conserto: **Stats → Calendário → Reenviar tudo pro calendário**, que zera a marcação e faz o próximo prompt pedir tudo de novo.
- O Claude pula as linhas ambíguas e reporta no fim. Esse relatório é pra ler: o app não tem como saber o que ficou pendente.

## Backup

Em **Estatísticas → Backup**: exportar/importar JSON puro. Não há senha — qualquer um com o arquivo consegue ler. Trate como dado normal.

## Migração de versão antiga (cifrada)

Versões anteriores cifravam o storage com senha PBKDF2/AES-GCM. Na primeira abertura desta versão, se houver dados antigos, o app pede a senha uma única vez para decifrar e regravar em texto puro. Depois disso o app nunca mais pede senha.

## Estrutura

```
src/
├── main.js                bootstrap + router
├── styles.css             tema dark, mid-tones
├── lib/
│   ├── crypto.js          legado — usado só na migração one-shot
│   ├── storage.js         LS plain (load/persist/export/import + migrateLegacy)
│   ├── state.js           store + mutate(fn) persiste
│   ├── router.js          hash router
│   └── format.js          BRL, datas pt-BR
├── components/            ui.js, modal.js, nav.js
└── views/                 dashboard, students, schedule, payments, stats, migrate
```
