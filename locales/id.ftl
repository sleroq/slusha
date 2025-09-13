# Start message
start-msg = Halo! Saya Slusha, bot genius.

# Admin commands
admin-only = Perintah ini hanya untuk administrator chat
history-cleared = Riwayat dibersihkan
model-current = { $model }
model-reset = Model direset
model-set = Model diatur ke { $model }
probability-updated = Probabilitas respons acak diperbarui
probability-set = Probabilitas respons baru: { $probability }%

# Context commands
context-help = Lewatkan jumlah pesan yang akan saya ingat - `/context 16`

Nilai kecil memberikan respons yang lebih akurat, nilai besar meningkatkan memori. Maksimum 200.
Nilai saat ini - { $currentValue }. Lewatkan `default` untuk kembali ke jumlah pesan default (saat ini { $defaultValue }, tetapi dapat berubah dengan pembaruan)
context-admin-only = Perintah ini hanya untuk administrator chat
context-default-set = Jumlah pesan diatur ke nilai default ({ $defaultValue })
context-invalid-number = Tidak mengerti jumlah pesan
context-out-of-range = Jumlah pesan harus dari 1 sampai 200
context-set = Jumlah pesan diatur ke { $count }

# Random command
random-help = Tentukan angka dari 0 sampai 50 untuk mengatur frekuensi respons acak: `/random <number>`
Saat ini diatur ke `{ $currentValue }`%
`/random default` - atur ke nilai default
random-admin-only = Perintah ini hanya untuk administrator chat
random-updated = Probabilitas respons acak diperbarui
random-parse-error = Tidak bisa mengurai angka. Coba lagi
random-set = Probabilitas respons baru: { $probability }%

# Notes command
notes-too-few-messages = Belum cukup pesan yang lewat, baca sendiri
notes-output = { $notes }

# Hate mode
hate-mode-status = benci sekarang { $status }
hate-mode-admin-only = Perintah ini hanya untuk administrator chat
hate-mode-msg = Perintah ini hanya untuk administrator chat
Tapi jika ada, benci saat ini { $status }

# Character commands
character-search-help = Klik tombol pencarian untuk menemukan karakter, jangan masukkan di perintah

character-current = Karakter saat ini: { $name }.
Nama karakter di chat: { $names }

Temukan karakter dari Chub.ai untuk diatur di chat
character-search-error = Kesalahan mencari karakter, coba lagi
character-search-no-results = Tidak ada yang ditemukan
Coba cari yang lain
character-search-results = Karakter dari sini: https://venus.chub.ai/characters
character-rate-limit = Terlalu sering
character-invalid-chat-id = ID chat tidak valid
character-not-member = Anda bukan anggota chat ini
character-already-set = Slusha sudah diatur
character-set = Slusha diatur
character-invalid-id = ID karakter tidak valid
character-already-exists = Karakter ini sudah diatur
character-not-found = Tidak bisa mendapatkan karakter
character-download-error = Kesalahan mengunduh karakter. Coba lagi
character-names-help = Tulis varian nama "{ $characterName }", yang bisa digunakan pengguna sebagai panggilan untuk karakter ini. Varian harus dalam bahasa Rusia, Inggris, bentuk diminutif sayang dan bentuk serupa yang jelas.
Contoh: nama "Cute Slusha". Varian: ["Cute Slusha", "Slusha", "Слюша", "слюшаня", "слюшка", "шлюша", "слюш"]
Contoh: nama "Georgiy". Varian: ["Georgiy", "Georgie", "George", "Geordie", "Geo", "Егор", "Герасим", "Жора", "Жорка", "Жорочка", "Гоша", "Гошенька", "Гера", "Герочка", "Гога"]
character-names-error = Kesalahan mendapatkan nama untuk karakter. Coba lagi
character-names-set = Kesalahan mengatur nama untuk karakter. Coba lagi
character-set-success = { $userName } mengatur karakter { $characterName }.
Nama karakter di chat: { $names }

Mungkin perlu membersihkan memori (/lobotomy), jika ini mengganggu karakter baru.

# Opt-out commands
opt-out-users-list = Pengguna yang tidak dilihat Slusha:

opt-out-confirm = <b>Slusha tidak akan melihat pesan Anda di chat ini lagi.</b>
<span class="tg-spoiler">kecuali ketika pengguna lain langsung membalas pesan Anda menyebutkan Slusha</span>
opt-out-button-return = Kembali
opt-out-not-your-button = Bukan tombol Anda
opt-out-status = Hurra, Slusha { $verb } melihat pesan Anda

# Language commands
language-specify-locale = Tentukan locale
language-invalid-locale = Locale tidak valid
language-already-set = Sudah diatur
language-language-set = Bahasa diatur

# API errors
api-rate-limit = Membatasi tarif untuk Anda
api-provider-block = Penyedia API melarang Anda merespons. Mungkin karena karakter: { $reason }

# Private chat context
private-chat-context = \n\nChat pribadi dengan { $userName } (@{ $userName })

# Status words
enabled = diaktifkan
disabled = dinonaktifkan

# Character names
slusha-name = Slusha
search = Cari

# Character commands
character-return-slusha = Kembali ke Slusha
character-names-in-chat = Nama karakter di chat: { $names }
character-find-from-chub = Temukan karakter dari Chub.ai untuk diatur di chat
character-no-search = Tidak ada pencarian
character-search-not-allowed = Anda tidak bisa mencari seperti itu, gunakan perintah /character
character-open-search = Buka pencarian melalui perintah /character
character-search-title = Cari berdasarkan nama karakter di Chub.ai
character-search-error = Kesalahan mencari karakter, coba lagi
character-search-error-text = Kesalahan mencari karakter
character-nsfw-hint = Tip: tambahkan /nsfw ke query untuk menyertakan hasil nsfw
character-source-link = Karakter dari sini: https://venus.chub.ai/characters
character-nothing-found = Tidak ada yang ditemukan
character-try-different-search = Coba cari yang lain
character-set = Atur
character-next-page = Halaman berikutnya
character-click-next-page = Klik untuk membuka halaman berikutnya
character-search-next-page = Cari - Halaman berikutnya
character-invalid-chat-id = ID chat tidak valid
character-not-member = Anda bukan anggota chat ini
character-already-set = Slusha sudah diatur
character-return-character = Kembali ke { $name }
character-set-slusha = Slusha diatur
character-user-returned-slusha = { $userName } mengembalikan Slusha
character-downloading = Mengunduh...
character-set-again = Atur lagi
character-set-success = { $userName } mengatur karakter { $characterName }.
Nama karakter di chat: { $names }

Mungkin perlu membersihkan memori (/lobotomy), jika ini mengganggu karakter baru.
character-set-to = Karakter diatur ke { $name }

# Opt-out commands
opt-out-users-list = \n\n Pengguna yang tidak dilihat Slusha:\n
opt-out-confirm = <b>Slusha tidak akan melihat pesan Anda di chat ini lagi.</b>
<span class="tg-spoiler">kecuali ketika pengguna lain langsung membalas pesan Anda menyebutkan Slusha</span>
opt-out-button-return = Kembali
opt-out-not-your-button = Bukan tombol Anda
opt-out-status = Hurra, Slusha { $verb } melihat pesan Anda
again = lagi
already = sudah

# Nepons
nepon-1 = tidak tahu..
nepon-2 = tidak mau jawab sekarang sesuatu
nepon-3 = akan pikir, mungkin kasih tahu nanti
nepon-4 = Sesuatu tidak tahu hardcore, coba nanti
nepon-5 = Santai, coba nanti