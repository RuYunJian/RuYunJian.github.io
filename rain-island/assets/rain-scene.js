import * as THREE from 'three';
export class RainScene {
  constructor(container) {
    this.renderer=new THREE.WebGLRenderer({alpha:false,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.25));this.renderer.setSize(720,247);this.renderer.setClearColor(0x050708,1);
    container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(44,720/247,.1,80);
    this.camera.position.set(0,5.1,12.4);this.camera.lookAt(0,.8,-1.5);
    this.time=0;this.intensity=0;this.target=0;
    this.uniforms={uTime:{value:0},uIntensity:{value:0},uCamera:{value:this.camera.position}};
    const count=6000,positions=new Float32Array(count*6),seeds=new Float32Array(count*2);
    let seed=19371;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
    for(let i=0;i<count;i++){const x=(random()-.5)*27,y=random()*13,z=(random()-.5)*20,s=random();positions.set([x,y,z,x,y+.22+s*.3,z],i*6);seeds.set([s,s],i*2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float seed; uniform float uTime; uniform float uIntensity; varying float vAlpha;
      void main(){vec3 p=position;float speed=8.5+seed*5.;p.y=mod(position.y-uTime*speed,13.);p.x+=p.y*.035;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      float pool=exp(-pow((p.x-4.)*.19,2.))+0.6*exp(-pow((p.x+4.)*.24,2.));
      vAlpha=(.05+seed*.16)*pool*exp(-max(0.,-mv.z-7.)*.08)*smoothstep(0.,.25,p.y)*(0.35+uIntensity*.65);}`,
      fragmentShader:`varying float vAlpha; void main(){gl_FragColor=vec4(.66,.79,.88,vAlpha);}`});
    this.rain=new THREE.LineSegments(geometry,material);this.scene.add(this.rain);
    const ground=new THREE.PlaneGeometry(200,200,1,1);ground.rotateX(-Math.PI/2);
    const groundMat=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:`varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 vPosition;uniform float uTime;uniform float uIntensity;
      void main(){vec2 p=vPosition.xz;float pool=exp(-dot((p-vec2(4.,-1.))*vec2(.24,.27),(p-vec2(4.,-1.))*vec2(.24,.27)))+.55*exp(-dot((p-vec2(-4.,2.))*vec2(.25,.32),(p-vec2(-4.,2.))*vec2(.25,.32)));
      float grain=pow(max(0.,sin(p.x*34.+sin(p.y*27.))*sin(p.y*58.+uTime*.9)),12.);
      vec3 highlights=pool*vec3(.07,.11,.145)*(0.25+uIntensity*.75)+grain*pool*.2*uIntensity;
      float farFade=exp(-max(0.,-p.y-1.)*.13);gl_FragColor=vec4(vec3(.0196,.02745,.03137)+highlights*farFade,1.);}`});
    this.scene.add(new THREE.Mesh(ground,groundMat));
    const splashCount=2300,splashGeo=new THREE.InstancedBufferGeometry();
    const quad=new THREE.PlaneGeometry(1,1);splashGeo.index=quad.index;splashGeo.attributes.position=quad.attributes.position;splashGeo.attributes.uv=quad.attributes.uv;
    const offsets=new Float32Array(splashCount*3),phases=new Float32Array(splashCount);
    for(let i=0;i<splashCount;i++){offsets.set([(random()-.5)*25,0,(random()-.5)*18],i*3);phases[i]=random();}
    splashGeo.setAttribute('offset',new THREE.InstancedBufferAttribute(offsets,3));splashGeo.setAttribute('phase',new THREE.InstancedBufferAttribute(phases,1));
    const splashMat=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      vertexShader:`attribute vec3 offset;attribute float phase;uniform float uTime;varying vec2 vUv;varying float vLife;varying float vLight;
      void main(){vUv=uv;vLife=fract(uTime*(1.25+phase*.8)+phase*19.);float scale=.1+vLife*.85;vec3 p=offset+vec3(position.x*scale,0.015,position.y*scale);
      vec2 d=(p.xz-vec2(4.,-1.))*vec2(.2,.24);vec2 e=(p.xz-vec2(-4.,2.))*vec2(.25,.3);vLight=.2+exp(-dot(d,d))+.55*exp(-dot(e,e));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`varying vec2 vUv;varying float vLife;varying float vLight;uniform float uIntensity;
      void main(){float d=length((vUv-.5)*2.);float aa=max(.045,fwidth(d)*1.2);float ring=exp(-pow((d-.76)/aa,2.));float center=exp(-d*d*45.)*exp(-vLife*15.);float a=(ring*.85+center*1.3)*pow(1.-vLife,1.5)*vLight*(.35+uIntensity*.65);gl_FragColor=vec4(.72,.85,.95,a);}`});
    this.splashes=new THREE.Mesh(splashGeo,splashMat);this.splashes.frustumCulled=false;this.scene.add(this.splashes);
    // Small ballistic droplets rise from impacts, distinct from expanding ground rings.
    const sprayGeo=new THREE.BufferGeometry(),sprayPositions=new Float32Array(1800*3),spraySeed=new Float32Array(1800);
    for(let i=0;i<1800;i++){sprayPositions.set([(random()-.5)*24,0,(random()-.5)*17],i*3);spraySeed[i]=random();}
    sprayGeo.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3));sprayGeo.setAttribute('seed',new THREE.BufferAttribute(spraySeed,1));
    this.spray=new THREE.Points(sprayGeo,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float seed;uniform float uTime;varying float vAlpha;void main(){float t=fract(uTime*(1.4+seed)+seed*61.);vec3 p=position;p.y=sin(t*3.14159)*(.08+seed*.25);p.x+=t*.1;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(40./-mv.z,1.8,4.2);float l=exp(-pow((p.x-4.)*.2,2.))+.5*exp(-pow((p.x+4.)*.25,2.));vAlpha=(1.-t)*.75*l;}`,
      fragmentShader:`varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(.8,.9,1.,vAlpha*smoothstep(.5,.1,d));}`}));
    this.scene.add(this.spray);
    container.addEventListener('webglcontextlost',event=>{event.preventDefault();document.getElementById('graphicsError').hidden=false;});
    this.orbitDuration=1.6;this.orbitElapsed=this.orbitDuration;this.orbitAngle=0;
    // Compile and upload while the native window is still hidden, not during its morph.
    this.renderer.compile(this.scene,this.camera);this.render(0);
  }
  beginEntrance(reduced=false){this.orbitElapsed=reduced?this.orbitDuration:0;this.orbitAngle=0;}
  setRate(rate){this.target=Math.min(1,Math.pow(Math.max(0,rate)/16,.6));}
  render(dt){
    this.orbitElapsed=Math.min(this.orbitDuration,this.orbitElapsed+dt);
    const p=this.orbitElapsed/this.orbitDuration;
    // An actual perspective camera orbit, rather than a CSS spin of the canvas.
    this.orbitAngle=p>=1?Math.PI*2:Math.PI*2*p*p*(3-2*p);
    this.camera.position.set(Math.sin(this.orbitAngle)*13.9,5.1+Math.sin(Math.PI*p)*.45,-1.5+Math.cos(this.orbitAngle)*13.9);
    this.camera.lookAt(0,.8,-1.5);
    this.time+=dt;this.intensity+=(this.target-this.intensity)*(1-Math.exp(-dt*5));
    this.uniforms.uTime.value=this.time;this.uniforms.uIntensity.value=this.intensity;
    this.rain.geometry.setDrawRange(0,Math.round(this.intensity*6000)*2);
    this.splashes.geometry.instanceCount=Math.round(this.intensity*2300);
    this.spray.geometry.setDrawRange(0,Math.round(this.intensity*1800));
    this.renderer.render(this.scene,this.camera);
  }
}
