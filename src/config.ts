/** Baked-in app credentials.
 *  - OAuth client id: public identifier (Sign in with Google standard).
 *  - Maps key: NOT committed (GitHub push protection flags AIza… patterns even
 *    for referrer-restricted browser keys). It is injected at build time from
 *    the repo Actions variable VITE_MAPS_API_KEY; local dev reads .env.local.
 *  Users never enter anything; ⚙ settings only OVERRIDE these.
 *  GCP project: gtimeline-506214 (owner icedac@gmail.com) */
export const DEFAULT_MAPS_KEY = ''
export const DEFAULT_CLIENT_ID = '228617515680-0oe21hltieim0jvsgmvpp8nf8sejl7od.apps.googleusercontent.com'
