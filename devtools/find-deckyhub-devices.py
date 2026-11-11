"""List DeckyHub devices advertising Remote Install on the local network."""

import argparse
import ipaddress
import sys
import time
from pathlib import Path

from zeroconf import IPVersion, ServiceBrowser, ServiceListener, Zeroconf

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))
from deckyhub.remote_install_discovery import SERVICE_TYPE


class DeviceListener(ServiceListener):
    def __init__(self) -> None:
        self.names: set[str] = set()

    def add_service(self, _zeroconf: Zeroconf, _type: str, name: str) -> None:
        self.names.add(name)

    def update_service(self, zeroconf: Zeroconf, type_: str, name: str) -> None:
        self.add_service(zeroconf, type_, name)

    def remove_service(self, _zeroconf: Zeroconf, _type: str, name: str) -> None:
        self.names.discard(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    listener = DeviceListener()
    devices = set()
    with Zeroconf(ip_version=IPVersion.V4Only) as discovery:
        browser = ServiceBrowser(discovery, SERVICE_TYPE, listener)
        try:
            time.sleep(3)
        finally:
            browser.cancel()
        for name in sorted(listener.names):
            info = discovery.get_service_info(SERVICE_TYPE, name, timeout=500)
            if info and info.port == 8765:
                for address in info.parsed_addresses(IPVersion.V4Only):
                    if any(
                        ipaddress.IPv4Address(address) in ipaddress.IPv4Network(network)
                        for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
                    ):
                        devices.add(f"{address}:{info.port}")
    if not devices:
        print("No devices found. Turn on Pair mode in DeckyHub and check that both devices are on the same network.")
    else:
        for device in sorted(devices):
            print(device)
        print("Confirm the address and certificate fingerprint on your device before pairing.")


if __name__ == "__main__":
    main()
