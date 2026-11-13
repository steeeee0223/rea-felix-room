// Built by ghost-theme/build.py from vhs-tv sources. Do not edit here.

// ?bench=1: the benchmark (bench/bench.js, /?bench=1; Felix, 12 Nov). This part notes how the page loads, from its first moment:
// the loading display's steps, the steps the room is built in, and every time the page was too busy to answer a 10 ms beat
if(/[?&]bench=/.test(location.search)) (()=>{ const B=window.__bench={marks:[],stalls:[],errors:[],hidden:document.hidden?1:0}, at=()=>performance.now(); let step, last=at();
  B.mark=n=>{ B.marks.push([n,at()]); };
  try{ performance.setResourceTimingBufferSize(3000); }catch(e){}
  Object.defineProperty(window,"__osdStep",{configurable:true,get:()=>step,set:f=>{ step=n=>{ B.mark("step"+n); return f(n); }; }});
  const beat=setInterval(()=>{ const n=at(), c=document.getElementById("gl")?.classList; if(n-last>60) B.stalls.push([last,n-last]); last=n; if(c?.contains("loaded")&&!B.in){ B.in=1; B.mark("loaded"); } if(c?.contains("ready")){ B.mark("ready"); clearInterval(beat); for(const f of undo.splice(0)) f(); } },10);
  // what the page waits for: the calls to the GPU and the canvases that took their time, and (Chrome) whose script a long frame was
  B.calls={}; B.slow=[]; B.long=[]; const undo=[]; let deep=0;
  for(const [P,tag] of [[window.WebGL2RenderingContext,"gl."],[window.CanvasRenderingContext2D,"2d."],[window.HTMLCanvasElement,"canvas."]]) if(P) for(const k of Object.getOwnPropertyNames(P.prototype)){ const d=Object.getOwnPropertyDescriptor(P.prototype,k), f=d.value; if(typeof f!=="function"||k==="constructor") continue;
    P.prototype[k]=function(...a){ if(deep||B.in) return f.apply(this,a); deep=1; const t=at(); try{ return f.apply(this,a); } finally{ deep=0; const e=at()-t; if(e>=1){ const q=B.calls[tag+k]||=[0,0]; q[0]++; q[1]+=e; if(e>25&&B.slow.length<80) B.slow.push([Math.round(t),Math.round(e),tag+k]); } } };
    undo.push(()=>Object.defineProperty(P.prototype,k,d)); }
  try{ new PerformanceObserver(l=>{ for(const e of l.getEntries()) if(e.duration>100&&B.long.length<40) B.long.push([Math.round(e.startTime),Math.round(e.duration),...e.scripts.filter(s=>s.duration>20).map(s=>[s.invoker?.split("/").pop().slice(0,30),s.sourceFunctionName,s.sourceCharPosition,Math.round(s.startTime),Math.round(s.duration)].join(" "))]); }).observe({type:"long-animation-frame",buffered:true}); }catch(e){}
  addEventListener("error",e=>{ if(B.errors.length<20) B.errors.push(String(e.message||e.target?.src||e.target?.href||"error").slice(0,160)); },true);
  addEventListener("unhandledrejection",e=>{ if(B.errors.length<20) B.errors.push(String(e.reason).slice(0,160)); });
  document.addEventListener("visibilitychange",()=>{ if(document.hidden) B.hidden++; }); })();


