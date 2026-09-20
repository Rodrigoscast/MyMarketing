# Fluxo de Uso do Sistema MyMarketing

Este documento é um **fluxo de usuário** / **diagrama de atividade** do MyMarketing. Ele descreve os caminhos possíveis dentro do sistema, incluindo telas, validações, decisões e resultados esperados.

## Entrada no Sistema

```mermaid
flowchart TD
  start[Acessa MyMarketing] --> landing[Landing page]
  landing --> action{Usuário escolhe ação}

  action -->|Entrar| login[Tela de login]
  action -->|Começar agora| cadastro[Tela de cadastro]
  action -->|Abrir área interna| protected{Tem sessão válida?}

  protected -->|Não| login
  protected -->|Sim| orgCheck{Tem organização vinculada?}

  cadastro --> validateRegister{Dados válidos?<br/>nome, empresa, email, senha >= 8}
  validateRegister -->|Não| cadastroError[Exibe erro no formulário]
  cadastroError --> cadastro
  validateRegister -->|Sim| createAccount[Cria usuário no Supabase Auth]
  createAccount --> createOrg[Cria profile, organização e membro owner]
  createOrg --> sessionCreated{Sessão criada?}
  sessionCreated -->|Não, precisa confirmar email| confirmEmail[Exibe aviso de confirmação]
  sessionCreated -->|Sim| dashboard

  login --> validateLogin{Email e senha válidos?}
  validateLogin -->|Não| loginError[Exibe email ou senha inválidos]
  loginError --> login
  validateLogin -->|Sim| getOrg[Busca primeira organização do usuário]
  getOrg --> orgCheck

  orgCheck -->|Não| orgError[Bloqueia acesso / organização não encontrada]
  orgCheck -->|Sim| dashboard[Dashboard /app]
```

## Regra Global de Acesso às Telas Internas

```mermaid
flowchart TD
  internal[Acessa qualquer rota interna<br/>/app, /app/videos, /app/canais, /app/calendario, /app/analytics]
  internal --> token{Existe accessToken?}
  token -->|Não| login[/login]
  token -->|Sim| authMe[Valida sessão em /api/auth/me]
  authMe --> validSession{Token válido?}
  validSession -->|Não ou expirado| login
  validSession -->|Sim| orgHeader{Existe organização selecionada?}
  orgHeader -->|Não| login
  orgHeader -->|Sim| membership{Usuário pertence à organização?}
  membership -->|Não| forbidden[Acesso negado]
  membership -->|Sim| page[Renderiza tela solicitada]
```

## Dashboard Principal

```mermaid
flowchart TD
  dashboard[Dashboard /app] --> loadData[Carrega resumo da organização]
  loadData --> checkChannels{Existe canal YouTube conectado?}
  loadData --> checkVideos{Existem vídeos criados/agendados?}
  loadData --> checkAnalytics{Existem métricas coletadas?}

  checkChannels -->|Não| suggestChannel[Mostra ação: conectar canal]
  checkChannels -->|Sim| showChannels[Mostra canais e status]

  checkVideos -->|Não| suggestUpload[Mostra ação: subir vídeo]
  checkVideos -->|Sim| showQueue[Mostra próximos posts / fila]

  checkAnalytics -->|Não| emptyAnalytics[Mostra estado vazio de analytics]
  checkAnalytics -->|Sim| showCards[Mostra indicadores e atalhos]

  suggestChannel --> channels[/app/canais]
  suggestUpload --> videos[/app/videos]
  showCards --> analytics[/app/analytics]
```

## Conexão de Canal do YouTube

