import { exportToCanvas, restoreElements } from "@excalidraw/excalidraw";
import { assertSceneMechanics } from "./scene-mechanics.js";

type PersistedScene = { elements: readonly Record<string, unknown>[]; appState: Record<string, unknown>; files: Record<string, unknown> };

declare global { interface Window {
  renderPersistedExcalidrawScene: (scene: PersistedScene, tokens: Record<string, unknown>, scale?: number) => Promise<string>;
  deriveRenderedPng: (dataUrl: string, width: number, grayscale: boolean) => Promise<string>;
  composeBrandAsset: (baseDataUrl: string, assetDataUrl: string, box: { x: number; y: number; width: number; height: number }) => Promise<string>;
} }

window.renderPersistedExcalidrawScene = async (scene, tokens, scale = 1) => {
  assertSceneMechanics(scene, tokens);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("导出比例必须为正数。");
  const elements = restoreElements(scene.elements, null);
  const canvas = await exportToCanvas({ elements, appState: scene.appState, files: scene.files, exportPadding: 0,
    getDimensions: (width: number, height: number) => ({ width: Math.round(width * scale), height: Math.round(height * scale), scale }) });
  return canvas.toDataURL("image/png");
};

window.deriveRenderedPng = async (dataUrl, width, grayscale) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const height = Math.round(image.height * width / image.width);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");
  if (grayscale) context.filter = "grayscale(1)";
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
};

window.composeBrandAsset = async (baseDataUrl, assetDataUrl, box) => {
  const base = new Image(), asset = new Image();
  base.src = baseDataUrl; asset.src = assetDataUrl;
  await Promise.all([base.decode(), asset.decode()]);
  const canvas = document.createElement("canvas"); canvas.width = base.width; canvas.height = base.height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("2D canvas unavailable");
  context.drawImage(base, 0, 0);
  const scale = Math.min(box.width / asset.naturalWidth, box.height / asset.naturalHeight);
  const width = asset.naturalWidth * scale, height = asset.naturalHeight * scale;
  context.drawImage(asset, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
  return canvas.toDataURL("image/png");
};
