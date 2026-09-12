"""
Pipeline ML optimizado para presupuesto de 50ms y determinismo estricto.
"""
from __future__ import annotations
import pickle
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import train_test_split

FEATURE_COLS = [
    "distance_km", "base_pay", "tip", "surge_multiplier",
    "hour_of_day", "traffic_level", "weather_severity", 
    "zone_risk", "batch_size", "vehicle_speed_factor"
]

@dataclass
class MLPrediction:
    estimated_time_minutes: float
    projected_earnings_per_min: float
    ml_confidence_score: float
    profitability_label: int

class DeliveryMLModel:
    def __init__(self, model_dir: str | Path = "artifacts"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.time_model = None
        self.profit_model = None
        self._trained = False
        self.is_degraded = False

    @staticmethod
    def _synthetic_dataset(n: int = 5000, seed: int = 42) -> pd.DataFrame:
        rng = np.random.default_rng(seed)
        df = pd.DataFrame({
            "distance_km": rng.uniform(0.5, 15.0, n),
            "base_pay": rng.uniform(25, 180, n),
            "tip": rng.uniform(0, 50, n),
            "surge_multiplier": rng.choice([1.0, 1.2, 1.5, 2.0, 3.0], n, p=[0.5, 0.2, 0.15, 0.1, 0.05]),
            "hour_of_day": rng.integers(0, 24, n),
            "traffic_level": rng.integers(0, 4, n),
            "weather_severity": rng.integers(0, 3, n),
            "zone_risk": rng.integers(0, 3, n),
            "batch_size": rng.integers(1, 4, n),
            "vehicle_speed_factor": rng.choice([0.8, 1.0, 1.2], n), # bike, moto, car
        })
        base_speed = 25 * df["vehicle_speed_factor"]
        weather_penalty = df["weather_severity"] * 5.0
        risk_penalty = df["zone_risk"] * 4.0
        df["real_time_min"] = (5.0 + (df["distance_km"] / base_speed) * 60 + weather_penalty + risk_penalty + rng.normal(0, 1.0, n)).clip(lower=3.0)
        
        fuel_cost = df["distance_km"] * df["vehicle_speed_factor"].map({0.8: 1.5, 1.0: 4.5, 1.2: 8.0})
        net = (df["base_pay"] * df["surge_multiplier"] + df["tip"]) - fuel_cost
        df["earnings_per_min"] = net / df["real_time_min"]
        df["profitable"] = (df["earnings_per_min"] >= 6.0).astype(int)
        return df

    def train(self, force: bool = False) -> None:
        pkl_time, pkl_profit = self.model_dir / "time_rf.pkl", self.model_dir / "profit_rf.pkl"
        if pkl_time.exists() and pkl_profit.exists() and not force:
            self.load()
            return
        
        df = self._synthetic_dataset()
        X, y_time, y_profit = df[FEATURE_COLS], df["real_time_min"], df["profitable"]
        X_tr, X_te, yt_tr, yt_te, yp_tr, yp_te = train_test_split(X, y_time, y_profit, test_size=0.2, random_state=42)
        
        # Optimizado para < 50ms de inferencia y determinismo (n_jobs=1)
        self.time_model = RandomForestRegressor(n_estimators=50, max_depth=6, random_state=42, n_jobs=1)
        self.time_model.fit(X_tr, yt_tr)
        
        self.profit_model = RandomForestClassifier(n_estimators=50, max_depth=6, random_state=42, n_jobs=1)
        self.profit_model.fit(X_tr, yp_tr)
        
        with open(pkl_time, "wb") as f: pickle.dump(self.time_model, f)
        with open(pkl_profit, "wb") as f: pickle.dump(self.profit_model, f)
        self._trained = True

    def load(self) -> None:
        with open(self.model_dir / "time_rf.pkl", "rb") as f: self.time_model = pickle.load(f)
        with open(self.model_dir / "profit_rf.pkl", "rb") as f: self.profit_model = pickle.load(f)
        self._trained = True

    def predict(self, features: dict[str, Any]) -> MLPrediction:
        if self.is_degraded or not self._trained:
            raise RuntimeError("Model unavailable")
        x = pd.DataFrame([{c: features.get(c, 0) for c in FEATURE_COLS}])
        t = float(self.time_model.predict(x)[0])
        proba = float(self.profit_model.predict_proba(x)[0, 1])
        
        fuel = features.get("distance_km", 1) * features.get("vehicle_speed_factor", 1.0) * 4.5
        gross = features.get("base_pay", 0) * features.get("surge_multiplier", 1.0) + features.get("tip", 0)
        epm = (gross - fuel) / max(t, 1.0)
        
        return MLPrediction(estimated_time_minutes=round(t, 2), projected_earnings_per_min=round(epm, 2),
                            ml_confidence_score=round(proba, 3), profitability_label=int(proba > 0.5))
