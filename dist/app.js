document.body.style.backgroundColor = 'black';

const fps = 2;

let id_counter = 1;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const win_points = 100;
const ground_level = 114;
const generationSize = 64; // Must be a mulitple of 3
const tooStuckCount = 5;

const actions = {
  nothing: { rotate: 0, thrust: 0 },
  thrust: { rotate: 0, thrust: 1 },
  rot_left: { rotate: 1, thrust: 0 },
  rot_right: { rotate: -1, thrust: 0 },
};

let generation = 1;
let networks = {};
let started = false;
let lastBestScore = 0;
let lastBestNetwork = null;
let stuckCount = 0;

/////// AI

const input_node_count = 6;
const output_node_count = 4;
const decayRate = 0.99;

let learningRate = 0.3;
let mutateThreshold = 0.1;

const options = {
  inputs: input_node_count,
  outputs: ['nothing', 'thrust', 'rot_left', 'rot_right'],
  task: 'classification',
  noTraining: true,
};

////////////////////////////////////////////////////////////

engine.startGame();

function sendAction(action) {
  const channel = new MessageChannel();
  postMessage(JSON.stringify(action), '*', [channel.port2]);
}

// I could make this generic if needed
function getStatus(id) {
  return new Promise((resolve, reject) => {
    // This opens up a channel and sends data to Godot function
    const data = JSON.stringify({ type: 'status', id });
    const channel = new MessageChannel();
    // For some reason this is required
    channel.port1.onmessageerror = reject;
    channel.port1.addEventListener('message', (message) => {
      resolve(JSON.parse(message.data));
      channel.port1.close();
    });
    postMessage(data, '*', [channel.port2]);
    channel.port2.close();
  });
}

function getLanderCount() {
  return new Promise((resolve, reject) => {
    // This opens up a channel and sends data to Godot function
    const data = JSON.stringify({ type: 'debug' });
    const channel = new MessageChannel();
    // For some reason this is required
    channel.port1.onmessageerror = reject;
    channel.port1.addEventListener('message', (message) => {
      resolve(message.data);
      channel.port1.close();
    });
    postMessage(data, '*', [channel.port2]);
    channel.port2.close();
  });
}

// (Continuous): X distance from target site
// (Continuous): Y distance from target site
// (Continuous): X velocity
// (Continuous): Y velocity
// (Continuous): Angle of ship
// (Continuous): Angular velocity of ship
// (Binary): Left leg is grounded
// (Binary): Right leg is grounded

function normalizeAngle(a) {
  let rot = Math.atan2(Math.sin(a), Math.cos(a));
  return (rot + Math.PI) / 2;
}

function getInput({ altitude, velocity, rotation, x_pos, angular_momentum }) {
  return [
    x_pos,
    altitude - ground_level,
    velocity.x,
    velocity.y,
    normalizeAngle(rotation),
    angular_momentum,
  ];
}

function getSpeed(status) {
  return Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
}

function getFitnessScore(status) {
  return (
    win_points -
    getSpeed(status) -
    Math.abs(status.angular_momentum) * 3 -
    // Math.abs(Math.PI / 2 - status.rotation) * 10 -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 10 -
    landers[status.id].count / 4
  );
}

function machineLandingAssist(status) {
  const results = networks[status.id].classifySync(getInput(status));
  const action = results[0].label;
  if (action !== 'nothing') {
    landers[status.id].count++;
  }
  return actions[action];
}

async function tick(id) {
  const status = await getStatus(id);

  if (status.landed === 0) {
    // const action = { type: 'act', id, ...landingAssist(status) };
    const action = { type: 'act', id, ...machineLandingAssist(status) };
    sendAction(action);
  }
  if (status.landed === 1) {
    landers[id].status = LANDED;
    landers[id].score = win_points;
    console.log(id, 'landed');
  }
  if (status.landed === -1) {
    landers[id].status = CRASHED;
    const score = getFitnessScore(status);
    landers[id].score = score;
    if (score > lastBestScore) {
      const since = Date.now() - landers[id].started;
      console.log(
        'Lander #',
        id,
        'crashed after',
        Math.round(since / 1000),
        'seconds with a score of',
        Math.round(landers[id].score),
        '| speed',
        Math.round(getSpeed(status)),
        ',ang mom',
        Math.round(status.angular_momentum),
        ',x',
        Math.round(status.x_pos),
        ' | used',
        landers[id].count,
        'actions'
      );
    }
  }
}

function gameLoop() {
  let readyForNextGeneration = true;
  for (let id in landers) {
    if (landers[id].status === LANDING) {
      tick(id);
      readyForNextGeneration = false;
    }
  }
  if (started && readyForNextGeneration) {
    createNextGeneration();
  }
}

setInterval(gameLoop, 1000 / fps);

