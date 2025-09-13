# Start message
start-msg = नमस्ते! मैं स्लूशा हूं, प्रतिभाशाली बॉट।

# Admin commands
admin-only = यह कमांड केवल चैट एडमिनिस्ट्रेटरों के लिए है
history-cleared = इतिहास साफ़ किया गया
model-current = { $model }
model-reset = मॉडल रीसेट
model-set = मॉडल सेट किया गया { $model }
probability-updated = यादृच्छिक उत्तर संभावना अपडेट की गई
probability-set = नई उत्तर संभावना: { $probability }%

# Context commands
context-help = मुझे याद रखने वाले संदेशों की संख्या पास करें - `/context 16`

छोटी वैल्यूज़ अधिक सटीक प्रतिक्रियाएं देती हैं, बड़ी वैल्यूज़ मेमोरी में सुधार करती हैं। अधिकतम 200।
वर्तमान वैल्यू - { $currentValue }। डिफ़ॉल्ट संख्या में वापस जाने के लिए `default` पास करें (वर्तमान में { $defaultValue }, लेकिन अपडेट्स के साथ बदल सकता है)
context-admin-only = यह कमांड केवल चैट एडमिनिस्ट्रेटरों के लिए है
context-default-set = संदेशों की संख्या डिफ़ॉल्ट वैल्यू पर सेट की गई ({ $defaultValue })
context-invalid-number = संदेशों की संख्या समझ नहीं आई
context-out-of-range = संदेशों की संख्या 1 से 200 के बीच होनी चाहिए
context-set = संदेशों की संख्या सेट की गई { $count }

# Random command
random-help = यादृच्छिक प्रतिक्रियाओं की फ़्रीक्वेंसी सेट करने के लिए 0 से 50 के बीच एक संख्या निर्दिष्ट करें: `/random <number>`
वर्तमान में सेट है `{ $currentValue }`%
`/random default` - डिफ़ॉल्ट वैल्यू पर सेट करें
random-admin-only = यह कमांड केवल चैट एडमिनिस्ट्रेटरों के लिए है
random-updated = यादृच्छिक उत्तर संभावना अपडेट की गई
random-parse-error = संख्या पार्स नहीं कर सका। फिर से प्रयास करें
random-set = नई उत्तर संभावना: { $probability }%

# Notes command
notes-too-few-messages = अभी तक पर्याप्त संदेश नहीं हुए हैं, इसे खुद पढ़ें
notes-output = { $notes }

# Hate mode
hate-mode-status = नफरत अब { $status } है
hate-mode-admin-only = यह कमांड केवल चैट एडमिनिस्ट्रेटरों के लिए है
hate-mode-msg = यह कमांड केवल चैट एडमिनिस्ट्रेटरों के लिए है
लेकिन अगर कुछ भी, नफरत वर्तमान में { $status } है

# Character commands
character-search-help = एक कैरेक्टर खोजने के लिए सर्च बटन पर क्लिक करें, इसे कमांड में दर्ज न करें

character-current = वर्तमान कैरेक्टर: { $name }।
चैट में कैरेक्टर नाम: { $names }

