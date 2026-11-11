"""Opt-in WebTransport listener; missing dependencies never expose an insecure fallback."""

import asyncio
import datetime
import hashlib
import ipaddress
import json
import platform
import socket
import sys
import time
from collections import deque
from pathlib import Path

MAX_MESSAGE = 16384
MAX_STREAMS = 16
MAX_CONNECTIONS = 32
MAX_REQUESTS_PER_MINUTE = 120


def lan_address():
    # This determines the selected route without transmitting application data.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.connect(("192.0.2.1", 9))
        address = sock.getsockname()[0]
    ip = ipaddress.ip_address(address)
    private_networks = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    if not any(ip in ipaddress.ip_network(network) for network in private_networks):
        raise OSError("No private LAN address available")
    return address


async def start_transport(service):
    major, minor = sys.version_info[:2]
    vendor = Path(__file__).resolve().parent.parent / "deckyhub_vendor" / f"cp{major}{minor}"
    if vendor.is_dir() and sys.platform == "linux" and platform.machine() in ("x86_64", "AMD64"):
        if str(vendor) not in sys.path:
            sys.path.insert(0, str(vendor))
    from aioquic.asyncio import QuicConnectionProtocol, serve
    from aioquic.h3.connection import H3_ALPN, H3Connection
    from aioquic.h3.events import HeadersReceived, WebTransportStreamDataReceived
    from aioquic.quic.configuration import QuicConfiguration
    from aioquic.quic.events import ConnectionTerminated, ProtocolNegotiated
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    address = lan_address()
    now = datetime.datetime.now(datetime.timezone.utc)
    identity = service.transport_identity
    if identity is None or identity[0].not_valid_after_utc <= now:
        key = ec.generate_private_key(ec.SECP256R1())
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "DeckyHub Remote Install")])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(minutes=5))
            .not_valid_after(now + datetime.timedelta(days=7))
            # Chromium requires certificate extensions even when it pins the fingerprint.
            # Keep the name independent of the current LAN address.
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("deckyhub.local")]), critical=False)
            .sign(key, hashes.SHA256())
        )
        service.transport_identity = cert, key
    else:
        cert, key = identity
    fingerprint = hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()

    active_connections = set()

    class Protocol(QuicConnectionProtocol):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.http = None
            self.sessions = set()
            self.streams = {}
            self.responses = {}
            self.request_times = deque()
            self.over_limit = len(active_connections) >= MAX_CONNECTIONS
            if not self.over_limit:
                active_connections.add(self)

        def quic_event_received(self, event):
            if isinstance(event, ConnectionTerminated):
                active_connections.discard(self)
                self.sessions.clear()
                self.streams.clear()
                for task in self.responses.values():
                    task.cancel()
                self.responses.clear()
                return
            if self.over_limit:
                self.close(error_code=0x10, reason_phrase="connection limit reached")
                return
            if isinstance(event, ProtocolNegotiated) and event.alpn_protocol in H3_ALPN:
                self.http = H3Connection(self._quic, enable_webtransport=True)
            if self.http is None:
                return
            for e in self.http.handle_event(event):
                if isinstance(e, HeadersReceived):
                    headers = dict(e.headers)
                    allowed = (
                        headers.get(b":method") == b"CONNECT"
                        and headers.get(b":protocol") == b"webtransport"
                        and headers.get(b":path") == b"/remote-install"
                        and headers.get(b"origin") == b"https://deckyhub.com"
                        and sum(name == b"origin" for name, _ in e.headers) == 1
                        and len(self.sessions) < 2
                    )
                    self.http.send_headers(
                        e.stream_id,
                        [(b":status", b"200" if allowed else b"403"), (b"sec-webtransport-http3-draft", b"draft02")],
                        end_stream=not allowed,
                    )
                    if allowed:
                        self.sessions.add(e.stream_id)
                    self.transmit()
                elif isinstance(e, WebTransportStreamDataReceived) and e.session_id in self.sessions:
                    if e.stream_id in self.responses:
                        continue
                    if e.stream_id not in self.streams and len(self.streams) >= MAX_STREAMS:
                        self._quic.reset_stream(e.stream_id, 0x10)
                        continue
                    data = self.streams.setdefault(e.stream_id, bytearray())
                    data.extend(e.data)
                    if len(data) > MAX_MESSAGE:
                        del self.streams[e.stream_id]
                        self._quic.reset_stream(e.stream_id, 0x10)
                    elif e.stream_ended:
                        self.responses[e.stream_id] = asyncio.create_task(self.respond(e.stream_id, bytes(data)))
                    self.transmit()

        async def respond(self, stream_id, data):
            try:
                now = time.monotonic()
                while self.request_times and now - self.request_times[0] >= 60:
                    self.request_times.popleft()
                if len(self.request_times) >= MAX_REQUESTS_PER_MINUTE:
                    raise ValueError("request rate limit")
                self.request_times.append(now)
                message = json.loads(data.decode("utf-8"))
                result = {"ok": True, **await service.remote_async(message)}
                payload = json.dumps(result).encode()
                if len(payload) > MAX_MESSAGE:
                    raise ValueError("response is too large")
            except Exception:
                payload = b'{"ok":false,"error":"Request rejected"}'
            finally:
                self.streams.pop(stream_id, None)
                self.responses.pop(stream_id, None)
            self._quic.send_stream_data(stream_id, payload, end_stream=True)
            self.transmit()

    config = QuicConfiguration(
        is_client=False,
        alpn_protocols=H3_ALPN,
        max_datagram_frame_size=65536,
        max_data=262144,
        max_stream_data=MAX_MESSAGE,
        idle_timeout=30,
    )
    config.certificate, config.private_key = cert, key
    server = await serve(address, 8765, configuration=config, create_protocol=Protocol, retry=True)
    return server, f"https://{address}:8765/remote-install", fingerprint
