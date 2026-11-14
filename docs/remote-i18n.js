// The Ukrainian page's texts (deckyhub.com/uk/paired-devices/). The page's script keeps writing its messages in English;
// translate() turns each one into Ukrainian on the way to the screen, on a page whose <html lang> is "uk", and leaves
// it alone otherwise. The page's own markup is translated at build time (devtools/remote_page_uk.py).
const UK = new Map(Object.entries({
  // messages
  'Enter a private IPv4 address and port, for example 192.168.1.50:8765.': 'Введіть приватну IPv4-адресу й порт, наприклад 192.168.1.50:8765.',
  'Enter the private IPv4 address shown in DeckyHub with port 8765.': 'Введіть приватну IPv4-адресу з DeckyHub і порт 8765.',
  'Enter the 64-digit SHA-256 fingerprint shown on your device.': 'Введіть 64-значний відбиток SHA-256, показаний на вашому пристрої.',
  'The device did not respond.': 'Пристрій не відповів.',
  'Request is too large.': 'Запит завеликий.',
  'Device response is too large.': 'Відповідь пристрою завелика.',
  'The device rejected the request.': 'Пристрій відхилив запит.',
  'Link copied. Paste it into Chrome or Edge.': 'Посилання скопійовано. Вставте його в Chrome або Edge.',
  'Select the link, copy it, then paste it into Chrome or Edge.': 'Виділіть посилання, скопіюйте його й вставте в Chrome або Edge.',
  'Pair with your device first.': 'Спершу сполучіться з пристроєм.',
  'Link ready. Open it in the other browser.': 'Посилання готове. Відкрийте його в іншому браузері.',
  'Making a link…': 'Створюю посилання…',
  'Your device could not make a link. Update DeckyHub on it to the newest version, then try again.': 'Пристрій не зміг створити посилання. Оновіть на ньому DeckyHub до найновішої версії й спробуйте ще раз.',
  'Could not reach your device. Check that Remote access is on and that it is on the same network as this browser.': 'Не вдалося зв’язатися з пристроєм. Перевірте, що віддалений доступ увімкнено і що пристрій у тій самій мережі, що й цей браузер.',
  'Unable to contact the device.': 'Не вдалося зв’язатися з пристроєм.',
  'Invalid plugin identifier.': 'Недійсний ідентифікатор плагіна.',
  'This browser can’t connect to your device. Copy the pairing link below and open it in Chrome or Edge.': 'Цей браузер не може підключитися до пристрою. Скопіюйте посилання для сполучення нижче й відкрийте його в Chrome або Edge.',
  'Remote install needs Chrome, Edge or another Chromium-based browser. Open this page there.': 'Віддалене встановлення потребує Chrome, Edge чи іншого браузера на Chromium. Відкрийте цю сторінку там.',
  'Retry request status': 'Повторити перевірку запиту',
  'Send to device': 'Надіслати на пристрій',
  'Send install request': 'Надіслати запит на встановлення',
  'Device name': 'Назва пристрою',
  'Rename': 'Перейменувати',
  'Forget': 'Забути',
  'Save': 'Зберегти',
  'Online': 'На зв’язку',
  'Not reachable': 'Недоступний',
  'Checking…': 'Перевірка…',
  'Select a device': 'Виберіть пристрій',
  'Pair another device': 'Додати ще пристрій',
  'Pair a device': 'Додати пристрій',
  'Turn on Remote access on your device, then scan its QR code or paste the pairing link.': 'Увімкніть віддалений доступ на пристрої, потім відскануйте його QR-код або вставте посилання для сполучення.',
  'This device has a pending request. Retry its status before starting another change.': 'На цьому пристрої є незавершений запит. Перевірте його стан, перш ніж робити іншу зміну.',
  'Checking paired devices…': 'Перевірка сполучених пристроїв…',
  'Turn on Remote access on your device, on the same network as this browser.': 'Увімкніть віддалений доступ на пристрої, у тій самій мережі, що й цей браузер.',
  'No paired device is reachable. Turn on Remote access on your device, on the same network as this browser.': 'Жоден сполучений пристрій недоступний. Увімкніть віддалений доступ на пристрої, у тій самій мережі, що й цей браузер.',
  'No paired devices are reachable.': 'Жоден сполучений пристрій недоступний.',
  'Address filled in. Select Use new device address to reconnect to the paired device.': 'Адресу заповнено. Натисніть «Використати нову адресу пристрою», щоб знову підключитися до сполученого пристрою.',
  'Device details filled in. Enter the pairing code shown on your device.': 'Дані пристрою заповнено. Введіть код сполучення, показаний на пристрої.',
  'Paste the pairing link copied from DeckyHub on your device.': 'Вставте посилання для сполучення, скопійоване з DeckyHub на пристрої.',
  'Paste a pairing link or enter the address under connection details.': 'Вставте посилання для сполучення або введіть адресу в даних підключення.',
  'Select the existing pairing to check its pending request first.': 'Спершу виберіть наявне сполучення, щоб перевірити його незавершений запит.',
  'This tab can pair with up to 16 devices.': 'Ця вкладка може сполучатися не більш ніж із 16 пристроями.',
  'Enter the six-digit pairing code and a browser name.': 'Введіть шестицифровий код сполучення й назву браузера.',
  'Connecting to your device. Allow local network access if your browser asks.': 'Підключення до пристрою. Дозвольте доступ до локальної мережі, якщо браузер запитає.',
  'Invalid pairing response.': 'Недійсна відповідь на сполучення.',
  'Approve this browser on your device: press Approve under Pairing requests.': 'Підтвердьте цей браузер на пристрої: натисніть «Підтвердити» у запитах на сполучення.',
  'Paired. You can now manage this device.': 'Сполучено. Тепер ви можете керувати цим пристроєм.',
  'Invalid pairing status.': 'Недійсний стан сполучення.',
  'Pairing timed out.': 'Час сполучення вичерпано.',
  'Pairing rejected.': 'Сполучення відхилено.',
  'Pairing expired.': 'Сполучення прострочено.',
  'This pairing link was rejected. Generate a new QR code or pairing link on your device.': 'Це посилання для сполучення відхилено. Створіть новий QR-код або посилання на пристрої.',
  'Address updated. Send to device or retry the pending request to reconnect.': 'Адресу оновлено. Натисніть «Надіслати на пристрій» або повторіть незавершений запит, щоб підключитися знову.',
  'Invalid request response.': 'Недійсна відповідь на запит.',
  'Waiting for approval on your device.': 'Очікування підтвердження на пристрої.',
  'Approved; waiting for your device.': 'Підтверджено; очікування пристрою.',
  'Uninstalling…': 'Видалення…',
  'Installing…': 'Встановлення…',
  'Enabling…': 'Вмикання…',
  'Disabling…': 'Вимикання…',
  'Invalid request status.': 'Недійсний стан запиту.',
  'Connection interrupted. Retrying status…': 'З’єднання перервано. Повторна перевірка стану…',
  'Status unknown. Retry request status before starting another change.': 'Стан невідомий. Повторіть перевірку запиту, перш ніж робити іншу зміну.',
  'Installed on your device.': 'Встановлено на вашому пристрої.',
  'Installed on your device. If Decky Loader still shows its install window, it may be downloading extra files; this can take a few minutes, then you can close the window.': 'Встановлено на вашому пристрої. Якщо Decky Loader ще показує вікно встановлення, він може докачувати додаткові файли; це може тривати кілька хвилин, після чого вікно можна закрити.',
  'Uninstalled from your device.': 'Видалено з вашого пристрою.',
  'Enabled on your device.': 'Увімкнено на вашому пристрої.',
  'Disabled on your device.': 'Вимкнено на вашому пристрої.',
  'Outcome unknown. Check your device before trying again.': 'Результат невідомий. Перевірте пристрій, перш ніж пробувати знову.',
  'Status unknown. The request may still be active; retry request status before starting another change.': 'Стан невідомий. Запит усе ще може діяти; повторіть перевірку, перш ніж робити іншу зміну.',
  'The request could not be cancelled.': 'Запит не вдалося скасувати.',
  'Request cancelled.': 'Запит скасовано.',
  // time
  'just now': 'щойно',
  // installed plugins
  'Request enable': 'Запит на вмикання',
  'Request disable': 'Запит на вимикання',
  'Request update': 'Запит на оновлення',
  'Request uninstall': 'Запит на видалення',
  'Repository unavailable': 'Репозиторій недоступний',
  'Updates for this plugin come from its own page or your device.': 'Оновлення цього плагіна надходять зі сторінки плагіна або з вашого пристрою.',
  'Manage DeckyHub on your device.': 'Керуйте DeckyHub на вашому пристрої.',
  'No installed plugins found.': 'Встановлених плагінів не знайдено.',
  'Loading installed plugins…': 'Завантаження встановлених плагінів…',
  'Invalid plugin list from the device.': 'Пристрій надіслав недійсний список плагінів.',
  'Too many plugins to display.': 'Забагато плагінів для показу.',
  'Invalid plugin list page.': 'Недійсна сторінка списку плагінів.',
  'Unable to load installed plugins.': 'Не вдалося завантажити встановлені плагіни.',
  'Pair a device to see its installed plugins.': 'Додайте пристрій, щоб побачити його встановлені плагіни.',
  'This is not a DeckyHub plugin pack.': 'Це не пак плагінів DeckyHub.',
  'This plugin pack has no plugins in it.': 'У цьому паку немає плагінів.',
  'This file is too large to be a plugin pack.': 'Цей файл завеликий для пака плагінів.',
  // what DeckyHub knows about a plugin
  'Runs as root': 'Працює від root',
  'Fork': 'Форк',
  'Its backend runs as root, with full access to the device.': 'Його бекенд працює від root, з повним доступом до пристрою.',
  'Pre-release: ': 'Попередній випуск: ',
  'The registry reported this audit finding.': 'Реєстр повідомив про цю знахідку аудиту.',
  'Likely developed with AI help. That says nothing about its quality or safety.': 'Імовірно, розроблений за допомогою ШІ. Це нічого не говорить про його якість чи безпеку.',
  'No threats': 'Загроз немає',
  'Threat found': 'Знайдено загрозу',
  'Not fully scanned': 'Перевірено не повністю',
  'Scanned': 'Перевірено',
  'no threats found': 'загроз не знайдено',
  'threat found': 'знайдено загрозу',
  'only partly scanned': 'перевірено лише частково',
  'couldn\'t be scanned': 'не вдалося перевірити',
  'All details on DeckyHub': 'Усі подробиці на DeckyHub',
  'the latest release': 'останнього випуску',
  // update notices
  'Install app': 'Встановити застосунок',
  'Turn off update notices': 'Вимкнути сповіщення про оновлення',
  'Notify me about updates': 'Сповіщати про оновлення',
  'Notices appear while this page or app is open, or running in the background. Your device is only reached from your own network.': 'Сповіщення з’являються, поки ця сторінка чи застосунок відкриті або працюють у фоні. До вашого пристрою звертаються лише з вашої власної мережі.',
  'Invalid summary from the device.': 'Недійсний підсумок від пристрою.',
  'Details copied.': 'Дані скопійовано.',
  'Select the details, copy them, then paste them into your bug report.': 'Виділіть дані, скопіюйте їх і вставте в повідомлення про помилку.',
  'Notices are blocked. Allow them for this site in your browser settings.': 'Сповіщення заблоковано. Дозвольте їх для цього сайту в налаштуваннях браузера.',
}));

