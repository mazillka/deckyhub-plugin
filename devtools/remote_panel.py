"""The Paired devices page and the remote-install panel markup that the plugin pages and the site share."""

from html import escape

import remote_page_uk
from page_shell import SITE, PageSpec, page
from plugin_badges import NOT_REVIEWED


def remote_device_panel(lang: str = "en") -> str:
    # data-state (set by remote-install.js) picks what the page shows: new, connecting, approve, unreachable,
    # unsupported, error or paired; see remote-install.css.
    html = """<section id="remote-install" class="remote-install remote-device-dashboard" aria-labelledby="remote-title" data-plugin-id="" data-state="new" data-has-devices="false">
<link rel="stylesheet" href="/remote-install.css">
<header class="rd-hero">
<p class="rd-badge">Experimental · fully local</p>
<h2 id="remote-title">Manage your devices from this browser</h2>
<p>Install, update and remove Decky plugins without picking up your device. This page talks straight to your device on your network: nothing about your device or its plugins is collected or sent anywhere. <a href="/help.html#remote">How it works</a></p>
<p class="rd-app" id="remote-app" hidden><button type="button" id="remote-app-install">Add to home screen or desktop</button> <span class="rd-hint">Opens this page as an app of its own, with its own icon and window. Nothing else is installed.</span></p>
</header>
<div class="rd-layout">
<aside class="rd-devices" aria-labelledby="rd-devices-title">
<div class="rd-devices-head"><h3 id="rd-devices-title">Your devices</h3><span class="rd-devices-actions"><button type="button" id="remote-devices-refresh">Refresh</button> <button type="button" id="remote-pair-another" class="btn">+ Add device</button></span></div>
<ul id="remote-device-cards" class="rd-cards" aria-label="Paired devices"></ul>
<div class="rd-share">
<button type="button" id="remote-share-button" class="btn">Pair another browser with a link</button>
<p id="remote-share-status" class="rd-hint" role="status" aria-live="polite" hidden></p>
<div id="remote-share-box" hidden>
<p class="rd-hint">Open this link in the other browser (Chrome or Edge, on the same Wi-Fi). It works once, for five minutes, and your device asks you to approve that browser.</p>
<p class="rd-link-row"><label for="remote-share-link">Link for the other browser</label><span class="remote-actions"><input id="remote-share-link" type="text" readonly spellcheck="false"><button type="button" id="remote-share-copy">Copy link</button><button type="button" id="remote-share-send" hidden>Share link</button></span></p>
</div>
</div>
<p class="rd-empty">No device yet. Press Add device to connect your first one.</p>
<div class="rd-sr"><label for="remote-device-picker">Selected device</label><select id="remote-device-picker" disabled><option value="">Pair a device</option></select></div>
<details class="rd-multi">
<summary>Using more than one device?</summary>
<ul>
<li><strong>Several Decks in one browser:</strong> press <em>Add device</em> and repeat the steps for each Deck. They all stay in the list above.</li>
<li><strong>One Deck in several browsers:</strong> open this page on your phone and on your laptop and pair each of them with the Deck. Every browser is approved separately on the Deck, and you can remove any of them under Paired browsers in DeckyHub.</li>
</ul>
</details>
</aside>
<div class="rd-main">
<p id="remote-status" role="status" aria-live="polite" class="rd-status">Not connected.</p>
<div class="rd-device">
<p class="remote-actions"><button type="button" id="remote-request" disabled hidden>Send install request</button> <button type="button" id="remote-cancel" disabled>Cancel request</button></p>
</div>
<section class="remote-inventory" aria-labelledby="remote-plugins-title">
<div class="rd-inv-head">
<h3 id="remote-plugins-title">Installed plugins</h3>
<p class="remote-actions"><a class="btn" href="/plugins/">Browse plugins to install</a> <button type="button" id="remote-plugins-refresh" disabled>Refresh list</button></p>
</div>
<p id="remote-plugins-status" role="status" aria-live="polite">Pair a device to see its installed plugins.</p>
<p><input id="remote-plugins-filter" type="search" aria-label="Search installed plugins" placeholder="Search installed plugins" autocomplete="off" hidden></p>
<ul id="remote-plugins" class="remote-plugins"></ul>
</section>
</div>
</div>
<dialog id="remote-add-dialog" class="rd-dialog" aria-labelledby="remote-add-title">
<div class="rd-dialog-head"><h3 id="remote-add-title">Add a device</h3><button type="button" id="remote-add-close" class="rd-close" aria-label="Close">×</button></div>
<div class="rd-dialog-body">
<p id="remote-dialog-status" role="status" aria-live="polite" class="rd-status" hidden></p>
<div class="rd-pairing" id="remote-pairing">
<div class="rd-pairing-head">
<p class="rd-wifi"><span aria-hidden="true">⚑</span> Both devices must be on the <strong>same Wi-Fi</strong> (not mobile data, not a guest network).</p>
</div>
<ol class="rd-steps" aria-label="Pairing steps">
<li>
<span class="rd-dot" aria-hidden="true">1</span>
<div><span class="rd-where">On your Steam Deck</span><strong>Turn on Remote access</strong><small>Open DeckyHub in the Quick Access menu and switch on <em>Remote access</em>. A QR code appears.</small></div>
</li>
<li>
<span class="rd-dot" aria-hidden="true">2</span>
<div><span class="rd-where">On this device</span><strong>Scan the QR code</strong><small>Point the camera at the QR code and open the link. No camera? Paste the link below.</small>
<div id="remote-scan" class="rd-scan" hidden>
<p class="remote-actions"><button type="button" id="remote-scan-button">Scan the QR code with this device's camera</button><button type="button" id="remote-scan-stop" hidden>Stop the camera</button></p>
<p id="remote-scan-status" class="rd-hint" role="status" aria-live="polite" hidden></p>
<video id="remote-scan-video" playsinline muted hidden></video>
</div>
</div>
</li>
<li>
<span class="rd-dot" aria-hidden="true">3</span>
<div><span class="rd-where">On your Steam Deck</span><strong>Press Approve</strong><small>A pairing request appears under <em>Remote control</em>. Press <em>Approve</em>.</small></div>
</li>
</ol>
<ul id="remote-trouble" class="rd-trouble">
<li>Allow local network access when your browser asks. In Chrome: menu, Settings, Site settings, Local network, then set deckyhub.com to Allow.</li>
<li>Check that Remote access is on and that your device is awake: it stops listening when it sleeps.</li>
<li>Use the same Wi-Fi as your device, not mobile data, a guest network or a VPN. Turn off mobile data while you pair.</li>
<li>If your router has "AP isolation" or "client isolation", it stops phones from reaching other devices: turn it off for this network.</li>
<li>Your router may have given the device a new address: open the Quick Access tab to see it, or pair again.</li>
<li>To tell the network from the browser, open https://the-device-address:8765/ in this browser. "Refused to connect" at once means the network is fine; a long wait means this browser can't reach the device.</li>
<li>Still stuck? Try Chrome or Edge on a computer on the same Wi-Fi, and send the details below with your bug report.</li>
</ul>
<details id="remote-diagnostics" class="rd-diagnostics" hidden>
<summary>Technical details for a bug report</summary>
<pre id="remote-diagnostics-text"></pre>
<p><button type="button" id="remote-copy-diagnostics">Copy details</button></p>
</details>
<form id="remote-pair-form" aria-labelledby="remote-pair-title">
<h3 id="remote-pair-title">No camera or QR code? Paste the link</h3>
<p class="rd-hint">Scanning the QR code fills these in and pairs by itself. Use them to paste a link, or to try again.</p>
<p class="rd-link-row"><label for="remote-pairing-link">Pairing link</label><span class="remote-actions"><input id="remote-pairing-link" type="text" autocomplete="off" spellcheck="false" placeholder="Paste the link from DeckyHub"><button type="button" id="remote-copy-link">Copy link</button></span></p>
<p><label for="remote-code">Six-digit pairing code</label><input id="remote-code" autocomplete="off" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></p>
<details id="remote-manual">
<summary>More options: connection details, device name</summary>
<p><label for="remote-address">Device address and port</label><input id="remote-address" placeholder="192.168.1.50:8765" autocomplete="off"></p>
<p><label for="remote-fingerprint">Certificate fingerprint</label><input id="remote-fingerprint" autocomplete="off" spellcheck="false"></p>
<p><label for="remote-device-name">Device name (optional)</label><input id="remote-device-name" maxlength="64" autocomplete="off" placeholder="Living room Deck"></p>
<p><label for="remote-name">Browser name shown on your device</label><input id="remote-name" value="Browser" maxlength="64"></p>
<p><button type="button" id="remote-reconnect" hidden>Use new device address</button></p>
<p><button type="button" id="remote-forget" hidden>Forget this device in this browser</button></p>
</details>
<button type="submit" id="remote-pair" disabled>Pair browser</button>
</form>
</div>
</div>
</dialog>
<noscript>Enable JavaScript to connect to your device.</noscript>
<link rel="modulepreload" href="/remote-core.js"><link rel="modulepreload" href="/remote-i18n.js"><link rel="modulepreload" href="/remote-plugins.js"><link rel="modulepreload" href="/remote-updates.js"><link rel="modulepreload" href="/remote-scan.js"><link rel="modulepreload" href="/remote-share.js"><link rel="modulepreload" href="/remote-session.js"><link rel="modulepreload" href="/remote-devices.js"><link rel="modulepreload" href="/remote-pairing.js"><link rel="modulepreload" href="/remote-request.js"><script type="module" src="/remote-install.js"></script>
</section>"""
    return remote_page_uk.translate(html) if lang == "uk" else html


