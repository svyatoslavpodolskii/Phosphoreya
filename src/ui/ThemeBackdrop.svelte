<script lang="ts">
 import type {CameraFrames} from '../graph/camera-frames';
 import {onMount,untrack} from 'svelte';
 import {getAppliedTheme,decorationShape,type Theme} from '../core/themes';
 import type {Camera} from '../graph/model';
 import type {Viewport} from '../graph/camera';
 import {BACKGROUND_TILE,backgroundLayers} from './theme-background';
 import {BackgroundRenderer} from './background-renderer';
 let {frames,camera={x:0,y:0,zoom:1},viewport,paused=false}:{frames?:CameraFrames;camera?:Camera;viewport?:Viewport;paused?:boolean}=$props();
 let theme=$state<Theme>(getAppliedTheme()),width=$state(1280),height=$state(800),reduced=$state(false),sleeping=$state(false);
 let root:HTMLDivElement,renderer:BackgroundRenderer|undefined,generation=0;
 const view=$derived(viewport??{width,height}),mode=$derived(reduced?'static':theme.effects.mode??'static');
 function refresh(frameCamera=frames?.current?.camera??camera,frameView=frames?.current?.viewport??view){renderer?.draw(frameCamera,frameView,mode);}
 function rebuild(){
  const version=++generation;renderer?.clear();
  if(!renderer||theme.effects.pattern==='none'||!theme.effects.strength)return;
  const shape=decorationShape(theme);
  for(const [i,layer] of backgroundLayers(theme.effects.pattern,theme.effects.density).entries()){
   const image=new Image(),body=layer.points.map(p=>`<g opacity="${p.opacity}" transform="translate(${p.x} ${p.y}) rotate(${p.rotation}) scale(${p.size})">${shape}</g>`).join('');
   image.onload=()=>{if(version===generation&&renderer){renderer.setTile(i,image);refresh();}};
   image.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${BACKGROUND_TILE.width}" height="${BACKGROUND_TILE.height}">${body}</svg>`);
  }
 }
 $effect(()=>{camera.x;camera.y;camera.zoom;view.width;view.height;mode;untrack(refresh);});
 onMount(()=>{
  renderer=new BackgroundRenderer(()=>refresh());root.appendChild(renderer.canvas);
  const offFrames=frames?.subscribe(frame=>untrack(()=>refresh(frame.camera,frame.viewport)));
  theme=getAppliedTheme();const update=(e:Event)=>untrack(()=>{theme=(e as CustomEvent<Theme>).detail;rebuild();});
  const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>{reduced=media.matches;refresh();},visibility=()=>sleeping=document.hidden;
  const observer=new ResizeObserver(([entry])=>{width=entry.contentRect.width;height=entry.contentRect.height;});observer.observe(root);
  window.addEventListener('phosphora-theme-change',update);media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);motion();visibility();rebuild();
  return()=>{offFrames?.();generation++;observer.disconnect();window.removeEventListener('phosphora-theme-change',update);media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);renderer?.destroy();renderer=undefined;};
 });
</script>
<div class="theme-backdrop" class:sleeping={sleeping||paused} class:glimmer={!reduced&&mode!=='static'&&theme.effects.pattern!=='none'} bind:this={root} aria-hidden="true" data-pattern={theme.effects.pattern} data-mode={mode} style:opacity={theme.effects.strength}></div>
<style>
 .theme-backdrop{overflow:hidden;contain:strict}.theme-backdrop :global(canvas){position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.glimmer :global(canvas){animation:field-glimmer 9s ease-in-out infinite alternate}.sleeping :global(canvas){animation-play-state:paused}
 @keyframes field-glimmer{from{opacity:.78}to{opacity:1}}
 @media(prefers-reduced-motion:reduce){.glimmer :global(canvas){animation:none}}
</style>
