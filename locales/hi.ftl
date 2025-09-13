# Start message
start-msg = नमस्ते! मैं स्लूशा हूं, एक स्मार्ट बॉट।

# Admin commands
admin-only = यह कमांड सिर्फ चैट एडमिन के लिए है
history-cleared = इतिहास साफ कर दिया
model-current = { $model }
model-reset = मॉडल रीसेट कर दिया
model-set = मॉडल सेट कर दिया: { $model }
probability-updated = रैंडम रिप्लाई की प्रॉबेबिलिटी अपडेट हुई
probability-set = नई प्रॉबेबिलिटी: { $probability }%

# Context commands
context-help = मुझे कितने मैसेज याद रखने हैं बताओ - `/context 16`

छोटी वैल्यू से ज्यादा सटीक जवाब मिलते हैं, बड़ी वैल्यू से मेमोरी बेहतर होती है। मैक्स 200।
अभी सेट है - { $currentValue }। डिफॉल्ट पर वापस जाने के लिए `default` लिखो (अभी { $defaultValue } है, लेकिन अपडेट हो सकता है)
context-admin-only = यह कमांड सिर्फ चैट एडमिन के लिए है
context-default-set = मैसेज काउंट डिफॉल्ट पर सेट कर दिया ({ $defaultValue })
context-invalid-number = मैसेज काउंट समझ नहीं आया
context-out-of-range = मैसेज काउंट 1 से 200 के बीच होना चाहिए
context-set = मैसेज काउंट सेट कर दिया: { $count }

# Random command
random-help = रैंडम रिप्लाई कितनी बार हो उसका प्रतिशत सेट करने के लिए 0 से 50 के बीच कोई नंबर डालो: `/random <number>`
अभी सेट है `{ $currentValue }`%
`/random default` - डिफॉल्ट पर वापस सेट करो
random-admin-only = यह कमांड सिर्फ चैट एडमिन के लिए है
random-updated = रैंडम रिप्लाई की प्रॉबेबिलिटी अपडेट हुई
random-parse-error = नंबर समझ नहीं आया। फिर से कोशिश करो
random-set = नई प्रॉबेबिलिटी: { $probability }%

# Notes command
notes-too-few-messages = अभी तक काफी मैसेज नहीं हुए, खुद पढ़ लो
notes-output = { $notes }

# Hate mode
hate-mode-status = हैट मोड अब { $status } है
hate-mode-admin-only = यह कमांड सिर्फ चैट एडमिन के लिए है
hate-mode-msg = यह कमांड सिर्फ चैट एडमिन के लिए है
हालांकि कुछ भी हो, हैट मोड अभी { $status } है

# Character commands
character-search-help = कैरेक्टर खोजने के लिए सर्च बटन पर क्लिक करो, कमांड में मत लिखो

character-current = अभी का कैरेक्टर: { $name }।
चैट में कैरेक्टर के नाम: { $names }

