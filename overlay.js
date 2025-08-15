// ==UserScript==
// @name         Wplace Overlay Pro
// @namespace    http://tampermonkey.net/
// @version      2.8.0
// @description  Overlays tiles on wplace.live. Can also resize, and color-match your overlay to wplace's palette. Make sure to comply with the site's Terms of Service, and rules! This script is not affiliated with Wplace.live in any way, use at your own risk. This script is not affiliated with TamperMonkey. The author of this userscript is not responsible for any damages, issues, loss of data, or punishment that may occur as a result of using this script. This script is provided "as is" under GPLv3.
// @author       shinkonet
// @match        https://wplace.live/*
// @license      GPLv3
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/545041/Wplace%20Overlay%20Pro.user.js
// @updateURL https://update.greasyfork.org/scripts/545041/Wplace%20Overlay%20Pro.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const TILE_SIZE = 1000;
  const MAX_OVERLAY_DIM = 1000;
  const MINIFY_SCALE = 3;

  const NATIVE_FETCH = window.fetch;

  const gmGet = (key, def) => {
    try {
      if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') return GM.getValue(key, def);
      if (typeof GM_getValue === 'function') return Promise.resolve(GM_getValue(key, def));
    } catch {}
    return Promise.resolve(def);
  };
  const gmSet = (key, value) => {
    try {
      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') return GM.setValue(key, value);
      if (typeof GM_setValue === 'function') return Promise.resolve(GM_setValue(key, value));
    } catch {}
    return Promise.resolve();
  };

  function gmFetchBlob(url) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          onload: (res) => {
            if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
            else reject(new Error(`GM_xhr failed: ${res.status} ${res.statusText}`));
          },
          onerror: () => reject(new Error('GM_xhr network error')),
          ontimeout: () => reject(new Error('GM_xhr timeout')),
        });
      } catch (e) { reject(e); }
    });
  }
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  async function urlToDataURL(url) {
    const blob = await gmFetchBlob(url);
    if (!blob || !String(blob.type).startsWith('image/')) throw new Error('URL did not return an image blob');
    return await blobToDataURL(blob);
  }
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  const WPLACE_FREE = [
    [0,0,0], [60,60,60], [120,120,120], [210,210,210], [255,255,255],
    [96,0,24], [237,28,36], [255,127,39], [246,170,9], [249,221,59], [255,250,188],
    [14,185,104], [19,230,123], [135,255,94],
    [12,129,110], [16,174,166], [19,225,190], [96,247,242],
    [40,80,158], [64,147,228],
    [107,80,246], [153,177,251],
    [120,12,153], [170,56,185], [224,159,249],
    [203,0,122], [236,31,128], [243,141,169],
    [104,70,52], [149,104,42], [248,178,119]
  ];
  const WPLACE_PAID = [
    [170,170,170],
    [165,14,30], [250,128,114],
    [228,92,26], [156,132,49], [197,173,49], [232,212,95],
    [74,107,58], [90,148,74], [132,197,115],
    [15,121,159], [187,250,242], [125,199,255],
    [77,49,184], [74,66,132], [122,113,196], [181,174,241],
    [155,82,73], [209,128,120], [250,182,164],
    [219,164,99], [123,99,82], [156,132,107], [214,181,148],
    [209,128,81], [255,197,165],
    [109,100,63], [148,140,107], [205,197,158],
    [51,57,65], [109,117,141], [179,185,209]
  ];
  const WPLACE_NAMES = {
    "0,0,0":"Black","60,60,60":"Dark Gray","120,120,120":"Gray","210,210,210":"Light Gray","255,255,255":"White",
    "96,0,24":"Deep Red","237,28,36":"Red","255,127,39":"Orange","246,170,9":"Gold","249,221,59":"Yellow","255,250,188":"Light Yellow",
    "14,185,104":"Dark Green","19,230,123":"Green","135,255,94":"Light Green",
    "12,129,110":"Dark Teal","16,174,166":"Teal","19,225,190":"Light Teal","96,247,242":"Cyan",
    "40,80,158":"Dark Blue","64,147,228":"Blue",
    "107,80,246":"Indigo","153,177,251":"Light Indigo",
    "120,12,153":"Dark Purple","170,56,185":"Purple","224,159,249":"Light Purple",
    "203,0,122":"Dark Pink","236,31,128":"Pink","243,141,169":"Light Pink",
    "104,70,52":"Dark Brown","149,104,42":"Brown","248,178,119":"Beige",
    "170,170,170":"Medium Gray","165,14,30":"Dark Red","250,128,114":"Light Red",
    "228,92,26":"Dark Orange","156,132,49":"Dark Goldenrod","197,173,49":"Goldenrod","232,212,95":"Light Goldenrod",
    "74,107,58":"Dark Olive","90,148,74":"Olive","132,197,115":"Light Olive",
    "15,121,159":"Dark Cyan","187,250,242":"Light Cyan","125,199,255":"Light Blue",
    "77,49,184":"Dark Indigo","74,66,132":"Dark Slate Blue","122,113,196":"Slate Blue","181,174,241":"Light Slate Blue",
    "155,82,73":"Dark Peach","209,128,120":"Peach","250,182,164":"Light Peach",
    "219,164,99":"Light Brown","123,99,82":"Dark Tan","156,132,107":"Tan","214,181,148":"Light Tan",
    "209,128,81":"Dark Beige","255,197,165":"Light Beige",
    "109,100,63":"Dark Stone","148,140,107":"Stone","205,197,158":"Light Stone",
    "51,57,65":"Dark Slate","109,117,141":"Slate","179,185,209":"Light Slate"
  };
  const DEFAULT_FREE_KEYS = WPLACE_FREE.map(([r,g,b]) => `${r},${g},${b}`);
  const DEFAULT_PAID_KEYS = [];

  const page = unsafeWindow;

  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
  function uniqueName(base) {
    const names = new Set(config.overlays.map(o => (o.name || '').toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let i = 1; while (names.has(`${base} (${i})`.toLowerCase())) i++; return `${base} (${i})`;
  }

  function createCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function createHTMLCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function canvasToBlob(canvas) { if (canvas.convertToBlob) return canvas.convertToBlob(); return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png")); }
  async function canvasToDataURLSafe(canvas) {
    if (canvas && typeof canvas.toDataURL === 'function') return canvas.toDataURL('image/png');
    if (canvas && typeof canvas.convertToBlob === 'function') { const blob = await canvas.convertToBlob(); return await blobToDataURL(blob); }
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      const bmp = canvas.transferToImageBitmap?.();
      if (bmp) { const html = createHTMLCanvas(canvas.width, canvas.height); const ctx = html.getContext('2d'); ctx.drawImage(bmp, 0, 0); return html.toDataURL('image/png'); }
    }
    throw new Error('Cannot export canvas to data URL');
  }
  async function blobToImage(blob) {
    if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(blob); } catch {} }
    return new Promise((resolve, reject) => { const url = URL.createObjectURL(blob); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); }; img.src = url; });
  }
  function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }
  function extractPixelCoords(pixelUrl) {
    try { const u = new URL(pixelUrl); const parts = u.pathname.split('/'); const sp = new URLSearchParams(u.search);
      return { chunk1: parseInt(parts[3], 10), chunk2: parseInt(parts[4], 10), posX: parseInt(sp.get('x') || '0', 10), posY: parseInt(sp.get('y') || '0', 10) };
    } catch { return { chunk1: 0, chunk2: 0, posX: 0, posY: 0 }; }
  }
  function matchTileUrl(urlStr) {
    try { const u = new URL(urlStr, location.href);
      if (u.hostname !== 'backend.wplace.live' || !u.pathname.startsWith('/files/')) return null;
      const m = u.pathname.match(/\/(\d+)\/(\d+)\.png$/i);
      if (!m) return null;
      return { chunk1: parseInt(m[1], 10), chunk2: parseInt(m[2], 10) };
    } catch { return null; }
  }
  function matchPixelUrl(urlStr) {
    try { const u = new URL(urlStr, location.href);
      if (u.hostname !== 'backend.wplace.live') return null;
      const m = u.pathname.match(/\/s0\/pixel\/(\d+)\/(\d+)$/); if (!m) return null;
      const sp = u.searchParams;
      return { normalized: `https://backend.wplace.live/s0/pixel/${m[1]}/${m[2]}?x=${sp.get('x')||0}&y=${sp.get('y')||0}` };
    } catch { return null; }
  }
  function rectIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    const x = Math.max(ax, bx), y = Math.max(ay, by);
    const r = Math.min(ax + aw, bx + bw), b = Math.min(ay + ah, by + bh);
    const w = Math.max(0, r - x), h = Math.max(0, b - y);
    return { x, y, w, h };
  }

  const overlayCache = new Map();
  const tooLargeOverlays = new Set();

  function overlaySignature(ov) {
    const imgKey = ov.imageBase64 ? ov.imageBase64.slice(0, 64) + ':' + ov.imageBase64.length : 'none';
    return [imgKey, ov.pixelUrl || 'null', ov.offsetX, ov.offsetY, ov.opacity].join('|');
  }
  function clearOverlayCache() { overlayCache.clear(); }

  async function buildOverlayDataForChunk(ov, targetChunk1, targetChunk2) {
    if (!ov.enabled || !ov.imageBase64 || !ov.pixelUrl) return null;
    if (tooLargeOverlays.has(ov.id)) return null;

    const sig = overlaySignature(ov);
    const cacheKey = `${ov.id}|${sig}|${targetChunk1}|${targetChunk2}`;
    if (overlayCache.has(cacheKey)) return overlayCache.get(cacheKey);

    const img = await loadImage(ov.imageBase64);
    if (!img) return null;

    const wImg = img.width, hImg = img.height;
    if (wImg >= MAX_OVERLAY_DIM || hImg >= MAX_OVERLAY_DIM) {
      tooLargeOverlays.add(ov.id);
      showToast(`Overlay "${ov.name}" skipped: image too large (must be smaller than ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM}; got ${wImg}×${hImg}).`);
      return null;
    }

    const base = extractPixelCoords(ov.pixelUrl);
    if (!Number.isFinite(base.chunk1) || !Number.isFinite(base.chunk2)) return null;

    const drawX = (base.chunk1 * TILE_SIZE + base.posX + ov.offsetX) - (targetChunk1 * TILE_SIZE);
    const drawY = (base.chunk2 * TILE_SIZE + base.posY + ov.offsetY) - (targetChunk2 * TILE_SIZE);

    const isect = rectIntersect(0, 0, TILE_SIZE, TILE_SIZE, drawX, drawY, wImg, hImg);
    if (isect.w === 0 || isect.h === 0) { overlayCache.set(cacheKey, null); return null; }

    const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, drawX, drawY);

    const imageData = ctx.getImageData(isect.x, isect.y, isect.w, isect.h);
    const data = imageData.data;
    const colorStrength = ov.opacity;
    const whiteStrength = 1 - colorStrength;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        data[i]     = Math.round(data[i]     * colorStrength + 255 * whiteStrength);
        data[i + 1] = Math.round(data[i + 1] * colorStrength + 255 * whiteStrength);
        data[i + 2] = Math.round(data[i + 2] * colorStrength + 255 * whiteStrength);
        data[i + 3] = 255;
      }
    }

    const result = { imageData, dx: isect.x, dy: isect.y };
    overlayCache.set(cacheKey, result);
    return result;
  }

  async function buildOverlayDataForChunkMinify(ov, targetChunk1, targetChunk2) {
    if (!ov.enabled || !ov.imageBase64 || !ov.pixelUrl) return null;
    if (tooLargeOverlays.has(ov.id)) return null;

    const scale = MINIFY_SCALE;
    const sig = overlaySignature(ov);
    const cacheKey = `${ov.id}|${sig}|minify|s${scale}|${targetChunk1}|${targetChunk2}`;
    if (overlayCache.has(cacheKey)) return overlayCache.get(cacheKey);

    const img = await loadImage(ov.imageBase64);
    if (!img) return null;

    const wImg = img.width, hImg = img.height;
    if (wImg >= MAX_OVERLAY_DIM || hImg >= MAX_OVERLAY_DIM) {
      tooLargeOverlays.add(ov.id);
      showToast(`Overlay "${ov.name}" skipped: image too large (must be smaller than ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM}; got ${wImg}×${hImg}).`);
      return null;
    }

    const base = extractPixelCoords(ov.pixelUrl);
    if (!Number.isFinite(base.chunk1) || !Number.isFinite(base.chunk2)) return null;

    const drawX = (base.chunk1 * TILE_SIZE + base.posX + ov.offsetX) - (targetChunk1 * TILE_SIZE);
    const drawY = (base.chunk2 * TILE_SIZE + base.posY + ov.offsetY) - (targetChunk2 * TILE_SIZE);

    const tileW = TILE_SIZE * scale;
    const tileH = TILE_SIZE * scale;
    const drawXScaled = Math.round(drawX * scale);
    const drawYScaled = Math.round(drawY * scale);
    const wScaled = wImg * scale;
    const hScaled = hImg * scale;

    const isect = rectIntersect(0, 0, tileW, tileH, drawXScaled, drawYScaled, wScaled, hScaled);
    if (isect.w === 0 || isect.h === 0) { overlayCache.set(cacheKey, null); return null; }

    const canvas = createCanvas(tileW, tileH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, tileW, tileH);

    ctx.drawImage(img, 0, 0, wImg, hImg, drawXScaled, drawYScaled, wScaled, hScaled);

    const imageData = ctx.getImageData(isect.x, isect.y, isect.w, isect.h);
    const data = imageData.data;
    const colorStrength = ov.opacity;
    const whiteStrength = 1 - colorStrength;
    const center = Math.floor(scale / 2);
    const width = isect.w;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;

      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);
      const absX = isect.x + px;
      const absY = isect.y + py;

      if ((absX % scale) === center && (absY % scale) === center) {
        data[i]     = Math.round(data[i]     * colorStrength + 255 * whiteStrength);
        data[i + 1] = Math.round(data[i + 1] * colorStrength + 255 * whiteStrength);
        data[i + 2] = Math.round(data[i + 2] * colorStrength + 255 * whiteStrength);
        data[i + 3] = 255;
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
      }
    }

    const result = { imageData, dx: isect.x, dy: isect.y, scaled: true, scale };
    overlayCache.set(cacheKey, result);
    return result;
  }

  async function mergeOverlaysBehind(originalBlob, overlayDatas) {
    if (!overlayDatas || overlayDatas.length === 0) return originalBlob;

    const originalImage = await blobToImage(originalBlob);
    const w = originalImage.width, h = originalImage.height;

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    for (const ovd of overlayDatas) { if (!ovd) continue; ctx.putImageData(ovd.imageData, ovd.dx, ovd.dy); }
    ctx.drawImage(originalImage, 0, 0);

    return await canvasToBlob(canvas);
  }
  async function mergeOverlaysAbove(originalBlob, overlayDatas) {
    if (!overlayDatas || overlayDatas.length === 0) return originalBlob;

    const originalImage = await blobToImage(originalBlob);
    const w = originalImage.width, h = originalImage.height;

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(originalImage, 0, 0);

    for (const ovd of overlayDatas) {
      if (!ovd) continue;

      const data = ovd.imageData.data;
      const ovw = ovd.imageData.width;

      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha > 0) {
          const x = ovd.dx + (i / 4) % ovw;
          const y = ovd.dy + Math.floor((i / 4) / ovw);
          ctx.fillStyle = `rgba(${data[i]}, ${data[i+1]}, ${data[i+2]}, ${alpha/255})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    return await canvasToBlob(canvas);
  }

  async function composeMinifiedTile(originalBlob, overlayDatas) {
    if (!overlayDatas || overlayDatas.length === 0) return originalBlob;

    const scale = MINIFY_SCALE;
    const originalImage = await blobToImage(originalBlob);
    const w = originalImage.width, h = originalImage.height;

    const canvas = createCanvas(w * scale, h * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(originalImage, 0, 0, w * scale, h * scale);

    for (const ovd of overlayDatas) {
      if (!ovd) continue;
      const tw = ovd.imageData.width;
      const th = ovd.imageData.height;
      if (tw === 0 || th === 0) continue;

      const temp = createCanvas(tw, th);
      const tctx = temp.getContext('2d', { willReadFrequently: true });
      tctx.putImageData(ovd.imageData, 0, 0);
      ctx.drawImage(temp, ovd.dx, ovd.dy);
    }

    return await canvasToBlob(canvas);
  }

  function showToast(message, duration = 3000) {
    let stack = document.getElementById('op-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'op-toast-stack';
      stack.id = 'op-toast-stack';
      document.body.appendChild(stack);
    }
    stack.classList.toggle('op-dark', config.theme === 'dark');

    const t = document.createElement('div');
    t.className = 'op-toast';
    t.textContent = message;
    stack.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 200);
    }, duration);
  }

  let hookInstalled = false;
  function overlaysNeedingHook() {
    const hasImage = config.overlays.some(o => o.enabled && o.imageBase64);
    const placing  = !!config.autoCapturePixelUrl && !!config.activeOverlayId;
    const needsHookMode = (config.overlayMode === 'behind' || config.overlayMode === 'above' || config.overlayMode === 'minify');
    return needsHookMode && (hasImage || placing) && config.overlays.length > 0;
  }
  function ensureHook() { if (overlaysNeedingHook()) attachHook(); else detachHook(); }

  function attachHook() {
    if (hookInstalled) return;
    const originalFetch = NATIVE_FETCH;
    const hookedFetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input && input.url) || '';

      if (config.autoCapturePixelUrl && config.activeOverlayId) {
        const pixelMatch = matchPixelUrl(urlStr);
        if (pixelMatch) {
          const ov = config.overlays.find(o => o.id === config.activeOverlayId);
          if (ov) {
            const changed = (ov.pixelUrl !== pixelMatch.normalized);
            if (changed) {
              ov.pixelUrl = pixelMatch.normalized;
              ov.offsetX = 0; ov.offsetY = 0;
              await saveConfig(['overlays']); clearOverlayCache();

              config.autoCapturePixelUrl = false; await saveConfig(['autoCapturePixelUrl']); updateUI();

              const c = extractPixelCoords(ov.pixelUrl);
              showToast(`Anchor set for "${ov.name}": chunk ${c.chunk1}/${c.chunk2} at (${c.posX}, ${c.posY}). Offset reset to (0,0).`);
              ensureHook();
            }
          }
        }
      }

      const tileMatch = matchTileUrl(urlStr);
      const validModes = ['behind', 'above', 'minify'];
      if (!tileMatch || !validModes.includes(config.overlayMode)) return originalFetch(input, init);

      try {
        const response = await originalFetch(input, init);
        if (!response.ok) return response;

        const ct = (response.headers.get('Content-Type') || '').toLowerCase();
        if (!ct.includes('image')) return response;

        const enabledOverlays = config.overlays.filter(o => o.enabled && o.imageBase64 && o.pixelUrl);
        if (enabledOverlays.length === 0) return response;

        const originalBlob = await response.blob();
        if (originalBlob.size > 15 * 1024 * 1024) return response;

        let finalBlob;

        if (config.overlayMode === 'minify') {
          const overlayDatas = [];
          for (const ov of enabledOverlays) {
            overlayDatas.push(await buildOverlayDataForChunkMinify(ov, tileMatch.chunk1, tileMatch.chunk2));
          }
          finalBlob = await composeMinifiedTile(originalBlob, overlayDatas.filter(Boolean));
        } else {
          const overlayDatas = [];
          for (const ov of enabledOverlays) {
            overlayDatas.push(await buildOverlayDataForChunk(ov, tileMatch.chunk1, tileMatch.chunk2));
          }
          finalBlob = await (config.overlayMode === 'behind'
            ? mergeOverlaysBehind(originalBlob, overlayDatas.filter(Boolean))
            : mergeOverlaysAbove(originalBlob, overlayDatas.filter(Boolean)));
        }

        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'image/png');
        headers.delete('Content-Length');

        return new Response(finalBlob, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } catch (e) {
        console.error("Overlay Pro: Error processing tile", e);
        return originalFetch(input, init);
      }
    };
    page.fetch = hookedFetch;
    window.fetch = hookedFetch;
    hookInstalled = true;
  }
  function detachHook() { if (!hookInstalled) return; page.fetch = NATIVE_FETCH; window.fetch = NATIVE_FETCH; hookInstalled = false; }

  const config = {
    overlays: [],
    activeOverlayId: null,
    overlayMode: 'behind',
    isPanelCollapsed: false,
    autoCapturePixelUrl: false,
    panelX: null,
    panelY: null,
    theme: 'light',
    collapseList: false,
    collapseEditor: false,
    collapseNudge: false,

    ccFreeKeys: DEFAULT_FREE_KEYS.slice(),
    ccPaidKeys: DEFAULT_PAID_KEYS.slice(),
    ccZoom: 1.0,
    ccRealtime: false
  };
  const CONFIG_KEYS = Object.keys(config);

  async function loadConfig() {
    try {
      await Promise.all(CONFIG_KEYS.map(async k => { config[k] = await gmGet(k, config[k]); }));
      if (!Array.isArray(config.ccFreeKeys) || config.ccFreeKeys.length === 0) config.ccFreeKeys = DEFAULT_FREE_KEYS.slice();
      if (!Array.isArray(config.ccPaidKeys)) config.ccPaidKeys = DEFAULT_PAID_KEYS.slice();
      if (!Number.isFinite(config.ccZoom) || config.ccZoom <= 0) config.ccZoom = 1.0;
      if (typeof config.ccRealtime !== 'boolean') config.ccRealtime = false;
    } catch (e) { console.error("Overlay Pro: Failed to load config", e); }
  }
  async function saveConfig(keys = CONFIG_KEYS) {
    try { await Promise.all(keys.map(k => gmSet(k, config[k]))); }
    catch (e) { console.error("Overlay Pro: Failed to save config", e); }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      body.op-theme-light {
        --op-bg: #ffffff;
        --op-border: #e6ebf2;
        --op-muted: #6b7280;
        --op-text: #111827;
        --op-subtle: #f4f6fb;
        --op-btn: #eef2f7;
        --op-btn-border: #d8dee8;
        --op-btn-hover: #e7ecf5;
        --op-accent: #1e88e5;
      }
      body.op-theme-dark {
        --op-bg: #1b1e24;
        --op-border: #2a2f3a;
        --op-muted: #a0a7b4;
        --op-text: #f5f6f9;
        --op-subtle: #151922;
        --op-btn: #262b36;
        --op-btn-border: #384050;
        --op-btn-hover: #2f3542;
        --op-accent: #64b5f6;
      }
      .op-scroll-lock { overflow: hidden !important; }

      #overlay-pro-panel {
        position: fixed; z-index: 9999; background: var(--op-bg); border: 1px solid var(--op-border);
        border-radius: 16px; color: var(--op-text); font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        font-size: 14px; width: 340px; box-shadow: 0 10px 24px rgba(16,24,40,0.12), 0 2px 6px rgba(16,24,40,0.08); user-select: none;
      }

      .op-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid var(--op-border); border-radius: 16px 16px 0 0; cursor: grab; }
      .op-header:active { cursor: grabbing; }
      .op-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
      .op-header-actions { display: flex; gap: 6px; }
      .op-toggle-btn, .op-hdr-btn { background: transparent; border: 1px solid var(--op-border); color: var(--op-text); border-radius: 10px; padding: 4px 8px; cursor: pointer; }
      .op-toggle-btn:hover, .op-hdr-btn:hover { background: var(--op-btn); }

      .op-content { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
      .op-section { display: flex; flex-direction: column; gap: 8px; background: var(--op-subtle); border: 1px solid var(--op-border); border-radius: 12px; padding: 5px; }

      .op-section-title { display: flex; align-items: center; justify-content: space-between; }
      .op-title-text { font-weight: 600; }
      .op-chevron { background: transparent; border: 1px solid var(--op-border); border-radius: 8px; padding: 2px 6px; cursor: pointer; }
      .op-chevron:hover { background: var(--op-btn); }

      .op-row { display: flex; align-items: center; gap: 8px; }
      .op-row.space { justify-content: space-between; }

      .op-button { background: var(--op-btn); color: var(--op-text); border: 1px solid var(--op-btn-border); border-radius: 10px; padding: 6px 10px; cursor: pointer; }
      .op-button:hover { background: var(--op-btn-hover); }
      .op-button:disabled { opacity: 0.5; cursor: not-allowed; }
      .op-button.icon { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }

      .op-input, .op-select { background: var(--op-bg); border: 1px solid var(--op-border); color: var(--op-text); border-radius: 10px; padding: 6px 8px; }
      .op-slider { width: 100%; }

      .op-list { display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow: auto; border: 1px solid var(--op-border); padding: 6px; border-radius: 10px; background: var(--op-bg); }

      .op-item { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 8px; border: 1px solid var(--op-border); background: var(--op-subtle); }
      .op-item.active { outline: 2px solid color-mix(in oklab, var(--op-accent) 35%, transparent); background: var(--op-bg); }
      .op-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .op-muted { color: var(--op-muted); font-size: 12px; }

      .op-preview { width: 100%; height: 90px; background: var(--op-bg); display: flex; align-items: center; justify-content: center; border: 2px dashed color-mix(in oklab, var(--op-accent) 40%, var(--op-border)); border-radius: 10px; overflow: hidden; position: relative; cursor: pointer; }
      .op-preview img { max-width: 100%; max-height: 100%; display: block; pointer-events: none; }
      .op-preview.drop-highlight { background: color-mix(in oklab, var(--op-accent) 12%, transparent); }
      .op-preview .op-drop-hint { position: absolute; bottom: 6px; right: 8px; font-size: 11px; color: var(--op-muted); pointer-events: none; }

      .op-icon-btn { background: var(--op-btn); color: var(--op-text); border: 1px solid var(--op-btn-border); border-radius: 10px; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
      .op-icon-btn:hover { background: var(--op-btn-hover); }

      .op-danger { background: #fee2e2; border-color: #fecaca; color: #7f1d1d; }
      .op-danger-text { color: #dc2626; font-weight: 600; }

      .op-toast-stack { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; z-index: 999999; width: min(92vw, 480px); }
      .op-toast { background: rgba(255,255,255,0.98); border: 1px solid #e6ebf2; color: #111827; padding: 8px 12px; border-radius: 10px; font-size: 12px; box-shadow: 0 6px 16px rgba(16,24,40,0.12); opacity: 0; transform: translateY(-6px); transition: opacity .18s ease, transform .18s ease; max-width: 100%; text-align: center; }
      .op-toast.show { opacity: 1; transform: translateY(0); }
      .op-toast-stack.op-dark .op-toast { background: rgba(27,30,36,0.98); border-color: #2a2f3a; color: #f5f6f9; }

      /* Color Match Modal */
      .op-cc-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: none; }
      .op-cc-backdrop.show { display: block; }

      .op-cc-modal {
        position: fixed; z-index: 10001;
        width: min(1280px, 98vw);
        max-height: 92vh;
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: var(--op-bg); color: var(--op-text);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.28);
        display: none; flex-direction: column;
      }
      .op-cc-header { padding: 10px 12px; border-bottom: 1px solid var(--op-border); display: flex; align-items: center; justify-content: space-between; user-select: none; cursor: default; }
      .op-cc-title { font-weight: 600; }
      .op-cc-close { border: 1px solid var(--op-border); background: transparent; border-radius: 8px; padding: 4px 8px; cursor: pointer; }
      .op-cc-close:hover { background: var(--op-btn); }
      .op-cc-pill { border-radius: 999px; padding: 4px 10px; border: 1px solid var(--op-border); background: var(--op-bg); }

      .op-cc-body {
        display: grid;
        grid-template-columns: 2fr 420px;
        grid-template-areas: "preview controls";
        gap: 12px;
        padding: 12px;
        overflow: hidden;
      }
      @media (max-width: 860px) {
        .op-cc-body { grid-template-columns: 1fr; grid-template-areas: "preview" "controls"; max-height: calc(92vh - 100px); overflow: auto; }
      }

      .op-cc-preview-wrap { grid-area: preview; background: var(--op-subtle); border: 1px solid var(--op-border); border-radius: 12px; position: relative; min-height: 320px; display: flex; align-items: center; justify-content: center; overflow: auto; }
      .op-cc-canvas { image-rendering: pixelated; }
      .op-cc-zoom { position: absolute; top: 8px; right: 8px; display: inline-flex; gap: 6px; }
      .op-cc-zoom .op-icon-btn { width: 34px; height: 34px; }

      .op-cc-controls { grid-area: controls; display: flex; flex-direction: column; gap: 12px; background: var(--op-subtle); border: 1px solid var(--op-border); border-radius: 12px; padding: 10px; overflow: auto; max-height: calc(92vh - 160px); }
      .op-cc-block { display: flex; flex-direction: column; gap: 6px; }
      .op-cc-block label { color: var(--op-muted); font-weight: 600; }

      .op-cc-palette { display: flex; flex-direction: column; gap: 8px; background: var(--op-bg); border: 1px dashed var(--op-border); border-radius: 10px; padding: 8px; }
      .op-list-subtle { background: var(--op-bg); border: 1px solid var(--op-border); border-radius: 10px; padding: 6px; }
      .op-cc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(22px, 22px)); gap: 6px; }
      .op-cc-cell { width: 22px; height: 22px; border-radius: 4px; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.15) inset; cursor: pointer; }
      .op-cc-cell.active { outline: 2px solid var(--op-accent); }

      .op-cc-footer { padding: 10px 12px; border-top: 1px solid var(--op-border); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
      .op-cc-actions { display: inline-flex; gap: 8px; }
      .op-cc-ghost { color: var(--op-muted); font-size: 12px; }

      .op-color-list-item { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 4px; }
      .op-color-list-swatch { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--op-border); flex-shrink: 0; }
      .op-color-list-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .op-color-list-count { font-weight: 600; }
      .op-color-list-item.premium .op-color-list-name { color: #eeff00ff; font-weight: bold; }
      .op-theme-dark .op-color-list-item.premium .op-color-list-name { color: #fdd835; }

      /* Resize Modal */
      .op-rs-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: none; }
      .op-rs-backdrop.show { display: block; }

      .op-rs-modal {
        position: fixed; z-index: 10001;
        width: min(1200px, 96vw);
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        background: var(--op-bg); color: var(--op-text);
        border: 1px solid var(--op-border);
        border-radius: 14px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.28);
        display: none; flex-direction: column;
        max-height: 92vh;
      }
      .op-rs-header { padding: 10px 12px; border-bottom: 1px solid var(--op-border); display: flex; align-items: center; justify-content: space-between; user-select: none; cursor: default; }
      .op-rs-title { font-weight: 600; }
      .op-rs-close { border: 1px solid var(--op-border); background: transparent; border-radius: 8px; padding: 4px 8px; cursor: pointer; }
      .op-rs-close:hover { background: var(--op-btn); }

      .op-rs-tabs { display: flex; gap: 6px; padding: 8px 12px 0 12px; }
      .op-rs-tab-btn { background: var(--op-btn); color: var(--op-text); border: 1px solid var(--op-btn-border); border-radius: 10px; padding: 6px 10px; cursor: pointer; }
      .op-rs-tab-btn.active { outline: 2px solid color-mix(in oklab, var(--op-accent) 35%, transparent); background: var(--op-btn-hover); }

      .op-rs-body { padding: 12px; display: grid; grid-template-columns: 1fr; gap: 10px; overflow: auto; }
      .op-rs-row { display: flex; align-items: center; gap: 8px; }
      .op-rs-row .op-input { flex: 1; }

      .op-rs-pane { display: none; }
      .op-rs-pane.show { display: block; }

      .op-rs-preview-wrap { background: var(--op-subtle); border: 1px solid var(--op-border); border-radius: 12px; position: relative; height: clamp(260px, 36vh, 540px); display: flex; align-items: center; justify-content: center; overflow: hidden; }
      .op-rs-canvas { image-rendering: pixelated; }

      .op-rs-zoom { position: absolute; top: 8px; right: 8px; display: inline-flex; gap: 6px; }

      .op-rs-grid-note { color: var(--op-muted); font-size: 12px; }
      .op-rs-mini { width: 96px; }

      .op-rs-dual { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; height: 100%; padding: 8px; box-sizing: border-box; }
      .op-rs-col { position: relative; background: var(--op-bg); border: 1px dashed var(--op-border); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow: hidden; }
      .op-rs-col .label { position: absolute; top: 2px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--op-muted); pointer-events: none; }
      .op-rs-col .pad-top { height: 18px; width: 100%; flex: 0 0 auto; }
      .op-rs-thumb { width: 100%; height: calc(100% - 18px); display: block; }

      .op-pan-grab { cursor: grab; }
      .op-pan-grabbing { cursor: grabbing; }

      .op-rs-footer { padding: 10px 12px; border-top: 1px solid var(--op-border); display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    `;
    document.head.appendChild(style);
  }

  function createUI() {
    if (document.getElementById('overlay-pro-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'overlay-pro-panel';

    const panelW = 340;
    const defaultLeft = Math.max(12, window.innerWidth - panelW - 80);
    panel.style.left = (Number.isFinite(config.panelX) ? config.panelX : defaultLeft) + 'px';
    panel.style.top = (Number.isFinite(config.panelY) ? config.panelY : 120) + 'px';

    panel.innerHTML = `
      <div class="op-header" id="op-header">
        <h3>Overlay Pro</h3>
        <div class="op-header-actions">
          <button class="op-hdr-btn" id="op-theme-toggle" title="Toggle theme">☀️/🌙</button>
          <button class="op-hdr-btn" id="op-refresh-btn" title="Refresh">⟲</button>
          <button class="op-toggle-btn" id="op-panel-toggle" title="Collapse">▾</button>
        </div>
      </div>
      <div class="op-content" id="op-content">
        <div class="op-section">
          <div class="op-row space">
            <button class="op-button" id="op-mode-toggle">Mode</button>
            <div class="op-row">
              <span class="op-muted" id="op-place-label">Place overlay:</span>
              <button class="op-button" id="op-autocap-toggle" title="Capture next clicked pixel as anchor">OFF</button>
            </div>
          </div>
        </div>

        <div class="op-section">
          <div class="op-section-title">
            <div class="op-title-left">
              <span class="op-title-text">Overlays</span>
            </div>
            <div class="op-title-right">
              <div class="op-row">
                <button class="op-button" id="op-add-overlay" title="Create a new overlay">+ Add</button>
                <button class="op-button" id="op-import-overlay" title="Import overlay JSON">Import</button>
                <button class="op-button" id="op-export-overlay" title="Export active overlay JSON">Export</button>
                <button class="op-chevron" id="op-collapse-list" title="Collapse/Expand">▾</button>
              </div>
            </div>
          </div>
          <div id="op-list-wrap">
            <div class="op-list" id="op-overlay-list"></div>
          </div>
        </div>

        <div class="op-section" id="op-editor-section">
          <div class="op-section-title">
            <div class="op-title-left">
              <span class="op-title-text">Editor</span>
            </div>
            <div class="op-title-right">
              <button class="op-chevron" id="op-collapse-editor" title="Collapse/Expand">▾</button>
            </div>
          </div>

          <div id="op-editor-body">
            <div class="op-row">
              <label style="width: 90px;">Name</label>
              <input type="text" class="op-input op-grow" id="op-name">
            </div>

            <div id="op-image-source">
              <div class="op-row">
                <label style="width: 90px;">Image</label>
                <input type="text" class="op-input op-grow" id="op-image-url" placeholder="Paste a direct image link">
                <button class="op-button" id="op-fetch">Fetch</button>
              </div>
              <div class="op-preview" id="op-dropzone">
                <div class="op-drop-hint">Drop here or click to browse.</div>
                <input type="file" id="op-file-input" accept="image/*" style="display:none">
              </div>
            </div>

            <div class="op-preview" id="op-preview-wrap" style="display:none;">
              <img id="op-image-preview" alt="No image">
            </div>

            <div class="op-row" id="op-cc-btn-row" style="display:none; justify-content:space-between; gap:8px; flex-wrap:wrap;">
              <button class="op-button" id="op-download-overlay" title="Download this overlay image">Download</button>
              <button class="op-button" id="op-open-resize" title="Resize the overlay image">Resize</button>
              <button class="op-button" id="op-open-cc" title="Match colors to Wplace palette">Color Match</button>
            </div>

            <div class="op-row"><span class="op-muted" id="op-coord-display"></span></div>

            <div class="op-row" style="width: 100%; gap: 12px; padding: 6px 0;">
              <label style="width: 60px;">Opacity</label>
              <input type="range" min="0" max="1" step="0.05" class="op-slider op-grow" id="op-opacity-slider">
              <span id="op-opacity-value" style="width: 36px; text-align: right;">70%</span>
            </div>
          </div>
        </div>

        <div class="op-section" id="op-nudge-section">
          <div class="op-section-title">
            <div class="op-title-left">
              <span class="op-title-text">Nudge overlay</span>
            </div>
            <div class="op-title-right">
              <span class="op-muted" id="op-offset-indicator">Offset X 0, Y 0</span>
              <button class="op-chevron" id="op-collapse-nudge" title="Collapse/Expand">▾</button>
            </div>
          </div>
          <div id="op-nudge-body">
            <div class="op-nudge-row" style="text-align: right;">
              <button class="op-icon-btn" id="op-nudge-left" title="Left">←</button>
              <button class="op-icon-btn" id="op-nudge-down" title="Down">↓</button>
              <button class="op-icon-btn" id="op-nudge-up" title="Up">↑</button>
              <button class="op-icon-btn" id="op-nudge-right" title="Right">→</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    buildCCModal();
    buildRSModal();
    addEventListeners();
    enableDrag(panel);
    updateUI();
  }

  function getActiveOverlay() { return config.overlays.find(o => o.id === config.activeOverlayId) || null; }

  function rebuildOverlayListUI() {
    const list = document.getElementById('op-overlay-list');
    if (!list) return;
    list.innerHTML = '';
    for (const ov of config.overlays) {
      const item = document.createElement('div');
      item.className = 'op-item' + (ov.id === config.activeOverlayId ? ' active' : '');
      const localTag = ov.isLocal ? ' (local)' : (!ov.imageBase64 ? ' (no image)' : '');
      item.innerHTML = `
        <input type="radio" name="op-active" ${ov.id === config.activeOverlayId ? 'checked' : ''} title="Set active"/>
        <input type="checkbox" ${ov.enabled ? 'checked' : ''} title="Toggle enabled"/>
        <div class="op-item-name" title="${(ov.name || '(unnamed)') + localTag}">${(ov.name || '(unnamed)') + localTag}</div>
        <button class="op-icon-btn" title="Delete overlay">🗑️</button>
      `;
      const [radio, checkbox, nameDiv, trashBtn] = item.children;

      radio.addEventListener('change', () => { config.activeOverlayId = ov.id; saveConfig(['activeOverlayId']); updateUI(); });
      checkbox.addEventListener('change', () => { ov.enabled = checkbox.checked; saveConfig(['overlays']); clearOverlayCache(); ensureHook(); });
      nameDiv.addEventListener('click', () => { config.activeOverlayId = ov.id; saveConfig(['activeOverlayId']); updateUI(); });
      trashBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete overlay "${ov.name || '(unnamed)'}"?`)) return;
        const idx = config.overlays.findIndex(o => o.id === ov.id);
        if (idx >= 0) {
          config.overlays.splice(idx, 1);
          if (config.activeOverlayId === ov.id) config.activeOverlayId = config.overlays[0]?.id || null;
          await saveConfig(['overlays', 'activeOverlayId']); clearOverlayCache(); ensureHook(); updateUI();
        }
      });

      list.appendChild(item);
    }
  }

  async function addBlankOverlay() {
    const name = uniqueName('Overlay');
    const ov = { id: uid(), name, enabled: true, imageUrl: null, imageBase64: null, isLocal: false, pixelUrl: null, offsetX: 0, offsetY: 0, opacity: 0.7 };
    config.overlays.push(ov);
    config.activeOverlayId = ov.id;
    await saveConfig(['overlays', 'activeOverlayId']);
    clearOverlayCache(); ensureHook(); updateUI();
    return ov;
  }

  async function setOverlayImageFromURL(ov, url) {
    const base64 = await urlToDataURL(url);
    ov.imageUrl = url; ov.imageBase64 = base64; ov.isLocal = false;
    await saveConfig(['overlays']); clearOverlayCache();
    config.autoCapturePixelUrl = true; await saveConfig(['autoCapturePixelUrl']);
    ensureHook(); updateUI();
    showToast(`Image loaded. Placement mode ON -- click once to set anchor.`);
  }
  async function setOverlayImageFromFile(ov, file) {
    if (!file || !file.type || !file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    if (!confirm('Local PNGs cannot be exported to friends! Are you sure?')) return;
    const base64 = await fileToDataURL(file);
    ov.imageBase64 = base64; ov.imageUrl = null; ov.isLocal = true;
    await saveConfig(['overlays']); clearOverlayCache();
    config.autoCapturePixelUrl = true; await saveConfig(['autoCapturePixelUrl']);
    ensureHook(); updateUI();
    showToast(`Local image loaded. Placement mode ON -- click once to set anchor.`);
  }

  async function importOverlayFromJSON(jsonText) {
    let obj; try { obj = JSON.parse(jsonText); } catch { alert('Invalid JSON'); return; }
    const arr = Array.isArray(obj) ? obj : [obj];
    let imported = 0, failed = 0;
    for (const item of arr) {
      const name = uniqueName(item.name || 'Imported Overlay');
      const imageUrl = item.imageUrl;
      const pixelUrl = item.pixelUrl ?? null;
      const offsetX = Number.isFinite(item.offsetX) ? item.offsetX : 0;
      const offsetY = Number.isFinite(item.offsetY) ? item.offsetY : 0;
      const opacity = Number.isFinite(item.opacity) ? item.opacity : 0.7;
      if (!imageUrl) { failed++; continue; }
      try {
        const base64 = await urlToDataURL(imageUrl);
        const ov = { id: uid(), name, enabled: true, imageUrl, imageBase64: base64, isLocal: false, pixelUrl, offsetX, offsetY, opacity };
        config.overlays.push(ov); imported++;
      } catch (e) { console.error('Import failed for', imageUrl, e); failed++; }
    }
    if (imported > 0) {
      config.activeOverlayId = config.overlays[config.overlays.length - 1].id;
      await saveConfig(['overlays', 'activeOverlayId']); clearOverlayCache(); ensureHook(); updateUI();
    }
    alert(`Import finished. Imported: ${imported}${failed ? `, Failed: ${failed}` : ''}`);
  }

  function exportActiveOverlayToClipboard() {
    const ov = getActiveOverlay();
    if (!ov) { alert('No active overlay selected.'); return; }
    if (ov.isLocal || !ov.imageUrl) { alert('This overlay uses a local image and cannot be exported. Please host the image and set an image URL.'); return; }
    const payload = { version: 1, name: ov.name, imageUrl: ov.imageUrl, pixelUrl: ov.pixelUrl ?? null, offsetX: ov.offsetX, offsetY: ov.offsetY, opacity: ov.opacity };
    const text = JSON.stringify(payload, null, 2);
    copyText(text).then(() => alert('Overlay JSON copied to clipboard!')).catch(() => { prompt('Copy the JSON below:', text); });
  }
  function copyText(text) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); return Promise.reject(new Error('Clipboard API not available')); }

  function addEventListeners() {
    const $ = (id) => document.getElementById(id);

    $('op-theme-toggle').addEventListener('click', async (e) => { e.stopPropagation(); config.theme = config.theme === 'light' ? 'dark' : 'light'; await saveConfig(['theme']); applyTheme(); });
    $('op-refresh-btn').addEventListener('click', (e) => { e.stopPropagation(); location.reload(); });
    $('op-panel-toggle').addEventListener('click', (e) => { e.stopPropagation(); config.isPanelCollapsed = !config.isPanelCollapsed; saveConfig(['isPanelCollapsed']); updateUI(); });

    $('op-mode-toggle').addEventListener('click', () => {
      const modes = ['behind', 'above', 'minify', 'original'];
      const current = modes.indexOf(config.overlayMode);
      config.overlayMode = modes[(current + 1) % modes.length];
      saveConfig(['overlayMode']);
      ensureHook();
      updateUI();
    });
    $('op-autocap-toggle').addEventListener('click', () => { config.autoCapturePixelUrl = !config.autoCapturePixelUrl; saveConfig(['autoCapturePixelUrl']); ensureHook(); updateUI(); });

    $('op-add-overlay').addEventListener('click', async () => { try { await addBlankOverlay(); } catch (e) { console.error(e); } });
    $('op-import-overlay').addEventListener('click', async () => { const text = prompt('Paste overlay JSON (single or array):'); if (!text) return; await importOverlayFromJSON(text); });
    $('op-export-overlay').addEventListener('click', () => exportActiveOverlayToClipboard());
    $('op-collapse-list').addEventListener('click', () => { config.collapseList = !config.collapseList; saveConfig(['collapseList']); updateUI(); });
    $('op-collapse-editor').addEventListener('click', () => { config.collapseEditor = !config.collapseEditor; saveConfig(['collapseEditor']); updateUI(); });
    $('op-collapse-nudge').addEventListener('click', () => { config.collapseNudge = !config.collapseNudge; saveConfig(['collapseNudge']); updateUI(); });

    $('op-name').addEventListener('change', async (e) => {
      const ov = getActiveOverlay(); if (!ov) return;
      const desired = (e.target.value || '').trim() || 'Overlay';
      if (config.overlays.some(o => o.id !== ov.id && (o.name || '').toLowerCase() === desired.toLowerCase())) { ov.name = uniqueName(desired); showToast(`Name in use. Renamed to "${ov.name}".`); } else { ov.name = desired; }
      await saveConfig(['overlays']); rebuildOverlayListUI();
    });

    $('op-fetch').addEventListener('click', async () => {
      const ov = getActiveOverlay(); if (!ov) { alert('No active overlay selected.'); return; }
      if (ov.imageBase64) { alert('This overlay already has an image. Create a new overlay to change the image.'); return; }
      const url = $('op-image-url').value.trim(); if (!url) { alert('Enter an image link first.'); return; }
      try { await setOverlayImageFromURL(ov, url); } catch (e) { console.error(e); alert('Failed to fetch image.'); }
    });

    const dropzone = $('op-dropzone');
    dropzone.addEventListener('click', () => $('op-file-input').click());
    $('op-file-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0]; e.target.value=''; if (!file) return;
      const ov = getActiveOverlay(); if (!ov) return;
      if (ov.imageBase64) { alert('This overlay already has an image. Create a new overlay to change the image.'); return; }
      try { await setOverlayImageFromFile(ov, file); } catch (err) { console.error(err); alert('Failed to load local image.'); }
    });
    ['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drop-highlight'); }));
    ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); if (evt === 'dragleave' && e.target !== dropzone) return; dropzone.classList.remove('drop-highlight'); }));
    dropzone.addEventListener('drop', async (e) => {
      const dt = e.dataTransfer; if (!dt) return; const file = dt.files && dt.files[0]; if (!file) return;
      const ov = getActiveOverlay(); if (!ov) return;
      if (ov.imageBase64) { alert('This overlay already has an image. Create a new overlay to change the image.'); return; }
      try { await setOverlayImageFromFile(ov, file); } catch (err) { console.error(err); alert('Failed to load dropped image.'); }
    });

    const nudge = async (dx, dy) => { const ov = getActiveOverlay(); if (!ov) return; ov.offsetX += dx; ov.offsetY += dy; await saveConfig(['overlays']); clearOverlayCache(); updateUI(); };
    $('op-nudge-up').addEventListener('click', () => nudge(0, -1));
    $('op-nudge-down').addEventListener('click', () => nudge(0, 1));
    $('op-nudge-left').addEventListener('click', () => nudge(-1, 0));
    $('op-nudge-right').addEventListener('click', () => nudge(1, 0));

    $('op-opacity-slider').addEventListener('input', (e) => { const ov = getActiveOverlay(); if (!ov) return; ov.opacity = parseFloat(e.target.value); document.getElementById('op-opacity-value').textContent = Math.round(ov.opacity * 100) + '%'; });
    $('op-opacity-slider').addEventListener('change', async () => { await saveConfig(['overlays']); clearOverlayCache(); });

    $('op-download-overlay').addEventListener('click', () => {
      const ov = getActiveOverlay();
      if (!ov || !ov.imageBase64) { showToast('No overlay image to download.'); return; }
      const a = document.createElement('a');
      a.href = ov.imageBase64;
      a.download = `${(ov.name || 'overlay').replace(/[^\w.-]+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    $('op-open-cc').addEventListener('click', () => {
      const ov = getActiveOverlay(); if (!ov || !ov.imageBase64) { showToast('No overlay image to edit.'); return; }
      openCCModal(ov);
    });

    const resizeBtn = $('op-open-resize');
    if (resizeBtn) {
      resizeBtn.addEventListener('click', () => {
        const ov = getActiveOverlay();
        if (!ov || !ov.imageBase64) { showToast('No overlay image to resize.'); return; }
        openRSModal(ov);
      });
    }

    window.addEventListener('resize', () => {
    });
  }

  function enableDrag(panel) {
    const header = panel.querySelector('#op-header');
    if (!header) return;

    let isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0, moved = false;
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    const onPointerDown = (e) => {
      if (e.target.closest('button')) return;
      isDragging = true; moved = false; startX = e.clientX; startY = e.clientY;
      const rect = panel.getBoundingClientRect(); startLeft = rect.left; startTop = rect.top;
      header.setPointerCapture?.(e.pointerId); e.preventDefault();
    };
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
      const maxTop  = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      panel.style.left = clamp(startLeft + dx, 8, maxLeft) + 'px';
      panel.style.top  = clamp(startTop  + dy, 8, maxTop)  + 'px';
      moved = true;
    };
    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false; header.releasePointerCapture?.(e.pointerId);
      if (moved) { config.panelX = parseInt(panel.style.left, 10) || 0; config.panelY = parseInt(panel.style.top, 10) || 0; saveConfig(['panelX', 'panelY']); }
    };
    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);

    window.addEventListener('resize', () => {
      const rect = panel.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
      const maxTop  = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
      const newLeft = Math.min(Math.max(rect.left, 8), maxLeft);
      const newTop  = Math.min(Math.max(rect.top, 8), maxTop);
      panel.style.left = newLeft + 'px'; panel.style.top = newTop + 'px';
      config.panelX = newLeft; config.panelY = newTop; saveConfig(['panelX', 'panelY']);
    });
  }

  function applyTheme() {
    document.body.classList.toggle('op-theme-dark', config.theme === 'dark');
    document.body.classList.toggle('op-theme-light', config.theme !== 'dark');
    const stack = document.getElementById('op-toast-stack');
    if (stack) stack.classList.toggle('op-dark', config.theme === 'dark');
  }

  function updateEditorUI() {
    const $ = (id) => document.getElementById(id);
    const ov = getActiveOverlay();

    const editorSect = $('op-editor-section');
    const editorBody = $('op-editor-body');
    editorSect.style.display = ov ? 'flex' : 'none';
    if (!ov) return;

    $('op-name').value = ov.name || '';

    const srcWrap = $('op-image-source');
    const previewWrap = $('op-preview-wrap');
    const previewImg = $('op-image-preview');
    const ccRow = $('op-cc-btn-row');

    if (ov.imageBase64) {
      srcWrap.style.display = 'none';
      previewWrap.style.display = 'flex';
      previewImg.src = ov.imageBase64;
      ccRow.style.display = 'flex';
    } else {
      srcWrap.style.display = 'block';
      previewWrap.style.display = 'none';
      ccRow.style.display = 'none';
      $('op-image-url').value = ov.imageUrl || '';
    }

    const coords = ov.pixelUrl ? extractPixelCoords(ov.pixelUrl) : { chunk1: '-', chunk2: '-', posX: '-', posY: '-' };
    $('op-coord-display').textContent = ov.pixelUrl
      ? `Ref: chunk ${coords.chunk1}/${coords.chunk2} at (${coords.posX}, ${coords.posY})`
      : `No pixel anchor set. Turn ON "Place overlay" and click a pixel once.`;

    $('op-opacity-slider').value = String(ov.opacity);
    $('op-opacity-value').textContent = Math.round(ov.opacity * 100) + '%';

    const indicator = document.getElementById('op-offset-indicator');
    if (indicator) indicator.textContent = `Offset X ${ov.offsetX}, Y ${ov.offsetY}`;

    editorBody.style.display = config.collapseEditor ? 'none' : 'block';
    const chevron = document.getElementById('op-collapse-editor');
    if (chevron) chevron.textContent = config.collapseEditor ? '▸' : '▾';
  }

  function updateUI() {
    const $ = (id) => document.getElementById(id);
    const panel = $('overlay-pro-panel');
    if (!panel) return;

    applyTheme();

    const content = $('op-content');
    const toggle = $('op-panel-toggle');
    const collapsed = !!config.isPanelCollapsed;
    content.style.display = collapsed ? 'none' : 'flex';
    toggle.textContent = collapsed ? '▸' : '▾';
    toggle.title = collapsed ? 'Expand' : 'Collapse';

    const modeBtn = $('op-mode-toggle');
    const modeMap = { behind: 'Overlay Behind', above: 'Overlay Above', minify: `Minified`, original: 'Original' };
    modeBtn.textContent = `Mode: ${modeMap[config.overlayMode] || 'Original'}`;

    const autoBtn = $('op-autocap-toggle');
    const placeLabel = $('op-place-label');
    autoBtn.textContent = config.autoCapturePixelUrl ? 'ON' : 'OFF';
    autoBtn.classList.toggle('op-danger', !!config.autoCapturePixelUrl);
    placeLabel.classList.toggle('op-danger-text', !!config.autoCapturePixelUrl);

    const listWrap = $('op-list-wrap');
    const listCz = $('op-collapse-list');
    listWrap.style.display = config.collapseList ? 'none' : 'block';
    if (listCz) listCz.textContent = config.collapseList ? '▸' : '▾';

    const nudgeBody = $('op-nudge-body');
    const nudgeCz = $('op-collapse-nudge');
    nudgeBody.style.display = config.collapseNudge ? 'none' : 'block';
    if (nudgeCz) nudgeCz.textContent = config.collapseNudge ? '▸' : '▾';

    rebuildOverlayListUI();
    updateEditorUI();

    const exportBtn = $('op-export-overlay');
    const ov = getActiveOverlay();
    const canExport = !!(ov && ov.imageUrl && !ov.isLocal);
    exportBtn.disabled = !canExport;
    exportBtn.title = canExport ? 'Export active overlay JSON' : 'Export disabled for local images';
  }

  let cc = null;

  function buildCCModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'op-cc-backdrop';
    backdrop.id = 'op-cc-backdrop';
    document.body.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.className = 'op-cc-modal';
    modal.id = 'op-cc-modal';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="op-cc-header" id="op-cc-header">
        <div class="op-cc-title">Color Match</div>
        <div class="op-row" style="gap:6px;">
          <button class="op-button op-cc-pill" id="op-cc-realtime">Realtime: OFF</button>
          <button class="op-cc-close" id="op-cc-close" title="Close">✕</button>
        </div>
      </div>

      <div class="op-cc-body">
        <div class="op-cc-preview-wrap" style="grid-area: preview;">
          <canvas id="op-cc-preview" class="op-cc-canvas"></canvas>
          <div class="op-cc-zoom">
            <button class="op-icon-btn" id="op-cc-zoom-out" title="Zoom out">−</button>
            <button class="op-icon-btn" id="op-cc-zoom-in" title="Zoom in">+</button>
          </div>
        </div>

        <div class="op-cc-controls" style="grid-area: controls;">
          <div class="op-cc-palette" id="op-cc-free">
            <div class="op-row space">
              <label>Free Colors</label>
              <button class="op-button" id="op-cc-free-toggle">Unselect All</button>
            </div>
            <div id="op-cc-free-grid" class="op-cc-grid"></div>
          </div>

          <div class="op-cc-palette" id="op-cc-paid">
            <div class="op-row space">
              <label>Paid Colors (2000💧each)</label>
              <button class="op-button" id="op-cc-paid-toggle">Select All</button>
            </div>
            <div id="op-cc-paid-grid" class="op-cc-grid"></div>
          </div>

          <div class="op-cc-block">
            <label>Color Counts</label>
            <div id="op-cc-color-list" class="op-list op-list-subtle" style="max-height: 160px;"></div>
          </div>
        </div>
      </div>

      <div class="op-cc-footer">
        <div class="op-cc-ghost" id="op-cc-meta"></div>
        <div class="op-cc-actions">
          <button class="op-button" id="op-cc-recalc" title="Recalculate color mapping">Calculate</button>
          <button class="op-button" id="op-cc-apply" title="Apply changes to overlay">Apply</button>
          <button class="op-button" id="op-cc-cancel" title="Close without saving">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#op-cc-close').addEventListener('click', closeCCModal);
    backdrop.addEventListener('click', closeCCModal);
    modal.querySelector('#op-cc-cancel').addEventListener('click', closeCCModal);

    cc = {
      backdrop,
      modal,
      previewCanvas: modal.querySelector('#op-cc-preview'),
      previewCtx: modal.querySelector('#op-cc-preview').getContext('2d', { willReadFrequently: true }),

      sourceCanvas: null,
      sourceCtx: null,
      sourceImageData: null,

      processedCanvas: null,
      processedCtx: null,

      freeGrid: modal.querySelector('#op-cc-free-grid'),
      paidGrid: modal.querySelector('#op-cc-paid-grid'),
      freeToggle: modal.querySelector('#op-cc-free-toggle'),
      paidToggle: modal.querySelector('#op-cc-paid-toggle'),

      meta: modal.querySelector('#op-cc-meta'),
      applyBtn: modal.querySelector('#op-cc-apply'),
      recalcBtn: modal.querySelector('#op-cc-recalc'),
      realtimeBtn: modal.querySelector('#op-cc-realtime'),

      zoom: 1.0,
      selectedFree: new Set(config.ccFreeKeys),
      selectedPaid: new Set(config.ccPaidKeys),
      realtime: !!config.ccRealtime,

      overlay: null,
      lastColorCounts: {},
      isStale: false
    };

    cc.realtimeBtn.addEventListener('click', async () => {
      cc.realtime = !cc.realtime;
      cc.realtimeBtn.textContent = `Realtime: ${cc.realtime ? 'ON' : 'OFF'}`;
      cc.realtimeBtn.classList.toggle('op-danger', cc.realtime);
      config.ccRealtime = cc.realtime; await saveConfig(['ccRealtime']);
      if (cc.realtime && cc.isStale) recalcNow();
    });

    const zoomIn = async () => { cc.zoom = Math.min(8, (cc.zoom || 1) * 1.25); config.ccZoom = cc.zoom; await saveConfig(['ccZoom']); applyPreview(); updateMeta(); };
    const zoomOut = async () => { cc.zoom = Math.max(0.1, (cc.zoom || 1) / 1.25); config.ccZoom = cc.zoom; await saveConfig(['ccZoom']); applyPreview(); updateMeta(); };
    modal.querySelector('#op-cc-zoom-in').addEventListener('click', zoomIn);
    modal.querySelector('#op-cc-zoom-out').addEventListener('click', zoomOut);

    cc.recalcBtn.addEventListener('click', () => { recalcNow(); });

    cc.applyBtn.addEventListener('click', async () => {
      const ov = cc.overlay; if (!ov) return;

      const activePalette = getActivePalette();
      if (activePalette.length === 0) { showToast('Select at least one color.'); return; }

      if (cc.isStale) recalcNow();
      if (!cc.processedCanvas) { showToast('Nothing to apply.'); return; }
      if (cc.processedCanvas.width >= MAX_OVERLAY_DIM || cc.processedCanvas.height >= MAX_OVERLAY_DIM) {
        showToast(`Image too large to apply (must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM}).`); return;
      }

      const dataUrl = cc.processedCanvas.toDataURL('image/png');
      ov.imageBase64 = dataUrl; ov.imageUrl = null; ov.isLocal = true;
      await saveConfig(['overlays']); clearOverlayCache(); ensureHook(); updateUI();

      const uniqueColors = Object.keys(cc.lastColorCounts).length;
      showToast(`Overlay updated (${cc.processedCanvas.width}×${cc.processedCanvas.height}, ${uniqueColors} colors).`);
      closeCCModal();
    });

    renderPaletteGrid();

    cc.freeToggle.addEventListener('click', async () => {
      const allActive = isAllFreeActive();
      setAllActive('free', !allActive);
      config.ccFreeKeys = Array.from(cc.selectedFree);
      await saveConfig(['ccFreeKeys']);
      if (cc.realtime) recalcNow(); else markStale();
      applyPreview(); updateMeta(); updateMasterButtons();
    });
    cc.paidToggle.addEventListener('click', async () => {
      const allActive = isAllPaidActive();
      setAllActive('paid', !allActive);
      config.ccPaidKeys = Array.from(cc.selectedPaid);
      await saveConfig(['ccPaidKeys']);
      if (cc.realtime) recalcNow(); else markStale();
      applyPreview(); updateMeta(); updateMasterButtons();
    });

    function markStale() {
      cc.isStale = true;
      cc.meta.textContent = cc.meta.textContent.replace(/ \| Status: .+$/, '') + ' | Status: pending recalculation';
    }
    function recalcNow() {
      processImage();
      cc.isStale = false;
      applyPreview();
      updateMeta();
      updateColorListUI();
    }
  }

  function openCCModal(overlay) {
    if (!cc) return;
    cc.overlay = overlay;

    document.body.classList.add('op-scroll-lock');

    cc.zoom = Number(config.ccZoom) || 1.0;
    cc.realtime = !!config.ccRealtime;
    cc.realtimeBtn.textContent = `Realtime: ${cc.realtime ? 'ON' : 'OFF'}`;
    cc.realtimeBtn.classList.toggle('op-danger', cc.realtime);

    const img = new Image();
    img.onload = () => {
      if (!cc.sourceCanvas) { cc.sourceCanvas = document.createElement('canvas'); cc.sourceCtx = cc.sourceCanvas.getContext('2d', { willReadFrequently: true }); }
      cc.sourceCanvas.width = img.width; cc.sourceCanvas.height = img.height;
      cc.sourceCtx.clearRect(0,0,img.width,img.height);
      cc.sourceCtx.drawImage(img, 0, 0);

      cc.sourceImageData = cc.sourceCtx.getImageData(0,0,img.width,img.height);

      if (!cc.processedCanvas) { cc.processedCanvas = document.createElement('canvas'); cc.processedCtx = cc.processedCanvas.getContext('2d'); }

      processImage();
      cc.isStale = false;
      applyPreview();
      updateMeta();
      updateColorListUI();

      cc.backdrop.classList.add('show');
      cc.modal.style.display = 'flex';
    };
    img.src = overlay.imageBase64;
  }

  function closeCCModal() {
    if (!cc) return;
    cc.backdrop.classList.remove('show');
    cc.modal.style.display = 'none';
    cc.overlay = null;
    document.body.classList.remove('op-scroll-lock');
  }

  function weightedNearest(r, g, b, palette) {
    let best = null, bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i];
      const rmean = (pr + r) / 2;
      const rdiff = pr - r;
      const gdiff = pg - g;
      const bdiff = pb - b;
      const x = (512 + rmean) * rdiff * rdiff >> 8;
      const y = 4 * gdiff * gdiff;
      const z = (767 - rmean) * bdiff * bdiff >> 8;
      const dist = Math.sqrt(x + y + z);
      if (dist < bestDist) { bestDist = dist; best = [pr, pg, pb]; }
    }
    return best || [0,0,0];
  }

  function getActivePalette() {
    const arr = [];
    cc.selectedFree.forEach(k => { const [r,g,b] = k.split(',').map(n => parseInt(n,10)); if (Number.isFinite(r)) arr.push([r,g,b]); });
    cc.selectedPaid.forEach(k => { const [r,g,b] = k.split(',').map(n => parseInt(n,10)); if (Number.isFinite(r)) arr.push([r,g,b]); });
    return arr;
  }

  function processImage() {
    if (!cc.sourceImageData) return;
    const w = cc.sourceImageData.width, h = cc.sourceImageData.height;

    const src = cc.sourceImageData.data;
    const out = new Uint8ClampedArray(src.length);

    const palette = getActivePalette();
    const counts = {};

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i+1], b = src[i+2], a = src[i+3];
      if (a === 0) { out[i]=0; out[i+1]=0; out[i+2]=0; out[i+3]=0; continue; }

      const [nr, ng, nb] = palette.length ? weightedNearest(r,g,b,palette) : [r,g,b];
      out[i]=nr; out[i+1]=ng; out[i+2]=nb; out[i+3]=255;

      const key = `${nr},${ng},${nb}`;
      counts[key] = (counts[key] || 0) + 1;
    }

    if (!cc.processedCanvas) { cc.processedCanvas = document.createElement('canvas'); cc.processedCtx = cc.processedCanvas.getContext('2d'); }
    cc.processedCanvas.width = w; cc.processedCanvas.height = h;

    const outImg = new ImageData(out, w, h);
    cc.processedCtx.putImageData(outImg, 0, 0);
    cc.lastColorCounts = counts;
  }

  function applyPreview() {
    const zoom = Number(cc.zoom) || 1.0;
    const srcCanvas = cc.processedCanvas;
    if (!srcCanvas) return;

    const pw = Math.max(1, Math.round(srcCanvas.width * zoom));
    const ph = Math.max(1, Math.round(srcCanvas.height * zoom));

    cc.previewCanvas.width = pw;
    cc.previewCanvas.height = ph;

    const ctx = cc.previewCtx;
    ctx.clearRect(0,0,pw,ph);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, 0,0, srcCanvas.width, srcCanvas.height, 0,0, pw, ph);
    ctx.imageSmoothingEnabled = true;
  }

  function updateMeta() {
    if (!cc.sourceImageData) { cc.meta.textContent = ''; return; }
    const w = cc.sourceImageData.width, h = cc.sourceImageData.height;
    const colorsUsed = Object.keys(cc.lastColorCounts||{}).length;
    const status = cc.isStale ? 'pending recalculation' : 'up to date';
    cc.meta.textContent = `Size: ${w}×${h} | Zoom: ${cc.zoom.toFixed(2)}× | Colors: ${colorsUsed} | Status: ${status}`;
  }

  function updateColorListUI() {
    if (!cc || !cc.lastColorCounts) return;
    const listEl = document.getElementById('op-cc-color-list');
    if (!listEl) return;

    const counts = cc.lastColorCounts;
    const sorted = Object.entries(counts).sort(([,a],[,b]) => b - a);

    const paidKeys = new Set(WPLACE_PAID.map(([r,g,b]) => `${r},${g},${b}`));

    listEl.innerHTML = '';
    if (sorted.length === 0) {
      listEl.innerHTML = `<div class="op-muted" style="text-align:center; padding: 12px 0;">No colors in image.</div>`;
      return;
    }

    for (const [key, count] of sorted) {
      const isPremium = paidKeys.has(key);
      const name = WPLACE_NAMES[key] || key;
      const item = document.createElement('div');
      item.className = 'op-color-list-item' + (isPremium ? ' premium' : '');
      item.title = `${name} (${key}): ${count} pixels`;
      item.innerHTML = `
        <div class="op-color-list-swatch" style="background-color: rgb(${key});"></div>
        <div class="op-color-list-name">${name}</div>
        <div class="op-color-list-count">${count}</div>
      `;
      listEl.appendChild(item);
    }
  }

  function renderPaletteGrid() {
    cc.freeGrid.innerHTML = '';
    cc.paidGrid.innerHTML = '';

    for (const [r,g,b] of WPLACE_FREE) {
      const key = `${r},${g},${b}`;
      const cell = document.createElement('div');
      cell.className = 'op-cc-cell';
      cell.style.background = `rgb(${r},${g},${b})`;
      cell.title = WPLACE_NAMES[key] || key;
      cell.dataset.key = key;
      cell.dataset.type = 'free';
      if (cc.selectedFree.has(key)) cell.classList.add('active');
      cell.addEventListener('click', async () => {
        if (cc.selectedFree.has(key)) cc.selectedFree.delete(key); else cc.selectedFree.add(key);
        cell.classList.toggle('active', cc.selectedFree.has(key));
        config.ccFreeKeys = Array.from(cc.selectedFree); await saveConfig(['ccFreeKeys']);
        if (cc.realtime) processImage(); else { cc.isStale = true; }
        applyPreview(); updateMeta(); updateMasterButtons();
      });
      cc.freeGrid.appendChild(cell);
    }

    for (const [r,g,b] of WPLACE_PAID) {
      const key = `${r},${g},${b}`;
      const cell = document.createElement('div');
      cell.className = 'op-cc-cell';
      cell.style.background = `rgb(${r},${g},${b})`;
      cell.title = WPLACE_NAMES[key] || key;
      cell.dataset.key = key;
      cell.dataset.type = 'paid';
      if (cc.selectedPaid.has(key)) cell.classList.add('active');
      cell.addEventListener('click', async () => {
        if (cc.selectedPaid.has(key)) cc.selectedPaid.delete(key); else cc.selectedPaid.add(key);
        cell.classList.toggle('active', cc.selectedPaid.has(key));
        config.ccPaidKeys = Array.from(cc.selectedPaid); await saveConfig(['ccPaidKeys']);
        if (cc.realtime) processImage(); else { cc.isStale = true; }
        applyPreview(); updateMeta(); updateMasterButtons();
      });
      cc.paidGrid.appendChild(cell);
    }

    updateMasterButtons();
  }

  function updateMasterButtons() {
    cc.freeToggle.textContent = isAllFreeActive() ? 'Unselect All' : 'Select All';
    cc.paidToggle.textContent = isAllPaidActive() ? 'Unselect All' : 'Select All';
  }
  function isAllFreeActive() { return DEFAULT_FREE_KEYS.every(k => cc.selectedFree.has(k)); }
  function isAllPaidActive() {
    const allPaidKeys = WPLACE_PAID.map(([r,g,b]) => `${r},${g},${b}`);
    return allPaidKeys.every(k => cc.selectedPaid.has(k)) && allPaidKeys.length > 0;
  }
  function setAllActive(type, active) {
    if (type === 'free') {
      const keys = DEFAULT_FREE_KEYS;
      if (active) keys.forEach(k => cc.selectedFree.add(k)); else cc.selectedFree.clear();
      cc.freeGrid.querySelectorAll('.op-cc-cell').forEach(cell => cell.classList.toggle('active', active));
    } else {
      const keys = WPLACE_PAID.map(([r,g,b]) => `${r},${g},${b}`);
      if (active) keys.forEach(k => cc.selectedPaid.add(k)); else cc.selectedPaid.clear();
      cc.paidGrid.querySelectorAll('.op-cc-cell').forEach(cell => cell.classList.toggle('active', active));
    }
  }

  let rs = null;

  function buildRSModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'op-rs-backdrop';
    backdrop.id = 'op-rs-backdrop';
    document.body.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.className = 'op-rs-modal';
    modal.id = 'op-rs-modal';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="op-rs-header" id="op-rs-header">
        <div class="op-rs-title">Resize Overlay</div>
        <button class="op-rs-close" id="op-rs-close" title="Close">✕</button>
      </div>

      <div class="op-rs-tabs">
        <button class="op-rs-tab-btn active" id="op-rs-tab-simple">Simple</button>
        <button class="op-rs-tab-btn" id="op-rs-tab-advanced">Advanced (grid)</button>
      </div>

      <div class="op-rs-body">
        <div class="op-rs-pane show" id="op-rs-pane-simple">
          <div class="op-rs-row">
            <label style="width:110px;">Original</label>
            <input type="text" class="op-input" id="op-rs-orig" disabled>
          </div>
          <div class="op-rs-row">
            <label style="width:110px;">Width</label>
            <input type="number" min="1" step="1" class="op-input" id="op-rs-w">
          </div>
          <div class="op-rs-row">
            <label style="width:110px;">Height</label>
            <input type="number" min="1" step="1" class="op-input" id="op-rs-h">
          </div>
          <div class="op-rs-row">
            <input type="checkbox" id="op-rs-lock" checked>
            <label for="op-rs-lock">Lock aspect ratio</label>
          </div>
          <div class="op-rs-row" style="gap:6px; flex-wrap:wrap;">
            <label style="width:110px;">Quick</label>
            <button class="op-button" id="op-rs-double">2x</button>
            <button class="op-button" id="op-rs-onex">1x</button>
            <button class="op-button" id="op-rs-half">0.5x</button>
            <button class="op-button" id="op-rs-third">0.33x</button>
            <button class="op-button" id="op-rs-quarter">0.25x</button>
          </div>
          <div class="op-rs-row">
            <label style="width:110px;">Scale factor</label>
            <input type="number" step="0.01" min="0.01" class="op-input" id="op-rs-scale" placeholder="e.g. 0.5">
            <button class="op-button" id="op-rs-apply-scale">Apply</button>
          </div>

          <div class="op-rs-preview-wrap" id="op-rs-sim-wrap">
            <div class="op-rs-dual">
              <div class="op-rs-col" id="op-rs-col-left">
                <div class="label">Original</div>
                <div class="pad-top"></div>
                <canvas id="op-rs-sim-orig" class="op-rs-canvas op-rs-thumb"></canvas>
              </div>
              <div class="op-rs-col" id="op-rs-col-right">
                <div class="label">Result (downscale → upscale preview)</div>
                <div class="pad-top"></div>
                <canvas id="op-rs-sim-new" class="op-rs-canvas op-rs-thumb"></canvas>
              </div>
            </div>
          </div>
        </div>

        <div class="op-rs-pane" id="op-rs-pane-advanced">
          <div class="op-rs-preview-wrap op-pan-grab" id="op-rs-adv-wrap">
            <canvas id="op-rs-preview" class="op-rs-canvas"></canvas>
            <div class="op-rs-zoom">
              <button class="op-icon-btn" id="op-rs-zoom-out" title="Zoom out">−</button>
              <button class="op-icon-btn" id="op-rs-zoom-in" title="Zoom in">+</button>
            </div>
          </div>

          <div class="op-rs-row" style="margin-top:8px;">
            <label style="width:160px;">Multiplier</label>
            <input type="range" id="op-rs-mult-range" min="1" max="64" step="0.1" style="flex:1;">
            <input type="number" id="op-rs-mult-input" class="op-input op-rs-mini" min="1" step="0.05">
          </div>

          <div class="op-rs-row">
            <input type="checkbox" id="op-rs-bind" checked>
            <label for="op-rs-bind">Bind X/Y block sizes</label>
          </div>

          <div class="op-rs-row">
            <label style="width:160px;">Block W / H</label>
            <input type="number" id="op-rs-blockw" class="op-input op-rs-mini" min="1" step="0.1">
            <input type="number" id="op-rs-blockh" class="op-input op-rs-mini" min="1" step="0.1">
          </div>

          <div class="op-rs-row">
            <label style="width:160px;">Offset X / Y</label>
            <input type="number" id="op-rs-offx" class="op-input op-rs-mini" min="0" step="0.1">
            <input type="number" id="op-rs-offy" class="op-input op-rs-mini" min="0" step="0.1">
          </div>

          <div class="op-rs-row">
            <label style="width:160px;">Dot radius</label>
            <input type="range" id="op-rs-dotr" min="1" max="8" step="1" style="flex:1;">
            <span id="op-rs-dotr-val" class="op-muted" style="width:36px; text-align:right;"></span>
          </div>

          <div class="op-rs-row">
            <input type="checkbox" id="op-rs-grid" checked>
            <label for="op-rs-grid">Show grid wireframe</label>
          </div>

          <div class="op-rs-grid-note" id="op-rs-adv-note">Align red dots to block centers. Drag to pan; use buttons or Ctrl+wheel to zoom.</div>

          <div class="op-rs-row" style="margin-top:8px;">
            <label style="width:160px;">Calculated preview</label>
            <span class="op-muted" id="op-rs-adv-resmeta"></span>
          </div>
          <div class="op-rs-preview-wrap" id="op-rs-adv-result-wrap" style="height: clamp(200px, 26vh, 420px);">
            <canvas id="op-rs-adv-result" class="op-rs-canvas"></canvas>
          </div>
        </div>
      </div>

      <div class="op-rs-footer">
        <div class="op-cc-ghost" id="op-rs-meta">Nearest-neighbor OR grid center sampling; alpha hardened (no semi-transparent pixels).</div>
        <div class="op-cc-actions">
          <button class="op-button" id="op-rs-calc">Calculate</button>
          <button class="op-button" id="op-rs-apply">Apply</button>
          <button class="op-button" id="op-rs-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const els = {
      backdrop,
      modal,
      tabSimple: modal.querySelector('#op-rs-tab-simple'),
      tabAdvanced: modal.querySelector('#op-rs-tab-advanced'),
      paneSimple: modal.querySelector('#op-rs-pane-simple'),
      paneAdvanced: modal.querySelector('#op-rs-pane-advanced'),
      orig: modal.querySelector('#op-rs-orig'),
      w: modal.querySelector('#op-rs-w'),
      h: modal.querySelector('#op-rs-h'),
      lock: modal.querySelector('#op-rs-lock'),
      note: modal.querySelector('#op-rs-note'),
      onex: modal.querySelector('#op-rs-onex'),
      half: modal.querySelector('#op-rs-half'),
      third: modal.querySelector('#op-rs-third'),
      quarter: modal.querySelector('#op-rs-quarter'),
      double: modal.querySelector('#op-rs-double'),
      scale: modal.querySelector('#op-rs-scale'),
      applyScale: modal.querySelector('#op-rs-apply-scale'),
      simWrap: modal.querySelector('#op-rs-sim-wrap'),
      simOrig: modal.querySelector('#op-rs-sim-orig'),
      simNew: modal.querySelector('#op-rs-sim-new'),
      colLeft: modal.querySelector('#op-rs-col-left'),
      colRight: modal.querySelector('#op-rs-col-right'),
      advWrap: modal.querySelector('#op-rs-adv-wrap'),
      preview: modal.querySelector('#op-rs-preview'),
      meta: modal.querySelector('#op-rs-meta'),
      zoomIn: modal.querySelector('#op-rs-zoom-in'),
      zoomOut: modal.querySelector('#op-rs-zoom-out'),
      multRange: modal.querySelector('#op-rs-mult-range'),
      multInput: modal.querySelector('#op-rs-mult-input'),
      bind: modal.querySelector('#op-rs-bind'),
      blockW: modal.querySelector('#op-rs-blockw'),
      blockH: modal.querySelector('#op-rs-blockh'),
      offX: modal.querySelector('#op-rs-offx'),
      offY: modal.querySelector('#op-rs-offy'),
      dotR: modal.querySelector('#op-rs-dotr'),
      dotRVal: modal.querySelector('#op-rs-dotr-val'),
      gridToggle: modal.querySelector('#op-rs-grid'),
      advNote: modal.querySelector('#op-rs-adv-note'),
      resWrap: modal.querySelector('#op-rs-adv-result-wrap'),
      resCanvas: modal.querySelector('#op-rs-adv-result'),
      resMeta: modal.querySelector('#op-rs-adv-resmeta'),
      calcBtn: modal.querySelector('#op-rs-calc'),
      applyBtn: modal.querySelector('#op-rs-apply'),
      cancelBtn: modal.querySelector('#op-rs-cancel'),
      closeBtn: modal.querySelector('#op-rs-close'),
    };

    const ctxPrev = els.preview.getContext('2d', { willReadFrequently: true });
    const ctxSimOrig = els.simOrig.getContext('2d', { willReadFrequently: true });
    const ctxSimNew = els.simNew.getContext('2d', { willReadFrequently: true });
    const ctxRes = els.resCanvas.getContext('2d', { willReadFrequently: true });

    rs = {
      ...els,
      ov: null,
      img: null,
      origW: 0, origH: 0,
      mode: 'simple',
      zoom: 1.0,
      updating: false,

      mult: 4,
      gapX: 4, gapY: 4,
      offx: 0, offy: 0,
      dotr: 1,

      viewX: 0, viewY: 0,

      panning: false,
      panStart: null,

      calcCanvas: null,
      calcCols: 0,
      calcRows: 0,
      calcReady: false,
    };

    const computeSimpleFooterText = () => {
      const W = parseInt(rs.w.value||'0',10);
      const H = parseInt(rs.h.value||'0',10);
      const ok = Number.isFinite(W) && Number.isFinite(H) && W>0 && H>0;
      const limit = (W >= MAX_OVERLAY_DIM || H >= MAX_OVERLAY_DIM);
      return ok ? (limit ? `Target: ${W}×${H} (exceeds limit: must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})`
                         : `Target: ${W}×${H} (OK)`)
                : 'Enter positive width and height.';
    };
    const sampleDims = () => {
      const cols = Math.floor((rs.origW - rs.offx) / rs.gapX);
      const rows = Math.floor((rs.origH - rs.offy) / rs.gapY);
      return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
    };
    const computeAdvancedFooterText = () => {
      const { cols, rows } = sampleDims();
      const limit = (cols >= MAX_OVERLAY_DIM || rows >= MAX_OVERLAY_DIM);
      return (cols>0 && rows>0)
        ? `Samples: ${cols} × ${rows} | Output: ${cols}×${rows}${limit ? ` (exceeds limit: < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})` : ''}`
        : 'Adjust multiplier/offset until dots sit at centers.';
    };
    const updateFooterMeta = () => {
      rs.meta.textContent = (rs.mode === 'advanced') ? computeAdvancedFooterText() : computeSimpleFooterText();
    };

    const syncSimpleNote = () => {
      const W = parseInt(rs.w.value||'0',10);
      const H = parseInt(rs.h.value||'0',10);
      const ok = Number.isFinite(W) && Number.isFinite(H) && W>0 && H>0;
      const limit = (W >= MAX_OVERLAY_DIM || H >= MAX_OVERLAY_DIM);
      const simpleText = ok
        ? (limit ? `Target: ${W}×${H} (exceeds limit: must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})`
                 : `Target: ${W}×${H} (OK)`)
        : 'Enter positive width and height.';
      if (rs.note) rs.note.textContent = simpleText;
      if (rs.mode === 'simple') rs.applyBtn.disabled = (!ok || limit);
      if (rs.mode === 'simple') rs.meta.textContent = simpleText;
    };
    function applyScaleToFields(scale) {
      const W = Math.max(1, Math.round(rs.origW * scale));
      const H = Math.max(1, Math.round(rs.origH * scale));
      rs.updating = true;
      rs.w.value = W;
      rs.h.value = rs.lock.checked ? Math.max(1, Math.round(W * rs.origH / rs.origW)) : H;
      rs.updating = false;
      syncSimpleNote();
    }
    function drawSimplePreview() {
      if (!rs.img) return;

      const leftLabelH = rs.colLeft.querySelector('.pad-top').offsetHeight;
      const rightLabelH = rs.colRight.querySelector('.pad-top').offsetHeight;
      const leftW = rs.colLeft.clientWidth;
      const rightW = rs.colRight.clientWidth;
      const leftH = rs.colLeft.clientHeight - leftLabelH;
      const rightH = rs.colRight.clientHeight - rightLabelH;

      rs.simOrig.width = leftW; rs.simOrig.height = leftH;
      rs.simNew.width  = rightW; rs.simNew.height = rightH;

      ctxSimOrig.save();
      ctxSimOrig.imageSmoothingEnabled = false;
      ctxSimOrig.clearRect(0,0,leftW,leftH);
      const sFit = Math.min(leftW / rs.origW, leftH / rs.origH);
      const dW = Math.max(1, Math.floor(rs.origW * sFit));
      const dH = Math.max(1, Math.floor(rs.origH * sFit));
      const dx0 = Math.floor((leftW - dW) / 2);
      const dy0 = Math.floor((leftH - dH) / 2);
      ctxSimOrig.drawImage(rs.img, 0,0, rs.origW,rs.origH, dx0,dy0, dW,dH);
      ctxSimOrig.restore();

      const W = parseInt(rs.w.value||'0',10);
      const H = parseInt(rs.h.value||'0',10);
      ctxSimNew.save();
      ctxSimNew.imageSmoothingEnabled = false;
      ctxSimNew.clearRect(0,0,rightW,rightH);
      if (Number.isFinite(W) && Number.isFinite(H) && W>0 && H>0) {
        const tiny = createCanvas(W, H);
        const tctx = tiny.getContext('2d', { willReadFrequently: true });
        tctx.imageSmoothingEnabled = false;
        tctx.clearRect(0,0,W,H);
        tctx.drawImage(rs.img, 0,0, rs.origW,rs.origH, 0,0, W,H);
        const id = tctx.getImageData(0,0,W,H);
        const data = id.data;
        for (let i=0;i<data.length;i+=4) { if (data[i+3] !== 0) data[i+3]=255; }
        tctx.putImageData(id, 0, 0);

        const s2 = Math.min(rightW / W, rightH / H);
        const dW2 = Math.max(1, Math.floor(W * s2));
        const dH2 = Math.max(1, Math.floor(H * s2));
        const dx2 = Math.floor((rightW - dW2)/2);
        const dy2 = Math.floor((rightH - dH2)/2);
        ctxSimNew.drawImage(tiny, 0,0, W,H, dx2,dy2, dW2,dH2);
      } else {
        ctxSimNew.drawImage(rs.img, 0,0, rs.origW,rs.origH, dx0,dy0, dW,dH);
      }
      ctxSimNew.restore();
    }

    const syncAdvFieldsToState = () => {
      rs.updating = true;
      rs.multRange.value = String(rs.mult);
      rs.multInput.value = String(rs.mult);
      rs.blockW.value = String(rs.gapX);
      rs.blockH.value = String(rs.gapY);
      rs.offX.value = String(rs.offx);
      rs.offY.value = String(rs.offy);
      rs.dotR.value = String(rs.dotr);
      rs.dotRVal.textContent = String(rs.dotr);
      rs.updating = false;
    };
    function syncAdvancedMeta() {
      const { cols, rows } = sampleDims();
      const limit = (cols >= MAX_OVERLAY_DIM || rows >= MAX_OVERLAY_DIM);

      if (rs.mode === 'advanced') {
        rs.applyBtn.disabled = !rs.calcReady;
      } else {
        const W = parseInt(rs.w.value||'0',10), H = parseInt(rs.h.value||'0',10);
        const ok = Number.isFinite(W)&&Number.isFinite(H)&&W>0&&H>0&&W<MAX_OVERLAY_DIM&&H<MAX_OVERLAY_DIM;
        rs.applyBtn.disabled = !ok;
      }
      updateFooterMeta();
    }
    function drawAdvancedPreview() {
      if (rs.mode !== 'advanced' || !rs.img) return;
      const w = rs.origW, h = rs.origH;

      const destW = Math.max(50, Math.floor(rs.advWrap.clientWidth));
      const destH = Math.max(50, Math.floor(rs.advWrap.clientHeight));
      rs.preview.width = destW;
      rs.preview.height = destH;

      const sw = Math.max(1, Math.floor(destW / rs.zoom));
      const sh = Math.max(1, Math.floor(destH / rs.zoom));
      const maxX = Math.max(0, w - sw);
      const maxY = Math.max(0, h - sh);
      rs.viewX = Math.min(Math.max(0, rs.viewX), maxX);
      rs.viewY = Math.min(Math.max(0, rs.viewY), maxY);

      ctxPrev.save();
      ctxPrev.imageSmoothingEnabled = false;
      ctxPrev.clearRect(0,0,destW,destH);
      ctxPrev.drawImage(rs.img, rs.viewX, rs.viewY, sw, sh, 0, 0, destW, destH);

      if (rs.gridToggle.checked && rs.gapX >= 1 && rs.gapY >= 1) {
        ctxPrev.strokeStyle = 'rgba(255,59,48,0.45)';
        ctxPrev.lineWidth = 1;
        const startGX = Math.ceil((rs.viewX - rs.offx) / rs.gapX);
        const endGX   = Math.floor((rs.viewX + sw - rs.offx) / rs.gapX);
        const startGY = Math.ceil((rs.viewY - rs.offy) / rs.gapY);
        const endGY   = Math.floor((rs.viewY + sh - rs.offy) / rs.gapY);
        const linesX = Math.max(0, endGX - startGX + 1);
        const linesY = Math.max(0, endGY - startGY + 1);
        if (linesX <= 4000 && linesY <= 4000) {
          ctxPrev.beginPath();
          for (let gx = startGX; gx <= endGX; gx++) {
            const x = rs.offx + gx * rs.gapX;
            const px = Math.round((x - rs.viewX) * rs.zoom);
            ctxPrev.moveTo(px + 0.5, 0);
            ctxPrev.lineTo(px + 0.5, destH);
          }
          for (let gy = startGY; gy <= endGY; gy++) {
            const y = rs.offy + gy * rs.gapY;
            const py = Math.round((y - rs.viewY) * rs.zoom);
            ctxPrev.moveTo(0, py + 0.5);
            ctxPrev.lineTo(destW, py + 0.5);
          }
          ctxPrev.stroke();
        }
      }

      if (rs.gapX >= 1 && rs.gapY >= 1) {
        ctxPrev.fillStyle = '#ff3b30';
        const cx0 = rs.offx + Math.floor(rs.gapX/2);
        const cy0 = rs.offy + Math.floor(rs.gapY/2);
        if (cx0 >= 0 && cy0 >= 0) {
          const startX = Math.ceil((rs.viewX - cx0) / rs.gapX);
          const startY = Math.ceil((rs.viewY - cy0) / rs.gapY);
          const endY = Math.floor((rs.viewY + sh - 1 - cy0) / rs.gapY);
          const endX2 = Math.floor((rs.viewX + sw - 1 - cx0) / rs.gapX);
          const r = rs.dotr;
          const dotsX = Math.max(0, endX2 - startX + 1);
          const dotsY = Math.max(0, endY - startY + 1);
          const maxDots = 300000;
          if (dotsX * dotsY <= maxDots) {
            for (let gy = startY; gy <= endY; gy++) {
              const y = cy0 + gy * rs.gapY;
              for (let gx = startX; gx <= endX2; gx++) {
                const x = cx0 + gx * rs.gapX;
                const px = Math.round((x - rs.viewX) * rs.zoom);
                const py = Math.round((y - rs.viewY) * rs.zoom);
                ctxPrev.beginPath();
                ctxPrev.arc(px, py, r, 0, Math.PI*2);
                ctxPrev.fill();
              }
            }
          }
        }
      }
      ctxPrev.restore();
    }

    function drawAdvancedResultPreview() {
      const canvas = rs.calcCanvas;
      const wrap = rs.resWrap;
      if (!wrap || !canvas) {
        ctxRes.clearRect(0,0, rs.resCanvas.width, rs.resCanvas.height);
        rs.resMeta.textContent = 'No result. Click Calculate.';
        return;
      }
      const W = canvas.width, H = canvas.height;
      const availW = Math.max(50, Math.floor(wrap.clientWidth - 16));
      const availH = Math.max(50, Math.floor(wrap.clientHeight - 16));
      const s = Math.min(availW / W, availH / H);
      const dW = Math.max(1, Math.floor(W * s));
      const dH = Math.max(1, Math.floor(H * s));
      rs.resCanvas.width = dW;
      rs.resCanvas.height = dH;
      ctxRes.save();
      ctxRes.imageSmoothingEnabled = false;
      ctxRes.clearRect(0,0,dW,dH);
      ctxRes.drawImage(canvas, 0,0, W,H, 0,0, dW,dH);
      ctxRes.restore();
      rs.resMeta.textContent = `Output: ${W}×${H}${(W>=MAX_OVERLAY_DIM||H>=MAX_OVERLAY_DIM) ? ` (exceeds limit: < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})` : ''}`;
    }

    rs._drawSimplePreview = drawSimplePreview;
    rs._drawAdvancedPreview = drawAdvancedPreview;
    rs._drawAdvancedResultPreview = drawAdvancedResultPreview;

    const setMode = (m) => {
      rs.mode = m;
      rs.tabSimple.classList.toggle('active', m === 'simple');
      rs.tabAdvanced.classList.toggle('active', m === 'advanced');
      rs.paneSimple.classList.toggle('show', m === 'simple');
      rs.paneAdvanced.classList.toggle('show', m === 'advanced');
      updateFooterMeta();

      rs.calcBtn.style.display = (m === 'advanced') ? 'inline-block' : 'none';
      if (m === 'advanced') {
        rs.applyBtn.disabled = !rs.calcReady;
      } else {
        syncSimpleNote();
      }

      syncAdvancedMeta();
      if (m === 'advanced') {
        drawAdvancedPreview();
        drawAdvancedResultPreview();
      } else {
        drawSimplePreview();
      }
    };
    rs.tabSimple.addEventListener('click', () => setMode('simple'));
    rs.tabAdvanced.addEventListener('click', () => setMode('advanced'));

    const onWidthInput = () => {
      if (rs.updating) return;
      rs.updating = true;
      const W = parseInt(rs.w.value||'0',10);
      if (rs.lock.checked && rs.origW>0 && rs.origH>0 && W>0) {
        rs.h.value = Math.max(1, Math.round(W * rs.origH / rs.origW));
      }
      rs.updating = false;
      syncSimpleNote();
      if (rs.mode === 'simple') drawSimplePreview();
    };
    const onHeightInput = () => {
      if (rs.updating) return;
      rs.updating = true;
      const H = parseInt(rs.h.value||'0',10);
      if (rs.lock.checked && rs.origW>0 && rs.origH>0 && H>0) {
        rs.w.value = Math.max(1, Math.round(H * rs.origW / rs.origH));
      }
      rs.updating = false;
      syncSimpleNote();
      if (rs.mode === 'simple') drawSimplePreview();
    };
    rs.w.addEventListener('input', onWidthInput);
    rs.h.addEventListener('input', onHeightInput);
    rs.onex.addEventListener('click', () => { applyScaleToFields(1); drawSimplePreview(); });
    rs.half.addEventListener('click', () => { applyScaleToFields(0.5); drawSimplePreview(); });
    rs.third.addEventListener('click', () => { applyScaleToFields(1/3); drawSimplePreview(); });
    rs.quarter.addEventListener('click', () => { applyScaleToFields(1/4); drawSimplePreview(); });
    rs.double.addEventListener('click', () => { applyScaleToFields(2); drawSimplePreview(); });
    rs.applyScale.addEventListener('click', () => {
      const s = parseFloat(rs.scale.value||'');
      if (!Number.isFinite(s) || s<=0) { showToast('Enter a valid scale factor > 0'); return; }
      applyScaleToFields(s);
      drawSimplePreview();
    });

    const markCalcStale = () => {
      if (rs.mode === 'advanced') {
        rs.calcReady = false;
        rs.applyBtn.disabled = true;
        drawAdvancedResultPreview();
        updateFooterMeta();
      }
    };

    const onMultChange = (v) => {
      if (rs.updating) return;
      const parsed = parseFloat(v);
      if (!Number.isFinite(parsed)) return;
      const clamped = Math.min(Math.max(parsed, 1), 128);
      rs.mult = clamped;
      if (rs.bind.checked) { rs.gapX = clamped; rs.gapY = clamped; }
      syncAdvFieldsToState();
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    };
    rs.multRange.addEventListener('input', (e) => { if (rs.updating) return; onMultChange(e.target.value); });
    rs.multInput.addEventListener('input', (e) => {
      if (rs.updating) return;
      const v = e.target.value;
      if (!Number.isFinite(parseFloat(v))) return;
      onMultChange(v);
    });
    rs.bind.addEventListener('change', () => {
      if (rs.bind.checked) { rs.gapX = rs.mult; rs.gapY = rs.mult; syncAdvFieldsToState(); }
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    });
    rs.blockW.addEventListener('input', (e) => {
      if (rs.updating) return;
      const raw = e.target.value;
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) return;
      rs.gapX = Math.min(Math.max(val, 1), 4096);
      if (rs.bind.checked) { rs.mult = rs.gapX; rs.gapY = rs.gapX; }
      syncAdvFieldsToState();
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    });
    rs.blockH.addEventListener('input', (e) => {
      if (rs.updating) return;
      const raw = e.target.value;
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) return;
      rs.gapY = Math.min(Math.max(val, 1), 4096);
      if (rs.bind.checked) { rs.mult = rs.gapY; rs.gapX = rs.gapY; }
      syncAdvFieldsToState();
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    });
    rs.offX.addEventListener('input', (e) => {
      const raw = e.target.value;
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) return;
      rs.offx = Math.min(Math.max(val, 0), Math.max(0, rs.origH-0.0001));
      rs.viewX = Math.min(rs.viewX, Math.max(0, rs.origW - 1));
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    });
    rs.offY.addEventListener('input', (e) => {
      const raw = e.target.value;
      const val = parseFloat(raw);
      if (!Number.isFinite(val)) return;
      rs.offy = Math.min(Math.max(val, 0), Math.max(0, rs.origH-0.0001));
      rs.viewY = Math.min(rs.viewY, Math.max(0, rs.origH - 1));
      syncAdvancedMeta();
      drawAdvancedPreview();
      markCalcStale();
    });
    rs.dotR.addEventListener('input', (e) => {
      rs.dotr = Math.max(1, Math.round(Number(e.target.value)||1));
      rs.dotRVal.textContent = String(rs.dotr);
      drawAdvancedPreview();
    });
    rs.gridToggle.addEventListener('change', drawAdvancedPreview);

    const applyZoom = (factor) => {
      const destW = Math.max(50, Math.floor(rs.advWrap.clientWidth));
      const destH = Math.max(50, Math.floor(rs.advWrap.clientHeight));
      const sw = Math.max(1, Math.floor(destW / rs.zoom));
      const sh = Math.max(1, Math.floor(destH / rs.zoom));
      const cx = rs.viewX + sw / 2;
      const cy = rs.viewY + sh / 2;
      rs.zoom = Math.min(32, Math.max(0.1, rs.zoom * factor));
      const sw2 = Math.max(1, Math.floor(destW / rs.zoom));
      const sh2 = Math.max(1, Math.floor(destH / rs.zoom));
      rs.viewX = Math.min(Math.max(0, Math.round(cx - sw2 / 2)), Math.max(0, rs.origW - sw2));
      rs.viewY = Math.min(Math.max(0, Math.round(cy - sh2 / 2)), Math.max(0, rs.origH - sh2));
      drawAdvancedPreview();
    };
    rs.zoomIn.addEventListener('click', () => applyZoom(1.25));
    rs.zoomOut.addEventListener('click', () => applyZoom(1/1.25));
    rs.advWrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY || 0;
      applyZoom(delta > 0 ? 1/1.15 : 1.15);
    }, { passive: false });

    const onPanDown = (e) => {
      if (e.target.closest('.op-rs-zoom')) return;
      rs.panning = true;
      rs.panStart = { x: e.clientX, y: e.clientY, viewX: rs.viewX, viewY: rs.viewY };
      rs.advWrap.classList.remove('op-pan-grab');
      rs.advWrap.classList.add('op-pan-grabbing');
      rs.advWrap.setPointerCapture?.(e.pointerId);
    };
    const onPanMove = (e) => {
      if (!rs.panning) return;
      const dx = e.clientX - rs.panStart.x;
      const dy = e.clientY - rs.panStart.y;
      const wrapW = rs.advWrap.clientWidth;
      const wrapH = rs.advWrap.clientHeight;
      const sw = Math.max(1, Math.floor(wrapW / rs.zoom));
      const sh = Math.max(1, Math.floor(wrapH / rs.zoom));
      let nx = rs.panStart.viewX - Math.round(dx / rs.zoom);
      let ny = rs.panStart.viewY - Math.round(dy / rs.zoom);
      nx = Math.min(Math.max(0, nx), Math.max(0, rs.origW - sw));
      ny = Math.min(Math.max(0, ny), Math.max(0, rs.origH - sh));
      rs.viewX = nx;
      rs.viewY = ny;
      drawAdvancedPreview();
    };
    const onPanUp = (e) => {
      if (!rs.panning) return;
      rs.panning = false;
      rs.panStart = null;
      rs.advWrap.classList.remove('op-pan-grabbing');
      rs.advWrap.classList.add('op-pan-grab');
      rs.advWrap.releasePointerCapture?.(e.pointerId);
    };
    rs.advWrap.addEventListener('pointerdown', onPanDown);
    rs.advWrap.addEventListener('pointermove', onPanMove);
    rs.advWrap.addEventListener('pointerup', onPanUp);
    rs.advWrap.addEventListener('pointercancel', onPanUp);
    rs.advWrap.addEventListener('pointerleave', onPanUp);

    const close = () => closeRSModal();
    rs.cancelBtn.addEventListener('click', close);
    rs.closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    rs.calcBtn.addEventListener('click', async () => {
      if (rs.mode !== 'advanced') return;
      try {
        const { cols, rows } = sampleDims();
        if (cols<=0 || rows<=0) { showToast('No samples. Adjust multiplier/offset.'); return; }
        if (cols >= MAX_OVERLAY_DIM || rows >= MAX_OVERLAY_DIM) { showToast(`Output too large. Must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM}.`); return; }
        const canvas = await reconstructViaGrid(rs.img, rs.origW, rs.origH, rs.offx, rs.offy, rs.gapX, rs.gapY);
        rs.calcCanvas = canvas;
        rs.calcCols = cols;
        rs.calcRows = rows;
        rs.calcReady = true;
        rs.applyBtn.disabled = false;
        drawAdvancedResultPreview();
        updateFooterMeta();
        showToast(`Calculated ${cols}×${rows}. Review preview, then Apply.`);
      } catch (e) {
        console.error(e);
        showToast('Calculation failed.');
      }
    });

    rs.applyBtn.addEventListener('click', async () => {
      if (!rs.ov) return;
      try {
        if (rs.mode === 'simple') {
          const W = parseInt(rs.w.value||'0',10);
          const H = parseInt(rs.h.value||'0',10);
          if (!Number.isFinite(W) || !Number.isFinite(H) || W<=0 || H<=0) { showToast('Invalid dimensions'); return; }
          if (W >= MAX_OVERLAY_DIM || H >= MAX_OVERLAY_DIM) { showToast(`Too large. Must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM}.`); return; }
          await resizeOverlayImage(rs.ov, W, H);
          closeRSModal();
          showToast(`Resized to ${W}×${H}.`);
        } else {
          if (!rs.calcReady || !rs.calcCanvas) { showToast('Calculate first.'); return; }
          const dataUrl = await canvasToDataURLSafe(rs.calcCanvas);
          rs.ov.imageBase64 = dataUrl;
          rs.ov.imageUrl = null;
          rs.ov.isLocal = true;
          await saveConfig(['overlays']);
          clearOverlayCache();
          ensureHook();
          updateUI();
          closeRSModal();
          showToast(`Applied ${rs.calcCols}×${rs.calcRows}.`);
        }
      } catch (e) {
        console.error(e);
        showToast('Apply failed.');
      }
    });

    rs._syncAdvancedMeta = syncAdvancedMeta;
    rs._syncSimpleNote = syncSimpleNote;

    rs._setMode = (m) => {
      const evt = new Event('click');
      (m === 'simple' ? rs.tabSimple : rs.tabAdvanced).dispatchEvent(evt);
    };
  }

  function openRSModal(overlay) {
    if (!rs) return;
    rs.ov = overlay;

    const img = new Image();
    img.onload = () => {
      rs.img = img;
      rs.origW = img.width; rs.origH = img.height;

      rs.orig.value = `${rs.origW}×${rs.origH}`;
      rs.w.value = String(rs.origW);
      rs.h.value = String(rs.origH);
      rs.lock.checked = true;

      rs.zoom = 1.0;
      rs.mult = 4;
      rs.gapX = 4; rs.gapY = 4;
      rs.offx = 0; rs.offy = 0;
      rs.dotr = 1;
      rs.viewX = 0; rs.viewY = 0;

      rs.bind.checked = true;
      rs.multRange.value = '4';
      rs.multInput.value = '4';
      rs.blockW.value = '4';
      rs.blockH.value = '4';
      rs.offX.value = '0';
      rs.offY.value = '0';
      rs.dotR.value = '1';
      rs.dotRVal.textContent = '1';
      rs.gridToggle.checked = true;

      rs.calcCanvas = null;
      rs.calcCols = 0;
      rs.calcRows = 0;
      rs.calcReady = false;
      rs.applyBtn.disabled = (rs.mode === 'advanced');

      rs._setMode('simple');

      document.body.classList.add('op-scroll-lock');
      rs.backdrop.classList.add('show');
      rs.modal.style.display = 'flex';

      rs._drawSimplePreview?.();
      rs._drawAdvancedPreview?.();
      rs._drawAdvancedResultPreview?.();
      rs._syncAdvancedMeta?.();
      rs._syncSimpleNote?.();

      const setFooterNow = () => {
        if (rs.mode === 'advanced') {
          const { cols, rows } = (function(){ const x = Math.floor((rs.origW - rs.offx) / rs.gapX); const y = Math.floor((rs.origH - rs.offy) / rs.gapY); return { cols: Math.max(0,x), rows: Math.max(0,y) };})();
          rs.meta.textContent = (cols>0&&rows>0) ? `Samples: ${cols} × ${rows} | Output: ${cols}×${rows}${(cols>=MAX_OVERLAY_DIM||rows>=MAX_OVERLAY_DIM)?` (exceeds limit: < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})`:''}` : 'Adjust multiplier/offset until dots sit at centers.';
        } else {
          const W = parseInt(rs.w.value||'0',10); const H = parseInt(rs.h.value||'0',10);
          const ok = Number.isFinite(W)&&Number.isFinite(H)&&W>0&&H>0;
          const limit = (W>=MAX_OVERLAY_DIM||H>=MAX_OVERLAY_DIM);
          rs.meta.textContent = ok ? (limit ? `Target: ${W}×${H} (exceeds limit: must be < ${MAX_OVERLAY_DIM}×${MAX_OVERLAY_DIM})` : `Target: ${W}×${H} (OK)`) : 'Enter positive width and height.';
        }
      };
      setFooterNow();

      const onResize = () => {
        if (rs.mode === 'simple') rs._drawSimplePreview?.();
        else {
          rs._drawAdvancedPreview?.();
          rs._drawAdvancedResultPreview?.();
        }
      };
      rs._resizeHandler = onResize;
      window.addEventListener('resize', onResize);
    };
    img.src = overlay.imageBase64;
  }

  function closeRSModal() {
    if (!rs) return;
    window.removeEventListener('resize', rs._resizeHandler || (()=>{}));
    rs.backdrop.classList.remove('show');
    rs.modal.style.display = 'none';
    rs.ov = null;
    rs.img = null;
    document.body.classList.remove('op-scroll-lock');
  }

  async function resizeOverlayImage(ov, targetW, targetH) {
    const img = await loadImage(ov.imageBase64);
    const canvas = createHTMLCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,targetW,targetH);
    ctx.drawImage(img, 0,0, img.width,img.height, 0,0, targetW,targetH);
    const id = ctx.getImageData(0,0,targetW,targetH);
    const data = id.data;
    for (let i=0;i<data.length;i+=4) {
      if (data[i+3] === 0) { data[i]=0; data[i+1]=0; data[i+2]=0; data[i+3]=0; }
      else { data[i+3] = 255; }
    }
    ctx.putImageData(id, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    ov.imageBase64 = dataUrl;
    ov.imageUrl = null;
    ov.isLocal = true;
    await saveConfig(['overlays']);
    clearOverlayCache();
    ensureHook();
    updateUI();
  }

  async function reconstructViaGrid(img, origW, origH, offx, offy, gapX, gapY) {
    const srcCanvas = createCanvas(origW, origH);
    const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(img, 0, 0);
    const srcData = sctx.getImageData(0,0,origW,origH).data;

    const cols = Math.floor((origW - offx) / gapX);
    const rows = Math.floor((origH - offy) / gapY);
    if (cols <= 0 || rows <= 0) throw new Error('No samples available with current offset/gap');

    const outCanvas = createHTMLCanvas(cols, rows);
    const octx = outCanvas.getContext('2d');
    const out = octx.createImageData(cols, rows);
    const odata = out.data;

    const cx0 = offx + gapX / 2;
    const cy0 = offy + gapY / 2;

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    for (let ry=0; ry<rows; ry++) {
      for (let rx=0; rx<cols; rx++) {
        const sx = Math.round(clamp(cx0 + rx*gapX, 0, origW-1));
        const sy = Math.round(clamp(cy0 + ry*gapY, 0, origH-1));
        const si = (sy*origW + sx) * 4;

        const r = srcData[si];
        const g = srcData[si+1];
        const b = srcData[si+2];
        const a = srcData[si+3];

        const oi = (ry*cols + rx) * 4;
        if (a === 0) {
          odata[oi] = 0; odata[oi+1] = 0; odata[oi+2] = 0; odata[oi+3] = 0;
        } else {
          odata[oi] = r; odata[oi+1] = g; odata[oi+2] = b; odata[oi+3] = 255;
        }
      }
    }
    octx.putImageData(out, 0, 0);
    return outCanvas;
  }

  function main() {
    loadConfig().then(() => {
      injectStyles();

      if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', createUI);
      else createUI();

      ensureHook();
      applyTheme();

      console.log("Overlay Pro: Initialized with Minify (fixed 3×) mode.");
    });
  }

  main();
})();