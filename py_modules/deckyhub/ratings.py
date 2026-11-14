"""Community ratings: the user says whether a plugin works on their device and gives it stars.

Off until the user turns on Share ratings. A rating goes to DeckyHub's ratings Worker (ratings/ in this
repository) with a random id this device made up for itself: no account, name, address or Steam id. The
device keeps its own ratings, so the window can show them and take one back.
"""

import asyncio
import json
import re
import secrets
from urllib.error import URLError
from urllib.request import Request

import decky

from .net import OPENER
from .validation import REPOSITORY_NAME

RATINGS_API = "https://api.deckyhub.com/v1/rate"
DEVICE_ID_LENGTH = 43  # token_urlsafe(32): what the Worker accepts
MAX_MY_RATINGS = 1000
VERSION_MAX = 64


def coerce_device(value) -> str:
    return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{%d}" % DEVICE_ID_LENGTH, value) else ""


def coerce_my_ratings(values) -> dict:
    """The device's own ratings by repository: {stars?: 1-5, works?: bool}. Anything else is dropped."""
    if not isinstance(values, dict):
        return {}
    ratings = {}
    for repo, rating in values.items():
        if not (isinstance(repo, str) and REPOSITORY_NAME.fullmatch(repo) and isinstance(rating, dict)):
            continue
        item = {}
        if type(rating.get("stars")) is int and 1 <= rating["stars"] <= 5:
            item["stars"] = rating["stars"]
        if isinstance(rating.get("works"), bool):
            item["works"] = rating["works"]
        if item:
            ratings[repo] = item
    return dict(list(ratings.items())[:MAX_MY_RATINGS])


class RatingsMixin:
    def _rating_device(self) -> str:
        """This device's rating id, made up the first time it is needed and kept in settings.json."""
        device = coerce_device(self.settings.get("ratingDevice"))
        if not device:
            device = secrets.token_urlsafe(32)
            self.settings["ratingDevice"] = device
            self._save_settings()
        return device

    def _send_rating(self, method: str, body: dict) -> None:
        request = Request(
            RATINGS_API,
            data=json.dumps(body).encode(),
            method=method,
            headers={"Content-Type": "application/json", "User-Agent": "DeckyHub"},
        )
        with OPENER.open(request, timeout=15) as response:
            response.read(2048)

    async def rate_plugin(self, repo: str, version: str | None, stars: int | None, works: bool | None):
        """Sends (or replaces) this device's rating of a plugin. Needs Share ratings on."""
        if self.settings.get("shareRatings") is not True:
            raise ValueError("Share ratings is off")
        if not isinstance(repo, str) or not REPOSITORY_NAME.fullmatch(repo):
            raise ValueError("Repository must be owner/name")
        if stars is not None and not (type(stars) is int and 1 <= stars <= 5):
            raise ValueError("Stars are a whole number from 1 to 5")
        if works is not None and not isinstance(works, bool):
            raise ValueError("works is true or false")
        if stars is None and works is None:
            raise ValueError("Give stars, works, or both")
        body = {"plugin": repo, "device": self._rating_device()}
        if stars is not None:
            body["stars"] = stars
        if works is not None:
            body["works"] = works
        if isinstance(version, str) and 0 < len(version) <= VERSION_MAX:
            body["version"] = version
        try:
            await asyncio.to_thread(self._send_rating, "POST", body)
        except (OSError, URLError, ValueError) as error:
            decky.logger.warning("Could not send the rating for %s: %s", repo, error)
            return {"sent": False}
        item = {key: body[key] for key in ("stars", "works") if key in body}
        self.settings.setdefault("myRatings", {})[repo] = item
        self.settings["myRatings"] = coerce_my_ratings(self.settings["myRatings"])
        self._save_settings()
        decky.logger.info("Rated %s", repo)
        return {"sent": True, "rating": item}

    async def withdraw_rating(self, repo: str):
        """Takes this device's rating of a plugin back. It stays in the list until the Worker has confirmed."""
        if not isinstance(repo, str) or not REPOSITORY_NAME.fullmatch(repo):
            raise ValueError("Repository must be owner/name")
        if self.settings.get("shareRatings") is True and coerce_device(self.settings.get("ratingDevice")):
            try:
                await asyncio.to_thread(
                    self._send_rating, "DELETE", {"plugin": repo, "device": self.settings["ratingDevice"]}
                )
            except (OSError, URLError, ValueError) as error:
                decky.logger.warning("Could not take back the rating for %s: %s", repo, error)
                return {"removed": False}
        self.settings.setdefault("myRatings", {}).pop(repo, None)
        self._save_settings()
        return {"removed": True}
