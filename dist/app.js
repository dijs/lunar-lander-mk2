const fps = 10;

let id_counter = 128;

const landers = {};

const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;

const ground_level = 114;
const generationSize = 16;

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

function getInput({ altitude }) {
  return [altitude / ground_level];
}

function getFitnessScore(status) {
  return (
    100 -
    getSpeed(status) -
    Math.abs(status.angular_momentum) * 10 -
    status.x_err
  );
}

function getAction(rotateLeft, rotateRight, throttleOn) {
  const rotate = rotateLeft > 0.5 ? -1 : rotateRight > 0.5 ? 1 : 0;
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
    document.getElementById('status').innerHTML =
      PhaseDescriptions[phase] +
      ' | AM:' +
      status.angular_momentum +
      ' | ROT:' +
      status.rotation +
      ' | KAE:' +
      getKillVelocityAngleError(status);
  }
  if (status.landed === 1) {
    landers[id].status = LANDED;
    landers[id].score = 100;
    document.getElementById('status').innerHTML = 'Landed';
    console.log(id, 'landed');
  }
  if (status.landed === -1) {
    landers[id].status = CRASHED;
    console.log(id, 'crashed');
    landers[id].score = getFitnessScore(status);
    log(
      'Crashed while',
      PhaseDescriptions[phase],
      ' at a speed of',
      getSpeed(status),
      ' with an angular momentum of',
      Math.abs(status.angular_momentum)
    );
    document.getElementById('status').innerHTML = 'Crashed';
  }
}

// TODO: I do not think I will use this
function reset(
  id,
  initial_velocity = 100,
  initial_rotation = -Math.PI / 2,
  gravity_amount = 10,
  initial_spin = -1
) {
  landers[id].phase = 0;
  sendAction({
    type: 'reset',
    id,
    initial_velocity,
    initial_rotation,
    gravity_amount,
    initial_spin,
  });
}

function addRandomLander() {
  const id = '' + id_counter;
  sendAction({ type: 'create', id, x: -436, y: -219 });
  landers[id] = { status: LANDING, phase: 0, score: 0, gen: generation };
  networks[id] = new NeuralNetwork();
  id_counter += 1;
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
    addRandomLander();
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

function createNextGeneration() {
  const bestId = findBestLanderId();
  let bestNetwork = networks[bestId];

  // Check if last best was better than current best
  if (lastBestNetwork && lastBestScore > landers[bestId].score) {
    console.log('Using last best');
    bestNetwork = lastBestNetwork;
  } else {
    console.log('Found better');
    lastBestNetwork = bestNetwork.clone();
    lastBestScore = landers[bestId].score;
  }

  generation++;
  const nextGenerationNetworks = {};

  for (let i = 0; i < generationSize; i++) {
    const id = '' + id_counter;
    landers[id] = { status: LANDING, phase: 0, score: 0, gen: generation };
    nextGenerationNetworks[id] = mutateNeuralNetwork(bestNetwork);
    sendAction({ type: 'create', id, x: -436, y: -219 });
    id_counter += 1;
  }

  for (let id in networks) {
    networks[id].dispose();
  }

  networks = nextGenerationNetworks;
  console.log('Started Generation', generation);
}
