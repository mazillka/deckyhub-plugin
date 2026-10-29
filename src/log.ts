import { logFrontend } from "./api";

// GitHub's REST API is what every fetch in this file hits — unauthenticated
// by default, so a 403/429 here is almost always its rate limit (60 req/hr
// for the core API, 10/min for search; 5,000/hr and 30/min once a token is
// set), not a real access error. The raw "GitHub API returned 403" that
// used to surface gave no indication of that, so pull whatever wait-time
// hint the response actually offers (some responses omit these headers
// entirely — that's fine, the message just degrades to a generic one)
// instead of guessing, and nudge toward adding a token when none is set.
// Writes to DeckyHub's backend log (see Export Logs); never throws.
export const log = (message: string) => void logFrontend(message).catch(() => undefined);
