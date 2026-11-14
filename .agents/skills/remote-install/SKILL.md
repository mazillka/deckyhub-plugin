---
name: remote-install
description: Work on Remote Install (Remote control) - the device-side listener, the requests a paired browser can make (install, update, uninstall, enable, disable), the Quick Access and window UI, the Paired devices website page with its Ukrainian version and app, and their tests. Use when adding or changing a remote action or message, the pairing flow, the Paired devices page, or anything a paired browser can ask the device to do.
---

# Remote Install

A browser on the same network pairs with the device once, then asks it to manage plugins. The device owner approves each request on the device (a Trusted browser skips that). AGENTS.md has the architecture paragraph; this is what you need to change it safely.

## Where things are

| Piece | Files |
| --- | --- |
| Listener (QUIC/WebTransport, pinned certificate) | `py_modules/deckyhub/remote_install_transport.py`, `remote_install_store.py` |
| Rules and state | `remote_install_service.py` (authorizes every op), `remote_install_queue.py` (one request's life: pending, approved, installing, a terminal state), `remote_install.py` (RPCs for the frontend) |
| Device UI | `src/components/RemoteInstallSection.tsx` (Quick Access), `RemoteModals.tsx` (pairing and Paired browsers windows), `remoteRequests.tsx`, `RemotePluginUninstall.tsx`, `RemotePluginToggle.tsx`, `src/remoteRunner.ts` |
| Website | `docs/remote-install.js` (pairing, requests), `remote-plugins.js` (installed list, plugin packs), `remote-updates.js` (update notices, app install), `remote-install.css`, `docs/remote-install/` (manifest, service worker), markup in `devtools/plugin_pages.py` |
| Ukrainian page | `devtools/remote_page_uk.py` (markup, checked at build), `docs/remote-i18n.js` (what the scripts write) |
| Mock and tests | `devtools/decky-mock/dev-server.py` (fake listener, `mock_remote_browser_*` routes), `devtools/decky-mock/e2e/remote-install.spec.ts`, `tests/test_remote_*.py`, `tests/remote-*.test.js` |

## What a browser can ask

Messages: `pair` (the browser may send `browserId`, a random id it keeps per device: the same id pairing again replaces its old entry once approved), `pair_status`, `pair_link` (a paired browser asks for a one-time pairing link, 5 minutes, token only; the owner still approves the new browser), `plugins` (installed list, 20 a page, with `disabled`), `request`, `status`, `cancel`, `summary` (the plugins with an update waiting, as the device's frontend last reported them, memory only). A request is an `action`: `install`, `update`, `uninstall` (by registry id or, for a plugin the registry can't vouch for, by its Decky name), `enable` or `disable` (one request names up to 50 plugins by Decky name: that is how a plugin pack is switched, with one approval). Enable and disable use Decky Loader's own `utilities/enable_plugin` / `disable_plugin` and verify the result in Decky's `settings/loader.json`.

The queue allows one claimed request at a time. A request expires two minutes after it arrives or is approved. A request from a browser that isn't Trusted wakes the device's frontend (`remote_pending_request`) so it can put the confirmation in front of the owner; a Trusted browser's request runs at once (`remote_trusted_request`).

## Rules that must not break

- No remote operation changes trust, DeckyHub's settings or the registry. Trust is set only by the local `set_remote_device_trusted` after a warning.
- DeckyHub itself is never installed, updated, removed or switched remotely.
- Every identity is checked again when the request is claimed, not only when it arrives; a plugin that changed in between fails the request.
- Remote access (the listener) is off by default and nothing listens while it is off. Nothing about a device is sent anywhere outside the local network, and the update summary is memory only.
- Messages stay under 16 KB; lists are capped.
- Changes are additive: an older device answers a new action with an error, an older site ignores a new field.

## Adding an action

1. Queue: add it to `_ACTIONS`, its terminal status to `_TERMINAL` and `transition_local`, and its fields to `InstallRequest`.
2. Service: accept it in `_remote`, identify its plugins the way `_snapshot_installed_name` does, check again in `claim`, map it in `finish`.
3. Device: dispatch it in `remoteRequests.tsx` with a confirmation like the others, add the type to `src/types.ts` and `src/api.ts`, a label in `RemoteInstallSection.tsx`, and strings in every locale (see the `localization` skill).
4. Site: statuses and messages in `remote-install.js`, buttons in `remote-plugins.js`, the Ukrainian text in `remote-i18n.js` (a test fails on a sentence without one) and, for markup, `remote_page_uk.py`.
5. Tests: the service and queue tests, an e2e test through the mock, and a look on a real device (`deck-test`: the `windows` scenario for any new window).

## The Paired devices page

Adding a device is a `<dialog>`; the page behind it is the device list and the installed plugins. It installs as an app (manifest and service worker scoped to `/remote-install/`; the worker only keeps a copy for offline) and, with permission, notifies about updates while the page or app is open: there is no server, so a closed app cannot reach a device on the user's Wi-Fi, and real push would need one (a privacy decision for the owner, not something to add quietly). The page exists in English at `/remote-install/` and `/paired-devices/` and in Ukrainian under `/uk/`; `build-site.py` writes them from `plugin_pages.write_pages`.
