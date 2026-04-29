import { ANSWER_WORDS, VALID_WORDS } from "./wordList";

export function pickSecretWord(): string {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)]!;
}

export function isValidGuessWord(guess: string): boolean {
  return VALID_WORDS.has(guess.toLowerCase());
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
