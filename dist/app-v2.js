// Sources:

// 1. get from trello
// 2. https://github.com/shaoruu/lunar-lander-ai

// After trying different onfigurations of neural networks: single hidden, multi hidden,
// I was always getting stuck on the very last part of the training. It could make it very close to
// landing, but would never slow down enough...

// Decided the code was getting to messy and I was not making good enough progress... so I decided to refactor out
// the genetics code into a separate library

// * Now I am trying very different inputs. Basically shooting 8 rays from the lander and getting the obstacle collision distance
//    - Not entirely sure this had a postive effect on the learning...

// * Altitude is a VERY important input to send since it basically triggers when the network should start another maneuver

document.body.style.backgroundColor = 'black';

const fps = 5;
const LANDING = 0;
const LANDED = 1;
const CRASHED = -1;
const win_points = 100;
const winSpeedThreshold = 10;
const winAngMomThreshold = 10;
const upRightRotation = Math.PI / 2;
const actions = {
  nothing: { rotate: 0, thrust: 0 },
  thrust: { rotate: 0, thrust: 1 },
  rot_left: { rotate: 1, thrust: 0 },
  rot_right: { rotate: -1, thrust: 0 },
};

let started = false;
const statuses = {};
const landed = {};
const actionsTook = {};

const ai = new Evolution({
  inputs: 14,
  outputs: ['nothing', 'thrust', 'rot_left', 'rot_right'],
  generationSize: 20,
  topSize: 10,
  hiddenUnits: 8,
  // learningRate: 0.01,
  // crosstrain: false,
});

let data = [
  [], // x-values (timestamps)
  [], // y-values (series 1)
];

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

function normalizeAngle(a) {
  let rot = Math.atan2(Math.sin(a), Math.cos(a));
  return (rot + Math.PI) / 2;
}

function getInput({
  rotation,
  velocity,
  rays,
  x_pos,
  angular_momentum,
  altitude,
}) {
  return [
    rays.n / 2048,
    rays.ne / 2048,
    rays.e / 2048,
    rays.se / 2048,
    rays.s / 2048,
    rays.sw / 2048,
    rays.w / 2048,
    rays.nw / 2048,
    x_pos / 500,
    velocity.x,
    velocity.y,
    rotation,
    angular_momentum,
    altitude,
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
    // Math.abs(upRightRotation - status.rotation) * 3 -
    // Make the x position not as important as the other variables
    Math.abs(status.x_pos) / 20 -
    actionsTook[status.id] / 4
  );
}

function getAction(status) {
  const input = getInput(status);
  const action = ai.getAction(status.id, input);
  if (action !== 'nothing') {
    actionsTook[status.id]++;
  }
  return actions[action];
}

function handleLanding(id, status) {
  const action = { type: 'act', id, ...getAction(status) };
  sendAction(action);
}

// Looks like the top score could be ~ 166
function handleLanded(id, status) {
  if (statuses[id] === LANDING) {
    // Award more points for better landings
    const x = Math.abs(winSpeedThreshold - getSpeed(status)) * 4;
    const y = Math.abs(winAngMomThreshold - status.angular_momentum);
    const z = 0; //Math.abs(upRightRotation - status.rotation) * 4;
    const k = actionsTook[id] / 2;
    // TODO: Add time here as well later on

    console.log('landing raw', JSON.stringify(status, null, 3));

    // add a bonus so that non-landers will be far from real landers
    const bonus = 50;

    const score = win_points + bonus + x + y - z - k;

    ai.setScore(id, score);

    landed[id] = true;

    console.log(
      '#',
      id,
      'landed with a score of',
      Math.round(score),
      '|',
      x,
      y,
      z,
      k
    );
  }
}

function handleCrash(id, status) {
  // Do let previously landed brains be mutated
  if (landed[id]) {
    console.log('Skipping crash for previously landed #', id);
    return;
  }

  if (statuses[id] === LANDING) {
    const score = getFitnessScore(status);
    ai.setScore(id, score);
    console.log(
      'Lander #',
      id,
      'crashed with a score of',
      // Math.round(since / 1000),
      // 'seconds with a score of',
      Math.round(score),
      '| speed',
      Math.round(getSpeed(status)),
      ',ang mom',
      Math.round(status.angular_momentum),
      ',x',
      Math.round(status.x_pos),
      ' | used',
      actionsTook[id],
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

async function updateLander(id) {
  const status = await getStatus(id);
  handlers[status.landed](id, status);
  statuses[id] = status.landed;
}

function gameLoop() {
  let readyForNextGeneration = true;
  for (let id of ai.getNodeKeys()) {
    updateLander(id);
    if (statuses[id] === LANDING) {
      readyForNextGeneration = false;
    }
  }
  if (readyForNextGeneration) {
    createNextGeneration();
  }
}

function createLanders() {
  for (let id of ai.getNodeKeys()) {
    sendAction({
      type: 'create',
      id,
      x: -200,
      y: -200,
      vx: 100,
      vy: 0,
      rot: -Math.PI / 2,
    });
    statuses[id] = LANDING;
    actionsTook[id] = 0;
  }
}

function createNextGeneration() {
  const topScore = ai.evolve();
  createLanders();
  console.log(
    'Starting Generation',
    ai.generation,
    'Top score was',
    Math.round(topScore)
  );
  // Update chart
  data[0].push(ai.generation);
  data[1].push(topScore);
  uplot.setData(data);
}

function save() {
  ai.save();
}

// Start the learning sim
setTimeout(() => {
  // ai.load({
  //   model: 'http://localhost:8080/model/lander/model.json',
  //   metadata: 'http://localhost:8080/model/lander/model_meta.json',
  //   weights: 'http://localhost:8080/model/lander/model.weights.bin',
  // }).then(() => {
  //   createLanders();
  //   setInterval(gameLoop, 1000 / fps);
  // });

  ai.createRandomGeneration();
  createLanders();
  setInterval(gameLoop, 1000 / fps);
}, 1000);

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
