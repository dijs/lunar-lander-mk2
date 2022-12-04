document.body.style.backgroundColor = 'black';

const fps = 10;

let id_counter = 128;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const ground_level = 114;
const generationSize = 100; // Must be a mulitple of 3

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
    });
    postMessage(data, '*', [channel.port2]);
  });
}

// Smart Assist Functions

// Memory
let phase = 0;

const max_landing_speed = 5;
const landing_altitude_threshold = 100;
const hit_the_brakes_altitude = 100;
const danger_altitude = 50;
const landing_rotation_goal = Math.PI / 2;
const nothing = {
  rotate: 0,
  thrust: 0,
};

function getAllowedRotationSpeed(status) {
  return status.altitude > landing_altitude_threshold ? 0.3 : 0.1;
}

function getAllowedRotationError(status) {
  return status.altitude > landing_altitude_threshold ? 0.1 : 0.5;
}

function getSpeed(status) {
  return Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
}

function getKillVelocityAngleError({ rotation, velocity }) {
  const speed = Math.sqrt(velocity.y ** 2 + velocity.x ** 2);
  // TODO: Try another atan2 for the current rotation
  return Math.atan2(velocity.y / speed, velocity.x / speed) - rotation;
}

let lastBurnAt = 0;
const min_burn_time = 600;

function log(...args) {
  //console.log(...args);
}

function killVelocity(status) {
  const rot_error = getKillVelocityAngleError(status);
  const timeSinceLastBurn = Date.now() - lastBurnAt;
  // Give the lander enough time to burn
  if (Math.abs(rot_error) > getAllowedRotationError(status)) {
    log(
      `Kill rotation was off by ${Math.abs(
        rot_error
      )}, kicking back to first phase. Burn time was: ${timeSinceLastBurn}`
    );
    landers[status.id].phase = 0;
    return nothing;
  } else {
    if (getSpeed(status) > max_landing_speed) {
      lastBurnAt = Date.now();
      return {
        rotate: 0,
        thrust: 1,
      };
    } else {
      landers[status.id].phase = 2;
      log('killed velocity. burned for', timeSinceLastBurn, 'millis');
      return nothing;
    }
  }
}

function orientForLanding(status) {
  const allowed_rot_goal_err = 0.05;

  if (status.altitude < danger_altitude && getSpeed(status) > 7) {
    log('Was in danger of crash, kicking back to killing velocity');
    landers[status.id].phase = 1;
    return nothing;
  }

  const am_error = -status.angular_momentum;
  if (Math.abs(am_error) > getAllowedRotationSpeed(status)) {
    return { rotate: Math.sign(am_error), thrust: 0 };
  }

  let rot_err = landing_rotation_goal - status.rotation;
  if (Math.abs(rot_err) > allowed_rot_goal_err) {
    return { rotate: Math.sign(rot_err), thrust: 0 };
  }

  if (status.altitude < hit_the_brakes_altitude) {
    landers[status.id].phase = 1;
    return nothing;
  }

  return nothing;
}

function orientToKillAngle(status) {
  const speed = getSpeed(status);
  const kill_angle = Math.atan2(
    status.velocity.y / speed,
    status.velocity.x / speed
  );

  if (status.altitude < danger_altitude && speed > 7) {
    log('Was in danger of crash, kicking back to killing velocity');
    landers[status.id].phase = 1;
    return nothing;
  }

  const am_error = -status.angular_momentum;
  if (Math.abs(am_error) > getAllowedRotationSpeed(status)) {
    return { rotate: Math.sign(am_error), thrust: 0 };
  }

  // TODO: Try another atan2 for the current rotation
  let rot_err = kill_angle - status.rotation;
  if (Math.abs(rot_err) > getAllowedRotationError(status)) {
    return { rotate: Math.sign(rot_err), thrust: 0 };
  }

  log('done orienting');
  landers[status.id].phase = 1;
  return nothing;
}

function landingAssist(status) {
  if (landers[status.id].phase === 0) {
    return orientToKillAngle(status);
  }
  if (landers[status.id].phase === 1) {
    return killVelocity(status);
  }
  if (landers[status.id].phase === 2) {
    return orientForLanding(status);
  }
  return nothing;
}

// AI Landing Assist starts here

// Status will need to be converted into "input"
// Actions will be the "output" of the network

// Use the smart assist function to create a bunch of training data (easiest)

// Once that works, throw different scenarios at the network for testing

const PhaseDescriptions = {
  0: 'Orienting to Kill Velocity Angle',
  1: 'Killing Velocity',
  2: 'Orienting For Landing',
};

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

function getFitnessScore(status) {
  // const speed = Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
  // console.log(speed);

  return (
    100 -
    getSpeed(status) -
    Math.abs(status.angular_momentum) * 3 -
    // Math.abs(Math.PI / 2 - status.rotation) * 10 -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 10
  );
}

function getRotate(x, y) {
  if (x < 0.5 && y < 0.5) return 0;
  if (x >= y) return 1;
  return -1;
}

function getAction(rotateLeft, rotateRight, throttleOn) {
  const rotate = getRotate(rotateLeft, rotateRight);
  const thrust = throttleOn > 0.5 ? 1 : 0;
  return { rotate, thrust };
}

function machineLandingAssist(status) {
  let outputs = networks[status.id].predict(getInput(status));
  return getAction(...outputs);
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
      Math.round(status.x_pos)
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

  // const half = Math.floor(generationSize / 2);

  for (let i = 0; i < generation; i++) {
    const id = createLander();
    nextGenerationNetworks[id] = mutateNeuralNetwork(top[0].network);
  }

  // Decay learning rate
  // learningRate *= decayRate;
  // document.querySelector('#learning-rate').value = learningRate;

  console.log('Learning rate set to', learningRate);

  // for (let i = half; i < generationSize; i++) {
  //   const id = createLander();
  //   nextGenerationNetworks[id] = mutateNeuralNetwork(top[1].network);
  // }

  // First section mutated from A
  /*const third = Math.floor(generationSize / 3);
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
