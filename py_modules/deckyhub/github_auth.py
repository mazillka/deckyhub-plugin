"""Sign in to GitHub with the device flow, so nobody has to create and type a token on a handheld.

DeckyHub asks GitHub for a short code, shows it, and the user enters it on github.com/login/device on any device
and approves. DeckyHub polls until GitHub hands over a token, which goes to the frontend like a token read from a
file (it saves it as the GitHub token setting). No scope is asked for: the token only reads public data, which is
all DeckyHub needs, and only lifts the rate limit.

Needs an OAuth app's Client ID with the device flow enabled (GITHUB_CLIENT_ID below). There is no secret: the
device flow doesn't use one. Without an ID the feature is off and the frontend shows no button for it.
"""

import asyncio
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request

import decky

from .net import OPENER

# The OAuth app's Client ID (public). See CONTRIBUTING.md, "GitHub sign-in".
GITHUB_CLIENT_ID = ""
DEVICE_CODE_URL = "https://github.com/login/device/code"
TOKEN_URL = "https://github.com/login/oauth/access_token"
VERIFICATION_PREFIX = "https://github.com/login/device"
_TOKEN = re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}")
_USER_CODE = re.compile(r"[A-Z0-9-]{4,20}")


def _post(url: str, fields: dict[str, str]) -> dict:
    request = Request(
        url,
        data=urlencode(fields).encode(),
        headers={
            "Accept": "application/json",
            "User-Agent": "DeckyHub",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with OPENER.open(request, timeout=15) as response:
            data = json.loads(response.read(64 * 1024))
    except (HTTPError, URLError, OSError, ValueError) as error:
        # Only the kind of failure is logged: a response may hold a code or token.
        decky.logger.warning("GitHub sign-in request failed: %s", type(error).__name__)
        raise ValueError("Couldn't reach GitHub. Check the connection and try again.") from error
    if not isinstance(data, dict):
        raise ValueError("GitHub gave an unexpected answer")
    return data


class GithubAuthMixin:
    _device_flow: dict | None = None

    async def start_github_sign_in(self):
        if not GITHUB_CLIENT_ID:
            raise ValueError("GitHub sign-in isn't set up in this version of DeckyHub")
        data = await asyncio.to_thread(_post, DEVICE_CODE_URL, {"client_id": GITHUB_CLIENT_ID, "scope": ""})
        code, user_code, uri = data.get("device_code"), data.get("user_code"), data.get("verification_uri")
        expires, interval = data.get("expires_in"), data.get("interval", 5)
        if (
            not isinstance(code, str)
            or not code
            or not isinstance(user_code, str)
            or not _USER_CODE.fullmatch(user_code)
            or not isinstance(uri, str)
            or not uri.startswith(VERIFICATION_PREFIX)
            or type(expires) is not int
            or not 0 < expires <= 3600
            or type(interval) is not int
        ):
            raise ValueError(str(data.get("error_description") or "GitHub gave an unexpected answer"))
        interval = min(max(interval, 5), 60)
        # The device code never leaves the backend: the frontend only gets what the user needs to see.
        self._device_flow = {"device_code": code, "expires_at": time.monotonic() + expires, "interval": interval}
        return {"userCode": user_code, "verificationUri": uri, "expiresIn": expires, "interval": interval}

    async def poll_github_sign_in(self):
        flow = self._device_flow
        if not flow:
            return {"status": "none"}
        if time.monotonic() >= flow["expires_at"]:
            self._device_flow = None
            return {"status": "expired"}
        data = await asyncio.to_thread(
            _post,
            TOKEN_URL,
            {
                "client_id": GITHUB_CLIENT_ID,
                "device_code": flow["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        token = data.get("access_token")
        if token is not None:
            self._device_flow = None
            if not isinstance(token, str) or not _TOKEN.fullmatch(token):
                raise ValueError("GitHub gave an unexpected token")
            decky.logger.info("Signed in to GitHub")
            return {"status": "signed-in", "token": token}
        error = data.get("error")
        if error == "authorization_pending":
            return {"status": "pending", "interval": flow["interval"]}
        if error == "slow_down":
            asked = data.get("interval")
            flow["interval"] = min(
                asked if type(asked) is int and asked > flow["interval"] else flow["interval"] + 5, 60
            )
            return {"status": "pending", "interval": flow["interval"]}
        self._device_flow = None
        if error == "expired_token":
            return {"status": "expired"}
        if error == "access_denied":
            return {"status": "denied"}
        decky.logger.warning("GitHub sign-in ended: %s", error if isinstance(error, str) else "no reason given")
        raise ValueError(
            "GitHub sign-in isn't turned on for this app (device flow)"
            if error == "device_flow_disabled"
            else "GitHub sign-in failed"
        )

    async def cancel_github_sign_in(self):
        self._device_flow = None
        return {"cancelled": True}
