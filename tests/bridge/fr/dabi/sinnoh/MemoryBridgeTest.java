package fr.dabi.sinnoh;

import static fr.dabi.sinnoh.MiniTest.expectEquals;
import static fr.dabi.sinnoh.MiniTest.expectTrue;
import static fr.dabi.sinnoh.MiniTest.test;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.json.JSONObject;

/** The whole bridge against a fake Eden: same sockets and protocol as on the console. */
final class MemoryBridgeTest {

  private static final long TIMEOUT_MS = 8000;

  /** A bridge running against a memory image, and the snapshots it publishes. */
  private static final class Session implements AutoCloseable {

    final BdspImage game;
    final FakeGdbServer eden;
    final MemoryBridge bridge;
    private final BlockingQueue<JSONObject> snapshots = new LinkedBlockingQueue<>();

    Session(BdspImage game) throws Exception {
      this.game = game;
      this.eden = new FakeGdbServer(game.memory, BdspImage.TEXT_BASE, 0);
      this.bridge = newBridge(snapshots::add, eden.port());
      bridge.start();
    }

    /** First published snapshot matching the condition. */
    JSONObject await(Predicate<JSONObject> condition) throws Exception {
      long deadline = System.currentTimeMillis() + TIMEOUT_MS;
      JSONObject last = null;
      for (;;) {
        JSONObject next = snapshots.poll(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
        if (next == null) throw new AssertionError("expected snapshot never published; last one: " + last);
        if (condition.test(next)) return next;
        last = next;
      }
    }

    JSONObject awaitStatus(String status) throws Exception {
      return await(snapshot -> status.equals(snapshot.optString("status")));
    }

    /** Drops snapshots published before a change to the memory image. */
    void forgetPublished() {
      snapshots.clear();
    }

    @Override
    public void close() throws Exception {
      bridge.stop();
      awaitStatus("off");
      eden.close();
    }
  }

  static MemoryBridge newBridge(MemoryBridge.Listener listener, int port) {
    return new MemoryBridge(listener, new InetSocketAddress(InetAddress.getLoopbackAddress(), port));
  }

  private static BdspImage.Battler rapidos(BdspImage game) {
    Pb8Fixture pokemon = Pb8Fixture.of(387, "Rapidos").moves(33, 110, 670).encryptionConstant(0x0BADF00DL);
    return game
      .battler(0, true, pokemon)
      .level(6)
      .hp(20, 23)
      .ivs(7, 22, 0, 13, 20, 21)
      .stats(15, 12, 11, 12, 8)
      .types(11, 11);
  }

  private static BdspImage.Battler keunotor(BdspImage game) {
    Pb8Fixture pokemon = Pb8Fixture.of(399, "Keunotor").gender(1).moves(33, 45).encryptionConstant(0xCAFE1234L);
    return game
      .battler(12, false, pokemon)
      .level(3)
      .hp(9, 16)
      .ivs(2, 25, 11, 5, 28, 2)
      .stats(8, 7, 7, 7, 6)
      .types(0, 0)
      .ranks(-1, 0, 0, 0, 0, 0, 2);
  }

