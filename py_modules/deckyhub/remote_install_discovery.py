"""Advertise the active Remote Install listener on its LAN interface."""

from ipaddress import IPv4Address
from secrets import token_hex
from typing import Any

SERVICE_TYPE = "_deckyhub._udp.local."


async def advertise(address: str, port: int) -> Any:
    from zeroconf import IPVersion, ServiceInfo
    from zeroconf.asyncio import AsyncZeroconf

    label = f"DeckyHub-{token_hex(4)}"
    info = ServiceInfo(
        SERVICE_TYPE,
        f"{label}.{SERVICE_TYPE}",
        addresses=[IPv4Address(address).packed],
        port=port,
        server=f"{label.lower()}.local.",
    )
    discovery = AsyncZeroconf(interfaces=[address], ip_version=IPVersion.V4Only)
    try:
        await (await discovery.async_register_service(info))
    except BaseException:
        await discovery.async_close()
        raise
    return discovery
