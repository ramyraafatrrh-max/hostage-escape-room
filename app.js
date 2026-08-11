import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const TASKS=["Decode the transmission","Identify the antidote","Unlock the control panel","Trace the ventilation route","Enter the release code"];
const firebaseApp=initializeApp(firebaseConfig),auth=getAuth(firebaseApp),db=getFirestore(firebaseApp),$=id=>document.getElementById(id);
const screens=["landing","playerApp"];
let currentTeam=null,game={},tickHandle=null,teamUnsub=null,gameUnsub=null,resetting=false,wakeLock=null,audioEnabled=localStorage.getItem("escapeAudioEnabled")==="true",lastAlertBucket=0;
function show(id){screens.forEach(x=>$(x).classList.toggle("hidden",x!==id));}
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500);}
function cleanTeamName(s){return s.trim().replace(/\s+/g," ");}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function friendly(e){console.error(e);return e.message?.replace("Firebase: ","")||"Something went wrong.";}

async function enableAlerts(){
  try{
    const audio=$("coughAlarm");audio.volume=0.65;await audio.play();audio.pause();audio.currentTime=0;
    const music=$("dungeonMusic");music.volume=0.28;await music.play();music.pause();music.currentTime=0;
    audioEnabled=true;localStorage.setItem("escapeAudioEnabled","true");
    if("Notification" in window&&Notification.permission==="default")await Notification.requestPermission();
    await requestWakeLock();updateAlertStatus();toast("Sound alerts enabled. Keep this page open during the game.");
  }catch(e){audioEnabled=false;localStorage.removeItem("escapeAudioEnabled");toast("Audio could not be enabled. Check the browser sound permissions.");}
}
function updateAlertStatus(){if(!$("alertStatus"))return;$("alertStatus").textContent=audioEnabled?"Sound alerts enabled. The app will try to keep the screen awake.":"Tap once before the game. An alarm will play every 10 minutes.";$("enableAlertsBtn").textContent=audioEnabled?"Sound alerts enabled":"Enable sound alerts";}
async function requestWakeLock(){if(!("wakeLock" in navigator)||document.visibilityState!=="visible"||wakeLock)return;try{wakeLock=await navigator.wakeLock.request("screen");wakeLock.addEventListener("release",()=>wakeLock=null);}catch(e){console.warn("Wake lock unavailable",e);}}
async function playCoughAlert(minutesLeft){if(!audioEnabled)return;try{const audio=$("coughAlarm");audio.currentTime=0;await audio.play();if("Notification" in window&&Notification.permission==="granted"&&document.hidden)new Notification("Hostage warning",{body:`${minutesLeft} minutes remaining. Gas concentration is rising.`,tag:`hostage-${minutesLeft}`});}catch(e){console.warn("Cough alert blocked",e);}}
function checkTenMinuteAlert(left){if(game.status!=="running"||!game.startedAt)return;const elapsed=Math.max(0,(game.durationSeconds||3600)-left),bucket=Math.floor(elapsed/600);const gameKey=String(game.startedAt.toMillis());const storageKey=`escapeAlerts:${gameKey}`;const fired=JSON.parse(localStorage.getItem(storageKey)||"[]");if(bucket>0&&bucket<=5&&bucket>lastAlertBucket&&!fired.includes(bucket)){fired.push(bucket);localStorage.setItem(storageKey,JSON.stringify(fired));playCoughAlert(Math.max(0,60-bucket*10));}lastAlertBucket=bucket;}
$("enableAlertsBtn").onclick=enableAlerts;
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&game.status==="running"&&audioEnabled)requestWakeLock();});
updateAlertStatus();

$("hostageNav").onclick=()=>switchTab("hostage");
$("missionsNav").onclick=()=>switchTab("missions");
function switchTab(name){$("hostageTab").classList.toggle("hidden",name!=="hostage");$("missionsTab").classList.toggle("hidden",name!=="missions");$("hostageNav").classList.toggle("active",name==="hostage");$("missionsNav").classList.toggle("active",name==="missions");}

