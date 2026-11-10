# OneGoML HackMTY- (36 hours) Hackathon Project for Infosys Challenge. 

**Real-time order-acceptance assistant for delivery couriers: explainable ML decisions, safety rules enforced in code, and a live simulation dashboard.**

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?logo=scikitlearn&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)

---

## Overview

Gig couriers have only a few seconds to decide whether an incoming order is worth taking. A pay-only rule ignores travel-time uncertainty, where the courier ends up next, and, most importantly, whether the order is *safe* to accept.

**OneGoML** answers that question for every order offered to a courier in the Monterrey metropolitan area (ZMM). It returns an **ACCEPT / SKIP** decision in milliseconds, together with a short reason that names the constraint that actually decided it, and a dashboard shows the whole shift unfolding in real time.

The project was built around a hackathon brief (HackMTY); the format contracts and judging rules are kept in [`courier/`](courier/).

## Key Features

- **Two-tier architecture**
  - **Fast Path (Tier 1):** a synchronous, deterministic decision engine with no LLM or network calls, designed for a **50 ms** latency budget.
  - **Explainer (Tier 2):** post-decision explanations in natural language, using Google Gemini when an API key is configured and a built-in offline interpreter otherwise.
- **Safety constraints enforced in code**, evaluated *before* any pay arithmetic, so a safety refusal can never be overridden by a better offer. Each rule lives in its own file under [`src/onego/courier/constraints/`](src/onego/courier/constraints/):
  1. Vehicle capacity (weight / volume per vehicle type)
  2. Shift-end feasibility (the order must be completable before the shift ends)
  3. Mandatory 20-minute break after 4 continuous hours of riding
  4. Heat rule: continuous riding capped at 90 minutes between 12:00 and 16:00
  5. No dropoffs in flagged zones after 22:00
- **Uncertainty-aware ML:** Random Forest models estimate delivery time with P10–P90 bounds and a profitability classification. Decisions can be evaluated against a *pessimistic* earnings-per-minute figure when uncertainty is high.
- **Economic evaluation per vehicle:** `moto`, `car` and `bike` have distinct speed factors, fuel costs and capacities.
- **Graceful degradation:** if the model becomes unavailable, the fast path keeps deciding with a heuristic fallback and flags `degraded: true` in every response. It never stalls.
- **Deterministic, replayable simulations:** a seeded event generator produces identical order streams for identical seeds, so a shift can be recorded, replayed and diffed.
- **Live dashboard:** map, event timeline, earnings counter, side-by-side comparison against a greedy baseline, shock injection, model-failure toggle, replay controls and an "explain this decision" modal.

## How a Decision Is Made

```
 order_offered ──► apply courier_state_overrides
                        │
                        ▼
        ┌─────────── Safety pipeline (first rule that fires wins) ───────────┐
        │ vehicle_capacity → shift_end_infeasible → mandatory_break →        │
        │ heat_rule → flagged_zone_night                                     │
        └──────────────┬─────────────────────────────────────┬───────────────┘
                 rule fired                              all passed
                       │                                     │
                       ▼                                     ▼
              SKIP + binding_constraint          ML time estimate + economics
                                                 vs. reservation wage (MXN/hr)
                                                             │
                                                             ▼
                                                   ACCEPT / SKIP + reason
```

Every response follows the schema in [`courier/decision_response_schema.json`](courier/decision_response_schema.json):

```json
{
  "order_id": "ord_001",
  "decision": "SKIP",
  "reason": "Continuous riding reached 4 hours; a 20-minute break is mandatory before accepting new orders.",
  "binding_constraint": "mandatory_break",
  "latency_ms": 3.1,
  "tier": "tier1",
  "degraded": false
}
```

> The example above is illustrative. Field names come from the schema; values will differ at runtime.

## Architecture

