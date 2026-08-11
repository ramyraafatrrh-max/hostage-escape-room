# Operation: Last Breath

A mobile-first, Firebase-backed escape-room game for four independent teams and one owner dashboard.

## Included

- Anonymous player registration, with one team record bound to that browser/device
- Private team view: a team can read only its own record
- Completely separate owner URL with email/password login and live monitoring
- Shared 60-minute server-based countdown
- Five missions, response submission, and manual owner marking
- Real-time progress bars through Cloud Firestore listeners
- Reset control for timer, submissions, and progress
- Static deployment suitable for GitHub Pages

## 1. Create the Firebase project

1. Open https://console.firebase.google.com and create a project.
2. In **Project settings > General**, add a **Web app**.
3. Copy the configuration values into `firebase-config.js`.
4. Open **Authentication > Sign-in method** and enable:
   - Anonymous
   - Email/Password
5. Open **Authentication > Users**, add one owner user, and use the same email in:
   - `app.js`, constant `OWNER_EMAIL`
   - `firestore.rules`, function `isOwner()`
6. Open **Firestore Database**, create the database in **Production mode**, then open **Rules**, paste `firestore.rules`, and click **Publish**.
7. In **Authentication > Settings > Authorized domains**, add your GitHub Pages host, for example `yourname.github.io`.

> Do not put the owner's password in the repository. The Firebase web configuration is designed to be present in front-end code; access control must remain in Firestore Security Rules.

## 2. Upload with the GitHub web interface

1. On GitHub, click **New repository**. Example name: `hostage-escape-room`.
2. Keep it public if you want free GitHub Pages on a standard account.
3. Open the repository and choose **Add file > Upload files**.
4. Open the extracted ZIP folder, select all files inside it, and drag them into GitHub. Do not upload only the ZIP.
5. Commit directly to the `main` branch.
6. Go to **Settings > Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Select branch `main`, folder `/ (root)`, then click **Save**.
9. Wait for deployment, then open the URL shown by GitHub Pages.

## 3. Run the game

1. On each team's designated master phone, open the site and enter a unique team name.
2. Keep that browser's site data intact. Anonymous authentication links the team to that browser.
3. On the owner device, open the private owner URL directly and sign in: `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/owner.html`. Do not distribute this URL to players.
4. Confirm that up to four teams appear.
5. Click **Start 60:00 timer** once all teams are ready.
6. Review submitted responses and mark each as **Correct** or **Incorrect**.
7. Use **Reset** only after the round. It clears responses and solved status for all teams.

## Important operational notes

- The UI displays the first four registered teams. Register exactly four master devices before starting.
- A player cannot view another team's Firestore document under the supplied rules.
- If a team clears browser storage or changes browser/device, it receives a new anonymous identity. The owner can delete the stale team document from Firestore.
- Correct answers are intentionally not stored in player-readable documents. This starter uses manual owner marking, preventing teams from inspecting browser code to reveal answers.
- For automatic answer validation later, use a Firebase callable Cloud Function or another trusted server endpoint. Never ship answer keys in front-end JavaScript.
- Replace task titles in the `TASKS` array in `app.js` when your final missions are ready.

## Local testing

Because JavaScript modules should be served over HTTP, do not double-click `index.html`. In a local terminal you can run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Add `localhost` to Firebase Authentication authorized domains if needed.

## Data model

```text
games/current
  status: waiting | running
  startedAt: Firestore timestamp
  durationSeconds: 3600

teams/{anonymousAuthUid}
  name
  ownerUid
  submissions.task1 ... task5
  solved.task1 ... task5
  createdAt
  updatedAt
```


## Separate player and owner links

- Player link: `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`
- Owner link: `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/owner.html`

The player page contains no button, menu, or link to the owner page. `owner.html` also includes a `noindex` directive to discourage search-engine indexing. The URL itself is not a security boundary: even if somebody guesses it, Firebase Authentication and Firestore Security Rules prevent access without the configured owner account. Keep the owner URL private and use a strong unique password.


## Hostage video and live start behavior

The player page includes `hostage-loop.mp4` and a poster image. Before Start, players see a waiting overlay and 60:00. When the owner starts, the Firestore listener removes the overlay, starts the muted inline video, and begins the synchronized countdown.


## Reset behavior

Reset now changes `games/current` to waiting and deletes every document in the `teams` collection. Each player device listens to its own team document; when that document is deleted, the device signs out of anonymous authentication and returns to team registration. Start changes the game document to running, which switches player devices from the waiting screen to the dungeon video and shows the synchronized timer both in the header and over the dungeon.