def safety_block(items: list[str] | None) -> str:
    """Warnings and scan results for the card that sends a plugin to a device (shown even when there is nothing to warn about)."""
    listed = (
        "<ul class='badges'>" + "".join(items) + "</ul>"
        if items
        else "<p>No badges: it doesn't run as root, and no audit warnings or virus scan findings are known for it.</p>"
    )
    return '<div class="rc-safety">' + listed + f'<p class="note">{NOT_REVIEWED}</p></div>\n'


def remote_install_picker(plugin_id: str, safety: list[str] | None = None) -> str:
    """The card that sends the plugin to a paired device. `safety` is what the page's Safety information lists
    (runs as root, audit warnings, virus scans): it is shown above the button, as the device shows it before an
    install, so it is read before anything is sent."""
    # data-state (remote-install.js): checking, none (no device to send to), ready, waiting (for approval on the
    # device), installing, done, failed; see remote-install.css.
    return f"""<dialog id="remote-install" class="remote-install remote-compact rd-dialog" aria-labelledby="remote-send-title" data-plugin-id="{escape(plugin_id, quote=True)}" data-state="checking">
<link rel="stylesheet" href="/remote-install.css">
<div class="rd-dialog-head"><h3 id="remote-send-title">Install on your device</h3><span class="rd-badge">Experimental · fully local</span><button type="button" id="remote-close" class="rd-close" aria-label="Close">×</button></div>
<div class="rd-dialog-body">
<div class="remote-actions rc-send">
<select id="remote-device-picker" aria-label="Paired device" disabled><option value="">Select a device</option></select>
<button type="button" id="remote-request" disabled>Send to device</button>
<button type="button" id="remote-cancel" disabled>Cancel</button>
</div>
<p id="remote-status" class="rd-status" role="status" aria-live="polite" hidden></p>
<dialog id="remote-risk-dialog" class="rd-dialog" aria-labelledby="remote-risk-title">
<div class="rd-dialog-head"><h3 id="remote-risk-title">Check before you send</h3><button type="button" id="remote-risk-close" class="rd-close" aria-label="Close">×</button></div>
<div class="rd-dialog-body">
{safety_block(safety)}<p class="remote-actions"><button type="button" id="remote-risk-send">I understand the risks, send it</button><button type="button" id="remote-risk-cancel">Cancel</button></p>
</div>
</dialog>
<p class="rc-pair"><button type="button" id="remote-refresh" hidden>Refresh</button><a id="remote-pair-new" class="btn" href="/remote-install/">Pair a device</a><span>Pair once, then install from any plugin page.</span></p>
<p class="rd-hint">Your browser talks straight to your device on your network. Nothing about your device or its plugins is collected or sent anywhere. <a href="/help.html#remote">How to use it</a></p>
</div>
<link rel="modulepreload" href="/remote-core.js"><link rel="modulepreload" href="/remote-i18n.js"><link rel="modulepreload" href="/remote-plugins.js"><link rel="modulepreload" href="/remote-updates.js"><link rel="modulepreload" href="/remote-scan.js"><link rel="modulepreload" href="/remote-share.js"><link rel="modulepreload" href="/remote-session.js"><link rel="modulepreload" href="/remote-devices.js"><link rel="modulepreload" href="/remote-pairing.js"><link rel="modulepreload" href="/remote-request.js"><script type="module" src="/remote-install.js"></script>
</dialog>"""


def paired_devices_page(
    shell: dict[str, str],
    title: str = "Paired devices | DeckyHub",
    description: str = "Pair a device and manage its installed Decky plugins.",
    lang: str = "en",
    path: str = "remote-install/",
) -> str:
    uk = lang == "uk"
    body = f"<h1>{'Сполучені пристрої' if uk else 'Paired devices'}</h1>" + remote_device_panel(lang)
    # The same page in the other language, for the menu's language link and for search engines.
    base = path.removeprefix("uk/")
    other = SITE + (base if uk else "uk/" + base)
    # An installable app (docs/remote-install/manifest.webmanifest, sw.js), scoped to this page.
    app = [
        '<link rel="manifest" href="/remote-install/manifest.webmanifest">',
        '<link rel="apple-touch-icon" href="/icon-192.png">',
        '<meta name="mobile-web-app-capable" content="yes">',
    ]
    app.append(f'<link rel="alternate" hreflang="{"en" if uk else "uk"}" href="{other}">')
    switch = ("English", other, "en") if uk else ("Українська", other, "uk")
    spec = PageSpec(title, description, path, body, app, current="paired-devices", lang=lang, switch=switch)
    return page(shell, spec)
