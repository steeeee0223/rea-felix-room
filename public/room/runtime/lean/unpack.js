// lean/unpack.js: the packed geometry (lean/geo/*.bin, made by tools/geo.mjs) back to the bytes of the glTF's buffer, exactly. It
// runs in a worker (lean.js starts them; on the page where a worker can't start). A file is a few of the room's meshes, gzipped:
//   u32      how long the JSON after it is
//   JSON     f: FORMAT, p: a row for each mesh (see ROW), s: how long each stream of bytes is
//   streams  what's left to say of the meshes once as much as possible has been guessed from what's known already
// What's guessed, mesh by mesh. The order of the vertices and of the triangles stays the file's own:
//   triangles   Vertices are numbered as the triangles come to them, and half of them only exist because the light map or a sharp
//               edge cuts there: they sit where another one does ("spot"). A corner is a new spot, the spot across an edge that has
//               one triangle so far, one of the last corners, or (rarely) a number; then a new vertex on it or one it has
//   positions   a spot's, from the triangle across the edge (a parallelogram)
//   normals     from the triangles around it, or one that's there already
//   uv          laid out as the triangle is in 3D, or as another vertex on the same spot has it
// The writer (tools/geo.mjs) runs these same functions with the real numbers (src) and notes where the guess was off, so both
// sides have to come to the same guess in any browser: only + - * / and square roots here, which every engine rounds alike.
// FORMAT goes up with any change to a guess or a stream (then tools/geo.mjs again; check.py says when this file is newer).
export const FORMAT=1, STREAMS=32, ROW=["n","tris","index","position","normal","uv0","uv1","same","sx","sy","sz"];
const TRI=0, MANY=1, REF=2, POS=5, STEP=8, NTOK=11, NRES=12, UV=[13,22], NEW=0, FAR=250, HIST=12, OPEN=20;

// the reader: a symbol, or a difference (one byte, or three) of 16-bit numbers
export class Reader{
  constructor(streams){ this.s=streams; this.p=new Int32Array(STREAMS); }
  sym(s){ return this.s[s][this.p[s]++]; }
  diff(s){ let z=this.sym(s); if(z===255) z=this.sym(s+1)|this.sym(s+2)<<8; return z&1?-((z+1)>>1):z>>1; } }

// the triangles. spot: each vertex's; across: for a corner, the corner on the other side of the edge facing it (-1: none yet when
// this triangle came); before: the vertex on the same spot that came before this one (-1: the first); first: a spot's first corner
export function triangles(io,n,tris,src){
  const index=new Uint16Array(tris*3), spot=new Int32Array(n), across=new Int32Array(tris*3).fill(-1), first=new Int32Array(n), before=new Int32Array(n).fill(-1), last=new Int32Array(n);
  // edges with one triangle so far: each spot's, a list
  const head=new Int32Array(n).fill(-1), next=new Int32Array(tris*3), to=new Int32Array(tris*3), face=new Int32Array(tris*3); let used=0, free=-1;
  const hist=new Int32Array(HIST), w=new Int32Array(3); let verts=0, spots=0;
  for(let t=0;t<tris;t++){
    for(let c=0;c<3;c++){ const k=t*3+c; let code=NEW, vc=0, s=0, v=0;
      if(src){ v=src.index[k]; s=src.spot[v];
        if(s!==spots){ code=0; let r=1;
          if(c) for(let e=head[w[c-1]];e>=0&&!code&&r<OPEN;e=next[e],r++) if(to[e]===s) code=r;
          for(let h=0;h<HIST&&!code;h++,r++) if(hist[h]===s) code=r;
          if(v!==verts){ vc=1; for(let x=last[s];x!==v;x=before[x]) vc++; }
          code=(code?(code-1)*3+1:FAR)+Math.min(vc,2); } }
      code=io.sym(TRI,code);
      if(code===NEW){ s=spots++; v=verts++; first[s]=k; last[s]=v; }
      else {
        const far=code>=FAR, m=far?code-FAR:(code-1)%3;
        if(m===2) vc=io.sym(MANY,vc); else vc=m;
        if(far) s=(spots-1+io.diff(REF,src?s-spots+1:0))&65535;
        else { let r=((code-1)/3|0)+1, at=-1; if(c){ let q=1; for(let e=head[w[c-1]];e>=0&&q<OPEN;e=next[e],q++) if(--r===0){ at=to[e]; break; } } s=r>0?hist[r-1]:at; }
        if(vc===0){ v=verts++; before[v]=last[s]; last[s]=v; } else { v=last[s]; while(--vc) v=before[v]; } }
      w[c]=s; spot[v]=s; index[k]=v; }
    for(let h=HIST-1;h>2;h--) hist[h]=hist[h-3]; hist[0]=w[2]; hist[1]=w[1]; hist[2]=w[0];
    for(let c=0;c<3;c++){ const a=w[c], b=w[c===2?0:c+1], k=t*3+(c===0?2:c-1);
      let was=-1, e=head[a]; while(e>=0&&to[e]!==b){ was=e; e=next[e]; }
      if(e>=0){ across[k]=face[e]; if(was<0) head[a]=next[e]; else next[was]=next[e]; next[e]=free; free=e; }
      else { if(free>=0){ e=free; free=next[e]; } else e=used++; to[e]=a; face[e]=k; next[e]=head[b]; head[b]=e; } } }
  return {index,spot,across,first,before,spots}; }

