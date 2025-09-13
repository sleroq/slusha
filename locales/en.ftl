# Start message
start-msg = Hello! I'm Slusha, the genius bot.

# Admin commands
admin-only = This command is only for chat administrators
history-cleared = History cleared
model-current = { $model }
model-reset = Model reset
model-set = Model set to { $model }
probability-updated = Random reply probability updated
probability-set = New reply probability: { $probability }%

# Context commands
context-help = Pass the number of messages I will remember - `/context 16`
    Small values give more accurate responses, large values improve memory. Maximum 200.
    Current value - { $currentValue }. Pass `default` to return to default number of messages (currently { $defaultValue }, but may change with updates)
context-admin-only = This command is only for chat administrators
context-default-set = Number of messages set to default value ({ $defaultValue })
context-invalid-number = Didn't understand the number of messages
context-out-of-range = Number of messages must be from 1 to 200
context-set = Number of messages set to { $count }

# Random command
random-help = Specify a number from 0 to 50 to set the frequency of random responses: `/random <number>`
    Currently set to `{ $currentValue }`%
    `/random default` - set to default value
random-admin-only = This command is only for chat administrators
random-updated = Random reply probability updated
random-parse-error = Couldn't parse number. Try again
random-set = New reply probability: { $probability }%

# Notes command
notes-too-few-messages = Not enough messages have passed yet, read it yourself
notes-output = { $notes }

# Hate mode
hate-mode-status = hate is now { $status }
hate-mode-admin-only = This command is only for chat administrators
hate-mode-msg = This command is only for chat administrators
    But if anything, hate is currently { $status }

# Character commands
character-search-help = Click the search button to find a character, don't enter it in the command

character-current = Current character: { $name }.
character-search-error = Error searching for character, try again
character-search-no-results = Nothing found
character-search-results = Characters from here: https://venus.chub.ai/characters
character-rate-limit = Too frequent
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Slusha is already set
character-set = Slusha set
character-invalid-id = Invalid character id
character-already-exists = This character is already set
character-not-found = Could not get character
character-download-error = Error downloading character. Try again
character-names-help = Write variants of the name "{ $characterName }", which users can use as appeals to this character. Variants should be in Russian, English, diminutive affectionate and obvious similar forms.
    Example: name "Cute Slusha". Variants: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
    Example: name "Georgiy". Variants: ["Georgiy", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = Error getting names for character. Try again
character-names-set = Error setting names for character. Try again
character-set-success = { $userName } set character { $characterName }.
    Character names in chat: { $names }
    
    May need to clear memory (/lobotomy), if this interferes with the new character.

# Opt-out commands
opt-out-users-list = Users that Slusha doesn't see:

opt-out-confirm = <b>Slusha will no longer see your messages in this chat.</b>
<span class="tg-spoiler">except when another user directly replies to your message mentioning Slusha</span>
opt-out-button-return = Return
opt-out-not-your-button = Not your button
opt-out-status = Hooray, Slusha { $verb } sees your messages

# Language commands
language-specify-locale = Specify a locale
language-invalid-locale = Invalid locale
language-already-set = Already set
language-language-set = Language set

# API errors
api-rate-limit = Rate limiting you
api-provider-block = API provider prohibits you from responding. Perhaps due to the character: { $reason }

# Private chat context
private-chat-context = \n\nPrivate chat with { $userName } (@{ $userName })

# Status words
enabled = enabled
disabled = disabled

# Character names
slusha-name = Slusha
search = Search

# Character commands
character-return-slusha = Return Slusha
character-names-in-chat = Character names in chat: { $names }
character-find-from-chub = Find a character from Chub.ai to set in chat
character-no-search = No search
character-search-not-allowed = You can't search like that, use /character command
character-open-search = Open search via /character command
character-search-title = Search by character name in Chub.ai
character-search-error = Error searching for character, try again
character-search-error-text = Error searching for character
character-nsfw-hint = Tip: add /nsfw to query to include nsfw results
character-source-link = Characters from here: https://venus.chub.ai/characters
character-nothing-found = Nothing found
character-try-different-search = Try searching for something else
character-set = Set
character-next-page = Next page
character-click-next-page = Click to open next page
character-search-next-page = Search - Next page
character-invalid-chat-id = Invalid chat id
character-not-member = You are not a member of this chat
character-already-set = Slusha is already set
character-return-character = Return { $name }
character-set-slusha = Slusha set
character-user-returned-slusha = { $userName } returned Slusha
character-downloading = Downloading...
character-set-again = Set again
character-set-success = { $userName } set character { $characterName }.
    Character names in chat: { $names }
    
    May need to clear memory (/lobotomy), if this interferes with the new character.
character-set-to = Character is set to { $name }

# Opt-out commands
opt-out-users-list = \n\n Users that Slusha doesn't see:\n
opt-out-confirm = <b>Slusha will no longer see your messages in this chat.</b>
<span class="tg-spoiler">except when another user directly replies to your message mentioning Slusha</span>
opt-out-button-return = Return
opt-out-not-your-button = Not your button
opt-out-status = Hooray, Slusha { $verb } sees your messages
again = again
already = already

# Nepons
nepon-1 = dunno..
nepon-2 = don't wanna answer right now something
nepon-3 = I'll think about it, maybe I'll tell you later
nepon-4 = Something dunno hardcore, try later
nepon-5 = Chilling, try later