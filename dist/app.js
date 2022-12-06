document.body.style.backgroundColor = 'black';

const fps = 2;

let id_counter = 1;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const win_points = 100;
const ground_level = 114;
const generationSize = 100;
const tooStuckCount = 5;

const winSpeedThreshold = 8;
const winAngMomThreshold = 10;
const upRightRotation = Math.PI / 2;

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

let learningRate = 0.01;
let mutateThreshold = 0.1;

const options = {
  inputs: input_node_count,
  outputs: ['nothing', 'thrust', 'rot_left', 'rot_right'],
  task: 'classification',
  noTraining: true,
  learningRate: 0.05,
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
    Math.abs(upRightRotation - status.rotation) -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 30 -
    landers[status.id].count / 4
  );
}

function machineLandingAssist(status) {
  if (!networks[status.id]) {
    console.log('There was not network for lander', status.id);
    return { thrust: 0, rotate: 0 };
  }
  const results = networks[status.id].classifySync(getInput(status));
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

function handleLanded(id, status) {
  landers[id].status = LANDED;

  // Award more points for better landings
  const x = winSpeedThreshold - getSpeed(status) * 4;
  const y = winAngMomThreshold - status.angular_momentum;
  const z = Math.abs(upRightRotation - status.rotation) * 4;
  const k = landers[id].count / 2;
  // TODO: Add time here as well later on

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

// @ Generation 7
// # 535 landed with a score of 103.93461480540564 | -0.8892184625433188 9.85 0.5261667320510344 4.5
// # 539 landed with a score of 103.33588310226042 | -1.487950165688531 9.85 0.5261667320510344 4.5
// # 572 landed with a score of 100.53460638709464 | -0.5355968808543192 9.85 4.279796732051036 4.5

// # Gen 23
// # 2133 landed with a score of 124 | -31 10 0.25 4.5

// # Gen 18
// # 1620 landed with a score of 125 | -29.25561058812871 9.85 0.7566666928204135 4.5

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

setInterval(gameLoop, 1000 / fps);

function init() {
  lastBestNetwork = ml5.neuralNetwork(options);
  const modelInfo = {
    model: 'http://localhost:8080/model/model.json',
    metadata: 'http://localhost:8080/model/model_meta.json',
    weights: 'http://localhost:8080/model/model.weights.bin',
  };
  lastBestNetwork.load(modelInfo, () => {
    for (let i = 0; i < generationSize; i++) {
      const id = createLander();
      networks[id] = lastBestNetwork.copy();
    }
    started = true;
  });
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

  // Simple version

  // for (let i = 0; i < generationSize; i++) {
  //   const id = createLander();
  //   const net = lastBestNetwork.copy();
  //   net.mutate(learningRate);
  //   nextGenerationNetworks[id] = net;
  // }

  const third = Math.floor(generationSize / 3);

  for (let i = 0; i < third; i++) {
    const id = createLander();
    const net = lastBestNetwork.copy();
    net.mutate(learningRate);
    nextGenerationNetworks[id] = net;
  }

  // Make sure we have a second best
  if (top[1]) {
    for (let i = third; i < third * 2; i++) {
      const id = createLander();
      const net = top[1].network.crossover(lastBestNetwork);
      net.mutate(learningRate);
      nextGenerationNetworks[id] = net;
    }
    for (let i = third * 2; i < generationSize; i++) {
      const id = createLander();
      const net = lastBestNetwork.crossover(top[1].network);
      net.mutate(learningRate);
      nextGenerationNetworks[id] = net;
    }
  }

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

setTimeout(init, 1000);

document.querySelector('#learning-rate').addEventListener('change', (e) => {
  learningRate = parseFloat(e.currentTarget.value);
});

// document.querySelector('#mutate-threshold').addEventListener('change', (e) => {
//   mutateThreshold = parseFloat(e.currentTarget.value);
// });

document.querySelector('#learning-rate').value = learningRate;
// document.querySelector('#mutate-threshold').value = mutateThreshold;
