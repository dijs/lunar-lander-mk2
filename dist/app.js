// Sources:

// 1. get from trello
// 2. https://github.com/shaoruu/lunar-lander-ai

// After trying different onfigurations of neural networks: single hidden, multi hidden,
// I was always getting stuck on the very last part of the training. It could make it very close to
// landing, but would never slow down enough...

// Now I am trying very different inputs. Basically shooting 8 rays from the lander and getting the obstacle collision distance

document.body.style.backgroundColor = 'black';

const fps = 10;

let id_counter = 1;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const win_points = 100;
const ground_level = 114;
const generationSize = 64;
const tooStuckCount = 5;

const winSpeedThreshold = 10;
const winAngMomThreshold = 10;
const upRightRotation = Math.PI / 2;

const networksThatLanded = [];

const actions = {
  nothing: { rotate: 0, thrust: 0 },
  thrust: { rotate: 0, thrust: 1 },
  rot_left: { rotate: 1, thrust: 0 },
  rot_right: { rotate: -1, thrust: 0 },
};

let generation = 1;
let networks = {};
let started = false;
let stuckCount = 0;

// Needs to be set manually
let lastBestScore = 100;
let lastBestNetwork = null;

const real_inputs = [];

/////// AI

const input_node_count = 13;
const decayRate = 0.99;

let learningRate = 0.001;
let mutateThreshold = 0.1;

const options = {
  inputs: input_node_count,
  outputs: ['nothing', 'thrust', 'rot_left', 'rot_right'],
  task: 'classification',
  // layers: [
  //   {
  //     type: 'dense',
  //     units: 16,
  //     activation: 'relu',
  //   },
  //   // Normalization
  //   {
  //     type: 'dense',
  //     units: 32,
  //     activation: 'relu',
  //   },
  //   {
  //     type: 'dense',
  //     units: 4,
  //     activation: 'sigmoid',
  //   },
  // ],
  // hiddenUnits: 32,
  noTraining: true,
  // learningRate: 0.01,
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
    function handler(message) {
      resolve(JSON.parse(message.data));
      channel.port1.removeEventListener('message', handler);
      channel.port1.close();
    }
    channel.port1.addEventListener('message', handler);
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
    function handler(message) {
      resolve(message.data);
      channel.port1.removeEventListener('message', handler);
      channel.port1.close();
    }
    channel.port1.addEventListener('message', handler);
    postMessage(data, '*', [channel.port2]);
    channel.port2.close();
  });
}

function normalizeAngle(a) {
  let rot = Math.atan2(Math.sin(a), Math.cos(a));
  return (rot + Math.PI) / 2;
}

function getInput({ rotation, velocity, rays, x_pos, angular_momentum }) {
  return [
    rays.n,
    rays.ne,
    rays.e,
    rays.se,
    rays.s,
    rays.sw,
    rays.w,
    rays.nw,
    x_pos,
    velocity.x,
    velocity.y,
    rotation,
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
    Math.abs(upRightRotation - status.rotation) * 3 -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 20 -
    landers[status.id].count / 4
  );
}

function machineLandingAssist(status) {
  if (!networks[status.id]) {
    console.log('There was not network for lander', status.id);
    return { thrust: 0, rotate: 0 };
  }

  const input = getInput(status);

  // if (Math.random() < 0.1) {
  // console.log(input);
  // real_inputs.push(input);
  // }

  const results = networks[status.id].classifySync(input);
  const action = results[0].label;
  if (action !== 'nothing') {
    landers[status.id].count++;
  }
  return actions[action];
}

function handleLanding(id, status) {
  const action = { type: 'act', id, ...machineLandingAssist(status) };
  sendAction(action);
}

