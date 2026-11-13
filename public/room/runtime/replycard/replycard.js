// The reply card on the open notebook (Felix, 28 Oct: "Could you put a physical reply card on top of the notebook? Then, when
// clicking on it, pull it up to the camera like the notepad or credits card"). It is the card from the subscribe page, printed
// as a real one and lying on the right-hand page. A click lifts it in front of the camera. There you write your address on
// it and send it, and Ghost posts the link. A click off it, or Esc, puts it back on the notebook.
//
// createReplyCard(THREE, ctx) takes the loaded room and returns the card's controller (null if there is no page to lie on, or if
// Ghost has sign-ups off: then the theme leaves its form out and the room has no card). Call it before the page joins the
// room's meshes (perf/join).
//   ctx.scene, ctx.root   the room (the notebook is binder_notebook_body)
//   ctx.interact          the page's pick map: the card joins it as {kind:"replycard"}
//   ctx.view()            the camera the room is drawn with, as it is this frame (the card floats in front of it)
//   ctx.audio()           {ctx, out} while the room has sound, else null
//   ctx.live(text)        the page's line for screen readers
//   ctx.reduce            prefers-reduced-motion: no flight, no bob
//   ctx.anisotropy        renderer.capabilities.getMaxAnisotropy()
//   ctx.changed(up)       called when it starts up or goes back down (the page's hint and pill)
//   ctx.close()           Esc while the address has the keys
// The form is a real one, so Ghost's Portal, the browser's autofill and screen readers all work on it: the theme puts #bm-sub in
// the page (Portal binds its forms once, when it loads, and the room's markup comes later than that), and its field and button
// lie transparent over their places on the floating card, which draws what they hold. Outside Ghost (the room's own preview) the
// module makes the form itself, and sending it sends nothing.
// The controller: lift(instant), lower(instant), up (floating or on its way up), busy (moving), mode, frame(dt, t) once a frame
// after the view is final, at(x, y) (is a client point on the floating card), write() (the address gets the keys), key() (a
// key pressed while the room has the keys), tip(), url (the subscribe page, for phones), toScreen(px, py), form, field, button,
// and for tests: sent, state, canvas, mesh.
const W_M=.124, H_M=.088;   // the page is 13.7 cm wide, and a postcard's shape
const PAGE={x0:-.1345,x1:.0025,z0:-.0925,z1:.0925,y:.0115}, SPOT={x:-.066,z:.034}, TURN=.07;   // the top sheet, in the notebook's frame; where the card lies on it
const CW=1500, CH=Math.round(CW*H_M/W_M), MID=CW/2;
const PAPER="#f4f1e7", INK="#1c1b22", BLUE="#2a45c8", PEN="#16247e", FAINT="#514e58", RED="#b3302a";
const X0=MID+62, X1=CW-66;
const FIELD={x0:X0,x1:X1,y0:560,y1:690,base:668}, BTN={x0:X1-296,x1:X1,y0:728,y1:826}, LINK={x0:X0-8,x1:X0+400,y0:808,y1:872};

