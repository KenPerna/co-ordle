const WORD_LIST = [
  "crane", "slate", "table", "brave", "light",
  "storm", "plant", "steam", "grain", "cloud",
  "flame", "frost", "globe", "place", "river",
  "brush", "chess", "drift", "elder", "fancy",
  "grape", "heard", "image", "judge", "kneel",
  "lemon", "moist", "noise", "ocean", "pride",
  "quiet", "raise", "shelf", "tiger", "under",
  "vivid", "wheat", "extra", "young", "zebra",
];
const WORD_SET = new Set(WORD_LIST);

export function pickSecretWord(): string {
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}

export function isValidGuessWord(guess: string): boolean {
  return WORD_SET.has(guess.toLowerCase());
}

export function evaluateGuess(secret: string, guess: string): string[] {
  const result = Array(guess.length).fill("gray");
  const secretArr = secret.split("");

  guess.split("").forEach((char, i) => {
    if (char === secretArr[i]) {
      result[i] = "green";
      secretArr[i] = null as any;
    }
  });

  guess.split("").forEach((char, i) => {
    if (result[i] === "gray" && secretArr.includes(char)) {
      result[i] = "yellow";
      secretArr[secretArr.indexOf(char)] = null as any;
    }
  });

  return result;
}
