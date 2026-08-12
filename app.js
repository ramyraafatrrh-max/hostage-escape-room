import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const TASKS = ["Mission 1", "Mission 2", "Mission 3", "Mission 4", "Mission 5"];
const ANSWERS = ["11117839", "56139", "793459", "85432", "reconciliation"];
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const $ = id => document.getElementById(id);
const screens = ["landing", "playerApp"];

let currentTeam = null;
let game = {};
let tickHandle = null;
let teamUnsub = null;
let gameUnsub = null;
let resetting = false;
let wakeLock = null;
let audioEnabled = localStorage.getItem("escapeAudioEnabled") === "true";
let lastAlertBucket = 0;
let celebrationShown = false;

function show(id) {
  screens.forEach(screen => $(screen).classList.toggle("hidden", screen !== id));
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 3500);
}

function cleanTeamName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function friendly(error) {
  console.error(error);
  return error.message?.replace("Firebase: ", "") || "Something went wrong.";
}

async function unlockAudio(element, volume, label) {
  if (!element) throw new Error(`${label} element is missing from index.html.`);
  element.volume = volume;
  element.load();
  try {
    await element.play();
    element.pause();
    element.currentTime = 0;
    return true;
  } catch (error) {
    console.error(`${label} could not be played. Check its filename and codec.`, error);
    return false;
  }
}

async function enableAlerts() {
  try {
    const results = await Promise.all([
      unlockAudio($("coughAlarm"), 0.65, "Cough alarm"),
      unlockAudio($("dungeonMusic"), 0.14, "Dungeon ambience"),
      unlockAudio($("movieMusic"), 0.42, "Saw soundtrack")
    ]);
    if (!results[2]) throw new Error("Saw-SoundTrack.mp4 could not be loaded. Confirm the exact filename and that the MP4 contains a browser-supported AAC audio track.");

    audioEnabled = true;
    localStorage.setItem("escapeAudioEnabled", "true");

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    await requestWakeLock();
    updateAlertStatus();
    toast("Sound alerts and background music enabled. Keep this page open during the game.");
  } catch (error) {
    console.error(error);
    audioEnabled = false;
    localStorage.removeItem("escapeAudioEnabled");
    toast(error.message || "Audio could not be enabled. Check the browser sound permissions and confirm all audio files exist.");
  }
}

function updateAlertStatus() {
  if (!$("alertStatus")) return;
  $("alertStatus").textContent = audioEnabled
    ? "Sound alerts and background music enabled. The app will try to keep the screen awake."
    : "Tap once before the game. Music will start with the dungeon and an alarm will play every 10 minutes.";
  $("enableAlertsBtn").textContent = audioEnabled ? "Sound and music enabled" : "Enable sound alerts";
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => wakeLock = null);
  } catch (error) {
    console.warn("Wake lock unavailable", error);
  }
}

async function playCoughAlert(minutesLeft) {
  if (!audioEnabled) return;
  try {
    const audio = $("coughAlarm");
    audio.currentTime = 0;
    await audio.play();
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification("Hostage warning", {
        body: `${minutesLeft} minutes remaining. Gas concentration is rising.`,
        tag: `hostage-${minutesLeft}`
      });
    }
  } catch (error) {
    console.warn("Cough alert blocked", error);
  }
}

function checkTenMinuteAlert(left) {
  if (game.status !== "running" || !game.startedAt) return;
  const elapsed = Math.max(0, (game.durationSeconds || 3600) - left);
  const bucket = Math.floor(elapsed / 600);
  const gameKey = String(game.startedAt.toMillis());
  const storageKey = `escapeAlerts:${gameKey}`;
  const fired = JSON.parse(localStorage.getItem(storageKey) || "[]");

  if (bucket > 0 && bucket <= 5 && bucket > lastAlertBucket && !fired.includes(bucket)) {
    fired.push(bucket);
    localStorage.setItem(storageKey, JSON.stringify(fired));
    playCoughAlert(Math.max(0, 60 - bucket * 10));
  }
  lastAlertBucket = bucket;
}

function stopAndRewind(element) {
  if (!element) return;
  element.pause();
  element.currentTime = 0;
}

function playBackgroundAudio() {
  if (!audioEnabled) return;
  const dungeonMusic = $("dungeonMusic");
  const movieMusic = $("movieMusic");

  if (dungeonMusic) {
    dungeonMusic.volume = 0.14;
    dungeonMusic.play().catch(error => console.warn("Dungeon ambience blocked", error));
  }
  if (movieMusic) {
    movieMusic.volume = 0.42;
    movieMusic.play().catch(error => console.warn("Supplied soundtrack blocked", error));
  }
}

