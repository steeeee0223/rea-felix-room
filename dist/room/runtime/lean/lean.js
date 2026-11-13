// lean/lean.js: less to fetch before the room opens (Felix, 28 Oct 2026: "reduce how much data we download before you enter the
// room"). The room's files stay as they were, next to what's here; without this module, or with ?lean=0, the page loads them as
// it always did. README.md has the numbers.
//   AVIF      every JPEG the room loads has an AVIF of the same picture beside it, a third of the size (lean/a/, tools/avif.py).
//             Three's loading manager swaps the URL, so nothing that asks for a picture has to know
//   geometry  gl/*.json's base64 as lean/geo/*.bin (tools/geo.mjs writes them, unpack.js says how, in workers), a third of it. It
//             unpacks to the same bytes, into the same GLB. Without WebAssembly (which tells of a browser with its JIT off, where
//             that would take seconds: Chrome with it off, an iPhone in Lockdown Mode) or DecompressionStream: the old parts
//   LATE      what the home view doesn't show (list.js, from an ID pass of the view at four window shapes, tools/probe_vis.cjs)
//             starts as a thumbnail (thumbs.json, one file, 64 px or so) or a smaller picture (MID), so the bar has nothing of
//             it to wait for. The room is built on those. Once it's built the real pictures come, a few at a time, decoded off
//             the page's thread, one sent to the GPU every few frames (start, tick), behind the still if nobody has clicked yet
// A browser where GLTFLoader doesn't use bitmaps (the same test as three's) gets the old way too.
import * as THREE from "three";
import { AVIF, LATE, MID, PHONE_KEEP, DROP, PROBE } from "./list.js";

// (on Ghost: bake/, gl/, tex/ and this folder's pictures, as leanm/, are on the scene host; floor/ and books/ next to the page's script)
const BM=window.__BM, UP=new URL("../",import.meta.url).href, HOST=BM?.assetBase||UP, HERE=BM?HOST+"leanm/":new URL("./",import.meta.url).href,
  ua=navigator.userAgent, safari=/^((?!chrome|android).)*safari/i.test(ua)?+(ua.match(/Version\/(\d+)/)?.[1]??-1):0, firefox=ua.includes("Firefox")?+(ua.match(/Firefox\/(\d+)/)?.[1]??-1):0,
  ON=!/[?&]lean=0/.test(location.search)&&typeof createImageBitmap==="function"&&!(safari&&safari<17)&&!(firefox&&firefox<98);
// A download that doesn't give up at the first failure: asked for again after an error or a cut-off, and after WAITS[n] ms in which
// nothing came, neither of it nor of anything else the page fetches (a slow line that keeps coming is left alone, and so is a file
// that waits its turn behind others). feed is told of new bytes once, whatever is asked for again. A file that
// isn't there (404) fails at once.
const WAITS=[15e3,25e3,40e3]; let alive=0;
const beat=()=>{ alive=performance.now(); window.__osdBeat?.(); };   // (the loading display's watch hears it too)
// (a request that failed has an entry of its own, which isn't news)
try{ new PerformanceObserver(l=>{ if(l.getEntries().some(e=>!("responseStatus" in e)||e.decodedBodySize||e.responseStatus&&e.responseStatus<400)) alive=performance.now(); }).observe({type:"resource"}); }catch(e){}
// how long nothing has come (ms)
export const lull=(since=0)=>performance.now()-Math.max(since,alive);
export async function grab(u,{as="json",feed=null,waits=WAITS}={}){
  let fed=0;
  for(let n=0;;n++){
    const ac=new AbortController(); let timer=0, from=performance.now(), due=from;
    // (a timer that comes late: the page was frozen or busy, and what came meanwhile hasn't been read yet)
    const watch=()=>{ const now=performance.now(); if(now>due+1000) from=now; const q=lull(from); if(q>=waits[n]) return ac.abort(); due=now+waits[n]-q+20; timer=setTimeout(watch,due-now); };
    try{
      watch(); const r=await fetch(u,{signal:ac.signal}); if(!r.ok) throw Object.assign(new Error(u+" "+r.status),{gone:r.status===404||r.status===410});
      const parts=[]; let got=0;
      if(r.body){ const rd=r.body.getReader(); for(;;){ const {done,value}=await rd.read(); if(done) break; beat(); parts.push(value); got+=value.length; if(got>fed){ feed?.(got-fed); fed=got; } } }
      else parts.push(await r.arrayBuffer());
      const b=new Blob(parts,{type:r.headers.get("content-type")||""});
      return as==="json"?JSON.parse(await b.text()):as==="bytes"?await b.arrayBuffer():b;
    }catch(e){ if(e.gone||n>=waits.length-1) throw e; }
    finally{ clearTimeout(timer); }
    await new Promise(r=>setTimeout(r,400+1200*n));
  }
}
// The packed geometry: how many files each model has (tools/geo.mjs has the same numbers), and the workers that fetch and unpack
// them, whatever the page is busy with. With no worker, or one that fails, or stalls (as grab has it), or doesn't answer: the page
const FILES={scene:6,wm:1,fl:1,ht:1}, PACKED=ON&&typeof WebAssembly==="object"&&typeof DecompressionStream==="function", SLOW=15e3, UNPACK=new URL("./unpack.js",import.meta.url).href;
let pool=null, jobs=0, closing=false; const came=[];
const gone=w=>{ const p=pool.find(p=>p.w===w); pool=pool.filter(q=>q!==p); w.terminate(); for(const j of p?.wait.values()||[]) j.no(new Error("no worker")); };
// (the room is built: no more to come, but for the files a worker still has)
const close=()=>{ closing=true; for(const p of pool||[]) if(!p.wait.size) gone(p.w); };
function crew(){ pool=[]; try{ for(let n=Math.max(2,Math.min(4,(navigator.hardwareConcurrency||4)>>1));n>0;n--){ const w=new Worker(UNPACK,{type:"module"}), wait=new Map();
    pool.push({w,wait}); w.onerror=e=>{ e.preventDefault?.(); gone(w); };
    w.onmessage=({data:d})=>{ const j=wait.get(d.id); if(!j) return; if(d.got) return j.got(d.got); wait.delete(d.id); if(d.error) j.no(new Error(d.error)); else j.ok(d); if(closing&&!wait.size) gone(w); }; } }catch(e){} }