const n = value => Number(value);
const plural = (count, one, few, many) => {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  return { 1: one, 2: few, 3: few, 4: few }[count % 10] ?? many;
};
// Messages with a name or a number in them.
const RULES = [
  [/^(Could not reach your device\. Check that Remote access is on and that it is on the same network as this browser\.) \((.+)\)$/, (message, detail) => `${ukrainian(message)} (${detail})`],
  [/^Pre-release: (.+)$/, rest => `Попередній випуск: ${ukrainian(rest)}`],
  [/^(.+) selected\.$/, name => `${name} вибрано.`],
  [/^(.+) forgotten in this browser\. Remove this browser under Paired browsers in DeckyHub on the device too\.$/, name => `${name} забуто в цьому браузері. Видаліть цей браузер і в розділі «З’єднані браузери» DeckyHub на пристрої.`],
  [/^(.+) forgotten in this browser\. Remove it from Paired devices in DeckyHub too\.$/, name => `${name} забуто в цьому браузері. Видаліть його й зі сполучених пристроїв у DeckyHub.`],
  [/^Used (.+)$/, ago => `Використано ${ukrainian(ago)}`],
  [/^(\d+) minutes ago$/, m => `${m} хв тому`],
  [/^(\d+) hours ago$/, h => `${h} год тому`],
  [/^(\d+) days ago$/, d => `${d} дн. тому`],
  [/^Pairing (rejected|expired)\.$/, state => UK.get(`Pairing ${state}.`)],
  [/^Request (\w+)\.$/, state => `Запит: ${{ rejected: 'відхилено', expired: 'прострочено', cancelled: 'скасовано', failed: 'не вдалося' }[state] ?? state}.`],
  [/^(.+) \(disabled\)$/, name => `${name} (вимкнено)`],
  [/^(Request (?:enable|disable|update|uninstall)) for (.+)$/, (label, name) => `${ukrainian(label)}: ${name}`],
  [/^Installed version · (.+)$/, version => `Встановлена версія · ${version}`],
  [/^(\d+) installed plugins?$/, count => `Встановлено ${count} ${plural(n(count), 'плагін', 'плагіни', 'плагінів')}`],
  [/^(\d+) of (\d+) plugins$/, (shown, total) => `${shown} із ${total} плагінів`],
  [/^(.+): (\d+) of (\d+) plugins are installed on this device \((\d+) off, (\d+) on\)\.$/, (name, found, total, off, on) => `${name}: на цьому пристрої встановлено ${found} із ${total} плагінів (вимкнено: ${off}, увімкнено: ${on}).`],
  [/^A fork of (.+)$/, source => `Форк ${source}`],
  [/^([\d.]+[MK]?) GitHub downloads$/, count => `${count} завантажень на GitHub`],
  [/^([\d.]+[MK]?) Decky store downloads$/, count => `${count} завантажень зі сховища Decky`],
  [/^([\d.]+[MK]?) stars$/, count => `${count} зірок`],
  [/^latest release (.+)$/, tag => `останній випуск ${tag}`],
  [/^updated (.+)$/, date => `оновлено ${date}`],
  [/^(ClamAV|YARA): (.+)$/, (scanner, word) => `${scanner}: ${ukrainian(word)}`],
  [/^(VirusTotal|MetaDefender): (\d+) of (\d+) engines flagged it$/, (scanner, flagged, total) => `${scanner}: ${flagged} із ${total} рушіїв позначили його`],
  [/^Virus scan of (.+?): (.+)\. A clean scan isn't proof of safety\.$/, (tag, results) => `Перевірка на віруси ${ukrainian(tag)}: ${results}. Чиста перевірка не доводить безпеку.`],
  [/^(.+) has not checked for updates yet\. Open DeckyHub on it\.$/, name => `${name} ще не перевіряв оновлення. Відкрийте на ньому DeckyHub.`],
  [/^(.+) is up to date\.$/, name => `${name}: усе оновлено.`],
  [/^(.+) has (\d+) plugin updates? waiting: (.+)\.$/, (name, count, list) => `${name}: на оновлення чекає ${count} ${plural(n(count), 'плагін', 'плагіни', 'плагінів')}: ${list}.`],
  [/^(.+): (\d+) plugin updates?$/, (name, count) => `${name}: ${count} ${plural(n(count), 'оновлення плагіна', 'оновлення плагінів', 'оновлень плагінів')}`],
];

// The text in the page's language: Ukrainian on a page whose <html lang> is "uk", else as it is.
export function translate(text, lang = globalThis.document?.documentElement?.lang) {
  return lang === 'uk' ? ukrainian(text) : text;
}

function ukrainian(text) {
  if (typeof text !== 'string') return text;
  const exact = UK.get(text);
  if (exact !== undefined) return exact;
  for (const [pattern, make] of RULES) {
    const match = pattern.exec(text);
    if (match) return make(...match.slice(1));
  }
  return text;
}

export const ukrainianTexts = UK;
