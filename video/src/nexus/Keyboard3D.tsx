/**
 * Le clavier 3D de Nexus, rendu par three.js dans Remotion : la même disposition et la même matière que le clavier de
 * l'application (cabochons bleu nuit, légendes ivoire en Instrument Serif, liseré d'or), mais entièrement piloté par
 * l'image courante — chaque plan décrit la pose de chaque touche (enfoncement, lueur, élévation, déplacement).
 *
 * La lueur imite le « bloom » de l'application sans post-traitement : émission du cabochon + halo additif.
 */
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { continueRender, delayRender } from "remotion";
import { BOARD_D, BOARD_W, GAP, KEY_H, KEYS, KeyInfo, U } from "./layout";

export type V3 = [number, number, number];
export type KeyPose = {
  press?: number;    // 0 → 1 : enfoncement
  glow?: number;     // 0 → ~1.6 : lueur
  offset?: V3;       // déplacement depuis la position de repos (unités du clavier)
  rot?: V3;          // rotation de la touche
  scale?: number;
  height?: number;   // hauteur du cabochon (1 = normale) : les touches deviennent des tours
  legend?: number;   // opacité de la légende (1 = normale)
  opacity?: number;  // 0 → 1
};
export type Cam = { pos: V3; target: V3; fov: number; roll?: number };

// ------------------------------------------------------------------ textures (créées une fois, polices chargées)
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Inter Tight", system-ui, sans-serif';

function legendCanvas(label: string, sub: string | undefined, w: number): HTMLCanvasElement {
  const px = 256;
  const c = document.createElement("canvas");
  c.width = Math.round(px * w);
  c.height = px;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3ead7";
  g.textBaseline = "middle";
  const long = label.length > 2;
  g.font = long ? `500 ${px * 0.22}px ${SANS}` : `400 ${px * 0.5}px ${SERIF}`;
  if (sub) {
    g.textAlign = "left";
    g.fillText(label, px * 0.2, px * 0.34);
    g.globalAlpha = 0.6;
    g.font = `400 ${px * 0.3}px ${SERIF}`;
    g.fillText(sub, px * 0.22, px * 0.72);
  } else {
    g.textAlign = long || w > 1.3 ? "left" : "center";
    g.fillText(label, long || w > 1.3 ? px * 0.2 : c.width / 2, px * (long ? 0.7 : 0.52));
  }
  return c;
}

export function labelCanvas(label: string, w: number): HTMLCanvasElement {
  const px = 256;
  const c = document.createElement("canvas");
  c.width = Math.round(px * w);
  c.height = px;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3ead7";
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.font = `400 ${px * 0.42}px ${SERIF}`;
  g.fillText(label, c.width / 2, px * 0.54);
  return c;
}

function haloCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

const tex = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

type Assets = { legends: Map<string, THREE.Texture>; halo: THREE.Texture; geo: Map<number, THREE.BufferGeometry> };
let ASSETS: Assets | null = null;

/** Attend les polices, puis construit textures et géométries (une seule fois par onglet de rendu). */
export function useKeyboardAssets(): Assets | null {
  const [a, setA] = useState<Assets | null>(ASSETS);
  useEffect(() => {
    if (ASSETS) return;
    const h = delayRender("clavier 3D : polices et textures");
    Promise.all([document.fonts.load(`400 64px ${SERIF}`), document.fonts.load(`500 64px ${SANS}`)]).then(() => {
      const legends = new Map<string, THREE.Texture>();
      KEYS.forEach((k) => k.label && legends.set(k.code, tex(legendCanvas(k.label, k.sub, k.width))));
      const geo = new Map<number, THREE.BufferGeometry>();
      KEYS.forEach((k) => !geo.has(k.width) && geo.set(k.width, new RoundedBoxGeometry(k.width * U - GAP, KEY_H, U - GAP, 3, 0.2)));
      ASSETS = { legends, halo: tex(haloCanvas()), geo };
      setA(ASSETS);
      continueRender(h);
    });
  }, []);
  return a;
}

// ------------------------------------------------------------------ caméra
export const CameraRig: React.FC<{ cam: Cam }> = ({ cam }) => {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.position.set(...cam.pos);
    c.fov = cam.fov;
    c.near = 0.1;
    c.far = 600;
    c.up.set(Math.sin(cam.roll ?? 0), Math.cos(cam.roll ?? 0), 0);
    c.lookAt(...cam.target);
    c.updateProjectionMatrix();
  }, [camera, cam.pos[0], cam.pos[1], cam.pos[2], cam.target[0], cam.target[1], cam.target[2], cam.fov, cam.roll]);
  return null;
};

