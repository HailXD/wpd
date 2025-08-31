"""
Color-Clicker / Smart Grid Detector • v6
────────────────────────────────────────
• Detects actual pixel squares/clusters
• Clicks each cluster center once
• No assumptions about grid alignment
"""

import tkinter as tk
from tkinter import ttk
import threading
import pyautogui
from pynput import mouse, keyboard
import numpy as np
from scipy.ndimage import label

# ───── PyAutoGUI speed tweaks ─────
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0
pyautogui.MINIMUM_DURATION = 0

class ColorClickerApp:
    def __init__(self, master: tk.Tk):
        self.master = master
        master.title("Color Clicker - Smart Grid")
        
        # ───── vars ─────
        self.colour_var = tk.StringVar(value="255,0,255")
        self.clusters_var = tk.StringVar(value="—")
        
        # ───── UI ─────
        ttk.Label(master, text="Target colour (R,G,B):").grid(row=0, column=0, sticky="e", padx=6, pady=4)
        ttk.Combobox(master, textvariable=self.colour_var, values=["255,0,255"], width=15, state="readonly")\
            .grid(row=0, column=1, padx=6, pady=4)
        
        ttk.Label(master, text="Clusters found:").grid(row=1, column=0, sticky="e", padx=6, pady=4)
        ttk.Entry(master, textvariable=self.clusters_var, width=15, state="readonly")\
            .grid(row=1, column=1, padx=6, pady=4)
        
        ttk.Button(master, text="Eye Dropper", command=self.start_eyedropper)\
            .grid(row=2, column=0, padx=6, pady=6)
        ttk.Button(master, text="Analyze", command=self.analyze_grid)\
            .grid(row=2, column=1, padx=6, pady=6)
        ttk.Button(master, text="Click All", command=self.click_all)\
            .grid(row=2, column=2, padx=6, pady=6)
        
        self.status = tk.StringVar(value="Ready")
        ttk.Label(master, textvariable=self.status).grid(row=3, column=0, columnspan=3, pady=4)
        
        # Internal state
        self._stop_event = threading.Event()
        self._kbd_listener = None
        self.cluster_centers = []
    
    # ───────── Eye-dropper ─────────
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
    
    # ───────── Analyze Grid ─────────
    def analyze_grid(self):
        self.status.set("Analyzing...")
        threading.Thread(target=self._analyze_grid_thread, daemon=True).start()
    
    def _analyze_grid_thread(self):
        try:
            target = tuple(map(int, self.colour_var.get().split(",")))
        except:
            self.status.set("Invalid RGB value")
            return
        
        # Take screenshot and find target pixels
        img = pyautogui.screenshot()
        img_array = np.array(img)
        
        # Create binary mask of target color
        mask = np.all(img_array[:, :, :3] == target, axis=2)
        
        # Find connected components (clusters of pixels)
        labeled_array, num_clusters = label(mask)
        
        # Find center of each cluster
        self.cluster_centers = []
        for i in range(1, num_clusters + 1):
            points = np.argwhere(labeled_array == i)
            if len(points) > 0:
                center_y, center_x = points.mean(axis=0).astype(int)
                self.cluster_centers.append((center_x, center_y))
        
        self.clusters_var.set(str(len(self.cluster_centers)))
        self.status.set(f"Found {len(self.cluster_centers)} clusters")
    
    # ───────── Click All Clusters ─────────
    def click_all(self):
        if not self.cluster_centers:
            self.status.set("No clusters found. Run Analyze first.")
            return
        
        self._stop_event.clear()
        self._kbd_listener = keyboard.Listener(on_press=self._on_key_press)
        self._kbd_listener.start()
        
        self.status.set(f"Clicking {len(self.cluster_centers)} clusters - ESC to cancel")
        threading.Thread(target=self._click_thread, daemon=True).start()
    
    def _click_thread(self):
        clicked = 0
        for x, y in self.cluster_centers:
            if self._stop_event.is_set():
                self._finish_click(f"Cancelled after {clicked} clicks")
                return
            pyautogui.click(x, y, _pause=False)
            clicked += 1
        
        self._finish_click(f"Clicked all {clicked} clusters")
    
    def _on_key_press(self, key):
        if key == keyboard.Key.esc:
            self._stop_event.set()
    
    def _finish_click(self, msg: str):
        if self._kbd_listener:
            self._kbd_listener.stop()
            self._kbd_listener = None
        self.status.set(msg)

# ───────── Alternative: Simple deduplication approach ─────────
class SimpleColorClicker:
    """
    Simpler approach without scipy - uses grid-based deduplication
    """
    def __init__(self, master: tk.Tk):
        self.master = master
        master.title("Color Clicker - Simple")
        
        # ───── vars ─────
        self.colour_var = tk.StringVar(value="255,0,255")
        self.grid_size_var = tk.StringVar(value="10")
        
        # ───── UI ─────
        ttk.Label(master, text="Target colour (R,G,B):").grid(row=0, column=0, sticky="e", padx=6, pady=4)
        ttk.Entry(master, textvariable=self.colour_var, width=15).grid(row=0, column=1, padx=6, pady=4)
        
        ttk.Label(master, text="Min pixel spacing:").grid(row=1, column=0, sticky="e", padx=6, pady=4)
        ttk.Scale(master, from_=5, to=50, variable=self.grid_size_var, orient="horizontal")\
            .grid(row=1, column=1, padx=6, pady=4)
        
        ttk.Button(master, text="Click All Pink", command=self.click_all).grid(row=2, column=0, columnspan=2, pady=10)
        
        self.status = tk.StringVar(value="Ready")
        ttk.Label(master, textvariable=self.status).grid(row=3, column=0, columnspan=2, pady=4)
    
    def click_all(self):
        threading.Thread(target=self._click_thread, daemon=True).start()
    
    def _click_thread(self):
        try:
            target = tuple(map(int, self.colour_var.get().split(",")))
            spacing = int(float(self.grid_size_var.get()))
        except:
            self.status.set("Invalid input")
            return
        
        self.status.set("Scanning and clicking...")
        
        img = pyautogui.screenshot()
        w, h = img.size
        
        clicked_zones = set()  # Track which grid zones we've clicked
        click_count = 0
        
        # Scan entire screen
        for y in range(h):
            for x in range(w):
                if img.getpixel((x, y))[:3] == target:
                    # Calculate which grid zone this pixel belongs to
                    zone_x = x // spacing
                    zone_y = y // spacing
                    zone = (zone_x, zone_y)
                    
                    # Click if we haven't clicked this zone yet
                    if zone not in clicked_zones:
                        pyautogui.click(x, y, _pause=False)
                        clicked_zones.add(zone)
                        click_count += 1
        
        self.status.set(f"Clicked {click_count} locations")

# ───────── run ─────────
if __name__ == "__main__":
    root = tk.Tk()
    
    # Try to import scipy for advanced clustering
    try:
        from scipy.ndimage import label
        app = ColorClickerApp(root)
    except ImportError:
        print("scipy not found, using simple grid approach")
        app = SimpleColorClicker(root)
    
    root.mainloop()