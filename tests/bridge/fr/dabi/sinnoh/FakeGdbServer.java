package fr.dabi.sinnoh;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Minimal GDB stub standing in for Eden's: acknowledgements, {@code qOffsets}, memory reads and
 * resume. Every command received is recorded so tests can prove the bridge sends nothing else.
 */
final class FakeGdbServer implements AutoCloseable {

  private final ServerSocket server;
  private final FakeMemory memory;
  private final long textBase;
  private final List<String> commands = new CopyOnWriteArrayList<>();
  private volatile boolean corruptChecksums;
  private volatile int connections;

  FakeGdbServer(FakeMemory memory, long textBase, int port) throws IOException {
    this.memory = memory;
    this.textBase = textBase;
    this.server = new ServerSocket(port, 1, InetAddress.getLoopbackAddress());
    Thread thread = new Thread(this::acceptLoop, "FakeGdbServer");
    thread.setDaemon(true);
    thread.start();
  }

  int port() {
    return server.getLocalPort();
  }

  List<String> commands() {
    return commands;
  }

  int connections() {
    return connections;
  }

  void corruptChecksums(boolean corrupt) {
    corruptChecksums = corrupt;
  }

  private void acceptLoop() {
    while (!server.isClosed()) {
      try (Socket socket = server.accept()) {
        connections++;
        serve(socket.getInputStream(), socket.getOutputStream());
      } catch (IOException closed) {
        // The client went away or the server is shutting down.
      }
    }
  }

  private void serve(InputStream in, OutputStream out) throws IOException {
    for (;;) {
      int next;
      do {
        next = in.read();
        if (next < 0) return;
      } while (next != '$');
      StringBuilder command = new StringBuilder();
      while ((next = in.read()) != '#') {
        if (next < 0) return;
        command.append((char) next);
      }
      if (in.read() < 0 || in.read() < 0) return;
      commands.add(command.toString());
      out.write('+');
      String reply = reply(command.toString());
      if (reply != null) out.write(packet(reply));
      out.flush();
    }
  }

  private String reply(String command) {
    if (command.equals("c")) return null; // Eden only replies to a resume at the next stop.
    if (command.equals("qOffsets")) return "TextSeg=" + Long.toHexString(textBase);
    if (command.startsWith("m")) {
      String[] range = command.substring(1).split(",");
      byte[] bytes = memory.read(Long.parseLong(range[0], 16), Integer.parseInt(range[1], 16));
      if (bytes == null) return "E01";
      StringBuilder hex = new StringBuilder();
      for (byte value : bytes) hex.append(String.format(Locale.ROOT, "%02x", value & 255));
      return hex.toString();
    }
    return "";
  }

  private byte[] packet(String body) {
    int sum = 0;
    for (byte value : body.getBytes(StandardCharsets.US_ASCII)) sum += value & 255;
    if (corruptChecksums) sum++;
    return ("$" + body + "#" + String.format(Locale.ROOT, "%02x", sum & 255)).getBytes(StandardCharsets.US_ASCII);
  }

  @Override
  public void close() throws IOException {
    server.close();
  }
}
