"""
Pipeline ML con Intervalos de Confianza (Uncertainty Bounds) y Circuit Breaker.
Optimizado para inferencia en tiempo real en la ZMM.
"""
from __future__ import annotations
import pickle
import time
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.model_selection import train_test_split

# Silenciar advertencias de Scikit-Learn durante la inferencia
warnings.filterwarnings("ignore", category=UserWarning)

FEATURE_COLS = [
    "distance_km", "base_pay", "tip", "surge_multiplier",
    "hour_of_day", "traffic_level", "weather_severity", 
    "zone_risk", "batch_size", "vehicle_speed_factor",
    "is_cross_municipality", "is_mountain_zone", "gonzalitos_bottle_neck"
]

@dataclass
class MLPrediction:
    estimated_time_minutes: float
    time_lower_bound: float          # Cuantil 10% (Límite optimista)
    time_upper_bound: float          # Cuantil 90% (Límite pesimista / peor caso)
    uncertainty_range_minutes: float # Ancho del intervalo (P90 - P10)
    projected_earnings_per_min: float
    pessimistic_epm: float           # EPM en el peor escenario de tiempo
    ml_confidence_score: float
    profitability_label: int
    is_degraded: bool = False
    fallback_reason: str | None = None


class DeliveryMLModel:
    def __init__(self, model_dir: str | Path = "artifacts"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.time_model: RandomForestRegressor | None = None
        self.profit_model: RandomForestClassifier | None = None
        self._trained = False
        self.is_degraded = False

    @staticmethod
    def _synthetic_dataset(n: int = 5000, seed: int = 42) -> pd.DataFrame:
        rng = np.random.default_rng(seed)
        
        distance_km = rng.uniform(0.5, 15.0, n)
        base_pay = rng.uniform(25, 180, n)
        tip = rng.uniform(0, 50, n)
        surge_multiplier = rng.choice([1.0, 1.2, 1.5, 2.0, 3.0], n, p=[0.5, 0.2, 0.15, 0.1, 0.05])
        hour_of_day = rng.integers(0, 24, n)
        traffic_level = rng.integers(0, 4, n)
        weather_severity = rng.integers(0, 3, n)
        zone_risk = rng.integers(0, 3, n)
        batch_size = rng.integers(1, 4, n)
        vehicle_speed_factor = rng.choice([0.8, 1.0, 1.2], n)

        is_cross_municipality = (distance_km > 6.0).astype(int)
        is_mountain_zone = rng.choice([0, 1], n, p=[0.8, 0.2])
        is_peak_hour = ((hour_of_day >= 7) & (hour_of_day <= 9)) | ((hour_of_day >= 17) & (hour_of_day <= 20))
        gonzalitos_bottle_neck = (is_peak_hour & (traffic_level >= 2)).astype(int)

        df = pd.DataFrame({
            "distance_km": distance_km, "base_pay": base_pay, "tip": tip,
            "surge_multiplier": surge_multiplier, "hour_of_day": hour_of_day,
            "traffic_level": traffic_level, "weather_severity": weather_severity,
            "zone_risk": zone_risk, "batch_size": batch_size,
            "vehicle_speed_factor": vehicle_speed_factor,
            "is_cross_municipality": is_cross_municipality,
            "is_mountain_zone": is_mountain_zone,
            "gonzalitos_bottle_neck": gonzalitos_bottle_neck
        })

        base_speed = 25 * df["vehicle_speed_factor"]
        weather_penalty = df["weather_severity"] * 5.0
        risk_penalty = df["zone_risk"] * 4.0
        cross_mty_penalty = df["is_cross_municipality"] * 6.5
        mountain_penalty = df["is_mountain_zone"] * (8.0 / df["vehicle_speed_factor"])
        gonzalitos_penalty = df["gonzalitos_bottle_neck"] * 10.0

        noise_std = 1.0 + (df["distance_km"] * 0.3) + (df["traffic_level"] * 1.5)
        df["real_time_min"] = (
            5.0 + (df["distance_km"] / base_speed) * 60 
            + weather_penalty + risk_penalty + cross_mty_penalty 
            + mountain_penalty + gonzalitos_penalty 
            + rng.normal(0, noise_std, n)
        ).clip(lower=3.0)
        
        fuel_rate_map = {0.8: 1.5, 1.0: 4.5, 1.2: 8.0}
        fuel_multiplier = 1.3 if df["is_mountain_zone"].any() else 1.0
        fuel_cost = df["distance_km"] * df["vehicle_speed_factor"].map(fuel_rate_map) * fuel_multiplier
        
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
        X_vals = df[FEATURE_COLS].values
        y_time = df["real_time_min"].values
        y_profit = df["profitable"].values
        
        X_tr, X_te, yt_tr, yt_te, yp_tr, yp_te = train_test_split(X_vals, y_time, y_profit, test_size=0.2, random_state=42)
        
        self.time_model = RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42, n_jobs=-1)
        self.time_model.fit(X_tr, yt_tr)
        
        self.profit_model = RandomForestClassifier(n_estimators=50, max_depth=8, random_state=42, n_jobs=-1)
        self.profit_model.fit(X_tr, yp_tr)
        
        with open(pkl_time, "wb") as f: pickle.dump(self.time_model, f)
        with open(pkl_profit, "wb") as f: pickle.dump(self.profit_model, f)
        self._trained = True

    def load(self) -> None:
        with open(self.model_dir / "time_rf.pkl", "rb") as f: self.time_model = pickle.load(f)
        with open(self.model_dir / "profit_rf.pkl", "rb") as f: self.profit_model = pickle.load(f)
        self._trained = True

    def _fallback_heuristic(self, features: dict[str, Any], reason: str) -> MLPrediction:
        distance = features.get("distance_km", 3.0)
        speed = 20.0
        base_time = (distance / speed) * 60 + 5.0
        
        if features.get("is_mountain_zone", 0): base_time += 7.0
        if features.get("gonzalitos_bottle_neck", 0): base_time += 10.0
        
        gross = features.get("base_pay", 40.0) * features.get("surge_multiplier", 1.0) + features.get("tip", 0.0)
        fuel = distance * 4.5
        epm = (gross - fuel) / max(base_time, 1.0)
        
        return MLPrediction(
            estimated_time_minutes=round(base_time, 2),
            time_lower_bound=round(base_time * 0.85, 2),
            time_upper_bound=round(base_time * 1.25, 2),
            uncertainty_range_minutes=round(base_time * 0.40, 2),
            projected_earnings_per_min=round(epm, 2),
            pessimistic_epm=round((gross - fuel) / max(base_time * 1.25, 1.0), 2),
            ml_confidence_score=0.50,
            profitability_label=int(epm >= 6.0),
            is_degraded=True,
            fallback_reason=reason
        )

    def predict(self, features: dict[str, Any]) -> MLPrediction:
        if self.is_degraded or not self._trained or self.time_model is None:
            return self._fallback_heuristic(features, reason="Model explicitly marked as degraded or untrained")

        try:
            start_time = time.perf_counter()

            features_with_defaults = features.copy()
            distance = features.get("distance_km", 1.0)
            hour = features.get("hour_of_day", 12)
            traffic = features.get("traffic_level", 0)

            if "is_cross_municipality" not in features_with_defaults:
                features_with_defaults["is_cross_municipality"] = 1 if distance > 6.0 else 0
                
            if "gonzalitos_bottle_neck" not in features_with_defaults:
                is_peak = (7 <= hour <= 9) or (17 <= hour <= 20)
                features_with_defaults["gonzalitos_bottle_neck"] = 1 if (is_peak and traffic >= 2) else 0

            # Convertir a matriz NumPy pura (1, N_features)
            x_vals = np.array([[features_with_defaults.get(c, 0) for c in FEATURE_COLS]])

            # Vectorización ultrarrápida de predicciones por árbol
            tree_predictions = np.array([tree.predict(x_vals)[0] for tree in self.time_model.estimators_])
            
            t_mean = float(np.mean(tree_predictions))
            t_p10 = float(np.percentile(tree_predictions, 10))
            t_p90 = float(np.percentile(tree_predictions, 90))
            uncertainty_range = t_p90 - t_p10

            proba = float(self.profit_model.predict_proba(x_vals)[0, 1])
            
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            if elapsed_ms > 50.0:
                return self._fallback_heuristic(features, reason=f"SLA latency budget exceeded ({elapsed_ms:.1f}ms > 50ms)")

            fuel = distance * features.get("vehicle_speed_factor", 1.0) * 4.5
            gross = features.get("base_pay", 0) * features.get("surge_multiplier", 1.0) + features.get("tip", 0)
            
            epm_expected = (gross - fuel) / max(t_mean, 1.0)
            epm_pessimistic = (gross - fuel) / max(t_p90, 1.0)
            
            adjusted_confidence = round(max(0.1, proba * (1.0 - min(uncertainty_range / 30.0, 0.5))), 3)

            return MLPrediction(
                estimated_time_minutes=round(t_mean, 2),
                time_lower_bound=round(t_p10, 2),
                time_upper_bound=round(t_p90, 2),
                uncertainty_range_minutes=round(uncertainty_range, 2),
                projected_earnings_per_min=round(epm_expected, 2),
                pessimistic_epm=round(epm_pessimistic, 2),
                ml_confidence_score=adjusted_confidence,
                profitability_label=int(epm_expected >= 6.0),
                is_degraded=False
            )

        except Exception as err:
            return self._fallback_heuristic(features, reason=f"Runtime exception trapped: {str(err)}")