```mermaid
flowchart TD
  channels[Acessa /app/canais] --> authCheck{Autenticado e com organização?}
  authCheck -->|Não| login[/login]
  authCheck -->|Sim| listChannels[Lista canais conectados]

  listChannels --> connectAction{Usuário quer conectar canal?}
  connectAction -->|Não| manage[Visualiza, testa ou desconecta canais]
  connectAction -->|Sim| requestOAuth[GET /api/channels/youtube/connect]

  requestOAuth --> authUrl{API retornou authUrl?}
  authUrl -->|Não| connectError[Exibe erro]
  authUrl -->|Sim| google[Redireciona para Google OAuth]

  google --> consent{Usuário autorizou?}
  consent -->|Não| callbackError[Volta para /app/canais com erro]
  consent -->|Sim| callback[/api/channels/youtube/callback]

  callback --> stateValid{State contém org e usuário válidos?}
  stateValid -->|Não| callbackError
  stateValid -->|Sim| memberValid{Usuário pertence à organização?}
  memberValid -->|Não| callbackError
  memberValid -->|Sim| exchange[Troca code por tokens]

  exchange --> channelInfo[Busca dados do canal]
  channelInfo --> saveChannel[Salva em social_accounts]
  saveChannel --> connected[Volta para /app/canais com sucesso]

  manage --> test{Testar conexão?}
  test -->|Sim| refreshToken[Renova token e busca info do canal]
  refreshToken --> tokenOk{Token válido?}
  tokenOk -->|Sim| syncVideos[Sincroniza vídeos do canal]
  tokenOk -->|Não| markExpired[Marca canal como expired]

  manage --> disconnect{Desconectar?}
  disconnect -->|Sim| deleteChannel[Remove social_account]
```

## Upload e Criação de Vídeo

```mermaid
flowchart TD
  videos[Acessa /app/videos] --> authCheck{Autenticado e com organização?}
  authCheck -->|Não| login[/login]
  authCheck -->|Sim| listVideos[Lista vídeos da organização]

  listVideos --> newVideo{Criar novo vídeo?}
  newVideo -->|Não| manageVideo[Editar, duplicar, excluir ou publicar existente]
  newVideo -->|Sim| selectFile[Seleciona arquivo de vídeo]

  selectFile --> fileValidation{Arquivo permitido?<br/>MP4, MOV, AVI, MKV ou WebM<br/>dentro do limite}
  fileValidation -->|Não| fileError[Exibe tipo/tamanho inválido]
  fileError --> selectFile
  fileValidation -->|Sim| uploadVideo[POST /api/videos/upload]

  uploadVideo --> assetCreated{Asset salvo?}
  assetCreated -->|Não| uploadError[Remove arquivo órfão e exibe erro]
  assetCreated -->|Sim| metadata[Preenche título, descrição, tags, categoria, privacidade]

  metadata --> metadataValid{Metadados válidos?}
  metadataValid -->|Não| metadataError[Exibe campos inválidos]
  metadataError --> metadata
  metadataValid -->|Sim| channelCheck{Canal YouTube selecionado pertence à organização?}

  channelCheck -->|Não| channelError[Canal não encontrado ou não autorizado]
  channelCheck -->|Sim| assetCheck{Asset pertence à organização?}
  assetCheck -->|Não| assetError[Arquivo não encontrado ou não autorizado]
  assetCheck -->|Sim| createDraft[POST /api/videos]

  createDraft --> draft[(youtube_videos<br/>status = draft)]
  draft --> nextAction{Próxima ação}
  nextAction -->|Editar| editVideo[PATCH /api/videos/:id]
  nextAction -->|Agendar| scheduleFlow[Fluxo de agendamento]
  nextAction -->|Publicar agora| publishFlow[Fluxo de publicação]
  nextAction -->|Excluir| deleteCheck{Status é draft?}
  deleteCheck -->|Não| deleteBlocked[Exclusão bloqueada]
  deleteCheck -->|Sim| deleteVideo[Remove vídeo e asset]
```

## Agendamento de Vídeo

```mermaid
flowchart TD
  scheduleStart[Usuário escolhe agendar vídeo] --> statusCheck{Vídeo está em draft?}
  statusCheck -->|Não| blockStatus[Exibe: só é possível agendar vídeos em rascunho]
  statusCheck -->|Sim| fileCheck{Vídeo tem arquivo enviado?}

  fileCheck -->|Não| blockFile[Exibe: vídeo precisa ter arquivo]
  fileCheck -->|Sim| dateInput[Usuário informa data/hora e timezone]

  dateInput --> dateValid{Data/hora válida?}
  dateValid -->|Não| dateError[Exibe erro de data]
  dateValid -->|Sim| scheduleApi[POST /api/videos/:id/schedule]

  scheduleApi --> updateVideo[Atualiza youtube_videos<br/>status = scheduled<br/>publish_at = data]
  updateVideo --> createScheduledPost[Cria scheduled_posts]
  createScheduledPost --> createTarget[Cria scheduled_post_targets<br/>platform_status = queued]
  createTarget --> calendar[Vídeo aparece no calendário e fila]
```