export function positions(io,n,M,src){
  const {index,spot,across,first,spots}=M, q=new Uint16Array(spots*3), of=src?new Int32Array(spots):null;
  if(src) for(let i=n-1;i>=0;i--) of[spot[i]]=i;
  for(let x=0;x<spots;x++){ const k=first[x], t=k-k%3, c=k-t, a=spot[index[t+(c===2?0:c+1)]], b=spot[index[t+(c===0?2:c-1)]], o=across[k]>=0?spot[index[across[k]]]:spots,
      all=a<x&&b<x&&o<x, r=b<x?b:a<x?a:x-1;
    for(let j=0;j<3;j++){ const g=all?q[a*3+j]+q[b*3+j]-q[o*3+j]:r>=0?q[r*3+j]:0; q[x*3+j]=g+io.diff(all?POS:STEP,src?src[of[x]*3+j]-g:0); } }
  const out=new Uint16Array(n*3); for(let i=0;i<n;i++){ const x=spot[i]*3; out[i*3]=q[x]; out[i*3+1]=q[x+1]; out[i*3+2]=q[x+2]; }
  return out; }

// an angle, from its cosine times l's root (a polynomial: Math.acos differs between engines in the last bit)
function angle(d,l){ if(!(l>0)) return 0; let x=d/Math.sqrt(l); if(x>1) x=1; else if(x<-1) x=-1; const a=x<0?-x:x, r=Math.sqrt(1-a)*(1.5707288+a*(-.2121144+a*(.074261-.0187293*a))); return x<0?3.14159265-r:r; }
// guesses: 0 all the spot's triangles, 1 all the vertex's, 2 its first triangle, 3 the vertex before on the spot, 4 the vertex before
export function normals(io,n,M,X,src){
  const {index,spot,before,spots}=M, T=index.length, F=new Float64Array(T), V=new Float64Array(n*3), S=new Float64Array(spots*3), ft=new Int32Array(n).fill(-1);
  for(let t=0;t<T;t+=3){ const ia=index[t], ib=index[t+1], ic=index[t+2], a=ia*3, b=ib*3, c=ic*3,
      ux=X[b]-X[a], uy=X[b+1]-X[a+1], uz=X[b+2]-X[a+2], vx=X[c]-X[a], vy=X[c+1]-X[a+1], vz=X[c+2]-X[a+2], px=vx-ux, py=vy-uy, pz=vz-uz;
    let x=uy*vz-uz*vy, y=uz*vx-ux*vz, z=ux*vy-uy*vx; const l=Math.sqrt(x*x+y*y+z*z)||1; x/=l; y/=l; z/=l; F[t]=x; F[t+1]=y; F[t+2]=z;
    const uu=ux*ux+uy*uy+uz*uz, vv=vx*vx+vy*vy+vz*vz, pp=px*px+py*py+pz*pz;
    for(let k=0;k<3;k++){ const i=index[t+k], s=spot[i]*3, v=i*3, g=k===0?angle(ux*vx+uy*vy+uz*vz,uu*vv):k===1?angle(-(ux*px+uy*py+uz*pz),uu*pp):angle(vx*px+vy*py+vz*pz,vv*pp), gx=x*g, gy=y*g, gz=z*g;
      V[v]+=gx; V[v+1]+=gy; V[v+2]+=gz; S[s]+=gx; S[s+1]+=gy; S[s+2]+=gz; if(ft[i]<0) ft[i]=t; } }
  const N=new Int8Array(n*3), g=new Int32Array(15);
  const put=(o,A,at)=>{ const x=A[at], y=A[at+1], z=A[at+2], l=Math.sqrt(x*x+y*y+z*z)||1; g[o]=Math.round(x/l*127); g[o+1]=Math.round(y/l*127); g[o+2]=Math.round(z/l*127); };
  const copy=(o,i)=>{ g[o]=N[i*3]; g[o+1]=N[i*3+1]; g[o+2]=N[i*3+2]; };
  for(let i=0;i<n;i++){ const pv=before[i]; let tok=0;
    if(src){ put(0,S,spot[i]*3); put(3,V,i*3); put(6,F,ft[i]); copy(9,pv>=0?pv:0); copy(12,i?i-1:0);
      let best=1e9; for(const m of pv>=0?[3,0,1,2,4]:[0,1,2,4]){ let d=0; for(let j=0;j<3;j++) d+=Math.abs(g[m*3+j]-src[i*3+j]); if(d<best){ best=d; tok=m; } } if(best) tok+=5; }
    tok=io.sym(NTOK,tok); const m=tok%5;
    if(m===0) put(0,S,spot[i]*3); else if(m===1) put(3,V,i*3); else if(m===2) put(6,F,ft[i]); else if(m===3) copy(9,pv>=0?pv:0); else copy(12,i?i-1:0);
    for(let j=0;j<3;j++){ let d=0; if(tok>=5){ if(src){ d=src[i*3+j]-g[m*3+j]; d=((d+128)&255)-128; d=d>=0?d*2:-2*d-1; } d=io.sym(NRES,d); d=d&1?-((d+1)>>1):d>>1; } N[i*3+j]=g[m*3+j]+d; } }
  return N; }