export function createReplyCard(THREE, ctx){
  const V3=THREE.Vector3, Q4=THREE.Quaternion, M4=THREE.Matrix4;
  const {scene, root}=ctx;
  const book=root.getObjectByName("binder_notebook_body");
  if(!book||!book.geometry||Array.isArray(book.material)) return null;
  const form=sheet(); if(!form) return null;
  const field=form.querySelector("[data-members-email]"), button=form.querySelector("button"), errEl=form.querySelector("[data-members-error]");
  // a member's card is already filled in and postmarked (Felix, 28 Oct), and its link is Portal's account page
  const member=form.dataset.member||"";
  if(member){ field.value=member; field.readOnly=true; form.addEventListener("submit",e=>e.preventDefault()); }
  scene.updateMatrixWorld(true);

  // ---- the page: the top sheet of the notebook's right side, a slightly lumpy stack of paper. Its faces give the height the card
  // lies at and the light: the card gets the light-map UV of the paper under it, so it lies in the page's light, lamps off
  // included, with no re-bake. All of it in the notebook's own frame (x along the page, z toward the room)
  const g=book.geometry, pa=g.attributes.position, U1=g.attributes.uv1||g.attributes.uv, ix=g.index?g.index.array:null, tops=[];
  const a=new V3(), b=new V3(), c=new V3(), e1=new V3(), e2=new V3();
  const inPage=v=>v.x>PAGE.x0-.002&&v.x<PAGE.x1+.002&&v.z>PAGE.z0-.002&&v.z<PAGE.z1+.002&&v.y>PAGE.y;
  for(let t=0,n=ix?ix.length:pa.count;t+2<n;t+=3){ const i=[0,1,2].map(k=>ix?ix[t+k]:t+k);
    a.fromBufferAttribute(pa,i[0]); b.fromBufferAttribute(pa,i[1]); c.fromBufferAttribute(pa,i[2]);
    e1.subVectors(b,a).cross(e2.subVectors(c,a)); const area=e1.length()/2; if(area<1e-6||e1.y<0||e1.y/(2*area)<.96||!(inPage(a)&&inPage(b)&&inPage(c))) continue;
    tops.push({i,p:[a.clone(),b.clone(),c.clone()]}); }
  if(tops.length<8) return null;
  // the highest face at a point of the page: its height and light-map UV
  function under(x,z){ let best=null;
    for(const T of tops){ const [p,q,r]=T.p, d=(q.z-r.z)*(p.x-r.x)+(r.x-q.x)*(p.z-r.z); if(!d) continue;
      const u=((q.z-r.z)*(x-r.x)+(r.x-q.x)*(z-r.z))/d, v=((r.z-p.z)*(x-r.x)+(p.x-r.x)*(z-r.z))/d, w=1-u-v; if(u<-1e-4||v<-1e-4||w<-1e-4) continue;
      const y=u*p.y+v*q.y+w*r.y; if(!best||y>best.y) best={y,uv:[0,1].map(k=>{ const A=k?"getY":"getX"; return u*U1[A](T.i[0])+v*U1[A](T.i[1])+w*U1[A](T.i[2]); })}; }
    return best; }
  // the card lies on the near half, turned a little off the page's own square, the way a card lands when it's dropped
  const bookQ=new Q4(), bookP=new V3(), bookS=new V3(); book.matrixWorld.decompose(bookP,bookQ,bookS);
  const lq=new Q4().setFromAxisAngle(new V3(0,1,0),TURN).multiply(new Q4().setFromAxisAngle(new V3(1,0,0),-Math.PI/2));
  const restQ=bookQ.clone().multiply(lq), toBook=new V3();
  const NX=14, NY=10;
  let high=-Infinity;   // (the highest paper under it: it lies on that)
  for(let j=0;j<=NY;j++) for(let i=0;i<=NX;i++){ const u=i/NX, v=j/NY; toBook.set((u-.5)*W_M,(.5-v)*H_M,0).applyQuaternion(lq); toBook.x+=SPOT.x; toBook.z+=SPOT.z;
    const h=under(toBook.x,toBook.z); if(h) high=Math.max(high,h.y); }
  if(!isFinite(high)) return null;
  const restC=new V3(SPOT.x,high+.0005,SPOT.z).applyMatrix4(book.matrixWorld), top=restC.y;
  // (one spot's light for the whole card: the page is several charts of the light map, and a grid across two sweeps over the atlas)
  const lit=under(SPOT.x,SPOT.z); if(!lit) return null;

  // ---- the card as a grid in a frame of its own: origin in its middle, x to the right, y up, z out of the front. A little
  // tiredness in one corner keeps it from being a sticker
  const pos=[], nrm=[], uv=[], uv1=[], idx=[];
  const curl=(u,v)=>{ const d=Math.max(0,1-Math.hypot(1-u,v)*1.6); return .0018*d*d*d; };
  for(let j=0;j<=NY;j++) for(let i=0;i<=NX;i++){ const u=i/NX, v=j/NY;
    pos.push((u-.5)*W_M,(.5-v)*H_M,curl(u,v)); nrm.push(0,0,1); uv.push(u,v); uv1.push(lit.uv[0],lit.uv[1]); }
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){ const p=j*(NX+1)+i, q=p+1, r=p+NX+1, s=r+1; idx.push(p,r,q, q,r,s); }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute("normal",new THREE.Float32BufferAttribute(nrm,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2)); geo.setAttribute("uv1",new THREE.Float32BufferAttribute(uv1,2));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();

  // ---- the print, drawn once the fonts are in
  const cv=document.createElement("canvas"); cv.width=CW; cv.height=CH;
  const tex=new THREE.CanvasTexture(cv); tex.flipY=false; tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=ctx.anisotropy||8;
  const rng=seed=>()=>((seed=Math.imul(seed^seed>>>15,seed|1)+0x6D2B79F5|0,((seed^seed>>>7)>>>0)/4294967296));
  const HEAD=px=>`extra-condensed 860 ${px}px Archivo, Impact, sans-serif`, BOLD=px=>`semi-condensed 800 ${px}px Archivo, sans-serif`;
  const BODY=px=>`500 ${px}px Archivo, sans-serif`, OSD=px=>`${px}px VT323, monospace`, HAND=px=>`600 ${px}px Caveat, cursive`;
  const spaced=(g,text,x,y,gap)=>{ for(const ch of text){ g.fillText(ch,x,y); x+=g.measureText(ch).width+gap; } return x; };
  function wrapped(g,text,x,y,max,lh){ let line=""; const out=[];
    for(const w of text.split(" ")){ const t=line?line+" "+w:w; if(g.measureText(t).width>max&&line){ out.push(line); line=w; } else line=t; }
    out.push(line); out.forEach((l,i)=>g.fillText(l,x,y+i*lh)); return out.length; }
  let print=null;
  function printed(){
    const c=document.createElement("canvas"); c.width=CW; c.height=CH; const g=c.getContext("2d"), r=rng(23);
    g.fillStyle=PAPER; g.fillRect(0,0,CW,CH);
    for(let i=0;i<7000;i++){ const x=r()*CW,y=r()*CH,l=r()<.6; g.fillStyle=l?`rgba(255,255,250,${.12+r()*.12})`:`rgba(110,100,80,${.03+r()*.05})`; g.fillRect(x,y,1+r()*2.2,1); }
    // the rave print's stipple, coming up out of the bottom left corner
    g.fillStyle=BLUE; for(let y=CH-340;y<CH;y+=9) for(let x=(y%18?4:0);x<MID;x+=9){ const d=Math.hypot(x/MID,(CH-y)/340), k=1-d; if(k<=0) continue;
      g.globalAlpha=.6*Math.min(1,k*2); g.beginPath(); g.arc(x,y,1.5+k*1.6,0,7); g.fill(); }
    g.globalAlpha=1;
    g.fillStyle="rgba(28,27,34,.28)"; g.fillRect(MID-1,0,2,CH);
    g.textBaseline="alphabetic"; g.fillStyle=BLUE; g.font=OSD(46); spaced(g,"REPLY CARD",72,118,5);
    g.fillStyle=INK; let px=156; g.font=HEAD(px); while(px>90&&g.measureText("ME NEW POSTS").width>MID-136){ px-=4; g.font=HEAD(px); }
    g.fillText("YES, EMAIL",70,118+px*1.02); g.fillText("ME NEW POSTS",70,118+px*1.94);
    let y=118+px*1.94+92; g.font=BODY(35);
    for(const t of ["New posts as soon as they're published","Only a few times a year"]){ g.strokeStyle=INK; g.lineWidth=3.5; g.fillStyle=PAPER; g.fillRect(72,y-29,36,36); g.strokeRect(72,y-29,36,36);
      g.fillStyle=BLUE; g.font=HAND(66); g.fillText("✓",73,y+6); g.fillStyle=INK; g.font=BODY(35); const n=wrapped(g,t,128,y,MID-200,44); y+=n*44+16; }
    // the stamp: perforated, on its own blue
    const sx=X1-166, sy=56, sw=166, sh=198, gap=16.5;
    g.fillStyle=BLUE; g.fillRect(sx,sy,sw,sh); g.fillStyle=PAPER;
    for(let i=0;i<=10;i++) for(const yy of [sy,sy+sh]){ g.beginPath(); g.arc(sx+i*sw/10,yy,5.6,0,7); g.fill(); }
    for(let i=0;i<=12;i++) for(const xx of [sx,sx+sw]){ g.beginPath(); g.arc(xx,sy+i*sh/12,5.6,0,7); g.fill(); }
    g.fillStyle="#fff"; g.font=BOLD(31); g.textAlign="center"; ["NO","STAMP","NEEDED"].forEach((t,i)=>g.fillText(t,sx+sw/2,sy+66+i*37)); g.textAlign="left";
    g.fillStyle=FAINT; g.font=OSD(42); spaced(g,"Deliver to",X0,520,3);
    g.fillStyle="rgba(28,27,34,.34)"; g.fillRect(X0,FIELD.base+24,X1-X0,3);
    g.fillStyle=FAINT; g.font=OSD(32); g.fillText("Free, and every email has an unsubscribe link.",X0,CH-52);
    return c; }
  // the postmark: FELIXRIESEBERG.COM around a ring, RECEIVED across it, a little dry where the ink didn't take
  function postmark(){
    const s=430, c=document.createElement("canvas"); c.width=c.height=s; const g=c.getContext("2d"), m=s/2, r=rng(5), R=166;
    g.strokeStyle=g.fillStyle=PEN; g.lineWidth=6; g.beginPath(); g.arc(m,m,R,0,7); g.stroke(); g.lineWidth=3; g.beginPath(); g.arc(m,m,R-54,0,7); g.stroke();
    g.font=BOLD(36); g.textAlign="center"; const text="FELIXRIESEBERG.COM · FELIXRIESEBERG.COM · ", n=text.length;
    [...text].forEach((ch,i)=>{ g.save(); g.translate(m,m); g.rotate(i/n*Math.PI*2); g.fillText(ch,0,-R+42); g.restore(); });
    g.font=HEAD(84); g.fillText("RECEIVED",m,m+29);
    g.lineWidth=4; for(const yy of [m-52,m+56]){ g.beginPath(); for(let x=m-104;x<=m+104;x+=6) g.lineTo(x,yy+Math.sin(x*.09)*5); g.stroke(); }
    g.globalCompositeOperation="destination-out"; for(let i=0;i<2600;i++){ g.fillStyle=`rgba(0,0,0,${.3+r()*.7})`; g.beginPath(); g.arc(r()*s,r()*s,.6+r()*2.2,0,7); g.fill(); }
    return c; }
  let mark=null, fontsOk=false, hoverBtn=false, focusBtn=false, caret=false, sentAt=-1, stampU=1;

  const STATE=()=>member||form.classList.contains("success")?"sent":form.classList.contains("loading")?"sending":form.classList.contains("error")?"error":"idle";
  function fit(g,text,max){ let px=74; g.font=HAND(px); while(px>30&&g.measureText(text).width>max){ px-=2; g.font=HAND(px); } return px; }
  function draw(){
    const s=cv.getContext("2d"), st=STATE();
    print=print||printed();
    s.globalAlpha=1; s.drawImage(print,0,0); s.textBaseline="alphabetic";
    // the address, in the visitor's pen; the placeholder is the card's own print, faint
    const v=field.value, x=X0+4, max=X1-X0-10;
    s.fillStyle=v?PEN:"rgba(106,102,114,.62)"; fit(s,v||"you@example.com",max); s.fillText(v||"you@example.com",x,FIELD.base);
    if(v&&field.selectionStart!==field.selectionEnd){ const a=s.measureText(v.slice(0,field.selectionStart)).width, b=s.measureText(v.slice(0,field.selectionEnd)).width;
      s.fillStyle="rgba(42,69,200,.2)"; s.fillRect(x+a,FIELD.base-58,b-a,76); }
    if(caret&&st!=="sent"&&st!=="sending"){ const w=v?s.measureText(v.slice(0,field.selectionStart??v.length)).width:0; s.fillStyle=PEN; s.fillRect(x+w+2,FIELD.base-54,3.5,68); }
    if(st!=="sent"){   // the button, printed on the card
      s.fillStyle=hoverBtn||focusBtn?"#3657e0":BLUE; s.fillRect(BTN.x0,BTN.y0,BTN.x1-BTN.x0,BTN.y1-BTN.y0);
      if(focusBtn){ s.strokeStyle=PEN; s.lineWidth=4; s.strokeRect(BTN.x0-9,BTN.y0-9,BTN.x1-BTN.x0+18,BTN.y1-BTN.y0+18); }
      s.fillStyle="#fff"; s.font=BOLD(42); s.textAlign="center"; spaced0(s,st==="sending"?"POSTING…":"SEND CARD",(BTN.x0+BTN.x1)/2,BTN.y0+64); s.textAlign="left"; }
    if(member){ s.fillStyle=hoverBtn||focusBtn?BLUE:PEN; s.font=HAND(46); s.fillText("Change or unsubscribe",X0,LINK.y1-16); s.fillRect(X0,LINK.y1-8,s.measureText("Change or unsubscribe").width,2.5); }
    const msg=member?"You're on the list.":st==="sent"?"Check your inbox. One link to confirm, then you're on the list.":st==="error"?(errEl&&errEl.textContent)||"That didn't go through. Try again?":"";
    if(msg){ s.fillStyle=st==="error"?RED:PEN; s.font=HAND(50); wrapped(s,msg,X0,st==="sent"?770:878,X1-X0,56); }
    if(st==="sent"){ mark=mark||postmark(); const u=stampU, k=1.3-.3*u; s.save(); s.globalAlpha=.86*Math.min(1,u*1.4); s.translate(X1-330,176); s.rotate(THREE.MathUtils.degToRad(-11)); s.scale(k,k); s.drawImage(mark,-215,-215); s.restore(); }
    tex.needsUpdate=true; }
  const spaced0=(g,text,cx,y)=>g.fillText(text,cx,y);
  const fontLoad=Promise.all([HEAD(120),BOLD(40),BODY(35),OSD(46),HAND(66)].map(f=>document.fonts?document.fonts.load(f,"Reply✓"):Promise.resolve())).catch(()=>{});
  const fontsIn=()=>{ if(fontsOk) return; fontsOk=true; print=null; draw(); };
  fontLoad.then(fontsIn); setTimeout(fontsIn,4000);   // (fonts blocked: print it in the fallback)
  draw();

  // ---- materials: the notebook's paper with its bake, the print as its map. On the page it has the paper's light; lifted, it goes
  // over to an even light in the bake's colour, as the credits card does, so it reads with the lamps on or off
  const LIFT={value:0}, LIGHT={value:.82};
  const m0=book.material, bakeFn=m0.onBeforeCompile, key0=m0.customProgramCacheKey;
  const mat=m0.clone(); mat.side=THREE.FrontSide;
  mat.onBeforeCompile=(sh,r)=>{ bakeFn&&bakeFn.call(mat,sh,r); sh.uniforms.cardLift=LIFT; sh.uniforms.cardLight=LIGHT;
    const f=sh.fragmentShader, e=f.match(/vec3 e=\([^;]*;/);
    if(e) sh.fragmentShader="uniform float cardLift,cardLight;\n"+f.replace(e[0],e[0]+"\n        e=mix(e,mix(e*(cardLight/max(dot(e,vec3(.2126,.7152,.0722)),1e-4)),vec3(1.13,1.,.8)*cardLight,.85),cardLift);"); };
  mat.customProgramCacheKey=()=>"replycard"+(key0?key0.call(m0):"");
  Object.assign(mat,{map:tex,normalMap:null,roughnessMap:null,metalnessMap:null,aoMap:null,roughness:.95,metalness:0,envMapIntensity:.12});
  mat.color.setScalar(.92);
  const mesh=new THREE.Mesh(geo,mat); mesh.name="reply_card"; mesh.castShadow=mesh.receiveShadow=false;
  mesh.position.copy(restC); mesh.quaternion.copy(restQ); scene.add(mesh); mesh.updateMatrixWorld(true);
  ctx.interact.set(mesh,{kind:"replycard",label:"SUBSCRIBE"});
  // the small shadow it throws on the page, a soft-edged sheet just under it; it stays behind when the card goes
  const shCv=document.createElement("canvas"); shCv.width=256; shCv.height=192;
  { const g=shCv.getContext("2d"); g.filter="blur(9px)"; g.fillStyle="#000"; g.fillRect(22,20,212,158); }
  const shTex=new THREE.CanvasTexture(shCv), SK=1.24;
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(W_M*SK,H_M*SK),new THREE.MeshBasicMaterial({map:shTex,color:0x1a1008,transparent:true,opacity:.34,depthWrite:false,toneMapped:false}));
  shadow.name="reply_card_shadow"; shadow.position.copy(restC).setY(top-.0002); shadow.position.x-=.0006; shadow.position.z+=.0009; shadow.quaternion.copy(restQ); shadow.raycast=()=>{}; shadow.castShadow=shadow.receiveShadow=false; scene.add(shadow);

  // ---- clicked as a whole: its box instead of its triangles (see desk-pager)
  { const bx=new THREE.Box3(new V3(-W_M/2,-H_M/2,-.0015),new V3(W_M/2,H_M/2,.0035)), ray=new THREE.Ray(), at=new V3(), im=new M4();
    mesh.raycast=function(rc,hits){ if(ray.copy(rc.ray).applyMatrix4(im.copy(this.matrixWorld).invert()).intersectBox(bx,at)===null) return;
      const point=at.clone().applyMatrix4(this.matrixWorld), distance=rc.ray.origin.distanceTo(point); if(distance>=rc.near&&distance<=rc.far) hits.push({distance,point,object:this}); }; }

  // ---- where it floats and how it gets there: as the credits card, on the right of the picture, big enough to write on
  function size(){ const W=innerWidth, H=innerHeight; let w=Math.min(W*.47,820,(H-190)*W_M/H_M); w=Math.max(w,Math.min(400,W-80));
    return {w,h:w*H_M/W_M,cx:W-46-w/2,cy:H/2+8}; }
  const _n=new V3(), _d=new V3(), _f=new V3(), _u=new V3(), _r=new V3(), _q=new Q4(), _e=new THREE.Euler();
  function floatPose(T,outC,outQ){
    const cam=ctx.view(); cam.updateMatrixWorld();
    const s=size(), W=innerWidth, H=innerHeight, tv=Math.tan(THREE.MathUtils.degToRad(cam.fov/2));
    const d=H_M*H/(2*tv*s.h);
    _n.set(s.cx/W*2-1,-(s.cy/H*2-1),.5).unproject(cam); _d.subVectors(_n,cam.position).normalize();
    _f.set(0,0,-1).applyQuaternion(cam.quaternion); _u.set(0,1,0).applyQuaternion(cam.quaternion); _r.set(1,0,0).applyQuaternion(cam.quaternion);
    outC.copy(cam.position).addScaledVector(_d,d/_d.dot(_f));
    const side=Math.atan2(_d.dot(_r),_d.dot(_f)), bob=ctx.reduce||writing()?0:1;   // (it holds still while it's being written on)
    outC.addScaledVector(_u,Math.sin(T*.8)*.0004*bob).addScaledVector(_r,Math.sin(T*.53+1)*.00025*bob);
    _e.set(THREE.MathUtils.degToRad(-3.5)+Math.sin(T*.61)*.005*bob,-side*.12,THREE.MathUtils.degToRad(-.6)+Math.sin(T*.43+2)*.003*bob,"ZYX");
    outQ.copy(cam.quaternion).multiply(_q.setFromEuler(_e));
  }
  let mode="down", u=0, held=false; const fromC=new V3(), fromQ=new Q4(), fc=new V3(), fq=new Q4(), p1=new V3(), p2=new V3(), topP=new V3(), cur=new V3();
  const UP=.95, DOWN=.8, upW=new V3(0,1,0), PICK=.3;
  topP.copy(restC).addScaledVector(upW,.05);
  const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2, sm=x=>x*x*(3-2*x), win=(a,b,x)=>x<=a?0:x>=b?1:.5-.5*Math.cos(Math.PI*(x-a)/(b-a));
  const bez=(o,a,b,c,d,t)=>{ const s=1-t; return o.set(0,0,0).addScaledVector(a,s*s*s).addScaledVector(b,3*s*s*t).addScaledVector(c,3*s*t*t).addScaledVector(d,t*t*t); };
  function place(c,q){ mesh.position.copy(c); mesh.quaternion.copy(q); mesh.updateMatrixWorld(); }
  let floating=false;
  function setFloat(f){ if(f===floating) return; floating=f; mat.depthFunc=f?THREE.AlwaysDepth:THREE.LessEqualDepth; mesh.renderOrder=f?21:0; }
  const settle=()=>{ LIFT.value=Math.min(1,mesh.position.distanceTo(restC)/.08); };
  const writing=()=>mode==="up"&&document.activeElement===field;

  // ---- the form, over the card: its field and button lie where the card shows them, and draw nothing of their own
  function overlay(){ for(const [el,r] of [[field,FIELD],[button,member?LINK:BTN]]){ const a=toScreen(r.x0,r.y0), b=toScreen(r.x1,r.y1), c=toScreen(r.x0,r.y1), d=toScreen(r.x1,r.y0);
      const x0=Math.min(a.x,c.x), x1=Math.max(b.x,d.x), y0=Math.min(a.y,d.y), y1=Math.max(b.y,c.y);
      Object.assign(el.style,{left:x0+"px",top:y0+"px",width:x1-x0+"px",height:y1-y0+"px"}); } }
  function showForm(on){ form.style.visibility=on?"visible":"hidden"; if(on) overlay(); else { caret=false; field.blur(); button.blur(); hoverBtn=focusBtn=false; } draw(); }
  field.addEventListener("input",()=>{ scratch(); caretOn(); draw(); });
  field.addEventListener("focus",caretOn); field.addEventListener("blur",()=>{ caret=false; draw(); });
  document.addEventListener("selectionchange",()=>{ if(document.activeElement===field) draw(); });
  button.addEventListener("pointerenter",()=>{ hoverBtn=true; draw(); }); button.addEventListener("pointerleave",()=>{ hoverBtn=false; draw(); });
  button.addEventListener("focus",()=>{ focusBtn=true; draw(); }); button.addEventListener("blur",()=>{ focusBtn=false; draw(); });
  form.addEventListener("keydown",e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); ctx.close(); } });
  let blink=0; function caretOn(){ caret=true; blink=0; }
  // what Portal does to the form shows on the card
  new MutationObserver(()=>{ const st=STATE(); if(st===last) return; last=st;
    if(st==="sent"){ sentAt=performance.now(); stampU=ctx.reduce?1:0; field.readOnly=true; button.disabled=true; button.style.visibility="hidden"; field.blur(); sound("stamp"); ctx.live("Card sent. Check your inbox."); }
    if(st==="error") ctx.live((errEl&&errEl.textContent)||"That didn't go through.");
    draw(); }).observe(form,{attributes:true,attributeFilter:["class"]});
  let last=STATE();

  function lift(instant){ if(mode==="up"||mode==="rising") return;
    fromC.copy(mesh.position); fromQ.copy(mesh.quaternion); slide=mode==="down"?PICK:0;
    if(instant||ctx.reduce){ mode="rising"; u=1; } else { mode="rising"; u=0; sound("pick"); }
    ctx.changed&&ctx.changed(true); }
  function lower(instant){ if(mode==="down"||mode==="falling") return; showForm(false); fromC.copy(mesh.position); fromQ.copy(mesh.quaternion);
    if(instant||ctx.reduce){ mode="down"; u=1; place(restC,restQ); setFloat(false); settle(); } else { mode="falling"; u=0; sound("back"); }
    ctx.changed&&ctx.changed(false); }
  let slide=0;
  function frame(dt,T){
    if(stampU<1){ stampU=Math.min(1,stampU+dt/.16); draw(); }
    if(mode==="down") return;
    if(held) dt=0;
    floatPose(T,fc,fq);
    if(mode==="up"){ place(fc,fq); setFloat(true); if(writing()&&(blink+=dt)>.53){ blink=0; caret=!caret; draw(); } }
    else if(mode==="rising"){ u=Math.min(1,u+dt/UP);
      if(u<slide){ place(cur.copy(fromC).lerp(topP,sm(u/slide)),restQ); setFloat(false); }
      else { const a=slide?topP:fromC, e=ease((u-slide)/(1-slide));
        p1.copy(a).addScaledVector(slide?upW:_f,slide?.04:-.03); p2.copy(fc).addScaledVector(_f,.06);
        place(bez(cur,a,p1,p2,fc,e),_q.slerpQuaternions(slide?restQ:fromQ,fq,win(slide,.92,u))); setFloat(u>slide+.1); }
      if(u>=1){ mode="up"; place(fc,fq); showForm(true); write(); } }
    else if(mode==="falling"){ u=Math.min(1,u+dt/DOWN); const b=.7;
      if(u<b){ const e=ease(u/b); p1.copy(fromC).addScaledVector(_f,.05); p2.copy(topP).addScaledVector(upW,.04);
        place(bez(cur,fromC,p1,p2,topP,e),_q.slerpQuaternions(fromQ,restQ,win(0,.85,u/b))); setFloat(u<b*.7); }
      else { place(cur.copy(topP).lerp(restC,sm((u-b)/(1-b))),restQ); setFloat(false); }
      if(u>=1){ mode="down"; place(restC,restQ); setFloat(false); sound("land"); } }
    settle();
  }
  // the address gets the keys, unless the card has gone
  function write(){ if(mode==="up"&&STATE()!=="sent") field.focus({preventScroll:true}); }

  // ---- sounds, only with sound on: paper off paper, a pen, the postmark coming down
  let noise=null;
  function burst(a,t,f,q,amp,att,dur,type="bandpass"){ const ac=a.ctx, s=ac.createBufferSource(), fl=ac.createBiquadFilter(), g=ac.createGain();
    s.buffer=noise; fl.type=type; fl.frequency.value=f; fl.Q.value=q; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(amp,t+att); g.gain.exponentialRampToValueAtTime(.0001,t+att+dur);
    s.connect(fl).connect(g).connect(a.out); s.start(t,Math.random()*.5); s.stop(t+att+dur+.05); }
  function sound(kind){ const a=ctx.audio&&ctx.audio(); if(!a) return; const ac=a.ctx, t=ac.currentTime+.01;
    if(!noise){ noise=ac.createBuffer(1,ac.sampleRate,ac.sampleRate); const d=noise.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
    if(kind==="pick"){ burst(a,t,3400,.9,.05,.02,.14); burst(a,t+.1,2000,.7,.04,.06,.26); }
    else if(kind==="back"){ burst(a,t,2600,.9,.04,.05,.2); }
    else if(kind==="land"){ burst(a,t,1500,1.2,.08,.006,.07); burst(a,t,500,1,.05,.004,.06,"lowpass"); }
    else if(kind==="pen"){ burst(a,t,4200+Math.random()*1800,2.4,.016,.004,.035); }
    else if(kind==="stamp"){ burst(a,t,240,1,.34,.004,.11,"lowpass"); burst(a,t,1700,1.4,.09,.002,.04); burst(a,t+.05,900,1,.05,.003,.05); } }
  function scratch(){ sound("pen"); }

  // ---- the pointer
  const ray=new THREE.Raycaster(), ptr=new V3(), im=new M4();
  function at(x,y){ ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,-(y/innerHeight)*2+1),ctx.view());
    const r=ray.ray.clone().applyMatrix4(im.copy(mesh.matrixWorld).invert()), t=-r.origin.z/r.direction.z; if(!(t>0)) return false;
    r.at(t,ptr); return Math.abs(ptr.x)<=W_M/2&&Math.abs(ptr.y)<=H_M/2; }
  function tip(){ return mode==="up"?"":mode==="rising"?"":"SUBSCRIBE"; }
  function toScreen(px,py){ const v=new V3((px/CW-.5)*W_M,(.5-py/CH)*H_M,0).applyMatrix4(mesh.matrixWorld).project(ctx.view());
    return {x:(v.x*.5+.5)*innerWidth,y:(-v.y*.5+.5)*innerHeight}; }
  addEventListener("resize",()=>{ if(mode==="up") requestAnimationFrame(overlay); });

  return {mesh,shadow,lift,lower,frame,at,tip,write,toScreen,form,field,button,canvas:cv,
    key(){ write(); },   // (a key while the room has them: it lands in the address)
    get up(){ return mode==="up"||mode==="rising"; }, get busy(){ return mode==="rising"||mode==="falling"; }, get mode(){ return mode; },
    get state(){ return STATE(); }, get sent(){ return STATE()==="sent"; }, get floating(){ return floating; }, size, url:new URL("/subscribe/",location.href).href, FIELD, BTN,
    get lit(){ return LIFT.value; }, set hold(v){ held=v; }, redraw:draw, top };
}

