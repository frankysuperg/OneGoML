"""
Generador de eventos sintéticos adaptado a la Zona Metropolitana de Monterrey (ZMM).
Genera flujo continuo en formato JSON Lines (.jsonl).
"""
import json
import random
from pathlib import Path

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