// guesses, with the triangle's two other corners known: as the triangle is in 3D, to either side, and a parallelogram; with one:
// there, and as far along each axis as it is in 3D; with none: the vertex before. Then the two before on the spot. A guess's number
// is how long ago one of its kind was right
export function uvs(io,base,n,M,X,src){
  const {index,before,across}=M, T=index.length, fk=new Int32Array(n).fill(-1), U=new Uint16Array(n*2), g=new Int32Array(16), rank=Array.from({length:6},()=>new Uint8Array([0,1,2,3,4,5,6,7])); let scale=0, m=0;
  for(let k=T-1;k>=0;k--) fk[index[k]]=k;
  const add=(u,v)=>{ g[m*2]=u; g[m*2+1]=v; m++; }, cost=d=>{ d=((d+32768)&65535)-32768; return d?1+2*Math.log2(1+Math.abs(d)):0; };
  for(let i=0;i<n;i++){ const k=fk[i], t=k-k%3, c=k-t, a=index[t+(c===2?0:c+1)], b=index[t+(c===0?2:c-1)], ka=a<i, kb=b<i, s=before[i], ctx=ka&&kb?0:ka||kb?1:2; m=0;
    if(ctx===0){ const A=a*3, B=b*3, V=i*3, ex=X[B]-X[A], ey=X[B+1]-X[A+1], ez=X[B+2]-X[A+2], vx=X[V]-X[A], vy=X[V+1]-X[A+1], vz=X[V+2]-X[A+2], ee=ex*ex+ey*ey+ez*ez,
        ua=U[a*2], va=U[a*2+1], ub=U[b*2], vb=U[b*2+1], du=ub-ua, dv=vb-va;
      if(ee>0){ const r=(ex*vx+ey*vy+ez*vz)/ee, h=(vx*vx+vy*vy+vz*vz)/ee-r*r, p=h>0?Math.sqrt(h):0;
        add(Math.round(ua+r*du-p*dv),Math.round(va+r*dv+p*du)); add(Math.round(ua+r*du+p*dv),Math.round(va+r*dv-p*du)); const z=Math.sqrt((du*du+dv*dv)/ee); if(z>0) scale=z; }
      else { add(ua,va); add(ub,vb); }
      const o=across[k]>=0?index[across[k]]:n; if(o<i) add(ua+ub-U[o*2],va+vb-U[o*2+1]); else add(ua,va); }
    else if(ctx===1){ const r=ka?a:b, dx=X[i*3]-X[r*3], dy=X[i*3+1]-X[r*3+1], dz=X[i*3+2]-X[r*3+2], l=Math.round(Math.sqrt(dx*dx+dy*dy+dz*dz)*scale), u=U[r*2], v=U[r*2+1];
      add(u,v); add(u+l,v); add(u-l,v); add(u,v+l); add(u,v-l); }
    else { const r=i?i-1:0; add(U[r*2],U[r*2+1]); }
    if(s>=0){ add(U[s*2],U[s*2+1]); const z=before[s]; if(z>=0) add(U[z*2],U[z*2+1]); }
    const R=rank[ctx*2+(s>=0?1:0)]; let tok=0, j=0;
    if(src){ let best=1e9; for(let q=0,r=0;q<8;q++){ const x=R[q]; if(x>=m) continue; const d=cost(src[i*2]-g[x*2])+cost(src[i*2+1]-g[x*2+1])+r*.5; if(d<best){ best=d; j=x; tok=r; } r++; }
      if(((src[i*2]-g[j*2])&65535)||((src[i*2+1]-g[j*2+1])&65535)) tok+=8; }
    // (the tokens of the three cases in one stream, what's left over in two)
    tok=io.sym(base,tok); let q=0; for(let r=tok&7;q<8;q++) if(R[q]<m&&r--===0) break; if(q>7) throw new Error("packed geometry: spoilt"); j=R[q]; for(;q>0;q--) R[q]=R[q-1]; R[0]=j;
    const rest=base+1+(ctx===2?3:0);
    for(let d=0;d<2;d++) U[i*2+d]=g[j*2+d]+(tok>=8?io.diff(rest,src?src[i*2+d]-g[j*2+d]:0):0); }
  return U; }

