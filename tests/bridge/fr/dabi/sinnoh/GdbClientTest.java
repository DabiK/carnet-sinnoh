package fr.dabi.sinnoh;

import static fr.dabi.sinnoh.MiniTest.expectEquals;
import static fr.dabi.sinnoh.MiniTest.expectThrows;
import static fr.dabi.sinnoh.MiniTest.expectTrue;
import static fr.dabi.sinnoh.MiniTest.test;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.Arrays;

final class GdbClientTest {

  private static final long TEXT_BASE = 0x1a27766000L;

  private static GdbClient connect(FakeGdbServer server) throws Exception {
    return new GdbClient(new InetSocketAddress(InetAddress.getLoopbackAddress(), server.port()));
  }

  static void run() {
    test("GDB: reads the load address, bytes and pointers", () -> {
      FakeMemory memory = new FakeMemory();
      long address = memory.allocate(16);
      memory.write(address, new byte[] { 1, 2, 3, (byte) 0xFF });
      memory.writePointer(address + 8, 0x2b12345678L);
      try (FakeGdbServer server = new FakeGdbServer(memory, TEXT_BASE, 0); GdbClient gdb = connect(server)) {
        expectEquals(TEXT_BASE, gdb.textBase());
        expectEquals("[1, 2, 3, -1]", Arrays.toString(gdb.read(address, 4)));
        expectEquals(0x2b12345678L, gdb.readPointer(address + 8));
      }
    });

    test("GDB: refuses null pointers and oversized reads before touching the socket", () -> {
      FakeMemory memory = new FakeMemory();
      long address = memory.allocate(16);
      try (FakeGdbServer server = new FakeGdbServer(memory, TEXT_BASE, 0); GdbClient gdb = connect(server)) {
        expectThrows("Invalid memory range", () -> gdb.read(0, 8));
        expectThrows("Invalid memory range", () -> gdb.read(0xFFFF, 8));
        expectThrows("Invalid memory range", () -> gdb.read(0x8000000000L, 8));
        expectThrows("Invalid memory range", () -> gdb.read(address, 0));
        expectThrows("Invalid memory range", () -> gdb.read(address, GdbClient.MAX_READ_SIZE + 1));
        expectTrue(server.commands().isEmpty(), "nothing was sent: " + server.commands());
      }
    });

    test("GDB: reports memory the emulator cannot read", () -> {
      try (FakeGdbServer server = new FakeGdbServer(new FakeMemory(), TEXT_BASE, 0); GdbClient gdb = connect(server)) {
        expectThrows("Memory unavailable", () -> gdb.read(0x2b00000000L, 8));
      }
    });

    test("GDB: resumes the game when the connection is closed", () -> {
      try (FakeGdbServer server = new FakeGdbServer(new FakeMemory(), TEXT_BASE, 0)) {
        try (GdbClient gdb = connect(server)) {
          gdb.textBase();
        }
        expectEquals("[qOffsets, c]", server.commands().toString());
      }
    });
  }

  private GdbClientTest() {}
}