function stopBackgroundAudio() {
  stopAndRewind($("dungeonMusic"));
  stopAndRewind($("movieMusic"));
}

$("enableAlertsBtn").onclick = enableAlerts;

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && game.status === "running" && audioEnabled) {
    requestWakeLock();
    playBackgroundAudio();
  }
});

updateAlertStatus();

$("hostageNav").onclick = () => switchTab("hostage");
$("missionsNav").onclick = () => switchTab("missions");

function switchTab(name) {
  $("hostageTab").classList.toggle("hidden", name !== "hostage");
  $("missionsTab").classList.toggle("hidden", name !== "missions");
  $("hostageNav").classList.toggle("active", name === "hostage");
  $("missionsNav").classList.toggle("active", name === "missions");
}

$("closeCelebrationBtn").onclick = () => {
  $("rescueCelebration").classList.add("hidden");
  switchTab("missions");
};

$("toggleAccessCode").onclick = () => {
  const accessCode = $("teamAccessCode");
  const confirmation = $("confirmTeamAccessCode");
  const reveal = accessCode.type === "password";
  accessCode.type = reveal ? "text" : "password";
  confirmation.type = reveal ? "text" : "password";
  $("toggleAccessCode").textContent = reveal ? "Hide" : "Show";
};

$("registerBtn").onclick = async () => {
  const teamName = cleanTeamName($("teamName").value);
  const accessCode = $("teamAccessCode").value.trim();
  const confirmation = $("confirmTeamAccessCode").value.trim();

  if (!teamName) return toast("Enter a team name.");
  if (accessCode.length < 6 || accessCode.length > 30) return toast("The team access code must contain between 6 and 30 characters.");
  if (accessCode !== confirmation) return toast("The access codes do not match.");

  try {
    const credentials = auth.currentUser?.isAnonymous ? { user: auth.currentUser } : await signInAnonymously(auth);
    const reference = doc(db, "teams", credentials.user.uid);
    const snapshot = await getDoc(reference);

    if (!snapshot.exists()) {
      await setDoc(reference, {
        name: teamName,
        ownerUid: credentials.user.uid,
        accessCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submissions: {},
        solved: {},
        completed: false,
        completedAt: null,
        remainingSeconds: null
      });
    }

    currentTeam = (await getDoc(reference)).data();
    openPlayer(credentials.user.uid);
  } catch (error) {
    toast(friendly(error));
  }
};

function openPlayer(uid) {
  show("playerApp");
  $("teamLabel").textContent = currentTeam.name;
  renderTasks(uid, currentTeam);

  if (teamUnsub) teamUnsub();
  if (gameUnsub) gameUnsub();

  teamUnsub = onSnapshot(doc(db, "teams", uid), async snapshot => {
    if (snapshot.exists()) {
      currentTeam = snapshot.data();
      $("teamLabel").textContent = currentTeam.name;
      renderTasks(uid, currentTeam);
    } else if (!resetting) {
      resetting = true;
      clearInterval(tickHandle);
      if (gameUnsub) gameUnsub();
      stopBackgroundAudio();
      stopAndRewind($("hostageVideo"));
      $("rescueCelebration").classList.add("hidden");
      celebrationShown = false;
      currentTeam = null;
      $("teamName").value = "";
      $("teamAccessCode").value = "";
      $("confirmTeamAccessCode").value = "";
      show("landing");
      toast("The game was reset. Register your team for the next round.");
      await signOut(auth);
      resetting = false;
    }
  }, error => toast(friendly(error)));

  gameUnsub = onSnapshot(doc(db, "games", "current"), snapshot => {
    game = snapshot.exists() ? snapshot.data() : { status: "waiting", durationSeconds: 3600 };
    startClock();
  }, error => toast(friendly(error)));
}

