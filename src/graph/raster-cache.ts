type Entry={levels:HTMLCanvasElement[];bytes:number};
/** Bounded Canvas atlas with lazy, prefiltered minification levels. */
export class RasterCache{
 private entries=new Map<string,Entry>();private bytes=0;
 constructor(private budget=32*1024*1024){}
 private release(entry:Entry){this.bytes-=entry.bytes;for(const canvas of entry.levels)canvas.width=canvas.height=0;}
 get(key:string,width:number,height:number,paint:(context:CanvasRenderingContext2D)=>void,screenScale=1){
  let entry=this.entries.get(key);
  if(entry){this.entries.delete(key);this.entries.set(key,entry);}
  else{
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));
   const ctx=canvas.getContext('2d')!;ctx.scale(2,2);paint(ctx);const bytes=canvas.width*canvas.height*4;
   if(bytes>this.budget)return canvas;
   entry={levels:[canvas],bytes};this.entries.set(key,entry);this.bytes+=bytes;
  }
  const level=Math.min(10,Math.max(0,Math.floor(Math.log2(1/Math.max(.0001,screenScale)))));
  while(entry.levels.length<=level){
   const previous=entry.levels.at(-1)!;if(previous.width<=1&&previous.height<=1)break;
   if(entry.bytes+Math.max(1,Math.ceil(previous.width/2))*Math.max(1,Math.ceil(previous.height/2))*4>this.budget)break;
   const next=document.createElement('canvas');next.width=Math.max(1,Math.ceil(previous.width/2));next.height=Math.max(1,Math.ceil(previous.height/2));const ctx=next.getContext('2d')!;ctx.imageSmoothingQuality='high';ctx.drawImage(previous,0,0,next.width,next.height);entry.levels.push(next);const bytes=next.width*next.height*4;entry.bytes+=bytes;this.bytes+=bytes;
  }
  while(this.bytes>this.budget&&this.entries.size>1){const id=this.entries.keys().next().value!,old=this.entries.get(id)!;this.release(old);this.entries.delete(id);}
  return entry.levels[Math.min(level,entry.levels.length-1)];
 }
 clear(){for(const entry of this.entries.values())this.release(entry);this.entries.clear();}
}
