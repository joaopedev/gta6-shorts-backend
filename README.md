# GTA 6 Shorts — backend

API local em NestJS para pesquisar Reels públicos pela HikerAPI, fazer curadoria,
baixar os vídeos aprovados e enviá-los ao YouTube usando OAuth 2.0.

## Executar

1. Abra `.env` e informe pelo menos `HIKER_API_KEY`.
2. Inicie o backend:

```powershell
npm install
npm run start:dev
```

A API estará em `http://localhost:4100/api`. O SQLite e os vídeos são criados em
`.data/` automaticamente.

## Configurar o YouTube

1. No Google Cloud, ative **YouTube Data API v3**.
2. Configure a tela de consentimento OAuth.
3. Crie um cliente OAuth do tipo Aplicativo da Web.
4. Cadastre `http://localhost:4100/api/youtube/callback` como URI autorizada.
5. Preencha `YOUTUBE_CLIENT_ID` e `YOUTUBE_CLIENT_SECRET`.
6. Opcionalmente, gere `APP_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cole o resultado em `.env`. Se ela ficar vazia, o backend gera automaticamente uma
chave local em `.data/app.key`. Essa chave criptografa os tokens OAuth no SQLite e
deve ser preservada junto com o banco.

Também é possível baixar o JSON do cliente OAuth e importá-lo sem copiar o segredo:

```powershell
npm run setup:youtube -- "C:\Users\seu-usuario\Downloads\client_secret.json"
```

O importador valida se `http://localhost:4100/api/youtube/callback` está cadastrado e
atualiza o `.env` sem imprimir o `client_secret`.

## Limitações e segurança

- A HikerAPI usada aqui pesquisa conteúdo público do Instagram.
- O país é acrescentado à consulta e não representa localização comprovada do autor.
- URLs de CDN podem expirar; baixe o vídeo após aprová-lo.
- O servidor escuta apenas em `127.0.0.1`. Adicione autenticação antes de hospedar.
- Conteúdo público continua protegido por direitos autorais. O upload exige confirmação
  explícita de licença ou autorização.