function normalizeAnswer(value, index) {
  const trimmed = value.trim();
  return index === 4 ? trimmed.toLowerCase() : trimmed;
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function showMissionResult(success, missionNumber) {
  toast(success ? `Mission ${missionNumber} Success` : `Mission ${missionNumber} Failure. Try again.`);
}

function showCelebration(team) {
  if (celebrationShown) return;
  celebrationShown = true;
  $("savedTimeRemaining").textContent = formatTime(team.remainingSeconds);
  $("rescueCelebration").classList.remove("hidden");
  stopBackgroundAudio();
  stopAndRewind($("hostageVideo"));
}

function renderTasks(uid, team) {
  const solved = team.solved || {};
  const submissions = team.submissions || {};
  const count = Object.values(solved).filter(Boolean).length;

  $("progressText").textContent = `${count} / 5`;
  $("progressBar").style.width = `${count * 20}%`;
  $("taskList").innerHTML = TASKS.map((title, index) => {
    const key = `task${index + 1}`;
    const isSolved = solved[key] === true;
    const response = submissions[key] || "";
    return `<details class="panel task ${isSolved ? "task-solved" : ""}" ${isSolved ? "open" : ""}>
      <summary><span><b>${index + 1}</b>${title}</span><em class="${isSolved ? "solved" : "unsolved"}">${isSolved ? "SUCCESS" : "NOT COMPLETE"}</em></summary>
      <textarea id="answer-${index}" maxlength="100" placeholder="Enter your response" ${isSolved || team.completed ? "disabled" : ""}>${escapeHtml(response)}</textarea>
      <button data-task="${index}" class="primary submit-answer" ${isSolved || team.completed ? "disabled" : ""}>Submit response</button>
    </details>`;
  }).join("");

  document.querySelectorAll(".submit-answer").forEach(button => button.onclick = async () => {
    const index = Number(button.dataset.task);
    const key = `task${index + 1}`;
    const entered = normalizeAnswer($(`answer-${index}`).value, index);
    if (!entered) return toast("Enter a response first.");

    const success = entered === ANSWERS[index];
    const nextSolved = { ...(currentTeam.solved || {}), [key]: success };
    const allSolved = TASKS.every((_, taskIndex) => nextSolved[`task${taskIndex + 1}`] === true);
    const remaining = allSolved ? secondsLeft() : null;

    try {
      const changes = {
        [`submissions.${key}`]: entered,
        [`solved.${key}`]: success,
        updatedAt: serverTimestamp()
      };
      if (allSolved) {
        changes.completed = true;
        changes.completedAt = serverTimestamp();
        changes.remainingSeconds = remaining;
      }
      await updateDoc(doc(db, "teams", uid), changes);
      showMissionResult(success, index + 1);
    } catch (error) {
      toast(friendly(error));
    }
  });

  if (team.completed) showCelebration(team);
}
function startClock() {
  clearInterval(tickHandle);
  updateClock();
  tickHandle = setInterval(updateClock, 1000);
}

function secondsLeft() {
  if (game.status !== "running" || !game.startedAt) return game.durationSeconds || 3600;
  return Math.max(0, (game.durationSeconds || 3600) - Math.floor((Date.now() - game.startedAt.toMillis()) / 1000));
}

function updateClock() {
  const teamCompleted = currentTeam?.completed === true;
  const running = game.status === "running" && !teamCompleted;
  const left = teamCompleted ? (currentTeam.remainingSeconds || 0) : secondsLeft();
  const minutes = String(Math.floor(left / 60)).padStart(2, "0");
  const seconds = String(left % 60).padStart(2, "0");
  const text = `${minutes}:${seconds}`;

  $("playerTimer").textContent = text;
  $("dungeonTimer").textContent = text;
  $("preGameView").classList.toggle("hidden", running || teamCompleted);
  $("dungeonView").classList.toggle("hidden", !running && !teamCompleted);
  $("gasBar").style.width = running ? `${100 - (left / 3600 * 100)}%` : "0%";
  $("gasStatus").textContent = left ? "RISING" : "CRITICAL";

  const video = $("hostageVideo");

  if (running && left > 0) {
    video.play().catch(() => {});
    if (audioEnabled) {
      playBackgroundAudio();
      requestWakeLock();
    }
    checkTenMinuteAlert(left);
  } else {
    stopAndRewind(video);
    stopBackgroundAudio();
    lastAlertBucket = 0;
  }

  if (!left) {
    stopBackgroundAudio();
    clearInterval(tickHandle);
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    show("landing");
    return;
  }

  if (user.isAnonymous) {
    const snapshot = await getDoc(doc(db, "teams", user.uid));
    if (snapshot.exists()) {
      currentTeam = snapshot.data();
      openPlayer(user.uid);
    } else {
      show("landing");
    }
  }
});
