const fps = 10;

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
    phase = 0;
    return nothing;
  } else {
    if (getSpeed(status) > max_landing_speed) {
      lastBurnAt = Date.now();
      return {
        rotate: 0,
        thrust: 1,
      };
    } else {
      phase = 2;
      log('killed velocity. burned for', timeSinceLastBurn, 'millis');
      return nothing;
    }
  }
}

function orientForLanding(status) {
  const allowed_rot_goal_err = 0.05;

  if (status.altitude < danger_altitude && getSpeed(status) > 7) {
    log('Was in danger of crash, kicking back to killing velocity');
    phase = 1;
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
    phase = 1;
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
    phase = 1;
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
  phase = 1;
  return nothing;
}

function landingAssist(status) {
  if (phase === 0) {
    return orientToKillAngle(status);
  }
  if (phase === 1) {
    return killVelocity(status);
  }
  if (phase === 2) {
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
  // 3: 'Slowing Down',
};

async function tick() {
  const status = await getStatus();
  if (status.landed === 0) {
    const action = { type: 'act', ...landingAssist(status) };
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
    document.getElementById('status').innerHTML = 'Landed';
    console.log('Fitness score: 100');
  }
  if (status.landed === -1) {
    log(
      'Crashed while',
      PhaseDescriptions[phase],
      ' at a speed of',
      getSpeed(status),
      ' with an angular momentum of',
      Math.abs(status.angular_momentum)
    );
    console.log(
      'Fitness Score',
      100 - getSpeed(status) - Math.abs(status.angular_momentum) * 10
    );
    document.getElementById('status').innerHTML = 'Crashed';
  }
}

function reset(
  initial_velocity = 100,
  initial_rotation = -Math.PI / 2,
  gravity_amount = 10,
  initial_spin = -1
) {
  phase = 0;
  sendAction({
    type: 'reset',
    initial_velocity,
    initial_rotation,
    gravity_amount,
    initial_spin,
  });
}

// TODO: Before I can create the AI, I should refactor the smart assist to handle ALL of these scenarios

// Thoughts:

// - Negate initial spin if any
// - High gravity is failing b/c "Kill Velocity" function is prioritizing orientation correctness over reducing speed

const s1 = () => reset();
const s2 = () => reset(100, -Math.PI / 2, 20, 0);
const s3 = () => reset(100, -Math.PI / 2, 10, 5);

setInterval(tick, 1000 / fps);
