import { THREE } from './studio.js';

// Recovered VHS/CRT shader from the room runtime.
export function createVhs(renderer, source) {
  const SRC_W = source.width, SRC_H = source.height;
  const target = new THREE.WebGLRenderTarget(SRC_W, SRC_H, { depthBuffer: false });
  const srcTex = new THREE.CanvasTexture(source);
  srcTex.minFilter = THREE.LinearFilter;
  srcTex.generateMipmaps = false;
  const vhsMat=new THREE.ShaderMaterial({
  uniforms:{T:{value:srcTex},t:{value:0},g:{value:0},trk:{value:.15},sat:{value:.85},openX:{value:1},openY:{value:1},dotR:{value:0},us:{value:0},hv:{value:0},bo:{value:0},fit:{value:new THREE.Vector2(1.07,1.1)},R:{value:new THREE.Vector2(SRC_W,SRC_H)}},
  vertexShader:`varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}`,
  fragmentShader:`precision highp float;
  uniform sampler2D T;uniform float t,g,trk,sat,openX,openY,dotR,us,hv,bo;uniform vec2 R,fit;varying vec2 v;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  float n1(float x){float i=floor(x),f=fract(x);return mix(h(vec2(i,1.)),h(vec2(i+1.,1.)),smoothstep(0.,1.,f));}
  vec3 tex(vec2 u){return texture2D(T,clamp(u,.001,.999)).rgb;}
  // H/V DELAY shows the blanking between lines (HB of a line) and between fields (VB of one, 21 lines). The monitor lifts
  // black to a dark grey in this mode, so the sync pulses under it are the darkest thing on the screen.
  const float HB=.17,VB=.085,BL=.12;
  vec3 hblank(float x){   // across it: front porch, sync, breezeway, colour burst (a few cycles of subcarrier), back porch
    if(x>.1&&x<.5) return vec3(0.);
    if(x>.56&&x<.82) return vec3(BL)+vec3(.05,.065,-.02)*(.5+.5*sin(x*300.));
    return vec3(BL);
  }
  vec3 vblank(float n,float x,vec3 hb,float fr){   // line n of 21 (the texture runs bottom-up, so the caller counts from q.y=1+VB), x along it from its sync
    float hx=fract(x*2.);   // the first nine lines pulse twice a line
    if(n<3.||n>5.&&n<9.) return hx<.07?vec3(0.):vec3(BL);   // equalizing pulses
    if(n<6.) return hx<.85?vec3(0.):vec3(BL);   // vertical sync: broad pulses with narrow serrations
    if((n==16.||n==17.)&&x>.2&&x<.46) return vec3(.8);   // a test signal: a white bar,
    if((n==16.||n==17.)&&x>.52&&x<.94) return vec3(BL+floor((x-.52)*12.)*.14);   // then a staircase
    if(n==20.&&x>.18&&x<.34) return vec3(BL+.32*(.5+.5*sin(x*175.)));   // closed captions: the clock run-in,
    if(n==20.&&x>.37&&x<.95) return vec3(BL+.42*step(.5,h(vec2(floor((x-.37)*27.6),fr))));   // then two characters a field
    return hb;
  }
  void main(){
    vec2 base=vec2(v.x,1.-v.y);
    vec2 q=(base-.5)*fit*(1.+us*.13)/vec2(max(openX,.001),max(openY,.001))+.5;   // fit: how far the raster reaches (RASTER). UNDERSCAN: the whole raster, edges and all
    float ras=step(abs(q.x-.5),.5+HB*.5)*step(abs(q.y-.5),.5+VB*.5);   // the raster is one line by one field: underscanned, the tube beyond it is dark
    if(hv>.5) q=vec2(mod(q.x+.5+HB*.5,1.+HB),mod(q.y+.5+VB*.5,1.+VB));   // H/V DELAY: half a line and half a field late (sigUV maps clicks the same way)
    float inside=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
    vec2 uv=q;
    float by=1.-fract(t*.045+trk*.37);
    float band=(1.-smoothstep(0.,.07,abs(uv.y-by)))*(.2+trk*1.8);
    float amt=.0012+band*.012+g*.045+trk*.002;
    float jit=(n1(floor(uv.y*240.)*.9+t*33.)-.5)*amt;
    jit+=(1.-smoothstep(0.,.04,uv.y))*(.018+n1(t*25.)*.02);
    uv.x+=jit+sin(uv.y*7.+t*1.1)*.0007*(1.+trk*3.);
    uv.y+=g*(n1(t*50.)-.5)*.06;
    float ca=.0022+g*.014+band*.004;
    vec3 c=vec3(tex(uv+vec2(ca,0.)).r,tex(uv).g,tex(uv-vec2(ca*1.4,0.)).b);
    vec3 sm=(tex(uv+vec2(.004,0.))+tex(uv+vec2(.009,0.)))*.5;
    c=mix(c,max(c,sm*.85),.3);
    float L=dot(c,vec3(.299,.587,.114)); c=mix(vec3(L),c,sat);
    float gr=h(uv*R+fract(t*9.)*91.);
    c+=(gr-.5)*(.05+band*.35+g*.4);
    c=mix(c,vec3(gr*.9),smoothstep(.55,1.,g)*.9);
    c+=step(.982,h(vec2(floor(base.y*320.),floor(t*24.))))*min(band,1.)*.6;
    if(hv>.5){   // the blanking crosses the middle, around a brightened picture
      vec3 b=q.x>1.?hblank((q.x-1.)/HB):vec3(BL);
      if(q.y>1.) b=vblank(floor((1.+VB-q.y)/VB*21.),fract((q.x-1.-HB*.1)/(1.+HB)+1.),b,floor(t*30.));
      c=mix(c*(1.-BL)+BL,b+(gr-.5)*.05,1.-inside); inside=ras;
    }
    if(bo>.5) c=vec3(c.b+(gr-.5)*.07);   // BLUE ONLY: the blue signal alone, in black and white, where tape noise shows most
    c*=.86+.14*sin(base.y*R.y*1.5708);
    c*=.9+.1*sin(base.x*R.x*2.0944);
    vec2 e=base-.5; c*=1.-dot(e,e)*.9;
    c*=inside*(1.+(1.-openY)*2.5+(1.-openX)*1.5);
    float dt=(1.-smoothstep(dotR*.3,dotR,length((base-.5)*vec2(1.33,1.))));
    c+=vec3(dt)*step(.0001,dotR)*1.4;
    gl_FragColor=vec4(pow(max(c,0.),vec3(2.2)),1.);
  }`
});
  const vhsScene=new THREE.Scene(); vhsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),vhsMat));
  const vhsCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  return {
    texture: target.texture,
    uniforms: vhsMat.uniforms,
    draw() {
      srcTex.needsUpdate = true;
      renderer.setRenderTarget(target);
      renderer.render(vhsScene, vhsCam);
      renderer.setRenderTarget(null);
    },
  };
}