  static void run() {
    test("bridge: out of battle, reads zone, badges, bag and party from save data", () -> {
      BdspImage game = new BdspImage();
      game.zone(354);
      game.badges(0b0000_0101);
      game.item(4, 37);
      game.item(445, 1);
      game.party(Pb8Fixture.of(387, "Rapidos"), Pb8Fixture.of(396, "Étourmi").heldItem(217));
      try (Session session = new Session(game)) {
        JSONObject snapshot = session.awaitStatus("idle");
        expectEquals("En attente d’un combat", snapshot.getString("message"));
        JSONObject world = snapshot.getJSONObject("world");
        expectEquals("live", world.getString("status"));
        expectEquals(354, world.getInt("zoneId"));
        expectEquals(5, world.getInt("badgeMask"));
        expectEquals(2, world.getInt("badges"));
        expectEquals(false, world.getBoolean("leagueCleared"));
        expectEquals(false, world.getBoolean("nationalDex"));
        expectEquals(2, world.getJSONObject("items").length());
        expectEquals(37, world.getJSONObject("items").getInt("4"));
        expectEquals(1, world.getJSONObject("items").getInt("445"));
        expectEquals(2, world.getJSONArray("party").length());
        JSONObject first = world.getJSONArray("party").getJSONObject(0);
        JSONObject second = world.getJSONArray("party").getJSONObject(1);
        expectEquals(387, first.getInt("dex"));
        expectEquals("Rapidos", first.getString("nickname"));
        expectEquals(0, first.getInt("heldItem"));
        expectEquals(396, second.getInt("dex"));
        expectEquals("Étourmi", second.getString("nickname"));
        expectEquals(217, second.getInt("heldItem"));
        expectTrue(
          Math.abs(System.currentTimeMillis() - snapshot.getLong("timestamp")) < TIMEOUT_MS,
          "recent timestamp"
        );
      }
    });

    test("bridge: reads League and National Pokédex progress", () -> {
      BdspImage game = new BdspImage();
      game.badges(0xFF);
      game.leagueCleared(true);
      game.nationalDex(true);
      try (Session session = new Session(game)) {
        JSONObject world = session.awaitStatus("idle").getJSONObject("world");
        expectEquals(8, world.getInt("badges"));
        expectEquals(true, world.getBoolean("leagueCleared"));
        expectEquals(true, world.getBoolean("nationalDex"));
      }
    });

    test("bridge: in battle, publishes a full sheet for each active Pokémon", () -> {
      BdspImage game = new BdspImage();
      game.startBattle(rapidos(game), keunotor(game));
      try (Session session = new Session(game)) {
        JSONObject snapshot = session.awaitStatus("battle");
        expectEquals(1, snapshot.getJSONArray("player").length());
        expectEquals(1, snapshot.getJSONArray("opponents").length());
        expectEquals("live", snapshot.getJSONObject("world").getString("status"));
        expectTrue(snapshot.getLong("durationMs") >= 0, "sample duration reported");

        JSONObject player = snapshot.getJSONArray("player").getJSONObject(0);
        expectEquals(387, player.getInt("dex"));
        expectEquals("Rapidos", player.getString("nickname"));
        expectEquals(0, player.getInt("gender"));
        expectEquals("[33,110,670,0]", player.getJSONArray("moves").toString());
        expectEquals(20, player.getInt("hp"));
        expectEquals(23, player.getInt("maxHp"));
        expectEquals(6, player.getInt("level"));
        expectEquals(0, player.getInt("battleId"));
        // Published order: Attack, Defense, Speed, Sp. Atk, Sp. Def.
        expectEquals("[15,12,8,11,12]", player.getJSONArray("stats").toString());
        // Published order: HP, Attack, Defense, Speed, Sp. Atk, Sp. Def.
        expectEquals("[7,22,0,21,13,20]", player.getJSONArray("ivs").toString());
        expectEquals("[0,0,0,0,0,0,0]", player.getJSONArray("ranks").toString());
        expectEquals("[11,11]", player.getJSONArray("typeIds").toString());

        JSONObject opponent = snapshot.getJSONArray("opponents").getJSONObject(0);
        expectEquals(399, opponent.getInt("dex"));
        expectEquals("Keunotor", opponent.getString("nickname"));
        expectEquals(1, opponent.getInt("gender"));
        expectEquals(0, opponent.getInt("heldItem"));
        expectEquals("[33,45,0,0]", opponent.getJSONArray("moves").toString());
        expectEquals(9, opponent.getInt("hp"));
        expectEquals(16, opponent.getInt("maxHp"));
        expectEquals(3, opponent.getInt("level"));
        expectEquals(12, opponent.getInt("battleId"));
        expectEquals("[8,7,6,7,7]", opponent.getJSONArray("stats").toString());
        expectEquals("[2,25,11,2,5,28]", opponent.getJSONArray("ivs").toString());
        expectEquals("[-1,0,0,0,0,0,2]", opponent.getJSONArray("ranks").toString());
        expectEquals("[0,0]", opponent.getJSONArray("typeIds").toString());
      }
    });

    test("bridge: re-reads HP every sample, then reports the end of the battle", () -> {
      BdspImage game = new BdspImage();
      BdspImage.Battler opponent = keunotor(game);
      game.startBattle(rapidos(game), opponent);
      try (Session session = new Session(game)) {
        session.awaitStatus("battle");
        opponent.hp(2, 16);
        JSONObject hit = session.await(
          snapshot ->
            "battle".equals(snapshot.optString("status")) &&
            snapshot.getJSONArray("opponents").getJSONObject(0).getInt("hp") == 2
        );
        expectEquals("Keunotor", hit.getJSONArray("opponents").getJSONObject(0).getString("nickname"));

        game.battling(false);
        JSONObject idle = session.awaitStatus("idle");
        expectTrue(!idle.has("opponents") && !idle.has("player"), "no sheet published out of battle");
      }
    });

    test("bridge: never publishes an inconsistent sheet", () -> {
      BdspImage game = new BdspImage();
      // The battle species no longer matches the PB8: form change or switch in progress.
      game.startBattle(rapidos(game), keunotor(game).species(400));
      try (Session session = new Session(game)) {
        JSONObject error = session.awaitStatus("error");
        expectEquals("Lecture indisponible · Forme en transition", error.getString("message"));
      }
    });

    test("bridge: a zone transition invalidates the world read without stopping tracking", () -> {
      BdspImage game = new BdspImage();
      game.zoneTransition(true);
      try (Session session = new Session(game)) {
        JSONObject world = session.awaitStatus("idle").getJSONObject("world");
        expectEquals("error", world.getString("status"));
        expectEquals("Changement de zone en cours", world.getString("message"));

        game.zone(429);
        game.zoneTransition(false);
        session.forgetPublished();
        JSONObject arrived = session.await(
          snapshot -> snapshot.has("world") && "live".equals(snapshot.getJSONObject("world").optString("status"))
        );
        expectEquals(429, arrived.getJSONObject("world").getInt("zoneId"));
      }
    });

    test("bridge: another game yields an explicit error and no data", () -> {
      try (Session session = new Session(new BdspImage("SomeOtherGame"))) {
        JSONObject error = session.awaitStatus("error");
        expectEquals(
          "Lecture indisponible · Jeu/version non compatible · BDSP 1.3.0 requis",
          error.getString("message")
        );
        expectTrue(!error.has("world") && !error.has("opponents"), "no data published");
      }
    });

    test("bridge: verifies the RSP checksum of every reply", () -> {
      BdspImage game = new BdspImage();
      FakeGdbServer eden = new FakeGdbServer(game.memory, BdspImage.TEXT_BASE, 0);
      eden.corruptChecksums(true);
      BlockingQueue<JSONObject> snapshots = new LinkedBlockingQueue<>();
      MemoryBridge bridge = newBridge(snapshots::add, eden.port());
      bridge.start();
      try {
        JSONObject snapshot;
        do {
          snapshot = snapshots.poll(TIMEOUT_MS, TimeUnit.MILLISECONDS);
          expectTrue(snapshot != null, "error expected");
        } while (!"error".equals(snapshot.getString("status")));
        expectEquals("Lecture indisponible · Invalid RSP checksum", snapshot.getString("message"));
      } finally {
        bridge.stop();
        eden.close();
      }
    });

    test("bridge: without Eden, reports the connection error and stops cleanly", () -> {
      BlockingQueue<JSONObject> snapshots = new LinkedBlockingQueue<>();
      int closedPort;
      try (java.net.ServerSocket probe = new java.net.ServerSocket(0)) {
        closedPort = probe.getLocalPort();
      }
      MemoryBridge bridge = newBridge(snapshots::add, closedPort);
      bridge.start();
      expectEquals("connecting", snapshots.poll(TIMEOUT_MS, TimeUnit.MILLISECONDS).getString("status"));
      JSONObject error = snapshots.poll(TIMEOUT_MS, TimeUnit.MILLISECONDS);
      expectEquals("error", error.getString("status"));
      expectTrue(error.getString("message").startsWith("Lecture indisponible · "), error.getString("message"));
      bridge.stop();
      JSONObject last;
      do {
        last = snapshots.poll(TIMEOUT_MS, TimeUnit.MILLISECONDS);
        expectTrue(last != null, "stop expected");
      } while (!"off".equals(last.getString("status")));
      expectEquals("Bridge désactivé", last.getString("message"));
    });

    test("bridge: read-only, sends nothing but qOffsets, memory reads and resume", () -> {
      BdspImage game = new BdspImage();
      game.startBattle(rapidos(game), keunotor(game));
      FakeGdbServer eden;
      try (Session session = new Session(game)) {
        eden = session.eden;
        session.awaitStatus("battle");
      }
      expectEquals("c", eden.commands().get(0)); // The game is resumed as soon as the debugger attaches.
      expectEquals("qOffsets", eden.commands().get(1));
      expectEquals("c", eden.commands().get(eden.commands().size() - 1)); // ... and again on the way out.
      for (String command : eden.commands()) {
        expectTrue(command.matches("qOffsets|c|m[0-9a-f]+,[0-9a-f]+"), "forbidden command: " + command);
      }
      expectEquals(1, eden.connections());
    });
  }

  private MemoryBridgeTest() {}
}
