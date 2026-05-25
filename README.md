# aulas-app

PWA pessoal pra gerenciar aulas particulares: alunos, agenda, pagamentos e estatísticas. Tudo cifrado localmente — nada sai do dispositivo.

## Rodar

```bash
npm install
node scripts/gen-icons.mjs   # gera PNG dos ícones (uma vez)
npm run dev                  # http://127.0.0.1:5173
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

## Segurança

- Senha do usuário → PBKDF2 (250k iter, SHA-256) → chave AES-GCM-256
- Todos os dados (alunos, aulas, pagamentos) ficam em `localStorage` cifrados
- A senha **nunca** é salva — só um verificador cifrado pra checar o login
- Sem servidor. Sem analytics. Sem reset de senha (perdeu → recomeçar do zero)

## Backup

Em **Estatísticas** → **Conta & backup** dá pra exportar/importar um JSON cifrado.
O JSON é seguro de guardar em iCloud/Drive desde que a senha seja forte.

## Estrutura

```
src/
├── main.js                bootstrap + router
├── styles.css             tema dark, mid-tones
├── lib/
│   ├── crypto.js          PBKDF2 + AES-GCM
│   ├── storage.js         LS cifrado (register/login/persist)
│   ├── state.js           store + mutate(fn) cifra+persiste
│   ├── router.js          hash router
│   └── format.js          BRL, datas pt-BR
├── components/            ui.js, modal.js, nav.js
└── views/                 auth, dashboard, students, schedule, payments, stats
```
