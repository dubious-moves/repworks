cd /home/user/repworks
S=/tmp/claude-0/-home-user-repworks/c3c91cac-f0c9-5e7b-af69-21d816dac207/scratchpad
while IFS='|' read tag line; do echo "#### $tag"; node --experimental-strip-types --no-warnings $S/r17/difficulty.ts x --line "$line" --ms 1500 2>&1; done <<'L'
B hard: zwischenzug gxf5|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Bf5 5.Nf3 e6 6.Ne5 Nbd7 7.g4 Nxe5 8.gxf5
C hard: Bd3 not Nxa8|1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 4.e3 e6 5.Nf3 c5 6.Nb5 Qa5+ 7.b4 cxb4 8.Nc7+ Kd8 9.Bd3
D hard: only moves c3 b4|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 Nc6 6.a3 e5 7.Bg5 d4 8.Na4 Qa5+ 9.c3 dxc3 10.b4
G hard: Qa4 b3 Nd6+|1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 4.e3 e6 5.Nf3 c5 6.Nb5 Na6 7.c3 c4 8.Qa4 Nd7 9.b3 cxb3 10.axb3 Be7 11.Nd6+
H hard: Na4|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 e6 6.Na4
I tactic: Bxf6 Qxd5|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 Nc6 6.a3 e5 7.Bg5 Bxc5 8.Bxf6 gxf6 9.Qxd5
E easy: system g4|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Nc6 5.Bd3 Bg4 6.f3 Bh5 7.h4 Bg6 8.g4
E easy: Nf3 Qd2|1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h4 Bg7 6.Bd3 h5 7.Nf3 Bg4 8.Qd2
E easy: recapture|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Bf5 5.Nf3 Nc6 6.Ne5 Nxe5 7.dxe5
F punish: h6 Bxg6 Qd3|1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Nc6 5.Bd3 Bg4 6.f3 Bh5 7.h4 h6 8.g4 Bg6 9.Bxg6 fxg6 10.Qd3
L
