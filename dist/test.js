const ai = new Evolution({
  inputs: 2,
  outputs: ['1', '0'],
  generationSize: 8,
  topSize: 4,
  // learningRate: 0.02,
  // decayRate: 1,
});

ai.createRandomGeneration();

// XOR learner

const tests = [
  {
    input: [0, 0],
    output: 0,
  },
  {
    input: [1, 1],
    output: 0,
  },
  {
    input: [1, 0],
    output: 1,
  },
  {
    input: [0, 1],
    output: 1,
  },
];

function fitness(id) {
  let score = 0;
  for (let test of tests) {
    const result = parseInt(ai.getAction(id, test.input), 10);
    if (result === test.output) {
      score++;
    }
  }
  return (score / tests.length) * 100;
}

const interval = setInterval(() => {
  let correct = 0;
  let total = 0;
  for (let id of ai.getNodeKeys()) {
    const score = fitness(id);
    ai.setScore(id, score);
    total++;
    if (score === 100) {
      correct++;
    }
  }
  if (correct === total) {
    console.log('Done training @ Gen', ai.generation);
    ai.printTopWeights();
    clearInterval(interval);
  } else {
    const topScore = ai.evolve();
    console.log(
      'Gen',
      ai.generation,
      'outcome was',
      (correct / total) * 100,
      '% correct. Top score was',
      topScore
    );
  }
}, 100);
