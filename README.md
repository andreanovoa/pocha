# Pocha

Scoreboard for *la pocha*, the Spanish card game played with the Spanish deck. It runs at <https://andreanovoa.github.io/pocha/> and installs as an app on phones and tablets.

The page is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves this repository at `/pocha/`, so every asset path starts with `/pocha/`.

| File | Contents |
|---|---|
| `index.html` | the page |
| `app.js`, `app.css` | the scoreboard |
| `i18n.js` | Spanish and English text |
| `cloud.js`, `firebase-config.js` | optional accounts: sign-in, saved games and statistics |
| `sw.js`, `manifest.webmanifest`, `icons/` | the installable app; bump `CACHE` in `sw.js` when the files change |
| `firestore.rules` | the Firestore security rules |

To try it locally, serve the folder that contains this repository, so that `/pocha/` resolves:

```bash
cd .. && python3 -m http.server 8000
```

then open <http://localhost:8000/pocha/>.

## Accounts: Firebase setup

The scoreboard works with no backend. Accounts switch on once `firebase-config.js` holds a Firebase web config; until then the *Stats* tab stays hidden.

Everything below fits in Firebase's free Spark plan.

1. **Create the project.** Go to <https://console.firebase.google.com>, then
   *Add project*. Google Analytics is not needed.
2. **Register a web app.** Open *Project settings → General → Your apps → Web*
   (`</>`). Copy the `apiKey`, `authDomain`, `projectId` and `appId` values into
   `firebase-config.js`. They are public by design: the
   Firestore rules are what protect the data.
3. **Turn on sign-in.** Go to *Build → Authentication → Sign-in method*:
   - enable **Google**;
   - enable **Email/Password** and, inside it, **Email link (passwordless
     sign-in)**.
4. **Authorise the site.** Under *Authentication → Settings → Authorized
   domains*, add `andreanovoa.github.io`. `localhost` is already there for
   local testing.
5. **Create the database.** Go to *Build → Firestore Database → Create
   database*, start in **production mode** and pick a location such as
   `eur3`.
6. **Publish the rules.** In *Firestore → Rules*, paste the contents of
   [`firestore.rules`](firestore.rules) and press *Publish*. With the
   Firebase CLI you can run `firebase deploy --only firestore:rules` instead.
7. **Index.** The game list sorts on one field, so no composite index is
   needed.
8. **Let Google send sign-ins back to this site.** Safari, Brave and the
   installed iOS app block the default sign-in, which returns through
   `<project>.firebaseapp.com`. So the website's deploy workflow
   (`.github/workflows/hugo.yml` in `andreanovoa/andreanovoa.github.io`) copies
   Firebase's sign-in helper into `/__/auth/` at the root of the domain, and `authDomain` in `firebase-config.js` is
   `andreanovoa.github.io`. For Google to accept that, open
   <https://console.cloud.google.com/apis/credentials>, pick the project,
   open **Web client (auto created by Google Service)** and add:
   - Authorized JavaScript origins: `https://andreanovoa.github.io`
   - Authorized redirect URIs: `https://andreanovoa.github.io/__/auth/handler`

   If the Firebase project ever changes, update `base=` in the workflow step
   *Self-host the Firebase sign-in helper for Pocha* as well.

## Current project

- Firebase project: `pocha-37f93` (Spark plan, no billing)
- Console: <https://console.firebase.google.com/project/pocha-37f93>

## Troubleshooting

| Error | Fix |
| --- | --- |
| `auth/configuration-not-found` | Authentication not started, or the provider is off (step 3). |
| `auth/unauthorized-domain` | Add `andreanovoa.github.io` to Authorized domains (step 4). |
| `missing initial state` | Sign-in went through `firebaseapp.com`; check step 8. |
| `redirect_uri_mismatch` | The redirect URI in step 8 is missing or mistyped. |
| `permission-denied` when saving | The Firestore rules are not published (step 6). |

## Data layout

```
users/{uid}/games/{gameId}
  startedAt    ISO string
  finishedAt   ISO string or null
  finished     bool
  players      [names in seating order]
  firstDealer  seat index
  repeatMiddle bool
  rounds       [cards per round]
  results      [{ cards, dealer, bids: [...], won: [...] }]
  savedAt      server timestamp
```

`gameId` is generated in the browser when a game starts, so saving the
same game again overwrites it instead of creating a duplicate. The
statistics are computed in the browser from the account's saved games.
