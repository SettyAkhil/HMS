"""A stand-in eSSL server for development and tests -- never production data.

Integrations using it are labelled `simulator` everywhere in the API and UI.
Configure with base_url `sim://?pins=1001,1002&duplicates=1&offline=0`.
Output is deterministic for a given (pin, day), so re-syncing a window
returns the same punches and exercises deduplication rather than inventing
new attendance on every poll."""

import hashlib
from datetime import datetime, time, timedelta
from urllib.parse import parse_qs, urlparse

from app.providers.base import (
    AttendanceProvider,
    ConnectionResult,
    DeviceInfo,
    ProviderError,
    PunchRecord,
)


class SimulatorProvider(AttendanceProvider):
    name = "simulator"

    def _opts(self) -> dict:
        q = parse_qs(urlparse(self.config.base_url).query)
        return {
            "pins": [p for p in (q.get("pins", [""])[0]).split(",") if p],
            "duplicates": q.get("duplicates", ["0"])[0] == "1",
            "offline": q.get("offline", ["0"])[0] == "1",
            "devices": [d for d in (q.get("devices", ["SIM-0001"])[0]).split(",") if d],
            "unknown": [p for p in (q.get("unknown", [""])[0]).split(",") if p],
        }

    def test_connection(self) -> ConnectionResult:
        if self._opts()["offline"]:
            return ConnectionResult(False, "Simulator configured offline")
        return ConnectionResult(True, "Simulator ready (test data only)", ["GetTransactionsLog"], "simulator")

    def fetch_devices(self) -> list[DeviceInfo]:
        return [DeviceInfo(serial_number=s, name=f"Simulated device {s}") for s in self._opts()["devices"]]

    def fetch_transactions(self, serial_number: str, start: datetime, end: datetime) -> list[PunchRecord]:
        opts = self._opts()
        if opts["offline"]:
            raise ProviderError("Simulator configured offline")
        out: list[PunchRecord] = []
        day = start.date()
        while day <= end.date():
            for pin in opts["pins"] + opts["unknown"]:
                seed = int(hashlib.sha256(f"{pin}{day}{serial_number}".encode()).hexdigest(), 16)
                if seed % 11 == 0:  # roughly one absence in eleven
                    continue
                arrive = datetime.combine(day, time(8, 0)) + timedelta(minutes=seed % 40 - 10)
                leave = datetime.combine(day, time(16, 0)) + timedelta(minutes=(seed >> 8) % 70 - 20)
                stamps = [arrive, arrive + timedelta(hours=4), arrive + timedelta(hours=4, minutes=30), leave]
                if seed % 7 == 0:  # forgot to punch out
                    stamps = stamps[:3]
                if opts["duplicates"]:
                    stamps.append(arrive)  # finger held on the reader twice
                for s in stamps:
                    if start <= s <= end:
                        out.append(PunchRecord(device_user_id=pin, local_time=s, device_serial=serial_number,
                                               raw=f"{pin}\t{s:%Y-%m-%d %H:%M:%S}\tSIM"))
            day += timedelta(days=1)
        return out
