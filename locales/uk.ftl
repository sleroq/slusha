# Start message
start-msg = Привіт! Я Слюша, бот-геній.

# Admin commands
admin-only = Ця команда тільки для адміністраторів чату
history-cleared = Історія очищена
model-current = { $model }
model-reset = Модель скинута
model-set = Модель встановлена на { $model }
probability-updated = Ймовірність випадкових відповідей оновлена
probability-set = Нова ймовірність відповіді: { $probability }%

# Context commands
context-help = Передай кількість повідомлень, яку я буду пам'ятати - `/context 16`
    Маленькі значення дають більш точні відповіді, великі значення покращують пам'ять. Максимум 200.
    Поточне значення - { $currentValue }. Передай `default` щоб повернути кількість повідомлень за замовчуванням (зараз { $defaultValue }, але може змінюватися з оновленнями)
context-admin-only = Ця команда тільки для адміністраторів чату
context-default-set = Кількість повідомлень встановлена на значення за замовчуванням ({ $defaultValue })
context-invalid-number = Не зрозуміла кількість повідомлень
context-out-of-range = Кількість повідомлень повинна бути від 1 до 200
context-set = Кількість повідомлень встановлена на { $count }

# Random command
random-help = Вкажи число від 0 до 50, щоб налаштувати частоту випадкових відповідей: `/random <number>`
    Зараз встановлено `{ $currentValue }`%
    `/random default` - поставити значення за замовчуванням
random-admin-only = Ця команда тільки для адміністраторів чату
random-updated = Шанс випадкових відповідей оновлений
random-parse-error = Не розпарилося число. Спробуй знову
random-set = Нова ймовірність відповіді: { $probability }%

# Notes command
notes-too-few-messages = Поки замало повідомлень пройшло, сам прочитай
notes-output = { $notes }

# Hate mode
hate-mode-status = хейт тепер { $status }
hate-mode-admin-only = Ця команда тільки для адміністраторів чату
hate-mode-msg = Ця команда тільки для адміністраторів чату
    Але якщо що, хейт зараз { $status }

# Character commands
character-search-help = Ткни на кнопку пошуку щоб знайти персонажа, не потрібно вводити в команду

character-current = Поточний персонаж: { $name }.
character-search-error = Помилка при пошуку персонажа, спробуйте ще раз
character-search-no-results = Нічого не знайдено
character-search-results = Персонажі звідси: https://venus.chub.ai/characters
character-rate-limit = Занадто часто
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Слюша вже стоїть
character-set = Встановлена Слюша
character-invalid-id = Invalid character id
character-already-exists = Цей персонаж вже встановлений
character-not-found = Could not get character
character-download-error = Помилка при завантаженні персонажа. Спробуйте знову
character-names-help = Напиши варіанти імені "{ $characterName }", які користувачі можуть використовувати як звернення до цього персонажа. Варіанти повинні бути українською, англійською, зменшувально-пестливими та очевидними схожими формами.
    Приклад: ім'я "Cute Slusha". Варіанти: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
    Приклад: ім'я "Георгій". Варіанти: ["Георгій", "Georgie", "George", "Geordie", "Geo", "Єгор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = Помилка при отриманні імен для персонажа. Спробуйте знову
character-names-set = Помилка при встановленні імен для персонажа. Спробуйте знову
character-set-success = { $userName } встановив персонажа { $characterName }.
    Імена в чаті: { $names }
    
    Може мати сенс стерти пам'ять (/lobotomy), якщо це заважає новому персонажу.

# Opt-out commands
opt-out-users-list = \n\n Користувачі, яких не бачить слюша:\n

opt-out-confirm = <b>Слюша більше не буде бачити твої повідомлення в цьому чаті.</b>
<span class="tg-spoiler">за винятком прямого відповіді іншого користувача на твоє повідомлення з згадуванням слюші</span>
opt-out-button-return = Повернутися
opt-out-not-your-button = Не твоя кнопка
opt-out-status = Ура, Слюша { $verb } бачить твої повідомлення

# Language commands
language-specify-locale = Вкажи локаль
language-invalid-locale = Невірна локаль
language-already-set = Вже встановлено
language-language-set = Мову встановлено

# API errors
api-rate-limit = Рейтлімітю тебе
api-provider-block = API провайдер забороняє тобі відповідати. Можливо це через персонажа: { $reason }

# Private chat context
private-chat-context = \n\nОсобистый чат з { $userName } (@{ $userName })

# Status words
enabled = увімкнено
disabled = вимкнено

# Character names
slusha-name = Слюша
search = Пошук

# Character commands
character-return-slusha = Повернути Слюшу
character-names-in-chat = Імена в чаті: { $names }
character-find-from-chub = Знайдіть персонажа з Chub.ai щоб встановити його в чат
character-no-search = Немає пошуку
character-search-not-allowed = Так просто шукати не можна, використовуй команду /character
character-open-search = Відкрий пошук через команду /character
character-search-title = Пошук за ім'ям персонажа в Chub.ai
character-search-error = Помилка при пошуку персонажа, спробуйте ще раз
character-search-error-text = Помилка при пошуку персонажа
character-nsfw-hint = Підказка: додай /nsfw до запиту, щоб включити nsfw результати
character-source-link = Персонажі звідси: https://venus.chub.ai/characters
character-nothing-found = Нічого не знайдено
character-try-different-search = Спробуйте шукати щось інше
character-set = Встановити
character-next-page = Наступна сторінка
character-click-next-page = клікай щоб відкрити наступну сторінку
character-search-next-page = Пошук - Наступна сторінка
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Слюша вже стоїть
character-return-character = Повернути { $name }
character-set-slusha = Встановлена Слюша
character-user-returned-slusha = { $userName } повернув Слюшу
character-downloading = Завантажую...
character-set-again = Встановити повторно
character-set-success = { $userName } встановив персонажа { $characterName }.
    Імена в чаті: { $names }
    
    Може мати сенс стерти пам'ять (/lobotomy), якщо це заважає новому персонажу.
character-set-to = Character is set to { $name }

# Opt-out commands
opt-out-users-list = \n\n Користувачі, яких не бачить слюша:\n
opt-out-confirm = <b>Слюша більше не буде бачити твої повідомлення в цьому чаті.</b>
<span class="tg-spoiler">за винятком прямого відповіді іншого користувача на твоє повідомлення з згадуванням слюші</span>
opt-out-button-return = Повернутися
opt-out-not-your-button = Не твоя кнопка
opt-out-status = Ура, Слюша { $verb } бачить твої повідомлення
again = знову
already = вже

# Nepons
nepon-1 = не зрозуміло..
nepon-2 = не хочу відповідати зараз щось
nepon-3 = подумаю, може потім тобі скажу
nepon-4 = Щось не зрозуміло жорсткий, спробуй пізніше
nepon-5 = відпочиваю, спробуй пізніше