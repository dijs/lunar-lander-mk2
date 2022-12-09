const ai = new Evolution({
  // make it hex later???
  inputs: 3,
  outputs: ['1', '0'],
  generationSize: 10,
  topSize: 5,
  decayRate: 1,
  // hiddenUnits: 128,
  // learningRate: 0.02,
});

// gen 4, top 2 with crossover = 1788
// gen 4, top 2 without crossover = 677

// gen 10, top 5 = 274 with crossover
// gen 10, top 5 = 685 without crossover

// gen 16, top 8 with crossover @ 308
// gen 16, top 8 without crossover @ 1452

// gen 24, top 5 with crossover @ 355
// gen 24, top 5 without crossover @ 1198

// gen 32, top 5 without crossover DID NOT CONVERGE

// #TODO: Learnings
//
// - Smaller generation size definately works better... but why? Is it that we can do more testing
// - Perfect hidden units may not matter (128 worked better than 3 but not as well as 16)
// - Crossover really does help
// - Auto decay rate is not helping....I think it might be hurting the learning

ai.createRandomGeneration();

// Brightness learner

const r = () => Math.random();

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function fitness(id, n = 2) {
  let score = 0;
  for (let i = 0; i < n; i++) {
    const input = [r(), r(), r()];
    const output = lum(input) > 0.5 ? '1' : '0';
    const result = ai.getAction(id, input);
    if (result === output) {
      score++;
    }
  }
  return (score / n) * 100;
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
    const check = fitness(ai.currentTopId, 100);
    console.log('Double check was', check);
    if (check > 95) {
      console.log('Done training @ Gen', ai.generation);
      ai.printTopWeights();
      clearInterval(interval);
    }
  } else {
    ai.evolve();
    /*console.log(
      'Gen',
      ai.generation,
      'outcome was',
      (correct / total) * 100,
      '% correct. Top score was',
      topScore
    );*/
    const score = (correct / total) * 100;

    if (Math.random() < 0.05) {
      console.log(score);
    }

    data[0].push(ai.generation);
    data[1].push(score);
    uplot.setData(data);
  }
}, 1000 / 60);

let data = [
  [], // x-values (timestamps)
  [], // y-values (series 1)
];

let opts = {
  width: 400,
  height: 100,
  pxAlign: false,
  cursor: {
    show: false,
  },
  select: {
    show: false,
  },
  legend: {
    show: false,
  },
  scales: {
    x: {
      time: false,
    },
  },
  axes: [
    {
      show: false,
    },
    {
      show: false,
    },
  ],
  series: [
    {},
    {
      stroke: '#03a9f4',
      fill: '#b3e5fc',
    },
  ],
};

let uplot = new uPlot(opts, data, document.body);