function file(u){
  if(!pool) crew(); let fed=0, last=performance.now(), timer=0; const tell=n=>{ beat(); window.__osdFeed?.(n); };
  const p=pool.reduce((a,b)=>!a||b.wait.size<a.wait.size?b:a,null), id=++jobs;
  const self=()=>grab(u,{as:"bytes",waits:WAITS.slice(0,2),feed:n=>{ const k=Math.max(0,n-fed); fed=Math.max(0,fed-n); if(k) window.__osdFeed?.(k); }}).then(buf=>import(UNPACK).then(m=>m.read(buf)));
  if(!p) return self();
  return new Promise((ok,no)=>{ let due=last+SLOW; const watch=()=>{ const now=performance.now(); if(now>due+1000) last=now; const q=lull(last); if(q>=SLOW) return no(new Error("nothing came")); due=now+SLOW-q+20; timer=setTimeout(watch,due-now); }; timer=setTimeout(watch,SLOW);   // (a late timer: as in grab)
    p.wait.set(id,{ok,no,got:n=>{ fed+=n; last=performance.now(); tell(n); }}); p.w.postMessage({id,url:u}); })
    .then(r=>{ if(r.entry) came.push(r.entry); return r; },e=>{ p.wait.delete(id); try{ p.w.postMessage({id,stop:true}); }catch(x){} console.warn("lean: the page fetches",u,e); return self(); }).finally(()=>clearTimeout(timer)); }
