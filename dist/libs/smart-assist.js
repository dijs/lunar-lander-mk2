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

const PhaseDescriptions = {
  0: 'Orienting to Kill Velocity Angle',
  1: 'Killing Velocity',
  2: 'Orienting For Landing',
};
