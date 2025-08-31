"""
Adaptive Color Clicker • v12
────────────────────────────
- No fixed grid stride; works with variable square sizes
- Finds connected pink regions and splits fused blocks adaptively
- Clicks safe interior points (distance-transform maxima)
- Color tolerance, preview, ESC to cancel, pre-click verification
- NEW: Auto-hide the UI during Analyze/Click with configurable delay
"""

import sys, ctypes, threading, time
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageDraw, ImageTk
import numpy as np
import pyautogui
from pynput import keyboard, mouse

# Optional but strongly recommended
try:
    import scipy.ndimage as ndi
    SCIPY_OK = True
except Exception:
    SCIPY_OK = False

# PyAutoGUI speed tweaks
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0
pyautogui.MINIMUM_DURATION = 0

def enable_dpi_awareness():
    if sys.platform.startswith("win"):
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)  # per-monitor DPI
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass

enable_dpi_awareness()

def parse_rgb(s: str) -> tuple[int, int, int]:
    vals = tuple(int(x.strip()) for x in s.split(","))
    if len(vals) != 3 or any(not (0 <= v <= 255) for v in vals):
        raise ValueError("Invalid RGB")
    return vals

def build_mask(img_array: np.ndarray, rgb: tuple[int,int,int], tol: int) -> np.ndarray:
    # L1 color distance tolerance
    tgt = np.array(rgb, dtype=np.int16)
    diff = np.abs(img_array[:, :, :3].astype(np.int16) - tgt)
    dist = np.sum(diff, axis=2)
    return dist <= (tol * 3)

def pre_click_matches(x: int, y: int, rgb: tuple[int,int,int], tol: int) -> bool:
    try:
        r, g, b = pyautogui.pixel(x, y)
    except Exception:
        return False
    return (abs(r - rgb[0]) + abs(g - rgb[1]) + abs(b - rgb[2])) <= (tol * 3)