// ------------------------------------------------------------------ une touche
const BASE = new THREE.Color("#1b2536");

const Key: React.FC<{ k: KeyInfo; p: KeyPose; assets: Assets; accent: THREE.Color }> = ({ k, p, assets, accent }) => {
  const glow = p.glow ?? 0;
  const h = p.height ?? 1;
  const press = p.press ?? 0;
  const op = p.opacity ?? 1;
  // nouvelles couleurs à chaque image : three.js ne voit pas une couleur modifiée sur place
  const color = new THREE.Color();
  const emissive = new THREE.Color();
  color.copy(BASE).lerp(accent, Math.min(0.32, glow * 0.22));
  emissive.copy(accent).multiplyScalar(Math.min(1.6, glow) * 0.3);
  const kw = k.width * U - GAP;
  const top = KEY_H * h - press * 0.34;
  if (op <= 0.001) return null;
  return (
    <group position={[k.x + (p.offset?.[0] ?? 0), p.offset?.[1] ?? 0, k.z + (p.offset?.[2] ?? 0)]} rotation={p.rot ?? [0, 0, 0]} scale={p.scale ?? 1}>
      <mesh geometry={assets.geo.get(k.width)} position={[0, top - (KEY_H * h) / 2, 0]} scale={[1, h, 1]}>
        <meshStandardMaterial color={color} emissive={emissive} roughness={0.42} metalness={0.35} transparent={op < 1} opacity={op} />
      </mesh>
      {k.label ? (
        <mesh position={[0, top + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[kw * 0.92, (U - GAP) * 0.92]} />
          <meshBasicMaterial map={assets.legends.get(k.code)} transparent depthWrite={false} toneMapped={false}
            opacity={op * (p.legend ?? 1) * (0.8 + Math.min(0.2, glow * 0.3))} />
        </mesh>
      ) : null}
      {glow > 0.02 ? (
        <mesh position={[0, top + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[kw * 2.1, (U - GAP) * 2.1]} />
          <meshBasicMaterial map={assets.halo} color={accent} transparent opacity={op * Math.min(0.7, glow * 0.36)} depthWrite={false}
            blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
};

// ------------------------------------------------------------------ le clavier
export const Keyboard3D: React.FC<{
  pose: (k: KeyInfo) => KeyPose;
  accent?: string;
  chassis?: number;            // opacité du châssis
  board?: { pos?: V3; rot?: V3; scale?: number };
  sweep?: { x: number; z: number; y?: number; intensity: number };   // lumière rasante qui balaie le clavier
  ambient?: number;
}> = ({ pose, accent = "#c29343", chassis = 1, board, sweep, ambient = 1 }) => {
  const assets = useKeyboardAssets();
  const acc = useMemo(() => new THREE.Color(accent), [accent]);
  const chassisGeo = useMemo(() => new RoundedBoxGeometry(BOARD_W + 1.6, 0.9, BOARD_D + 1.6, 4, 0.55), []);
  if (!assets) return null;
  return (
    <>
      <hemisphereLight args={["#8fa2c8", "#05070c", 0.9 * ambient]} />
      <directionalLight position={[-12, 30, 18]} intensity={1.6 * ambient} color="#fff3dd" />
      <directionalLight position={[20, 10, -24]} intensity={0.9 * ambient} color="#6f8fd6" />
      {sweep ? <pointLight position={[sweep.x, sweep.y ?? 2.2, sweep.z]} intensity={sweep.intensity} distance={14} decay={1.6} color="#ffe2b0" /> : null}
      <group position={board?.pos ?? [0, 0, 0]} rotation={board?.rot ?? [0, 0, 0]} scale={board?.scale ?? 1}>
        {chassis > 0.001 ? (
          <>
            <mesh geometry={chassisGeo} position={[0, -0.45, 0]}>
              <meshStandardMaterial color="#0c1321" roughness={0.35} metalness={0.7} transparent={chassis < 1} opacity={chassis} />
            </mesh>
            <lineSegments position={[0, 0.01, 0]}>
              <edgesGeometry args={[new THREE.BoxGeometry(BOARD_W + 1.62, 0.02, BOARD_D + 1.62)]} />
              <lineBasicMaterial color="#b8955a" transparent opacity={0.55 * chassis} />
            </lineSegments>
          </>
        ) : null}
        {KEYS.map((k) => <Key key={k.code} k={k} p={pose(k)} assets={assets} accent={acc} />)}
      </group>
    </>
  );
};

// ------------------------------------------------------------------ objets libres : touche flottante, lueurs, fils
const LABELS = new Map<string, THREE.Texture>();
export const labelTexture = (label: string, w: number) => {
  const key = `${label}|${w}`;
  if (!LABELS.has(key)) LABELS.set(key, tex(labelCanvas(label, w)));
  return LABELS.get(key)!;
};
const FLOAT_GEO = new Map<number, THREE.BufferGeometry>();
const floatGeo = (w: number) => {
  if (!FLOAT_GEO.has(w)) FLOAT_GEO.set(w, new RoundedBoxGeometry(w * U - GAP, KEY_H, U - GAP, 3, 0.2));
  return FLOAT_GEO.get(w)!;
};

/**
 * Une touche détachée du clavier : elle part d'une touche (largeur 1, sa lettre) et s'élargit en portant un nom.
 * `morph` 0 → 1 : de la lettre au nom.
 */
export const FloatKey: React.FC<{ pos: V3; rot?: V3; width: number; morph: number; letter: string; label: string; glow: number; accent?: string; scale?: number; opacity?: number }> =
  ({ pos, rot, width, morph, letter, label, glow, accent = "#c29343", scale = 1, opacity = 1 }) => {
  const assets = useKeyboardAssets();
  const acc = useMemo(() => new THREE.Color(accent), [accent]);
  if (!assets || opacity <= 0.001) return null;
  const color = new THREE.Color();
  const emissive = new THREE.Color();
  color.copy(BASE).lerp(acc, Math.min(0.4, glow * 0.28));
  emissive.copy(acc).multiplyScalar(Math.min(1.6, glow) * 0.3);
  const sx = (1 + (width - 1) * morph) / width;   // géométrie à la largeur finale, comprimée au départ
  const kw = width * U - GAP;
  return (
    <group position={pos} rotation={rot ?? [0, 0, 0]} scale={scale}>
      <mesh geometry={floatGeo(width)} position={[0, KEY_H / 2, 0]} scale={[sx, 1, 1]}>
        <meshStandardMaterial color={color} emissive={emissive} roughness={0.42} metalness={0.35} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh position={[0, KEY_H + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[sx, 1, 1]}>
        <planeGeometry args={[kw * 0.92, (U - GAP) * 0.92]} />
        <meshBasicMaterial map={labelTexture(label, width)} transparent depthWrite={false} toneMapped={false} opacity={opacity * morph} />
      </mesh>
      <mesh position={[0, KEY_H + 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[(U - GAP) * 0.92, (U - GAP) * 0.92]} />
        <meshBasicMaterial map={labelTexture(letter, 1)} transparent depthWrite={false} toneMapped={false} opacity={opacity * (1 - Math.min(1, morph * 2))} />
      </mesh>
      {glow > 0.02 ? (
        <mesh position={[0, KEY_H + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[sx, 1, 1]}>
          <planeGeometry args={[kw * 1.6, (U - GAP) * 2.4]} />
          <meshBasicMaterial map={assets.halo} color={acc} transparent opacity={opacity * Math.min(0.7, glow * 0.36)} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
};

/** Lueur ponctuelle toujours face caméra (point d'or, nœud Fabric). */
export const GlowSprite: React.FC<{ pos: V3; size: number; opacity: number; color?: string }> = ({ pos, size, opacity, color = "#f3dcaa" }) => {
  const assets = useKeyboardAssets();
  if (!assets || opacity <= 0.001) return null;
  return (
    <sprite position={pos} scale={[size, size, 1]}>
      <spriteMaterial map={assets.halo} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>
  );
};

/** Libellé toujours face caméra. */
export const LabelSprite: React.FC<{ pos: V3; text: string; height: number; opacity: number; w?: number }> = ({ pos, text, height, opacity, w = 3 }) => {
  const assets = useKeyboardAssets();
  if (!assets || opacity <= 0.001) return null;
  return (
    <sprite position={pos} scale={[height * w, height, 1]}>
      <spriteMaterial map={labelTexture(text, w)} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </sprite>
  );
};

/** Un fil d'or entre deux points, tracé progressivement (`p` 0 → 1). */
export const Thread: React.FC<{ a: V3; b: V3; lift?: number; p: number; opacity?: number; radius?: number }> = ({ a, b, lift = 2, p, opacity = 1, radius = 0.05 }) => {
  const geo = useMemo(() => {
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), mid, new THREE.Vector3(...b));
    return new THREE.TubeGeometry(curve, 48, radius, 6, false);
  }, [a[0], a[1], a[2], b[0], b[1], b[2], lift, radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  const count = geo.index ? geo.index.count : 0;
  geo.setDrawRange(0, Math.floor((count / 6) * Math.max(0, Math.min(1, p))) * 6);
  if (p <= 0.001 || opacity <= 0.001) return null;
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color="#f0cf8a" transparent opacity={opacity} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
};
