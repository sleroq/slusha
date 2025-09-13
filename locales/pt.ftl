# Start message
start-msg = Olá! Eu sou Slusha, o bot genial.

# Admin commands
admin-only = Este comando é apenas para administradores do chat
history-cleared = Histórico limpo
model-current = { $model }
model-reset = Modelo resetado
model-set = Modelo definido para { $model }
probability-updated = Probabilidade de resposta aleatória atualizada
probability-set = Nova probabilidade de resposta: { $probability }%

# Context commands
context-help = Passe o número de mensagens que vou lembrar - `/context 16`

Valores pequenos dão respostas mais precisas, valores grandes melhoram a memória. Máximo 200.
Valor atual - { $currentValue }. Passe `default` para voltar ao número padrão de mensagens (atualmente { $defaultValue }, mas pode mudar com atualizações)
context-admin-only = Este comando é apenas para administradores do chat
context-default-set = Número de mensagens definido para valor padrão ({ $defaultValue })
context-invalid-number = Não entendi o número de mensagens
context-out-of-range = Número de mensagens deve ser de 1 a 200
context-set = Número de mensagens definido para { $count }

# Random command
random-help = Especifique um número de 0 a 50 para definir a frequência de respostas aleatórias: `/random <number>`
Atualmente definido para `{ $currentValue }`%
`/random default` - definir para valor padrão
random-admin-only = Este comando é apenas para administradores do chat
random-updated = Probabilidade de resposta aleatória atualizada
random-parse-error = Não consegui analisar o número. Tente novamente
random-set = Nova probabilidade de resposta: { $probability }%

# Notes command
notes-too-few-messages = Ainda não passaram mensagens suficientes, leia você mesmo
notes-output = { $notes }

# Hate mode
hate-mode-status = ódio está agora { $status }
hate-mode-admin-only = Este comando é apenas para administradores do chat
hate-mode-msg = Este comando é apenas para administradores do chat
Mas se for o caso, ódio está atualmente { $status }

# Character commands
character-search-help = Clique no botão de pesquisa para encontrar um personagem, não o digite no comando

character-current = Personagem atual: { $name }.
Nomes de personagem no chat: { $names }

Encontre um personagem do Chub.ai para definir no chat
character-search-error = Erro ao procurar personagem, tente novamente
character-search-no-results = Nada encontrado
Tente procurar por outra coisa
character-search-results = Personagens daqui: https://venus.chub.ai/characters
character-rate-limit = Muito frequente
character-invalid-chat-id = ID de chat inválido
character-not-member = Você não é membro deste chat
character-already-set = Slusha já está definido
character-set = Slusha definido
character-invalid-id = ID de personagem inválido
character-already-exists = Este personagem já está definido
character-not-found = Não foi possível obter personagem
character-download-error = Erro ao baixar personagem. Tente novamente
character-names-help = Escreva variantes do nome "{ $characterName }", que os usuários podem usar como apelos a este personagem. As variantes devem estar em russo, inglês, formas carinhosas diminutivas e formas similares óbvias.
Exemplo: nome "Cute Slusha". Variantes: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
Exemplo: nome "Georgiy". Variantes: ["Georgiy", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = Erro ao obter nomes para personagem. Tente novamente
character-names-set = Erro ao definir nomes para personagem. Tente novamente
character-set-success = { $userName } definiu personagem { $characterName }.
Nomes de personagem no chat: { $names }

Pode ser necessário limpar a memória (/lobotomy), se isso interferir com o novo personagem.

# Opt-out commands
opt-out-users-list = Usuários que Slusha não vê:

opt-out-confirm = <b>Slusha não verá mais suas mensagens neste chat.</b>
<span class="tg-spoiler">exceto quando outro usuário responder diretamente à sua mensagem mencionando Slusha</span>
opt-out-button-return = Retornar
opt-out-not-your-button = Não é seu botão
opt-out-status = Hurra, Slusha { $verb } vê suas mensagens

# Language commands
language-specify-locale = Especifique um locale
language-invalid-locale = Locale inválido
language-already-set = Já definido
language-language-set = Idioma definido

# API errors
api-rate-limit = Limitando taxa para você
api-provider-block = O provedor de API proíbe você de responder. Talvez devido ao personagem: { $reason }

# Private chat context
private-chat-context = \n\nChat privado com { $userName } (@{ $userName })

# Status words
enabled = habilitado
disabled = desabilitado

# Character names
slusha-name = Slusha
search = Pesquisar

# Character commands
character-return-slusha = Retornar Slusha
character-names-in-chat = Nomes de personagem no chat: { $names }
character-find-from-chub = Encontre um personagem do Chub.ai para definir no chat
character-no-search = Sem pesquisa
character-search-not-allowed = Você não pode pesquisar assim, use o comando /character
character-open-search = Abrir pesquisa via comando /character
character-search-title = Pesquisar por nome de personagem no Chub.ai
character-search-error = Erro ao procurar personagem, tente novamente
character-search-error-text = Erro ao procurar personagem
character-nsfw-hint = Dica: adicione /nsfw à consulta para incluir resultados nsfw
character-source-link = Personagens daqui: https://venus.chub.ai/characters
character-nothing-found = Nada encontrado
character-try-different-search = Tente procurar por outra coisa
character-set = Definir
character-next-page = Próxima página
character-click-next-page = Clique para abrir próxima página
character-search-next-page = Pesquisa - Próxima página
character-invalid-chat-id = ID de chat inválido
character-not-member = Você não é membro deste chat
character-already-set = Slusha já está definido
character-return-character = Retornar { $name }
character-set-slusha = Slusha definido
character-user-returned-slusha = { $userName } retornou Slusha
character-downloading = Baixando...
character-set-again = Definir novamente
character-set-success = { $userName } definiu personagem { $characterName }.
Nomes de personagem no chat: { $names }

Pode ser necessário limpar a memória (/lobotomy), se isso interferir com o novo personagem.
character-set-to = Personagem definido para { $name }

# Opt-out commands
opt-out-users-list = \n\n Usuários que Slusha não vê:\n
opt-out-confirm = <b>Slusha não verá mais suas mensagens neste chat.</b>
<span class="tg-spoiler">exceto quando outro usuário responder diretamente à sua mensagem mencionando Slusha</span>
opt-out-button-return = Retornar
opt-out-not-your-button = Não é seu botão
opt-out-status = Hurra, Slusha { $verb } vê suas mensagens
again = novamente
already = já

# Nepons
nepon-1 = não sei..
nepon-2 = não quero responder agora algo
nepon-3 = vou pensar, talvez te diga depois
nepon-4 = Algo não sei hardcore, tente depois
nepon-5 = Relaxando, tente depois