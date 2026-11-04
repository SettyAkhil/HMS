"""The eSSL SOAP adapter against a fake server speaking the documented shape."""

from datetime import datetime

import httpx
import pytest

from app.providers.base import ProviderConfig, ProviderError, Unsupported
from app.providers.essl_soap import ETimeTrackLiteProvider, parse_transaction_rows

WSDL = b"""<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" targetNamespace="http://tempuri.org/">
  <wsdl:portType name="WebAPIServiceSoap">
    <wsdl:operation name="GetTransactionsLog"/>
    <wsdl:operation name="AddEmployee"/>
    <wsdl:operation name="GetCommandStatus"/>
  </wsdl:portType>
</wsdl:definitions>"""


def soap_response(data: str, result: str = "true") -> bytes:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<GetTransactionsLogResponse xmlns="http://tempuri.org/">
<GetTransactionsLogResult>{result}</GetTransactionsLogResult><strDataList>{data}</strDataList>
</GetTransactionsLogResponse></soap:Body></soap:Envelope>""".encode()


def make(handler, operations=None):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    cfg = ProviderConfig(base_url="http://essl.local:81", username="web", password="p&ss<word>")
    return ETimeTrackLiteProvider(cfg, operations, client=client)


def test_connection_reads_wsdl_operations():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, content=WSDL)

    result = make(handler).test_connection()
    assert result.ok
    assert "GetTransactionsLog" in result.operations
    assert str(seen[0].url) == "http://essl.local:81/WebAPIService.asmx?WSDL="


def test_connection_fails_without_transactions_operation():
    wsdl = WSDL.replace(b'<wsdl:operation name="GetTransactionsLog"/>', b"")
    result = make(lambda r: httpx.Response(200, content=wsdl)).test_connection()
    assert not result.ok and "GetTransactionsLog" in result.message


def test_connection_rejects_non_wsdl_and_unreachable():
    assert not make(lambda r: httpx.Response(200, content=b"<html>login</html>junk")).test_connection().ok

    def down(request):
        raise httpx.ConnectError("refused")

    assert "Cannot reach" in make(down).test_connection().message


def test_refuses_undeclared_operation_before_any_request():
    calls = []
    provider = make(lambda r: calls.append(r) or httpx.Response(200), operations=[])
    with pytest.raises(Unsupported):
        provider.fetch_transactions("SN1", datetime(2026, 1, 1), datetime(2026, 1, 2))
    assert calls == []


def test_unverified_operations_stay_unsupported_even_if_declared():
    provider = make(lambda r: httpx.Response(200), operations=["GetTransactionsLog", "AddEmployee"])
    with pytest.raises(Unsupported):
        provider.create_employee("1001", "Asha")


def test_get_transactions_request_and_parse():
    captured = {}

    def handler(request):
        captured["body"] = request.content.decode()
        captured["action"] = request.headers["SOAPAction"]
        return httpx.Response(200, content=soap_response(
            "1002\t2026-01-05 07:30:30\t\n1003\t2026-01-05 07:41:00\tIN\ngarbage line\n"))

    provider = make(handler, operations=["GetTransactionsLog"])
    rows = provider.fetch_transactions("SN-9", datetime(2026, 1, 5, 0, 0), datetime(2026, 1, 5, 23, 59, 59))
    body = captured["body"]
    assert captured["action"] == '"http://tempuri.org/GetTransactionsLog"'
    assert "<FromDateTime>2026-01-05 00:00:00</FromDateTime>" in body
    assert "<SerialNumber>SN-9</SerialNumber>" in body
    assert "<UserPassword>p&amp;ss&lt;word&gt;</UserPassword>" in body  # escaped, not injected
    good = [r for r in rows if r.device_user_id]
    assert [(r.device_user_id, r.local_time) for r in good] == [
        ("1002", datetime(2026, 1, 5, 7, 30, 30)), ("1003", datetime(2026, 1, 5, 7, 41)),
    ]
    assert all(r.direction is None for r in good)  # undocumented trailing field is not guessed at
    assert any(r.raw == "garbage line" and not r.device_user_id for r in rows)


def test_soap_fault_and_missing_datalist_raise():
    fault = b"""<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault>
    <faultcode>soap:Server</faultcode><faultstring>Invalid user</faultstring></soap:Fault></soap:Body></soap:Envelope>"""
    provider = make(lambda r: httpx.Response(500, content=fault), operations=["GetTransactionsLog"])
    with pytest.raises(ProviderError, match="Invalid user"):
        provider.fetch_transactions("SN", datetime(2026, 1, 1), datetime(2026, 1, 2))

    empty = b"""<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
    <GetTransactionsLogResponse xmlns="http://tempuri.org/"><GetTransactionsLogResult>Invalid credentials
    </GetTransactionsLogResult></GetTransactionsLogResponse></soap:Body></soap:Envelope>"""
    provider = make(lambda r: httpx.Response(200, content=empty), operations=["GetTransactionsLog"])
    with pytest.raises(ProviderError, match="Invalid credentials"):
        provider.fetch_transactions("SN", datetime(2026, 1, 1), datetime(2026, 1, 2))


def test_xml_bombs_are_refused():
    bomb = b"""<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>
    <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/">&lol2;</wsdl:definitions>"""
    assert not make(lambda r: httpx.Response(200, content=bomb)).test_connection().ok


def test_parse_handles_crlf_and_minutes_only():
    rows = parse_transaction_rows("7\t2026-02-01 22:10\r\n\r\n", "SN")
    assert rows[0].local_time == datetime(2026, 2, 1, 22, 10)
