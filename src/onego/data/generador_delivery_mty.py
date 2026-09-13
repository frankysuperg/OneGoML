"""
Generador de eventos sintéticos adaptado a la Zona Metropolitana de Monterrey (ZMM).
Genera flujo continuo en formato JSON Lines (.jsonl).

Public API
----------
EventGenerator  — class used by demo_live.py and tests.
                  Deterministic when seed is fixed (uses numpy RNG, not random global).
generar_eventos_mty — legacy function kept for backward compatibility.
"""
import json
import random
from pathlib import Path

import numpy as np

ZONAS_MTY = [
    {"nombre": "San Pedro", "risk": 0, "mountain": 0},
    {"nombre": "Centro MTY", "risk": 1, "mountain": 0},
    {"nombre": "Cumbres Altas", "risk": 0, "mountain": 1},
    {"nombre": "Tec / San Rafael", "risk": 0, "mountain": 0},
    {"nombre": "Santa Catarina", "risk": 1, "mountain": 0},
    {"nombre": "Valle Oriente", "risk": 0, "mountain": 1},
]

def generar_eventos_mty(num_eventos: int = 20, output_path: str = "src/onego/data/event_log.jsonl"):
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    eventos = []
    
    # 1. Evento de inicio de turno
    eventos.append({
        "event_type": "shift_start",
        "timestamp": "2026-09-12T18:00:00Z",
        "courier_id": "courier_mty_01",
        "initial_zone": "Centro MTY",
        "reservation_wage_mxn": 95.0
    })

    # 2. Generación de pedidos y shocks
    for i in range(1, num_eventos - 1):
        origen = random.choice(ZONAS_MTY)
        destino = random.choice(ZONAS_MTY)
        distancia = round(random.uniform(1.2, 12.5), 2)
        hora = random.randint(12, 21)
        trafico = random.randint(0, 3)

        # Determinar si cruza municipios o pasa por arterias principales
        is_cross = 1 if origen["nombre"] != destino["nombre"] or distancia > 6.0 else 0
        is_mountain = 1 if (origen["mountain"] or destino["mountain"]) else 0
        gonzalitos = 1 if (17 <= hora <= 20 and trafico >= 2) else 0

        if random.random() < 0.8:
            # Evento de orden ofrecida
            evento = {
                "event_type": "order_offered",
                "event_id": f"ord_{i:03d}",
                "timestamp": f"2026-09-12T18:{i:02d}:00Z",
                "distance_km": distancia,
                "base_pay": round(random.uniform(30.0, 150.0), 2),
                "tip": round(random.uniform(0.0, 45.0), 2),
                "surge_multiplier": random.choice([1.0, 1.2, 1.5, 2.0]),
                "hour_of_day": hora,
                "traffic_level": trafico,
                "weather_severity": random.choice([0, 1, 2]),
                "zone_risk": max(origen["risk"], destino["risk"]),
                "pickup_zone": origen["nombre"],
                "dropoff_zone": destino["nombre"],
                "is_cross_municipality": is_cross,
                "is_mountain_zone": is_mountain,
                "gonzalitos_bottle_neck": gonzalitos
            }
        else:
            # Evento de imprevisto / shock en vivo
            evento = {
                "event_type": "shock",
                "event_id": f"shk_{i:03d}",
                "timestamp": f"2026-09-12T18:{i:02d}:00Z",
                "shock_type": random.choice(["rain_storm", "gonzalitos_traffic_jam", "surge_boost"]),
                "affected_zone": origen["nombre"],
                "severity": random.randint(1, 3)
            }
        
        eventos.append(evento)

    # 3. Evento de cierre de turno
    eventos.append({
        "event_type": "shift_end",
        "timestamp": "2026-09-12T22:00:00Z",
        "courier_id": "courier_mty_01"
    })

    # Escribir archivo .jsonl
    with open(output_file, "w", encoding="utf-8") as f:
        for ev in eventos:
            f.write(json.dumps(ev, ensure_ascii=False) + "\n")

    print(f"✅ Se generó con éxito {len(eventos)} eventos en '{output_path}'")

if __name__ == "__main__":
    generar_eventos_mty()


# ---------------------------------------------------------------------------
# EventGenerator — deterministic stream class used by demo_live.py and tests
# ---------------------------------------------------------------------------

VEHICLE_SPEEDS = {"bike": 0.8, "moto": 1.0, "car": 1.2}
SHIFT_START_ISO = "2026-03-21T15:00:00"
SHIFT_END_ISO = "2026-03-21T23:00:00"

# Zone registry matching event_log_schema.json zone_pickup / zone_dropoff (ints)
ZONE_IDS = [5, 7, 9, 11]
ZONE_NAMES = {5: "Valle Oriente", 7: "San Pedro", 9: "Tec/San Rafael", 11: "Centro MTY"}
ZONE_RISK = {5: 0, 7: 0, 9: 0, 11: 1}  # 11 = Centro, higher risk at night


