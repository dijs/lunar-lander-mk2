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

function orientToAngle(
  { rotation, angular_momentum },
  targetAngle = 0,
  errorThreshold = 0.1
) {
  const rotation_error = targetAngle - rotation;
  if (Math.abs(rotation_error) < errorThreshold) {
    const am_error = -angular_momentum;
    if (Math.abs(am_error) < 0.1) {
      return 0;
    } else {
      return Math.sign(am_error);
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

function killVelocity(status) {
  const speed = Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
  const t1 = Math.atan2(status.velocity.y / speed, status.velocity.x / speed);
  const rotError = orientToAngle(status, t1);

  if (rotError !== 0) {
    return {
      rotate: rotError,
      thrust: 0,
    };
  } else {
    if (speed > 5) {
      return {
        rotate: 0,
        thrust: 1,
      };
    } else {
      phase = 1;
      return { rotate: 0, thrust: 0 };
    }
  }
}

function orientForLanding(status) {
  const err = orientToAngle(status, 0 + Math.PI / 2, 0.05);
  if (err !== 0) {
    return { rotate: err, thrust: 0 };
  } else {
    phase = 2;
    return { rotate: 0, thrust: 0 };
  }
}

let lastAlt = 1000;

function slowDown(status) {
  const speed = Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
  if (status.altitude > 100) {
    return orientForLanding(status);
  }
  const speed_max = 1;
  if (speed > speed_max && lastAlt > status.altitude) {
    lastAlt = status.altitude - 2;
    return {
      rotate: 0,
      thrust: 1,
    };
  } else {
    phase = 0;
    return { rotate: 0, thrust: 0 };
  }
}

let phase = 0;

function landingAssist(status) {
  if (phase === 0) {
    return killVelocity(status);
  }
  if (phase === 1) {
    return orientForLanding(status);
  }
  if (phase === 2) {
    return slowDown(status);
  }
  return { rotate: 0, thrust: 0 };
}

async function tick() {
  const status = await getStatus();
  // TODO: Fix this in Godot
  status.rotation += Math.PI / 2;
  const action = { type: 'act', ...landingAssist(status) };
  sendAction(action);
}

// window.addEventListener('mousedown', tick);

setInterval(tick, 1000 / 20);