$("registerBtn").onclick=async()=>{const teamName=cleanTeamName($("teamName").value);if(!teamName)return toast("Enter a team name.");try{const cred=auth.currentUser?.isAnonymous?{user:auth.currentUser}:await signInAnonymously(auth);const ref=doc(db,"teams",cred.user.uid);const snap=await getDoc(ref);if(!snap.exists())await setDoc(ref,{name:teamName,ownerUid:cred.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),submissions:{},solved:{}});currentTeam=(await getDoc(ref)).data();openPlayer(cred.user.uid);}catch(e){toast(friendly(e));}};

function openPlayer(uid){show("playerApp");$("teamLabel").textContent=currentTeam.name;renderTasks(uid,currentTeam);if(teamUnsub)teamUnsub();if(gameUnsub)gameUnsub();teamUnsub=onSnapshot(doc(db,"teams",uid),async snap=>{if(snap.exists()){currentTeam=snap.data();$("teamLabel").textContent=currentTeam.name;renderTasks(uid,currentTeam);}else if(!resetting){resetting=true;clearInterval(tickHandle);if(gameUnsub)gameUnsub();currentTeam=null;$("teamName").value="";show("landing");toast("The game was reset. Register your team for the next round.");await signOut(auth);resetting=false;}},e=>toast(friendly(e)));gameUnsub=onSnapshot(doc(db,"games","current"),snap=>{game=snap.exists()?snap.data():{status:"waiting",durationSeconds:3600};startClock();},e=>toast(friendly(e)));}

function renderTasks(uid,team){const solved=team.solved||{},subs=team.submissions||{},count=Object.values(solved).filter(Boolean).length;$("progressText").textContent=`${count} / 5`;$("progressBar").style.width=`${count*20}%`;$("taskList").innerHTML=TASKS.map((title,i)=>{const key=`task${i+1}`,status=solved[key]?"SOLVED":subs[key]?"PENDING":"UNSOLVED";return `<details class="panel task"><summary><span><b>${i+1}</b>${title}</span><em class="${status.toLowerCase()}">${status}</em></summary><textarea id="answer-${i}" maxlength="500" placeholder="Enter your response" ${solved[key]?"disabled":""}>${escapeHtml(subs[key]||"")}</textarea><button data-task="${i}" class="primary submit-answer" ${solved[key]?"disabled":""}>Submit response</button></details>`;}).join("");document.querySelectorAll(".submit-answer").forEach(button=>button.onclick=async()=>{const i=Number(button.dataset.task),key=`task${i+1}`,answer=$(`answer-${i}`).value.trim();if(!answer)return toast("Enter a response first.");try{await updateDoc(doc(db,"teams",uid),{[`submissions.${key}`]:answer,[`solved.${key}`]:false,updatedAt:serverTimestamp()});toast("Response sent to Mission Command.");}catch(e){toast(friendly(e));}});}

function startClock(){clearInterval(tickHandle);updateClock();tickHandle=setInterval(updateClock,1000);}
function secondsLeft(){if(game.status!=="running"||!game.startedAt)return game.durationSeconds||3600;return Math.max(0,(game.durationSeconds||3600)-Math.floor((Date.now()-game.startedAt.toMillis())/1000));}
function updateClock(){const running=game.status==="running",left=secondsLeft(),m=String(Math.floor(left/60)).padStart(2,"0"),s=String(left%60).padStart(2,"0"),text=`${m}:${s}`;$("playerTimer").textContent=text;$("dungeonTimer").textContent=text;$("preGameView").classList.toggle("hidden",running);$("dungeonView").classList.toggle("hidden",!running);$("gasBar").style.width=running?`${100-(left/3600*100)}%`:"0%";$("gasStatus").textContent=left?"RISING":"CRITICAL";const video=$("hostageVideo"),music=$("dungeonMusic");music.volume=0.28;if(running){video.play().catch(()=>{});if(audioEnabled){music.play().catch(()=>{});requestWakeLock();}checkTenMinuteAlert(left);}else{video.pause();video.currentTime=0;music.pause();music.currentTime=0;lastAlertBucket=0;}if(!left){music.pause();clearInterval(tickHandle);}}

onAuthStateChanged(auth,async user=>{if(!user){show("landing");return;}if(user.isAnonymous){const snap=await getDoc(doc(db,"teams",user.uid));if(snap.exists()){currentTeam=snap.data();openPlayer(user.uid);}else{show("landing");}}});
