import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, serverTimestamp, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
const OWNER_EMAIL="ramyraafat.rrh@gmail.com";
const TASKS=["Mission 1","Mission 2","Mission 3","Mission 4","Mission 5"];
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let game={},tickHandle=null,teamsUnsub=null;
function showOwner(loggedIn){$("ownerLogin").classList.toggle("hidden",loggedIn);$("ownerApp").classList.toggle("hidden",!loggedIn);}
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");setTimeout(()=>$("toast").classList.add("hidden"),3500);}
function friendly(e){console.error(e);return e.message?.replace("Firebase: ","")||"Something went wrong.";}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
$("ownerLoginForm").onsubmit=async e=>{e.preventDefault();try{const email=$("ownerEmail").value.trim().toLowerCase();if(email!==OWNER_EMAIL)throw new Error("This account is not configured as the owner.");await signInWithEmailAndPassword(auth,email,$("ownerPassword").value);}catch(err){toast(friendly(err));}};
$("logoutBtn").onclick=async()=>{if(teamsUnsub)teamsUnsub();await signOut(auth);};
function openOwner(){showOwner(true);onSnapshot(doc(db,"games","current"),s=>{game=s.exists()?s.data():{};startClock();});teamsUnsub=onSnapshot(query(collection(db,"teams")),snap=>renderOwnerTeams(snap.docs));}
function formatOwnerTime(totalSeconds){const value=Math.max(0,Number(totalSeconds)||0);return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;}
function renderOwnerTeams(docs){
  $("teamsGrid").innerHTML=docs.length?docs.slice(0,4).map(d=>{
    const t=d.data(),solved=t.solved||{},subs=t.submissions||{},count=Object.values(solved).filter(Boolean).length,completed=t.completed===true;
    const answers=TASKS.map((title,i)=>{const k=`task${i+1}`,response=subs[k],ok=solved[k]===true;return `<div class="review ${ok?"review-success":""}"><div><b>${title}</b><p>${response?escapeHtml(response):"No response"}</p></div><strong class="mission-result ${ok?"result-success":"result-pending"}">${ok?"SUCCESS":"PENDING"}</strong></div>`;}).join("");
    return `<article class="panel team-card ${completed?"team-completed":""}"><div class="spread"><h2>${completed?"&#10003; ":""}${escapeHtml(t.name)}</h2><strong>${completed?"COMPLETED":`${count}/5 solved`}</strong></div>${completed?`<p class="completion-line">Agent saved with ${formatOwnerTime(t.remainingSeconds)} remaining</p>`:""}<div class="bar"><i style="width:${count*20}%"></i></div><details><summary>View mission responses</summary>${answers}</details></article>`;
  }).join(""):"<div class='panel empty'>No teams registered yet.</div>";
}
$("startGameBtn").onclick=async()=>{try{await setDoc(doc(db,"games","current"),{status:"running",startedAt:serverTimestamp(),durationSeconds:3600,updatedAt:serverTimestamp()},{merge:true});toast("The 60-minute countdown has started.");}catch(e){toast(friendly(e));}};
$("resetGameBtn").onclick=async()=>{if(!confirm("Reset the entire game? This will delete all registered teams and return player devices to registration."))return;try{$("resetGameBtn").disabled=true;$("teamsGrid").innerHTML="<div class='panel empty'>Resetting game and removing all teams...</div>";const snap=await getDocs(collection(db,"teams"));const batch=writeBatch(db);batch.set(doc(db,"games","current"),{status:"waiting",startedAt:null,durationSeconds:3600,updatedAt:serverTimestamp()});snap.forEach(team=>batch.delete(team.ref));await batch.commit();$("teamsGrid").innerHTML="<div class='panel empty'>No teams registered yet.</div>";toast("Game reset. All teams were removed and player devices returned to registration.");}catch(e){toast(friendly(e));}finally{$("resetGameBtn").disabled=false;}};
function startClock(){clearInterval(tickHandle);updateClock();tickHandle=setInterval(updateClock,1000);}
function secondsLeft(){if(game.status!=="running"||!game.startedAt)return game.durationSeconds||3600;return Math.max(0,(game.durationSeconds||3600)-Math.floor((Date.now()-game.startedAt.toMillis())/1000));}
function updateClock(){const left=secondsLeft(),m=String(Math.floor(left/60)).padStart(2,"0"),s=String(left%60).padStart(2,"0");$("ownerTimer").textContent=`${m}:${s}`;$("gameStatus").textContent=game.status==="running"?(left?"Game in progress":"TIME EXPIRED"):"Waiting to start";}
onAuthStateChanged(auth,user=>{if(user?.email?.toLowerCase()===OWNER_EMAIL)openOwner();else showOwner(false);});