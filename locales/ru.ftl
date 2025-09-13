# Start message
start-msg = Привет! Я Слюша, бот-гений.

# Admin commands
admin-only = Эта команда только для администраторов чата
history-cleared = История очищена
model-current = { $model }
model-reset = Модель сброшена
model-set = Модель установлена на { $model }
probability-updated = Вероятность случайных ответов обновлена
probability-set = Новая вероятность ответа: { $probability }%

# Context commands
context-help = Передай количество сообщений, которое я буду помнить - `/context 16`

Маленькие значения дают более точные ответы, большие значения улучшают память. Максимум 200.
Текущее значение - { $currentValue }. Передай `default` чтобы вернуть количество сообщений по умолчанию (сейчас { $defaultValue }, но может меняться с обновлениями)
context-admin-only = Эта команда только для администраторов чата
context-default-set = Количество сообщений установлено на значение по умолчанию ({ $defaultValue })
context-invalid-number = Не поняла количество сообщений
context-out-of-range = Количество сообщений должно быть от 1 до 200
context-set = Количество сообщений установлено на { $count }

# Random command
random-help = Укажи число от 0 до 50, чтобы настроить частоту случайных ответов: `/random <number>`
Сейчас стоит `{ $currentValue }`%
`/random default` - поставить значение по умолчанию
random-admin-only = Эта команда только для администраторов чата
random-updated = Шанс случайных ответов обновлен
random-parse-error = Нераспарсилось число. Попробуй снова
random-set = Новая вероятность ответа: { $probability }%

# Notes command
notes-too-few-messages = Пока маловато сообщений прошло, сам прочитай
notes-output = { $notes }

# Hate mode
hate-mode-status = хейт теперь { $status }
hate-mode-admin-only = Эта команда только для администраторов чата
hate-mode-msg = Эта команда только для администраторов чата
Но если что, хейт сейчас { $status }

# Character commands
character-search-help = Тыкни на кнопку поиска чтобы найти персонажа, не нужно вводить в команду

character-current = Текущий персонаж: { $name }.
Имена в чате: { $names }

Найдите персонажа из Chub.ai чтобы установить его в чат
character-search-error = Ошибка при поиске персонажа, попробуйте еще раз
character-search-no-results = Ничего не найдено
Попробуйте искать что-нибудь другое
character-search-results = Персонажи отсюда: https://venus.chub.ai/characters
character-rate-limit = Слишком часто
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Слюша уже стоит
character-set = Установлена Слюша
character-invalid-id = Invalid character id
character-already-exists = Этот персонаж уже установлен
character-not-found = Could not get character
character-download-error = Ошибка при скачивании персонажа. Попробуйте снова
character-names-help = Напиши варианты имени "{ $characterName }", которые пользователи могут использовать в качестве обращения к этому персонажу. Варианты должны быть на русском, английском, уменьшительно ласкательные и очевидные похожие формы.
Пример: имя "Cute Slusha". Варианты: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
Пример: имя "Георгий". Варианты: ["Георгий", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = Ошибка при получении имен для персонажа. Попробуйте снова
character-names-set = Ошибка при установке имен для персонажа. Попробуйте снова
character-set-success = { $userName } установил персонажа { $characterName }.
Имена в чате: { $names }

Может иметь смысл стереть память (/lobotomy), если это мешает новому персонажу.

# Opt-out commands
opt-out-users-list = \n\n Пользователи, которых не видит слюша:\n

opt-out-confirm = <b>Слюша больше не будет видеть твои сообщения в этом чате.</b>
<span class="tg-spoiler">за исключением прямого ответа другого пользователя на твое сообщение с упоминанием слюши</span>
opt-out-button-return = Вернуться
opt-out-not-your-button = Не твоя кнопка
opt-out-status = Ура, Слюша { $verb } видит твои сообщения

# Language commands
language-specify-locale = Укажи локаль
language-invalid-locale = Неверная локаль
language-already-set = Уже установлено
language-language-set = Язык установлен

# API errors
api-rate-limit = Рейтлимитим тебя
api-provider-block = API провайдер запрещает тебе отвечать. Возможно это из-за персонажа: { $reason }

# Private chat context
private-chat-context = \n\nЛичный чат с { $userName } (@{ $userName })

# Status words
enabled = включен
disabled = выключен

# Character names
slusha-name = Слюша
search = Поиск

# Character commands
character-return-slusha = Вернуть Слюшу
character-names-in-chat = Имена в чате: { $names }
character-find-from-chub = Найдите персонажа из Chub.ai чтобы установить его в чат
character-no-search = Нет поиска
character-search-not-allowed = Так просто искать нельзя, используй команду /character
character-open-search = Открой поиск через команду /character
character-search-title = Поиск по имени персонажа в Chub.ai
character-search-error = Ошибка при поиске персонажа, попробуйте еще раз
character-search-error-text = Ошибка при поиске персонажа
character-nsfw-hint = Подсказка: добавь /nsfw в запрос, чтобы включить nsfw результаты
character-source-link = Персонажи отсюда: https://venus.chub.ai/characters
character-nothing-found = Ничего не найдено
character-try-different-search = Попробуйте искать что-нибудь другое
character-set = Установить
character-next-page = Следующая страница
character-click-next-page = кликай чтобы открыть следующую страницу
character-search-next-page = Поиск - Следующая страница
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Слюша уже стоит
character-return-character = Вернуть { $name }
character-set-slusha = Установлена Слюша
character-user-returned-slusha = { $userName } вернул Слюшу
character-downloading = Скачиваю...
character-set-again = Установить повторно
character-set-success = { $userName } установил персонажа { $characterName }.
Имена в чате: { $names }

Может иметь смысл стереть память (/lobotomy), если это мешает новому персонажу.
character-set-to = Character is set to { $name }

# Opt-out commands
opt-out-users-list = \n\n Пользователи, которых не видит слюша:\n
opt-out-confirm = <b>Слюша больше не будет видеть твои сообщения в этом чате.</b>
<span class="tg-spoiler">за исключением прямого ответа другого пользователя на твое сообщение с упоминанием слюши</span>
opt-out-button-return = Вернуться
opt-out-not-your-button = Не твоя кнопка
opt-out-status = Ура, Слюша { $verb } видит твои сообщения
again = снова
already = уже

# Nepons
nepon-1 = непон..
nepon-2 = нехочу отвечать щас чето
nepon-3 = подумаю, может потом тебе скажу
nepon-4 = Чета непон жесткий, попробуй позже
nepon-5 = откисаю, попробуй позже