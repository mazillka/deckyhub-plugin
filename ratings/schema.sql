-- DeckyHub's community ratings (Cloudflare D1, which is SQLite).
-- One row per device and plugin: rating again replaces it, and a device can withdraw it.
CREATE TABLE IF NOT EXISTS ratings (
  plugin  TEXT    NOT NULL,           -- owner/name of the plugin's repository, lowercase
  device  TEXT    NOT NULL,           -- a random id the device made up; it is linked to nothing
  stars   INTEGER CHECK (stars BETWEEN 1 AND 5),
  works   INTEGER CHECK (works IN (0, 1)),  -- "works on my device" (1) or "doesn't work" (0)
  version TEXT,
  updated INTEGER NOT NULL,           -- milliseconds since 1970
  PRIMARY KEY (plugin, device),
  CHECK (stars IS NOT NULL OR works IS NOT NULL)
);

-- How many requests each hashed address or device made in an hour: the rate limit, and nothing else.
-- The address is never stored, only a hash of it with a secret and the day, and rows are deleted after two days.
CREATE TABLE IF NOT EXISTS hits (
  key    TEXT    NOT NULL,
  window INTEGER NOT NULL,            -- hours since 1970
  n      INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
CREATE INDEX IF NOT EXISTS hits_window ON hits (window);
