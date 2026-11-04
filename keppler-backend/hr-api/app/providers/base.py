"""The contract every biometric attendance provider implements.

Adapters only talk to the vendor and translate its records into `PunchRecord`;
deduplication, employee mapping and persistence happen once, in
services/punch_ingestion.py, whichever provider produced the punch."""

from dataclasses import dataclass, field
from datetime import datetime


class ProviderError(Exception):
    """The vendor system failed or answered with something unusable."""


class Unsupported(ProviderError):
    """The installed product does not offer (or we have not verified) this operation."""


@dataclass
class ConnectionResult:
    ok: bool
    message: str
    operations: list[str] = field(default_factory=list)
    product: str | None = None


@dataclass
class DeviceInfo:
    serial_number: str
    name: str | None = None
    location: str | None = None


@dataclass
class PunchRecord:
    device_user_id: str
    # Wall-clock time as the device reported it, no offset: the ingestion
    # step localises it with the integration's device_timezone.
    local_time: datetime
    device_serial: str | None
    raw: str
    direction: str | None = None  # "in" | "out" | None when the source does not say
    verify_mode: str | None = None


@dataclass
class ProviderConfig:
    base_url: str
    username: str | None
    password: str | None
    timeout: float = 20.0


class AttendanceProvider:
    name = "base"

    def __init__(self, config: ProviderConfig):
        self.config = config

    def test_connection(self) -> ConnectionResult:
        raise NotImplementedError

    def fetch_devices(self) -> list[DeviceInfo]:
        raise Unsupported(f"{self.name} does not list devices; register them by serial number")

    def fetch_employees(self) -> list[dict]:
        raise Unsupported(f"{self.name} does not list device users")

    def fetch_transactions(self, serial_number: str, start: datetime, end: datetime) -> list[PunchRecord]:
        raise NotImplementedError

    def create_employee(self, device_user_id: str, name: str, serial_number: str | None = None) -> str:
        raise Unsupported(f"{self.name}: provisioning users on the device is not supported")

    def get_command_status(self, command_id: str) -> dict:
        raise Unsupported(f"{self.name}: command status is not supported")