function init() {
  for (let i = 0; i < generationSize; i++) {
    const id = createLander();
    networks[id] = ml5.neuralNetwork(options);
    // Load best network from local storage
    // let data = localStorage.getItem('best');
    // if (data) {
    //   networks[id].dispose();
    //   data = JSON.parse(data);
    //   networks[id].weights = data.weights.map((w) => tf.tensor(w));
    // }
  }
  started = true;
}

function findBestLanderId() {
  let bestId = 0;
  let bestScore = -100000;
  for (let id in landers) {
    if (landers[id].gen === generation && landers[id].score > bestScore) {
      bestScore = landers[id].score;
      bestId = id;
    }
  }
  console.log(
    'Best lander was',
    bestId,
    'with a score of',
    Math.round(bestScore)
  );
  return bestId;
}

const byScore = (a, b) => b.score - a.score;

function getTopNetworks(n = 3) {
  return Object.keys(networks)
    .map((id) => ({ ...landers[id] }))
    .sort(byScore)
    .slice(0, n)
    .map(({ id, score }) => ({ network: networks[id], score }));
}

function createLander() {
  const id = '' + id_counter;
  landers[id] = {
    id,
    status: LANDING,
    phase: 0,
    score: 0,
    count: 0,
    gen: generation,
    started: Date.now(),
    // TODO: Add brain property here with neural network if I can get this working...
  };
  sendAction({ type: 'create', id, x: -436, y: -219 });
  id_counter += 1;
  return id;
}

function createNextGeneration() {
  // Find current top 3 and add last best
  let top = getTopNetworks();
  if (lastBestNetwork) {
    top.push({ network: lastBestNetwork, score: lastBestScore });
    top = top.sort(byScore).slice(0, 3);
  }

  // Update last best
  if (top[0].score > lastBestScore) {
    lastBestNetwork = top[0].network.copy();
    lastBestScore = top[0].score;
    stuckCount = 0;
  } else {
    stuckCount++;
  }

  if (!lastBestNetwork) {
    lastBestNetwork = ml5.neuralNetwork(options);
  }

  // Save best to local storage
  // localStorage.setItem(
  //   'best',
  //   JSON.stringify({
  //     weights: lastBestNetwork.weights.map((w) => w.arraySync()),
  //   })
  // );

  // Update chart
  data[0].push(generation);
  data[1].push(lastBestScore);
  uplot.setData(data);

  // Now use these networks to build a new generation
  generation++;
  const nextGenerationNetworks = {};

  // Decay learning variables
  // learningRate *= decayRate;
  // mutateThreshold *= decayRate;

  // TODO: Apparently 0.2 for both is doing well for me

  // if (stuckCount >= tooStuckCount) {
  //   learningRate = 0.5;
  //   mutateThreshold = 0.5;
  //   console.log('Training stagnated. Resetting learning rates');
  // }

  // document.querySelector('#learning-rate').value = learningRate;
  // document.querySelector('#mutate-threshold').value = mutateThreshold;

  for (let i = 0; i < generationSize; i++) {
    const id = createLander();
    const net = lastBestNetwork.copy();
    net.mutate(0.5);
    // TODO: I may do a crossover as well....
    nextGenerationNetworks[id] = net;

    // mutateNeuralNetwork(top[0].network);
  }

  /*
  // First section mutated from A
  const third = Math.floor(generationSize / 3);
  for (let i = 0; i < third; i++) {
    const id = createLander();
    nextGenerationNetworks[id] = mutateNeuralNetwork(top[0].network);
  }
  // Second section AB crossover
  for (let i = third; i < third * 2; i++) {
    const id = createLander();
    nextGenerationNetworks[id] = crossoverNeuralNetwork(
      top[0].network,
      mutateNeuralNetwork(top[1].network)
    );
  }
  // Third section AC crossover
  for (let i = third * 2; i < generationSize; i++) {
    const id = createLander();
    nextGenerationNetworks[id] = crossoverNeuralNetwork(
      top[0].network,
      mutateNeuralNetwork(top[2].network)
    );
  }*/

  // Clean up previous generation networks
  for (let id in networks) {
    networks[id].dispose();
  }

  networks = nextGenerationNetworks;

  console.log(
    'Started Generation',
    generation,
    'Best score was',
    Math.round(lastBestScore)
  );
}

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

setTimeout(init, 1000);

// document.querySelector('#learning-rate').addEventListener('change', (e) => {
//   learningRate = parseFloat(e.currentTarget.value);
// });

// document.querySelector('#mutate-threshold').addEventListener('change', (e) => {
//   mutateThreshold = parseFloat(e.currentTarget.value);
// });

// document.querySelector('#learning-rate').value = learningRate;
// document.querySelector('#mutate-threshold').value = mutateThreshold;
