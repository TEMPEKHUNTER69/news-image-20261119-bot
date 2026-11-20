# THE WORLD TODAY — 19 November 2026

A one-page newspaper front page that sums up Thursday 19 November 2026 in
a single image: Trump, Xi and Putin meet in Shenzhen for the first
three-way summit, the UN court rules Myanmar committed genocide against
the Rohingya, Ukraine strikes the Crimea bridge a third time, Iran widens
its Gulf attacks as tankers burn near Hormuz, and Anthropic prices its
record IPO at $83 a share — plus a footer strip with the GTA VI launch,
Cyclone Akvan's evacuation of 80,000 in Odisha, and a Van Gogh selling
for $190.4m.

The program draws everything procedurally into a 1024×1024 RGB buffer: a
hand-written 5×7 bitmap font for the masthead, headlines and body copy;
simple shapes (rectangles, lines, circles) for the skyline and three
flags, the scales of justice, the broken bridge, the tanker and mine,
and the rising market chart; and a hand-written PNG encoder (IHDR / IDAT
with zlib level 9 / IEND, CRC32 from a table computed in code). No
network, no clock, no randomness — two runs produce byte-identical output.

Run:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, under 1 MiB).
