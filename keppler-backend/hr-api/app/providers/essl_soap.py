"""eSSL WebAPIService.asmx adapters (eTimeTrackLite Web, eBioServer).

What is and is not verified, so nobody mistakes this for more than it is:

- eSSL's own integration page lists the operations of WebAPIService.asmx
  (AddEmployee, GetCommandStatus, GetTransactionsLog, ...) at
  http://<host>[:port]/WebAPIService.asmx?op=<Operation>, but publishes no
  parameter or response reference.
- The GetTransactionsLog request used here (FromDateTime, ToDateTime,
  SerialNumber, UserName, UserPassword, strDataList; namespace
  http://tempuri.org/; response strDataList of newline rows with
  tab-separated fields, PIN then "YYYY-MM-DD HH:MM:SS") comes from an
  open-source client used against real installs (github.com/rtdany10/
  etimetracklite), not from vendor documentation.

So `test_connection` reads the installed server's own WSDL and records which
operations it declares; every call checks that list first and refuses an
operation the server does not declare. Nothing is sent to a server whose WSDL
has not been read. Calls whose parameter contract we have not verified
(AddEmployee, GetCommandStatus) raise Unsupported even when declared, rather
than guessing at field names against a production device."""

import re
from datetime import datetime
from xml.etree.ElementTree import Element

import httpx
from defusedxml import ElementTree as SafeET

from app.providers.base import (
    AttendanceProvider,
    ConnectionResult,
    ProviderConfig,
    ProviderError,
    PunchRecord,
    Unsupported,
)

TEMPURI = "http://tempuri.org/"
WSDL_NS = "http://schemas.xmlsoap.org/wsdl/"
SOAP_ENV = "http://schemas.xmlsoap.org/soap/envelope/"
DATE_FMT = "%Y-%m-%d %H:%M:%S"
_TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$")


