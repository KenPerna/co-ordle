export function evaluateGuess(secret: string, guess: string) {
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
