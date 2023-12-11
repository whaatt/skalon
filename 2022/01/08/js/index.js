/**
 * Returns the hardest new solution and remaining word set using information
 * gain as a heuristic.
 */
const getBestNewSolution = (remainingWords, guess, evaluate) => {
  const wordsForEvaluation = {};
  for (const word of remainingWords) {
    const evaluation = getEvaluationString(evaluate(guess, word));
    if (wordsForEvaluation[evaluation] === undefined) {
      wordsForEvaluation[evaluation] = [word];
    } else {
      wordsForEvaluation[evaluation].push(word);
    }
  }

  console.log("Evaluation Map:", wordsForEvaluation);
  let bestScore = Number.MIN_VALUE;
  let bestRemainingWords = null;
  let bestWord = null;
  for (const evaluation in wordsForEvaluation) {
    const scoreForEvaluation = wordsForEvaluation[evaluation].length;
    if (
      scoreForEvaluation > bestScore ||
      (scoreForEvaluation == bestScore &&
        !wordsForEvaluation[evaluation].includes(guess))
    ) {
      bestScore = scoreForEvaluation;
      bestRemainingWords = wordsForEvaluation[evaluation];
      bestWord =
        wordsForEvaluation[evaluation][
          Math.floor(Math.random() * wordsForEvaluation[evaluation].length)
        ];
    }
  }

  return [bestRemainingWords, bestWord];
};

const getEvaluationString = (rawEvaluation) => {
  let result = "";

  for (const item of rawEvaluation) {
    if (item === "correct") {
      result += "2";
    } else if (item === "present") {
      result += "1";
    } else {
      result += "0";
    }
  }

  return result;
};

const filterWordsByGuess = (remainingWords, guess, evaluation) => {
  const newWords = [];
  const checkPositions = {};
  const checkPresent = [];
  const checkAbsent = [];

  // Get letters and positions to check.
  for (let i = 0; i < guess.length; i += 1) {
    if (evaluation[i] === "2") {
      checkPositions[i] = guess[i];
    } else if (evaluation[i] === "1") {
      checkPresent.push(guess[i]);
    } else {
      checkAbsent.push(guess[i]);
    }
  }

  // Check each word in the remaining set.
  for (const word of remainingWords) {
    for (const key in checkPositions) {
      if (word[key] != checkPositions[key]) {
        continue;
      }
    }
    for (const letter in checkPresent) {
      if (!word.includes(letter)) {
        continue;
      }
    }
    for (const letter in checkAbsent) {
      if (word.includes(letter)) {
        continue;
      }
    }
    newWords.push(word);
  }

  return newWords;
};
