package fr.dabi.sinnoh;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Read-only client for a GDB Remote Serial Protocol stub.
 *
 * <p>Only three packets can leave this class: {@code qOffsets}, memory reads and resume. Memory
 * writes, breakpoints and register access are rejected before reaching the socket.
 */
final class GdbClient implements AutoCloseable {

  /** Largest read the bridge issues in one packet. */
  static final int MAX_READ_SIZE = 4096;

  private static final int TIMEOUT_MS = 5000;
  private static final int MAX_REPLY_LENGTH = 8192;
  private static final long LOWEST_ADDRESS = 0x10000L;
  private static final long HIGHEST_ADDRESS = 0x7FFFFFFFFFL;
  private static final String OFFSETS_QUERY = "qOffsets";
  private static final String RESUME = "c";
  private static final Pattern MEMORY_READ = Pattern.compile("m[0-9a-f]+,[0-9a-f]+");

  private final Socket socket = new Socket();
  private final InputStream in;
  private final OutputStream out;

  GdbClient(InetSocketAddress endpoint) throws IOException {
    socket.connect(endpoint, TIMEOUT_MS);
    socket.setTcpNoDelay(true);
    socket.setSoTimeout(TIMEOUT_MS);
    in = socket.getInputStream();
    out = socket.getOutputStream();
  }

  /** Load address of the game's main executable, parsed from {@code TextSeg=<hex>}. */
  long textBase() throws IOException {
    String offsets = query(OFFSETS_QUERY);
    return Long.parseLong(offsets.substring(offsets.indexOf('=') + 1).split(";")[0], 16);
  }

  byte[] read(long address, int size) throws IOException {
    if (address < LOWEST_ADDRESS || address > HIGHEST_ADDRESS || size < 1 || size > MAX_READ_SIZE) {
      throw new IOException("Invalid memory range");
    }
    String hex = query("m" + Long.toHexString(address) + "," + Integer.toHexString(size));
    if (hex.length() != size * 2) throw new IOException("Memory unavailable");
    byte[] data = new byte[size];
    for (int i = 0; i < size; i++) data[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    return data;
  }

  long readPointer(long address) throws IOException {
    return Bytes.u64(read(address, 8), 0);
  }

  /**
   * Lets the game run. Attaching a debugger halts it, so this is sent right after connecting and
   * again before disconnecting. The stub acknowledges but sends no reply until the next stop.
   */
  void resume() throws IOException {
    send(RESUME);
    int next;
    do {
      next = in.read();
      if (next < 0) throw new IOException("Disconnected");
    } while (next != '+');
  }

  private String query(String command) throws IOException {
    send(command);
    int next;
    do {
      next = in.read();
      if (next < 0) throw new IOException("Disconnected");
    } while (next != '$');
    StringBuilder body = new StringBuilder();
    int sum = 0;
    while ((next = in.read()) != '#') {
      if (next < 0) throw new IOException("Disconnected");
      if (body.length() > MAX_REPLY_LENGTH) throw new IOException("Oversized packet");
      body.append((char) next);
      sum += next;
    }
    int first = in.read();
    int second = in.read();
    if (first < 0 || second < 0) throw new IOException("Incomplete checksum");
    int checksum = Integer.parseInt("" + (char) first + (char) second, 16);
    if ((sum & 255) != checksum) throw new IOException("Invalid RSP checksum");
    out.write('+');
    out.flush();
    return body.toString();
  }

  private void send(String command) throws IOException {
    boolean allowed = command.equals(OFFSETS_QUERY) || command.equals(RESUME) || MEMORY_READ.matcher(command).matches();
    if (!allowed) throw new IllegalArgumentException("Forbidden command");
    int sum = 0;
    for (byte value : command.getBytes(StandardCharsets.US_ASCII)) sum += value & 255;
    String packet = "$" + command + "#" + String.format(Locale.ROOT, "%02x", sum & 255);
    out.write(packet.getBytes(StandardCharsets.US_ASCII));
    out.flush();
  }

  @Override
  public void close() throws IOException {
    try {
      resume();
    } finally {
      socket.close();
    }
  }
}
