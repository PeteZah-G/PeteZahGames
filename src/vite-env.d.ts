/// <reference types="vite/client" />

declare module "vanta/dist/vanta.net.min" {
  const NET: (opts: Record<string, unknown>) => { destroy: () => void; resize: () => void; setOptions: (o: Record<string, unknown>) => void };
  export default NET;
}

declare module "vanta/dist/vanta.fog.min" {
  const FOG: (opts: Record<string, unknown>) => { destroy: () => void; resize: () => void; setOptions: (o: Record<string, unknown>) => void };
  export default FOG;
}

declare module "three";
