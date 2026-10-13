package fr.dabi.sinnoh;

/** Entry point of {@code scripts/test-bridge.sh}. */
final class AllTests {

  public static void main(String[] arguments) {
    Pb8Test.run();
    GdbClientTest.run();
    MemoryBridgeTest.run();
    MiniTest.report();
  }

  private AllTests() {}
}
