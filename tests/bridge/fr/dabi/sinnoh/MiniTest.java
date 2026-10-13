package fr.dabi.sinnoh;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Dependency-free test runner: the project builds without Gradle or JUnit. */
final class MiniTest {

  interface Body {
    void run() throws Exception;
  }

  private static final List<String> failures = new ArrayList<>();
  private static int passed;

  static void test(String name, Body body) {
    try {
      body.run();
      passed++;
      System.out.println("✔ " + name);
    } catch (Throwable failure) {
      failures.add(name);
      System.out.println("✖ " + name + "\n    " + failure);
    }
  }

  static void expectEquals(Object expected, Object actual) {
    if (!Objects.equals(expected, actual)) {
      throw new AssertionError("expected <" + expected + "> but got <" + actual + ">");
    }
  }

  static void expectTrue(boolean condition, String description) {
    if (!condition) throw new AssertionError(description);
  }

  static void expectThrows(String messagePart, Body body) {
    try {
      body.run();
    } catch (Throwable expected) {
      if (String.valueOf(expected.getMessage()).contains(messagePart)) return;
      throw new AssertionError("unexpected message: " + expected.getMessage());
    }
    throw new AssertionError("nothing thrown, expected \"" + messagePart + "\"");
  }

  /** Exits with a failure code if any test failed. */
  static void report() {
    System.out.println(passed + " passed, " + failures.size() + " failed");
    System.exit(failures.isEmpty() ? 0 : 1);
  }

  private MiniTest() {}
}
