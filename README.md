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