// Looks like the top score could be ~ 166
function handleLanded(id, status) {
  landers[id].status = LANDED;

  // Award more points for better landings
  const x = Math.abs(winSpeedThreshold - getSpeed(status)) * 4;
  const y = Math.abs(winAngMomThreshold - status.angular_momentum);
  const z = Math.abs(upRightRotation - status.rotation) * 4;
  const k = landers[id].count / 2;
  // TODO: Add time here as well later on

  console.log('landing raw', JSON.stringify(status, null, 3));

  // add a bonus so that non-landers will be far from real landers
  const bonus = 50;

  landers[id].score = win_points + bonus + x + y - z - k;

  console.log(
    '#',
    id,
    'landed with a score of',
    Math.round(landers[id].score),
    '|',
    x,
    y,
    z,
    k
  );
}

function handleCrash(id, status) {
  landers[id].status = CRASHED;
  const score = getFitnessScore(status);
  landers[id].score = score;
  const delta = Math.abs(score - lastBestScore);
  if (delta < 10) {
    // const since = Date.now() - landers[id].started;
    console.log(
      'Lander #',
      id,
      'crashed with a score of',
      // Math.round(since / 1000),
      // 'seconds with a score of',
      Math.round(landers[id].score),
      '| speed',
      Math.round(getSpeed(status)),
      ',ang mom',
      Math.round(status.angular_momentum),
      ',x',
      Math.round(status.x_pos),
      ' | used',
      landers[id].count,
      'actions | rot was',
      Math.round(status.rotation * (180 / Math.PI))
    );
  }
}

const handlers = {
  [LANDING]: handleLanding,
  [LANDED]: handleLanded,
  [CRASHED]: handleCrash,
};

