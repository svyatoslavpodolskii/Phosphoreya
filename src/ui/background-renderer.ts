import type {Camera} from '../graph/model';
import type {Viewport} from '../graph/camera';
import type {BackgroundMode} from '../core/themes';
import {BACKGROUND_TILE,BACKGROUND_DEPTHS,backgroundTransform} from './theme-background';

type GL=WebGLRenderingContext|WebGL2RenderingContext;
type Tile={canvas:HTMLCanvasElement;levels:{canvas:HTMLCanvasElement;pattern:CanvasPattern}[]};
/** A fixed viewport and three immutable tiles. Camera changes only uniforms;
 * never DOM scale, viewport-sized rasterization or texture uploads on WebGL. */
export class BackgroundRenderer {
 canvas=document.createElement('canvas');
 private gl:GL|null=null;private ctx:CanvasRenderingContext2D|null=null;
 private program?:WebGLProgram;private buffer?:WebGLBuffer;private textures:WebGLTexture[]=[];
 private uniforms=new Map<string,WebGLUniformLocation|null>();private tiles:(Tile|undefined)[]=[];
 private lost=false;
 private signature='';private dirty=true;
 private uploads=0;private draws=0;private resizes=0;
 constructor(private onchange:()=>void=()=>{}){
  const attributes={alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false};
  this.gl=this.canvas.getContext('webgl2',attributes) as GL|null;
  this.gl??=this.canvas.getContext('webgl',attributes) as GL|null;
  try{if(this.gl){const info=this.gl.getExtension('WEBGL_debug_renderer_info'),device=info?String(this.gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):'';if(/swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(device))throw Error('Software GPU');this.initialize();}}catch{this.disposeGL();this.gl=null;this.canvas=document.createElement('canvas');}
  if(!this.gl)this.ctx=this.canvas.getContext('2d');
  this.canvas.dataset.backgroundRenderer=this.gl?'webgl':'canvas';
  this.canvas.addEventListener('webglcontextlost',this.onlost);
  this.canvas.addEventListener('webglcontextrestored',this.onrestored);
 }
 private onlost=(e:Event)=>{e.preventDefault();this.lost=true;this.canvas.dataset.contextLost='true';};
 private onrestored=()=>{this.lost=false;this.canvas.dataset.contextLost='false';this.initialize();for(let i=0;i<3;i++){const tile=this.tiles[i];if(tile)this.upload(i,tile.canvas);}this.dirty=true;this.onchange();};
 private initialize(){
  const gl=this.gl!;
  const webgl2=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext;
  const shader=(type:number,body:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,body);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error||'Background shader failed');}return s;};
  const vertex=shader(gl.VERTEX_SHADER,webgl2?'#version 300 es\nin vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}':'attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.,1.);}');
  const sample=webgl2?'texture':'texture2D';
  const fragment=shader(gl.FRAGMENT_SHADER,`${webgl2?'#version 300 es\n':''}precision highp float;
   uniform vec2 uView;uniform float uResolution;uniform sampler2D uTile0;uniform sampler2D uTile1;uniform sampler2D uTile2;
   uniform vec3 uTransform0;uniform vec3 uTransform1;uniform vec3 uTransform2;${webgl2?'out vec4 outColor;':''}
   vec2 uv(vec2 p,vec3 t){return (p-t.yz)/(vec2(1280.,800.)*t.x);}
   void main(){vec2 p=vec2(gl_FragCoord.x/uResolution,uView.y-gl_FragCoord.y/uResolution);
   vec4 c=${sample}(uTile0,uv(p,uTransform0));vec4 b=${sample}(uTile1,uv(p,uTransform1));c=b+c*(1.-b.a);
   b=${sample}(uTile2,uv(p,uTransform2));c=b+c*(1.-b.a);${webgl2?'outColor':'gl_FragColor'}=c;}`);
  const program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw Error('Background program failed');}
  this.program=program;this.uniforms.clear();gl.useProgram(program);
  this.buffer=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  this.textures=[];
  for(let i=0;i<3;i++){const texture=gl.createTexture()!;this.textures.push(texture);gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.generateMipmap(gl.TEXTURE_2D);gl.uniform1i(this.uniform('uTile'+i),i);}
 }
 private uniform(name:string){if(!this.uniforms.has(name))this.uniforms.set(name,this.gl!.getUniformLocation(this.program!,name));return this.uniforms.get(name)!;}
 private upload(index:number,canvas:HTMLCanvasElement){const gl=this.gl!;gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.generateMipmap(gl.TEXTURE_2D);this.canvas.dataset.tileUploads=String(++this.uploads);}
 setTile(index:number,image:HTMLImageElement){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
  const levels:Tile['levels']=[];
  if(this.ctx){let current=canvas;while(current.width>=16){const pattern=this.ctx.createPattern(current,'repeat')!;levels.push({canvas:current,pattern});if(current.width===16)break;const next=document.createElement('canvas');next.width=current.width/2;next.height=current.height/2;const ctx=next.getContext('2d')!;ctx.imageSmoothingQuality='high';ctx.drawImage(current,0,0,next.width,next.height);current=next;}}
  this.dirty=true;this.tiles[index]={canvas,levels};if(this.gl&&!this.lost)this.upload(index,canvas);
 }
 clear(){this.dirty=true;this.signature='';this.tiles=[];if(this.gl&&!this.lost){const gl=this.gl;for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.generateMipmap(gl.TEXTURE_2D);}gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}else this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);}
 draw(camera:Camera,view:Viewport,mode:BackgroundMode){
  if(!view.width||!view.height||this.lost||!this.tiles.some(Boolean))return;
  const resolution=Math.min(devicePixelRatio||1,2),width=Math.round(view.width*resolution),height=Math.round(view.height*resolution);
  if(width!==this.canvas.width||height!==this.canvas.height){this.canvas.width=width;this.canvas.height=height;this.canvas.dataset.surfaceResizes=String(++this.resizes);}
  const transforms=BACKGROUND_DEPTHS.map(depth=>backgroundTransform(mode,camera,view,depth));
  const signature=JSON.stringify([width,height,...transforms]);if(signature===this.signature&&!this.dirty)return;this.signature=signature;this.dirty=false;
  this.canvas.dataset.worldTransforms=JSON.stringify(transforms.map(t=>`${t.scale},${t.x},${t.y}`));
  if(this.gl){const gl=this.gl;gl.viewport(0,0,width,height);gl.useProgram(this.program!);gl.uniform2f(this.uniform('uView'),view.width,view.height);gl.uniform1f(this.uniform('uResolution'),resolution);for(let i=0;i<3;i++){const t=transforms[i];gl.uniform3f(this.uniform('uTransform'+i),t.scale,t.x,t.y);}gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
  else if(this.ctx){const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);for(let i=0;i<3;i++){const tile=this.tiles[i];if(!tile)continue;const t=transforms[i],target=BACKGROUND_TILE.width*t.scale*resolution;const level=tile.levels.find(l=>l.canvas.width<=target*1.5)||tile.levels.at(-1)!;ctx.setTransform(resolution*t.scale*BACKGROUND_TILE.width/level.canvas.width,0,0,resolution*t.scale*BACKGROUND_TILE.height/level.canvas.height,resolution*t.x,resolution*t.y);ctx.fillStyle=level.pattern;const inv=ctx.getTransform().inverse();const a=new DOMPoint(0,0).matrixTransform(inv),b=new DOMPoint(width,height).matrixTransform(inv);ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);}ctx.setTransform(1,0,0,1,0,0);}
  this.canvas.dataset.backgroundFrames=String(++this.draws);
 }
 private disposeGL(){if(!this.gl)return;for(const texture of this.textures)this.gl.deleteTexture(texture);if(this.buffer)this.gl.deleteBuffer(this.buffer);if(this.program)this.gl.deleteProgram(this.program);}
 destroy(){this.canvas.removeEventListener('webglcontextlost',this.onlost);this.canvas.removeEventListener('webglcontextrestored',this.onrestored);this.disposeGL();this.tiles=[];this.canvas.width=this.canvas.height=1;}
}
