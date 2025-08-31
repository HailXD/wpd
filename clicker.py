"""
Color-Clicker / Grid-Finder  •  v4
──────────────────────────────────
• “Click” now steps every **N** pixels **relative to the first-pixel origin**
  that “Check” discovered.  In other words, (first_x, first_y) is treated as
  grid-coordinate (0,0); then we visit (first_x + k·N, first_y + m·N).
• Keeps fast PyAutoGUI settings and ESC-to-abort.
"""

import tkinter as tk
from tkinter import ttk
import threading
from collections import Counter
import pyautogui
from pynput import mouse, keyboard

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0
pyautogui.MINIMUM_DURATION = 0

class ColorClickerApp:
    def __init__(self, master: tk.Tk):
        self.master = master
        master.title("Color Clicker")

        self.colour_var      = tk.StringVar(value="255,0,255")
        self.first_pixel_var = tk.StringVar(value="—")
        self.n_var           = tk.StringVar(value="—")

        ttk.Label(master, text="Target colour (R,G,B):") \
            .grid(row=0, column=0, sticky="e", padx=6, pady=4)
        ttk.Combobox(master, textvariable=self.colour_var,
                     values=["255,0,255"], width=12, state="readonly") \
            .grid(row=0, column=1, padx=6, pady=4)

        ttk.Label(master, text="First pixel (x,y):") \
            .grid(row=1, column=0, sticky="e", padx=6, pady=4)
        ttk.Entry(master, textvariable=self.first_pixel_var,
                  width=12, state="readonly") \
            .grid(row=1, column=1, padx=6, pady=4)

        ttk.Label(master, text="Grid size N:") \
            .grid(row=2, column=0, sticky="e", padx=6, pady=4)
        ttk.Combobox(master, textvariable=self.n_var,
                     values=[str(i) for i in range(1, 65)],
                     width=12, state="readonly") \
            .grid(row=2, column=1, padx=6, pady=4)

        ttk.Button(master, text="Eye Dropper",
                   command=self.start_eyedropper) \
            .grid(row=3, column=0, padx=6, pady=6)
        ttk.Button(master, text="Check",
                   command=self.start_checking) \
            .grid(row=3, column=1, padx=6, pady=6)
        ttk.Button(master, text="Click",
                   command=self.start_scanning) \
            .grid(row=3, column=2, padx=6, pady=6)

        self.status = tk.StringVar(value="Ready")
        ttk.Label(master, textvariable=self.status) \
            .grid(row=4, column=0, columnspan=3, pady=4)

        self._stop_event = threading.Event()
        self._kbd_listener: keyboard.Listener | None = None

    def start_eyedropper(self):
        self.status.set("Click anywhere to pick a colour…")
        self.master.withdraw()

        def on_click(x, y, button, pressed):
            if pressed:
                r, g, b = pyautogui.screenshot().getpixel((x, y))
                self.colour_var.set(f"{r},{g},{b}")
                self.status.set(f"Picked {(r, g, b)}")
                self.master.deiconify()
                listener.stop()

        listener = mouse.Listener(on_click=on_click)
        listener.start()

    def _on_key_press(self, key):
        if key == keyboard.Key.esc:
            self._stop_event.set()

    def start_scanning(self):
        try:
            target = tuple(map(int, self.colour_var.get().split(",")))
            assert len(target) == 3 and all(0 <= c <= 255 for c in target)
        except Exception:
            self.status.set("Invalid RGB value")
            return
        try:
            N = int(self.n_var.get())
            assert 1 <= N <= 64
        except Exception:
            self.status.set("Grid size N not set (run Check first)")
            return
        try:
            fx, fy = map(int, self.first_pixel_var.get().split(","))
        except Exception:
            self.status.set("First pixel not set (run Check first)")
            return

        self._stop_event.clear()
        self._kbd_listener = keyboard.Listener(on_press=self._on_key_press)
        self._kbd_listener.start()

        self.status.set(f"Scanning every {N}px from ({fx},{fy})… (ESC to cancel)")
        threading.Thread(target=self.scan_and_click,
                         args=(target, N, fx, fy), daemon=True).start()

    def scan_and_click(self, target_rgb: tuple[int, int, int],
                       step: int, fx: int, fy: int):
        img = pyautogui.screenshot()
        w, h = img.size

        for y in range(fy, h, step):
            for x in range(fx, w, step):
                if self._stop_event.is_set():
                    self._finish_click("Cancelled")
                    return
                if img.getpixel((x, y))[:3] == target_rgb:
                    pyautogui.click(x, y, _pause=False)

        self._finish_click("Done")

    def _finish_click(self, msg: str):
        if self._kbd_listener:
            self._kbd_listener.stop()
            self._kbd_listener = None
        self.status.set(msg)

    def start_checking(self):
        self.status.set("Checking…")
        threading.Thread(target=self.check_grid_size, daemon=True).start()

    def check_grid_size(self):
        img = pyautogui.screenshot()
        w, h = img.size
        target = tuple(map(int, self.colour_var.get().split(",")))

        runs, first_coord = [], None
        for y in range(0, h):
            row = list(img.crop((0, y, w, y + 1)).getdata())
            x = 0
            while x < w and len(runs) < 3:
                if row[x][:3] == target:
                    if first_coord is None:
                        first_coord = (x, y)
                    run = 0
                    while x < w and row[x][:3] == target:
                        run += 1
                        x += 1
                    runs.append(run)
                else:
                    x += 1
            if len(runs) == 3:
                break

        if not runs:
            self.status.set("Target colour not found.")
            return

        counts = Counter(runs).most_common()
        N = counts[0][0] if (len(counts) == 1 or counts[0][1] > 1) else sorted(runs)[1]

        self.first_pixel_var.set(f"{first_coord[0]},{first_coord[1]}")
        self.n_var.set(str(N))
        self.status.set(f"Grid size N = {N} (runs: {runs})")


if __name__ == "__main__":
    root = tk.Tk()
    ColorClickerApp(root)
    root.mainloop()