// a mesh's positions at their own scale (what the guesses measure with)
export function place(P,sx,sy,sz){ const X=new Float64Array(P.length); for(let i=0;i<P.length;i+=3){ X[i]=P[i]*sx; X[i+1]=P[i+1]*sy; X[i+2]=P[i+2]*sz; } return X; }

// A file's meshes: [accessor, its bytes] for each
export function unpack(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), len=dv.getUint32(0,true), {f,p,s}=JSON.parse(new TextDecoder().decode(u8.subarray(4,4+len))), out=[], meshes=[];
  if(f!==FORMAT) throw new Error("packed geometry: another format");
  let at=4+len; const io=new Reader(s.map(l=>u8.subarray(at,at+=l)));
  if(at!==u8.length) throw new Error("packed geometry: cut off");
  for(const [n,tris,iI,iP,iN,iU0,iU1,same,sx,sy,sz] of p){
    const o=same<0?null:meshes[same>>2], M=o?o.M:triangles(io,n,tris,null), P=o?o.P:positions(io,n,M,null), X=place(P,sx,sy,sz);
    const N=iN<0?null:o&&same&1?o.N:normals(io,n,M,X,null), U0=iU0<0?null:o&&same&2?o.U0:uvs(io,UV[0],n,M,X,null), U1=iU1<0?null:uvs(io,UV[1],n,M,X,null);
    meshes.push({M,P,N,U0}); out.push([iI,M.index],[iP,P]); if(N) out.push([iN,N]); if(U0) out.push([iU0,U0]); if(U1) out.push([iU1,U1]); }
  return out; }

// a file as it came -> one buffer, and what's where in it (accessor, offset, length)
const unzip=async buf=>new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
export async function read(buf){
  const parts=unpack(await unzip(buf)); let total=0; for(const [,a] of parts) total+=a.byteLength;
  const bytes=new Uint8Array(total), list=[]; let at=0;
  for(const [id,a] of parts){ bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),at); list.push([id,at,a.byteLength]); at+=a.byteLength; }
  return {bytes,list}; }
export const UVS=UV;
// the worker: fetches a file, telling of its bytes as they come, and answers with the above (entry: how the download went, on the
// page's clock, for the benchmark)
const under=new Map();
async function fetched(id,url){
  const ac=new AbortController(); under.set(id,ac);
  const r=await fetch(url,{signal:ac.signal}); if(!r.ok) throw new Error(url+" "+r.status); if(!r.body) return r.arrayBuffer();
  const parts=[], rd=r.body.getReader(); for(;;){ const {done,value}=await rd.read(); if(done) break; parts.push(value); self.postMessage({id,got:value.length}); }
  return new Blob(parts).arrayBuffer(); }
if(typeof WorkerGlobalScope!=="undefined"&&self instanceof WorkerGlobalScope) self.onmessage=async({data:{id,url,stop}})=>{
  if(stop) return under.get(id)?.abort();
  try{ const r=await read(await fetched(id,url)), e=performance.getEntriesByName(url)[0], t0=performance.timeOrigin;
    self.postMessage({id,...r,entry:e&&{name:e.name,at:t0,startTime:e.startTime,responseStart:e.responseStart,responseEnd:e.responseEnd,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize,transferSize:e.transferSize,nextHopProtocol:e.nextHopProtocol,out:performance.now()}},[r.bytes.buffer]); }
  catch(e){ self.postMessage({id,error:String(e)}); }
  finally{ under.delete(id); } };
