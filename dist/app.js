engine.startGame({
  // canvasResizePolicy: 0,
});

function sendAction(action) {
  const channel = new MessageChannel();
  postMessage(JSON.stringify(action), '*', [channel.port2]);
}

// I could make this generic if needed
function getStatus() {
  return new Promise((resolve, reject) => {
    // This opens up a channel and sends data to Godot function
    const data = JSON.stringify({ type: 'status' });
    const channel = new MessageChannel();
    // For some reason this is required
    channel.port1.onmessageerror = reject;
    channel.port1.addEventListener('message', (message) => {
      resolve(JSON.parse(message.data));
    });
    postMessage(data, '*', [channel.port2]);
  });
}

function orientToAngle({ rotation, angular_momentum }, targetAngle = 0) {
  const rotation_error = targetAngle - rotation;
  if (Math.abs(rotation_error) < 0.5) {
    const am_error = -angular_momentum;
    if (Math.abs(am_error) > 0.1) {
      return Math.sign(am_error);
    } else {
      return 0;
    }
  } else {
    return Math.sign(rotation_error);
  }
}

// I need to prove that I can create a "Smart Landing Assist" function with
// only these inputs. Only then can I confirm that a neural network could learn
// to do the same

// Once I have built the function, that should give me sufficent input/output to
// train the network.

function slowDown({ velocity }) {
  const len = Math.sqrt(velocity.y ** 2 + velocity.x ** 2);
  return len > 20 ? 1 : 0;
}

const orientForLanding = (status) => orientToAngle(status, 0);

function landingAssist(status) {
  // TODO: Think of the landing in 3 phases

  // 1. Kill velocity (rotate to negation vector and thrust until 0)

  // 2. Orient the craft for landing
  // 3. Slow down when close to ground

  ////////////////////////

  // if (status.altitude > 100) {
  // kill vel

  // return { rotate: orient(status), thrust: slowDown(status) };
  // }

  return { rotate: orientForLanding(status), thrust: 0 };
}

async function tick() {
  const status = await getStatus();
  const action = { type: 'act', ...landingAssist(status) };
  sendAction(action);
}

// window.addEventListener('mousedown', tick);

setInterval(tick, 1000 / 30);