// The form the card shows. In Ghost the theme has put it in the page, or left it out when sign-ups are off. Outside Ghost (the room
// as an Artifact) there are no members to sign up: this makes one for the look of the thing, which posts nothing.
function sheet(){
  let f=document.getElementById("bm-sub");
  if(!f&&window.__BM) return null;
  if(!f){ f=document.createElement("form"); f.id="bm-sub"; f.setAttribute("aria-label","Subscribe"); if(/[?&]member=1\b/.test(location.search)) f.dataset.member="you@example.com";   // (?member=1: a member's card)
    f.innerHTML=`<label for="bm-sub-email">Your email</label><input id="bm-sub-email" data-members-email type="email" required autocomplete="email" spellcheck="false"><button type="submit">Send card</button><p role="alert" data-members-error></p>`;
    f.addEventListener("submit",e=>{ e.preventDefault(); f.classList.add("loading"); setTimeout(()=>{ f.classList.remove("loading"); f.classList.add("success"); },700); });
    document.body.append(f); }
  f.style.cssText="position:fixed;left:0;top:0;width:0;height:0;margin:0;z-index:4;visibility:hidden";
  for(const el of f.querySelectorAll("label,p")) el.style.cssText="position:fixed;left:0;top:0;width:1px;height:1px;margin:0;overflow:hidden;clip-path:inset(50%)";
  for(const el of f.querySelectorAll("input,button")) el.style.cssText="position:fixed;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;opacity:0;outline:0;font-size:16px;cursor:"+(el.tagName==="INPUT"?"text":"pointer");
  return f;
}