## Publicação Imediata

```mermaid
flowchart TD
  publishStart[Usuário clica em publicar agora] --> statusCheck{Status permitido?<br/>draft, scheduled ou failed}
  statusCheck -->|Não| invalidStatus[Exibe status inválido]
  statusCheck -->|Sim| assetCheck{Tem arquivo associado?}

  assetCheck -->|Não| missingAsset[Exibe: vídeo precisa ter arquivo]
  assetCheck -->|Sim| quotaCheck{Quota disponível para upload?}

  quotaCheck -->|Não| quotaError[Exibe quota insuficiente]
  quotaCheck -->|Sim| markPublishing[Atualiza status = publishing]

  markPublishing --> youtubeUpload[Publica na YouTube Data API]
  youtubeUpload --> uploadResult{Publicação deu certo?}

  uploadResult -->|Sim| logQuota[Registra VIDEOS_INSERT em api_usage_logs]
  logQuota --> markPublished[Atualiza youtube_videos<br/>status = published<br/>youtube_video_id<br/>published_at]
  markPublished --> updateSchedule[Atualiza scheduled_posts e targets<br/>se existirem]
  updateSchedule --> success[Exibe sucesso]

  uploadResult -->|Não| markFailed[Atualiza status = failed<br/>salva youtube_error]
  markFailed --> updateFailedTargets[Atualiza scheduled_posts/targets como failed]
  updateFailedTargets --> publishError[Exibe falha de publicação]
```

## Publicação Agendada pelo Worker

```mermaid
flowchart TD
  cron[Scheduler executa periodicamente] --> findQueue[Busca youtube_videos<br/>status scheduled ou publishing<br/>publish_at <= agora]
  findQueue --> hasVideos{Encontrou vídeos?}
  hasVideos -->|Não| finishEmpty[Finaliza sem processar]
  hasVideos -->|Sim| processBatch[Processa lote de até 10 vídeos]

  processBatch --> eachVideo[Para cada vídeo]
  eachVideo --> assetExists{Arquivo existe no disco?}
  assetExists -->|Não| failMissing[Marca failed: arquivo ausente]
  assetExists -->|Sim| quotaCheck{Quota disponível?}

  quotaCheck -->|Não| failQuota[Marca failed: quota insuficiente]
  quotaCheck -->|Sim| markPublishing[Marca publishing]
  markPublishing --> youtubeUpload[Publica no YouTube]

  youtubeUpload --> result{Resultado}
  result -->|Sucesso| logQuota[Registra uso de quota]
  logQuota --> published[Marca published e salva youtube_video_id]
  published --> updateTargets[Atualiza calendário/target]

  result -->|Erro| failed[Marca failed e salva youtube_error]
  failed --> updateFailed[Atualiza calendário/target com erro]

  updateTargets --> next{Ainda há vídeos no lote?}
  updateFailed --> next
  failMissing --> next
  failQuota --> next
  next -->|Sim| eachVideo
  next -->|Não| summary[Retorna processados, sucessos, falhas e erros]
```

## Calendário

```mermaid
flowchart TD
  calendar[Acessa /app/calendario] --> authCheck{Autenticado e com organização?}
  authCheck -->|Não| login[/login]
  authCheck -->|Sim| loadScheduled[Busca scheduled_posts e targets]

  loadScheduled --> hasPosts{Existem publicações?}
  hasPosts -->|Não| emptyCalendar[Mostra calendário vazio e CTA para criar vídeo]
  hasPosts -->|Sim| renderCalendar[Mostra publicações por data/status]

  renderCalendar --> selectPost{Usuário seleciona publicação?}
  selectPost -->|Sim| details[Mostra título, horário, plataforma e status]
  details --> action{Ação disponível}
  action -->|Ver vídeo| videoDetails[/app/videos]
  action -->|Reprocessar falha| retry[POST /api/scheduler/retry/:id]
  action -->|Rodar agora| processNow[POST /api/scheduler/process-now/:id]
```