class EventGenerator:
    """
    Deterministic stream of order_offered (and occasional shock) events.

    Args:
        seed:       RNG seed — same seed always produces the same stream.
        n_offers:   Number of order/shock events to generate.
        vehicle:    Active vehicle type ("bike", "moto", "car").
        sim_start:  ISO-8601 start of shift (sim_time of first event).
        sim_end:    ISO-8601 end of shift.

    Usage:
        gen = EventGenerator(seed=42, n_offers=20)
        for event in gen.stream():
            ...  # event is a dict matching event_log_schema.json
    """

    def __init__(
        self,
        seed: int = 42,
        n_offers: int = 20,
        vehicle: str = "moto",
        sim_start: str = SHIFT_START_ISO,
        sim_end: str = SHIFT_END_ISO,
    ) -> None:
        self.seed = seed
        self.n_offers = n_offers
        self.vehicle = vehicle
        self.sim_start = sim_start
        self.sim_end = sim_end
        # One RNG per generator instance, seeded explicitly — never global random
        self._rng = np.random.default_rng(seed)

    def stream(self):
        """
        Yield events in chronological order.
        Each dict matches event_log_schema.json field names.
        """
        rng = self._rng

        yield {
            "event": "shift_start",
            "event_type": "shift_start",   # legacy alias for demo_live.py
            "sim_time": self.sim_start,
            "seed": self.seed,
            "shift_hours": 8,
            "vehicle": self.vehicle,
            "start_location_zone": ZONE_IDS[0],
            "shift_end_time": self.sim_end,
        }

        # Spread n_offers events across the shift window
        from datetime import datetime, timedelta
        try:
            fmt = "%Y-%m-%dT%H:%M:%S"
            t_start = datetime.strptime(self.sim_start, fmt)
            t_end = datetime.strptime(self.sim_end, fmt)
        except ValueError:
            t_start = datetime(2026, 3, 21, 15, 0, 0)
            t_end = datetime(2026, 3, 21, 23, 0, 0)

        total_sec = (t_end - t_start).total_seconds()
        interval_sec = total_sec / max(self.n_offers + 1, 1)

        for i in range(1, self.n_offers + 1):
            sim_time = (t_start + timedelta(seconds=interval_sec * i)).strftime(fmt)
            hour = int(sim_time.split("T")[1].split(":")[0])

            # ~20% chance of shock event instead of order
            if rng.random() < 0.20:
                shock_types = ["surge", "closure", "rain", "delay"]
                shock_type = shock_types[int(rng.integers(0, len(shock_types)))]
                yield {
                    "event": "shock",
                    "event_type": "shock",
                    "sim_time": sim_time,
                    "shock_type": shock_type,
                    "zone": int(rng.choice(ZONE_IDS)),
                    "multiplier": round(float(rng.uniform(1.2, 2.0)), 2) if shock_type == "surge" else None,
                    "duration_min": int(rng.integers(15, 45)),
                }
                continue

            zone_pickup = int(rng.choice(ZONE_IDS))
            zone_dropoff = int(rng.choice(ZONE_IDS))
            dist_pickup = round(float(rng.uniform(0.3, 2.5)), 2)
            dist_delivery = round(float(rng.uniform(1.0, 10.0)), 2)
            base_pay = round(float(rng.uniform(30.0, 130.0)), 2)
            tip = round(float(rng.uniform(0.0, 40.0)), 2)
            surge = float(rng.choice([1.0, 1.0, 1.2, 1.5, 2.0]))
            weight_kg = round(float(rng.uniform(0.3, 12.0)), 2)
            volume_l = round(float(rng.uniform(1.0, 25.0)), 2)
            traffic = int(rng.integers(0, 4))
            weather = int(rng.integers(0, 3))
            is_cross = 1 if dist_delivery > 6.0 else 0
            is_mountain = int(rng.choice([0, 0, 0, 1]))
            gonzalitos = 1 if (17 <= hour <= 20 and traffic >= 2) else 0
            order_id = f"ORD-{i:04d}-s{self.seed}"

            yield {
                "event": "order_offered",
                "event_type": "order_offered",   # legacy alias
                "order_id": order_id,
                "event_id": order_id,             # legacy alias
                "sim_time": sim_time,
                "zone_pickup": zone_pickup,
                "zone_dropoff": zone_dropoff,
                "zone_pickup_name": ZONE_NAMES.get(zone_pickup, str(zone_pickup)),
                "zone_dropoff_name": ZONE_NAMES.get(zone_dropoff, str(zone_dropoff)),
                "distance_pickup_km": dist_pickup,
                "distance_delivery_km": dist_delivery,
                "distance_km": dist_delivery,     # legacy alias
                "base_pay_mxn": base_pay,
                "base_pay": base_pay,             # legacy alias
                "est_tip_mxn": tip,
                "tip": tip,                       # legacy alias
                "surge_multiplier": surge,
                "weight_kg": weight_kg,
                "volume_liters": volume_l,
                "vehicle": self.vehicle,
                "hour_of_day": hour,
                "traffic_level": traffic,
                "weather_severity": weather,
                "zone_risk": ZONE_RISK.get(zone_dropoff, 0),
                "is_cross_municipality": is_cross,
                "is_mountain_zone": is_mountain,
                "gonzalitos_bottle_neck": gonzalitos,
                "pickup_zone": ZONE_NAMES.get(zone_pickup, str(zone_pickup)),    # legacy
                "dropoff_zone": ZONE_NAMES.get(zone_dropoff, str(zone_dropoff)), # legacy
            }

        yield {
            "event": "shift_end",
            "event_type": "shift_end",
            "sim_time": self.sim_end,
        }
