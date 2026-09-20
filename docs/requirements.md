# Requisitos do Sistema MyMarketing

Este documento descreve os requisitos funcionais e não funcionais do MyMarketing, com base no fluxo atual do sistema, API, banco Supabase e telas do produto.

## Requisitos Funcionais

### RF01 - Cadastro de Usuário

O sistema deve permitir que um novo usuário crie uma conta informando nome, empresa, email e senha.

Critérios:
- O nome deve possuir pelo menos 2 caracteres.
- O nome da empresa deve possuir pelo menos 2 caracteres.
- O email deve ter formato válido.
- A senha deve possuir pelo menos 8 caracteres.
- Ao cadastrar, o sistema deve criar o usuário no Supabase Auth.
- O sistema deve criar ou reutilizar o perfil do usuário.
- O sistema deve criar uma organização para a empresa informada.
- O sistema deve vincular o usuário à organização com papel de `owner`.
- Caso o email já esteja cadastrado, o sistema deve informar o erro ao usuário.

### RF02 - Login de Usuário

O sistema deve permitir autenticação com email e senha.

Critérios:
- O sistema deve validar email e senha.
- Em caso de credenciais inválidas, deve informar erro.
- Em caso de sucesso, deve retornar token de acesso, refresh token, dados do usuário e primeira organização vinculada.
- O usuário autenticado deve ser redirecionado para o dashboard.

### RF03 - Validação de Sessão

O sistema deve validar a sessão do usuário antes de permitir acesso às telas internas.

Critérios:
- Rotas internas devem exigir token válido.
- O sistema deve validar o token no Supabase.
- Caso o token esteja ausente, inválido ou expirado, o usuário deve ser enviado para login.
- O sistema deve carregar as organizações vinculadas ao usuário.

### RF04 - Controle de Acesso por Organização

O sistema deve restringir os dados por organização.

Critérios:
- Toda requisição protegida deve exigir `x-organization-id`.
- O sistema deve verificar se o usuário é membro da organização.
- Caso o usuário não pertença à organização, o acesso deve ser negado.
- As tabelas do Supabase devem usar RLS para restringir acesso aos dados da organização.

### RF05 - Dashboard Principal

O sistema deve apresentar uma visão inicial da operação de marketing.

Critérios:
- Deve exibir atalhos para canais, vídeos, calendário e analytics.
- Deve indicar ausência de canais conectados.
- Deve indicar ausência de vídeos criados ou agendados.
- Deve indicar ausência de métricas coletadas.
- Deve exibir próximos conteúdos ou fila de publicação quando existirem dados.

### RF06 - Conexão de Canal do YouTube

O sistema deve permitir conectar uma conta/canal do YouTube via OAuth.

Critérios:
- O usuário deve iniciar a conexão pela tela de canais.
- A API deve gerar uma URL de autorização do Google.
- O callback deve validar o `state` contendo organização e usuário.
- O sistema deve confirmar que o usuário pertence à organização informada no `state`.
- O sistema deve trocar o código OAuth por tokens.
- O sistema deve buscar as informações do canal.
- O canal conectado deve ser salvo em `social_accounts`.
- Em caso de erro no OAuth, o usuário deve voltar para a tela de canais com mensagem de erro.

### RF07 - Listagem e Gerenciamento de Canais

O sistema deve permitir listar e gerenciar canais conectados.

Critérios:
- Deve listar canais YouTube da organização.
- Deve permitir testar a conexão do canal.
- Ao testar, deve renovar token e buscar informações do canal.
- Se o token estiver expirado, o canal deve ser marcado como `expired`.
- Deve permitir desconectar um canal.
- Ao desconectar, o registro deve ser removido de `social_accounts`.

### RF08 - Upload de Vídeo

O sistema deve permitir upload de arquivos de vídeo.

Critérios:
- Deve aceitar arquivos MP4, MOV, AVI, MKV e WebM.
- Deve respeitar o limite máximo configurado de upload.
- O arquivo enviado deve ser salvo no diretório local de uploads.
- O sistema deve registrar o arquivo em `content_assets`.
- Caso o registro no banco falhe, o arquivo órfão deve ser removido.
- O upload deve retornar o `asset_id`.

### RF09 - Upload de Thumbnail

O sistema deve permitir upload de thumbnail para vídeos.

Critérios:
- Deve aceitar JPEG, PNG, WebP e GIF.
- Deve respeitar o limite de 10 MB.
- Deve salvar o arquivo no diretório local de uploads.
- Deve registrar o arquivo em `content_assets`.
- Deve retornar o identificador e caminho do arquivo salvo.

### RF10 - Criação de Vídeo

O sistema deve permitir criar um vídeo como rascunho.

