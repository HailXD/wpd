import tkinter as tk
from tkinter import ttk
import threading

import pyautogui
from pynput import mouse, keyboard           # ← add keyboard

# ------- main application -------
class ColorClickerApp:
    def __init__(self, master: tk.Tk):
        self.master = master
        master.title("Color Clicker")

        # ---------- UI ----------
        ttk.Label(master, text="Target colour (R,G,B):").grid(row=0, column=0, padx=6, pady=6, sticky="e")

        self.colour_var = tk.StringVar(value="255,0,255")
        self.colour_box = ttk.Combobox(
            master,
            textvariable=self.colour_var,
            values=["255,0,255"],
            width=12,
            state="readonly",
        )
        self.colour_box.grid(row=0, column=1, padx=6, pady=6)

        ttk.Button(master, text="Eye Dropper", command=self.start_eyedropper).grid(row=1, column=0, padx=6, pady=6)
        ttk.Button(master, text="Click", command=self.start_scanning).grid(row=1, column=1, padx=6, pady=6)

        self.status = tk.StringVar(value="Ready")
        ttk.Label(master, textvariable=self.status).grid(row=2, column=0, columnspan=2, pady=4)

        # helpers for aborting
        self._stop_event = threading.Event()
        self._kbd_listener: keyboard.Listener | None = None

        pyautogui.FAILSAFE = False

    # ---------- eye-dropper ----------
    def start_eyedropper(self):
        self.status.set("Click anywhere to pick a colour…")
        self.master.withdraw()               # hide window

        def on_click(x, y, button, pressed):
            if pressed:
                rgb = pyautogui.screenshot().getpixel((x, y))
                self.colour_var.set(f"{rgb[0]},{rgb[1]},{rgb[2]}")
                self.status.set(f"Picked {rgb}")
                self.master.deiconify()
                listener.stop()

        listener = mouse.Listener(on_click=on_click)
        listener.start()

    # ---------- scan + click ----------
    def _on_key_press(self, key):
        if key == keyboard.Key.esc:          # ESC → request stop
            self._stop_event.set()

    def start_scanning(self):
        try:
            target = tuple(map(int, self.colour_var.get().split(",")))
            assert len(target) == 3 and all(0 <= c <= 255 for c in target)
        except (ValueError, AssertionError):
            self.status.set("Invalid RGB value")
            return

        # prepare abort flag & keyboard hook
        self._stop_event.clear()
        self._kbd_listener = keyboard.Listener(on_press=self._on_key_press)
        self._kbd_listener.start()

        self.status.set("Scanning…  (hold ESC to cancel)")
        threading.Thread(target=self.scan_and_click, args=(target,), daemon=True).start()

    def scan_and_click(self, target_rgb: tuple[int, int, int]):
        screenshot = pyautogui.screenshot()
        width, height = screenshot.size

        for y in range(0, height, 10):
            for x in range(0, width, 10):
                if self._stop_event.is_set():           # ← check abort
                    self._cleanup_after_scan("Cancelled")
                    return
                if screenshot.getpixel((x, y))[0:3] == target_rgb:
                    pyautogui.click(x, y)

        self._cleanup_after_scan("Done")

    # ---------- utilities ----------
    def _cleanup_after_scan(self, msg: str):
        if self._kbd_listener:
            self._kbd_listener.stop()
            self._kbd_listener = None
        self.status.set(msg)

# ---------- run ----------
if __name__ == "__main__":
    root = tk.Tk()
    ColorClickerApp(root)
    root.mainloop()