Chub.ai से चैट में सेट करने के लिए एक कैरेक्टर खोजें
character-search-error = कैरेक्टर खोजने में त्रुटि, फिर से प्रयास करें
character-search-no-results = कुछ नहीं मिला
कुछ और खोजने का प्रयास करें
character-search-results = यहां से कैरेक्टर: https://venus.chub.ai/characters
character-rate-limit = बहुत बार
character-invalid-chat-id = अमान्य चैट id
character-not-member = आप इस चैट के सदस्य नहीं हैं
character-already-set = स्लूशा पहले से सेट है
character-set = स्लूशा सेट
character-invalid-id = अमान्य कैरेक्टर id
character-already-exists = यह कैरेक्टर पहले से सेट है
character-not-found = कैरेक्टर प्राप्त नहीं कर सका
character-download-error = कैरेक्टर डाउनलोड करने में त्रुटि। फिर से प्रयास करें
character-names-help = "{ $characterName }" नाम के वैरिएंट लिखें, जिन्हें उपयोगकर्ता इस कैरेक्टर को अपील करने के लिए उपयोग कर सकते हैं। वैरिएंट रूसी, अंग्रेजी, छोटे प्यारे और स्पष्ट समान रूपों में होने चाहिए।
उदाहरण: नाम "Cute Slusha". वैरिएंट: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
उदाहरण: नाम "Georgiy". वैरिएंट: ["Georgiy", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = कैरेक्टर के लिए नाम प्राप्त करने में त्रुटि। फिर से प्रयास करें
character-names-set = कैरेक्टर के लिए नाम सेट करने में त्रुटि। फिर से प्रयास करें
character-set-success = { $userName } ने कैरेक्टर { $characterName } सेट किया।
चैट में कैरेक्टर नाम: { $names }

नए कैरेक्टर में हस्तक्षेप करता है तो मेमोरी साफ़ करने की आवश्यकता हो सकती है (/lobotomy)।

# Opt-out commands
opt-out-users-list = उपयोगकर्ता जिन्हें स्लूशा नहीं देखता:

opt-out-confirm = <b>स्लूशा अब इस चैट में आपके संदेश नहीं देखेगा।</b>
<span class="tg-spoiler">सिवाय जब कोई अन्य उपयोगकर्ता आपके संदेश का सीधा उत्तर देता है जिसमें स्लूशा का उल्लेख है</span>
opt-out-button-return = वापस लौटें
opt-out-not-your-button = आपका बटन नहीं
opt-out-status = हुर्रे, स्लूशा { $verb } आपके संदेश देखता है

# Language commands
language-specify-locale = एक लोकेल निर्दिष्ट करें
language-invalid-locale = अमान्य लोकेल
language-already-set = पहले से सेट है
language-language-set = भाषा सेट

# API errors
api-rate-limit = रेट लिमिटिंग आप
api-provider-block = API प्रदाता आपको उत्तर देने से रोकता है। शायद कैरेक्टर के कारण: { $reason }

# Private chat context
private-chat-context = \n\n{ $userName } (@{ $userName }) के साथ निजी चैट

# Status words
enabled = सक्षम
disabled = अक्षम

# Character names
slusha-name = स्लूशा
search = खोजें

# Character commands
character-return-slusha = स्लूशा वापस लौटें
character-names-in-chat = चैट में कैरेक्टर नाम: { $names }
character-find-from-chub = चैट में सेट करने के लिए Chub.ai से एक कैरेक्टर खोजें
character-no-search = कोई खोज नहीं
character-search-not-allowed = आप इस तरह खोज नहीं कर सकते, /character कमांड का उपयोग करें
character-open-search = /character कमांड के माध्यम से खोज खोलें
character-search-title = Chub.ai में कैरेक्टर नाम द्वारा खोजें
character-search-error = कैरेक्टर खोजने में त्रुटि, फिर से प्रयास करें
character-search-error-text = कैरेक्टर खोजने में त्रुटि
character-nsfw-hint = टिप: nsfw परिणाम शामिल करने के लिए क्वेरी में /nsfw जोड़ें
character-source-link = यहां से कैरेक्टर: https://venus.chub.ai/characters
character-nothing-found = कुछ नहीं मिला
character-try-different-search = कुछ और खोजने का प्रयास करें
character-set = सेट करें
character-next-page = अगला पेज
character-click-next-page = अगला पेज खोलने के लिए क्लिक करें
character-search-next-page = खोज - अगला पेज
character-invalid-chat-id = अमान्य चैट id
character-not-member = आप इस चैट के सदस्य नहीं हैं
character-already-set = स्लूशा पहले से सेट है
character-return-character = { $name } वापस लौटें
character-set-slusha = स्लूशा सेट
character-user-returned-slusha = { $userName } ने स्लूशा वापस लौटा दिया
character-downloading = डाउनलोड हो रहा है...
character-set-again = फिर से सेट करें
character-set-success = { $userName } ने कैरेक्टर { $characterName } सेट किया।
चैट में कैरेक्टर नाम: { $names }

नए कैरेक्टर में हस्तक्षेप करता है तो मेमोरी साफ़ करने की आवश्यकता हो सकती है (/lobotomy)।
character-set-to = कैरेक्टर सेट है { $name }

# Opt-out commands
opt-out-users-list = \n\n उपयोगकर्ता जिन्हें स्लूशा नहीं देखता:\n
opt-out-confirm = <b>स्लूशा अब इस चैट में आपके संदेश नहीं देखेगा।</b>
<span class="tg-spoiler">सिवाय जब कोई अन्य उपयोगकर्ता आपके संदेश का सीधा उत्तर देता है जिसमें स्लूशा का उल्लेख है</span>
opt-out-button-return = वापस लौटें
opt-out-not-your-button = आपका बटन नहीं
opt-out-status = हुर्रे, स्लूशा { $verb } आपके संदेश देखता है
again = फिर से
already = पहले से

# Nepons
nepon-1 = नहीं पता..
nepon-2 = अभी उत्तर नहीं देना चाहता कुछ
nepon-3 = सोचूंगा, शायद बाद में बताऊंगा
nepon-4 = कुछ नहीं पता हार्डकोर, बाद में प्रयास करें
nepon-5 = आराम कर रहा हूं, बाद में प्रयास करें