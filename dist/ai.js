const input_node_count = 1;
const hidden_node_count = 16;
const output_node_count = 3;

let previous = false;

const random = (min, max) => {
  var rand;

  rand = Math.random();

  if (typeof min === 'undefined') {
    return rand;
  } else if (typeof max === 'undefined') {
    if (min instanceof Array) {
      return min[Math.floor(rand * min.length)];
    } else {
      return rand * min;
    }
  } else {
    if (min > max) {
      var tmp = min;
      min = max;
      max = tmp;
    }

    return rand * (max - min) + min;
  }
};

const randomGaussian = (mean, sd) => {
  var y1, x1, x2, w;
  if (previous) {
    y1 = y2;
    previous = false;
  } else {
    do {
      x1 = random(2) - 1;
      x2 = random(2) - 1;
      w = x1 * x1 + x2 * x2;
    } while (w >= 1);
    w = Math.sqrt((-2 * Math.log(w)) / w);
    y1 = x1 * w;
    y2 = x2 * w;
    previous = true;
  }

  var m = mean || 0;
  var s = sd || 1;
  return y1 * s + m;
};

class NeuralNetwork {
  constructor() {
    // Initialize random weights
    this.input_weights = tf.randomNormal([input_node_count, hidden_node_count]);
    this.output_weights = tf.randomNormal([
      hidden_node_count,
      output_node_count,
    ]);
  }
  predict(user_input) {
    let output;
    tf.tidy(() => {
      const input_layer = tf.tensor(user_input, [1, input_node_count]);
      const hidden_layer = input_layer.matMul(this.input_weights).sigmoid();
      const output_layer = hidden_layer.matMul(this.output_weights).sigmoid();
      output = output_layer.dataSync();
    });
    return output;
  }
  clone() {
    return tf.tidy(() => {
      let clonie = new NeuralNetwork();
      clonie.dispose();
      clonie.input_weights = tf.clone(this.input_weights);
      clonie.output_weights = tf.clone(this.output_weights);
      return clonie;
    });
  }
  dispose() {
    this.input_weights.dispose();
    this.output_weights.dispose();
  }
}

// How to train...

// * Keep track of generation
// * Each lander will have a network

// 0. Create initial generation of random landers
// 1. Play the game (need to figure out how to determine when all landers have finished)
// 2. Let the landers finish the simulation
// 3. Sort landers by best fitness
// 4. Create new generation by mutating the best lander
// 5. Go to #1

class NeuroEvolution {
  mutateNeuralNetwork(b) {
    function fn(x) {
      if (random(1) < 0.05) {
        let offset = randomGaussian() * 0.5;
        let newx = x + offset;
        return newx;
      }
      return x;
    }

    let neuralNetwork = b.clone();
    let ih = neuralNetwork.input_weights.dataSync().map(fn);
    let ih_shape = neuralNetwork.input_weights.shape;
    neuralNetwork.input_weights.dispose();
    neuralNetwork.input_weights = tf.tensor(ih, ih_shape);

    let ho = neuralNetwork.output_weights.dataSync().map(fn);
    let ho_shape = neuralNetwork.output_weights.shape;
    neuralNetwork.output_weights.dispose();
    neuralNetwork.output_weights = tf.tensor(ho, ho_shape);
    return neuralNetwork;
  }
}
