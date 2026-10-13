package fr.dabi.sinnoh.bridge;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Diagnostic app: connects directly to Eden on the Thor, never through the Mac. */
public final class ProbeActivity extends Activity {

  private volatile boolean active;
  private TextView status;
  private Thread worker;
  private static final long[] PARTY = { 0x4C64DC0, 0xB8, 0x10, 0x808, 0x10, 0x20, 0x20, 0x18, 0x20 };
  private static final long[] OPPONENT = { 0x4C64DC0, 0xB8, 0x10, 0x800, 0x58, 0x28, 0x10, 0x20, 0x20, 0x18, 0x20 };
  // Gen 8 storage block order, documented by PKHeX's PokeCrypto format decoder.
  private static final int[][] ORDER = {
    { 0, 1, 2, 3 },
    { 0, 1, 3, 2 },
    { 0, 2, 1, 3 },
    { 0, 3, 1, 2 },
    { 0, 2, 3, 1 },
    { 0, 3, 2, 1 },
    { 1, 0, 2, 3 },
    { 1, 0, 3, 2 },
    { 2, 0, 1, 3 },
    { 3, 0, 1, 2 },
    { 2, 0, 3, 1 },
    { 3, 0, 2, 1 },
    { 1, 2, 0, 3 },
    { 1, 3, 0, 2 },
    { 2, 1, 0, 3 },
    { 3, 1, 0, 2 },
    { 2, 3, 0, 1 },
    { 3, 2, 0, 1 },
    { 1, 2, 3, 0 },
    { 1, 3, 2, 0 },
    { 2, 1, 3, 0 },
    { 3, 1, 2, 0 },
    { 2, 3, 1, 0 },
    { 3, 2, 1, 0 },
  };

  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().getDecorView().setSystemUiVisibility(5894);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setPadding(30, 22, 30, 30);
    layout.setBackgroundColor(Color.rgb(14, 16, 21));
    TextView title = new TextView(this);
    title.setText("Sinnoh · test du bridge mémoire");
    title.setTextColor(Color.rgb(204, 184, 255));
    title.setTextSize(23);
    layout.addView(title);
    status = new TextView(this);
    status.setTextColor(Color.WHITE);
    status.setTextSize(17);
    status.setPadding(0, 16, 0, 0);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(status);
    layout.addView(scroll);
    setContentView(layout);
  }

  @Override
  public void onResume() {
    super.onResume();
    active = true;
    if (worker != null && worker.isAlive()) return;
    worker = new Thread(this::poll, "EdenMemoryProbe");
    worker.start();
  }

  @Override
  public void onPause() {
    active = false;
    super.onPause();
  }

  private void show(String text) {
    runOnUiThread(() -> status.setText(text));
  }

  private void poll() {
    try (Client client = new Client()) {
      String offset = client.query("qOffsets");
      long base = Long.parseLong(offset.substring(offset.indexOf('=') + 1), 16);
      client.resume();
      int count = 0;
      while (active) {
        long start = System.nanoTime();
        String player = readPokemon(client, base, PARTY);
        String opponent = readPokemon(client, base, OPPONENT);
        long duration = (System.nanoTime() - start) / 1000000;
        String text =
          "LOCAL · 127.0.0.1:6543 · sans root\n" +
          "Lecture #" +
          ++count +
          " · " +
          duration +
          " ms\n\n" +
          "TON PREMIER POKÉMON\n" +
          player +
          "\n\n" +
          "DONNÉES ADVERSES\n" +
          opponent +
          "\n\n" +
          "Prototype en lecture seule. Présence d’un combat et PV\n" +
          "instantanés à valider : une fiche peut rester en mémoire.";
        show(text);
        android.util.Log.i(
          "SinnohBridge",
          "sample=" +
            count +
            " durationMs=" +
            duration +
            " player=" +
            player.replace('\n', ' ') +
            " opponent=" +
            opponent.replace('\n', ' ')
        );
        Thread.sleep(500);
      }
    } catch (Exception error) {
      show("Connexion arrêtée : " + error.getMessage() + "\n\nEden doit tourner avec son debugger activé.");
      android.util.Log.e("SinnohBridge", "Probe failed", error);
    }
  }

  private static String readPokemon(Client client, long base, long[] jumps) {
    try {
      long address = base;
      long pokemonObject = 0;
      for (int i = 0; i < jumps.length - 1; i++) {
        address = number(client.read(address + jumps[i], 8), 0, 8);
        if (address == 0) return "Aucune donnée disponible";
        if (i == jumps.length - 4) pokemonObject = address;
      }
      byte[] data = client.read(address + jumps[jumps.length - 1], 0x148);
      long seed = number(data, 0, 4);
      if (number(data, 0x70, 2) != 0 || number(data, 0x110, 2) != 0) {
        long random = seed;
        for (int i = 8; i < data.length; i += 2) {
          random = (random * 0x41C64E6DL + 0x6073) & 0xFFFFFFFFL;
          int value = (int) number(data, i, 2) ^ (int) (random >>> 16);
          data[i] = (byte) value;
          data[i + 1] = (byte) (value >>> 8);
        }
        byte[] copy = data.clone();
        int order = (int) ((seed >>> 13) & 31) % 24;
        for (int i = 0; i < 4; i++) System.arraycopy(copy, 8 + ORDER[order][i] * 80, data, 8 + i * 80, 80);
      }
      int checksum = 0;
      for (int i = 8; i < 0x148; i += 2) checksum += number(data, i, 2);
      if (
        (checksum & 65535) != number(data, 6, 2) || number(data, 4, 2) != 0
      ) return "Donnée transitoire · checksum invalide";
      int species = (int) number(data, 8, 2);
      if (species == 0 || species > 493) return "Espèce invalide";
      String name = new String(data, 0x58, 26, StandardCharsets.UTF_16LE).split("\u0000", 2)[0];
      long iv = number(data, 0x8C, 4);
      // The separately allocated 16-byte CalcData array holds party stats.
      // Appending bytes after CoreData would read unrelated object memory.
      long calc = number(client.read(pokemonObject + 0x18, 8), 0, 8);
      byte[] stats = client.read(calc + 0x20, 16);
      long random = seed;
      for (int i = 0; i < 16; i += 2) {
        random = (random * 0x41C64E6DL + 0x6073) & 0xFFFFFFFFL;
        int value = (int) number(stats, i, 2) ^ (int) (random >>> 16);
        stats[i] = (byte) value;
        stats[i + 1] = (byte) (value >>> 8);
      }
      int level = stats[0] & 255;
      if (
        level < 1 || level > 100 || number(stats, 2, 2) < 1 || number(stats, 2, 2) > 999
      ) return "Statistiques transitoires · attendre";
      return (
        name +
        " · n° " +
        species +
        " · sexe " +
        new String[] { "♂", "♀", "—", "?" }[(data[0x22] >>> 2) & 3] +
        "\nNiveau " +
        level +
        " · PV fiche " +
        number(data, 0x8A, 2) +
        " / " +
        number(stats, 2, 2) +
        "\nStats [Atk/Déf/Vit/AS/DS] : " +
        number(stats, 4, 2) +
        " / " +
        number(stats, 6, 2) +
        " / " +
        number(stats, 8, 2) +
        " / " +
        number(stats, 10, 2) +
        " / " +
        number(stats, 12, 2) +
        "\nIV [PV/Atk/Déf/Vit/AS/DS] : " +
        (iv & 31) +
        " / " +
        ((iv >>> 5) & 31) +
        " / " +
        ((iv >>> 10) & 31) +
        " / " +
        ((iv >>> 15) & 31) +
        " / " +
        ((iv >>> 20) & 31) +
        " / " +
        ((iv >>> 25) & 31) +
        "\nAttaques (ID) : " +
        number(data, 0x72, 2) +
        ", " +
        number(data, 0x74, 2) +
        ", " +
        number(data, 0x76, 2) +
        ", " +
        number(data, 0x78, 2)
      );
    } catch (Exception error) {
      return "Indisponible : " + error.getMessage();
    }
  }

  private static long number(byte[] bytes, int offset, int size) {
    long result = 0;
    for (int i = 0; i < size; i++) result |= (bytes[offset + i] & 255L) << (8 * i);
    return result;
  }

  private static final class Client implements AutoCloseable {

    private final Socket socket = new Socket();
    private final InputStream in;
    private final OutputStream out;

    Client() throws Exception {
      socket.connect(new InetSocketAddress("127.0.0.1", 6543), 5000);
      socket.setTcpNoDelay(true);
      socket.setSoTimeout(5000);
      in = socket.getInputStream();
      out = socket.getOutputStream();
    }

    private void send(String command) throws Exception {
      if (
        !(command.equals("qOffsets") || command.equals("c") || command.matches("m[0-9a-f]+,[0-9a-f]+"))
      ) throw new IllegalArgumentException("Forbidden command");
      int sum = 0;
      for (byte b : command.getBytes(StandardCharsets.US_ASCII)) sum += b & 255;
      out.write(
        ("$" + command + "#" + String.format(Locale.ROOT, "%02x", sum & 255)).getBytes(StandardCharsets.US_ASCII)
      );
      out.flush();
    }

    String query(String command) throws Exception {
      send(command);
      int next;
      do {
        next = in.read();
        if (next < 0) throw new Exception("Disconnected");
      } while (next != '$');
      StringBuilder body = new StringBuilder();
      int sum = 0;
      while ((next = in.read()) != '#') {
        if (next < 0) throw new Exception("Disconnected");
        body.append((char) next);
        sum += next;
      }
      int first = in.read(),
        second = in.read();
      if (first < 0 || second < 0) throw new Exception("Incomplete checksum");
      int checksum = Integer.parseInt("" + (char) first + (char) second, 16);
      if ((sum & 255) != checksum) throw new Exception("Invalid RSP checksum");
      out.write('+');
      out.flush();
      return body.toString();
    }

    byte[] read(long address, int size) throws Exception {
      String value = query("m" + Long.toHexString(address) + "," + Integer.toHexString(size));
      if (value.length() != size * 2) throw new Exception("Memory unavailable");
      byte[] data = new byte[size];
      for (int i = 0; i < size; i++) data[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
      return data;
    }

    void resume() throws Exception {
      send("c");
      int value;
      do {
        value = in.read();
        if (value < 0) throw new Exception("Disconnected");
      } while (value != '+');
    }

    @Override
    public void close() throws Exception {
      try {
        resume();
      } finally {
        socket.close();
      }
    }
  }
}
