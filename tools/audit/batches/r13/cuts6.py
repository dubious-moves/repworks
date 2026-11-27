# batch 4 cuts (node mode); literal rule: the most common reply at every kept position stays
P = "1. Nc3 d5 2. d4 Nf6 3. Bf4 a6 4. e3"
F = P + " Bf5 5. Nf3 e6 6. Ne5"
C = P + " c5 5. dxc5 Nc6 6. a3 e5 7. Bg5"
N = P + " Nc6 5. Bd3"
CUT = [
 P + " Bg4", P + " b5", P + " g6", P + " h6",
 P + " Bf5 5. Nf3 Nbd7",
 F + " Bb4", F + " h6", F + " Be7",
 F + " Nbd7 7. g4 Be4",
 F + " Nbd7 7. g4 Bg6 8. h4 Nxe5", F + " Nbd7 7. g4 Bg6 8. h4 h6",
 F + " Nbd7 7. g4 Bg6 8. h4 h5 9. Nxg6 fxg6 10. g5 Ne4",
 F + " Bd6 7. g4 Bxe5", F + " Bd6 7. g4 Be4",
 F + " Bd6 7. g4 Bg6 8. h4 Bxe5", F + " Bd6 7. g4 Bg6 8. h4 h6",
 F + " c5 7. g4 Be4", F + " c5 7. g4 Bg6 8. h4 h6", F + " c5 7. g4 Bg6 8. h4 cxd4",
 P + " Bf5 5. Nf3 Nc6 6. Ne5 e6", P + " Bf5 5. Nf3 Nc6 6. Ne5 Nb4",
 P + " Bf5 5. Nf3 h6 6. Bd3 Ne4",
 P + " c5 5. dxc5 Qa5",
 C + " Be6 8. b4 h6", C + " Be6 8. b4 d4",
 C + " Be6 8. b4 Be7 9. Be2 h6", C + " Be6 8. b4 Be7 9. Be2 d4",
 C + " Be6 8. b4 Be7 9. Be2 O-O 10. Nf3 d4",
 C + " d4 8. Na4 Qa5+ 9. c3 Ne4",
 N + " h6", N + " g6",
 N + " e6 6. Nf3 Bb4", N + " e6 6. Nf3 h6",
 N + " Bg4 6. f3 Bh5 7. h4 h6", N + " Bg4 6. f3 Bh5 7. h4 e6",
]