// (asked for here, before anything else of the room: a worker doesn't start while the page is busy, and it is once its script runs)
const early={}, model=name=>Promise.all(Array.from({length:FILES[name]},(_,i)=>file(`${HERE}geo/${name}.${i}.bin`)));
if(PACKED) for(const name in FILES){ early[name]=model(name); early[name].catch(()=>{}); }
// the picture a URL stands for ("bake/desk_irrA"), whichever host or folder it's on
const keyOf=u=>/(?:^|\/)((?:bake|gl|tex|floor|books)\/[^/?#]+)\.jpg(?:[?#]|$)/.exec(String(u))?.[1]??null;
// a 1 px AVIF, as the page will use them: straight into a bitmap
const avifOK=!ON?false:await Promise.race([
  createImageBitmap(new Blob([Uint8Array.from(atob(PROBE),c=>c.charCodeAt(0))],{type:"image/avif"})).then(b=>{ b.close(); return true; },()=>false),
  new Promise(r=>setTimeout(r,500,false))]);
const hasAvif=new Set(avifOK?AVIF:[]), midNow=k=>avifOK&&MID[k]?`${HERE}a/${k}_m.avif`:null;
// one thing to know of each late picture: the textures that show it
const late=new Map(ON?LATE.filter(k=>avifOK||!MID[k]).map(k=>[k,{k,ts:[]}]):[]);
let thumbs={}, isPhone=()=>false;
const thumbsIn=ON?grab(HERE+"thumbs.json",{waits:[10e3,20e3]}).catch(()=>({})).then(j=>{ thumbs=j; }):Promise.resolve();
const lateNow=k=>{ const d=k&&late.get(k); if(!d) return null; if(isPhone()&&PHONE_KEEP.includes(k)){ late.delete(k); return null; } return d; };
const pics=[];
const b64=s=>{ if(Uint8Array.fromBase64) return Uint8Array.fromBase64(s); const t=atob(s), a=new Uint8Array(t.length); for(let i=0;i<t.length;i++) a[i]=t.charCodeAt(i); return a; };
const thumbBmp=k=>createImageBitmap(new Blob([b64(thumbs[k])],{type:"image/jpeg"}),{premultiplyAlpha:"none",colorSpaceConversion:"none"});
// the room's picture a key stands for, as lean/a has it or the JPEG
const best=k=>files(k)[0];
// the files that hold it, best first: the smaller one (mid), the AVIF, the JPEG
const files=(k,mid)=>[mid&&midNow(k),hasAvif.has(k)&&`${HERE}a/${k}.avif`,(/^(floor|books)\//.test(k)?UP:HOST)+k+".jpg"].filter(Boolean);
// a picture as a bitmap, off the page's thread, from the first file that comes
const PLAIN={premultiplyAlpha:"none",colorSpaceConversion:"none"};
async function bitmap(urls,opts=PLAIN){ let err;
  for(const u of urls) try{ const b=await grab(u,{as:"blob",waits:[10e3,20e3]}); return [await createImageBitmap(b,opts),b.size]; }catch(e){ err=e; }
  throw err; }

if(ON){
  THREE.DefaultLoadingManager.setURLModifier(u=>{ const k=keyOf(u); return k&&(midNow(k)||hasAvif.has(k)&&best(k))||u; });
  // A picture for the page's TextureLoaders: the bake's maps and the floorboards. A late one starts as its thumbnail, or the
  // MID the URL modifier gives it. A bake map comes as a bitmap, decoded off the page's thread (an <img> is decoded again, on it,
  // when it goes to the GPU, and an AVIF takes longer than a JPEG)
  const load0=THREE.TextureLoader.prototype.load;
  // (the files one after another, as an <img>, through a manager that doesn't swap the URL)
  const asIs=new THREE.LoadingManager();
  const plain=(L,t,urls,onLoad,onProg,onErr)=>{ const [u,...rest]=urls;
    new THREE.ImageLoader(asIs).setCrossOrigin(L.crossOrigin).load(u,im=>{ t.image=im; t.needsUpdate=true; onLoad?.(t); },onProg,e=>rest.length?setTimeout(()=>plain(L,t,rest,onLoad,onProg,onErr),600):onErr?.(e)); };
  THREE.TextureLoader.prototype.load=function(url,onLoad,onProg,onErr){
    const k=keyOf(url), d=lateNow(k);
    // (an <img> that fails is asked for again, then its other files: the window's photo, the reflections)
    const img=()=>{ const t=load0.call(this,url,onLoad,onProg,e=>k?setTimeout(()=>plain(this,t,files(k,true),onLoad,onProg,onErr),600):onErr?.(e)); return t; };
    if(d&&MID[k]){ const t=img(); d.ts.push(t); return t; }
    if(!d&&!(k?.startsWith("bake/")&&hasAvif.has(k))) return img();
    const t=new THREE.Texture(), done=im=>{ t.image=im; t.needsUpdate=true; onLoad?.(t); };
    pics.push((d?thumbsIn.then(()=>{ if(!thumbs[k]) throw 0; d.ts.push(t); return thumbBmp(k); }):
      bitmap(files(k)).then(r=>r[0]))
      .then(done).catch(()=>{ if(d) late.delete(k); plain(this,t,files(k),onLoad,onProg,onErr); }));
    return t; };
}

export const lean={
  // the page's own test for a phone
  use(phone){ isPhone=phone; },
  url(u){ const k=keyOf(u); return k&&(midNow(k)||hasAvif.has(k)&&best(k))||u; },
  // (before the scene is parsed: the thumbnails are in)
  ready:thumbsIn,
  // the bake's maps are in (a page without this module never waited for them, and they usually came first; now it's a close
  // race, and the room is built on them). At most WAIT ms.
  pics(){ return Promise.race([Promise.allSettled(pics),new Promise(r=>setTimeout(r,WAIT))]); },
  // a GLTFLoader that gives late pictures their thumbnail
  gltf(loader){
    // (the pictures a model waits for: asked for again, and the JPEG where the AVIF won't come, so that one can't hold the room)
    loader.register(parser=>{ if(parser.textureLoader?.isImageBitmapLoader) parser.textureLoader={isImageBitmapLoader:true,
      load(url,ok,prog,no){ const k=ON&&keyOf(url); bitmap(k?files(k,true):[THREE.DefaultLoadingManager.resolveURL(url)]).then(r=>ok(r[0]),no); }}; return {name:"lean:again"}; });
    if(ON) loader.register(parser=>({ name:"lean", loadTexture(i){
    const tex=parser.json.textures[i], im=parser.json.images?.[tex.source], k=im?.uri&&keyOf("gl/"+im.uri), d=lateNow(k); if(!d) return null;
    if(!thumbs[k]){ late.delete(k); return null; }
    const s=parser.json.samplers?.[tex.sampler]||{};
    return thumbBmp(k).then(bmp=>{ const t=new THREE.Texture(bmp); t.flipY=false; t.name=tex.name||im.name||""; t.userData.mimeType="image/jpeg"; t.needsUpdate=true;
      t.magFilter=s.magFilter===9728?THREE.NearestFilter:THREE.LinearFilter; t.minFilter={9728:THREE.NearestFilter,9729:THREE.LinearFilter,9984:THREE.NearestMipmapNearestFilter,9985:THREE.LinearMipmapNearestFilter,9986:THREE.NearestMipmapLinearFilter}[s.minFilter]??THREE.LinearMipmapLinearFilter;
      const w=m=>m===33071?THREE.ClampToEdgeWrapping:m===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping; t.wrapS=w(s.wrapS); t.wrapT=w(s.wrapT);
      parser.associations.set(t,{textures:i}); d.ts.push(t); return t; }); } })); return loader; },
  // The bytes of a glTF's buffer, as one part for the page's memGlb; null: the page reads its old parts
  async geo(name,g){
    if(!PACKED) return null;
    try{ const files=await (early[name]||model(name)); delete early[name]; const out=new Uint8Array(g.buffers[0].byteLength), SIZE={5120:1,5123:2}, N={SCALAR:1,VEC2:2,VEC3:3}; let left=g.accessors.length;
      for(const {bytes,list} of files) for(const [id,o,l] of list){ const a=g.accessors[id], v=g.bufferViews[a.bufferView]; if(a.count*SIZE[a.componentType]*N[a.type]!==l) throw new Error("another model's");
        out.set(bytes.subarray(o,o+l),(v.byteOffset||0)+(a.byteOffset||0)); left--; }
      if(left) throw new Error("not all of it");
      return [out]; }
    catch(e){ console.warn("lean: the packed geometry didn't come, the old parts will",e); return null; } },
  // The room is built: the late pictures now. scene: to find what else shows them (a glTF texture's clones, the books); fit: the
  // page's memFit, the small copy that stays in a texture's image once it's on the GPU
  start({scene,renderer,fit}){
    if(st.on) return; st.on=true; st.total=late.size; close();
    const by=new Map(); for(const d of late.values()) for(const t of d.ts) by.set(t.source,d);
    const books=late.get("books/atlas");
    scene.traverse(o=>{ for(const m of [o.material].flat()) if(m) for(const k in m){ const t=m[k]; if(!t?.isTexture) continue;
      if(t.name==="books_atlas"&&books&&!books.ts.includes(t)) books.ts.push(t);
      const d=by.get(t.source); if(d&&!d.ts.includes(t)) d.ts.push(t); } });
    const q=[...late.values()].filter(d=>d.ts.length&&!DROP.includes(d.k)); let inFlight=0;
    const pull=()=>{ while(inFlight<CONC&&q.length){ const d=q.shift(); inFlight++;
      bitmap(files(d.k),{...PLAIN,imageOrientation:d.ts[0].flipY?"flipY":"from-image"})
        .then(([bmp,size])=>{ st.bytes+=size; ready.push(()=>{
          for(const t of d.ts){ t.dispose(); t.flipY=false; t.source.data=bmp; t.needsUpdate=true; }
          for(const t of d.ts) renderer.initTexture(t);
          const c=fit(bmp,32,true); for(const t of d.ts) t.source.data=c; bmp.close(); st.done++; }); },
          e=>{ console.warn("lean: stays small",d.k,e); st.failed++; })
        .finally(()=>{ inFlight--; late.delete(d.k); pull(); }); } };
    st.left=()=>q.length+inFlight+ready.length; pull(); },
  // (the page's frame) one picture to the GPU, not while something is moving (quiet: nothing on screen would catch it)
  tick(now,quiet){ if(!ready.length||(!quiet&&now-lastUp<BUSY_MS)||now-lastUp<GAP_MS) return; lastUp=now; try{ ready.shift()(); }catch(e){ console.warn("lean",e); } },
  get state(){ return {on:ON,packed:PACKED,files:came,avif:avifOK,total:st.total,done:st.done,failed:st.failed,bytes:st.bytes,left:st.left()}; },
};
const WAIT=8000, CONC=3, GAP_MS=50, BUSY_MS=400, ready=[], st={on:false,total:0,done:0,failed:0,bytes:0,left:()=>0}; let lastUp=0;
