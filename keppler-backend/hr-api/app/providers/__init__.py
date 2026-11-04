from app.crypto import decrypt
from app.providers.base import AttendanceProvider, ProviderConfig, ProviderError, PunchRecord, Unsupported
from app.providers.essl_soap import EBioServerProvider, ETimeTrackLiteProvider
from app.providers.simulator import SimulatorProvider

REGISTRY: dict[str, type[AttendanceProvider]] = {
    "etimetracklite": ETimeTrackLiteProvider,
    "ebioserver": EBioServerProvider,
    "simulator": SimulatorProvider,
}


def build_provider(integration) -> AttendanceProvider:
    cls = REGISTRY.get(integration.provider)
    if cls is None:
        raise ProviderError(f"Unknown provider {integration.provider}")
    config = ProviderConfig(
        base_url=integration.base_url,
        username=integration.username,
        password=decrypt(integration.password_encrypted),
    )
    if cls is SimulatorProvider:
        return cls(config)
    return cls(config, declared_operations=(integration.capabilities or {}).get("operations"))


__all__ = ["REGISTRY", "build_provider", "AttendanceProvider", "ProviderError", "PunchRecord", "Unsupported"]