Critérios:
- O usuário deve informar canal YouTube, metadados e opcionalmente um asset.
- O canal selecionado deve pertencer à organização.
- O asset informado deve pertencer à organização.
- O título deve ser obrigatório.
- A descrição deve respeitar o limite definido.
- Tags, categoria, privacidade, idioma e demais metadados devem ser salvos.
- O vídeo deve ser criado em `youtube_videos` com status `draft`.

### RF11 - Edição de Vídeo

O sistema deve permitir editar metadados de um vídeo.

Critérios:
- Deve permitir alterar título, descrição, tags, categoria, privacidade, data de publicação, idioma, playlist e demais metadados.
- O vídeo deve pertencer à organização do usuário.
- O sistema deve atualizar `updated_at`.

### RF12 - Exclusão de Vídeo

O sistema deve permitir excluir vídeos em rascunho.

Critérios:
- Apenas vídeos com status `draft` podem ser excluídos.
- Ao excluir, o sistema deve remover o asset associado quando existir.
- O arquivo físico deve ser removido quando existir.
- Vídeos agendados, publicados ou em publicação não devem ser excluídos por esse fluxo.

### RF13 - Duplicação de Vídeo

O sistema deve permitir duplicar um vídeo.

Critérios:
- Deve permitir definir novo título.
- Deve permitir manter ou resetar o status.
- Deve permitir reutilizar o asset original.
- Deve permitir copiar o arquivo físico quando solicitado.
- Deve permitir selecionar outro canal YouTube da mesma organização.
- Caso a cópia do asset falhe, o sistema deve limpar registros/arquivos criados parcialmente.

### RF14 - Operações em Lote

O sistema deve permitir executar ações em lote sobre vídeos.

Critérios:
- Deve aceitar de 1 a 50 vídeos por operação.
- Deve permitir excluir, agendar, publicar, alterar privacidade, alterar categoria e alterar playlist.
- Cada vídeo deve ser validado individualmente.
- A resposta deve informar sucessos, falhas e resumo da operação.

### RF15 - Agendamento de Vídeo

O sistema deve permitir agendar a publicação de um vídeo.

Critérios:
- Apenas vídeos com status `draft` podem ser agendados.
- O vídeo deve possuir arquivo enviado.
- O usuário deve informar data/hora e timezone.
- O vídeo deve ser atualizado para `scheduled`.
- O campo `publish_at` deve receber a data de agendamento.
- O sistema deve criar um registro em `scheduled_posts`.
- O sistema deve criar um target em `scheduled_post_targets` para YouTube.

### RF16 - Publicação Imediata

O sistema deve permitir publicar um vídeo imediatamente.

Critérios:
- Status permitidos: `draft`, `scheduled` e `failed`.
- O vídeo deve possuir arquivo associado.
- O sistema deve verificar quota antes da publicação.
- Caso não haja quota suficiente, a publicação deve ser bloqueada.
- O vídeo deve ser marcado como `publishing` antes do envio ao YouTube.
- Em caso de sucesso, o vídeo deve ser marcado como `published`.
- O sistema deve salvar `youtube_video_id` e `published_at`.
- O sistema deve registrar uso de quota em `api_usage_logs`.
- Caso exista agendamento relacionado, `scheduled_posts` e `scheduled_post_targets` devem ser atualizados.
- Em caso de falha, o vídeo deve ser marcado como `failed` e o erro salvo em `youtube_error`.

### RF17 - Publicação Agendada pelo Worker

O sistema deve processar automaticamente vídeos agendados.

Critérios:
- O worker deve buscar vídeos com status `scheduled` ou `publishing`.
- Apenas vídeos com `publish_at` menor ou igual ao horário atual devem ser processados.
- O worker deve processar lotes limitados.
- O sistema deve verificar existência do arquivo.
- O sistema deve verificar quota antes do upload.
- Em caso de sucesso, deve atualizar vídeo, calendário e target.
- Em caso de falha, deve marcar vídeo, calendário e target como `failed`.
- O worker deve retornar quantidade de processados, sucessos, falhas e erros.

### RF18 - Reprocessamento de Publicação com Falha

O sistema deve permitir reenviar vídeos que falharam.

Critérios:
- Apenas vídeos com status `failed` podem ser reenviados.
- Ao reenviar, o vídeo deve voltar para `publishing`.
- O sistema deve permitir processar um vídeo específico imediatamente.

### RF19 - Calendário Editorial

O sistema deve permitir visualizar publicações agendadas no calendário.

Critérios:
- Deve carregar `scheduled_posts` e seus targets.
- Deve exibir publicações por data e status.
- Deve exibir detalhes como título, horário, plataforma e status.
- Deve permitir acessar o vídeo relacionado.
- Deve permitir ações relacionadas à fila quando disponíveis, como reprocessar falhas.

