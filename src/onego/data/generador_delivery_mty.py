"""
Generador determinista por seed. Cumple: byte-identical order stream per seed.
"""
from __future__ import annotations
import json
import random
from datetime import datetime
from pathlib import Path
from typing import Iterator

ZONES_MTY = [
    {"name": "San Pedro", "lat": 25.6693, "lng": -100.3100, "risk": 0},
    {"name": "Valle Oriente", "lat": 25.6332, "lng": -100.3117, "risk": 0},
    {"name": "Centro", "lat": 25.6866, "lng": -100.3161, "risk": 1},
    {"name": "Cumbres", "lat": 25.7392, "lng": -100.3942, "risk": 1},
    {"name": "Santa Catarina", "lat": 25.6749, "lng": -100.4489, "risk": 2},
    {"name": "García", "lat": 25.7747, "lng": -100.5558, "risk": 2},
]

class EventGenerator:
    def __init__(self, seed: int = 42, n_offers: int = 20):
        self.rng = random.Random(seed) # Deterministic
        self.n_offers = n_offers
        self.order_counter = 0

    def _offer(self, surge: float = 1.0, traffic: int = 1, weather: int = 0) -> dict:
        self.order_counter += 1
        pickup = self.rng.choice(ZONES_MTY)
        dropoff = self.rng.choice([z for z in ZONES_MTY if z["name"] != pickup["name"]])
        return {
            "event_type": "OFFER",
            "timestamp": "2024-10-25T10:00:00Z", # Fixed for determinism
            "order_id": f"ORD-{self.order_counter:05d}",
            "pickup_zone": pickup["name"], "pickup_lat": round(pickup["lat"] + self.rng.uniform(-0.005, 0.005), 5),
            "pickup_lng": round(pickup["lng"] + self.rng.uniform(-0.005, 0.005), 5),
            "dropoff_zone": dropoff["name"], "dropoff_lat": round(dropoff["lat"] + self.rng.uniform(-0.005, 0.005), 5),
            "dropoff_lng": round(dropoff["lng"] + self.rng.uniform(-0.005, 0.005), 5),
            "distance_km": round(self.rng.uniform(1.5, 28.0), 2), # Can exceed 25km to trigger safety
            "base_pay": round(self.rng.uniform(30, 150), 2),
            "tip": self.rng.choice([0, 0, 10, 20, 40]),
            "surge_multiplier": round(surge * self.rng.uniform(0.9, 1.2), 2),
            "traffic_level": traffic, "weather_severity": weather,
            "zone_risk": max(pickup["risk"], dropoff["risk"]),
            "weight_kg": round(self.rng.uniform(1, 20), 1),
        }

    def _weather(self, severity: int) -> dict:
        return {"event_type": "WEATHER_EVENT", "timestamp": "2024-10-25T10:00:00Z", "city": "Monterrey", "severity": severity, "description": ["Despejado", "Lluvia", "Tormenta severa"][severity]}

    def stream(self, inject_surge: float = 1.0, inject_weather: int = 0, inject_traffic: int = 1) -> Iterator[dict]:
        yield self._weather(inject_weather)
        for i in range(self.n_offers):
            yield self._offer(surge=inject_surge, traffic=inject_traffic, weather=inject_weather)
            if i % 5 == 4 and self.rng.random() < 0.4:
                yield {"event_type": "TRAFFIC_UPDATE", "timestamp": "2024-10-25T10:00:00Z", "zone": "Centro", "traffic_level": self.rng.randint(0, 3)}

    def to_file(self, path: str | Path = "events.jsonl") -> Path:
        p = Path(path)
        with p.open("w") as f:
            for ev in self.stream():
                f.write(json.dumps(ev) + "\\n")
        return p
