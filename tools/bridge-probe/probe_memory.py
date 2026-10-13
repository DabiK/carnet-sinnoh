"""Read-only Eden GDB probe. No writes, breakpoints, or emulator shutdown packets.

Run it from a computer, with Eden's debugger port forwarded by adb:
    adb forward tcp:39643 tcp:6543
    python3 tools/bridge-probe/probe_memory.py --bdsp
Results land in ``captures/``, which is never committed: they contain raw game memory.
"""

import argparse
import json
import socket
import time
from pathlib import Path


class EdenMemory:
    def __init__(self, host, port):
        self.socket = socket.create_connection((host, port), timeout=5)
        self.socket.settimeout(5)
        self.buffer = b""

    def send(self, command):
        # Explicit allowlist: metadata, memory reads, and resume only.
        if not (
            command.startswith(("qSupported", "qOffsets", "qXfer:libraries:read::", "m")) or command == "c"
        ):
            raise ValueError("Command not allowed")
        body = command.encode("ascii")
        self.socket.sendall(b"$" + body + b"#" + f"{sum(body) & 255:02x}".encode())

    def reply(self):
        while True:
            start = self.buffer.find(b"$")
            end = self.buffer.find(b"#", start + 1) if start >= 0 else -1
            if end >= 0 and len(self.buffer) >= end + 3:
                body = self.buffer[start + 1 : end]
                checksum = int(self.buffer[end + 1 : end + 3], 16)
                self.buffer = self.buffer[end + 3 :]
                if sum(body) & 255 != checksum:
                    self.socket.sendall(b"-")
                    continue
                self.socket.sendall(b"+")
                decoded = bytearray()
                escaped = False
                for value in body:
                    if escaped:
                        decoded.append(value ^ 0x20)
                        escaped = False
                    elif value == 0x7D:
                        escaped = True
                    else:
                        decoded.append(value)
                return decoded.decode("ascii")
            data = self.socket.recv(65536)
            if not data:
                raise ConnectionError("Debugger disconnected")
            self.buffer += data

    def query(self, command):
        self.send(command)
        return self.reply()

    def resume(self):
        self.send("c")
        # Eden acknowledges resume but sends no response packet until a stop.
        while b"+" not in self.buffer:
            data = self.socket.recv(4096)
            if not data:
                raise ConnectionError("No acknowledgement for resume")
            self.buffer += data
        self.buffer = self.buffer[self.buffer.index(b"+") + 1 :]

    def read(self, address, size):
        if not 0 < size <= 4096:
            raise ValueError("Read size must be 1..4096")
        data = self.query(f"m{address:x},{size:x}")
        if len(data) != size * 2:
            raise ValueError(f"Cannot read 0x{address:x}: {data[:100]}")
        return bytes.fromhex(data)

    def pointer(self, base, jumps):
        address = base
        trace = []
        for jump in jumps[:-1]:
            address = int.from_bytes(self.read(address + jump, 8), "little")
            trace.append(hex(address))
            if not address:
                raise ValueError(f"Null pointer in chain: {trace}")
        return address + jumps[-1], trace

    def close(self):
        try:
            self.resume()
        finally:
            self.socket.close()


def probe(args):
    result = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "endpoint": f"{args.host}:{args.port}"}
    client = EdenMemory(args.host, args.port)
    try:
        result["supported"] = client.query("qSupported")
        result["offsets"] = client.query("qOffsets")
        library_xml = ""
        while True:
            chunk = client.query(f"qXfer:libraries:read::{len(library_xml):x},1000")
            if not chunk or chunk[0] not in "ml":
                raise ValueError(f"Invalid module list: {chunk}")
            library_xml += chunk[1:]
            if chunk[0] == "l":
                break
        result["libraries"] = library_xml
        base = int(result["offsets"].split("=", 1)[1], 16)
        result["main_bytes"] = client.read(base, 16).hex()
        client.resume()
        # A second successful query after resume tests the running-game path.
        result["read_while_running"] = client.read(base, 16).hex()
        result["read_while_running_matches"] = result["read_while_running"] == result["main_bytes"]
        if args.bdsp:
            chains = {
                "scene": [0x4C59B50, 0xB8, 0x18],
                "party": [0x4C64DC0, 0xB8, 0x10, 0x808, 0x10, 0x20, 0x20, 0x18, 0x20],
                "opponent": [0x4C64DC0, 0xB8, 0x10, 0x800, 0x58, 0x28, 0x10, 0x20, 0x20, 0x18, 0x20],
            }
            result["bdsp"] = {}
            for name, jumps in chains.items():
                try:
                    address, trace = client.pointer(base, jumps)
                    # BDSP's IL2CPP object holds a stored PB8 (0x148); bytes after
                    # it are object fields, not the PKHeX party-format tail.
                    data = client.read(address, 1 if name == "scene" else 0x148)
                    result["bdsp"][name] = {"address": hex(address), "trace": trace, "bytes": data.hex()}
                except Exception as error:
                    result["bdsp"][name] = {"error": str(error)}
    finally:
        client.close()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=39643, type=int)
    parser.add_argument("--bdsp", action="store_true")
    parser.add_argument("--output", default=str(Path(__file__).parent / "captures/probe-result.json"))
    args = parser.parse_args()
    result = probe(args)
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(
        json.dumps(
            {key: value for key, value in result.items() if key not in ("bdsp", "libraries")}, indent=2
        )
    )
    if "bdsp" in result:
        print(
            "BDSP pointer results:",
            {key: value.get("error", "read succeeded") for key, value in result["bdsp"].items()},
        )
