package fr.dabi.sinnoh;

import java.net.InetSocketAddress;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Publishes what the game shows right now, by polling Eden's debugger from a background thread.
 * Strictly read-only: see {@link GdbClient}.
 *
 * <p>Every snapshot has a {@code status}: {@code connecting}, {@code idle} (no battle), {@code
 * battle}, {@code error} (retrying) or {@code off}.
 */
final class MemoryBridge {

  interface Listener {
    void update(JSONObject snapshot);
  }

  /** Eden's GDB stub, reachable only from the console itself. */
  static final InetSocketAddress EDEN = new InetSocketAddress("127.0.0.1", 6543);

  private static final long POLL_INTERVAL_MS = 500;
  /** Zone, bag and party change slowly and cost many reads. */
  private static final long WORLD_REFRESH_MS = 2500;
  private static final long RETRY_DELAY_MS = 2000;

  private final Listener listener;
  private final InetSocketAddress endpoint;
  private volatile boolean active;
  private Thread worker;

  MemoryBridge(Listener listener) {
    this(listener, EDEN);
  }

  MemoryBridge(Listener listener, InetSocketAddress endpoint) {
    this.listener = listener;
    this.endpoint = endpoint;
  }

  synchronized void start() {
    active = true;
    if (worker != null && worker.isAlive()) return;
    worker = new Thread(this::poll, "SinnohMemory");
    worker.start();
  }

  void stop() {
    active = false;
  }

  private void poll() {
    publishStatus("connecting", "Connexion à Eden…");
    while (active) {
      try (GdbClient gdb = new GdbClient(endpoint)) {
        gdb.resume();
        sample(new BdspMemory(gdb));
      } catch (Exception error) {
        if (!active) continue;
        publishStatus("error", "Lecture indisponible · " + error.getMessage());
        try {
          Thread.sleep(RETRY_DELAY_MS);
        } catch (InterruptedException ignored) {
          // Nothing interrupts the worker; the loop condition decides when to stop.
        }
      }
    }
    publishStatus("off", "Bridge désactivé");
  }

  /** Samples one connection until the bridge is stopped or a read fails. */
  private void sample(BdspMemory game) throws Exception {
    JSONObject world = null;
    long worldReadAt = 0;
    while (active) {
      long start = System.currentTimeMillis();
      long work = game.playerWork();
      if (start - worldReadAt > WORLD_REFRESH_MS) {
        world = readWorld(game, work);
        worldReadAt = start;
      }
      if (!game.isBattling(work)) {
        game.forgetBattle();
        listener.update(idle("En attente d’un combat", world));
      } else {
        JSONArray player = new JSONArray();
        JSONArray opponents = new JSONArray();
        game.readActiveBattlers(player, opponents);
        // A battle that ended while it was being read must not be shown.
        if (!game.isBattling(work)) {
          game.forgetBattle();
          listener.update(idle("Combat terminé", world));
        } else {
          long now = System.currentTimeMillis();
          listener.update(
            new JSONObject()
              .put("status", "battle")
              .put("world", world)
              .put("player", player)
              .put("opponents", opponents)
              .put("timestamp", now)
              .put("durationMs", now - start)
          );
        }
      }
      Thread.sleep(POLL_INTERVAL_MS);
    }
  }

  /** A failed world read is reported inside the snapshot: battle tracking carries on. */
  private static JSONObject readWorld(BdspMemory game, long work) throws JSONException {
    try {
      return game.readWorld(work);
    } catch (Exception error) {
      return new JSONObject().put("status", "error").put("message", error.getMessage());
    }
  }

  private static JSONObject idle(String message, JSONObject world) throws JSONException {
    return new JSONObject()
      .put("status", "idle")
      .put("message", message)
      .put("world", world)
      .put("timestamp", System.currentTimeMillis());
  }

  private void publishStatus(String status, String message) {
    try {
      listener.update(
        new JSONObject().put("status", status).put("message", message).put("timestamp", System.currentTimeMillis())
      );
    } catch (Exception ignored) {
      // A status update must never take the worker thread down.
    }
  }
}