Chub.ai से कोई कैरेक्टर खोजकर चैट में सेट करो
character-search-error = कैरेक्टर खोजने में गड़बड़ हुई, फिर से कोशिश करो
character-search-no-results = कुछ नहीं मिला
कोई और सर्च ट्राई करो
character-search-results = यहां से कैरेक्टर लो: https://venus.chub.ai/characters
character-rate-limit = बहुत बार रिक्वेस्ट भेज रहे हो
character-invalid-chat-id = गलत चैट id
character-not-member = तुम इस चैट के मेंबर नहीं हो
character-already-set = स्लूशा पहले से सेट है
character-set = स्लूशा सेट कर दी
character-invalid-id = गलत कैरेक्टर id
character-already-exists = यह कैरेक्टर पहले से सेट है
character-not-found = कैरेक्टर नहीं मिला
character-download-error = कैरेक्टर डाउनलोड करने में गड़बड़। फिर से कोशिश करो
character-names-help = "{ $characterName }" नाम के अलग-अलग वैरिएंट लिखो, जिनसे लोग इस कैरेक्टर को बुला सकते हैं। रूसी, इंग्लिश, प्यारे और कॉमन वैरिएंट डालो।
जैसे: नाम "Cute Slusha". वैरिएंट: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
जैसे: नाम "Georgiy". वैरिएंट: ["Georgiy", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошеньका", "Гера", "Герочка", "Гога"]
character-names-error = कैरेक्टर के नाम लोड करने में गड़बड़। फिर से कोशिश करो
character-names-set = कैरेक्टर के नाम सेट करने में गड़बड़। फिर से कोशिश करो
character-set-success = { $userName } ने { $characterName } कैरेक्टर सेट कर दिया।
चैट में कैरेक्टर के नाम: { $names }

नए कैरेक्टर से कन्फ्यूजन हो तो मेमोरी साफ कर लेना (/lobotomy)।

# Opt-out commands
opt-out-users-list = लोग जिनके मैसेज स्लूशा नहीं देखता:

opt-out-confirm = <b>स्लूशा अब इस चैट में तुम्हारे मैसेज नहीं देखेगा।</b>
<span class="tg-spoiler">सिवाय जब कोई और तुम्हारे मैसेज का रिप्लाई देता हो जिसमें स्लूशा का नाम हो</span>
opt-out-button-return = वापस लौटो
opt-out-not-your-button = यह तुम्हारा बटन नहीं है
opt-out-status = वाह, स्लूशा अब { $verb } तुम्हारे मैसेज देखता है

# Language commands
language-specify-locale = कोई लोकेल बताओ
language-invalid-locale = गलत लोकेल
language-already-set = पहले से सेट है
language-language-set = भाषा सेट कर दी

# API errors
api-rate-limit = बहुत ज्यादा रिक्वेस्ट भेज रहे हो, रुक जाओ
api-provider-block = API वाला तुम्हें ब्लॉक कर रहा है। शायद कैरेक्टर की वजह से: { $reason }

# Private chat context
private-chat-context = \n\n{ $userName } (@{ $userName }) के साथ प्राइवेट चैट

# Status words
enabled = ऑन
disabled = ऑफ

# Character names
slusha-name = स्लूशा
search = सर्च

# Character commands
character-return-slusha = स्लूशा वापस लाओ
character-names-in-chat = चैट में कैरेक्टर के नाम: { $names }
character-find-from-chub = Chub.ai से कोई कैरेक्टर खोजकर चैट में सेट करो
character-no-search = कोई सर्च नहीं
character-search-not-allowed = ऐसे सर्च नहीं कर सकते, /character कमांड इस्तेमाल करो
character-open-search = /character कमांड से सर्च खोलो
character-search-title = Chub.ai में कैरेक्टर नाम से सर्च करो
character-search-error = कैरेक्टर सर्च करने में गड़बड़, फिर से कोशिश करो
character-search-error-text = कैरेक्टर सर्च करने में गड़बड़
character-nsfw-hint = टिप: NSFW रिजल्ट चाहिए तो क्वेरी में /nsfw जोड़ो
character-source-link = यहां से कैरेक्टर लो: https://venus.chub.ai/characters
character-nothing-found = कुछ नहीं मिला
character-try-different-search = कोई और सर्च ट्राई करो
character-set = सेट करो
character-next-page = अगला पेज
character-click-next-page = अगला पेज खोलने के लिए क्लिक करो
character-search-next-page = सर्च - अगला पेज
character-invalid-chat-id = गलत चैट id
character-not-member = तुम इस चैट के मेंबर नहीं हो
character-already-set = स्लूशा पहले से सेट है
character-return-character = { $name } वापस लाओ
character-set-slusha = स्लूशा सेट करो
character-user-returned-slusha = { $userName } ने स्लूशा वापस ला दिया
character-downloading = डाउनलोड हो रहा है...
character-set-again = फिर से सेट करो
character-set-success = { $userName } ने { $characterName } कैरेक्टर सेट कर दिया।
चैट में कैरेक्टर के नाम: { $names }

नए कैरेक्टर से कन्फ्यूजन हो तो मेमोरी साफ कर लेना (/lobotomy)।
character-set-to = कैरेक्टर सेट है: { $name }

# Opt-out commands
opt-out-users-list = \n\n लोग जिनके मैसेज स्लूशा नहीं देखता:\n
opt-out-confirm = <b>स्लूशा अब इस चैट में तुम्हारे मैसेज नहीं देखेगा।</b>
<span class="tg-spoiler">सिवाय जब कोई और तुम्हारे मैसेज का रिप्लाई देता हो जिसमें स्लूशा का नाम हो</span>
opt-out-button-return = वापस लौटो
opt-out-not-your-button = यह तुम्हारा बटन नहीं है
opt-out-status = वाह, स्लूशा अब { $verb } तुम्हारे मैसेज देखता है
again = फिर से
already = पहले से

# Nepons
nepon-1 = पता नहीं..
nepon-2 = अभी कुछ उत्तर नहीं देना
nepon-3 = सोचूंगा, बाद में बताता हूं
nepon-4 = कुछ पता नहीं, बाद में ट्राई करना
nepon-5 = आराम कर रहा हूं, बाद में मिलते हैं