async function tick(id) {
  const status = await getStatus(id);
  handlers[status.landed](id, status);
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

function loadNetwork(cb) {
  lastBestNetwork = ml5.neuralNetwork(options);
  // cb();
  const modelInfo = {
    model: 'http://localhost:8080/model/new/model.json',
    metadata: 'http://localhost:8080/model/new/model_meta.json',
    weights: 'http://localhost:8080/model/new/model.weights.bin',
  };
  lastBestNetwork.load(modelInfo, cb);
}

function init() {
  loadNetwork(() => {
    // for (let i = 0; i < generationSize; i++) {
    //   const id = createLander();
    //   networks[id] = lastBestNetwork.copy();
    //   networks[id].mutate(learningRate);
    // }
    started = true;
    setInterval(gameLoop, 1000 / fps);
  });
}

// function findBestLanderId() {
//   let bestId = 0;
//   let bestScore = -100000;
//   for (let id in landers) {
//     if (landers[id].gen === generation && landers[id].score > bestScore) {
//       bestScore = landers[id].score;
//       bestId = id;
//     }
//   }
//   console.log(
//     'Best lander was',
//     bestId,
//     'with a score of',
//     Math.round(bestScore)
//   );
//   return bestId;
// }

const byScore = (a, b) => b.score - a.score;

function getTopNetworks(n = 10) {
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
  sendAction({ type: 'create', id, x: -100, y: -200, vx: 10, vy: 0 });
  id_counter += 1;
  return id;
}

const n = 10;

function createNextGeneration() {
  if (Object.keys(networks).length == 0) return;

  // Find current top
  let top = getTopNetworks(n);

  // if (lastBestNetwork) {
  //   top.push({ network: lastBestNetwork, score: lastBestScore });
  //   top = top.sort(byScore).slice(0, 3);
  // }

  const topScore = top[0].score;

  for (let e of top) {
    networksThatLanded.push({
      network: e.network.copy(),
      score: e.score,
    });
  }

  // // Sort from highest to lowest
  networksThatLanded.sort(byScore);

  // Remove all but 10
  const removed = networksThatLanded.splice(
    n,
    Math.max(0, networksThatLanded.length - n)
  );

  for (let e of removed) {
    e.network.dispose();
  }

  // Update last best
  if (topScore > lastBestScore) {
    lastBestNetwork = top[0].network.copy();
    lastBestScore = topScore;
    //   stuckCount = 0;
    // } else {
    //   stuckCount++;
  }

  // if (!lastBestNetwork) {
  //   lastBestNetwork = ml5.neuralNetwork(options);
  // }

  // Update chart
  data[0].push(generation);
  data[1].push(lastBestScore);
  uplot.setData(data);

  // Now use these networks to build a new generation
  generation++;
  const nextGenerationNetworks = {};

  // Late game
  for (let i = 0; i < generationSize; i++) {
    const id = createLander();
    let net;
    // Generate crossovers with winning landers
    if (i < networksThatLanded.length) {
      net = lastBestNetwork.crossover(networksThatLanded[i].network);
    } else {
      net = lastBestNetwork.copy();
    }
    net.mutate(learningRate);
    nextGenerationNetworks[id] = net;
  }

  /*const third = Math.floor(generationSize / 3);
  for (let i = 0; i < third; i++) {
    const id = createLander();
    const net = lastBestNetwork.copy();
    net.mutate(learningRate);
    nextGenerationNetworks[id] = net;
  }
  for (let i = third; i < third * 2; i++) {
    const id = createLander();
    const net = lastBestNetwork.crossover(top[1].network);
    net.mutate(learningRate);
    nextGenerationNetworks[id] = net;
  }
  for (let i = third * 2; i < generationSize; i++) {
    const id = createLander();
    const net = top[1].network.crossover(lastBestNetwork);
    net.mutate(learningRate);
    nextGenerationNetworks[id] = net;
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

function save() {
  lastBestNetwork.save();
}

function load() {
  // TODO: Implement loading in lastBestNetwork
  // - Remove all landers and networks
  // - Reset all vars
  // - Call load on neural network from ml5
}

document.querySelector('#learning-rate').addEventListener('change', (e) => {
  learningRate = parseFloat(e.currentTarget.value);
});

document.querySelector('#learning-rate').value = learningRate;

/////////////////////////////////////// TRAIN NEW NETWORK SIZE //////////////////////////

let nn;

const rn = (min, max) => min + (max - min) * Math.random();

function generateRandomInput() {
  return getInput({
    altitude: rn(5, 400),
    velocity: { x: rn(0, 200), y: rn(0, 100) },
    rotation: rn(-Math.PI * 2, Math.PI * 2),
    x_pos: rn(-500, 500),
    angular_momentum: rn(-30, 30),
  });
}

function trainNewNetwork() {
  const opt = {
    //   inputs: input_node_count,
    // outputs: ['nothing', 'thrust', 'rot_left', 'rot_right'],
    task: 'classification',
    layers: [
      // Input
      {
        type: 'dense',
        units: 16,
        activation: 'relu',
      },
      // Normalization
      {
        type: 'dense',
        units: 16,
        activation: 'relu',
      },
      // Phase
      {
        type: 'dense',
        units: 4,
        activation: 'relu',
      },
      // Reaction
      {
        type: 'dense',
        activation: 'softmax',
      },
    ],
    debug: true,
  };

  nn = ml5.neuralNetwork(opt);

  console.log('Loading saved training data');

  // Add parsed training data
  for (let i = 0; i < real_training_data.length; i++) {
    const input = real_training_data[i];
    // Use current best lander model to generate training outputs
    const results = lastBestNetwork.classifySync(input);
    nn.addData(input, [results[0].label]);
  }

  // DO NOT normalize data since we do not normalize it in normal learning mode...
  // nn.normalizeData();

  // train the model
  const training_options = {
    batchSize: 32,
    epochs: 32,
  };

  console.log('Training on generated data');

  const started = Date.now();

  nn.train(training_options, () => {
    console.log('Done training. Took ', Date.now() - started, 'ms');
    const res = nn.classifySync(generateRandomInput());
    console.log(res);
  });
}

// loadNetwork(() => {
//   console.log('Loaded old network');
//   trainNewNetwork();
// });

// Start the learing sim
setTimeout(init, 1000);

// TODO: Remember to reset cache on every reload

function test() {
  const id = createLander();
  networks[id] = lastBestNetwork.copy();
}