### RF20 - Analytics Geral

O sistema deve apresentar analytics dos vídeos publicados.

Critérios:
- Deve exibir resumo por período.
- Deve exibir série temporal diária.
- Deve exibir vídeos com melhor desempenho.
- Deve exibir métricas por canal.
- Deve exibir comentários principais.
- Deve permitir filtrar por intervalo de datas.
- Deve exibir estado vazio quando não houver dados.

### RF21 - Coleta de Analytics

O sistema deve permitir coletar métricas do YouTube.

Critérios:
- Deve coletar métricas para toda a organização.
- Deve permitir coletar métricas de um vídeo específico.
- Deve buscar dados na YouTube Analytics API.
- Deve salvar snapshots em `video_metrics_snapshots`.
- Deve buscar comentários via YouTube Data API.
- Deve salvar comentários em `video_comments`.
- Deve permitir sincronizar catálogo de vídeos do canal.

### RF22 - Comparação de Vídeos

O sistema deve permitir comparar vídeos.

Critérios:
- Deve aceitar de 2 a 10 vídeos.
- Deve permitir definir quantidade de dias.
- Deve retornar snapshots agrupados por vídeo.
- Todos os vídeos comparados devem pertencer à organização.

### RF23 - Controle de Quota

O sistema deve controlar o uso de quota da API do YouTube.

Critérios:
- Deve registrar operações que consomem quota em `api_usage_logs`.
- Deve armazenar operação, custo, organização, metadados e data.
- Deve calcular uso diário por organização.
- Deve expor dados agregados pela view `daily_quota_usage`.
- Deve bloquear upload quando a quota disponível não for suficiente.
- Deve exibir o consumo de quota no analytics/dashboard quando aplicável.

### RF24 - Plataformas de Marketing

O sistema deve manter cadastro de plataformas suportadas.

Critérios:
- Deve incluir plataformas sociais: LinkedIn, Facebook, Instagram, TikTok e YouTube.
- Deve incluir plataformas de anúncios: Google Ads e Meta Ads.
- Deve permitir listar plataformas ativas.

### RF25 - Métricas de Ads

O sistema deve possuir estrutura para armazenar dados de campanhas de anúncios.

Critérios:
- Deve permitir registrar conexões de ads.
- Deve permitir registrar campanhas.
- Deve permitir registrar métricas diárias, incluindo gasto, receita, impressões, views, cliques e conversões.

## Requisitos Não Funcionais

### RNF01 - Segurança de Autenticação

O sistema deve utilizar autenticação baseada em tokens do Supabase Auth.

Critérios:
- Tokens inválidos ou expirados devem bloquear acesso.
- Rotas protegidas devem exigir header `Authorization: Bearer`.
- Sessões inválidas devem redirecionar o usuário para login.

### RNF02 - Isolamento Multiempresa

O sistema deve garantir isolamento entre organizações.

Critérios:
- Toda operação protegida deve validar a organização.
- O usuário só pode acessar dados de organizações das quais é membro.
- O banco deve utilizar RLS nas tabelas sensíveis.

### RNF03 - Proteção de Tokens Externos

Tokens de provedores externos devem ser armazenados de forma segura.

Critérios:
- Refresh tokens devem ser referenciados por `token_reference`.
- O sistema não deve expor tokens para o frontend.
- Rotinas de conexão e renovação devem ocorrer no backend.

### RNF04 - Validação de Entrada

O sistema deve validar dados recebidos pela API.

Critérios:
- Payloads devem ser validados com schemas.
- Campos obrigatórios devem ser conferidos antes de executar ações.
- Erros de validação devem retornar mensagens compreensíveis.

### RNF05 - Integridade de Dados

O sistema deve manter consistência entre vídeos, assets, agenda e targets.

Critérios:
- Publicações agendadas devem manter vínculo entre `youtube_videos`, `scheduled_posts` e `scheduled_post_targets`.
- Falhas parciais devem limpar arquivos/registros órfãos quando possível.
- Atualizações de publicação devem refletir nos registros relacionados.

### RNF06 - Rastreabilidade

O sistema deve registrar eventos relevantes para auditoria operacional.

Critérios:
- Uso de quota deve ser registrado.
- Erros de publicação devem ser armazenados.
- Status de vídeo deve refletir o estado atual do processo.
- Tabelas principais devem possuir `created_at` e `updated_at` quando aplicável.

### RNF07 - Desempenho

O sistema deve responder adequadamente para uso operacional diário.

Critérios:
- Consultas frequentes devem utilizar índices.
- Listagens devem filtrar por organização.
- Processamento do scheduler deve ocorrer em lotes.
- Coletas e publicações não devem bloquear a navegação principal do usuário além do necessário.