class AdaptiveColorClicker:
    def __init__(self, master: tk.Tk):
        self.master = master
        master.title("Adaptive Color Clicker")
        master.geometry("540x700")

        # Config frame
        cfg = ttk.LabelFrame(master, text="Configuration", padding=10)
        cfg.pack(fill="x", padx=10, pady=8)

        ttk.Label(cfg, text="Target RGB:").grid(row=0, column=0, sticky="e", padx=5, pady=4)
        self.rgb_var = tk.StringVar(value="255,0,255")
        ttk.Entry(cfg, textvariable=self.rgb_var, width=12).grid(row=0, column=1, padx=5, pady=4)
        ttk.Button(cfg, text="Pick", command=self.eyedropper, width=8).grid(row=0, column=2, padx=5, pady=4)

        ttk.Label(cfg, text="Tolerance:").grid(row=1, column=0, sticky="e", padx=5, pady=4)
        self.tol_var = tk.IntVar(value=6)
        ttk.Scale(cfg, from_=0, to=40, variable=self.tol_var, orient="horizontal", length=160)\
            .grid(row=1, column=1, padx=5, pady=4)
        ttk.Label(cfg, textvariable=self.tol_var, width=3).grid(row=1, column=2, sticky="w")

        ttk.Label(cfg, text="Min blob area (px):").grid(row=2, column=0, sticky="e", padx=5, pady=4)
        self.min_area_var = tk.IntVar(value=8)
        ttk.Scale(cfg, from_=1, to=500, variable=self.min_area_var, orient="horizontal", length=160)\
            .grid(row=2, column=1, padx=5, pady=4)
        ttk.Label(cfg, textvariable=self.min_area_var, width=4).grid(row=2, column=2, sticky="w")

        ttk.Label(cfg, text="Safety inset (%):").grid(row=3, column=0, sticky="e", padx=5, pady=4)
        self.inset_pct_var = tk.IntVar(value=25)  # how far from borders we prefer
        ttk.Scale(cfg, from_=0, to=45, variable=self.inset_pct_var, orient="horizontal", length=160)\
            .grid(row=3, column=1, padx=5, pady=4)
        ttk.Label(cfg, textvariable=self.inset_pct_var, width=3).grid(row=3, column=2, sticky="w")

        self.split_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(cfg, text="Split fused blocks adaptively", variable=self.split_var)\
            .grid(row=4, column=0, columnspan=3, sticky="w", padx=5, pady=(2,6))

        self.verify_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(cfg, text="Verify color before each click", variable=self.verify_var)\
            .grid(row=5, column=0, columnspan=3, sticky="w", padx=5)

        # New: auto-hide options
        self.autohide_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(cfg, text="Hide window during Analyze/Click", variable=self.autohide_var)\
            .grid(row=6, column=0, columnspan=3, sticky="w", padx=5, pady=(8,2))

        ttk.Label(cfg, text="Hide delay (ms):").grid(row=7, column=0, sticky="e", padx=5, pady=4)
        self.hide_delay_var = tk.IntVar(value=180)
        ttk.Spinbox(cfg, from_=0, to=1000, increment=20, textvariable=self.hide_delay_var, width=6)\
            .grid(row=7, column=1, sticky="w", padx=5, pady=4)

        # Actions
        actions = ttk.LabelFrame(master, text="Actions", padding=10)
        actions.pack(fill="x", padx=10, pady=8)
        ttk.Button(actions, text="🔍 Analyze", width=14, command=self.analyze).pack(side="left", padx=4)
        ttk.Button(actions, text="👁️ Preview", width=14, command=self.preview).pack(side="left", padx=4)
        ttk.Button(actions, text="🎯 Click All", width=14, command=self.click_all).pack(side="left", padx=4)

        # Stats / info
        stats = ttk.LabelFrame(master, text="Info", padding=8)
        stats.pack(fill="both", expand=True, padx=10, pady=8)
        self.info_text = tk.Text(stats, height=12, wrap="word")
        self.info_text.pack(fill="both", expand=True)

        # Status
        self.status = tk.StringVar(value="Ready")
        ttk.Label(master, textvariable=self.status, relief="sunken", padding=6)\
           .pack(fill="x", padx=10, pady=(0,10))

        # Internal state
        self._stop = threading.Event()
        self.targets: list[tuple[int,int]] = []
        self.last_img = None
        self.last_mask = None
        self.typical_size = None  # learned from data
        self._ui_hidden = False

        if not SCIPY_OK:
            self._append_info("Note: SciPy not found. Please `pip install scipy` for best accuracy.")

    # Eyedropper
    def eyedropper(self):
        self.master.withdraw()
        self.status.set("Click anywhere on screen to pick color...")

        def on_click(x, y, button, pressed):
            if pressed:
                img = pyautogui.screenshot()
                r, g, b = img.getpixel((x, y))
                self.rgb_var.set(f"{r},{g},{b}")
                self.master.deiconify()
                self.status.set(f"Picked RGB({r},{g},{b})")
                listener.stop()

        listener = mouse.Listener(on_click=on_click)
        listener.start()

    # Auto-hide helpers
    def _maybe_hide(self):
        if self.autohide_var.get() and not self._ui_hidden:
            self._ui_hidden = True
            try:
                self.master.withdraw()
            except Exception:
                pass
            return True
        return False

    def _maybe_restore(self):
        if self._ui_hidden:
            def _do():
                try:
                    self.master.deiconify()
                    self.master.lift()
                except Exception:
                    pass
                self._ui_hidden = False
            self.master.after(0, _do)

    # Analyze
    def analyze(self):
        if not SCIPY_OK:
            if not messagebox.askokcancel(
                "SciPy recommended",
                "This mode uses SciPy (scipy.ndimage) for reliable segmentation.\n\n"
                "Continue anyway? It may be slower or less accurate."
            ):
                return

        self.status.set("Analyzing...")

        if self._maybe_hide():
            delay = max(0, int(self.hide_delay_var.get()))
            self.master.after(delay, lambda: threading.Thread(target=self._analyze_thread, daemon=True).start())
        else:
            threading.Thread(target=self._analyze_thread, daemon=True).start()

    def _analyze_thread(self):
        try:
            target_rgb = parse_rgb(self.rgb_var.get())
        except Exception:
            self.status.set("Invalid RGB value")
            self._maybe_restore()
            return

        tol = int(self.tol_var.get())
        min_area = int(self.min_area_var.get())
        inset_pct = int(self.inset_pct_var.get())
        split_blocks = self.split_var.get()

        try:
            # Take screenshot and mask
            img = pyautogui.screenshot()
            arr = np.array(img)
            mask = build_mask(arr, target_rgb, tol)

            self.last_img = img
            self.last_mask = mask

            total_on = int(np.sum(mask))
            if total_on == 0:
                self.targets = []
                self._append_info("No target pixels found with current tolerance.")
                self.status.set("No targets")
                return

            if not SCIPY_OK:
                # Weak fallback if scipy missing
                self.targets = self._fallback_greedy_targets(mask)
                self._summarize(total_on, len(self.targets), learned_size=None, fused_splits=False)
                self.status.set(f"Found {len(self.targets)} targets (fallback)")
                return

            # Label connected components (4-connectivity)
            structure = np.array([[0,1,0],
                                  [1,1,1],
                                  [0,1,0]], dtype=bool)
            labeled, num = ndi.label(mask, structure=structure)
            obj_slices = ndi.find_objects(labeled)

            regions = []
            sizes_for_learning = []

            # compute distance transform
            dist = ndi.distance_transform_edt(mask)

            for i in range(1, num + 1):
                slc = obj_slices[i - 1]
                if slc is None:
                    continue
                y0, y1 = slc[0].start, slc[0].stop
                x0, x1 = slc[1].start, slc[1].stop

                comp_mask = (labeled[y0:y1, x0:x1] == i)
                area = int(np.sum(comp_mask))
                if area < min_area:
                    continue

                h = y1 - y0
                w = x1 - x0
                regions.append((x0, y0, w, h, area))
                sizes_for_learning.append(min(w, h))

            if not regions:
                self.targets = []
                self._append_info("No regions passed the min-area filter.")
                self.status.set("No targets")
                return

            # Learn typical square size
            sizes = np.array(sizes_for_learning, dtype=np.float32)
            if len(sizes) >= 5:
                lo, hi = np.percentile(sizes, [20, 80])
                central_band = sizes[(sizes >= lo) & (sizes <= hi)]
                typical = float(np.median(central_band)) if len(central_band) > 0 else float(np.median(sizes))
            else:
                typical = float(np.median(sizes))
            typical = max(2.0, min(128.0, typical))
            self.typical_size = typical

            # Build targets
            targets = []
            fused_splits = 0

            for (x0, y0, w, h, area) in regions:
                if split_blocks and (w > typical * 1.4 or h > typical * 1.4):
                    # Likely a fused block; adaptively split
                    nx = max(1, int(round(w / typical)))
                    ny = max(1, int(round(h / typical)))
                    if w <= typical * 1.4: nx = 1
                    if h <= typical * 1.4: ny = 1

                    for gy in range(ny):
                        for gx in range(nx):
                            sub_x0 = int(x0 + (gx    ) * w / nx)
                            sub_x1 = int(x0 + (gx + 1) * w / nx)
                            sub_y0 = int(y0 + (gy    ) * h / ny)
                            sub_y1 = int(y0 + (gy + 1) * h / ny)
                            if sub_x1 <= sub_x0 or sub_y1 <= sub_y0:
                                continue
                            cx, cy = self._pick_center_via_distance(dist, mask, sub_x0, sub_y0, sub_x1, sub_y1)
                            if cx is not None:
                                targets.append((cx, cy))
                    if nx * ny > 1:
                        fused_splits += (nx * ny - 1)
                else:
                    cx, cy = self._pick_center_via_distance(dist, mask, x0, y0, x0 + w, y0 + h)
                    if cx is not None:
                        targets.append((cx, cy))

            # Safety pass: nudge towards safer center using local window
            inset_ratio = float(inset_pct) / 100.0
            if inset_ratio > 0 and SCIPY_OK:
                safe_targets = []
                for (x, y) in targets:
                    win = int(max(4, self.typical_size))
                    x0 = max(0, x - win // 2)
                    y0 = max(0, y - win // 2)
                    x1 = min(mask.shape[1], x + win // 2 + 1)
                    y1 = min(mask.shape[0], y + win // 2 + 1)
                    cx, cy = self._pick_center_via_distance(dist, mask, x0, y0, x1, y1)
                    safe_targets.append((cx if cx is not None else x, cy if cy is not None else y))
                targets = safe_targets

            # Deduplicate close points
            targets = self._dedupe_targets(targets, spacing=max(2, int(round(self.typical_size * 0.4))))

            # Sort row-major
            targets.sort(key=lambda p: (p[1], p[0]))
            self.targets = targets

            self._summarize(total_on, len(self.targets), learned_size=self.typical_size, fused_splits=fused_splits)
            self.status.set(f"Found {len(self.targets)} targets")
        finally:
            self._maybe_restore()

    def _pick_center_via_distance(self, dist, mask, x0, y0, x1, y1):
        sub = dist[y0:y1, x0:x1]
        if sub.size == 0:
            return (None, None)
        idx = np.argmax(sub)
        dy, dx = np.unravel_index(idx, sub.shape)
        if sub[dy, dx] <= 0:
            return (None, None)
        return (x0 + int(dx), y0 + int(dy))

    def _dedupe_targets(self, points, spacing: int):
        if not points:
            return []
        spacing = max(1, spacing)
        cell = spacing
        seen = set()
        deduped = []
        for x, y in points:
            key = (x // cell, y // cell)
            if key not in seen:
                seen.add(key)
                deduped.append((x, y))
        return deduped

    def _fallback_greedy_targets(self, mask: np.ndarray):
        h, w = mask.shape
        targets = []
        visited = np.zeros_like(mask, dtype=bool)
        on = np.sum(mask)
        approx = max(8, int(round(np.sqrt((w * h) / max(on, 1)))))
        step = approx

        for y in range(0, h, step):
            for x in range(0, w, step):
                sub = mask[y:min(y+step, h), x:min(x+step, w)]
                if np.any(sub):
                    yy, xx = np.argwhere(sub)[0]
                    X = x + int(xx); Y = y + int(yy)
                    if not visited[Y, X]:
                        targets.append((X, Y))
                        y0 = max(0, Y - step//2); y1 = min(h, Y + step//2 + 1)
                        x0 = max(0, X - step//2); x1 = min(w, X + step//2 + 1)
                        visited[y0:y1, x0:x1] = True
        return targets

    def _summarize(self, total_pixels_on, target_count, learned_size=None, fused_splits=0):
        lines = []
        lines.append(f"Total target pixels: {total_pixels_on:,}")
        lines.append(f"Click targets: {target_count}")
        if learned_size:
            lines.append(f"Learned typical size: {learned_size:.1f}px")
        if self.split_var.get():
            lines.append(f"Fused-split additions: {fused_splits}")
        self._set_info("\n".join(lines))

    # Preview
    def preview(self):
        if not self.targets:
            self.status.set("No targets to preview (run Analyze).")
            return
        if self.last_img is None:
            self.status.set("No screenshot available.")
            return

        img = self.last_img.copy()
        draw = ImageDraw.Draw(img)

        for (x, y) in self.targets:
            draw.line((x-6, y, x+6, y), fill="red", width=2)
            draw.line((x, y-6, x, y+6), fill="red", width=2)
            draw.ellipse((x-2, y-2, x+2, y+2), fill="yellow", outline="black")

        win = tk.Toplevel(self.master)
        win.title(f"Preview ({len(self.targets)} targets)")
        show = img.copy()
        show.thumbnail((1000, 800), Image.Resampling.LANCZOS)
        photo = ImageTk.PhotoImage(show)
        lbl = ttk.Label(win, image=photo)
        lbl.image = photo
        lbl.pack(padx=8, pady=8)

    # Click
    def click_all(self):
        if not self.targets:
            self.status.set("No targets to click. Run Analyze first.")
            return
        self._stop.clear()
        self.status.set(f"Clicking {len(self.targets)} targets... (ESC to stop)")

        def on_press(key):
            if key == keyboard.Key.esc:
                self._stop.set()
        listener = keyboard.Listener(on_press=on_press)
        listener.start()

        def start_thread():
            threading.Thread(target=self._click_thread, args=(listener,), daemon=True).start()

        if self._maybe_hide():
            delay = max(0, int(self.hide_delay_var.get()))
            self.master.after(delay, start_thread)
        else:
            start_thread()

    def _click_thread(self, listener):
        try:
            rgb = parse_rgb(self.rgb_var.get())
        except Exception:
            self.status.set("Invalid RGB")
            try:
                listener.stop()
            except Exception:
                pass
            self._maybe_restore()
            return

        tol = int(self.tol_var.get())
        verify = self.verify_var.get()
        clicked = 0
        total = len(self.targets)

        try:
            for (x, y) in self.targets:
                if self._stop.is_set():
                    break
                if verify and not pre_click_matches(x, y, rgb, tol):
                    continue
                pyautogui.click(x, y, _pause=False)
                clicked += 1
        finally:
            try:
                listener.stop()
            except Exception:
                pass
            self.status.set(f"Clicked {clicked}/{total}")
            self._maybe_restore()

    # UI helpers
    def _append_info(self, msg: str):
        self.info_text.insert(tk.END, msg + "\n")
        self.info_text.see(tk.END)

    def _set_info(self, msg: str):
        self.info_text.delete("1.0", tk.END)
        self.info_text.insert("1.0", msg)

# Run
if __name__ == "__main__":
    root = tk.Tk()
    app = AdaptiveColorClicker(root)
    root.mainloop()