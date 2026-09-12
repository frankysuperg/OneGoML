#!/usr/bin/env python3
"""
Demo interactiva diseñada para demostrar las reglas de los jueces en vivo:
1. Safety constraints triggering.
2. Degraded mode fallback.
3. Vehicle type switching.
"""
from __future__ import annotations
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from onego.courier.decide import CourierDecider
from onego.data.generador_delivery_mty import EventGenerator

RESET, BOLD, GREEN, RED, YELLOW, CYAN = "\\033[0m", "\\033[1m", "\\033[92m", "\\033[91m", "\\033[93m", "\\033[96m"

HELP = f"""{BOLD}=== OneGo Driver Assistant (HackMTY Demo) ==={RESET}
Comandos para demostrar rúbrica a los jueces:
  {CYAN}weather 3{RESET}       -> Activa SAFETY_WEATHER constraint (rechazo automático).
  {CYAN}risk 3{RESET}          -> Activa SAFETY_ZONE_RISK (rechazo si no paga bien).
  {CYAN}fail_model{RESET}      -> Activa DEGRADED_MODE (fallback heurístico sin crash).
  {CYAN}vehicle <bike|moto|car>{RESET} -> Cambia perfil de velocidad/costo.
  {CYAN}surge <val>{RESET}     -> Cambia multiplicador.
  {CYAN}auto <n>{RESET}        -> Procesa n eventos sin pausa.
  {CYAN}quit{RESET}            -> Salir.
"""

def main():
    print(HELP)
    decider = CourierDecider(vehicle_type="moto")
    gen = EventGenerator(seed=7, n_offers=15)
    stream = gen.stream()
    auto_remaining = 0
    
    for ev in stream:
        if ev["event_type"] == "WEATHER_EVENT":
            print(f"\\n{YELLOW}🌦 Clima: {ev['description']} (severidad {ev['severity']}){RESET}")
            decider.update_context(weather_severity=ev["severity"])
            continue
            
        dec = decider.decide(ev)
        color = GREEN if dec["action"] == "ACCEPT" else RED
        print(f"\\n{BOLD}📦 {ev['order_id']}{RESET} | {ev['pickup_zone']} → {ev['dropoff_zone']} ({ev['distance_km']}km)")
        print(f"   Acción: {color}{dec['action']}{RESET} | Restricción: {BOLD}{dec['binding_constraint']}{RESET}")
        print(f"   Razón: {dec['explanation']}")
        if dec["metrics"].get("is_degraded_mode"):
            print(f"   {YELLOW}⚠️ SISTEMA EN MODO DEGRADADO (Fallback heurístico activo){RESET}")

        if auto_remaining > 0:
            auto_remaining -= 1
            time.sleep(0.2)
            continue
            
        try:
            cmd = input(f"\\n{BOLD}[OneGo]>{RESET} ").strip().lower()
        except EOFError:
            break
            
        while cmd:
            if cmd.startswith("weather"):
                v = int(cmd.split()[1])
                decider.update_context(weather_severity=v)
                print(f"{GREEN}✓ Clima = {v}{RESET}")
            elif cmd.startswith("risk"):
                v = int(cmd.split()[1])
                decider.update_context(zone_risk=v)
                print(f"{GREEN}✓ Riesgo = {v}{RESET}")
            elif cmd == "fail_model":
                decider.force_model_failure(True)
                print(f"{RED}✓ Modelo simulado como FALLIDO. Modo degradado activado.{RESET}")
            elif cmd.startswith("vehicle"):
                v = cmd.split()[1]
                decider.set_vehicle(v)
                print(f"{GREEN}✓ Vehículo cambiado a {v}{RESET}")
            elif cmd.startswith("surge"):
                decider.update_context(surge_multiplier=float(cmd.split()[1]))
                print(f"{GREEN}✓ Surge = {cmd.split()[1]}{RESET}")
            elif cmd.startswith("auto"):
                auto_remaining = int(cmd.split()[1])
                break
            elif cmd == "quit":
                return
            elif cmd == "help":
                print(HELP)
            
            try:
                cmd = input(f"{BOLD}[OneGo]>{RESET} ").strip().lower()
            except EOFError:
                break

if __name__ == "__main__":
    main()
