export const mockRankings = [
  { rank: 1, name: "VelvetEcho", points: 18420, battles: 612, wins: 540, streak: 41 },
  { rank: 2, name: "NoctisRay", points: 17890, battles: 590, wins: 511, streak: 12 },
  { rank: 3, name: "PixelFang", points: 17655, battles: 633, wins: 502, streak: 6 },
  { rank: 4, name: "Kairo_X", points: 16980, battles: 580, wins: 470, streak: 3 },
  { rank: 5, name: "Lunarisk", points: 16500, battles: 560, wins: 455, streak: 0 },
  { rank: 6, name: "ZephyrTune", points: 16210, battles: 545, wins: 440, streak: 9 },
  { rank: 7, name: "MidnightKey", points: 15990, battles: 520, wins: 421, streak: 0 },
  { rank: 8, name: "AshenChord", points: 15740, battles: 515, wins: 410, streak: 2 },
  { rank: 9, name: "RiftSerenade", points: 15500, battles: 500, wins: 398, streak: 0 },
  { rank: 10, name: "GlassTempo", points: 15310, battles: 498, wins: 390, streak: 1 },
];

export const mockStreaks = [...mockRankings]
  .sort((a, b) => b.streak - a.streak)
  .slice(0, 5);

export const mockHof = [
  { season: "Season 4", name: "VelvetEcho", points: 22100, wins: 701 },
  { season: "Season 3", name: "NoctisRay", points: 21850, wins: 689 },
  { season: "Season 2", name: "VelvetEcho", points: 21300, wins: 670 },
  { season: "Season 1", name: "PixelFang", points: 20990, wins: 655 },
];
