"""The Paired devices page in Ukrainian (deckyhub.com/uk/paired-devices/).

The page's markup is written once, in English (plugin_pages.remote_device_panel); this table turns each of its texts into
Ukrainian. Every English text must still be in the markup, so changing a sentence there without changing it here fails
the build instead of leaving English on the Ukrainian page. The texts the page's script writes are translated in
docs/remote-i18n.js.
"""

PANEL = [
    ("Experimental · fully local", "Експериментально · повністю локально"),
    ("Manage your devices from this browser", "Керуйте своїми пристроями з цього браузера"),
    (
        "Install, update and remove Decky plugins without picking up your device. This page talks straight to your device on your network: nothing is collected or sent anywhere. "
        '<a href="/help.html#remote">How it works</a>',
        "Встановлюйте, оновлюйте й видаляйте плагіни Decky, не торкаючись пристрою. Ця сторінка спілкується напряму з вашим пристроєм у вашій мережі: нічого не збирається й нікуди не надсилається. "
        '<a href="/uk/help.html#remote">Як це працює</a>',
    ),
    (">Your devices<", ">Ваші пристрої<"),
    ("+ Add device", "+ Додати пристрій"),
    ('aria-label="Paired devices"', 'aria-label="Сполучені пристрої"'),
    (
        "No device yet. Press Add device to connect your first one.",
        "Пристрою ще немає. Натисніть «Додати пристрій», щоб підключити перший.",
    ),
    (">Selected device<", ">Вибраний пристрій<"),
    (">Pair a device</option>", ">Додати пристрій</option>"),
    ("Using more than one device?", "Кілька пристроїв?"),
    (
        "<strong>Several Decks in one browser:</strong> press <em>Add device</em> and repeat the steps for each Deck. They all stay in the list above.",
        "<strong>Кілька Steam Deck в одному браузері:</strong> натисніть <em>Додати пристрій</em> і повторіть кроки для кожного. Усі вони лишаються в списку вище.",
    ),
    (
        "<strong>One Deck in several browsers:</strong> open this page on your phone and on your laptop and pair each of them with the Deck. Every browser is approved separately on the Deck, and you can remove any of them under Paired browsers in DeckyHub.",
        "<strong>Один Steam Deck у кількох браузерах:</strong> відкрийте цю сторінку на телефоні й на ноутбуці та з’єднайте кожен із пристроєм. Кожен браузер схвалюється на пристрої окремо, а видалити будь-який можна в розділі «З’єднані браузери» в DeckyHub.",
    ),
    ("Not connected.", "Не підключено."),
    ("Add a device", "Додати пристрій"),
    ('aria-label="Close"', 'aria-label="Закрити"'),
    (
        "Both devices must be on the <strong>same Wi-Fi</strong> (not mobile data, not a guest network).",
        "Обидва пристрої мають бути в <strong>одній мережі Wi-Fi</strong> (не мобільний інтернет і не гостьова мережа).",
    ),
    ('aria-label="Pairing steps"', 'aria-label="Кроки сполучення"'),
    ("On your Steam Deck", "На вашому Steam Deck"),
    ("On this device", "На цьому пристрої"),
    ("Turn on Remote access", "Увімкніть віддалений доступ"),
    (
        "Open DeckyHub in the Quick Access menu and switch on <em>Remote access</em>. A QR code appears.",
        "Відкрийте DeckyHub у меню швидкого доступу й увімкніть <em>Віддалений доступ</em>. З’явиться QR-код.",
    ),
    ("Scan the QR code", "Відскануйте QR-код"),
    (
        "Point the camera at the QR code and open the link. No camera? Paste the link below.",
        "Наведіть камеру на QR-код і відкрийте посилання. Немає камери? Вставте посилання нижче.",
    ),
    ("Press Approve", "Натисніть «Підтвердити»"),
    (
        "A pairing request appears under <em>Remote control</em>. Press <em>Approve</em>.",
        "Запит на сполучення з’явиться в розділі <em>Віддалене керування</em>. Натисніть <em>Підтвердити</em>.",
    ),
    (
        "Allow local network access when your browser asks.",
        "Дозвольте доступ до локальної мережі, коли браузер запитає.",
    ),
    ("Check that Remote access is on, on your device.", "Перевірте, що на пристрої ввімкнено віддалений доступ."),
    (
        "Use the same Wi-Fi as your device, not mobile data or a guest network.",
        "Використовуйте ту саму мережу Wi-Fi, що й пристрій, а не мобільний інтернет чи гостьову мережу.",
    ),
    (
        "Your router may have given the device a new address: open the Quick Access tab to see it, or pair again.",
        "Роутер міг дати пристрою нову адресу: відкрийте вкладку швидкого доступу, щоб її побачити, або з’єднайтеся знову.",
    ),
    ("No camera or QR code? Paste the link", "Немає камери чи QR-коду? Вставте посилання"),
    (
        "Scanning the QR code fills these in and pairs by itself. Use them to paste a link, or to try again.",
        "Сканування QR-коду заповнює це й сполучає саме. Скористайтеся цим, щоб вставити посилання або спробувати ще раз.",
    ),
    (">Pairing link<", ">Посилання для сполучення<"),
    ('placeholder="Paste the link from DeckyHub"', 'placeholder="Вставте посилання з DeckyHub"'),
    (">Copy link<", ">Копіювати посилання<"),
    ("Six-digit pairing code", "Шестицифровий код сполучення"),
    ("More options: connection details, device name", "Більше: дані підключення, назва пристрою"),
    (">Device address and port<", ">Адреса й порт пристрою<"),
    (">Certificate fingerprint<", ">Відбиток сертифіката<"),
    (">Device name (optional)<", ">Назва пристрою (необов’язково)<"),
    ('placeholder="Living room Deck"', 'placeholder="Deck у вітальні"'),
    ("Browser name shown on your device", "Назва браузера, яку видно на пристрої"),
    (">Use new device address<", ">Використати нову адресу пристрою<"),
    (">Forget this device in this browser<", ">Забути цей пристрій у цьому браузері<"),
    (">Pair browser<", ">Сполучити браузер<"),
    (">Send install request<", ">Надіслати запит на встановлення<"),
    (">Cancel request<", ">Скасувати запит<"),
    (">Installed plugins<", ">Встановлені плагіни<"),
    (">Browse plugins to install<", ">Переглянути плагіни для встановлення<"),
    (">Refresh list<", ">Оновити список<"),
    ("Pair a device to see its installed plugins.", "Додайте пристрій, щоб побачити його встановлені плагіни."),
    ("Switch a plugin pack on or off", "Увімкнути чи вимкнути пак плагінів"),
    (
        "Pick a DeckyHub plugin pack file. Its plugins that are installed on your device are switched together, with one approval on the device. Nothing is installed or removed.",
        "Виберіть файл пака плагінів DeckyHub. Його плагіни, встановлені на вашому пристрої, перемикаються разом, з одним підтвердженням на пристрої. Нічого не встановлюється й не видаляється.",
    ),
    ('aria-label="Plugin pack file"', 'aria-label="Файл пака плагінів"'),
    (">Enable pack<", ">Увімкнути пак<"),
    (">Disable pack<", ">Вимкнути пак<"),
    (
        'aria-label="Search installed plugins" placeholder="Search installed plugins"',
        'aria-label="Пошук серед встановлених плагінів" placeholder="Пошук серед встановлених плагінів"',
    ),
    ("Enable JavaScript to connect to your device.", "Увімкніть JavaScript, щоб підключитися до пристрою."),
]


def translate(html: str) -> str:
    """The panel in Ukrainian. Raises if a text of the English markup is no longer there."""
    for english, ukrainian in PANEL:
        if english not in html:
            raise ValueError(f"Ukrainian Paired devices page: this text is no longer in the markup: {english[:60]!r}")
        html = html.replace(english, ukrainian)
    return html