## Analytics

```mermaid
flowchart TD
  analytics[Acessa /app/analytics] --> authCheck{Autenticado e com organização?}
  authCheck -->|Não| login[/login]
  authCheck -->|Sim| loadPeriod[Usuário escolhe período]

  loadPeriod --> fetchSummary[GET /api/analytics/summary]
  loadPeriod --> fetchTimeseries[GET /api/analytics/timeseries]
  loadPeriod --> fetchTopVideos[GET /api/analytics/top-videos]
  loadPeriod --> fetchChannels[GET /api/analytics/channels]
  loadPeriod --> fetchQuota[GET /api/analytics/quota]

  fetchSummary --> hasData{Existem dados?}
  fetchTimeseries --> hasData
  fetchTopVideos --> hasData
  fetchChannels --> hasData

  hasData -->|Não| emptyAnalytics[Mostra estado vazio / pedir sincronização]
  hasData -->|Sim| renderDashboard[Renderiza cards, gráficos, vídeos e canais]

  renderDashboard --> collectAction{Usuário pede atualizar dados?}
  collectAction -->|Sim| collect[POST /api/analytics/collect]
  collect --> collectResult{Coleta concluída?}
  collectResult -->|Sim| reload[Recarrega dashboards]
  collectResult -->|Não| collectError[Exibe erro da API do YouTube]

  renderDashboard --> syncAction{Usuário pede sincronizar catálogo?}
  syncAction -->|Sim| sync[POST /api/analytics/sync]
  sync --> reload
```

## Controle de Quota

```mermaid
flowchart TD
  quotaEvent[Operação que consome YouTube API] --> operationType{Tipo de operação}

  operationType -->|Upload de vídeo| uploadCost[VIDEOS_INSERT<br/>alto custo]
  operationType -->|Buscar canal| channelCost[CHANNELS_LIST]
  operationType -->|Atualizar vídeo| updateCost[VIDEOS_UPDATE]
  operationType -->|Coletar métricas/comentários| analyticsCost[Operações de analytics]

  uploadCost --> checkDaily{Uso diário + custo <= limite?}
  channelCost --> logUsage[Registra api_usage_logs]
  updateCost --> logUsage
  analyticsCost --> logUsage

  checkDaily -->|Não| blockOperation[Bloqueia operação com QUOTA_EXCEEDED]
  checkDaily -->|Sim| executeOperation[Executa operação]
  executeOperation --> logUsage
  logUsage --> dailyView[daily_quota_usage agrega por dia]
  dailyView --> dashboard[Analytics mostra consumo de quota]
```

## Caminhos de Erro e Validação

```mermaid
flowchart TD
  request[Requisição para API protegida] --> token{Authorization Bearer existe?}
  token -->|Não| unauthorized[401 Token ausente]
  token -->|Sim| tokenValid{Token válido no Supabase?}
  tokenValid -->|Não| invalid[401 Token inválido ou expirado]
  tokenValid -->|Sim| orgHeader{x-organization-id existe?}
  orgHeader -->|Não| noOrg[403 Organização obrigatória]
  orgHeader -->|Sim| member{Usuário é membro da organização?}
  member -->|Não| forbidden[403 Usuário não é membro]
  member -->|Sim| zod{Payload passa no schema Zod?}
  zod -->|Não| validation[400 Erro de validação]
  zod -->|Sim| resource{Recurso pertence à organização?}
  resource -->|Não| notFound[404 Recurso não encontrado]
  resource -->|Sim| business{Regra de negócio permite?}
  business -->|Não| conflict[409/400 Operação bloqueada]
  business -->|Sim| success[Executa ação]
```

## Mapa Resumido das Telas

```mermaid
flowchart LR
  landing[/]
  login[/login]
  cadastro[/cadastro]
  dashboard[/app]
  canais[/app/canais]
  videos[/app/videos]
  calendario[/app/calendario]
  analytics[/app/analytics]

  landing --> login
  landing --> cadastro
  login --> dashboard
  cadastro --> dashboard
  dashboard --> canais
  dashboard --> videos
  dashboard --> calendario
  dashboard --> analytics
  canais --> videos
  videos --> calendario
  videos --> analytics
  calendario --> videos
  analytics --> videos
```