def _xml_escape(value: str) -> str:
    return (value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


class EsslSoapProvider(AttendanceProvider):
    name = "essl"
    product = "eSSL WebAPIService"

    def __init__(self, config: ProviderConfig, declared_operations: list[str] | None = None,
                 client: httpx.Client | None = None):
        super().__init__(config)
        self.declared = set(declared_operations or [])
        self._client = client

    # -- plumbing -------------------------------------------------------------

    @property
    def endpoint(self) -> str:
        url = self.config.base_url.rstrip("/")
        return url if url.lower().endswith(".asmx") else f"{url}/WebAPIService.asmx"

    def _http(self) -> httpx.Client:
        return self._client or httpx.Client(timeout=self.config.timeout)

    def _require(self, operation: str) -> None:
        if operation not in self.declared:
            raise Unsupported(
                f"The server's WSDL does not declare {operation} (run Test connection first)"
                if not self.declared else f"This {self.product} install does not offer {operation}"
            )

    def _call(self, operation: str, params: list[tuple[str, str]]) -> Element:
        self._require(operation)
        body = "".join(f"<{k}>{_xml_escape(v)}</{k}>" for k, v in params)
        envelope = (
            '<?xml version="1.0" encoding="utf-8"?>'
            f'<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            f'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="{SOAP_ENV}">'
            f'<soap:Body><{operation} xmlns="{TEMPURI}">{body}</{operation}></soap:Body></soap:Envelope>'
        )
        client = self._http()
        try:
            resp = client.post(self.endpoint, content=envelope.encode(), headers={
                "Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"{TEMPURI}{operation}"',
            })
        except httpx.HTTPError as exc:
            raise ProviderError(f"{self.product} unreachable: {exc.__class__.__name__}") from exc
        finally:
            if self._client is None:
                client.close()
        if resp.status_code != 200:
            fault = self._fault(resp.content)
            raise ProviderError(f"{operation} failed (HTTP {resp.status_code}){': ' + fault if fault else ''}")
        try:
            return SafeET.fromstring(resp.content)
        except Exception as exc:
            raise ProviderError(f"{operation} returned a response that is not XML") from exc

    @staticmethod
    def _fault(content: bytes) -> str | None:
        try:
            node = SafeET.fromstring(content).find(f".//{{{SOAP_ENV}}}Fault/faultstring")
            return node.text.strip()[:300] if node is not None and node.text else None
        except Exception:
            return None

    # -- contract -------------------------------------------------------------

    def test_connection(self) -> ConnectionResult:
        client = self._http()
        try:
            resp = client.get(self.endpoint, params={"WSDL": ""})
        except httpx.HTTPError as exc:
            return ConnectionResult(False, f"Cannot reach {self.endpoint}: {exc.__class__.__name__}")
        finally:
            if self._client is None:
                client.close()
        if resp.status_code != 200:
            return ConnectionResult(False, f"WSDL request returned HTTP {resp.status_code}")
        try:
            root = SafeET.fromstring(resp.content)
        except Exception:
            return ConnectionResult(False, "The URL answered, but not with a WSDL document")
        operations = sorted({
            op.get("name") for op in root.iter(f"{{{WSDL_NS}}}operation") if op.get("name")
        })
        if "GetTransactionsLog" not in operations:
            return ConnectionResult(
                False, "Server is reachable but does not declare GetTransactionsLog", operations, self.product
            )
        self.declared = set(operations)
        return ConnectionResult(True, f"{self.product} reachable; {len(operations)} operations declared",
                                operations, self.product)

    def fetch_transactions(self, serial_number: str, start: datetime, end: datetime) -> list[PunchRecord]:
        if not serial_number:
            raise ProviderError("GetTransactionsLog needs the device serial number")
        root = self._call("GetTransactionsLog", [
            ("FromDateTime", start.strftime(DATE_FMT)),
            ("ToDateTime", end.strftime(DATE_FMT)),
            ("SerialNumber", serial_number),
            ("UserName", self.config.username or ""),
            ("UserPassword", self.config.password or ""),
            ("strDataList", ""),
        ])
        result = root.find(f".//{{{TEMPURI}}}GetTransactionsLogResult")
        data = root.find(f".//{{{TEMPURI}}}strDataList")
        result_text = (result.text or "").strip() if result is not None else ""
        if data is None:
            # Some installs report bad credentials in the Result element only.
            raise ProviderError(f"GetTransactionsLog returned no strDataList{': ' + result_text if result_text else ''}")
        return parse_transaction_rows(data.text or "", serial_number)


def parse_transaction_rows(text: str, serial_number: str | None) -> list[PunchRecord]:
    """Rows are `PIN<TAB>YYYY-MM-DD HH:MM:SS[<TAB>extra...]`.

    The meaning of the trailing fields is not documented, so they are kept in
    `raw` and not interpreted as a direction. A row that does not parse is
    skipped here and counted by the caller as rejected, never silently fixed."""
    records = []
    for line in text.replace("\r", "").split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("\t")]
        if len(parts) < 2 or not parts[0] or not _TIME_RE.match(parts[1]):
            records.append(PunchRecord(device_user_id="", local_time=datetime.min, device_serial=serial_number,
                                       raw=line))
            continue
        stamp = parts[1].replace("T", " ")
        fmt = DATE_FMT if stamp.count(":") == 2 else "%Y-%m-%d %H:%M"
        records.append(PunchRecord(device_user_id=parts[0], local_time=datetime.strptime(stamp, fmt),
                                   device_serial=serial_number, raw=line))
    return records


class ETimeTrackLiteProvider(EsslSoapProvider):
    name = "etimetracklite"
    product = "eTimeTrackLite Web"


class EBioServerProvider(EsslSoapProvider):
    """eSSL's page labels the same WebAPIService.asmx as eBioServerNew's URL,
    but that is not confirmation that every eBioServer release shares the
    eTimeTrackLite contract. It is kept as its own provider so its WSDL is
    checked independently and it can diverge without touching eTimeTrackLite."""

    name = "ebioserver"
    product = "eBioServer"
