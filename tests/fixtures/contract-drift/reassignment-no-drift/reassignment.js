/**
 * Reassignment-no-drift fixture. Demonstrates the harness's per-call-site
 * instantiation resolution: each `var.method(...)` call is checked
 * against the most recent `var = new ClassName(...)` assignment whose
 * source position precedes the call.
 *
 * A flat last-write-wins variable→class map (the original implementation
 * the Pit Crew flagged) would falsely report `proc.aMethod()` as drift
 * against `B`. This fixture is the regression canary.
 *
 * @see ./README.md
 */

'use strict';

class A {
  aMethod() {
    return 'a';
  }
}

class B {
  bMethod() {
    return 'b';
  }
}

function runScenario() {
  let proc = new A();
  proc.aMethod(); // legitimate against A — must NOT be flagged
  proc = new B();
  proc.bMethod(); // legitimate against B
}

module.exports = { runScenario };
