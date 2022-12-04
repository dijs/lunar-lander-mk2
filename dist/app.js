document.body.style.backgroundColor = 'black';

const fps = 2;

let id_counter = 1;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const ground_level = 114;
const generationSize = 3 * 33; // Must be a mulitple of 3

const actions = [
  { rotate: 0, thrust: 0 },
  { rotate: 0, thrust: 1 },
  { rotate: 1, thrust: 0 },
  { rotate: -1, thrust: 0 },
];

let generation = 1;
let networks = {};
let started = false;
let lastBestScore = 0;
let lastBestNetwork = null;

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

function getInput({ altitude, velocity, rotation, x_pos, angular_momentum }) {
  const speed = Math.sqrt(velocity.y ** 2 + velocity.x ** 2);
  const ux = velocity.x / speed;
  const uy = velocity.y / speed;
  // TODO: add rotation and x position

  // Normalize rotation
  let rot = Math.atan2(Math.sin(rotation), Math.cos(rotation));
  rot = (rot + Math.PI) / 2;

  // Normalize x position
  const x = x_pos / 500;

  return [
    altitude / ground_level,
    ux,
    uy,
    rot,
    x,
    speed / 300,
    angular_momentum / 100,
  ];
}

function getSpeed(status) {
  return Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
}

function getFitnessScore(status) {
  return (
    100 -
    getSpeed(status) -
    Math.abs(status.angular_momentum) * 3 -
    // Math.abs(Math.PI / 2 - status.rotation) * 10 -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 10 -
    landers[status.id].count
  );
}

function getActionIndex(outputs) {
  let i = 0;
  let maxIndex = 0;
  let maxValue = -1;
  for (let e of outputs) {
    if (e > maxValue) {
      maxValue = e;
      maxIndex = i;
    }
    i++;
  }
  return maxIndex;
}

function machineLandingAssist(status) {
  const outputs = networks[status.id].predict(getInput(status));
  const actionIndex = getActionIndex(outputs);
  if (actionIndex > 0) {
    landers[status.id].count++;
  }
  return actions[actionIndex];
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
    landers[id].score = 100;
    console.log(id, 'landed');
  }
  if (status.landed === -1) {
    landers[id].status = CRASHED;
    landers[id].score = getFitnessScore(status);
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

setInterval(async () => {
  const count = await getLanderCount();
  console.log('Lander count:', count);
}, 5000);

function init() {
  for (let i = 0; i < generationSize; i++) {
    const id = createLander();
    networks[id] = new NeuralNetwork();
    // Load best network from local storage
    let data = localStorage.getItem('best');
    if (data) {
      networks[id].dispose();
      data = JSON.parse(data);
      networks[id].weights = data.weights.map((w) => tf.tensor(w));
    }
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
  console.log('Best lander was', bestId, 'with a score of', bestScore);
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
  lastBestNetwork = top[0].network.clone();
  lastBestScore = top[0].score;

  // Save best to local storage
  localStorage.setItem(
    'best',
    JSON.stringify({
      weights: lastBestNetwork.weights.map((w) => w.arraySync()),
    })
  );

  // Update chart
  data[0].push(generation);
  data[1].push(lastBestScore);
  uplot.setData(data);

  // Now use these networks to build a new generation
  generation++;
  const nextGenerationNetworks = {};

  // Decay learning rate
  learningRate *= decayRate;
  document.querySelector('#learning-rate').value = learningRate;
  console.log('Learning rate set to', learningRate);

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
    lastBestScore
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

document.querySelector('#learning-rate').addEventListener('change', (e) => {
  learningRate = parseFloat(e.currentTarget.value);
});

document.querySelector('#mutate-threshold').addEventListener('change', (e) => {
  mutateThreshold = parseFloat(e.currentTarget.value);
});
