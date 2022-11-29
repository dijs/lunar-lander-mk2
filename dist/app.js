const fps = 20;

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

// Smart Assist Functions

// Memory
let lastAlt = 1000;
let phase = 0;

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

function killVelocity(status) {
  const speed = Math.sqrt(status.velocity.y ** 2 + status.velocity.x ** 2);
  const kill_velocity_angle = Math.atan2(
    status.velocity.y / speed,
    status.velocity.x / speed
  );
  const rotation_error = orientToAngle(status, kill_velocity_angle);
  if (rotation_error !== 0) {
    return {
      rotate: rotation_error,
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

function slowDown(status) {
  if (status.altitude > 64) {
    return orientForLanding(status);
  }
  if (lastAlt > status.altitude) {
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

// AI Landing Assist starts here

// Status will need to be converted into "input"
// Actions will be the "output" of the network

// Use the smart assist function to create a bunch of training data (easiest)

// Once that works, throw different scenarios at the network for testing

async function tick() {
  const status = await getStatus();
  const action = { type: 'act', ...landingAssist(status) };
  sendAction(action);
}

setInterval(tick, 1000 / fps);