// The loading display (Felix, 02:58Z: "Do we need a loading indicator?"; 04:42Z: the tape counter it showed until v28 didn't
// read as progress, so now it's a bar and a percentage; 28 Sep 01:47Z: "i like 1 on the tv with the still on"). It plays on
// the TV in the loading still and comes up with the still, on every link (Felix, 28 Oct); a still that's late or can't come
// leaves the screen in its place on the dark ground. It says 100% only once the room is there, and then stays up until the
// first click lets the room in (#gl.loaded; the page's gate, Felix 23:00Z). As the room fades in, static takes the picture off
// the TV (.out) and it goes; when the scene can't load, it fades.
// What it counts (v55; Felix, 27 Sep 21:31Z: people thought it was stuck at 51%, then it jumped to 100%; 22:19Z, of v54:
// "kinda goes to 75 before jumping to 100"). Up to 80%, what the room has asked for since this script ran and got, against
// what it fetches before it's built (LOAD_BYTES, unpacked, on a desktop: tv/fast/probe_osd54.cjs), from any host (the Ghost
// theme's big files come from another one; the page around the room there fetches 3 MB of its own scripts first, which don't
// count), with the scene's geometry counted as it streams in (loadScene feeds it to __osdFeed), then the textures the scene
// asks for as it's parsed (a fifth of the bytes). A host that won't say how big its files are (no Timing-Allow-Origin) counts
// an average file's worth for each. The rest of the bar is the work after the downloads, in steps the page reports
// (__osdStep, from osdPaint): 80% once the scene has parsed (the room is built next), 87% once it's built (its shaders
// compile), 94% once they have (the room's first frame next), 100% once the room is in; step 1, the geometry is in, has no
// share of its own (its textures come next). Building the room and drawing it the first time keep the page from drawing
// anything else, so a step's promise settles only once the display has drawn it, and the page waits for that before it goes
// on (WAIT at most: a hidden tab or a page too busy to draw shows it at once). v54's bar eased a long way behind its count on
// a fast line, sat there while the page built the room and drew it, and next drew 100%. Between the steps the bar keeps
// moving: it runs a little ahead, slower and slower, so a big file on its way doesn't read as stuck, and it never runs past a
// step that hasn't happened. After a stretch without frames it catches up over a few (STEP a frame at most), not in one jump.
(()=>{ const el=document.getElementById("osd"), pc=el&&el.querySelector(".pc"), bar=el&&el.querySelector(".bar i"); if(!pc||!bar) return;
  // (LOAD_BYTES: v80 adds the cassette player's own model and maps, gl/wm*.json and bake/wm_*.jpg, 2.6 MB)
  // (LOAD_BYTES: v81 adds the floppy disks' own model and maps, gl/fl*.json and bake/fl_*.jpg, 1.6 MB)
  // (LOAD_BYTES: the heater's own model and maps, gl/ht*.json and bake/ht_*.jpg, 0.9 MB)
  // (LOAD_BYTES: the floorboards' own pictures, floor/boards.jpg and floor/relief.jpg, 0.8 MB)
  // (LOAD_BYTES: 12 Nov, the geometry packed smaller, 7.4 MB less)
  // (LOAD_BYTES: lean/, a third of what it was. Where a browser has no AVIF the count fills early and the steps carry the bar)
  const LOAD_BYTES=11.4e6, FILE=130e3, SEGS=20, DL=.8, STEPS=[0,0,.8,.87,.94], STEP=.04, WAIT=300;
  let got=0, streamed=0, step=0, shown=0, on=false, fin=false, text="0%", waits=[], last=performance.now(); const t0=last;
  // When the room doesn't come (12 Nov): a card over the still, with a way out. A script that didn't load is tried again by loading
  // the page once more (once a visit: RELOADED; the files that did come are in the cache). "slow", STALL seconds without a byte or a
  // step while the downloads run, goes again by itself when the loading moves on. (Its look is here and not in the stylesheet, which
  // may be what didn't come; it's under LO-FI's own card.)
  const STALL=30, RELOADED="bm.reload"; let card=null, why="", idle=0, mark=-1, beats=0, came=false;
  const cardOff=()=>{ card?.remove(); card=null; why=""; };
  window.__osdBeat=()=>{ beats++; };   // (bytes came: lean.js)
  window.__loadFail=w=>{ if(why&&why!=="slow"||document.getElementById("lost")) return;
    if(w==="script"&&navigator.onLine!==false) try{ if(!sessionStorage.getItem(RELOADED)){ sessionStorage.setItem(RELOADED,"1"); why=w; setTimeout(()=>location.reload(),800); return; } }catch(e){}
    cardOff(); why=w; card=document.createElement("div"); card.id="nolo"; card.setAttribute("role","alert");
    const p=document.createElement("p"), b=document.createElement("button"), a=document.createElement("a"), row=document.createElement("div");
    card.style.cssText="position:fixed;inset:0;z-index:7;display:grid;place-content:center;justify-items:center;gap:18px;padding:20px;pointer-events:none;background:rgba(7,8,13,.62);font-family:var(--osd);font-size:22px;color:var(--ink);text-align:center;text-shadow:0 0 1px #000,0 0 2px #000,0 1px 1px #000,0 0 9px rgba(0,0,0,.8)";
    p.style.cssText="margin:0;max-width:26em"; row.style.cssText="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;pointer-events:auto";
    p.textContent=w==="slow"?"The room is taking its time. The connection may be slow, or gone.":"The room didn't load.";
    b.className=a.className="sound"; b.textContent="RELOAD"; b.onclick=()=>{ try{ sessionStorage.removeItem(RELOADED); }catch(e){} location.reload(); };
    a.textContent="LO-FI"; a.href="/?reading=1"+((location.hash.slice(1)||window.__BM?.pageAt?.(location.pathname))==="about"?"#about":"");
    row.append(b,a); card.append(p,row); document.body.append(card); };
  // (the page's own module where it's inline; the Ghost theme's says so itself, scene.hbs)
  if(!window.__BM) addEventListener("error",e=>{ const s=e.target; if(!came&&s?.tagName==="SCRIPT"&&s.type==="module"&&!s.src) window.__loadFail("script"); },true);
  if(window.__BM?.failed) window.__loadFail("script");
  // the loading still, asked for now, next to the room's first files, and shown as soon as it's in: the page's own request
  // only goes once its scripts are in, often seconds later on a phone (the page asks for the same image then, from the
  // cache). The display waits up to WAIT_STILL for it. The still's folder: the page's, or the theme's scene files (this
  // script is its boot.js there, next to them, or they're on another host: __BM.assetBase)
  const WAIT_STILL=1500;
  { const im=new Image(), src=document.currentScript?.src; im.fetchPriority="high"; im.decoding="async";
    im.onload=()=>{ const s=document.getElementById("still"), gl=document.getElementById("gl"); if(s&&!fin&&!gl?.classList.contains("ready")){ s.style.backgroundImage=`url("${im.src}")`; s.classList.add("on"); } };
    im.src=(window.__BM?.assetBase||(src?new URL("./",src).href:"./"))+"tex/still.jpg"; }
  // the screen's grain, and its static as the room comes in: a tile of grey noise, made once
  try{ const c=document.createElement("canvas"); c.width=c.height=128; const g=c.getContext("2d"), im=g.createImageData(128,128); let s=20260928;
    for(let i=0;i<im.data.length;i+=4){ s=s*16807%2147483647; im.data[i]=im.data[i+1]=im.data[i+2]=s/2147483647*256|0; im.data[i+3]=255; }
    g.putImageData(im,0,0); el.style.setProperty("--noise",`url("${c.toDataURL()}")`); }catch(e){}
  // the screen on the TV's glass in the still, which is seen a little from the left and above, and so is no rectangle: its
  // corners (still px: top left, top right, bottom right, bottom left, where the glass's edges, fitted to it, meet, half a
  // pixel or so outside them). The screen, a box of BOX (left, top, width, height in still px, as the style's .tv-scr), is
  // drawn onto them in perspective (--warp: the box onto the unit square, then that onto the corners, Heckbert's), worked
  // out again when the window changes (one pixel of the still: the display's height/1066)
  const Q=[[1096.7,477],[1407.97,473.4],[1406.58,702.48],[1099.29,710.4]], BOX=[1098,475.2,309.3,231.2];
  let warpK=0;
  const warp=()=>{ const k=el.getBoundingClientRect().height/1066; if(!k||k===warpK) return; warpK=k; const W=BOX[2]*k, H=BOX[3]*k,
      [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=Q.map(([x,y])=>[(x-BOX[0])*k-W/2,(y-BOX[1])*k-H/2]),   // (from the box's middle, the transform's origin)
      sx=x0-x1+x2-x3, sy=y0-y1+y2-y3, dx1=x1-x2, dx2=x3-x2, dy1=y1-y2, dy2=y3-y2, den=dx1*dy2-dx2*dy1,
      g=(sx*dy2-dx2*sy)/den, h=(dx1*sy-sx*dy1)/den, a=x1-x0+g*x1, b=x3-x0+h*x3, d=y1-y0+g*y1, e=y3-y0+h*y3;
    el.style.setProperty("--warp",`matrix3d(${[a/W,d/W,0,g/W, b/H,e/H,0,h/H, 0,0,1,0, (a+b)/2+x0,(d+e)/2+y0,0,(g+h)/2+1].map(v=>+v.toFixed(9)).join(",")})`); };
  warp(); addEventListener("resize",warp);
  window.__osdFeed=n=>{ streamed+=n; };
  // (a step's promise settles in a task after the frame that drew it, or WAIT ms on, when it's shown at once)
  const settle=()=>{ const now=performance.now(); waits=waits.filter(w=>{ if(shown<w.v&&now<w.t) return true; if(shown<w.v&&!fin){ shown=w.v; show(shown); } setTimeout(w.r,0); return false; }); };
  window.__osdStep=n=>new Promise(r=>{ n=Math.max(0,Math.min(4,n|0)); step=Math.max(step,n); const h=document.hidden; waits.push({v:STEPS[n],r,t:h?0:performance.now()+WAIT}); setTimeout(settle,h?0:WAIT+5); });
  try{ new PerformanceObserver(l=>{ for(const e of l.getEntries()) if(e.startTime>=t0&&!/\/(gl\/bin\d+\.json|leanm?\/geo\/\w+\.\d+\.bin)(\?|$)/.test(e.name)&&!("responseStatus" in e&&!e.decodedBodySize&&(!e.responseStatus||e.responseStatus>399))) got+=e.decodedBodySize||FILE; }).observe({type:"resource"}); }catch(e){}
  const show=v=>{ const t=Math.floor(v*100)+"%"; if(t===text) return; pc.textContent=text=t; bar.style.width=Math.floor(v*SEGS+1e-6)*100/SEGS+"%"; };
  (function tick(now){
    const gl=document.getElementById("gl"), err=document.getElementById("err"), done=gl&&gl.classList.contains("ready"), inside=!!gl&&gl.classList.contains("loaded"),
      still=document.getElementById("still"), lit=!!still&&still.classList.contains("on");
    if(!el.isConnected) return cardOff();   // (the plain home took the room's place: __BM.plain)
    if((done||inside)&&!came){ came=true; try{ sessionStorage.removeItem(RELOADED); }catch(e){} if(why==="slow") cardOff(); }
    if(done||err&&!err.hidden||card&&why!=="slow"){ fin=true; if(done) show(1); for(const w of waits) setTimeout(w.r,0); waits=[]; removeEventListener("resize",warp);
      if(done&&on){ el.classList.add("out"); still?.classList.add("out"); setTimeout(()=>el.remove(),1000); } else { el.classList.remove("on"); setTimeout(()=>el.remove(),600); } return; }
    // (the watch counts drawn time only: not a hidden tab's, nor the time the page is busy or LO-FI's card holds the room)
    { const at=got+streamed+beats+step*1e12, lite=document.getElementById("lite"); if(at!==mark){ mark=at; idle=0; if(why==="slow") cardOff(); }
      else if(!came&&step<2&&!document.hidden&&!(lite&&!lite.hidden)) idle+=Math.min(.5,Math.max(0,now-last)/1000);
      if(idle>STALL&&!why) window.__loadFail("slow"); }
    // lo: where the count and the steps put the bar; hi: as far as it may run ahead (in, and waiting for the click: 100%, at
    // once, with its CLICK TO ENTER)
    const dt=Math.min(.5,Math.max(0,now-last)/1000), lo=inside?1:Math.max(DL*Math.min(1,(streamed+got)/LOAD_BYTES),STEPS[step]),
      hi=inside?1:step>3?.99:step>1?STEPS[step+1]-.01:Math.min(DL,lo+.03); last=now;
    shown=inside?1:shown<lo?Math.min(lo,shown+Math.min(STEP,Math.max(.6,(lo-shown)*10)*dt)):shown+Math.max(0,hi-shown)*(1-Math.exp(-dt/1.2)); show(shown); settle();
    if(!on&&(inside||lit||now-t0>WAIT_STILL)){ on=true; el.classList.add("on"); }
    requestAnimationFrame(tick);
  })(t0);
})();


// LITE (Felix, 16 Oct: by the sound button, first as READING VIEW; then "let's go with Lite", with the page icon, and "we should
// show a confirmation dialog", in his words): the static site, the same pages without the room (/?reading=1: the Ghost theme's;
// it remembers the choice and gives its pages a way back). From About it opens the static About page (the theme sends /#about
// there). It sits left of the sound button; on a phone the touch layer moves that to the top bar (touch/touch.js), and LITE
// follows it there as its icon. A click asks first, in a card of the room's own (never the browser's confirm()): GO TO LITE
// goes; STAY, Esc or a click off the card stay. A click with a modifier, a middle click or a long press keep the real link: a
// new tab or window goes straight there. It shows with the other pills from the first frame, wherever the room does (v77;
// until v76 only where the room's module saw the theme's __BM.plain, ~2 s after the others: "Don't do this check dude, that's
// bad"), so its card's script follows its markup, before the module (in the theme: boot.js), and the card works from then on
(()=>{ const $=s=>document.querySelector(s), readBtn=$("#reading"), liteBox=$("#lite"), soundBtn=$("#sound"); if(!readBtn||!liteBox) return;
  const liteOpen=()=>!liteBox.hidden, goBtn=$("#liteGo"), stayBtn=$("#liteStay"), card=liteBox.firstElementChild;
  // the page it opens from: the room's, or before the room is up, the one the URL stands for (#about; in the theme, its path)
  const page=()=>window.__scene?.state?.page??(location.hash.slice(1)||window.__BM?.pageAt?.(location.pathname)||"");
  const to=()=>{ readBtn.href=goBtn.href="/?reading=1"+(page()==="about"?"#about":""); };   // (before a click, a middle click or a long press)
  const place=()=>{ const r=readBtn.getBoundingClientRect(), row=readBtn.parentElement.getBoundingClientRect(), up=r.top>innerHeight/2;   // over the pills, or under the top bar
    card.style.top=up?"auto":Math.round(r.bottom+10)+"px"; card.style.bottom=up?Math.round(innerHeight-r.top+10)+"px":"auto";
    card.style.right=Math.max(12,Math.round(innerWidth-row.right))+"px"; };
  // While the card is up the room's loading waits (__liteHold: the room is built in steps and checks between them), so the
  // page is free to answer the card and GO LO-FI goes at once (Felix, 17 Oct: "the lo-fi button doesn't work until the room is
  // fully loaded"). STAY, Esc or a click off the card let it go on, and so does coming back to the page (pageshow): leaving it
  // puts the card away (pagehide) and keeps the room waiting. A press made before the card was up (it waited on a page busy
  // building the room, as a second click on LO-FI would) is no answer to it: it neither closes the card nor goes.
  let upT=0; const held=[], goOn=()=>{ for(const r of held.splice(0)) r(); }, fresh=e=>!(e.timeStamp<upT);
  window.__liteHold=()=>liteOpen()?new Promise(r=>held.push(r)):null;
  const shut=(back=true)=>{ if(!liteOpen()) return; liteBox.hidden=true; document.body.classList.remove("liteup"); removeEventListener("resize",place); if(back){ goOn(); try{ readBtn.focus({preventScroll:true}); }catch{} } };
  readBtn.addEventListener("pointerdown",to); readBtn.addEventListener("focus",to);
  readBtn.onclick=e=>{ e.stopPropagation(); to(); if(e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey) return;   // (a new tab or window: straight there)
    e.preventDefault(); upT=performance.now(); liteBox.hidden=false; document.body.classList.add("liteup"); place(); addEventListener("resize",place); try{ goBtn.focus({preventScroll:true}); }catch{} };
  goBtn.onclick=e=>{ e.stopPropagation(); if(!fresh(e)) e.preventDefault(); }; stayBtn.onclick=e=>{ e.stopPropagation(); if(fresh(e)) shut(); };
  liteBox.addEventListener("click",e=>{ e.stopPropagation(); if(!card.contains(e.target)&&fresh(e)) shut(); });   // a click off the card closes it, and does nothing else
  // while it's up the keys are its own (this comes before the room's own listeners): Esc closes it (before the room's Esc: the
  // desk, the PC, home), Tab goes between its two buttons, Enter or Space presses the one in focus (GO TO LITE first; a link
  // takes no Space of its own, so it's pressed here), and the room's keys wait. The browser's own still work: F1-F12, and any
  // key with Ctrl, Cmd or Alt
  addEventListener("keydown",e=>{ if(!liteOpen()) return; e.stopImmediatePropagation();
    if(e.key==="Escape"){ e.preventDefault(); shut(); }
    else if(e.key==="Tab"){ e.preventDefault(); (document.activeElement===goBtn?stayBtn:goBtn).focus(); }
    else if(e.key===" "&&e.target===goBtn){ e.preventDefault(); if(!e.repeat) goBtn.click(); }
    else if(!(card.contains(e.target)&&(e.key==="Enter"||e.key===" "))&&!/^F\d+$/.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey) e.preventDefault(); },true);
  addEventListener("pagehide",()=>shut(false)); addEventListener("pageshow",()=>{ if(!liteOpen()) goOn(); });   // (gone to the lite site: back here, the card isn't up and the room goes on)
  const mo=new MutationObserver(()=>{ if(soundBtn?.parentNode&&readBtn.nextElementSibling!==soundBtn) soundBtn.before(readBtn); });
  for(const el of [$(".hud.top"),$(".ctl .btns")]) if(el) mo.observe(el,{childList:true});
})();
