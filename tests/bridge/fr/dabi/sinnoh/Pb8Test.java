package fr.dabi.sinnoh;

import static fr.dabi.sinnoh.MiniTest.expectEquals;
import static fr.dabi.sinnoh.MiniTest.expectThrows;
import static fr.dabi.sinnoh.MiniTest.test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

final class Pb8Test {

  static void run() {
    test("PB8: decrypts every one of the 24 block orders", () -> {
      Set<Integer> orders = new HashSet<>();
      for (int shuffle = 0; shuffle < 32; shuffle++) {
        long constant = 0x00000ABCL | ((long) shuffle << 13) | 0x5A000000L;
        orders.add(shuffle % 24);
        Pb8Fixture fixture = Pb8Fixture.of(443, "Griknot")
          .gender(1)
          .heldItem(217)
          .moves(33, 328, 0, 0)
          .encryptionConstant(constant);
        Pb8 decoded = Pb8.decode(fixture.encrypted());
        expectEquals(443, decoded.dex);
        expectEquals(217, decoded.heldItem);
        expectEquals("Griknot", decoded.nickname);
        expectEquals(1, decoded.gender);
        expectEquals("[33, 328, 0, 0]", Arrays.toString(decoded.moves));
      }
      expectEquals(24, orders.size());
    });

    test("PB8: reads data that is already decrypted", () -> {
      Pb8 decoded = Pb8.decode(Pb8Fixture.of(25, "Pikachu").gender(2).moves(84, 45, 98, 85).plain());
      expectEquals(25, decoded.dex);
      expectEquals("Pikachu", decoded.nickname);
      expectEquals(2, decoded.gender);
      expectEquals("[84, 45, 98, 85]", Arrays.toString(decoded.moves));
    });

    test("PB8: keeps accents and the full 12-character nickname", () -> {
      expectEquals("Étouraptor", Pb8.decode(Pb8Fixture.of(398, "Étouraptor").encrypted()).nickname);
      expectEquals("ABCDEFGHIJKL", Pb8.decode(Pb8Fixture.of(1, "ABCDEFGHIJKL").encrypted()).nickname);
      expectEquals("", Pb8.decode(Pb8Fixture.of(1, "").encrypted()).nickname);
    });

    test("PB8: rejects data caught mid-update instead of returning garbage", () -> {
      byte[] torn = Pb8Fixture.of(387, "Rapidos").encrypted();
      torn[0x40] ^= 0x01;
      expectThrows("Fiche en transition", () -> Pb8.decode(torn));

      byte[] plain = Pb8Fixture.of(387, "Rapidos").plain();
      plain[8] ^= 0x01;
      expectThrows("Fiche en transition", () -> Pb8.decode(plain));
    });

    test("PB8: leaves the bytes read from memory untouched", () -> {
      byte[] stored = Pb8Fixture.of(387, "Rapidos").encrypted();
      byte[] before = stored.clone();
      Pb8.decode(stored);
      expectEquals(true, Arrays.equals(before, stored));
    });

    test("PB8: serializes the fields the web UI expects", () -> {
      JSONObject json = Pb8.decode(Pb8Fixture.of(399, "Keunotor").gender(1).moves(33, 45).encrypted()).toJson();
      expectEquals(5, json.length());
      expectEquals(399, json.getInt("dex"));
      expectEquals(0, json.getInt("heldItem"));
      expectEquals("Keunotor", json.getString("nickname"));
      expectEquals(1, json.getInt("gender"));
      expectEquals("[33,45,0,0]", json.getJSONArray("moves").toString());
    });
  }

  private Pb8Test() {}
}