### RNF08 - Escalabilidade

O sistema deve permitir crescimento de uso por organização.

Critérios:
- Dados devem ser separados por organização.
- Workers devem processar filas em lotes.
- Snapshots de analytics devem suportar histórico temporal.
- Estruturas de ads e plataformas devem permitir novas integrações.

### RNF09 - Disponibilidade

O sistema deve manter funcionalidades essenciais disponíveis mesmo quando integrações externas falharem.

Critérios:
- Falhas no YouTube não devem derrubar o sistema inteiro.
- Erros de OAuth, publicação ou analytics devem ser tratados e exibidos.
- Vídeos com falha devem poder ser reprocessados.

### RNF10 - Usabilidade

O sistema deve ser claro para usuários de marketing.

Critérios:
- Estados vazios devem indicar a próxima ação.
- Erros devem ser apresentados de forma compreensível.
- A navegação deve permitir acesso rápido a dashboard, canais, vídeos, calendário e analytics.
- A landing page deve comunicar a proposta do sistema com clareza.

### RNF11 - Responsividade

O frontend deve funcionar em diferentes tamanhos de tela.

Critérios:
- Telas devem se adaptar a desktop e mobile.
- Textos e botões não devem se sobrepor.
- Cards, grids e tabelas devem manter leitura adequada.

### RNF12 - Manutenibilidade

O sistema deve ser organizado para facilitar evolução.

Critérios:
- Backend deve manter módulos separados por domínio: auth, channels, videos, scheduler e analytics.
- Frontend deve manter telas separadas por rota.
- Migrações de banco devem ser versionadas.
- Regras de negócio críticas devem permanecer no backend.

### RNF13 - Compatibilidade com APIs Externas

O sistema deve respeitar as restrições das APIs do YouTube.

Critérios:
- Deve controlar quota antes de operações caras.
- Deve tratar tokens expirados.
- Deve tratar erros retornados pelo Google/YouTube.
- Deve armazenar identificadores externos, como `youtube_video_id` e `provider_account_id`.

### RNF14 - Confiabilidade do Scheduler

O worker de publicação deve ser tolerante a falhas.

Critérios:
- Cada vídeo deve ser processado de forma isolada.
- Falha em um vídeo não deve impedir o processamento dos demais.
- O resultado da execução deve informar sucessos, falhas e erros.
- Vídeos com status `publishing` devem poder ser reprocessados.

### RNF15 - Privacidade e LGPD

O sistema deve tratar dados de usuários e organizações com cuidado.

Critérios:
- Usuários não devem acessar dados de outras organizações.
- Dados pessoais devem ser limitados ao necessário para operação.
- Tokens e credenciais não devem ser exibidos no frontend.
- Remoções e desconexões devem apagar vínculos quando aplicável.

### RNF16 - Observabilidade Mínima

O sistema deve permitir identificar falhas operacionais.

Critérios:
- Erros críticos do scheduler devem ser registrados em log.
- Erros de publicação devem ficar associados ao vídeo.
- Testes de conexão devem retornar status claro.
- Consumo de quota deve ser consultável.

### RNF17 - Portabilidade de Ambiente

O sistema deve permitir execução em ambiente local e produção.

Critérios:
- Configurações sensíveis devem vir de variáveis de ambiente.
- URLs de callback e origem web devem ser configuráveis.
- Limite de upload deve ser configurável.
- O comportamento de cadastro pode variar entre desenvolvimento e produção quanto à confirmação de email.

### RNF18 - Consistência Visual

O frontend deve manter uma identidade visual consistente.

Critérios:
- Cores devem possuir contraste suficiente.
- Componentes devem seguir padrão visual do sistema.
- Botões e estados devem ser reconhecíveis.
- A interface deve evitar elementos ilegíveis ou poluídos.

## Regras de Negócio Principais

- RB01: Um usuário só pode operar dentro de organizações das quais é membro.
- RB02: Todo vídeo nasce como `draft`.
- RB03: Apenas vídeos `draft` podem ser agendados.
- RB04: Apenas vídeos `draft` podem ser excluídos pelo fluxo comum.
- RB05: Apenas vídeos `draft`, `scheduled` ou `failed` podem ser publicados imediatamente.
- RB06: Vídeos sem asset não podem ser agendados nem publicados.
- RB07: Upload para YouTube deve ser bloqueado quando não houver quota suficiente.
- RB08: Falha de publicação deve marcar o vídeo como `failed` e salvar o motivo.
- RB09: Canal YouTube só pode ser usado se pertencer à organização.
- RB10: Analytics só deve considerar vídeos da organização autenticada.
