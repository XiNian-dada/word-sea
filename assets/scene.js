(() => {
    'use strict';
    // Shared ocean, quotation corridor and friend lights; Typecho owns content and URLs.
    const config=JSON.parse(document.getElementById('wordsea-config').textContent);
    const seaWords = ['海','sea','mer','mar','Meer','mare','море','θάλασσα','بحر','ים','समुद्र','সমুদ্র','கடல்','సముద్రం','ทะเล','biển','바다','laut','deniz','bahari','havet','meri','sjór','muir'];
    const cloudWords = ['云','雲','cloud','nuage','nube','Wolke','nuvola','облако','سحابة','ענן','बादल','মেঘ','மேகம்','เมฆ','mây','구름','awan','bulut','wingu','moln','pilvi','ský','scamall'];
    const palettes = {
      daybreak:{top:[14,21,48],mid:[72,64,103],horizon:[210,128,128],sea:[14,26,51],sun:[255,220,193],halo:[225,120,146],word:[156,167,196],light:[255,221,197],cloud:[165,151,187],sunPosition:[.48,.385],glow:[.65,.55],lighting:[.85,1,.75],reflection:[3.1,1.1,14],reflectionColor:[255,192,119],night:[.12],label:'破晓'},
      morning:{top:[47,102,139],mid:[123,176,196],horizon:[241,214,176],sea:[15,56,76],sun:[255,249,224],halo:[255,221,177],word:[146,208,219],light:[255,248,218],cloud:[222,231,232],sunPosition:[.55,.275],glow:[1.15,.75],lighting:[1.15,1,1],reflection:[0,.85,60],reflectionColor:[255,224,173],night:[0],label:'清晨'},
      noon:{top:[55,138,183],mid:[132,199,224],horizon:[208,234,239],sea:[15,68,94],sun:[255,255,243],halo:[232,248,255],word:[133,204,220],light:[253,255,247],cloud:[241,251,253],sunPosition:[.63,.13],glow:[1.35,.40],lighting:[1.2,.9,1.1],reflection:[0,.85,60],reflectionColor:[243,250,255],night:[0],label:'正午'},
      afternoon:{top:[43,102,150],mid:[110,158,187],horizon:[220,191,158],sea:[14,49,75],sun:[255,241,207],halo:[251,197,139],word:[145,190,211],light:[255,236,197],cloud:[199,214,218],sunPosition:[.60,.265],glow:[1.15,.65],lighting:[1.1,1,1],reflection:[0,.85,60],reflectionColor:[255,210,153],night:[0],label:'午后'},
      sunset:{top:[15,10,28],mid:[56,29,49],horizon:[183,99,83],sea:[16,13,30],sun:[255,234,198],halo:[255,145,95],word:[235,172,171],light:[255,235,208],cloud:[202,139,143],sunPosition:[.5,.381],glow:[1,1],lighting:[1,1,1],reflection:[3.7,1.15,14],reflectionColor:[255,191,104],night:[0],label:'夕照'},
      night:{top:[3,7,21],mid:[11,21,43],horizon:[27,42,68],sea:[3,10,23],sun:[202,222,245],halo:[101,137,198],word:[65,101,146],light:[133,171,212],cloud:[69,90,126],sunPosition:[.60,.18],glow:[0,.06],lighting:[.24,.58,.28],reflection:[2.8,.85,22],reflectionColor:[174,213,255],night:[1],label:'月夜'}
    };
    const themeAtHour = h => h>=5&&h<7?'daybreak':h>=7&&h<10?'morning':h>=10&&h<14?'noon':h>=14&&h<17?'afternoon':h>=17&&h<20?'sunset':'night';
    const requestedTheme=new URLSearchParams(location.search).get('theme');
    const selectedTheme=requestedTheme||config.theme||'auto';
    const automatic=selectedTheme==='auto',initialTheme=automatic?themeAtHour(new Date().getHours()):Object.hasOwn(palettes,selectedTheme)?selectedTheme:'sunset';
    const state = {time:0,wind:config.wind/100,density:config.density/100,paused:matchMedia('(prefers-reduced-motion: reduce)').matches,clouds:true,theme:initialTheme,automatic,px:0,py:0,mx:0,my:0,immersive:false,ripples:[]};
    const weather={active:0,cloud:0,rain:0,snow:0,fog:0,storm:0,angle:0};
    const weatherTarget={...weather};let weatherObservation=null,weatherBaseWind=state.wind,weatherDrivingWind=false,waveWind=state.wind,waveTime=0,cloudTravel=0,rainTravel=0,snowTravel=0;
    const weatherFx=document.getElementById('weather-fx'),weatherCtx=weatherFx.getContext('2d');
    const sky = document.getElementById('sky'), ctx = sky.getContext('2d');
    const ocean = document.getElementById('ocean');
    const gl = ocean.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false});
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const scene={target:0,mix:0,from:0,started:0,duration:1800,transitioning:false,article:null,scroll:0,scrollTarget:0,frames:0};
    const harbor={target:0,mix:0,from:0,started:0,duration:3600,transitioning:false,cruise:0,hover:-1,levels:new Float32Array(6),frames:0};
    const friendsView=document.getElementById('friends-view'),friendsShade=document.getElementById('friends-shade');
    const beacons=document.getElementById('beacons'),beaconCtx=beacons.getContext('2d');
    let friends=config.friends||[],harborNodes=[];
    const diveShade=document.getElementById('dive-shade');
    const seaScene=document.getElementById('sea-scene'),passage=document.getElementById('passage'),veil=document.getElementById('scene-veil');
    const articleView=document.getElementById('article-view'),articleScroll=document.getElementById('article-scroll');
    let passageRenderer=null;
    const frameInterval=1000/60;
    let width=0,height=0,skyHeight=0,oceanTop=0,oceanLayoutHeight=0,oceanLayoutTop=-1,dpr=1,last=0,frameCount=0,raf=0,nextFrame=0,contextLost=false,lastSky=-Infinity;
    const current = Object.fromEntries(Object.entries(palettes[initialTheme]).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,[...v]]));
    const paletteKeys=Object.keys(current),mouseKeys=['x','y'];
    const weatherPalette=Object.fromEntries(paletteKeys.map(k=>[k,[...current[k]]]));
    const rgb = (v,a=1) => `rgba(${v.map(x=>Math.round(x)).join(',')},${a})`;
    const lerp = (a,b,t) => a+(b-a)*t;
    const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
    let seed=9237;
    const random = () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const starfield = Array.from({length:130},()=>({x:random(),y:random()*.34,r:random()*.8+.25,p:random()*6}));
    const cloudPatches = [.10,.36,.73,.94].map((x,i)=>({x,y:[.19,.13,.20,.115][i],scale:[1,.75,1.25,.7][i],speed:[.009,.012,.0065,.011][i],phase:random()*6.28,words:Array.from({length:160},()=>({x:(random()-.5)*2,y:(random()-.5)*2,size:random()*5+9,word:cloudWords[Math.floor(random()*cloudWords.length)],alpha:random()*.5+.35,phase:random()*6.28,drift:random()*.5+.6}))}));
    for(const cloud of cloudPatches)cloud.words=cloud.words.map(w=>({...w,shape:Math.exp(-w.x*w.x*1.7-w.y*w.y*3.8)})).filter(w=>w.shape>=.13);
    // Weather uses its own random stream, preserving the accepted ocean layout.
    let weatherSeed=17329;
    const wr=()=>{weatherSeed=(weatherSeed*1664525+1013904223)>>>0;return weatherSeed/4294967296;};
    for(let i=0;i<8;i++)cloudPatches.push({x:wr()*1.5-.25,y:.05+wr()*.26,scale:.9+wr()*.8,speed:.005+wr()*.01,phase:wr()*6.28,extra:true,words:Array.from({length:180},()=>{const x=(wr()-.5)*2,y=(wr()-.5)*2;return {x,y,shape:Math.exp(-x*x*1.7-y*y*3.8),size:wr()*5+9,word:cloudWords[Math.floor(wr()*cloudWords.length)],alpha:wr()*.5+.35,phase:wr()*6.28,drift:wr()*.5+.6};}).filter(w=>w.shape>=.13)});
    const weatherParticles=Array.from({length:900},()=>({x:wr(),y:wr(),depth:wr(),phase:wr(),speed:.7+wr()*.6}));
    for(const p of weatherParticles){p.snowDepth=.35+p.depth;p.snowRadius=.7+p.snowDepth*1.5;p.snowSpeed=.035*p.speed*p.snowDepth;}
    const weatherBuckets=Array.from({length:129},()=>[]),snowPositions=new Float64Array(1040),splashPositions=new Float64Array(360);
    let weatherInk=false,fogGradient=null,fogLevel=NaN,fogColor='',cloudBank=null,cloudBankCover=NaN,cloudBankColor='';
    weatherFx.style.display='none';
    const lightning={next:NaN,started:-Infinity,x:.72,y:.15,strength:1,duration:.12,echoDelay:Infinity,echoDuration:.04};
    const skyBase=document.getElementById('sky-base'),skyBaseCtx=skyBase.getContext('2d');
    let skySignature='',skyDirty=true,forceSky=true;
    const cloudAtlas=document.createElement('canvas'),cloudTint=document.createElement('canvas'),cloudGlyphs=new Map();
    cloudAtlas.width=cloudTint.width=2048;cloudAtlas.height=cloudTint.height=512;
    const cc=cloudAtlas.getContext('2d'),ct=cloudTint.getContext('2d');let cloudColor='',gx=0,gy=0,lineHeight=0;
    cc.font='40px "Times New Roman", "Songti SC", serif';cc.textAlign='center';cc.textBaseline='middle';cc.fillStyle='white';
    for(const word of cloudWords){
      const m=cc.measureText(word),left=Math.ceil(m.actualBoundingBoxLeft)+3,top=Math.ceil(m.actualBoundingBoxAscent)+3;
      const w=left+Math.ceil(m.actualBoundingBoxRight)+3,h=top+Math.ceil(m.actualBoundingBoxDescent)+3;
      if(gx+w>cloudAtlas.width){gx=0;gy+=lineHeight;lineHeight=0;}
      cc.fillText(word,gx+left,gy+top);cloudGlyphs.set(word,{x:gx,y:gy,w,h,left,top});gx+=w;lineHeight=Math.max(lineHeight,h);
    }
    for(const cloud of cloudPatches)for(const w of cloud.words){w.glyph=cloudGlyphs.get(w.word);w.drawScale=w.size*cloud.scale/40;w.alphaWeight=w.shape*w.alpha*.46;}

    if(!gl){document.body.classList.add('no-effects');return;}
    const cachedNoise=gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)>0;
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    // The lettering is a texture of the water itself, so it bends with every triangle.
    const vertexSource = `
      precision highp float;
      invariant gl_Position;
      attribute vec2 aWater;
      uniform float uTime,uWaveTime,uWind,uAspect,uSunX,uDepthOnly,uOceanTop,uDive,uCruise,uHarbor;
      uniform vec2 uWeatherDirection;
      uniform float uRain,uWeatherMix;
      uniform vec3 uLighting,uReflection,uSunDirection;
      uniform vec3 uBeacons[6],uBeaconColors[6];
      uniform vec2 uMouse;
      uniform vec4 uRipple[4];
      #ifdef CACHED_NOISE
      uniform sampler2D uNoise;
      #endif
      varying vec2 vUv;
      varying vec3 vBeaconGlow;
      varying float vLight,vAlpha,vReflect,vFoam,vDepth;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
      vec4 noiseCorners(vec2 cell){
        #ifdef CACHED_NOISE
        return texture2D(uNoise,(cell+128.5)/256.0);
        #else
        return vec4(hash(cell),hash(cell+vec2(1.0,0.0)),hash(cell+vec2(0.0,1.0)),hash(cell+vec2(1.0)));
        #endif
      }
      float noise(vec2 p){
        vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        vec4 corners=noiseCorners(cell);
        return mix(mix(corners.x,corners.y,f.x),mix(corners.z,corners.w,f.x),f.y);
      }
      vec3 noiseGradient(vec2 p){
        vec2 cell=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
        vec4 corners=noiseCorners(cell);float a=corners.x,b=corners.y,c=corners.z,d=corners.w;
        float value=mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
        return vec3(value,du.x*mix(b-a,d-c,u.y),du.y*mix(c-a,d-b,u.x));
      }
      void swell(vec2 p,vec2 direction,float k,float amplitude,float phase,float steepness,inout vec3 position,inout vec3 dx,inout vec3 dz){
        // Keep the wave fronts in place. Wind redistributes their energy rather
        // than rotating the entire field around the world origin.
        vec2 d=normalize(direction);
        float alignment=dot(d,uWeatherDirection);
        float windWeight=mix(1.0,.70+.30*alignment*alignment,uWeatherMix);
        float t=uWaveTime;
        vec2 drift=vec2(d.y,-d.x)*t*.018;
        vec3 bending=noiseGradient(p*.019+drift+vec2(phase*2.0,phase));
        vec3 envelopeNoise=noiseGradient(p*.013-drift+vec2(phase*3.0,9.0));
        float bend=(bending.x-.5)*.8;
        float envelope=.78+envelopeNoise.x*.28;
        float theta=dot(p,d)*k-t*sqrt(9.81*k)+phase+bend;
        float a=amplitude*windWeight*envelope,s=sin(theta),c=cos(theta),height=s+sin(theta*2.0+.3)*.10;
        float push=c*a*steepness;
        position+=vec3(d.x*push,a*height,d.y*push);
        if(uDepthOnly<.5){
          vec2 thetaGradient=d*k+bending.yz*(.019*.8),aGradient=envelopeNoise.yz*(amplitude*windWeight*.013*.28);
          vec2 pushGradient=(aGradient*c-a*s*thetaGradient)*steepness;
          vec2 heightGradient=aGradient*height+a*(c+cos(theta*2.0+.3)*.20)*thetaGradient;
          dx+=vec3(d.x*pushGradient.x,heightGradient.x,d.y*pushGradient.x);
          dz+=vec3(d.x*pushGradient.y,heightGradient.y,d.y*pushGradient.y);
        }
      }
      vec3 waterPoint(vec2 p,out vec3 dx,out vec3 dz){
        vec3 result=vec3(0.0);dx=vec3(0.0);dz=vec3(0.0);
        // One wave evaluation also provides exact derivatives for the water normal.
        swell(p,vec2(.18,.98),.291,1.32,1.1,.24,result,dx,dz);
        swell(p,vec2(-.43,.90),.407,.95,4.6,.23,result,dx,dz);
        swell(p,vec2(.68,.73),.173,.82,2.8,.20,result,dx,dz);
        swell(p,vec2(.91,.41),.109,.60,5.9,.20,result,dx,dz);
        // Small wavelets fade out where their curvature is smaller than a pixel.
        float distance=20.0-p.y-uCruise,detailT=clamp((distance-110.0)/110.0,0.0,1.0);
        float detail=1.0-detailT*detailT*(3.0-2.0*detailT);
        if(detail>0.0){
          vec3 fine=vec3(0.0),fineX=vec3(0.0),fineZ=vec3(0.0);
          swell(p,vec2(-.80,.60),.557,.40,.6,.18,fine,fineX,fineZ);
          swell(p,vec2(.51,.86),.921,.20,5.2,.13,fine,fineX,fineZ);
          swell(p,vec2(-.22,.97),1.347,.09,3.5,.10,fine,fineX,fineZ);
          swell(p,vec2(-.65,.76),.733,.22,1.9,.12,fine,fineX,fineZ);
          result+=fine*detail;
          dx+=fineX*detail;dz+=fineZ*detail+fine*(6.0*detailT*(1.0-detailT)/110.0);
        }
        float amplitude=.20+uWind*1.35;
        result=result*amplitude+vec3(p.x,0.0,p.y);
        dx=dx*amplitude+vec3(1.0,0.0,0.0);dz=dz*amplitude+vec3(0.0,0.0,1.0);
        float rippleHeight=0.0;vec2 rippleGradient=vec2(0.0);
        for(int i=0;i<4;i++){
          float age=uTime-uRipple[i].z;
          if(uRipple[i].w>0.0&&age>0.0&&age<10.0){
            vec2 delta=p-uRipple[i].xy;
            float radius=sqrt(dot(delta,delta)+4.0)-2.0;
            float travel=age*3.2;
            float fade=smoothstep(0.0,.65,age)*(1.0-smoothstep(6.0,10.0,age))*exp(-age*.24)*uRipple[i].w;
            float r=radius-travel,ringFade=exp(-r*r/(6.0*6.0));
            float ring=sin(r*.55)*ringFade;
            float dent=-.35*exp(-radius*radius/16.0)*exp(-age*1.7);
            rippleHeight+=(ring+dent)*fade;
            if(uDepthOnly<.5){
              float slope=ringFade*(.55*cos(r*.55)-sin(r*.55)*2.0*r/(6.0*6.0))-dent*radius/8.0;
              rippleGradient+=slope*fade*delta/(radius+2.0);
            }
          }
        }
        float denominator=sqrt(1.25*1.25+rippleHeight*rippleHeight);
        result.y+=1.25*rippleHeight/denominator;
        if(uDepthOnly<.5){
          vec2 slope=rippleGradient*(1.25*1.25*1.25)/(denominator*denominator*denominator);
          dx.y+=slope.x;dz.y+=slope.y;
        }
        return result;
      }
      void main(){
        vec2 p=aWater-vec2(0.0,uCruise);
        vec3 tx,tz;
        vec3 position=waterPoint(p,tx,tz);
        position.z+=uCruise;
        float depth=20.0-position.z;
        // Near/far planes of about 3/550 keep useful depth precision on the waves.
        gl_Position=vec4((position.x-uMouse.x*3.0)*1.8/uAspect,(position.y-8.0-uMouse.y*.6)*1.8+depth*.22,depth*1.011-6.033,depth);
        if(uDive>0.0){
          float approach=smoothstep(0.0,.27,uDive),submerge=smoothstep(.16,.43,uDive);
          float eye=mix(8.0,1.4,approach)-submerge*9.0;
          float pitch=approach*.15+submerge*.52,cp=cos(pitch),sp=sin(pitch);
          float down=position.y-eye-uMouse.y*.6,forward=depth-approach*2.5;
          float viewY=down*cp+forward*sp,viewDepth=forward*cp-down*sp;
          gl_Position=vec4((position.x-uMouse.x*3.0)*1.8/uAspect,viewY*1.8+viewDepth*.22,viewDepth*1.011-6.033,viewDepth);
        }
        // Remap the original projection into the lower canvas without moving the sea.
        gl_Position.y=(gl_Position.y+uOceanTop*depth)/(1.0-uOceanTop);
        if(uDepthOnly>.5)return;
        vec3 normal=normalize(cross(tz,tx));
        float dz=-normal.z/max(normal.y,.15);
        float typeScale=mix(.60,1.0,smoothstep(.45,1.55,uAspect));
        vUv=p/(vec2(28.0,13.5)*typeScale);
        vDepth=depth;
        float crest=clamp(position.y/(1.65+uWind*1.85)+.25,0.0,1.0);
        vFoam=pow(crest,4.0)*(.35+noise(p*.11+vec2(uTime*.03,0.0))*.65)*(.35+uWind*.65);
        vLight=clamp(.52+dz*1.05+position.y*.04+vFoam*.25,0.0,1.0);
        vLight+=noise(p*.8+vec2(uTime*.9,-uTime*.6))*.13*uRain;
        vReflect=0.0;
        if(uReflection.x>.001){
          // The reflected light belongs to the moving water normals. A broad
          // path under the light is broken into facets by the real wave slopes.
          vec3 view=normalize(vec3(uMouse.x*3.0-position.x,8.0+uMouse.y*.6-position.y,depth));
          vec3 halfway=normalize(view+uSunDirection);
          float facet=pow(max(dot(normal,halfway),0.0),uReflection.z);
          float pathWidth=(7.5+depth*.11)*uReflection.y;
          float reflectionX=(uSunX*2.0-1.0)*depth*uAspect/1.8+uMouse.x*3.0;
          float path=exp(-pow(abs(position.x-reflectionX)/pathWidth,1.65));
          float broken=.55+noise(p*.55+vec2(uTime*.3,-uTime*.2))*.45;
          vReflect=path*facet*broken*uReflection.x;
        }
        vAlpha=(.43+vLight*.57)*(1.0-smoothstep(300.0,650.0,depth));
        vBeaconGlow=vec3(0.0);
        if(uHarbor>.001){
          vec3 view=normalize(vec3(uMouse.x*3.0-position.x,8.0+uMouse.y*.6-position.y,depth));
          vec3 worldPosition=position-vec3(0.0,0.0,uCruise);
          for(int i=0;i<6;i++){
            vec3 delta=uBeacons[i]-worldPosition;
            float distanceSquared=dot(delta,delta);
            vec3 light=delta*inversesqrt(max(distanceSquared,.01));
            float facet=pow(max(dot(normal,normalize(light+view)),0.0),18.0);
            float diffuse=max(dot(normal,light),0.0);
            vBeaconGlow+=uBeaconColors[i]*(facet*6.0+diffuse*.32)/(1.0+distanceSquared*.055)*uHarbor;
          }
        }
      }
    `;
    const fragmentSource = `
      precision highp float;
      uniform sampler2D uAtlas,uDots;
      uniform vec3 uColor,uLight,uReflectionColor;
      uniform vec3 uLighting;
      uniform float uDensity,uDepthOnly,uDistanceMode;
      varying vec2 vUv;
      varying vec3 vBeaconGlow;
      varying float vLight,vAlpha,vReflect,vFoam,vDepth;
      void main(){
        if(uDepthOnly>.5){gl_FragColor=vec4(0.0);return;}
        vec4 glyph;
        // Each draw uses uniform control flow, preserving texture mip derivatives.
        if(uDistanceMode<.5)glyph=texture2D(uAtlas,vUv);
        else if(uDistanceMode>1.5)glyph=texture2D(uDots,vUv);
        else glyph=mix(texture2D(uAtlas,vUv),texture2D(uDots,vUv),smoothstep(110.0,220.0,vDepth));
        float ink=glyph.a*step(glyph.r,uDensity);
        vec3 base=uColor*(.42+vLight*1.12);
        base=mix(base,uLight*(1.2+vFoam*.6),vFoam*.8*uLighting.z);
        vec3 color=mix(base,uReflectionColor*(1.15+vReflect*.4),clamp(vReflect*.85,0.0,1.0));
        color+=vBeaconGlow;
        gl_FragColor=vec4(color,ink*clamp(vAlpha+vReflect*.3+dot(vBeaconGlow,vec3(.1)),0.0,1.0));
      }
    `;
    const program=gl.createProgram();
    try{gl.attachShader(program,shader(gl.VERTEX_SHADER,(cachedNoise?'#define CACHED_NOISE\n':'')+vertexSource));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));}catch(e){console.error(e);document.body.classList.add('no-effects');return;}
    gl.useProgram(program);
    const uniforms=Object.fromEntries(['uTime','uWaveTime','uWind','uWeatherDirection','uWeatherMix','uRain','uAspect','uDensity','uMouse','uRipple[0]','uColor','uLight','uAtlas','uDots','uNoise','uSunX','uLighting','uReflection','uReflectionColor','uSunDirection','uDepthOnly','uDistanceMode','uOceanTop','uDive','uCruise','uHarbor','uBeacons[0]','uBeaconColors[0]'].map(k=>[k,gl.getUniformLocation(program,k)]));
    let bakedNoise=null,harborNoise=null;
    if(cachedNoise){
      // Bake four lattice corner values per texel once; derivatives reuse those values.
      const bake=gl.createProgram(),vs=shader(gl.VERTEX_SHADER,'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}');
      const fs=shader(gl.FRAGMENT_SHADER,`precision highp float;
        float hash(vec2 p){p=mod(p+128.0,256.0)-128.0;return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        void main(){vec2 p=floor(gl_FragCoord.xy)-128.0;gl_FragColor=vec4(hash(p),hash(p+vec2(1.0,0.0)),hash(p+vec2(0.0,1.0)),hash(p+vec2(1.0)));}
      `);
      gl.attachShader(bake,vs);gl.attachShader(bake,fs);gl.linkProgram(bake);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(bake,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(bake));
      const noiseTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,noiseTexture);
      bakedNoise=noiseTexture;
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,noiseTexture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Noise cache framebuffer is incomplete');
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(bake,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.useProgram(bake);gl.viewport(0,0,256,256);gl.disable(gl.DITHER);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DITHER);
      gl.disableVertexAttribArray(position);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fb);gl.deleteBuffer(buffer);gl.deleteProgram(bake);
      gl.useProgram(program);gl.uniform1i(uniforms.uNoise,2);gl.activeTexture(gl.TEXTURE0);
    }
    const atlas=document.createElement('canvas');
    atlas.width=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));atlas.height=atlas.width/2;
    const ac=atlas.getContext('2d'),scale=atlas.width/4096;
    ac.textAlign='left';ac.textBaseline='alphabetic';
    // Random packing has no rows. Both axes wrap, including the collision lookup.
    const cols=32,rows=16,cell=atlas.width/cols;
    const buckets=Array.from({length:cols*rows},()=>[]),metrics=new Map();
    const bucketIndex=(x,y)=>((y%rows+rows)%rows)*cols+(x%cols+cols)%cols;
    function bucketKeys(b){
      const keys=[];
      for(let y=Math.floor((b.y-b.ry)/cell);y<=Math.floor((b.y+b.ry)/cell);y++)
        for(let x=Math.floor((b.x-b.rx)/cell);x<=Math.floor((b.x+b.rx)/cell);x++)keys.push(bucketIndex(x,y));
      return keys;
    }
    function overlaps(a,b){
      let dx=b.x-a.x,dy=b.y-a.y;
      dx-=atlas.width*Math.round(dx/atlas.width);dy-=atlas.height*Math.round(dy/atlas.height);
      if(Math.abs(dx)>=a.rx+b.rx||Math.abs(dy)>=a.ry+b.ry)return false;
      // Separating axes of the two rotated ink bounds, including a small gutter.
      for(const [x,y] of [[a.c,a.s],[-a.s,a.c],[b.c,b.s],[-b.s,b.c]]){
        const ra=a.hw*Math.abs(x*a.c+y*a.s)+a.hh*Math.abs(-x*a.s+y*a.c);
        const rb=b.hw*Math.abs(x*b.c+y*b.s)+b.hh*Math.abs(-x*b.s+y*b.c);
        if(Math.abs(dx*x+dy*y)>=ra+rb)return false;
      }
      return true;
    }
    for(const [base,attempts] of [[100,3500],[86,7000],[73,13000],[61,19000]]){
      for(let i=0;i<attempts;i++){
        const word=seaWords[Math.floor(random()*seaWords.length)],size=base*(.92+Math.floor(random()*3)*.08)*scale;
        ac.font=`600 ${size}px "Times New Roman", "Songti SC", serif`;
        const metricKey=size+':'+word;
        if(!metrics.has(metricKey))metrics.set(metricKey,ac.measureText(word));
        const m=metrics.get(metricKey),angle=(random()-.5)*.44,c=Math.cos(angle),s=Math.sin(angle),gap=8*scale;
        const hw=(m.actualBoundingBoxLeft+m.actualBoundingBoxRight+gap)/2,hh=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent+gap)/2;
        const b={x:random()*atlas.width,y:random()*atlas.height,c,s,hw,hh,rx:Math.abs(c)*hw+Math.abs(s)*hh,ry:Math.abs(s)*hw+Math.abs(c)*hh};
        const keys=bucketKeys(b),neighbors=new Set(keys.flatMap(k=>buckets[k]));
        if([...neighbors].some(other=>overlaps(b,other)))continue;
        for(const k of keys)buckets[k].push(b);
        const tone=Math.floor(random()*235);
        ac.fillStyle=`rgb(${tone},255,255)`;
        // The copies use exactly the same reserved bounds at the periodic seam.
        for(const oy of [-atlas.height,0,atlas.height])for(const ox of [-atlas.width,0,atlas.width]){
          if(b.x+ox+b.rx<0||b.x+ox-b.rx>atlas.width||b.y+oy+b.ry<0||b.y+oy-b.ry>atlas.height)continue;
          ac.save();ac.translate(b.x+ox,b.y+oy);ac.rotate(angle);
          ac.fillText(word,(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);ac.restore();
        }
      }
    }
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,atlas);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.generateMipmap(gl.TEXTURE_2D);
    // A small repeating speck texture replaces illegible distant glyphs.
    const dots=document.createElement('canvas');dots.width=256;dots.height=128;
    const dc=dots.getContext('2d');let dotSeed=7613;
    const dotRandom=()=>{dotSeed=(dotSeed*1664525+1013904223)>>>0;return dotSeed/4294967296;};
    for(let i=0;i<600;i++){
      const x=dotRandom()*dots.width,y=dotRandom()*dots.height,r=.9+dotRandom()*1.2,tone=Math.floor(dotRandom()*255);
      dc.fillStyle=`rgba(${tone},0,0,${.25+dotRandom()*.75})`;
      for(const ox of [-256,0,256])for(const oy of [-128,0,128]){dc.beginPath();dc.arc(x+ox,y+oy,r,0,Math.PI*2);dc.fill();}
    }
    const dotTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,dotTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,dots);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.generateMipmap(gl.TEXTURE_2D);gl.activeTexture(gl.TEXTURE0);
    const waterBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,waterBuffer);
    const waterIndexBuffer=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterIndexBuffer);
    const nx=96,nz=260;
    let meshVertexCount=0,meshTriangleCount=0,indexCount=0;
    const colorRanges=Array.from({length:3},(_,mode)=>({mode,start:0,count:0}));
    let meshAspect=0;
    function buildMesh(){
      const aspect=width/height;if(Math.abs(aspect-meshAspect)<.0001)return;meshAspect=aspect;
      const vertices=[],indices=[],bands=[];
      // Concentrate geometry in the view and near the camera, where curvature is visible.
      for(let row=0;;){
        const depth=5+510*Math.pow(row/nz,1.8),halfWidth=depth*aspect/1.8+7;
        const segments=depth<150?nx:depth<300?48:32,start=vertices.length/2;
        bands.push({segments,start,depth});
        for(let col=0;col<=segments;col++)vertices.push((col/segments*2-1)*halfWidth,20-depth);
        if(row===nz)break;row=Math.min(nz,row+(depth<150?1:depth<300?2:4));
      }
      // Join unequal row sizes without cracks or a visible boundary between levels.
      for(const range of colorRanges){range.start=0;range.count=0;}
      for(let row=0;row<bands.length-1;row++){
        const a=bands[row],b=bands[row+1],range=colorRanges[b.depth<=110?0:a.depth>=220?2:1],startIndex=indices.length;let x=0,y=0;
        if(!range.count)range.start=startIndex;
        while(x<a.segments||y<b.segments){
          const advanceA=(x+1)*b.segments,advanceB=(y+1)*a.segments;
          if(advanceA<advanceB){indices.push(a.start+x,a.start+x+1,b.start+y);x++;}
          else if(advanceB<advanceA){indices.push(a.start+x,b.start+y+1,b.start+y);y++;}
          else{indices.push(a.start+x,a.start+x+1,b.start+y,a.start+x+1,b.start+y+1,b.start+y);x++;y++;}
        }
        range.count+=indices.length-startIndex;
      }
      meshVertexCount=vertices.length/2;indexCount=indices.length;meshTriangleCount=indexCount/3;
      gl.bindBuffer(gl.ARRAY_BUFFER,waterBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,waterIndexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    }
    const waterLocation=gl.getAttribLocation(program,'aWater');gl.enableVertexAttribArray(waterLocation);gl.vertexAttribPointer(waterLocation,2,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    gl.uniform1i(uniforms.uAtlas,0);gl.uniform1i(uniforms.uDots,1);
    function resizeOcean(){
      // 4.60 is the sum of the eight amplitudes; 1.06 and 1.10 bound their
      // envelopes and harmonics. Include the ripple limit and lowest eye height.
      const belowEye=!scene.transitioning&&scene.mix===0&&(.20+Math.max(state.wind,waveWind)*1.35)*(4.60*1.06*1.10)+1.25<7.4;
      const fullPixelHeight=Math.round(height*dpr),topPixels=belowEye?Math.floor(fullPixelHeight*.38):0;
      // Align the crop with the original backing-store pixels to avoid resampling.
      oceanTop=height*topPixels/fullPixelHeight;
      if(oceanLayoutTop!==oceanTop||oceanLayoutHeight!==height){
        ocean.style.top=oceanTop+'px';ocean.style.height=(height-oceanTop)+'px';
        oceanLayoutTop=oceanTop;oceanLayoutHeight=height;
      }
      const canvasWidth=Math.round(width*dpr),canvasHeight=fullPixelHeight-topPixels;
      if(ocean.width!==canvasWidth||ocean.height!==canvasHeight){
        ocean.width=canvasWidth;ocean.height=canvasHeight;
        gl.viewport(0,0,canvasWidth,canvasHeight);
      }
    }
    function resize(){
      const root=document.getElementById('wordsea-scene');
      const nextWidth=Math.max(1,root.clientWidth),nextHeight=Math.max(1,root.clientHeight);
      const nextDpr=Math.min(devicePixelRatio||1,1.25,Math.sqrt(3000000/(nextWidth*nextHeight)));
      if(width===nextWidth&&height===nextHeight&&dpr===nextDpr)return;
      width=nextWidth;height=nextHeight;dpr=nextDpr;
      skyBase.width=Math.round(width*dpr);skyBase.height=Math.round(height*dpr);
      // Only clouds and stars change continuously; their layer ends above the sea.
      skyHeight=Math.ceil(height*.40);sky.width=Math.round(width*dpr);sky.height=Math.round(skyHeight*dpr);sky.style.height=skyHeight+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);skyBaseCtx.setTransform(dpr,0,0,dpr,0,0);
      for(const cloud of cloudPatches){
        cloud.cw=Math.min(width*.23,330)*cloud.scale;cloud.ch=height*.042*cloud.scale;
        cloud.minX=cloud.minY=Infinity;cloud.maxX=cloud.maxY=-Infinity;
        for(const w of cloud.words){
          const g=w.glyph,size=w.drawScale;
          w.drawX=w.x*cloud.cw-g.left*size;w.drawY=w.y*cloud.ch-g.top*size;w.drawWidth=g.w*size;w.drawHeight=g.h*size;
          cloud.minX=Math.min(cloud.minX,w.drawX-cloud.cw*.065-1);cloud.maxX=Math.max(cloud.maxX,w.drawX+w.drawWidth+cloud.cw*.065+1);
          cloud.minY=Math.min(cloud.minY,w.drawY-cloud.ch*.42-1);cloud.maxY=Math.max(cloud.maxY,w.drawY+w.drawHeight+cloud.ch*.42+1);
        }
      }
      fogGradient=cloudBank=null;
      beacons.width=Math.round(width*dpr);beacons.height=Math.round(height*dpr);beaconCtx.setTransform(dpr,0,0,dpr,0,0);layoutBeacons();
      weatherFx.width=Math.round(width*dpr);weatherFx.height=Math.round(height*dpr);weatherCtx.setTransform(dpr,0,0,dpr,0,0);
      weatherInk=false;weatherFx.style.display='none';
      resizeOcean();buildMesh();if(passageRenderer)passageRenderer.resize();skySignature='';skyDirty=true;invalidate(true);
    }
    addEventListener('resize',resize);document.addEventListener('wordsea:viewport',resize);resize();

    function drawSkyBackground(){
      const ctx=skyBaseCtx;
      const p=current,horizon=height*.39,sunX=width*p.sunPosition[0]-state.mx*width*.009,sunY=height*p.sunPosition[1]-state.my*height*.003;
      // The translated sky ends above the viewport during a dive. Its opaque
      // sea-colored backing keeps that edge continuous, even while it fades.
      seaScene.style.backgroundColor=rgb(p.sea);
      const moon=p.night[0],daylight=p.glow[0]*(1-moon),glowSize=Math.min(width,height);
      const moonVisibility=Math.pow(1-clamp(Math.max(weather.cloud*.96,weather.fog*.86)*weather.active,0,.995),2.6);
      const bg=ctx.createLinearGradient(0,0,0,height);
      bg.addColorStop(0,rgb(p.top));bg.addColorStop(.29,rgb(p.mid));bg.addColorStop(.40,rgb(p.horizon));bg.addColorStop(.47,rgb(p.sea));bg.addColorStop(1,rgb(p.sea));ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
      // Overlapping exposure blooms have no geometric solar outline.
      function bloom(x,y,rx,ry,color,strength,core=0){
        ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
        const gradient=ctx.createRadialGradient(0,0,0,0,0,1);
        gradient.addColorStop(0,rgb(color,strength));
        gradient.addColorStop(.12,rgb(color,strength*.92));
        gradient.addColorStop(.32,rgb(color,strength*(core?.70:.42)));
        gradient.addColorStop(.62,rgb(color,strength*.12));
        gradient.addColorStop(1,rgb(color,0));
        ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
      }
      const halo=(radius,color,strength,core=0)=>bloom(sunX,sunY,radius,radius,color,strength,core);
      ctx.save();ctx.globalCompositeOperation='screen';
      halo(glowSize*.64,p.halo,.72*daylight);
      halo(glowSize*.38,p.sun,.48*daylight);
      halo(glowSize*.20,p.sun,.65*daylight);
      halo(glowSize*.24,[255,248,237],Math.min(.99,.98*daylight),1);
      halo(glowSize*.24,[255,248,237],Math.min(.99,.85*daylight),1);
      // The horizontal exposure streak is separate from the circular halo.
      // Both axes use the same pixel scale, so resizing cannot stretch it either.
      bloom(sunX,sunY,glowSize*.78,glowSize*.06,p.sun,.75*daylight);
      bloom(sunX,sunY,glowSize*.48,glowSize*.038,[255,248,237],Math.min(.99,.92*daylight),1);
      bloom(sunX,horizon+height*.055,glowSize*.30,glowSize*.115,p.reflectionColor,.63*p.glow[1]*Math.min(1,p.reflection[0]));
      // Moonlight has a compact halo and a quiet visible disc, rather than a solar bloom.
      halo(glowSize*.16,p.halo,.12*moon*moonVisibility);
      halo(glowSize*.05,p.sun,.16*moon*moonVisibility);
      ctx.restore();
      if(moon>.001){
        ctx.save();
        ctx.globalAlpha=moon*moonVisibility;
        const radius=Math.max(5,height*.013),disc=ctx.createRadialGradient(sunX-radius*.2,sunY-radius*.25,0,sunX,sunY,radius);
        disc.addColorStop(0,rgb(p.sun,.85));disc.addColorStop(.75,rgb(p.sun,.75));disc.addColorStop(.92,rgb(p.sun,.65));disc.addColorStop(1,rgb(p.sun,0));
        ctx.fillStyle=disc;ctx.beginPath();ctx.arc(sunX,sunY,radius,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=rgb(p.halo,.15);for(const [x,y,r] of [[-.28,.14,.20],[.22,-.20,.14],[.20,.35,.25]]){ctx.beginPath();ctx.arc(sunX+x*radius,sunY+y*radius,r*radius,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      }
      let g=ctx.createLinearGradient(0,horizon-4,0,horizon+height*.15);g.addColorStop(0,rgb(p.halo,.16*(1-moon*.8)*moonVisibility));g.addColorStop(1,rgb(p.halo,0));ctx.fillStyle=g;ctx.fillRect(0,horizon-4,width,height*.155);
    }
    function drawSky(){
      const p=current,moon=p.night[0];
      if(skyDirty){
        const signature=['top','mid','horizon','sea','sun','halo','reflectionColor'].map(k=>rgb(p[k])).join('|')+'|'+p.glow.map(v=>v.toFixed(3))+'|'+p.reflection[0].toFixed(3)+'|'+moon.toFixed(3)+'|'+Math.round((p.sunPosition[0]-state.mx*.009)*width*4)+'|'+Math.round((p.sunPosition[1]-state.my*.003)*height*4);
        if(signature!==skySignature){drawSkyBackground();skySignature=signature;}
        const color=rgb(p.cloud);
        if(color!==cloudColor){ct.clearRect(0,0,cloudTint.width,cloudTint.height);ct.globalCompositeOperation='source-over';ct.drawImage(cloudAtlas,0,0);ct.globalCompositeOperation='source-in';ct.fillStyle=color;ct.fillRect(0,0,cloudTint.width,cloudTint.height);cloudColor=color;}
        skyDirty=false;
      }
      ctx.clearRect(0,0,width,skyHeight);
      if(moon>.001){
        ctx.save();ctx.fillStyle=rgb(p.sun);
        for(const s of starfield){ctx.globalAlpha=(.2+.25*Math.sin(state.time*.4+s.p))*moon*(1-weather.cloud*weather.active)*(1-weather.fog*weather.active);ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();}ctx.restore();
      }
      if(state.clouds){
        ctx.save();
        const cover=weather.cloud*weather.active;
        if(cover>.05){
          const color=rgb(p.cloud);
          if(!cloudBank||cloudBankCover!==cover||cloudBankColor!==color){cloudBank=ctx.createLinearGradient(0,0,0,skyHeight);cloudBank.addColorStop(0,rgb(p.cloud,cover*.16));cloudBank.addColorStop(.65,rgb(p.cloud,cover*.07));cloudBank.addColorStop(1,rgb(p.cloud,0));cloudBankCover=cover;cloudBankColor=color;}
          ctx.fillStyle=cloudBank;ctx.fillRect(0,0,width,skyHeight);
        }
        for(const cloud of cloudPatches){
          const amount=cloud.extra?cover*.95:lerp(1,.12+weather.cloud*1.9,weather.active);
          if(amount<.001)continue;
          const motion=cloudTravel;
          const cx=(((cloud.x+motion*cloud.speed+.32)%1.64+1.64)%1.64-.32)*width-state.mx*9;
          const cy=cloud.y*height-state.my*5+Math.sin(state.time*.25+cloud.phase)*height*.01,cw=cloud.cw,ch=cloud.ch;
          if(cx+cloud.maxX<0||cx+cloud.minX>width||cy+cloud.maxY<0||cy+cloud.minY>skyHeight)continue;
          for(const w of cloud.words){
            const baseX=cx+w.drawX,baseY=cy+w.drawY;
            if(baseX+w.drawWidth+cw*.065+1<0||baseX-cw*.065-1>width||baseY+w.drawHeight+ch*.42+1<0||baseY-ch*.42-1>skyHeight)continue;
            const flowX=Math.sin(state.time*.38*w.drift+w.phase)*cw*.065;
            const flowY=Math.sin(state.time*.53*w.drift+w.phase+w.x*2)*ch*.42;
            const x=baseX+flowX,y=baseY+flowY,glyph=w.glyph;
            if(x+w.drawWidth+1<0||x-1>width||y+w.drawHeight+1<0||y-1>skyHeight)continue;
            ctx.globalAlpha=Math.min(1,w.alphaWeight*amount*(.82+Math.sin(state.time*.37+w.phase)*.18));
            ctx.drawImage(cloudTint,glyph.x,glyph.y,glyph.w,glyph.h,x,y,w.drawWidth,w.drawHeight);
          }
        }ctx.restore();
      }
    }
    function setWeather(data){
      weatherObservation=data;
      const limit=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
      if(!data){
        for(const key of Object.keys(weatherTarget))weatherTarget[key]=0;
        if(weatherDrivingWind)setRange('wind',Math.round(weatherBaseWind*100));
        weatherDrivingWind=false;
      }else{
        if(!weatherDrivingWind)weatherBaseWind=state.wind;
        weatherDrivingWind=true;
        const code=data.code,rainCodes=[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,97,99],snowCodes=[71,73,75,77,85,86];
        weatherTarget.active=1;weatherTarget.cloud=limit(data.cloud/100,0,1);
        weatherTarget.rain=limit(Math.sqrt(Math.max(data.rain||0,rainCodes.includes(code)?.35:0))/3.6,0,1);
        weatherTarget.snow=limit(Math.sqrt(Math.max(data.snow||0,snowCodes.includes(code)?.15:0))/1.7,0,1);
        weatherTarget.fog=[45,48].includes(code)?.88:weatherTarget.rain*.16+weatherTarget.snow*.10;
        weatherTarget.storm=[95,96,97,99].includes(code)?1:0;
        weatherTarget.angle=limit(data.direction,0,360)*Math.PI/180;
        setRange('wind',Math.round(limit(.08+Math.pow(limit(data.wind,0,160)/55,.65)*.83,.04,.98)*100));
      }
      if(state.automatic)setTheme('auto');
      invalidate(true);
    }
    function weatherTheme(){
      const data=weatherObservation;
      if(!data)return themeAtHour(new Date().getHours());
      const now=Date.now()/1000;let rise=NaN,set=NaN,nearest=Infinity;
      for(let i=0;i<(data.sunrise?.length||0);i++){
        const r=data.sunrise[i],s=data.sunset?.[i],distance=Math.abs(now-(r+s)/2);
        if(Number.isFinite(r)&&Number.isFinite(s)&&s>r&&distance<nearest){rise=r;set=s;nearest=distance;}
      }
      if(Number.isFinite(rise)&&nearest<36*3600){
        if(now>=rise-35*60&&now<rise+45*60)return 'daybreak';
        if(now>=set-50*60&&now<set+35*60)return 'sunset';
        if(now<rise||now>=set)return 'night';
        const progress=(now-rise)/(set-rise);
        return progress<.25?'morning':progress<.62?'noon':'afternoon';
      }
      if(data.isDay===0)return 'night';
      if(data.timezone){try{return themeAtHour(Number(new Intl.DateTimeFormat('en-GB',{timeZone:data.timezone,hour:'2-digit',hourCycle:'h23'}).format(new Date())));}catch{}}
      return themeAtHour(new Date().getHours());
    }
    function updateWeather(dt,visible){
      const blend=visible&&!reducedMotion.matches?1-Math.exp(-dt/2.4):1;
      let settling=false;
      for(const key of Object.keys(weather)){
        const difference=key==='angle'?Math.atan2(Math.sin(weatherTarget.angle-weather.angle),Math.cos(weatherTarget.angle-weather.angle)):weatherTarget[key]-weather[key];
        if(Math.abs(difference)<.0005)weather[key]=weatherTarget[key];
        else{weather[key]+=difference*blend;settling=visible||settling;skyDirty=true;}
      }
      const previousWind=waveWind;
      if(Math.abs(waveWind-state.wind)<.0005)waveWind=state.wind;else{waveWind=lerp(waveWind,state.wind,blend);settling=visible||settling;}
      if(visible&&previousWind!==waveWind)resizeOcean();
      if(!state.paused&&visible){
        // Integrate velocity: new wind must never be multiplied by elapsed time.
        waveTime+=dt*(.60+(previousWind+waveWind)*.225);
        cloudTravel+=dt*lerp(1,(.40+waveWind*2.4)*(Math.sin(weather.angle)>=0?1:-1),weather.active);
        rainTravel+=dt*Math.sin(weather.angle)*(.08+waveWind*.20)*.36;
        snowTravel+=dt*Math.sin(weather.angle)*.016;
      }
      return settling;
    }
    function weatherColors(){
      const base=palettes[state.theme],amount=weather.active;
      if(amount<.0005)return base;
      const cover=weather.cloud*amount,fog=weather.fog*amount,storm=weather.storm*amount,moon=base.night[0];
      const muted=Math.min(1,cover*.9+fog*.3),occlusion=Math.min(.995,Math.max(cover*.96,fog*.86,weather.rain*amount*.72));
      const grey=[lerp(104-storm*34,13,moon),lerp(125-storm*35,25,moon),lerp(141-storm*38,39,moon)];
      for(const key of paletteKeys){
        const source=base[key],out=weatherPalette[key];
        for(let i=0;i<source.length;i++)out[i]=source[i];
        if(['top','mid','horizon'].includes(key))for(let i=0;i<3;i++)out[i]=lerp(source[i],grey[i],muted)*(1-storm*.16);
        if(key==='sea')for(let i=0;i<3;i++)out[i]=lerp(source[i],lerp([13,35,45][i],[4,11,20][i],moon),muted*.8);
        if(key==='cloud')for(let i=0;i<3;i++)out[i]=lerp(source[i],lerp([170,190,200][i],[85,105,127][i],moon),muted);
        if(key==='word')for(let i=0;i<3;i++)out[i]=lerp(source[i],lerp([153,184,197][i],[99,127,158][i],moon),muted*.75);
      }
      const transmission=Math.pow(1-occlusion,2.6);
      weatherPalette.glow[0]*=transmission;weatherPalette.glow[1]*=transmission;
      weatherPalette.reflection[0]*=transmission;weatherPalette.lighting[0]*=1-muted*.35;
      return weatherPalette;
    }
    function lightningEnvelope(age,duration){
      if(!(age>=0&&age<duration))return 0;
      // A discharge lights up immediately, then loses brightness within a few frames.
      return Math.exp(-age/(duration*.22))*(1-age/duration);
    }
    function lightningPulse(time){
      if(!weatherTarget.storm||weather.storm<.12||state.paused||reducedMotion.matches){lightning.next=NaN;lightning.started=-Infinity;return 0;}
      if(!Number.isFinite(lightning.next)){lightning.next=time+2+wr()*3;return 0;}
      if(time>=lightning.next){
        lightning.started=time;lightning.next=time+9+wr()*15;
        lightning.x=.25+wr()*.55;lightning.y=.06+wr()*.14;lightning.strength=.75+wr()*.25;
        lightning.duration=.10+wr()*.05;lightning.echoDuration=.035+wr()*.02;
        lightning.echoDelay=wr()<.3?lightning.duration+.035+wr()*.025:Infinity;
      }
      const age=time-lightning.started;
      return lightningEnvelope(age,lightning.duration)+.45*lightningEnvelope(age-lightning.echoDelay,lightning.echoDuration);
    }
    function drawWeather(){
      const ctx=weatherCtx;
      const rain=weather.rain*weather.active,snow=weather.snow*weather.active,fog=weather.fog*weather.active;
      const pulse=weather.active>=.001?lightningPulse(state.time):0;
      if(weather.active<.001||rain<=.003&&snow<=.003&&fog<=.005&&pulse<=.001){
        if(weatherInk){ctx.clearRect(0,0,width,height);weatherInk=false;weatherFx.style.display='none';}
        return;
      }
      if(!weatherInk){weatherFx.style.display='';weatherInk=true;}
      ctx.clearRect(0,0,width,height);
      const night=current.night[0],color=[lerp(210,145,night),lerp(230,180,night),lerp(237,210,night)],time=state.time;
      const opaqueColor=rgb(color);
      if(fog>.005){
        if(!fogGradient||fogLevel!==fog||fogColor!==opaqueColor){fogGradient=ctx.createLinearGradient(0,height*.16,0,height);fogGradient.addColorStop(0,rgb(color,0));fogGradient.addColorStop(.21,rgb(color,fog*.17));fogGradient.addColorStop(.32,rgb(color,fog*.49));fogGradient.addColorStop(.55,rgb(color,fog*.18));fogGradient.addColorStop(1,rgb(color,fog*.035));fogLevel=fog;fogColor=opaqueColor;}
        ctx.fillStyle=fogGradient;ctx.fillRect(0,0,width,height);
      }
      if(rain>.003){
        const slant=Math.sin(weather.angle)*(.08+waveWind*.20),count=Math.min(900,Math.ceil(width*height/1250));
        ctx.lineCap='round';
        for(let layer=0;layer<3;layer++){
          const scale=.30+layer*.38;ctx.strokeStyle=rgb(color,rain*(.15+layer*.065));ctx.lineWidth=.45+layer*.30;ctx.beginPath();
          for(let i=layer;i<count;i+=3){
            const p=weatherParticles[i],fade=Math.max(0,Math.min(1,rain*1.7-p.depth));if(fade<=0)continue;
            const progress=(p.y+time*(.42+layer*.29)*p.speed)%1.15;
            const y=(progress-.10)*height,x=(((p.x+rainTravel*p.speed)%1.3+1.3)%1.3-.15)*width,length=(15+layer*18)*p.speed*fade*scale;
            ctx.moveTo(x,y);ctx.lineTo(x+slant*length,y+length);
          }ctx.stroke();
        }
        // Small, soft impact rings carry the rainfall down onto the water.
        for(const bucket of weatherBuckets)bucket.length=0;
        for(let i=0;i<90;i++){
          const p=weatherParticles[i];if(p.depth>rain)continue;
          const age=(time*(.55+p.speed*.4)+p.phase*7)%1,fade=Math.sin(age*Math.PI)*(1-age);
          const y=(.43+p.y*.52)*height,depth=(y/height-.39)/.6,radius=(1+age*9)*depth;
          const bucket=Math.round(fade*rain*(.16+depth*.13)*128);if(!bucket)continue;
          const j=i*4;splashPositions[j]=p.x*width;splashPositions[j+1]=y+Math.sin(time*1.2+p.phase*6)*depth*2;splashPositions[j+2]=radius*2.5;splashPositions[j+3]=radius*.45;weatherBuckets[bucket].push(i);
        }
        ctx.strokeStyle=opaqueColor;ctx.lineWidth=.65;
        const angle=slant*.13,ca=Math.cos(angle),sa=Math.sin(angle);
        for(let b=1;b<weatherBuckets.length;b++){
          const group=weatherBuckets[b];if(!group.length)continue;ctx.globalAlpha=b/128;ctx.beginPath();let start=0;
          for(let k=0;k<group.length;k++){
            const j=group[k]*4,x=splashPositions[j],y=splashPositions[j+1],rx=splashPositions[j+2],ry=splashPositions[j+3];
            // Keep intersecting rings in separate paints so their light still adds up.
            for(let n=start;n<k;n++){const q=group[n]*4,sx=rx+splashPositions[q+2],sy=ry+splashPositions[q+3]+sx*Math.abs(sa);if(Math.abs(x-splashPositions[q])<sx+2&&Math.abs(y-splashPositions[q+1])<sy+2){ctx.stroke();ctx.beginPath();start=k;break;}}
            ctx.moveTo(x+rx*ca,y+rx*sa);ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);
          }
          ctx.stroke();
        }ctx.globalAlpha=1;
      }
      if(snow>.003){
        const count=Math.min(520,Math.ceil(width*height/2300));
        for(const bucket of weatherBuckets)bucket.length=0;
        for(let i=0;i<count;i++){
          const p=weatherParticles[i],opacity=Math.max(0,Math.min(1,snow*1.7-p.depth));if(opacity<=0)continue;
          const bucket=Math.round(opacity*(.40+p.depth*.35)*128);if(!bucket)continue;
          const j=i*2;snowPositions[j]=(((p.x+snowTravel+Math.sin(time*.42+p.phase*12)*.018)%1.12+1.12)%1.12-.06)*width;snowPositions[j+1]=((p.y+time*p.snowSpeed)%1.1-.05)*height;weatherBuckets[bucket].push(i);
        }
        ctx.fillStyle=opaqueColor;
        for(let b=1;b<weatherBuckets.length;b++){
          const group=weatherBuckets[b];if(!group.length)continue;ctx.globalAlpha=b/128;ctx.beginPath();let start=0;
          for(let k=0;k<group.length;k++){
            const i=group[k],j=i*2,x=snowPositions[j],y=snowPositions[j+1],r=weatherParticles[i].snowRadius;
            for(let n=start;n<k;n++){const q=group[n],dx=x-snowPositions[q*2],dy=y-snowPositions[q*2+1],reach=r+weatherParticles[q].snowRadius+2;if(dx*dx+dy*dy<reach*reach){ctx.fill();ctx.beginPath();start=k;break;}}
            ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);
          }
          ctx.fill();
        }ctx.globalAlpha=1;
      }
      if(pulse>.001){const x=width*lightning.x,y=height*lightning.y,flash=ctx.createRadialGradient(x,y,0,x,y,height*.95);flash.addColorStop(0,rgb([221,231,255],pulse*lightning.strength*weather.storm*weather.active*.23));flash.addColorStop(1,rgb([221,231,255],0));ctx.fillStyle=flash;ctx.fillRect(0,0,width,height);}
    }
    function drawOcean(){
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uniforms.uTime,state.time);
      uploadScalar('uWaveTime',waveTime);uploadScalar('uWind',waveWind);uploadScalar('uWeatherMix',weather.active);uploadScalar('uRain',weather.rain*weather.active);gl.uniform2f(uniforms.uWeatherDirection,Math.cos(weather.angle),Math.sin(weather.angle));uploadScalar('uAspect',width/height);uploadScalar('uDensity',state.density);
      uploadScalar('uOceanTop',oceanTop/height);uploadScalar('uDive',scene.mix);
      uploadScalar('uCruise',harbor.cruise);uploadScalar('uHarbor',harbor.mix);
      if(harbor.mix>0){gl.uniform3fv(uniforms['uBeacons[0]'],beaconPositions);gl.uniform3fv(uniforms['uBeaconColors[0]'],beaconColors);}
      if(uploadedMouseX!==state.mx||uploadedMouseY!==state.my){gl.uniform2f(uniforms.uMouse,state.mx,state.my);uploadedMouseX=state.mx;uploadedMouseY=state.my;}
      for(let i=0;i<3;i++){wordColor[i]=current.word[i]/255;lightColor[i]=current.light[i]/255;}
      uploadVector('uColor',wordColor);uploadVector('uLight',lightColor);uploadVector('uLighting',current.lighting);
      const sunX=current.sunPosition[0]-state.mx*.009,sunY=current.sunPosition[1]-state.my*.003;
      if(directionX!==sunX||directionY!==sunY||directionAspect!==width/height){
        sunDirection[0]=(sunX*2-1)*(width/height)/1.8;sunDirection[1]=(1-sunY*2-.22)/1.8;sunDirection[2]=-1;
        const sunLength=Math.hypot(sunDirection[0],sunDirection[1],sunDirection[2]);for(let i=0;i<3;i++)sunDirection[i]/=sunLength;
        directionX=sunX;directionY=sunY;directionAspect=width/height;
      }
      for(let i=0;i<3;i++){reflectionValues[i]=current.reflection[i];reflectionColor[i]=current.reflectionColor[i]/255;}
      reflectionValues[0]*=1-smooth(.06,.36,scene.mix);
      uploadScalar('uSunX',sunX);uploadVector('uSunDirection',sunDirection);uploadVector('uReflection',reflectionValues);uploadVector('uReflectionColor',reflectionColor);
      if(uploadedRipples!==state.ripples){
        rippleValues.fill(0);state.ripples.forEach((r,i)=>{const j=i*4;rippleValues[j]=r.x;rippleValues[j+1]=r.z;rippleValues[j+2]=r.time;rippleValues[j+3]=.95;});gl.uniform4fv(uniforms['uRipple[0]'],rippleValues);uploadedRipples=state.ripples;
      }
      // Resolve all water depth first so a later translucent triangle cannot
      // blend over a valley that was already painted into the framebuffer.
      gl.colorMask(false,false,false,false);gl.depthMask(true);gl.depthFunc(gl.LESS);
      gl.uniform1f(uniforms.uDepthOnly,1);gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
      gl.colorMask(true,true,true,true);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);
      gl.uniform1f(uniforms.uDepthOnly,0);
      for(const range of colorRanges){gl.uniform1f(uniforms.uDistanceMode,range.mode);gl.drawElements(gl.TRIANGLES,range.count,gl.UNSIGNED_SHORT,range.start*2);}
      gl.depthMask(true);
    }
    const rippleValues=new Float32Array(16),wordColor=new Float32Array(3),lightColor=new Float32Array(3),sunDirection=new Float32Array(3),reflectionValues=new Float32Array(3),reflectionColor=new Float32Array(3),beaconPositions=new Float32Array(18),beaconColors=new Float32Array(18);
    let directionX=NaN,directionY=NaN,directionAspect=NaN;
    const uploadedScalars={},uploadedVectors={};let uploadedMouseX=NaN,uploadedMouseY=NaN,uploadedRipples=null;
    function uploadScalar(name,value){if(uploadedScalars[name]!==value){gl.uniform1f(uniforms[name],value);uploadedScalars[name]=value;}}
    function uploadVector(name,value){
      let previous=uploadedVectors[name];if(!previous)previous=uploadedVectors[name]=[NaN,NaN,NaN];
      if(previous[0]!==value[0]||previous[1]!==value[1]||previous[2]!==value[2]){gl.uniform3fv(uniforms[name],value);for(let i=0;i<3;i++)previous[i]=value[i];}
    }
    function layoutBeacons(){
      for(const node of harborNodes){
        const [x,y]=node.friend.at,depth=14.4/(2*y-.78);
        node.x=(2*x-1)*depth*(width/height)/1.8;
        node.z=20-depth-68;
      }
    }
    function prepareHarborNoise(){
      if(harborNoise||!bakedNoise)return;
      // One lazy read of the existing noise atlas keeps six floating lights on
      // the same wave field. There is no GPU readback during animation.
      const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),fb=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,bakedNoise,0);
      harborNoise=new Uint8Array(256*256*4);gl.readPixels(0,0,256,256,gl.RGBA,gl.UNSIGNED_BYTE,harborNoise);
      gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.deleteFramebuffer(fb);
    }
    function harborNoiseAt(x,z){
      const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,ux=fx*fx*(3-2*fx),uz=fz*fz*(3-2*fz);
      let a,b,c,d;
      if(harborNoise){
        const j=(((iz+128)%256+256)%256*256+((ix+128)%256+256)%256)*4;
        a=harborNoise[j]/255;b=harborNoise[j+1]/255;c=harborNoise[j+2]/255;d=harborNoise[j+3]/255;
      }else{
        const hash=(x,z)=>{const h=Math.sin(x*127.1+z*311.7)*43758.5453123;return h-Math.floor(h);};
        a=hash(ix,iz);b=hash(ix+1,iz);c=hash(ix,iz+1);d=hash(ix+1,iz+1);
      }
      return lerp(lerp(a,b,ux),lerp(c,d,ux),uz);
    }
    const harborSwells=[[.18,.98,.291,1.32,1.1,.24],[-.43,.90,.407,.95,4.6,.23],[.68,.73,.173,.82,2.8,.20],[.91,.41,.109,.60,5.9,.20],[-.80,.60,.557,.40,.6,.18],[.51,.86,.921,.20,5.2,.13],[-.22,.97,1.347,.09,3.5,.10],[-.65,.76,.733,.22,1.9,.12]];
    function harborWater(node){
      const pX=node.x,pZ=node.z,t=waveTime,amplitude=.20+waveWind*1.35;
      let x=pX,y=0,z=pZ;
      for(let i=0;i<harborSwells.length;i++){
        const [dx,dz,k,a,phase,steepness]=harborSwells[i],len=Math.hypot(dx,dz),dX=dx/len,dZ=dz/len;
        const alignment=dX*Math.cos(weather.angle)+dZ*Math.sin(weather.angle),windWeight=lerp(1,.70+.30*alignment*alignment,weather.active);
        const driftX=dZ*t*.018,driftZ=-dX*t*.018;
        const bend=(harborNoiseAt(pX*.019+driftX+phase*2,pZ*.019+driftZ+phase)-.5)*.8;
        const envelope=.78+harborNoiseAt(pX*.013-driftX+phase*3,pZ*.013-driftZ+9)*.28;
        const detail=i<4?1:1-smooth(110,220,20-pZ-harbor.cruise);
        const theta=(pX*dX+pZ*dZ)*k-t*Math.sqrt(9.81*k)+phase+bend,weight=a*windWeight*envelope*amplitude*detail;
        y+=(Math.sin(theta)+Math.sin(theta*2+.3)*.10)*weight;
        const push=Math.cos(theta)*weight*steepness;x+=dX*push;z+=dZ*push;
      }
      let ripple=0;
      for(const r of state.ripples){
        const age=state.time-r.time;if(age<=0||age>=10)continue;
        const radius=Math.sqrt((pX-r.x)**2+(pZ-r.z)**2+4)-2,ring=radius-age*3.2;
        const fade=smooth(0,.65,age)*(1-smooth(6,10,age))*Math.exp(-age*.24)*.95;
        ripple+=(Math.sin(ring*.55)*Math.exp(-ring*ring/36)-.35*Math.exp(-radius*radius/16-age*1.7))*fade;
      }
      y+=1.25*ripple/Math.sqrt(1.25**2+ripple*ripple);
      node.y=y;node.worldX=x;node.worldZ=z;
    }
    function updateBeacons(dt){
      const hoverBlend=1-Math.exp(-dt*5),aspect=width/height;
      let settling=false;
      for(const node of harborNodes){
        const i=node.i,target=harbor.hover===i?1:0;
        harbor.levels[i]=lerp(harbor.levels[i],target,hoverBlend);
        if(Math.abs(harbor.levels[i]-target)<.001)harbor.levels[i]=target;else settling=true;
        harborWater(node);
        const depth=20-node.worldZ-harbor.cruise;
        node.scale=.9*height/depth;
        node.sx=((node.worldX-state.mx*3)*1.8/aspect/depth+1)*width/2;
        node.sy=(1-((node.y-8-state.my*.6)*1.8/depth+.22))*height/2;
        node.head=node.sy-node.scale*4.4;
        node.alpha=smooth(.14+i*.045,.61+i*.045,harbor.mix);
        const j=i*3,strength=(.85+harbor.levels[i]*1.4)*node.alpha;
        beaconPositions[j]=node.worldX;beaconPositions[j+1]=node.y+4.4;beaconPositions[j+2]=node.worldZ;
        for(let k=0;k<3;k++)beaconColors[j+k]=node.friend.color[k]/255*strength;
        if(node.anchor){
          const cardX=node.sx+(node.friend.at[0]>.65?-238:27);
          // Keep the readable label steady while its light follows full waves.
          const flatHead=(1-((-8-state.my*.6)*1.8/depth+.22))*height/2-node.scale*3.8;
          const cardY=flatHead+Math.max(-9,Math.min(9,node.head+node.scale*.6-flatHead));
          sceneStyle(node.anchor,'left',`${Math.max(20,Math.min(width-228,cardX))}px`);
          sceneStyle(node.anchor,'top',`${cardY}px`);
          sceneStyle(node.anchor,'opacity',String(node.alpha*smooth(.34,.88,harbor.mix)));
        }
      }
      return settling;
    }
    function drawBeacons(){
      const c=beaconCtx;c.clearRect(0,0,width,height);
      if(harbor.mix<=0)return;
      c.save();c.textAlign='center';c.textBaseline='middle';
      for(const node of harborNodes){
        const {friend,sx,sy,head,scale,alpha}=node,hover=harbor.levels[node.i];
        if(alpha<=0)continue;
        const pulse=.92+Math.sin(state.time*.9+node.i*1.7)*.08,brightness=(.75+hover*.6)*pulse;
        const core=head+scale*.18,radius=Math.max(16,scale*(2+hover*.85));
        const glow=c.createRadialGradient(sx,core,0,sx,core,radius);
        glow.addColorStop(0,rgb(friend.color,.28*brightness*alpha));glow.addColorStop(.2,rgb(friend.color,.12*brightness*alpha));glow.addColorStop(1,rgb(friend.color,0));
        c.fillStyle=glow;c.fillRect(sx-radius,core-radius,radius*2,radius*2);
        c.globalAlpha=alpha;c.shadowColor=rgb(friend.color,.8);c.shadowBlur=14+hover*10;
        c.font=`${Math.max(12,scale*.64)}px "Songti SC",serif`;c.fillStyle=rgb(friend.color,brightness);
        const letters=[...friend.name].slice(0,8),spacing=3.32/Math.max(4,letters.length);
        c.font=`${Math.max(9,scale*.64*Math.min(1,4/letters.length))}px "Songti SC",serif`;
        letters.forEach((character,i)=>c.fillText(character,sx,head+scale*(1+i*spacing)));
        c.shadowBlur=0;
        const column=c.createLinearGradient(sx,core,sx,sy);column.addColorStop(0,rgb(friend.color,.23*brightness));column.addColorStop(1,rgb(friend.color,0));
        c.fillStyle=column;c.fillRect(sx-.7,core,1.4,Math.max(0,sy-core));
        c.fillStyle='#fff6e7';c.shadowColor=rgb(friend.color);c.shadowBlur=12+hover*8;c.beginPath();c.arc(sx,core,1.6+hover*.9,0,Math.PI*2);c.fill();c.shadowBlur=0;
        // Broken short reflections supplement the shader-lit sea letters.
        for(let i=0;i<12;i++){
          const y=sy+6+i*scale*.14,w=(.2+i*.026)*scale;
          const x=sx+Math.sin(state.time*1.25+i*1.6+node.i)*scale*.11;
          c.fillStyle=rgb(friend.color,(1-i/12)*.20*brightness);c.fillRect(x-w/2,y,w,Math.max(.65,scale*.016));
        }
      }
      c.restore();harbor.frames++;
    }
    function bindFriends(data){
      friends=data.slice(0,6);harbor.hover=-1;harbor.levels.fill(0);beaconPositions.fill(0);beaconColors.fill(0);
      const anchors=[...document.querySelectorAll('.friend-link')];
      harborNodes=friends.map((friend,i)=>({friend,i,x:0,z:0,y:0,sx:0,sy:0,head:0,scale:1,alpha:0,anchor:anchors[i]}));
      layoutBeacons();
      for(const node of harborNodes){
        const anchor=node.anchor;if(!anchor)continue;
        const light=()=>{if(harbor.hover!==node.i){harbor.hover=node.i;state.ripples=[...state.ripples,{x:node.x,z:node.z,time:state.time}].slice(-4);invalidate();}};
        const leave=()=>{if(harbor.hover===node.i){harbor.hover=-1;invalidate();}};
        anchor.addEventListener('pointerenter',light);anchor.addEventListener('focus',light);
        anchor.addEventListener('pointerleave',()=>{if(document.activeElement!==anchor)leave();});
        anchor.addEventListener('blur',()=>{if(!anchor.matches(':hover'))leave();});
      }
      invalidate();
    }
    bindFriends(friends);
    function cancelFrames(){cancelAnimationFrame(raf);raf=0;last=0;nextFrame=0;}
    function requestFrame(){if(!raf&&!document.hidden&&!contextLost)raf=requestAnimationFrame(frame);}
    function invalidate(refreshSky=false){if(refreshSky)forceSky=true;requestFrame();}
    function frame(now){
      raf=0;if(document.hidden||contextLost)return;
      if(now+.8<nextFrame){requestFrame();return;}
      const dt=last?Math.max((now-last)/1000,0):0;last=now;
      const mouseBlend=1-Math.exp(-dt*2.8),paletteBlend=1-Math.exp(-dt*2);
      if(!state.paused&&scene.mix<1)state.time+=dt;
      if(scene.transitioning){
        const t=Math.min(1,(now-scene.started)/scene.duration),ease=t*t*t*(t*(t*6-15)+10);
        scene.mix=lerp(scene.from,scene.target,ease);applySceneVisuals();
        if(t===1){scene.mix=scene.target;scene.transitioning=false;finishScene();}
      }
      if(harbor.transitioning){
        const t=Math.min(1,(now-harbor.started)/harbor.duration),ease=t*t*t*(t*(t*6-15)+10);
        harbor.mix=lerp(harbor.from,harbor.target,ease);harbor.cruise=harbor.mix*68;applyFriendsVisuals();
        if(t===1){harbor.mix=harbor.target;harbor.cruise=harbor.mix*68;harbor.transitioning=false;finishFriends();}
      }
      // Match the exact zero-opacity boundaries in applySceneVisuals. Keep time
      // advancing through the dive, but submit only layers that can be seen.
      const oceanVisible=scene.mix<.55,skyVisible=scene.mix<.42,wallVisible=scene.mix>.20;
      scene.scroll=wallVisible?lerp(scene.scroll,scene.scrollTarget,mouseBlend):scene.scrollTarget;
      if(Math.abs(scene.scroll-scene.scrollTarget)<.0001)scene.scroll=scene.scrollTarget;
      const previousMouseX=state.mx,previousMouseY=state.my;
      state.mx=lerp(state.mx,state.px,mouseBlend);state.my=lerp(state.my,state.py,mouseBlend);
      let settling=false;
      for(const key of mouseKeys){
        const m='m'+key,p='p'+key;
        if(Math.abs(state[m]-state[p])<.0001)state[m]=state[p];else settling=true;
      }
      if(previousMouseX!==state.mx||previousMouseY!==state.my)skyDirty=true;
      settling=updateWeather(dt,oceanVisible)||settling;
      const target=weatherColors();
      for(const k of paletteKeys)for(let j=0;j<current[k].length;j++){
        const previous=current[k][j];
        // The hidden sea can adopt its next palette immediately. A clock/theme
        // change while reading must not animate an unrelated wall background.
        current[k][j]=oceanVisible?lerp(current[k][j],target[k][j],paletteBlend):target[k][j];
        if(Math.abs(current[k][j]-target[k][j])<.001)current[k][j]=target[k][j];else settling=true;
        if(previous!==current[k][j])skyDirty=true;
      }
      if(skyVisible&&(forceSky||((state.clouds||current.night[0]>.001||skyDirty)&&(now-lastSky>=frameInterval*2-.8||state.paused&&!settling)))){drawSky();lastSky=now;forceSky=false;}
      if(oceanVisible){if(harbor.mix>0)settling=updateBeacons(dt)||settling;drawOcean();drawWeather();frameCount++;if(harbor.mix>0)drawBeacons();}
      if(wallVisible&&passageRenderer){settling=passageRenderer.updateHighlight(now)||settling;passageRenderer.draw();scene.frames++;}
      if((!state.paused&&oceanVisible)||settling||scene.transitioning||harbor.transitioning||wallVisible&&scene.scroll!==scene.scrollTarget){
        // Let the browser schedule vsync; do not add a separate timer wake-up
        // before every frame. The deadline still caps high-refresh screens at 60.
        nextFrame=Math.max(nextFrame+frameInterval,now+frameInterval*.25);
        requestFrame();
      }else{last=0;nextFrame=0;}
    }
    document.addEventListener('visibilitychange',()=>{cancelFrames();if(!document.hidden)invalidate(true);});

    const play=document.getElementById('play');let userPaused=false;
    function setPaused(paused,system=false){if(!system)userPaused=paused;state.paused=paused;play.setAttribute('aria-pressed',String(paused));play.setAttribute('aria-label',paused?'继续动画':'暂停动画');document.getElementById('play-icon').innerHTML=paused?'<path d="m9 5 10 7-10 7Z"/>':'<path d="M9 5v14M15 5v14"/>';for(const id of ['passage-play','friends-play']){const other=document.getElementById(id);other.setAttribute('aria-pressed',String(paused));other.setAttribute('aria-label',paused?'继续动画':'暂停动画');other.querySelector('svg').innerHTML=document.getElementById('play-icon').innerHTML;}invalidate();}
    setPaused(state.paused,true);play.addEventListener('click',()=>setPaused(!state.paused));
    reducedMotion.addEventListener('change',()=>{
      setPaused(reducedMotion.matches||userPaused,true);
      if(reducedMotion.matches){
        state.px=state.py=state.mx=state.my=0;
        if(scene.transitioning){scene.mix=scene.target;scene.transitioning=false;finishScene();}
        if(harbor.transitioning){harbor.mix=harbor.target;harbor.cruise=harbor.mix*68;harbor.transitioning=false;finishFriends();}
        scene.scroll=scene.scrollTarget;
      }
      invalidate(true);
    });
    function setTheme(value){
      if(value==='dawn')value='morning';
      state.automatic=value==='auto';state.theme=state.automatic?weatherTheme():value;
      document.querySelectorAll('.theme').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===(state.automatic?'auto':state.theme))));
      document.querySelector('meta[name="theme-color"]').content=rgb(palettes[state.theme].top);
      document.querySelector('.themes').setAttribute('aria-label','时段 · '+palettes[state.theme].label+(state.automatic?' · 跟随本地时间':''));
      document.documentElement.style.setProperty('--selection',rgb(palettes[state.theme].halo,.38));
      invalidate();
    }
    setTheme(state.automatic?'auto':state.theme);
    setRange('wind',config.wind);setRange('density',config.density);
    document.querySelectorAll('.theme').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.theme)));
    function syncTime(){if(state.automatic&&weatherTheme()!==state.theme)setTheme('auto');}
    setInterval(syncTime,30000);document.addEventListener('visibilitychange',syncTime);
    function setRange(key,value){state[key]=value/100;document.getElementById(key).value=String(value);document.getElementById(key+'-value').textContent=value+'%';if(key==='wind')resizeOcean();invalidate();}
    for(const key of ['wind','density'])document.getElementById(key).addEventListener('input',e=>setRange(key,Number(e.target.value)));
    function setClouds(value){state.clouds=value;document.getElementById('clouds').setAttribute('aria-pressed',String(value));invalidate(true);}
    document.getElementById('clouds').addEventListener('click',()=>setClouds(!state.clouds));
    function immersive(value){state.immersive=value;document.body.classList.toggle('immersive',value);if(value)document.getElementById('restore').focus({preventScroll:true});else document.getElementById(scene.target?'passage-immersive':harbor.target?'friends-immersive':'immersive').focus({preventScroll:true});}
    document.getElementById('immersive').addEventListener('click',()=>immersive(true));document.getElementById('restore').addEventListener('click',()=>immersive(false));
    addEventListener('keydown',e=>{
      if(e.defaultPrevented||document.querySelector('#wordsea-collection[open],#weather-dialog[open],#sea-settings-dialog[open]'))return;
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target.isContentEditable)return;
      if(e.key==='Escape'){if(state.immersive)immersive(false);else if(scene.target||harbor.target)navigateScene(null);return;}
      if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)&&!articleScroll.contains(e.target)&&!friendsView.contains(e.target)){e.preventDefault();setPaused(!state.paused);}
      if(e.key.toLowerCase()==='h')immersive(!state.immersive);
    });
    for(const surface of [skyBase,sky,ocean,passage]){
      surface.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||reducedMotion.matches)return;state.px=(e.clientX/width-.5)*2;state.py=(e.clientY/height-.5)*2;invalidate();});
      surface.addEventListener('pointerleave',()=>{state.px=0;state.py=0;invalidate();});
    }
    pickOnTap(ocean,(clientX,clientY)=>{
      if(scene.target)return;
      const ndc=1-clientY/height*2;if(ndc>=.19)return;
      const depth=(8.0+state.my*.6)*1.8/(.22-ndc);
      const x=((clientX/width*2-1)*depth*(width/height))/1.8+state.mx*3;
      state.ripples.push({x,z:20-depth-harbor.cruise,time:state.time});state.ripples=state.ripples.slice(-4);invalidate();
    });
    function pickOnTap(surface,pick){
      let start=null;
      surface.addEventListener('pointerdown',e=>{start=e.isPrimary&&e.button===0?{x:e.clientX,y:e.clientY,id:e.pointerId,moved:false}:null;});
      surface.addEventListener('pointermove',e=>{if(start&&start.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8)start.moved=true;});
      surface.addEventListener('pointercancel',()=>{start=null;});
      surface.addEventListener('pointerup',e=>{
        const down=start;start=null;
        if(!down||down.moved||down.id!==e.pointerId||Math.hypot(e.clientX-down.x,e.clientY-down.y)>8||scene.transitioning||harbor.transitioning)return;
        const item=pick(e.clientX,e.clientY);
        if(item)document.dispatchEvent(new CustomEvent('wordsea:collect',{detail:item}));
      });
    }
    pickOnTap(passage,(x,y)=>{const quote=passageRenderer?.pick(x,y);return quote?{kind:'quote',id:quote.id}:null;});
    document.addEventListener('wordsea:quote-picked',event=>{
      if(passageRenderer?.setPickedQuote(event.detail?.id??null))invalidate();
    });
    if(matchMedia('(pointer:coarse)').matches)document.getElementById('hint').textContent='轻触海面泛起涟漪 · 调节风浪探索';
    ocean.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelFrames();document.getElementById('error').style.display='flex';});
    ocean.addEventListener('webglcontextrestored',()=>location.reload());
    // Public-domain passages in their original languages. Texture columns belong
    // to the wall planes; no text billboard or per-letter DOM animation is used.
    // Keep an older cached document working while theme files are upgraded.
    const wallQuotes=window.wordSeaCollection?.quotes||[
      {lang:'zh',text:'知者乐水，仁者乐山。',author:'孔子 · 论语'},
      {lang:'zh',text:'学而不思则罔，思而不学则殆。',author:'孔子 · 论语'},
      {lang:'zh',text:'千里之行，始于足下。',author:'老子 · 道德经'},
      {lang:'zh',text:'海内存知己，天涯若比邻。',author:'王勃'},
      {lang:'en',text:'We are such stuff as dreams are made on, and our little life is rounded with a sleep.',author:'William Shakespeare · The Tempest'},
      {lang:'en',text:'All the world’s a stage, and all the men and women merely players.',author:'William Shakespeare · As You Like It'},
      {lang:'fr',text:'Je pense, donc je suis.',author:'René Descartes'},
      {lang:'ja',text:'古池や蛙飛びこむ水の音',author:'松尾芭蕉'},
      {lang:'es',text:'Caminante, no hay camino, se hace camino al andar.',author:'Antonio Machado'},
      {lang:'pt',text:'Tudo vale a pena se a alma não é pequena.',author:'Fernando Pessoa'},
      {lang:'it',text:'Fatti non foste a viver come bruti, ma per seguir virtute e canoscenza.',author:'Dante Alighieri'},
      {lang:'ru',text:'Я вас любил: любовь ещё, быть может, в душе моей угасла не совсем.',author:'Александр Пушкин'}
    ].map((quote,id)=>({...quote,id}));
    function createPassageRenderer(){
      const pg=passage.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});
      if(!pg)throw new Error('文字长廊需要 WebGL。');
      function compile(type,source){const s=pg.createShader(type);pg.shaderSource(s,source);pg.compileShader(s);if(!pg.getShaderParameter(s,pg.COMPILE_STATUS))throw new Error(pg.getShaderInfoLog(s));return s;}
      const pp=pg.createProgram();
      const vs=compile(pg.VERTEX_SHADER,'attribute vec2 aPosition;varying vec2 vPosition;void main(){vPosition=aPosition;gl_Position=vec4(aPosition,0.0,1.0);}');
      const fs=compile(pg.FRAGMENT_SHADER,`
        precision highp float;
        varying vec2 vPosition;
        uniform sampler2D uQuotes,uQuoteIds,uPickedQuotes;
        uniform float uAspect,uTravel,uReveal,uDescent,uBlur;
        uniform float uPickedStrength;
        uniform vec2 uMouse;
        float quoteInk(vec4 glyph,float packing){
          float priority=glyph.r/max(glyph.a,.001);
          return glyph.a*mix(smoothstep(priority-.055,priority+.055,packing),1.0,step(.999,packing));
        }
        void main(){
          vec2 screen=vPosition;
          float lens=1.62;
          vec3 ray=vec3(screen.x*uAspect/lens,(screen.y-.11)/lens,1.0);
          // A small upward angle makes the vertical writing climb beyond the viewport.
          float pitch=.12+uMouse.y*.012,cp=cos(pitch),sp=sin(pitch);
          ray.yz=mat2(cp,sp,-sp,cp)*ray.yz;
          ray.x+=uMouse.x*.018;
          float side=step(0.0,ray.x),wallWidth=4.2;
          float depth=(wallWidth-(side*2.0-1.0)*uMouse.x*.22)/max(abs(ray.x),.00001);
          float worldZ=depth*ray.z+uTravel,worldY=depth*ray.y+uDescent;
          // Opposite U directions preserve the reading direction on both wall faces.
          vec2 uv=vec2(mix(worldZ,-worldZ,side)/20.0+side*.317,-worldY/10.5+side*.193);
          vec4 glyph=texture2D(uQuotes,uv);
          float packing=smoothstep(.20,.94,uReveal);
          float ink=quoteInk(glyph,packing);
          if(uBlur>0.0){
            vec4 ahead=texture2D(uQuotes,uv+vec2(0.0,uBlur)),behind=texture2D(uQuotes,uv-vec2(0.0,uBlur));
            ink=ink*.60+quoteInk(ahead,packing)*.20+quoteInk(behind,packing)*.20;
          }
          float fog=1.0-exp(-pow(depth/44.0,1.32));
          float columnLight=.69+.18*sin(worldZ*.71+side*4.0)+.12*sin(worldZ*2.19);
          vec3 wall=vec3(.006,.010,.017);
          vec3 typeColor=mix(vec3(.22,.32,.43),vec3(.29,.40,.50),side)*columnLight;
          float picked=0.0;
          if(uPickedStrength>0.0){
            // A nearest-filtered column ID stays exact even where glyphs use mipmaps.
            float quoteId=texture2D(uQuoteIds,vec2(uv.x,.5)).r*255.0;
            picked=texture2D(uPickedQuotes,vec2((quoteId+.5)/256.0,.5)).r;
            typeColor=mix(typeColor,vec3(1.0,.84,.44)*(.92+.08*columnLight),picked);
          }
          vec3 color=wall+typeColor*ink*mix(.78,1.24,picked);
          vec3 mist=vec3(.145,.181,.218)*(1.02-screen.y*.13);
          color=mix(color,mist,fog*smoothstep(.38,.99,uReveal));
          // A small distant light; radii use height units, so the halo stays circular.
          vec2 light=vec2(screen.x*uAspect,screen.y-.26);
          float r=length(light);
          color+=vec3(.83,.68,.44)*(exp(-r*r/ .00028)*.65+exp(-r*r/.0032)*.10)*smoothstep(.64,.98,uReveal);
          float edge=1.0-.23*smoothstep(.35,1.4,length(vec2(screen.x*.65,screen.y*.45)));
          gl_FragColor=vec4(color*edge,1.0);
        }
      `);
      pg.attachShader(pp,vs);pg.attachShader(pp,fs);pg.linkProgram(pp);pg.deleteShader(vs);pg.deleteShader(fs);
      if(!pg.getProgramParameter(pp,pg.LINK_STATUS))throw new Error(pg.getProgramInfoLog(pp));
      pg.useProgram(pp);
      const locations=Object.fromEntries(['uAspect','uTravel','uReveal','uDescent','uBlur','uMouse','uQuotes','uQuoteIds','uPickedQuotes','uPickedStrength'].map(name=>[name,pg.getUniformLocation(pp,name)]));
      const buffer=pg.createBuffer();pg.bindBuffer(pg.ARRAY_BUFFER,buffer);pg.bufferData(pg.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),pg.STATIC_DRAW);
      const location=pg.getAttribLocation(pp,'aPosition');pg.enableVertexAttribArray(location);pg.vertexAttribPointer(location,2,pg.FLOAT,false,0,0);
      // Independent PRNG keeps the previously accepted ocean packing unchanged.
      let quoteSeed=10927;
      const qr=()=>{quoteSeed=(quoteSeed*1664525+1013904223)>>>0;return quoteSeed/4294967296;};
      const tile=document.createElement('canvas');tile.width=tile.height=Math.min(2048,pg.getParameter(pg.MAX_TEXTURE_SIZE));
      const tc=tile.getContext('2d'),ts=tile.width/2048;tc.fillStyle='#fff';tc.textBaseline='alphabetic';tc.textAlign='left';
      let columns=0,quoteOrder=[];const quoteColumns=[];
      const font=size=>`${size}px "Times New Roman", "Songti SC", "Hiragino Mincho ProN", serif`;
      for(let occupied=0;;){
        if(!quoteOrder.length){quoteOrder=wallQuotes.slice();for(let j=quoteOrder.length-1;j>0;j--){const k=Math.floor(qr()*(j+1));[quoteOrder[j],quoteOrder[k]]=[quoteOrder[k],quoteOrder[j]];}}
        const quote=quoteOrder.pop(),vertical=quote.lang==='zh'||quote.lang==='ja';
        const text=quote.text+' · '+quote.author+' · ',chars=Array.from(text);
        let size=(18+qr()*3)*ts;tc.font=font(size);
        let run=vertical?chars.length*size*1.18:tc.measureText(text).actualBoundingBoxLeft+tc.measureText(text).actualBoundingBoxRight;
        const repeats=Math.max(1,Math.round(tile.height/(run+size*1.4))),period=tile.height/repeats;
        // Fit complete quotations to the repeat, leaving one small consistent break.
        // Changing the font, rather than stretching the texture, preserves glyph shapes.
        size*=period/(run+size*1.4);tc.font=font(size);
        const metric=tc.measureText(text),glyphMetrics=vertical?chars.map(char=>tc.measureText(char)):[];
        const inkWidth=vertical?Math.max(...glyphMetrics.map(m=>m.actualBoundingBoxLeft+m.actualBoundingBoxRight)):metric.actualBoundingBoxAscent+metric.actualBoundingBoxDescent;
        const gutter=(5+qr()*2)*ts;
        if(occupied+inkWidth+gutter>tile.width)break;
        const step=size*1.18;
        run=vertical?chars.length*step:metric.actualBoundingBoxLeft+metric.actualBoundingBoxRight;
        const start=-qr()*period,alpha=.58+qr()*.34;
        quoteColumns.push({quote,size,chars,vertical,metric,glyphMetrics,inkWidth,step,run,repeats,period,start,alpha,gutter});
        occupied+=inkWidth+gutter;columns++;
      }
      const spare=(tile.width-quoteColumns.reduce((sum,c)=>sum+c.inkWidth+c.gutter,0))/columns;
      let left=0;
      for(const column of quoteColumns){
        const {size,chars,vertical,metric,glyphMetrics,inkWidth,step,run,repeats,period,start,alpha,gutter}=column;
        const gap=gutter+spare;left+=gap/2;tc.font=font(size);tc.globalAlpha=alpha;
        column.left=left;
        for(let repeat=0;repeat<repeats;repeat++){
          const y=start+repeat*period;
          tc.fillStyle=`rgb(${Math.floor((.04+qr()*.85)*255)},255,255)`;
          for(const offset of [-tile.height,0,tile.height]){
            if(y+offset+run<0||y+offset>tile.height)continue;
            if(vertical){
              for(let j=0;j<chars.length;j++){
                const m=glyphMetrics[j],w=m.actualBoundingBoxLeft+m.actualBoundingBoxRight;
                const x=left+(inkWidth-w)/2+m.actualBoundingBoxLeft;
                const baseline=y+offset+(j+.5)*step+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2;
                tc.fillText(chars[j],x,baseline);
              }
            }else{
              tc.save();tc.translate(left+metric.actualBoundingBoxDescent,y+offset+metric.actualBoundingBoxLeft);tc.rotate(Math.PI/2);tc.fillText(chars.join(''),0,0);tc.restore();
            }
          }
        }
        left+=inkWidth+gap/2;
      }
      const tex=pg.createTexture();pg.bindTexture(pg.TEXTURE_2D,tex);pg.pixelStorei(pg.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);pg.texImage2D(pg.TEXTURE_2D,0,pg.RGBA,pg.RGBA,pg.UNSIGNED_BYTE,tile);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_S,pg.REPEAT);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_T,pg.REPEAT);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MIN_FILTER,pg.LINEAR_MIPMAP_LINEAR);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MAG_FILTER,pg.LINEAR);pg.generateMipmap(pg.TEXTURE_2D);
      const anisotropy=pg.getExtension('EXT_texture_filter_anisotropic');if(anisotropy)pg.texParameterf(pg.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,pg.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      pg.uniform1i(locations.uQuotes,0);
      // One tiny row identifies every copy of a quotation on both repeating walls.
      const quoteIds=new Uint8Array(tile.width*4);
      for(const column of quoteColumns){
        for(let x=Math.floor(column.left);x<Math.min(tile.width,Math.ceil(column.left+column.inkWidth));x++){
          quoteIds[x*4]=column.quote.id+1;quoteIds[x*4+3]=255;
        }
      }
      const idTexture=pg.createTexture();pg.activeTexture(pg.TEXTURE1);pg.bindTexture(pg.TEXTURE_2D,idTexture);
      pg.texImage2D(pg.TEXTURE_2D,0,pg.RGBA,tile.width,1,0,pg.RGBA,pg.UNSIGNED_BYTE,quoteIds);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_S,pg.REPEAT);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_T,pg.REPEAT);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MIN_FILTER,pg.NEAREST);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MAG_FILTER,pg.NEAREST);
      pg.uniform1i(locations.uQuoteIds,1);
      // A 1KB lookup fades each quote independently, including rapid re-picks.
      const pickedPixels=new Uint8Array(256*4);
      for(let i=0;i<256;i++)pickedPixels[i*4+3]=255;
      const pickedTexture=pg.createTexture();pg.activeTexture(pg.TEXTURE2);pg.bindTexture(pg.TEXTURE_2D,pickedTexture);
      pg.texImage2D(pg.TEXTURE_2D,0,pg.RGBA,256,1,0,pg.RGBA,pg.UNSIGNED_BYTE,pickedPixels);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_S,pg.CLAMP_TO_EDGE);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_WRAP_T,pg.CLAMP_TO_EDGE);
      pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MIN_FILTER,pg.NEAREST);pg.texParameteri(pg.TEXTURE_2D,pg.TEXTURE_MAG_FILTER,pg.NEAREST);
      pg.uniform1i(locations.uPickedQuotes,2);pg.activeTexture(pg.TEXTURE0);
      const highlight={quote:0,strength:0,weights:new Float32Array(256),from:new Float32Array(256),started:0,settling:false};
      function setPickedQuote(id){
        const quote=wallQuotes.find(q=>q.id===id),next=quote?quote.id+1:0;
        if(next===highlight.quote)return false;
        highlight.from.set(highlight.weights);highlight.quote=next;highlight.started=performance.now();highlight.settling=true;
        return true;
      }
      function updateHighlight(now){
        if(!highlight.settling)return false;
        const t=reducedMotion.matches?1:Math.max(0,Math.min(1,(now-highlight.started)/420)),ease=t*t*(3-2*t);
        let strength=0,changed=false;
        for(const quote of wallQuotes){
          const id=quote.id+1,value=lerp(highlight.from[id],id===highlight.quote?1:0,ease),byte=Math.round(value*255);
          highlight.weights[id]=value;strength=Math.max(strength,value);
          if(pickedPixels[id*4]!==byte){pickedPixels[id*4]=byte;changed=true;}
        }
        highlight.strength=strength;highlight.settling=t<1;
        if(changed){
          pg.activeTexture(pg.TEXTURE2);pg.texSubImage2D(pg.TEXTURE_2D,0,0,0,256,1,pg.RGBA,pg.UNSIGNED_BYTE,pickedPixels);pg.activeTexture(pg.TEXTURE0);
        }
        return t<1;
      }
      const passageScalars={};let passageMouseX=NaN,passageMouseY=NaN;
      function passageScalar(name,value){if(passageScalars[name]!==value){pg.uniform1f(locations[name],value);passageScalars[name]=value;}}
      function resizePassage(){
        const w=Math.round(width*dpr),h=Math.round(height*dpr);
        if(passage.width===w&&passage.height===h)return;
        passage.width=w;passage.height=h;pg.viewport(0,0,w,h);
      }
      resizePassage();
      function pickPassage(clientX,clientY){
        if(scene.mix!==1||scene.transitioning||!Number.isFinite(passageMouseX))return null;
        const rect=passage.getBoundingClientRect();
        const sx=(clientX-rect.left)/rect.width*2-1,sy=1-(clientY-rect.top)/rect.height*2;
        const pitch=.12+passageMouseY*.012,cp=Math.cos(pitch),sp=Math.sin(pitch);
        const rayX=sx*passageScalars.uAspect/1.62+passageMouseX*.018;
        const y=(sy-.11)/1.62,rayY=cp*y-sp,rayZ=sp*y+cp;
        const side=rayX>=0?1:0,depth=(4.2-(side*2-1)*passageMouseX*.22)/Math.max(Math.abs(rayX),.00001);
        if(depth>100)return null;
        const u=(depth*rayZ+passageScalars.uTravel)*(side?-1:1)/20+side*.317;
        const v=-(depth*rayY+passageScalars.uDescent)/10.5+side*.193;
        const x=(u-Math.floor(u))*tile.width,ty=(v-Math.floor(v))*tile.height;
        const column=quoteColumns.find(c=>x>=c.left&&x<=c.left+c.inkWidth);
        if(!column)return null;
        const offset=((ty-column.start)%column.period+column.period)%column.period;
        return offset<=column.run?column.quote:null;
      }
      return {resize:resizePassage,pick:pickPassage,setPickedQuote,updateHighlight,columns,languages:new Set(wallQuotes.map(q=>q.lang)).size,draw(){
        passageScalar('uAspect',width/height);passageScalar('uTravel',scene.scroll*12);
        passageScalar('uReveal',scene.mix);
        const depthT=Math.max(0,Math.min(1,(scene.mix-.18)/.82));
        passageScalar('uDescent',(1-smooth(.18,1,scene.mix))*160);
        passageScalar('uBlur',scene.transitioning?.006*4*depthT*(1-depthT):0);
        passageScalar('uPickedStrength',highlight.strength);
        if(passageMouseX!==state.mx||passageMouseY!==state.my){pg.uniform2f(locations.uMouse,state.mx,state.my);passageMouseX=state.mx;passageMouseY=state.my;}
        pg.drawArrays(pg.TRIANGLES,0,3);
      }};
    }
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    const homeUi=[...document.querySelectorAll('.header,.caption,.controls,.journal')];
    const sceneStyles=new WeakMap();
    function sceneStyle(element,key,value){
      let previous=sceneStyles.get(element);if(!previous){previous={};sceneStyles.set(element,previous);}
      if(previous[key]!==value){element.style[key]=value;previous[key]=value;}
    }
    function applySceneVisuals(){
      const mix=scene.mix;
      const approach=smooth(0,.27,mix);
      sceneStyle(seaScene,'opacity',String(1-smooth(.32,.55,mix)));
      for(const skyLayer of [skyBase,sky]){
        sceneStyle(skyLayer,'transform',`translateY(${-approach*height*.44}px)`);
        sceneStyle(skyLayer,'opacity',String(1-smooth(.10,.42,mix)));
      }
      sceneStyle(diveShade,'opacity',String(smooth(.12,.45,mix)*.98));
      sceneStyle(passage,'opacity',String(smooth(.20,.53,mix)));sceneStyle(passage,'visibility',mix>.20?'visible':'hidden');
      sceneStyle(passage,'pointerEvents',scene.target?'auto':'none');
      sceneStyle(veil,'opacity',String(Math.sin(mix*Math.PI)*.14));
      sceneStyle(articleView,'opacity',String(smooth(.86,1,mix)));
      applyFriendsVisuals();
    }
    function syncSceneTransition(){document.body.classList.toggle('scene-transition',scene.transitioning||harbor.transitioning);}
    function applyFriendsVisuals(){
      sceneStyle(friendsView,'opacity',String(smooth(.18,.80,harbor.mix)*(1-smooth(0,.32,scene.mix))));
      sceneStyle(friendsShade,'opacity',String(harbor.mix*.66));
    }
    function finishFriends(){
      applyFriendsVisuals();syncSceneTransition();
      if(harbor.target){
        friendsView.inert=Boolean(scene.target);
        if(!scene.target&&!state.immersive)document.getElementById('friends-heading').focus({preventScroll:true});
      }else{
        friendsView.hidden=true;friendsView.inert=true;document.body.classList.remove('friends-mode');
        beaconCtx.clearRect(0,0,width,height);harbor.levels.fill(0);
        if(!scene.target)document.querySelector('main').setAttribute('aria-label','由多语言文字组成的动态海洋');
        if(!scene.target&&!state.immersive)document.getElementById('open-friends')?.focus({preventScroll:true});
      }
    }
    function setFriends(value,animate=true){
      const target=value?1:0;if(target===harbor.target)return;
      if(state.immersive)immersive(false);
      harbor.hover=-1;
      if(target){
        prepareHarborNoise();layoutBeacons();friendsView.hidden=false;friendsView.inert=true;
        document.body.classList.add('friends-mode');
        document.querySelector('main').setAttribute('aria-label','文字海洋上的六盏友链灯火');
      }else{friendsView.inert=true;}
      harbor.from=harbor.mix;harbor.target=target;harbor.started=performance.now();
      harbor.duration=3600*Math.max(.25,Math.abs(target-harbor.from));harbor.transitioning=animate&&!reducedMotion.matches;syncSceneTransition();
      if(!harbor.transitioning){harbor.mix=target;harbor.cruise=target*68;finishFriends();}
      invalidate();
    }
    function finishScene(){
      applySceneVisuals();resizeOcean();syncSceneTransition();
      if(scene.target){
        seaScene.style.visibility='hidden';document.body.classList.add('article-mode');articleView.inert=false;
        if(!state.immersive)document.getElementById('article-heading').focus({preventScroll:true});
      }else{
        seaScene.style.visibility='visible';articleView.hidden=true;document.body.classList.remove('article-mode');
        for(const ui of homeUi)ui.inert=false;
        if(scene.article&&!state.immersive&&!harbor.target)document.getElementById('journal-heading')?.focus({preventScroll:true});
        scene.article=null;document.querySelector('main').setAttribute('aria-label',harbor.target?'文字海洋上的六盏友链灯火':'由多语言文字组成的动态海洋');
        if(harbor.target&&!harbor.transitioning){friendsView.inert=false;if(!state.immersive)document.getElementById('friends-heading').focus({preventScroll:true});}
      }
    }
    function setArticleScene(id,animate=true){
      if(id!=='article')id=null;
      const target=id?1:0;
      if(target===scene.target&&(target===0||id===scene.article))return;
      if(target&&!passageRenderer){
        try{passageRenderer=createPassageRenderer();}catch(e){console.error(e);document.body.classList.add('no-effects');document.getElementById('hint').textContent='语廊暂时无法显示，请开启浏览器硬件加速。';return;}
      }
      if(state.immersive)immersive(false);
      if(target){
        articleScroll.scrollTop=0;scene.scrollTarget=0;articleView.hidden=false;articleView.inert=true;
        document.body.classList.add('article-mode');document.querySelector('main').setAttribute('aria-label','多语言名言长廊与文章阅读');scene.article=id;
        for(const ui of homeUi)ui.inert=true;
      }else{articleView.inert=true;}
      seaScene.style.visibility='visible';scene.from=scene.mix;scene.target=target;scene.started=performance.now();
      scene.duration=3400*Math.max(.25,Math.abs(scene.target-scene.from));scene.transitioning=animate&&!reducedMotion.matches;
      syncSceneTransition();resizeOcean();
      if(!scene.transitioning){scene.mix=target;finishScene();}
      invalidate();
    }
    function setScene(id,animate=true){
      if(id==='friends'){setArticleScene(null,animate);setFriends(true,animate);}
      else{setFriends(false,animate);setArticleScene(id,animate);}
    }
    function navigateScene(id){document.dispatchEvent(new CustomEvent('wordsea:navigate',{detail:{scene:id||'sea'}}));}
    document.getElementById('passage-play').addEventListener('click',()=>setPaused(!state.paused));
    document.getElementById('passage-immersive').addEventListener('click',()=>immersive(true));
    document.getElementById('friends-play').addEventListener('click',()=>setPaused(!state.paused));
    document.getElementById('friends-immersive').addEventListener('click',()=>immersive(true));
    articleScroll.addEventListener('scroll',()=>{scene.scrollTarget=Math.max(0,Math.min(1,articleScroll.scrollTop/Math.max(1,articleScroll.scrollHeight-articleScroll.clientHeight)));invalidate();},{passive:true});
    passage.addEventListener('webglcontextlost',e=>{e.preventDefault();navigateScene(null);document.getElementById('hint').textContent='语廊画面暂时中断，已回到字海。';});
    passage.addEventListener('webglcontextrestored',()=>location.reload());
    // A small read-only diagnostic is useful when adapting this effect to another project.
    window.wordSea={setWeather,setScene:(mode,animate=true)=>setScene(mode==='sea'?null:mode,animate),setFriends:bindFriends,getState:()=>({theme:palettes[state.theme].label,automatic:state.automatic,wind:state.wind,density:state.density,paused:state.paused,clouds:state.clouds,time:state.time,frames:frameCount,words:seaWords.length,ripples:state.ripples.length,scene:scene.target?"article":harbor.target?"friends":"sea",article:scene.article,transitioning:scene.transitioning||harbor.transitioning,transition:scene.mix,passageFrames:scene.frames,friendsTransition:harbor.mix,travel:harbor.cruise,friendHover:harbor.hover,beaconFrames:harbor.frames,weather:weatherObservation?{code:weatherObservation.code,preview:Boolean(weatherObservation.preview),cloud:weather.cloud,rain:weather.rain,snow:weather.snow,fog:weather.fog,active:weather.active,wind:waveWind}:null})};
    if(document.modelContext?.registerTool){
      const lifecycle=new AbortController();
      try{
        Promise.resolve(document.modelContext.registerTool({
          name:'configure_word_ocean',title:'调节文字海洋',
          description:'Set the visible ocean controls: lighting, wave strength, word density, animation pause and word clouds.',
          inputSchema:{type:'object',properties:{theme:{type:'string',enum:[...Object.keys(palettes),'auto','dawn']},wind:{type:'number',minimum:0,maximum:100},density:{type:'number',minimum:30,maximum:100},paused:{type:'boolean'},clouds:{type:'boolean'}},additionalProperties:false},
          annotations:{readOnlyHint:false,untrustedContentHint:false},
          execute(input){
            if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected an object.');
            for(const [key,value] of Object.entries(input)){
              if(!['theme','wind','density','paused','clouds'].includes(key))throw new Error('Unknown setting.');
              if(key==='theme'&&value!=='auto'&&value!=='dawn'&&!Object.hasOwn(palettes,value))throw new Error('Unknown theme.');
              if(['wind','density'].includes(key)&&(typeof value!=='number'||!Number.isFinite(value)||value<(key==='density'?30:0)||value>100))throw new Error('Setting outside allowed range.');
              if(['paused','clouds'].includes(key)&&typeof value!=='boolean')throw new Error('Expected a boolean.');
            }
            if(input.theme!==undefined)setTheme(input.theme);
            for(const key of ['wind','density'])if(input[key]!==undefined)setRange(key,input[key]);
            if(input.paused!==undefined)setPaused(input.paused);
            if(input.clouds!==undefined)setClouds(input.clouds);
            return {theme:state.theme,automatic:state.automatic,wind:state.wind*100,density:state.density*100,paused:state.paused,clouds:state.clouds};
          }
        },{signal:lifecycle.signal})).catch(e=>console.warn('Optional browser controls unavailable:',e.message));
      }catch(e){console.warn('Optional browser controls unavailable:',e.message);}
      addEventListener('beforeunload',()=>lifecycle.abort(),{once:true});
    }
    setScene(config.scene==='sea'?null:config.scene,false);
    document.body.classList.add('effects-ready');
  })();