```
OneGoML/
├── src/
│   ├── api/server.py                 # FastAPI app: /decide, /events (SSE), /shock, /status, ...
│   ├── demo_live.py                  # Interactive terminal demo
│   └── onego/
│       ├── courier/
│       │   ├── courier_decider.py    # Fast Path entry point
│       │   ├── economics.py          # Per-vehicle earnings evaluation
│       │   └── constraints/          # One file per safety rule
│       ├── models/ml_models.py       # Random Forest pipeline with uncertainty bounds
│       ├── data/generador_delivery_mty.py  # Seeded Monterrey event generator
│       └── ai/explainer.py           # Tier 2 explainer (Gemini or offline)
├── apps/dashboard/                   # React + TypeScript + Vite + Tailwind + Zustand
├── courier/                          # Format contracts, evaluation protocol, validator
├── artifacts/                        # Trained model files (.pkl)
└── tests/                            # pytest suite
```

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Python, FastAPI, Uvicorn, Pydantic, Server-Sent Events |
| Machine learning | scikit-learn (Random Forest), NumPy, pandas, joblib |
| AI explanations | Google Gemini API (optional) with an offline fallback |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand, Google Maps (`@react-google-maps/api`) |
| Testing & tooling | pytest, httpx, Oxlint |

## Getting Started

### Prerequisites

- Python 3.12 or newer
- Node.js 18 or newer (for the dashboard)
- *Optional:* a Google Gemini API key and a Google Maps API key

### 1. Backend

```bash
# from the repository root
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install python-dotenv        # imported by the API server

uvicorn api.server:app --app-dir src --port 8000 --reload
```

The ML models are trained automatically on a synthetic dataset the first time the server starts if no files are found in `artifacts/`.

Interactive API docs are available at <http://127.0.0.1:8000/docs>.

**Optional:** create a `.env` file in the repository root to enable Gemini explanations:

```env
GEMINI_API_KEY=your_key_here
```

Without a key, explanations are generated by the built-in offline interpreter.

### 2. Dashboard

```bash
cd apps/dashboard
cp .env.example .env             # then set VITE_GOOGLE_MAPS_API_KEY
npm install
npm run dev
```

Open <http://localhost:5175>. The Vite dev server proxies API calls to the backend on port 8000.

### 3. Terminal demo

```bash
python src/demo_live.py
```

Type commands such as `weather 3`, `risk 3`, `fail_model`, `vehicle bike` or `surge 2.0` to trigger safety constraints, degraded mode and vehicle changes live.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/decide` | Decide on an order; accepts optional `courier_state_overrides` |
| `GET` | `/explain_decision?order_id=` | Structured explanation of a past decision |
| `POST` | `/explain_ai` | Natural-language explanation (Gemini or offline) |
| `GET` | `/events?seed=&n_offers=&vehicle=&speed=` | SSE stream of a full simulated shift |
| `POST` | `/shock` | Inject a `surge`, `closure`, `rain` or `delay` event |
| `GET` | `/status` | Degraded flag, model connection, active shocks, reservation wage |
| `POST` | `/model_failure` | Force or clear degraded mode (for demos) |
| `GET` | `/replay/log?seed=&n_offers=&vehicle=` | Deterministic full-shift event log |

## Testing

```bash
pytest
```

The suite covers determinism, safety-constraint triggering, response-schema compliance, degraded mode, vehicle profiles, the explainer, and the API endpoints.

To validate output formats against the contracts in `courier/`:

```bash
python courier/validate_format.py --endpoint http://localhost:8000/decide
```

## Design Principles

- **Safety before pay.** Safety rules run first and short-circuit; no pay signal can reverse a refusal.
- **Determinism.** The same seed gives the same order stream, and the same input gives the same fast-path decision.
- **Explain every decision.** Each response carries a reason that names the binding constraint, so a safety refusal is distinguishable from a pay-based one.
- **Never stall.** Model failure degrades the system, signals it, and keeps it deciding.

## Roadmap

- Replace the synthetic training data with real delivery logs
- Add a Tier 2 strategy layer that updates the reservation wage at runtime
- Report results on held-out seeds against named baselines
- Containerize the backend and dashboard
