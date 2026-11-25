import {test,expect} from '@playwright/test';
import {makeAtom,makeLink} from '../../src/core/model';
import {createTheme} from '../../src/core/themes';
import {importMap,readMap} from '../e2e/helpers';
import {mkdir,writeFile} from 'node:fs/promises';
test('world and parallax zoom keep immutable GPU tiles, map WebGL and coordinates',async({browser,browserName})=>{
 test.skip(browserName!=='firefox');
 const context=await browser.newContext({viewport:{width:411,height:862},deviceScaleFactor:2.625,hasTouch:true,storageState:{cookies:[],origins:[{origin:'http://127.0.0.1:4173',localStorage:[{name:'phosphorea:tour-v1',value:'seen'}]}]}});
 await context.addInitScript(()=>{const capture=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=function(id:number){if(id<900)capture.call(this,id);};});
 const page=await context.newPage(),warnings:string[]=[];page.on('console',m=>{if(['warning','error'].includes(m.type()))warnings.push(m.text());});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?profile=1');
 const atoms=Array.from({length:35},(_,i)=>makeAtom({id:'background-'+i,title:'Thought '+i,content:'Some useful content.',x:(i%7-3)*125,y:(Math.floor(i/7)-2)*125}));
 await importMap(page,{atoms,links:atoms.slice(0,20).map((a,i)=>makeLink(a.id,atoms[i+1].id))});const map=page.locator('canvas.map');await expect(map).toHaveAttribute('data-renderer-pending','false');await expect(map).toHaveAttribute('data-layout','idle');
 await mkdir('artifacts/performance',{recursive:true});const baseline=await readMap(page);await expect(map).toHaveAttribute('data-layout','idle');const results=[];
 for(const mode of ['world','parallax'] as const){
  const theme=createTheme('gpu-background','GPU background',{background:'#111111',accent:'#eeeeee',tint:'#777777'},{pattern:'stars',mode,strength:.5,density:.3});await page.evaluate(theme=>window.dispatchEvent(new CustomEvent('phosphora-theme-change',{detail:theme})),theme);
  const backdrop=page.locator('.theme-backdrop canvas');await expect(backdrop).toHaveCount(1);await expect(backdrop).toHaveAttribute('data-background-renderer','webgl');await expect.poll(async()=>Number(await backdrop.getAttribute('data-tile-uploads'))).toBeGreaterThanOrEqual(mode==='world'?3:6);
  const result=await page.evaluate(async()=>{const map=document.querySelector<HTMLCanvasElement>('canvas.map')!,bg=document.querySelector<HTMLCanvasElement>('.theme-backdrop canvas')!,uploads=bg.dataset.tileUploads,resizes=bg.dataset.surfaceResizes,frames:number[]=[],draw:number[]=[];let previous=performance.now();const event=(type:string,id:number,x:number)=>map.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',buttons:1,clientX:x,clientY:431,bubbles:true}));event('pointerdown',901,165.5);event('pointerdown',902,245.5);for(let i=0;i<180;i++){const log=i<60?-2.5*i/60:i<120?-2.5+3.6*(i-60)/60:1.1-1.1*(i-120)/60,d=40*Math.exp(log);event('pointermove',901,205.5-d);event('pointermove',902,205.5+d);await new Promise<void>(resolve=>requestAnimationFrame(()=>{const now=performance.now();frames.push(now-previous);previous=now;draw.push(Number(map.dataset.renderMs));resolve();}));}event('pointerup',901,165.5);event('pointerup',902,245.5);const stats=(v:number[])=>{v=v.slice(10).sort((a,b)=>a-b);return {median:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)]};};return {uploads:Number(bg.dataset.tileUploads)-Number(uploads),resizes:Number(bg.dataset.surfaceResizes)-Number(resizes),frames:stats(frames),draw:stats(draw),backend:map.dataset.renderer,failure:map.dataset.rendererFailure};});
  results.push({mode,...result});console.log(JSON.stringify({mode,...result}));expect(result.backend).toBe('webgl');expect(result.failure).toBeUndefined();expect(result.uploads).toBe(0);expect(result.resizes).toBe(0);await page.screenshot({path:`artifacts/performance/background-${mode}.png`});
 }
 expect(errors).toEqual([]);expect(warnings.filter(s=>/GPU.*unavailable|shader.*error/i.test(s))).toEqual([]);
 const saved=await readMap(page);expect(saved.atoms.map(a=>[a.id,a.x,a.y]).sort()).toEqual(baseline.atoms.map(a=>[a.id,a.x,a.y]).sort());await mkdir('artifacts/performance',{recursive:true});await writeFile('artifacts/performance/background-gpu.json',JSON.stringify(results,null,2));await context.close();
});
